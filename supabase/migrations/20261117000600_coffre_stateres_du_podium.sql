-- Les statères gagnés sur le podium de /perceurs (demande du pilote, 17 novembre 2026 : « ajouter, en plus des victoires,
-- la somme de statères gagnés au total », docs/DIRECTION.md, « Le coffre du druide »).
--
-- coffre_palmares, reprise ici en entier de 20261116001500_coffre_bannieres_du_podium.sql, rend un champ de plus par
-- perceur : 'stateres', la somme de ce que ses coffres de la semaine lui ont versé, cagnottes ('coffre_gain') et primes
-- ('coffre_prime') du journal des statères, retrouvées par la manche ('manche/<id>'). Zéro quand rien n'a été versé
-- (coffre ouvert sans compte ou sans cagnotte) : le robot n'écrit alors pas de somme.
-- Ce n'est pas un solde : seuls les gains du coffre, déjà annoncés un par un dans le salon à chaque coffre ouvert.
--
-- Aucune table ni donnée touchée, aucun statère créé. Mêmes paramètres : les droits restent, redits plus bas. Rejouée,
-- la migration ne change rien. Le robot déjà en ligne ignore le champ ajouté.

create or replace function public.coffre_palmares() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'depuis', date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris',
    'perceurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'discord_id', t.gagnant_discord_id,
        'nom', t.nom,
        'coffres', t.coffres,
        'stateres', t.stateres,
        'tenue', (select g.tenue from internal.coffre_gaulois(internal.coffre_compte(t.gagnant_discord_id)) g),
        'banniere', (select g.banniere from internal.coffre_gaulois(internal.coffre_compte(t.gagnant_discord_id)) g)) order by t.coffres desc, t.dernier asc)
      from (
        select m.gagnant_discord_id, count(*) as coffres, max(m.trouvee_le) as dernier,
               (array_agg(m.gagnant_nom order by m.trouvee_le desc))[1] as nom,
               coalesce(sum((select sum(v.montant) from internal.stateres_mouvements v
                             where v.nature in ('coffre_gain', 'coffre_prime') and v.ref = 'manche/' || m.id::text)), 0)::bigint as stateres
        from internal.coffre_manches m
        where m.trouvee_le >= date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
          and m.gagnant_discord_id is not null
        group by m.gagnant_discord_id
        order by count(*) desc, max(m.trouvee_le) asc
        limit 3
      ) t), '[]'::jsonb))
$$;

revoke all on function public.coffre_palmares() from public, anon, authenticated;
grant execute on function public.coffre_palmares() to service_role;
