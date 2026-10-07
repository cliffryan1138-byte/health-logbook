-- AI spend gate (security assessment WG-14).
--
-- Every Edge Function that calls Claude (sparky-chat, capture, read-notes,
-- read-plan) asks claim_ai_call() first, with the caller's own sign-in. The
-- database counts the call and says no once the person is over their minute,
-- hour or day budget, or once everyone together is over the hourly circuit
-- breaker. A refused call never reaches the model. The functions treat an
-- error here as a refusal, so apply this migration BEFORE deploying them.
--
-- Only call metadata is kept (who, which function, when), never content, and
-- only for two days.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ai_calls (
  id          bigint generated always as identity primary key,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  fn          text        not null,
  called_at   timestamptz not null default now()
);
create index if not exists ai_calls_profile_idx on private.ai_calls (profile_id, called_at desc);
create index if not exists ai_calls_time_idx    on private.ai_calls (called_at);

-- Returns true and records the call when it is within budget; false otherwise.
create or replace function public.claim_ai_call(p_fn text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  per_min  int;
  per_hour int;
  per_day  int;
  global_per_hour constant int := 3000;
  n_min int; n_hour int; n_day int;
begin
  if uid is null then
    return false;
  end if;

  -- Photo capture is the everyday path, so it gets the roomiest budget.
  case p_fn
    when 'capture'     then per_min := 20; per_hour := 200; per_day := 600;
    when 'sparky-chat' then per_min := 8;  per_hour := 80;  per_day := 300;
    when 'read-notes'  then per_min := 4;  per_hour := 20;  per_day := 60;
    when 'read-plan'   then per_min := 4;  per_hour := 20;  per_day := 60;
    else return false;
  end case;

  -- One caller at a time per person, so parallel requests can't all squeeze
  -- under the same count.
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || uid::text));

  delete from private.ai_calls where profile_id = uid and called_at < now() - interval '2 days';

  select count(*) filter (where c.called_at > now() - interval '1 minute'),
         count(*) filter (where c.called_at > now() - interval '1 hour'),
         count(*)
    into n_min, n_hour, n_day
    from private.ai_calls c
   where c.profile_id = uid and c.fn = p_fn and c.called_at > now() - interval '1 day';

  if n_min >= per_min or n_hour >= per_hour or n_day >= per_day then
    return false;
  end if;

  if (select count(*) from private.ai_calls where called_at > now() - interval '1 hour') >= global_per_hour then
    return false;
  end if;

  insert into private.ai_calls (profile_id, fn) values (uid, p_fn);
  return true;
end;
$$;

revoke all on function public.claim_ai_call(text) from public, anon;
grant execute on function public.claim_ai_call(text) to authenticated;
