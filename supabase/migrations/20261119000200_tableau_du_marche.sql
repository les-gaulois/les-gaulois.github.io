-- Le tableau du marché dans l'onglet Village de la Direction (19 novembre 2026). Le pilote, sur six idées après la boutique
-- tournante et les demandes d'achat : « 5 pousse-le au maximum » (« un tableau du marché dans la Direction : les offres et
-- les demandes ouvertes, les ventes de la semaine, les statères mis de côté », docs/DIRECTION.md, « Le tableau du marché »).
-- Forme de la réponse : `MarcheDeLaDirection` de src/lib/village/marche-direction.ts.
--
-- Comme le reste de l'onglet : des totaux seulement, sans aucun nom de membre, pour un officier ou au-dessus
-- (internal.require_rank(2), comme get_village_economie), sans seuil (choix du pilote du 14 novembre 2026). Rien n'est
-- écrit : c'est une lecture.
--
-- D'où vient chaque chiffre :
-- - Le journal des statères (internal.stateres_mouvements), complet depuis le début, par nature exacte ; les lignes d'un
--   essai du mode GOD (natures 'test_…' et 'god_…') n'y entrent donc jamais :
--     achats à la boutique : 'achat' (objets, bannières, Gaulois uniques, cartes, cadres, étal du jour) ;
--     pochettes ouvertes : 'pochette' et 'pochette_stateres' de montant négatif (un remboursement de pochette est positif) ;
--     ventes au marché : 'marche_vente', dont « offre/<n> » (une offre achetée) et « demande/<n> » (une demande servie) ;
--     demandes posées : 'marche_demande' ; demandes rendues sans vente : les 'marche_demande_rendue' moins les demandes
--     servies (le service en écrit une aussi, au même instant) ;
--     reventes au jeu : 'revente' ; statères distribués : 'victoire'.
--   Les 7 et 30 jours se comptent à l'heure de chaque ligne ; les jours, à la date de Paris ; les semaines, en semaines de
--   la boutique (du mardi 21 h 30 au suivant, internal.boutique_semaine).
-- - Les tables du marché (internal.marche_offres, internal.marche_demandes) pour ce qui est ouvert maintenant et pour le
--   détail des ventes des 30 derniers jours : une offre retirée s'efface aussitôt, une offre ou une demande close s'efface
--   au bout de 30 jours. Le prix de la boutique d'une vente est celui d'aujourd'hui (internal.marche_plafond).
-- - « Hors rayon », pour une vente : l'objet n'était pas en rayon à l'heure de la vente, d'après le rangement des tours
--   d'aujourd'hui (un objet ajouté depuis peut avoir décalé ses voisins). Seulement pour une vente faite depuis que la
--   rotation est en place (internal.boutique_tournante_en_place) ; avant, la réponse dit null : tout était en rayon.
--
-- Une fonction interne et une fonction publique ajoutées, rien de remplacé, aucune donnée touchée. Rejouée, elle se remplace par la même.

-- L'heure où la boutique tournante est en place au plus tard : la migration 20261119000100 a été collée par le pilote le
-- 19 novembre 2026, avant le premier passage du robot qui a lu annonces_du_marche, à 11 h 47 min 48 s UTC (12 h 47 à Paris ;
-- data/marche-envoi.json, commit 655c3e3a). Une vente d'avant n'a jamais été « hors rayon ».
create or replace function internal.boutique_tournante_en_place() returns timestamptz
language sql immutable set search_path = public, pg_temp as $$ select timestamptz '2026-11-19 11:47:48+00' $$;

revoke all on function internal.boutique_tournante_en_place() from public, anon, authenticated;

