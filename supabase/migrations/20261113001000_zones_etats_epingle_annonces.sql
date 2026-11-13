-- La carte de l'alliance, trois idées choisies par le pilote le 13 novembre 2026 (« fait moi tout ça ») :
--  - chaque zone a un état (à prendre, en cours, tenue, abandonnée) et une place dans l'ordre des priorités, que règle
--    l'encadrement de GAL ;
--  - l'encadrement épingle un message en haut de la discussion ; épinglé, il ne s'efface pas au bout de 30 jours, et part
--    quand même si son auteur le retire ou efface son compte ;
--  - une zone nouvelle, ou dont l'état change, s'annonce sur Discord, dans un quatrième salon réglé dans l'espace Direction
--    (« alliance »), par le serveur lui-même (pg_net), comme les appels. Sans salon réglé, rien ne part ; dix annonces au plus
--    en dix minutes, pour qu'un salon ne soit pas inondé par des zones créées et recréées.
--
-- Elle vient après 20261113000700_allies_dessinent_leurs_zones.sql, dont elle reprend telles quelles save_alliance_zone
-- (avec la règle du chevauchement de 20261113000600) et get_alliance_map, avec deux ajouts marqués : la place et l'annonce
-- d'une zone nouvelle, l'état et la place de chaque zone. À coller après elle.
--
-- Cette migration ne fait qu'ajouter : deux colonnes, deux tables, des fonctions, et de nouvelles versions de fonctions des
-- migrations 20261113000400, 20261113000700 et 20261111000500. Le contrôle des salons permis est élargi (aucune ligne n'est
-- touchée). Les zones déjà dessinées sont à prendre, dans l'ordre de leur numéro. Aucune donnée n'est retirée. Rejouée,
-- elle ne change rien.

/* ---------- Les zones : état et ordre ---------- */

-- `rank` : la place dans l'ordre des priorités, 1 pour la première. Les zones d'avant prennent l'ordre de leur numéro, une
-- seule fois : un second passage du fichier ne change rien.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'internal' and table_name = 'alliance_zones' and column_name = 'state'
  ) then
    alter table internal.alliance_zones add column state text not null default 'a_prendre' check (state in ('a_prendre', 'en_cours', 'tenue', 'abandonnee'));
    alter table internal.alliance_zones add column rank integer check (rank > 0);
    update internal.alliance_zones z set rank = o.n
    from (select id, (row_number() over (order by id))::integer as n from internal.alliance_zones) o
    where z.id = o.id;
  end if;
end $$;

/* ---------- Le message épinglé ---------- */

-- Un seul message épinglé à la fois. Il part avec le message : retiré par son auteur ou par l'encadrement, ou effacé avec
-- le compte de son auteur.
create table if not exists internal.alliance_pin (
  only_one boolean primary key default true check (only_one),
  message_id bigint not null unique references internal.alliance_messages (id) on delete cascade,
  pinned_by uuid references public.profiles (user_id) on delete set null,
  pinned_at timestamptz not null default now()
);

/* ---------- Le salon Discord de l'alliance ---------- */

-- L'heure de chaque annonce partie, pour la limite de dix en dix minutes ; effacée au bout d'un jour.
create table if not exists internal.alliance_announces (
  at timestamptz not null default now()
);
create index if not exists alliance_announces_at on internal.alliance_announces (at);

-- Postgres a nommé ce contrôle d'après la table et la colonne. Retirer un contrôle ne touche à aucune ligne. Le robot de la
-- GitHub Action ne contrôle pas ce salon : c'est le serveur qui y poste ; discord_salon_checks ne change pas.
alter table internal.discord_salons drop constraint if exists discord_salons_salon_check;
alter table internal.discord_salons add constraint discord_salons_salon_check check (salon in ('nouvelles', 'encadrement', 'victoires', 'alliance'));

