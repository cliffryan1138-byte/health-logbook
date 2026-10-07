-- The ops_* functions were callable by anon, gated only by the cron secret
-- they check inside; the security advisor (rightly) flagged a SECURITY
-- DEFINER function anyone can call. ai-health now uses the project's secret
-- key, so only service_role needs them.
revoke execute on function public.ops_cron_ok(text) from anon, authenticated, public;
revoke execute on function public.ops_record_ai_check(text, text, boolean, text, text) from anon, authenticated, public;
revoke execute on function public.ops_alert_not_sent(text, text, text) from anon, authenticated, public;
grant execute on function public.ops_cron_ok(text) to service_role;
grant execute on function public.ops_record_ai_check(text, text, boolean, text, text) to service_role;
grant execute on function public.ops_alert_not_sent(text, text, text) to service_role;
