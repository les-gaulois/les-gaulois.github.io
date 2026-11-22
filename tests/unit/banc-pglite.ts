/**
 * Le banc PGlite : toutes les migrations du dépôt, dans l'ordre, sur un Postgres 17 en mémoire (PGlite), avec seulement ce
 * que Supabase fournit autour d'elles et qui n'est pas dans le dépôt : les rôles, `auth`, `storage`, pg_cron et pg_net (ces
 * deux-là sans effet). Les lignes `create extension` sont retirées. Repris du banc des sessions du village (19 novembre 2026).
 *
 * Un test qui l'emploie appelle `baseDeTest()` une fois (une seconde ou deux), puis joue les fonctions comme un membre avec
 * `commeMembre`. Ce module n'est pas un test : il n'est lancé que par ceux qui l'importent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', last_sign_in_at timestamptz, created_at timestamptz default now(), is_anonymous boolean default false);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, provider_id text, identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz default now(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create schema extensions;
create schema cron;
create table cron.job (jobid bigserial primary key, schedule text, command text, jobname text unique, active boolean default true);
create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language plpgsql as $$ declare v bigint; begin insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into v; return v; end $$;
create function cron.unschedule(p_name text) returns boolean language plpgsql as $$ begin delete from cron.job where jobname = p_name; return found; end $$;
create schema net;
create table net._http_response (id bigint primary key, status_code int, content text, created timestamptz default now(), error_msg text, timed_out boolean, content_type text, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_delete(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
`;

export const DOSSIER_DES_MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

/** Le texte d'une migration, tel que le banc l'applique : fins de ligne Unix, sans `create extension`. */
export const texteDeMigration = (nom: string): string =>
  readFileSync(new URL(nom, DOSSIER_DES_MIGRATIONS), "utf8").replace(/\r\n/g, "\n").split("\n").filter((l) => !/^\s*create extension/i.test(l)).join("\n");

/** Les migrations du dépôt, dans l'ordre. */
export const migrations = (): string[] => readdirSync(DOSSIER_DES_MIGRATIONS).filter((n) => n.endsWith(".sql")).sort();

/** Une base neuve, avec toutes les migrations du dépôt, sauf celles de `sauf` (pour essayer un fichier à coller). */
export async function baseDeTest(o: { sauf?: readonly string[] } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(PRELUDE);
  for (const nom of migrations()) {
    if (o.sauf?.includes(nom)) continue;
    try {
      await db.exec(texteDeMigration(nom));
    } catch (e) {
      throw new Error(`${nom} : ${(e as Error).message}`);
    }
  }
  return db;
}

/** Appelle `requete` comme le membre `uid` (auth.uid()), puis redevient la clé de service. Le compteur d'appels est remis à zéro. */
export async function commeMembre<T>(db: PGlite, uid: string, requete: string, params: unknown[] = []): Promise<T> {
  await db.query("delete from public.action_limits where true");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    const r = await db.query<{ r: T }>(requete, params);
    return r.rows[0]!.r;
  } finally {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

let numero = 0;

/** Un membre d'essai : un compte lié à Discord, validé, avec son Gaulois (sauf demande contraire). Rend son identifiant. */
export async function nouveauMembre(db: PGlite, o: { valide?: boolean; gaulois?: boolean; empreinte?: string } = {}): Promise<string> {
  numero++;
  const uid = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`essai${numero}@exemple.test`])).rows[0]!.id;
  await db.query("update public.private_links set discord_id = $2, openfront_hash = $3 where user_id = $1", [uid, String(100000000000000000n + BigInt(numero)), o.empreinte ?? null]);
  if (o.valide ?? true) await db.query("update public.profiles set status = 'validated' where user_id = $1", [uid]);
  if (o.gaulois ?? true) await db.query("insert into internal.gaulois (user_id, tenue) values ($1, '{}'::jsonb)", [uid]);
  return uid;
}

/** L'identifiant Discord donné à un membre d'essai. */
export const discordDe = async (db: PGlite, uid: string): Promise<string> => (await db.query<{ d: string }>("select discord_id as d from public.private_links where user_id = $1", [uid])).rows[0]!.d;
