-- Les joueurs alliés acceptés par l'encadrement, demandé par le pilote le 13 novembre 2026 (« quand il se connecte avec
-- discord, il passe pas la vérif du staff ? ») : le lien d'invitation ne suffit plus. Le joueur qui l'ouvre attend que
-- l'encadrement le reconnaisse à son nom Discord et l'accepte, dans la gestion de la carte de l'alliance. Un lien transféré
-- à quelqu'un d'autre ne lui ouvre donc plus rien sans cet accord.
--
-- Cette migration ne fait qu'ajouter : deux colonnes, trois fonctions, et de nouvelles versions de cinq fonctions de la
-- migration 20261113000400. Les alliés déjà entrés restent acceptés. Aucune donnée n'est retirée.

/* ---------- L'accord de l'encadrement ---------- */

-- `approved_at` vide : le joueur a ouvert son lien et attend. Les alliés d'avant cette migration sont acceptés, une seule
-- fois : un second passage du fichier n'accepte personne.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'internal' and table_name = 'alliance_allies' and column_name = 'approved_at'
  ) then
    alter table internal.alliance_allies add column approved_at timestamptz;
    alter table internal.alliance_allies add column approved_by uuid references public.profiles (user_id) on delete set null;
    update internal.alliance_allies set approved_at = joined_at where approved_at is null;
  end if;
end $$;

-- Comme avant, mais un allié n'entre qu'une fois accepté.
create or replace function internal.map_access(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p.status = 'validated' then jsonb_build_object(
      'kind', 'gaulois',
      'tag', internal.site_clan(),
      'name', coalesce(internal.member_pseudo(p.user_id), p.display_name),
      'rank', internal.rank_of(p.role),
      'staff', internal.rank_of(p.role) >= 2)
    when p.status = 'pending' and a.user_id is not null and a.approved_at is not null and a.tag <> internal.site_clan()
      and exists (select 1 from internal.alliance_clans c where c.tag = a.tag and c.alliance_id = internal.our_alliance())
      then jsonb_build_object('kind', 'allie', 'tag', a.tag, 'name', a.alias, 'rank', 0, 'staff', false)
    else null
  end
  from public.profiles p
  left join internal.alliance_allies a on a.user_id = p.user_id
  where p.user_id = p_user
$$;

-- Le joueur qui a ouvert son lien et attend l'accord : son clan, le nom qu'il a choisi et depuis quand. `null` sinon.
create or replace function internal.ally_waiting(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('tag', a.tag, 'alias', a.alias, 'since', a.joined_at)
  from internal.alliance_allies a
  join public.profiles p on p.user_id = a.user_id
  where a.user_id = p_user and a.approved_at is null and p.status = 'pending'
$$;

/* ---------- Ce que lit le joueur ---------- */

create or replace function public.get_map_access() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select status into v_status from public.profiles where user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  return jsonb_build_object('ok', true, 'access', internal.map_access(v_uid), 'waiting', internal.ally_waiting(v_uid));
end $$;

-- Comme avant, avec en plus, pour un compte sans accès, sa demande en attente ; et, pour l'encadrement, l'accord de chaque
-- allié (ceux qui attendent d'abord).
create or replace function public.get_alliance_map() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_access jsonb;
  v_staff boolean;
begin
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select status into v_status from public.profiles where user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  v_access := internal.map_access(v_uid);
  if v_access is null then return jsonb_build_object('ok', true, 'access', null, 'waiting', internal.ally_waiting(v_uid)); end if;
  v_staff := coalesce((v_access ->> 'staff')::boolean, false);
  perform internal.alliance_purge();
  return jsonb_build_object(
    'ok', true,
    'access', v_access,
    'ours', internal.our_alliance(),
    'alliances', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'color', a.color,
        'clans', (select coalesce(jsonb_agg(c.tag order by c.tag), '[]') from internal.alliance_clans c where c.alliance_id = a.id)
      ) order by a.id), '[]')
      from internal.alliances a
    ),
    'troops', (
      select coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'troops', t.troops, 'by', t.declared_name, 'at', t.declared_at) order by t.tag), '[]')
      from internal.alliance_troops t
      join internal.alliance_clans c on c.tag = t.tag and c.alliance_id = internal.our_alliance()
    ),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', z.id, 'title', z.title, 'tag', z.tag, 'x', z.x, 'y', z.y, 'w', z.w, 'h', z.h,
        'mask', translate(encode(z.mask, 'base64'), E'\n', ''),
        'pixels', z.pixels, 'updated_at', z.updated_at
      ) order by z.id), '[]')
      from internal.alliance_zones z
    ),
    'allies', case when v_staff then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'number', p.gaul_number, 'alias', a.alias, 'tag', a.tag, 'discord_name', l.discord_name, 'joined_at', a.joined_at,
        'approved', a.approved_at is not null,
        'active', internal.map_access(a.user_id) is not null
      ) order by a.approved_at is not null, a.tag, lower(a.alias)), '[]')
      from internal.alliance_allies a
      join public.profiles p on p.user_id = a.user_id
      left join public.private_links l on l.user_id = a.user_id
    ) else null end,
    'invites', case when v_staff then (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'tag', i.tag, 'note', i.note, 'created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at desc), '[]')
      from internal.alliance_invites i
      where i.used_at is null and i.expires_at > now()
    ) else null end
  );
end $$;

