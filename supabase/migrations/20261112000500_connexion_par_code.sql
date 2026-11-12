-- Se connecter sans lier son compte Discord, demandé par le pilote le 12 novembre 2026, pour les joueurs qui refusent la
-- page « Autoriser » de Discord : dans le serveur Discord du clan, le joueur tape /code ; le robot lui montre un code, à
-- lui seul ; il le tape sur le site, qui ouvre sa session. Le reste ne change pas : la demande, la liste officielle, la
-- confirmation d'un officier.
--
-- La fonction serveur code-discord (supabase/functions/code-discord/index.ts) vérifie la signature que Discord met sur
-- chaque commande, puis appelle les fonctions ci-dessous avec la clé de service : ni un visiteur ni un membre ne peut les
-- appeler. L'identifiant Discord vient donc de Discord, comme celui d'auth.identities pour la connexion par Discord, jamais
-- de ce qu'écrit le navigateur.
--
-- Un compte ouvert avec un code est créé par la fonction, avec une adresse e-mail inventée et imprévisible, et l'identifiant
-- Discord écrit dans ses métadonnées d'application, que seule la clé de service écrit. Il ne reçoit son identifiant Discord
-- que s'il porte ces deux marques : jamais un compte qu'un joueur aurait ouvert ou modifié lui-même.
--
-- Cette migration ne fait qu'ajouter : deux tables privées, quatre fonctions, un index, une tâche planifiée (pg_cron,
-- activée ici) qui efface les vieilles lignes, et deux fonctions remplacées par une version qui écarte un identifiant
-- Discord déjà pris par un autre compte. Aucune donnée n'est retirée. Rejouée, elle ne change rien. La sauvegarde
-- (export_site) ne change pas : un code ne vaut que cinq minutes.

/* ---------- Les codes ---------- */

