-- Les boosters de départ (docs/DIRECTION.md, « Les boosters de départ »).
--
-- Demande du pilote, 28 novembre 2026 : « je veux qu'à la création de son Gaulois, 10 pochettes à cosmétiques sont
-- offertes au démarrage, bien sûr pareil pour ceux qui ne les ont pas eues au démarrage ».
--
-- Les règles :
-- - Chaque compte reçoit UNE fois dix boosters surprise (la pochette des objets de la garde-robe : tête, haut, bas,
--   pieds, arme), au moment où son Gaulois est créé : dix bons de la pochette surprise (internal.loterie_bons,
--   'surprise'), les mêmes que ceux de la loterie et des paliers de victoires. Ils s'ouvrent dans « Mon Gaulois », onglet
--   « Les boosters », par la fonction habituelle de la pochette, avec le même tirage, les mêmes chances et les mêmes
--   règles : internal.village_debiter crédite le prix juste avant de le débiter (nature 'loterie_pochette'), donc aucun
--   statère n'est créé, et l'objet reçu ne se revend pas au jeu (internal.revente_droits écarte une pochette payée par un
--   bon).
-- - Le Gaulois est créé par public.enregistrer_mon_gaulois, à sa première tenue enregistrée : un déclencheur sur la
--   création de la ligne de internal.gaulois offre les boosters. Changer ensuite de tenue ou de corps ne crée pas de
--   ligne et ne redonne rien.
-- - Les Gaulois déjà créés reçoivent les leurs par cette migration (le rattrapage), une seule fois aussi, quel que soit
--   l'état du compte : l'ouverture, elle, suit les règles de la boutique (internal.village_acheteur, un compte validé et
--   non suspendu). Un compte qui attend sa validation, ou qui est suspendu, garde ses bons jusque-là.
-- - Une fois par compte (internal.boosters_de_depart) : rejouée, cette migration ne redonne rien. Un compte supprimé
--   emporte tout, comme le reste du village ; un compte recréé repasse par la validation de l'équipe avant d'ouvrir un
--   booster.
--
-- Ce qui est gardé : internal.boosters_de_depart (chaque compte servi, combien, et quand). Tout s'efface avec le compte.
--
-- Qui peut quoi : rien de nouveau. Les bons se lisent par get_pochettes_gagnees (tout compte connecté, pour lui seul) et
-- s'ouvrent par ouvrir_pochette, comme avant.
--
-- Une table, trois fonctions et un déclencheur ajoutés, des bons ajoutés aux Gaulois déjà créés. Aucune table, colonne ni
-- fonction existante retirée ou changée. Rejouée, elle ne change rien.

/* ---------- La table ---------- */

-- Les comptes qui ont reçu leurs boosters de départ : une ligne par compte, jamais deux.
create table if not exists internal.boosters_de_depart (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  nombre integer not null check (nombre > 0),
  offerts_le timestamptz not null default now()
);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.boosters_de_depart enable row level security;
revoke all on table internal.boosters_de_depart from public, anon, authenticated;

/* ---------- Le réglage, écrit ici : le changer demande une nouvelle migration ---------- */

-- <boosters-de-depart> : le nombre de boosters surprise offerts à la création du Gaulois, choix du pilote.
create or replace function internal.boosters_de_depart_nombre() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 10
$$;
-- </boosters-de-depart>

revoke all on function internal.boosters_de_depart_nombre() from public, anon, authenticated;

/* ---------- Le cadeau ---------- */

-- Offre au compte ses boosters de départ, s'il ne les a pas encore reçus : rend le nombre de bons ajoutés, 0 s'il les a
-- déjà eus. Sous le verrou du compte, comme toute écriture du village : un bon ne s'ajoute pas pendant qu'une pochette
-- s'ouvre.
create or replace function internal.offrir_boosters_de_depart(p_user uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nombre integer := internal.boosters_de_depart_nombre();
begin
  if p_user is null then raise exception 'compte manquant'; end if;
  perform internal.village_verrou(p_user);
  insert into internal.boosters_de_depart (user_id, nombre) values (p_user, v_nombre) on conflict (user_id) do nothing;
  if not found then return 0; end if;
  insert into internal.loterie_bons as b (user_id, pochette, nombre) values (p_user, 'surprise', v_nombre)
    on conflict (user_id, pochette) do update set nombre = b.nombre + excluded.nombre;
  return v_nombre;
end $$;

revoke all on function internal.offrir_boosters_de_depart(uuid) from public, anon, authenticated;

-- Le déclencheur : un Gaulois tout juste créé reçoit ses boosters de départ.
create or replace function internal.gaulois_cree_boosters_de_depart() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.offrir_boosters_de_depart(new.user_id);
  return null;
end $$;

revoke all on function internal.gaulois_cree_boosters_de_depart() from public, anon, authenticated;

create or replace trigger gaulois_boosters_de_depart after insert on internal.gaulois
  for each row execute function internal.gaulois_cree_boosters_de_depart();

/* ---------- Le rattrapage : les Gaulois déjà créés ---------- */

do $$
declare
  v_user uuid;
begin
  for v_user in select g.user_id from internal.gaulois g order by g.user_id loop
    perform internal.offrir_boosters_de_depart(v_user);
  end loop;
end $$;
