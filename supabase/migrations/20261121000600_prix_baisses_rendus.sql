-- Le trop-payé rendu après les prix baissés du 21 novembre 2026 (migration 20261121000500_prix_baisses). Le pilote : « vu
-- que j'ai baissé, je veux que tu rembourses le montant en question aux joueurs et que tu crées un joli message pour
-- expliquer pourquoi ils ont reçu ce montant », puis, entre deux choix : « Le trop-payé net » et « Les deux » (un message
-- public sans montant, et un message privé du robot à chaque joueur remboursé avec son montant). Détail : docs/DIRECTION.md,
-- « Le trop-payé rendu ».
--
-- Ce qui est rendu : pour chaque achat payé en statères avant la baisse (avant le collage de 20261121000500, l'heure où
-- elle a changé le prix de la pochette des familiers, internal.familiers_pochette.maj_le), ce qu'il aurait coûté de moins
-- après elle.
-- - Une bannière, une finition ou un cadre de carte : le tiers du prix payé, le passage du triple au double du prix d'un
--   objet de sa rareté (internal.banniere_prix). Le prix des objets se règle dans la Direction : compté ainsi, le rendu
--   est la baisse, quel que soit ce réglage le jour de l'achat ou aujourd'hui (trouvé à la relecture).
-- - Un Gaulois unique acheté à la boutique : le prix payé moins le prix d'aujourd'hui de sa rareté (internal.modele_prix,
--   que seules les migrations changent). Un Gaulois unique acheté avant le 16 novembre 2026, moins cher qu'aujourd'hui,
--   ne rend rien.
-- - Une pochette des familiers, des bannières ou des Gaulois uniques : le prix payé moins le prix d'aujourd'hui. Si la
--   pochette avait rendu une part de son prix (20 à 60 %), cette part aurait été prise sur le nouveau prix : le joueur
--   reçoit ce qu'il aurait gardé, (payé moins nouveau prix) fois (1 moins la part rendue). Payé 3 000, rendu 1 800 : au
--   nouveau prix, payé 1 600, rendu 960 ; il reçoit 560 (le « trop-payé net », choix du pilote).
-- - Rien pour une pochette offerte par la loterie (son prix avait été crédité juste avant d'être débité, nature
--   'loterie_pochette'), ni pour un essai du mode GOD (natures 'test_…'), ni pour ce qui n'a pas baissé (objets, pochette
--   surprise, pochette de statères), ni pour un achat fait au nouveau prix.
--
-- Chaque joueur reçoit une seule ligne au journal des statères, nature 'prix_baisse_rendu', ref 'prix-baisse', de la somme
-- de ses achats remboursés. Le détail, achat par achat, est gardé dans internal.prix_baisse_rendus, que lit le robot pour le
-- message privé (public.rendus_des_prix, clé de service seulement). Ce sont des statères créés, à la demande du pilote : ils
-- rendent ce qui a été payé en trop, jamais plus que la baisse.
--
-- internal.village_god_mouvement, reprise de 20261121000400_coffre_ferme_mises_rendues.sql, compte 'prix_baisse_rendu' parmi
-- les vrais gains : rendu pendant un essai du mode GOD, il deviendrait sinon un mouvement d'essai, annulé au retour.
--
-- Rien n'est effacé ni vidé. Rejouée, la migration ne rend rien une seconde fois : un achat déjà rendu ne l'est plus, et un
-- achat fait au nouveau prix ne rend rien.

/* ---------- Le mode GOD ---------- */

create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue', 'coffre_rendu', 'prix_baisse_rendu') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

/* ---------- Le détail des achats rendus ---------- */

