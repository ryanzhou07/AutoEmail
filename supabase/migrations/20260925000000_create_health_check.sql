-- A tiny database query for uptime monitoring and connection checks.
create or replace function public.health_check()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
