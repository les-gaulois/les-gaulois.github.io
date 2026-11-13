-- Les zones des alliés acceptées par l'encadrement, voulu par le pilote le 13 novembre 2026 (« Oui, avec accord », à la
-- question : « L'équipe doit-elle accepter chaque zone dessinée par un allié ? »).
--
-- Une zone qu'un allié crée attend l'accord de l'encadrement de GAL avant de compter : elle ne se voit que de l'encadrement
-- et des alliés de son clan, n'a ni place dans l'ordre des priorités ni état à régler, ne s'annonce pas sur Discord, et ne
-- bloque pas le dessin d'une autre zone. Une zone acceptée qu'un allié modifie attend de même ; sa version acceptée est
-- gardée (`previous`) : les autres joueurs la voient encore, elle compte toujours pour le chevauchement, et elle revient si
-- l'encadrement refuse la modification. L'encadrement accepte (une zone nouvelle vient à la dernière place et s'annonce ;
-- une zone modifiée garde sa place) ou refuse (une zone nouvelle est effacée ; une zone modifiée retrouve sa version
-- acceptée). L'accord revérifie le chevauchement, et ne vaut que pour la version que l'encadrement a regardée. Dix zones
-- au plus attendent pour un clan, trente pour toute l'alliance. Les zones de l'encadrement comptent d'emblée, comme avant.
--
-- Elle vient après 20261113001000_zones_etats_epingle_annonces.sql, dont elle reprend telles quelles save_alliance_zone,
-- get_alliance_map, set_alliance_zone_state et order_alliance_zones, avec les ajouts marqués « Ajout de 20261113001100 ».
-- À coller après elle. Cette migration ne fait qu'ajouter : trois colonnes et des fonctions. Les zones déjà dessinées
-- restent acceptées. Aucune donnée n'est retirée. Rejouée, elle ne change rien.

/* ---------- L'accord ---------- */

-- `approved_at` vide : une zone d'allié qui attend l'accord. Les zones d'avant sont acceptées, une seule fois. Une zone
-- écrite sans dire si elle est acceptée l'est (valeur par défaut) : seule une zone d'allié écrit « pas encore ».
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'internal' and table_name = 'alliance_zones' and column_name = 'approved_at'
  ) then
    alter table internal.alliance_zones add column approved_at timestamptz;
    alter table internal.alliance_zones add column approved_by uuid references public.profiles (user_id) on delete set null;
    update internal.alliance_zones set approved_at = created_at where approved_at is null;
    alter table internal.alliance_zones alter column approved_at set default now();
  end if;
end $$;

-- La version acceptée d'une zone qu'un allié a modifiée depuis, en attendant l'accord : titre, clan, cadre, masque en base
-- 64, pixels, qui l'avait dessinée et quand, qui l'avait acceptée et quand. Vide sinon.
alter table internal.alliance_zones add column if not exists previous jsonb;

-- Le cadre et le masque de cette version acceptée. Aucune ligne sans version.
create or replace function internal.zone_previous(p jsonb) returns table (x integer, y integer, w integer, h integer, mask bytea)
language sql immutable as $$
  select (p ->> 'x')::integer, (p ->> 'y')::integer, (p ->> 'w')::integer, (p ->> 'h')::integer, decode(p ->> 'mask', 'base64')
  where p is not null
$$;

-- Une zone posée sur une zone acceptée, ou sur la version acceptée d'une zone qui attend ? Le calcul de save_alliance_zone
-- (migration 20261113000600), pour l'accord.
create or replace function internal.zone_overlaps(p_id bigint, p_x integer, p_y integer, p_w integer, p_h integer, p_mask bytea) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_new varbit;
  v_old varbit;
  v_zone record;
  v_x0 integer;
  v_len integer;
