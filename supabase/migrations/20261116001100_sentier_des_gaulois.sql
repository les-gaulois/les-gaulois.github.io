-- Le sentier des Gaulois, côté serveur (docs/DIRECTION.md, « Le sentier des Gaulois » ; formes des réponses :
-- src/lib/village/contrat.ts ; calculs de l'écran : src/lib/village/sentier.ts).
--
-- Demande du pilote, 16 novembre 2026 : « des idées pour mon Gaulois, qu'il pousse les joueurs à revenir tous les jours, un
-- peu comme un passe de combat ». Il a choisi cinq idées sur huit : le sentier de la saison, les trois missions du jour, le
-- calendrier de présence, l'étal du jour et le défi du clan. Et pour les récompenses : des objets, pas de statères.
--
-- Les règles :
-- - UNE SAISON a un premier et un dernier jour (à l'heure de Paris), un nombre de paliers et un nombre de pas par palier.
--   La première va du 17 novembre au 31 décembre 2026 : 30 paliers de 30 pas. Une saison suivante s'ajoute par une
--   nouvelle migration (une ligne de internal.sentier_saisons et ses paliers). Sans saison en cours, personne n'avance.
-- - ON AVANCE EN PAS, et rien d'autre : 10 pas par mission du jour faite, 5 pas par jour de visite, 30 pas de plus à
--   chaque septième jour de visite de la saison, 30 pas quand le défi du clan est rempli. Les nombres sont dans cinq
--   fonctions, sans réglage : les changer demande une nouvelle migration. Chaque gain est une ligne de
--   internal.sentier_gains, une seule par compte, par jour et par source : rien ne se compte deux fois.
-- - LES TROIS MISSIONS DU JOUR sont les mêmes pour tous, tirées au premier passage du jour par le générateur sûr de
--   Postgres : une parmi les trois faciles, puis deux autres parmi les six qui restent. Les sept missions :
--     partie    jouer une partie sous le tag du clan            parties_3  en jouer trois
--     victoire  une partie qui rapporte des points au clan      points_3   3 points rapportés au clan dans la journée
--     equipe    des points rapportés à trois Gaulois ou plus    vocal      passer dans un salon vocal du clan
--     pochette  ouvrir une pochette, quelle qu'elle soit
--   Elles se lisent sur ce que le serveur sait déjà : les parties qui ont rapporté des points (internal.stateres_victoires
--   et leurs présences, notées toutes les 5 minutes), les autres parties du clan (internal.sentier_parties, notées par le
--   même passage, scripts/noter-parties-sentier.ts), le relevé vocal du robot (un déclencheur note le jour) et le journal
--   des statères pour les pochettes. Une partie compte pour le jour où elle a commencé.
-- - UNE MISSION SE VALIDE SEULE, à la lecture du sentier, pour aujourd'hui et pour hier : qui ne passe pas avant la fin du
--   lendemain perd les pas de la journée. Le défi du clan de même.
-- - LE CALENDRIER : ouvrir « Mon Gaulois » lit le sentier, ce qui coche le jour. Un jour manqué ne retire rien : ce sont les jours de visite de la
--   saison qui se comptent, pas une série.
-- - LE DÉFI DU CLAN : chaque jour, autant de points rapportés au clan, à nous tous, que la moyenne des sept jours
--   d'avant (arrondie, 10 au moins ; aucun défi si ces sept jours n'ont rien rapporté). Rempli, il donne ses pas à chaque
--   membre qui a joué une partie du clan ce jour-là, gagnée ou non.
-- - LES PALIERS : chaque palier atteint donne un objet payant de la boutique, de la rareté écrite au palier, tiré au
--   hasard parmi ceux que le compte n'a pas encore ; s'il les a tous, un double. Le membre le prend lui-même
--   (prendre_palier). L'objet entre à l'inventaire comme sorti d'une pochette : il se porte, se grave, se fond et se
--   revend. Aucun statère n'est donné, aucun n'est créé. Ni divin, ni familier, ni bannière, ni Gaulois unique : ils
--   gardent leurs propres règles. Une saison finie, ses paliers atteints se prennent encore pendant 7 jours : les pas
--   du dernier jour, validés le lendemain, ne sont pas perdus. Pendant un essai du mode GOD, aucun palier ne se prend
--   ('mode_god') : l'objet repartirait avec l'essai, et le palier resterait pris.
-- - L'ÉTAL DU JOUR : un objet payant de la boutique, tiré chaque jour, vendu 30 pour cent moins cher que le prix de sa
--   rareté (arrondi au statère du dessus), une fois par compte puisqu'un objet possédé, ou mis en vente au marché par le
--   compte, ne se rachète pas, comme à la boutique. C'est un achat
--   comme un autre : un débit 'achat' au journal, annoncé sur Discord comme les achats de la boutique.
--
-- Ce qui est gardé :
-- - internal.sentier_jours : les missions, la cible du défi et l'objet de l'étal de chaque jour.
-- - internal.sentier_parties et internal.sentier_presences : les parties du clan qui n'ont pas rapporté de points, avec
--   l'empreinte SHA-256 de chaque Gaulois présent, comptes ou pas, jamais un identifiant. Effacées après 8 jours.
-- - internal.sentier_vocal : les jours où un compte a été vu en vocal. Effacés après 8 jours.
-- - internal.sentier_visites, internal.sentier_gains, internal.sentier_pris : les jours de visite, les pas gagnés et les
--   paliers pris de chaque compte. Ils s'effacent avec le compte. Ils ne sont pas dans la sauvegarde chiffrée (les objets
--   reçus, eux, y sont, avec l'inventaire).
--
-- Qui peut quoi :
-- - get_mon_sentier : tout compte connecté, non suspendu, pour lui seul. Seul un compte validé qui a créé son Gaulois
--   avance.
-- - prendre_palier, acheter_a_l_etal : un compte validé qui a créé son Gaulois (internal.village_acheteur).
-- - sentier_parties_notees, noter_parties_sentier : la clé de service seulement.
--
-- Rien n'est écrit au journal de l'encadrement. Neuf tables, un déclencheur et vingt-six fonctions ajoutés ; aucune table,
-- aucune colonne ni aucune fonction existante n'est changée. Rejouée, elle se remplace par la même.

/* ---------- Les tables ---------- */

create table if not exists internal.sentier_saisons (
  saison text primary key check (saison ~ '^[a-z0-9-]{1,24}$'),
  nom text not null check (char_length(nom) between 1 and 40),
  -- Le premier et le dernier jour, compris, à l'heure de Paris.
  debut date not null,
  fin date not null,
  paliers integer not null check (paliers between 1 and 60),
  pas_par_palier integer not null check (pas_par_palier between 1 and 1000),
  check (fin >= debut)
);

create table if not exists internal.sentier_paliers (
  saison text not null references internal.sentier_saisons (saison) on delete cascade,
  palier integer not null check (palier between 1 and 60),
  -- La rareté de l'objet que donne le palier : une de celles qui ont un prix à la boutique.
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire')),
  primary key (saison, palier)
);

create table if not exists internal.sentier_jours (
  jour date primary key,
  missions text[] not null check (cardinality(missions) = 3),
  -- La cible du défi du clan, en points rapportés au clan ; null : pas de défi ce jour-là.
  defi integer check (defi is null or defi >= 1),
  etal_emplacement text,
  etal_objet text,
  cree_le timestamptz not null default now(),
  check ((etal_emplacement is null) = (etal_objet is null)),
  foreign key (etal_emplacement, etal_objet) references internal.gaulois_objets (emplacement, objet)
);

create table if not exists internal.sentier_parties (
  partie text primary key check (partie ~ '^[A-Za-z0-9]{4,20}$'),
  debut timestamptz not null,
  notee_le timestamptz not null default now()
);
create index if not exists sentier_parties_debut on internal.sentier_parties (debut);

create table if not exists internal.sentier_presences (
  partie text not null references internal.sentier_parties (partie) on delete cascade,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  primary key (partie, empreinte)
);
create index if not exists sentier_presences_empreinte on internal.sentier_presences (empreinte);

create table if not exists internal.sentier_vocal (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  jour date not null,
  primary key (user_id, jour)
);

create table if not exists internal.sentier_visites (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  jour date not null,
  primary key (user_id, jour)
);

create table if not exists internal.sentier_gains (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  saison text not null references internal.sentier_saisons (saison) on delete cascade,
  jour date not null,
  -- 'visite', 'semaine' (le septième jour de visite), 'defi', ou 'mission/<code>'.
  source text not null check (source ~ '^[a-z][a-z0-9_/]{1,39}$'),
  pas integer not null check (pas between 1 and 1000),
  cree_le timestamptz not null default now(),
  primary key (user_id, jour, source)
);
create index if not exists sentier_gains_saison on internal.sentier_gains (user_id, saison);

create table if not exists internal.sentier_pris (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  saison text not null references internal.sentier_saisons (saison) on delete cascade,
  palier integer not null,
  emplacement text not null,
  objet text not null,
  pris_le timestamptz not null default now(),
  primary key (user_id, saison, palier),
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet)
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.sentier_saisons enable row level security;
alter table internal.sentier_paliers enable row level security;
alter table internal.sentier_jours enable row level security;
alter table internal.sentier_parties enable row level security;
alter table internal.sentier_presences enable row level security;
alter table internal.sentier_vocal enable row level security;
alter table internal.sentier_visites enable row level security;
alter table internal.sentier_gains enable row level security;
alter table internal.sentier_pris enable row level security;
revoke all on table internal.sentier_saisons from public, anon, authenticated;
revoke all on table internal.sentier_paliers from public, anon, authenticated;
revoke all on table internal.sentier_jours from public, anon, authenticated;
revoke all on table internal.sentier_parties from public, anon, authenticated;
revoke all on table internal.sentier_presences from public, anon, authenticated;
revoke all on table internal.sentier_vocal from public, anon, authenticated;
revoke all on table internal.sentier_visites from public, anon, authenticated;
revoke all on table internal.sentier_gains from public, anon, authenticated;
revoke all on table internal.sentier_pris from public, anon, authenticated;

/* ---------- La première saison ---------- */

insert into internal.sentier_saisons (saison, nom, debut, fin, paliers, pas_par_palier) values
  ('saison-1', 'Saison 1', date '2026-11-17', date '2026-12-31', 30, 30)
on conflict (saison) do nothing;

-- <paliers-saison-1> : les mêmes que PALIERS_DE_LA_SAISON_1 de src/lib/village/contrat.ts, un test compare.
insert into internal.sentier_paliers (saison, palier, rarete) values
  ('saison-1', 1, 'commun'),
  ('saison-1', 2, 'commun'),
  ('saison-1', 3, 'commun'),
  ('saison-1', 4, 'peu-commun'),
  ('saison-1', 5, 'commun'),
  ('saison-1', 6, 'commun'),
  ('saison-1', 7, 'peu-commun'),
  ('saison-1', 8, 'commun'),
  ('saison-1', 9, 'peu-commun'),
  ('saison-1', 10, 'epique'),
  ('saison-1', 11, 'commun'),
  ('saison-1', 12, 'peu-commun'),
  ('saison-1', 13, 'commun'),
  ('saison-1', 14, 'peu-commun'),
  ('saison-1', 15, 'epique'),
  ('saison-1', 16, 'commun'),
  ('saison-1', 17, 'peu-commun'),
  ('saison-1', 18, 'peu-commun'),
  ('saison-1', 19, 'epique'),
  ('saison-1', 20, 'mystique'),
  ('saison-1', 21, 'commun'),
  ('saison-1', 22, 'peu-commun'),
  ('saison-1', 23, 'epique'),
  ('saison-1', 24, 'peu-commun'),
  ('saison-1', 25, 'mystique'),
  ('saison-1', 26, 'peu-commun'),
  ('saison-1', 27, 'epique'),
  ('saison-1', 28, 'mystique'),
  ('saison-1', 29, 'mystique'),
  ('saison-1', 30, 'legendaire')
on conflict (saison, palier) do nothing;
-- </paliers-saison-1>

/* ---------- Les nombres de la règle ---------- */

-- Les pas d'une mission du jour faite.
create or replace function internal.sentier_pas_mission() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 10
$$;

-- Les pas d'un jour de visite.
create or replace function internal.sentier_pas_visite() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 5
$$;

-- Les pas donnés en plus à chaque septième jour de visite de la saison.
create or replace function internal.sentier_pas_semaine() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 30
$$;

-- Les pas du défi du clan, quand il est rempli.
create or replace function internal.sentier_pas_defi() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 30
$$;

-- La remise de l'étal du jour, en pour cent du prix de la boutique.
create or replace function internal.sentier_remise() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 30
$$;

-- Les sept missions. `facile` : chaque jour en a une de celles-là.
create or replace function internal.sentier_missions() returns table (code text, facile boolean)
language sql immutable set search_path = public, pg_temp as $$
  values
    ('partie', true),
    ('vocal', true),
    ('pochette', true),
    ('parties_3', false),
    ('victoire', false),
    ('points_3', false),
    ('equipe', false)
$$;

revoke all on function internal.sentier_pas_mission() from public, anon, authenticated;
revoke all on function internal.sentier_pas_visite() from public, anon, authenticated;
revoke all on function internal.sentier_pas_semaine() from public, anon, authenticated;
revoke all on function internal.sentier_pas_defi() from public, anon, authenticated;
revoke all on function internal.sentier_remise() from public, anon, authenticated;
revoke all on function internal.sentier_missions() from public, anon, authenticated;

/* ---------- Les jours ---------- */

-- Le jour de `p_at`, à l'heure de Paris.
create or replace function internal.sentier_jour(p_at timestamptz) returns date
language sql stable set search_path = public, pg_temp as $$
  select (p_at at time zone 'Europe/Paris')::date
$$;

-- Minuit de ce jour, à l'heure de Paris. Minuit n'est jamais dans un changement d'heure.
create or replace function internal.sentier_minuit(p_jour date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select p_jour::timestamp at time zone 'Europe/Paris'
$$;

-- Les points rapportés au clan par les parties commencées ce jour-là, à nous tous.
create or replace function internal.sentier_points_du_clan(p_jour date) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(v.points), 0)
  from internal.stateres_victoires v
  where v.debut >= internal.sentier_minuit(p_jour) and v.debut < internal.sentier_minuit(p_jour + 1)
$$;

-- Le prix d'un objet de cette rareté à l'étal : celui de la boutique moins la remise, arrondi au statère du dessus.
-- null pour une rareté sans prix.
create or replace function internal.sentier_prix_etal(p_rarete text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select ceil(p.prix * (100 - internal.sentier_remise()) / 100.0)::integer
  from internal.village_prix p
  where p.rarete = p_rarete
$$;

-- La saison de ce jour, s'il y en a une.
create or replace function internal.sentier_saison_du(p_jour date) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select s.saison from internal.sentier_saisons s where p_jour between s.debut and s.fin order by s.debut desc limit 1
$$;

-- Ouvre un jour, une seule fois : ses trois missions, la cible du défi du clan et l'objet de l'étal. Deux appels au même
-- instant passent l'un après l'autre.
create or replace function internal.sentier_ouvrir_jour(p_jour date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_facile text;
  v_autres text[];
  v_moyenne numeric;
  v_emplacement text;
  v_objet text;
begin
  if exists (select 1 from internal.sentier_jours j where j.jour = p_jour) then return; end if;
  perform pg_advisory_xact_lock(hashtext('gal_sentier'), hashtext(p_jour::text));
  if exists (select 1 from internal.sentier_jours j where j.jour = p_jour) then return; end if;
  select m.code into v_facile from internal.sentier_missions() m where m.facile order by internal.village_hasard() limit 1;
  select array_agg(a.code) into v_autres
  from (select m.code from internal.sentier_missions() m where m.code <> v_facile order by internal.village_hasard() limit 2) a;
  -- La moyenne des sept jours d'avant ; rien si ces jours n'ont rien rapporté.
  select avg(internal.sentier_points_du_clan(d::date)) into v_moyenne
  from generate_series(p_jour - 7, p_jour - 1, interval '1 day') d;
  -- L'étal : un objet payant qui a un prix, tous à chances égales.
  select o.emplacement, o.objet into v_emplacement, v_objet
  from internal.gaulois_objets o
  join internal.village_prix p on p.rarete = o.rarete
  where not o.gratuit
  order by internal.village_hasard()
  limit 1;
  insert into internal.sentier_jours (jour, missions, defi, etal_emplacement, etal_objet)
  values (p_jour, array[v_facile] || v_autres, case when v_moyenne > 0 then greatest(10, round(v_moyenne))::integer end, v_emplacement, v_objet)
  on conflict (jour) do nothing;
end $$;

-- Les jours pendant lesquels les paliers d'une saison finie se prennent encore.
create or replace function internal.sentier_delai() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 7
$$;

-- La saison à montrer ce jour-là : celle en cours, sinon la dernière finie depuis moins de internal.sentier_delai() jours,
-- dont les paliers se prennent encore.
create or replace function internal.sentier_saison_montree(p_jour date) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    internal.sentier_saison_du(p_jour),
    (select s.saison from internal.sentier_saisons s
     where s.fin < p_jour and p_jour <= s.fin + internal.sentier_delai()
     order by s.fin desc limit 1))
$$;

revoke all on function internal.sentier_delai() from public, anon, authenticated;
revoke all on function internal.sentier_saison_montree(date) from public, anon, authenticated;
revoke all on function internal.sentier_jour(timestamptz) from public, anon, authenticated;
revoke all on function internal.sentier_minuit(date) from public, anon, authenticated;
revoke all on function internal.sentier_points_du_clan(date) from public, anon, authenticated;
revoke all on function internal.sentier_prix_etal(text) from public, anon, authenticated;
revoke all on function internal.sentier_saison_du(date) from public, anon, authenticated;
revoke all on function internal.sentier_ouvrir_jour(date) from public, anon, authenticated;

/* ---------- Ce qu'un compte a fait dans un jour ---------- */

-- Les parties du clan qu'un compte a jouées ce jour-là, d'après l'empreinte de son identifiant OpenFront : toutes, celles
-- qui ont rapporté des points, leurs points, et s'il y en a une à trois Gaulois ou plus ; puis le vocal et les pochettes.
create or replace function internal.sentier_faits(p_user uuid, p_jour date)
returns table (parties integer, victoires integer, points numeric, equipe boolean, vocal boolean, pochettes integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with moi as (
    select l.openfront_hash as empreinte from public.private_links l where l.user_id = p_user and l.openfront_hash is not null
  ),
  gagnees as (
    select v.points, v.gaulois
    from internal.stateres_presences pr
    join internal.stateres_victoires v on v.partie = pr.partie
    join moi on moi.empreinte = pr.empreinte
    where v.debut >= internal.sentier_minuit(p_jour) and v.debut < internal.sentier_minuit(p_jour + 1)
  ),
  autres as (
    select 1
    from internal.sentier_presences pr
    join internal.sentier_parties s on s.partie = pr.partie
    join moi on moi.empreinte = pr.empreinte
    where s.debut >= internal.sentier_minuit(p_jour) and s.debut < internal.sentier_minuit(p_jour + 1)
      and not exists (select 1 from internal.stateres_victoires v where v.partie = s.partie)
  )
  select
    ((select count(*) from gagnees) + (select count(*) from autres))::integer,
    (select count(*) from gagnees)::integer,
    coalesce((select sum(g.points) from gagnees g), 0),
    exists (select 1 from gagnees g where g.gaulois >= 3),
    exists (select 1 from internal.sentier_vocal o where o.user_id = p_user and o.jour = p_jour),
    (select count(*) from internal.stateres_mouvements m
      where m.user_id = p_user and m.montant < 0 and m.nature in ('pochette', 'pochette_stateres')
        and m.cree_le >= internal.sentier_minuit(p_jour) and m.cree_le < internal.sentier_minuit(p_jour + 1))::integer
$$;

-- Les trois missions de ce jour pour ce compte, dans leur ordre : ce qui est fait et ce qu'il faut. Une mission est faite
-- quand `fait` atteint `cible`. Un code inconnu ne se fait jamais.
create or replace function internal.sentier_missions_de(p_user uuid, p_jour date)
returns table (code text, rang integer, fait numeric, cible numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.code, m.rang::integer,
    case m.code
      when 'partie' then least(f.parties, 1)
      when 'parties_3' then least(f.parties, 3)
      when 'victoire' then least(f.victoires, 1)
      when 'points_3' then least(f.points, 3)
      when 'equipe' then case when f.equipe then 1 else 0 end
      when 'vocal' then case when f.vocal then 1 else 0 end
      when 'pochette' then least(f.pochettes, 1)
      else 0
    end::numeric,
    case m.code when 'parties_3' then 3 when 'points_3' then 3 else 1 end::numeric
  from internal.sentier_jours j
  cross join lateral unnest(j.missions) with ordinality as m (code, rang)
  cross join internal.sentier_faits(p_user, p_jour) f
  where j.jour = p_jour
$$;

revoke all on function internal.sentier_faits(uuid, date) from public, anon, authenticated;
revoke all on function internal.sentier_missions_de(uuid, date) from public, anon, authenticated;

/* ---------- Le vocal ---------- */

-- Note le jour où un compte est vu en vocal par le relevé du robot : l'état vocal lui-même ne garde que le dernier relevé.
create or replace function internal.sentier_noter_vocal() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.vocal is true and new.vocal_le is not null then
    insert into internal.sentier_vocal (user_id, jour) values (new.user_id, internal.sentier_jour(new.vocal_le))
    on conflict (user_id, jour) do nothing;
  end if;
  return null;
end $$;

create or replace trigger sentier_vocal after insert or update of vocal, vocal_le on internal.village_vie
  for each row execute function internal.sentier_noter_vocal();

revoke all on function internal.sentier_noter_vocal() from public, anon, authenticated;

/* ---------- Les pas ---------- */

-- Donne à un compte les pas qui lui reviennent pour hier et aujourd'hui : les missions faites et le défi du clan rempli.
-- Chaque gain n'entre qu'une fois (une ligne par compte, par jour et par source).
create or replace function internal.sentier_regler(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aujourdhui date := internal.sentier_jour(now());
  v_jour date;
  v_saison text;
  v_defi integer;
begin
  foreach v_jour in array array[v_aujourdhui - 1, v_aujourdhui] loop
    v_saison := internal.sentier_saison_du(v_jour);
    continue when v_saison is null;
    insert into internal.sentier_gains (user_id, saison, jour, source, pas)
    select p_user, v_saison, v_jour, 'mission/' || m.code, internal.sentier_pas_mission()
    from internal.sentier_missions_de(p_user, v_jour) m
    where m.fait >= m.cible
    on conflict (user_id, jour, source) do nothing;
    select j.defi into v_defi from internal.sentier_jours j where j.jour = v_jour;
    if v_defi is not null and internal.sentier_points_du_clan(v_jour) >= v_defi
       and (select f.parties from internal.sentier_faits(p_user, v_jour) f) >= 1 then
      insert into internal.sentier_gains (user_id, saison, jour, source, pas)
      values (p_user, v_saison, v_jour, 'defi', internal.sentier_pas_defi())
      on conflict (user_id, jour, source) do nothing;
    end if;
  end loop;
end $$;

-- Coche le jour de visite d'un compte, une fois par jour, et donne ses pas ; au septième jour de visite de la saison, et
-- à chaque septième ensuite, les pas de la semaine en plus.
create or replace function internal.sentier_cocher(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_jour date := internal.sentier_jour(now());
  v_saison text := internal.sentier_saison_du(v_jour);
  v_visites integer;
begin
  if v_saison is null then return; end if;
  insert into internal.sentier_visites (user_id, jour) values (p_user, v_jour) on conflict (user_id, jour) do nothing;
  if not found then return; end if;
  insert into internal.sentier_gains (user_id, saison, jour, source, pas)
  values (p_user, v_saison, v_jour, 'visite', internal.sentier_pas_visite())
  on conflict (user_id, jour, source) do nothing;
  select count(*)::integer into v_visites
  from internal.sentier_visites v
  join internal.sentier_saisons s on s.saison = v_saison
  where v.user_id = p_user and v.jour between s.debut and s.fin;
  if v_visites % 7 = 0 then
    insert into internal.sentier_gains (user_id, saison, jour, source, pas)
    values (p_user, v_saison, v_jour, 'semaine', internal.sentier_pas_semaine())
    on conflict (user_id, jour, source) do nothing;
  end if;
end $$;

-- Les pas d'un compte dans une saison.
create or replace function internal.sentier_pas(p_user uuid, p_saison text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(g.pas), 0)::integer from internal.sentier_gains g where g.user_id = p_user and g.saison = p_saison
$$;

revoke all on function internal.sentier_regler(uuid) from public, anon, authenticated;
revoke all on function internal.sentier_cocher(uuid) from public, anon, authenticated;
revoke all on function internal.sentier_pas(uuid, text) from public, anon, authenticated;

/* ---------- Pour les membres ---------- */

-- Le sentier du compte connecté : { ok: true, peut_avancer, solde, jour, releve, regles: { mission, visite, semaine,
-- tous_les, defi, remise }, saison, pas, paliers, visites, missions, defi, etal }.
-- - peut_avancer : compte validé avec un Gaulois créé. Lui seul coche le jour et reçoit des pas.
-- - saison : { id, nom, debut, fin, paliers, pas_par_palier, finie, prendre_jusqu_au }, ou null hors saison ; alors pas
--   vaut 0, paliers et missions sont vides, visites vaut 0 et defi est null. finie : la saison est passée, ses paliers se
--   prennent encore jusqu'au jour prendre_jusqu_au compris ; missions est alors vide et defi null.
-- - paliers : [{ palier, rarete, pris }], pris : { emplacement, objet } ou null.
-- - visites : les jours de visite de la saison, celui-ci compris.
-- - missions : [{ code, fait, cible, gagnee }], celles d'aujourd'hui ; gagnee : ses pas sont donnés.
-- - defi : { cible, points, joue, gagne } ou null ; points : ceux du clan aujourd'hui ; joue : le compte a joué une partie
--   du clan aujourd'hui ; gagne : ses pas sont donnés.
-- - etal : { emplacement, objet, rarete, prix, prix_boutique, possede } ou null. Il ne dépend pas de la saison.
-- - releve : l'heure de la dernière relecture des parties (celle des statères).
-- Jamais le sentier, le solde ni les objets d'un autre.
create or replace function public.get_mon_sentier() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_peut boolean;
  v_jour date := internal.sentier_jour(now());
  v_saison internal.sentier_saisons%rowtype;
  v_j internal.sentier_jours%rowtype;
  v_finie boolean;
  v_rarete text;
  v_detail text;
begin
  begin
    if v_uid is null then perform internal.fail('not_signed_in'); end if;
    select p.status into v_status from public.profiles p where p.user_id = v_uid;
    if not found then perform internal.fail('not_signed_in'); end if;
    if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  v_peut := v_status = 'validated' and exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  perform internal.sentier_ouvrir_jour(v_jour);
  if v_peut then
    perform internal.crediter_stateres(v_uid);
    perform internal.sentier_cocher(v_uid);
    perform internal.sentier_regler(v_uid);
  end if;
  select s.* into v_saison from internal.sentier_saisons s where s.saison = internal.sentier_saison_montree(v_jour);
  v_finie := v_saison.saison is not null and v_saison.fin < v_jour;
  select j.* into v_j from internal.sentier_jours j where j.jour = v_jour;
  select o.rarete into v_rarete from internal.gaulois_objets o where o.emplacement = v_j.etal_emplacement and o.objet = v_j.etal_objet;
  return jsonb_build_object(
    'ok', true,
    'peut_avancer', v_peut,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'jour', v_jour,
    'releve', (select r.le from internal.stateres_releve r where r.id),
    'regles', jsonb_build_object(
      'mission', internal.sentier_pas_mission(),
      'visite', internal.sentier_pas_visite(),
      'semaine', internal.sentier_pas_semaine(),
      'tous_les', 7,
      'defi', internal.sentier_pas_defi(),
      'remise', internal.sentier_remise()
    ),
    'saison', case when v_saison.saison is null then null else jsonb_build_object(
      'id', v_saison.saison, 'nom', v_saison.nom, 'debut', v_saison.debut, 'fin', v_saison.fin,
      'paliers', v_saison.paliers, 'pas_par_palier', v_saison.pas_par_palier,
      'finie', v_finie, 'prendre_jusqu_au', v_saison.fin + internal.sentier_delai()
    ) end,
    'pas', case when v_saison.saison is null then 0 else internal.sentier_pas(v_uid, v_saison.saison) end,
    'paliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'palier', p.palier,
        'rarete', p.rarete,
        'pris', (select jsonb_build_object('emplacement', x.emplacement, 'objet', x.objet)
                 from internal.sentier_pris x where x.user_id = v_uid and x.saison = p.saison and x.palier = p.palier)
      ) order by p.palier)
      from internal.sentier_paliers p
      where p.saison = v_saison.saison and p.palier <= v_saison.paliers), '[]'::jsonb),
    'visites', coalesce((
      select count(*)::integer from internal.sentier_visites v
      where v.user_id = v_uid and v.jour between v_saison.debut and v_saison.fin), 0),
    'missions', case when v_saison.saison is null or v_finie then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', m.code,
        'fait', trim_scale(m.fait),
        'cible', trim_scale(m.cible),
        'gagnee', exists (select 1 from internal.sentier_gains g where g.user_id = v_uid and g.jour = v_jour and g.source = 'mission/' || m.code)
      ) order by m.rang)
      from internal.sentier_missions_de(v_uid, v_jour) m), '[]'::jsonb) end,
    'defi', case when v_saison.saison is null or v_finie or v_j.defi is null then null else jsonb_build_object(
      'cible', v_j.defi,
      'points', trim_scale(internal.sentier_points_du_clan(v_jour)),
      'joue', (select f.parties >= 1 from internal.sentier_faits(v_uid, v_jour) f),
      'gagne', exists (select 1 from internal.sentier_gains g where g.user_id = v_uid and g.jour = v_jour and g.source = 'defi')
    ) end,
    'etal', case when v_j.etal_objet is null or v_rarete is null or internal.sentier_prix_etal(v_rarete) is null then null else jsonb_build_object(
      'emplacement', v_j.etal_emplacement,
      'objet', v_j.etal_objet,
      'rarete', v_rarete,
      'prix', internal.sentier_prix_etal(v_rarete),
      'prix_boutique', (select p.prix from internal.village_prix p where p.rarete = v_rarete),
      'possede', exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = v_j.etal_emplacement and i.objet = v_j.etal_objet)
        or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = v_j.etal_emplacement and m.objet = v_j.etal_objet)
    ) end
  );
