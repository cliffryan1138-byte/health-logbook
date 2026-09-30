-- Sign-in log (WG-PLAN-HEALTH-001, Security foundation), kept apart from 0003
-- because it is the only change that touches Supabase's own auth schema.
--
-- Sign-ins are written by the database when Supabase Auth opens a session, so
-- they can't be skipped or forged from the app. Only the browser's user-agent
-- string is kept (no IP address). A failure here must never block a sign-in.
create or replace function private.log_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (profile_id, event, detail)
  select p.id, 'sign_in', jsonb_build_object('aal', new.aal, 'user_agent', left(coalesce(new.user_agent, ''), 200))
  from public.profiles p
  where p.id = new.user_id;
  return new;
exception when others then
  return new;
end;
$$;

create or replace trigger on_session_created_log_sign_in
  after insert on auth.sessions
  for each row execute function private.log_sign_in();

-- The trigger fires inside Supabase Auth's own connection; let that role reach
-- the function explicitly rather than relying on trigger semantics.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.log_sign_in() to supabase_auth_admin;
