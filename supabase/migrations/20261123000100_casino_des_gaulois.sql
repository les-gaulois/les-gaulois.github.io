-- Le casino des Gaulois, côté serveur (docs/DIRECTION.md, « Le casino des Gaulois » ; formes des réponses :
-- src/lib/village/contrat-casino.ts ; règles et chances : src/lib/village/casino/, une par jeu).
--
-- Demande du pilote, 22 novembre 2026 : un casino dans « Mon Gaulois », « black jack, la roulette, machine à tirer », plus
-- la course des familiers, la palissade (« le statère qui tombe de pieu en pieu ») et les dés ; « oui plafond de 2000 par
-- jour » ; « le casino tu peux l'ouvrir » : ouvert à tous les comptes validés dès la mise en ligne.
--
-- Les règles :
-- - Six jeux, aux chances des maquettes validées, reprises au chiffre près (src/lib/village/casino/) :
--   la roue du charron (36 cases sans zéro : un numéro 36 fois la mise, couleur, pair, impair, 1 à 18, 19 à 36 deux fois,
--   tiers et colonnes trois fois) ; la machine du forgeron (100 fois 2 sur 1 000, 20 fois 1 sur 100, 5 fois 4 sur 100,
--   2 fois 1 sur 10, la mise rendue 1 sur 5, rien 648 sur 1 000) ; la course des familiers (3, 4, 6, 8, 12, 24 fois, avec
--   8, 6, 4, 3, 2, 1 chances sur 24, un couloir par course) ; la palissade (huit rangées à une chance sur deux, coupes de 19,
--   4, 1,5, 0,5, 0,2, 0,5, 1,5, 4, 19 fois) ; les dés (moins et plus de 7 2,4 fois, double 6 fois, sommes de 36 à 6 fois).
--   Chacun rend en moyenne exactement la mise. Le vingt-et-un (paquet sans fin, le tavernier regarde sa carte cachée sur un
--   as ou un 10 et s'arrête à tous les 17, 21 d'entrée payé 3 pour 2, doubler sur deux cartes, séparer une fois, as séparés
--   une carte) rend 99,43 % joué au mieux (calcul exact). Mises comprises dans ce qui est rendu.
-- - Le serveur tire tout, d'abord, avec le générateur sûr de Postgres (internal.casino_entier : 48 bits de gen_random_uuid,
--   sans biais, les valeurs en trop rejetées) ; l'écran ne fait que montrer. Au vingt-et-un, chaque carte se tire au moment
--   d'être donnée : la carte cachée du tavernier est gardée dans internal.casino_mains et ne sort qu'une fois retournée, et
--   aucune carte à venir n'existe avant d'être donnée.
-- - Toute mise et chaque pari sont des multiples de 10 plus grands que zéro (les jetons : 10, 20, 50, 100, 200), et la mise
--   de départ d'un tour fait 200 au plus (la somme des paris d'une table, un tirage, un couloir, un lâcher, la mise de départ
--   du vingt-et-un). Au vingt-et-un, doubler et séparer ajoutent la mise de la main en cours (au plus 3 fois la mise de
--   départ en tout), tant que la bourse et le plafond suffisent.
-- - Le plafond : 2 000 statères misés par jour et par compte, tous jeux confondus, compléments compris, le jour allant de
--   minuit à minuit à l'heure de Paris. Le compte du jour se lit dans le journal des statères.
-- - Chaque mise s'écrit au journal des statères, sous le verrou du compte, avant le tirage : nature 'casino_mise' (`ref` :
--   « casino/<partie> ») ; puis ce qui revient, s'il revient quelque chose : nature 'casino_gain'. Ces natures sont à elles :
--   les dépenses de l'onglet Village de la Direction et l'annonce des achats sur Discord ne les comptent pas (le total en
--   circulation, lui, suit les soldes). Le solde ne passe jamais sous zéro : la mise est prise avant que le gain soit
--   rendu. Le casino ne crée aucun statère (les jeux à un coup rendent exactement la mise en moyenne, le vingt-et-un
--   99,43 % joué au mieux), n'a aucune cagnotte, ne montre jamais rien d'un autre compte. Rien qui puisse échouer ne vient
--   après le tirage : ce que les contrôles acceptent se paie toujours.
-- - Le mode GOD (l'essai du pilote) : on joue sans mise ni gain ; rien n'est écrit au journal des statères et rien ne compte
--   pour le plafond. Une main du vingt-et-un commencée avec une vraie mise ne se continue pas pendant un essai (refus
--   'mode_god') : elle attend la fin de l'essai, et son gain reste vrai. Le déclencheur internal.village_god_mouvement n'est
--   pas touché.
-- - Une main du vingt-et-un laissée ouverte ne se perd jamais : elle attend son joueur (get_casino et lire_vingt_et_un la
--   rendent), même si le casino est fermé entre-temps. Une seule main ouverte par compte.
-- - L'interrupteur : internal.casino_ouvert, vrai. Pour fermer le casino (aucune partie ne commence plus), dans l'éditeur
--   SQL de Supabase :
--     update internal.casino_ouvert set ouvert = false, maj_le = now() where id;
--
-- Qui peut quoi :
-- - get_casino, lire_vingt_et_un : tout compte connecté et non suspendu lit son propre casino ; jamais celui d'un autre.
-- - jouer_roue, jouer_machine, jouer_course, jouer_palissade, jouer_des, distribuer_vingt_et_un, jouer_vingt_et_un : un
--   compte validé qui a créé son Gaulois (internal.village_acheteur), à la cadence de tout le site (internal.limit_exceeded).
--
-- Ce qui change : trois tables privées (internal.casino_ouvert, internal.casino_parties, internal.casino_mains), des
-- fonctions internes et neuf fonctions publiques, toutes nouvelles. Aucune fonction existante n'est remplacée, aucune donnée
-- existante n'est touchée. Rien de nouveau n'est à sauvegarder : l'argent est au journal des statères, déjà dans la
-- sauvegarde. Rejouée, elle se remplace par la même.

/* ---------- Les tables ---------- */

-- L'interrupteur, sur une seule ligne.
create table if not exists internal.casino_ouvert (
  id boolean primary key default true check (id),
  ouvert boolean not null default true,
  maj_le timestamptz not null default now()
);
insert into internal.casino_ouvert (id, ouvert) values (true, true) on conflict (id) do nothing;

-- Les parties, une ligne par coup (par main au vingt-et-un).
create table if not exists internal.casino_parties (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  jeu text not null check (jeu in ('roue', 'vingt-et-un', 'machine', 'course', 'palissade', 'des')),
  -- Un essai du mode GOD : rien n'a été pris ni rendu.
  god boolean not null,
  -- Tout ce qui a été misé, compléments du vingt-et-un compris (200 au plus au départ, 800 au plus en tout).
  mise integer not null check (mise > 0 and mise <= 800),
  -- Ce qui revient, mise comprise (100 fois 200 au plus, à la machine).
  rendu integer not null default 0 check (rendu >= 0 and rendu <= 20000),
  -- Les paris tels qu'ils ont été reçus, vérifiés.
  paris jsonb not null,
  -- Ce qui a été tiré et rendu, tel qu'il a été montré ; null tant que la main du vingt-et-un dure.
  resultat jsonb,
  fini boolean not null default false,
  cree_le timestamptz not null default now(),
  fini_le timestamptz,
  check (fini = (fini_le is not null))
);
create index if not exists casino_parties_finies on internal.casino_parties (user_id, id desc) where fini;

-- Les mains du vingt-et-un : tout l'état, carte cachée comprise, et les faits déjà montrés. Seules les fonctions ci-dessous
-- les lisent ; rien n'en sort sans passer par internal.casino_v21_table, qui cache la carte du tavernier.
create table if not exists internal.casino_mains (
  partie bigint primary key references internal.casino_parties (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  etat jsonb not null,
  faits jsonb not null,
  -- Les coups joués : l'écran rend le dernier qu'il a vu, un double clic ne joue jamais deux fois.
  tour integer not null default 0 check (tour >= 0),
  ouverte boolean not null default true,
  maj_le timestamptz not null default now()
);
create unique index if not exists casino_une_main_ouverte on internal.casino_mains (user_id) where ouverte;

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
do $$
declare
  v_t text;
begin
  foreach v_t in array array['casino_ouvert', 'casino_parties', 'casino_mains'] loop
    execute format('alter table internal.%I enable row level security', v_t);
    execute format('revoke all on table internal.%I from public, anon, authenticated', v_t);
  end loop;
end $$;

/* ---------- Les chiffres ---------- */

-- Les statères misés par jour et par compte, au plus.
create or replace function internal.casino_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 2000 $$;

-- La mise de départ d'un tour, au plus.
create or replace function internal.casino_mise_au_plus() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 200 $$;

-- Les jetons.
create or replace function internal.casino_jetons() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[10, 20, 50, 100, 200] $$;

-- Le casino est-il ouvert ?
create or replace function internal.casino_est_ouvert() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select o.ouvert from internal.casino_ouvert o where o.id), false)
$$;

