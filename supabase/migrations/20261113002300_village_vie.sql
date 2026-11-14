-- La vie du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois » ; formes des réponses de la place :
-- src/lib/village/contrat.ts, `GauloisDeLaPlace` et `Village`).
--
-- Demande du pilote, 13 novembre 2026 : que l'activité du joueur sur Discord et sur OpenFront décide de ce que fait son
-- Gaulois, avec l'API de Claude pour personnaliser ; puis « Oui, des bulles » : chaque Gaulois dit de temps en temps une
-- phrase courte, écrite par Claude à partir de faits vrais seulement.
--
-- Ce qui se sait, et rien d'autre :
-- - `partie_le` : le début de la dernière partie qui a rapporté des points au clan au compte, d'après le journal des
--   statères (migration 20261113001800), si elle a commencé il y a moins de 24 heures. OpenFront ne dit pas qui joue en ce
--   moment : seule une partie finie se connaît. Aucune nouvelle lecture d'OpenFront.
-- - `vocal` : vrai si le membre était dans un salon vocal du serveur Discord du clan au dernier relevé du robot, faux sinon,
--   null si le relevé a plus de 15 minutes ou n'existe pas. Le robot n'est pas connecté en permanence : pas de statut « en
--   ligne ». Le relevé vient de scripts/animer-village.ts (src/lib/village/vie-releve.ts), toutes les 5 minutes, par l'API
--   de Discord, un membre à la fois.
-- - `replique` : la bulle en cours, écrite par Claude, montrée 12 heures au plus, et seulement tant que l'encadrement laisse
--   les bulles. Une bulle qui parle de la dernière partie (ses points, la bataille, la taverne) ne se montre que tant que la
--   place montre cette partie au même compte : jamais pour un membre anonyme, ni après que son pseudo a quitté la liste du
--   clan.
-- Tout ce qui a passé ses 24 heures est effacé à chaque passage du robot ET à chaque lecture de la place
-- (internal.village_vie_effacer_l_ancien) : la page Confidentialité le promet, même si le robot ne tourne plus.
-- Qui paraît, et avec quoi (décision du pilote du 14 novembre 2026 : « tous ceux qui créent un personnage apparaissent dans
-- le village », sans choix de se cacher) : le Gaulois de chaque compte validé, avec le nom que le QG montre pour ce compte
-- (internal.village_nom, migration 20261113002000) et son état vocal, que le robot relève pour tous. Le village ne lit pas le
-- choix du mur du QG (profiles.show_to_members), qui reste celui du QG seulement. `partie_le` demande toujours un pseudo
-- public unique dans la liste du clan (internal.member_pseudo) : le début exact d'une partie, croisé avec les sessions
-- publiques du clan, donnerait l'identifiant OpenFront d'un membre anonyme, que le site ne publie jamais (revue de sécurité
-- du 14 novembre 2026). Un membre anonyme suit donc l'heure et le vocal, pas ses parties.
--
-- Les bulles :
-- - Claude ne reçoit que des faits sans identité : l'heure et le moment de la journée à Paris, le lieu du Gaulois, les points
--   de sa dernière partie, les noms des objets qu'il porte. Ces faits sont gardés avec la bulle.
-- - Jamais l'état vocal (relecture du 14 novembre 2026) : une bulle se montre 12 heures, l'état vocal 15 minutes. Le lieu
--   d'une bulle se calcule comme si le vocal n'était pas relevé, et des faits qui disent la salle de réunion sont refusés.
--   Les points ne sont donnés que d'une partie commencée il y a moins de 12 heures : avec les 12 heures de la bulle, rien de
--   la partie ne reste à l'écran au-delà des 24 heures où la place la montre.
-- - Le serveur décide de tout : la liste de travail ne demande une bulle que si les bulles sont permises, que la dépense du
--   mois n'a pas atteint le plafond, que rien n'a été demandé pour ce Gaulois depuis 6 heures, et que ses faits ont changé
--   depuis la dernière demande (une nouvelle partie ou un autre moment de la journée : la clé internal.village_vie_cle).
--   Une demande qui n'a pas donné de bulle (phrase écartée, refus du modèle) compte aussi : Claude n'est pas redemandé à
--   chaque passage pour le même Gaulois.
--   À la réception, il refait ces contrôles (sauf le plafond : la dépense est déjà faite), ignore une bulle qui parle d'une
--   partie que le serveur ne connaît pas ou de plus de 12 heures, et contrôle chaque phrase
--   (internal.village_vie_replique_valide, les mêmes règles que controlerReplique de vie-releve.ts) : 90 signes au plus,
--   des lettres, des chiffres et une ponctuation simple seulement, pas deux majuscules d'affilée, aucun nombre absent des
--   faits, aucun mot de la liste (la même que MOTS_INTERDITS de src/lib/village/consigne-repliques.ts, un test le garde).
--   Tout ou rien : un envoi mal formé est refusé en entier (`invalid_releve`), sans rien écrire.
-- - La dépense : le robot envoie les jetons lus dans chaque réponse de l'API ; le serveur les compte par mois, à Paris, au
--   prix du modèle qu'il garde (internal.village_vie_reglage : Claude Haiku 5.5, 0,10 $ et 0,50 $ par million de jetons
--   d'entrée et de sortie, prix de la skill claude-api au 13 novembre 2026). Le plafond de départ : 10 $ par mois.
--
-- Ce qui est gardé :
-- - internal.village_vie : par compte validé qui a un Gaulois, un numéro opaque (ce que le robot renvoie, jamais
--   l'identifiant du compte), le dernier état vocal et son heure, la bulle en cours avec son heure et ses faits, l'heure et
--   la clé de la dernière demande : chacun effacé au bout de 24 heures. Une ligne s'efface avec le compte, ou dès que le
--   compte n'est plus validé ou n'a plus de Gaulois.
-- - internal.village_vie_depense : par mois, le nombre d'appels à Claude, les jetons d'entrée et de sortie, le coût en
--   dollars, les bulles écrites et les phrases écartées par le robot. Treize mois. Rien n'y désigne un joueur.
-- - internal.village_vie_reglage : les bulles permises ou non, le plafond, le modèle et son prix. Un réglage se change, il
--   ne s'efface pas.
--
-- Qui peut quoi :
-- - get_village (remplacée) : les mêmes droits et les mêmes lignes qu'en 20261113002000, avec en plus `partie_le`, `vocal`,
--   `replique` par Gaulois et `releve`, l'heure du dernier relevé vocal des Gaulois de la place, ou à défaut celle de la
--   dernière relecture des parties (internal.stateres_releve).
-- - vie_du_village_travail, noter_vie_du_village : la clé de service seulement (le workflow des victoires).
-- - regler_bulles_du_village, regler_plafond_du_village : les admins et le fondateur, ceux qui règlent déjà le site dans la
--   Direction ; chaque changement va au journal de l'encadrement (`village_bubbles_set`, `village_cap_set`).
-- - get_vie_du_village : l'encadrement (officier et au-dessus) lit la dépense du mois, le plafond et les bulles écrites.
--
-- Trois tables, un déclencheur et vingt et une fonctions ajoutés, une fonction remplacée, aucune donnée existante touchée.
-- Rejouée, elle se remplace par la même et ne remet pas les réglages à leur valeur de départ.

/* ---------- Les tables ---------- */

create table if not exists internal.village_vie_reglage (
  id boolean primary key default true check (id),
  bulles boolean not null default true,
  -- En dollars, la monnaie de la facture d'Anthropic. Le pilote : « +50 € par mois » au plus.
  plafond numeric(6, 2) not null default 10 check (plafond between 0 and 100),
  modele text not null check (modele ~ '^claude-[a-z0-9-]{1,60}$'),
  -- En dollars par million de jetons.
  prix_entree numeric(10, 4) not null check (prix_entree > 0 and prix_entree <= 1000),
  prix_sortie numeric(10, 4) not null check (prix_sortie > 0 and prix_sortie <= 1000),
  maj_le timestamptz not null default now(),
  maj_par uuid references public.profiles (user_id) on delete set null
);

-- Le plus petit modèle de Claude en vigueur le 13 novembre 2026, et son prix pour une demande de moins de 100 000 jetons.
insert into internal.village_vie_reglage (id, bulles, plafond, modele, prix_entree, prix_sortie)
values (true, true, 10, 'claude-haiku-5-5', 0.10, 0.50)
on conflict (id) do nothing;

create table if not exists internal.village_vie_depense (
  -- Le 1er du mois, à Paris.
  mois date primary key check (extract(day from mois) = 1),
  appels integer not null default 0 check (appels >= 0),
  entree bigint not null default 0 check (entree >= 0),
  sortie bigint not null default 0 check (sortie >= 0),
  -- En dollars.
  cout numeric(14, 8) not null default 0 check (cout >= 0),
  repliques integer not null default 0 check (repliques >= 0),
  ecartees integer not null default 0 check (ecartees >= 0),
  maj_le timestamptz not null default now()
);

create table if not exists internal.village_vie (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  -- Le numéro que le robot reçoit et renvoie : 16 signes au hasard, rien de l'identifiant du compte.
  numero text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 16) check (numero ~ '^[0-9a-f]{16}$'),
  vocal boolean,
  vocal_le timestamptz,
  replique text check (replique is null or char_length(replique) between 1 and 90),
  replique_le timestamptz,
  replique_faits jsonb,
  -- La dernière demande d'une bulle pour ce Gaulois, qu'elle en ait donné une ou pas (phrase écartée, refus du modèle), et
  -- la clé de ses faits à ce moment-là : la règle des 6 heures et des faits changés part de là.
  tente_le timestamptz,
  tente_cle text check (tente_cle is null or char_length(tente_cle) <= 80),
  check (vocal is null or vocal_le is not null),
  check ((replique is null) = (replique_le is null)),
  check ((tente_le is null) = (tente_cle is null))
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.village_vie_reglage enable row level security;
alter table internal.village_vie_depense enable row level security;
alter table internal.village_vie enable row level security;
revoke all on table internal.village_vie_reglage from public, anon, authenticated;
revoke all on table internal.village_vie_depense from public, anon, authenticated;
revoke all on table internal.village_vie from public, anon, authenticated;

-- Un réglage se change, il ne s'efface pas : sans lui, ni plafond ni prix.
create or replace function internal.village_vie_reglage_garde() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'le réglage de la vie du village se change, il ne s''efface pas';
end $$;

create or replace trigger village_vie_reglage_garde before delete on internal.village_vie_reglage
  for each statement execute function internal.village_vie_reglage_garde();

revoke all on function internal.village_vie_reglage_garde() from public, anon, authenticated;

/* ---------- Les règles ---------- */

-- Le moment de la journée à Paris : la nuit de 23 h à 7 h, le matin jusqu'à midi, l'après-midi jusqu'à 18 h, le soir. Le
-- même que momentDeLaJournee de src/lib/village/vie-releve.ts, dont la nuit est celle de l'écran (ilFaitNuit de
-- src/lib/village/vie.ts) ; l'essai de la migration compare les deux.
create or replace function internal.village_vie_moment(p_at timestamptz) returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when x.h >= 23 or x.h < 7 then 'nuit'
    when x.h < 12 then 'matin'
    when x.h < 18 then 'apres-midi'
    else 'soir'
  end
  from (select extract(hour from p_at at time zone 'Europe/Paris')::integer as h) x
