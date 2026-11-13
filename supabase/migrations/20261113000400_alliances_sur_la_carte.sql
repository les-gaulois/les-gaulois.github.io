-- Les alliances sur la carte, demandées par le pilote le 13 novembre 2026 : l'encadrement de GAL rassemble les clans en
-- alliances, dessine pixel par pixel les zones que l'alliance doit prendre, et invite les joueurs des clans alliés, qui se
-- connectent à la carte de l'alliance, jamais au QG. Les Gaulois validés et les alliés invités s'y parlent.
--
-- « Notre alliance » est celle où l'encadrement a rangé GAL. Un allié n'entre que tant que son clan y est rangé.
-- Le serveur vérifie tout : chaque fonction relit l'appelant. Le journal, qui ne s'efface jamais, ne garde des alliés que
-- leur clan et leur compte, jamais le nom choisi ni le pseudo noté sur une invitation, ni le texte d'un message. Cette migration ne fait qu'ajouter : sept tables privées dans
-- `internal`, des fonctions, et une nouvelle version d'export_site. Aucune donnée n'est retirée.
-- Rien n'est lu chez OpenFront ici : les territoires viennent de la collecte du site, publiée avec la page Carte.

/* ---------- Les tables ---------- */

-- Une alliance : un nom et une couleur sur la carte. Douze au plus.
create table if not exists internal.alliances (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 2 and 40),
  color integer not null check (color between 0 and 16777215),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists alliances_name_unique on internal.alliances (lower(name));

-- Un clan, par son tag de la carte officielle, n'est que dans une alliance à la fois.
create table if not exists internal.alliance_clans (
  tag text primary key check (tag ~ '^[A-Z0-9]{2,5}$'),
  alliance_id bigint not null references internal.alliances (id) on delete cascade,
  added_by uuid references public.profiles (user_id) on delete set null,
  added_at timestamptz not null default now()
);
create index if not exists alliance_clans_alliance on internal.alliance_clans (alliance_id);

-- Une invitation, pour un joueur d'un clan allié : un lien à usage unique, valable sept jours. Le lien lui-même n'est gardé
-- nulle part, seulement son empreinte. `note` : le pseudo du joueur, pour que l'encadrement s'en souvienne.
create table if not exists internal.alliance_invites (
  id bigint generated always as identity primary key,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  note text not null check (char_length(note) between 2 and 24),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references public.profiles (user_id) on delete set null,
  used_at timestamptz
);

-- Les joueurs invités : leur clan allié et le nom qu'ils ont choisi pour la carte. Un compte, une ligne. Ils restent des
-- comptes « en attente » : le QG et tout ce qui demande un membre validé leur restent fermés.
create table if not exists internal.alliance_allies (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  alias text not null check (char_length(alias) between 2 and 24),
  invited_by uuid references public.profiles (user_id) on delete set null,
  joined_at timestamptz not null default now()
);

-- Une zone à prendre, dessinée pixel par pixel sur la carte complète : le cadre qui la contient (x, y, largeur, hauteur) et
-- un pixel par bit, ligne après ligne, le premier dans le bit de poids faible. `tag` : le clan chargé de la prendre, ou
-- toute l'alliance (`null`). `pixels` est compté par le serveur, jamais lu dans la demande.
create table if not exists internal.alliance_zones (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 2 and 40),
  tag text check (tag ~ '^[A-Z0-9]{2,5}$'),
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  w integer not null check (w between 1 and 16384),
  h integer not null check (h between 1 and 16384),
  mask bytea not null,
  pixels integer not null check (pixels > 0),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  check (x + w <= 16384 and y + h <= 16384 and w * h <= 1048576 and octet_length(mask) = (w * h + 7) / 8)
);

