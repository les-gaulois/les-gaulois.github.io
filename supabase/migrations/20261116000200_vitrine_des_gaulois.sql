-- La vitrine des Gaulois, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; forme de la réponse :
-- src/lib/village/contrat.ts, `GauloisDeLaPlace` ; lecture : src/lib/village/vitrine.ts).
--
-- Demande du pilote, 15 et 16 novembre 2026 : « une vitrine dans la page gaulois avec tous les gaulois avec leurs
-- cosmétiques + nom », puis, sur les cartes choisies, « derrière leur bannière qu'ils ont choisie en faible opacité ». Le
-- nouvel onglet « La vitrine » de « Mon Gaulois » lit get_village, la place de l'ancien village : chaque Gaulois y paraît
-- avec sa tenue, et il faut en plus son familier et sa bannière.
--
-- Qui peut quoi (inchangé) :
-- - get_village (remplacée, depuis la 20261114001000, ligne pour ligne) : un compte validé ou de l'encadrement ; les
--   Gaulois de tous les comptes validés, par ordre de création, avec en plus, pour chacun, `familier` (le familier montré à
--   côté du Gaulois, internal.gaulois.familier) et `banniere` (la bannière montrée sur /gaulois, internal.gaulois.banniere),
--   ou null. Ce sont des choix de tenue, que /gaulois montre déjà sur Discord, comme la tenue que la place donnait à tous :
--   aucune réserve de pseudo public ne s'y applique. La place ne dit toujours pas ce qu'un membre possède, ni son solde.
--
-- Aucune table, aucune colonne, aucune donnée touchée : une fonction remplacée par la même, avec deux champs en plus.
-- Rejouée, elle se remplace par la même.

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
            then v.replique end,
          -- Ajout de 20261114001000 : les plaques de la forge sur ce qu'il porte, pour lui toujours, pour les autres
          -- seulement avec un pseudo public (la règle de partie_le).
          'gravures', case when g.user_id = v_uid or internal.member_pseudo(g.user_id) is not null
            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end,
          -- Ajout de 20261116000200 : le familier et la bannière qu'il montre, pour la vitrine.
          'familier', g.familier,
          'banniere', g.banniere)
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
