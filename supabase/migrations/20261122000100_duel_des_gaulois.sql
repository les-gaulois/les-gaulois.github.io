-- Le duel des Gaulois, « Coup pour coup », côté serveur (docs/DIRECTION.md, « Le duel des Gaulois » ; moteur partagé :
-- supabase/functions/code-discord/duel/ ; formes des réponses : src/lib/village/contrat-duel.ts).
--
-- Le pilote a validé le 22 novembre 2026 la maquette d'un duel de cartes pour « Mon Gaulois » (gratuit, sans Claude, à la
-- place du coffre du druide), puis choisi ses chantiers. Cette migration en porte le cœur : les règles en SQL, qui font foi,
-- la collection du membre, la main de défense et l'historique de ses défenses, les duels contre la main de défense d'un
-- membre et contre le boss du jour, joués manche par manche, les duels comptés du jour et leur récompense, la file des
-- victoires à annoncer sur Discord, et l'interrupteur du duel.
--
-- Les règles :
-- - LE MOTEUR est une copie exacte de regles.ts et machine.ts : internal.duel_manche (une manche), internal.duel_valeur et
--   internal.duel_choisir (la machine), internal.duel_exp (l'exponentielle faite des quatre opérations), internal.duel_libres,
--   internal.duel_verdict. Un test (tests/unit/duel-serveur.test.ts) joue des milliers de duels tirés au hasard des deux
--   côtés, sur PGlite après toutes les migrations du dépôt, et exige des résultats identiques. Un camp est un tableau
--   d'entiers : vie, vie de départ, énergie, plafond, élan, souffles pris, survie, premier coup, première fatigue, premier
--   souffle, le repos des cinq cartes, puis le nombre de saignements et, pour chacun, ses manches restantes et s'il est neuf.
--   Une carte est un tableau de 27 entiers (rôle, prix, force, repos, puis ses 23 mots-clés dans l'ordre de MOTS_CLES), une
--   main cinq cartes à la suite, des atouts 21 entiers dans l'ordre de CLES_DES_ATOUTS.
-- - LES CARTES sont les objets de la garde-robe : une par objet dessiné des cinq emplacements (internal.duel_cartes, copie
--   du catalogue du moteur). Un membre joue ses objets possédés (internal.gaulois_inventaire) et les cartes de base, que
--   tout le monde a. Une main : une carte par emplacement, pour 12 points de bourse au plus (le prix d'une carte suit sa
--   rareté, de 0 pour la base à 6 pour le divin).
-- - LA MAIN DE DÉFENSE est celle que joue la machine, au niveau du guerrier, quand un autre membre te défie. Elle se lit avec
--   ce que tu possèdes au moment du défi : une carte vendue ou fondue depuis la rend injouable, et personne ne peut te défier
--   tant que tu ne l'as pas refaite. Chaque main de défense a une clé tirée au hasard : c'est elle, jamais un identifiant de
--   compte, que voient les autres membres.
-- - UN DUEL se joue contre la main de défense d'un membre ou contre le boss du jour (le même pour tous, choisi par la date
--   seule : le jour de Paris moins le 23 novembre 2026, modulo le nombre de boss). Une partie à la fois par compte. À chaque
--   manche, le membre pose une carte ; le serveur choisit celle de la machine sans la voir, à partir d'une graine qu'il tire
--   au début (internal.village_hasard) et ne montre jamais, puis résout la manche. Le lieu du duel est la bannière du Gaulois
--   défié (celle du boss contre un boss) ; le compagnon de chaque camp est la famille de son familier. Une partie sans manche
--   jouée pendant 24 heures est perdue par abandon. Un duel finit toujours : la fatigue le termine, et au plus 40 manches.
-- - LES DUELS COMPTÉS : les 3 premiers duels commencés chaque jour (heure de Paris), 4 quand la flamme de série du membre
--   brûle (relevée par le site après chaque construction : internal.duel_flammes, noter_flammes_duel). Contre un même
--   membre, un seul duel compté par jour. Ne sont jamais comptés : un duel pendant un essai du mode GOD, ni contre sa propre
--   main de défense (permis tant que le duel est fermé, pour l'essayer). Au-delà, on joue pour le plaisir, jusqu'à 30 duels
--   par jour.
-- - LA RÉCOMPENSE : un duel compté gagné donne 5 pas du pass de la saison en cours (internal.sentier_gains, source
--   « duel/1 » à « duel/4 », une par victoire comptée du jour). Aucun statère : le duel n'en crée ni n'en prend jamais.
--   Hors saison du pass, rien.
-- - LA FILE DES VICTOIRES : chaque duel compté gagné attend d'être annoncé sur Discord (internal.duel_annonces), avec
--   `essai` vrai tant que le duel est fermé.
-- - L'INTERRUPTEUR : internal.duel_ouvert, faux au départ. Tant qu'il est faux, seul le titulaire du don de statères
--   (internal.stateres_don_titulaire, le pilote) voit et joue le duel ; pour tout autre compte, les fonctions répondent
--   'duel_ferme'. Le pilote l'ouvre dans l'éditeur SQL :
--     update internal.duel_ouvert set ouvert = true, maj_le = now() where id;
--
-- Ce qui est gardé :
-- - les copies du moteur : internal.duel_cartes, duel_panoplies, duel_lieux, duel_compagnons, duel_bannieres,
--   duel_familiers, duel_niveaux (blocs écrits par scripts/fabriquer-sql-duel.ts) et internal.duel_boss (vide ici : les boss
--   arrivent par une migration suivante) ;
-- - internal.duel_ouvert : l'interrupteur, sur une seule ligne ;
-- - internal.duel_mains : la main de défense de chaque compte et sa clé ;
-- - internal.duel_parties : chaque partie, ses mains, ses camps, ses coups, sa graine, son issue ;
-- - internal.duel_flammes : les empreintes OpenFront dont la flamme de série brûle, et quand le site l'a relevé ;
-- - internal.duel_annonces : les victoires à annoncer sur Discord.
-- Tout s'efface avec le compte. Rien n'est dans la sauvegarde chiffrée (export_site) : des parties de jeu, sans objet ni
-- statère.
--
-- Qui peut quoi :
-- - get_mon_duel, enregistrer_main_duel, get_adversaires_duel, commencer_duel, jouer_manche_duel, abandonner_duel : un
--   compte validé qui a créé son Gaulois (internal.village_acheteur), et permis par l'interrupteur. Les deux qui jouent
--   prennent le verrou du compte (internal.village_verrou).
-- - noter_flammes_duel, duel_annonces_a_envoyer, noter_annonces_duel : la clé de service seulement.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des parties de joueurs. Aucune table, aucune colonne ni aucune
-- fonction existante n'est changée ; aucune donnée existante n'est touchée. Rejouée, elle se remplace par la même.

/* ---------- Les copies du moteur ---------- */

create table if not exists internal.duel_cartes (
  objet text primary key check (objet ~ '^[a-z][a-z0-9-]{0,39}$'),
  -- L'ordre du catalogue du moteur : celui où l'écran montre la collection.
  rang integer not null check (rang >= 1),
  emplacement text not null check (emplacement in ('arme', 'tete', 'haut', 'pieds', 'bas')),
  rarete text not null check (rarete in ('base', 'commun', 'peu-commun', 'epique', 'mystique', 'legendaire', 'saison', 'divin')),
  panoplie text,
  effet_unique text,
  -- Les mots-clés de la carte et leur chiffre : { "saigne": 2, "vif": 1 }.
  mots jsonb not null check (jsonb_typeof(mots) = 'object')
);

create table if not exists internal.duel_panoplies (
  panoplie text primary key check (panoplie ~ '^[a-z]{1,24}$'),
  pieces integer not null check (pieces between 1 and 5),
  passif jsonb not null check (jsonb_typeof(passif) = 'object')
);

-- Le lieu du duel : une famille de bannières.
create table if not exists internal.duel_lieux (
  lieu text primary key check (lieu ~ '^[a-z]{1,24}$'),
  passif jsonb not null check (jsonb_typeof(passif) = 'object')
);

-- Le compagnon : une famille de familiers.
create table if not exists internal.duel_compagnons (
  compagnon text primary key check (char_length(compagnon) between 1 and 24),
  passif jsonb not null check (jsonb_typeof(passif) = 'object')
);

create table if not exists internal.duel_bannieres (
  banniere text primary key references internal.bannieres (banniere),
  lieu text not null references internal.duel_lieux (lieu)
);

create table if not exists internal.duel_familiers (
  familier text primary key references internal.familiers (familier),
  compagnon text not null references internal.duel_compagnons (compagnon)
);

create table if not exists internal.duel_niveaux (
  niveau text primary key check (niveau in ('apprenti', 'guerrier', 'druide')),
  fantaisie double precision not null check (fantaisie > 0 and fantaisie <= 100),
  loin integer not null check (loin between 1 and 3)
);

-- Les boss : un par rang du cycle ; le boss du jour est celui du rang (jour de Paris moins le 23 novembre 2026) modulo leur
-- nombre. Remplie par une migration suivante, depuis supabase/functions/code-discord/duel/contenu/boss.ts.
create table if not exists internal.duel_boss (
  boss text primary key check (boss ~ '^[a-z][a-z0-9-]{0,39}$'),
  rang integer not null unique check (rang >= 0),
  -- Ses cinq objets : arme, tête, haut, pieds, bas.
  main text[] not null check (cardinality(main) = 5),
  -- Son pouvoir : des atouts du moteur, pour son camp seul.
  passif jsonb not null default '{}' check (jsonb_typeof(passif) = 'object'),
  banniere text references internal.bannieres (banniere),
  lieu text references internal.duel_lieux (lieu),
  niveau text not null references internal.duel_niveaux (niveau)
);

/* ---------- Le duel ---------- */

create table if not exists internal.duel_ouvert (
  id boolean primary key default true check (id),
  ouvert boolean not null default false,
  maj_le timestamptz not null default now()
);
insert into internal.duel_ouvert (id, ouvert) values (true, false) on conflict (id) do nothing;

create table if not exists internal.duel_mains (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  -- Ce que voient les autres membres pour te défier : jamais l'identifiant du compte.
  cle uuid not null unique default gen_random_uuid(),
  -- Arme, tête, haut, pieds, bas.
  main text[] not null check (cardinality(main) = 5),
  maj_le timestamptz not null default now()
);

create table if not exists internal.duel_parties (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  contre text not null check (contre in ('membre', 'boss')),
  -- Le membre défié ; null contre un boss, ou si son compte a disparu depuis.
  adversaire uuid references public.profiles (user_id) on delete set null,
  boss text,
  niveau text not null,
  compte boolean not null,
  -- Le jour où la partie a commencé, à l'heure de Paris.
  jour date not null,
  main_a text[] not null check (cardinality(main_a) = 5),
  main_b text[] not null check (cardinality(main_b) = 5),
  -- { lieu, compagnon, passifs } de chaque camp.
  options_a jsonb not null,
  options_b jsonb not null,
  -- Les cartes et les atouts de chaque camp, fixés au début : un changement du catalogue ne touche pas une partie en cours.
  cartes_a integer[] not null,
  cartes_b integer[] not null,
  atouts_a integer[] not null,
  atouts_b integer[] not null,
  etat_a integer[] not null,
  etat_b integer[] not null,
  -- Les cartes posées, deux par manche : la tienne, puis celle de la machine.
  coups integer[] not null default '{}',
  manche integer not null default 1 check (manche between 1 and 41),
  -- La graine de la machine : jamais montrée.
  graine bigint not null check (graine between 1 and 2147483646),
  fini boolean not null default false,
  -- Du côté de celui qui défie : 1 gagné, -1 perdu, 0 égalité.
  verdict integer check (verdict in (-1, 0, 1)),
  abandon boolean not null default false,
  pas integer,
  commence_le timestamptz not null default now(),
  joue_le timestamptz not null default now(),
  fini_le timestamptz,
  check (fini = (verdict is not null)),
  check ((contre = 'boss') = (boss is not null))
);
create unique index if not exists duel_parties_une_en_cours on internal.duel_parties (user_id) where not fini;
create index if not exists duel_parties_du_jour on internal.duel_parties (user_id, jour);
create index if not exists duel_parties_defenses on internal.duel_parties (adversaire, fini_le desc) where fini;

create table if not exists internal.duel_flammes (
  empreinte text primary key check (empreinte ~ '^[0-9a-f]{64}$'),
  releve_le timestamptz not null default now()
);
create table if not exists internal.duel_flammes_releve (
  id boolean primary key default true check (id),
  le timestamptz not null
);

create table if not exists internal.duel_annonces (
  partie bigint primary key references internal.duel_parties (id) on delete cascade,
  -- Le duel était fermé : la victoire d'un essai du titulaire.
  essai boolean not null,
  cree_le timestamptz not null default now(),
  annoncee_le timestamptz
);
create index if not exists duel_annonces_a_envoyer on internal.duel_annonces (cree_le) where annoncee_le is null;

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
do $$
declare
  v_t text;
begin
  foreach v_t in array array['duel_cartes', 'duel_panoplies', 'duel_lieux', 'duel_compagnons', 'duel_bannieres', 'duel_familiers',
    'duel_niveaux', 'duel_boss', 'duel_ouvert', 'duel_mains', 'duel_parties', 'duel_flammes', 'duel_flammes_releve', 'duel_annonces'] loop
    execute format('alter table internal.%I enable row level security', v_t);
    execute format('revoke all on table internal.%I from public, anon, authenticated', v_t);
  end loop;
end $$;

/* ---------- Les données du moteur ---------- */

-- <duel-cartes> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_cartes (objet, rang, emplacement, rarete, panoplie, effet_unique, mots) values
  ('gourdin', 1, 'arme', 'base', null, null, '{}'::jsonb),
  ('baguette', 2, 'arme', 'commun', 'cuisine', null, '{"regal":1}'::jsonb),
  ('poele', 3, 'arme', 'commun', 'cuisine', null, '{"assomme":1}'::jsonb),
  ('baton-marche', 4, 'arme', 'commun', null, null, '{"assomme":1}'::jsonb),
  ('fronde', 5, 'arme', 'commun', null, null, '{"perce":1}'::jsonb),
  ('dague', 6, 'arme', 'commun', null, null, '{"saigne":1}'::jsonb),
  ('coutelas', 7, 'arme', 'commun', null, null, '{"saigne":1}'::jsonb),
  ('lance', 8, 'arme', 'commun', null, null, '{"perce":1}'::jsonb),
  ('javelot', 9, 'arme', 'commun', null, null, '{"perce":1}'::jsonb),
  ('fourche-guerre', 10, 'arme', 'commun', null, null, '{"perce":1}'::jsonb),
  ('rouleau-patisserie', 11, 'arme', 'commun', 'cuisine', null, '{"assomme":1}'::jsonb),
  ('balai', 12, 'arme', 'commun', null, null, '{"assomme":1}'::jsonb),
  ('louche', 13, 'arme', 'commun', 'cuisine', null, '{"assomme":1}'::jsonb),
  ('saucisson', 14, 'arme', 'commun', 'cuisine', null, '{"regal":1}'::jsonb),
  ('epee-bois', 15, 'arme', 'commun', null, null, '{"saigne":1}'::jsonb),
  ('tue-mouche', 16, 'arme', 'commun', null, null, '{"rage":1}'::jsonb),
  ('hache', 17, 'arme', 'peu-commun', null, null, '{"saigne":1}'::jsonb),
  ('bouclier-bois', 18, 'arme', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('poulet', 19, 'arme', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('talkie', 20, 'arme', 'peu-commun', 'armee', null, '{"elan":1}'::jsonb),
  ('epee-courte', 21, 'arme', 'peu-commun', null, null, '{"saigne":1}'::jsonb),
  ('epee-longue', 22, 'arme', 'peu-commun', null, null, '{"saigne":1}'::jsonb),
  ('sabre-courbe', 23, 'arme', 'peu-commun', null, null, '{"saigne":1}'::jsonb),
  ('faux-guerre', 24, 'arme', 'peu-commun', null, null, '{"saigne":1}'::jsonb),
  ('cor-guerre', 25, 'arme', 'peu-commun', 'fanfare', null, '{"elan":1}'::jsonb),
  ('bouclier-rond-peint', 26, 'arme', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('bouclier-long', 27, 'arme', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('rateau', 28, 'arme', 'peu-commun', null, null, '{"perce":1}'::jsonb),
  ('pelle-tranchee', 29, 'arme', 'peu-commun', 'armee', null, '{"assomme":1}'::jsonb),
  ('torche', 30, 'arme', 'peu-commun', 'forge', null, '{"brule":1}'::jsonb),
  ('gamelle', 31, 'arme', 'peu-commun', 'cuisine', null, '{"regal":1}'::jsonb),
  ('jumelles', 32, 'arme', 'peu-commun', 'armee', null, '{"elan":1}'::jsonb),
  ('parapluie', 33, 'arme', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('epee', 34, 'arme', 'epique', 'fer', null, '{"saigne":2}'::jsonb),
  ('arc', 35, 'arme', 'epique', null, null, '{"perce":2}'::jsonb),
  ('drapeau', 36, 'arme', 'epique', 'fanfare', null, '{"elan":2}'::jsonb),
  ('hallebarde', 37, 'arme', 'epique', null, null, '{"perce":2}'::jsonb),
  ('fleau-armes', 38, 'arme', 'epique', null, null, '{"assomme":2}'::jsonb),
  ('marteau-guerre', 39, 'arme', 'epique', 'forge', null, '{"assomme":2}'::jsonb),
  ('hache-double', 40, 'arme', 'epique', null, null, '{"saigne":2}'::jsonb),
  ('arbalete', 41, 'arme', 'epique', null, null, '{"perce":2}'::jsonb),
  ('bouclier-umbo', 42, 'arme', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('marteau-forgeron', 43, 'arme', 'epique', 'forge', null, '{"brule":1}'::jsonb),
  ('canne-peche', 44, 'arme', 'epique', 'mer', null, '{"perce":2}'::jsonb),
  ('clairon', 45, 'arme', 'epique', 'fanfare', null, '{"elan":2}'::jsonb),
  ('tambour', 46, 'arme', 'epique', 'fanfare', null, '{"assomme":2}'::jsonb),
  ('jambon', 47, 'arme', 'epique', 'cuisine', null, '{"assomme":2}'::jsonb),
  ('lanterne', 48, 'arme', 'epique', null, null, '{"brule":1}'::jsonb),
  ('fourchette-geante', 49, 'arme', 'epique', 'cuisine', null, '{"perce":2}'::jsonb),
  ('masse', 50, 'arme', 'mystique', null, null, '{"assomme":2,"perce":1}'::jsonb),
  ('lance-patates', 51, 'arme', 'mystique', null, null, '{"assomme":1,"perce":2}'::jsonb),
  ('bouclier-bronze', 52, 'arme', 'mystique', 'bronze', null, '{"perce":1,"rempart":2}'::jsonb),
  ('masse-ailettes', 53, 'arme', 'mystique', null, null, '{"assomme":2,"perce":1}'::jsonb),
  ('trident', 54, 'arme', 'mystique', 'mer', null, '{"assomme":1,"perce":2}'::jsonb),
  ('epee-bronze', 55, 'arme', 'mystique', 'bronze', null, '{"saigne":2,"perce":1}'::jsonb),
  ('epee-flamboyante', 56, 'arme', 'mystique', null, null, '{"saigne":1,"brule":1}'::jsonb),
  ('rondache-bronze', 57, 'arme', 'mystique', 'bronze', null, '{"perce":1,"rempart":2}'::jsonb),
  ('oie', 58, 'arme', 'mystique', null, null, '{"perce":1,"regal":2}'::jsonb),
  ('sucre-orge', 59, 'arme', 'mystique', 'fete', null, '{"assomme":2,"perce":1}'::jsonb),
  ('cornemuse', 60, 'arme', 'mystique', 'fanfare', null, '{"perce":1,"elan":2}'::jsonb),
  ('chat', 61, 'arme', 'mystique', null, null, '{"perce":1,"regal":2}'::jsonb),
  ('epee-or', 62, 'arme', 'legendaire', 'or', 'Lame du chef', '{"saigne":2,"perce":3}'::jsonb),
  ('carnyx', 63, 'arme', 'legendaire', 'fanfare', 'Appel du carnyx', '{"elan":2,"reveil":1}'::jsonb),
  ('lance-ceremonie', 64, 'arme', 'legendaire', null, 'Estoc d''apparat', '{"inarretable":1}'::jsonb),
  ('etendard', 65, 'arme', 'legendaire', 'fanfare', 'Ralliement', '{"elan":2,"plein":1}'::jsonb),
  ('bouclier-or-cisele', 66, 'arme', 'legendaire', 'or', 'Mur d''or', '{"epines":2,"muraille":1}'::jsonb),
  ('harpe-or', 67, 'arme', 'legendaire', 'fanfare', 'Berceuse', '{"regal":2,"gel":1}'::jsonb),
  ('pelle-tarte-or', 68, 'arme', 'legendaire', 'or', 'Part du chef', '{"vampire":1}'::jsonb),
  ('sceptre-bois-flotte', 69, 'arme', 'legendaire', null, 'Marée', '{"assomme":3}'::jsonb),
  ('plume-or', 70, 'arme', 'legendaire', 'plumes', 'Trait de plume', '{"infatigable":1}'::jsonb),
  ('panneau-d-erreur', 71, 'arme', 'divin', 'introuvable', 'Plantage', '{"assomme":2,"inarretable":1}'::jsonb),
  ('pancarte-par-ici', 72, 'arme', 'divin', 'vache', 'Par ici', '{"perce":4,"gel":1}'::jsonb),
  ('gros-bouton-rouge', 73, 'arme', 'divin', 'atomique', 'Ne pas appuyer', '{"brule":3,"lourd":1}'::jsonb),
  ('telecommande-de-tir', 74, 'arme', 'divin', 'fusee', 'Mise à feu', '{"vif":1,"execute":4}'::jsonb),
  ('bonnet', 75, 'tete', 'base', null, null, '{}'::jsonb),
  ('bandeau', 76, 'tete', 'commun', null, null, '{"vif":1}'::jsonb),
  ('chapeau-paille', 77, 'tete', 'commun', null, null, '{"rage":1}'::jsonb),
  ('beret', 78, 'tete', 'commun', null, null, '{"vif":1}'::jsonb),
  ('chapeau-feutre', 79, 'tete', 'commun', null, null, '{"rage":1}'::jsonb),
  ('bonnet-nuit', 80, 'tete', 'commun', null, null, '{"regal":1}'::jsonb),
  ('bob', 81, 'tete', 'commun', null, null, '{"vif":1}'::jsonb),
  ('casquette', 82, 'tete', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('foulard-noue', 83, 'tete', 'commun', null, null, '{"vif":1}'::jsonb),
  ('cache-oreilles', 84, 'tete', 'commun', 'neige', null, '{"gel":1}'::jsonb),
  ('bonnet-pompon', 85, 'tete', 'commun', 'neige', null, '{"rage":1}'::jsonb),
  ('chapeau-pluie', 86, 'tete', 'commun', 'mer', null, '{"vif":1}'::jsonb),
  ('seau-bois', 87, 'tete', 'commun', null, null, '{"assomme":1}'::jsonb),
  ('entonnoir', 88, 'tete', 'commun', null, null, '{"perce":1}'::jsonb),
  ('couvercle', 89, 'tete', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('chou', 90, 'tete', 'commun', null, null, '{"regal":1}'::jsonb),
  ('couronne-papier', 91, 'tete', 'commun', 'fete', null, '{"ardeur":1}'::jsonb),
  ('chapeau-fete', 92, 'tete', 'commun', 'fete', null, '{"ardeur":1}'::jsonb),
  ('capuche', 93, 'tete', 'peu-commun', null, null, '{"vif":1}'::jsonb),
  ('casque-cuir', 94, 'tete', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('marmite', 95, 'tete', 'peu-commun', 'cuisine', null, '{"assomme":1}'::jsonb),
  ('chapeau-berger', 96, 'tete', 'peu-commun', null, null, '{"rage":1}'::jsonb),
  ('toque-fourrure', 97, 'tete', 'peu-commun', 'neige', null, '{"gel":1}'::jsonb),
  ('canotier', 98, 'tete', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('chapeau-melon', 99, 'tete', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('chapeau-pecheur', 100, 'tete', 'peu-commun', 'mer', null, '{"vif":1}'::jsonb),
  ('calot-boulanger', 101, 'tete', 'peu-commun', 'cuisine', null, '{"regal":1}'::jsonb),
  ('lunettes-forgeron', 102, 'tete', 'peu-commun', 'forge', null, '{"brule":1}'::jsonb),
  ('casque-nasal', 103, 'tete', 'peu-commun', 'armee', null, '{"rempart":1}'::jsonb),
  ('passoire', 104, 'tete', 'peu-commun', 'cuisine', null, '{"rempart":1}'::jsonb),
  ('perruque-frisee', 105, 'tete', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('abat-jour', 106, 'tete', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('pot-fleurs', 107, 'tete', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('pasteque', 108, 'tete', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('casque', 109, 'tete', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('toque', 110, 'tete', 'epique', 'cuisine', null, '{"regal":2}'::jsonb),
  ('casque-armee', 111, 'tete', 'epique', 'armee', null, '{"rempart":2}'::jsonb),
  ('slip', 112, 'tete', 'epique', null, null, '{"ardeur":2}'::jsonb),
  ('haut-de-forme', 113, 'tete', 'epique', null, null, '{"ardeur":2}'::jsonb),
  ('couronne-fleurs', 114, 'tete', 'epique', null, null, '{"epines":2}'::jsonb),
  ('chapka', 115, 'tete', 'epique', 'neige', null, '{"gel":2}'::jsonb),
  ('chapeau-apiculteur', 116, 'tete', 'epique', null, null, '{"epines":2}'::jsonb),
  ('barrette-mineur', 117, 'tete', 'epique', null, null, '{"rage":2}'::jsonb),
  ('heaume', 118, 'tete', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('casque-plumet', 119, 'tete', 'epique', 'plumes', null, '{"rempart":2}'::jsonb),
  ('casque-visiere', 120, 'tete', 'epique', null, null, '{"rempart":2}'::jsonb),
  ('masque-bois', 121, 'tete', 'epique', null, null, '{"rage":2}'::jsonb),
  ('citrouille', 122, 'tete', 'epique', 'fete', null, '{"brule":1}'::jsonb),
  ('bois-cerf', 123, 'tete', 'epique', 'sauvage', null, '{"epines":2}'::jsonb),
  ('casque-crete', 124, 'tete', 'mystique', null, null, '{"epines":2,"rempart":1}'::jsonb),
  ('cone', 125, 'tete', 'mystique', null, null, '{"assomme":2,"rage":1}'::jsonb),
  ('tricorne', 126, 'tete', 'mystique', 'mer', null, '{"saigne":2,"rage":1}'::jsonb),
  ('couronne-givre', 127, 'tete', 'mystique', 'neige', null, '{"rage":1,"gel":2}'::jsonb),
  ('toque-paon', 128, 'tete', 'mystique', 'plumes', null, '{"rempart":1,"rage":2}'::jsonb),
  ('nuage-orage', 129, 'tete', 'mystique', null, null, '{"rage":1,"gel":2}'::jsonb),
  ('bocal-poisson', 130, 'tete', 'mystique', 'mer', null, '{"rempart":2,"rage":1}'::jsonb),
  ('nid-oiseau', 131, 'tete', 'mystique', null, null, '{"assomme":2,"epines":1}'::jsonb),
  ('dragon-fete', 132, 'tete', 'mystique', 'fete', null, '{"brule":1,"ardeur":1}'::jsonb),
  ('casque-criniere', 133, 'tete', 'mystique', 'sauvage', null, '{"epines":2,"rempart":1}'::jsonb),
  ('casque-or', 134, 'tete', 'legendaire', 'or', 'Éclat d''or', '{"assomme":1,"rempart":2}'::jsonb),
  ('couronne', 135, 'tete', 'legendaire', null, 'Autorité', '{"ardeur":1,"voleElan":1}'::jsonb),
  ('couronne-moissons', 136, 'tete', 'legendaire', null, 'Moisson', '{"regal":3}'::jsonb),
  ('chapeau-panache', 137, 'tete', 'legendaire', 'plumes', 'Panache', '{"vif":1,"elan":2}'::jsonb),
  ('casque-apparat', 138, 'tete', 'legendaire', null, 'Parade', '{"muraille":1}'::jsonb),
  ('candelabre-or', 139, 'tete', 'legendaire', 'or', 'Sept flammes', '{"brule":3}'::jsonb),
  ('heaume-couronne', 140, 'tete', 'legendaire', null, 'Roi de fer', '{"rempart":2,"lourd":1}'::jsonb),
  ('couronne-solstice', 141, 'tete', 'saison', null, 'Solstice', '{"brule":1,"gel":1}'::jsonb),
  ('tete-introuvable', 142, 'tete', 'divin', 'introuvable', 'Erreur 404', '{"assomme":2,"gel":2}'::jsonb),
  ('soucoupe-curieuse', 143, 'tete', 'divin', 'vache', 'Enlèvement', '{"assomme":2,"voleElan":1}'::jsonb),
  ('champignon-atomique', 144, 'tete', 'divin', 'atomique', 'Retombées', '{"assomme":2,"brule":4}'::jsonb),
  ('ogive', 145, 'tete', 'divin', 'fusee', 'Pointe', '{"inarretable":1}'::jsonb),
  ('tunique', 146, 'haut', 'base', null, null, '{}'::jsonb),
  ('chemise', 147, 'haut', 'base', null, null, '{}'::jsonb),
  ('tunique-rouge', 148, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('tunique-verte', 149, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('tunique-rayee', 150, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('chemise-carreaux', 151, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('gilet-laine', 152, 'haut', 'commun', null, null, '{"regal":1}'::jsonb),
  ('tablier-boulanger', 153, 'haut', 'commun', 'cuisine', null, '{"regal":1}'::jsonb),
  ('pull-tricote', 154, 'haut', 'commun', null, null, '{"regal":1}'::jsonb),
  ('vareuse-pecheur', 155, 'haut', 'commun', 'mer', null, '{"vif":1}'::jsonb),
  ('plastron-cuir', 156, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('gambison', 157, 'haut', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('cape-voyage', 158, 'haut', 'commun', null, null, '{"vif":1}'::jsonb),
  ('pelerine-pluie', 159, 'haut', 'commun', 'mer', null, '{"vif":1}'::jsonb),
  ('veste-peau', 160, 'haut', 'peu-commun', 'sauvage', null, '{"rage":1}'::jsonb),
  ('maillot-marin', 161, 'haut', 'peu-commun', 'mer', null, '{"vif":1}'::jsonb),
  ('gilet-berger', 162, 'haut', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('tablier-forgeron', 163, 'haut', 'peu-commun', 'forge', null, '{"brule":1}'::jsonb),
  ('blouse-peintre', 164, 'haut', 'peu-commun', null, null, '{"rempart":1}'::jsonb),
  ('poncho', 165, 'haut', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('manteau-fourrure', 166, 'haut', 'peu-commun', 'neige', null, '{"gel":1}'::jsonb),
  ('veste-kaki', 167, 'haut', 'peu-commun', 'armee', null, '{"rage":1}'::jsonb),
  ('gilet-sauvetage', 168, 'haut', 'peu-commun', 'mer', null, '{"rempart":1}'::jsonb),
  ('cape-capuche', 169, 'haut', 'peu-commun', null, null, '{"vif":1}'::jsonb),
  ('cotte-mailles', 170, 'haut', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('maillot-clan', 171, 'haut', 'epique', 'fanfare', null, '{"elan":2}'::jsonb),
  ('tunique-brodee', 172, 'haut', 'epique', null, null, '{"ardeur":2}'::jsonb),
  ('chemise-jabot', 173, 'haut', 'epique', null, null, '{"ardeur":2}'::jsonb),
  ('gilet-cuir-cloute', 174, 'haut', 'epique', null, null, '{"epines":2}'::jsonb),
  ('tunique-fete', 175, 'haut', 'epique', 'fete', null, '{"ardeur":2}'::jsonb),
  ('brigandine', 176, 'haut', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('cuirasse-ecailles', 177, 'haut', 'epique', null, null, '{"epines":2}'::jsonb),
  ('plastron-fer', 178, 'haut', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('costume-poulet', 179, 'haut', 'epique', 'fete', null, '{"regal":2}'::jsonb),
  ('deguisement-ours', 180, 'haut', 'epique', 'fete', null, '{"rage":2}'::jsonb),
  ('cape-chef', 181, 'haut', 'mystique', null, null, '{"vif":1,"elan":2}'::jsonb),
  ('tunique-teinturier', 182, 'haut', 'mystique', null, null, '{"rempart":1,"ardeur":2}'::jsonb),
  ('tunique-etoilee', 183, 'haut', 'mystique', null, null, '{"rempart":1,"ardeur":2}'::jsonb),
  ('cuirasse-bronze', 184, 'haut', 'mystique', 'bronze', null, '{"epines":1,"rempart":2}'::jsonb),
  ('manteau-plumes', 185, 'haut', 'mystique', 'plumes', null, '{"rempart":1,"vif":1}'::jsonb),
  ('cape-etoilee', 186, 'haut', 'mystique', null, null, '{"vif":1,"ardeur":2}'::jsonb),
  ('armure-os', 187, 'haut', 'mystique', null, null, '{"epines":2,"rempart":1}'::jsonb),
  ('torque-or', 188, 'haut', 'legendaire', 'or', 'Torque du chef', '{"plein":1}'::jsonb),
  ('chemise-fil-or', 189, 'haut', 'legendaire', 'or', 'Fil d''or', '{"vif":1,"regal":2}'::jsonb),
  ('gilet-brocart', 190, 'haut', 'legendaire', null, 'Brocart', '{"ardeur":2,"elan":2}'::jsonb),
  ('armure-doree', 191, 'haut', 'legendaire', 'or', 'Ciselures', '{"epines":3}'::jsonb),
  ('manteau-hermine', 192, 'haut', 'legendaire', null, 'Hermine', '{"regal":2,"gel":1,"purge":1}'::jsonb),
  ('armure-dragon', 193, 'haut', 'legendaire', null, 'Souffle du dragon', '{"brule":2,"epines":2}'::jsonb),
  ('torse-en-chargement', 194, 'haut', 'divin', 'introuvable', 'Chargement', '{"elan":4}'::jsonb),
  ('costume-de-vache', 195, 'haut', 'divin', 'vache', 'Cuir épais', '{"epines":1,"regal":2}'::jsonb),
  ('combinaison-jaune', 196, 'haut', 'divin', 'atomique', 'Étanche', '{"epines":2,"antiFatigue":1,"purge":1}'::jsonb),
  ('fuselage', 197, 'haut', 'divin', 'fusee', 'Blindage', '{"epines":3,"muraille":1}'::jsonb),
  ('bottes', 198, 'pieds', 'base', null, null, '{}'::jsonb),
  ('sandales', 199, 'pieds', 'commun', null, null, '{"vif":1}'::jsonb),
  ('sabots-bois', 200, 'pieds', 'commun', null, null, '{"rempart":1}'::jsonb),
  ('chaussons-laine', 201, 'pieds', 'commun', null, null, '{"regal":1}'::jsonb),
  ('mocassins', 202, 'pieds', 'commun', null, null, '{"vif":1}'::jsonb),
  ('bottes-pluie', 203, 'pieds', 'commun', 'mer', null, '{"vif":1}'::jsonb),
  ('bottes-lacees', 204, 'pieds', 'commun', null, null, '{"vif":1}'::jsonb),
  ('espadrilles', 205, 'pieds', 'commun', null, null, '{"vif":1}'::jsonb),
  ('chaussettes-trouees', 206, 'pieds', 'commun', null, null, '{"rage":1}'::jsonb),
  ('souliers-boucle', 207, 'pieds', 'commun', null, null, '{"ardeur":1}'::jsonb),
  ('bottes-fourrees', 208, 'pieds', 'peu-commun', 'neige', null, '{"gel":1}'::jsonb),
  ('guetres', 209, 'pieds', 'peu-commun', null, null, '{"vif":1}'::jsonb),
  ('bottes-cavalier', 210, 'pieds', 'peu-commun', null, null, '{"vif":1}'::jsonb),
  ('chaussures-marche', 211, 'pieds', 'peu-commun', null, null, '{"vif":1}'::jsonb),
  ('bottes-pecheur', 212, 'pieds', 'peu-commun', 'mer', null, '{"vif":1}'::jsonb),
  ('bottes-neige', 213, 'pieds', 'peu-commun', 'neige', null, '{"gel":1}'::jsonb),
  ('poulaines', 214, 'pieds', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('bottes-armee', 215, 'pieds', 'peu-commun', 'armee', null, '{"vif":1}'::jsonb),
  ('bottes-fer', 216, 'pieds', 'epique', 'forge', null, '{"rempart":2}'::jsonb),
  ('bottes-eperons', 217, 'pieds', 'epique', null, null, '{"epines":2}'::jsonb),
  ('patins-glace', 218, 'pieds', 'epique', 'neige', null, '{"gel":2}'::jsonb),
  ('raquettes-neige', 219, 'pieds', 'epique', 'neige', null, '{"gel":2}'::jsonb),
  ('bottes-bronze', 220, 'pieds', 'epique', 'bronze', null, '{"rempart":2}'::jsonb),
  ('bottes-ecailles', 221, 'pieds', 'epique', null, null, '{"epines":2}'::jsonb),
  ('bottes-ecarlates', 222, 'pieds', 'mystique', null, null, '{"brule":1,"vif":1}'::jsonb),
  ('pantoufles-lapin', 223, 'pieds', 'mystique', null, null, '{"vif":1,"regal":2}'::jsonb),
  ('bottes-plumes', 224, 'pieds', 'mystique', 'plumes', null, '{"vif":1,"ardeur":1}'::jsonb),
  ('bottes-ressorts', 225, 'pieds', 'mystique', null, null, '{"vif":1,"ardeur":1}'::jsonb),
  ('bottes-or', 226, 'pieds', 'legendaire', 'or', 'Foulée d''or', '{"vif":1,"ardeur":1}'::jsonb),
  ('bottes-couronnees', 227, 'pieds', 'legendaire', null, 'Marche du roi', '{"regal":1,"antiFatigue":1}'::jsonb),
  ('bottes-soleil', 228, 'pieds', 'legendaire', null, 'Zénith', '{"brule":2,"vif":1}'::jsonb),
  ('bottes-sans-texture', 229, 'pieds', 'divin', 'introuvable', 'Passe-muraille', '{"vif":1,"regal":2,"ardeur":2}'::jsonb),
  ('sabots-de-vache', 230, 'pieds', 'divin', 'vache', 'Ruade', '{"brule":4}'::jsonb),
  ('bottes-de-decontamination', 231, 'pieds', 'divin', 'atomique', 'Douche', '{"regal":2,"plein":1,"purge":1}'::jsonb),
  ('tuyeres', 232, 'pieds', 'divin', 'fusee', 'Poussée', '{"vif":1,"ardeur":1}'::jsonb),
  ('braies', 233, 'bas', 'base', null, null, '{}'::jsonb),
  ('braies-carreaux', 234, 'bas', 'base', null, null, '{}'::jsonb),
  ('braies-bleues', 235, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('braies-vertes', 236, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('braies-grises', 237, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('braies-rouges', 238, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('braies-courtes', 239, 'bas', 'commun', null, null, '{"vif":1}'::jsonb),
  ('braies-rapiecees', 240, 'bas', 'commun', null, null, '{"rage":1}'::jsonb),
  ('braies-retroussees', 241, 'bas', 'commun', null, null, '{"vif":1}'::jsonb),
  ('jupe-laine', 242, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('pantalon-toile', 243, 'bas', 'commun', null, null, '{"regal":1}'::jsonb),
  ('pagne-fourrure', 244, 'bas', 'commun', 'neige', null, '{"gel":1}'::jsonb),
  ('pagne-lin', 245, 'bas', 'commun', null, null, '{"rage":1}'::jsonb),
  ('braies-rayees', 246, 'bas', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('braies-losanges', 247, 'bas', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('kilt-carreaux', 248, 'bas', 'peu-commun', null, null, '{"rage":1}'::jsonb),
  ('pantalon-marin', 249, 'bas', 'peu-commun', 'mer', null, '{"vif":1}'::jsonb),
  ('calecon-pois', 250, 'bas', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('bleu-travail', 251, 'bas', 'peu-commun', 'forge', null, '{"rage":1}'::jsonb),
  ('braies-lacees', 252, 'bas', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('braies-bicolores', 253, 'bas', 'peu-commun', null, null, '{"ardeur":1}'::jsonb),
  ('jupe-paille', 254, 'bas', 'peu-commun', null, null, '{"regal":1}'::jsonb),
  ('braies-cuir', 255, 'bas', 'epique', null, null, '{"regal":2}'::jsonb),
  ('cuissards', 256, 'bas', 'epique', null, null, '{"rempart":2}'::jsonb),
  ('jambieres-fer', 257, 'bas', 'epique', 'fer', null, '{"rempart":2}'::jsonb),
  ('braies-fete', 258, 'bas', 'epique', 'fete', null, '{"ardeur":2}'::jsonb),
  ('braies-loup', 259, 'bas', 'epique', 'sauvage', null, '{"rage":2}'::jsonb),
  ('pantalon-bouffant', 260, 'bas', 'epique', null, null, '{"ardeur":2}'::jsonb),
  ('braies-fleurs', 261, 'bas', 'epique', null, null, '{"regal":2}'::jsonb),
  ('jambieres-bronze', 262, 'bas', 'mystique', 'bronze', null, '{"rempart":2,"regal":1}'::jsonb),
  ('jambieres-ecailles', 263, 'bas', 'mystique', null, null, '{"epines":2,"rempart":1}'::jsonb),
  ('braies-flammes', 264, 'bas', 'mystique', null, null, '{"brule":1,"regal":1}'::jsonb),
  ('jupe-plumes', 265, 'bas', 'mystique', 'plumes', null, '{"vif":1,"regal":1}'::jsonb),
  ('tonneau', 266, 'bas', 'mystique', null, null, '{"rempart":2,"regal":1}'::jsonb),
  ('braies-or', 267, 'bas', 'legendaire', 'or', 'Second souffle', '{"vif":1,"ardeur":1}'::jsonb),
  ('jupe-guerre-or', 268, 'bas', 'legendaire', 'or', 'Pas de guerre', '{"elan":3}'::jsonb),
  ('braies-royales', 269, 'bas', 'legendaire', null, 'Repos royal', '{"reveil":1}'::jsonb),
  ('braies-sans-texture', 270, 'bas', 'divin', 'introuvable', 'Sans texture', '{"regal":4,"purge":1}'::jsonb),
  ('braies-de-vache', 271, 'bas', 'divin', 'vache', 'Lait frais', '{"regal":5}'::jsonb),
  ('braies-etanches', 272, 'bas', 'divin', 'atomique', 'Sas', '{"vif":1,"regal":4,"antiFatigue":1}'::jsonb),
  ('ailerons', 273, 'bas', 'divin', 'fusee', 'Stabilité', '{"regal":3,"reveil":1}'::jsonb)
on conflict (objet) do update set rang = excluded.rang, emplacement = excluded.emplacement, rarete = excluded.rarete, panoplie = excluded.panoplie, effet_unique = excluded.effet_unique, mots = excluded.mots;
-- </duel-cartes>

-- <duel-panoplies> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_panoplies (panoplie, pieces, passif) values
  ('forge', 3, '{"energieDepart":1}'::jsonb),
  ('mer', 3, '{"souffleSansUsure":1}'::jsonb),
  ('cuisine', 3, '{"soufflePlus":1}'::jsonb),
  ('armee', 3, '{"energieDepart":2}'::jsonb),
  ('neige', 3, '{"fatigueMoins":1}'::jsonb),
  ('bronze', 3, '{"gardePlus":2}'::jsonb),
  ('fer', 3, '{"gardePlus":1}'::jsonb),
  ('fete', 3, '{"vie":3}'::jsonb),
  ('plumes', 3, '{"piedsVifs":1}'::jsonb),
  ('fanfare', 2, '{"enchainePlus":1}'::jsonb),
  ('sauvage', 3, '{"rage":1}'::jsonb),
  ('or', 2, '{"energieDepart":1,"plafond":1}'::jsonb),
  ('introuvable', 2, '{"vie":3,"survie":1}'::jsonb),
  ('vache', 2, '{"souffleSansUsure":1,"soufflePlus":3}'::jsonb),
  ('atomique', 2, '{"fatigueMoins":1,"fatigueAdverse":2}'::jsonb),
  ('fusee', 2, '{"premierCoup":5}'::jsonb)
on conflict (panoplie) do update set pieces = excluded.pieces, passif = excluded.passif;
-- </duel-panoplies>

-- <duel-lieux> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_lieux (lieu, passif) values
  ('front', '{"frappePlus":1}'::jsonb),
  ('mers', '{"elanPlus":1}'::jsonb),
  ('cartes', '{"fatigueTard":1}'::jsonb),
  ('saisons', '{"soufflePlus":1}'::jsonb),
  ('legendes', '{"energieDepart":1}'::jsonb),
  ('tresors', '{"plafond":1}'::jsonb)
on conflict (lieu) do update set passif = excluded.passif;
-- </duel-lieux>

-- <duel-compagnons> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_compagnons (compagnon, passif) values
  ('Ferme', '{"vie":1}'::jsonb),
  ('Forêt', '{"energieDepart":1}'::jsonb),
  ('Ciel et eaux', '{"elanDepart":1}'::jsonb),
  ('Légendes', '{"premiereFatigue":1}'::jsonb),
  ('Drôles', '{"premierSouffle":1}'::jsonb)
on conflict (compagnon) do update set passif = excluded.passif;
-- </duel-compagnons>

-- <duel-bannieres> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_bannieres (banniere, lieu) values
  ('poste-sur-la-crete', 'front'),
  ('ligne-de-front', 'front'),
  ('ville-sous-alerte', 'front'),
  ('silo-ouvert', 'front'),
  ('champignon-au-crepuscule', 'front'),
  ('barrage-anti-aerien', 'front'),
  ('salve-se-separe', 'front'),
  ('aube-de-la-bombe-h', 'front'),
  ('flotte-en-ligne', 'mers'),
  ('archipel-turquoise', 'mers'),
  ('port-au-couchant', 'mers'),
  ('convoi-des-glaces', 'mers'),
  ('debarquement-a-l-aube', 'mers'),
  ('bataille-de-nuit', 'mers'),
  ('mer-des-lueurs', 'mers'),
  ('cuirasse-de-l-orage', 'mers'),
  ('dunes-et-oasis', 'cartes'),
  ('banquise-du-nord', 'cartes'),
  ('delta-verdoyant', 'cartes'),
  ('terres-des-clans', 'cartes'),
  ('cretes-au-levant', 'cartes'),
  ('monde-de-nuit', 'cartes'),
  ('pacte-de-lumiere', 'cartes'),
  ('table-du-stratege', 'cartes'),
  ('foret-doree', 'saisons'),
  ('plage-au-couchant', 'saisons'),
  ('cerisiers-en-fleurs', 'saisons'),
  ('nuit-de-neige', 'saisons'),
  ('nuit-des-citrouilles', 'saisons'),
  ('feux-du-nouvel-an', 'saisons'),
  ('aurore-du-lac-gele', 'saisons'),
  ('eclipse-totale', 'saisons'),
  ('crepuscule-neon', 'legendes'),
  ('mer-de-nuages', 'legendes'),
  ('salle-d-arcade', 'legendes'),
  ('grotte-aux-cristaux', 'legendes'),
  ('abysses-lumineuses', 'legendes'),
  ('forge-du-volcan', 'legendes'),
  ('sous-la-nebuleuse', 'legendes'),
  ('dragon-de-pierre', 'legendes'),
  ('matin-de-la-victoire', 'tresors'),
  ('armada-sans-fin', 'tresors'),
  ('grande-comete', 'tresors'),
  ('pluie-d-etoiles-filantes', 'tresors'),
  ('iles-suspendues', 'tresors'),
  ('serpent-de-mer', 'tresors'),
  ('tornade-sur-la-plaine', 'tresors'),
  ('mur-de-sable', 'tresors'),
  ('dernier-bastion', 'tresors'),
  ('salle-de-guerre', 'tresors'),
  ('geante-aux-anneaux', 'tresors'),
  ('lune-de-cristal', 'tresors'),
  ('cite-d-or-engloutie', 'tresors'),
  ('arbre-monde', 'tresors'),
  ('cathedrale-de-glace', 'tresors'),
  ('chutes-de-lave', 'tresors'),
  ('frappe-vue-de-l-orbite', 'tresors'),
  ('trou-noir', 'tresors'),
  ('phenix-de-braise', 'tresors'),
  ('arbre-de-foudre', 'tresors')
on conflict (banniere) do update set lieu = excluded.lieu;
-- </duel-bannieres>

-- <duel-familiers> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_familiers (familier, compagnon) values
  ('souris-des-greniers', 'Ferme'),
  ('poussin-jaune', 'Ferme'),
  ('escargot-du-potager', 'Ferme'),
  ('poule-rousse', 'Ferme'),
  ('lapin-de-garenne', 'Ferme'),
  ('chat-tigre', 'Ferme'),
  ('canard-colvert', 'Ferme'),
  ('oie-blanche', 'Ferme'),
  ('agneau-laineux', 'Ferme'),
  ('chien-de-berger', 'Ferme'),
  ('cochon-rose', 'Ferme'),
  ('chevre-a-la-clochette', 'Ferme'),
  ('ane-gris', 'Ferme'),
  ('molosse-au-collier-de-bronze', 'Ferme'),
  ('vache-tachetee', 'Ferme'),
  ('chat-noir-aux-yeux-d-or', 'Ferme'),
  ('cheval-de-trait', 'Ferme'),
  ('taureau-noir-aux-cornes-de-bronze', 'Ferme'),
  ('coq-aux-plumes-d-or', 'Ferme'),
  ('belier-aux-cornes-d-or', 'Ferme'),
  ('loir-gourmand', 'Forêt'),
  ('herisson-des-haies', 'Forêt'),
  ('taupe-des-pres', 'Forêt'),
  ('ecureuil-roux', 'Forêt'),
  ('lievre-brun', 'Forêt'),
  ('hermine-blanche', 'Forêt'),
  ('martre-des-pins', 'Forêt'),
  ('renardeau-roux', 'Forêt'),
  ('blaireau', 'Forêt'),
  ('castor-batisseur', 'Forêt'),
  ('lynx-des-forets', 'Forêt'),
  ('faon-tachete', 'Forêt'),
  ('sanglier-des-chenaies', 'Forêt'),
  ('loup-gris', 'Forêt'),
  ('renard-argente', 'Forêt'),
  ('biche-blanche', 'Forêt'),
  ('loup-blanc', 'Forêt'),
  ('ours-brun-dresse', 'Forêt'),
  ('cerf-aux-bois-d-or', 'Forêt'),
  ('bison-des-forets', 'Forêt'),
  ('papillon-citron', 'Ciel et eaux'),
  ('grenouille-verte', 'Ciel et eaux'),
  ('martin-pecheur', 'Ciel et eaux'),
  ('escargot-des-vignes', 'Ciel et eaux'),
  ('tortue-des-mares', 'Ciel et eaux'),
  ('corbeau-freux', 'Ciel et eaux'),
  ('chouette-effraie', 'Ciel et eaux'),
  ('mouette-rieuse', 'Ciel et eaux'),
  ('pie-bavarde', 'Ciel et eaux'),
  ('loutre-de-riviere', 'Ciel et eaux'),
  ('salamandre-tachetee', 'Ciel et eaux'),
  ('faucon-chaperonne', 'Ciel et eaux'),
  ('heron-cendre', 'Ciel et eaux'),
  ('cigogne-blanche', 'Ciel et eaux'),
  ('cygne-blanc', 'Ciel et eaux'),
  ('grand-duc', 'Ciel et eaux'),
  ('carpe-doree', 'Ciel et eaux'),
  ('cygne-noir', 'Ciel et eaux'),
  ('paon-bleu', 'Ciel et eaux'),
  ('paon-blanc-en-roue', 'Ciel et eaux'),
  ('crapaud-couronne', 'Légendes'),
  ('lievre-cornu', 'Légendes'),
  ('feu-follet', 'Légendes'),
  ('salamandre-de-feu', 'Légendes'),
  ('souche-vive', 'Légendes'),
  ('golem-moussu', 'Légendes'),
  ('chat-aile', 'Légendes'),
  ('serpent-cornu', 'Légendes'),
  ('gargouille', 'Légendes'),
  ('dragonnet-vert', 'Légendes'),
  ('cheval-des-mers', 'Légendes'),
  ('dragon-rouge', 'Légendes'),
  ('loup-de-brume', 'Légendes'),
  ('griffon', 'Légendes'),
  ('vouivre', 'Légendes'),
  ('hibou-de-cristal', 'Légendes'),
  ('licorne', 'Légendes'),
  ('tortue-ile', 'Légendes'),
  ('phenix', 'Légendes'),
  ('cerf-blanc', 'Légendes'),
  ('canard-de-bain', 'Drôles'),
  ('escargot-cuirasse', 'Drôles'),
  ('rat-de-tranchee', 'Drôles'),
  ('pigeon-voyageur', 'Drôles'),
  ('miche-qui-marche', 'Drôles'),
  ('chat-dans-un-carton', 'Drôles'),
  ('poulet-en-armure', 'Drôles'),
  ('chien-de-chantier', 'Drôles'),
  ('meule-de-fromage', 'Drôles'),
  ('mouette-aux-frites', 'Drôles'),
  ('chevre-au-tambour', 'Drôles'),
  ('herisson-de-fer', 'Drôles'),
  ('marmite-a-pattes', 'Drôles'),
  ('bouclier-qui-marche', 'Drôles'),
  ('tortue-char', 'Drôles'),
  ('coq-tricolore', 'Drôles'),
  ('catapulte-vivante', 'Drôles'),
  ('automate-a-vapeur', 'Drôles'),
  ('cochon-tirelire', 'Drôles'),
  ('canard-dore-couronne', 'Drôles')
on conflict (familier) do update set compagnon = excluded.compagnon;
-- </duel-familiers>

-- <duel-niveaux> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_niveaux (niveau, fantaisie, loin) values
  ('apprenti', 6, 1),
  ('guerrier', 2.5, 2),
  ('druide', 1, 2)
on conflict (niveau) do update set fantaisie = excluded.fantaisie, loin = excluded.loin;
-- </duel-niveaux>

/* ---------- Le moteur : les cartes, les atouts, les camps ---------- */

-- Les 23 mots-clés, dans l'ordre de MOTS_CLES du moteur.
create or replace function internal.duel_mots_cles() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['assomme', 'saigne', 'perce', 'brule', 'epines', 'rempart', 'vif', 'lourd', 'regal', 'ardeur', 'rage', 'gel', 'elan',
    'vampire', 'reveil', 'plein', 'inarretable', 'voleElan', 'antiFatigue', 'purge', 'muraille', 'execute', 'infatigable']
$$;

-- Les 21 atouts, dans l'ordre de CLES_DES_ATOUTS du moteur.
create or replace function internal.duel_cles_des_atouts() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['energieDepart', 'plafond', 'vie', 'elanDepart', 'souffleSansUsure', 'soufflePlus', 'gardePlus', 'frappePlus', 'elanPlus',
    'enchainePlus', 'rage', 'piedsVifs', 'fatigueMoins', 'fatigueAdverse', 'fatigueTard', 'survie', 'premierCoup', 'premiereFatigue',
    'premierSouffle', 'rempart', 'brule']
$$;

-- Le prix d'une carte, par rareté (RANGS du moteur).
create or replace function internal.duel_prix(p_rarete text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_rarete when 'base' then 0 when 'commun' then 1 when 'peu-commun' then 2 when 'epique' then 3 when 'mystique' then 4
    when 'legendaire' then 5 when 'saison' then 5 when 'divin' then 6 end
$$;

-- Une carte : rôle (0 frappe, 1 tête, 2 garde, 3 élan, 4 souffle), prix, force, repos, puis ses 23 mots-clés. Null pour un
-- objet qui n'est pas une carte.
create or replace function internal.duel_carte(p_objet text) returns integer[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_c internal.duel_cartes%rowtype;
  v_mots integer[] := '{}';
  v_m text;
  v_prix integer;
  v_lourd integer;
  v_vif integer;
  v_inf integer;
begin
  select * into v_c from internal.duel_cartes c where c.objet = p_objet;
  if not found then return null; end if;
  foreach v_m in array internal.duel_mots_cles() loop
    v_mots := v_mots || coalesce((v_c.mots ->> v_m)::integer, 0);
  end loop;
  v_prix := internal.duel_prix(v_c.rarete);
  v_vif := v_mots[7];
  v_lourd := v_mots[8];
  v_inf := v_mots[23];
  return array[
    case v_c.emplacement when 'arme' then 0 when 'tete' then 1 when 'haut' then 2 when 'pieds' then 3 else 4 end,
    v_prix,
    v_prix + 2 + case when v_lourd <> 0 then 2 else 0 end,
    case when v_inf <> 0 then 0 else 2 + case when v_lourd <> 0 then 1 else 0 end - case when v_vif <> 0 then 1 else 0 end end
  ] || v_mots;
end $$;

-- Les cinq cartes d'une main, à la suite ; null si l'une n'est pas une carte ou n'est pas à sa place.
create or replace function internal.duel_cartes_de_la_main(p_main text[]) returns integer[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_r integer[] := '{}';
  v_c integer[];
  v_i integer;
begin
  if p_main is null or cardinality(p_main) <> 5 then return null; end if;
  for v_i in 1..5 loop
    v_c := internal.duel_carte(p_main[v_i]);
    if v_c is null or v_c[1] <> v_i - 1 then return null; end if;
    v_r := v_r || v_c;
  end loop;
  return v_r;
end $$;

-- Le prix d'une main (ses cinq cartes à la suite).
create or replace function internal.duel_prix_de_la_main(p_cartes integer[]) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select p_cartes[2] + p_cartes[29] + p_cartes[56] + p_cartes[83] + p_cartes[110]
$$;

-- Ajoute les atouts d'un objet JSON à un tableau d'atouts. Une valeur qui n'est pas un entier est refusée.
create or replace function internal.duel_ajouter_atouts(p_atouts integer[], p_passif jsonb) returns integer[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_cles text[] := internal.duel_cles_des_atouts();
  v_r integer[] := p_atouts;
  v_k integer;
begin
  if p_passif is null or jsonb_typeof(p_passif) <> 'object' then return v_r; end if;
  for v_k in 1..21 loop
    if p_passif ? v_cles[v_k] then
      if jsonb_typeof(p_passif -> v_cles[v_k]) <> 'number' or (p_passif ->> v_cles[v_k]) !~ '^-?[0-9]{1,3}$' then
        raise exception 'atout mal formé : %', v_cles[v_k];
      end if;
      v_r[v_k] := v_r[v_k] + (p_passif ->> v_cles[v_k])::integer;
    end if;
  end loop;
  return v_r;
end $$;

-- Les atouts d'un camp : ses panoplies, son compagnon, le lieu, et ses pouvoirs (un boss). `p_options` :
-- { lieu, compagnon, passifs: [ {…}, … ] }.
create or replace function internal.duel_atouts(p_main text[], p_options jsonb) returns integer[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_r integer[] := array_fill(0, array[21]);
  v_p record;
  v_passif jsonb;
begin
  for v_p in
    select p.passif from internal.duel_panoplies p
    where (select count(*) from internal.duel_cartes c where c.objet = any (p_main) and c.panoplie = p.panoplie) >= p.pieces
    order by p.panoplie
  loop
    v_r := internal.duel_ajouter_atouts(v_r, v_p.passif);
  end loop;
  v_r := internal.duel_ajouter_atouts(v_r, (select c.passif from internal.duel_compagnons c where c.compagnon = p_options ->> 'compagnon'));
  v_r := internal.duel_ajouter_atouts(v_r, (select l.passif from internal.duel_lieux l where l.lieu = p_options ->> 'lieu'));
  if jsonb_typeof(p_options -> 'passifs') = 'array' then
    for v_passif in select value from jsonb_array_elements(p_options -> 'passifs') loop
      v_r := internal.duel_ajouter_atouts(v_r, v_passif);
    end loop;
  end if;
  return v_r;
end $$;

-- Un camp au départ du duel (camp du moteur) : ses cartes et ses atouts.
create or replace function internal.duel_camp(p_cartes integer[], p_atouts integer[]) returns integer[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_vie integer := 18 + greatest(0, 12 - internal.duel_prix_de_la_main(p_cartes)) * 2 + p_atouts[3];
  v_plafond integer := 6 + p_atouts[2];
begin
  return array[v_vie, v_vie, least(v_plafond, 3 + p_atouts[1]), v_plafond, p_atouts[4], 0,
    p_atouts[16], p_atouts[17], p_atouts[18], p_atouts[19], 0, 0, 0, 0, 0, 0];
end $$;

-- Les cartes jouables d'un camp (indices de 0 à 4) : celles qui ne se reposent pas ; si toutes se reposent, celles qui ont
-- le moins de repos.
create or replace function internal.duel_libres(p_etat integer[]) returns integer[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_r integer[] := '{}';
  v_min integer := least(p_etat[11], p_etat[12], p_etat[13], p_etat[14], p_etat[15]);
  v_i integer;
begin
  for v_i in 0..4 loop
    if p_etat[11 + v_i] = v_min then v_r := v_r || v_i; end if;
  end loop;
  return v_r;
end $$;

-- 1 : le premier camp gagne ; -1 : le second ; 0 : égalité, ou les deux debout.
create or replace function internal.duel_verdict(p_a integer[], p_b integer[]) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_a[1] <= 0 and p_b[1] <= 0 then sign(p_a[1] - p_b[1])::integer
    when p_b[1] <= 0 then 1 when p_a[1] <= 0 then -1 else 0 end
$$;

/* ---------- Le moteur : la manche ---------- */

-- La manche `p_m` : le camp `p_a` pose sa carte `p_ia`, le camp `p_b` sa carte `p_ib` (indices de 0 à 4). Rend la longueur
-- du nouveau camp a, puis le nouveau camp a, puis le nouveau camp b. La copie de `manche` de regles.ts, pas pour pas.
create or replace function internal.duel_manche(p_a integer[], p_b integer[], p_ca integer[], p_cb integer[], p_ta integer[], p_tb integer[],
  p_ia integer, p_ib integer, p_m integer) returns integer[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  -- les deux camps : l'indice 1 est le camp a, 2 le camp b
  vie integer[] := array[p_a[1], p_b[1]];
  vmax integer[] := array[p_a[2], p_b[2]];
  en integer[] := array[p_a[3], p_b[3]];
  plaf integer[] := array[p_a[4], p_b[4]];
  elan integer[] := array[p_a[5], p_b[5]];
  souf integer[] := array[p_a[6], p_b[6]];
  surv integer[] := array[p_a[7], p_b[7]];
  pcoup integer[] := array[p_a[8], p_b[8]];
  pfat integer[] := array[p_a[9], p_b[9]];
  psouf integer[] := array[p_a[10], p_b[10]];
  repos integer[] := p_a[11:15] || p_b[11:15];
  sg1 integer[] := coalesce(p_a[17:16 + 2 * p_a[16]], '{}');
  sg2 integer[] := coalesce(p_b[17:16 + 2 * p_b[16]], '{}');
  cartes integer[] := p_ca || p_cb;
  at integer[] := p_ta || p_tb;
  idx integer[] := array[p_ia, p_ib];
  -- les cartes jouées
  role integer[] := array[0, 0];
  prix integer[] := array[0, 0];
  ess boolean[] := array[false, false];
  mots integer[] := array_fill(0, array[46]);
  force integer[] := array[0, 0];
  degats integer[] := array[0, 0];
  pare integer[] := array[0, 0];
  subis integer[] := array[0, 0];
  coupe boolean[] := array[false, false];
  gele integer[] := array[0, 0];
  butin integer[] := array[0, 0];
  vole boolean[] := array[false, false];
  s integer;
  o integer;
  k integer;
  base integer;
  f integer;
  d integer;
  mur integer;
  amorti integer;
  n integer;
  im integer;
  garde integer;
  r integer;
  sg integer[];
  nsg integer[];
begin
  -- les cartes posées : la force se lit avant de payer ; une carte trop chère se joue essoufflée
  for s in 1..2 loop
    o := 3 - s;
    base := (s - 1) * 135 + idx[s] * 27;
    role[s] := cartes[base + 1];
    prix[s] := cartes[base + 2];
    ess[s] := en[s] < prix[s];
    if not ess[s] then
      for k in 1..23 loop mots[(s - 1) * 23 + k] := cartes[base + 4 + k]; end loop;
    end if;
    if ess[s] then
      f := 1 + case when role[s] <= 1 then elan[s] else 0 end;
    else
      f := cartes[base + 3];
      if cartes[base + 4 + 11] <> 0 and vie[s] < vie[o] then f := f + cartes[base + 4 + 11]; end if;
      if cartes[base + 4 + 22] <> 0 and vie[o] <= 6 then f := f + cartes[base + 4 + 22]; end if;
      if role[s] <= 1 then
        f := f + elan[s] + pcoup[s];
        if at[(s - 1) * 21 + 11] <> 0 and vie[s] < vie[o] then f := f + at[(s - 1) * 21 + 11]; end if;
        if role[s] = 0 then f := f + at[(s - 1) * 21 + 8]; end if;
      end if;
      if role[s] = 2 then f := f + at[(s - 1) * 21 + 7]; end if;
      if role[s] = 3 then f := f + at[(s - 1) * 21 + 9]; end if;
      if role[s] = 4 then
        f := greatest(0, f - case when at[(s - 1) * 21 + 5] <> 0 then 0 else souf[s] end) + at[(s - 1) * 21 + 6] + psouf[s];
      end if;
    end if;
    force[s] := f;
    en[s] := en[s] - case when ess[s] then en[s] else prix[s] end;
    elan[s] := 0;
    if role[s] <= 1 then pcoup[s] := 0; end if;
  end loop;

  -- les coups : la garde arrête et renvoie, le rempart amortit, les épines piquent
  for s in 1..2 loop
    o := 3 - s;
    if role[s] <= 1 then
      im := mots[(s - 1) * 23 + 17];
      garde := case when im <> 0 or role[o] <> 2 then 0 else greatest(0, force[o] - mots[(s - 1) * 23 + 3]) end;
      pare[o] := least(force[s], garde);
      d := force[s] - pare[o];
      mur := case when im <> 0 then 0
        else case when mots[(o - 1) * 23 + 21] <> 0 then 5 else 0 end + mots[(o - 1) * 23 + 6] + at[(o - 1) * 21 + 20] end;
      amorti := least(d, mur);
      if amorti > 0 then d := d - amorti; end if;
      degats[s] := d;
      subis[o] := subis[o] + d;
      subis[s] := subis[s] + pare[o];
      if mots[(o - 1) * 23 + 5] <> 0 then subis[s] := subis[s] + mots[(o - 1) * 23 + 5]; end if;
      if role[s] = 1 then
        subis[s] := subis[s] + 1;
        if role[o] = 3 or role[o] = 4 then coupe[o] := true; end if;
      end if;
      if d > 0 then
        if mots[(s - 1) * 23 + 1] <> 0 then
          n := least(mots[(s - 1) * 23 + 1], en[o]);
          en[o] := en[o] - n;
        end if;
        if mots[(s - 1) * 23 + 2] <> 0 then
          if o = 1 then sg1 := sg1 || array[mots[(s - 1) * 23 + 2], 1]; else sg2 := sg2 || array[mots[(s - 1) * 23 + 2], 1]; end if;
        end if;
        if mots[(s - 1) * 23 + 14] <> 0 then butin[s] := least(d, 2); end if;
        if at[(s - 1) * 21 + 21] <> 0 then subis[o] := subis[o] + at[(s - 1) * 21 + 21]; end if;
      end if;
    end if;
  end loop;
  for s in 1..2 loop
    if mots[(s - 1) * 23 + 4] <> 0 and not coupe[s] then subis[3 - s] := subis[3 - s] + mots[(s - 1) * 23 + 4]; end if;
  end loop;
  for s in 1..2 loop
    vie[s] := vie[s] - subis[s];
    if vie[s] <= 0 and surv[s] <> 0 then
      vie[s] := 1;
      surv[s] := 0;
    end if;
  end loop;

  if vie[1] > 0 and vie[2] > 0 then
    for s in 1..2 loop
      o := 3 - s;
      continue when coupe[s];
      if role[s] = 4 then
        vie[s] := vie[s] + least(force[s], vmax[s] - vie[s]);
        souf[s] := souf[s] + 1;
        psouf[s] := 0;
      end if;
      if butin[s] <> 0 then vie[s] := vie[s] + least(butin[s], vmax[s] - vie[s]); end if;
      if mots[(s - 1) * 23 + 9] <> 0 then vie[s] := vie[s] + least(mots[(s - 1) * 23 + 9], vmax[s] - vie[s]); end if;
      if role[s] = 3 then elan[s] := elan[s] + force[s]; end if;
      if mots[(s - 1) * 23 + 13] <> 0 then elan[s] := elan[s] + mots[(s - 1) * 23 + 13]; end if;
      if mots[(s - 1) * 23 + 20] <> 0 then
        if s = 1 then sg1 := '{}'; else sg2 := '{}'; end if;
      end if;
      if mots[(s - 1) * 23 + 15] <> 0 then
        for k in 1..5 loop repos[(s - 1) * 5 + k] := 0; end loop;
      end if;
      if mots[(s - 1) * 23 + 12] <> 0 then gele[o] := gele[o] + mots[(s - 1) * 23 + 12]; end if;
      if mots[(s - 1) * 23 + 18] <> 0 then vole[s] := true; end if;
    end loop;
    -- un coup qui porte lance le suivant
    for s in 1..2 loop
      if degats[s] > 0 then elan[s] := elan[s] + 1 + at[(s - 1) * 21 + 10]; end if;
    end loop;
    for s in 1..2 loop
      o := 3 - s;
      if vole[s] and elan[o] > 0 then
        elan[s] := elan[s] + elan[o];
        elan[o] := 0;
      end if;
    end loop;
    -- le saignement, puis la fatigue
    for s in 1..2 loop
      sg := case when s = 1 then sg1 else sg2 end;
      nsg := '{}';
      n := 0;
      for k in 1..coalesce(array_length(sg, 1), 0) / 2 loop
        r := sg[2 * k - 1];
        if sg[2 * k] = 1 then
          nsg := nsg || array[r, 0];
        else
          n := n + 1;
          r := r - 1;
          if r > 0 then nsg := nsg || array[r, 0]; end if;
        end if;
      end loop;
      if s = 1 then sg1 := nsg; else sg2 := nsg; end if;
      vie[s] := vie[s] - n;
    end loop;
    if vie[1] > 0 and vie[2] > 0 then
      for s in 1..2 loop
        o := 3 - s;
        n := greatest(0, p_m - 6 - at[(s - 1) * 21 + 15] + 1);
        continue when n = 0;
        n := n + at[(o - 1) * 21 + 14] - at[(s - 1) * 21 + 13];
        if pfat[s] <> 0 then
          n := n - pfat[s];
          pfat[s] := 0;
        end if;
        if mots[(s - 1) * 23 + 19] <> 0 and not coupe[s] then n := 0; end if;
        vie[s] := vie[s] - greatest(0, n);
      end loop;
    end if;
  end if;

  for s in 1..2 loop
    for k in 1..5 loop repos[(s - 1) * 5 + k] := greatest(0, repos[(s - 1) * 5 + k] - 1); end loop;
    base := (s - 1) * 135 + idx[s] * 27;
    r := cartes[base + 4];
    if role[s] = 3 and at[(s - 1) * 21 + 12] <> 0 then r := greatest(least(r, 1), r - 1); end if;
    repos[(s - 1) * 5 + idx[s] + 1] := r + gele[s];
    if mots[(s - 1) * 23 + 10] <> 0 and not coupe[s] then en[s] := en[s] + least(mots[(s - 1) * 23 + 10], plaf[s] - en[s]); end if;
    if mots[(s - 1) * 23 + 16] <> 0 and not coupe[s] then en[s] := plaf[s]; end if;
    en[s] := least(plaf[s], en[s] + 3);
  end loop;

  return array[16 + coalesce(array_length(sg1, 1), 0),
      vie[1], vmax[1], en[1], plaf[1], elan[1], souf[1], surv[1], pcoup[1], pfat[1], psouf[1]] || repos[1:5]
    || (coalesce(array_length(sg1, 1), 0) / 2) || sg1
    || array[vie[2], vmax[2], en[2], plaf[2], elan[2], souf[2], surv[2], pcoup[2], pfat[2], psouf[2]] || repos[6:10]
    || (coalesce(array_length(sg2, 1), 0) / 2) || sg2;
end $$;

/* ---------- Le moteur : la machine ---------- */

-- L'exponentielle d'un nombre négatif ou nul, faite des quatre opérations seulement (expDuDuel du moteur).
create or replace function internal.duel_exp(p_x double precision) returns double precision
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  y double precision := p_x;
  k integer := 0;
  s double precision := 1;
  n integer;
begin
  if not (p_x > -40::double precision) then return 0; end if;
  while y < -0.0078125::double precision loop
    y := y / 2::double precision;
    k := k + 1;
  end loop;
  for n in reverse 9..1 loop
    s := 1::double precision + (y / n::double precision) * s;
  end loop;
  while k > 0 loop
    s := s * s;
    k := k - 1;
  end loop;
  return s;
end $$;

-- Ce que vaut la carte `p_ia` pour le camp `p_a`, s'il joue ensuite au mieux contre un adversaire qui choisit au hasard,
-- `p_loin` manches devant (valeurDuCoup du moteur).
create or replace function internal.duel_valeur(p_a integer[], p_b integer[], p_ca integer[], p_cb integer[], p_ta integer[], p_tb integer[],
  p_ia integer, p_m integer, p_loin integer) returns double precision
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  s double precision := 0;
  poids double precision := 0;
  w double precision;
  v double precision;
  x double precision;
  r integer[];
  ra integer[];
  rb integer[];
  ib integer;
  i integer;
  trouve boolean;
begin
  foreach ib in array internal.duel_libres(p_b) loop
    w := case when p_b[3] >= p_cb[ib * 27 + 2] then 1::double precision else 0.3::double precision end;
    r := internal.duel_manche(p_a, p_b, p_ca, p_cb, p_ta, p_tb, p_ia, ib, p_m);
    ra := r[2:1 + r[1]];
    rb := r[2 + r[1]:cardinality(r)];
    if ra[1] <= 0 or rb[1] <= 0 then
      v := (internal.duel_verdict(ra, rb) * 40)::double precision + (ra[1] - rb[1])::double precision * 0.2::double precision;
    elsif p_loin <= 1 then
      v := (ra[1] - rb[1])::double precision + (ra[5] - rb[5])::double precision * 0.5::double precision
        + (ra[3] - rb[3])::double precision * 0.15::double precision;
    else
      trouve := false;
      foreach i in array internal.duel_libres(ra) loop
        x := internal.duel_valeur(ra, rb, p_ca, p_cb, p_ta, p_tb, i, p_m + 1, p_loin - 1);
        if not trouve or x > v then
          v := x;
          trouve := true;
        end if;
      end loop;
      if not trouve then v := (ra[1] - rb[1])::double precision; end if;
    end if;
    s := s + w * v;
    poids := poids + w;
  end loop;
  if poids <> 0 then return s / poids; end if;
  return (p_a[1] - p_b[1])::double precision;
end $$;

-- Le choix de la machine pour le camp `p_moi` (choisir du moteur) : `p_hasard` entre 0 et 1, tiré de la graine.
create or replace function internal.duel_choisir(p_moi integer[], p_lui integer[], p_cm integer[], p_cl integer[], p_tm integer[], p_tl integer[],
  p_m integer, p_hasard double precision, p_fantaisie double precision, p_loin integer) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  l integer[] := internal.duel_libres(p_moi);
  notes double precision[] := '{}';
  poids double precision[] := '{}';
  plus_haut double precision;
  total double precision := 0;
  x double precision;
  i integer;
  k integer;
begin
  foreach i in array l loop
    notes := notes || internal.duel_valeur(p_moi, p_lui, p_cm, p_cl, p_tm, p_tl, i, p_m, p_loin);
  end loop;
  plus_haut := notes[1];
  for k in 2..cardinality(notes) loop
    if notes[k] > plus_haut then plus_haut := notes[k]; end if;
  end loop;
  for k in 1..cardinality(notes) loop
    poids := poids || internal.duel_exp((notes[k] - plus_haut) / p_fantaisie);
    total := total + poids[k];
  end loop;
  x := p_hasard * total;
  for k in 1..cardinality(notes) loop
    x := x - poids[k];
    if x <= 0 then return l[k]; end if;
  end loop;
  return l[cardinality(l)];
end $$;

-- La graine suivante (graineSuivante du moteur).
create or replace function internal.duel_graine_suivante(p_g bigint) returns bigint
language sql immutable set search_path = public, pg_temp as $$
  select (p_g * 48271) % 2147483647
$$;

/* ---------- Les aides du duel ---------- */

-- Le compte peut-il voir et jouer le duel ? Ouvert à tous, ou le titulaire, tant qu'il est fermé.
create or replace function internal.duel_permis(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false)
    or exists (select 1 from public.private_links l join internal.stateres_don_titulaire t on t.discord_id = l.discord_id where l.user_id = p_uid)
$$;

-- Le joueur : un compte validé avec son Gaulois, permis par l'interrupteur. Sinon une erreur.
create or replace function internal.duel_joueur() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := internal.village_acheteur();
begin
  if not internal.duel_permis(v_uid) then perform internal.fail('duel_ferme'); end if;
  return v_uid;
end $$;

-- Le compte est-il en essai du mode GOD ?
create or replace function internal.duel_en_essai(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from internal.village_god d where d.user_id = p_uid)
$$;

-- Une main, en tableau (arme, tête, haut, pieds, bas), depuis l'objet JSON de l'écran ; null si elle est mal formée.
create or replace function internal.duel_main_lue(p_main jsonb) returns text[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_r text[] := '{}';
  v_e text;
begin
  if p_main is null or jsonb_typeof(p_main) <> 'object' then return null; end if;
  if (select count(*) from jsonb_object_keys(p_main)) <> 5 then return null; end if;
  foreach v_e in array array['arme', 'tete', 'haut', 'pieds', 'bas'] loop
    if jsonb_typeof(p_main -> v_e) is distinct from 'string' or (p_main ->> v_e) !~ '^[a-z][a-z0-9-]{0,39}$' then return null; end if;
    v_r := v_r || (p_main ->> v_e);
  end loop;
  return v_r;
end $$;

-- Une main en objet JSON, pour l'écran.
create or replace function internal.duel_main_json(p_main text[]) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('arme', p_main[1], 'tete', p_main[2], 'haut', p_main[3], 'pieds', p_main[4], 'bas', p_main[5])
$$;

-- Pourquoi ce compte ne peut pas jouer cette main maintenant, ou null : 'main_invalide', 'carte_non_possedee' ou
-- 'main_trop_chere'. Une carte de base est à tous ; une autre doit être dans son inventaire.
create or replace function internal.duel_refus_de_main(p_uid uuid, p_main text[]) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cartes integer[] := internal.duel_cartes_de_la_main(p_main);
  v_i integer;
  v_c internal.duel_cartes%rowtype;
begin
  if v_cartes is null then return 'main_invalide'; end if;
  for v_i in 1..5 loop
    select * into v_c from internal.duel_cartes c where c.objet = p_main[v_i];
    if v_c.rarete <> 'base' and not exists (
      select 1 from internal.gaulois_inventaire i where i.user_id = p_uid and i.emplacement = v_c.emplacement and i.objet = v_c.objet and i.quantite >= 1
    ) then
      return 'carte_non_possedee';
    end if;
  end loop;
  if internal.duel_prix_de_la_main(v_cartes) > 12 then return 'main_trop_chere'; end if;
  return null;
end $$;

-- Le compagnon d'un compte : la famille du familier qu'il montre, ou null.
create or replace function internal.duel_compagnon_de(p_uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select f.compagnon from internal.gaulois_montre(p_uid) m join internal.duel_familiers f on f.familier = m.familier
$$;

-- Le lieu que donne la bannière qu'un compte montre, ou null.
create or replace function internal.duel_lieu_de(p_uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select b.lieu from internal.gaulois_montre(p_uid) m join internal.duel_bannieres b on b.banniere = m.banniere
$$;

-- Le Gaulois d'un compte tel que l'écran le dessine : son nom au village, sa tenue, sa bannière et son familier montrés.
create or replace function internal.duel_gaulois_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('nom', internal.village_nom(p.display_name, p.gaul_number), 'tenue', m.tenue, 'banniere', m.banniere, 'familier', m.familier)
  from public.profiles p join internal.gaulois_montre(p.user_id) m on true
  where p.user_id = p_uid
$$;

-- Le jour de Paris.
create or replace function internal.duel_jour(p_at timestamptz) returns date
language sql stable set search_path = public, pg_temp as $$
  select (p_at at time zone 'Europe/Paris')::date
$$;

-- Le boss d'un jour : celui du rang (jour moins le 23 novembre 2026) modulo leur nombre ; null sans boss.
create or replace function internal.duel_boss_du(p_jour date) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select b.boss from internal.duel_boss b
  where b.rang = (select ((p_jour - date '2026-11-23') % nullif(count(*), 0) + count(*)) % nullif(count(*), 0) from internal.duel_boss)
$$;

-- La flamme de série du compte brûle-t-elle, d'après le dernier relevé du site ?
create or replace function internal.duel_flamme(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.private_links l join internal.duel_flammes f on f.empreinte = l.openfront_hash where l.user_id = p_uid)
$$;

-- Les duels comptés permis aujourd'hui : 3, et 1 de plus quand la flamme brûle.
create or replace function internal.duel_comptes_du_jour(p_uid uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select 3 + case when internal.duel_flamme(p_uid) then 1 else 0 end
$$;

-- Une partie laissée 24 heures sans manche jouée est perdue par abandon.
create or replace function internal.duel_abandonner_les_vieilles(p_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  for v_id in select d.id from internal.duel_parties d where d.user_id = p_uid and not d.fini and d.joue_le < now() - interval '24 hours' loop
    perform internal.duel_finir(v_id, -1, true);
  end loop;
end $$;

-- Finit une partie : son issue, sa récompense (des pas du pass pour un duel compté gagné) et l'annonce de la victoire.
create or replace function internal.duel_finir(p_id bigint, p_verdict integer, p_abandon boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_d internal.duel_parties%rowtype;
  v_saison text;
  v_rang integer;
  v_pas integer;
begin
  select * into v_d from internal.duel_parties d where d.id = p_id for update;
  if not found or v_d.fini then return; end if;
  if v_d.compte and p_verdict = 1 then
    v_saison := internal.sentier_saison_du(v_d.jour);
    if v_saison is not null then
      v_rang := 1 + (select count(*) from internal.duel_parties d where d.user_id = v_d.user_id and d.jour = v_d.jour and d.compte and d.fini and d.verdict = 1);
      insert into internal.sentier_gains (user_id, saison, jour, source, pas)
      values (v_d.user_id, v_saison, v_d.jour, 'duel/' || v_rang, 5)
      on conflict (user_id, jour, source) do nothing
      returning pas into v_pas;
    end if;
    insert into internal.duel_annonces (partie, essai)
    values (p_id, not coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false))
    on conflict (partie) do nothing;
  end if;
  update internal.duel_parties d set fini = true, verdict = p_verdict, abandon = p_abandon, pas = v_pas, fini_le = now() where d.id = p_id;
end $$;

-- Une partie, pour l'écran (PartieDuDuel du contrat). Jamais la graine.
create or replace function internal.duel_partie_json(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'partie', d.id,
    'contre', d.contre,
    'adversaire', case when d.contre = 'membre' and d.adversaire is not null then internal.duel_gaulois_json(d.adversaire) end,
    'boss', d.boss,
    'niveau', d.niveau,
    'compte', d.compte,
    'mains', jsonb_build_object('a', internal.duel_main_json(d.main_a), 'b', internal.duel_main_json(d.main_b)),
    'options', jsonb_build_object('a', d.options_a, 'b', d.options_b),
    'coups', coalesce((select jsonb_agg(jsonb_build_array(d.coups[2 * k - 1], d.coups[2 * k]) order by k)
      from generate_series(1, cardinality(d.coups) / 2) k), '[]'::jsonb),
    'manche', d.manche,
    'vies', jsonb_build_object('a', d.etat_a[1], 'b', d.etat_b[1]),
    'fini', d.fini,
    'verdict', d.verdict,
    'abandon', d.abandon,
    'recompense', case when d.pas is not null then jsonb_build_object('pas', d.pas) end,
    'commence_le', d.commence_le,
    'fini_le', d.fini_le)
  from internal.duel_parties d where d.id = p_id
$$;

-- La main d'un camp et ses options, prêtes à jouer : ses cartes, ses atouts et son camp de départ.
create or replace function internal.duel_preparer(p_main text[], p_options jsonb, out cartes integer[], out atouts integer[], out etat integer[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  cartes := internal.duel_cartes_de_la_main(p_main);
  if cartes is null then raise exception 'main du duel mal formée'; end if;
  atouts := internal.duel_atouts(p_main, p_options);
  etat := internal.duel_camp(cartes, atouts);
end $$;

/* ---------- Pour les membres ---------- */

-- Tout l'écran du duel (EtatDuDuel du contrat).
create or replace function public.get_mon_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_jour date := internal.duel_jour(now());
  v_comptes integer;
  v_faits integer;
  v_joues integer;
  v_boss internal.duel_boss%rowtype;
  v_defense internal.duel_mains%rowtype;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.duel_abandonner_les_vieilles(v_uid);
    v_comptes := internal.duel_comptes_du_jour(v_uid);
    select count(*) filter (where d.compte), count(*) into v_faits, v_joues from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour;
    select * into v_boss from internal.duel_boss b where b.boss = internal.duel_boss_du(v_jour);
    select * into v_defense from internal.duel_mains m where m.user_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'ouvert', coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false),
      'collection', (
        select jsonb_object_agg(e.emplacement, coalesce((
          select jsonb_agg(c.objet order by c.rang) from internal.duel_cartes c
          where c.emplacement = e.emplacement and (c.rarete = 'base' or exists (
            select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = c.emplacement and i.objet = c.objet and i.quantite >= 1))
        ), '[]'::jsonb))
        from unnest(array['arme', 'tete', 'haut', 'pieds', 'bas']) e(emplacement)),
      'defense', case when v_defense.user_id is not null then internal.duel_main_json(v_defense.main) end,
      'defense_valide', v_defense.user_id is not null and internal.duel_refus_de_main(v_uid, v_defense.main) is null,
      'jour', jsonb_build_object(
        'jour', v_jour, 'comptes', 3, 'flamme', v_comptes > 3,
        'releve', (select r.le from internal.duel_flammes_releve r where r.id),
        'faits', v_faits, 'restants', greatest(0, v_comptes - v_faits), 'joues', v_joues, 'au_plus', 30),
      'boss', case when v_boss.boss is not null then jsonb_build_object(
        'boss', v_boss.boss, 'niveau', v_boss.niveau, 'main', internal.duel_main_json(v_boss.main),
        'options', jsonb_build_object('lieu', v_boss.lieu, 'compagnon', null, 'passifs', jsonb_build_array(v_boss.passif)),
        'battu', exists (select 1 from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour and d.boss = v_boss.boss and d.verdict = 1)) end,
      'partie', (select internal.duel_partie_json(d.id) from internal.duel_parties d where d.user_id = v_uid and not d.fini),
      'defenses', coalesce((
        select jsonb_agg(x.j order by x.le desc) from (
          select d.fini_le as le, jsonb_build_object(
              'le', d.fini_le, 'nom', internal.village_nom(p.display_name, p.gaul_number),
              'issue', case d.verdict when 1 then 'battu' when -1 then 'repousse' else 'egalite' end,
              'manches', cardinality(d.coups) / 2) as j
          from internal.duel_parties d join public.profiles p on p.user_id = d.user_id
          where d.adversaire = v_uid and d.fini and d.user_id <> v_uid
          order by d.fini_le desc limit 20) x), '[]'::jsonb),
      'attaques', coalesce((
        select jsonb_agg(x.j order by x.le desc) from (
          select d.fini_le as le, jsonb_build_object(
              'le', d.fini_le, 'contre', d.contre,
              'nom', case when d.contre = 'membre' then (select internal.village_nom(p.display_name, p.gaul_number) from public.profiles p where p.user_id = d.adversaire) end,
              'boss', d.boss, 'verdict', d.verdict, 'manches', cardinality(d.coups) / 2, 'compte', d.compte) as j
          from internal.duel_parties d
          where d.user_id = v_uid and d.fini
          order by d.fini_le desc limit 20) x), '[]'::jsonb),
      'bilan', (
        select jsonb_build_object(
          'victoires', count(*) filter (where d.user_id = v_uid and d.verdict = 1),
          'defaites', count(*) filter (where d.user_id = v_uid and d.verdict = -1),
          'egalites', count(*) filter (where d.user_id = v_uid and d.verdict = 0),
          'repousses', count(*) filter (where d.adversaire = v_uid and d.user_id <> v_uid and d.verdict = -1),
          'battus', count(*) filter (where d.adversaire = v_uid and d.user_id <> v_uid and d.verdict = 1))
        from internal.duel_parties d where d.fini and (d.user_id = v_uid or d.adversaire = v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- La main de défense : `p_main` { arme, tete, haut, pieds, bas }, une main que le compte peut jouer.
create or replace function public.enregistrer_main_duel(p_main jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_main text[] := internal.duel_main_lue(p_main);
  v_refus text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    if v_main is null then perform internal.fail('main_invalide'); end if;
    v_refus := internal.duel_refus_de_main(v_uid, v_main);
    if v_refus is not null then perform internal.fail(v_refus); end if;
    insert into internal.duel_mains as m (user_id, main) values (v_uid, v_main)
    on conflict (user_id) do update set main = excluded.main, maj_le = now();
    return jsonb_build_object('ok', true, 'defense', internal.duel_main_json(v_main));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les Gaulois qu'on peut défier : ceux d'un compte validé, permis, avec une main de défense jouable. Jamais un identifiant
-- de compte : la clé de la main. Tant que le duel est fermé, le titulaire y trouve sa propre main, pour l'essayer.
create or replace function public.get_adversaires_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    return jsonb_build_object('ok', true, 'adversaires', coalesce((
      select jsonb_agg(internal.duel_gaulois_json(m.user_id) || jsonb_build_object(
          'cle', m.cle, 'main', internal.duel_main_json(m.main),
          'options', jsonb_build_object('lieu', internal.duel_lieu_de(m.user_id), 'compagnon', internal.duel_compagnon_de(m.user_id), 'passifs', '[]'::jsonb))
        order by m.maj_le desc)
      from internal.duel_mains m
      join public.profiles p on p.user_id = m.user_id
      join internal.gaulois g on g.user_id = m.user_id
      where p.status = 'validated' and internal.duel_permis(m.user_id)
        and (m.user_id <> v_uid or not v_ouvert)
        and internal.duel_refus_de_main(m.user_id, m.main) is null), '[]'::jsonb));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Commence un duel : `p_contre` 'membre' (avec `p_cle`, la clé de sa main de défense) ou 'boss' (le boss du jour), avec la
-- main `p_main` du joueur. Le serveur tire la graine de la machine et ne la montre jamais.
create or replace function public.commencer_duel(p_contre text, p_cle uuid, p_main jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_jour date := internal.duel_jour(now());
  v_main text[] := internal.duel_main_lue(p_main);
  v_refus text;
  v_adv uuid;
  v_main_b text[];
  v_boss internal.duel_boss%rowtype;
  v_niveau text;
  v_lieu text;
  v_opt_a jsonb;
  v_opt_b jsonb;
  v_a record;
  v_b record;
  v_compte boolean;
  v_faits integer;
  v_joues integer;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    perform internal.duel_abandonner_les_vieilles(v_uid);
    if exists (select 1 from internal.duel_parties d where d.user_id = v_uid and not d.fini) then perform internal.fail('partie_en_cours'); end if;
    if v_main is null then perform internal.fail('main_invalide'); end if;
    v_refus := internal.duel_refus_de_main(v_uid, v_main);
    if v_refus is not null then perform internal.fail(v_refus); end if;
    select count(*) filter (where d.compte), count(*) into v_faits, v_joues from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour;
    if v_joues >= 30 then perform internal.fail('trop_de_duels'); end if;
    v_compte := v_faits < internal.duel_comptes_du_jour(v_uid) and not internal.duel_en_essai(v_uid);
    if p_contre = 'membre' then
      select m.user_id, m.main into v_adv, v_main_b
      from internal.duel_mains m join public.profiles p on p.user_id = m.user_id join internal.gaulois g on g.user_id = m.user_id
      where m.cle = p_cle and p.status = 'validated' and internal.duel_permis(m.user_id);
      if v_adv is null or internal.duel_refus_de_main(v_adv, v_main_b) is not null then perform internal.fail('adversaire_inconnu'); end if;
      if v_adv = v_uid then
        -- contre sa propre main : seulement pour l'essayer, tant que le duel est fermé ; jamais compté
        if coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false) then perform internal.fail('adversaire_inconnu'); end if;
        v_compte := false;
      end if;
      -- un seul duel compté par jour contre un même membre
      if v_compte and exists (select 1 from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour and d.adversaire = v_adv and d.compte) then
        v_compte := false;
      end if;
      v_niveau := 'guerrier';
      v_lieu := internal.duel_lieu_de(v_adv);
      v_opt_b := jsonb_build_object('lieu', v_lieu, 'compagnon', internal.duel_compagnon_de(v_adv), 'passifs', '[]'::jsonb);
    elsif p_contre = 'boss' then
      select * into v_boss from internal.duel_boss b where b.boss = internal.duel_boss_du(v_jour);
      if v_boss.boss is null then perform internal.fail('pas_de_boss'); end if;
      v_main_b := v_boss.main;
      v_niveau := v_boss.niveau;
      v_lieu := v_boss.lieu;
      v_opt_b := jsonb_build_object('lieu', v_lieu, 'compagnon', null, 'passifs', jsonb_build_array(v_boss.passif));
    else
      perform internal.fail('invalid_request');
    end if;
    v_opt_a := jsonb_build_object('lieu', v_lieu, 'compagnon', internal.duel_compagnon_de(v_uid), 'passifs', '[]'::jsonb);
    select * into v_a from internal.duel_preparer(v_main, v_opt_a);
    select * into v_b from internal.duel_preparer(v_main_b, v_opt_b);
    insert into internal.duel_parties (user_id, contre, adversaire, boss, niveau, compte, jour, main_a, main_b, options_a, options_b,
      cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, graine)
    values (v_uid, p_contre, v_adv, v_boss.boss, v_niveau, v_compte, v_jour, v_main, v_main_b, v_opt_a, v_opt_b,
      v_a.cartes, v_b.cartes, v_a.atouts, v_b.atouts, v_a.etat, v_b.etat, 1 + floor(internal.village_hasard() * 2147483646)::bigint)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_id));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Joue la manche `p_manche` de la partie : le joueur pose sa carte `p_carte` (de 0 à 4) ; la machine choisit la sienne sans
-- la voir, avec la graine de la partie ; la manche se résout.
create or replace function public.jouer_manche_duel(p_partie bigint, p_manche integer, p_carte integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_d internal.duel_parties%rowtype;
  v_n internal.duel_niveaux%rowtype;
  v_g bigint;
  v_ib integer;
  v_r integer[];
  v_a integer[];
  v_b integer[];
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    perform internal.duel_abandonner_les_vieilles(v_uid);
    select * into v_d from internal.duel_parties d where d.id = p_partie and d.user_id = v_uid for update;
    if not found then perform internal.fail('duel_inconnu'); end if;
    if v_d.fini then perform internal.fail('partie_finie'); end if;
    if p_manche is distinct from v_d.manche then perform internal.fail('mauvaise_manche'); end if;
    if p_carte is null or not (p_carte = any (internal.duel_libres(v_d.etat_a))) then perform internal.fail('carte_au_repos'); end if;
    select * into v_n from internal.duel_niveaux n where n.niveau = v_d.niveau;
    v_g := internal.duel_graine_suivante(v_d.graine);
    v_ib := internal.duel_choisir(v_d.etat_b, v_d.etat_a, v_d.cartes_b, v_d.cartes_a, v_d.atouts_b, v_d.atouts_a, v_d.manche,
      v_g::double precision / 2147483647::double precision, v_n.fantaisie, v_n.loin);
    v_r := internal.duel_manche(v_d.etat_a, v_d.etat_b, v_d.cartes_a, v_d.cartes_b, v_d.atouts_a, v_d.atouts_b, p_carte, v_ib, v_d.manche);
    v_a := v_r[2:1 + v_r[1]];
    v_b := v_r[2 + v_r[1]:cardinality(v_r)];
    update internal.duel_parties d
    set etat_a = v_a, etat_b = v_b, coups = d.coups || array[p_carte, v_ib], manche = d.manche + 1, graine = v_g, joue_le = now()
    where d.id = v_d.id;
    if v_a[1] <= 0 or v_b[1] <= 0 or v_d.manche >= 40 then
      perform internal.duel_finir(v_d.id, internal.duel_verdict(v_a, v_b), false);
    end if;
    return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_d.id), 'carte_machine', v_ib);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Abandonne la partie : elle est perdue.
create or replace function public.abandonner_duel(p_partie bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_d internal.duel_parties%rowtype;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    select * into v_d from internal.duel_parties d where d.id = p_partie and d.user_id = v_uid;
    if not found then perform internal.fail('duel_inconnu'); end if;
    if v_d.fini then perform internal.fail('partie_finie'); end if;
    perform internal.duel_finir(v_d.id, -1, true);
    return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_d.id));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Pour le site et le robot (clé de service) ---------- */

-- Le relevé des flammes de série : les empreintes OpenFront (SHA-256 de l'identifiant, 64 signes) des membres dont la flamme
-- brûle, tel que le site vient de le calculer. Remplace le relevé précédent.
create or replace function public.noter_flammes_duel(p_empreintes text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  if p_empreintes is null or cardinality(p_empreintes) > 2000 or exists (select 1 from unnest(p_empreintes) e where e !~ '^[0-9a-f]{64}$') then
    return internal.error_json('invalid_request', '');
  end if;
  delete from internal.duel_flammes f where not (f.empreinte = any (p_empreintes));
  insert into internal.duel_flammes (empreinte) select distinct e from unnest(p_empreintes) e on conflict (empreinte) do nothing;
  insert into internal.duel_flammes_releve (id, le) values (true, now()) on conflict (id) do update set le = excluded.le;
  select count(*) into v_n from internal.duel_flammes;
  return jsonb_build_object('ok', true, 'flammes', v_n);
end $$;

-- Les victoires à annoncer sur Discord, les plus anciennes d'abord, 20 au plus : le vainqueur, le vaincu (un membre ou un
-- boss), le nombre de manches, et `essai` (le duel était fermé).
create or replace function public.duel_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'annonces', coalesce((
    select jsonb_agg(jsonb_build_object(
        'partie', a.partie, 'essai', a.essai, 'le', d.fini_le, 'contre', d.contre, 'boss', d.boss, 'manches', cardinality(d.coups) / 2,
        'main', internal.duel_main_json(d.main_a), 'main_vaincue', internal.duel_main_json(d.main_b),
        'vainqueur', internal.duel_gaulois_json(d.user_id),
        'vaincu', case when d.contre = 'membre' and d.adversaire is not null then internal.duel_gaulois_json(d.adversaire) end)
      order by a.cree_le, a.partie)
    from (select * from internal.duel_annonces a where a.annoncee_le is null order by a.cree_le, a.partie limit 20) a
    join internal.duel_parties d on d.id = a.partie), '[]'::jsonb))
$$;

-- Note les victoires annoncées.
create or replace function public.noter_annonces_duel(p_parties bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  if p_parties is null or cardinality(p_parties) > 100 then return internal.error_json('invalid_request', ''); end if;
  update internal.duel_annonces a set annoncee_le = now() where a.partie = any (p_parties) and a.annoncee_le is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'notees', v_n);
end $$;

/* ---------- Les droits ---------- */

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.duel_mots_cles()', 'internal.duel_cles_des_atouts()', 'internal.duel_prix(text)', 'internal.duel_carte(text)',
    'internal.duel_cartes_de_la_main(text[])', 'internal.duel_prix_de_la_main(integer[])', 'internal.duel_ajouter_atouts(integer[], jsonb)',
    'internal.duel_atouts(text[], jsonb)', 'internal.duel_camp(integer[], integer[])', 'internal.duel_libres(integer[])',
    'internal.duel_verdict(integer[], integer[])',
    'internal.duel_manche(integer[], integer[], integer[], integer[], integer[], integer[], integer, integer, integer)',
    'internal.duel_exp(double precision)',
    'internal.duel_valeur(integer[], integer[], integer[], integer[], integer[], integer[], integer, integer, integer)',
    'internal.duel_choisir(integer[], integer[], integer[], integer[], integer[], integer[], integer, double precision, double precision, integer)',
    'internal.duel_graine_suivante(bigint)', 'internal.duel_permis(uuid)', 'internal.duel_joueur()', 'internal.duel_en_essai(uuid)',
    'internal.duel_main_lue(jsonb)', 'internal.duel_main_json(text[])', 'internal.duel_refus_de_main(uuid, text[])',
    'internal.duel_compagnon_de(uuid)', 'internal.duel_lieu_de(uuid)', 'internal.duel_gaulois_json(uuid)', 'internal.duel_jour(timestamptz)',
    'internal.duel_boss_du(date)', 'internal.duel_flamme(uuid)', 'internal.duel_comptes_du_jour(uuid)',
    'internal.duel_abandonner_les_vieilles(uuid)', 'internal.duel_finir(bigint, integer, boolean)', 'internal.duel_partie_json(bigint)',
    'internal.duel_preparer(text[], jsonb)',
    'public.get_mon_duel()', 'public.enregistrer_main_duel(jsonb)', 'public.get_adversaires_duel()', 'public.commencer_duel(text, uuid, jsonb)',
    'public.jouer_manche_duel(bigint, integer, integer)', 'public.abandonner_duel(bigint)',
    'public.noter_flammes_duel(text[])', 'public.duel_annonces_a_envoyer()', 'public.noter_annonces_duel(bigint[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
end $$;

grant execute on function public.get_mon_duel() to authenticated;
grant execute on function public.enregistrer_main_duel(jsonb) to authenticated;
grant execute on function public.get_adversaires_duel() to authenticated;
grant execute on function public.commencer_duel(text, uuid, jsonb) to authenticated;
grant execute on function public.jouer_manche_duel(bigint, integer, integer) to authenticated;
grant execute on function public.abandonner_duel(bigint) to authenticated;
grant execute on function public.noter_flammes_duel(text[]) to service_role;
grant execute on function public.duel_annonces_a_envoyer() to service_role;
grant execute on function public.noter_annonces_duel(bigint[]) to service_role;
