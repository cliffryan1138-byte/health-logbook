-- The reference library, part 1: medicines (WG-PLAN-HEALTH-002, workstream 3;
-- Cliff, 2026-10-08: "start the reference library").
--
-- Public reference data, read-only to the app, every row carrying its source,
-- version and retrieval date, refreshed weekly by the ref-sync function.
-- The plan sketched a separate `ref` schema; the tables use a ref_ prefix in
-- public instead, like ref_pregnancy_bp (0015), because the app can only read
-- schemas the API exposes. The rule is the same: nobody writes through the
-- API; only the server-side ref-sync function (service role) does.
--
-- ref_sources     — the approved list. Every reference row points at one, so
--   nothing from an unlisted source (WebMD, Wikipedia, forums, a model's
--   memory: plan, workstream 3) can be stored. Each source has a use rule:
--     'quote'     public domain or openly licensed (FDA, NIH, CDC, CC-BY
--                 journal articles): text may be quoted word for word;
--     'cite_only' copyrighted (AHA, ACOG, most journals; Cliff asked for
--                 journals and orgs like the AHA, 2026-10-08): Daybook keeps
--                 the facts (a published threshold, a finding), the citation
--                 and a link, never the text.
-- ref_citations   — journal articles and guideline documents by DOI/PMID.
-- ref_drug_labels — FDA drug labels from openFDA, keyed by the label's SPL
--   set id, with the sections the medicines report quotes (warnings, side
--   effects, interactions, pregnancy and breastfeeding…) word for word.
-- ref_rx_labels   — which label Daybook shows for an RxNorm concept, or that
--   none was found. "Not found" is stored as such; nothing is guessed.
-- ref_refresh_runs — a log of each sync, so a stale source is visible.
--
-- medication_refs — the person's own: which RxNorm concept each medicine on
--   their list matched (or that it didn't). Kept apart from `medications` so
--   a weekly re-check doesn't write edit history on the person's record, and
--   so no medicine name a person typed ever lands in a table other people can
--   read: the ref_ tables hold public data keyed by RxNorm and label ids only.
--
-- Additive only.

create table if not exists public.ref_sources (
  id          text primary key,
  name        text not null,
  publisher   text not null,
  url         text not null,
  terms_url   text,
  licence     text not null,
  use_rule    text not null default 'cite_only' check (use_rule in ('quote', 'cite_only')),
  note        text
);

insert into public.ref_sources (id, name, publisher, url, terms_url, licence, use_rule, note) values
  ('openfda-label', 'openFDA drug labeling (SPL)', 'U.S. Food and Drug Administration',
   'https://open.fda.gov/apis/drug/label/', 'https://open.fda.gov/terms/',
   'Public domain (CC0), per https://open.fda.gov/license/', 'quote',
   'openFDA: "Do not rely on openFDA to make decisions regarding medical care." Label text is quoted, never paraphrased.'),
  ('rxnorm', 'RxNorm, via the RxNav API', 'National Library of Medicine',
   'https://lhncbc.nlm.nih.gov/RxNav/APIs/', 'https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html',
   'NLM-authored RxNorm names and identifiers; no UMLS licence needed for these', 'quote',
   'Names are matched exactly (normalized), never approximately.'),
  ('dailymed', 'DailyMed', 'National Library of Medicine',
   'https://dailymed.nlm.nih.gov/', null, 'Public (NLM)', 'quote',
   'Linked for the full label; not copied.'),
  ('pubmed', 'PubMed, via NCBI E-utilities', 'National Library of Medicine',
   'https://pubmed.ncbi.nlm.nih.gov/', 'https://www.ncbi.nlm.nih.gov/home/about/policies/',
   'Citation records are public; abstracts and articles keep their publishers'' copyright', 'cite_only',
   'Journal articles: citation, DOI/PMID and link; article text only when the article itself is CC-BY (PMC open access), recorded per citation.'),
  ('aha', 'American Heart Association / American College of Cardiology guidelines', 'American Heart Association',
   'https://professional.heart.org/en/guidelines-and-statements', 'https://www.heart.org/en/about-us/statements-and-policies/copyright-request',
   'Copyrighted', 'cite_only',
   'Published thresholds and categories as facts, with the citation and a link; no text copied.'),
  ('acog', 'American College of Obstetricians and Gynecologists', 'ACOG',
   'https://www.acog.org/', null, 'Copyrighted', 'cite_only',
   'Already used for the pregnancy blood pressure thresholds (ref_pregnancy_bp, 0015).')
on conflict (id) do nothing;

-- Journal articles and guideline documents, cited.
create table if not exists public.ref_citations (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references public.ref_sources (id),
  title         text not null,
  authors       text,                  -- "Whelton PK, Carey RM, et al."
  container     text,                  -- journal or publisher
  year          integer,
  doi           text unique,
  pmid          text unique,
  url           text not null,
  licence       text not null,         -- 'Copyrighted' or e.g. 'CC BY 4.0' (PMC open access)
  retrieved_at  timestamptz not null default now()
);

create table if not exists public.ref_drug_labels (
  set_id         text primary key,
  version        text,
  effective_time date,
  title          text,                -- the product as openFDA names it
  manufacturer   text,
  generic_names  text[] not null default '{}',
  brand_names    text[] not null default '{}',
  rxcuis         text[] not null default '{}',
  product_type   text,                -- HUMAN PRESCRIPTION DRUG / HUMAN OTC DRUG
  route          text[] not null default '{}',
  sections       jsonb  not null default '{}'::jsonb,  -- { boxed_warning: [..], warnings: [..], ... } as openFDA gives them
  source_id      text   not null default 'openfda-label' references public.ref_sources (id),
  source_url     text   not null,      -- the openFDA query that returned it
  source_updated date,                 -- openFDA meta.last_updated
  retrieved_at   timestamptz not null default now()
);

create table if not exists public.ref_rx_labels (
  rxcui        text primary key,
  rx_name      text,
  tty          text,
  set_id       text references public.ref_drug_labels (set_id) on delete set null,
  status       text not null check (status in ('found', 'not_found')),
  source_id    text not null default 'openfda-label' references public.ref_sources (id),
  retrieved_at timestamptz not null default now()
);

create table if not exists public.ref_refresh_runs (
  id           bigint generated always as identity primary key,
  kind         text not null,          -- 'weekly' | 'on_demand'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  checked      integer not null default 0,
  updated      integer not null default 0,
  not_found    integer not null default 0,
  error        text
);

-- Read-only to signed-in people; no insert/update/delete policies, so only the
-- service role (which bypasses RLS) writes.
alter table public.ref_sources      enable row level security;
alter table public.ref_drug_labels  enable row level security;
alter table public.ref_rx_labels    enable row level security;
alter table public.ref_refresh_runs enable row level security;
alter table public.ref_citations    enable row level security;
create policy "read ref_citations"   on public.ref_citations   for select to authenticated using (true);
create policy "read ref_sources"     on public.ref_sources     for select to authenticated using (true);
create policy "read ref_drug_labels" on public.ref_drug_labels for select to authenticated using (true);
create policy "read ref_rx_labels"   on public.ref_rx_labels   for select to authenticated using (true);
-- ref_refresh_runs: service role only.

create index if not exists ref_rx_labels_set_idx on public.ref_rx_labels (set_id);
create index if not exists ref_rx_labels_source_idx on public.ref_rx_labels (source_id);
create index if not exists ref_drug_labels_source_idx on public.ref_drug_labels (source_id);
create index if not exists ref_citations_source_idx on public.ref_citations (source_id);

-- The person's own matches.
create table if not exists public.medication_refs (
  medication_id uuid primary key references public.medications (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  matched_name  text not null,         -- the name as it was when matched; a rename re-matches
  rxcui         text,
  rx_name       text,
  tty           text,
  status        text not null check (status in ('matched', 'not_found')),
  checked_at    timestamptz not null default now()
);

alter table public.medication_refs enable row level security;
create policy "own medication_refs" on public.medication_refs for select
  using (profile_id = (select auth.uid()));
create index if not exists medication_refs_profile_idx on public.medication_refs (profile_id);
create index if not exists medication_refs_rxcui_idx on public.medication_refs (rxcui);
