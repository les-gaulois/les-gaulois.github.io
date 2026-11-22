-- Le duel des Gaulois, vague 2 : les salles en direct, avec mise (docs/DIRECTION.md, « Les salles du duel » ; formes des
-- réponses : src/lib/village/contrat-salles.ts ; le duel lui-même : 20261122000100_duel_des_gaulois et
-- 20261122000200_duel_boss_salon_corrections).
--
-- Demande du pilote (22 novembre 2026) : le défi entre membres « joué entre deux vrais joueurs IRL, avec à la clé un
-- montant de statères de participation, plusieurs salles 25 50 100 250 500 1000 statères en match ».
--
-- Les règles :
-- - SIX SALLES : 25, 50, 100, 250, 500 et 1 000 statères. On y entre avec sa main, choisie avant d'entrer (une carte par
--   emplacement, dans la bourse de 12 points, les règles de duel_refus_de_main), et on attend un adversaire. Le premier
--   Gaulois qui attend dans la même salle, et qui peut jouer, est pris : on ne choisit pas son adversaire. Une salle ne
--   montre que son prix d'entrée et s'il y a quelqu'un qui attend ; jamais un solde, jamais un nom avant le match.
-- - QUI PEUT ENTRER : un compte validé, avec son Gaulois, permis par l'interrupteur du duel (internal.duel_joueur), qui a
--   au moins la mise. Une seule salle et un seul match à la fois. Qui attend doit donner des nouvelles (l'écran interroge
--   le serveur chaque seconde) : sans nouvelles depuis 10 secondes, il quitte la salle, sans rien perdre. Quitter la salle
--   (quitter_salle_duel sans match) ne touche jamais à un match qui viendrait de commencer : seul le match nommé se quitte.
-- - LE MATCH : dès qu'il commence, les deux mises sont prises au journal des statères (nature 'duel_mise') et gardées de
--   côté dans le match. Chaque joueur pose sa carte par poser_carte_salle ; le serveur garde la première sans la montrer,
--   puis, quand les deux ont posé, résout la manche avec internal.duel_manche, sans en changer une règle (le camp a est
--   celui qui attendait, b celui qui l'a rejoint ; le moteur rend le même résultat dans les deux sens, un test le vérifie).
--   Le lieu est la bannière de celui qui attendait ; le compagnon de chacun, la famille de son familier.
-- - LE TEMPS : 30 secondes par manche, comptées après les 4 secondes de la révélation (et de l'entrée, à la première).
--   Celui qui n'a pas posé à temps perd le match ; si aucun des deux n'a posé, c'est une égalité. Celui qui quitte le match
--   le perd. Personne n'a besoin d'être là pour que le temps passe : chaque appel des salles, et pg_cron chaque minute,
--   finissent les manches échues. Si le duel est fermé pendant un match avec mise, le match finit en égalité ('ferme') :
--   chacun reprend sa mise. Un compte effacé en plein match le perd.
-- - L'ARGENT, sans jamais créer de statère : le gagnant reçoit les deux mises, moins 10 % qui vont à la cagnotte de la
--   saison du pass ('duel_gain' ; 45, 90, 180, 450, 900 ou 1 800 statères) ; en cas d'égalité, chacun reprend sa mise
--   ('duel_rendu'). La cagnotte (internal.duel_cagnottes, tenue par son journal internal.duel_cagnotte_mouvements) est
--   celle de la saison en cours, sinon de la prochaine, sinon « a-venir » : c'est la session du tableau de la saison qui
--   la partagera. La somme des soldes, des mises en jeu et des cagnottes ne bouge jamais : un test le vérifie.
-- - LES GARDE-FOUS contre les transferts d'un compte à l'autre (perdre exprès pour donner des statères) :
--   - au plus 3 matchs avec mise par jour (heure de Paris) contre un même adversaire : au-delà, les deux ne sont plus
--     appariés ce jour-là ;
--   - au plus 10 matchs avec mise par jour pour un compte, contre tous : borne ce qu'on peut perdre en une soirée et ce
--     qu'un groupe de comptes pourrait se passer ;
--   - on ne choisit pas son adversaire : le serveur prend le premier qui attend dans la salle ;
--   - la main est fixée en entrant : on ne la change pas après avoir vu celle d'en face ;
--   - un forfait (temps, départ) compte comme une défaite pleine, sans rien rendre : sinon on pourrait regarder la main
--     d'en face et s'en aller sans risque ;
--   - les 10 % de la cagnotte rendent chaque transfert coûteux ;
--   - un compte en essai du mode GOD ne joue pas avec mise ('mode_god') ; le journal le refuse aussi ('duel_mise').
-- - TANT QUE LE DUEL EST FERMÉ (internal.duel_ouvert faux), seul le titulaire voit les salles, et personne ne peut le
--   rejoindre : au bout de 5 secondes d'attente, la machine prend la place d'en face, au niveau du guerrier, avec sa main de
--   défense (ou la même main que lui) ; elle pose sa carte entre 1 et 8 secondes après l'ouverture de la manche. C'est un
--   essai : rien n'est misé, rien n'est compté ni annoncé.
-- - LE MODE GOD : un essai sans mise reste permis (rien ne bouge), un match avec mise est refusé. Une fois le match
--   commencé, ce qu'il rend reste vrai : 'duel_gain' et 'duel_rendu' passent parmi les vrais gains de
--   internal.village_god_mouvement, sinon les statères de l'autre joueur disparaîtraient.
-- - APRÈS UNE VICTOIRE au combat avec mise, le duel ouvert, la victoire attend son annonce sur Discord
--   (internal.duel_salle_annonces), avec la salle (`salle`, la mise) et la bannière du lieu (`banniere_du_lieu`, celle de
--   celui qui attendait). Un forfait (le temps, un départ) n'est pas annoncé : l'image montre un combat et sa carte
--   décisive. Les matchs ont leurs numéros dans la même suite que les parties du duel (internal.duel_parties_id_seq) : une
--   annonce garde un numéro que nulle autre n'a.
--
-- Ce qui est gardé :
-- - internal.duel_salle_attentes : qui attend dans quelle salle, avec quelle main, et ses dernières nouvelles ;
-- - internal.duel_matchs : chaque match, ses mains, ses camps, ses coups, la carte posée de chaque joueur pour la manche
--   en cours (jamais montrée à l'autre avant la résolution), son temps, son issue et son argent ;
-- - internal.duel_cagnottes et internal.duel_cagnotte_mouvements : la cagnotte de chaque saison et son journal, qui ne se
--   corrige pas ;
-- - internal.duel_salle_annonces : les victoires à annoncer ;
-- - internal.duel_salle_appels : le compte des appels de chaque minute (l'écran interroge chaque seconde, à part de la
--   limite des autres fonctions, internal.limit_exceeded, qui en permet 30).
-- Un compte effacé emporte son attente ; ses matchs restent, sa place vide (un match en cours est alors perdu par lui).
--
-- Qui peut quoi :
-- - get_salles_duel, entrer_salle_duel, poser_carte_salle, quitter_salle_duel : un compte permis par internal.duel_joueur.
-- - duel_annonces_a_envoyer, noter_annonces_duel (remplacées) et export_site (remplacée) : la clé de service seulement.
--
-- Ce qui change ailleurs, ligne pour ligne sauf ce qui est dit :
-- - public.duel_annonces_a_envoyer (de 20261122000200) rend aussi les victoires des salles ; public.noter_annonces_duel (de
--   20261122000100) note les deux files ;
-- - internal.village_god_mouvement (de 20261121000600) : 'duel_gain' et 'duel_rendu' parmi les vrais gains, 'duel_mise'
--   parmi les refus ;
-- - public.export_site (de 20261119000100, version 12) passe en version 13, avec le journal de la cagnotte et les mises des
--   matchs en cours.
-- Aucune règle du duel ni internal.duel_manche ne change. Aucune donnée existante n'est touchée. Rejouée, elle se remplace
-- par la même.

/* ---------- Les réglages ---------- */

-- Les six salles : le prix d'entrée, qui est la mise de chacun des deux joueurs (SALLES_DU_DUEL de contrat-salles.ts).
create or replace function internal.duel_salles_mises() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[25, 50, 100, 250, 500, 1000] $$;

-- Les secondes pour poser sa carte, à chaque manche.
create or replace function internal.duel_salle_secondes() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 30 $$;

-- Les secondes de la révélation, et de l'entrée à la première manche, avant que le temps de poser ne commence.
create or replace function internal.duel_salle_revelation() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 4 $$;

-- Sans nouvelles depuis ce nombre de secondes, qui attend quitte la salle.
create or replace function internal.duel_salle_presence() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 10 $$;

-- La part du pot qui va à la cagnotte de la saison, en pour cent.
create or replace function internal.duel_salle_part_cagnotte() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 10 $$;

-- Les matchs avec mise permis par jour : contre tous, et contre un même adversaire.
create or replace function internal.duel_salle_par_jour() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 10 $$;
create or replace function internal.duel_salle_meme_adversaire() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 3 $$;

-- Tant que le duel est fermé : les secondes avant que la machine ne prenne la place d'en face.
create or replace function internal.duel_salle_attente_machine() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 5 $$;

-- Les appels des salles permis par minute et par compte.
create or replace function internal.duel_salle_appels_max() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 150 $$;

/* ---------- Les tables ---------- */

create table if not exists internal.duel_salle_attentes (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  mise integer not null check (mise in (25, 50, 100, 250, 500, 1000)),
  -- Arme, tête, haut, pieds, bas : la main choisie en entrant.
  main text[] not null check (cardinality(main) = 5),
  entre_le timestamptz not null default now(),
  -- Le dernier appel de l'écran : sans nouvelles depuis 10 secondes, l'attente s'efface.
  vu_le timestamptz not null default now()
);
create index if not exists duel_salle_attentes_par_salle on internal.duel_salle_attentes (mise, entre_le);

create table if not exists internal.duel_matchs (
  -- La même suite que les parties du duel : un numéro d'annonce n'est jamais pris deux fois.
  id bigint primary key default nextval('internal.duel_parties_id_seq'::regclass),
  mise integer not null check (mise in (25, 50, 100, 250, 500, 1000)),
  -- Le duel était fermé : la machine tient la place b, rien n'est misé, compté ni annoncé.
  essai boolean not null,
  -- Le jour du début, à l'heure de Paris.
  jour date not null,
  -- a : celui qui attendait ; b : celui qui l'a rejoint (null dans un essai). Une place vide ensuite : un compte effacé.
  joueur_a uuid references public.profiles (user_id) on delete set null,
  joueur_b uuid references public.profiles (user_id) on delete set null,
  -- La bannière de celui qui attendait : le lieu du match, pour les deux.
  banniere text,
  main_a text[] not null check (cardinality(main_a) = 5),
  main_b text[] not null check (cardinality(main_b) = 5),
  options_a jsonb not null,
  options_b jsonb not null,
  cartes_a integer[] not null,
  cartes_b integer[] not null,
  atouts_a integer[] not null,
  atouts_b integer[] not null,
  etat_a integer[] not null,
  etat_b integer[] not null,
  -- Les cartes posées, deux par manche résolue : celle de a, puis celle de b.
  coups integer[] not null default '{}',
  manche integer not null default 1 check (manche between 1 and 41),
  -- La carte posée par chacun pour la manche en cours : gardée par le serveur, jamais montrée à l'autre avant la résolution.
  pose_a integer check (pose_a between 0 and 4),
  pose_b integer check (pose_b between 0 and 4),
  -- La manche s'ouvre après la révélation de la précédente ; à `limite`, qui n'a pas posé perd le match.
  ouverte_le timestamptz not null,
  limite timestamptz not null,
  -- Un essai : la graine de la machine (jamais montrée) et l'heure où elle pose.
  graine bigint check (graine between 1 and 2147483646),
  machine_le timestamptz,
  fini boolean not null default false,
  -- Du côté de a : 1 a gagné, -1 b a gagné, 0 égalité.
  verdict integer check (verdict in (-1, 0, 1)),
  -- 'combat' (un Gaulois tombe, ou la fin des 40 manches), 'temps' (une carte pas posée à temps), 'quitte' (un départ, ou
  -- un compte effacé), 'ferme' (le duel fermé pendant le match : égalité).
  fin text check (fin in ('combat', 'temps', 'quitte', 'ferme')),
  -- Ce qui est allé à la cagnotte, et ce qu'a reçu le gagnant ; null pour un essai et une égalité.
  cagnotte integer check (cagnotte >= 0),
  gain integer check (gain >= 0),
  saison text,
  commence_le timestamptz not null default now(),
  fini_le timestamptz,
  check (fini = (verdict is not null)),
  check (fini = (fin is not null)),
  check (not essai or (graine is not null and joueur_b is null)),
  check (limite > ouverte_le)
);
create unique index if not exists duel_matchs_un_en_cours_a on internal.duel_matchs (joueur_a) where not fini;
create unique index if not exists duel_matchs_un_en_cours_b on internal.duel_matchs (joueur_b) where not fini;
create index if not exists duel_matchs_a_finir on internal.duel_matchs (limite) where not fini;
create index if not exists duel_matchs_du_jour_a on internal.duel_matchs (joueur_a, jour);
create index if not exists duel_matchs_du_jour_b on internal.duel_matchs (joueur_b, jour);

create table if not exists internal.duel_cagnottes (
  -- La saison du pass, ou 'a-venir' quand aucune n'est encore prévue.
  saison text primary key check (saison ~ '^[a-z0-9-]{1,24}$'),
  montant bigint not null default 0 check (montant >= 0),
  maj_le timestamptz not null default now()
);

create table if not exists internal.duel_cagnotte_mouvements (
  id bigint generated always as identity primary key,
  saison text not null check (saison ~ '^[a-z0-9-]{1,24}$'),
  -- 'part_du_pot' : les 10 % d'un match ; la session du tableau de la saison ajoutera ses partages (montant négatif).
  nature text not null check (nature ~ '^[a-z][a-z_]{1,31}$'),
  montant integer not null check (montant <> 0 and montant between -10000000 and 10000000),
  -- Les matchs ne s'effacent jamais (et ce journal ne se modifie pas) : pas de « on delete ».
  match bigint references internal.duel_matchs (id),
  ref text check (ref is null or char_length(ref) between 1 and 80),
  cree_le timestamptz not null default now()
);
create index if not exists duel_cagnotte_mouvements_saison on internal.duel_cagnotte_mouvements (saison, cree_le);

create table if not exists internal.duel_salle_annonces (
  match bigint primary key references internal.duel_matchs (id) on delete cascade,
  cree_le timestamptz not null default now(),
  annoncee_le timestamptz
);
create index if not exists duel_salle_annonces_a_envoyer on internal.duel_salle_annonces (cree_le) where annoncee_le is null;

create table if not exists internal.duel_salle_appels (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  minute timestamptz not null,
  n integer not null
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
do $$
declare
  v_t text;
begin
  foreach v_t in array array['duel_salle_attentes', 'duel_matchs', 'duel_cagnottes', 'duel_cagnotte_mouvements', 'duel_salle_annonces', 'duel_salle_appels'] loop
    execute format('alter table internal.%I enable row level security', v_t);
    execute format('revoke all on table internal.%I from public, anon, authenticated', v_t);
  end loop;
end $$;

/* ---------- La cagnotte : un journal qui ne se corrige pas ---------- */

-- La cagnotte suit son journal, dans la même transaction ; un partage qui la rendrait négative est refusé par la table.
create or replace function internal.duel_cagnotte_tenir() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update internal.duel_cagnottes set montant = montant + new.montant, maj_le = now() where saison = new.saison;
  if not found then
    insert into internal.duel_cagnottes (saison, montant) values (new.saison, new.montant) on conflict (saison) do nothing;
    if not found then
      update internal.duel_cagnottes set montant = montant + new.montant, maj_le = now() where saison = new.saison;
    end if;
  end if;
  return new;
end $$;

-- Le journal ne se modifie pas, ne s'efface pas.
create or replace function internal.duel_cagnotte_figee() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'le journal de la cagnotte du duel ne se modifie pas';
end $$;

-- La cagnotte ne s'écrit que par son journal.
create or replace function internal.duel_cagnotte_garde() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'la cagnotte du duel ne s''écrit que par son journal';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create or replace trigger duel_cagnotte_tenir after insert on internal.duel_cagnotte_mouvements
  for each row execute function internal.duel_cagnotte_tenir();
create or replace trigger duel_cagnotte_figee before update or delete on internal.duel_cagnotte_mouvements
  for each row execute function internal.duel_cagnotte_figee();
create or replace trigger duel_cagnotte_garde before insert or update or delete on internal.duel_cagnottes
  for each row execute function internal.duel_cagnotte_garde();

-- La saison dont la cagnotte reçoit la part d'un match joué ce jour : celle du pass en cours, sinon la prochaine à venir,
-- sinon 'a-venir'.
create or replace function internal.duel_saison_de_la_cagnotte(p_jour date) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    internal.sentier_saison_du(p_jour),
    (select s.saison from internal.sentier_saisons s where s.debut > p_jour order by s.debut limit 1),
    'a-venir')
$$;

/* ---------- Les aides ---------- */

-- Un seul appel des salles à la fois, pour tout le serveur : deux Gaulois ne rejoignent jamais le même, et une manche ne se
-- résout qu'une fois. Chaque appel ne prend que quelques millisecondes.
create or replace function internal.duel_salle_verrou() returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('gal_duel_salles'));
end $$;

-- Le compte a-t-il trop appelé cette minute ? À part de internal.limit_exceeded, que l'écran dépasserait en interrogeant
-- chaque seconde.
create or replace function internal.duel_salle_trop_d_appels(p_uid uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_n integer;
begin
  insert into internal.duel_salle_appels as a (user_id, minute, n) values (p_uid, v_minute, 1)
  on conflict (user_id) do update
    set n = case when a.minute = excluded.minute then a.n + 1 else 1 end, minute = excluded.minute
  returning n into v_n;
  return v_n > internal.duel_salle_appels_max();
end $$;

-- Le solde d'un compte (0 sans ligne).
create or replace function internal.duel_salle_solde(p_uid uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_uid), 0)
$$;

-- Les matchs avec mise commencés ce jour par un compte, contre tous, ou contre un autre.
create or replace function internal.duel_salle_matchs_du_jour(p_uid uuid, p_jour date) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from internal.duel_matchs m where not m.essai and m.jour = p_jour and (m.joueur_a = p_uid or m.joueur_b = p_uid)
$$;
create or replace function internal.duel_salle_matchs_contre(p_uid uuid, p_autre uuid, p_jour date) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from internal.duel_matchs m
  where not m.essai and m.jour = p_jour
    and ((m.joueur_a = p_uid and m.joueur_b = p_autre) or (m.joueur_a = p_autre and m.joueur_b = p_uid))
$$;

-- Pourquoi ce compte ne peut pas jouer maintenant un match avec mise dans cette salle, avec cette main, ou null.
create or replace function internal.duel_salle_refus(p_uid uuid, p_mise integer, p_main text[]) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_status public.member_status;
begin
  select p.status into v_status from public.profiles p where p.user_id = p_uid;
  if v_status is distinct from 'validated' then return 'not_validated'; end if;
  if not exists (select 1 from internal.gaulois g where g.user_id = p_uid) then return 'no_gaulois'; end if;
  if not internal.duel_permis(p_uid) then return 'duel_ferme'; end if;
  if internal.duel_en_essai(p_uid) then return 'mode_god'; end if;
  if internal.duel_refus_de_main(p_uid, p_main) is not null then return internal.duel_refus_de_main(p_uid, p_main); end if;
  if internal.duel_salle_matchs_du_jour(p_uid, internal.duel_jour(now())) >= internal.duel_salle_par_jour() then return 'trop_de_matchs'; end if;
  if internal.duel_salle_solde(p_uid) < p_mise then return 'solde_insuffisant'; end if;
  return null;
end $$;

-- Commence un match : `p_a` attendait, `p_b` le rejoint (null : la machine, dans un essai). Prend les deux mises (sauf
-- dans un essai) et vide leurs attentes. Rend le numéro du match. Les deux comptes sont déjà verrouillés.
create or replace function internal.duel_salle_commencer(p_a uuid, p_main_a text[], p_b uuid, p_main_b text[], p_mise integer, p_essai boolean)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_banniere text := (select m.banniere from internal.gaulois_montre(p_a) m);
  v_lieu text := internal.duel_lieu_de(p_a);
  v_opt_a jsonb := jsonb_build_object('lieu', v_lieu, 'compagnon', internal.duel_compagnon_de(p_a), 'passifs', '[]'::jsonb);
  v_opt_b jsonb := jsonb_build_object('lieu', v_lieu, 'compagnon', case when p_b is null then null else internal.duel_compagnon_de(p_b) end, 'passifs', '[]'::jsonb);
  v_ca record;
  v_cb record;
  v_ouverte timestamptz := now() + make_interval(secs => internal.duel_salle_revelation());
  v_id bigint;
  v_u uuid;
begin
  select * into v_ca from internal.duel_preparer(p_main_a, v_opt_a);
  select * into v_cb from internal.duel_preparer(p_main_b, v_opt_b);
  insert into internal.duel_matchs (mise, essai, jour, joueur_a, joueur_b, banniere, main_a, main_b, options_a, options_b,
    cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, ouverte_le, limite, graine, machine_le)
  values (p_mise, p_essai, internal.duel_jour(now()), p_a, p_b, v_banniere, p_main_a, p_main_b, v_opt_a, v_opt_b,
    v_ca.cartes, v_cb.cartes, v_ca.atouts, v_cb.atouts, v_ca.etat, v_cb.etat,
    v_ouverte, v_ouverte + make_interval(secs => internal.duel_salle_secondes()),
    case when p_essai then 1 + floor(internal.village_hasard() * 2147483646)::bigint end,
    case when p_essai then v_ouverte + make_interval(secs => 1 + floor(internal.village_hasard() * 8)::integer) end)
  returning id into v_id;
  if not p_essai then
    -- Les deux mises, dans l'ordre des comptes (règle du journal des statères) ; 'solde_insuffisant' annule tout.
    for v_u in select x from unnest(array[p_a, p_b]) x order by x loop
      perform internal.village_debiter(v_u, 'duel_mise', p_mise, 'duel/salle/' || v_id);
    end loop;
  end if;
  delete from internal.duel_salle_attentes a where a.user_id = p_a or a.user_id = p_b;
  return v_id;
end $$;

-- Finit un match : son issue, l'argent, et l'annonce de la victoire. `p_verdict` du côté de a.
create or replace function internal.duel_salle_finir(p_id bigint, p_verdict integer, p_fin text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m internal.duel_matchs%rowtype;
  v_pot integer;
  v_part integer;
  v_gain integer;
  v_gagnant uuid;
  v_saison text;
  v_u uuid;
  v_ref text;
begin
  select * into v_m from internal.duel_matchs m where m.id = p_id for update;
  if not found or v_m.fini then return; end if;
  v_ref := 'duel/salle/' || p_id;
  -- Une place vide (un compte effacé) perd le match, quoi qu'il arrive : la mise de l'autre n'est jamais perdue.
  if not v_m.essai and p_verdict <> 0 and (v_m.joueur_a is null) <> (v_m.joueur_b is null) then
    p_verdict := case when v_m.joueur_a is null then -1 else 1 end;
    p_fin := 'quitte';
  elsif not v_m.essai and v_m.joueur_a is null and v_m.joueur_b is null then
    p_verdict := 0;
  end if;
  if not v_m.essai then
    if p_verdict = 0 then
      -- Égalité : chacun reprend sa mise, dans l'ordre des comptes.
      for v_u in select x from unnest(array[v_m.joueur_a, v_m.joueur_b]) x where x is not null order by x loop
        insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_u, 'duel_rendu', v_m.mise, v_ref);
      end loop;
    else
      v_pot := 2 * v_m.mise;
      v_part := v_pot * internal.duel_salle_part_cagnotte() / 100;
      v_gain := v_pot - v_part;
      v_gagnant := case when p_verdict = 1 then v_m.joueur_a else v_m.joueur_b end;
      v_saison := internal.duel_saison_de_la_cagnotte(v_m.jour);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_gagnant, 'duel_gain', v_gain, v_ref);
      if v_part > 0 then
        insert into internal.duel_cagnotte_mouvements (saison, nature, montant, match, ref) values (v_saison, 'part_du_pot', v_part, p_id, v_ref);
      end if;
    end if;
  end if;
  update internal.duel_matchs m
  set fini = true, verdict = p_verdict, fin = p_fin, cagnotte = v_part, gain = v_gain, saison = v_saison,
    pose_a = null, pose_b = null, fini_le = now()
  where m.id = p_id;
  -- La victoire attend son annonce : au combat, avec mise, le duel ouvert, deux Gaulois encore là.
  if not v_m.essai and p_verdict <> 0 and p_fin = 'combat' and v_m.joueur_a is not null and v_m.joueur_b is not null and cardinality(v_m.coups) >= 2
     and coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false) then
    insert into internal.duel_salle_annonces (match) values (p_id) on conflict (match) do nothing;
  end if;
