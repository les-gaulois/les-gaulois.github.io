-- Le ping des appels sur Discord devient un choix de chaque appel, avec un anti-spam, à la demande du pilote
-- (11 novembre 2026 : « ajoute un anti-spam », puis « un bouton ping, en option »).
--  - Au QG, une case « Ping du rôle sur Discord », décochée au départ. Sans elle, l'appel part dans le salon sans
--    mention ; avec elle, le message mentionne le rôle réglé (« @Rassemblement »), dont les membres peuvent être notifiés.
--  - Un bouton « Ping sur Discord » sur l'appel en cours qui n'en a pas eu (ping_lobby_call) : il n'agit que sur cet
--    appel, jamais sur un appel retiré ou fini.
--  - Anti-spam : un ping au plus toutes les 10 minutes pour un même membre, et toutes les 2 minutes pour tout le clan.
--    Un ping refusé laisse partir l'appel sans mention, et le site dit pourquoi.
-- Les pages ouvertes avant cette version appellent save_lobby_call avec deux paramètres : le troisième, p_ping, vaut faux
-- par défaut, et leurs appels partent sans ping.
--
-- Cette migration ajoute une table, deux colonnes et des fonctions, réécrit get_lobby_calls et l'essai, et remplace
-- save_lobby_call et internal.discord_post_call par des versions à un paramètre de plus : l'ancienne signature de chacune
-- est retirée, sinon l'API ne saurait laquelle appeler. Aucune donnée n'est retirée. Rejouée, elle ne change rien : le
-- rattrapage des appels en cours ne se fait qu'une fois, avec l'ajout des colonnes.

/* ---------- Ce que l'anti-spam retient ---------- */

-- Pour chaque membre, l'heure de son dernier ping. Une table à part : la ligne d'un appel s'efface 15 minutes après
-- l'appel, alors qu'un ping peut partir jusqu'à sa dernière minute. Une ligne par membre qui a déjà fait un ping, effacée
-- avec son compte. Elle n'est pas sauvegardée (export_site ne change pas) : elle ne sert que dix minutes.
create table if not exists internal.discord_member_pings (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  pinged_at timestamptz not null
);

-- Pour le clan, l'heure du dernier ping ; pour chaque appel, s'il a pingé. Avant cette migration, chaque appel parti
-- sur Discord mentionnait le rôle, s'il était réglé : les appels encore en cours sont alors comptés comme des pings. Ce bloc ne s'exécute qu'avec
-- l'ajout des colonnes : rejoué, il ne fait rien, et un appel lancé entre-temps sans ping ne devient pas un ping.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'lobby_calls' and column_name = 'discord_ping') then
    alter table internal.lobby_calls add column discord_ping boolean not null default false;
    alter table internal.discord_calls add column if not exists last_ping_at timestamptz;
    update internal.lobby_calls set discord_ping = true
      where discord_request is not null and expires_at > now() and exists (select 1 from internal.discord_calls where role_id is not null);
    insert into internal.discord_member_pings (user_id, pinged_at)
      select k.user_id, k.created_at from internal.lobby_calls k where k.discord_ping
      on conflict (user_id) do update set pinged_at = greatest(internal.discord_member_pings.pinged_at, excluded.pinged_at);
    update internal.discord_calls set last_ping_at = (select max(k.created_at) from internal.lobby_calls k where k.discord_ping) where id;
  end if;
end $$;

/* ---------- Le ping ---------- */

-- Où en est le ping pour ce membre : 'ok' s'il peut partir, 'member' si ce membre a fait un ping depuis moins de
-- 10 minutes, 'clan' si un ping est parti depuis moins de 2 minutes, 'none' sans salon branché ou sans rôle réglé.
-- Verrouille la ligne du réglage jusqu'à la fin de la transaction : deux pings simultanés passent l'un après l'autre,
-- et le second voit le premier.
create or replace function internal.discord_ping_state(p_user uuid) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_calls;
  v_mine timestamptz;
begin
  select * into v_hook from internal.discord_calls where id for update;
  if not found or v_hook.role_id is null then return 'none'; end if;
  select m.pinged_at into v_mine from internal.discord_member_pings m where m.user_id = p_user;
  if v_mine > now() - interval '10 minutes' then return 'member'; end if;
  if v_hook.last_ping_at > now() - interval '2 minutes' then return 'clan'; end if;
  return 'ok';
end $$;

