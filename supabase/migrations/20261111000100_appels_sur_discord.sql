-- Les appels aux salons partent aussi sur Discord, à la demande du pilote (11 novembre 2026) : à chaque appel lancé
-- depuis le site, un message dans un salon du clan prévient les joueurs, en mentionnant un rôle (« @Rassemblement »).
--
-- Le serveur poste lui-même, par le webhook du salon choisi, avec l'extension pg_net de Supabase : la requête part une
-- fois l'appel enregistré, sans faire attendre la page, et un envoi raté n'empêche jamais l'appel. Le lien du webhook
-- permet d'écrire dans le salon : il se colle dans l'espace Direction (admins et fondateur), reste sur le serveur et n'en
-- ressort jamais, ni vers le navigateur, ni dans la sauvegarde (export_site ne change pas), ni dans le dépôt.
--
-- Le message mentionne le rôle réglé avec le lien, donne le pseudo de qui appelle, comme le pop-up du site, et le lien du
-- salon refait par le site sur openfront.io. Un appel retiré, ou remplacé par un autre salon du même membre, est effacé
-- du salon Discord ; un appel arrivé au bout de ses 15 minutes y reste, avec son heure de fin.
--
-- Cette migration ne fait qu'ajouter : l'extension pg_net, une table, une colonne et des fonctions. Les trois fonctions
-- des appels sont réécrites à l'identique, plus Discord. Aucune donnée n'est retirée. Rejouée, elle ne change rien.

create extension if not exists pg_net with schema extensions;

/* ---------- Le réglage ---------- */

-- Une seule ligne. Le lien est toujours rangé sous la forme https://discord.com/api/webhooks/<numéro>/<jeton> : le
-- serveur ne peut poster que chez Discord. Le rôle est facultatif : sans lui, le message ne mentionne personne.
-- `last_*` : le dernier envoi, appel ou essai. La réponse de Discord reste six heures dans net._http_response.
create table if not exists internal.discord_calls (
  id boolean primary key default true check (id),
  webhook_url text not null check (webhook_url ~ '^https://discord\.com/api/webhooks/[0-9]{17,20}/[A-Za-z0-9_-]{20,100}$'),
  role_id text check (role_id ~ '^[0-9]{17,20}$'),
  updated_by uuid references public.profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  last_kind text check (last_kind in ('call', 'test')),
  last_at timestamptz,
  last_request bigint,
  last_error text
);

-- Le message Discord de chaque appel : la demande de pg_net, dont la réponse donne le numéro du message à effacer.
alter table internal.lobby_calls add column if not exists discord_request bigint;

/* ---------- Les outils ---------- */

