-- « Refaire la demande » : un admin remet en attente un compte validé que la liste officielle ne trouve pas,
-- pour que la personne indique son pseudo OpenFront exact (docs/DIRECTION.md, « L'administration »).
--
-- Un compte validé hors de la liste reste lié à l'empreinte du texte tapé dans sa demande, souvent un pseudo,
-- alors que la liste ne garde que celle de l'identifiant public : il n'y est jamais retrouvé, et un compte
-- validé ne peut plus faire de demande. Cette fonction défait le lien et la validation. Un rôle de l'encadrement
-- est retiré : sinon, il reviendrait tout seul avec la nouvelle validation, sans que l'officier qui valide le voie.
-- Les choix et l'historique du compte restent. La nouvelle demande suit le chemin ordinaire, jusqu'à un officier.

create function public.reset_member_link(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_target public.profiles;
  v_hash text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_user = v_actor then perform internal.fail('not_on_yourself'); end if;
    select * into v_target from public.profiles where user_id = p_user for update;
    if not found then perform internal.fail('user_not_found'); end if;
    if v_target.status <> 'validated' then perform internal.fail('target_not_validated'); end if;
    -- Comme une suspension : un admin ne touche ni un autre admin ni le fondateur.
    if internal.rank_of(v_target.role) >= internal.current_rank() then perform internal.fail('forbidden'); end if;
    select openfront_hash into v_hash from public.private_links where user_id = p_user for update;
    -- Un compte que la liste trouve est déjà relié au bon joueur : rien à refaire.
    if v_hash is not null and exists (select 1 from public.clan_roster c where c.public_id_hash = v_hash) then
      perform internal.fail('member_in_roster');
    end if;

    update public.private_links set openfront_hash = null, openfront_username = null, linked_at = null where user_id = p_user;
    -- Le nom venait du lien : le compte reprend celui de sa création.
    update public.profiles
    set status = 'pending', validated_at = null, status_reason = null, role = 'member', display_name = 'Gaulois n° ' || gaul_number
    where user_id = p_user;
    -- Le journal lit le nom d'aujourd'hui : il garde aussi celui d'avant, s'il change.
    perform internal.log_admin(v_actor, 'member_link_reset', p_user, jsonb_build_object('name', v_target.display_name));
    -- Le rôle retiré se lit au journal comme tout changement de rôle, et se redonne après la validation.
    if v_target.role <> 'member' then
      perform internal.log_admin(v_actor, 'role_changed', p_user, jsonb_build_object('from', v_target.role, 'to', 'member'));
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.reset_member_link(uuid) from public, anon, authenticated;
grant execute on function public.reset_member_link(uuid) to authenticated;
