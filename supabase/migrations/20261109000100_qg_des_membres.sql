-- Le QG des membres : la face privée du site, ouverte aux seuls membres validés. Le serveur vérifie tout.
-- Les sondages y passent, avec leur archive : l'accueil public ne les montre plus. S'y ajoutent une boîte à idées,
-- le mur des membres qui choisissent de se montrer, et, parmi eux, qui vient aux événements.
-- Cette migration ne fait qu'ajouter : une colonne, deux tables, des fonctions, et de nouvelles versions de
-- get_site_news et d'export_site. Aucune donnée n'est retirée.

/* ---------- Se montrer aux autres membres ---------- */

-- Non par défaut : le nom et la photo Discord d'un membre ne sont montrés aux autres membres validés que s'il le choisit.
alter table public.profiles add column show_to_members boolean not null default false;

-- L'adresse de la photo de profil Discord, lue dans auth.identities, que seul Supabase écrit, depuis Discord.
-- Elle n'est recopiée dans aucune table du site. Seule une photo choisie par le membre est acceptée, à l'adresse
-- exacte du serveur d'images de Discord : l'image par défaut d'un compte sans photo est le logo de Discord, que le
-- site n'affiche pas. Cette adresse contient l'identifiant Discord du membre : le QG le dit avant qu'il se montre.
create function internal.discord_avatar(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.url from (
    select coalesce(i.identity_data ->> 'avatar_url', i.identity_data ->> 'picture') as url
    from auth.identities i
    where i.user_id = p_user and i.provider = 'discord'
    order by i.last_sign_in_at desc nulls last
    limit 1
  ) a
  where a.url ~ '^https://cdn\.discordapp\.com/avatars/[0-9]{5,25}/[A-Za-z0-9_]{1,80}\.(png|gif|webp|jpg)$'
$$;

-- Ce qu'un membre montre de lui aux autres membres : son nom sur le site, son rôle et sa photo Discord.
create function internal.member_face(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', p.display_name, 'role', p.role, 'avatar', internal.discord_avatar(p.user_id))
  from public.profiles p where p.user_id = p_user
$$;

-- Un membre validé choisit, pour lui-même, d'apparaître ou non sur le mur et parmi ceux qui viennent.
create function public.set_member_visibility(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    update public.profiles set show_to_members = coalesce(p_on, false) where user_id = v_actor;
    return jsonb_build_object('ok', true, 'visible', coalesce(p_on, false));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- La boîte à idées ---------- */

-- Des tables privées, dans `internal` : seules les fonctions ci-dessous les lisent, pour les membres validés.
-- Une idée part avec le compte de son auteur. open : à l'étude ; kept : retenue ; declined : écartée ; done : faite.
create table internal.ideas (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  body text not null check (char_length(body) between 10 and 500),
  status text not null default 'open' check (status in ('open', 'kept', 'declined', 'done')),
  staff_note text check (char_length(staff_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (user_id) on delete set null
);
create index ideas_author on internal.ideas (author_id);

-- Un soutien par membre et par idée. Le site ne montre que leur nombre, jamais qui soutient quoi.
create table internal.idea_supports (
  idea_id bigint not null references internal.ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index idea_supports_user on internal.idea_supports (user_id);

-- Seuls comptent les soutiens des membres validés : celui d'un compte suspendu ne compte plus.
create function internal.idea_support_count(p_idea bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from internal.idea_supports s
  join public.profiles p on p.user_id = s.user_id and p.status = 'validated'
  where s.idea_id = p_idea
$$;

-- Un membre validé propose une idée, sous son nom. Trois idées à l'étude au plus par membre.
create function public.save_idea(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if char_length(v_body) not between 10 and 500 then perform internal.fail('invalid_idea'); end if;
    -- Deux envois simultanés du même membre comptent l'un après l'autre : sinon, chacun passerait sous la limite.
    perform pg_advisory_xact_lock(hashtext('gal_save_idea'), hashtext(v_actor::text));
    if (select count(*) from internal.ideas where author_id = v_actor and status = 'open') >= 3 then perform internal.fail('too_many_ideas'); end if;
    insert into internal.ideas (author_id, body) values (v_actor, v_body) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Un membre validé soutient l'idée d'un autre, tant qu'elle est à l'étude, ou retire son soutien.
create function public.support_idea(p_idea bigint, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row internal.ideas;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    select * into v_row from internal.ideas where id = p_idea;
    if not found then perform internal.fail('idea_not_found'); end if;
    if v_row.status <> 'open' then perform internal.fail('idea_closed'); end if;
    if v_row.author_id = v_actor then perform internal.fail('own_idea'); end if;
    if coalesce(p_on, false) then
      insert into internal.idea_supports (idea_id, user_id) values (p_idea, v_actor) on conflict do nothing;
    else
      delete from internal.idea_supports where idea_id = p_idea and user_id = v_actor;
    end if;
    return jsonb_build_object('ok', true, 'supports', internal.idea_support_count(p_idea));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'auteur retire son idée quand il veut : c'est son texte. L'encadrement peut retirer celle d'un autre, et le journal
-- le note sans recopier le texte : ce journal ne s'efface pas.
create function public.delete_idea(p_idea bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row internal.ideas;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    select * into v_row from internal.ideas where id = p_idea for update;
    if not found then perform internal.fail('idea_not_found'); end if;
    if v_row.author_id <> v_actor and internal.current_rank() < 2 then perform internal.fail('forbidden'); end if;
    delete from internal.ideas where id = p_idea;
    if v_row.author_id <> v_actor then
      perform internal.log_admin(v_actor, 'idea_removed', v_row.author_id, jsonb_build_object('id', p_idea));
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'encadrement tranche : retenue, écartée ou faite, avec un mot facultatif. Remettre à l'étude efface la décision.
create function public.decide_idea(p_idea bigint, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row internal.ideas;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_status is null or p_status not in ('open', 'kept', 'declined', 'done') then perform internal.fail('invalid_status'); end if;
    if char_length(coalesce(v_note, '')) > 300 then perform internal.fail('invalid_note'); end if;
    select * into v_row from internal.ideas where id = p_idea for update;
    if not found then perform internal.fail('idea_not_found'); end if;
    update internal.ideas
    set status = p_status,
        staff_note = case when p_status = 'open' then null else v_note end,
        decided_at = case when p_status = 'open' then null else now() end,
        decided_by = case when p_status = 'open' then null else v_actor end
    where id = p_idea;
    perform internal.log_admin(v_actor, 'idea_decided', v_row.author_id, jsonb_build_object('id', p_idea, 'status', p_status));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le QG : tout ce qu'un membre validé y lit, en un appel ---------- */

-- Refusé à un visiteur, à un compte en attente et à un compte suspendu : rien du QG ne sort sans validation.
--  - Sondages : les ouverts, puis les 30 derniers fermés, avec leurs totaux et le choix de l'appelant. Jamais qui a voté quoi.
--  - Événements : comme sur l'accueil, avec en plus les membres qui viennent parmi ceux qui ont choisi de se montrer.
--  - Idées : celles à l'étude, puis les 50 dernières tranchées, sous le nom de leur auteur, avec le nombre de soutiens.
--    Les idées d'un compte suspendu ne sont pas montrées.
--  - Mur : les membres validés qui ont choisi de se montrer, l'encadrement d'abord.
create function public.get_qg() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_polls jsonb;
  v_events jsonb;
  v_ideas jsonb;
  v_wall jsonb;
  v_detail text;
begin
  v_actor := internal.require_rank(1);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.is_open desc, coalesce(t.ended_at, t.created_at) desc), '[]') into v_polls from (
    (select p.id, p.question, p.options, p.created_at, p.closes_at, true as is_open, null::timestamptz as ended_at,
       internal.poll_counts(p) as counts,
       (select v.choice from internal.poll_votes v where v.poll_id = p.id and v.user_id = v_actor) as mine
     from public.polls p where internal.poll_is_open(p)
     order by p.created_at desc limit 3)
    union all
    (select p.id, p.question, p.options, p.created_at, p.closes_at, false as is_open, coalesce(p.closed_at, p.closes_at) as ended_at,
       internal.poll_counts(p) as counts,
       (select v.choice from internal.poll_votes v where v.poll_id = p.id and v.user_id = v_actor) as mine
     from public.polls p where not internal.poll_is_open(p)
     order by coalesce(p.closed_at, p.closes_at) desc limit 30)
  ) t;

  with upcoming as (
    select e.*,
      row_number() over (partition by coalesce(e.series_id::text, e.id::text) order by e.starts_at) as rank_in_series,
      count(*) over (partition by coalesce(e.series_id::text, e.id::text)) as series_left,
      max(e.starts_at) over (partition by coalesce(e.series_id::text, e.id::text)) as series_until
    from public.site_events e
    where e.starts_at >= now()
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.starts_at), '[]') into v_events from (
    select u.id, u.title, u.description, u.url, u.starts_at,
      internal.going_count(u.id) as going,
      exists (select 1 from internal.event_attendance a where a.event_id = u.id and a.user_id = v_actor) as mine,
      case when u.series_id is null then null else jsonb_build_object('left', u.series_left, 'until', u.series_until) end as series,
      (select coalesce(jsonb_agg(internal.member_face(f.user_id) order by f.display_name), '[]') from (
        select pr.user_id, pr.display_name
        from internal.event_attendance a
        join public.profiles pr on pr.user_id = a.user_id and pr.status = 'validated' and pr.show_to_members
        where a.event_id = u.id
        order by pr.display_name limit 12
      ) f) as faces
    from upcoming u where u.rank_in_series = 1 order by u.starts_at limit 10
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') into v_ideas from (
    (select i.id, i.body, i.status, i.staff_note, i.created_at, i.decided_at, pr.display_name as author,
       i.author_id = v_actor as mine,
       internal.idea_support_count(i.id) as supports,
       exists (select 1 from internal.idea_supports s where s.idea_id = i.id and s.user_id = v_actor) as supported
     from internal.ideas i
     join public.profiles pr on pr.user_id = i.author_id and pr.status = 'validated'
     where i.status = 'open'
     order by i.created_at desc limit 100)
    union all
    (select i.id, i.body, i.status, i.staff_note, i.created_at, i.decided_at, pr.display_name as author,
       i.author_id = v_actor as mine,
       internal.idea_support_count(i.id) as supports,
       exists (select 1 from internal.idea_supports s where s.idea_id = i.id and s.user_id = v_actor) as supported
     from internal.ideas i
     join public.profiles pr on pr.user_id = i.author_id and pr.status = 'validated'
     where i.status <> 'open'
     order by i.decided_at desc nulls last limit 50)
  ) t;

  select coalesce(jsonb_agg(internal.member_face(t.user_id) order by t.role_rank desc, t.display_name), '[]') into v_wall from (
    select p.user_id, p.display_name, internal.rank_of(p.role) as role_rank
    from public.profiles p
    where p.status = 'validated' and p.show_to_members
    order by internal.rank_of(p.role) desc, p.display_name limit 300
  ) t;

  return jsonb_build_object(
    'ok', true,
    'me', (select jsonb_build_object('visible', p.show_to_members, 'avatar', internal.discord_avatar(p.user_id)) from public.profiles p where p.user_id = v_actor),
    'members', (select count(*) from public.profiles where status = 'validated'),
    'welcome', (select jsonb_build_object('body', value ->> 'body', 'updated_at', updated_at) from public.app_state where key = 'welcome'),
    'polls', v_polls,
    'events', v_events,
    'ideas', v_ideas,
    'wall', v_wall
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- L'accueil public : une nouvelle version de get_site_news, sans les sondages ---------- */

-- Public, même sans compte : les annonces et les événements, avec le nombre de membres qui viennent, jamais leurs noms.
-- Les sondages et leurs totaux ne sortent plus ici : ils sont au QG, pour les membres validés. La case « polls » reste,
-- vide, pour les pages d'accueil déjà ouvertes dans un navigateur.
create or replace function public.get_site_news() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with upcoming as (
    select e.*,
      row_number() over (partition by coalesce(e.series_id::text, e.id::text) order by e.starts_at) as rank_in_series,
      count(*) over (partition by coalesce(e.series_id::text, e.id::text)) as series_left,
      max(e.starts_at) over (partition by coalesce(e.series_id::text, e.id::text)) as series_until
    from public.site_events e
    where e.starts_at >= now()
  )
  select jsonb_build_object(
    'ok', true,
    'announcements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from (
      select id, title, body, url, created_at from public.site_announcements order by created_at desc limit 10
    ) t),
    'events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.starts_at), '[]') from (
      select u.id, u.title, u.description, u.url, u.starts_at,
        internal.going_count(u.id) as going,
        case when u.series_id is null then null else jsonb_build_object('left', u.series_left, 'until', u.series_until) end as series
      from upcoming u where u.rank_in_series = 1 order by u.starts_at limit 10
    ) t),
    'polls', '[]'::jsonb
  )
$$;

/* ---------- La sauvegarde : une nouvelle version d'export_site ---------- */

-- Comme la version 1, avec en plus les idées et, de leurs soutiens, seulement le nombre par idée : personne, pas même
-- avec la phrase de passe, n'apprend qui a soutenu quoi. Le choix de se montrer est dans `profiles`.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 2,
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
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome')
  )
$$;

/* ---------- Règles d'accès ---------- */

-- Les idées et leurs soutiens : des tables privées, comme internal.poll_votes, que l'API ne montre à personne.
alter table internal.ideas enable row level security;
alter table internal.idea_supports enable row level security;
revoke all on internal.ideas, internal.idea_supports from public, anon, authenticated;

revoke all on function internal.discord_avatar(uuid) from public, anon, authenticated;
revoke all on function internal.member_face(uuid) from public, anon, authenticated;
revoke all on function internal.idea_support_count(bigint) from public, anon, authenticated;
revoke all on function public.set_member_visibility(boolean) from public, anon, authenticated;
revoke all on function public.save_idea(text) from public, anon, authenticated;
revoke all on function public.support_idea(bigint, boolean) from public, anon, authenticated;
revoke all on function public.delete_idea(bigint) from public, anon, authenticated;
revoke all on function public.decide_idea(bigint, text, text) from public, anon, authenticated;
revoke all on function public.get_qg() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même que le compte est validé, et son rang.
grant execute on function public.set_member_visibility(boolean) to authenticated;
grant execute on function public.save_idea(text) to authenticated;
grant execute on function public.support_idea(bigint, boolean) to authenticated;
grant execute on function public.delete_idea(bigint) to authenticated;
grant execute on function public.decide_idea(bigint, text, text) to authenticated;
grant execute on function public.get_qg() to authenticated;
