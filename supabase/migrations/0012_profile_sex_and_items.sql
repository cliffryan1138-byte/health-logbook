-- Male or female, and which body-specific items a person sees
-- (WG-PLAN-HEALTH-002, workstream 10).
--
-- `sex` is the first sign-up question; people who signed up before it are
-- asked once. It only sets defaults: `shown_items` holds the person's own
-- choices from Settings (item key -> true/false), which win over the default.
-- Hiding an item never deletes anything logged under it.
--
-- Additive only. The existing "own profile" policy already covers both
-- columns.

alter table public.profiles
  add column if not exists sex text check (sex in ('male', 'female')),
  add column if not exists shown_items jsonb not null default '{}'::jsonb;
