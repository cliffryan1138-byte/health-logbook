-- Daily check-in, symptom body areas, and veteran status (WG-PLAN-HEALTH-002,
-- workstreams 1 and 8).
--
-- daily_checkins holds the quick things people track once a day, one row per
-- person per day: sleep last night, mood, stress, energy, water, caffeine,
-- alcohol, bowel and stomach, period, menopause symptoms, and the daily-impact
-- facts a VA or SSDI record leans on (missed work, bed rest, needed help,
-- couldn't drive). Every field is optional: people log what they choose to
-- track. Saving again the same day updates that day's row, and the old values
-- go to entry_history like any other edit (0003).
--
-- symptoms.body_group records which body area a symptom was picked from in the
-- symptom library (head_nerves, stomach_gut, female_health, ...). Null for
-- symptoms logged before the library, or typed in freely.
--
-- profiles gains veteran status, branch(es) of service and VA disability
-- rating, asked at sign-up (people who signed up earlier are asked once).
-- These are the person's own answers, not verified; checking them with the VA
-- is a later step. veteran is null until answered.
--
-- Additive only: one table, nullable columns, entry_history's table_name
-- check widened to name the new table.

create table if not exists public.daily_checkins (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid        not null references public.profiles (id) on delete cascade,
  day               date        not null,
  sleep_hr          numeric     check (sleep_hr between 0 and 24),
  sleep_quality_1_5 integer     check (sleep_quality_1_5 between 1 and 5),
  woke_at_night     boolean,
  mood_1_5          integer     check (mood_1_5 between 1 and 5),
  stress_1_5        integer     check (stress_1_5 between 1 and 5),
  energy_1_5        integer     check (energy_1_5 between 1 and 5),
  water_glasses     integer     check (water_glasses between 0 and 40),
  caffeine_cups     integer     check (caffeine_cups between 0 and 30),
  alcohol_drinks    integer     check (alcohol_drinks between 0 and 40),
  alcohol_type      text        check (length(alcohol_type) <= 80),
  bowel             text        check (bowel in ('none', 'hard', 'normal', 'loose')),
  bloating          boolean,
  reflux            boolean,
  period            text        check (period in ('none', 'spotting', 'light', 'medium', 'heavy')),
  hot_flashes_1_5   integer     check (hot_flashes_1_5 between 1 and 5),
  night_sweats_1_5  integer     check (night_sweats_1_5 between 1 and 5),
  missed_work       boolean,
  bed_rest          boolean,
  needed_help       boolean,
  couldnt_drive     boolean,
  notes             text        check (length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  unique (profile_id, day)
);

alter table public.daily_checkins enable row level security;
create policy "own daily_checkins" on public.daily_checkins for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

alter table public.symptoms add column if not exists body_group text check (length(body_group) <= 40);

-- History covers the new table.
alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses', 'daily_checkins'));

create or replace trigger daily_checkins_keep_history before update or delete on public.daily_checkins
  for each row execute function private.keep_history();

alter table public.profiles
  add column if not exists veteran boolean,
  add column if not exists service_branches text[] not null default '{}'
    check (service_branches <@ array['army', 'marine_corps', 'navy', 'air_force', 'space_force', 'coast_guard', 'national_guard', 'reserve']),
  add column if not exists va_rating text
    check (va_rating in ('none', 'pending', '0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'));
