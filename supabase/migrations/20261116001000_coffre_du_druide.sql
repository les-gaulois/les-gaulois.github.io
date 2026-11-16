-- Le coffre du druide (demande du pilote, 16 novembre 2026, docs/DIRECTION.md, « Le coffre du druide ») : un jeu du serveur
-- Discord du clan. Un druide, joué par Claude, garde un mot secret ; avec /coffre, chaque membre lui écrit devant tout le
-- salon et cherche à le lui faire dire. Le premier qui y arrive, ou qui devine le mot, gagne la manche ; un nouveau mot est
-- alors choisi et le druide devient plus méfiant (supabase/functions/code-discord/coffre.ts).
--
-- Ce que le serveur garde, et lui seul décide :
-- - le mot de chaque manche, jamais donné à un navigateur ;
-- - chaque essai : l'identifiant Discord et le nom du membre, son message, la réponse du druide, l'heure. Les essais de plus
--   de 30 jours sont effacés chaque nuit (pg_cron), et au passage du suivant. Un essai auquel Claude n'a pas répondu est
--   marqué annulé : il compte quand même dans les essais du jour, pour que personne ne fasse partir des appels sans fin ;
-- - le gagnant de chaque manche et, quand le druide a lâché le mot, le message qui l'a fait tomber, que le druide relit aux
--   manches suivantes pour ne pas retomber dans la même ruse ;
-- - les limites : essais par membre et par jour, essais de tout le serveur par jour, date de fin, et un plafond de dépense
--   compté en millionièmes de dollar d'après ce que chaque appel à Claude a consommé, ou d'après un forfait quand l'appel
--   a échoué sans dire ce qu'il a consommé. Plafond atteint ou date passée, plus aucun appel ne part.
--
-- Rien ne se gagne en statères : le jeu n'en crée pas et ne touche à aucune table du village.
--
-- Qui peut quoi : les quatre fonctions sont réservées à la clé de service, celle de la fonction serveur code-discord, qui
-- vérifie la signature de Discord avant de les appeler. Ni un visiteur ni un compte connecté ne les appelle, ni ne lit les
-- tables, rangées dans le schéma internal.
--
-- Trois tables et six fonctions ajoutées (deux internes, quatre pour la fonction serveur), rien de retiré ni de modifié. Rejouée, la migration ne change rien.

create table if not exists internal.coffre_reglages (
  id boolean primary key default true check (id),
  -- Fermé, /coffre répond que le druide dort.
  ouvert boolean not null default true,
  -- Le jeu s'arrête le 15 décembre 2026 à 0 h, heure de Paris.
  fin timestamptz not null default timestamptz '2026-12-15 00:00:00+01',
  -- 150 dollars, sous les 175 euros que le pilote y consacre.
  plafond_microdollars bigint not null default 150000000 check (plafond_microdollars >= 0),
  depense_microdollars bigint not null default 0 check (depense_microdollars >= 0),
  essais_par_membre integer not null default 10 check (essais_par_membre between 1 and 100),
  essais_par_jour integer not null default 300 check (essais_par_jour between 1 and 5000)
);
insert into internal.coffre_reglages default values on conflict do nothing;

create table if not exists internal.coffre_manches (
  id bigint generated always as identity primary key,
  mot text not null unique check (mot ~ '^[a-z]{5,10}$'),
  ouverte_le timestamptz not null default now(),
  trouvee_le timestamptz,
  gagnant_discord_id text check (gagnant_discord_id is null or gagnant_discord_id ~ '^[0-9]{17,20}$'),
  gagnant_nom text,
  -- Le message qui a fait lâcher le mot au druide ; absent quand le mot a été deviné.
  ruse text,
  devine boolean
);
-- Une seule manche ouverte à la fois.
create unique index if not exists coffre_manche_ouverte on internal.coffre_manches ((true)) where trouvee_le is null;

create table if not exists internal.coffre_essais (
  id bigint generated always as identity primary key,
  manche_id bigint references internal.coffre_manches (id),
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  nom text not null check (char_length(nom) between 1 and 32),
  message text not null check (char_length(message) between 2 and 300),
  -- Absente tant que le druide n'a pas répondu.
  reponse text check (reponse is null or char_length(reponse) between 1 and 1000),
  -- Claude n'a pas répondu : l'essai reste, sans réponse, et compte dans les essais du jour.
  annule boolean not null default false,
  -- Le numéro de l'interaction de Discord : un même envoi ne compte qu'une fois.
  interaction_id text not null unique check (interaction_id ~ '^[0-9]{17,20}$'),
  cree_le timestamptz not null default now()
);
create index if not exists coffre_essais_membre on internal.coffre_essais (discord_id, cree_le);
create index if not exists coffre_essais_manche on internal.coffre_essais (manche_id, id);
create index if not exists coffre_essais_date on internal.coffre_essais (cree_le);

