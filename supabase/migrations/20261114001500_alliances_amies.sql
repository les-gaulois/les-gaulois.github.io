-- Les alliances amies, demandées par le pilote le 14 novembre 2026 (« faire en sorte que alliance coalitions ally soit
-- invitable car c'est des ally de notre alliance ») : l'encadrement de GAL marque une autre alliance « alliée de la nôtre »,
-- et les joueurs de ses clans s'invitent comme ceux de notre alliance. Ils entrent sur la carte de l'alliance après l'accord
-- de l'encadrement, jamais au QG, y lisent les alliances, les zones et la discussion, et y écrivent. Les troupes et les
-- zones restent celles des clans de notre alliance : un joueur d'une alliance amie n'en déclare ni n'en dessine.
-- Une alliance n'est plus amie : ses joueurs perdent l'accès, comme un clan sorti de notre alliance, et le retrouvent si
-- elle le redevient.
--
-- Elle vient après 20261113001100_zones_des_allies_acceptees.sql. Elle reprend telles quelles internal.map_access et
-- accept_alliance_invite (20261113000500), create_alliance_invite (20261113000400), delete_alliance_zone
-- (20261113000700) et get_alliance_map (20261113001100), avec les changements marqués « Ajout de 20261114001500 ».
-- Cette migration ne fait qu'ajouter : une colonne, deux fonctions, et de nouvelles versions de cinq fonctions. Aucune
-- alliance n'est amie au départ. Aucune donnée n'est retirée. Rejouée, elle ne change rien.

/* ---------- L'alliance amie ---------- */

-- `friend` : l'encadrement a marqué cette alliance alliée de la nôtre. Faux pour toutes les alliances existantes.
alter table internal.alliances add column if not exists friend boolean not null default false;

-- Un clan allié : rangé dans notre alliance, ou dans une alliance marquée alliée de la nôtre. Rien tant que GAL n'est dans
-- aucune alliance. GAL lui-même en est (il est dans la nôtre) : chaque appelant qui l'exclut le dit.
create or replace function internal.allied_clan(p_tag text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select internal.our_alliance() is not null and exists (
    select 1 from internal.alliance_clans c
    join internal.alliances a on a.id = c.alliance_id
    where c.tag = p_tag and (c.alliance_id = internal.our_alliance() or a.friend)
  )
$$;

-- L'encadrement marque une alliance alliée de la nôtre (`p_friend` vrai), ou plus. Notre alliance ne se marque pas : la
-- marque lui resterait si GAL changeait d'alliance. Un geste qui ne change rien ne va pas au journal.
create or replace function public.set_alliance_friend(p_id bigint, p_friend boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text;
  v_avant boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_friend is null then perform internal.fail('invalid_request'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_alliances'));
    select name, friend into v_name, v_avant from internal.alliances where id = p_id for update;
    if v_name is null then perform internal.fail('alliance_not_found'); end if;
    if p_friend and p_id = internal.our_alliance() then perform internal.fail('invalid_request'); end if;
    if v_avant = p_friend then return jsonb_build_object('ok', true); end if;
    update internal.alliances set friend = p_friend, updated_at = now() where id = p_id;
    perform internal.log_admin(v_actor, 'alliance_friend_set', null, jsonb_build_object('alliance', p_id, 'name', v_name, 'friend', p_friend));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Qui entre : la version de 20261113000500, avec les alliances amies ---------- */

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
      -- Ajout de 20261114001500 : un clan de notre alliance, ou d'une alliance amie.
      and internal.allied_clan(a.tag)
      then jsonb_build_object('kind', 'allie', 'tag', a.tag, 'name', a.alias, 'rank', 0, 'staff', false)
    else null
  end
  from public.profiles p
  left join internal.alliance_allies a on a.user_id = p.user_id
  where p.user_id = p_user
$$;

/* ---------- L'invitation : la version de 20261113000400, avec les alliances amies ---------- */

create or replace function public.create_alliance_invite(p_tag text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_tag text;
  v_note text;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '7 days';
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    v_tag := internal.clean_tag(p_tag);
    v_note := internal.clean_label(p_note, 2, 24, 'invalid_invite');
    -- Ajout de 20261114001500 : un clan de notre alliance, ou d'une alliance amie, jamais GAL.
    if v_tag = internal.site_clan() or not internal.allied_clan(v_tag) then
      perform internal.fail('clan_not_allied');
    end if;
    perform internal.alliance_purge();
    perform pg_advisory_xact_lock(hashtext('gal_alliance_invites'));
    if (select count(*) from internal.alliance_invites where used_at is null and expires_at > now()) >= 30 then
      perform internal.fail('too_many_invites');
    end if;
    insert into internal.alliance_invites (token_hash, tag, note, created_by, expires_at)
    values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_tag, v_note, v_actor, v_expires)
    returning id into v_id;
    perform internal.log_admin(v_actor, 'alliance_invite_created', null, jsonb_build_object('tag', v_tag));
    return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'expires_at', v_expires);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- L'acceptation : la version de 20261113000500, avec les alliances amies ---------- */

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
      -- Ajout de 20261114001500 : un clan de notre alliance, ou d'une alliance amie.
      and internal.allied_clan(alliance_invites.tag)
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

/* ---------- La carte : la version de 20261113001100, avec les alliances amies ---------- */

create or replace function public.get_alliance_map() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_access jsonb;
  v_staff boolean;
  v_clan text;
begin
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select status into v_status from public.profiles where user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  v_access := internal.map_access(v_uid);
  if v_access is null then return jsonb_build_object('ok', true, 'access', null, 'waiting', internal.ally_waiting(v_uid)); end if;
  v_staff := coalesce((v_access ->> 'staff')::boolean, false);
  -- Ajout de 20261114001500 : le clan d'un allié de notre alliance seulement. Celui d'une alliance amie ne dessine ni ne
  -- modifie aucune zone, et ne voit pas celles qui attendent l'accord, comme un Gaulois qui n'est pas de l'encadrement.
  v_clan := case when v_access ->> 'kind' = 'allie' and exists (
    select 1 from internal.alliance_clans c where c.tag = v_access ->> 'tag' and c.alliance_id = internal.our_alliance()
  ) then v_access ->> 'tag' end;
  perform internal.alliance_purge();
  return jsonb_build_object(
    'ok', true,
    'access', v_access,
    -- L'appelant peut-il dessiner une zone : l'encadrement, et un allié pour son clan. Absent d'un serveur d'avant cette
    -- migration : le site ne montre alors le dessin qu'à l'encadrement.
    'can_draw', v_staff or v_clan is not null,
    'ours', internal.our_alliance(),
    'alliances', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'color', a.color,
        -- Ajout de 20261114001500 : alliée de la nôtre.
        'friend', a.friend,
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
      -- Ajout de 20261113001100 : une zone qui attend l'accord ne se voit que de l'encadrement et des alliés de son clan ;
      -- les autres voient la version acceptée d'une zone modifiée depuis par un allié (`a`, dans `v`), ou rien.
      select coalesce(jsonb_agg(case when v.ancienne then jsonb_build_object(
        'id', z.id, 'title', z.previous ->> 'title', 'tag', z.previous ->> 'tag', 'x', a.x, 'y', a.y, 'w', a.w, 'h', a.h,
        'mask', z.previous ->> 'mask',
        'pixels', (z.previous ->> 'pixels')::integer, 'updated_at', z.previous ->> 'updated_at',
        'by', internal.map_name((z.previous ->> 'updated_by')::uuid),
        'can_edit', false,
        'state', z.state,
        'rank', z.rank,
        'pending', false
      ) else jsonb_build_object(
        'id', z.id, 'title', z.title, 'tag', z.tag, 'x', z.x, 'y', z.y, 'w', z.w, 'h', z.h,
        'mask', translate(encode(z.mask, 'base64'), E'\n', ''),
        'pixels', z.pixels, 'updated_at', z.updated_at,
        'by', internal.map_name(z.updated_by),
        -- Une zone de toute l'alliance n'a pas de clan : la comparaison vaudrait « inconnu », d'où le coalesce.
        'can_edit', v_staff or coalesce(z.tag = v_clan, false),
        -- Ajout de 20261113001000 : son état, et sa place dans l'ordre des priorités.
        'state', z.state,
        'rank', z.rank,
        -- Ajout de 20261113001100 : elle attend l'accord ; la version acceptée qui reviendrait si l'encadrement refuse.
        'pending', z.approved_at is null,
        'previous', case when z.approved_at is null and z.previous is not null then jsonb_build_object('title', z.previous ->> 'title', 'x', a.x, 'y', a.y, 'w', a.w, 'h', a.h, 'mask', z.previous ->> 'mask') end
      ) end order by z.approved_at is null and not v.ancienne, z.rank nulls last, z.id), '[]')
      from internal.alliance_zones z
      cross join lateral (select z.approved_at is null and z.previous is not null and not (v_staff or coalesce(z.tag = v_clan, false)) as ancienne) v
      left join lateral internal.zone_previous(z.previous) a on true
      where z.approved_at is not null or v_staff or coalesce(z.tag = v_clan, false) or z.previous is not null
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

/* ---------- Supprimer une zone : la version de 20261113000700, avec les alliances amies ---------- */

create or replace function public.delete_alliance_zone(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_staff boolean;
  v_actor uuid;
  v_tag text;
  v_title text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_access := internal.require_map_access();
    v_staff := coalesce((v_access ->> 'staff')::boolean, false);
    if v_staff then
      v_actor := internal.require_rank(2);
    elsif v_access ->> 'kind' = 'allie' then
      v_actor := auth.uid();
    else
      perform internal.fail('forbidden');
    end if;
    select tag, title into v_tag, v_title from internal.alliance_zones where id = p_id for update;
    if not found then perform internal.fail('zone_not_found'); end if;
    if not v_staff and (v_tag is null or v_tag <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;
    -- Ajout de 20261114001500 : un allié d'une alliance amie ne supprime aucune zone, même chargée de son clan (un clan
    -- passé de notre alliance à une alliance amie garde les siennes, que seul l'encadrement retire).
    if not v_staff and not exists (select 1 from internal.alliance_clans c where c.tag = v_tag and c.alliance_id = internal.our_alliance()) then
      perform internal.fail('forbidden');
    end if;
    delete from internal.alliance_zones where id = p_id;
    perform internal.log_admin(v_actor, 'alliance_zone_deleted', null, jsonb_build_object('zone', p_id, 'title', v_title, 'tag', v_tag, 'ally', not v_staff));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

revoke all on function public.delete_alliance_zone(bigint) from public, anon, authenticated;
grant execute on function public.delete_alliance_zone(bigint) to authenticated;
revoke all on function internal.allied_clan(text) from public, anon, authenticated;
revoke all on function internal.map_access(uuid) from public, anon, authenticated;
revoke all on function public.set_alliance_friend(bigint, boolean) from public, anon, authenticated;
revoke all on function public.create_alliance_invite(text, text) from public, anon, authenticated;
revoke all on function public.accept_alliance_invite(text, text) from public, anon, authenticated;
revoke all on function public.get_alliance_map() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même l'accès à la carte de l'alliance, et le rang.
grant execute on function public.set_alliance_friend(bigint, boolean) to authenticated;
grant execute on function public.create_alliance_invite(text, text) to authenticated;
grant execute on function public.accept_alliance_invite(text, text) to authenticated;
grant execute on function public.get_alliance_map() to authenticated;
