-- La vie du clan, menée depuis l'espace Direction : les événements qui se répètent, « Je viens » aux événements,
-- les sondages et le mot d'accueil des nouveaux membres. Le serveur vérifie tout : le site ne fait qu'appeler ces fonctions.
-- Cette migration ne fait qu'ajouter : une colonne facultative, trois tables, des fonctions, et une nouvelle version de get_site_news.

/* ---------- Les événements qui se répètent ---------- */

-- Une série est une suite d'événements ordinaires, à une semaine d'écart : chacun se modifie ou se supprime seul,
-- et garde ses propres réponses. L'accueil n'en montre que le prochain, pour ne pas remplir la liste.
alter table public.site_events add column series_id uuid;
create index site_events_series on public.site_events (series_id) where series_id is not null;

create function public.save_event_series(p_title text, p_description text, p_url text, p_starts_at timestamptz, p_weeks integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_url text;
  v_local timestamp;
  v_series uuid := gen_random_uuid();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if char_length(v_title) not between 1 and 120 then perform internal.fail('invalid_title'); end if;
    if char_length(coalesce(v_description, '')) > 2000 then perform internal.fail('invalid_body'); end if;
    v_url := internal.check_news_url(p_url);
    if p_starts_at is null or p_starts_at <= now() then perform internal.fail('invalid_start'); end if;
    if p_weeks is null or p_weeks not between 2 and 12 then perform internal.fail('invalid_repeat'); end if;
    -- Même heure de Paris chaque semaine, passage à l'heure d'hiver ou d'été compris.
    v_local := p_starts_at at time zone 'Europe/Paris';
    insert into public.site_events (title, description, url, starts_at, author_id, series_id)
    select v_title, v_description, v_url, (v_local + make_interval(weeks => i)) at time zone 'Europe/Paris', v_actor, v_series
    from generate_series(0, p_weeks - 1) as i;
    perform internal.log_admin(v_actor, 'event_series_saved', null, jsonb_build_object('title', v_title, 'starts_at', p_starts_at, 'weeks', p_weeks));
    return jsonb_build_object('ok', true, 'count', p_weeks);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- « Je viens » ---------- */

-- Qui vient : une table privée, dans `internal`. L'encadrement voit les noms, tout le monde le nombre.
-- Un compte suspendu n'y est ni compté ni nommé.
create table internal.event_attendance (
  event_id bigint not null references public.site_events (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendance_user on internal.event_attendance (user_id);

-- Le nombre de membres validés qui viennent à un événement.
create function internal.going_count(p_event bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from internal.event_attendance a
  join public.profiles p on p.user_id = a.user_id and p.status = 'validated'
  where a.event_id = p_event
$$;

-- Un membre validé répond pour lui-même, et seulement à un événement à venir.
create function public.set_attendance(p_event bigint, p_going boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if not exists (select 1 from public.site_events where id = p_event and starts_at > now()) then perform internal.fail('event_over'); end if;
    if coalesce(p_going, false) then
      insert into internal.event_attendance (event_id, user_id) values (p_event, v_actor) on conflict do nothing;
    else
      delete from internal.event_attendance where event_id = p_event and user_id = v_actor;
    end if;
    return jsonb_build_object('ok', true, 'going', internal.going_count(p_event));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les noms de ceux qui viennent, pour l'encadrement, événement par événement.
create function public.list_event_attendance() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  perform internal.require_rank(2);
  return jsonb_build_object('ok', true, 'rows', (select coalesce(jsonb_agg(jsonb_build_object('event_id', t.event_id, 'names', t.names)), '[]') from (
    select a.event_id, jsonb_agg(p.display_name order by p.display_name) as names
    from internal.event_attendance a
    join public.site_events e on e.id = a.event_id
    join public.profiles p on p.user_id = a.user_id and p.status = 'validated'
    where e.starts_at >= now()
    group by a.event_id
  ) t));
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Les sondages ---------- */

create table public.polls (
  id bigint generated always as identity primary key,
  question text not null check (char_length(question) between 1 and 200),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  author_id uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  closes_at timestamptz,
  closed_at timestamptz
);

-- Une voix par membre, qu'il peut changer tant que le sondage est ouvert. Personne ne voit qui a voté quoi :
-- la table est privée, dans `internal`, aucune fonction ne le donne, et le site ne montre que les totaux.
create table internal.poll_votes (
  poll_id bigint not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  choice smallint not null check (choice >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index poll_votes_user on internal.poll_votes (user_id);

-- Ouvert : ni fermé à la main, ni passé sa date de fin.
create function internal.poll_is_open(p_poll public.polls) returns boolean
language sql stable as $$
  select p_poll.closed_at is null and (p_poll.closes_at is null or p_poll.closes_at > now())
$$;

-- Les totaux d'un sondage, une case par choix, dans l'ordre des choix. Seules comptent les voix des membres validés :
-- la voix d'un compte suspendu ne compte plus.
create function internal.poll_counts(p_poll public.polls) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg((
    select count(*) from internal.poll_votes v
    join public.profiles pr on pr.user_id = v.user_id and pr.status = 'validated'
    where v.poll_id = p_poll.id and v.choice = o.i
  ) order by o.i), '[]')
  from generate_series(0, jsonb_array_length(p_poll.options) - 1) as o(i)
$$;

-- Trois sondages ouverts au plus : l'accueil, seul endroit où l'on vote, les montre tous.
create function internal.open_polls() returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from public.polls p where internal.poll_is_open(p)
$$;

create function public.save_poll(p_question text, p_options jsonb, p_closes_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_question text := btrim(coalesce(p_question, ''));
  v_options jsonb;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if char_length(v_question) not between 1 and 200 then perform internal.fail('invalid_question'); end if;
    if p_options is null or jsonb_typeof(p_options) <> 'array' then perform internal.fail('invalid_options'); end if;
    -- Chaque choix : un texte de 1 à 80 caractères, sans doublon.
    select coalesce(jsonb_agg(btrim(value) order by ordinality), '[]') into v_options
    from jsonb_array_elements_text(p_options) with ordinality
    where btrim(value) <> '';
    if jsonb_array_length(v_options) not between 2 and 6
      or exists (select 1 from jsonb_array_elements_text(v_options) where char_length(value) > 80)
      or (select count(distinct lower(value)) from jsonb_array_elements_text(v_options)) <> jsonb_array_length(v_options) then
      perform internal.fail('invalid_options');
    end if;
    if p_closes_at is not null and (p_closes_at <= now() or p_closes_at > now() + interval '90 days') then perform internal.fail('invalid_close'); end if;
    -- Deux lancements simultanés comptent l'un après l'autre : sinon, chacun verrait deux sondages ouverts et passerait.
    perform pg_advisory_xact_lock(hashtext('gal_save_poll'));
    if internal.open_polls() >= 3 then perform internal.fail('too_many_polls'); end if;
    insert into public.polls (question, options, author_id, closes_at) values (v_question, v_options, v_actor, p_closes_at) returning id into v_id;
    perform internal.log_admin(v_actor, 'poll_saved', null, jsonb_build_object('id', v_id, 'question', v_question));
    return jsonb_build_object('ok', true, 'id', v_id);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Fermer garde les votes et le résultat ; supprimer les efface. Un officier ne touche qu'aux siens, un admin à tous.
create function public.close_poll(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row public.polls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    select * into v_row from public.polls where id = p_id for update;
    if not found then perform internal.fail('poll_not_found'); end if;
    perform internal.require_news_author(v_row.author_id, v_actor);
    if not internal.poll_is_open(v_row) then perform internal.fail('poll_closed'); end if;
    update public.polls set closed_at = now() where id = p_id;
    perform internal.log_admin(v_actor, 'poll_closed', null, jsonb_build_object('id', p_id, 'question', v_row.question));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

create function public.delete_poll(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row public.polls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    select * into v_row from public.polls where id = p_id for update;
    if not found then perform internal.fail('poll_not_found'); end if;
    perform internal.require_news_author(v_row.author_id, v_actor);
    delete from public.polls where id = p_id;
    perform internal.log_admin(v_actor, 'poll_deleted', null, jsonb_build_object('id', p_id, 'question', v_row.question));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Un membre validé vote pour lui-même, tant que le sondage est ouvert. Revoter remplace son choix.
create function public.vote_poll(p_poll bigint, p_choice integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_row public.polls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    select * into v_row from public.polls where id = p_poll;
    if not found then perform internal.fail('poll_not_found'); end if;
    if not internal.poll_is_open(v_row) then perform internal.fail('poll_closed'); end if;
    if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(v_row.options) then perform internal.fail('invalid_option'); end if;
    insert into internal.poll_votes (poll_id, user_id, choice) values (p_poll, v_actor, p_choice)
    on conflict (poll_id, user_id) do update set choice = excluded.choice, updated_at = now();
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Pour l'espace Direction : les 20 derniers sondages, ouverts ou non, avec leurs totaux.
create function public.list_polls() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  v_actor := internal.require_rank(2);
  return jsonb_build_object('ok', true, 'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from (
    select p.id, p.question, p.options, p.created_at, p.closes_at, p.closed_at,
      internal.poll_is_open(p) as is_open,
      internal.poll_counts(p) as counts,
      (select display_name from public.profiles where user_id = p.author_id) as author,
      p.author_id = v_actor or internal.current_rank() >= 3 as editable
    from public.polls p order by p.created_at desc limit 20
  ) t));
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Ce que le membre connecté a répondu ---------- */

create function public.get_my_participation() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  v_actor := internal.require_rank(1);
  return jsonb_build_object(
    'ok', true,
    'events', (select coalesce(jsonb_agg(event_id), '[]') from internal.event_attendance where user_id = v_actor),
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('poll_id', poll_id, 'choice', choice)), '[]') from internal.poll_votes where user_id = v_actor)
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Le mot d'accueil ---------- */

-- Écrit par l'encadrement, lu par chaque membre validé dans « Mon compte ». Un texte vide l'efface.
create function public.save_welcome(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if char_length(v_body) > 2000 then perform internal.fail('invalid_body'); end if;
    if v_body = '' then
      delete from public.app_state where key = 'welcome';
    else
      insert into public.app_state (key, value, updated_at) values ('welcome', jsonb_build_object('body', v_body), now())
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
    end if;
    perform internal.log_admin(v_actor, 'welcome_saved', null, jsonb_build_object('empty', v_body = ''));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

create function public.get_welcome() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  perform internal.require_rank(1);
  return coalesce(
    (select jsonb_build_object('ok', true, 'body', value ->> 'body', 'updated_at', updated_at) from public.app_state where key = 'welcome'),
    jsonb_build_object('ok', true, 'body', null, 'updated_at', null)
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- L'accueil : une nouvelle version de get_site_news ---------- */

-- Public, même sans compte. Une série n'y compte qu'une fois, par son prochain rendez-vous. Chaque événement
-- donne le nombre de membres qui viennent, jamais leurs noms. Les sondages ouverts, et ceux fermés depuis
-- moins de 7 jours, donnent leurs totaux.
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
    'polls', (select coalesce(jsonb_agg(to_jsonb(t) order by t.is_open desc, t.created_at desc), '[]') from (
      select p.id, p.question, p.options, p.created_at, p.closes_at, internal.poll_is_open(p) as is_open, internal.poll_counts(p) as counts
      from public.polls p
      where internal.poll_is_open(p) or coalesce(p.closed_at, p.closes_at) > now() - interval '7 days'
      order by internal.poll_is_open(p) desc, p.created_at desc limit 3
    ) t)
  )
$$;

/* ---------- Règles d'accès ---------- */

-- Les sondages sont dans `public`, comme les annonces : fermés aux visiteurs, lus par les seules fonctions.
alter table public.polls enable row level security;
revoke all on public.polls from anon, authenticated;
-- Qui vient et qui a voté quoi : des tables privées, comme internal.role_presets, que l'API ne montre à personne.
alter table internal.event_attendance enable row level security;
alter table internal.poll_votes enable row level security;
revoke all on internal.event_attendance, internal.poll_votes from public, anon, authenticated;

revoke all on function public.save_event_series(text, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.set_attendance(bigint, boolean) from public, anon, authenticated;
revoke all on function public.list_event_attendance() from public, anon, authenticated;
revoke all on function public.save_poll(text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.close_poll(bigint) from public, anon, authenticated;
revoke all on function public.delete_poll(bigint) from public, anon, authenticated;
revoke all on function public.vote_poll(bigint, integer) from public, anon, authenticated;
revoke all on function public.list_polls() from public, anon, authenticated;
revoke all on function public.get_my_participation() from public, anon, authenticated;
revoke all on function public.save_welcome(text) from public, anon, authenticated;
revoke all on function public.get_welcome() from public, anon, authenticated;
revoke all on function internal.poll_is_open(public.polls) from public, anon, authenticated;
revoke all on function internal.poll_counts(public.polls) from public, anon, authenticated;
revoke all on function internal.going_count(bigint) from public, anon, authenticated;
revoke all on function internal.open_polls() from public, anon, authenticated;

grant execute on function public.save_event_series(text, text, text, timestamptz, integer) to authenticated;
grant execute on function public.set_attendance(bigint, boolean) to authenticated;
grant execute on function public.list_event_attendance() to authenticated;
grant execute on function public.save_poll(text, jsonb, timestamptz) to authenticated;
grant execute on function public.close_poll(bigint) to authenticated;
grant execute on function public.delete_poll(bigint) to authenticated;
grant execute on function public.vote_poll(bigint, integer) to authenticated;
grant execute on function public.list_polls() to authenticated;
grant execute on function public.get_my_participation() to authenticated;
grant execute on function public.save_welcome(text) to authenticated;
grant execute on function public.get_welcome() to authenticated;
