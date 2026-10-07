-- Run the AI key check (ai-health, 0009) every 15 minutes. The cron secret is
-- read from private.ops_settings at run time; it never appears in the job.
select cron.schedule(
  'daybook-ai-key-check',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://ivymolvqxbychmylezdx.supabase.co/functions/v1/ai-health',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from private.ops_settings where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