end $$;

-- Résout la manche en cours quand les deux ont posé, avec le moteur du duel, tel quel.
create or replace function internal.duel_salle_resoudre(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m internal.duel_matchs%rowtype;
  v_r integer[];
  v_a integer[];
  v_b integer[];
  v_ouverte timestamptz := now() + make_interval(secs => internal.duel_salle_revelation());
begin
  select * into v_m from internal.duel_matchs m where m.id = p_id for update;
  if not found or v_m.fini or v_m.pose_a is null or v_m.pose_b is null then return; end if;
  v_r := internal.duel_manche(v_m.etat_a, v_m.etat_b, v_m.cartes_a, v_m.cartes_b, v_m.atouts_a, v_m.atouts_b, v_m.pose_a, v_m.pose_b, v_m.manche);
  v_a := v_r[2:1 + v_r[1]];
  v_b := v_r[2 + v_r[1]:cardinality(v_r)];
  update internal.duel_matchs m
  set etat_a = v_a, etat_b = v_b, coups = m.coups || array[v_m.pose_a, v_m.pose_b], manche = m.manche + 1,
    pose_a = null, pose_b = null, ouverte_le = v_ouverte, limite = v_ouverte + make_interval(secs => internal.duel_salle_secondes()),
    machine_le = case when m.essai then v_ouverte + make_interval(secs => 1 + floor(internal.village_hasard() * 8)::integer) end
  where m.id = p_id;
  if v_a[1] <= 0 or v_b[1] <= 0 or v_m.manche >= 40 then
    perform internal.duel_salle_finir(p_id, internal.duel_verdict(v_a, v_b), 'combat');
  end if;
end $$;

-- Dans un essai, la machine pose sa carte, sans voir celle du joueur, au niveau du guerrier, avec la graine du match.
create or replace function internal.duel_salle_machine(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m internal.duel_matchs%rowtype;
  v_n internal.duel_niveaux%rowtype;
  v_g bigint;
begin
  select * into v_m from internal.duel_matchs m where m.id = p_id for update;
  if not found or v_m.fini or not v_m.essai or v_m.pose_b is not null then return; end if;
  select * into v_n from internal.duel_niveaux n where n.niveau = 'guerrier';
  v_g := internal.duel_graine_suivante(v_m.graine);
  update internal.duel_matchs m
  set graine = v_g,
    pose_b = internal.duel_choisir(v_m.etat_b, v_m.etat_a, v_m.cartes_b, v_m.cartes_a, v_m.atouts_b, v_m.atouts_a, v_m.manche,
      v_g::double precision / 2147483647::double precision, v_n.fantaisie, v_n.loin)
  where m.id = p_id;
  perform internal.duel_salle_resoudre(p_id);
end $$;

-- Ce que le temps a fait depuis le dernier appel : les attentes sans nouvelles, la machine qui s'assoit et qui pose dans un
-- essai, les places vidées par un compte effacé, les manches échues. Sous le verrou des salles.
create or replace function internal.duel_salles_balayer() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_w internal.duel_salle_attentes%rowtype;
  v_m internal.duel_matchs%rowtype;
  v_defense text[];
begin
  delete from internal.duel_salle_attentes a
  where a.vu_le < now() - make_interval(secs => internal.duel_salle_presence())
     or not internal.duel_permis(a.user_id)
     or not exists (select 1 from public.profiles p where p.user_id = a.user_id and p.status = 'validated');
  -- Le duel fermé : la machine prend la place d'en face de celui qui attend (le titulaire), sans mise.
  if not v_ouvert then
    for v_w in select * from internal.duel_salle_attentes a
      where a.entre_le <= now() - make_interval(secs => internal.duel_salle_attente_machine()) order by a.entre_le loop
      if internal.duel_refus_de_main(v_w.user_id, v_w.main) is not null
         or exists (select 1 from internal.duel_matchs m where not m.fini and (m.joueur_a = v_w.user_id or m.joueur_b = v_w.user_id)) then
        delete from internal.duel_salle_attentes a where a.user_id = v_w.user_id;
        continue;
      end if;
      select d.main into v_defense from internal.duel_mains d where d.user_id = v_w.user_id;
      if v_defense is null or internal.duel_refus_de_main(v_w.user_id, v_defense) is not null then v_defense := v_w.main; end if;
      perform internal.duel_salle_commencer(v_w.user_id, v_w.main, null, v_defense, v_w.mise, true);
    end loop;
  end if;
  -- Le duel fermé pendant un match avec mise : égalité, chacun reprend sa mise.
  if not v_ouvert then
    for v_m in select * from internal.duel_matchs m where not m.fini and not m.essai order by m.id loop
      perform internal.duel_salle_finir(v_m.id, 0, 'ferme');
    end loop;
  end if;
  -- Un compte effacé en plein match : il le perd (internal.duel_salle_finir donne le match à la place restée pleine).
  for v_m in select * from internal.duel_matchs m where not m.fini and not m.essai and (m.joueur_a is null or m.joueur_b is null) order by m.id loop
    perform internal.duel_salle_finir(v_m.id, 1, 'quitte');
  end loop;
  -- La machine pose quand son heure est venue.
  for v_m in select * from internal.duel_matchs m where not m.fini and m.essai and m.pose_b is null and m.machine_le <= now() order by m.id loop
    perform internal.duel_salle_machine(v_m.id);
  end loop;
  -- Les manches échues : qui n'a pas posé perd ; si aucun des deux n'a posé, égalité.
  for v_m in select * from internal.duel_matchs m where not m.fini and m.limite < now() order by m.id loop
    perform internal.duel_salle_finir(v_m.id,
      case when v_m.pose_a is not null and v_m.pose_b is null then 1 when v_m.pose_a is null and v_m.pose_b is not null then -1 else 0 end,
      'temps');
  end loop;
end $$;

-- Un match tel que le voit un de ses joueurs (MatchDeSalle du contrat). Jamais la carte posée par l'autre avant la
-- résolution, jamais la graine de la machine, jamais un identifiant de compte.
create or replace function internal.duel_salle_vu(p_id bigint, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'match', m.id,
    'mise', m.mise,
    'essai', m.essai,
    'moi', case when moi_a then 'a' else 'b' end,
    'adversaire', case when m.essai then null when moi_a then internal.duel_gaulois_json(m.joueur_b) else internal.duel_gaulois_json(m.joueur_a) end,
    'banniere', m.banniere,
    'mains', jsonb_build_object('a', internal.duel_main_json(m.main_a), 'b', internal.duel_main_json(m.main_b)),
    'options', jsonb_build_object('a', m.options_a, 'b', m.options_b),
    'coups', coalesce((select jsonb_agg(jsonb_build_array(m.coups[2 * k - 1], m.coups[2 * k]) order by k)
      from generate_series(1, cardinality(m.coups) / 2) k), '[]'::jsonb),
    'manche', m.manche,
    'vies', jsonb_build_object('a', m.etat_a[1], 'b', m.etat_b[1]),
    'pose', case when moi_a then m.pose_a else m.pose_b end,
    'adverse_pose', case when moi_a then m.pose_b is not null else m.pose_a is not null end,
    'ouverte_le', m.ouverte_le,
    'limite', m.limite,
    'fini', m.fini,
    'verdict', case when m.verdict is null then null when moi_a then m.verdict else -m.verdict end,
    'fin', m.fin,
    'gain', case when not m.fini or m.essai then null
      when m.verdict = 0 then m.mise
      when (m.verdict = 1) = moi_a then coalesce(m.gain, 0)
      else 0 end,
    'cagnotte', m.cagnotte,
    'commence_le', m.commence_le,
    'fini_le', m.fini_le)
  from internal.duel_matchs m, lateral (select m.joueur_a is not distinct from p_uid as moi_a) x
  where m.id = p_id and (m.joueur_a = p_uid or m.joueur_b = p_uid)
$$;

-- Tout l'écran des salles pour un compte (EtatDesSalles du contrat).
create or replace function internal.duel_salles_etat(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_jour date := internal.duel_jour(now());
  v_joues integer := internal.duel_salle_matchs_du_jour(p_uid, v_jour);
  v_solde bigint := internal.duel_salle_solde(p_uid);
  v_essai boolean := internal.duel_en_essai(p_uid);
  v_saison text := internal.duel_saison_de_la_cagnotte(v_jour);
begin
  return jsonb_build_object(
    'ok', true,
    'ouvert', v_ouvert,
    'maintenant', now(),
    -- Ton solde, pour la bourse de la barre du jeu (comme les autres fonctions du village) ; l'écran des salles ne le montre
    -- pas, et jamais celui d'un autre.
    'solde', v_solde,
    'salles', (
      select jsonb_agg(jsonb_build_object(
          'mise', s.mise,
          'attente', exists (select 1 from internal.duel_salle_attentes a where a.mise = s.mise and a.user_id <> p_uid),
          'permise', not v_ouvert or (not v_essai and v_joues < internal.duel_salle_par_jour() and v_solde >= s.mise))
        order by s.n)
      from unnest(internal.duel_salles_mises()) with ordinality s(mise, n)),
    'regles', jsonb_build_object(
      'secondes', internal.duel_salle_secondes(), 'revelation', internal.duel_salle_revelation(),
      'part_cagnotte', internal.duel_salle_part_cagnotte(), 'par_jour', internal.duel_salle_par_jour(),
      'meme_adversaire', internal.duel_salle_meme_adversaire()),
    'jour', jsonb_build_object('jour', v_jour, 'joues', v_joues, 'au_plus', internal.duel_salle_par_jour()),
    'cagnotte', jsonb_build_object(
      'saison', v_saison,
      'nom', (select s.nom from internal.sentier_saisons s where s.saison = v_saison),
      'montant', coalesce((select c.montant from internal.duel_cagnottes c where c.saison = v_saison), 0)),
    'attente', (select jsonb_build_object('mise', a.mise, 'depuis', a.entre_le, 'main', internal.duel_main_json(a.main))
      from internal.duel_salle_attentes a where a.user_id = p_uid),
    'match', (select internal.duel_salle_vu(m.id, p_uid) from internal.duel_matchs m
      where not m.fini and (m.joueur_a = p_uid or m.joueur_b = p_uid) order by m.id desc limit 1),
    'dernier', (select internal.duel_salle_vu(m.id, p_uid) from internal.duel_matchs m
      where m.fini and (m.joueur_a = p_uid or m.joueur_b = p_uid) and m.fini_le > now() - interval '10 minutes'
      order by m.fini_le desc, m.id desc limit 1)
  );
end $$;

-- pg_cron, chaque minute : les manches échues se finissent même quand plus personne n'appelle.
create or replace function internal.duel_salles_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.duel_salle_verrou();
  perform internal.duel_salles_balayer();
end $$;

/* ---------- Pour les membres ---------- */

-- L'écran des salles, interrogé chaque seconde : les salles, ton attente, ton match, le dernier fini. Donne aussi des
-- nouvelles de qui attend.
create or replace function public.get_salles_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.duel_joueur();
    if internal.duel_salle_trop_d_appels(v_uid) then perform internal.fail('rate_limited'); end if;
    perform internal.duel_salle_verrou();
    update internal.duel_salle_attentes a set vu_le = now() where a.user_id = v_uid;
    perform internal.duel_salles_balayer();
    return internal.duel_salles_etat(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Entre dans la salle `p_mise` avec la main `p_main` { arme, tete, haut, pieds, bas } : rejoint le premier Gaulois qui y
-- attend et peut jouer (le match commence, les deux mises sont prises), sinon attend. Quitte l'attente d'une autre salle.
create or replace function public.entrer_salle_duel(p_mise integer, p_main jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_main text[] := internal.duel_main_lue(p_main);
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_jour date := internal.duel_jour(now());
  v_refus text;
  v_w internal.duel_salle_attentes%rowtype;
  v_adv uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.duel_salle_verrou();
    perform internal.duel_salles_balayer();
    if p_mise is null or not (p_mise = any (internal.duel_salles_mises())) then perform internal.fail('salle_inconnue'); end if;
    if v_main is null then perform internal.fail('main_invalide'); end if;
    if exists (select 1 from internal.duel_matchs m where not m.fini and (m.joueur_a = v_uid or m.joueur_b = v_uid)) then
      perform internal.fail('match_en_cours');
    end if;
    if not v_ouvert then
      -- L'essai du titulaire : il attend, la machine viendra ; rien n'est misé.
      v_refus := internal.duel_refus_de_main(v_uid, v_main);
      if v_refus is not null then perform internal.fail(v_refus); end if;
      insert into internal.duel_salle_attentes as a (user_id, mise, main) values (v_uid, p_mise, v_main)
      on conflict (user_id) do update set mise = excluded.mise, main = excluded.main, entre_le = now(), vu_le = now();
      return internal.duel_salles_etat(v_uid);
    end if;
    v_refus := internal.duel_salle_refus(v_uid, p_mise, v_main);
    if v_refus is not null then perform internal.fail(v_refus); end if;
    delete from internal.duel_salle_attentes a where a.user_id = v_uid;
    -- Le premier qui attend dans cette salle et peut jouer ; ceux qui ne le peuvent plus quittent la salle ; ceux contre qui
    -- tu as déjà joué 3 matchs aujourd'hui restent, pour un autre. Le choix se fait sans verrou ; puis les deux comptes,
    -- et eux seuls, se verrouillent dans l'ordre, comme au marché : deux appels ne s'attendent jamais en croix.
    for v_w in select * from internal.duel_salle_attentes a where a.mise = p_mise order by a.entre_le, a.user_id loop
      continue when internal.duel_salle_matchs_contre(v_uid, v_w.user_id, v_jour) >= internal.duel_salle_meme_adversaire();
      if internal.duel_salle_refus(v_w.user_id, p_mise, v_w.main) is not null
         or exists (select 1 from internal.duel_matchs m where not m.fini and (m.joueur_a = v_w.user_id or m.joueur_b = v_w.user_id)) then
        delete from internal.duel_salle_attentes a where a.user_id = v_w.user_id;
        continue;
      end if;
      v_adv := v_w.user_id;
      exit;
    end loop;
    if v_adv is not null then
      perform internal.village_verrou(least(v_uid, v_adv));
      perform internal.village_verrou(greatest(v_uid, v_adv));
      -- Relu sous les verrous : s'il ne peut plus jouer (il vient de dépenser), il sort de la salle et tu attends à sa place.
      if internal.duel_salle_refus(v_w.user_id, p_mise, v_w.main) is null then
        perform internal.duel_salle_commencer(v_w.user_id, v_w.main, v_uid, v_main, p_mise, false);
        return internal.duel_salles_etat(v_uid);
      end if;
      delete from internal.duel_salle_attentes a where a.user_id = v_adv;
    end if;
    insert into internal.duel_salle_attentes (user_id, mise, main) values (v_uid, p_mise, v_main);
    return internal.duel_salles_etat(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Pose ta carte `p_carte` (de 0 à 4) pour la manche `p_manche` du match `p_match`. Le serveur la garde sans la montrer ;
-- quand l'autre a posé aussi, la manche se résout.
create or replace function public.poser_carte_salle(p_match bigint, p_manche integer, p_carte integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_m internal.duel_matchs%rowtype;
  v_a boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.duel_salle_verrou();
    perform internal.duel_salles_balayer();
    select * into v_m from internal.duel_matchs m where m.id = p_match and (m.joueur_a = v_uid or m.joueur_b = v_uid) for update;
    if not found then perform internal.fail('match_inconnu'); end if;
    if v_m.fini then perform internal.fail('match_fini'); end if;
    if p_manche is distinct from v_m.manche then perform internal.fail('mauvaise_manche'); end if;
    v_a := v_m.joueur_a = v_uid;
    if (v_a and v_m.pose_a is not null) or (not v_a and v_m.pose_b is not null) then perform internal.fail('deja_pose'); end if;
    if p_carte is null or not (p_carte = any (internal.duel_libres(case when v_a then v_m.etat_a else v_m.etat_b end))) then
      perform internal.fail('carte_au_repos');
    end if;
    if v_a then
      update internal.duel_matchs m set pose_a = p_carte where m.id = v_m.id;
    else
      update internal.duel_matchs m set pose_b = p_carte where m.id = v_m.id;
    end if;
    perform internal.duel_salle_resoudre(v_m.id);
    return internal.duel_salles_etat(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Quitte ta salle, sans rien perdre ; avec `p_match`, quitte aussi ce match, qui est perdu. Sans `p_match`, un match qui
-- viendrait de commencer (l'écran ne l'a pas encore vu) n'est jamais touché.
create or replace function public.quitter_salle_duel(p_match bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_m internal.duel_matchs%rowtype;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.duel_salle_verrou();
    perform internal.duel_salles_balayer();
    delete from internal.duel_salle_attentes a where a.user_id = v_uid;
    if p_match is not null then
      select * into v_m from internal.duel_matchs m where m.id = p_match and (m.joueur_a = v_uid or m.joueur_b = v_uid) for update;
      if not found then perform internal.fail('match_inconnu'); end if;
      if not v_m.fini then
        perform internal.duel_salle_finir(v_m.id, case when v_m.joueur_a = v_uid then -1 else 1 end, 'quitte');
      end if;
    end if;
    return internal.duel_salles_etat(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La file des victoires, pour le robot (clé de service) ---------- */

-- Les victoires à annoncer sur Discord, les plus anciennes d'abord, 20 au plus : celles des duels (comme dans
-- 20261122000200) et celles des salles.
-- Remplacée par 20261122001000 : une victoire au combat avec mise dans une salle, le duel ouvert, y entre aussi, avec
-- `salle` (la mise de la salle) et `banniere_du_lieu` (la bannière de celui qui attendait, le lieu du match) ; `contre`
-- vaut « membre ». Jamais un solde ni un gain. Les numéros des matchs et des parties sont de la même suite : jamais deux
-- fois le même.
create or replace function public.duel_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'annonces', coalesce((
    select jsonb_agg(x.j order by x.le, x.id) from (
      select y.le, y.id, y.j from (
        select a.cree_le as le, a.partie as id, jsonb_build_object(
            'partie', a.partie, 'essai', a.essai, 'le', d.fini_le, 'contre', d.contre, 'boss', d.boss, 'manches', cardinality(d.coups) / 2,
            'main', internal.duel_main_json(d.main_a), 'main_vaincue', internal.duel_main_json(d.main_b),
            'carte', case when cardinality(d.coups) >= 2 then jsonb_build_object(
              'emplacement', (array['arme', 'tete', 'haut', 'pieds', 'bas'])[d.coups[cardinality(d.coups) - 1] + 1],
              'objet', d.main_a[d.coups[cardinality(d.coups) - 1] + 1]) end,
            'salle', null,
            'vainqueur', internal.duel_gaulois_json(d.user_id) || jsonb_build_object('pseudo', internal.member_pseudo(d.user_id)),
            'vaincu', case when d.contre = 'membre' and d.adversaire is not null
              then internal.duel_gaulois_json(d.adversaire) || jsonb_build_object('pseudo', internal.member_pseudo(d.adversaire)) end) as j
        from (select * from internal.duel_annonces a where a.annoncee_le is null order by a.cree_le, a.partie limit 20) a
        join internal.duel_parties d on d.id = a.partie
        union all
        select s.cree_le, s.match, jsonb_build_object(
            'partie', m.id, 'essai', false, 'le', m.fini_le, 'contre', 'membre', 'boss', null, 'manches', cardinality(m.coups) / 2,
            'main', internal.duel_main_json(case when m.verdict = 1 then m.main_a else m.main_b end),
            'main_vaincue', internal.duel_main_json(case when m.verdict = 1 then m.main_b else m.main_a end),
            'carte', case when cardinality(m.coups) >= 2 then jsonb_build_object(
              'emplacement', (array['arme', 'tete', 'haut', 'pieds', 'bas'])[m.coups[cardinality(m.coups) - case when m.verdict = 1 then 1 else 0 end] + 1],
              'objet', (case when m.verdict = 1 then m.main_a else m.main_b end)[m.coups[cardinality(m.coups) - case when m.verdict = 1 then 1 else 0 end] + 1]) end,
            'salle', m.mise,
            -- Le lieu du match : la bannière de celui qui attendait, qui n'est pas toujours celle du vaincu.
            'banniere_du_lieu', m.banniere,
            'vainqueur', internal.duel_gaulois_json(case when m.verdict = 1 then m.joueur_a else m.joueur_b end)
              || jsonb_build_object('pseudo', internal.member_pseudo(case when m.verdict = 1 then m.joueur_a else m.joueur_b end)),
            'vaincu', internal.duel_gaulois_json(case when m.verdict = 1 then m.joueur_b else m.joueur_a end)
              || jsonb_build_object('pseudo', internal.member_pseudo(case when m.verdict = 1 then m.joueur_b else m.joueur_a end)))
        from (select * from internal.duel_salle_annonces s where s.annoncee_le is null order by s.cree_le, s.match limit 20) s
        join internal.duel_matchs m on m.id = s.match
      ) y
      order by y.le, y.id
      limit 20
    ) x), '[]'::jsonb))
$$;

-- Note les victoires annoncées, des duels comme des salles.
-- Remplacée par 20261122001000 : elle note aussi les victoires des salles (mêmes numéros, jamais en double).
create or replace function public.noter_annonces_duel(p_parties bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
  v_s integer;
begin
  if p_parties is null or cardinality(p_parties) > 100 then return internal.error_json('invalid_request', ''); end if;
  update internal.duel_annonces a set annoncee_le = now() where a.partie = any (p_parties) and a.annoncee_le is null;
  get diagnostics v_n = row_count;
  update internal.duel_salle_annonces s set annoncee_le = now() where s.match = any (p_parties) and s.annoncee_le is null;
  get diagnostics v_s = row_count;
  return jsonb_build_object('ok', true, 'notees', v_n + v_s);
end $$;

/* ---------- Le mode GOD ---------- */

-- Avant chaque ligne du journal : pour un compte en essai, la nature devient 'test_…' ; ce qui sortirait du compte est
-- refusé ; les vrais gains passent tels quels.
-- Remplacée par 20261122001000 (depuis 20261121000600, ligne pour ligne) : 'duel_gain' et 'duel_rendu' sont de vrais gains
-- (les statères d'un match commencé avant l'essai : sinon ceux de l'autre joueur disparaîtraient), et 'duel_mise' est
-- refusée (un match avec mise pendant un essai).
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue', 'coffre_rendu', 'prix_baisse_rendu', 'duel_gain', 'duel_rendu') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande', 'duel_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;
revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

/* ---------- La sauvegarde ---------- */

-- La sauvegarde chiffrée (remplace celle de la migration 20261119000100, version 12, ligne pour ligne) : version 13, avec
-- la cagnotte des salles du duel (son journal) et les mises des matchs en cours, déjà prises au journal des statères.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 13,
    'exported_at', now(),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profiles t),
    'private_links', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash'), '[]') from public.private_links t),
    'membership_requests', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash' - 'claimed_text' - 'note'), '[]') from public.membership_requests t),
    'admin_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.admin_log t),
    'site_announcements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_announcements t),
    'site_events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_events t),
    'event_attendance', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.event_attendance t),
    'polls', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.polls t),
    'poll_totals', (select coalesce(jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'choice', v.choice, 'votes', v.votes)), '[]') from (
      select poll_id, choice, count(*) as votes from internal.poll_votes group by poll_id, choice
    ) v),
    'ideas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.ideas t),
    'idea_support_totals', (select coalesce(jsonb_agg(jsonb_build_object('idea_id', s.idea_id, 'supports', s.supports)), '[]') from (
      select idea_id, count(*) as supports from internal.idea_supports group by idea_id
    ) s),
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome'),
    'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t),
    'alliances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliances t),
    'alliance_clans', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_clans t),
    'alliance_zones', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('mask', translate(encode(t.mask, 'base64'), E'\n', ''))), '[]') from internal.alliance_zones t),
    'alliance_allies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_allies t),
    'alliance_troops', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_troops t),
    -- Ajouts de la version 5 : le village des Gaulois.
    'gaulois', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.user_id), '[]') from internal.gaulois t),
    'gaulois_inventaire', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.emplacement, t.objet), '[]') from internal.gaulois_inventaire t),
    'stateres_mouvements', (select coalesce(jsonb_agg(to_jsonb(t) - 'partie' - 'debut' - 'points' - 'gaulois' order by t.id), '[]') from internal.stateres_mouvements t where t.nature <> 'victoire'),
    'stateres_victoires_totaux', (select coalesce(jsonb_agg(jsonb_build_object('user_id', v.user_id, 'stateres', v.stateres) order by v.user_id), '[]') from (
      select user_id, sum(montant) as stateres from internal.stateres_mouvements where nature = 'victoire' group by user_id
    ) v),
    'stateres_soldes', (select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'solde', t.solde) order by t.user_id), '[]') from internal.stateres_soldes t),
    'village_prix', (select coalesce(jsonb_agg(to_jsonb(t) order by t.rarete), '[]') from internal.village_prix t),
    'village_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_pochette t),
    'marche_offres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_offres t),
    -- Ajouts de la version 6 : le réglage et la dépense des bulles du village.
    'village_vie_reglage', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_vie_reglage t),
    'village_vie_depense', (select coalesce(jsonb_agg(to_jsonb(t) order by t.mois), '[]') from internal.village_vie_depense t),
    -- Ajouts de la version 7 : les familiers de chaque compte et le réglage de leur pochette.
    'gaulois_familiers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.familier), '[]') from internal.gaulois_familiers t),
    'familiers_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.familiers_pochette t),
    -- Ajout de la version 8 : les bannières de chaque compte.
    'gaulois_bannieres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.banniere), '[]') from internal.gaulois_bannieres t),
    -- Ajouts de la version 9 : les Gaulois uniques de chaque compte et le réglage de leur pochette.
    'gaulois_modeles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.modele), '[]') from internal.gaulois_modeles t),
    'modeles_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.modeles_pochette t),
    -- Ajout de la version 10 : les finitions de carte de chaque compte.
    'gaulois_cartes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.finition), '[]') from internal.gaulois_cartes t),
    -- Ajout de la version 11 : les cadres de carte de chaque compte.
    'gaulois_cadres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.cadre), '[]') from internal.gaulois_cadres t),
    -- Ajout de la version 12 : les demandes d'achat du marché.
    'marche_demandes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_demandes t),
    -- Ajouts de la version 13 : le journal de la cagnotte des salles du duel, et les mises des matchs en cours (prises au
    -- journal des statères, rendues ou gagnées à la fin du match).
    'duel_cagnotte_mouvements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.duel_cagnotte_mouvements t),
    'duel_matchs_en_cours', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'mise', t.mise, 'joueur_a', t.joueur_a, 'joueur_b', t.joueur_b, 'commence_le', t.commence_le) order by t.id), '[]')
      from internal.duel_matchs t where not t.fini and not t.essai)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;

