-- Mental health questionnaires and the meditation log (WG-PLAN-HEALTH-002,
-- workstream 5; Decision D6).
--
-- assessments holds PHQ-9 (depression) and GAD-7 (anxiety) answers exactly as
-- given, 0-3 per question, with the total. Both questionnaires are free to
-- reproduce with no permission needed. The total is a screening score, not a
-- diagnosis; the app shows it with its published band and says so.
-- `difficulty` is the optional closing question (how hard the problems made
-- work, home and getting along), which matters for VA and SSDI records.
--
-- meditations holds sessions: minutes, kind, mood before and after.
--
-- The 988 crisis card that PHQ-9 question 9 can open is shown by the app and
-- recorded nowhere (approved safety flow, 2026-10-08).
--
-- Both tables get the own-rows policy and the same edit history as every
-- other entry (0003). Additive only.

create table if not exists public.assessments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  kind        text        not null check (kind in ('phq9', 'gad7')),
  answers     smallint[]  not null check (0 <= all (answers) and 3 >= all (answers)),
  score       smallint    not null check (score between 0 and 27),
  difficulty  text        check (difficulty in ('not', 'somewhat', 'very', 'extremely')),
  taken_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  check ((kind = 'phq9' and cardinality(answers) = 9) or (kind = 'gad7' and cardinality(answers) = 7))
);

create table if not exists public.meditations (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid        not null references public.profiles (id) on delete cascade,
  minutes         integer     not null check (minutes between 1 and 600),
  kind            text        check (kind in ('breathing', 'guided', 'body_scan', 'prayer', 'other')),
  mood_before_1_5 integer     check (mood_before_1_5 between 1 and 5),
  mood_after_1_5  integer     check (mood_after_1_5 between 1 and 5),
  notes           text        check (length(notes) <= 2000),
  done_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);

alter table public.assessments enable row level security;
alter table public.meditations enable row level security;
create policy "own assessments" on public.assessments for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own meditations" on public.meditations for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create index if not exists assessments_profile_idx on public.assessments (profile_id, taken_at desc);
create index if not exists meditations_profile_idx on public.meditations (profile_id, done_at desc);

alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses', 'daily_checkins',
                        'assessments', 'meditations'));

create or replace trigger assessments_keep_history before update or delete on public.assessments
  for each row execute function private.keep_history();
create or replace trigger meditations_keep_history before update or delete on public.meditations
  for each row execute function private.keep_history();
