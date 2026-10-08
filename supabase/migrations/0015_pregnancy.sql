-- Pregnancy tracker (WG-PLAN-HEALTH-002, workstream 9; built ahead of the rest
-- of Phase 1 by Cliff's decision, 2026-10-08).
--
-- pregnancies — one tracked pregnancy: the due date (entered, or worked out
--   from the first day of the last period), the person's OB or midwife for the
--   alert's call button, and its state. "pregnant" becomes "postpartum" when
--   the baby is born and stays so for 12 months (postpartum_until), matching
--   the CDC's warning-signs window; "ended" switches the tracker off. Ending
--   after a loss sets only ended_on: no reason is stored, and nothing reminds.
-- pregnancy_events — kick counts, contractions, prenatal visits and the
--   running list of questions to ask at the next visit.
-- ref_pregnancy_bp — the blood pressure thresholds the app checks every
--   reading against, with their published source. Reference data, not code
--   (plan: "never typed into the code"). Readable by any signed-in person,
--   writable by nobody through the API.
-- delete_pregnancy_record() — the plan lets a person delete a pregnancy's
--   entries for good. Ordinary deletes leave a copy in entry_history (0003);
--   this removes the tracker's rows AND their history copies, owner only.
--
-- Additive only: three tables, one function, entry_history's table_name check
-- widened (keeping 0014's assessments and meditations).

create table if not exists public.pregnancies (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid        not null references public.profiles (id) on delete cascade,
  due_date         date        not null,
  lmp_date         date,
  status           text        not null default 'pregnant' check (status in ('pregnant', 'postpartum', 'ended')),
  birth_date       date,
  postpartum_until date,
  ended_on         date,
  doctor_name      text        check (length(doctor_name) <= 120),
  doctor_phone     text        check (length(doctor_phone) <= 40),
  created_at       timestamptz not null default now(),
  edited_at        timestamptz
);

-- One tracker on at a time.
create unique index if not exists pregnancies_one_active
  on public.pregnancies (profile_id) where status in ('pregnant', 'postpartum');

create table if not exists public.pregnancy_events (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid        not null references public.profiles (id) on delete cascade,
  pregnancy_id  uuid        not null references public.pregnancies (id) on delete cascade,
  kind          text        not null check (kind in ('kicks', 'contraction', 'visit', 'question')),
  at            timestamptz not null default now(),
  count         integer     check (count between 0 and 1000),
  duration_sec  integer     check (duration_sec between 0 and 86400),
  title         text        check (length(title) <= 300),
  notes         text        check (length(notes) <= 2000),
  done          boolean     not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);

alter table public.pregnancies      enable row level security;
alter table public.pregnancy_events enable row level security;

create policy "own pregnancies" on public.pregnancies for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own pregnancy_events" on public.pregnancy_events for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create index if not exists pregnancies_profile_idx           on public.pregnancies      (profile_id);
create index if not exists pregnancy_events_profile_idx      on public.pregnancy_events (profile_id, at desc);
create index if not exists pregnancy_events_pregnancy_idx    on public.pregnancy_events (pregnancy_id, kind, at desc);

-- History covers the new tables.
alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses', 'daily_checkins',
                        'assessments', 'meditations', 'pregnancies', 'pregnancy_events'));

create or replace trigger pregnancies_keep_history before update or delete on public.pregnancies
  for each row execute function private.keep_history();
create or replace trigger pregnancy_events_keep_history before update or delete on public.pregnancy_events
  for each row execute function private.keep_history();

-- ---------------------------------------------------------------- thresholds

create table if not exists public.ref_pregnancy_bp (
  level             text primary key check (level in ('high', 'severe')),
  systolic_at_least integer not null,
  diastolic_at_least integer not null,
  label             text not null,           -- the source's wording for this range
  source_title      text not null,
  source_publisher  text not null,
  source_url        text not null,
  source_year       integer not null,
  retrieved_on      date not null,
  source_applies    text not null,           -- the window the source itself states
  daybook_applies   text not null            -- the window Daybook checks (the plan's)
);

alter table public.ref_pregnancy_bp enable row level security;
create policy "anyone signed in reads thresholds" on public.ref_pregnancy_bp for select to authenticated using (true);
revoke insert, update, delete, truncate on public.ref_pregnancy_bp from anon, authenticated;

-- A reading is in a range when systolic OR diastolic reaches it (the source
-- writes "SBP ≥ 140 or DBP ≥ 90").
insert into public.ref_pregnancy_bp values
  ('high', 140, 90, 'Gestational Hypertension or Preeclampsia',
   'Urgent Care: Acute Hypertension in Pregnancy & Postpartum Algorithm',
   'American College of Obstetricians and Gynecologists',
   'https://urgentcareassociation.org/wp-content/uploads/ACOG_Hypertension_Algorithm_UC_FINAL_SECURED.pdf',
   2025, '2026-10-08', '≥20 weeks pregnant or ≤6 weeks postpartum',
   'The whole pregnancy and 12 months after birth (WG-PLAN-HEALTH-002, decided 2026-10-07)'),
  ('severe', 160, 110, 'considered a hypertensive emergency and constitutes preeclampsia with severe features',
   'Urgent Care: Acute Hypertension in Pregnancy & Postpartum Algorithm',
   'American College of Obstetricians and Gynecologists',
   'https://urgentcareassociation.org/wp-content/uploads/ACOG_Hypertension_Algorithm_UC_FINAL_SECURED.pdf',
   2025, '2026-10-08', '≥20 weeks pregnant or ≤6 weeks postpartum',
   'The whole pregnancy and 12 months after birth (WG-PLAN-HEALTH-002, decided 2026-10-07)')
on conflict (level) do nothing;

-- ---------------------------------------------------------------- delete for good

create or replace function public.delete_pregnancy_record(p_pregnancy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  started date;
  event_ids uuid[];
  symptom_ids uuid[];
begin
  select due_date - 300 into started from public.pregnancies
   where id = p_pregnancy_id and profile_id = me;
  if not found then
    raise exception 'Not found' using errcode = '42501';
  end if;

  -- The tracker's events, its pregnancy-only symptoms, and the pregnancy row.
  -- Each delete writes a history copy (0003); those copies are removed in a
  -- later statement, because a statement can't see the rows its own triggers
  -- insert.
  select coalesce(array_agg(id), '{}') into event_ids from public.pregnancy_events
   where pregnancy_id = p_pregnancy_id and profile_id = me;
  select coalesce(array_agg(id), '{}') into symptom_ids from public.symptoms
   where profile_id = me and body_group = 'pregnancy' and felt_at >= started;

  delete from public.pregnancy_events where id = any (event_ids);
  delete from public.symptoms where id = any (symptom_ids);
  delete from public.pregnancies where id = p_pregnancy_id and profile_id = me;

  delete from public.entry_history
   where profile_id = me
     and ((table_name = 'pregnancy_events' and row_id = any (event_ids))
       or (table_name = 'symptoms' and row_id = any (symptom_ids))
       or (table_name = 'pregnancies' and row_id = p_pregnancy_id));
end;
$$;

revoke all on function public.delete_pregnancy_record(uuid) from public, anon;
grant execute on function public.delete_pregnancy_record(uuid) to authenticated;
