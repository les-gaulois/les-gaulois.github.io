-- L'inventaire d'images des messages Discord, à la demande du pilote (12 novembre 2026 : « dans les embed discord dans
-- direction, je veux que tu mettes la possibilité d'enregistrer des images pour la prochaine fois, afin d'avoir un
-- inventaire image gal logo etc. utilisable par le staff depuis le site »).
--
-- Une image choisie pour un message part dans l'espace public « discord-images » au moment de l'envoi
-- (20261111000600_messages_discord.sql), puis ne sert qu'une fois. L'inventaire garde des images de cet espace sous un
-- nom (le logo du clan, une bannière…) : les admins et le fondateur les reprennent ensuite dans n'importe quel champ
-- d'image d'un message, sans les déposer de nouveau. Le fichier reste dans l'espace, à la même adresse : l'inventaire
-- n'en garde que le nom dans l'espace (`path`) et le nom donné par l'encadrement.
--
-- Retirer une image de l'inventaire ne retire que la ligne de la liste : le fichier reste dans l'espace, car un message
-- déjà envoyé peut l'afficher (même règle que pour les images des messages). 50 images au plus.
--
-- Cette migration ne fait qu'ajouter : une table et cinq fonctions. Aucune donnée n'est retirée. Rejouée, elle ne change
-- rien.

/* ---------- L'inventaire ---------- */

-- Une image gardée : son nom (60 caractères, sans doublon, majuscules comprises), son fichier dans l'espace
-- « discord-images » (le nom tiré au sort au dépôt, que la règle d'accès du stockage impose), qui l'a gardée et quand.
create table if not exists internal.discord_images (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  path text not null unique check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$'),
  saved_by uuid references public.profiles (user_id) on delete set null,
  saved_at timestamptz not null default now()
);
create unique index if not exists discord_images_name on internal.discord_images (lower(name));

/* ---------- Les outils ---------- */

-- Le nom d'une image : les caractères de contrôle deviennent des espaces, les blancs du début et de la fin partent.
-- De 1 à 60 caractères ; sinon null.
create or replace function internal.discord_image_name(p_name text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when char_length(x.v) between 1 and 60 then x.v end
  from (select regexp_replace(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g'), '^[[:space:]]+|[[:space:]]+$', '', 'g') as v) x
$$;

/* ---------- Depuis l'espace Direction ---------- */

-- Pour les admins et le fondateur : l'inventaire, par ordre alphabétique, avec la taille de chaque fichier, lue dans
-- l'espace de fichiers. `missing` : le fichier n'y est plus (retiré à la main dans Supabase) ; la page ne le propose plus.
create or replace function public.get_discord_images() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    return jsonb_build_object('ok', true, 'images', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'path', i.path,
        'size', case when o.metadata ->> 'size' ~ '^[0-9]{1,12}$' then (o.metadata ->> 'size')::bigint end,
        'missing', o.name is null,
        'saved_at', i.saved_at,
        'saved_by', (select p.display_name from public.profiles p where p.user_id = i.saved_by)
      ) order by lower(i.name), i.id), '[]')
      from internal.discord_images i
      left join storage.objects o on o.bucket_id = 'discord-images' and o.name = i.path
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Garde une image de l'espace « discord-images » dans l'inventaire, sous un nom : admins et fondateur. L'image doit
-- déjà être dans l'espace (la page vient de la déposer, ou elle vient d'un message envoyé) : le serveur le vérifie.
-- Pas deux fois la même image, pas deux fois le même nom, 50 images au plus.
create or replace function public.save_discord_image(p_path text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text := internal.discord_image_name(p_name);
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if v_name is null then perform internal.fail('invalid_image_name'); end if;
    if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$' then perform internal.fail('invalid_image'); end if;
    if not exists (select 1 from storage.objects where bucket_id = 'discord-images' and name = p_path) then perform internal.fail('image_not_on_server'); end if;
    -- Deux enregistrements simultanés comptent l'un après l'autre : sinon, chacun passerait les contrôles.
    perform pg_advisory_xact_lock(hashtext('gal_discord_images'));
    if exists (select 1 from internal.discord_images where path = p_path) then perform internal.fail('image_already_saved'); end if;
    if (select count(*) from internal.discord_images) >= 50 then perform internal.fail('inventory_full'); end if;
    if exists (select 1 from internal.discord_images where lower(name) = lower(v_name)) then perform internal.fail('image_name_taken'); end if;
    insert into internal.discord_images (name, path, saved_by) values (v_name, p_path, v_actor) returning id into v_id;
    perform internal.log_admin(v_actor, 'discord_image_saved', null, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Renomme une image de l'inventaire : admins et fondateur. Le même nom, à l'identique, ne change rien et ne va pas au
-- journal.
create or replace function public.rename_discord_image(p_id bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text := internal.discord_image_name(p_name);
  v_old text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if v_name is null then perform internal.fail('invalid_image_name'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_discord_images'));
    select name into v_old from internal.discord_images where id = p_id;
    if not found then perform internal.fail('saved_image_not_found'); end if;
    if exists (select 1 from internal.discord_images where lower(name) = lower(v_name) and id <> p_id) then perform internal.fail('image_name_taken'); end if;
    if v_name is distinct from v_old then
      update internal.discord_images set name = v_name where id = p_id;
      perform internal.log_admin(v_actor, 'discord_image_renamed', null, jsonb_build_object('name', v_name, 'from', v_old));
    end if;
    return jsonb_build_object('ok', true, 'name', v_name);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Retire une image de l'inventaire : admins et fondateur. Seule la ligne de la liste part : le fichier reste dans
-- l'espace, à la même adresse, car un message déjà envoyé peut l'afficher.
create or replace function public.remove_discord_image(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    delete from internal.discord_images where id = p_id returning name into v_name;
    if not found then perform internal.fail('saved_image_not_found'); end if;
    perform internal.log_admin(v_actor, 'discord_image_removed', null, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

-- Une table privée, comme celles des messages : seules les fonctions ci-dessus la lisent.
alter table internal.discord_images enable row level security;
revoke all on internal.discord_images from public, anon, authenticated;

-- L'outil ne s'appelle que depuis les fonctions du site.
revoke all on function internal.discord_image_name(text) from public, anon, authenticated;

-- Tout compte connecté : chaque fonction vérifie elle-même le rang (admin ou fondateur).
revoke all on function public.get_discord_images() from public, anon, authenticated;
revoke all on function public.save_discord_image(text, text) from public, anon, authenticated;
revoke all on function public.rename_discord_image(bigint, text) from public, anon, authenticated;
revoke all on function public.remove_discord_image(bigint) from public, anon, authenticated;
grant execute on function public.get_discord_images() to authenticated;
grant execute on function public.save_discord_image(text, text) to authenticated;
grant execute on function public.rename_discord_image(bigint, text) to authenticated;
grant execute on function public.remove_discord_image(bigint) to authenticated;
