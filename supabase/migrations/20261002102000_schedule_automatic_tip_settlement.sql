-- Requires these pre-provisioned Vault entries:
-- maurilio_project_url
-- maurilio_publishable_key
-- maurilio_settlement_secret

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'maurilio-settle-tips'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'maurilio-settle-tips',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'maurilio_project_url'
      limit 1
    ) || '/functions/v1/maurilio-tip-settle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'maurilio_publishable_key'
        limit 1
      ),
      'x-maurilio-settlement-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'maurilio_settlement_secret'
        limit 1
      )
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
