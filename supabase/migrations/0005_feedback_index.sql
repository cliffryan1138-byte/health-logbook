-- Covering index for feedback.profile_id (Supabase performance advisor,
-- unindexed_foreign_keys).
create index if not exists feedback_profile_idx on public.feedback (profile_id);