-- Un message dans le salon Discord de l'alliance, s'il est réglé. Ne mentionne personne. Dix annonces au plus en dix
-- minutes : au-delà, rien ne part. Une erreur ici n'arrête jamais l'action qui l'appelle : la zone est enregistrée, même
-- si Discord ne répond pas.
create or replace function internal.alliance_announce(p_text text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
begin
  select webhook_url into v_url from internal.discord_salons where salon = 'alliance';
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('gal_alliance_announces'));
  delete from internal.alliance_announces where at < now() - interval '1 day';
  if (select count(*) from internal.alliance_announces where at > now() - interval '10 minutes') >= 10 then return; end if;
  insert into internal.alliance_announces default values;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('content', left(p_text, 1900), 'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())),
      timeout_milliseconds := 5000
    );
  exception when others then
    null;
  end;
end $$;

-- L'état d'une zone, en français puis en anglais, pour les alliés d'autres pays.
create or replace function internal.zone_state_label(p_state text) returns text
language sql immutable as $$
  select case p_state
    when 'a_prendre' then 'à prendre · to take'
    when 'en_cours' then 'en cours · in progress'
    when 'tenue' then 'tenue · held'
    else 'abandonnée · dropped'
  end
$$;

-- L'annonce d'une zone : nouvelle, ou dont l'état change. Le nom de la zone est échappé : il ne peut ni mentionner, ni
-- mettre en forme, ni cacher un lien.
create or replace function internal.announce_zone(p_id bigint, p_new boolean) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_zone internal.alliance_zones;
begin
  select * into v_zone from internal.alliance_zones where id = p_id;
  if not found then return; end if;
  perform internal.alliance_announce(
    case when p_new then '**Nouvelle zone à prendre · New zone to take**' else '**Zone mise à jour · Zone updated**' end
    || chr(10) || '**' || internal.discord_plain(v_zone.title) || '** · ' || coalesce(v_zone.tag, 'toute l''alliance · whole alliance')
    || ' · ' || internal.zone_state_label(v_zone.state)
    || ' · ' || replace(to_char(v_zone.pixels, 'FM999,999,999'), ',', ' ') || ' pixels'
    || chr(10) || '<https://les-gaulois.github.io/carte#alliance>'
  );
end $$;

/* ---------- Les zones : la version de 20261113000700, avec la place et l'annonce d'une zone nouvelle ---------- */

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
      -- Ajout de 20261113001000 : une zone nouvelle vient à la dernière place de l'ordre des priorités.
      insert into internal.alliance_zones (title, tag, x, y, w, h, mask, pixels, created_by, updated_by, rank)
      values (v_title, v_tag, p_x, p_y, p_w, p_h, v_mask, v_pixels, v_actor, v_actor, (select coalesce(max(rank), 0) + 1 from internal.alliance_zones))
      returning id into v_id;
    else
      update internal.alliance_zones
      set title = v_title, tag = v_tag, x = p_x, y = p_y, w = p_w, h = p_h, mask = v_mask, pixels = v_pixels, updated_by = v_actor, updated_at = now()
      where id = p_id
      returning id into v_id;
    end if;
    perform internal.log_admin(v_actor, 'alliance_zone_saved', null, jsonb_build_object('zone', v_id, 'title', v_title, 'tag', v_tag, 'pixels', v_pixels, 'new', p_id is null, 'ally', not v_staff));
    -- Ajout de 20261113001000 : une zone nouvelle s'annonce sur Discord, si le salon de l'alliance est réglé.
    if p_id is null then perform internal.announce_zone(v_id, true); end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'pixels', v_pixels);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La carte : la version de 20261113000700, avec l'état et la place de chaque zone ---------- */

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
        'can_edit', v_staff or coalesce(z.tag = v_clan, false),
        -- Ajout de 20261113001000 : son état, et sa place dans l'ordre des priorités.
        'state', z.state,
        'rank', z.rank
      ) order by z.rank nulls last, z.id), '[]')
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

