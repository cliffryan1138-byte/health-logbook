-- AI key alert: a check every 15 minutes that Claude still accepts Daybook's
-- API key, with an email to Cliff when it stops (and an all-clear when it's
-- back). On 2026-10-07 the key stopped working and every AI feature failed
-- for hours before a tester noticed (logbook SETBACK, 2026-10-07).
--
--   * private.ops_settings holds a random cron secret, made here and never
--     seen by anyone. pg_cron sends it to the ai-health edge function, which
--     refuses any call without it (the function runs with verify_jwt off, so
--     this IS its authentication) before it spends anything.
--   * private.ops_checks remembers the last result, so an email goes out only
--     when something changes: down (at once for a rejected key, missing
--     credit or permission; after two failures in a row for an outage; after
--     four for rate limiting), a reminder every 6 hours while down, and up.
--   * The ops_* functions are the only way in. Each checks the secret itself;
--     from 0011 only service_role (the function's server-only key) may call
--     them at all.
--
-- Numbered 0009: 0008 is taken by the AI spend gate on another branch.
-- The pg_cron job is scheduled separately, once the function is deployed.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists private.ops_settings (
  key   text primary key,
  value text not null
);
insert into private.ops_settings (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table if not exists private.ops_checks (
  name            text primary key,     -- 'anthropic', or 'test' for a drill
  ok              boolean     not null default true,
  kind            text        not null default 'ok',
  detail          text,
  fail_count      integer     not null default 0,
  since           timestamptz not null default now(),  -- when the current state began
  last_checked    timestamptz,
  alerted_down_at timestamptz           -- last down/reminder email; cleared on recovery
);

create or replace function public.ops_cron_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32, false) and exists (
    select 1 from private.ops_settings where key = 'cron_secret' and value = p_secret
  );
$$;

create or replace function public.ops_record_ai_check(
  p_secret text, p_name text, p_ok boolean, p_kind text, p_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.ops_checks;
  alert text := null;
  failing boolean;
begin
  if not public.ops_cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_name not in ('anthropic', 'test') then
    raise exception 'unknown check %', p_name;
  end if;

  insert into private.ops_checks (name) values (p_name) on conflict (name) do nothing;
  select * into s from private.ops_checks where name = p_name for update;

  if p_ok then
    if s.alerted_down_at is not null then alert := 'up'; end if;
    update private.ops_checks set
      ok = true, kind = 'ok', detail = null, fail_count = 0,
      since = case when s.ok then s.since else now() end,
      last_checked = now(), alerted_down_at = null
    where name = p_name;
  else
    failing := case
      when p_kind in ('key', 'credit', 'permission') then true
      when p_kind = 'rate_limited' then s.fail_count + 1 >= 4
      else s.fail_count + 1 >= 2
    end;
    if failing and s.alerted_down_at is null then alert := 'down';
    elsif failing and s.alerted_down_at < now() - interval '6 hours' then alert := 'reminder';
    end if;
    update private.ops_checks set
      ok = false, kind = p_kind, detail = left(p_detail, 300), fail_count = s.fail_count + 1,
      since = case when s.ok then now() else s.since end,
      last_checked = now(),
      alerted_down_at = case when alert is not null then now() else s.alerted_down_at end
    where name = p_name;
  end if;

  return jsonb_build_object(
    'alert', alert,
    'since', (select since from private.ops_checks where name = p_name),
    'fail_count', (select fail_count from private.ops_checks where name = p_name)
  );
end;
$$;

-- An email that couldn't be sent: forget it was sent, so the next check retries.
create or replace function public.ops_alert_not_sent(p_secret text, p_name text, p_alert text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ops_cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_alert = 'up' then
    -- Recovery mail failed: keep a marker so the next healthy check says "up".
    update private.ops_checks set alerted_down_at = now() where name = p_name and ok;
  else
    update private.ops_checks set alerted_down_at = null where name = p_name;
  end if;
end;
$$;

revoke all on function public.ops_cron_ok(text) from public, authenticated;
revoke all on function public.ops_record_ai_check(text, text, boolean, text, text) from public, authenticated;
revoke all on function public.ops_alert_not_sent(text, text, text) from public, authenticated;
-- First version: callable by anon (the edge function's publishable key), the
-- secret inside each one being the gate. Tightened to service_role in 0011.
grant execute on function public.ops_cron_ok(text) to anon;
grant execute on function public.ops_record_ai_check(text, text, boolean, text, text) to anon;
grant execute on function public.ops_alert_not_sent(text, text, text) to anon;