begin
  v_new := ('x' || translate(regexp_replace(encode(p_mask, 'hex'), '(.)(.)', '\2\1', 'g'), '0123456789abcdef', '084c2a6e195d3b7f'))::varbit;
  for v_zone in
    select z.x, z.y, z.w, z.h, z.mask from internal.alliance_zones z
    where (p_id is null or z.id <> p_id) and z.approved_at is not null
      and z.x < p_x + p_w and p_x < z.x + z.w and z.y < p_y + p_h and p_y < z.y + z.h
    union all
    select v.x, v.y, v.w, v.h, v.mask from internal.alliance_zones z
    cross join lateral internal.zone_previous(z.previous) v
    where (p_id is null or z.id <> p_id) and z.approved_at is null and z.previous is not null
      and v.x < p_x + p_w and p_x < v.x + v.w and v.y < p_y + p_h and p_y < v.y + v.h
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
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Trop de zones attendent l'accord : dix pour un clan, trente pour toute l'alliance. Un allié n'en dessine plus, ni ne fait
-- attendre une zone acceptée en la modifiant, avant la réponse de l'encadrement : deux clans ne bloquent pas les autres.
create or replace function internal.too_many_pending(p_tag text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select (select count(*) from internal.alliance_zones where approved_at is null) >= 30
    or (select count(*) from internal.alliance_zones where approved_at is null and tag = p_tag) >= 10
$$;

-- L'encadrement accepte (`p_approve` vrai) ou refuse une zone d'allié qui attend, dans la version qu'il a regardée :
-- `p_seen`, l'heure de sa dernière modification lue sur la carte. Si l'allié l'a modifiée depuis, rien ne se fait
-- (`zone_changed`) : l'encadrement ne valide jamais un dessin ni un nom qu'il n'a pas vus.
--  - Acceptée : une zone nouvelle vient à la dernière place et s'annonce sur Discord ; une zone modifiée garde sa place
--    (sauf si une autre l'a prise entre-temps : elle vient alors à la dernière), sa version acceptée d'avant est oubliée.
--  - Refusée : une zone nouvelle est effacée ; une zone modifiée retrouve sa version acceptée.
-- Le journal vise l'allié qui l'a dessinée : le dernier à l'avoir modifiée, sinon celui qui l'a créée (l'encadrement a pu
-- la retoucher avant de répondre).
create or replace function public.review_alliance_zone(p_id bigint, p_approve boolean, p_seen timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_zone internal.alliance_zones;
  v_allie uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_approve is null or p_seen is null then perform internal.fail('invalid_request'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_alliance_zones'));
    select * into v_zone from internal.alliance_zones where id = p_id and approved_at is null for update;
    if not found then perform internal.fail('zone_not_found'); end if;
    if v_zone.updated_at is distinct from p_seen then perform internal.fail('zone_changed'); end if;
    v_allie := case when exists (select 1 from internal.alliance_allies a where a.user_id = v_zone.updated_by) then v_zone.updated_by else v_zone.created_by end;
    if p_approve then
      if internal.our_alliance() is null then perform internal.fail('no_alliance'); end if;
      if v_zone.tag is not null and not exists (select 1 from internal.alliance_clans where tag = v_zone.tag and alliance_id = internal.our_alliance()) then
        perform internal.fail('clan_not_allied');
      end if;
      -- Quatre-vingts zones au plus : les zones acceptées, et celles qui attendent avec une version acceptée (elles gardent
      -- leur place). Une zone modifiée a déjà la sienne.
      if v_zone.previous is null and (select count(*) from internal.alliance_zones where approved_at is not null or previous is not null) >= 80 then
        perform internal.fail('too_many_zones');
      end if;
      if internal.zone_overlaps(p_id, v_zone.x, v_zone.y, v_zone.w, v_zone.h, v_zone.mask) then perform internal.fail('zone_overlap_review'); end if;
      update internal.alliance_zones
      set approved_at = now(), approved_by = v_actor, previous = null,
        rank = case
          when rank is not null and not exists (select 1 from internal.alliance_zones z where z.approved_at is not null and z.rank = alliance_zones.rank and z.id <> p_id) then rank
          else (select coalesce(max(z.rank), 0) + 1 from internal.alliance_zones z where z.approved_at is not null)
        end
      where id = p_id;
      perform internal.log_admin(v_actor, 'alliance_zone_approved', v_allie, jsonb_build_object('zone', p_id, 'title', v_zone.title, 'tag', v_zone.tag, 'new', v_zone.previous is null));
      if v_zone.previous is null then perform internal.announce_zone(p_id, true); end if;
    elsif v_zone.previous is not null then
      update internal.alliance_zones
      set title = v_zone.previous ->> 'title',
        tag = v_zone.previous ->> 'tag',
        x = (v_zone.previous ->> 'x')::integer,
        y = (v_zone.previous ->> 'y')::integer,
        w = (v_zone.previous ->> 'w')::integer,
        h = (v_zone.previous ->> 'h')::integer,
        mask = decode(v_zone.previous ->> 'mask', 'base64'),
        pixels = (v_zone.previous ->> 'pixels')::integer,
        -- Un compte effacé entre-temps ne se retrouve pas : plus de nom.
        updated_by = (select p.user_id from public.profiles p where p.user_id = (v_zone.previous ->> 'updated_by')::uuid),
        updated_at = coalesce((v_zone.previous ->> 'updated_at')::timestamptz, now()),
        approved_at = coalesce((v_zone.previous ->> 'approved_at')::timestamptz, now()),
        approved_by = (select p.user_id from public.profiles p where p.user_id = (v_zone.previous ->> 'approved_by')::uuid),
        previous = null
      where id = p_id;
      perform internal.log_admin(v_actor, 'alliance_zone_refused', v_allie, jsonb_build_object('zone', p_id, 'title', v_zone.title, 'tag', v_zone.tag, 'restored', true));
    else
      delete from internal.alliance_zones where id = p_id;
      perform internal.log_admin(v_actor, 'alliance_zone_refused', v_allie, jsonb_build_object('zone', p_id, 'title', v_zone.title, 'tag', v_zone.tag, 'restored', false));
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les zones : la version de 20261113001000, avec l'accord pour les zones des alliés ---------- */

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
        -- Ajout de 20261113001100 : seules les zones acceptées comptent, et la version acceptée d'une zone qu'un allié a
        -- modifiée depuis (`previous`) ; une zone qui attend ne bloque rien, l'accord revérifie.
        and z.approved_at is not null
        and z.x < p_x + p_w and p_x < z.x + z.w and z.y < p_y + p_h and p_y < z.y + z.h
      union all
      select v.x, v.y, v.w, v.h, v.mask from internal.alliance_zones z
      cross join lateral internal.zone_previous(z.previous) v
      where (p_id is null or z.id <> p_id) and z.approved_at is null and z.previous is not null
        and v.x < p_x + p_w and p_x < v.x + v.w and v.y < p_y + p_h and p_y < v.y + v.h
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
      -- Ajout de 20261113001100 : quatre-vingts zones au plus, acceptées ou modifiées en attente (elles gardent leur place) ;
      -- pour un allié, pas au-delà des zones qui peuvent attendre l'accord (internal.too_many_pending).
      if (select count(*) from internal.alliance_zones where approved_at is not null or previous is not null) >= 80 then perform internal.fail('too_many_zones'); end if;
      if not v_staff and internal.too_many_pending(v_tag) then perform internal.fail('too_many_pending_zones'); end if;
      if not v_staff and (select count(*) from internal.alliance_zones where tag = v_tag) >= 20 then
        perform internal.fail('too_many_clan_zones');
      end if;
      -- Ajout de 20261113001000 : une zone nouvelle vient à la dernière place de l'ordre des priorités.
      -- Ajout de 20261113001100 : celle d'un allié attend l'accord de l'encadrement, sans place.
      insert into internal.alliance_zones (title, tag, x, y, w, h, mask, pixels, created_by, updated_by, rank, approved_at, approved_by)
      values (
        v_title, v_tag, p_x, p_y, p_w, p_h, v_mask, v_pixels, v_actor, v_actor,
        case when v_staff then (select coalesce(max(rank), 0) + 1 from internal.alliance_zones where approved_at is not null) end,
        case when v_staff then now() end,
        case when v_staff then v_actor end
      )
      returning id into v_id;
    else
      -- Ajout de 20261113001100 : une zone modifiée par un allié attend de nouveau l'accord. Si elle était acceptée, cette
      -- version acceptée est gardée (`previous`) : les autres la voient encore, et elle revient si l'encadrement refuse.
      -- Une zone acceptée qui se met à attendre compte dans les plafonds de l'attente. Les valeurs à droite des « = » sont
      -- celles d'avant la modification.
      if not v_staff and internal.too_many_pending(v_tag)
        and exists (select 1 from internal.alliance_zones where id = p_id and approved_at is not null) then
        perform internal.fail('too_many_pending_zones');
      end if;
      update internal.alliance_zones
      set title = v_title, tag = v_tag, x = p_x, y = p_y, w = p_w, h = p_h, mask = v_mask, pixels = v_pixels, updated_by = v_actor, updated_at = now(),
        previous = case
          when v_staff then previous
          when approved_at is not null then jsonb_build_object(
            'title', title, 'tag', tag, 'x', x, 'y', y, 'w', w, 'h', h, 'mask', translate(encode(mask, 'base64'), E'\n', ''), 'pixels', pixels,
            'updated_by', updated_by, 'updated_at', updated_at, 'approved_at', approved_at, 'approved_by', approved_by)
          else previous
        end,
        approved_at = case when v_staff then approved_at end,
        approved_by = case when v_staff then approved_by end
      where id = p_id
      returning id into v_id;
    end if;
    perform internal.log_admin(v_actor, 'alliance_zone_saved', null, jsonb_build_object('zone', v_id, 'title', v_title, 'tag', v_tag, 'pixels', v_pixels, 'new', p_id is null, 'ally', not v_staff));
    -- Ajout de 20261113001000 : une zone nouvelle s'annonce sur Discord, si le salon de l'alliance est réglé.
    -- Ajout de 20261113001100 : seulement celle de l'encadrement ; celle d'un allié, à son accord.
    if p_id is null and v_staff then perform internal.announce_zone(v_id, true); end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'pixels', v_pixels,
      'pending', (select approved_at is null from internal.alliance_zones where id = v_id));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La carte : la version de 20261113001000, avec les zones qui attendent ---------- */

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

/* ---------- L'état et l'ordre : seulement les zones acceptées ---------- */

create or replace function public.set_alliance_zone_state(p_id bigint, p_state text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_zone internal.alliance_zones;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_state is null or p_state not in ('a_prendre', 'en_cours', 'tenue', 'abandonnee') then perform internal.fail('invalid_state'); end if;
    -- Ajout de 20261113001100 : une zone qui attend l'accord n'a pas d'état à régler.
    select * into v_zone from internal.alliance_zones where id = p_id and approved_at is not null for update;
    if not found then perform internal.fail('zone_not_found'); end if;
    if v_zone.state = p_state then return jsonb_build_object('ok', true); end if;
    update internal.alliance_zones set state = p_state, updated_by = v_actor, updated_at = now() where id = p_id;
    perform internal.log_admin(v_actor, 'alliance_zone_state', null, jsonb_build_object('zone', p_id, 'title', v_zone.title, 'state', p_state));
    perform internal.announce_zone(p_id, false);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

create or replace function public.order_alliance_zones(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded(60) then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    perform pg_advisory_xact_lock(hashtext('gal_alliance_zones'));
    if p_ids is null
       -- Ajout de 20261113001100 : la liste des zones acceptées seulement.
       or cardinality(p_ids) <> (select count(*) from internal.alliance_zones where approved_at is not null)
       or cardinality(p_ids) <> (select count(distinct u.id) from unnest(p_ids) as u(id))
       or exists (select 1 from unnest(p_ids) as u(id) where u.id is null or not exists (select 1 from internal.alliance_zones z where z.id = u.id and z.approved_at is not null)) then
      perform internal.fail('invalid_order');
    end if;
    update internal.alliance_zones z set rank = o.n
    from (select u.id, u.n::integer as n from unnest(p_ids) with ordinality as u(id, n)) o
    where z.id = o.id;
    perform internal.log_admin(v_actor, 'alliance_zones_ordered', null, jsonb_build_object('zones', cardinality(p_ids)));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

revoke all on function internal.zone_previous(jsonb) from public, anon, authenticated;
revoke all on function internal.too_many_pending(text) from public, anon, authenticated;
revoke all on function internal.zone_overlaps(bigint, integer, integer, integer, integer, bytea) from public, anon, authenticated;
revoke all on function public.review_alliance_zone(bigint, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.get_alliance_map() from public, anon, authenticated;
revoke all on function public.set_alliance_zone_state(bigint, text) from public, anon, authenticated;
revoke all on function public.order_alliance_zones(bigint[]) from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même l'accès à la carte de l'alliance, et le rang.
grant execute on function public.review_alliance_zone(bigint, boolean, timestamptz) to authenticated;
grant execute on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.get_alliance_map() to authenticated;
grant execute on function public.set_alliance_zone_state(bigint, text) to authenticated;
grant execute on function public.order_alliance_zones(bigint[]) to authenticated;
