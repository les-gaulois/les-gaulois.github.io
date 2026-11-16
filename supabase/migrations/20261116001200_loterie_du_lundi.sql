-- La loterie du lundi, côté serveur (docs/DIRECTION.md, « La loterie du lundi » ; formes des réponses et calculs de
-- l'écran : src/lib/village/loterie.ts).
--
-- Demande du pilote, 16 novembre 2026 : une loterie dans « Mon Gaulois », entre tous ceux qui ont créé leur Gaulois, où
-- la chance de chacun est sa part des points rapportés au clan dans la semaine ; « je veux qu'il sorte tous les lundis à
-- 21 h 30, basé sur la semaine passée ». Il a retenu le podium tiré (or, argent, bronze, un gagnant ne regagne pas) mêlé
-- aux billets achetés, montré par la jauge des parts, où chacun voit la part de tous, et il a fixé les lots lui-même.
--
-- Les règles :
-- - La semaine va du lundi 0 h au dimanche minuit, à l'heure de Paris. Une partie compte pour la semaine où elle a
--   commencé, comme dans la gazette. Le tirage d'une semaine se fait le lundi qui la suit, à 21 h 30, heure de Paris.
--   Le premier tirage est celui du lundi 23 novembre 2026, sur la semaine du 16 au 22 : rien n'est tiré pour les semaines
--   d'avant (internal.loterie_premier_tirage).
-- - Les billets gagnés : un billet par point rapporté au clan dans la semaine, arrondi à l'entier, au moins un dès qu'une
--   partie a rapporté des points. Ils se lisent dans le journal des statères (nature 'victoire', qui garde les points de
--   chaque partie) : seul un compte validé qui a créé son Gaulois en a, comme pour les statères. Rien de nouveau n'est
--   collecté.
-- - Les billets achetés : 30 statères le billet (ce que rapporte un point), jusqu'au tirage, et jamais plus que de
--   billets gagnés : on double sa chance au plus, et qui n'a rapporté aucun point n'achète rien. Les statères dépensés
--   sortent du jeu (nature 'loterie_billet') : ils ne font pas le lot.
-- - Le tirage : l'or d'abord, parmi tous les billets ; puis l'argent, sans les billets du premier gagnant ; puis le
--   bronze, sans ceux des deux premiers. Tirer l'or en premier donne le plus gros lot à la part exacte de chacun. Le
--   nombre vient du générateur sûr de Postgres (internal.village_hasard), jamais d'un navigateur. Moins de trois
--   participants : autant de lots que de participants.
-- - Les lots, fixés par le pilote le 16 novembre 2026 (internal.loterie_lots) :
--     or      3 000 statères et une pochette de chaque (surprise, familiers, bannières, Gaulois uniques, statères) ;
--     argent  1 500 statères, une pochette des familiers et une pochette des bannières ;
--     bronze    750 statères, une pochette des bannières et cinq pochettes de statères.
--   Ces statères sont créés par le jeu (nature 'loterie_lot') : c'est, avec les points rapportés au clan, la seule
--   source de statères, voulue par le pilote.
-- - Une pochette gagnée est un bon (internal.loterie_bons), que son gagnant ouvre quand il veut à l'onglet « Les
--   pochettes », par la fonction habituelle de la pochette : au moment de payer, internal.village_debiter reconnaît la
--   pochette, retire un bon et crédite son prix (nature 'loterie_pochette') juste avant de le débiter. Le journal garde
--   donc les deux lignes, l'annonce des objets reçus sur Discord marche comme pour une pochette achetée, et aucune
--   fonction de pochette n'est récrite. Une pochette de statères gagnée compte dans les dix du jour.
-- - Le mode GOD (20261116000900, l'essai sans trace d'un seul compte) : pendant un essai, ce compte n'achète pas de
--   billet (refus 'mode_god' : le billet resterait au vrai tirage alors que son prix est rendu), ses bons ne sont pas
--   touchés (une pochette s'y ouvre avec les statères de l'essai, et son contenu repart à l'extinction), sa part montre
--   le Gaulois de sa copie (internal.gaulois_montre), et un lot gagné reste un vrai gain : internal.village_god_mouvement
--   laisse passer 'loterie_lot' comme 'victoire'.
--
-- Ce qui est gardé : les billets achetés de chaque tirage (internal.loterie_achats), chaque tirage avec la part de chacun
-- et les trois gagnants (internal.loterie_tirages, internal.loterie_parts), huit semaines ; les bons jusqu'à leur
-- ouverture. Tout s'efface avec le compte.
--
-- Qui peut quoi :
-- - get_loterie : un compte validé ou de l'équipe gauloise ; la part de chacun dans le tirage à venir et dans le
--   dernier tirage (nom du site, tenue, billets gagnés et achetés), choix du pilote ; son propre solde et ses propres
--   bons, jamais ceux d'un autre, jamais un identifiant.
-- - acheter_billets_loterie : un compte validé qui a créé son Gaulois (internal.village_acheteur).
-- - get_pochettes_gagnees : tout compte connecté, pour lui seul.
-- - le tirage : pg_cron seul (internal.loterie_reveil), chaque minute du lundi, et une fois par heure en rattrapage.
--
-- Quatre tables, un index et quinze fonctions ajoutés ; internal.village_debiter est remplacée par la même, avec les
-- bons en plus, et internal.village_god_mouvement par la même, avec 'loterie_lot' parmi les vrais gains. Aucune donnée
-- existante touchée. Rejouée, elle ne change rien.

/* ---------- Les tables ---------- */

-- Les billets achetés pour un tirage, par compte. `tirage` : le lundi du tirage, à Paris.
create table if not exists internal.loterie_achats (
  tirage date not null,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  billets integer not null check (billets > 0),
  maj_le timestamptz not null default now(),
  primary key (tirage, user_id)
);

-- Un tirage fait : sa clé primaire fait qu'il n'a lieu qu'une fois.
create table if not exists internal.loterie_tirages (
  tirage date primary key,
  tire_le timestamptz not null default now(),
  -- Tous les billets du tirage, gagnés et achetés.
  billets integer not null check (billets >= 0)
);

-- La part de chacun dans un tirage fait, et les gagnants.
create table if not exists internal.loterie_parts (
  tirage date not null references internal.loterie_tirages (tirage) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  gratuits integer not null check (gratuits >= 1),
  achetes integer not null check (achetes >= 0),
  -- 1 : l'or, 2 : l'argent, 3 : le bronze ; null : pas sur le podium.
  rang smallint check (rang between 1 and 3),
  -- Le billet tiré, compté dans les siens à partir de zéro : d'abord ses billets gagnés, puis ses billets achetés.
  billet integer check (billet >= 0),
  primary key (tirage, user_id),
  check ((rang is null) = (billet is null)),
  check (billet is null or billet < gratuits + achetes)
);
create unique index if not exists loterie_un_rang on internal.loterie_parts (tirage, rang) where rang is not null;

-- Les pochettes gagnées qui restent à ouvrir.
create table if not exists internal.loterie_bons (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  pochette text not null check (pochette in ('surprise', 'familiers', 'bannieres', 'modeles', 'stateres')),
  nombre integer not null check (nombre >= 0),
  primary key (user_id, pochette)
);

-- Les points d'une semaine se lisent dans le journal par le début des parties.
create index if not exists stateres_points_par_debut on internal.stateres_mouvements (debut) where nature = 'victoire';

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.loterie_achats enable row level security;
alter table internal.loterie_tirages enable row level security;
alter table internal.loterie_parts enable row level security;
alter table internal.loterie_bons enable row level security;
revoke all on table internal.loterie_achats from public, anon, authenticated;
revoke all on table internal.loterie_tirages from public, anon, authenticated;
revoke all on table internal.loterie_parts from public, anon, authenticated;
revoke all on table internal.loterie_bons from public, anon, authenticated;

/* ---------- Les réglages, écrits ici : les changer demande une nouvelle migration ---------- */

-- Le prix d'un billet acheté, en statères : ce que rapporte un point.
create or replace function internal.loterie_prix_billet() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 30
$$;

-- Le lundi du premier tirage : rien n'est tiré pour les semaines d'avant.
create or replace function internal.loterie_premier_tirage() returns date
language sql immutable set search_path = public, pg_temp as $$
  select date '2026-11-23'
$$;

-- Les lots du podium : les statères, et le nombre de pochettes de chaque sorte.
create or replace function internal.loterie_lots()
returns table (rang integer, gain integer, p_surprise integer, p_familiers integer, p_bannieres integer, p_modeles integer, p_stateres integer)
language sql immutable set search_path = public, pg_temp as $$
  values
    (1, 3000, 1, 1, 1, 1, 1),
    (2, 1500, 0, 1, 1, 0, 0),
    (3, 750, 0, 0, 1, 0, 5)
$$;

/* ---------- Le calendrier, à l'heure de Paris ---------- */

-- L'heure d'un tirage : son lundi à 21 h 30, à Paris. 21 h 30 n'est jamais dans un changement d'heure.
create or replace function internal.loterie_heure(p_tirage date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (p_tirage + time '21:30') at time zone 'Europe/Paris'
$$;

-- Le début de la semaine d'un tirage : le lundi d'avant, 0 h, à Paris.
create or replace function internal.loterie_semaine_debut(p_tirage date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select ((p_tirage - 7)::timestamp) at time zone 'Europe/Paris'
$$;

-- Sa fin : le lundi du tirage, 0 h, à Paris. Les billets gagnés ne bougent plus ensuite.
create or replace function internal.loterie_semaine_fin(p_tirage date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (p_tirage::timestamp) at time zone 'Europe/Paris'
$$;

-- Le lundi du tirage à venir : aujourd'hui avant 21 h 30 un lundi, sinon le lundi suivant ; jamais avant le premier.
create or replace function internal.loterie_tirage_a_venir(p_at timestamptz default now()) returns date
language sql stable set search_path = public, pg_temp as $$
  select greatest(internal.loterie_premier_tirage(), case when l.ici < l.lundi + time '21:30' then l.lundi else l.lundi + 7 end)
  from (select p_at at time zone 'Europe/Paris' as ici, date_trunc('week', p_at at time zone 'Europe/Paris')::date as lundi) l
$$;

/* ---------- Les billets ---------- */

-- Les billets gagnés de la semaine d'un tirage : un par point rapporté au clan, arrondi, au moins un. Les comptes validés
-- qui ont créé leur Gaulois seulement.
create or replace function internal.loterie_gratuits(p_tirage date) returns table (user_id uuid, billets integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, greatest(1, round(sum(m.points)))::integer
  from internal.stateres_mouvements m
  join public.profiles p on p.user_id = m.user_id and p.status = 'validated'
  join internal.gaulois g on g.user_id = m.user_id
  where m.nature = 'victoire'
    and m.debut >= internal.loterie_semaine_debut(p_tirage)
    and m.debut < internal.loterie_semaine_fin(p_tirage)
  group by m.user_id
$$;

-- La part de chacun dans un tirage, pour l'écran : [{ nom, tenue, moi, gratuits, achetes }], la plus grosse part d'abord ;
-- pour un tirage fait (`p_fait`), avec en plus `rang` et `billet`, ou null. Jamais un identifiant.
create or replace function internal.loterie_parts_json(p_uid uuid, p_tirage date, p_fait boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'nom', internal.village_nom(p.display_name, p.gaul_number),
        -- Le Gaulois que les autres voient : la copie pendant un essai du mode GOD.
        'tenue', m.tenue,
        'moi', x.user_id = p_uid,
        'gratuits', x.gratuits,
        'achetes', x.achetes)
      || case when p_fait then jsonb_build_object('rang', x.rang, 'billet', x.billet) else '{}'::jsonb end
      order by x.gratuits + x.achetes desc, x.user_id), '[]'::jsonb)
  from (
    select pa.user_id, pa.gratuits, pa.achetes, pa.rang, pa.billet
    from internal.loterie_parts pa
    where p_fait and pa.tirage = p_tirage
    union all
    select gr.user_id, gr.billets, coalesce(a.billets, 0), null::smallint, null::integer
    from internal.loterie_gratuits(p_tirage) gr
    left join internal.loterie_achats a on a.tirage = p_tirage and a.user_id = gr.user_id
    where not p_fait
  ) x
  join public.profiles p on p.user_id = x.user_id
  join lateral internal.gaulois_montre(x.user_id) m on true
$$;

/* ---------- Les pochettes gagnées ---------- */

-- La pochette que paie un débit, d'après sa nature et ce qu'il vise ; null : ce n'est pas une pochette connue. La pochette
-- surprise vise un objet, « <emplacement>/<objet> » : un débit de nature 'pochette' qui viserait autre chose (une
-- pochette à venir) ne prend jamais un bon.
create or replace function internal.loterie_pochette_de(p_nature text, p_ref text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_nature = 'pochette_stateres' then 'stateres'
    when p_nature is distinct from 'pochette' or p_ref is null then null
    when p_ref like 'familier/%' then 'familiers'
    when p_ref like 'banniere/%' or p_ref = 'bannieres-rembourse' then 'bannieres'
    when p_ref like 'modele/%' or p_ref = 'modeles-rembourse' then 'modeles'
    when split_part(p_ref, '/', 1) in ('tete', 'haut', 'bas', 'pieds', 'arme') then 'surprise'
    else null
  end
$$;

-- Retire `p_montant` statères (plus de zéro) au compte, par une ligne du journal. La table des soldes refuse un solde qui
-- deviendrait négatif : son refus devient 'solde_insuffisant'. Toute autre erreur reste une erreur.
-- Celle de 20261113001900_village_boutique.sql, avec un ajout : si le débit paie une pochette dont le compte a un bon
-- (une pochette gagnée à la loterie), le bon est retiré et le prix est crédité juste avant d'être débité. Un refus
-- annule les deux. Pendant un essai du mode GOD, les bons ne sont pas touchés.
create or replace function internal.village_debiter(p_user uuid, p_nature text, p_montant integer, p_ref text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_contrainte text;
  v_pochette text;
begin
  if p_user is null or p_montant is null or p_montant <= 0 then
    raise exception 'débit du village mal formé';
  end if;
  v_pochette := internal.loterie_pochette_de(p_nature, p_ref);
  if v_pochette is not null and not exists (select 1 from internal.village_god d where d.user_id = p_user) then
    update internal.loterie_bons b set nombre = b.nombre - 1 where b.user_id = p_user and b.pochette = v_pochette and b.nombre > 0;
    if found then
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, 'loterie_pochette', p_montant, 'pochette/' || v_pochette);
    end if;
  end if;
  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, p_nature, -p_montant, p_ref);
exception when check_violation then
  get stacked diagnostics v_contrainte = constraint_name;
  if v_contrainte = 'stateres_soldes_solde_check' then perform internal.fail('solde_insuffisant'); end if;
  raise;
end $$;

-- Les pochettes gagnées du compte connecté, qui restent à ouvrir : { ok: true, bons: { <pochette>: nombre } }. Jamais
-- celles d'un autre.
create or replace function public.get_pochettes_gagnees() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  return jsonb_build_object('ok', true, 'bons', coalesce(
    (select jsonb_object_agg(b.pochette, b.nombre) from internal.loterie_bons b where b.user_id = v_uid and b.nombre > 0), '{}'::jsonb));
end $$;

/* ---------- L'écran ---------- */

-- La loterie vue par le compte connecté : { ok: true, tirage, heure, close, prix, lots: [{ rang, gain, pochettes }],
-- parts: [...], peut_acheter, solde, bons, dernier: { tirage, tire_le, parts: [...] } | null, releve }.
-- `tirage` : le lundi du tirage à venir ; `close` : sa semaine est finie, les billets gagnés ne bougent plus.
-- `peut_acheter` : compte validé avec un Gaulois créé. Crédite d'abord ce qui lui revient déjà, comme get_ma_boutique.
create or replace function public.get_loterie() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_role public.site_role;
  v_gaulois boolean;
  v_tirage date := internal.loterie_tirage_a_venir();
  v_dernier date;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select p.status, p.role into v_status, v_role from public.profiles p where p.user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;
  v_gaulois := exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  select max(t.tirage) into v_dernier from internal.loterie_tirages t;
  return jsonb_build_object(
    'ok', true,
    'tirage', v_tirage,
    'heure', internal.loterie_heure(v_tirage),
    'close', now() >= internal.loterie_semaine_fin(v_tirage),
    'prix', internal.loterie_prix_billet(),
    'lots', (select jsonb_agg(jsonb_build_object(
        'rang', l.rang,
        'gain', l.gain,
        'pochettes', jsonb_build_object('surprise', l.p_surprise, 'familiers', l.p_familiers, 'bannieres', l.p_bannieres, 'modeles', l.p_modeles, 'stateres', l.p_stateres))
      order by l.rang) from internal.loterie_lots() l),
    'parts', internal.loterie_parts_json(v_uid, v_tirage, false),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'bons', coalesce((select jsonb_object_agg(b.pochette, b.nombre) from internal.loterie_bons b where b.user_id = v_uid and b.nombre > 0), '{}'::jsonb),
    'dernier', case when v_dernier is null then null else jsonb_build_object(
      'tirage', v_dernier,
      'tire_le', (select t.tire_le from internal.loterie_tirages t where t.tirage = v_dernier),
      'parts', internal.loterie_parts_json(v_uid, v_dernier, true)) end,
    'releve', (select r.le from internal.stateres_releve r where r.id)
  );
end $$;

-- Achète `p_nombre` billets pour le tirage à venir : { ok: true, solde, gratuits, achetes }. `p_prix_vu` : le prix du
-- billet que le membre a vu. Refus, dans l'ordre : invalid_request, mode_god (pendant un essai du mode GOD), tirage_fait,
-- prix_change, aucun_billet (aucun point rapporté dans la semaine du tirage), plafond_billets (plus de billets achetés que
-- de billets gagnés), solde_insuffisant ; et ceux de tout compte (not_signed_in, suspended, not_validated, no_gaulois,
-- rate_limited). Un refus ne débite rien.
create or replace function public.acheter_billets_loterie(p_nombre integer, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer := internal.loterie_prix_billet();
  v_tirage date;
  v_gratuits integer;
  v_achetes integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    if p_nombre is null or p_nombre < 1 or p_nombre > 1000 then perform internal.fail('invalid_request'); end if;
    -- Le tirage tient ce verrou seul : aucun billet ne s'achète pendant qu'il se fait. Puis le verrou du compte.
    perform pg_advisory_xact_lock_shared(hashtext('gal_loterie'), 0);
    perform internal.village_verrou(v_uid);
    -- Pendant un essai, le prix du billet serait rendu aussitôt et le billet resterait au vrai tirage.
    if exists (select 1 from internal.village_god d where d.user_id = v_uid) then perform internal.fail('mode_god'); end if;
    v_tirage := internal.loterie_tirage_a_venir();
    if exists (select 1 from internal.loterie_tirages t where t.tirage = v_tirage) then perform internal.fail('tirage_fait'); end if;
    perform internal.crediter_stateres(v_uid);
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    select g.billets into v_gratuits from internal.loterie_gratuits(v_tirage) g where g.user_id = v_uid;
    if coalesce(v_gratuits, 0) < 1 then perform internal.fail('aucun_billet'); end if;
    v_achetes := coalesce((select a.billets from internal.loterie_achats a where a.tirage = v_tirage and a.user_id = v_uid), 0);
    if v_achetes + p_nombre > v_gratuits then perform internal.fail('plafond_billets'); end if;
    perform internal.village_debiter(v_uid, 'loterie_billet', p_nombre * v_prix, 'tirage/' || v_tirage::text);
    insert into internal.loterie_achats as a (tirage, user_id, billets) values (v_tirage, v_uid, p_nombre)
      on conflict (tirage, user_id) do update set billets = a.billets + excluded.billets, maj_le = now();
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'gratuits', v_gratuits,
      'achetes', v_achetes + p_nombre
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le mode GOD ---------- */

-- Avant chaque ligne du journal : pour un compte en essai, la nature devient 'test_…' ; ce qui sortirait du compte est
-- refusé ; les vrais gains passent tels quels.
-- Celle de 20261116000900_village_mode_god.sql, avec un ajout : un lot de la loterie ('loterie_lot') est un vrai gain,
-- comme les points rapportés au clan. Le déclencheur qui l'appelle reste le même.
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

/* ---------- Le tirage ---------- */

-- Fait le tirage du lundi `p_tirage`, s'il est l'heure et s'il n'est pas déjà fait : vrai s'il vient d'avoir lieu.
-- Crédite d'abord tous les comptes, fige la part de chacun, tire l'or, l'argent puis le bronze, donne les lots dans
-- l'ordre des comptes, puis efface ce qui a plus de huit semaines.
create or replace function internal.loterie_tirer(p_tirage date) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rang integer;
  v_total integer;
  v_tire integer;
  v_cumul integer;
  v_p record;
begin
  if p_tirage is null or p_tirage < internal.loterie_premier_tirage() or now() < internal.loterie_heure(p_tirage) then return false; end if;
  perform pg_advisory_xact_lock(hashtext('gal_loterie'), 0);
  insert into internal.loterie_tirages (tirage, billets) values (p_tirage, 0) on conflict (tirage) do nothing;
  if not found then return false; end if;
  perform internal.crediter_stateres();
  insert into internal.loterie_parts (tirage, user_id, gratuits, achetes)
    select p_tirage, gr.user_id, gr.billets, coalesce(a.billets, 0)
    from internal.loterie_gratuits(p_tirage) gr
    left join internal.loterie_achats a on a.tirage = p_tirage and a.user_id = gr.user_id;
  update internal.loterie_tirages t
    set billets = coalesce((select sum(pa.gratuits + pa.achetes) from internal.loterie_parts pa where pa.tirage = p_tirage), 0)
    where t.tirage = p_tirage;
  for v_rang in 1..3 loop
    select coalesce(sum(pa.gratuits + pa.achetes), 0) into v_total from internal.loterie_parts pa where pa.tirage = p_tirage and pa.rang is null;
    exit when v_total = 0;
    -- Un billet parmi ceux qui restent, de 0 compris à leur nombre non compris ; les parts à la suite, dans l'ordre des comptes.
    v_tire := least(v_total - 1, floor(internal.village_hasard() * v_total)::integer);
    v_cumul := 0;
    for v_p in select pa.user_id, pa.gratuits + pa.achetes as billets from internal.loterie_parts pa where pa.tirage = p_tirage and pa.rang is null order by pa.user_id loop
      if v_tire < v_cumul + v_p.billets then
        update internal.loterie_parts pa set rang = v_rang, billet = v_tire - v_cumul where pa.tirage = p_tirage and pa.user_id = v_p.user_id;
        exit;
      end if;
      v_cumul := v_cumul + v_p.billets;
    end loop;
  end loop;
  for v_p in
    select pa.user_id, l.rang, l.gain, l.p_surprise, l.p_familiers, l.p_bannieres, l.p_modeles, l.p_stateres
    from internal.loterie_parts pa
    join internal.loterie_lots() l on l.rang = pa.rang
    where pa.tirage = p_tirage
    order by pa.user_id
  loop
    perform internal.village_verrou(v_p.user_id);
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
      values (v_p.user_id, 'loterie_lot', v_p.gain, 'tirage/' || p_tirage::text || '/' || v_p.rang::text);
    insert into internal.loterie_bons as b (user_id, pochette, nombre)
      select v_p.user_id, x.pochette, x.nombre
      from (values ('surprise', v_p.p_surprise), ('familiers', v_p.p_familiers), ('bannieres', v_p.p_bannieres), ('modeles', v_p.p_modeles), ('stateres', v_p.p_stateres)) x (pochette, nombre)
      where x.nombre > 0
      on conflict (user_id, pochette) do update set nombre = b.nombre + excluded.nombre;
  end loop;
  delete from internal.loterie_tirages t where t.tirage < p_tirage - 56;
  delete from internal.loterie_achats a where a.tirage < p_tirage - 56;
  return true;
end $$;

-- Le réveil de pg_cron : le tirage de ce lundi s'il est l'heure, et celui du lundi d'avant s'il a été manqué.
create or replace function internal.loterie_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lundi date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
begin
  perform internal.loterie_tirer(v_lundi - 7);
  perform internal.loterie_tirer(v_lundi);
end $$;

-- Chaque minute du lundi (le tirage part dans la minute de 21 h 30), et une fois par heure pour rattraper un lundi
-- manqué. Les tâches portent un nom : les planifier de nouveau les remplace. pg_cron est déjà activé sur le projet
-- (concours) ; sans lui, rien n'est planifié.
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-loterie', '* * * * 1', 'select internal.loterie_reveil()');
    perform cron.schedule('gal-loterie-rattrapage', '13 * * * *', 'select internal.loterie_reveil()');
  end if;
end $cron$;

/* ---------- Les droits ---------- */

-- Postgres ouvre toute nouvelle fonction à tous : on ferme, puis on ouvre ce que le site appelle.
revoke all on function internal.loterie_prix_billet() from public, anon, authenticated;
revoke all on function internal.loterie_premier_tirage() from public, anon, authenticated;
revoke all on function internal.loterie_lots() from public, anon, authenticated;
revoke all on function internal.loterie_heure(date) from public, anon, authenticated;
revoke all on function internal.loterie_semaine_debut(date) from public, anon, authenticated;
revoke all on function internal.loterie_semaine_fin(date) from public, anon, authenticated;
revoke all on function internal.loterie_tirage_a_venir(timestamptz) from public, anon, authenticated;
revoke all on function internal.loterie_gratuits(date) from public, anon, authenticated;
revoke all on function internal.loterie_parts_json(uuid, date, boolean) from public, anon, authenticated;
revoke all on function internal.loterie_pochette_de(text, text) from public, anon, authenticated;
revoke all on function internal.village_debiter(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function internal.village_god_mouvement() from public, anon, authenticated;
revoke all on function internal.loterie_tirer(date) from public, anon, authenticated;
revoke all on function internal.loterie_reveil() from public, anon, authenticated;
revoke all on function public.get_pochettes_gagnees() from public, anon, authenticated;
revoke all on function public.get_loterie() from public, anon, authenticated;
revoke all on function public.acheter_billets_loterie(integer, integer) from public, anon, authenticated;
grant execute on function public.get_pochettes_gagnees() to authenticated;
grant execute on function public.get_loterie() to authenticated;
grant execute on function public.acheter_billets_loterie(integer, integer) to authenticated;
