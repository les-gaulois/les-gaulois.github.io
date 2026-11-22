-- Le duel des Gaulois, vague 2, chantier 5 : le tableau des duellistes et la saison (docs/DIRECTION.md, « Le tableau des
-- duellistes » ; la règle du classement en TypeScript : src/lib/village/tableau-duel.ts ; formes des réponses :
-- src/lib/village/contrat-tableau.ts ; le duel : 20261122000100, 20261122000200 ; les salles : 20261122001000).
--
-- Demande du pilote (22 novembre 2026) : « Le tableau des duellistes de la semaine, avec un insigne pour le premier, statères
-- en récompense en fin de saison. Je vérifierai d'abord qu'il récompense vraiment le talent et pas la chance. »
--
-- Les règles :
-- - LA SEMAINE va du mardi 21 h 30 au mardi 21 h 30, heure de Paris, comme la loterie. Elle porte le nom du mardi où elle
--   finit. Un duel compte pour la semaine où il a fini. Le premier tableau est celui de la semaine qui finit le mardi 24
--   novembre 2026.
-- - CE QUI COMPTE : les duels comptés (internal.duel_parties.compte) contre le boss du jour et contre la main de défense
--   d'un autre membre, et les matchs des salles avec mise (pas les essais, pas un match fini parce que le duel a été fermé,
--   pas un match dont un joueur a effacé son compte). Un forfait en salle (le temps, un départ) est une défaite pour qui
--   l'a laissé faire et ne compte pas pour l'autre : perdre exprès en s'en allant ne fait monter personne. Le serveur ne compte déjà rien tant que le duel est fermé, ni pendant
--   un essai du mode GOD, ni contre sa propre main. Un même adversaire (un boss, ou un membre, en défense ou en salle) ne
--   compte qu'une fois par jour (le premier duel du jour contre lui, jour de Paris où le duel a commencé), et au plus deux
--   fois par semaine.
-- - L'ATTENDU de chaque duel : contre un boss ou une main de défense (telle qu'elle était), la part de points que tous les
--   Gaulois y ont prise jusque-là, tirée vers la moyenne de son genre comme si elle avait déjà été jouée 3 fois à la
--   moyenne ; en salle, l'inverse de la part que l'adversaire prend d'ordinaire en salle, tirée vers une demie. Battre un
--   adversaire que tout le monde bat rapporte peu ; battre un boss que peu de Gaulois battent rapporte beaucoup.
-- - LA NOTE : 50, plus cent fois ce que le joueur a pris de plus que l'attendu (1 par victoire, une demie par égalité, 0
--   par défaite), divisé par ses duels retenus plus 10 (la semaine) ou 20 (la saison) : la prudence. On est classé à partir
--   de 5 duels retenus dans la semaine, 15 dans la saison. La meilleure note d'abord, puis le plus de duels, puis qui y est
--   arrivé le premier. Seuls les comptes validés paraissent ; jamais un solde.
-- - L'ESSAI CONTRE LE HASARD (scripts/essai-tableau-duel.ts, 60 saisons de six semaines simulées avec le vrai moteur, des
--   joueurs de forces connues et les vrais boss) a choisi ces chiffres : le premier de la semaine est l'un des plus forts
--   64 fois sur 100 (un Gaulois tiré au sort parmi les classés : 28), celui de la saison 82 fois sur 100 (27) ; un Gaulois
--   moyen ne passe pas devant un autre de même force en jouant tout ce qu'il peut, en n'attaquant que des comptes faibles
--   ou avec un ami faible qui perd exprès (47, 54 et 50 sur 100 la semaine ; 47, 50 et 48 la saison, 50 voulant dire
--   « rien »). Une entente avec un ami fort qui perd exprès au combat aide un peu : un Gaulois moyen finit alors premier 6
--   semaines sur 100 au lieu de 3 (12 avec trois amis forts).
-- - L'INSIGNE : chaque mardi à 21 h 30, le premier du tableau de la semaine qui finit reçoit l'insigne du duelliste de la
--   semaine (internal.duel_semaines) : il le garde pour toujours, une fois par semaine gagnée. Sans classé, personne.
-- - LA SAISON est celle du pass (internal.sentier_saisons ; la saison 1 va du 17 novembre au 28 décembre 2026) : les duels
--   finis entre son premier jour 0 h et le lendemain de son dernier jour 0 h, à Paris. Le mardi qui suit sa fin, à 21 h 30
--   (le 29 décembre 2026 pour la saison 1), le serveur partage sa cagnotte (internal.duel_cagnottes, les 10 % des pots des
--   salles) entre les trois premiers du tableau de la saison : 50, 30 et 20 %, arrondis vers le bas en statères entiers.
--   Ce qui reste des arrondis, et la part d'une place vide, vont à la cagnotte de la saison suivante (celle qui reçoit les
--   parts le lendemain de la fin, sinon « a-venir »). AUCUN STATÈRE N'EST CRÉÉ : chaque part sort de la cagnotte par une
--   ligne négative de son journal (nature 'partage') et entre au journal des statères (nature 'duel_saison') dans la même
--   transaction ; un report fait deux lignes ('report'), une négative, une positive. La somme ne bouge jamais.
-- - LES RESTES : une part arrivée dans la cagnotte d'une saison déjà partagée, et la cagnotte « a-venir » quand une saison
--   existe, vont à la cagnotte de la saison qui reçoit les parts ce jour-là, par deux lignes 'report'.
-- - LE MODE GOD : 'duel_saison' passe parmi les vrais gains de internal.village_god_mouvement (sinon la part d'un gagnant en
--   essai serait rendue au journal et perdue). Rien n'est compté pendant un essai : le serveur ne le compte déjà pas.
-- - LE RÉVEIL : pg_cron toutes les 5 minutes (gal-duel-tableau), et chaque lecture du tableau, couronnent les semaines
--   finies, partagent les saisons dont l'heure est passée et déplacent les restes. Un seul réveil à la fois.
--
-- Ce qui est gardé :
-- - internal.duel_semaines : chaque semaine couronnée, son premier (l'insigne), sa note, ses duels, le nombre de classés ;
-- - internal.duel_saisons_partagees : chaque saison partagée, sa cagnotte, ce qui a été versé, ce qui est reporté, où ;
-- - internal.duel_saison_places : les trois places de chaque saison partagée et les statères de chacune.
-- Un compte effacé laisse ses semaines et ses places, sans nom.
--
-- Qui peut quoi :
-- - get_tableau_duel : un compte permis par l'interrupteur du duel (internal.duel_joueur) ; les noms du village, jamais un
--   solde ; la cagnotte est un total, pas le solde de quelqu'un.
-- - get_mes_insignes_duel : un compte validé qui a son Gaulois (internal.village_acheteur), pour sa carte.
--
-- Ce qui change ailleurs : internal.village_god_mouvement (de 20261122001000, ligne pour ligne, 'duel_saison' en plus). Aucune
-- règle du duel ne change ; aucune donnée existante n'est touchée. Rejouée, elle se remplace par la même.

/* ---------- Les réglages (REGLES_DU_TABLEAU de tableau-duel.ts) ---------- */

create or replace function internal.duel_tableau_poids() returns numeric
language sql immutable set search_path = public, pg_temp as $$ select 3::numeric $$;

create or replace function internal.duel_tableau_prudence(p_saison boolean) returns numeric
language sql immutable set search_path = public, pg_temp as $$ select case when p_saison then 20::numeric else 10::numeric end $$;

create or replace function internal.duel_tableau_minimum(p_saison boolean) returns integer
language sql immutable set search_path = public, pg_temp as $$ select case when p_saison then 15 else 5 end $$;

create or replace function internal.duel_tableau_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 2 $$;

create or replace function internal.duel_tableau_parts() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[50, 30, 20] $$;

-- Le mardi où finit la première semaine couronnée.
create or replace function internal.duel_tableau_premiere_semaine() returns date
language sql immutable set search_path = public, pg_temp as $$ select date '2026-11-24' $$;

/* ---------- Le calendrier ---------- */

-- La semaine d'un instant : le mardi (à Paris) du premier 21 h 30 qui le suit.
create or replace function internal.duel_semaine_de(p_at timestamptz) returns date
language sql stable set search_path = public, pg_temp as $$
  select case when l.ici < l.mardi + time '21:30' then l.mardi else l.mardi + 7 end
  from (select p_at at time zone 'Europe/Paris' as ici, date_trunc('week', p_at at time zone 'Europe/Paris')::date + 1 as mardi) l
$$;

-- La fin d'une semaine (son mardi, 21 h 30 à Paris) et son début (le mardi d'avant, 21 h 30).
create or replace function internal.duel_semaine_fin(p_semaine date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$ select (p_semaine + time '21:30') at time zone 'Europe/Paris' $$;
create or replace function internal.duel_semaine_debut(p_semaine date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$ select ((p_semaine - 7) + time '21:30') at time zone 'Europe/Paris' $$;

-- Les bornes d'une saison du pass : son premier jour 0 h, le lendemain de son dernier jour 0 h, à Paris ; et l'heure de
-- son partage, le premier mardi 21 h 30 qui suit sa fin.
create or replace function internal.duel_saison_debut(p_saison text) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select (s.debut::timestamp) at time zone 'Europe/Paris' from internal.sentier_saisons s where s.saison = p_saison
$$;
create or replace function internal.duel_saison_fin(p_saison text) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select ((s.fin + 1)::timestamp) at time zone 'Europe/Paris' from internal.sentier_saisons s where s.saison = p_saison
$$;
create or replace function internal.duel_saison_partage_le(p_saison text) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select internal.duel_semaine_fin(internal.duel_semaine_de(internal.duel_saison_fin(p_saison)))
$$;

/* ---------- Les tables ---------- */

create table if not exists internal.duel_semaines (
  -- Le mardi où la semaine finit, à 21 h 30.
  semaine date primary key,
  -- Le premier du tableau, qui reçoit l'insigne ; null sans classé (ou si son compte a été effacé depuis).
  premier uuid references public.profiles (user_id) on delete set null,
  note numeric,
  duels integer,
  classes integer not null default 0 check (classes >= 0),
  couronnee_le timestamptz not null default now()
);
create index if not exists duel_semaines_premier on internal.duel_semaines (premier, semaine desc);

create table if not exists internal.duel_saisons_partagees (
  saison text primary key references internal.sentier_saisons (saison),
  -- Ce que la cagnotte contenait au partage, ce qui a été versé aux trois premiers, ce qui est allé à la saison suivante.
  cagnotte bigint not null check (cagnotte >= 0),
  verse bigint not null check (verse >= 0),
  reste bigint not null check (reste >= 0),
  vers text,
  partagee_le timestamptz not null default now(),
  check (verse + reste = cagnotte)
);

create table if not exists internal.duel_saison_places (
  saison text not null references internal.duel_saisons_partagees (saison),
  place integer not null check (place between 1 and 3),
  user_id uuid references public.profiles (user_id) on delete set null,
  note numeric not null,
  duels integer not null,
  stateres integer not null check (stateres >= 0),
  primary key (saison, place)
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
do $$
declare
  v_t text;
begin
  foreach v_t in array array['duel_semaines', 'duel_saisons_partagees', 'duel_saison_places'] loop
    execute format('alter table internal.%I enable row level security', v_t);
    execute format('revoke all on table internal.%I from public, anon, authenticated', v_t);
  end loop;
end $$;

/* ---------- Le classement (classer de tableau-duel.ts) ---------- */

-- Tous les résultats comptés, du côté de chaque joueur, des duels finis avant `p_jusqua` : `adversaire` « boss:<id> » ou
-- « membre:<id> » ; `cle` celle de l'attendu (le boss, ou la main de défense telle qu'elle était) ; `autre` le membre d'en
-- face en salle ; `r` 1, une demie ou 0 ; `jour` le jour de Paris où le duel a commencé ; `semaine` celle où il a fini.
create or replace function internal.duel_tableau_resultats(p_jusqua timestamptz)
returns table (joueur uuid, type text, adversaire text, cle text, autre uuid, r numeric, jour date, semaine date, fini_le timestamptz, ordre bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.user_id,
    case when d.contre = 'boss' then 'boss' else 'defense' end,
    case when d.contre = 'boss' then 'boss:' || d.boss else 'membre:' || d.adversaire::text end,
    case when d.contre = 'boss' then 'boss:' || d.boss else 'membre:' || d.adversaire::text || '|' || array_to_string(d.main_b, ',') end,
    null::uuid,
    case d.verdict when 1 then 1::numeric when 0 then 0.5 else 0::numeric end,
    d.jour, internal.duel_semaine_de(d.fini_le), d.fini_le, d.id
  from internal.duel_parties d
  where d.compte and d.fini and d.fini_le < p_jusqua
    and (d.contre = 'boss' or (d.adversaire is not null and d.adversaire <> d.user_id))
  union all
  select x.joueur, 'salle', 'membre:' || x.autre::text, 'membre:' || x.autre::text, x.autre, x.r, m.jour, internal.duel_semaine_de(m.fini_le), m.fini_le, m.id
  from internal.duel_matchs m
  cross join lateral (values
    (m.joueur_a, m.joueur_b, case m.verdict when 1 then 1::numeric when 0 then 0.5 else 0::numeric end),
    (m.joueur_b, m.joueur_a, case m.verdict when -1 then 1::numeric when 0 then 0.5 else 0::numeric end)) x(joueur, autre, r)
  where not m.essai and m.fini and m.fin <> 'ferme' and m.joueur_a is not null and m.joueur_b is not null and m.fini_le < p_jusqua
    -- un forfait (le temps, un départ) est une défaite pour qui l'a laissé faire, et rien pour l'autre : perdre exprès en
    -- s'en allant ne fait monter personne ; une égalité ne compte qu'au combat
    and (m.fin = 'combat' or x.r = 0)
$$;

-- Le classement des duels retenus finis dans [p_depuis, p_jusqua), l'attendu fait de tous les duels finis avant p_jusqua :
-- la note exacte de chaque joueur, ses duels retenus, ses victoires, ses égalités, son dernier duel. Tous les joueurs,
-- classés ou non (voir internal.duel_tableau_lignes).
create or replace function internal.duel_tableau_classement(p_depuis timestamptz, p_jusqua timestamptz, p_prudence numeric)
returns table (joueur uuid, note numeric, duels integer, victoires integer, egalites integer, dernier timestamptz, dernier_ordre bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with tous as (
    select * from internal.duel_tableau_resultats(p_jusqua)
  ),
  du_jour as (
    -- le premier duel du jour contre chaque adversaire
    select distinct on (t.joueur, t.adversaire, t.jour) t.*
    from tous t
    order by t.joueur, t.adversaire, t.jour, t.fini_le, t.ordre
  ),
  retenus as (
    -- puis au plus deux par adversaire et par semaine, dans la fenêtre
    select j.* from (
      select d.*, row_number() over (partition by d.joueur, d.adversaire, d.semaine order by d.fini_le, d.ordre) as n
      from du_jour d
    ) j
    where j.n <= internal.duel_tableau_plafond() and j.fini_le >= p_depuis
  ),
  genre as (select t.type, avg(t.r) as moyenne from tous t where t.type <> 'salle' group by t.type),
  contre as (select t.cle, sum(t.r) as s, count(*) as n from tous t where t.type <> 'salle' group by t.cle),
  en_salle as (select t.joueur, sum(t.r) as s, count(*) as n from tous t where t.type = 'salle' group by t.joueur),
  attendus as (
    select r.joueur, r.r, r.fini_le, r.ordre,
      case
        when r.type = 'salle' then 1 - (coalesce(es.s, 0) + internal.duel_tableau_poids() * 0.5) / (coalesce(es.n, 0) + internal.duel_tableau_poids())
        else (coalesce(c.s, 0) + internal.duel_tableau_poids() * coalesce(g.moyenne, 0.5)) / (coalesce(c.n, 0) + internal.duel_tableau_poids())
      end as e
    from retenus r
    left join contre c on r.type <> 'salle' and c.cle = r.cle
    left join genre g on r.type <> 'salle' and g.type = r.type
    left join en_salle es on r.type = 'salle' and es.joueur = r.autre
  )
  select a.joueur, 50 + 100 * sum(a.r - a.e) / (count(*) + p_prudence),
    count(*)::integer, (count(*) filter (where a.r = 1))::integer, (count(*) filter (where a.r = 0.5))::integer,
    max(a.fini_le), max(a.ordre)
  from attendus a
  group by a.joueur
$$;

-- Les lignes d'un tableau (semaine ou saison) : les comptes validés, leur rang parmi les classés (null pour qui n'a pas
-- encore assez de duels).
create or replace function internal.duel_tableau_lignes(p_depuis timestamptz, p_jusqua timestamptz, p_saison boolean)
returns table (joueur uuid, rang integer, note numeric, duels integer, victoires integer, egalites integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select x.joueur, case when x.classe then x.n::integer end, x.note, x.duels, x.victoires, x.egalites
  from (
    select c.*, c.duels >= internal.duel_tableau_minimum(p_saison) as classe,
      row_number() over (order by (c.duels >= internal.duel_tableau_minimum(p_saison)) desc, c.note desc, c.duels desc, c.dernier, c.dernier_ordre, c.joueur) as n
    from internal.duel_tableau_classement(p_depuis, p_jusqua, internal.duel_tableau_prudence(p_saison)) c
    join public.profiles p on p.user_id = c.joueur and p.status = 'validated'
  ) x
$$;

/* ---------- L'insigne, le partage, les restes ---------- */

-- Couronne une semaine finie : son premier reçoit l'insigne. Une fois par semaine ; sans classé, personne.
create or replace function internal.duel_couronner(p_semaine date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_classes integer;
  v_premier uuid;
  v_note numeric;
  v_duels integer;
begin
  if exists (select 1 from internal.duel_semaines s where s.semaine = p_semaine) then return; end if;
  with l as (select * from internal.duel_tableau_lignes(internal.duel_semaine_debut(p_semaine), internal.duel_semaine_fin(p_semaine), false))
  select (select count(*) from l where l.rang is not null), (select l.joueur from l where l.rang = 1),
    (select l.note from l where l.rang = 1), (select l.duels from l where l.rang = 1)
  into v_classes, v_premier, v_note, v_duels;
  insert into internal.duel_semaines (semaine, premier, note, duels, classes)
  values (p_semaine, v_premier, v_note, v_duels, v_classes)
  on conflict (semaine) do nothing;
end $$;

-- Partage la cagnotte d'une saison entre les trois premiers de son tableau, sans créer un statère : chaque part sort de la
-- cagnotte par son journal et entre au journal des statères, dans la même transaction, dans l'ordre des comptes ; le reste
-- (arrondis, places vides) va à la saison suivante. Une fois par saison.
create or replace function internal.duel_partager(p_saison text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s internal.sentier_saisons%rowtype;
  v_montant bigint;
  v_parts integer[] := internal.duel_tableau_parts();
  v_vers text;
  v_verse bigint := 0;
  v_reste bigint;
  v_places integer[];
  v_joueurs uuid[];
  v_notes numeric[];
  v_duels integer[];
  v_part integer;
  v_ref text;
begin
  select * into v_s from internal.sentier_saisons s where s.saison = p_saison;
  if not found or exists (select 1 from internal.duel_saisons_partagees p where p.saison = p_saison) then return; end if;
  v_montant := coalesce((select c.montant from internal.duel_cagnottes c where c.saison = p_saison), 0);
  v_vers := internal.duel_saison_de_la_cagnotte(v_s.fin + 1);
  -- les trois premiers, dans l'ordre des comptes (la règle du journal des statères)
  select coalesce(array_agg(l.rang order by l.joueur), '{}'), coalesce(array_agg(l.joueur order by l.joueur), '{}'),
    coalesce(array_agg(l.note order by l.joueur), '{}'), coalesce(array_agg(l.duels order by l.joueur), '{}')
  into v_places, v_joueurs, v_notes, v_duels
  from internal.duel_tableau_lignes(internal.duel_saison_debut(p_saison), internal.duel_saison_fin(p_saison), true) l
  where l.rang between 1 and 3;
  -- chaque part arrondie vers le bas, en statères entiers
  for k in 1 .. cardinality(v_places) loop
    v_verse := v_verse + (v_montant * v_parts[v_places[k]]) / 100;
  end loop;
  v_reste := v_montant - v_verse;
  insert into internal.duel_saisons_partagees (saison, cagnotte, verse, reste, vers) values (p_saison, v_montant, v_verse, v_reste, case when v_reste > 0 then v_vers end);
  for k in 1 .. cardinality(v_places) loop
    v_part := ((v_montant * v_parts[v_places[k]]) / 100)::integer;
    v_ref := 'duel/saison/' || p_saison || '/' || v_places[k];
    insert into internal.duel_saison_places (saison, place, user_id, note, duels, stateres) values (p_saison, v_places[k], v_joueurs[k], v_notes[k], v_duels[k], v_part);
    if v_part > 0 then
      insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values (p_saison, 'partage', -v_part, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_joueurs[k], 'duel_saison', v_part, v_ref);
    end if;
  end loop;
  if v_reste > 0 then
    v_ref := 'duel/saison/' || p_saison || '/reste';
    insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values (p_saison, 'report', -v_reste, v_ref);
    insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values (v_vers, 'report', v_reste, v_ref);
  end if;
end $$;

-- Le réveil : couronne les semaines finies, partage les saisons dont l'heure est passée, puis envoie les restes (une part
-- arrivée dans une saison déjà partagée, la cagnotte « a-venir ») à la saison qui reçoit les parts aujourd'hui. Un seul à la
-- fois.
create or replace function internal.duel_tableau_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_derniere date := internal.duel_semaine_de(now()) - 7;
  v_premiere date;
  v_s date;
  v_saison text;
  v_ici text := internal.duel_saison_de_la_cagnotte(internal.duel_jour(now()));
  v_c record;
begin
  -- rien à faire : pas de verrou (chaque lecture du tableau passe par ici)
  if coalesce((select max(s.semaine) from internal.duel_semaines s), internal.duel_tableau_premiere_semaine() - 7) >= v_derniere
     and not exists (
       select 1 from internal.sentier_saisons s
       where internal.duel_saison_partage_le(s.saison) <= now() and not exists (select 1 from internal.duel_saisons_partagees p where p.saison = s.saison))
     and not exists (
       select 1 from internal.duel_cagnottes c
       where c.montant > 0 and c.saison <> v_ici
         and (c.saison = 'a-venir' or exists (select 1 from internal.duel_saisons_partagees p where p.saison = c.saison))) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('gal_duel_tableau'));
  v_premiere := greatest(internal.duel_tableau_premiere_semaine(), coalesce((select max(s.semaine) + 7 from internal.duel_semaines s), internal.duel_tableau_premiere_semaine()));
  v_s := v_premiere;
  while v_s <= v_derniere loop
    perform internal.duel_couronner(v_s);
    v_s := v_s + 7;
  end loop;
  for v_saison in
    select s.saison from internal.sentier_saisons s
    where internal.duel_saison_partage_le(s.saison) <= now()
      and not exists (select 1 from internal.duel_saisons_partagees p where p.saison = s.saison)
    order by s.debut
  loop
    perform internal.duel_partager(v_saison);
  end loop;
  for v_c in
    select c.saison, c.montant from internal.duel_cagnottes c
    where c.montant > 0 and c.saison <> v_ici
      and (c.saison = 'a-venir' or exists (select 1 from internal.duel_saisons_partagees p where p.saison = c.saison))
    order by c.saison
  loop
    insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values (v_c.saison, 'report', -v_c.montant, 'duel/report/' || v_c.saison);
    insert into internal.duel_cagnotte_mouvements (saison, nature, montant, ref) values (v_ici, 'report', v_c.montant, 'duel/report/' || v_c.saison);
  end loop;
end $$;

/* ---------- Ce que voit l'écran ---------- */

-- Le nombre de semaines gagnées par un compte.
create or replace function internal.duel_insignes_de(p_uid uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from internal.duel_semaines s where s.premier = p_uid
$$;

-- Un tableau, pour l'écran : les 20 premiers (le Gaulois de chacun, son nom du village, sa note arrondie, ses duels, ses
-- victoires, ses égalités, ses semaines gagnées) et la ligne de l'appelant (son rang, ou ce qu'il lui manque de duels).
create or replace function internal.duel_tableau_json(p_depuis timestamptz, p_jusqua timestamptz, p_saison boolean, p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_min integer := internal.duel_tableau_minimum(p_saison);
  v jsonb;
begin
  with l as (select * from internal.duel_tableau_lignes(p_depuis, p_jusqua, p_saison))
  select jsonb_build_object(
    'classes', (select count(*) from l where l.rang is not null),
    'minimum', v_min,
    'lignes', coalesce((
      select jsonb_agg(coalesce(internal.duel_gaulois_json(l.joueur), '{}'::jsonb) || jsonb_build_object(
          'rang', l.rang, 'note', round(l.note)::integer, 'duels', l.duels, 'victoires', l.victoires, 'egalites', l.egalites,
          'insignes', internal.duel_insignes_de(l.joueur), 'moi', l.joueur = p_uid)
        order by l.rang)
      from l where l.rang <= 20), '[]'::jsonb),
    'moi', coalesce(internal.duel_gaulois_json(p_uid), '{}'::jsonb) || coalesce((
      select jsonb_build_object('rang', l.rang, 'note', case when l.rang is not null then round(l.note)::integer end,
          'duels', l.duels, 'victoires', l.victoires, 'egalites', l.egalites, 'manque', greatest(0, v_min - l.duels))
      from l where l.joueur = p_uid),
      jsonb_build_object('rang', null, 'note', null, 'duels', 0, 'victoires', 0, 'egalites', 0, 'manque', v_min))
  ) into v;
  return v;
end $$;

-- Tout l'écran du tableau (EtatDuTableau de src/lib/village/contrat-tableau.ts) : la semaine en cours, la dernière semaine
-- couronnée, la saison en jeu (la plus ancienne commencée et pas encore partagée, sinon la prochaine) avec sa cagnotte et
-- ses trois parts, la dernière saison partagée, les insignes de l'appelant. Les noms du village, jamais un solde.
create or replace function public.get_tableau_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_semaine date;
  v_jour date := internal.duel_jour(now());
  v_saison internal.sentier_saisons%rowtype;
  v_cagnotte bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    -- couronner, partager : le serveur le fait aussi toutes les 5 minutes ; une panne ici n'empêche pas de lire
    begin
      perform internal.duel_tableau_reveil();
    exception when others then
      null;
    end;
    v_semaine := internal.duel_semaine_de(now());
    select * into v_saison from internal.sentier_saisons s
    where s.debut <= v_jour and not exists (select 1 from internal.duel_saisons_partagees p where p.saison = s.saison)
    order by s.debut limit 1;
    if not found then
      select * into v_saison from internal.sentier_saisons s where s.debut > v_jour order by s.debut limit 1;
    end if;
    v_cagnotte := coalesce((select c.montant from internal.duel_cagnottes c where c.saison = v_saison.saison), 0);
    return jsonb_build_object(
      'ok', true,
      'maintenant', now(),
      'semaine', jsonb_build_object('semaine', v_semaine, 'debut', internal.duel_semaine_debut(v_semaine), 'fin', internal.duel_semaine_fin(v_semaine))
        || internal.duel_tableau_json(internal.duel_semaine_debut(v_semaine), now(), false, v_uid),
      'precedente', (
        select jsonb_build_object('semaine', s.semaine, 'fin', internal.duel_semaine_fin(s.semaine), 'classes', s.classes,
          'premier', case when s.premier is not null and p.status = 'validated' then coalesce(internal.duel_gaulois_json(s.premier), '{}'::jsonb)
            || jsonb_build_object('note', round(s.note)::integer, 'duels', s.duels, 'insignes', internal.duel_insignes_de(s.premier), 'moi', s.premier = v_uid) end)
        from internal.duel_semaines s left join public.profiles p on p.user_id = s.premier
        order by s.semaine desc limit 1),
      'saison', case when v_saison.saison is not null then
        jsonb_build_object('saison', v_saison.saison, 'nom', v_saison.nom, 'debut', v_saison.debut, 'fin', v_saison.fin,
          'commencee', v_saison.debut <= v_jour, 'finie', v_saison.fin < v_jour,
          'partage_le', internal.duel_saison_partage_le(v_saison.saison), 'cagnotte', v_cagnotte,
          'parts', (select jsonb_agg(jsonb_build_object('place', k, 'pour_cent', (internal.duel_tableau_parts())[k], 'montant', (v_cagnotte * (internal.duel_tableau_parts())[k]) / 100) order by k) from generate_series(1, 3) k))
        || case when v_saison.debut <= v_jour then internal.duel_tableau_json(internal.duel_saison_debut(v_saison.saison), least(now(), internal.duel_saison_fin(v_saison.saison)), true, v_uid)
           else jsonb_build_object('classes', 0, 'minimum', internal.duel_tableau_minimum(true), 'lignes', '[]'::jsonb, 'moi', null) end
        end,
      -- sans saison prévue, les parts des salles attendent sous « a-venir »
      'a_venir', coalesce((select c.montant from internal.duel_cagnottes c where c.saison = 'a-venir'), 0),
      'partage_precedent', (
        select jsonb_build_object('saison', sp.saison, 'nom', s.nom, 'partagee_le', sp.partagee_le, 'cagnotte', sp.cagnotte, 'reste', sp.reste,
          'places', coalesce((
            select jsonb_agg(case when pl.user_id is not null and pr.status = 'validated' then coalesce(internal.duel_gaulois_json(pl.user_id), '{}'::jsonb) else jsonb_build_object('nom', null) end
                || jsonb_build_object('place', pl.place, 'stateres', pl.stateres, 'moi', pl.user_id = v_uid) order by pl.place)
            from internal.duel_saison_places pl left join public.profiles pr on pr.user_id = pl.user_id
            where pl.saison = sp.saison), '[]'::jsonb))
        from internal.duel_saisons_partagees sp join internal.sentier_saisons s on s.saison = sp.saison
        order by s.debut desc limit 1),
      'mes_insignes', coalesce((
        select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'note', round(s.note)::integer) order by s.semaine desc)
        from internal.duel_semaines s where s.premier = v_uid), '[]'::jsonb),
      'regles', jsonb_build_object('minimum_semaine', internal.duel_tableau_minimum(false), 'minimum_saison', internal.duel_tableau_minimum(true),
        'par_adversaire', internal.duel_tableau_plafond(), 'parts', to_jsonb(internal.duel_tableau_parts()))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les insignes du duelliste de la semaine de l'appelant, pour sa carte : [{ semaine, note }], le plus récent d'abord.
create or replace function public.get_mes_insignes_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    return jsonb_build_object('ok', true, 'insignes', coalesce((
      select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'note', round(s.note)::integer) order by s.semaine desc)
      from internal.duel_semaines s where s.premier = v_uid), '[]'::jsonb));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le mode GOD ---------- */

-- Avant chaque ligne du journal : pour un compte en essai, la nature devient 'test_…' ; ce qui sortirait du compte est
-- refusé ; les vrais gains passent tels quels.
-- Remplacée par 20261122002000 (depuis 20261122001000, ligne pour ligne) : 'duel_saison', la part d'une cagnotte de saison
-- du duel, est un vrai gain (sinon la part d'un gagnant en essai lui serait reprise aussitôt et perdue pour tous).
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue', 'coffre_rendu', 'prix_baisse_rendu', 'duel_gain', 'duel_rendu', 'duel_saison') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande', 'duel_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;
revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

/* ---------- Les droits ---------- */

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.duel_tableau_poids()', 'internal.duel_tableau_prudence(boolean)', 'internal.duel_tableau_minimum(boolean)',
    'internal.duel_tableau_plafond()', 'internal.duel_tableau_parts()', 'internal.duel_tableau_premiere_semaine()',
    'internal.duel_semaine_de(timestamptz)', 'internal.duel_semaine_fin(date)', 'internal.duel_semaine_debut(date)',
    'internal.duel_saison_debut(text)', 'internal.duel_saison_fin(text)', 'internal.duel_saison_partage_le(text)',
    'internal.duel_tableau_resultats(timestamptz)', 'internal.duel_tableau_classement(timestamptz, timestamptz, numeric)',
    'internal.duel_tableau_lignes(timestamptz, timestamptz, boolean)', 'internal.duel_couronner(date)', 'internal.duel_partager(text)',
    'internal.duel_tableau_reveil()', 'internal.duel_insignes_de(uuid)', 'internal.duel_tableau_json(timestamptz, timestamptz, boolean, uuid)',
    'public.get_tableau_duel()', 'public.get_mes_insignes_duel()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
end $$;

grant execute on function public.get_tableau_duel() to authenticated;
grant execute on function public.get_mes_insignes_duel() to authenticated;

-- Toutes les 5 minutes : couronner les semaines finies, partager les saisons dont l'heure est passée. La tâche porte un
-- nom : la planifier de nouveau la remplace. Sans pg_cron, chaque lecture du tableau fait le même travail.
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-duel-tableau', '*/5 * * * *', 'select internal.duel_tableau_reveil()');
  end if;
end $cron$;
