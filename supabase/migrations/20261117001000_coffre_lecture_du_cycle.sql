-- La lecture du cycle du coffre (demandes du pilote, 17 novembre 2026, docs/DIRECTION.md, « Le coffre du druide ») : parmi
-- les idées proposées, il a retenu des mots à la hauteur du niveau de la manche, un gardien qui se souvient de qui l'a
-- déjà battu dans le cycle, et le tableau d'honneur posté quand la quinzième manche tombe.
--
-- Le robot a besoin, pour cela, de trois choses que le serveur seul sait :
-- - le rang qu'aura la prochaine manche, pour choisir un mot de son niveau avant de l'ouvrir (« rang_suivant ») ;
-- - qui a ouvert chaque coffre du cycle en cours, pour la mémoire du gardien ;
-- - ce que chaque coffre a versé à son gagnant, cagnottes et primes du journal des statères, pour le tableau d'honneur.
--
-- public.coffre_cycle(manche) rend tout cela pour le cycle de quinze manches où se trouve cette manche ; sans manche
-- donnée, celui de la dernière manche. Sans cycle lancé (cycle_base vide), il rend « cycle » faux, aucun rang, aucune
-- manche. Une lecture, sans rien écrire ; ce n'est pas un solde : seuls les gains du coffre, déjà annoncés un par un dans
-- le salon. Réservée à la clé de service de la fonction code-discord. Rejouée, la migration ne change rien.

create or replace function public.coffre_cycle(p_manche bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select (select g.cycle_base from internal.coffre_reglages g where g.id) as base
  ),
  rangs as (
    select m.id, m.trouvee_le, m.gagnant_discord_id, m.gagnant_nom, row_number() over (order by m.id) as n
    from internal.coffre_manches m, r
    where r.base is not null and m.id > r.base
  ),
  bloc as (
    select (greatest(coalesce((select g.n from rangs g where g.id = p_manche), (select max(g.n) from rangs g), 1), 1) - 1) / 15 as b
  )
  select jsonb_build_object(
    'ok', true,
    'cycle', (select r.base is not null from r),
    'rang_suivant', case when (select r.base from r) is null then null else 1 + ((select count(*) from rangs)::integer % 15) end,
    'manches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rang', 1 + ((g.n - 1) % 15),
        'discord_id', g.gagnant_discord_id,
        'nom', g.gagnant_nom,
        'stateres', coalesce((select sum(v.montant) from internal.stateres_mouvements v
                              where v.nature in ('coffre_gain', 'coffre_prime') and v.ref = 'manche/' || g.id::text), 0)) order by g.n)
      from rangs g, bloc
      where g.trouvee_le is not null and g.gagnant_discord_id is not null and (g.n - 1) / 15 = bloc.b), '[]'::jsonb))
$$;

revoke all on function public.coffre_cycle(bigint) from public, anon, authenticated;
grant execute on function public.coffre_cycle(bigint) to service_role;
