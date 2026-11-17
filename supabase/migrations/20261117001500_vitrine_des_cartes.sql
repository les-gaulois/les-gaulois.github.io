-- La finition de carte dans la vitrine (docs/DIRECTION.md, « Le rayon Cartes » ; lecture : src/lib/village/vitrine.ts).
--
-- Demande du pilote, 17 novembre 2026 : « la carte dans la vitrine », pour que tout le clan compare ses cartes au même
-- endroit. La vitrine de « Mon Gaulois » montre, sur la carte de chaque Gaulois, la finition qu'il a choisie au rayon
-- « Cartes » (internal.gaulois.carte, migration 20261117001200).
--
-- Une seule fonction remplacée :
-- - get_village (depuis la 20261116000900, ligne pour ligne) : chaque Gaulois porte en plus `carte`, la finition qu'il
--   montre, ou null. Mêmes droits qu'avant : un compte validé, ou l'équipe. La finition n'est pas touchée par un essai en
--   mode GOD (on n'en achète pas pendant un essai) : elle se lit telle quelle. Rien d'autre n'est rendu : ni la liste de ses
--   finitions, ni un solde.
--
-- Aucune table, aucune colonne, aucune donnée touchée. Rejouée, elle se remplace par la même.

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
          'tenue', case when g.user_id = v_uid then g.tenue else m.tenue end,
          'moi', g.user_id = v_uid,
          'partie_le', d.debut,
          'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),
          'replique', case when v_bulles and v.replique_le > now() - interval '12 hours'
            and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))
            then v.replique end,
          -- Ajout de 20261114001000 : les plaques de la forge sur ce qu'il porte, pour lui toujours, pour les autres
          -- seulement avec un pseudo public (la règle de partie_le).
          'gravures', case when g.user_id = v_uid or (internal.member_pseudo(g.user_id) is not null and not m.essai)
            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end,
          -- Ajout de 20261116000200 : le familier et la bannière qu'il montre, pour la vitrine.
          'familier', case when g.user_id = v_uid then g.familier else m.familier end,
          'banniere', case when g.user_id = v_uid then g.banniere else m.banniere end,
          -- Ajout de 20261117001500 : la finition de carte qu'il montre, pour la vitrine (rayon « Cartes »).
          'carte', g.carte)
        order by g.created_at, g.user_id)
      from internal.gaulois g
      join public.profiles p on p.user_id = g.user_id
      join lateral internal.gaulois_montre(g.user_id) m on true
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