/* ---------- L'état et l'ordre, réglés par l'encadrement ---------- */

-- L'état d'une zone. Un changement s'annonce sur Discord.
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
    select * into v_zone from internal.alliance_zones where id = p_id for update;
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

-- L'ordre des priorités : la liste complète des zones, chacune une fois, la première d'abord.
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
       or cardinality(p_ids) <> (select count(*) from internal.alliance_zones)
       or cardinality(p_ids) <> (select count(distinct u.id) from unnest(p_ids) as u(id))
       or exists (select 1 from unnest(p_ids) as u(id) where u.id is null or not exists (select 1 from internal.alliance_zones z where z.id = u.id)) then
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

/* ---------- La discussion : le message épinglé ---------- */

-- Comme avant (migration 20261113000400), mais le message épinglé ne s'efface pas au bout de 30 jours.
create or replace function internal.alliance_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from internal.alliance_messages where created_at < now() - interval '30 days' and id not in (select message_id from internal.alliance_pin);
  delete from internal.alliance_invites where coalesce(used_at, expires_at) < now() - interval '30 days';
$$;


-- Comme avant (migration 20261113000400), avec en plus le message épinglé, même plus ancien que les 80 derniers.
create or replace function public.get_alliance_messages() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_uid uuid := auth.uid();
  v_staff boolean;
  v_detail text;
begin
  begin
    v_access := internal.require_map_access();
    v_staff := coalesce((v_access ->> 'staff')::boolean, false);
    delete from internal.alliance_messages where created_at < now() - interval '30 days' and id not in (select message_id from internal.alliance_pin);
    return jsonb_build_object('ok', true, 'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'at', m.created_at, 'tag', m.tag, 'name', m.name, 'staff', m.staff, 'body', m.body,
        'mine', m.author_id = v_uid, 'can_delete', m.author_id = v_uid or v_staff
      ) order by m.id), '[]')
      from (select * from internal.alliance_messages order by id desc limit 80) m
    ), 'pinned', (
      -- Ajout de 20261113001000 : le message épinglé, même plus ancien que les 80 derniers.
      -- Son auteur et l'encadrement le retirent d'ici, même plus ancien que les 80 derniers.
      select jsonb_build_object('id', m.id, 'at', m.created_at, 'tag', m.tag, 'name', m.name, 'staff', m.staff, 'body', m.body, 'pinned_at', p.pinned_at,
        'mine', m.author_id = v_uid, 'can_delete', m.author_id = v_uid or v_staff)
      from internal.alliance_pin p
      join internal.alliance_messages m on m.id = p.message_id
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;


-- L'encadrement épingle un message (il remplace l'épinglé d'avant), ou désépingle (`p_id` vide).
create or replace function public.pin_alliance_message(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_message internal.alliance_messages;
  v_old bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_id is null then
      delete from internal.alliance_pin where only_one returning message_id into v_old;
      if v_old is not null then perform internal.log_admin(v_actor, 'alliance_message_unpinned', null, '{}'::jsonb); end if;
      return jsonb_build_object('ok', true);
    end if;
    select * into v_message from internal.alliance_messages where id = p_id;
    if not found then perform internal.fail('message_not_found'); end if;
    insert into internal.alliance_pin (only_one, message_id, pinned_by, pinned_at) values (true, p_id, v_actor, now())
    on conflict (only_one) do update set message_id = excluded.message_id, pinned_by = excluded.pinned_by, pinned_at = excluded.pinned_at;
    perform internal.log_admin(v_actor, 'alliance_message_pinned', v_message.author_id, jsonb_build_object('tag', v_message.tag));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les salons Discord : le salon de l'alliance en plus ---------- */

-- Les fonctions de la migration 20261111000500_salon_des_victoires.sql, telles quelles, avec le salon « alliance » en plus.
-- robot_discord_salons et note_discord_salon ne changent pas : le robot de la GitHub Action ne poste pas dans ce salon.

/* ---------- L'essai ---------- */

-- Poste l'essai d'un salon réglé et le note. Ne mentionne personne. Une erreur ici n'arrête jamais ce qui l'appelle :
-- elle est notée pour l'espace Direction, sans le jeton du lien.
create or replace function internal.discord_salon_test(p_salon text) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
  v_request bigint;
begin
  select webhook_url into v_url from internal.discord_salons where salon = p_salon;
  if not found then return null; end if;
  begin
    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'content', case p_salon
          when 'nouvelles' then 'Essai du site du clan : la gazette, les alertes, les paliers, les messages du jour et la course du soir arriveront dans ce salon.'
          when 'victoires' then 'Essai du site du clan : chaque victoire du clan, avec l''image de la carte, arrivera dans ce salon.'
          when 'alliance' then 'Essai du site du clan : les zones nouvelles de la carte de l''alliance, et chaque zone dont l''état change, arriveront dans ce salon. · Site test: new zones of the alliance map, and zones whose status changes, will be posted here.'
          else 'Essai du site du clan : les demandes qui attendent et le compte rendu des sauvegardes arriveront dans ce salon.'
        end,
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
      ),
      timeout_milliseconds := 5000
    );
    update internal.discord_salons set last_at = now(), last_request = v_request, last_error = null where salon = p_salon;
    return v_request;
  exception when others then
    update internal.discord_salons set last_at = now(), last_request = null, last_error = left(sqlerrm, 300) where salon = p_salon;
    return null;
  end;