-- Le lien collé, ramené à sa forme rangée, ou null s'il ne mène pas à un webhook de Discord. Discord donne aussi des liens
-- en discordapp.com, ptb. ou canary., avec la version de l'API ; une suite (?wait=true…) n'est pas gardée.
create or replace function internal.discord_webhook_of(p_text text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select 'https://discord.com/api/webhooks/' || m[1] || '/' || m[2]
  from (select regexp_match(btrim(coalesce(p_text, '')), '^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/(?:v[0-9]{1,2}/)?webhooks/([0-9]{17,20})/([A-Za-z0-9_-]{20,100})/?(?:\?\S*)?$') as m) t
$$;

-- L'identifiant du rôle, tapé seul ou copié tel que Discord l'écrit (<@&…>). Null s'il est vide ou illisible.
create or replace function internal.discord_role_of(p_text text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select (regexp_match(btrim(coalesce(p_text, '')), '^(?:<@&)?([0-9]{17,20})>?$'))[1]
$$;

-- Un texte sans mise en forme pour Discord : chaque signe de mise en forme, de lien ou de mention est échappé, et un
-- retour à la ligne devient une espace. Les pseudos viennent de la liste officielle, mais rien ne doit les transformer.
create or replace function internal.discord_plain(p_text text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]+', ' ', 'g'), '([\\*_~`|>#:/<@\[\]()-])', '\\\1', 'g')
$$;

-- Le nom que montre le pop-up des appels (get_lobby_calls) : le pseudo d'aujourd'hui dans la liste officielle, retrouvé
-- par l'empreinte de son identifiant OpenFront, sinon le nom du compte.
create or replace function internal.lobby_caller_name(p_user uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select coalesce((
    select c.username from public.private_links l
    join public.clan_roster c on c.public_id_hash = l.openfront_hash
    where l.user_id = p_user and c.username is not null
    limit 1
  ), (select p.display_name from public.profiles p where p.user_id = p_user))
$$;

-- Poste un message dans le salon des appels, s'il est réglé, et note l'envoi. `p_ping` : le rôle réglé est notifié ;
-- sinon, sa mention s'affiche sans notifier personne. Aucun autre rôle, ni @everyone, ni personne : allowed_mentions ne
-- laisse passer que ce rôle. Rend la demande de pg_net, ou null : rien n'est réglé, ou l'envoi n'a pas pu partir.
-- Une erreur ici n'arrête jamais ce qui l'appelle : elle est notée pour l'espace Direction.
create or replace function internal.discord_post(p_kind text, p_content text, p_ping boolean) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_calls;
  v_request bigint;
begin
  select * into v_hook from internal.discord_calls where id;
  if not found then return null; end if;
  begin
    -- ?wait=true : Discord répond avec le message posté, dont le numéro sert à l'effacer.
    v_request := net.http_post(
      url := v_hook.webhook_url || '?wait=true',
      body := jsonb_build_object(
        'content', p_content,
        'allowed_mentions', case
          when p_ping and v_hook.role_id is not null then jsonb_build_object('parse', jsonb_build_array(), 'roles', jsonb_build_array(v_hook.role_id))
          else jsonb_build_object('parse', jsonb_build_array())
        end
      ),
      timeout_milliseconds := 5000
    );
    update internal.discord_calls set last_kind = p_kind, last_at = now(), last_request = v_request, last_error = null where id;
    return v_request;
  exception when others then
    update internal.discord_calls set last_kind = p_kind, last_at = now(), last_request = null, last_error = left(sqlerrm, 300) where id;
    return null;
  end;
end $$;

-- Le message d'un appel : « @Rassemblement **Pseudo** attend dans un salon : https://openfront.io/game/… », puis l'heure
-- de fin, que Discord écrit à l'heure de chacun (<t:…:t>) et en temps restant (<t:…:R>). Discord fait lui-même l'aperçu
-- du lien, comme pour un lien collé par un membre : le site ne lit rien chez OpenFront.
create or replace function internal.discord_post_call(p_user uuid, p_game text, p_expires timestamptz) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_role text;
  v_end text := extract(epoch from p_expires)::bigint::text;
begin
  select role_id into v_role from internal.discord_calls where id;
  if not found then return null; end if;
  return internal.discord_post(
    'call',
    coalesce('<@&' || v_role || '> ', '') || '**' || internal.discord_plain(internal.lobby_caller_name(p_user)) || '** attend dans un salon : https://openfront.io/game/' || p_game
      || chr(10) || 'Appel valable jusqu''à <t:' || v_end || ':t> (<t:' || v_end || ':R>).',
    true
  );
end $$;

-- L'essai : il montre dans le salon que le lien et le rôle sont les bons, sans notifier personne.
create or replace function internal.discord_post_test() returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_role text;
begin
  select role_id into v_role from internal.discord_calls where id;
  if not found then return null; end if;
  return internal.discord_post(
    'test',
    'Essai du site du clan : les appels lancés au QG arriveront dans ce salon, '
      || case when v_role is null then 'sans mention de rôle.' else 'avec la mention <@&' || v_role || '>. Personne n''est notifié pour cet essai.' end,
    false
  );
end $$;

-- Efface du salon le message d'un appel, d'après la réponse de Discord à son envoi. Sans réponse lisible (envoi refusé,
-- réponse pas encore arrivée, ou effacée par pg_net au bout de six heures), il n'y a rien à faire. Une erreur ici
-- n'arrête rien : l'appel, lui, est retiré quoi qu'il arrive.
create or replace function internal.discord_unpost(p_request bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
  v_message text;
begin
  if p_request is null then return; end if;
  select webhook_url into v_url from internal.discord_calls where id;
  if not found then return; end if;
  begin
    select r.content::jsonb ->> 'id' into v_message from net._http_response r where r.id = p_request and r.status_code between 200 and 299;
    if v_message ~ '^[0-9]{17,20}$' then
      perform net.http_delete(url := v_url || '/messages/' || v_message, timeout_milliseconds := 5000);
    end if;
  exception when others then
    null;
  end;
end $$;

/* ---------- Les appels, avec Discord ---------- */

-- Comme la version de 20261110000100_appels_sans_format.sql. En plus : un nouvel appel part sur Discord, et celui qu'il
-- remplace, encore en cours, en est effacé. Redonner le même salon n'envoie rien de plus. `discord` : un message est parti.
create or replace function public.save_lobby_call(p_game text, p_format text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_game text := btrim(coalesce(p_game, ''));
  v_format text := nullif(btrim(coalesce(p_format, '')), '');
  v_previous internal.lobby_calls;
  v_replaced bigint;
  v_expires timestamptz;
  v_request bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if v_game !~ '^[A-Za-z0-9]{8,10}$' then perform internal.fail('invalid_game'); end if;
    if v_format is not null and v_format not in ('duos', 'trios', 'quads', '2', '3', '4', '5', '6', '7', 'private') then perform internal.fail('invalid_format'); end if;
    -- Deux envois simultanés du même membre comptent l'un après l'autre : sinon, chacun passerait l'attente.
    perform pg_advisory_xact_lock(hashtext('gal_lobby_call'), hashtext(v_actor::text));
    delete from internal.lobby_calls where expires_at <= now();
    select * into v_previous from internal.lobby_calls where user_id = v_actor;
    if found and v_previous.game_id = v_game and v_previous.ended_at is null then
      update internal.lobby_calls set team_format = v_format where user_id = v_actor;
      return jsonb_build_object('ok', true, 'discord', false);
    end if;
    if found and v_previous.created_at > now() - interval '1 minute' then perform internal.fail('call_too_soon'); end if;
    -- L'appel remplacé, encore en cours : son message Discord est à effacer. Un appel retiré l'a déjà été.
    if found and v_previous.ended_at is null then v_replaced := v_previous.discord_request; end if;
    v_expires := now() + interval '15 minutes';
    insert into internal.lobby_calls (user_id, game_id, team_format, expires_at)
    values (v_actor, v_game, v_format, v_expires)
    on conflict (user_id) do update
      set game_id = excluded.game_id, team_format = excluded.team_format, created_at = now(), expires_at = excluded.expires_at, ended_at = null, discord_request = null;
    perform internal.discord_unpost(v_replaced);
    v_request := internal.discord_post_call(v_actor, v_game, v_expires);
    if v_request is not null then
      update internal.lobby_calls set discord_request = v_request where user_id = v_actor;
    end if;
    return jsonb_build_object('ok', true, 'discord', v_request is not null);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Comme la version de 20261109000300_appels_aux_salons.sql. En plus : l'appel retiré est effacé du salon Discord. Un appel
-- arrivé au bout de ses 15 minutes y reste, avec son heure de fin.
create or replace function public.end_lobby_call() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_request bigint;
  v_live boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    update internal.lobby_calls set ended_at = now() where user_id = v_actor and ended_at is null
    returning discord_request, expires_at > now() into v_request, v_live;
    if found and v_live then perform internal.discord_unpost(v_request); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Comme la version de 20261109000300_appels_aux_salons.sql. En plus : `discord`, vrai quand les appels partent aussi sur
-- Discord, pour que le formulaire du QG le dise avant l'appel ; et, pour chaque appel, `discord` vrai quand son message
-- est parti vers Discord (la réponse de Discord, elle, ne se lit que dans l'espace Direction).
create or replace function public.get_lobby_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  begin
    v_actor := internal.require_rank(1);
    delete from internal.lobby_calls where expires_at <= now();
    return jsonb_build_object('ok', true, 'now', now(), 'discord', exists (select 1 from internal.discord_calls), 'calls', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from (
        select k.id, k.game_id as game, k.team_format as format, k.created_at, k.expires_at,
          k.user_id = v_actor as mine,
          k.discord_request is not null as discord,
          coalesce((
            select c.username from public.private_links l
            join public.clan_roster c on c.public_id_hash = l.openfront_hash
            where l.user_id = k.user_id and c.username is not null
            limit 1
          ), p.display_name) as name,
          case when p.show_to_members then internal.discord_avatar(p.user_id) end as avatar
        from internal.lobby_calls k
        join public.profiles p on p.user_id = k.user_id and p.status = 'validated'
        where k.ended_at is null and k.expires_at > now()
        order by k.created_at desc
        limit 20
      ) t
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le réglage, depuis l'espace Direction ---------- */

-- Pour les admins et le fondateur : branché ou non, le rôle mentionné, la date du réglage et son auteur, et le dernier
-- envoi avec la réponse de Discord tant que pg_net la garde. Jamais le lien : il permet d'écrire dans le salon. Le détail
-- d'une erreur ne contient jamais son jeton. `now` : l'heure du serveur, pour savoir si une réponse se fait attendre.
create or replace function public.get_discord_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_calls;
  v_answered boolean := false;
  v_status integer;
  v_timed_out boolean;
  v_error text;
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    select * into v_hook from internal.discord_calls where id;
    if not found then return jsonb_build_object('ok', true, 'now', now(), 'set', false); end if;
    if v_hook.last_request is not null then
      begin
        select r.status_code, r.timed_out, r.error_msg into v_status, v_timed_out, v_error from net._http_response r where r.id = v_hook.last_request;
        v_answered := found;
      exception when others then
        v_answered := false;
      end;
    end if;
    v_error := left(replace(coalesce(v_hook.last_error, v_error), split_part(v_hook.webhook_url, '/', 7), '…'), 200);
    return jsonb_build_object(
      'ok', true,
      'now', now(),
      'set', true,
      'role', v_hook.role_id,
      'updated_at', v_hook.updated_at,
      'updated_by', (select p.display_name from public.profiles p where p.user_id = v_hook.updated_by),
      'last', case when v_hook.last_at is null then null else jsonb_build_object(
        'kind', v_hook.last_kind,
        'at', v_hook.last_at,
        'failed', v_hook.last_error is not null,
        'answered', v_answered,
        'status', v_status,
        'timed_out', coalesce(v_timed_out, false),
        'error', v_error
      ) end
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Règle le salon des appels : le lien du webhook et, facultatif, le rôle à mentionner. Un lien laissé vide garde celui
-- qui est réglé, pour changer le rôle sans recoller le lien. Un essai part aussitôt, sans notifier personne.
create or replace function public.save_discord_calls(p_webhook text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text;
  v_role text := internal.discord_role_of(p_role);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if btrim(coalesce(p_role, '')) <> '' and v_role is null then perform internal.fail('invalid_role'); end if;
    if btrim(coalesce(p_webhook, '')) = '' then
      select webhook_url into v_url from internal.discord_calls where id;
    else
      v_url := internal.discord_webhook_of(p_webhook);
    end if;
    if v_url is null then perform internal.fail('invalid_webhook'); end if;
    insert into internal.discord_calls (id, webhook_url, role_id, updated_by, updated_at)
    values (true, v_url, v_role, v_actor, now())
    on conflict (id) do update
      set webhook_url = excluded.webhook_url, role_id = excluded.role_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        last_kind = null, last_at = null, last_request = null, last_error = null;
    perform internal.log_admin(v_actor, 'discord_calls_saved', null, jsonb_build_object('mention', v_role is not null));
    perform internal.discord_post_test();
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Renvoie l'essai, quinze secondes au moins après le précédent.
create or replace function public.test_discord_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_calls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    perform internal.require_rank(3);
    select * into v_hook from internal.discord_calls where id for update;
    if not found then perform internal.fail('discord_not_set'); end if;
    if v_hook.last_kind = 'test' and v_hook.last_at > now() - interval '15 seconds' then perform internal.fail('test_too_soon'); end if;
    perform internal.discord_post_test();
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Arrête l'envoi : le réglage est effacé, lien compris. Les messages déjà postés restent dans le salon.
create or replace function public.clear_discord_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    delete from internal.discord_calls where id;
    if found then perform internal.log_admin(v_actor, 'discord_calls_cleared', null, '{}'); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

-- Une table privée, comme les appels : seules les fonctions ci-dessus la lisent.
alter table internal.discord_calls enable row level security;
revoke all on internal.discord_calls from public, anon, authenticated;

-- Les outils ne s'appellent que depuis les fonctions du site.
revoke all on function internal.discord_webhook_of(text) from public, anon, authenticated;
revoke all on function internal.discord_role_of(text) from public, anon, authenticated;
revoke all on function internal.discord_plain(text) from public, anon, authenticated;
revoke all on function internal.lobby_caller_name(uuid) from public, anon, authenticated;
revoke all on function internal.discord_post(text, text, boolean) from public, anon, authenticated;
revoke all on function internal.discord_post_call(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function internal.discord_post_test() from public, anon, authenticated;
revoke all on function internal.discord_unpost(bigint) from public, anon, authenticated;

-- Tout compte connecté : chaque fonction vérifie elle-même le rang (membre validé pour les appels, admin pour le réglage).
revoke all on function public.save_lobby_call(text, text) from public, anon, authenticated;
revoke all on function public.end_lobby_call() from public, anon, authenticated;
revoke all on function public.get_lobby_calls() from public, anon, authenticated;
revoke all on function public.get_discord_calls() from public, anon, authenticated;
revoke all on function public.save_discord_calls(text, text) from public, anon, authenticated;
revoke all on function public.test_discord_calls() from public, anon, authenticated;
revoke all on function public.clear_discord_calls() from public, anon, authenticated;
grant execute on function public.save_lobby_call(text, text) to authenticated;
grant execute on function public.end_lobby_call() to authenticated;
grant execute on function public.get_lobby_calls() to authenticated;
grant execute on function public.get_discord_calls() to authenticated;
grant execute on function public.save_discord_calls(text, text) to authenticated;
grant execute on function public.test_discord_calls() to authenticated;
grant execute on function public.clear_discord_calls() to authenticated;
