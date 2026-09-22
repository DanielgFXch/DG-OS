create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.dgos_morning_briefing_config (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  send_time time not null default '07:00',
  timezone text not null default 'Europe/Zurich',
  last_sent_date date,
  cron_secret text not null default encode(extensions.gen_random_bytes(32),'hex'),
  updated_at timestamptz not null default now()
);

alter table public.dgos_morning_briefing_config enable row level security;

insert into public.dgos_morning_briefing_config (id, enabled, send_time, timezone)
values ('primary', false, '07:00', 'Europe/Zurich')
on conflict (id) do nothing;

create or replace function public.dgos_trigger_morning_briefing()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select cron_secret into v_secret
  from public.dgos_morning_briefing_config
  where id = 'primary';

  if v_secret is null then
    raise exception 'morning briefing cron secret missing';
  end if;

  select net.http_post(
    url := 'https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/telegram-tasks/morning',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-DGOS-Cron',v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dgos_trigger_morning_briefing() from public, anon, authenticated;
grant execute on function public.dgos_trigger_morning_briefing() to postgres, service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='dgos_morning_briefing') then
    perform cron.unschedule('dgos_morning_briefing');
  end if;
end $$;

select cron.schedule(
  'dgos_morning_briefing',
  '*/5 4-10 * * *',
  'select public.dgos_trigger_morning_briefing();'
);