end $$;

revoke all on function public.get_mon_sentier() from public, anon, authenticated;
grant execute on function public.get_mon_sentier() to authenticated;

-- Prend l'objet d'un palier atteint : { ok: true, palier, objet: { emplacement, objet, rarete, double } }. L'objet est
-- tiré parmi les objets payants de la rareté du palier que le compte n'a pas ; s'il les a tous, parmi tous, et c'est un
-- double. La saison est celle en cours, sinon celle finie depuis 7 jours au plus. Refus, dans l'ordre : not_validated,
-- no_gaulois, mode_god (un essai du mode GOD est en cours), saison_fermee (aucune saison), unknown_palier,
-- palier_pas_atteint, deja_pris ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne donne rien.
create or replace function public.prendre_palier(p_palier integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_saison internal.sentier_saisons%rowtype;
  v_rarete text;
  v_emplacement text;
  v_objet text;
  v_quantite integer;
  v_essai boolean := false;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    -- Pendant un essai du mode GOD (migration 20261116000900, si elle est installée), l'inventaire revient à sa copie à
    -- la fin : l'objet d'un palier partirait avec l'essai, et le palier resterait pris.
    if to_regclass('internal.village_god') is not null then
      execute 'select exists (select 1 from internal.village_god d where d.user_id = $1)' into v_essai using v_uid;
      if v_essai then perform internal.fail('mode_god'); end if;
    end if;
    select s.* into v_saison from internal.sentier_saisons s where s.saison = internal.sentier_saison_montree(internal.sentier_jour(now()));
    if v_saison.saison is null then perform internal.fail('saison_fermee'); end if;
    select p.rarete into v_rarete from internal.sentier_paliers p
    where p.saison = v_saison.saison and p.palier = p_palier and p.palier <= v_saison.paliers;
    if v_rarete is null then perform internal.fail('unknown_palier'); end if;
    perform internal.sentier_regler(v_uid);
    if internal.sentier_pas(v_uid, v_saison.saison) < p_palier * v_saison.pas_par_palier then perform internal.fail('palier_pas_atteint'); end if;
    if exists (select 1 from internal.sentier_pris x where x.user_id = v_uid and x.saison = v_saison.saison and x.palier = p_palier) then
      perform internal.fail('deja_pris');
    end if;
    -- Un objet que le compte n'a pas d'abord ; à égalité, le hasard.
    select o.emplacement, o.objet into v_emplacement, v_objet
    from internal.gaulois_objets o
    where o.rarete = v_rarete and not o.gratuit
    order by exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = o.emplacement and i.objet = o.objet),
             internal.village_hasard()
    limit 1;
    if v_objet is null then perform internal.fail('invalid_request'); end if;
    insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine)
    values (v_uid, v_emplacement, v_objet, 1, 'pochette')
    on conflict (user_id, emplacement, objet) do update
      set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = now()
    returning i.quantite into v_quantite;
    insert into internal.sentier_pris (user_id, saison, palier, emplacement, objet)
    values (v_uid, v_saison.saison, p_palier, v_emplacement, v_objet);
    return jsonb_build_object(
      'ok', true,
      'palier', p_palier,
      'objet', jsonb_build_object('emplacement', v_emplacement, 'objet', v_objet, 'rarete', v_rarete, 'double', v_quantite > 1)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.prendre_palier(integer) from public, anon, authenticated;
grant execute on function public.prendre_palier(integer) to authenticated;

-- Achète l'objet de l'étal du jour à son prix réduit : { ok: true, solde, objet: { emplacement, objet } }. `p_emplacement`,
-- `p_objet` et `p_prix_vu` : ce que le membre a vu ; si l'étal a changé (minuit est passé), refus etal_change ; si le prix
-- a changé, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, etal_change, deja_possede, prix_change,
-- solde_insuffisant ; et ceux de tout compte. Un refus ne débite rien.
create or replace function public.acheter_a_l_etal(p_emplacement text, p_objet text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_jour date := internal.sentier_jour(now());
  v_j internal.sentier_jours%rowtype;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.sentier_ouvrir_jour(v_jour);
    select j.* into v_j from internal.sentier_jours j where j.jour = v_jour;
    if v_j.etal_objet is null or v_j.etal_emplacement is distinct from p_emplacement or v_j.etal_objet is distinct from p_objet then
      perform internal.fail('etal_change');
    end if;
    select internal.sentier_prix_etal(o.rarete) into v_prix
    from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet and not o.gratuit;
    if v_prix is null then perform internal.fail('etal_change'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet)
      -- Comme à la boutique : un objet en vente au marché reste à son vendeur.
      or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = p_emplacement and m.objet = p_objet) then
      perform internal.fail('deja_possede');
    end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, p_emplacement || '/' || p_objet);
    insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine)
    values (v_uid, p_emplacement, p_objet, 1, 'achat')
    on conflict (user_id, emplacement, objet) do nothing;
    -- Arrivé entre-temps par un autre chemin : le débit s'annule avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'objet', jsonb_build_object('emplacement', p_emplacement, 'objet', p_objet)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_a_l_etal(text, text, integer) from public, anon, authenticated;