-- Comme la version de 20261111000100_appels_sur_discord.sql, avec `p_ping` : la mention ne part que si on la demande,
-- l'anti-spam ayant été vérifié avant (internal.discord_ping_state). Un ping parti est noté, pour l'appel, le membre et
-- le clan. Le message ne dit jamais que le rôle a été notifié : Discord en décide.
drop function if exists internal.discord_post_call(uuid, text, timestamptz);
create or replace function internal.discord_post_call(p_user uuid, p_game text, p_expires timestamptz, p_ping boolean) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_role text;
  v_ping boolean;
  v_end text := extract(epoch from p_expires)::bigint::text;
  v_request bigint;
begin
  select role_id into v_role from internal.discord_calls where id;
  if not found then return null; end if;
  v_ping := coalesce(p_ping, false) and v_role is not null;
  v_request := internal.discord_post(
    'call',
    case when v_ping then '<@&' || v_role || '> ' else '' end || '**' || internal.discord_plain(internal.lobby_caller_name(p_user)) || '** attend dans un salon : https://openfront.io/game/' || p_game
      || chr(10) || 'Appel valable jusqu''à <t:' || v_end || ':t> (<t:' || v_end || ':R>).',
    v_ping
  );
  if v_request is not null and v_ping then
    update internal.lobby_calls set discord_ping = true where user_id = p_user;
    insert into internal.discord_member_pings (user_id, pinged_at) values (p_user, now())
      on conflict (user_id) do update set pinged_at = excluded.pinged_at;
    update internal.discord_calls set last_ping_at = now() where id;
  end if;
  return v_request;
end $$;

-- Le ping d'un appel en cours, qui n'en a pas eu : son message est refait avec la mention, si l'anti-spam le permet, et
-- l'ancien message est effacé une fois le nouveau parti. Rend 'sent', 'failed' si le message n'a pas pu partir, la
-- raison d'un refus ('member', 'clan', 'none'), ou null si l'appel a déjà pingé. Sous le verrou du membre.
create or replace function internal.lobby_call_ping(p_call internal.lobby_calls) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_state text;
  v_request bigint;
begin
  if p_call.discord_ping then return null; end if;
  v_state := internal.discord_ping_state(p_call.user_id);
  if v_state <> 'ok' then return v_state; end if;
  v_request := internal.discord_post_call(p_call.user_id, p_call.game_id, p_call.expires_at, true);
  if v_request is null then return 'failed'; end if;
  perform internal.discord_unpost(p_call.discord_request);
  update internal.lobby_calls set discord_request = v_request where user_id = p_call.user_id;
  return 'sent';
end $$;

-- Comme la version de 20261111000100_appels_sur_discord.sql, avec le ping au choix : l'essai dit qu'un appel ne
-- mentionne le rôle que s'il demande un ping.
create or replace function internal.discord_post_test() returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_role text;
begin
  select role_id into v_role from internal.discord_calls where id;
  if not found then return null; end if;
  return internal.discord_post(
    'test',
    'Essai du site du clan : les appels lancés au QG arriveront dans ce salon'
      || case when v_role is null then ', sans ping : aucun rôle n''est réglé.' else '. Ceux qui demandent un ping mentionneront <@&' || v_role || '>. Personne n''est notifié pour cet essai.' end,
    false
  );
end $$;

/* ---------- Les appels ---------- */

