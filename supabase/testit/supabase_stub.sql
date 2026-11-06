-- Supabasen oleellisten osien jäljitelmä paikalliseen PostgreSQL:ään (vain testeihin): roolit, auth.users,
-- auth.uid() ja Supabasen oletusoikeudet (uudet taulut ja funktiot kaikille rooleille), jotta testi näkee,
-- että migraatio itse rajaa oikeudet.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
