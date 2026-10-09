// Shared by the SQL suites: a stub of what Supabase provides before any
// project migration runs, so revokes, grants and RLS are exercised on real
// Postgres (PGlite) against Supabase's permissive defaults.
import { readdirSync } from 'node:fs'

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

/** Every migration file, in the order Supabase applies them. */
export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

export const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz,
    is_anonymous boolean not null default false
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's permissive defaults, which the migrations must narrow.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`
