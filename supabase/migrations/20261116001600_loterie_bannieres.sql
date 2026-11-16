-- La bannière de chaque participant de la loterie du lundi (docs/DIRECTION.md, « La loterie du lundi » ; forme de la
-- réponse : `PartDeLoterie` de src/lib/village/contrat.ts).
--
-- Demande du pilote, 16 novembre 2026, sur la galerie des mises en page : « ajoute dans la case or, argent, bronze la
-- bannière du joueur ». Dans le nouvel écran de la loterie, chaque gagnant paraît dans la case de son lot devant la
-- bannière qu'il montre sur /gaulois. get_loterie doit donc la donner avec la tenue.
--
-- Ce qui change : internal.loterie_parts_json (depuis la 20261116001200), remplacée ligne pour ligne, avec un champ en
-- plus pour chaque part, `banniere` : la bannière montrée sur /gaulois (internal.gaulois.banniere), ou null. Elle vient de
-- internal.gaulois_montre, comme la tenue : pendant un essai du mode GOD, c'est celle de la copie. C'est un choix de
-- tenue, que la vitrine et /gaulois montrent déjà à tous les membres : rien de plus ne sort.
--
-- Qui peut quoi : inchangé. Aucune table, aucune colonne, aucune donnée touchée. Sans cette migration, le site marche :
-- les gagnants paraissent sans bannière. Rejouée, elle se remplace par la même.

-- La part de chacun dans un tirage, pour l'écran : [{ nom, tenue, banniere, moi, gratuits, achetes }], la plus grosse part
-- d'abord ; pour un tirage fait (`p_fait`), avec en plus `rang` et `billet`, ou null. Jamais un identifiant.
create or replace function internal.loterie_parts_json(p_uid uuid, p_tirage date, p_fait boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'nom', internal.village_nom(p.display_name, p.gaul_number),
        -- Le Gaulois que les autres voient : la copie pendant un essai du mode GOD.
        'tenue', m.tenue,
        -- Ajout de 20261116001600 : la bannière qu'il montre sur /gaulois, pour la case de son lot.
        'banniere', m.banniere,
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

revoke all on function internal.loterie_parts_json(uuid, date, boolean) from public, anon, authenticated;