-- Les troupes d'un clan de l'alliance, telles qu'un de ses joueurs les déclare : OpenFront ne les donne pas à la collecte.
-- Le site les montre comme une déclaration, avec son auteur et son heure, jamais comme un relevé. Elles partent avec le
-- compte de leur auteur : son nom ne reste pas affiché.
create table if not exists internal.alliance_troops (
  tag text primary key check (tag ~ '^[A-Z0-9]{2,5}$'),
  troops bigint not null check (troops between 0 and 1000000000000),
  declared_by uuid references public.profiles (user_id) on delete cascade,
  declared_name text not null check (char_length(declared_name) between 1 and 64),
  declared_at timestamptz not null default now()
);

-- La discussion de l'alliance. Le nom et le clan de l'auteur sont ceux du moment de l'envoi. Effacée au bout de 30 jours.
create table if not exists internal.alliance_messages (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  name text not null check (char_length(name) between 1 and 64),
  staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists alliance_messages_created on internal.alliance_messages (created_at);
create index if not exists alliance_messages_author on internal.alliance_messages (author_id, created_at);

/* ---------- Qui entre sur la carte de l'alliance ---------- */

-- Le tag du clan du site.
create or replace function internal.site_clan() returns text
language sql immutable as $$ select 'GAL'::text $$;

-- L'alliance où l'encadrement a rangé GAL. `null` : GAL n'est dans aucune alliance, et aucun allié n'entre.
create or replace function internal.our_alliance() returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select alliance_id from internal.alliance_clans where tag = internal.site_clan()
$$;

-- Ce que la carte de l'alliance ouvre à ce compte. Un Gaulois validé y entre toujours ; un allié invité, tant que son
-- clan est dans notre alliance. `null` : rien, ni pour un compte suspendu, ni pour un compte inconnu.
create or replace function internal.map_access(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p.status = 'validated' then jsonb_build_object(
      'kind', 'gaulois',
      'tag', internal.site_clan(),
      'name', coalesce(internal.member_pseudo(p.user_id), p.display_name),
      'rank', internal.rank_of(p.role),
      'staff', internal.rank_of(p.role) >= 2)
    when p.status = 'pending' and a.user_id is not null and a.tag <> internal.site_clan()
      and exists (select 1 from internal.alliance_clans c where c.tag = a.tag and c.alliance_id = internal.our_alliance())
      then jsonb_build_object('kind', 'allie', 'tag', a.tag, 'name', a.alias, 'rank', 0, 'staff', false)
    else null
  end
  from public.profiles p
  left join internal.alliance_allies a on a.user_id = p.user_id
  where p.user_id = p_user
$$;

-- L'appelant, s'il a accès à la carte de l'alliance : son accès, sinon un refus.
create or replace function internal.require_map_access() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_access jsonb;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select status into v_status from public.profiles where user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  v_access := internal.map_access(v_uid);
  if v_access is null then perform internal.fail('no_map_access'); end if;
  return v_access;
end $$;

-- Un tag de clan tel que la carte officielle l'écrit : en capitales, de deux à cinq lettres ou chiffres.
create or replace function internal.clean_tag(p_tag text) returns text
language plpgsql immutable as $$
declare
  v_tag text := upper(btrim(coalesce(p_tag, '')));
begin
  if v_tag !~ '^[A-Z0-9]{2,5}$' then perform internal.fail('invalid_clan'); end if;
  return v_tag;
end $$;

-- Un nom court tapé par un joueur : sans caractère de contrôle, espaces resserrés.
create or replace function internal.clean_label(p_text text, p_min integer, p_max integer, p_error text) returns text
language plpgsql immutable as $$
declare
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if v_text ~ '[[:cntrl:]]' or char_length(v_text) not between p_min and p_max then perform internal.fail(p_error); end if;
  return v_text;
end $$;

-- Ce qui est périmé s'efface à la lecture : les messages de plus de 30 jours, les invitations finies depuis 30 jours.
create or replace function internal.alliance_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from internal.alliance_messages where created_at < now() - interval '30 days';
  delete from internal.alliance_invites where coalesce(used_at, expires_at) < now() - interval '30 days';
$$;

/* ---------- Lire la carte de l'alliance ---------- */

-- Pour l'en-tête et la porte de la carte : ce que la carte ouvre à ce compte, sans rien d'autre. Un compte connecté sans
-- accès reçoit `access: null`, pas un refus : la carte lui dit alors comment être invité.
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
  return jsonb_build_object('ok', true, 'access', internal.map_access(v_uid));
end $$;

-- Tout ce que montre la carte de l'alliance, en un appel : les alliances et leurs clans, les troupes déclarées, les zones
-- à prendre, et, pour l'encadrement, les alliés et les invitations en attente. La discussion se lit à part.
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
  if v_access is null then return jsonb_build_object('ok', true, 'access', null); end if;
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
        'active', internal.map_access(a.user_id) is not null
      ) order by a.tag, lower(a.alias)), '[]')
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

