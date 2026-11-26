-- Les gros gains du casino sur Discord (docs/DIRECTION.md, « Le casino des Gaulois » ; robot : src/lib/casino-discord.ts).
--
-- Demande du pilote, 26 novembre 2026 : « c'est dommage qu'on reçoit pas de notifs pour le casino comme pour l'achat de
-- cosmétiques ou ouverture de pochettes ». Maquette montrée le même jour (le nom Discord, « 100 fois sa mise à la machine du
-- forgeron », les statères gagnés et la mise, la vraie chance du coup) ; il a choisi « 1 000 statères ou plus » plutôt que
-- les gros lots (19 fois la mise ou plus).
--
-- Les règles :
-- - Un coup est annoncé quand il gagne au moins 1 000 statères (internal.casino_annonce_seuil) : ce qui revient, moins la
--   mise. Jamais chaque coup, jamais une perte, jamais un solde. Seuls les coups joués après l'installation de ce fichier
--   (internal.casino_annonces_depart) : rien d'avant n'est annoncé.
-- - Jamais un essai du mode GOD (rien n'y est misé). Jamais le vingt-et-un : avec 200 au plus au départ, doubler et séparer
--   compris, il ne gagne pas plus de 800 statères ; s'il le pouvait un jour, le robot devrait d'abord savoir le dessiner.
-- - Seulement un compte encore validé, et rien de plus vieux que 48 heures.
-- - Le nom : celui de l'annonce des achats (le nom Discord, sinon le pseudo du clan, sinon « Gaulois n° »), relu ici.
-- - Le robot (clé de service) lit la file (casino_annonces_a_envoyer), poste, puis note chaque envoi
--   (noter_annonces_casino) : un coup noté ne repart pas.
-- - Le salon : « casino », réglé dans Direction > Discord ; sans lien, le robot suit le salon des achats, puis celui des
--   nouvelles. Les fonctions des salons sont celles de 20261122000200_duel_boss_salon_corrections.sql, recopiées telles
--   quelles avec « casino » en plus.
--
-- Rien ne touche une partie, une mise ou un gain : les fonctions du jeu ne sont pas remplacées, aucun déclencheur n'est posé
-- sur les parties. Deux tables privées nouvelles ; fonctions remplacées : internal.discord_salon_test, get_discord_salons,
-- save_discord_salon, test_discord_salon, clear_discord_salon, robot_discord_salons, note_discord_salon (de
-- 20261122000200). Les contrôles des salons permis sont élargis à « casino ». Aucune ligne n'est retirée ni changée.
-- Rejouée, elle se remplace par la même (le point de départ, déjà posé, ne bouge pas).

/* ---------- La file des gros gains ---------- */

-- Les coups annoncés (ou laissés par le robot) : un coup noté ne repart pas.
create table if not exists internal.casino_annonces (
  partie bigint primary key references internal.casino_parties (id) on delete cascade,
  annoncee_le timestamptz not null default now()
);

-- Le point de départ : le dernier coup joué avant l'installation. Rien de plus ancien n'est annoncé.
create table if not exists internal.casino_annonces_depart (
  id boolean primary key default true check (id),
  partie bigint not null check (partie >= 0),
  pose_le timestamptz not null default now()
);
insert into internal.casino_annonces_depart (id, partie)
values (true, coalesce((select max(p.id) from internal.casino_parties p), 0))
on conflict (id) do nothing;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['casino_annonces', 'casino_annonces_depart'] loop
    execute format('alter table internal.%I enable row level security', v_t);
    execute format('revoke all on table internal.%I from public, anon, authenticated', v_t);
  end loop;
end $$;

-- Le gain d'un coup, au moins, pour qu'il soit annoncé (ce qui revient, moins la mise).
create or replace function internal.casino_annonce_seuil() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 1000 $$;

-- Les seuls coups que la file peut rendre : un index étroit, pour qu'elle ne relise pas toutes les parties à chaque passage
-- du robot (toutes les 5 minutes). Il reprend le seuil en chiffre : si le seuil change un jour, il faut le refaire.
create index if not exists casino_parties_gros_gains on internal.casino_parties (id)
  where fini and not god and rendu - mise >= 1000;

-- Les gros gains à annoncer, les plus anciens d'abord, 20 au plus : le jeu, la mise, ce qui est revenu, les paris et le
-- tirage tels qu'ils ont été joués, et le nom. Le robot refait le compte avec les règles du site avant de poster.
create or replace function public.casino_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'seuil', internal.casino_annonce_seuil(), 'annonces', coalesce((
    select jsonb_agg(jsonb_build_object(
        'partie', c.id,
        'le', c.fini_le,
        'jeu', c.jeu,
        'mise', c.mise,
        'rendu', c.rendu,
        'paris', c.paris,
        'resultat', c.resultat,
        'nom', coalesce(internal.member_pseudo(c.user_id), 'Gaulois n° ' || pr.gaul_number),
        'discord', nullif(btrim(pl.discord_name), ''))
      order by c.id)
    from (
      select p.id, p.user_id, p.fini_le, p.jeu, p.mise, p.rendu, p.paris, p.resultat
      from internal.casino_parties p
      where p.id > coalesce((select d.partie from internal.casino_annonces_depart d where d.id), 9223372036854775807)
        and p.fini
        and not p.god
        and p.jeu <> 'vingt-et-un'
        and p.rendu - p.mise >= internal.casino_annonce_seuil()
        and p.fini_le > now() - interval '48 hours'
        and not exists (select 1 from internal.casino_annonces a where a.partie = p.id)
        and exists (select 1 from public.profiles v where v.user_id = p.user_id and v.status = 'validated')
      order by p.id
      limit 20
    ) c
    join public.profiles pr on pr.user_id = c.user_id
    left join public.private_links pl on pl.user_id = c.user_id), '[]'::jsonb))