grant execute on function public.acheter_a_l_etal(text, text, integer) to authenticated;

/* ---------- Pour le script du passage de 5 minutes ---------- */

-- Une partie telle que le script l'envoie : { partie, debut, empreintes }, rien d'autre. Le début est une date ISO complète.
create or replace function internal.sentier_partie_valide(p jsonb) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_debut timestamptz;
  v_e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p)) <> 3 then return false; end if;
  if jsonb_typeof(p -> 'partie') is distinct from 'string' or (p ->> 'partie') !~ '^[A-Za-z0-9]{4,20}$' then return false; end if;
  if jsonb_typeof(p -> 'debut') is distinct from 'string'
     or (p ->> 'debut') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  begin
    v_debut := (p ->> 'debut')::timestamptz;
  exception when others then
    return false;
  end;
  if v_debut > now() + interval '1 hour' then return false; end if;
  if jsonb_typeof(p -> 'empreintes') is distinct from 'array' or jsonb_array_length(p -> 'empreintes') > 200 then return false; end if;
  for v_e in select value from jsonb_array_elements(p -> 'empreintes') loop
    if jsonb_typeof(v_e) <> 'string' or (v_e #>> '{}') !~ '^[0-9a-f]{64}$' then return false; end if;
  end loop;
  return true;
end $$;

revoke all on function internal.sentier_partie_valide(jsonb) from public, anon, authenticated;

-- Pour le script : les parties déjà notées depuis `p_depuis`, qu'il ne relit pas. { ok: true, parties: [...] }.
create or replace function public.sentier_parties_notees(p_depuis timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_depuis is null then return internal.error_json('invalid_request', ''); end if;
  return jsonb_build_object('ok', true, 'parties', coalesce(
    (select jsonb_agg(s.partie order by s.debut, s.partie) from internal.sentier_parties s where s.debut >= p_depuis), '[]'::jsonb));
end $$;

revoke all on function public.sentier_parties_notees(timestamptz) from public, anon, authenticated;
grant execute on function public.sentier_parties_notees(timestamptz) to service_role;

-- Pour le script : note jusqu'à 50 parties du clan qui n'ont pas rapporté de points et les empreintes de leurs Gaulois,
-- efface ce qui a plus de 8 jours, et ouvre le jour s'il ne l'est pas. Tout ou rien : une partie mal formée fait refuser
-- l'envoi entier (`invalid_parties`), sans rien écrire. Une partie de plus de 8 jours est ignorée.
-- { ok: true, notees, deja, ignorees }.
create or replace function public.noter_parties_sentier(p_parties jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limite timestamptz := now() - interval '8 days';
  v_p jsonb;
  v_notees integer := 0;
  v_deja integer := 0;
  v_ignorees integer := 0;
  v_detail text;
begin
  begin
    if p_parties is null or jsonb_typeof(p_parties) <> 'array' or jsonb_array_length(p_parties) > 50 then
      perform internal.fail('invalid_parties');
    end if;
    for v_p in select value from jsonb_array_elements(p_parties) loop
      if not internal.sentier_partie_valide(v_p) then perform internal.fail('invalid_parties'); end if;
    end loop;
    for v_p in select value from jsonb_array_elements(p_parties) loop
      if (v_p ->> 'debut')::timestamptz < v_limite then
        v_ignorees := v_ignorees + 1;
        continue;
      end if;
      insert into internal.sentier_parties (partie, debut)
      values (v_p ->> 'partie', (v_p ->> 'debut')::timestamptz)
      on conflict (partie) do nothing;
      if found then v_notees := v_notees + 1; else v_deja := v_deja + 1; end if;
      insert into internal.sentier_presences (partie, empreinte)
      select v_p ->> 'partie', e from jsonb_array_elements_text(v_p -> 'empreintes') e
      on conflict do nothing;
    end loop;
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  delete from internal.sentier_parties where debut < v_limite;
  delete from internal.sentier_vocal where jour < internal.sentier_jour(now()) - 8;
  perform internal.sentier_ouvrir_jour(internal.sentier_jour(now()));
  return jsonb_build_object('ok', true, 'notees', v_notees, 'deja', v_deja, 'ignorees', v_ignorees);
end $$;

revoke all on function public.noter_parties_sentier(jsonb) from public, anon, authenticated;
grant execute on function public.noter_parties_sentier(jsonb) to service_role;