end $$;

/* ---------- Le réglage, depuis l'espace Direction ---------- */

-- Pour les admins et le fondateur : pour chaque salon, réglé ou non, la date du réglage et son auteur, le dernier essai
-- avec la réponse de Discord tant que pg_net la garde, et le dernier contrôle du robot. Jamais le lien : il permet
-- d'écrire dans le salon. Le détail d'une erreur ne contient jamais son jeton. `now` : l'heure du serveur.
create or replace function public.get_discord_salons() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_salon text;
  v_hook internal.discord_salons;
  v_check internal.discord_salon_checks;
  v_answered boolean;
  v_status integer;
  v_timed_out boolean;
  v_error text;
  v_rows jsonb := '[]';
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    foreach v_salon in array array['nouvelles', 'encadrement', 'victoires', 'alliance'] loop
      v_answered := false;
      v_status := null;
      v_timed_out := null;
      v_error := null;
      select * into v_hook from internal.discord_salons where salon = v_salon;
      if not found then v_hook := null; end if;
      select * into v_check from internal.discord_salon_checks where salon = v_salon;
      if not found then v_check := null; end if;
      if v_hook.last_request is not null then
        begin
          select r.status_code, r.timed_out, r.error_msg into v_status, v_timed_out, v_error from net._http_response r where r.id = v_hook.last_request;
          v_answered := found;
        exception when others then
          v_answered := false;
        end;
      end if;
      if v_hook.salon is not null then
        v_error := left(replace(coalesce(v_hook.last_error, v_error), split_part(v_hook.webhook_url, '/', 7), '…'), 200);
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'salon', v_salon,
        'set', v_hook.salon is not null,
        'updated_at', v_hook.updated_at,
        'updated_by', (select p.display_name from public.profiles p where p.user_id = v_hook.updated_by),
        'last', case when v_hook.last_at is null then null else jsonb_build_object(
          'kind', 'test',
          'at', v_hook.last_at,
          'failed', v_hook.last_error is not null,
          'answered', v_answered,
          'status', v_status,
          'timed_out', coalesce(v_timed_out, false),
          'error', v_error
        ) end,
        'check', case when v_check.salon is null then null else jsonb_build_object(
          'at', v_check.checked_at,
          'source', v_check.source,
          'status', v_check.status,
          'name', v_check.webhook_name
        ) end
      ));
    end loop;
    return jsonb_build_object('ok', true, 'now', now(), 'salons', v_rows);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Règle un salon du robot : le lien de son webhook. Un essai part aussitôt, sans mentionner personne. Le contrôle du