/* ---------- Les alliances et leurs clans : l'encadrement ---------- */

-- Crée (`p_id` vide) ou modifie une alliance : son nom et sa couleur.
create or replace function public.save_alliance(p_id bigint, p_name text, p_color integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    v_name := internal.clean_label(p_name, 2, 40, 'invalid_alliance');
    if p_color is null or p_color not between 0 and 16777215 then perform internal.fail('invalid_alliance'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_alliances'));
    if exists (select 1 from internal.alliances where lower(name) = lower(v_name) and id is distinct from p_id) then
      perform internal.fail('alliance_name_taken');
    end if;
    if p_id is null then
      if (select count(*) from internal.alliances) >= 12 then perform internal.fail('too_many_alliances'); end if;
      insert into internal.alliances (name, color, created_by) values (v_name, p_color, v_actor) returning id into v_id;
    else
      update internal.alliances set name = v_name, color = p_color, updated_at = now() where id = p_id returning id into v_id;
      if v_id is null then perform internal.fail('alliance_not_found'); end if;
    end if;
    perform internal.log_admin(v_actor, 'alliance_saved', null, jsonb_build_object('alliance', v_id, 'name', v_name, 'new', p_id is null));
    return jsonb_build_object('ok', true, 'id', v_id);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Supprime une alliance : ses clans n'ont plus d'alliance. Si c'est la nôtre, les alliés ne voient plus la carte de
-- l'alliance jusqu'à ce que GAL soit rangé dans une autre ; leurs invitations acceptées restent.
create or replace function public.delete_alliance(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_name text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    delete from internal.alliances where id = p_id returning name into v_name;
    if v_name is null then perform internal.fail('alliance_not_found'); end if;
    perform internal.log_admin(v_actor, 'alliance_deleted', null, jsonb_build_object('alliance', p_id, 'name', v_name));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Range un clan dans une alliance, l'en sort (`p_alliance` vide), ou le change d'alliance. Trente clans au plus par alliance.
create or replace function public.set_alliance_clan(p_tag text, p_alliance bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_tag text;
  v_name text;
  v_detail text;
begin
  if internal.limit_exceeded(60) then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    v_tag := internal.clean_tag(p_tag);
    perform pg_advisory_xact_lock(hashtext('gal_alliances'));
    if p_alliance is null then
      delete from internal.alliance_clans where tag = v_tag;
    else
      select name into v_name from internal.alliances where id = p_alliance;
      if v_name is null then perform internal.fail('alliance_not_found'); end if;
      if (select count(*) from internal.alliance_clans where alliance_id = p_alliance and tag <> v_tag) >= 30 then
        perform internal.fail('too_many_clans');
      end if;
      insert into internal.alliance_clans (tag, alliance_id, added_by) values (v_tag, p_alliance, v_actor)
      on conflict (tag) do update set alliance_id = excluded.alliance_id, added_by = excluded.added_by, added_at = now();
    end if;
    perform internal.log_admin(v_actor, 'alliance_clan_set', null, jsonb_build_object('tag', v_tag, 'alliance', p_alliance, 'name', v_name));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les joueurs alliés : invitation, entrée, départ ---------- */

-- Un lien d'invitation pour un joueur d'un clan de notre alliance, hors GAL : rendu une seule fois, valable sept jours,
-- à usage unique. Trente invitations en attente au plus.
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
    if v_tag = internal.site_clan()
       or not exists (select 1 from internal.alliance_clans where tag = v_tag and alliance_id = internal.our_alliance()) then
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

-- Annule une invitation pas encore acceptée : son lien ne mène plus à rien.
create or replace function public.cancel_alliance_invite(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row internal.alliance_invites;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    delete from internal.alliance_invites where id = p_id and used_at is null returning * into v_row;
    if v_row.id is null then perform internal.fail('invite_not_found'); end if;
    perform internal.log_admin(v_actor, 'alliance_invite_cancelled', null, jsonb_build_object('tag', v_row.tag));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Le joueur invité, connecté, accepte son invitation et choisit le nom qu'il portera sur la carte. Il faut un compte relié
-- à Discord, comme pour toute demande, et l'invitation doit être en cours, pour un clan encore dans notre alliance.
-- Un Gaulois validé n'en a pas besoin : il voit déjà la carte de l'alliance.
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
    on conflict (user_id) do update set tag = excluded.tag, alias = excluded.alias, invited_by = excluded.invited_by, joined_at = now();
    perform internal.log_admin(v_uid, 'alliance_ally_joined', v_uid, jsonb_build_object('tag', v_invite.tag));
    return jsonb_build_object('ok', true, 'access', internal.map_access(v_uid));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'encadrement retire l'accès d'un allié, par son numéro de compte.
create or replace function public.remove_alliance_ally(p_number integer) returns jsonb
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
    select user_id into v_target from public.profiles where gaul_number = p_number;
    delete from internal.alliance_allies where user_id = v_target returning * into v_row;
    if v_row.user_id is null then perform internal.fail('ally_not_found'); end if;
    perform internal.log_admin(v_actor, 'alliance_ally_removed', v_target, jsonb_build_object('tag', v_row.tag));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Un allié quitte lui-même la carte de l'alliance.
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
  perform internal.log_admin(v_uid, 'alliance_ally_left', v_uid, jsonb_build_object('tag', v_row.tag));
  return jsonb_build_object('ok', true);
end $$;

/* ---------- Les troupes déclarées ---------- */

-- Un allié déclare les troupes de son propre clan ; l'encadrement de GAL, celles de n'importe quel clan de notre alliance.
-- Sans nombre, la déclaration est retirée.
create or replace function public.declare_alliance_troops(p_tag text, p_troops bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_actor uuid := auth.uid();
  v_tag text;
  v_name text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_access := internal.require_map_access();
    v_tag := internal.clean_tag(p_tag);
    if not exists (select 1 from internal.alliance_clans where tag = v_tag and alliance_id = internal.our_alliance()) then
      perform internal.fail('clan_not_allied');
    end if;
    if not (coalesce((v_access ->> 'staff')::boolean, false) or (v_access ->> 'kind' = 'allie' and v_access ->> 'tag' = v_tag)) then
      perform internal.fail('forbidden');
    end if;
    if p_troops is null then
      delete from internal.alliance_troops where tag = v_tag;
      return jsonb_build_object('ok', true);
    end if;
    if p_troops not between 0 and 1000000000000 then perform internal.fail('invalid_troops'); end if;
    v_name := '[' || (v_access ->> 'tag') || '] ' || (v_access ->> 'name');
    insert into internal.alliance_troops (tag, troops, declared_by, declared_name) values (v_tag, p_troops, v_actor, left(v_name, 64))
    on conflict (tag) do update set troops = excluded.troops, declared_by = excluded.declared_by, declared_name = excluded.declared_name, declared_at = now();
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les zones à prendre : l'encadrement les dessine ---------- */

-- Crée (`p_id` vide) ou remplace une zone. Le masque arrive en base 64 : un bit par pixel du cadre, ligne après ligne.
-- Le serveur compte lui-même les pixels, refuse un masque vide ou de la mauvaise taille, et un clan hors de notre alliance.
-- Quatre-vingts zones au plus.
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

create or replace function public.delete_alliance_zone(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_title text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    delete from internal.alliance_zones where id = p_id returning title into v_title;
    if v_title is null then perform internal.fail('zone_not_found'); end if;
    perform internal.log_admin(v_actor, 'alliance_zone_deleted', null, jsonb_build_object('zone', p_id, 'title', v_title));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La discussion de l'alliance ---------- */

-- Les 80 derniers messages, du plus ancien au plus récent. `mine` : l'appelant peut le retirer (le sien, ou tout message
-- pour l'encadrement de GAL).
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
    delete from internal.alliance_messages where created_at < now() - interval '30 days';
    return jsonb_build_object('ok', true, 'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'at', m.created_at, 'tag', m.tag, 'name', m.name, 'staff', m.staff, 'body', m.body,
        'mine', m.author_id = v_uid, 'can_delete', m.author_id = v_uid or v_staff
      ) order by m.id), '[]')
      from (select * from internal.alliance_messages order by id desc limit 80) m
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Un message de 1 à 500 caractères, sous le nom et le clan de l'auteur. Pas plus d'un message toutes les deux secondes, ni
-- de quinze par minute.
create or replace function public.post_alliance_message(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_access := internal.require_map_access();
    if char_length(v_body) not between 1 and 500 then perform internal.fail('invalid_message'); end if;
    perform pg_advisory_xact_lock(hashtext('gal_alliance_messages'), hashtext(v_uid::text));
    if exists (select 1 from internal.alliance_messages where author_id = v_uid and created_at > now() - interval '2 seconds')
       or (select count(*) from internal.alliance_messages where author_id = v_uid and created_at > now() - interval '1 minute') >= 15 then
      perform internal.fail('too_fast');
    end if;
    insert into internal.alliance_messages (author_id, tag, name, staff, body)
    values (v_uid, v_access ->> 'tag', left(v_access ->> 'name', 64), coalesce((v_access ->> 'staff')::boolean, false), v_body)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'auteur retire son message ; l'encadrement de GAL peut retirer celui d'un autre, et le journal le note sans le texte.
create or replace function public.delete_alliance_message(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_access jsonb;
  v_uid uuid := auth.uid();
  v_row internal.alliance_messages;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_access := internal.require_map_access();
    select * into v_row from internal.alliance_messages where id = p_id;
    if v_row.id is null then perform internal.fail('message_not_found'); end if;
    if v_row.author_id <> v_uid and not coalesce((v_access ->> 'staff')::boolean, false) then perform internal.fail('forbidden'); end if;
    delete from internal.alliance_messages where id = p_id;
    if v_row.author_id <> v_uid then
      perform internal.log_admin(v_uid, 'alliance_message_deleted', v_row.author_id, jsonb_build_object('tag', v_row.tag));
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La sauvegarde : une nouvelle version d'export_site ---------- */

-- Comme la version 3, avec en plus les alliances, leurs clans, les zones dessinées, les alliés et les troupes déclarées.
-- Ni la discussion, effacée au bout de 30 jours, ni les invitations, qui ne servent qu'une semaine.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 4,
    'exported_at', now(),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profiles t),
    'private_links', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash'), '[]') from public.private_links t),
    'membership_requests', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash' - 'claimed_text' - 'note'), '[]') from public.membership_requests t),
    'admin_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.admin_log t),
    'site_announcements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_announcements t),
    'site_events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_events t),
    'event_attendance', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.event_attendance t),
    'polls', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.polls t),
    'poll_totals', (select coalesce(jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'choice', v.choice, 'votes', v.votes)), '[]') from (
      select poll_id, choice, count(*) as votes from internal.poll_votes group by poll_id, choice
    ) v),
    'ideas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.ideas t),
    'idea_support_totals', (select coalesce(jsonb_agg(jsonb_build_object('idea_id', s.idea_id, 'supports', s.supports)), '[]') from (
      select idea_id, count(*) as supports from internal.idea_supports group by idea_id
    ) s),
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome'),
    'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t),
    'alliances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliances t),
    'alliance_clans', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_clans t),
    'alliance_zones', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('mask', translate(encode(t.mask, 'base64'), E'\n', ''))), '[]') from internal.alliance_zones t),
    'alliance_allies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_allies t),
    'alliance_troops', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_troops t)
  )
