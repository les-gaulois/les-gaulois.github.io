-- Les messages Discord de l'encadrement, à la demande du pilote (11 novembre 2026 : « je veux un bot qui envoie des
-- embeds au salon indiqué avec tout le lot de paramètres possible en écriture […] et la possibilité upload des images »).
--
-- Dans l'espace Direction, onglet Discord, menu « Message Discord » : un admin ou le fondateur écrit un message (un texte,
-- jusqu'à dix embeds, et pour ce message seulement le nom et la photo du robot) et choisit le salon. Le serveur vérifie
-- chaque champ avec les limites de Discord, refait le message lui-même (rien d'autre ne passe) et le poste par le webhook
-- du salon, avec pg_net, comme les appels (20261111000100_appels_sur_discord.sql) : la page ne voit jamais un lien de
-- webhook. Les salons possibles : ceux du robot et celui des appels, s'ils sont réglés, et ceux que l'encadrement ajoute
-- ici pour les messages. Le message part sous le nom du webhook, comme un robot, sauf si l'on en donne un autre.
--
-- Les images : Discord ne prend une image d'embed que par son adresse. La page dépose l'image dans un espace de fichiers
-- public de Supabase, « discord-images ». Seuls les admins et le fondateur peuvent y écrire : la règle d'accès du stockage
-- le vérifie sur le serveur, avec internal.current_rank(), comme pour les captures des dons. PNG, JPEG, GIF ou WebP,
-- 8 Mo au plus. Son adresse publique part dans le message : ces images sont publiques, comme le message qui les montre.
--
-- Discord répond à chaque envoi avec le numéro du message (?wait=true) : le serveur le recopie, pour pouvoir retirer le
-- message du salon plus tard. pg_net ne sait pas envoyer de PATCH : un message ne se modifie pas, il se reprend dans le
-- formulaire, se renvoie et se retire.
--
-- Cette migration ne fait qu'ajouter : deux tables, un espace de fichiers et ses règles, des fonctions. Aucune donnée
-- n'est retirée. Rejouée, elle ne change rien.

/* ---------- Les salons des messages ---------- */

-- Les salons ajoutés pour les messages, en plus de ceux du robot et des appels. Même forme de lien que les autres : le
-- serveur ne peut poster que chez Discord. `check_*` : à l'ajout, le serveur demande à Discord si le webhook existe et
-- son nom, sans rien poster ; la réponse est recopiée à la lecture suivante.
create table if not exists internal.discord_message_salons (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  webhook_url text not null unique check (webhook_url ~ '^https://discord\.com/api/webhooks/[0-9]{17,20}/[A-Za-z0-9_-]{20,100}$'),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  check_request bigint,
  check_status integer check (check_status between 0 and 599),
  webhook_name text check (char_length(webhook_name) <= 80)
);
create unique index if not exists discord_message_salons_name on internal.discord_message_salons (lower(name));

/* ---------- Les messages envoyés ---------- */

-- Chaque message envoyé depuis le site : son salon (`robot:<salon>`, `appels` ou `message:<numéro>`, et le nom d'un salon
-- ajouté ici, gardé tel qu'il était), qui, quand, le message tel que le serveur l'a refait, et la réponse de Discord,
-- recopiée dès qu'une lecture la trouve : pg_net ne la garde que six heures. Jamais le lien du webhook : seulement son
-- numéro (`webhook_id`, sans le jeton), car seul le webhook qui a posté un message peut le retirer.
create table if not exists internal.discord_messages (
  id bigint generated always as identity primary key,
  salon text not null check (salon ~ '^(robot:[a-z]{1,20}|appels|message:[0-9]{1,18})$'),
  salon_name text check (char_length(salon_name) <= 60),
  webhook_id text check (webhook_id ~ '^[0-9]{17,20}$'),
  sent_by uuid references public.profiles (user_id) on delete set null,
  sent_at timestamptz not null default now(),
  message jsonb not null,
  request_id bigint,
  send_error text,
  status integer check (status between 0 and 599),
  timed_out boolean not null default false,
  discord_error text,
  discord_id text check (discord_id ~ '^[0-9]{17,20}$'),
  discord_channel text check (discord_channel ~ '^[0-9]{17,20}$'),
  removed_at timestamptz,
  removed_by uuid references public.profiles (user_id) on delete set null,
  remove_request bigint,
  remove_status integer check (remove_status between 0 and 599)
);
create index if not exists discord_messages_sent on internal.discord_messages (sent_at desc);

/* ---------- Les images ---------- */

-- Un espace public : Discord lit l'image à son adresse. Le nom du fichier est tiré au sort par la page (un identifiant et
-- l'extension) : il ne dit rien de qui l'a déposé ; le stockage note lui-même le compte qui dépose.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discord-images', 'discord-images', true, 8388608, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

-- Déposer : les admins et le fondateur, un nom tiré au sort. Relire la ligne déposée (le stockage la relit en écrivant) :
-- les mêmes. Personne ne remplace ni n'efface une image depuis la page : un message envoyé la montre.
do $regles$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'discord_images_insert') then
    create policy discord_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'discord-images' and internal.current_rank() >= 3 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'discord_images_read') then
    create policy discord_images_read on storage.objects for select to authenticated
      using (bucket_id = 'discord-images' and internal.current_rank() >= 3);
  end if;
