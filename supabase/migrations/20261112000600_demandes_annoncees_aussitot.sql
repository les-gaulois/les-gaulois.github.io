-- Annoncer une demande d'adhésion sur Discord dès qu'elle arrive, sans attendre le passage du robot horaire, à la minute 53
-- (12 novembre 2026, à la demande du pilote : « Oui, dès la demande »). Le serveur poste lui-même, avec pg_net, comme pour les
-- appels du QG, dans le salon de l'encadrement réglé dans la Direction (internal.discord_salons). Le message ne contient ni
-- nom ni identifiant, et ne mentionne personne.
--
-- Le robot horaire reste (scripts/prevenir-encadrement.ts) : il annonce après 8 h les demandes de la nuit, fait les rappels,
-- sert quand le lien n'est que dans le secret GitHub, et rattrape un avis que Discord a refusé. Pour qu'il ne double pas un
-- avis déjà parti, staff_digest compte comme annoncé ce que Discord a accepté, et ce qui attend encore sa réponse.
--
-- Cette migration ne fait qu'ajouter : une table, deux fonctions, un déclencheur, et une nouvelle version de staff_digest, qui
-- rend la même réponse qu'avant, plus ce qu'elle vient de relire des avis. Aucune donnée n'est retirée. Rejouée, elle ne
-- change rien.

/* ---------- Les avis partis dès la demande ---------- */

-- Une ligne par avis posté par le serveur. `net_id` : la requête de pg_net, dont la réponse de Discord reste six heures dans
-- net._http_response. `outcome` : vide tant que le robot ne l'a pas lue. `counted` : déjà reporté dans la note du robot
-- (app_state, clé staff_notice). Les lignes servent aussi de frein contre les rafales ; elles s'effacent au bout de deux jours.
create table if not exists internal.staff_instant_notices (
  net_id bigint primary key,
  request_id bigint not null,
  sent_at timestamptz not null default now(),
  outcome text check (outcome in ('ok', 'failed')),
  counted boolean not null default false
);
alter table internal.staff_instant_notices enable row level security;
revoke all on internal.staff_instant_notices from public, anon, authenticated;

-- Les heures de silence du robot (QUIET_FROM_HOUR et QUIET_UNTIL_HOUR, src/lib/alerts.ts) : rien de 23 h à 8 h, heure de Paris.
create or replace function internal.staff_quiet_hour(p_at timestamptz) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select extract(hour from p_at at time zone 'Europe/Paris') >= 23 or extract(hour from p_at at time zone 'Europe/Paris') < 8
$$;

/* ---------- L'avis, posté à la création de la demande ---------- */

-- Après l'insertion d'une demande. Il se tait quand :
--  - la ligne n'est pas écrite par la personne elle-même depuis le site (clé de service, restauration) ;
--  - c'est la nuit : le robot l'annonce à son premier passage après 8 h ;
--  - la demande n'attend plus : validée d'elle-même par un rôle prévu (membership_planned_role passe avant celui-ci, par
--    l'ordre alphabétique des déclencheurs, et le statut est relu) ; il n'y a alors rien à traiter, personne ne l'annonce ;
--  - aucun lien n'est réglé dans la Direction : le robot prend le secret GitHub à son passage ;
--  - un avis est parti il y a moins de 2 minutes, ou la même personne a déjà fait une demande dans l'heure (retirée puis
--    refaite) : contre les rafales ; le robot l'annonce à son passage.
-- Même contenu que le message « nouvelle » du robot (src/lib/encadrement-discord.ts), dans une autre tournure : le nombre de
-- demandes qui attendent, l'âge de la plus ancienne quand elle attend depuis plus de 24 h (REMIND_AFTER_HOURS), écrit comme
-- fmtDuration (src/lib/format.ts), et le lien. L'avis vaut ce message, et le rappel suivant attend un jour.
-- Rien ici n'arrête jamais la demande : toute erreur est avalée, et le robot rattrape l'avis.
create or replace function internal.announce_request_now() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text;
  v_pending integer;
  v_oldest timestamptz;
  v_hours bigint;
  v_request bigint;
begin
  begin
    if auth.uid() is null or auth.uid() <> new.user_id then return null; end if;
    if internal.staff_quiet_hour(now()) then return null; end if;
    if not exists (select 1 from public.membership_requests where id = new.id and status = 'pending') then return null; end if;
    select webhook_url into v_url from internal.discord_salons where salon = 'encadrement';
    if v_url is null then return null; end if;
    if exists (select 1 from internal.staff_instant_notices where sent_at > now() - interval '2 minutes') then return null; end if;
    if exists (select 1 from public.membership_requests where user_id = new.user_id and id <> new.id and created_at > now() - interval '1 hour') then
      return null;
    end if;

    select count(*), min(created_at) into v_pending, v_oldest from public.membership_requests where status = 'pending';
    v_hours := floor(extract(epoch from now() - v_oldest) / 3600);
    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'content', 'Nouvelle demande d''adhésion sur le site du clan'
          || case when v_pending > 1 then ' : ' || v_pending || ' demandes attendent' else '' end
          || '.'
          || case when now() - v_oldest > interval '24 hours'
               then ' La plus ancienne attend depuis ' || case when v_hours < 48 then v_hours || ' h' else (v_hours / 24) || ' jours' end || '.'
               else '' end
          || ' À traiter : https://les-gaulois.github.io/direction#demandes',
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
      ),
      timeout_milliseconds := 5000
    );
    insert into internal.staff_instant_notices (net_id, request_id) values (v_request, new.id);
  exception when others then
    null;
  end;
  return null;
