do $$
begin
  if exists(select 1 from cron.job where jobname='dgos_morning_briefing') then
    perform cron.unschedule('dgos_morning_briefing');
  end if;
end $$;

select cron.schedule(
  'dgos_morning_briefing',
  '*/5 3-10 * * *',
  'select public.dgos_trigger_morning_briefing();'
);
