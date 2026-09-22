-- Minimal stand-in for the Supabase-managed bits the migration assumes.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Supabase derives auth.uid() from the request JWT; here it reads a GUC
-- the tests set, so we can impersonate a player.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
