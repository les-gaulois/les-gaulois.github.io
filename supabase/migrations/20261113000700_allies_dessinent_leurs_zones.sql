-- Les joueurs alliés dessinent les zones de leur clan, voulu par le pilote le 13 novembre 2026 (« Oui, prépare-le », à la
-- question : « Les alliés doivent-ils pouvoir dessiner eux-mêmes les zones de leur clan ? »).
--
-- Un allié accepté crée, modifie et supprime les zones chargées de son propre clan, et seulement celles-là : ni celles d'un
-- autre clan, ni celles de toute l'alliance. Vingt zones au plus par clan pour un allié, dans les quatre-vingts de
-- l'alliance. L'encadrement de GAL garde la main sur toutes les zones, comme avant. Un Gaulois validé hors de l'encadrement
-- ne dessine toujours pas : les zones de GAL restent celles de l'encadrement.
--
-- Chaque zone dit désormais qui l'a dessinée ou modifiée en dernier (« [LUX] Pseudo », le nom sur la carte de l'alliance,
-- tant que ce compte y a accès) et si l'appelant peut la modifier (`can_edit`), décidé ici et revérifié à chaque écriture.
--
-- Elle vient après 20261113000600_zones_sans_chevauchement.sql et en garde la règle : une zone ne passe jamais sur une
-- autre (`zone_overlap`), bloc recopié tel quel dans `save_alliance_zone`. À coller après elle.
--
-- Cette migration ne fait qu'ajouter : une fonction, et de nouvelles versions de trois fonctions des migrations
-- 20261113000400, 20261113000500 et 20261113000600. Aucune table ni aucune donnée n'est retirée.

/* ---------- Le nom d'un compte sur la carte de l'alliance ---------- */