$$;

-- Le 1er du mois de `p_at`, à Paris : le mois de la dépense.
create or replace function internal.village_vie_mois(p_at timestamptz) returns date
language sql stable set search_path = public, pg_temp as $$
  select date_trunc('month', p_at at time zone 'Europe/Paris')::date
$$;

-- L'état vocal à montrer : celui du dernier relevé s'il a moins de 15 minutes ; sinon rien.
create or replace function internal.village_vie_vocal(p_vocal boolean, p_le timestamptz) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select case when p_le > now() - interval '15 minutes' then p_vocal end
$$;

-- La dernière partie qui a rapporté des points au compte, commencée il y a moins de 24 heures, d'après le journal des
-- statères : son début et ses points. Aucune ligne : pas de partie récente.
-- Aucune ligne non plus pour un compte qui n'a pas de pseudo public unique dans la liste du clan (internal.member_pseudo, la
-- règle des visages du QG), qu'il se montre ou non sur le mur du QG : le début exact d'une partie, croisé avec les sessions
-- publiques du clan, donnerait son identifiant OpenFront, que le site ne publie jamais (revue de sécurité du 14 novembre
-- 2026). Son Gaulois suit alors le vocal et l'heure, et ses bulles n'ont ni points ni partie. Le Gaulois de l'appelant suit
-- la même règle : ce qu'il voit de lui est ce que les autres voient. Les statères, eux, ne changent pas (ils lisent le
-- journal sans cette fonction).
create or replace function internal.village_vie_partie(p_user uuid) returns table (debut timestamptz, points numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.debut, m.points
  from internal.stateres_mouvements m
  where m.user_id = p_user and m.nature = 'victoire' and m.debut > now() - interval '24 hours'
    and internal.member_pseudo(p_user) is not null
  order by m.debut desc, m.id desc
  limit 1
$$;

-- Ce dont une bulle dépend : la dernière partie et le moment de la journée. Une nouvelle bulle n'est demandée que si cette
-- clé a changé depuis la précédente. Pas l'état vocal : il n'est jamais donné à Claude, et une entrée en vocal suivie d'une
-- nouvelle bulle le laisserait deviner.
create or replace function internal.village_vie_cle(p_partie timestamptz, p_at timestamptz) returns text
language sql stable set search_path = public, pg_temp as $$
  select coalesce(to_char(p_partie at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), '-')
    || '|' || internal.village_vie_moment(p_at)
$$;

-- Les mots et les expressions refusés dans une bulle, sur le texte normalisé (internal.village_vie_normaliser). La même
-- liste que MOTS_INTERDITS de src/lib/village/consigne-repliques.ts : un test garde les deux identiques. Une espace avant et
-- après : le mot seul ; une espace avant seulement : tout mot qui commence ainsi.
create or replace function internal.village_vie_mots_interdits() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array[
    ' asterix', ' obelix', ' idefix', ' panoramix', ' abraracourcix', ' assurancetourix', ' cetautomatix', ' ordralfabetix',
    ' falbala', ' bonemine', ' uderzo', ' goscinny', ' toutatis', ' potion', ' menhir', ' sanglier', ' romain', ' cesar',
    ' druide', ' chaudron', ' serpe ', ' serpes ', ' gui ', ' irreductible', ' barde ', ' bardes ', ' casque aile',
    ' sont fous', ' tombe sur la tete',
    ' http', ' www', ' discord', ' openfront', ' gal ',
    ' gagn', ' victoir', ' defaite', ' perd',
    ' con ', ' cons ', ' connard', ' connasse', ' salop', ' pute ', ' putes ', ' putain', ' encul', ' nique', ' batard',
    ' merde', ' pd ', ' pede ', ' pedes ', ' nazi', ' hitler', ' negre', ' bougnoul', ' youpin',
    ' nul ', ' nuls ', ' nulle ', ' nulles ', ' abruti', ' idiot', ' tocard', ' cretin', ' debile', ' imbecile'
  ]::text[]
$$;

-- Les mots qui gardent leur majuscule au milieu d'une phrase. Toute autre majuscule doit ouvrir la bulle ou une phrase
-- (après « . », « ! », « ? » ou « … » et une espace) : un nom propre (une personne, un clan, une marque) ne passe pas. La même
-- liste que MAJUSCULES_PERMISES de src/lib/village/consigne-repliques.ts : un test garde les deux identiques. « Discord »
-- n'y est pas : il est dans les mots interdits, et rien de ce que Claude reçoit ne le nomme.
create or replace function internal.village_vie_majuscules_permises() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['Gauloises', 'Gauloise', 'Gaulois']::text[]
$$;

-- Le texte ramené aux mots : minuscules sans accents, une espace entre deux mots, une au début et à la fin. Le même que
-- normaliserPourLesMots de src/lib/village/vie-releve.ts. Les lettres accentuées sont écrites une à une : le résultat ne
-- dépend pas de la langue réglée sur la base.
create or replace function internal.village_vie_normaliser(p_texte text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select ' ' || btrim(regexp_replace(lower(translate(
      replace(replace(replace(replace(coalesce(p_texte, ''), 'Œ', 'oe'), 'œ', 'oe'), 'Æ', 'ae'), 'æ', 'ae'),
      'ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿç',
      'aaaeeeeiioouuuycaaaeeeeiioouuuyc')), '[^a-z]+', ' ', 'g')) || ' '
$$;

-- Les nombres écrits dans un texte (« 21 », « 1,65 »), pour les comparer par leur valeur.
create or replace function internal.village_vie_nombres(p_texte text) returns numeric[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(replace(t.m[1], ',', '.')::numeric), '{}'::numeric[])
  from regexp_matches(coalesce(p_texte, ''), '[0-9]+(?:[.,][0-9]+)?', 'g') as t (m)
$$;

-- Les faits d'une bulle, tels que le robot les envoie (FaitsDuGaulois de vie-releve.ts) : { heure, moment, lieu, points,
-- objets }, rien d'autre. Le lieu n'est jamais la salle de réunion : l'état vocal ne se dit pas dans une bulle, qui reste 12
-- heures à l'écran (LIEUX_DES_BULLES de vie-releve.ts). Les objets sont des noms du catalogue : des lettres, des espaces, des
-- apostrophes et des tirets.
create or replace function internal.village_vie_faits_valides(p jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_o jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p)) <> 5 then return false; end if;
  -- L'heure comme l'écrit l'écran (heureDeParis de src/lib/village/vie.ts) : « 7 h 05 », « 21 h 38 ».
  if jsonb_typeof(p -> 'heure') is distinct from 'string' or (p ->> 'heure') !~ '^([01]?[0-9]|2[0-3]) h [0-5][0-9]$' then return false; end if;
  if jsonb_typeof(p -> 'moment') is distinct from 'string' or (p ->> 'moment') not in ('nuit', 'matin', 'apres-midi', 'soir') then return false; end if;
  if jsonb_typeof(p -> 'lieu') is distinct from 'string' or (p ->> 'lieu') not in ('place', 'taverne', 'bataille', 'maisons') then return false; end if;
  if jsonb_typeof(p -> 'points') is distinct from 'null'
     and (jsonb_typeof(p -> 'points') is distinct from 'string' or (p ->> 'points') !~ '^[0-9]{1,3}(,[0-9]{1,2})?$') then
    return false;
  end if;
  -- Chaque contrôle qui suppose un type vient après celui du type, dans un `if` à part : Postgres ne promet pas l'ordre
  -- d'un `or`, et une fonction des tableaux appelée sur autre chose lève une erreur.
  if jsonb_typeof(p -> 'objets') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p -> 'objets') > 5 then return false; end if;
  for v_o in select value from jsonb_array_elements(p -> 'objets') loop
    if jsonb_typeof(v_o) <> 'string' or (v_o #>> '{}') !~ '^[A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ'' -]{1,40}$' then return false; end if;
  end loop;
  return true;
end $$;

-- Une bulle acceptée : 1 à 90 signes, sans espace en trop ; seulement des lettres du français, des chiffres, des espaces et
-- une ponctuation simple (ni « @ », ni « # », ni balise, ni lien, ni émoji) ; pas deux majuscules d'affilée ; aucune
-- majuscule hors du début d'une phrase, sauf les mots permis (internal.village_vie_majuscules_permises) ; pas de point collé
-- entre deux mots (une adresse) ; aucun nombre absent des faits (l'heure et les points), comparé par sa valeur décimale
-- exacte ; aucun mot de la liste. Les mêmes règles que controlerReplique de src/lib/village/vie-releve.ts.
create or replace function internal.village_vie_replique_valide(p_texte text, p_faits jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_permis numeric[];
  v_mots text;
  v_reste text;
  v_mot text;
begin
  if p_texte is null or not internal.village_vie_faits_valides(p_faits) then return false; end if;
  if char_length(p_texte) < 1 or char_length(p_texte) > 90 then return false; end if;
  if p_texte <> btrim(p_texte) or position('  ' in p_texte) > 0 then return false; end if;
  if p_texte !~ '^[A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ0-9 .,!?''’:;…«»()-]+$' then return false; end if;
  if p_texte ~ '[A-Z]{2}' then return false; end if;
  -- Les majuscules : les mots permis, entiers, puis le début de la bulle et de chaque phrase (un guillemet « ouvrant permis
  -- devant), sont retirés ; il ne doit plus en rester aucune.
  v_reste := p_texte;
  foreach v_mot in array internal.village_vie_majuscules_permises() loop
    v_reste := regexp_replace(v_reste, '(?<![A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ])' || v_mot || '(?![A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ])', '_', 'g');
  end loop;
  v_reste := regexp_replace(v_reste, '^((?:« )?)[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]', '\1_');
  v_reste := regexp_replace(v_reste, '([.!?…] (?:« )?)[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]', '\1_', 'g');
  if v_reste ~ '[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]' then return false; end if;
  if p_texte ~ '[A-Za-z0-9]\.[A-Za-z]' then return false; end if;
  v_permis := internal.village_vie_nombres((p_faits ->> 'heure') || ' ' || coalesce(p_faits ->> 'points', ''));
  if exists (select 1 from unnest(internal.village_vie_nombres(p_texte)) as n (valeur) where not (n.valeur = any (v_permis))) then
    return false;
  end if;
  v_mots := internal.village_vie_normaliser(p_texte);
  if exists (select 1 from unnest(internal.village_vie_mots_interdits()) as m (mot) where position(m.mot in v_mots) > 0) then
    return false;
  end if;
  return true;
end $$;

-- Un entier JSON de 0 à `p_max`.
create or replace function internal.village_vie_entier(p jsonb, p_max integer) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then return false; end if;
  v := (p #>> '{}')::numeric;
  return v = trunc(v) and v between 0 and p_max;
end $$;

-- Un envoi du robot : { vocaux?, repliques?, sans_bulle?, depense? }, rien d'autre.
-- - vocaux : 500 au plus, chacun { n, vocal } (vrai, faux, ou null : illisible), chaque numéro une fois ;
-- - repliques : chacune { n, texte, faits }, une bulle acceptée par internal.village_vie_replique_valide ;
-- - sans_bulle : les numéros des Gaulois demandés à Claude sans en tirer de bulle (phrase écartée, refus du modèle) ;
-- - repliques et sans_bulle : 20 au plus ensemble, chaque numéro une fois dans les deux ;
-- - depense : { appels (0 à 5), entree (0 à 200 000), sortie (0 à 50 000), ecartees (0 à 20) }, des entiers.
create or replace function internal.village_vie_releve_valide(p jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_cle text;
  v_e jsonb;
  v_vus text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for v_cle in select jsonb_object_keys(p) loop
    if v_cle not in ('vocaux', 'repliques', 'sans_bulle', 'depense') then return false; end if;
  end loop;
  -- Comme pour les faits : chaque contrôle qui suppose un type dans un `if` à part, après celui du type.
  if p ? 'vocaux' then
    if jsonb_typeof(p -> 'vocaux') <> 'array' then return false; end if;
    if jsonb_array_length(p -> 'vocaux') > 500 then return false; end if;
    v_vus := '{}';
    for v_e in select value from jsonb_array_elements(p -> 'vocaux') loop
      if jsonb_typeof(v_e) <> 'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(v_e)) <> 2 then return false; end if;
      if jsonb_typeof(v_e -> 'n') is distinct from 'string' or (v_e ->> 'n') !~ '^[0-9a-f]{16}$' then return false; end if;
      if jsonb_typeof(v_e -> 'vocal') is distinct from 'boolean' and jsonb_typeof(v_e -> 'vocal') is distinct from 'null' then return false; end if;
      if (v_e ->> 'n') = any (v_vus) then return false; end if;
      v_vus := v_vus || (v_e ->> 'n');
    end loop;
  end if;
  -- Les numéros des bulles et des demandes sans bulle, ensemble : chacun une fois, 20 au plus.
  v_vus := '{}';
  if p ? 'sans_bulle' then
    if jsonb_typeof(p -> 'sans_bulle') <> 'array' then return false; end if;
    if jsonb_array_length(p -> 'sans_bulle') > 20 then return false; end if;
    for v_e in select value from jsonb_array_elements(p -> 'sans_bulle') loop
      if jsonb_typeof(v_e) <> 'string' or (v_e #>> '{}') !~ '^[0-9a-f]{16}$' then return false; end if;
      if (v_e #>> '{}') = any (v_vus) then return false; end if;
      v_vus := v_vus || (v_e #>> '{}');
    end loop;
  end if;
  if p ? 'repliques' then
    if jsonb_typeof(p -> 'repliques') <> 'array' then return false; end if;
    if jsonb_array_length(p -> 'repliques') > 20 then return false; end if;
    for v_e in select value from jsonb_array_elements(p -> 'repliques') loop
      if jsonb_typeof(v_e) <> 'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(v_e)) <> 3 then return false; end if;
      if jsonb_typeof(v_e -> 'n') is distinct from 'string' or (v_e ->> 'n') !~ '^[0-9a-f]{16}$' then return false; end if;
      if jsonb_typeof(v_e -> 'texte') is distinct from 'string' then return false; end if;
      if not internal.village_vie_replique_valide(v_e ->> 'texte', v_e -> 'faits') then return false; end if;
      if (v_e ->> 'n') = any (v_vus) then return false; end if;
      v_vus := v_vus || (v_e ->> 'n');
    end loop;
  end if;
  if cardinality(v_vus) > 20 then return false; end if;
  if p ? 'depense' then
    v_e := p -> 'depense';
    if jsonb_typeof(v_e) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v_e)) <> 4 then return false; end if;
    if not (internal.village_vie_entier(v_e -> 'appels', 5) and internal.village_vie_entier(v_e -> 'entree', 200000)
      and internal.village_vie_entier(v_e -> 'sortie', 50000) and internal.village_vie_entier(v_e -> 'ecartees', 20)) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- Efface ce qui a passé son temps : un état vocal ou une bulle de plus de 24 heures, les lignes des comptes qui ne sont plus
-- validés ou n'ont plus de Gaulois, la dépense de plus de treize mois. Appelée par le robot à chaque passage, et à chaque
-- lecture de la place (get_village) : sans robot, l'effacement promis par la page Confidentialité se fait quand même. Peu
-- coûteuse : quelques lignes par Gaulois, et une ligne n'est écrite que si elle a quelque chose à effacer.
create or replace function internal.village_vie_effacer_l_ancien() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update internal.village_vie set vocal = null, vocal_le = null where vocal_le < now() - interval '24 hours';
  update internal.village_vie set replique = null, replique_le = null, replique_faits = null where replique_le < now() - interval '24 hours';
  update internal.village_vie set tente_le = null, tente_cle = null where tente_le < now() - interval '24 hours';
  delete from internal.village_vie v
  where not exists (
    select 1 from internal.gaulois g join public.profiles p on p.user_id = g.user_id
    where g.user_id = v.user_id and p.status = 'validated'
  );
  delete from internal.village_vie_depense where mois < (internal.village_vie_mois(now()) - interval '12 months')::date;
end $$;

-- La lecture de l'encadrement (VieDuVillage de src/lib/village/vie-releve.ts).
create or replace function internal.village_vie_etat() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'bulles', r.bulles,
    'plafond', r.plafond,
    'plafond_atteint', coalesce(d.cout, 0) >= r.plafond,
    'modele', r.modele,
    'prix', jsonb_build_object('entree', r.prix_entree, 'sortie', r.prix_sortie),
    'mois', m.mois,
    'depense', jsonb_build_object('mois', m.mois, 'cout', coalesce(d.cout, 0), 'appels', coalesce(d.appels, 0),
      'entree', coalesce(d.entree, 0), 'sortie', coalesce(d.sortie, 0), 'repliques', coalesce(d.repliques, 0),
      'ecartees', coalesce(d.ecartees, 0)),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('mois', h.mois, 'cout', h.cout, 'appels', h.appels, 'entree', h.entree,
          'sortie', h.sortie, 'repliques', h.repliques, 'ecartees', h.ecartees) order by h.mois desc)
      from internal.village_vie_depense h
      where h.mois < m.mois and h.mois >= (m.mois - interval '12 months')::date), '[]'::jsonb),
    'bulles_affichees', case when r.bulles then (
      select count(*) from internal.village_vie v
      join public.profiles p on p.user_id = v.user_id
      left join lateral internal.village_vie_partie(v.user_id) d on true
      where p.status = 'validated' and v.replique_le > now() - interval '12 hours'
        -- La règle de get_village : une bulle sur la dernière partie ne se montre que si la place montre cette partie.
        and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))) else 0 end,
    'dernier_vocal', (select max(v.vocal_le) from internal.village_vie v),
    'derniere_bulle', (select max(v.replique_le) from internal.village_vie v)
  )
  from internal.village_vie_reglage r
  cross join (select internal.village_vie_mois(now()) as mois) m
  left join internal.village_vie_depense d on d.mois = m.mois
  where r.id
$$;

revoke all on function internal.village_vie_moment(timestamptz) from public, anon, authenticated;
revoke all on function internal.village_vie_mois(timestamptz) from public, anon, authenticated;
revoke all on function internal.village_vie_vocal(boolean, timestamptz) from public, anon, authenticated;
revoke all on function internal.village_vie_partie(uuid) from public, anon, authenticated;
revoke all on function internal.village_vie_cle(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function internal.village_vie_mots_interdits() from public, anon, authenticated;
revoke all on function internal.village_vie_majuscules_permises() from public, anon, authenticated;
revoke all on function internal.village_vie_normaliser(text) from public, anon, authenticated;
revoke all on function internal.village_vie_nombres(text) from public, anon, authenticated;
revoke all on function internal.village_vie_faits_valides(jsonb) from public, anon, authenticated;
revoke all on function internal.village_vie_replique_valide(text, jsonb) from public, anon, authenticated;
revoke all on function internal.village_vie_entier(jsonb, integer) from public, anon, authenticated;
revoke all on function internal.village_vie_releve_valide(jsonb) from public, anon, authenticated;
revoke all on function internal.village_vie_effacer_l_ancien() from public, anon, authenticated;
revoke all on function internal.village_vie_etat() from public, anon, authenticated;

/* ---------- La place du village : get_village de 20261113002000 remplacée ---------- */

-- La place (`Village` du contrat) : { ok: true, gaulois: [{ nom, tenue, moi, partie_le, vocal, replique }], releve }. Les
-- mêmes droits et les mêmes lignes qu'avant : les Gaulois de tous les comptes validés, par ordre de création de leur
-- Gaulois, pour un compte validé ou de l'encadrement ; refus : not_signed_in, suspended, not_validated, rate_limited. Chaque
-- Gaulois :
-- - nom : le nom que le QG montre pour ce compte (internal.village_nom), pour tous. Tout Gaulois d'un compte validé est sur
--   la place, sous son nom : le pilote n'a voulu ni case pour s'en retirer (13 novembre 2026), ni choix de se montrer ou non
--   (14 novembre 2026) ; le choix du mur du QG (profiles.show_to_members) n'est pas lu ;
-- - partie_le : le début de sa dernière partie qui a rapporté des points au clan, de moins de 24 heures, seulement pour un
--   compte qui a un pseudo public unique dans la liste du clan (internal.village_vie_partie) ; sinon null ;
-- - vocal : l'état du dernier relevé de moins de 15 minutes, pour tous ; sinon null ;
-- - replique : sa bulle de moins de 12 heures, si l'encadrement laisse les bulles ; sinon null. Une bulle dont les faits
--   parlent de la dernière partie (des points, la bataille ou la taverne) ne se montre que si la place montre aussi une
--   partie de ce compte (partie_le) : jamais pour un membre anonyme, ni après que son pseudo a quitté la liste du clan ;
-- - releve : l'heure du dernier relevé vocal d'un Gaulois de la place (le robot les relève à chaque passage), ou à défaut
--   celle de la dernière relecture des parties ; null : ni l'un ni l'autre. L'écran l'écrit (« Relevé du … ») et en date
--   l'état vocal.
-- Ni solde, ni objet possédé, ni identifiant Discord. Limitée comme les gestes (internal.limit_exceeded) : l'écran ne la lit
-- qu'à l'ouverture de l'onglet et toutes les 5 minutes. Une fois l'appelant admis, efface d'abord ce qui a passé son temps
-- (internal.village_vie_effacer_l_ancien) : sans le robot, rien de la vie du village ne reste plus de 24 heures dès qu'on
-- regarde la place.
create or replace function public.get_village() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_role public.site_role;
  v_bulles boolean;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select p.status, p.role into v_status, v_role from public.profiles p where p.user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;
  perform internal.village_vie_effacer_l_ancien();
  v_bulles := coalesce((select r.bulles from internal.village_vie_reglage r where r.id), false);
  return jsonb_build_object(
    'ok', true,
    'gaulois', coalesce((
      select jsonb_agg(jsonb_build_object(
          'nom', internal.village_nom(p.display_name, p.gaul_number),
          'tenue', g.tenue,
          'moi', g.user_id = v_uid,
          'partie_le', d.debut,
          'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),
          'replique', case when v_bulles and v.replique_le > now() - interval '12 hours'
            and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))
            then v.replique end)
        order by g.created_at, g.user_id)
      from internal.gaulois g
      join public.profiles p on p.user_id = g.user_id
      left join internal.village_vie v on v.user_id = g.user_id
      left join lateral internal.village_vie_partie(g.user_id) d on true
      where p.status = 'validated'), '[]'::jsonb),
    'releve', coalesce(
      (select max(v.vocal_le) from internal.village_vie v join public.profiles p on p.user_id = v.user_id where p.status = 'validated'),
      (select r.le from internal.stateres_releve r where r.id))
  );
