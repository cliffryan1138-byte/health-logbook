-- Medications: the list a person takes, and each dose actually taken.
--
-- Testers asked to add medications. A doctor reading a headache diary asks
-- two things straight away: what are you on, and what did you take for it.
-- So there are two tables:
--
--   * medications — the list (name, dose, how often, what for, started,
--     stopped). Stopping a medicine sets stopped_on; the row stays, because
--     "was on X from March to June" is part of the record.
--   * med_doses — one row per dose taken, on the timeline next to meals and
--     symptoms. The name is copied onto the dose, so the record still reads
--     correctly if the list entry is renamed later.
--
-- Doses get the same tamper-evident history as every other entry (0003):
-- edits and deletes copy the old row into entry_history first. The list gets
-- it too, so a changed dose on the list is visible.
--
-- Additive only: two new tables, and entry_history's table_name check widened
-- to name them.

create table if not exists public.medications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null check (length(name) between 1 and 120),
  dose        text,                       -- "50 mg", "2 puffs" — as the label says
  schedule    text,                       -- "twice a day", "at bedtime"
  as_needed   boolean     not null default false,
  reason      text,                       -- "migraine", "blood pressure"
  started_on  date,
  stopped_on  date,
  notes       text,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

create table if not exists public.med_doses (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid        not null references public.profiles (id) on delete cascade,
  medication_id uuid        references public.medications (id) on delete set null,
  name          text        not null check (length(name) between 1 and 120),
  dose          text,
  notes         text,                     -- "helped after an hour", "half a tablet"
  taken_at      timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);

alter table public.medications enable row level security;
alter table public.med_doses   enable row level security;

create policy "own medications" on public.medications for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own med_doses"   on public.med_doses   for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create index if not exists medications_profile_idx  on public.medications (profile_id, stopped_on);
create index if not exists med_doses_profile_idx    on public.med_doses   (profile_id, taken_at desc);
create index if not exists med_doses_medication_idx on public.med_doses   (medication_id);

-- History covers the two new tables.
alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses'));

create or replace trigger medications_keep_history before update or delete on public.medications
  for each row execute function private.keep_history();
create or replace trigger med_doses_keep_history   before update or delete on public.med_doses
  for each row execute function private.keep_history();
