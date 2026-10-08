-- Refresh the reference library weekly (ref-sync, 0017): Sundays 07:00 UTC.
-- Applied after the ref-sync function is deployed. The cron secret is read
-- from private.ops_settings at run time, as for the AI key check (0010).
select cron.schedule(
  'daybook-ref-sync-weekly',
  '0 7 * * 0',
  $job$
  select net.http_post(
    url := 'https://ivymolvqxbychmylezdx.supabase.co/functions/v1/ref-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from private.ops_settings where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
