-- Les salons Discord du robot se règlent dans l'espace Direction, comme celui des appels, à la demande du pilote
-- (11 novembre 2026 : « tu peux me mettre ça sur direction>discord que tous les salons soient configurables »).
--  - Le salon des nouvelles reçoit ce que poste le robot de la GitHub Action : la gazette, les alertes de place et de
--    record, les paliers franchis, les messages du jour et la course du soir. Son lien était le secret GitHub
--    DISCORD_WEBHOOK_GAZETTE.
--  - Le salon de l'encadrement reçoit les demandes qui attendent et le compte rendu de chaque sauvegarde. Son lien était
--    le secret GitHub DISCORD_WEBHOOK_ENCADREMENT.
-- Le lien se colle dans l'espace Direction (admins et fondateur). Il reste sur le serveur : la page ne le relit jamais, la
-- sauvegarde ne le contient pas (export_site ne change pas), et seul le robot le reçoit, par robot_discord_salons, que
-- seule la clé de service appelle. Sans lien réglé ici, le robot garde le secret GitHub. Le salon des appels garde son
-- propre réglage (internal.discord_calls), qui ne change pas.
-- À chaque passage, le robot demande à Discord si le webhook de chaque salon existe, sans rien poster, et note la réponse
-- (note_discord_salon) : l'espace Direction montre ainsi un webhook supprimé, comme celui des nouvelles le 11 novembre 2026.
--
-- Cette migration ne fait qu'ajouter : deux tables et des fonctions. Aucune donnée n'est retirée. Rejouée, elle ne change rien.

/* ---------- Les réglages ---------- */

-- Une ligne par salon réglé. Même forme de lien que pour les appels : le serveur ne peut poster que chez Discord.
-- `last_*` : le dernier essai, dont la réponse reste six heures dans net._http_response.
create table if not exists internal.discord_salons (
  salon text primary key check (salon in ('nouvelles', 'encadrement')),
  webhook_url text not null check (webhook_url ~ '^https://discord\.com/api/webhooks/[0-9]{17,20}/[A-Za-z0-9_-]{20,100}$'),
  updated_by uuid references public.profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  last_at timestamptz,
  last_request bigint,
  last_error text
);

-- Le dernier contrôle du robot pour chaque salon : quand, d'où venait le lien (réglé ici, secret GitHub, ou aucun), ce
-- que Discord a répondu (0 : pas de réponse) et le nom du webhook s'il existe. Jamais le lien. Effacé quand le réglage
-- change : il ne parlerait plus du même lien.
create table if not exists internal.discord_salon_checks (
  salon text primary key check (salon in ('nouvelles', 'encadrement')),
  checked_at timestamptz not null,
  source text not null check (source in ('direction', 'secret', 'none')),
  status integer check (status between 0 and 599),
  webhook_name text check (char_length(webhook_name) <= 80)
);

/* ---------- L'essai ---------- */

-- Poste l'essai d'un salon réglé et le note. Ne mentionne personne. Une erreur ici n'arrête jamais ce qui l'appelle :
-- elle est notée pour l'espace Direction, sans le jeton du lien.
create or replace function internal.discord_salon_test(p_salon text) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
  v_request bigint;
begin
  select webhook_url into v_url from internal.discord_salons where salon = p_salon;
  if not found then return null; end if;
  begin
    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'content', case p_salon
          when 'nouvelles' then 'Essai du site du clan : la gazette, les alertes, les paliers, les messages du jour et la course du soir arriveront dans ce salon.'
          else 'Essai du site du clan : les demandes qui attendent et le compte rendu des sauvegardes arriveront dans ce salon.'
        end,
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
      ),
      timeout_milliseconds := 5000
    );
    update internal.discord_salons set last_at = now(), last_request = v_request, last_error = null where salon = p_salon;
    return v_request;
  exception when others then
    update internal.discord_salons set last_at = now(), last_request = null, last_error = left(sqlerrm, 300) where salon = p_salon;
    return null;
  end;
end $$;

/* ---------- Le réglage, depuis l'espace Direction ---------- */

-- Pour les admins et le fondateur : pour chaque salon, réglé ou non, la date du réglage et son auteur, le dernier essai
-- avec la réponse de Discord tant que pg_net la garde, et le dernier contrôle du robot. Jamais le lien : il permet
-- d'écrire dans le salon. Le détail d'une erreur ne contient jamais son jeton. `now` : l'heure du serveur.
create or replace function public.get_discord_salons() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_salon text;
  v_hook internal.discord_salons;
  v_check internal.discord_salon_checks;
  v_answered boolean;
  v_status integer;
  v_timed_out boolean;
  v_error text;
  v_rows jsonb := '[]';
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    foreach v_salon in array array['nouvelles', 'encadrement'] loop
      v_answered := false;
      v_status := null;
      v_timed_out := null;
      v_error := null;
      select * into v_hook from internal.discord_salons where salon = v_salon;
      if not found then v_hook := null; end if;
      select * into v_check from internal.discord_salon_checks where salon = v_salon;
      if not found then v_check := null; end if;
      if v_hook.last_request is not null then
        begin
          select r.status_code, r.timed_out, r.error_msg into v_status, v_timed_out, v_error from net._http_response r where r.id = v_hook.last_request;
          v_answered := found;
        exception when others then
          v_answered := false;
        end;
      end if;
      if v_hook.salon is not null then
        v_error := left(replace(coalesce(v_hook.last_error, v_error), split_part(v_hook.webhook_url, '/', 7), '…'), 200);
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'salon', v_salon,
        'set', v_hook.salon is not null,
        'updated_at', v_hook.updated_at,
        'updated_by', (select p.display_name from public.profiles p where p.user_id = v_hook.updated_by),
        'last', case when v_hook.last_at is null then null else jsonb_build_object(
          'kind', 'test',
          'at', v_hook.last_at,
          'failed', v_hook.last_error is not null,
          'answered', v_answered,
          'status', v_status,
          'timed_out', coalesce(v_timed_out, false),
          'error', v_error
        ) end,
        'check', case when v_check.salon is null then null else jsonb_build_object(
          'at', v_check.checked_at,
          'source', v_check.source,
          'status', v_check.status,
          'name', v_check.webhook_name
        ) end
      ));
    end loop;
    return jsonb_build_object('ok', true, 'now', now(), 'salons', v_rows);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Règle un salon du robot : le lien de son webhook. Un essai part aussitôt, sans mentionner personne. Le contrôle du