-- Un code par commande /code : son empreinte (SHA-256, jamais le code lui-même), le compte Discord qui l'a demandé, et sa
-- fin, cinq minutes après. Un code ne sert qu'une fois. Les lignes s'effacent un jour après leur création.
create table if not exists internal.discord_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  discord_name text not null check (char_length(discord_name) between 1 and 64),
  -- Le numéro de la commande, que Discord signe : la même commande rejouée ne donne pas un second code.
  interaction_id text not null unique check (interaction_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists discord_codes_by_discord on internal.discord_codes (discord_id, created_at);

-- Les codes refusés, avec leur seule heure : ni code, ni adresse IP. Au-delà de 30 en une minute, pour tout le site, le
-- serveur n'en essaie plus aucun jusqu'à la minute suivante : deviner un code de 8 signes devient sans espoir. Le revers :
-- quelqu'un qui en envoie 30 par minute bloque la connexion par code pour tous, le temps qu'il insiste.
create table if not exists internal.discord_code_failures (
  failed_at timestamptz not null default now()
);
create index if not exists discord_code_failures_at on internal.discord_code_failures (failed_at);

-- pg_cron, l'extension de Supabase pour les tâches planifiées, gratuite, activée comme le dit sa documentation. La tâche
-- elle-même est planifiée à la fin de cette migration.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Efface les codes de plus d'un jour et les refus de plus de dix minutes. Appelée à chaque code demandé ou tapé, et toutes
-- les dix minutes par pg_cron (plus bas) : rien ne dure plus longtemps, même sans activité. pg_cron garde une ligne par
-- passage de chaque tâche : celles de cette tâche s'effacent aussi après un jour.
create or replace function internal.discord_code_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from internal.discord_codes where created_at < now() - interval '1 day';
  delete from internal.discord_code_failures where failed_at < now() - interval '10 minutes';
  delete from cron.job_run_details
  where jobid in (select jobid from cron.job where jobname = 'gal-codes-discord') and end_time < now() - interval '1 day';
$$;

/* ---------- Un compte Discord, un seul compte sur le site ---------- */

-- Déjà vrai avec la seule connexion par Discord (une identité Discord, un compte) ; avec les codes, la base le garde.
create unique index if not exists private_links_discord_id_unique on public.private_links (discord_id) where discord_id is not null;

-- À chaque connexion par Discord, le compte relit son identité. Si ce Discord a déjà son compte, ouvert avec un code, le
-- second compte ne le prend pas : il reste sans Discord, et sa demande le dit (discord_taken, plus bas).
create or replace function internal.sync_discord_identity(p_user uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.private_links l
  set discord_id = i.provider_id,
      discord_name = coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name', l.discord_name)
  from auth.identities i
  where l.user_id = p_user and i.user_id = p_user and i.provider = 'discord'
    and not exists (select 1 from public.private_links o where o.discord_id = i.provider_id and o.user_id <> p_user)
$$;

-- Un officier reconnaît la personne sur Discord : un compte sans Discord n'a rien à lui montrer.
create or replace function internal.require_discord_on_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.private_links where user_id = new.user_id and discord_id is not null) then
    -- Connecté avec Discord, alors que ce Discord a déjà son compte, ouvert avec un code : c'est celui-là qui demande.
    if exists (
      select 1
      from auth.identities i
      join public.private_links o on o.discord_id = i.provider_id
      where i.user_id = new.user_id and i.provider = 'discord' and o.user_id <> new.user_id
    ) then
      perform internal.fail('discord_taken');
    end if;
    perform internal.fail('discord_required');
  end if;
  return new;
end $$;

/* ---------- Pour la fonction code-discord, avec la clé de service ---------- */

-- La commande /code, signée par Discord : garde l'empreinte du nouveau code pour cinq minutes. Un nouveau code remplace
-- le précédent du même joueur. Cinq codes au plus en dix minutes par joueur.
create or replace function public.discord_code_issue(p_code_hash text, p_discord_id text, p_discord_name text, p_interaction_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expires timestamptz := now() + interval '5 minutes';
begin
  if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_discord_id, '') !~ '^[0-9]{17,20}$'
     or coalesce(p_interaction_id, '') !~ '^[0-9]{17,20}$' or char_length(coalesce(btrim(p_discord_name), '')) not between 1 and 64 then
    return internal.error_json('invalid_request', '');
  end if;
  perform internal.discord_code_purge();
  if exists (select 1 from internal.discord_codes where interaction_id = p_interaction_id) then
    return internal.error_json('code_replayed', '');
  end if;
  if (select count(*) from internal.discord_codes where discord_id = p_discord_id and created_at > now() - interval '10 minutes') >= 5 then
    return internal.error_json('too_many_codes', '');
  end if;
  update internal.discord_codes set expires_at = now()
  where discord_id = p_discord_id and used_at is null and expires_at > now();
  insert into internal.discord_codes (code_hash, discord_id, discord_name, interaction_id, expires_at)
  values (p_code_hash, p_discord_id, btrim(p_discord_name), p_interaction_id, v_expires);
  return jsonb_build_object('ok', true, 'expires_at', v_expires);
exception when unique_violation then
  return internal.error_json('code_replayed', '');
end $$;

-- Le code tapé sur le site : s'il est bon, il ne servira plus. Rend le compte Discord qui l'a demandé et, s'il en a un, son
-- compte sur le site, ouvert avec Discord ou avec un code, retrouvé par son seul identifiant Discord, avec l'adresse e-mail
-- qui sert à ouvrir la session. Sans compte, la fonction code-discord le crée, puis appelle discord_code_attach.
create or replace function public.discord_code_redeem(p_code_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code internal.discord_codes;
  v_user uuid;
  v_email text;
begin
  if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then return internal.error_json('invalid_request', ''); end if;
  perform internal.discord_code_purge();
  if (select count(*) from internal.discord_code_failures where failed_at > now() - interval '1 minute') >= 30 then
    return internal.error_json('code_busy', '');
  end if;
  update internal.discord_codes set used_at = now()
  where code_hash = p_code_hash and used_at is null and expires_at > now()
  returning * into v_code;
  if not found then
    insert into internal.discord_code_failures default values;
    return internal.error_json('code_invalid', '');
  end if;
  select l.user_id, u.email into v_user, v_email
  from public.private_links l
  join auth.users u on u.id = l.user_id
  where l.discord_id = v_code.discord_id;
  -- Un compte ouvert avec un code suit le nom d'utilisateur Discord du jour. Un compte ouvert avec Discord garde celui que
  -- Supabase relit à chaque connexion.
  if v_user is not null and not exists (select 1 from auth.identities i where i.user_id = v_user and i.provider = 'discord') then
    update public.private_links set discord_name = v_code.discord_name
    where user_id = v_user and discord_id = v_code.discord_id;
  end if;
  return jsonb_build_object('ok', true, 'discord_id', v_code.discord_id, 'discord_name', v_code.discord_name, 'user_id', v_user, 'email', v_email);
end $$;

-- Le compte tout juste créé par code-discord reçoit son identifiant Discord. Seul un compte qui porte les marques de cette
-- création reçoit cet identifiant : ses métadonnées d'application (« connexion » et « discord_id »), que seule la clé de
-- service écrit, et aucune autre identité que l'e-mail. Jamais un compte ouvert avec Discord, ni un compte qu'un joueur
-- aurait ouvert ou modifié lui-même. Si ce Discord a déjà un compte (deux codes en même temps), la fonction le rend :
-- code-discord efface alors celui qu'elle vient de créer.
create or replace function public.discord_code_attach(p_user uuid, p_discord_id text, p_discord_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_other uuid;
  v_email text;
begin
  if p_user is null or coalesce(p_discord_id, '') !~ '^[0-9]{17,20}$' or char_length(coalesce(btrim(p_discord_name), '')) not between 1 and 64 then
    return internal.error_json('invalid_request', '');
  end if;
  perform pg_advisory_xact_lock(hashtext('discord_code:' || p_discord_id));
  select l.user_id, u.email into v_other, v_email
  from public.private_links l
  join auth.users u on u.id = l.user_id
  where l.discord_id = p_discord_id and l.user_id <> p_user;
  if v_other is not null then
    return jsonb_build_object('ok', false, 'error', 'discord_taken', 'user_id', v_other, 'email', v_email);
  end if;
  update public.private_links set discord_id = p_discord_id, discord_name = btrim(p_discord_name)
  where user_id = p_user and (discord_id is null or discord_id = p_discord_id)
    and exists (
      select 1 from auth.users u
      where u.id = p_user
        and u.raw_app_meta_data ->> 'connexion' = 'code-discord'
        and u.raw_app_meta_data ->> 'discord_id' = p_discord_id
    )
    and not exists (select 1 from auth.identities i where i.user_id = p_user and i.provider <> 'email');
  if not found then return internal.error_json('invalid_request', ''); end if;
  return jsonb_build_object('ok', true);
end $$;

/* ---------- Droits ---------- */

alter table internal.discord_codes enable row level security;
alter table internal.discord_code_failures enable row level security;
revoke all on internal.discord_codes, internal.discord_code_failures from public, anon, authenticated;

revoke all on function internal.discord_code_purge() from public, anon, authenticated;
revoke all on function internal.sync_discord_identity(uuid) from public, anon, authenticated;
revoke all on function internal.require_discord_on_request() from public, anon, authenticated;
revoke all on function public.discord_code_issue(text, text, text, text) from public, anon, authenticated;
revoke all on function public.discord_code_redeem(text) from public, anon, authenticated;
revoke all on function public.discord_code_attach(uuid, text, text) from public, anon, authenticated;

-- La clé de service seule : c'est elle qu'utilise la fonction code-discord.
grant execute on function public.discord_code_issue(text, text, text, text) to service_role;
grant execute on function public.discord_code_redeem(text) to service_role;
grant execute on function public.discord_code_attach(uuid, text, text) to service_role;

/* ---------- L'effacement, même sans activité ---------- */

-- La tâche porte un nom : la planifier de nouveau la remplace.
select cron.schedule('gal-codes-discord', '*/10 * * * *', 'select internal.discord_code_purge()');
