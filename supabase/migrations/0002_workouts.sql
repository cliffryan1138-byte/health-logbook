-- Workouts, phase 1: training plans, their days and exercises, and the sets
-- actually done. Additive only — nothing existing changes except three new,
-- nullable columns on `exercise`, so every workout already logged is untouched.
--
-- A finished workout is still one `exercise` row (so the Logbook, calendar,
-- trends and doctor/lawyer exports keep working as they are); its sets hang
-- off it in `workout_sets`.
--
-- Plan targets are text on purpose: real plans say "12–15", "10 slow",
-- "8 rounds: 30s hard / 30s easy", "12/side". What was actually done is
-- numbers where it can be (reps, weight, RPE) and text where it can't
-- ("red band", "doubled green").
--
-- Every table uses the same privacy rule as the rest of the app: a row is
-- readable and writable only by the profile that owns it.

create table if not exists public.workout_plans (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null,
  description text,
  weeks       integer     check (weeks between 1 and 52),
  started_on  date,
  active      boolean     not null default false,
  -- [{ "week": 1, "text": "Learn the movements. RPE 7..." }, ...]
  week_notes  jsonb       not null default '[]',
  source      text        not null default 'manual' check (source in ('manual', 'photo', 'pdf')),
  created_at  timestamptz not null default now()
);

create table if not exists public.plan_days (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.workout_plans (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  position    integer     not null,                   -- 1, 2, 3… order within the plan
  weekday     smallint    check (weekday between 1 and 7), -- 1 = Monday; null = "next in order"
  title       text        not null,                   -- "Day 1 — Upper Push"
  focus       text,                                   -- "Chest, shoulders, triceps"
  notes       text,                                   -- setup, warm-up
  created_at  timestamptz not null default now()
);

create table if not exists public.plan_exercises (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid        not null references public.plan_days (id) on delete cascade,
  plan_id     uuid        not null references public.workout_plans (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  position    integer     not null,
  name        text        not null,                   -- "Band floor press (supine)"
  sets        integer     check (sets between 1 and 50),
  reps        text,                                   -- "12–15", "10 slow", "30s hard / 30s easy"
  rest_sec    integer     check (rest_sec between 0 and 900),
  cues        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid        not null references public.profiles (id) on delete cascade,
  exercise_id      uuid        not null references public.exercise (id) on delete cascade,
  plan_exercise_id uuid        references public.plan_exercises (id) on delete set null,
  movement         text        not null,              -- copied, so history survives plan edits
  set_no           integer     not null check (set_no between 1 and 50),
  reps             integer     check (reps between 0 and 1000),
  load             text,                              -- "red band", "doubled green", "bodyweight"
  weight_lb        numeric     check (weight_lb >= 0),
  rpe              numeric     check (rpe between 1 and 10),
  created_at       timestamptz not null default now()
);

alter table public.exercise add column if not exists plan_day_id uuid references public.plan_days (id) on delete set null;
alter table public.exercise add column if not exists steps       integer check (steps >= 0);
alter table public.exercise add column if not exists distance_mi numeric check (distance_mi >= 0);

alter table public.workout_plans  enable row level security;
alter table public.plan_days      enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workout_sets   enable row level security;

create policy "own workout_plans"  on public.workout_plans  for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own plan_days"      on public.plan_days      for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own plan_exercises" on public.plan_exercises for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "own workout_sets"   on public.workout_sets   for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Only one active plan per person.
create unique index if not exists workout_plans_one_active
  on public.workout_plans (profile_id) where active;

create index if not exists plan_days_plan_idx         on public.plan_days      (plan_id, position);
create index if not exists plan_exercises_day_idx     on public.plan_exercises (day_id, position);
create index if not exists workout_sets_exercise_idx  on public.workout_sets   (exercise_id, set_no);
create index if not exists workout_sets_movement_idx  on public.workout_sets   (profile_id, movement, created_at desc);
create index if not exists exercise_plan_day_idx      on public.exercise       (plan_day_id);
