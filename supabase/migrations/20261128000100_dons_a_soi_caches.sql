-- Les dons à soi-même ne s'affichent plus dans « Derniers dons » (Direction, onglet Village).
-- Demande du pilote, 28 novembre 2026 : « fait en sorte que tout les don concernant jod a l'avenir ne s'affiche plus ».
-- Le seul titulaire du panneau est Jod : la liste qu'il lit ne montre plus les dons dont il est lui-même le bénéficiaire,
-- d'avant comme d'après. Rien n'est effacé : ces dons restent dans internal.stateres_dons, dans le journal des statères
-- (nature 'don') et dans le journal de l'équipe. Seule change la lecture : public.get_stateres_don, la même qu'en
-- 20261117000200 avec une condition de plus (d.user_id <> v_uid).

create or replace function public.get_stateres_don() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not internal.stateres_don_permis() then
    return jsonb_build_object('ok', true, 'permis', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'permis', true,
    'plafond', internal.stateres_don_plafond(),
    'membres', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 'nom', internal.village_nom(p.display_name, p.gaul_number), 'numero', p.gaul_number)
        order by lower(internal.village_nom(p.display_name, p.gaul_number)), p.user_id)
      from public.profiles p
      where p.status = 'validated'), '[]'::jsonb),
    'dons', coalesce((
      select jsonb_agg(jsonb_build_object('le', t.cree_le, 'nom', t.nom, 'montant', t.montant, 'motif', t.motif) order by t.cree_le desc, t.id desc)
      from (
        select d.id, d.cree_le, d.montant, d.motif, internal.village_nom(p.display_name, p.gaul_number) as nom
        from internal.stateres_dons d
        join public.profiles p on p.user_id = d.user_id
        where d.user_id <> v_uid
        order by d.cree_le desc, d.id desc
        limit 20
      ) t), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_stateres_don() from public, anon, authenticated;
grant execute on function public.get_stateres_don() to authenticated;
