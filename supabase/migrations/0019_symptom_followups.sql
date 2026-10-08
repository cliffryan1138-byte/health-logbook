-- Sparky's follow-up questions (WG-PLAN-HEALTH-002, workstream 2; question
-- bank v0.2, decisions A–E by Cliff, 2026-10-08).
--
-- symptom_followups — the questions asked after a symptom was saved, word for
--   word, and each answer or that it was skipped. One row per symptom entry.
--   items: [{ id, question, answer, skipped, medication_id? }, ...].
--   Kept apart from `symptoms` so answering doesn't mark the symptom itself as
--   changed after recording; exports show the two side by side.
--
-- Additive only: one table, entry_history's table_name check widened
-- (keeping every table up to 0016).

create table if not exists public.symptom_followups (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  symptom_id  uuid        not null unique references public.symptoms (id) on delete cascade,
  items       jsonb       not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 5),
  bank        text        not null default 'v0.2',
  asked_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

alter table public.symptom_followups enable row level security;
create policy "own symptom_followups" on public.symptom_followups for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create index if not exists symptom_followups_profile_idx on public.symptom_followups (profile_id, asked_at desc);

alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses', 'daily_checkins',
                        'assessments', 'meditations', 'pregnancies', 'pregnancy_events', 'exercise_routes',
                        'symptom_followups'));

create or replace trigger symptom_followups_keep_history before update or delete on public.symptom_followups
  for each row execute function private.keep_history();