-- Comme la version de 20261111000100_appels_sur_discord.sql, avec `p_ping`, le choix du ping (faux par défaut, pour les
-- pages d'avant). `ping` dans la réponse : null s'il n'était pas demandé, 'sent' s'il est parti, 'failed' si le message
-- n'a pas pu partir, sinon la raison du refus ('member', 'clan' ou 'none'), que la page dit au membre.
-- Le même salon redonné ne renvoie rien, sauf un ping demandé après coup et permis, ou son message s'il n'est jamais
-- parti (salon branché depuis l'appel).
drop function if exists public.save_lobby_call(text, text);
create or replace function public.save_lobby_call(p_game text, p_format text, p_ping boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_game text := btrim(coalesce(p_game, ''));
  v_format text := nullif(btrim(coalesce(p_format, '')), '');
  v_previous internal.lobby_calls;
  v_replaced bigint;
  v_expires timestamptz;
  v_request bigint;
  v_ping text;
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
      if coalesce(p_ping, false) then v_ping := internal.lobby_call_ping(v_previous); end if;
      if v_ping is distinct from 'sent' and v_previous.discord_request is null and exists (select 1 from internal.discord_calls) then
        v_request := internal.discord_post_call(v_actor, v_game, v_previous.expires_at, false);
        if v_request is not null then
          update internal.lobby_calls set discord_request = v_request where user_id = v_actor;
        end if;
      end if;
      return jsonb_build_object('ok', true, 'discord', v_request is not null or v_ping is not distinct from 'sent', 'ping', v_ping);
    end if;
    if found and v_previous.created_at > now() - interval '1 minute' then perform internal.fail('call_too_soon'); end if;
    -- L'appel remplacé, encore en cours : son message Discord est à effacer. Un appel retiré l'a déjà été.
    if found and v_previous.ended_at is null then v_replaced := v_previous.discord_request; end if;
    v_expires := now() + interval '15 minutes';
    insert into internal.lobby_calls (user_id, game_id, team_format, expires_at)
    values (v_actor, v_game, v_format, v_expires)
    on conflict (user_id) do update
      set game_id = excluded.game_id, team_format = excluded.team_format, created_at = now(), expires_at = excluded.expires_at, ended_at = null,
        discord_request = null, discord_ping = false;
    perform internal.discord_unpost(v_replaced);
    if exists (select 1 from internal.discord_calls) then
      if coalesce(p_ping, false) then v_ping := internal.discord_ping_state(v_actor); end if;
      v_request := internal.discord_post_call(v_actor, v_game, v_expires, v_ping is not distinct from 'ok');
      if v_request is not null then
        update internal.lobby_calls set discord_request = v_request where user_id = v_actor;
      end if;
      if v_ping = 'ok' then v_ping := case when v_request is null then 'failed' else 'sent' end; end if;
    elsif coalesce(p_ping, false) then
      v_ping := 'none';
    end if;
    return jsonb_build_object('ok', true, 'discord', v_request is not null, 'ping', v_ping);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Le bouton « Ping sur Discord » du QG : un ping pour l'appel en cours du membre, et lui seul. Un appel retiré ou fini
-- ne repart pas : `no_live_call`. `ping` dans la réponse : comme pour save_lobby_call.
create or replace function public.ping_lobby_call() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_call internal.lobby_calls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    perform pg_advisory_xact_lock(hashtext('gal_lobby_call'), hashtext(v_actor::text));
    select * into v_call from internal.lobby_calls where user_id = v_actor and ended_at is null and expires_at > now();
    if not found then perform internal.fail('no_live_call'); end if;
    return jsonb_build_object('ok', true, 'ping', internal.lobby_call_ping(v_call));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Comme la version de 20261111000100_appels_sur_discord.sql. En plus : `ping_possible`, vrai quand un rôle est réglé,
-- pour que le QG ne propose le ping que s'il peut partir ; et, pour chaque appel, `ping`, vrai quand son message est
-- parti avec la mention du rôle.
create or replace function public.get_lobby_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  begin
    v_actor := internal.require_rank(1);
    delete from internal.lobby_calls where expires_at <= now();
    return jsonb_build_object('ok', true, 'now', now(),
      'discord', exists (select 1 from internal.discord_calls),
      'ping_possible', exists (select 1 from internal.discord_calls where role_id is not null),
      'calls', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from (
        select k.id, k.game_id as game, k.team_format as format, k.created_at, k.expires_at,
          k.user_id = v_actor as mine,
          k.discord_request is not null as discord,
          k.discord_request is not null and k.discord_ping as ping,
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

/* ---------- Règles d'accès ---------- */

-- Une table privée, comme les appels : seules les fonctions ci-dessus la lisent.
alter table internal.discord_member_pings enable row level security;
revoke all on internal.discord_member_pings from public, anon, authenticated;

-- Les outils fermés à tous ; les fonctions du site ouvertes aux seuls comptes connectés, chacune vérifiant elle-même que
-- le compte est validé.
revoke all on function internal.discord_ping_state(uuid) from public, anon, authenticated;
revoke all on function internal.discord_post_call(uuid, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function internal.lobby_call_ping(internal.lobby_calls) from public, anon, authenticated;
revoke all on function internal.discord_post_test() from public, anon, authenticated;
revoke all on function public.save_lobby_call(text, text, boolean) from public, anon, authenticated;
revoke all on function public.ping_lobby_call() from public, anon, authenticated;
revoke all on function public.get_lobby_calls() from public, anon, authenticated;
grant execute on function public.save_lobby_call(text, text, boolean) to authenticated;
grant execute on function public.ping_lobby_call() to authenticated;
grant execute on function public.get_lobby_calls() to authenticated;

-- L'API relit les fonctions aussitôt : la nouvelle signature de save_lobby_call répond tout de suite.
notify pgrst, 'reload schema';