-- « [LUX] Pseudo » : le clan et le nom que la carte de l'alliance montre pour ce compte. `null` sans accès à la carte (compte
-- effacé, allié retiré ou parti, clan sorti de notre alliance) : son nom n'est plus affiché.
create or replace function internal.map_name(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select '[' || (m ->> 'tag') || '] ' || (m ->> 'name')
  from (select internal.map_access(p_user) as m) s
  where p_user is not null and m is not null
$$;
revoke all on function internal.map_name(uuid) from public, anon, authenticated;

/* ---------- Les zones : l'encadrement, et chaque allié pour son clan ---------- */

-- Crée (`p_id` vide) ou remplace une zone. Le masque arrive en base 64 : un bit par pixel du cadre, ligne après ligne.
-- Le serveur compte lui-même les pixels, refuse un masque vide ou de la mauvaise taille, et un clan hors de notre alliance.
-- L'encadrement dessine pour tout clan de notre alliance ou pour toute l'alliance. Un allié accepté, seulement pour son
-- clan : la zone créée ou modifiée doit être chargée de son clan, avant comme après. Quatre-vingts zones au plus, dont vingt
-- au plus par clan pour un allié. Comme depuis 20261113000600, une zone ne passe jamais sur une autre (`zone_overlap`),
-- vérifié sous le verrou des zones.
create or replace function public.save_alliance_zone(p_id bigint, p_title text, p_tag text, p_x integer, p_y integer, p_w integer, p_h integer, p_mask text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_staff boolean;
  v_actor uuid;
  v_title text;
  v_tag text;
  v_avant text;
  v_mask bytea;
  v_bits integer;
  v_rest integer;
  v_pixels integer;
  v_id bigint;
  v_detail text;
  v_new varbit;
  v_old varbit;
  v_zone record;
  v_x0 integer;
  v_len integer;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_access := internal.require_map_access();
    v_staff := coalesce((v_access ->> 'staff')::boolean, false);
    if v_staff then
      -- L'encadrement, comme avant : un Gaulois validé, officier au moins.
      v_actor := internal.require_rank(2);
    elsif v_access ->> 'kind' = 'allie' then
      v_actor := auth.uid();
    else
      perform internal.fail('forbidden');
    end if;
    if internal.our_alliance() is null then perform internal.fail('no_alliance'); end if;
    v_title := internal.clean_label(p_title, 2, 40, 'invalid_zone');
    if p_tag is not null and btrim(p_tag) <> '' then
      v_tag := internal.clean_tag(p_tag);
      if not exists (select 1 from internal.alliance_clans where tag = v_tag and alliance_id = internal.our_alliance()) then
        perform internal.fail('clan_not_allied');
      end if;
    end if;
    -- Un allié ne dessine que pour son clan : ni pour un autre, ni pour toute l'alliance.
    if not v_staff and (v_tag is null or v_tag <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;
    if p_x is null or p_y is null or p_w is null or p_h is null or p_x < 0 or p_y < 0 or p_w < 1 or p_h < 1
       or p_x + p_w > 16384 or p_y + p_h > 16384 or p_w::bigint * p_h > 1048576 then
      perform internal.fail('invalid_zone');
    end if;
    begin
      v_mask := decode(coalesce(p_mask, ''), 'base64');
    exception when others then
      perform internal.fail('invalid_zone');
    end;
    v_bits := p_w * p_h;
    if octet_length(v_mask) <> (v_bits + 7) / 8 then perform internal.fail('invalid_zone'); end if;
    -- Les bits du dernier octet après le dernier pixel restent à zéro : sinon, ils seraient comptés.
    v_rest := v_bits % 8;
    if v_rest > 0 and (get_byte(v_mask, octet_length(v_mask) - 1) >> v_rest) <> 0 then perform internal.fail('invalid_zone'); end if;
    v_pixels := bit_count(v_mask)::integer;
    if v_pixels = 0 then perform internal.fail('empty_zone'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_alliance_zones'));
    -- La zone reprise : elle existe, et un allié ne reprend pas celle d'un autre clan, ni celle de toute l'alliance. Avant
    -- la règle du chevauchement : un refus ne dit rien des zones d'un autre.
    if p_id is not null then
      select tag into v_avant from internal.alliance_zones where id = p_id for update;
      if not found then perform internal.fail('zone_not_found'); end if;
      if not v_staff and (v_avant is null or v_avant <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;
    end if;
    -- Une zone ne passe jamais sur une autre. Chaque masque devient une suite de bits dans l'ordre des pixels : en
    -- hexadécimal, les deux chiffres de chaque octet échangés, puis chaque chiffre lu à l'envers (le premier pixel est dans
    -- le bit de poids faible). Seules les lignes communes aux deux cadres se comparent, chacune d'un seul « et » binaire.
    v_new := ('x' || translate(regexp_replace(encode(v_mask, 'hex'), '(.)(.)', '\2\1', 'g'), '0123456789abcdef', '084c2a6e195d3b7f'))::varbit;
    for v_zone in
      select z.x, z.y, z.w, z.h, z.mask from internal.alliance_zones z
      where (p_id is null or z.id <> p_id)
        and z.x < p_x + p_w and p_x < z.x + z.w and z.y < p_y + p_h and p_y < z.y + z.h
    loop
      v_x0 := greatest(p_x, v_zone.x);
      v_len := least(p_x + p_w, v_zone.x + v_zone.w) - v_x0;
      v_old := ('x' || translate(regexp_replace(encode(v_zone.mask, 'hex'), '(.)(.)', '\2\1', 'g'), '0123456789abcdef', '084c2a6e195d3b7f'))::varbit;
      if exists (
        select 1 from generate_series(greatest(p_y, v_zone.y), least(p_y + p_h, v_zone.y + v_zone.h) - 1) as yy
        where bit_count(
          substring(v_new from (yy - p_y) * p_w + (v_x0 - p_x) + 1 for v_len)
          & substring(v_old from (yy - v_zone.y) * v_zone.w + (v_x0 - v_zone.x) + 1 for v_len)
        ) > 0
      ) then
        perform internal.fail('zone_overlap');
      end if;
    end loop;
    if p_id is null then
      if (select count(*) from internal.alliance_zones) >= 80 then perform internal.fail('too_many_zones'); end if;
      if not v_staff and (select count(*) from internal.alliance_zones where tag = v_tag) >= 20 then
        perform internal.fail('too_many_clan_zones');
      end if;
      insert into internal.alliance_zones (title, tag, x, y, w, h, mask, pixels, created_by, updated_by)
      values (v_title, v_tag, p_x, p_y, p_w, p_h, v_mask, v_pixels, v_actor, v_actor)
      returning id into v_id;
    else
      update internal.alliance_zones
      set title = v_title, tag = v_tag, x = p_x, y = p_y, w = p_w, h = p_h, mask = v_mask, pixels = v_pixels, updated_by = v_actor, updated_at = now()
      where id = p_id
      returning id into v_id;
    end if;
    perform internal.log_admin(v_actor, 'alliance_zone_saved', null, jsonb_build_object('zone', v_id, 'title', v_title, 'tag', v_tag, 'pixels', v_pixels, 'new', p_id is null, 'ally', not v_staff));
    return jsonb_build_object('ok', true, 'id', v_id, 'pixels', v_pixels);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;
revoke all on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) to authenticated;

-- Supprime une zone : l'encadrement, toute zone ; un allié, seulement une zone chargée de son clan.
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
    delete from internal.alliance_zones where id = p_id;
    perform internal.log_admin(v_actor, 'alliance_zone_deleted', null, jsonb_build_object('zone', p_id, 'title', v_title, 'tag', v_tag, 'ally', not v_staff));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;
revoke all on function public.delete_alliance_zone(bigint) from public, anon, authenticated;
grant execute on function public.delete_alliance_zone(bigint) to authenticated;

/* ---------- La carte : chaque zone dit qui l'a dessinée, et si l'appelant peut la modifier ---------- */

-- Comme la version de 20261113000500, avec `can_draw` (l'appelant peut dessiner) et deux champs de plus par zone : `by`, le
-- nom sur la carte de qui l'a dessinée ou modifiée en dernier (`null` s'il n'y a plus accès), et `can_edit`, vrai pour
-- l'encadrement et pour un allié sur une zone de son clan.
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
  v_clan := case when v_access ->> 'kind' = 'allie' then v_access ->> 'tag' end;
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
        'pixels', z.pixels, 'updated_at', z.updated_at,
        'by', internal.map_name(z.updated_by),
        -- Une zone de toute l'alliance n'a pas de clan : la comparaison vaudrait « inconnu », d'où le coalesce.
        'can_edit', v_staff or coalesce(z.tag = v_clan, false)
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
revoke all on function public.get_alliance_map() from public, anon, authenticated;
grant execute on function public.get_alliance_map() to authenticated;
