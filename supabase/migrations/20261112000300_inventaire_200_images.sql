-- L'inventaire d'images des messages Discord passe de 50 à 200 images, à la demande du pilote (12 novembre 2026 : « on
-- peut pas augmenter la limite d'image (50) j'aimerais 200 »), avec un plafond de poids : 500 Mo pour l'ensemble des
-- fichiers gardés. Les fichiers de l'espace « discord-images » comptent dans le 1 Go de fichiers du forfait gratuit de
-- Supabase : 200 images de 8 Mo le dépasseraient. Le poids d'un fichier est celui que l'espace a noté à son dépôt ; un
-- poids illisible compte pour rien.
--
-- Cette migration ne fait que remplacer une fonction de 20261112000200_inventaire_images_discord.sql
-- (save_discord_image). Aucune table ni donnée n'est touchée. Rejouée, elle ne change rien.

-- Garde une image de l'espace « discord-images » dans l'inventaire, sous un nom : admins et fondateur. L'image doit
-- déjà être dans l'espace : le serveur le vérifie. Pas deux fois la même image, 200 images au plus, 500 Mo en tout,
-- pas deux fois le même nom.
create or replace function public.save_discord_image(p_path text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text := internal.discord_image_name(p_name);
  v_size bigint;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if v_name is null then perform internal.fail('invalid_image_name'); end if;
    if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$' then perform internal.fail('invalid_image'); end if;
    select case when o.metadata ->> 'size' ~ '^[0-9]{1,12}$' then (o.metadata ->> 'size')::bigint else 0 end into v_size
      from storage.objects o where o.bucket_id = 'discord-images' and o.name = p_path;
    if not found then perform internal.fail('image_not_on_server'); end if;
    -- Deux enregistrements simultanés comptent l'un après l'autre : sinon, chacun passerait les contrôles.
    perform pg_advisory_xact_lock(hashtext('gal_discord_images'));
    if exists (select 1 from internal.discord_images where path = p_path) then perform internal.fail('image_already_saved'); end if;
    if (select count(*) from internal.discord_images) >= 200 then perform internal.fail('inventory_full'); end if;
    if v_size + (
      select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,12}$' then (o.metadata ->> 'size')::bigint else 0 end), 0)
      from internal.discord_images i join storage.objects o on o.bucket_id = 'discord-images' and o.name = i.path
    ) > 524288000 then
      perform internal.fail('inventory_too_heavy');
    end if;
    if exists (select 1 from internal.discord_images where lower(name) = lower(v_name)) then perform internal.fail('image_name_taken'); end if;
    insert into internal.discord_images (name, path, saved_by) values (v_name, p_path, v_actor) returning id into v_id;
    perform internal.log_admin(v_actor, 'discord_image_saved', null, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Tout compte connecté : la fonction vérifie elle-même le rang (admin ou fondateur).
revoke all on function public.save_discord_image(text, text) from public, anon, authenticated;
grant execute on function public.save_discord_image(text, text) to authenticated;