-- Un achat rendu : le débit du journal (`achat`), ce qu'il payait (`genre`, l'identifiant de ce qu'il a donné et sa
-- rareté, null pour une pochette qui a rendu des statères), le prix payé, le prix d'aujourd'hui, ce que la pochette avait
-- déjà rendu, ce qui est rendu maintenant, et la ligne du journal qui le verse (`mouvement`, une par joueur). Gardé jusqu'à
-- l'effacement du compte, comme le journal.
create table if not exists internal.prix_baisse_rendus (
  achat bigint primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  genre text not null check (genre in ('banniere', 'carte', 'cadre', 'modele', 'pochette_familiers', 'pochette_bannieres', 'pochette_modeles')),
  objet text check (objet is null or length(objet) <= 40),
  rarete text check (rarete is null or rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire')),
  paye integer not null check (paye > 0),
  nouveau integer not null check (nouveau > 0 and nouveau < paye),
  deja_rendu integer not null default 0 check (deja_rendu >= 0 and deja_rendu < paye),
  rendu integer not null check (rendu > 0 and rendu <= paye - nouveau),
  achete_le timestamptz not null,
  mouvement bigint not null,
  rendu_le timestamptz not null default now()
);

create index if not exists prix_baisse_rendus_par_compte on internal.prix_baisse_rendus (user_id);
create index if not exists prix_baisse_rendus_par_mouvement on internal.prix_baisse_rendus (mouvement);

alter table internal.prix_baisse_rendus enable row level security;
revoke all on table internal.prix_baisse_rendus from public, anon, authenticated;

/* ---------- Le versement ---------- */

do $$
declare
  u record;
  v_mouvement bigint;
begin
  -- Les achats à rendre, calculés une fois : le journal ne se modifie pas, chaque joueur y reçoit une seule ligne.
  drop table if exists pg_temp.prix_baisse_a_rendre;
  create temporary table prix_baisse_a_rendre on commit drop as
    with debits as (
      select d.id, d.user_id, d.nature, d.ref, -d.montant as paye, d.cree_le,
        case
          when d.nature = 'achat' and d.ref like 'banniere/%' then 'banniere'
          when d.nature = 'achat' and d.ref like 'carte/%' then 'carte'
          when d.nature = 'achat' and d.ref like 'cadre/%' then 'cadre'
          when d.nature = 'achat' and d.ref like 'modele/%' then 'modele'
          when d.nature = 'pochette' and d.ref like 'familier/%' then 'pochette_familiers'
          when d.nature = 'pochette' and (d.ref like 'banniere/%' or d.ref = 'bannieres-rembourse') then 'pochette_bannieres'
          when d.nature = 'pochette' and (d.ref like 'modele/%' or d.ref = 'modeles-rembourse') then 'pochette_modeles'
        end as genre,
        nullif(split_part(d.ref, '/', 2), '') as objet
      from internal.stateres_mouvements d
      where d.montant < 0
        and d.nature in ('achat', 'pochette')
        -- Avant la baisse : l'heure où 20261121000500 a changé le prix de la pochette des familiers.
        and d.cree_le < (select p.maj_le from internal.familiers_pochette p where p.id)
        and not exists (select 1 from internal.prix_baisse_rendus r where r.achat = d.id)
    ),
    connus as (
      select d.*,
        case d.genre
          when 'banniere' then (select b.rarete from internal.bannieres b where b.banniere = d.objet)
          when 'carte' then (select x.rarete from internal.cartes x where x.finition = d.objet)
          when 'cadre' then (select x.rarete from internal.cadres x where x.cadre = d.objet)
          when 'modele' then (select m.rarete from internal.modeles m where m.modele = d.objet)
        end as rarete,
        -- Une pochette offerte par la loterie : son prix a été crédité juste avant, dans la même transaction.
        exists (
          select 1 from internal.stateres_mouvements l
          where l.user_id = d.user_id and l.nature = 'loterie_pochette' and l.cree_le = d.cree_le
            and l.ref = 'pochette/' || case d.genre when 'pochette_familiers' then 'familiers' when 'pochette_bannieres' then 'bannieres' else 'modeles' end
        ) as offerte,
        -- Ce que la pochette a rendu : le crédit de la même pochette, dans la même transaction.
        case when d.ref like '%-rembourse' then coalesce((
          select sum(c.montant) from internal.stateres_mouvements c
          where c.user_id = d.user_id and c.nature = 'pochette' and c.montant > 0 and c.ref = d.ref and c.cree_le = d.cree_le
        ), 0) else 0 end::integer as deja_rendu
      from debits d
      where d.genre is not null
    ),
    prix as (
      select c.*,
        case c.genre
          -- Le double au lieu du triple : les deux tiers de ce qui a été payé.
          when 'banniere' then round(c.paye * 2 / 3.0)::integer
          when 'carte' then round(c.paye * 2 / 3.0)::integer
          when 'cadre' then round(c.paye * 2 / 3.0)::integer
          when 'modele' then internal.modele_prix(c.rarete)
          when 'pochette_familiers' then (select p.prix from internal.familiers_pochette p where p.id)
          when 'pochette_bannieres' then internal.bannieres_pochette_prix()
          when 'pochette_modeles' then (select p.prix from internal.modeles_pochette p where p.id)
        end as nouveau
      from connus c
      where not c.offerte and (c.genre like 'pochette_%' or c.rarete is not null)
    )
    select p.*,
      (case when p.deja_rendu > 0
        then round((p.paye - p.nouveau)::numeric * (p.paye - p.deja_rendu) / p.paye)
        else p.paye - p.nouveau end)::integer as rendu
    from prix p
    where p.nouveau is not null and p.nouveau > 0 and p.paye > p.nouveau and p.deja_rendu < p.paye
    order by p.user_id, p.id;

  for u in
    select a.user_id, sum(a.rendu)::integer as total
    from pg_temp.prix_baisse_a_rendre a
    where a.rendu > 0
    group by a.user_id
    order by a.user_id
  loop
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
    values (u.user_id, 'prix_baisse_rendu', u.total, 'prix-baisse')
    returning id into v_mouvement;
    insert into internal.prix_baisse_rendus (achat, user_id, genre, objet, rarete, paye, nouveau, deja_rendu, rendu, achete_le, mouvement)
    select a.id, a.user_id, a.genre, a.objet, a.rarete, a.paye, a.nouveau, a.deja_rendu, a.rendu, a.cree_le, v_mouvement
    from pg_temp.prix_baisse_a_rendre a
    where a.user_id = u.user_id and a.rendu > 0;
  end loop;

  drop table if exists pg_temp.prix_baisse_a_rendre;
end $$;

/* ---------- La lecture du robot ---------- */

-- Les joueurs remboursés, pour le message privé du robot : { ok: true, comptes, total, le, jusqu_a, rendus: [{ n, discord,
-- nom, total, gaulois: { tenue, familier, banniere } | null, lignes: [{ genre, objet, rarete, paye, nouveau, deja_rendu,
-- rendu }] }] }. `comptes` et `total` : tous les joueurs remboursés et la somme rendue, pour le message public (sans nom).
-- `rendus` : ceux dont la ligne du journal (`n`) vient après `p_apres` (null : depuis le début), dans l'ordre, 25 au plus
-- par passage ; `jusqu_a` : le dernier `n` rendu ici. `discord` : l'identifiant Discord du compte (public.private_links), ou
-- null ; `nom` : son nom Discord, sinon son pseudo public, sinon « Gaulois n° ». Réservée à la clé de service.
create or replace function public.rendus_des_prix(p_apres bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rendus jsonb;
  v_jusqu_a bigint;
begin
  if p_apres is not null and p_apres < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  with par_compte as (
    select r.mouvement as n, r.user_id, sum(r.rendu)::integer as total
    from internal.prix_baisse_rendus r
    where r.mouvement > coalesce(p_apres, 0)
    group by r.mouvement, r.user_id
    order by r.mouvement
    limit 25
  )
  select
    (select max(c.n) from par_compte c),
    coalesce(jsonb_agg(jsonb_build_object(
      'n', c.n,
      'discord', l.discord_id,
      'nom', coalesce(nullif(l.discord_name, ''), internal.member_pseudo(c.user_id), 'Gaulois n° ' || p.gaul_number),
      'total', c.total,
      'gaulois', (select jsonb_build_object('tenue', m.tenue, 'familier', m.familier, 'banniere', m.banniere) from internal.gaulois_montre(c.user_id) m),
      'lignes', (
        select jsonb_agg(jsonb_build_object(
            'genre', r.genre, 'objet', r.objet, 'rarete', r.rarete, 'paye', r.paye, 'nouveau', r.nouveau,
            'deja_rendu', r.deja_rendu, 'rendu', r.rendu
          ) order by r.achete_le, r.achat)
        from internal.prix_baisse_rendus r where r.mouvement = c.n
      )
    ) order by c.n), '[]'::jsonb)
  into v_jusqu_a, v_rendus
  from par_compte c
  join public.profiles p on p.user_id = c.user_id
  left join public.private_links l on l.user_id = c.user_id;

  return jsonb_build_object(
    'ok', true,
    'comptes', (select count(distinct r.user_id) from internal.prix_baisse_rendus r),
    'total', (select coalesce(sum(r.rendu), 0) from internal.prix_baisse_rendus r),
    'le', (select min(r.rendu_le) from internal.prix_baisse_rendus r),
    'jusqu_a', coalesce(v_jusqu_a, p_apres),
    'rendus', v_rendus
  );
end $$;

revoke all on function public.rendus_des_prix(bigint) from public, anon, authenticated;
grant execute on function public.rendus_des_prix(bigint) to service_role;