end $regles$;

/* ---------- Les outils ---------- */

-- Le lien du webhook d'un salon, ou null s'il n'est pas réglé.
create or replace function internal.discord_message_hook(p_salon text) returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when p_salon ~ '^robot:[a-z]{1,20}$' then (select s.webhook_url from internal.discord_salons s where s.salon = substr(p_salon, 7))
    when p_salon = 'appels' then (select c.webhook_url from internal.discord_calls c where c.id)
    when p_salon ~ '^message:[0-9]{1,18}$' then (select m.webhook_url from internal.discord_message_salons m where m.id = substr(p_salon, 9)::bigint)
  end
$$;

-- Un texte du message : une chaîne JSON, ou rien. Les retours chariot deviennent des retours à la ligne, les autres
-- caractères de contrôle sont retirés, les blancs du début et de la fin aussi : Discord compte ainsi. Null s'il ne reste
-- rien. Au-delà de `p_max` caractères : le refus `p_error`. Autre chose qu'un texte : le message n'est pas valable.
create or replace function internal.discord_message_text(p_value jsonb, p_max integer, p_error text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  if jsonb_typeof(p_value) <> 'string' then perform internal.fail('invalid_message'); end if;
  v_text := regexp_replace(replace(replace(p_value #>> '{}', E'\r\n', E'\n'), E'\r', E'\n'), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g');
  v_text := nullif(regexp_replace(v_text, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if char_length(v_text) > p_max then perform internal.fail(p_error); end if;
  return v_text;
end $$;

-- Une adresse en https, sans espace ni chevron ni guillemet, de 2 000 caractères au plus, ou rien.
create or replace function internal.discord_message_link(p_value jsonb) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_text text := internal.discord_message_text(p_value, 2000, 'invalid_url');
begin
  if v_text is not null and v_text !~ '^https://[^[:space:]<>"]+$' then perform internal.fail('invalid_url'); end if;
  return v_text;
end $$;

-- Une partie d'embed (auteur, pied de page, image, miniature) : un objet, ou rien.
create or replace function internal.discord_message_part(p_value jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  if jsonb_typeof(p_value) <> 'object' then perform internal.fail('invalid_message'); end if;
  return p_value;
end $$;

-- Un embed, refait champ par champ : seulement ce que Discord accepte d'un webhook, avec ses limites (titre 256,
-- description 4 096, 25 champs de 256 et 1 024 caractères, pied de page 2 048, auteur 256). Un auteur a un nom, un pied
-- de page un texte, un champ un nom et une valeur. Un embed sans rien à montrer est refusé. `timestamp` : 'now', l'heure
-- de l'envoi, ou une date ISO, rangée en temps universel.
create or replace function internal.discord_message_embed(p_embed jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out jsonb := '{}';
  v_text text;
  v_link text;
  v_icon text;
  v_color numeric;
  v_part jsonb;
  v_field jsonb;
  v_fields jsonb := '[]';
  v_name text;
  v_value text;
begin
  if jsonb_typeof(p_embed) is distinct from 'object' then perform internal.fail('invalid_message'); end if;

  v_text := internal.discord_message_text(p_embed -> 'title', 256, 'embed_too_long');
  if v_text is not null then v_out := v_out || jsonb_build_object('title', v_text); end if;
  v_link := internal.discord_message_link(p_embed -> 'url');
  if v_link is not null then v_out := v_out || jsonb_build_object('url', v_link); end if;
  v_text := internal.discord_message_text(p_embed -> 'description', 4096, 'embed_too_long');
  if v_text is not null then v_out := v_out || jsonb_build_object('description', v_text); end if;

  if jsonb_typeof(p_embed -> 'color') = 'number' then
    v_color := (p_embed ->> 'color')::numeric;
    if v_color <> trunc(v_color) or v_color < 0 or v_color > 16777215 then perform internal.fail('invalid_message'); end if;
    v_out := v_out || jsonb_build_object('color', v_color::integer);
  elsif coalesce(jsonb_typeof(p_embed -> 'color'), 'null') <> 'null' then
    perform internal.fail('invalid_message');
  end if;

  if jsonb_typeof(p_embed -> 'timestamp') = 'string' then
    v_text := p_embed ->> 'timestamp';
    if v_text = 'now' then
      v_out := v_out || jsonb_build_object('timestamp', 'now');
    elsif v_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      begin
        v_out := v_out || jsonb_build_object('timestamp', to_char(v_text::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
      exception when others then
        perform internal.fail('invalid_message');
      end;
    else
      perform internal.fail('invalid_message');
    end if;
  elsif coalesce(jsonb_typeof(p_embed -> 'timestamp'), 'null') <> 'null' then
    perform internal.fail('invalid_message');
  end if;

  v_part := internal.discord_message_part(p_embed -> 'author');
  if v_part is not null then
    v_name := internal.discord_message_text(v_part -> 'name', 256, 'embed_too_long');
    v_link := internal.discord_message_link(v_part -> 'url');
    v_icon := internal.discord_message_link(v_part -> 'icon_url');
    if v_name is null and (v_link is not null or v_icon is not null) then perform internal.fail('embed_incomplete'); end if;
    if v_name is not null then
      v_out := v_out || jsonb_build_object('author', jsonb_strip_nulls(jsonb_build_object('name', v_name, 'url', v_link, 'icon_url', v_icon)));
    end if;
  end if;

  v_part := internal.discord_message_part(p_embed -> 'footer');
  if v_part is not null then
    v_text := internal.discord_message_text(v_part -> 'text', 2048, 'embed_too_long');
    v_icon := internal.discord_message_link(v_part -> 'icon_url');
    if v_text is null and v_icon is not null then perform internal.fail('embed_incomplete'); end if;
    if v_text is not null then
      v_out := v_out || jsonb_build_object('footer', jsonb_strip_nulls(jsonb_build_object('text', v_text, 'icon_url', v_icon)));
    end if;
  end if;

  v_part := internal.discord_message_part(p_embed -> 'image');
  v_link := internal.discord_message_link(v_part -> 'url');
  if v_link is not null then v_out := v_out || jsonb_build_object('image', jsonb_build_object('url', v_link)); end if;
  v_part := internal.discord_message_part(p_embed -> 'thumbnail');
  v_link := internal.discord_message_link(v_part -> 'url');
  if v_link is not null then v_out := v_out || jsonb_build_object('thumbnail', jsonb_build_object('url', v_link)); end if;

  if jsonb_typeof(p_embed -> 'fields') = 'array' then
    if jsonb_array_length(p_embed -> 'fields') > 25 then perform internal.fail('too_many_fields'); end if;
    for v_field in select value from jsonb_array_elements(p_embed -> 'fields') loop
      if jsonb_typeof(v_field) <> 'object' then perform internal.fail('invalid_message'); end if;
      v_name := internal.discord_message_text(v_field -> 'name', 256, 'embed_too_long');
      v_value := internal.discord_message_text(v_field -> 'value', 1024, 'embed_too_long');
      if v_name is null or v_value is null then perform internal.fail('embed_incomplete'); end if;
      if coalesce(jsonb_typeof(v_field -> 'inline'), 'null') not in ('boolean', 'null') then perform internal.fail('invalid_message'); end if;
      v_fields := v_fields || jsonb_build_array(jsonb_build_object('name', v_name, 'value', v_value, 'inline', coalesce((v_field ->> 'inline')::boolean, false)));
    end loop;
    if jsonb_array_length(v_fields) > 0 then v_out := v_out || jsonb_build_object('fields', v_fields); end if;
  elsif coalesce(jsonb_typeof(p_embed -> 'fields'), 'null') <> 'null' then
    perform internal.fail('invalid_message');
  end if;

  if not (v_out ?| array['title', 'description', 'fields', 'image', 'thumbnail', 'author', 'footer']) then perform internal.fail('embed_empty'); end if;
  return v_out;
end $$;

-- Le message entier, vérifié et refait : le texte (2 000), le nom du robot pour ce message (80, sans « discord » ni
-- « clyde », que Discord refuse), sa photo, 10 embeds au plus et 6 000 caractères pour l'ensemble des embeds, qui
-- notifier (`notify` : personne, les mentions écrites, ou aussi @everyone et @here), l'envoi silencieux, et le nom du fil
-- pour un salon forum (100). Il faut un texte ou un embed.
create or replace function internal.discord_message_clean(p_message jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out jsonb := '{}';
  v_text text;
  v_embed jsonb;
  v_embeds jsonb := '[]';
  v_total integer := 0;
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
  if not (v_out ? 'content' or v_out ? 'embeds') then perform internal.fail('message_empty'); end if;

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

-- Ce qui part chez Discord : le message refait, l'heure de l'envoi à la place de 'now', les mentions permises (aucune par
-- défaut : une mention s'affiche alors sans notifier personne) et le drapeau d'un envoi silencieux (4096).
create or replace function internal.discord_message_payload(p_clean jsonb) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
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
$$;

-- Recopie la réponse de Discord à l'envoi d'un message, puis à son retrait, tant que pg_net la garde : le statut, le
-- numéro du message et de son salon, ou ce que Discord reproche (un 400 nomme le champ refusé). 0 : pas de réponse.
-- Le jeton du webhook est masqué dans ce qui est recopié, par précaution.
create or replace function internal.discord_message_note(p_id bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_row internal.discord_messages;
  v_status integer;
  v_timed_out boolean;
  v_content text;
  v_error text;
  v_answer jsonb;
  v_token text;
begin
  select * into v_row from internal.discord_messages where id = p_id for update;
  if not found then return; end if;
  v_token := nullif(split_part(coalesce(internal.discord_message_hook(v_row.salon), ''), '/', 7), '');
  if v_row.request_id is not null and v_row.status is null then
    begin
      select r.status_code, r.timed_out, r.content, r.error_msg into v_status, v_timed_out, v_content, v_error from net._http_response r where r.id = v_row.request_id;
      if found then
        if v_status between 200 and 299 then
          begin
            v_answer := v_content::jsonb;
          exception when others then
            v_answer := null;
          end;
          update internal.discord_messages set
            status = v_status,
            discord_id = case when v_answer ->> 'id' ~ '^[0-9]{17,20}$' then v_answer ->> 'id' end,
            discord_channel = case when v_answer ->> 'channel_id' ~ '^[0-9]{17,20}$' then v_answer ->> 'channel_id' end
          where id = p_id;
        else
          update internal.discord_messages set
            status = case when v_status between 100 and 599 then v_status else 0 end,
            timed_out = coalesce(v_timed_out, false),
            discord_error = left(case when v_token is null then coalesce(v_content, v_error) else replace(coalesce(v_content, v_error), v_token, '…') end, 1000)
          where id = p_id;
        end if;
      end if;
    exception when others then
      null;
    end;
  end if;
  if v_row.remove_request is not null and v_row.remove_status is null then
    begin
      select r.status_code into v_status from net._http_response r where r.id = v_row.remove_request;
      if found then
        update internal.discord_messages set remove_status = case when v_status between 100 and 599 then v_status else 0 end where id = p_id;
      end if;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Recopie ce que Discord a répondu à la lecture du webhook d'un salon ajouté : s'il existe, et son nom.
create or replace function internal.discord_message_salon_note(p_id bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_request bigint;
  v_status integer;
  v_content text;
  v_name text;
begin
  select check_request into v_request from internal.discord_message_salons where id = p_id and check_status is null;
  if v_request is null then return; end if;
  begin
    select r.status_code, r.content into v_status, v_content from net._http_response r where r.id = v_request;
    if found then
      if v_status between 200 and 299 then
        begin
          v_name := left(nullif(btrim(regexp_replace(coalesce(v_content::jsonb ->> 'name', ''), '[[:cntrl:]]+', ' ', 'g')), ''), 80);
        exception when others then
          v_name := null;
        end;
      end if;
      update internal.discord_message_salons
        set check_status = case when v_status between 100 and 599 then v_status else 0 end, webhook_name = v_name
        where id = p_id;
    end if;
  exception when others then
    null;
  end;
end $$;

/* ---------- Depuis l'espace Direction ---------- */

-- Pour les admins et le fondateur : les salons où un message peut partir, et les dix derniers messages envoyés, avec la
-- réponse de Discord. Jamais un lien de webhook. Les réponses arrivées depuis la dernière lecture sont d'abord recopiées.
-- `now` : l'heure du serveur, pour savoir si une réponse se fait attendre.
create or replace function public.get_discord_messages() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    -- Un envoi d'il y a moins de sept heures, ou un retrait demandé depuis moins de sept heures, même pour un vieux message.
    for v_id in
      select d.id from internal.discord_messages d
      where (d.request_id is not null and d.status is null and d.sent_at > now() - interval '7 hours')
         or (d.remove_request is not null and d.remove_status is null and d.removed_at > now() - interval '7 hours')
      order by d.id desc
      limit 50
    loop
      perform internal.discord_message_note(v_id);
    end loop;
    for v_id in select m.id from internal.discord_message_salons m where m.check_request is not null and m.check_status is null and m.created_at > now() - interval '7 hours' loop
      perform internal.discord_message_salon_note(v_id);
    end loop;
    return jsonb_build_object(
      'ok', true,
      'now', now(),
      'salons', (
        select coalesce(jsonb_agg(x.v order by x.o, x.n), '[]') from (
          select 1 as o, s.salon as n, jsonb_build_object(
            'key', 'robot:' || s.salon,
            'kind', 'robot',
            'robot', s.salon,
            'webhook_name', (select c.webhook_name from internal.discord_salon_checks c where c.salon = s.salon and c.source = 'direction' and c.status between 200 and 299)
          ) as v
          from internal.discord_salons s
          union all
          select 2, '', jsonb_build_object('key', 'appels', 'kind', 'appels') from internal.discord_calls c where c.id
          union all
          select 3, lpad(m.id::text, 20, '0'), jsonb_build_object(
            'key', 'message:' || m.id,
            'kind', 'message',
            'id', m.id,
            'name', m.name,
            'webhook_name', m.webhook_name,
            'check_status', m.check_status,
            'checking', m.check_request is not null and m.check_status is null and m.created_at > now() - interval '6 hours',
            'created_at', m.created_at,
            'created_by', (select p.display_name from public.profiles p where p.user_id = m.created_by)
          )
          from internal.discord_message_salons m
        ) x
      ),
      'messages', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id,
          'salon', d.salon,
          'salon_name', d.salon_name,
          'at', d.sent_at,
          'by', (select p.display_name from public.profiles p where p.user_id = d.sent_by),
          'message', d.message,
          'sent', d.request_id is not null,
          'send_error', d.send_error,
          'status', d.status,
          'timed_out', d.timed_out,
          'discord_error', d.discord_error,
          -- Retirable : Discord a donné son numéro, il n'est pas déjà retiré, et le salon a toujours le webhook qui l'a posté.
          'removable', d.discord_id is not null and not coalesce(d.remove_status between 200 and 299, false)
            and split_part(coalesce(internal.discord_message_hook(d.salon), ''), '/', 6) = d.webhook_id,
          -- Pourquoi un message posté ne se retire plus d'ici : le salon n'est plus branché, ou il a changé de webhook.
          'salon_gone', internal.discord_message_hook(d.salon) is null,
          'webhook_changed', d.webhook_id is not null and internal.discord_message_hook(d.salon) is not null
            and split_part(internal.discord_message_hook(d.salon), '/', 6) <> d.webhook_id,
          'removed_at', d.removed_at,
          'removed_by', (select p.display_name from public.profiles p where p.user_id = d.removed_by),
          'remove_status', d.remove_status
        ) order by d.sent_at desc, d.id desc), '[]')
        from (select * from internal.discord_messages order by sent_at desc, id desc limit 10) d
      )
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Envoie un message dans un salon : admins et fondateur. Il part une fois la demande enregistrée, sans faire attendre la
-- page ; la réponse de Discord se lit ensuite par get_discord_messages. Cinq secondes au moins entre deux messages d'un
-- même membre : un double clic n'envoie pas deux fois.
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
      v_request := net.http_post(url := v_url || '?wait=true', body := internal.discord_message_payload(v_clean), timeout_milliseconds := 8000);
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

-- Retire un message du salon Discord, par le webhook du salon : admins et fondateur. Il faut le numéro que Discord a
-- donné à l'envoi, et le même webhook : un message posté avant que le salon soit rebranché sur un autre webhook ne se
-- retire que dans Discord. Quinze secondes au moins entre deux demandes pour un même message.
create or replace function public.remove_discord_message(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row internal.discord_messages;
  v_url text;
  v_request bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    perform internal.discord_message_note(p_id);
    select * into v_row from internal.discord_messages where id = p_id for update;
    if not found then perform internal.fail('message_not_found'); end if;
    if v_row.remove_status between 200 and 299 then perform internal.fail('message_removed'); end if;
    if v_row.removed_at > now() - interval '15 seconds' then perform internal.fail('message_busy'); end if;
    if v_row.discord_id is null then perform internal.fail('message_unknown'); end if;
    v_url := internal.discord_message_hook(v_row.salon);
    if v_url is null then perform internal.fail('discord_not_set'); end if;
    if split_part(v_url, '/', 6) is distinct from v_row.webhook_id then perform internal.fail('message_other_webhook'); end if;
    begin
      v_request := net.http_delete(
        url := v_url || '/messages/' || v_row.discord_id || case when v_row.message ? 'thread_name' and v_row.discord_channel is not null then '?thread_id=' || v_row.discord_channel else '' end,
        timeout_milliseconds := 8000
      );
    exception when others then
      perform internal.fail('remove_failed');
    end;
    update internal.discord_messages set removed_at = now(), removed_by = v_actor, remove_request = v_request, remove_status = null where id = p_id;
    perform internal.log_admin(v_actor, 'discord_message_removed', null, jsonb_strip_nulls(jsonb_build_object('salon', v_row.salon, 'name', v_row.salon_name)));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Ajoute un salon pour les messages : un nom (60 caractères) et le lien de son webhook. Rien n'est posté : le serveur
-- demande seulement à Discord si le webhook existe, et son nom. 20 salons au plus, sans doublon de nom ni de lien.
create or replace function public.add_discord_message_salon(p_name text, p_webhook text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  v_url text := internal.discord_webhook_of(p_webhook);
  v_id bigint;
  v_request bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if v_name is null or char_length(v_name) > 60 then perform internal.fail('invalid_salon_name'); end if;
    if v_url is null then perform internal.fail('invalid_webhook'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_discord_message_salons'));
    if (select count(*) from internal.discord_message_salons) >= 20 then perform internal.fail('too_many_salons'); end if;
    if exists (select 1 from internal.discord_message_salons where lower(name) = lower(v_name)) then perform internal.fail('salon_name_taken'); end if;
    if exists (select 1 from internal.discord_message_salons where webhook_url = v_url) then perform internal.fail('webhook_taken'); end if;
    insert into internal.discord_message_salons (name, webhook_url, created_by) values (v_name, v_url, v_actor) returning id into v_id;
    begin
      v_request := net.http_get(url := v_url, timeout_milliseconds := 5000);
      update internal.discord_message_salons set check_request = v_request where id = v_id;
    exception when others then
      null;
    end;
    perform internal.log_admin(v_actor, 'discord_message_salon_added', null, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true, 'key', 'message:' || v_id);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Retire un salon ajouté pour les messages, lien compris. Les messages déjà postés restent dans le salon Discord, mais ne
-- se retirent plus depuis le site.
create or replace function public.remove_discord_message_salon(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    delete from internal.discord_message_salons where id = p_id returning name into v_name;
    if not found then perform internal.fail('invalid_salon'); end if;
    perform internal.log_admin(v_actor, 'discord_message_salon_removed', null, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

-- Des tables privées, comme celles des autres salons : seules les fonctions ci-dessus les lisent.
alter table internal.discord_message_salons enable row level security;
alter table internal.discord_messages enable row level security;
revoke all on internal.discord_message_salons from public, anon, authenticated;
revoke all on internal.discord_messages from public, anon, authenticated;

-- Les outils ne s'appellent que depuis les fonctions du site.
revoke all on function internal.discord_message_hook(text) from public, anon, authenticated;
revoke all on function internal.discord_message_text(jsonb, integer, text) from public, anon, authenticated;
revoke all on function internal.discord_message_link(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_part(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_embed(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_clean(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_payload(jsonb) from public, anon, authenticated;
revoke all on function internal.discord_message_note(bigint) from public, anon, authenticated;
revoke all on function internal.discord_message_salon_note(bigint) from public, anon, authenticated;

-- Tout compte connecté : chaque fonction vérifie elle-même le rang (admin ou fondateur).
revoke all on function public.get_discord_messages() from public, anon, authenticated;
revoke all on function public.send_discord_message(text, jsonb) from public, anon, authenticated;
revoke all on function public.remove_discord_message(bigint) from public, anon, authenticated;
revoke all on function public.add_discord_message_salon(text, text) from public, anon, authenticated;
revoke all on function public.remove_discord_message_salon(bigint) from public, anon, authenticated;
grant execute on function public.get_discord_messages() to authenticated;
grant execute on function public.send_discord_message(text, jsonb) to authenticated;
grant execute on function public.remove_discord_message(bigint) to authenticated;
grant execute on function public.add_discord_message_salon(text, text) to authenticated;
grant execute on function public.remove_discord_message_salon(bigint) to authenticated;
