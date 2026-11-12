-- Les images en grand des messages Discord, à la demande du pilote (12 novembre 2026, après le premier vrai message :
-- « l'image est plus petite que si c'était moi qui l'avais postée »).
--
-- Dans un embed, Discord affiche une image en petit : 400 pixels de large au plus. Une image envoyée par un membre
-- s'affiche plus grande. pg_net n'envoie que du JSON : le serveur ne peut pas joindre un fichier au message. Il peut en
-- revanche envoyer une galerie d'images par leur adresse, que Discord montre comme les images d'un membre : un message
-- « Components V2 », avec un bloc de texte (type 10), une galerie (type 12), le drapeau 32768 et ?with_components=true.
-- Discord refuse alors `content` et `embeds` dans ce message : un message a des embeds, ou des images en grand, pas les
-- deux. Chaque image est une adresse en https, comme celles des embeds : un fichier choisi passe d'abord par l'espace
-- public « discord-images » (20261111000600_messages_discord.sql).
--
-- Le message gardé a alors `gallery` : de 1 à 10 images, chacune avec son adresse en https, une description facultative
-- (1 024 caractères, lue par les lecteurs d'écran) et `spoiler` (cachée jusqu'au clic). Le texte du message et les
-- descriptions : 4 000 caractères en tout, la limite de Discord pour ces messages.
--
-- Cette migration ajoute une fonction et en remplace trois : le nettoyage du message, le message pour Discord et l'envoi.
-- Un message avec des embeds part exactement comme avant. Aucune table ni donnée n'est touchée. Rejouée, elle ne change
-- rien.

-- Les images en grand d'un message, refaites une à une : l'adresse (https), la description, le spoiler. Rien : null.
create or replace function internal.discord_message_gallery(p_value jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_items jsonb := '[]';
  v_item jsonb;
  v_out jsonb;
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  if jsonb_typeof(p_value) <> 'array' then perform internal.fail('invalid_message'); end if;
  if jsonb_array_length(p_value) > 10 then perform internal.fail('too_many_images'); end if;
  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'object' then perform internal.fail('invalid_message'); end if;
    v_text := internal.discord_message_link(v_item -> 'url');
    if v_text is null then perform internal.fail('invalid_message'); end if;
    v_out := jsonb_build_object('url', v_text);
    v_text := internal.discord_message_text(v_item -> 'description', 1024, 'image_description_too_long');
    if v_text is not null then v_out := v_out || jsonb_build_object('description', v_text); end if;
    if coalesce(jsonb_typeof(v_item -> 'spoiler'), 'null') not in ('boolean', 'null') then perform internal.fail('invalid_message'); end if;
    if coalesce((v_item ->> 'spoiler')::boolean, false) then v_out := v_out || jsonb_build_object('spoiler', true); end if;
    v_items := v_items || jsonb_build_array(v_out);
  end loop;
  if jsonb_array_length(v_items) = 0 then return null; end if;
  return v_items;
end $$;

-- Le message entier, vérifié et refait, comme dans 20261111000600_messages_discord.sql, avec en plus les images en grand :
-- jamais avec des embeds, et 4 000 caractères au plus pour le texte et les descriptions. Il faut un texte, un embed ou
-- une image en grand.
create or replace function internal.discord_message_clean(p_message jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out jsonb := '{}';
  v_text text;
  v_embed jsonb;
  v_embeds jsonb := '[]';
  v_total integer := 0;
  v_gallery jsonb;
  v_notify text;
begin
  if jsonb_typeof(p_message) is distinct from 'object' then perform internal.fail('invalid_message'); end if;

  v_text := internal.discord_message_text(p_message -> 'content', 2000, 'message_too_long');
  if v_text is not null then v_out := v_out || jsonb_build_object('content', v_text); end if;
  v_text := internal.discord_message_text(p_message -> 'username', 80, 'invalid_username');
  if v_text is not null then
    if v_text ~* '(discord|clyde)' or lower(v_text) in ('everyone', 'here') then perform internal.fail('invalid_username'); end if;
    v_out := v_out || jsonb_build_object('username', v_text);
  end if;
  v_text := internal.discord_message_link(p_message -> 'avatar_url');
  if v_text is not null then v_out := v_out || jsonb_build_object('avatar_url', v_text); end if;

  if jsonb_typeof(p_message -> 'embeds') = 'array' then
    if jsonb_array_length(p_message -> 'embeds') > 10 then perform internal.fail('too_many_embeds'); end if;
    for v_embed in select internal.discord_message_embed(value) from jsonb_array_elements(p_message -> 'embeds') loop
      v_total := v_total
        + coalesce(char_length(v_embed ->> 'title'), 0)
        + coalesce(char_length(v_embed ->> 'description'), 0)
        + coalesce(char_length(v_embed #>> '{author,name}'), 0)
        + coalesce(char_length(v_embed #>> '{footer,text}'), 0)
        + coalesce((select sum(char_length(f ->> 'name') + char_length(f ->> 'value')) from jsonb_array_elements(coalesce(v_embed -> 'fields', '[]')) f), 0)::integer;
      v_embeds := v_embeds || jsonb_build_array(v_embed);
    end loop;
    if v_total > 6000 then perform internal.fail('embeds_too_long'); end if;
    if jsonb_array_length(v_embeds) > 0 then v_out := v_out || jsonb_build_object('embeds', v_embeds); end if;
  elsif coalesce(jsonb_typeof(p_message -> 'embeds'), 'null') <> 'null' then
    perform internal.fail('invalid_message');
  end if;

  v_gallery := internal.discord_message_gallery(p_message -> 'gallery');
  if v_gallery is not null then
    if v_out ? 'embeds' then perform internal.fail('gallery_with_embeds'); end if;
    if coalesce(char_length(v_out ->> 'content'), 0)
      + coalesce((select sum(char_length(g ->> 'description')) from jsonb_array_elements(v_gallery) g), 0) > 4000 then
      perform internal.fail('gallery_too_long');
    end if;
    v_out := v_out || jsonb_build_object('gallery', v_gallery);
  end if;
  if not (v_out ? 'content' or v_out ? 'embeds' or v_out ? 'gallery') then perform internal.fail('message_empty'); end if;

  if coalesce(jsonb_typeof(p_message -> 'notify'), 'null') not in ('string', 'null') then perform internal.fail('invalid_message'); end if;
  v_notify := coalesce(p_message ->> 'notify', 'none');
  if v_notify not in ('none', 'mentions', 'everyone') then perform internal.fail('invalid_message'); end if;
  v_out := v_out || jsonb_build_object('notify', v_notify);
  if coalesce(jsonb_typeof(p_message -> 'silent'), 'null') not in ('boolean', 'null') then perform internal.fail('invalid_message'); end if;
  if coalesce((p_message ->> 'silent')::boolean, false) then v_out := v_out || jsonb_build_object('silent', true); end if;
  v_text := internal.discord_message_text(p_message -> 'thread_name', 100, 'invalid_thread');
  if v_text is not null then v_out := v_out || jsonb_build_object('thread_name', v_text); end if;
  return v_out;
end $$;

-- Ce qui part chez Discord. Avec des images en grand : un message « Components V2 » (drapeau 32768, plus 4096 s'il est
-- silencieux), le texte dans un bloc au-dessus de la galerie, sans `content` ni `embeds`. Sinon, le message d'avant,
-- inchangé : le texte, les embeds (l'heure de l'envoi à la place de 'now'), les mentions permises (aucune par défaut) et
-- le drapeau d'un envoi silencieux (4096).
create or replace function internal.discord_message_payload(p_clean jsonb) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select case when p_clean ? 'gallery' then
    jsonb_strip_nulls(jsonb_build_object(
      'username', p_clean -> 'username',
      'avatar_url', p_clean -> 'avatar_url',
      'thread_name', p_clean -> 'thread_name',
      'components',
        case when p_clean ? 'content' then jsonb_build_array(jsonb_build_object('type', 10, 'content', p_clean -> 'content')) else '[]'::jsonb end
        || jsonb_build_array(jsonb_build_object('type', 12, 'items', (
          select jsonb_agg(jsonb_build_object('media', jsonb_build_object('url', t.g -> 'url'), 'description', t.g -> 'description', 'spoiler', t.g -> 'spoiler') order by t.n)
          from jsonb_array_elements(p_clean -> 'gallery') with ordinality as t (g, n)
        ))),
      'allowed_mentions', jsonb_build_object('parse', case p_clean ->> 'notify'
        when 'everyone' then jsonb_build_array('roles', 'users', 'everyone')
        when 'mentions' then jsonb_build_array('roles', 'users')
        else jsonb_build_array()
      end),
      'flags', 32768 + case when (p_clean ->> 'silent')::boolean then 4096 else 0 end
    ))
  else
    jsonb_strip_nulls(jsonb_build_object(
      'content', p_clean -> 'content',
      'username', p_clean -> 'username',
      'avatar_url', p_clean -> 'avatar_url',
      'thread_name', p_clean -> 'thread_name',
      'embeds', (
        select jsonb_agg(case when t.e ->> 'timestamp' = 'now' then t.e || jsonb_build_object('timestamp', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) else t.e end order by t.n)
        from jsonb_array_elements(p_clean -> 'embeds') with ordinality as t (e, n)
      ),
      'allowed_mentions', jsonb_build_object('parse', case p_clean ->> 'notify'
        when 'everyone' then jsonb_build_array('roles', 'users', 'everyone')
        when 'mentions' then jsonb_build_array('roles', 'users')
        else jsonb_build_array()
      end),
      'flags', case when (p_clean ->> 'silent')::boolean then 4096 end
    ))
  end
$$;

-- L'envoi, comme dans 20261111000600_messages_discord.sql : seul change le lien pour un message avec des images en grand,
-- qui demande en plus ?with_components=true (sans lui, Discord ignorerait la galerie).
create or replace function public.send_discord_message(p_salon text, p_message jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text;
  v_clean jsonb;
  v_request bigint;
  v_error text;
  v_name text;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon !~ '^(robot:[a-z]{1,20}|appels|message:[0-9]{1,18})$' then perform internal.fail('invalid_salon'); end if;
    v_url := internal.discord_message_hook(p_salon);
    if v_url is null then perform internal.fail('discord_not_set'); end if;
    v_clean := internal.discord_message_clean(p_message);
    -- Deux envois simultanés du même membre comptent l'un après l'autre : sinon, chacun passerait l'attente.
    perform pg_advisory_xact_lock(hashtext('gal_discord_message'), hashtext(v_actor::text));
    if exists (select 1 from internal.discord_messages where sent_by = v_actor and sent_at > now() - interval '5 seconds') then
      perform internal.fail('message_too_soon');
    end if;
    begin
      -- ?wait=true : Discord répond avec le message posté, dont le numéro sert à le retirer.
      v_request := net.http_post(
        url := v_url || case when v_clean ? 'gallery' then '?wait=true&with_components=true' else '?wait=true' end,
        body := internal.discord_message_payload(v_clean),
        timeout_milliseconds := 8000
      );
    exception when others then
      v_error := left(replace(sqlerrm, split_part(v_url, '/', 7), '…'), 300);
    end;
    if p_salon like 'message:%' then
      select m.name into v_name from internal.discord_message_salons m where m.id = substr(p_salon, 9)::bigint;
    end if;
    insert into internal.discord_messages (salon, salon_name, webhook_id, sent_by, message, request_id, send_error)
    values (p_salon, v_name, split_part(v_url, '/', 6), v_actor, v_clean, v_request, v_error)
    returning id into v_id;
    -- `unsent` : pg_net n'a pas pu envoyer ; le journal ne dit pas alors que le message est parti.
    perform internal.log_admin(v_actor, 'discord_message_sent', null, jsonb_strip_nulls(jsonb_build_object('salon', p_salon, 'name', v_name, 'unsent', case when v_request is null then true end)));
    return jsonb_build_object('ok', true, 'id', v_id, 'sent', v_request is not null);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les outils ne s'appellent que depuis les fonctions du site ; l'envoi, par tout compte connecté, qui vérifie le rang.
revoke all on function internal.discord_message_gallery(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_clean(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_payload(jsonb) from public, anon, authenticated;
revoke all on function public.send_discord_message(text, jsonb) from public, anon, authenticated;
grant execute on function public.send_discord_message(text, jsonb) to authenticated;