-- Comme avant, mais le joueur qui accepte attend ensuite l'accord de l'encadrement. Une nouvelle invitation acceptée (pour
-- un autre clan) demande un nouvel accord.
create or replace function public.accept_alliance_invite(p_token text, p_alias text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_alias text;
  v_invite internal.alliance_invites;
  v_detail text;
begin
  if internal.limit_exceeded(10) then return internal.error_json('rate_limited', ''); end if;
  begin
    if v_uid is null then perform internal.fail('not_signed_in'); end if;
    select status into v_status from public.profiles where user_id = v_uid;
    if not found then perform internal.fail('not_signed_in'); end if;
    if v_status = 'suspended' then perform internal.fail('suspended'); end if;
    if v_status = 'validated' then perform internal.fail('already_gaulois'); end if;
    if not exists (select 1 from public.private_links where user_id = v_uid and discord_id is not null) then
      perform internal.fail('discord_required');
    end if;
    if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then perform internal.fail('invite_invalid'); end if;
    v_alias := internal.clean_label(p_alias, 2, 24, 'invalid_alias');
    update internal.alliance_invites set used_by = v_uid, used_at = now()
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and used_at is null and expires_at > now()
      and tag <> internal.site_clan()
      and exists (select 1 from internal.alliance_clans c where c.tag = alliance_invites.tag and c.alliance_id = internal.our_alliance())
    returning * into v_invite;
    if v_invite.id is null then perform internal.fail('invite_invalid'); end if;
    insert into internal.alliance_allies (user_id, tag, alias, invited_by) values (v_uid, v_invite.tag, v_alias, v_invite.created_by)
    on conflict (user_id) do update
      set tag = excluded.tag, alias = excluded.alias, invited_by = excluded.invited_by, joined_at = now(), approved_at = null, approved_by = null;
    perform internal.log_admin(v_uid, 'alliance_ally_requested', v_uid, jsonb_build_object('tag', v_invite.tag));
    return jsonb_build_object('ok', true, 'access', internal.map_access(v_uid), 'waiting', internal.ally_waiting(v_uid));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- L'encadrement accepte ou refuse ---------- */

-- Accepte (`p_approve` vrai) ou refuse un joueur qui attend, par son numéro de compte. Refusé, il perd sa place : il lui
-- faudra une nouvelle invitation.
create or replace function public.approve_alliance_ally(p_number integer, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_target uuid;
  v_row internal.alliance_allies;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_approve is null then perform internal.fail('invalid_request'); end if;
    select user_id into v_target from public.profiles where gaul_number = p_number;
    if p_approve then
      update internal.alliance_allies set approved_at = now(), approved_by = v_actor
      where user_id = v_target and approved_at is null
      returning * into v_row;
    else
      delete from internal.alliance_allies where user_id = v_target and approved_at is null returning * into v_row;
    end if;
    if v_row.user_id is null then perform internal.fail('ally_not_found'); end if;
    perform internal.log_admin(v_actor, case when p_approve then 'alliance_ally_approved' else 'alliance_ally_refused' end, v_target, jsonb_build_object('tag', v_row.tag));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Pour la liste des comptes de la Direction : quels comptes sont des joueurs alliés, acceptés ou en attente, sans rien lire
-- d'autre de la carte de l'alliance.
create or replace function public.list_alliance_allies() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  begin
    perform internal.require_rank(2);
    return jsonb_build_object('ok', true, 'allies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'number', p.gaul_number, 'tag', a.tag, 'alias', a.alias, 'approved', a.approved_at is not null,
        'active', internal.map_access(a.user_id) is not null
      ) order by p.gaul_number), '[]')
      from internal.alliance_allies a
      join public.profiles p on p.user_id = a.user_id
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Comme avant ; une demande annulée avant l'accord se note autrement qu'un départ : le joueur n'était jamais entré.
create or replace function public.leave_alliance_map() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_row internal.alliance_allies;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  delete from internal.alliance_allies where user_id = v_uid returning * into v_row;
  if v_row.user_id is null then return internal.error_json('ally_not_found', ''); end if;
  perform internal.log_admin(v_uid, case when v_row.approved_at is null then 'alliance_ally_cancelled' else 'alliance_ally_left' end, v_uid, jsonb_build_object('tag', v_row.tag));
  return jsonb_build_object('ok', true);
end $$;

/* ---------- Règles d'accès ---------- */

revoke all on function internal.ally_waiting(uuid) from public, anon, authenticated;
revoke all on function internal.map_access(uuid) from public, anon, authenticated;
revoke all on function public.get_map_access() from public, anon, authenticated;
revoke all on function public.get_alliance_map() from public, anon, authenticated;
revoke all on function public.accept_alliance_invite(text, text) from public, anon, authenticated;
revoke all on function public.approve_alliance_ally(integer, boolean) from public, anon, authenticated;
revoke all on function public.list_alliance_allies() from public, anon, authenticated;
revoke all on function public.leave_alliance_map() from public, anon, authenticated;

grant execute on function public.get_map_access() to authenticated;
grant execute on function public.get_alliance_map() to authenticated;
grant execute on function public.accept_alliance_invite(text, text) to authenticated;
grant execute on function public.approve_alliance_ally(integer, boolean) to authenticated;
grant execute on function public.list_alliance_allies() to authenticated;
grant execute on function public.leave_alliance_map() to authenticated;