create or replace function public.get_village_marche() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_maintenant timestamptz := now();
  v_7 timestamptz := now() - interval '7 days';
  v_30 timestamptz := now() - interval '30 days';
  v_semaine integer;
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_periodes jsonb;
begin
  perform internal.require_rank(2);
  v_semaine := internal.boutique_semaine(v_maintenant);

  -- Les trois périodes, du journal : une ligne par période, les mêmes comptes pour chacune.
  select jsonb_object_agg(t.nom, t.valeurs)
  into v_periodes
  from (
    select p.nom, jsonb_build_object(
      'achats_boutique', count(*) filter (where m.nature = 'achat'),
      'stateres_boutique', coalesce(-sum(m.montant) filter (where m.nature = 'achat'), 0),
      'pochettes', count(*) filter (where m.nature in ('pochette', 'pochette_stateres') and m.montant < 0),
      'ventes_offres', count(*) filter (where m.nature = 'marche_vente' and m.ref like 'offre/%'),
      'ventes_demandes', count(*) filter (where m.nature = 'marche_vente' and m.ref like 'demande/%'),
      'stateres_echanges', coalesce(sum(m.montant) filter (where m.nature = 'marche_vente'), 0),
      'vendeurs', count(distinct m.user_id) filter (where m.nature = 'marche_vente'),
      'acheteurs', count(distinct m.user_id) filter (where m.nature = 'marche_achat'),
      'demandes_posees', count(*) filter (where m.nature = 'marche_demande'),
      'demandes_rendues', count(*) filter (where m.nature = 'marche_demande_rendue') - count(*) filter (where m.nature = 'marche_vente' and m.ref like 'demande/%'),
      'reventes', count(*) filter (where m.nature = 'revente'),
      'stateres_revendus', coalesce(sum(m.montant) filter (where m.nature = 'revente'), 0),
      'distribues', coalesce(sum(m.montant) filter (where m.nature = 'victoire'), 0)
    ) as valeurs
    from (values ('sept_jours', v_7), ('trente_jours', v_30), ('total', '-infinity'::timestamptz)) as p (nom, depuis)
    left join internal.stateres_mouvements m on m.cree_le >= p.depuis
    group by p.nom
  ) t;

  return jsonb_build_object(
    'ok', true,
    'lu_le', v_maintenant,

    -- La semaine de la boutique en cours : combien d'objets payants sont en rayon, combien attendent leur tour, et depuis
    -- quand la rotation est en place.
    'rotation', jsonb_build_object(
      'semaine', v_semaine,
      'depuis', internal.boutique_tournante_en_place(),
      'change_le', internal.boutique_semaine_debut(v_semaine + 1),
      'en_rayon', (select count(*) from internal.boutique_tours_des_objets() t where t.tour = internal.boutique_tour_de_la_semaine(v_semaine)),
      'hors_rayon', (select count(*) from internal.boutique_tours_des_objets() t where t.tour <> internal.boutique_tour_de_la_semaine(v_semaine))
    ),

    -- Ce qui est ouvert maintenant : toutes les offres et toutes les demandes dont l'heure n'est pas passée. Les statères
    -- mis de côté, eux, comptent toute demande pas encore fermée : leur argent reste bloqué jusqu'à la fermeture.
    'ouvert', (
      select jsonb_build_object(
        'offres', (select count(*) from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le > v_maintenant),
        'vendeurs', (select count(distinct m.vendeur_id) from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le > v_maintenant),
        'valeur', (select coalesce(sum(m.prix), 0) from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le > v_maintenant),
        'valeur_boutique', (select coalesce(sum(internal.marche_plafond(m.emplacement, m.objet)), 0) from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le > v_maintenant),
        'demandes', (select count(*) from internal.marche_demandes d where d.etat = 'ouverte' and d.expire_le > v_maintenant),
        'demandeurs', (select count(distinct d.acheteur_id) from internal.marche_demandes d where d.etat = 'ouverte' and d.expire_le > v_maintenant),
        'mis_de_cote', (select coalesce(sum(d.prix), 0) from internal.marche_demandes d where d.etat = 'ouverte'),
        'par_rarete', (
          select coalesce(jsonb_object_agg(p.rarete, jsonb_build_object(
              'offres', (select count(*) from internal.marche_offres m join internal.gaulois_objets o on o.emplacement = m.emplacement and o.objet = m.objet
                         where m.etat = 'ouverte' and m.expire_le > v_maintenant and o.rarete = p.rarete),
              'demandes', (select count(*) from internal.marche_demandes d join internal.gaulois_objets o on o.emplacement = d.emplacement and o.objet = d.objet
                           where d.etat = 'ouverte' and d.expire_le > v_maintenant and o.rarete = p.rarete))), '{}'::jsonb)
          from internal.village_prix p
        )
      )
    ),

    'periodes', v_periodes,

    -- Chaque jour des 30 derniers, à la date de Paris, aujourd'hui compris, jours sans rien compris.
    'par_jour', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'jour', to_char(j.jour, 'YYYY-MM-DD'),
          'achats', coalesce(c.achats, 0),
          'pochettes', coalesce(c.pochettes, 0),
          'ventes', coalesce(c.ventes, 0),
          'demandes', coalesce(c.demandes, 0),
          'reventes', coalesce(c.reventes, 0),
          'distribues', coalesce(c.distribues, 0))
        order by j.jour), '[]'::jsonb)
      from generate_series(v_aujourdhui - 29, v_aujourdhui, interval '1 day') as j (jour)
      left join (
        select (m.cree_le at time zone 'Europe/Paris')::date as jour,
          count(*) filter (where m.nature = 'achat') as achats,
          count(*) filter (where m.nature in ('pochette', 'pochette_stateres') and m.montant < 0) as pochettes,
          count(*) filter (where m.nature = 'marche_vente') as ventes,
          count(*) filter (where m.nature = 'marche_demande') as demandes,
          count(*) filter (where m.nature = 'revente') as reventes,
          sum(m.montant) filter (where m.nature = 'victoire') as distribues
        from internal.stateres_mouvements m
        where m.cree_le >= v_30 - interval '1 day'
        group by 1
      ) c on c.jour = j.jour::date
    ),

    -- Les huit dernières semaines de la boutique, celle en cours comprise : avant et depuis la boutique tournante.
    'par_semaine', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'semaine', s.semaine,
          'debut', internal.boutique_semaine_debut(s.semaine),
          'achats', coalesce(c.achats, 0),
          'pochettes', coalesce(c.pochettes, 0),
          'ventes', coalesce(c.ventes, 0),
          'demandes', coalesce(c.demandes, 0))
        order by s.semaine), '[]'::jsonb)
      from generate_series(v_semaine - 7, v_semaine) as s (semaine)
      left join (
        select internal.boutique_semaine(m.cree_le) as semaine,
          count(*) filter (where m.nature = 'achat') as achats,
          count(*) filter (where m.nature in ('pochette', 'pochette_stateres') and m.montant < 0) as pochettes,
          count(*) filter (where m.nature = 'marche_vente') as ventes,
          count(*) filter (where m.nature = 'marche_demande') as demandes
        from internal.stateres_mouvements m
        where m.cree_le >= internal.boutique_semaine_debut(v_semaine - 7)
        group by 1
      ) c on c.semaine = s.semaine
    ),

    -- Les ventes des 30 derniers jours, par rareté : combien, et le prix payé en part du prix de la boutique d'aujourd'hui.
    'prix_30', (
      select coalesce(jsonb_agg(jsonb_build_object('rarete', v.rarete, 'ventes', v.ventes, 'part_moyenne', v.part) order by v.rang), '[]'::jsonb)
      from (
        select o.rarete, min(p.prix) as rang, count(*) as ventes,
          round(avg(x.prix * 100.0 / nullif(internal.marche_plafond(x.emplacement, x.objet), 0)))::integer as part
        from (
          select m.emplacement, m.objet, m.prix from internal.marche_offres m where m.etat = 'vendue' and m.ferme_le >= v_30
          union all
          select d.emplacement, d.objet, d.prix from internal.marche_demandes d where d.etat = 'servie' and d.ferme_le >= v_30
        ) x
        join internal.gaulois_objets o on o.emplacement = x.emplacement and o.objet = x.objet
        join internal.village_prix p on p.rarete = o.rarete
        group by o.rarete
      ) v
    ),

    -- Le temps, en secondes, entre la mise en vente et la vente, ou la demande et son service (médiane des 30 derniers jours).
    'delais_30', jsonb_build_object(
      'offres', (select round(extract(epoch from percentile_cont(0.5) within group (order by m.ferme_le - m.cree_le)))::bigint
                 from internal.marche_offres m where m.etat = 'vendue' and m.ferme_le >= v_30),
      'demandes', (select round(extract(epoch from percentile_cont(0.5) within group (order by d.ferme_le - d.cree_le)))::bigint
                   from internal.marche_demandes d where d.etat = 'servie' and d.ferme_le >= v_30)
    ),

    -- Les objets les plus demandés et les plus en vente maintenant, huit chacun.
    'plus_demandes', (
      select coalesce(jsonb_agg(jsonb_build_object('emplacement', g.emplacement, 'objet', g.objet, 'nombre', g.nombre, 'prix', g.prix) order by g.nombre desc, g.prix desc, g.emplacement, g.objet), '[]'::jsonb)
      from (
        select d.emplacement, d.objet, count(*) as nombre, max(d.prix) as prix
        from internal.marche_demandes d where d.etat = 'ouverte' and d.expire_le > v_maintenant
        group by 1, 2 order by 3 desc, 4 desc, 1, 2 limit 8
      ) g
    ),
    'plus_offerts', (
      select coalesce(jsonb_agg(jsonb_build_object('emplacement', g.emplacement, 'objet', g.objet, 'nombre', g.nombre, 'prix', g.prix) order by g.nombre desc, g.prix, g.emplacement, g.objet), '[]'::jsonb)
      from (
        select m.emplacement, m.objet, count(*) as nombre, min(m.prix) as prix
        from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le > v_maintenant
        group by 1, 2 order by 3 desc, 4, 1, 2 limit 8
      ) g
    ),

    -- Les quinze dernières ventes gardées, sans nom : l'objet, le prix, celui de la boutique, la voie, et s'il était hors du
    -- rayon à l'heure de la vente (null avant la rotation).
    'dernieres_ventes', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'le', v.le, 'emplacement', v.emplacement, 'objet', v.objet, 'prix', v.prix,
          'prix_boutique', internal.marche_plafond(v.emplacement, v.objet),
          'voie', v.voie,
          'hors_rayon', case when v.le < internal.boutique_tournante_en_place() then null else not internal.boutique_en_rayon(v.emplacement, v.objet, v.le) end)
        order by v.le desc), '[]'::jsonb)
      from (
        select x.le, x.emplacement, x.objet, x.prix, x.voie
        from (
          select m.ferme_le as le, m.emplacement, m.objet, m.prix, 'offre' as voie from internal.marche_offres m where m.etat = 'vendue'
          union all
          select d.ferme_le, d.emplacement, d.objet, d.prix, 'demande' from internal.marche_demandes d where d.etat = 'servie'
        ) x
        order by x.le desc
        limit 15
      ) v
    )
  );
end $$;

revoke all on function public.get_village_marche() from public, anon, authenticated;
grant execute on function public.get_village_marche() to authenticated;
