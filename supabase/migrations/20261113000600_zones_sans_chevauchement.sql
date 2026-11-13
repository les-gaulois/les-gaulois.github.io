-- Les zones de l'alliance ne se chevauchent plus, demandé par le pilote le 13 novembre 2026 (« faire en sorte qu'il soit
-- impossible de repasser sur une zone déjà existante ») : un pixel de la carte n'appartient qu'à une zone. Le dessin du
-- site n'y peint déjà plus ; le serveur le vérifie aussi, pour deux membres de l'encadrement qui dessinent en même temps.
--
-- Cette migration ne fait que remplacer `save_alliance_zone` (migration 20261113000400) par la même fonction, qui refuse en
-- plus une zone posée sur une autre (`zone_overlap`). Les zones déjà enregistrées ne changent pas : celles qui se
-- chevauchaient déjà gardent leurs pixels jusqu'à leur prochaine modification, où le site retire la partie commune de la
-- zone modifiée. Aucune donnée n'est retirée.

-- Comme avant, plus la règle du chevauchement, vérifiée sous le verrou des zones : deux enregistrements ne se croisent pas.
create or replace function public.save_alliance_zone(p_id bigint, p_title text, p_tag text, p_x integer, p_y integer, p_w integer, p_h integer, p_mask text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_title text;
  v_tag text;
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
    v_actor := internal.require_rank(2);
    if internal.our_alliance() is null then perform internal.fail('no_alliance'); end if;
    v_title := internal.clean_label(p_title, 2, 40, 'invalid_zone');
    if p_tag is not null and btrim(p_tag) <> '' then
      v_tag := internal.clean_tag(p_tag);
      if not exists (select 1 from internal.alliance_clans where tag = v_tag and alliance_id = internal.our_alliance()) then
        perform internal.fail('clan_not_allied');
      end if;
    end if;
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
      insert into internal.alliance_zones (title, tag, x, y, w, h, mask, pixels, created_by, updated_by)
      values (v_title, v_tag, p_x, p_y, p_w, p_h, v_mask, v_pixels, v_actor, v_actor)
      returning id into v_id;
    else
      update internal.alliance_zones
      set title = v_title, tag = v_tag, x = p_x, y = p_y, w = p_w, h = p_h, mask = v_mask, pixels = v_pixels, updated_by = v_actor, updated_at = now()
      where id = p_id
      returning id into v_id;
      if v_id is null then perform internal.fail('zone_not_found'); end if;
    end if;
    perform internal.log_admin(v_actor, 'alliance_zone_saved', null, jsonb_build_object('zone', v_id, 'title', v_title, 'tag', v_tag, 'pixels', v_pixels, 'new', p_id is null));
    return jsonb_build_object('ok', true, 'id', v_id, 'pixels', v_pixels);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les droits ne changent pas : fermée aux visiteurs, ouverte aux comptes connectés, la fonction vérifie elle-même le rang.
revoke all on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) to authenticated;