end $$;

create or replace trigger membership_staff_notice after insert on public.membership_requests
  for each row execute function internal.announce_request_now();

/* ---------- Le robot horaire ne double pas un avis parti ---------- */

-- Même réponse qu'avant (le nombre de demandes en attente, la plus ancienne, la plus récente, ce qui a été annoncé), plus
-- `instant` : ce que ce passage vient de relire des avis du serveur (acceptés, refusés), pour une note du robot. Et :
--  1. les demandes sont lues d'abord : une demande enregistrée pendant ce passage, avec son avis, attend le suivant ;
--  2. la réponse de Discord à chaque avis est relue ; sans réponse lisible au bout d'une heure, il est raté ;
--  3. un avis accepté rejoint la note du robot, pour de bon : la demande compte comme annoncée, et le rappel suivant attend
--     un jour, comme après un message du robot ;
--  4. un avis qui attend encore sa réponse compte comme annoncé pour ce passage seulement : le robot ne le double pas ;
--  5. un avis refusé ne compte pas : le robot annonce la demande à ce passage.
-- Une panne de pg_net n'arrête jamais le robot : la lecture des réponses est protégée. Ni nom ni identifiant : le message du
-- robot n'en contient pas. Réservée à la clé de service, comme avant.
create or replace function public.staff_digest() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pending bigint;
  v_oldest timestamptz;
  v_last bigint;
  v_notice jsonb;
  v_newest bigint;
  v_at timestamptz;
  v_accepted integer := 0;
  v_refused integer := 0;
  v_late integer := 0;
begin
  select count(*), min(created_at), max(id) into v_pending, v_oldest, v_last from public.membership_requests where status = 'pending';

  begin
    with relu as (
      update internal.staff_instant_notices i
         set outcome = case when r.status_code between 200 and 299 and not coalesce(r.timed_out, false) then 'ok' else 'failed' end
        from net._http_response r
       where r.id = i.net_id and i.outcome is null
      returning i.outcome
    )
    select count(*) filter (where outcome = 'ok'), count(*) filter (where outcome = 'failed') into v_accepted, v_refused from relu;
  exception when others then
    null;
  end;
  update internal.staff_instant_notices set outcome = 'failed' where outcome is null and sent_at < now() - interval '1 hour';
  get diagnostics v_late = row_count;

  select value into v_notice from public.app_state where key = 'staff_notice';
  select max(request_id), max(sent_at) into v_newest, v_at from internal.staff_instant_notices where outcome = 'ok' and not counted;
  if v_newest is not null then
    v_notice := jsonb_build_object(
      'newest_id', greatest((v_notice ->> 'newest_id')::bigint, v_newest),
      'reminded_at', greatest((v_notice ->> 'reminded_at')::timestamptz, v_at)
    );
    insert into public.app_state (key, value, updated_at) values ('staff_notice', v_notice, now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
    update internal.staff_instant_notices set counted = true where outcome = 'ok' and not counted;
  end if;
  delete from internal.staff_instant_notices where sent_at < now() - interval '2 days';

  select max(request_id), max(sent_at) into v_newest, v_at from internal.staff_instant_notices where outcome is null;
  if v_newest is not null then
    v_notice := jsonb_build_object(
      'newest_id', greatest((v_notice ->> 'newest_id')::bigint, v_newest),
      'reminded_at', greatest((v_notice ->> 'reminded_at')::timestamptz, v_at)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pending', v_pending,
    'oldest_at', v_oldest,
    'newest_id', v_last,
    'notice', v_notice,
    'instant', jsonb_build_object('accepted', v_accepted, 'refused', v_refused + v_late)
  );
end $$;

/* ---------- Règles d'accès ---------- */

-- Remplacer une fonction garde ses droits ; ils sont reposés ici pour que le fichier se lise seul.
revoke all on function internal.staff_quiet_hour(timestamptz) from public, anon, authenticated;
revoke all on function internal.announce_request_now() from public, anon, authenticated;
revoke all on function public.staff_digest() from public, anon, authenticated;
grant execute on function public.staff_digest() to service_role;

-- staff_digest écrit désormais : l'API relit la description des fonctions, pour l'appeler hors d'une transaction en lecture seule.
notify pgrst, 'reload schema';
