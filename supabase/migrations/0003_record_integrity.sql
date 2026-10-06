-- Record integrity: the log can't be quietly rewritten, and exports and
-- sign-ins leave a trace (WG-PLAN-HEALTH-001, Security foundation).
--
-- Before this, the own-rows policies let a signed-in person UPDATE or DELETE
-- their own entries straight through the API, with nothing kept. The app never
-- does either, but a record a claim leans on has to show it wasn't edited, not
-- just promise it. So, from here on:
--
--   * Every change to a meal, vitals, symptom or exercise row copies the old row
--     into entry_history first; a delete does the same. People can read their
--     own history and nobody can write to it except the trigger.
--   * id, profile_id and created_at can never change, so "Recorded" and the
--     "entered later" flag can't be backdated.
--   * An edited row carries edited_at, so exports can mark it.
--   * audit_events keeps exports, prints and shares (written by the app, which
--     can't backdate them or change them afterwards) and, from 0004, every
--     sign-in (written by the database itself).
--
-- Deleting an account still removes everything: entries first (their history
-- rows are written, then removed with the profile via on delete cascade).
--
-- Additive only: new tables, one nullable column per table, triggers.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- history

create table if not exists public.entry_history (
  id          bigint generated always as identity primary key,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  table_name  text        not null check (table_name in ('meals', 'vitals', 'symptoms', 'exercise')),
  row_id      uuid        not null,
  op          text        not null check (op in ('update', 'delete')),
  old_row     jsonb       not null,
  changed_by  uuid,       -- auth.uid() of whoever made the change; null for dashboard/service edits
  changed_at  timestamptz not null default now()
);

alter table public.entry_history enable row level security;
create policy "read own history" on public.entry_history for select
  using (profile_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.entry_history from anon, authenticated;

create index if not exists entry_history_profile_idx on public.entry_history (profile_id, changed_at desc);
create index if not exists entry_history_row_idx     on public.entry_history (table_name, row_id);

alter table public.meals    add column if not exists edited_at timestamptz;
alter table public.vitals   add column if not exists edited_at timestamptz;
alter table public.symptoms add column if not exists edited_at timestamptz;
alter table public.exercise add column if not exists edited_at timestamptz;

create or replace function private.keep_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.profile_id is distinct from old.profile_id
       or new.created_at is distinct from old.created_at then
      raise exception 'An entry''s id, owner and recorded time cannot be changed'
        using errcode = '42501';
    end if;
    -- A write that changes nothing is not an edit.
    if (to_jsonb(new) - 'edited_at') = (to_jsonb(old) - 'edited_at') then
      return old;
    end if;
    new.edited_at := now();
  end if;

  insert into public.entry_history (profile_id, table_name, row_id, op, old_row, changed_by)
  values (old.profile_id, tg_table_name, old.id, lower(tg_op), to_jsonb(old), auth.uid());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger meals_keep_history    before update or delete on public.meals
  for each row execute function private.keep_history();
create or replace trigger vitals_keep_history   before update or delete on public.vitals
  for each row execute function private.keep_history();
create or replace trigger symptoms_keep_history before update or delete on public.symptoms
  for each row execute function private.keep_history();
create or replace trigger exercise_keep_history before update or delete on public.exercise
  for each row execute function private.keep_history();

-- ---------------------------------------------------------------- audit trail

create table if not exists public.audit_events (
  id          bigint generated always as identity primary key,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  event       text        not null check (event in ('sign_in', 'export_print', 'export_csv', 'export_share')),
  -- Counts, purposes, ranges and fingerprints only. Never entry content.
  detail      jsonb       not null default '{}' check (pg_column_size(detail) <= 2048),
  at          timestamptz not null default now()
);

alter table public.audit_events enable row level security;
create policy "read own audit events" on public.audit_events for select
  using (profile_id = (select auth.uid()));
create policy "log own exports" on public.audit_events for insert
  with check (profile_id = (select auth.uid()) and event <> 'sign_in');
-- The app may add events but never set their time, edit or remove them.
revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
grant insert (profile_id, event, detail) on public.audit_events to authenticated;

create index if not exists audit_events_profile_idx on public.audit_events (profile_id, at desc);
