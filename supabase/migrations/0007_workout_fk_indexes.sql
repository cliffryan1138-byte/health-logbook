-- Covering indexes for the workout tables' foreign keys (Supabase performance
-- advisor, unindexed_foreign_keys), now that Workouts ships inside Daybook.
create index if not exists plan_days_profile_idx           on public.plan_days      (profile_id);
create index if not exists plan_exercises_plan_idx         on public.plan_exercises (plan_id);
create index if not exists plan_exercises_profile_idx      on public.plan_exercises (profile_id);
create index if not exists workout_sets_plan_exercise_idx  on public.workout_sets   (plan_exercise_id);