-- Le compte est-il en essai du mode GOD ?
create or replace function internal.casino_en_essai(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from internal.village_god d where d.user_id = p_user)
$$;

-- Les statères misés aujourd'hui par un compte, le jour commençant à minuit à l'heure de Paris.
create or replace function internal.casino_mise_du_jour(p_user uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(-sum(m.montant), 0)::integer
  from internal.stateres_mouvements m
  where m.user_id = p_user
    and m.nature = 'casino_mise'
    and m.cree_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

/* ---------- Le hasard ---------- */

-- Un entier de 0 à p_n - 1, toutes les valeurs à chances égales : 48 bits du générateur sûr de Postgres (les 12 premiers
-- chiffres d'un gen_random_uuid, tous tirés au hasard), les valeurs au-delà du dernier multiple de p_n rejetées.
create or replace function internal.casino_entier(p_n integer) returns integer
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_borne bigint;
  v_x bigint;
begin
  if p_n is null or p_n < 1 or p_n > 1000000 then raise exception 'casino_entier : borne mal formée'; end if;
  v_borne := (281474976710656 / p_n) * p_n;
  loop
    v_x := ('x' || left(replace(gen_random_uuid()::text, '-', ''), 12))::bit(48)::bigint;
    exit when v_x < v_borne;
  end loop;
  return (v_x % p_n)::integer;
end $$;

-- p_n cartes tirées parmi 52, chacune remise (paquet sans fin) : un nombre de 0 à 51, rang n % 13, enseigne n / 13. Celles
-- qui ne servent pas sont oubliées sans avoir été ni gardées ni montrées.
create or replace function internal.casino_pioche(p_n integer) returns integer[]
language sql volatile set search_path = public, pg_temp as $$
  select array_agg(internal.casino_entier(52) order by i) from generate_series(1, p_n) i
$$;

/* ---------- Les mises ---------- */

-- Une mise de départ : un multiple de 10 plus grand que zéro (sinon pari_invalide), 200 au plus (sinon mise_trop_haute).
create or replace function internal.casino_mise(p_mise integer) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_mise is null or p_mise <= 0 or p_mise % 10 <> 0 then perform internal.fail('pari_invalide'); end if;
  if p_mise > internal.casino_mise_au_plus() then perform internal.fail('mise_trop_haute'); end if;
  return p_mise;
end $$;

-- La somme d'une table de paris : un objet JSON d'au moins un pari, chacun parmi p_connus, chaque montant un nombre entier
-- multiple de 10 plus grand que zéro (sinon pari_invalide) ; la somme au plus 200 (sinon mise_trop_haute). Un montant doit
-- s'écrire en chiffres seuls : « 10.0 » est refusé, sinon sa lecture en entier échouerait au paiement, après le tirage, et
-- n'annulerait que les coups gagnants. Ce qui est accepté ici se paie toujours.
create or replace function internal.casino_paris(p_paris jsonb, p_connus text[]) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_total numeric := 0;
  v_k text;
  v_v jsonb;
  v_n numeric;
begin
  if p_paris is null or jsonb_typeof(p_paris) <> 'object' or p_paris = '{}'::jsonb then perform internal.fail('pari_invalide'); end if;
  for v_k, v_v in select j.key, j.value from jsonb_each(p_paris) j loop
    if not (v_k = any (p_connus)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[1-9][0-9]*$' then perform internal.fail('pari_invalide'); end if;
    v_n := (v_v #>> '{}')::numeric;
    if v_n % 10 <> 0 then perform internal.fail('pari_invalide'); end if;
    v_total := v_total + v_n;
  end loop;
  if v_total > internal.casino_mise_au_plus() then perform internal.fail('mise_trop_haute'); end if;
  return v_total::integer;
end $$;

-- Le joueur : un compte validé avec son Gaulois, sous le verrou de son compte, ce qui lui revient déjà crédité.
create or replace function internal.casino_joueur() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
begin
  v_uid := internal.village_acheteur();
  perform internal.village_verrou(v_uid);
  perform internal.crediter_stateres(v_uid);
  return v_uid;
end $$;

-- Le joueur d'une nouvelle partie : refus casino_ferme si l'interrupteur est coupé.
create or replace function internal.casino_commencer() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
begin
  v_uid := internal.casino_joueur();
  if not internal.casino_est_ouvert() then perform internal.fail('casino_ferme'); end if;
  return v_uid;
end $$;

-- Prend p_montant statères pour la partie p_partie : refus casino_plafond si le compte du jour passerait 2 000, puis
-- solde_insuffisant si la bourse ne suffit pas. Rien pendant un essai du mode GOD.
create or replace function internal.casino_miser(p_user uuid, p_partie bigint, p_montant integer, p_god boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_god then return; end if;
  if internal.casino_mise_du_jour(p_user) + p_montant > internal.casino_plafond() then perform internal.fail('casino_plafond'); end if;
  perform internal.village_debiter(p_user, 'casino_mise', p_montant, 'casino/' || p_partie::text);
end $$;

-- Rend p_montant statères pour la partie p_partie, s'il y a quelque chose à rendre. Rien pendant un essai du mode GOD.
create or replace function internal.casino_rendre(p_user uuid, p_partie bigint, p_montant integer, p_god boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_god or p_montant <= 0 then return; end if;
  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, 'casino_gain', p_montant, 'casino/' || p_partie::text);
end $$;

-- Une partie commence : sa ligne, puis la mise prise (refus casino_plafond, solde_insuffisant).
create or replace function internal.casino_nouvelle_partie(p_user uuid, p_jeu text, p_god boolean, p_mise integer, p_paris jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_partie bigint;
begin
  insert into internal.casino_parties (user_id, jeu, god, mise, paris) values (p_user, p_jeu, p_god, p_mise, p_paris) returning id into v_partie;
  perform internal.casino_miser(p_user, v_partie, p_mise, p_god);
  return v_partie;
end $$;

-- Ce que rend tout coup : la partie, la mise, ce qui revient, le solde après, le compte du jour.
create or replace function internal.casino_coup(p_user uuid, p_partie bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'partie', p.id,
    'jeu', p.jeu,
    'mise', p.mise,
    'rendu', p.rendu,
    'god', p.god,
    'solde_apres', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_user), 0),
    'mise_du_jour', internal.casino_mise_du_jour(p_user),
    'reste_du_jour', greatest(0, internal.casino_plafond() - internal.casino_mise_du_jour(p_user))
  )
  from internal.casino_parties p
  where p.id = p_partie and p.user_id = p_user
$$;

-- Un coup à un seul tirage se finit : ce qui revient, rendu au journal, et la réponse, avec ce qui a été tiré.
create or replace function internal.casino_finir(p_user uuid, p_partie bigint, p_rendu integer, p_resultat jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_god boolean;
begin
  update internal.casino_parties p set rendu = p_rendu, resultat = p_resultat, fini = true, fini_le = now()
  where p.id = p_partie and p.user_id = p_user and not p.fini
  returning p.god into v_god;
  if not found then raise exception 'partie du casino introuvable'; end if;
  perform internal.casino_rendre(p_user, p_partie, p_rendu, v_god);
  return internal.casino_coup(p_user, p_partie) || (p_resultat - 'jeu');
end $$;

/* ---------- La roue du charron ---------- */

-- Les 18 numéros rouges ; les 18 autres sont bleus.
create or replace function internal.casino_roue_rouges() returns integer[]
language sql immutable set search_path = public, pg_temp as $$
  select array[3, 4, 5, 9, 10, 12, 13, 14, 18, 20, 22, 24, 25, 26, 29, 31, 33, 35]
$$;

-- Les 48 paris de la table.
create or replace function internal.casino_roue_paris() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array(select 'n' || n from generate_series(1, 36) n)
    || array['rouge', 'bleu', 'pair', 'impair', 'bas', 'haut', 't1', 't2', 't3', 'c1', 'c2', 'c3']
$$;

-- Ce que rend un pari gagnant, mise comprise, en fois la mise.
create or replace function internal.casino_roue_fois(p_pari text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_pari ~ '^n[0-9]+$' then 36
    when p_pari in ('rouge', 'bleu', 'pair', 'impair', 'bas', 'haut') then 2
    when p_pari in ('t1', 't2', 't3', 'c1', 'c2', 'c3') then 3
    else 0
  end
$$;

-- Le numéro p_n fait-il gagner le pari ?
create or replace function internal.casino_roue_gagne(p_pari text, p_n integer) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_pari ~ '^n([1-9]|[12][0-9]|3[0-6])$' then substr(p_pari, 2)::integer = p_n
    when p_pari = 'rouge' then p_n = any (internal.casino_roue_rouges())
    when p_pari = 'bleu' then not (p_n = any (internal.casino_roue_rouges()))
    when p_pari = 'pair' then p_n % 2 = 0
    when p_pari = 'impair' then p_n % 2 = 1
    when p_pari = 'bas' then p_n <= 18
    when p_pari = 'haut' then p_n >= 19
    when p_pari = 't1' then p_n <= 12
    when p_pari = 't2' then p_n between 13 and 24
    when p_pari = 't3' then p_n >= 25
    when p_pari = 'c1' then p_n % 3 = 1
    when p_pari = 'c2' then p_n % 3 = 2
    when p_pari = 'c3' then p_n % 3 = 0
    else false
  end
$$;

-- Ce que rend chaque pari pour le numéro sorti, mise comprise : { total, par_pari }.
create or replace function internal.casino_roue_rendu(p_paris jsonb, p_n integer) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('total', coalesce(sum(t.g), 0), 'par_pari', coalesce(jsonb_object_agg(t.k, t.g), '{}'::jsonb))
  from (
    select j.key as k, case when internal.casino_roue_gagne(j.key, p_n) then (j.value #>> '{}')::numeric::integer * internal.casino_roue_fois(j.key) else 0 end as g
    from jsonb_each(p_paris) j
  ) t
$$;

-- Un tour de roue : { ok, partie, jeu, mise, rendu, god, solde_apres, mise_du_jour, reste_du_jour, numero, par_pari }.
create or replace function public.jouer_roue(p_paris jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_n integer;
  v_r jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_paris(p_paris, internal.casino_roue_paris());
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'roue', v_god, v_mise, p_paris);
    v_n := 1 + internal.casino_entier(36);
    v_r := internal.casino_roue_rendu(p_paris, v_n);
    return internal.casino_finir(v_uid, v_partie, (v_r ->> 'total')::integer, jsonb_build_object('jeu', 'roue', 'numero', v_n, 'par_pari', v_r -> 'par_pari'));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La machine du forgeron ---------- */

-- Le résultat pour un nombre tiré de 0 à 999 : 0 statère d'or (2 sur 1 000), 1 torque d'or (10), 2 enseigne au sanglier
-- (40), 3 amphore (100), 4 gui (200), -1 rien (648).
create or replace function internal.casino_machine_resultat(p_r integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_r < 2 then 0 when p_r < 12 then 1 when p_r < 52 then 2 when p_r < 152 then 3 when p_r < 352 then 4 else -1 end
$$;

-- Ce que rend chaque résultat payant, en fois la mise (de 0 à 4).
create or replace function internal.casino_machine_fois() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[100, 20, 5, 2, 1] $$;

-- Les neuf cases, par rouleau puis de haut en bas : au hasard parmi toutes celles qui donnent ce résultat, sans rien
-- arranger. La ligne du milieu : trois fois le même symbole de 0 à 3, ou le gui au premier rouleau sans trois gui, ou
-- rien de cela.
create or replace function internal.casino_machine_cases(p_resultat integer) returns jsonb
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  m integer[];
begin
  if p_resultat between 0 and 3 then
    m := array[p_resultat, p_resultat, p_resultat];
  elsif p_resultat = 4 then
    loop
      m := array[4, internal.casino_entier(5), internal.casino_entier(5)];
      exit when not (m[2] = 4 and m[3] = 4);
    end loop;
  else
    loop
      m := array[internal.casino_entier(4), internal.casino_entier(5), internal.casino_entier(5)];
      exit when not (m[1] = m[2] and m[2] = m[3]);
    end loop;
  end if;
  return jsonb_build_array(
    jsonb_build_array(internal.casino_entier(5), m[1], internal.casino_entier(5)),
    jsonb_build_array(internal.casino_entier(5), m[2], internal.casino_entier(5)),
    jsonb_build_array(internal.casino_entier(5), m[3], internal.casino_entier(5))
  );
end $$;

-- Un tirage : { ok, partie, jeu, mise, rendu, god, solde_apres, mise_du_jour, reste_du_jour, resultat, cases }.
create or replace function public.jouer_machine(p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_res integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_mise(p_mise);
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'machine', v_god, v_mise, jsonb_build_object('mise', v_mise));
    v_res := internal.casino_machine_resultat(internal.casino_entier(1000));
    return internal.casino_finir(v_uid, v_partie,
      case when v_res < 0 then 0 else v_mise * (internal.casino_machine_fois())[v_res + 1] end,
      jsonb_build_object('jeu', 'machine', 'resultat', v_res, 'cases', internal.casino_machine_cases(v_res)));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La course des familiers ---------- */

-- Le couloir gagnant pour un nombre tiré de 0 à 23 : 8, 6, 4, 3, 2 et 1 chances sur 24, du couloir 0 au couloir 5.
create or replace function internal.casino_course_couloir(p_n integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_n < 8 then 0 when p_n < 14 then 1 when p_n < 18 then 2 when p_n < 21 then 3 when p_n < 23 then 4 else 5 end
$$;

-- Ce que rend chaque couloir gagnant, en fois la mise (de 0 à 5).
create or replace function internal.casino_course_fois() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[3, 4, 6, 8, 12, 24] $$;

-- Une course : { ok, partie, jeu, mise, rendu, god, solde_apres, mise_du_jour, reste_du_jour, couloir, gagnant }.
create or replace function public.jouer_course(p_couloir integer, p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_gagnant integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    if p_couloir is null or p_couloir < 0 or p_couloir > 5 then perform internal.fail('pari_invalide'); end if;
    v_mise := internal.casino_mise(p_mise);
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'course', v_god, v_mise, jsonb_build_object('couloir', p_couloir, 'mise', v_mise));
    v_gagnant := internal.casino_course_couloir(internal.casino_entier(24));
    return internal.casino_finir(v_uid, v_partie,
      case when v_gagnant = p_couloir then v_mise * (internal.casino_course_fois())[v_gagnant + 1] else 0 end,
      jsonb_build_object('jeu', 'course', 'couloir', p_couloir, 'gagnant', v_gagnant));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La palissade ---------- */

-- Ce que rend chaque coupe, de gauche à droite, en dixièmes de la mise (19, 4, 1,5, 0,5, 0,2, 0,5, 1,5, 4, 19 fois).
create or replace function internal.casino_palissade_dixiemes() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[190, 40, 15, 5, 2, 5, 15, 40, 190] $$;

-- Un lâcher : { ok, partie, jeu, mise, rendu, god, solde_apres, mise_du_jour, reste_du_jour, chemin, coupe }. Le chemin :
-- huit choix, 0 à gauche, 1 à droite, une chance sur deux chacun ; la coupe : le nombre de pas à droite.
create or replace function public.jouer_palissade(p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_chemin integer[];
  v_coupe integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_mise(p_mise);
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'palissade', v_god, v_mise, jsonb_build_object('mise', v_mise));
    select array_agg(internal.casino_entier(2) order by i) into v_chemin from generate_series(1, 8) i;
    v_coupe := (select sum(c) from unnest(v_chemin) c)::integer;
    return internal.casino_finir(v_uid, v_partie,
      v_mise * (internal.casino_palissade_dixiemes())[v_coupe + 1] / 10,
      jsonb_build_object('jeu', 'palissade', 'chemin', to_jsonb(v_chemin), 'coupe', v_coupe));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les dés ---------- */

-- Les quatorze paris.
create or replace function internal.casino_des_paris() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['moins', 'double', 'plus', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12']
$$;

-- Ce que rend un pari gagnant, mise comprise, en dixièmes de la mise.
create or replace function internal.casino_des_dixiemes(p_pari text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_pari
    when 'moins' then 24 when 'double' then 60 when 'plus' then 24
    when 's2' then 360 when 's3' then 180 when 's4' then 120 when 's5' then 90 when 's6' then 72 when 's7' then 60
    when 's8' then 72 when 's9' then 90 when 's10' then 120 when 's11' then 180 when 's12' then 360
    else 0
  end
$$;

-- Les faces p_a et p_b font-elles gagner le pari ?
create or replace function internal.casino_des_gagne(p_pari text, p_a integer, p_b integer) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_pari = 'moins' then p_a + p_b < 7
    when p_pari = 'double' then p_a = p_b
    when p_pari = 'plus' then p_a + p_b > 7
    when p_pari ~ '^s([2-9]|1[0-2])$' then p_a + p_b = substr(p_pari, 2)::integer
    else false
  end
$$;

-- Ce que rend chaque pari pour les deux faces, mise comprise : { total, par_pari }.
create or replace function internal.casino_des_rendu(p_paris jsonb, p_a integer, p_b integer) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('total', coalesce(sum(t.g), 0), 'par_pari', coalesce(jsonb_object_agg(t.k, t.g), '{}'::jsonb))
  from (
    select j.key as k, case when internal.casino_des_gagne(j.key, p_a, p_b) then (j.value #>> '{}')::numeric::integer * internal.casino_des_dixiemes(j.key) / 10 else 0 end as g
    from jsonb_each(p_paris) j
  ) t
$$;

-- Un lancer : { ok, partie, jeu, mise, rendu, god, solde_apres, mise_du_jour, reste_du_jour, faces, par_pari }.
create or replace function public.jouer_des(p_paris jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_a integer;
  v_b integer;
  v_r jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_paris(p_paris, internal.casino_des_paris());
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'des', v_god, v_mise, p_paris);
    v_a := 1 + internal.casino_entier(6);
    v_b := 1 + internal.casino_entier(6);
    v_r := internal.casino_des_rendu(p_paris, v_a, v_b);
    return internal.casino_finir(v_uid, v_partie, (v_r ->> 'total')::integer, jsonb_build_object('jeu', 'des', 'faces', jsonb_build_array(v_a, v_b), 'par_pari', v_r -> 'par_pari'));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le vingt-et-un : la machine, comme src/lib/village/casino/vingt-et-un.ts ---------- */

-- La valeur d'une carte : l'as 1, du 2 au 10 leur nombre, les figures 10.
create or replace function internal.casino_v21_valeur(p_c integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_c % 13 = 0 then 1 when p_c % 13 >= 9 then 10 else p_c % 13 + 1 end
$$;

-- Le total d'une main (un tableau JSON de cartes) : le meilleur, un as comptant 11 s'il ne fait pas passer 21.
create or replace function internal.casino_v21_total(p_cartes jsonb) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when t.avec_as and t.dur + 10 <= 21 then t.dur + 10 else t.dur end
  from (
    select coalesce(sum(internal.casino_v21_valeur(x::integer)), 0)::integer as dur, coalesce(bool_or(x::integer % 13 = 0), false) as avec_as
    from jsonb_array_elements_text(p_cartes) x
  ) t
$$;

-- La carte p_i de la pioche ; une pioche trop courte est une erreur.
create or replace function internal.casino_v21_carte_de(p_pioche integer[], p_i integer) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_pioche[p_i] is null or p_pioche[p_i] < 0 or p_pioche[p_i] > 51 then raise exception 'pioche du vingt-et-un trop courte'; end if;
  return p_pioche[p_i];
end $$;

-- La main p_k reçoit la carte p_c.
create or replace function internal.casino_v21_donne(p_e jsonb, p_k integer, p_c integer) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_set(p_e, array['mains', p_k::text, 'cartes'], (p_e #> array['mains', p_k::text, 'cartes']) || to_jsonb(p_c))
$$;

-- Une main neuve du joueur.
create or replace function internal.casino_v21_main(p_cartes jsonb, p_mise integer) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('cartes', p_cartes, 'mise', p_mise, 'doublee', false, 'finie', false, 'issue', null, 'recu', 0)
$$;

-- Les coups que les règles permettent sur la main en cours : { tirer, rester, doubler, separer }.
create or replace function internal.casino_v21_permis(p_e jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_i integer := (p_e ->> 'courante')::integer;
  v_m jsonb := p_e -> 'mains' -> v_i;
  v_deux boolean;
begin
  if p_e ->> 'phase' <> 'joueur' or v_m is null or (v_m ->> 'finie')::boolean then
    return jsonb_build_object('tirer', false, 'rester', false, 'doubler', false, 'separer', false);
  end if;
  v_deux := jsonb_array_length(v_m -> 'cartes') = 2;
  return jsonb_build_object('tirer', true, 'rester', true, 'doubler', v_deux,
    'separer', v_deux and not (p_e ->> 'separee')::boolean
      and internal.casino_v21_valeur((v_m #>> '{cartes,0}')::integer) = internal.casino_v21_valeur((v_m #>> '{cartes,1}')::integer));
end $$;

-- Une main commence, avec les quatre premières cartes de p_pioche : { etat, faits, prises }. Les faits gardent la carte
-- cachée : ils ne sortent que par internal.casino_v21_table.
create or replace function internal.casino_v21_distribuer(p_mise integer, p_pioche integer[]) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_j1 integer := internal.casino_v21_carte_de(p_pioche, 1);
  v_t1 integer := internal.casino_v21_carte_de(p_pioche, 2);
  v_j2 integer := internal.casino_v21_carte_de(p_pioche, 3);
  v_t2 integer := internal.casino_v21_carte_de(p_pioche, 4);
  v_main jsonb;
  v_faits jsonb;
  v_phase text := 'joueur';
  v_tbj boolean;
  v_jbj boolean;
  v_issue text;
  v_recu integer;
begin
  v_faits := jsonb_build_array(
    jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', 0, 'carte', v_j1),
    jsonb_build_object('t', 'carte', 'a', 'tavernier', 'carte', v_t1),
    jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', 0, 'carte', v_j2),
    jsonb_build_object('t', 'carte', 'a', 'tavernier', 'carte', v_t2, 'cachee', true)
  );
  v_main := internal.casino_v21_main(jsonb_build_array(v_j1, v_j2), p_mise);
  v_tbj := internal.casino_v21_total(jsonb_build_array(v_t1, v_t2)) = 21;
  v_jbj := internal.casino_v21_total(jsonb_build_array(v_j1, v_j2)) = 21;
  if internal.casino_v21_valeur(v_t1) in (1, 10) then v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'regarde')); end if;
  if v_tbj then
    -- la main s'arrête aussitôt : on ne perd que sa mise
    v_issue := case when v_jbj then 'egal' else 'perdu' end;
    v_recu := case when v_jbj then p_mise else 0 end;
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'retourne', 'carte', v_t2),
      jsonb_build_object('t', 'bilan', 'main', 0, 'issue', v_issue, 'recu', v_recu, 'entree', true));
    v_main := v_main || jsonb_build_object('finie', true, 'issue', v_issue, 'recu', v_recu);
    v_phase := 'fini';
  elsif v_jbj then
    -- payé 3 pour 2
    v_recu := p_mise * 5 / 2;
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'retourne', 'carte', v_t2),
      jsonb_build_object('t', 'bilan', 'main', 0, 'issue', 'vingt-et-un', 'recu', v_recu));
    v_main := v_main || jsonb_build_object('finie', true, 'issue', 'vingt-et-un', 'recu', v_recu);
    v_phase := 'fini';
  end if;
  return jsonb_build_object(
    'etat', jsonb_build_object('mise', p_mise, 'tavernier', jsonb_build_array(v_t1, v_t2), 'mains', jsonb_build_array(v_main),
      'separee', false, 'courante', 0, 'phase', v_phase),
    'faits', v_faits,
    'prises', 4
  );
end $$;

-- Le joueur joue un coup sur l'état p_etat ; la machine tire de p_pioche, dans l'ordre, tout ce qui suit (jusqu'au jeu du
-- tavernier s'il le faut) : { etat, faits (les nouveaux), prises }. Un coup non permis : refus coup_refuse.
create or replace function internal.casino_v21_jouer(p_etat jsonb, p_coup text, p_pioche integer[]) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  e jsonb := p_etat;
  v_faits jsonb := '[]'::jsonb;
  v_pris integer := 0;
  v_permis jsonb := internal.casino_v21_permis(p_etat);
  v_i integer := (p_etat ->> 'courante')::integer;
  v_n integer;
  v_c integer;
  v_t integer;
  v_a integer;
  v_b integer;
  v_mise integer;
  v_k integer;
  v_tt integer;
  v_tj integer;
  v_issue text;
  v_recu integer;
begin
  if p_coup is null or not coalesce((v_permis ->> p_coup)::boolean, false) then perform internal.fail('coup_refuse'); end if;

  if p_coup = 'rester' then
    e := jsonb_set(e, array['mains', v_i::text, 'finie'], 'true'::jsonb);
  elsif p_coup = 'tirer' then
    v_pris := v_pris + 1;
    v_c := internal.casino_v21_carte_de(p_pioche, v_pris);
    e := internal.casino_v21_donne(e, v_i, v_c);
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', v_i, 'carte', v_c));
    v_t := internal.casino_v21_total(e #> array['mains', v_i::text, 'cartes']);
    if v_t > 21 then
      e := jsonb_set(jsonb_set(e, array['mains', v_i::text, 'finie'], 'true'::jsonb), array['mains', v_i::text, 'issue'], '"perdu"'::jsonb);
      v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'bilan', 'main', v_i, 'issue', 'perdu', 'recu', 0, 'saute', true));
    elsif v_t = 21 then
      e := jsonb_set(e, array['mains', v_i::text, 'finie'], 'true'::jsonb);
    end if;
  elsif p_coup = 'doubler' then
    v_mise := (e #>> array['mains', v_i::text, 'mise'])::integer;
    e := jsonb_set(jsonb_set(e, array['mains', v_i::text, 'mise'], to_jsonb(v_mise * 2)), array['mains', v_i::text, 'doublee'], 'true'::jsonb);
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'double', 'main', v_i));
    v_pris := v_pris + 1;
    v_c := internal.casino_v21_carte_de(p_pioche, v_pris);
    e := internal.casino_v21_donne(e, v_i, v_c);
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', v_i, 'carte', v_c));
    v_t := internal.casino_v21_total(e #> array['mains', v_i::text, 'cartes']);
    e := jsonb_set(e, array['mains', v_i::text, 'finie'], 'true'::jsonb);
    if v_t > 21 then
      e := jsonb_set(e, array['mains', v_i::text, 'issue'], '"perdu"'::jsonb);
      v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'bilan', 'main', v_i, 'issue', 'perdu', 'recu', 0, 'saute', true));
    end if;
  elsif p_coup = 'separer' then
    v_a := (e #>> array['mains', v_i::text, 'cartes', '0'])::integer;
    v_b := (e #>> array['mains', v_i::text, 'cartes', '1'])::integer;
    v_mise := (e #>> array['mains', v_i::text, 'mise'])::integer;
    e := e || jsonb_build_object('separee', true,
      'mains', jsonb_build_array(internal.casino_v21_main(jsonb_build_array(v_a), v_mise), internal.casino_v21_main(jsonb_build_array(v_b), v_mise)));
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'separe'));
    -- des as séparés : une seule carte chacun
    for v_k in 0 .. (case when v_a % 13 = 0 then 1 else 0 end) loop
      v_pris := v_pris + 1;
      v_c := internal.casino_v21_carte_de(p_pioche, v_pris);
      e := internal.casino_v21_donne(e, v_k, v_c);
      v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', v_k, 'carte', v_c));
    end loop;
    if v_a % 13 = 0 then
      e := jsonb_set(jsonb_set(e, '{mains,0,finie}', 'true'::jsonb), '{mains,1,finie}', 'true'::jsonb);
    elsif internal.casino_v21_total(e #> '{mains,0,cartes}') = 21 then
      e := jsonb_set(e, '{mains,0,finie}', 'true'::jsonb);
    end if;
  end if;

  -- la main suivante
  loop
    v_n := jsonb_array_length(e -> 'mains');
    v_i := (e ->> 'courante')::integer;
    exit when v_i >= v_n or not (e #>> array['mains', v_i::text, 'finie'])::boolean;
    v_i := v_i + 1;
    e := jsonb_set(e, '{courante}', to_jsonb(v_i));
    if v_i < v_n and not (e #>> array['mains', v_i::text, 'finie'])::boolean then
      v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'main', 'main', v_i));
      if jsonb_array_length(e #> array['mains', v_i::text, 'cartes']) = 1 then
        v_pris := v_pris + 1;
        v_c := internal.casino_v21_carte_de(p_pioche, v_pris);
        e := internal.casino_v21_donne(e, v_i, v_c);
        v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', v_i, 'carte', v_c));
        if internal.casino_v21_total(e #> array['mains', v_i::text, 'cartes']) = 21 then
          e := jsonb_set(e, array['mains', v_i::text, 'finie'], 'true'::jsonb);
        end if;
      end if;
    end if;
  end loop;

  -- puis le tavernier
  if (e ->> 'courante')::integer >= jsonb_array_length(e -> 'mains') then
    e := jsonb_set(e, '{phase}', '"fini"'::jsonb);
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'retourne', 'carte', (e #>> '{tavernier,1}')::integer));
    if exists (select 1 from jsonb_array_elements(e -> 'mains') m where m -> 'issue' = 'null'::jsonb) then
      -- il tire jusqu'à 16 et s'arrête dès 17, même avec un as compté 11
      while internal.casino_v21_total(e -> 'tavernier') < 17 loop
        v_pris := v_pris + 1;
        v_c := internal.casino_v21_carte_de(p_pioche, v_pris);
        e := jsonb_set(e, '{tavernier}', (e -> 'tavernier') || to_jsonb(v_c));
        v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'carte', 'a', 'tavernier', 'carte', v_c));
      end loop;
      v_tt := internal.casino_v21_total(e -> 'tavernier');
      for v_k in 0 .. jsonb_array_length(e -> 'mains') - 1 loop
        continue when e #> array['mains', v_k::text, 'issue'] <> 'null'::jsonb;
        v_tj := internal.casino_v21_total(e #> array['mains', v_k::text, 'cartes']);
        v_issue := case when v_tt > 21 or v_tj > v_tt then 'gagne' when v_tj = v_tt then 'egal' else 'perdu' end;
        v_mise := (e #>> array['mains', v_k::text, 'mise'])::integer;
        v_recu := case v_issue when 'gagne' then 2 * v_mise when 'egal' then v_mise else 0 end;
        e := jsonb_set(jsonb_set(e, array['mains', v_k::text, 'issue'], to_jsonb(v_issue)), array['mains', v_k::text, 'recu'], to_jsonb(v_recu));
        v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'bilan', 'main', v_k, 'issue', v_issue, 'recu', v_recu));
      end loop;
    end if;
  end if;

  return jsonb_build_object('etat', e, 'faits', v_faits, 'prises', v_pris);
end $$;

-- Une carte telle que l'écran la lit : { r, e }, le rang et l'enseigne.
create or replace function internal.casino_v21_carte(p_c integer) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('r', p_c % 13, 'e', p_c / 13)
$$;

-- Des faits tels que l'écran peut les voir : chaque carte en { r, e } ; la carte cachée du tavernier à null tant que la
-- main n'est pas finie (« retourne » n'arrive qu'avec la fin).
create or replace function internal.casino_v21_faits_montres(p_faits jsonb, p_fini boolean) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
    case
      when f.v -> 'carte' is null then f.v
      when f.v ->> 't' = 'carte' and f.v ->> 'a' = 'tavernier' and (f.v ->> 'cachee')::boolean is true and not p_fini then f.v || jsonb_build_object('carte', null)
      else f.v || jsonb_build_object('carte', internal.casino_v21_carte((f.v ->> 'carte')::integer))
    end order by f.n), '[]'::jsonb)
  from jsonb_array_elements(p_faits) with ordinality f (v, n)
$$;

-- La main p_partie telle que l'écran la voit (TableDuVingtEtUn du contrat), avec les faits p_faits (nombres, pas encore
-- montrés) : jamais la carte cachée avant la fin, jamais une carte à venir.
create or replace function internal.casino_v21_table(p_partie bigint, p_faits jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_m internal.casino_mains;
  v_p internal.casino_parties;
  v_e jsonb;
  v_fini boolean;
  v_permis jsonb;
begin
  select * into v_m from internal.casino_mains m where m.partie = p_partie;
  select * into v_p from internal.casino_parties p where p.id = p_partie;
  if v_m.partie is null or v_p.id is null then return null; end if;
  v_e := v_m.etat;
  v_fini := v_e ->> 'phase' = 'fini';
  v_permis := internal.casino_v21_permis(v_e);
  return jsonb_build_object(
    'partie', v_p.id,
    'god', v_p.god,
    'mise', (v_e ->> 'mise')::integer,
    'misee', (select coalesce(sum((x ->> 'mise')::integer), 0) from jsonb_array_elements(v_e -> 'mains') x),
    'tavernier', (select coalesce(jsonb_agg(internal.casino_v21_carte(c::integer) order by n), '[]'::jsonb)
                  from jsonb_array_elements_text(v_e -> 'tavernier') with ordinality t (c, n) where v_fini or n = 1),
    'cachee', not v_fini,
    'mains', (select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'cartes', (select coalesce(jsonb_agg(internal.casino_v21_carte(c::integer) order by k), '[]'::jsonb) from jsonb_array_elements_text(x -> 'cartes') with ordinality y (c, k)),
                   'mise', (x ->> 'mise')::integer,
                   'doublee', (x ->> 'doublee')::boolean,
                   'finie', (x ->> 'finie')::boolean,
                   'issue', x -> 'issue',
                   'recu', (x ->> 'recu')::integer
                 ) order by n), '[]'::jsonb)
              from jsonb_array_elements(v_e -> 'mains') with ordinality h (x, n)),
    'courante', (v_e ->> 'courante')::integer,
    'separee', (v_e ->> 'separee')::boolean,
    'phase', v_e ->> 'phase',
    'tour', v_m.tour,
    'permis', v_permis,
    'complement', case when (v_permis ->> 'doubler')::boolean or (v_permis ->> 'separer')::boolean
                    then (v_e #>> array['mains', v_e ->> 'courante', 'mise'])::integer else 0 end,
    'rendu', case when v_fini then (select coalesce(sum((x ->> 'recu')::integer), 0) from jsonb_array_elements(v_e -> 'mains') x) else 0 end,
    'faits', internal.casino_v21_faits_montres(p_faits, v_fini),
    'commence_le', v_p.cree_le
  );
end $$;

-- Une main finie se ferme : la partie note ce qui a été misé et rendu, et ce qui revient va au journal. Rien si elle dure.
create or replace function internal.casino_v21_conclure(p_partie bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m internal.casino_mains;
  v_rendu integer;
  v_misee integer;
  v_god boolean;
begin
  select * into v_m from internal.casino_mains m where m.partie = p_partie and m.ouverte;
  if not found or v_m.etat ->> 'phase' <> 'fini' then return; end if;
  select coalesce(sum((x ->> 'recu')::integer), 0), coalesce(sum((x ->> 'mise')::integer), 0) into v_rendu, v_misee
  from jsonb_array_elements(v_m.etat -> 'mains') x;
  update internal.casino_mains m set ouverte = false, maj_le = now() where m.partie = p_partie;
  update internal.casino_parties p
  set mise = v_misee, rendu = v_rendu, fini = true, fini_le = now(),
      resultat = jsonb_build_object('jeu', 'vingt-et-un', 'issues', (select jsonb_agg(x -> 'issue' order by n) from jsonb_array_elements(v_m.etat -> 'mains') with ordinality h (x, n)))
  where p.id = p_partie
  returning p.god into v_god;
  perform internal.casino_rendre(v_m.user_id, p_partie, v_rendu, v_god);
end $$;

-- La réponse d'un coup du vingt-et-un : la main avec ses faits nouveaux, le solde après et le compte du jour.
create or replace function internal.casino_v21_reponse(p_user uuid, p_partie bigint, p_faits jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'table', internal.casino_v21_table(p_partie, p_faits),
    'solde_apres', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_user), 0),
    'mise_du_jour', internal.casino_mise_du_jour(p_user),
    'reste_du_jour', greatest(0, internal.casino_plafond() - internal.casino_mise_du_jour(p_user))
  )
$$;

/* ---------- Le vingt-et-un : les appels ---------- */

-- Une main commence avec la mise p_mise : ReponseDuVingtEtUn. Refus, dans l'ordre : ceux de tout coup, pari_invalide,
-- mise_trop_haute, main_en_cours, casino_plafond, solde_insuffisant. Une main finie à la donne arrive finie.
create or replace function public.distribuer_vingt_et_un(p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_r jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_mise(p_mise);
    if exists (select 1 from internal.casino_mains m where m.user_id = v_uid and m.ouverte) then perform internal.fail('main_en_cours'); end if;
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'vingt-et-un', v_god, v_mise, jsonb_build_object('mise', v_mise));
    v_r := internal.casino_v21_distribuer(v_mise, internal.casino_pioche(4));
    insert into internal.casino_mains (partie, user_id, etat, faits) values (v_partie, v_uid, v_r -> 'etat', v_r -> 'faits');
    perform internal.casino_v21_conclure(v_partie);
    return internal.casino_v21_reponse(v_uid, v_partie, v_r -> 'faits');
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Un coup sur la main ouverte p_partie, vue au tour p_tour : ReponseDuVingtEtUn, avec les faits nouveaux. Doubler et
-- séparer prennent la mise de la main en cours. Refus, dans l'ordre : rate_limited, ceux du compte, pas_de_main,
-- main_changee, coup_refuse, mode_god, casino_plafond, solde_insuffisant. Le casino fermé n'empêche pas de finir une main.
create or replace function public.jouer_vingt_et_un(p_partie bigint, p_tour integer, p_coup text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_m internal.casino_mains;
  v_god boolean;
  v_complement integer;
  v_r jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_joueur();
    select * into v_m from internal.casino_mains m where m.partie = p_partie and m.user_id = v_uid and m.ouverte for update;
    if not found then perform internal.fail('pas_de_main'); end if;
    if p_tour is distinct from v_m.tour then perform internal.fail('main_changee'); end if;
    if p_coup is null or not coalesce((internal.casino_v21_permis(v_m.etat) ->> p_coup)::boolean, false) then perform internal.fail('coup_refuse'); end if;
    select p.god into v_god from internal.casino_parties p where p.id = p_partie;
    -- Une vraie main attend la fin d'un essai : son gain, pendant l'essai, deviendrait une ligne d'essai annulée.
    if not v_god and internal.casino_en_essai(v_uid) then perform internal.fail('mode_god'); end if;
    if p_coup in ('doubler', 'separer') then
      v_complement := (v_m.etat #>> array['mains', v_m.etat ->> 'courante', 'mise'])::integer;
      perform internal.casino_miser(v_uid, p_partie, v_complement, v_god);
      update internal.casino_parties p set mise = p.mise + v_complement where p.id = p_partie;
    end if;
    v_r := internal.casino_v21_jouer(v_m.etat, p_coup, internal.casino_pioche(24));
    update internal.casino_mains m set etat = v_r -> 'etat', faits = m.faits || (v_r -> 'faits'), tour = m.tour + 1, maj_le = now()
    where m.partie = p_partie;
    perform internal.casino_v21_conclure(p_partie);
    return internal.casino_v21_reponse(v_uid, p_partie, v_r -> 'faits');
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Le compte qui lit son casino : connecté et non suspendu. Sinon une erreur, comme ailleurs.
create or replace function internal.casino_lecteur() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select p.status into v_status from public.profiles p where p.user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  return v_uid;
end $$;

-- La main du vingt-et-un laissée ouverte, avec tous ses faits depuis la donne : LectureDuVingtEtUn ({ ok, table }, table
-- null s'il n'y en a pas).
create or replace function public.lire_vingt_et_un() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.casino_lecteur();
    return jsonb_build_object('ok', true, 'table',
      (select internal.casino_v21_table(m.partie, m.faits) from internal.casino_mains m where m.user_id = v_uid and m.ouverte));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- L'écran entier ---------- */

-- Tout l'écran du casino du compte connecté : EtatDuCasino. Crédite d'abord ce qui lui revient déjà, comme
-- get_pochette_stateres. Jamais rien d'un autre compte.
create or replace function public.get_casino() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_peut boolean;
  v_mise_du_jour integer;
  v_detail text;
begin
  begin
    v_uid := internal.casino_lecteur();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  v_peut := exists (select 1 from public.profiles p where p.user_id = v_uid and p.status = 'validated')
    and exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_peut then perform internal.crediter_stateres(v_uid); end if;
  v_mise_du_jour := internal.casino_mise_du_jour(v_uid);
  return jsonb_build_object(
    'ok', true,
    'ouvert', internal.casino_est_ouvert(),
    'peut_jouer', v_peut,
    'god', internal.casino_en_essai(v_uid),
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'jour', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'plafond', internal.casino_plafond(),
    'mise_au_plus', internal.casino_mise_au_plus(),
    'jetons', to_jsonb(internal.casino_jetons()),
    'mise_du_jour', v_mise_du_jour,
    'reste_du_jour', greatest(0, internal.casino_plafond() - v_mise_du_jour),
    'parties', (select coalesce(jsonb_agg(jsonb_build_object(
                   'partie', p.id, 'jeu', p.jeu, 'mise', p.mise, 'rendu', p.rendu, 'god', p.god, 'le', p.fini_le,
                   'resume', p.resultat - 'par_pari' - 'cases' - 'chemin') order by p.id desc), '[]'::jsonb)
                from (select * from internal.casino_parties q where q.user_id = v_uid and q.fini order by q.id desc limit 10) p),
    'main', (select internal.casino_v21_table(m.partie, m.faits) from internal.casino_mains m where m.user_id = v_uid and m.ouverte)
  );
end $$;

/* ---------- Les droits ---------- */

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.casino_plafond()', 'internal.casino_mise_au_plus()', 'internal.casino_jetons()', 'internal.casino_est_ouvert()',
    'internal.casino_en_essai(uuid)', 'internal.casino_mise_du_jour(uuid)', 'internal.casino_entier(integer)',
    'internal.casino_pioche(integer)', 'internal.casino_mise(integer)', 'internal.casino_paris(jsonb, text[])',
    'internal.casino_joueur()', 'internal.casino_commencer()', 'internal.casino_miser(uuid, bigint, integer, boolean)',
    'internal.casino_rendre(uuid, bigint, integer, boolean)', 'internal.casino_nouvelle_partie(uuid, text, boolean, integer, jsonb)',
    'internal.casino_coup(uuid, bigint)', 'internal.casino_finir(uuid, bigint, integer, jsonb)',
    'internal.casino_roue_rouges()', 'internal.casino_roue_paris()', 'internal.casino_roue_fois(text)',
    'internal.casino_roue_gagne(text, integer)', 'internal.casino_roue_rendu(jsonb, integer)',
    'internal.casino_machine_resultat(integer)', 'internal.casino_machine_fois()', 'internal.casino_machine_cases(integer)',
    'internal.casino_course_couloir(integer)', 'internal.casino_course_fois()', 'internal.casino_palissade_dixiemes()',
    'internal.casino_des_paris()', 'internal.casino_des_dixiemes(text)', 'internal.casino_des_gagne(text, integer, integer)',
    'internal.casino_des_rendu(jsonb, integer, integer)', 'internal.casino_v21_valeur(integer)', 'internal.casino_v21_total(jsonb)',
    'internal.casino_v21_carte_de(integer[], integer)', 'internal.casino_v21_donne(jsonb, integer, integer)',
    'internal.casino_v21_main(jsonb, integer)', 'internal.casino_v21_permis(jsonb)', 'internal.casino_v21_distribuer(integer, integer[])',
    'internal.casino_v21_jouer(jsonb, text, integer[])', 'internal.casino_v21_carte(integer)',
    'internal.casino_v21_faits_montres(jsonb, boolean)', 'internal.casino_v21_table(bigint, jsonb)', 'internal.casino_v21_conclure(bigint)',
    'internal.casino_v21_reponse(uuid, bigint, jsonb)', 'internal.casino_lecteur()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
  foreach v_f in array array[
    'public.get_casino()', 'public.lire_vingt_et_un()', 'public.jouer_roue(jsonb)', 'public.jouer_machine(integer)',
    'public.jouer_course(integer, integer)', 'public.jouer_palissade(integer)', 'public.jouer_des(jsonb)',
    'public.distribuer_vingt_et_un(integer)', 'public.jouer_vingt_et_un(bigint, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;