-- robot noté pour l'ancien lien est effacé : le passage suivant contrôle le nouveau.
create or replace function public.save_discord_salon(p_salon text, p_webhook text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text := internal.discord_webhook_of(p_webhook);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance') then perform internal.fail('invalid_salon'); end if;
    if v_url is null then perform internal.fail('invalid_webhook'); end if;
    insert into internal.discord_salons (salon, webhook_url, updated_by, updated_at)
    values (p_salon, v_url, v_actor, now())
    on conflict (salon) do update
      set webhook_url = excluded.webhook_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        last_at = null, last_request = null, last_error = null;
    delete from internal.discord_salon_checks where salon = p_salon;
    perform internal.log_admin(v_actor, 'discord_salon_saved', null, jsonb_build_object('salon', p_salon));
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Renvoie l'essai d'un salon réglé, quinze secondes au moins après le précédent.
create or replace function public.test_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_salons;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    perform internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance') then perform internal.fail('invalid_salon'); end if;
    select * into v_hook from internal.discord_salons where salon = p_salon for update;
    if not found then perform internal.fail('discord_not_set'); end if;
    if v_hook.last_at > now() - interval '15 seconds' then perform internal.fail('test_too_soon'); end if;
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Débranche un salon du robot : le réglage est effacé, lien compris. Le robot reprend alors le secret GitHub, s'il en
-- reste un. Les messages déjà postés restent dans le salon.
create or replace function public.clear_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_found boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance') then perform internal.fail('invalid_salon'); end if;
    delete from internal.discord_salons where salon = p_salon;
    v_found := found;
    delete from internal.discord_salon_checks where salon = p_salon;
    if v_found then perform internal.log_admin(v_actor, 'discord_salon_cleared', null, jsonb_build_object('salon', p_salon)); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;


/* ---------- Règles d'accès ---------- */

alter table internal.alliance_pin enable row level security;
alter table internal.alliance_announces enable row level security;
revoke all on internal.alliance_pin, internal.alliance_announces from public, anon, authenticated;

revoke all on function internal.alliance_announce(text) from public, anon, authenticated;
revoke all on function internal.zone_state_label(text) from public, anon, authenticated;
revoke all on function internal.announce_zone(bigint, boolean) from public, anon, authenticated;
revoke all on function internal.alliance_purge() from public, anon, authenticated;
revoke all on function internal.discord_salon_test(text) from public, anon, authenticated;

revoke all on function public.get_alliance_map() from public, anon, authenticated;
revoke all on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.set_alliance_zone_state(bigint, text) from public, anon, authenticated;
revoke all on function public.order_alliance_zones(bigint[]) from public, anon, authenticated;
revoke all on function public.get_alliance_messages() from public, anon, authenticated;
revoke all on function public.pin_alliance_message(bigint) from public, anon, authenticated;
revoke all on function public.get_discord_salons() from public, anon, authenticated;
revoke all on function public.save_discord_salon(text, text) from public, anon, authenticated;
revoke all on function public.test_discord_salon(text) from public, anon, authenticated;
revoke all on function public.clear_discord_salon(text) from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même l'accès à la carte de l'alliance, et le rang.
grant execute on function public.get_alliance_map() to authenticated;
grant execute on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.set_alliance_zone_state(bigint, text) to authenticated;
grant execute on function public.order_alliance_zones(bigint[]) to authenticated;
grant execute on function public.get_alliance_messages() to authenticated;
grant execute on function public.pin_alliance_message(bigint) to authenticated;
grant execute on function public.get_discord_salons() to authenticated;
grant execute on function public.save_discord_salon(text, text) to authenticated;
grant execute on function public.test_discord_salon(text) to authenticated;
grant execute on function public.clear_discord_salon(text) to authenticated;