end $$;

revoke all on function public.get_village() from public, anon, authenticated;
grant execute on function public.get_village() to authenticated;

/* ---------- Pour le robot seulement (clé de service) ---------- */

-- La liste de travail du robot : { ok, maintenant, bulles, modele, depense: { mois, cout, plafond }, gaulois: [{ n, discord,
-- vocal, partie_le, points, tenue, tente_le, besoin }] }, pour chaque compte validé qui a un Gaulois, les plus anciens
-- relevés vocaux d'abord. `n` : le numéro opaque ; `discord` : l'identifiant Discord, pour le relevé vocal seulement, pour
-- tout compte qui en a un de bonne forme (sinon null : rien à relever), sans regarder le choix du mur du QG (décision du
-- pilote du 14 novembre 2026) ; `vocal` et `partie_le` : ce que la place en montre (internal.village_vie_vocal,
-- internal.village_vie_partie : rien d'une partie sans pseudo public unique), rien de plus ; `points` : ceux de cette partie,
-- seulement si elle a commencé il y a moins de 12 heures (une bulle se montre 12 heures : ses points ne restent pas à
-- l'écran plus longtemps que la partie) ;
-- `tente_le` : la dernière demande d'une bulle pour lui ; `besoin` : le serveur demande une nouvelle bulle, pas avant 6
-- heures après la précédente demande, et seulement si ses faits ont changé depuis (internal.village_vie_cle, sans l'état
-- vocal, que les bulles ne disent jamais). `bulles` est faux, et aucun `besoin`
-- n'est vrai, dès que l'encadrement a coupé les bulles ou que la dépense du mois atteint le plafond. Crée la ligne des
-- Gaulois qui n'en ont pas encore, et efface ce qui a passé son temps.
create or replace function public.vie_du_village_travail() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_r internal.village_vie_reglage;
  v_mois date := internal.village_vie_mois(now());
  v_cout numeric;
  v_bulles boolean;
begin
  perform internal.village_vie_effacer_l_ancien();
  insert into internal.village_vie (user_id)
  select g.user_id from internal.gaulois g join public.profiles p on p.user_id = g.user_id where p.status = 'validated'
  on conflict (user_id) do nothing;
  select * into v_r from internal.village_vie_reglage r where r.id;
  v_cout := coalesce((select d.cout from internal.village_vie_depense d where d.mois = v_mois), 0);
  v_bulles := coalesce(v_r.bulles, false) and v_cout < v_r.plafond;
  return jsonb_build_object(
    'ok', true,
    'maintenant', now(),
    'bulles', v_bulles,
    'modele', v_r.modele,
    'depense', jsonb_build_object('mois', v_mois, 'cout', v_cout, 'plafond', v_r.plafond),
    'gaulois', coalesce((
      select jsonb_agg(x.ligne order by x.vocal_le nulls first, x.cree, x.user_id)
      from (
        select
          jsonb_build_object(
            'n', v.numero,
            'discord', case when l.discord_id ~ '^[0-9]{17,20}$' then l.discord_id end,
            'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),
            'partie_le', d.debut,
            'points', case when d.debut > now() - interval '12 hours' then d.points end,
            'tenue', g.tenue,
            'tente_le', v.tente_le,
            'besoin', v_bulles and (v.tente_le is null or (v.tente_le <= now() - interval '6 hours'
              and v.tente_cle is distinct from internal.village_vie_cle(d.debut, now())))
          ) as ligne,
          v.vocal_le, g.created_at as cree, g.user_id
        from internal.gaulois g
        join public.profiles p on p.user_id = g.user_id
        join internal.village_vie v on v.user_id = g.user_id
        left join public.private_links l on l.user_id = g.user_id
        left join lateral internal.village_vie_partie(g.user_id) d on true
        where p.status = 'validated'
      ) x), '[]'::jsonb)
  );
end $$;

revoke all on function public.vie_du_village_travail() from public, anon, authenticated;
grant execute on function public.vie_du_village_travail() to service_role;

-- Reçoit un envoi du robot (internal.village_vie_releve_valide) et le note : la dépense du mois, au prix du modèle ; les
-- états vocaux ; les bulles et les demandes sans bulle, si l'encadrement laisse les bulles, si le Gaulois n'a pas eu de
-- demande depuis 6 heures et si ses faits ont changé depuis (sinon elles sont ignorées). Une demande sans bulle garde la
-- bulle d'avant et compte pour les 6 heures : une phrase écartée ne fait pas redemander Claude à chaque passage. Un numéro
-- inconnu, ou d'un compte qui n'est plus validé, est ignoré. Tout ou rien : un envoi mal formé est refusé en entier
-- (`invalid_releve`), sans rien écrire.
-- { ok: true, vocaux, repliques, sans_bulle, ignores }.
create or replace function public.noter_vie_du_village(p_releve jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_r internal.village_vie_reglage;
  v_mois date := internal.village_vie_mois(now());
  v_e jsonb;
  v_n text;
  v_v internal.village_vie;
  v_partie timestamptz;
  v_cle text;
  v_vocaux integer := 0;
  v_repliques integer := 0;
  v_sans integer := 0;
  v_ignores integer := 0;
begin
  if not internal.village_vie_releve_valide(p_releve) then
    return internal.error_json('invalid_releve', '');
  end if;
  select * into v_r from internal.village_vie_reglage r where r.id;
  if p_releve ? 'depense' then
    v_e := p_releve -> 'depense';
    insert into internal.village_vie_depense as d (mois, appels, entree, sortie, ecartees, cout)
    values (v_mois, (v_e ->> 'appels')::integer, (v_e ->> 'entree')::bigint, (v_e ->> 'sortie')::bigint, (v_e ->> 'ecartees')::integer,
      ((v_e ->> 'entree')::numeric * v_r.prix_entree + (v_e ->> 'sortie')::numeric * v_r.prix_sortie) / 1000000)
    on conflict (mois) do update
      set appels = d.appels + excluded.appels, entree = d.entree + excluded.entree, sortie = d.sortie + excluded.sortie,
        ecartees = d.ecartees + excluded.ecartees, cout = d.cout + excluded.cout, maj_le = now();
  end if;
  for v_e in select value from jsonb_array_elements(coalesce(p_releve -> 'vocaux', '[]'::jsonb)) loop
    -- L'état vocal d'un compte qui n'est plus validé ou n'a plus de Gaulois n'est jamais noté, même si le robot l'envoie.
    update internal.village_vie v
    set vocal = case when jsonb_typeof(v_e -> 'vocal') = 'boolean' then (v_e ->> 'vocal')::boolean end, vocal_le = now()
    where v.numero = v_e ->> 'n'
      and exists (
        select 1 from internal.gaulois g join public.profiles p on p.user_id = g.user_id
        where g.user_id = v.user_id and p.status = 'validated'
      );
    if found then v_vocaux := v_vocaux + 1; else v_ignores := v_ignores + 1; end if;
  end loop;
  -- Les bulles, puis les demandes sans bulle : `v_e` est une bulle { n, texte, faits }, ou le numéro seul.
  for v_e in
    select value from jsonb_array_elements(coalesce(p_releve -> 'repliques', '[]'::jsonb))
    union all
    select value from jsonb_array_elements(coalesce(p_releve -> 'sans_bulle', '[]'::jsonb))
  loop
    v_n := case when jsonb_typeof(v_e) = 'object' then v_e ->> 'n' else v_e #>> '{}' end;
    select v.* into v_v from internal.village_vie v
    where v.numero = v_n
      and exists (
        select 1 from internal.gaulois g join public.profiles p on p.user_id = g.user_id
        where g.user_id = v.user_id and p.status = 'validated'
      )
    for update;
    if not found or not v_r.bulles or v_v.tente_le > now() - interval '6 hours' then
      v_ignores := v_ignores + 1;
      continue;
    end if;
    v_partie := null;
    select d.debut into v_partie from internal.village_vie_partie(v_v.user_id) d;
    v_cle := internal.village_vie_cle(v_partie, now());
    if v_v.tente_le is not null and v_v.tente_cle is not distinct from v_cle then
      v_ignores := v_ignores + 1;
      continue;
    end if;
    -- Une bulle qui parle de la dernière partie (des points, la bataille, la taverne) : seulement si le serveur montre une
    -- partie de ce compte, commencée il y a moins de 12 heures, celle dont la liste de travail donne les points.
    if jsonb_typeof(v_e) = 'object' and ((v_e -> 'faits' ->> 'points') is not null or (v_e -> 'faits' ->> 'lieu') in ('bataille', 'taverne'))
       and (v_partie is null or v_partie <= now() - interval '12 hours') then
      v_ignores := v_ignores + 1;
      continue;
    end if;
    if jsonb_typeof(v_e) = 'object' then
      update internal.village_vie
      set replique = v_e ->> 'texte', replique_le = now(), replique_faits = v_e -> 'faits', tente_le = now(), tente_cle = v_cle
      where user_id = v_v.user_id;
      v_repliques := v_repliques + 1;
    else
      update internal.village_vie set tente_le = now(), tente_cle = v_cle where user_id = v_v.user_id;
      v_sans := v_sans + 1;
    end if;
  end loop;
  if v_repliques > 0 then
    insert into internal.village_vie_depense as d (mois, repliques) values (v_mois, v_repliques)
    on conflict (mois) do update set repliques = d.repliques + excluded.repliques, maj_le = now();
  end if;
  perform internal.village_vie_effacer_l_ancien();
  return jsonb_build_object('ok', true, 'vocaux', v_vocaux, 'repliques', v_repliques, 'sans_bulle', v_sans, 'ignores', v_ignores);
end $$;

revoke all on function public.noter_vie_du_village(jsonb) from public, anon, authenticated;
grant execute on function public.noter_vie_du_village(jsonb) to service_role;

/* ---------- Pour l'encadrement ---------- */

-- La lecture de l'encadrement, officier et au-dessus : les bulles, le plafond, la dépense du mois et des douze précédents,
-- les bulles montrées en ce moment. Refus : not_signed_in, suspended, not_validated, forbidden.
create or replace function public.get_vie_du_village() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  begin
    perform internal.require_rank(2);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  return internal.village_vie_etat();
end $$;

revoke all on function public.get_vie_du_village() from public, anon, authenticated;
grant execute on function public.get_vie_du_village() to authenticated;

-- Coupe ou remet les bulles, pour les admins et le fondateur. Coupées : la place n'en montre plus aucune, et le robot n'en
-- demande plus. Répond la lecture de l'encadrement. Refus : invalid_request, et ceux de tout réglage (not_signed_in,
-- suspended, not_validated, forbidden, rate_limited).
create or replace function public.regler_bulles_du_village(p_actives boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_actives is null then perform internal.fail('invalid_request'); end if;
    update internal.village_vie_reglage set bulles = p_actives, maj_le = now(), maj_par = v_actor where id and bulles <> p_actives;
    if found then perform internal.log_admin(v_actor, 'village_bubbles_set', null, jsonb_build_object('actives', p_actives)); end if;
    return internal.village_vie_etat();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.regler_bulles_du_village(boolean) from public, anon, authenticated;
grant execute on function public.regler_bulles_du_village(boolean) to authenticated;

-- Change le plafond du mois, en dollars, de 0 à 100, au centime, pour les admins et le fondateur. Répond la lecture de
-- l'encadrement. Refus : invalid_plafond, et ceux de tout réglage.
create or replace function public.regler_plafond_du_village(p_plafond numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_avant numeric;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_plafond is null or p_plafond = 'NaN'::numeric or p_plafond < 0 or p_plafond > 100 or p_plafond <> round(p_plafond, 2) then
      perform internal.fail('invalid_plafond');
    end if;
    select r.plafond into v_avant from internal.village_vie_reglage r where r.id for update;
    if v_avant <> p_plafond then
      update internal.village_vie_reglage set plafond = p_plafond, maj_le = now(), maj_par = v_actor where id;
      perform internal.log_admin(v_actor, 'village_cap_set', null, jsonb_build_object('avant', v_avant, 'apres', p_plafond));
    end if;
    return internal.village_vie_etat();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.regler_plafond_du_village(numeric) from public, anon, authenticated;
grant execute on function public.regler_plafond_du_village(numeric) to authenticated;