alter table internal.coffre_reglages enable row level security;
alter table internal.coffre_manches enable row level security;
alter table internal.coffre_essais enable row level security;
revoke all on internal.coffre_reglages, internal.coffre_manches, internal.coffre_essais from public, anon, authenticated;

-- La manche ouverte, telle que la fonction serveur la lit : son numéro, son mot, et le nombre d'essais déjà répondus.
create or replace function internal.coffre_manche_ouverte() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', m.id,
    'mot', m.mot,
    'essais', (select count(*) from internal.coffre_essais e where e.manche_id = m.id and e.reponse is not null))
  from internal.coffre_manches m
  where m.trouvee_le is null
$$;

-- Ajoute au compte de la dépense ce qu'un appel à Claude a coûté, borné à 5 dollars par appel pour qu'une valeur folle ne
-- ferme pas le jeu d'un coup.
create or replace function internal.coffre_depense(p_microdollars bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  update internal.coffre_reglages
  set depense_microdollars = depense_microdollars + least(greatest(coalesce(p_microdollars, 0), 0), 5000000)
  where id
$$;

-- Ouvre un essai. { ok: true, essai, manche: { id, mot, essais } ou null, niveau, passes, ruses, historique, restants } ;
-- { ok: false, error } : invalid_request, closed (jeu fermé), ended (date de fin passée), budget (plafond atteint),
-- daily_limit (essais du membre), daily_total (essais du serveur), pending (sa réponse précédente n'est pas arrivée).
create or replace function public.coffre_ouvrir(p_discord_id text, p_nom text, p_message text, p_interaction_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r internal.coffre_reglages;
  v_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_du_membre integer;
  v_du_jour integer;
  v_manche jsonb;
  v_manche_id bigint;
  v_essai bigint;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$'
    or p_interaction_id is null or p_interaction_id !~ '^[0-9]{17,20}$'
    or p_nom is null or char_length(p_nom) not between 1 and 32
    or p_message is null or char_length(p_message) not between 2 and 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  -- Les essais de plus de 30 jours ne servent plus à rien : ils s'effacent, même quand le jeu est fermé ou fini.
  delete from internal.coffre_essais where cree_le < now() - interval '30 days';

  -- Verrouillés : deux essais envoyés en même temps passent l'un après l'autre devant les limites.
  select * into r from internal.coffre_reglages where id for update;
  if not found or not r.ouvert then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if now() >= r.fin then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;
  if r.depense_microdollars >= r.plafond_microdollars then
    return jsonb_build_object('ok', false, 'error', 'budget');
  end if;

  if exists (select 1 from internal.coffre_essais
             where discord_id = p_discord_id and reponse is null and not annule and cree_le > now() - interval '2 minutes') then
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  select count(*) into v_du_membre from internal.coffre_essais where discord_id = p_discord_id and cree_le >= v_jour;
  if v_du_membre >= r.essais_par_membre then
    return jsonb_build_object('ok', false, 'error', 'daily_limit');
  end if;
  select count(*) into v_du_jour from internal.coffre_essais where cree_le >= v_jour;
  if v_du_jour >= r.essais_par_jour then
    return jsonb_build_object('ok', false, 'error', 'daily_total');
  end if;

  v_manche := internal.coffre_manche_ouverte();
  v_manche_id := (v_manche ->> 'id')::bigint;
  begin
    insert into internal.coffre_essais (manche_id, discord_id, nom, message, interaction_id)
    values (v_manche_id, p_discord_id, p_nom, p_message, p_interaction_id)
    returning id into v_essai;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end;

  return jsonb_build_object(
    'ok', true,
    'essai', v_essai,
    'manche', v_manche,
    'niveau', (select count(*) from internal.coffre_manches where trouvee_le is not null),
    'passes', (select coalesce(jsonb_agg(t.mot), '[]'::jsonb)
               from (select mot from internal.coffre_manches order by id desc limit 300) t),
    'ruses', (select coalesce(jsonb_agg(t.ruse), '[]'::jsonb)
              from (select ruse from internal.coffre_manches
                    where trouvee_le is not null and ruse is not null order by id desc limit 6) t),
    'historique', (select coalesce(jsonb_agg(jsonb_build_object('nom', t.nom, 'message', t.message, 'reponse', t.reponse) order by t.id), '[]'::jsonb)
                   from (select id, nom, message, reponse from internal.coffre_essais
                         where manche_id = v_manche_id and reponse is not null order by id desc limit 8) t),
    'restants', r.essais_par_membre - v_du_membre);
end $$;

-- Garde le mot d'une nouvelle manche, choisi par Claude, et compte ce que ce choix a coûté. Si une manche est déjà ouverte
-- (deux essais en même temps), c'est elle qui est rendue. { ok: true, manche: { id, mot, essais } } ;
-- { ok: false, error: 'invalid_word' } pour un mot absent, mal formé ou déjà sorti.
create or replace function public.coffre_manche(p_mot text, p_microdollars bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_manche jsonb;
begin
  perform internal.coffre_depense(p_microdollars);
  v_manche := internal.coffre_manche_ouverte();
  if v_manche is not null then
    return jsonb_build_object('ok', true, 'manche', v_manche);
  end if;
  if p_mot is null or p_mot !~ '^[a-z]{5,10}$' or exists (select 1 from internal.coffre_manches where mot = p_mot) then
    return jsonb_build_object('ok', false, 'error', 'invalid_word');
  end if;
  begin
    insert into internal.coffre_manches (mot) values (p_mot);
  exception when unique_violation then
    null;
  end;
  v_manche := internal.coffre_manche_ouverte();
  if v_manche is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_word');
  end if;
  return jsonb_build_object('ok', true, 'manche', v_manche);
end $$;

-- Garde la réponse du druide à un essai, compte ce qu'elle a coûté et, si la fonction serveur dit que le mot a été dit ou
-- deviné, ferme la manche : seul le premier la gagne. { ok: true, gagne, manche: son numéro, essai: son rang dans la manche } ;
-- { ok: false, error } : invalid_request, unknown_attempt (essai absent ou déjà répondu), unknown_round.
create or replace function public.coffre_clore(p_essai bigint, p_manche bigint, p_reponse text, p_gagne boolean, p_devine boolean, p_microdollars bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e internal.coffre_essais;
  v_gagne boolean := false;
begin
  perform internal.coffre_depense(p_microdollars);
  if p_essai is null or p_manche is null or p_reponse is null or char_length(p_reponse) not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  if not exists (select 1 from internal.coffre_manches where id = p_manche) then
    return jsonb_build_object('ok', false, 'error', 'unknown_round');
  end if;
  update internal.coffre_essais set reponse = p_reponse, manche_id = p_manche
  where id = p_essai and reponse is null and not annule
  returning * into e;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_attempt');
  end if;
  if coalesce(p_gagne, false) then
    update internal.coffre_manches
    set trouvee_le = now(),
        gagnant_discord_id = e.discord_id,
        gagnant_nom = e.nom,
        devine = coalesce(p_devine, false),
        ruse = case when coalesce(p_devine, false) then null else e.message end
    where id = p_manche and trouvee_le is null;
    v_gagne := found;
  end if;
  return jsonb_build_object(
    'ok', true,
    'gagne', v_gagne,
    'manche', (select count(*) from internal.coffre_manches where id <= p_manche),
    'essai', (select count(*) from internal.coffre_essais where manche_id = p_manche and reponse is not null and id <= p_essai));
end $$;

-- Marque annulé un essai resté sans réponse (Claude n'a pas répondu, ou a refusé) et compte ce que l'appel a coûté. L'essai
-- reste : il compte dans les essais du jour du membre et du serveur.
create or replace function public.coffre_annuler(p_essai bigint, p_microdollars bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.coffre_depense(p_microdollars);
  update internal.coffre_essais set annule = true where id = p_essai and reponse is null and not annule;
  return jsonb_build_object('ok', true);
end $$;

-- Chaque nuit, les essais de plus de 30 jours s'effacent, que le jeu soit ouvert, fermé ou fini. La tâche porte un nom : la
-- planifier de nouveau la remplace. pg_cron est déjà activé sur le projet (concours) ; sans lui, rien n'est planifié.
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-coffre', '17 4 * * *', 'delete from internal.coffre_essais where cree_le < now() - interval ''30 days''');
  end if;
end $cron$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de la fonction serveur, les appelle.
revoke all on function internal.coffre_manche_ouverte() from public, anon, authenticated;
revoke all on function internal.coffre_depense(bigint) from public, anon, authenticated;
revoke all on function public.coffre_ouvrir(text, text, text, text) from public, anon, authenticated;
revoke all on function public.coffre_manche(text, bigint) from public, anon, authenticated;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint) from public, anon, authenticated;
revoke all on function public.coffre_annuler(bigint, bigint) from public, anon, authenticated;
grant execute on function public.coffre_ouvrir(text, text, text, text) to service_role;
grant execute on function public.coffre_manche(text, bigint) to service_role;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint) to service_role;
grant execute on function public.coffre_annuler(bigint, bigint) to service_role;