/* ---------- Les droits ---------- */

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.duel_salles_mises()', 'internal.duel_salle_secondes()', 'internal.duel_salle_revelation()', 'internal.duel_salle_presence()',
    'internal.duel_salle_part_cagnotte()', 'internal.duel_salle_par_jour()', 'internal.duel_salle_meme_adversaire()',
    'internal.duel_salle_attente_machine()', 'internal.duel_salle_appels_max()',
    'internal.duel_cagnotte_tenir()', 'internal.duel_cagnotte_figee()', 'internal.duel_cagnotte_garde()',
    'internal.duel_saison_de_la_cagnotte(date)', 'internal.duel_salle_verrou()', 'internal.duel_salle_trop_d_appels(uuid)',
    'internal.duel_salle_solde(uuid)', 'internal.duel_salle_matchs_du_jour(uuid, date)', 'internal.duel_salle_matchs_contre(uuid, uuid, date)',
    'internal.duel_salle_refus(uuid, integer, text[])',
    'internal.duel_salle_commencer(uuid, text[], uuid, text[], integer, boolean)', 'internal.duel_salle_finir(bigint, integer, text)',
    'internal.duel_salle_resoudre(bigint)', 'internal.duel_salle_machine(bigint)', 'internal.duel_salles_balayer()',
    'internal.duel_salle_vu(bigint, uuid)', 'internal.duel_salles_etat(uuid)', 'internal.duel_salles_reveil()',
    'public.get_salles_duel()', 'public.entrer_salle_duel(integer, jsonb)', 'public.poser_carte_salle(bigint, integer, integer)',
    'public.quitter_salle_duel(bigint)', 'public.duel_annonces_a_envoyer()', 'public.noter_annonces_duel(bigint[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
end $$;

grant execute on function public.get_salles_duel() to authenticated;
grant execute on function public.entrer_salle_duel(integer, jsonb) to authenticated;
grant execute on function public.poser_carte_salle(bigint, integer, integer) to authenticated;
grant execute on function public.quitter_salle_duel(bigint) to authenticated;
grant execute on function public.duel_annonces_a_envoyer() to service_role;
grant execute on function public.noter_annonces_duel(bigint[]) to service_role;

-- Chaque minute : les manches échues se finissent même quand plus personne n'appelle. La tâche porte un nom : la planifier
-- de nouveau la remplace. Sans pg_cron, rien n'est planifié (chaque appel des salles fait le même travail).
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-duel-salles', '* * * * *', 'select internal.duel_salles_reveil()');
  end if;
end $cron$;
