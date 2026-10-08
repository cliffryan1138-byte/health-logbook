-- GPS routes for runs, walks and rucks (Cliff, 2026-10-08: "options 1 and 2" —
-- live tracking with the screen kept on, and importing a GPX file from a watch
-- or another app).
--
-- exercise.distance_m / exercise.pack_lb — the distance covered and, for a
--   ruck, the pack weight. On the exercise row itself so the Logbook, the
--   printout and the change history carry them like any other field.
-- exercise_routes — the route drawn on the map, one per exercise entry.
--   points is a list of [lat, lon, seconds from start, elevation m | null].
--   The first and last 200 m (trimmed_m) are cut off before saving, so a route
--   never shows where someone starts and ends (usually home); distance and
--   time are worked out from the full track first.
--
-- Additive only: two nullable columns, one table, entry_history's table_name
-- check widened (keeping every table up to 0015).

alter table public.exercise
  add column if not exists distance_m numeric check (distance_m >= 0 and distance_m <= 1000000),
  add column if not exists pack_lb    numeric check (pack_lb >= 0 and pack_lb <= 300);

create table if not exists public.exercise_routes (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid        not null references public.profiles (id) on delete cascade,
  exercise_id      uuid        not null unique references public.exercise (id) on delete cascade,
  source           text        not null check (source in ('live', 'gpx')),
  points           jsonb       not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 20000),
  trimmed_m        integer     not null default 200 check (trimmed_m between 0 and 2000),
  moving_sec       integer     check (moving_sec between 0 and 172800),
  elevation_gain_m numeric     check (elevation_gain_m between 0 and 20000),
  created_at       timestamptz not null default now(),
  edited_at        timestamptz
);

alter table public.exercise_routes enable row level security;
create policy "own exercise_routes" on public.exercise_routes for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create index if not exists exercise_routes_profile_idx on public.exercise_routes (profile_id, created_at desc);

-- History covers the new table.
alter table public.entry_history drop constraint if exists entry_history_table_name_check;
alter table public.entry_history add constraint entry_history_table_name_check
  check (table_name in ('meals', 'vitals', 'symptoms', 'exercise', 'medications', 'med_doses', 'daily_checkins',
                        'assessments', 'meditations', 'pregnancies', 'pregnancy_events', 'exercise_routes'));

create or replace trigger exercise_routes_keep_history before update or delete on public.exercise_routes
  for each row execute function private.keep_history();