$$;

-- Note les coups traités par le robot, postés ou laissés. Un numéro inconnu est ignoré.
create or replace function public.noter_annonces_casino(p_parties bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  if p_parties is null or cardinality(p_parties) > 100 then return internal.error_json('invalid_request', ''); end if;
  insert into internal.casino_annonces (partie)
  select p.id from internal.casino_parties p where p.id = any (p_parties)
  on conflict (partie) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'notees', v_n);
end $$;

/* ---------- Le salon du casino ---------- */

-- Postgres a nommé ces contrôles d'après la table et la colonne. Retirer un contrôle ne touche à aucune ligne.
alter table internal.discord_salons drop constraint if exists discord_salons_salon_check;
alter table internal.discord_salons add constraint discord_salons_salon_check check (salon in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels', 'casino'));
alter table internal.discord_salon_checks drop constraint if exists discord_salon_checks_salon_check;
alter table internal.discord_salon_checks add constraint discord_salon_checks_salon_check check (salon in ('nouvelles', 'encadrement', 'victoires', 'achats', 'duels', 'casino'));

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
          when 'victoires' then 'Essai du site du clan : chaque victoire du clan, avec l''image de la carte, arrivera dans ce salon.'
          -- Ajout de 20261113001600 : le français puis l'anglais, chacun sur sa ligne avec son drapeau (lettres régionales
          -- F R et G B, que Discord affiche en drapeaux), une ligne vide entre les deux.
          when 'alliance' then chr(127467) || chr(127479) || ' Essai du site du clan : les zones nouvelles de la carte de l''alliance, et chaque zone dont l''état change, arriveront dans ce salon.'
            || chr(10) || chr(10)
            || chr(127468) || chr(127463) || ' Site test: new zones of the alliance map, and zones whose status changes, will be posted here.'
          -- Ajout de 20261115000200.
          when 'achats' then 'Essai du site du clan : les objets reçus au village des Gaulois, en image, arriveront dans ce salon.'
          -- Ajout de 20261122000200.
          when 'duels' then 'Essai du site du clan : chaque victoire en duel de cartes entre Gaulois, en image, arrivera dans ce salon.'
          -- Ajout de 20261126000100.
          when 'casino' then 'Essai du site du clan : chaque gain de 1 000 statères ou plus au casino des Gaulois, en image, arrivera dans ce salon.'
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
    foreach v_salon in array array['nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels', 'casino'] loop
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
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels', 'casino') then perform internal.fail('invalid_salon'); end if;
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
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels', 'casino') then perform internal.fail('invalid_salon'); end if;
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
-- reste un ; pour les achats, le salon des nouvelles. Les messages déjà postés restent dans le salon.
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
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels', 'casino') then perform internal.fail('invalid_salon'); end if;
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

-- Les liens réglés ici. Null : rien de réglé, le robot garde le secret GitHub (pour les achats : le salon des nouvelles).
-- Le robot reconnaît à la présence de la clé « achats » que la migration des achats est installée, à celle de « duels »
-- celle du salon des duels (20261122000200), à celle de « casino » celle du salon du casino (20261126000100).
create or replace function public.robot_discord_salons() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nouvelles', (select webhook_url from internal.discord_salons where salon = 'nouvelles'),
    'encadrement', (select webhook_url from internal.discord_salons where salon = 'encadrement'),
    'victoires', (select webhook_url from internal.discord_salons where salon = 'victoires'),
    'achats', (select webhook_url from internal.discord_salons where salon = 'achats'),
    'duels', (select webhook_url from internal.discord_salons where salon = 'duels'),
    -- Ajout de 20261126000100.
    'casino', (select webhook_url from internal.discord_salons where salon = 'casino')
  )
$$;

-- Le contrôle du passage : d'où venait le lien et ce que Discord a répondu à sa simple lecture (rien n'est posté). Le nom
-- du webhook est réduit à une ligne de 80 signes au plus.
create or replace function public.note_discord_salon(p_salon text, p_source text, p_status integer, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'achats', 'duels', 'casino') or p_source is null or p_source not in ('direction', 'secret', 'none') then
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

/* ---------- Les droits ---------- */

-- Remplacer une fonction garde ses droits ; ils sont reposés ici pour que le fichier se lise seul.
revoke all on function internal.casino_annonce_seuil() from public, anon, authenticated;
revoke all on function public.casino_annonces_a_envoyer() from public, anon, authenticated;
revoke all on function public.noter_annonces_casino(bigint[]) from public, anon, authenticated;
grant execute on function public.casino_annonces_a_envoyer() to service_role;
grant execute on function public.noter_annonces_casino(bigint[]) to service_role;

revoke all on function internal.discord_salon_test(text) from public, anon, authenticated;
revoke all on function public.get_discord_salons() from public, anon, authenticated;
revoke all on function public.save_discord_salon(text, text) from public, anon, authenticated;
revoke all on function public.test_discord_salon(text) from public, anon, authenticated;
revoke all on function public.clear_discord_salon(text) from public, anon, authenticated;
grant execute on function public.get_discord_salons() to authenticated;
grant execute on function public.save_discord_salon(text, text) to authenticated;
grant execute on function public.test_discord_salon(text) to authenticated;
grant execute on function public.clear_discord_salon(text) to authenticated;
revoke all on function public.robot_discord_salons() from public, anon, authenticated;
revoke all on function public.note_discord_salon(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.robot_discord_salons() to service_role;
grant execute on function public.note_discord_salon(text, text, integer, text) to service_role;
