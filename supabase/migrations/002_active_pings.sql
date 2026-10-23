-- Anonymous active-user count: one row per install per UTC day the side panel was opened.
-- The table is private; the extension writes through record_active_day() and the
-- metrics pipeline reads through weekly_active_users(), both callable with the public
-- publishable key. Rows older than 35 days are deleted daily.
create table active_pings (
  install_id uuid not null,
  day        date not null default (now() at time zone 'utc')::date,
  version    text not null check (length(version) <= 20),
  primary key (install_id, day)
);

-- RLS on with no policies: anon/authenticated can't touch the table directly.
alter table active_pings enable row level security;

create function record_active_day(p_install_id uuid, p_version text) returns void
  language sql volatile security definer set search_path = public as $$
  insert into active_pings (install_id, version) values (p_install_id, p_version)
  on conflict (install_id, day) do nothing
$$;
revoke execute on function record_active_day(uuid, text) from public;
grant execute on function record_active_day(uuid, text) to anon;

create function weekly_active_users() returns int
  language sql stable security definer set search_path = public as $$
  select count(distinct install_id)::int from active_pings
  where day > (now() at time zone 'utc')::date - 7
$$;
revoke execute on function weekly_active_users() from public;
grant execute on function weekly_active_users() to anon;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('active-pings-retention', '30 0 * * *',
  $$ delete from active_pings where day < (now() at time zone 'utc')::date - 35 $$);
