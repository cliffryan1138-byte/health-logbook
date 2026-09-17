-- Logbook schema.
--
-- RECOVERY NOTE: the original migration was lost with the source folder. This
-- file is generated from the LIVE database (Supabase project health-logbook,
-- ivymolvqxbychmylezdx) on 2026-09-17, so it reflects what is actually running
-- rather than what was once written. RLS policies are listed for reference; they
-- already exist on the live project.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id),
  display_name text        not null,
  focus_areas  text[]      not null default '{}',
  watch_list   text[]      not null default '{}',
  targets      jsonb       not null default '{}',
  color        text        not null default '#1c6b58',
  created_at   timestamptz not null default now()
);

create table if not exists public.meals (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid        not null references public.profiles (id),
  description   text        not null,
  calories      integer,
  carbs_g       numeric,
  sugar_g       numeric,
  fiber_g       numeric,
  protein_g     numeric,
  fat_g         numeric,
  sodium_mg     numeric,
  confidence    text        check (confidence in ('high', 'medium', 'low')),
  notes         text,
  eaten_at      timestamptz not null default now(),
  source        text        not null default 'manual'
                            check (source in ('manual', 'photo', 'voice')),
  trigger_watch text[]      not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists public.vitals (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid        not null references public.profiles (id),
  weight_lb       numeric,
  bp_systolic     integer,
  bp_diastolic    integer,
  heart_rate      integer,
  glucose_mgdl    integer,
  glucose_context text        check (glucose_context in
                    ('fasting', 'post-breakfast', 'post-lunch', 'post-dinner', 'random')),
  sleep_hr        numeric,
  energy_1_5      integer     check (energy_1_5 between 1 and 5),
  mood_1_5        integer     check (mood_1_5 between 1 and 5),
  waist_in        numeric,
  notes           text,
  taken_at        timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.exercise (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid        not null references public.profiles (id),
  activity     text        not null,
  duration_min integer,
  intensity    text        check (intensity in ('easy', 'moderate', 'hard')),
  notes        text,
  done_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists public.symptoms (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid        not null references public.profiles (id),
  symptom           text        not null,
  severity_1_5      integer     not null check (severity_1_5 between 1 and 5),
  duration_hr       numeric,
  suspected_trigger text,
  notes             text,
  felt_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid        not null references public.profiles (id),
  message    text        not null,
  status     text        not null default 'new'
                         check (status in ('new', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

-- Every table is row-level-secured; a row belongs to the signed-in profile.
alter table public.profiles enable row level security;
alter table public.meals    enable row level security;
alter table public.vitals   enable row level security;
alter table public.exercise enable row level security;
alter table public.symptoms enable row level security;
alter table public.feedback enable row level security;

-- Query-planner support for the dashboard's (profile_id, time) window reads.
create index if not exists meals_profile_eaten_idx    on public.meals    (profile_id, eaten_at desc);
create index if not exists vitals_profile_taken_idx   on public.vitals   (profile_id, taken_at desc);
create index if not exists exercise_profile_done_idx  on public.exercise (profile_id, done_at  desc);
create index if not exists symptoms_profile_felt_idx  on public.symptoms (profile_id, felt_at  desc);