-- robot noté pour l'ancien lien est effacé : le passage suivant contrôle le nouveau.
create or replace function public.save_discord_salon(p_salon text, p_webhook text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text := internal.discord_webhook_of(p_webhook);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement') then perform internal.fail('invalid_salon'); end if;
    if v_url is null then perform internal.fail('invalid_webhook'); end if;
    insert into internal.discord_salons (salon, webhook_url, updated_by, updated_at)
    values (p_salon, v_url, v_actor, now())
    on conflict (salon) do update
      set webhook_url = excluded.webhook_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        last_at = null, last_request = null, last_error = null;
    delete from internal.discord_salon_checks where salon = p_salon;
    perform internal.log_admin(v_actor, 'discord_salon_saved', null, jsonb_build_object('salon', p_salon));
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Renvoie l'essai d'un salon réglé, quinze secondes au moins après le précédent.
create or replace function public.test_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_salons;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    perform internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement') then perform internal.fail('invalid_salon'); end if;
    select * into v_hook from internal.discord_salons where salon = p_salon for update;
    if not found then perform internal.fail('discord_not_set'); end if;
    if v_hook.last_at > now() - interval '15 seconds' then perform internal.fail('test_too_soon'); end if;
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Débranche un salon du robot : le réglage est effacé, lien compris. Le robot reprend alors le secret GitHub, s'il en
-- reste un. Les messages déjà postés restent dans le salon.
create or replace function public.clear_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_found boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement') then perform internal.fail('invalid_salon'); end if;
    delete from internal.discord_salons where salon = p_salon;
    v_found := found;
    delete from internal.discord_salon_checks where salon = p_salon;
    if v_found then perform internal.log_admin(v_actor, 'discord_salon_cleared', null, jsonb_build_object('salon', p_salon)); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Pour le robot seulement (clé de service) ---------- */

-- Les liens réglés ici. Null : rien de réglé, le robot garde le secret GitHub.
create or replace function public.robot_discord_salons() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nouvelles', (select webhook_url from internal.discord_salons where salon = 'nouvelles'),
    'encadrement', (select webhook_url from internal.discord_salons where salon = 'encadrement')
  )
$$;

-- Le contrôle du passage : d'où venait le lien et ce que Discord a répondu à sa simple lecture (rien n'est posté). Le nom
-- du webhook est réduit à une ligne de 80 signes au plus.
create or replace function public.note_discord_salon(p_salon text, p_source text, p_status integer, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_salon is null or p_salon not in ('nouvelles', 'encadrement') or p_source is null or p_source not in ('direction', 'secret', 'none') then
    return jsonb_build_object('ok', false, 'error', 'invalid_salon');
  end if;
  insert into internal.discord_salon_checks (salon, checked_at, source, status, webhook_name)
  values (
    p_salon,
    now(),
    p_source,
    case when p_status between 0 and 599 then p_status end,
    left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g')), ''), 80)
  )
  on conflict (salon) do update
    set checked_at = excluded.checked_at, source = excluded.source, status = excluded.status, webhook_name = excluded.webhook_name;
  return jsonb_build_object('ok', true);
end $$;

/* ---------- Règles d'accès ---------- */

-- Des tables privées, comme celle des appels : seules les fonctions ci-dessus les lisent.
alter table internal.discord_salons enable row level security;
alter table internal.discord_salon_checks enable row level security;
revoke all on internal.discord_salons from public, anon, authenticated;
revoke all on internal.discord_salon_checks from public, anon, authenticated;

revoke all on function internal.discord_salon_test(text) from public, anon, authenticated;

-- Tout compte connecté : chaque fonction vérifie elle-même le rang (admin ou fondateur).
revoke all on function public.get_discord_salons() from public, anon, authenticated;
revoke all on function public.save_discord_salon(text, text) from public, anon, authenticated;
revoke all on function public.test_discord_salon(text) from public, anon, authenticated;
revoke all on function public.clear_discord_salon(text) from public, anon, authenticated;
grant execute on function public.get_discord_salons() to authenticated;
grant execute on function public.save_discord_salon(text, text) to authenticated;
grant execute on function public.test_discord_salon(text) to authenticated;
grant execute on function public.clear_discord_salon(text) to authenticated;

-- Le robot : la clé de service seulement, jamais un compte du site.
revoke all on function public.robot_discord_salons() from public, anon, authenticated;
revoke all on function public.note_discord_salon(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.robot_discord_salons() to service_role;
grant execute on function public.note_discord_salon(text, text, integer, text) to service_role;