$$;

/* ---------- Règles d'accès ---------- */

-- Des tables privées, dans `internal`, comme les idées : seules les fonctions ci-dessus les lisent.
alter table internal.alliances enable row level security;
alter table internal.alliance_clans enable row level security;
alter table internal.alliance_invites enable row level security;
alter table internal.alliance_allies enable row level security;
alter table internal.alliance_zones enable row level security;
alter table internal.alliance_troops enable row level security;
alter table internal.alliance_messages enable row level security;
revoke all on internal.alliances, internal.alliance_clans, internal.alliance_invites, internal.alliance_allies,
  internal.alliance_zones, internal.alliance_troops, internal.alliance_messages from public, anon, authenticated;

revoke all on function internal.site_clan() from public, anon, authenticated;
revoke all on function internal.our_alliance() from public, anon, authenticated;
revoke all on function internal.map_access(uuid) from public, anon, authenticated;
revoke all on function internal.require_map_access() from public, anon, authenticated;
revoke all on function internal.clean_tag(text) from public, anon, authenticated;
revoke all on function internal.clean_label(text, integer, integer, text) from public, anon, authenticated;
revoke all on function internal.alliance_purge() from public, anon, authenticated;
revoke all on function public.get_map_access() from public, anon, authenticated;
revoke all on function public.get_alliance_map() from public, anon, authenticated;
revoke all on function public.save_alliance(bigint, text, integer) from public, anon, authenticated;
revoke all on function public.delete_alliance(bigint) from public, anon, authenticated;
revoke all on function public.set_alliance_clan(text, bigint) from public, anon, authenticated;
revoke all on function public.create_alliance_invite(text, text) from public, anon, authenticated;
revoke all on function public.cancel_alliance_invite(bigint) from public, anon, authenticated;
revoke all on function public.accept_alliance_invite(text, text) from public, anon, authenticated;
revoke all on function public.remove_alliance_ally(integer) from public, anon, authenticated;
revoke all on function public.leave_alliance_map() from public, anon, authenticated;
revoke all on function public.declare_alliance_troops(text, bigint) from public, anon, authenticated;
revoke all on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.delete_alliance_zone(bigint) from public, anon, authenticated;
revoke all on function public.get_alliance_messages() from public, anon, authenticated;
revoke all on function public.post_alliance_message(text) from public, anon, authenticated;
revoke all on function public.delete_alliance_message(bigint) from public, anon, authenticated;
-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même l'accès à la carte de l'alliance, et le rang.
grant execute on function public.get_map_access() to authenticated;
grant execute on function public.get_alliance_map() to authenticated;
grant execute on function public.save_alliance(bigint, text, integer) to authenticated;
grant execute on function public.delete_alliance(bigint) to authenticated;
grant execute on function public.set_alliance_clan(text, bigint) to authenticated;
grant execute on function public.create_alliance_invite(text, text) to authenticated;
grant execute on function public.cancel_alliance_invite(bigint) to authenticated;
grant execute on function public.accept_alliance_invite(text, text) to authenticated;
grant execute on function public.remove_alliance_ally(integer) to authenticated;
grant execute on function public.leave_alliance_map() to authenticated;
grant execute on function public.declare_alliance_troops(text, bigint) to authenticated;
grant execute on function public.save_alliance_zone(bigint, text, text, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.delete_alliance_zone(bigint) to authenticated;
grant execute on function public.get_alliance_messages() to authenticated;
grant execute on function public.post_alliance_message(text) to authenticated;
grant execute on function public.delete_alliance_message(bigint) to authenticated;
