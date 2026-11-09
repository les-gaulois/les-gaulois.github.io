-- Le Gaulois de la semaine : un membre de la liste officielle, choisi par l'encadrement depuis l'espace Direction,
-- avec un mot facultatif. Public, comme une annonce : l'accueil le montre à tous, jamais le nom de qui l'a choisi.
-- Et les visages du site au pseudo d'aujourd'hui, pour les membres validés (get_member_faces).
-- Cette migration ne fait qu'ajouter : une table, des fonctions, et de nouvelles versions de get_site_news et
-- d'export_site. Aucune donnée n'est retirée.

/* ---------- Le choix de la semaine ---------- */

-- Une ligne par semaine, du lundi au dimanche à Paris. Le pseudo est celui de la liste officielle, public chez OpenFront.
-- Le choix reste quand son auteur part : le journal garde qui l'a fait.
create table internal.weekly_picks (
  week date primary key check (extract(isodow from week) = 1),
  player text not null check (char_length(player) between 1 and 64),
  note text check (note is null or char_length(note) between 1 and 300),
  author_id uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Le lundi de la semaine en cours, à Paris.
create function internal.paris_monday() returns date
language sql stable set search_path = public, pg_temp as $$
  select date_trunc('week', now() at time zone 'Europe/Paris')::date
$$;

-- L'encadrement choisit le Gaulois de la semaine en cours, ou change son choix. Seulement un membre de la liste
-- officielle, sous son pseudo exact : un pseudo absent, ou porté par deux membres, est refusé.
create function public.save_weekly_pick(p_player text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_claim text := btrim(coalesce(p_player, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_matches integer;
  v_player text;
  v_week date := internal.paris_monday();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if char_length(v_claim) not between 1 and 64 then perform internal.fail('invalid_pick'); end if;
    if char_length(coalesce(v_note, '')) > 300 then perform internal.fail('invalid_note'); end if;
    select count(*), min(username) into v_matches, v_player from public.clan_roster where lower(username) = lower(v_claim);
    if v_matches = 0 then perform internal.fail('pick_not_in_roster'); end if;
    if v_matches > 1 then perform internal.fail('pick_ambiguous'); end if;
    insert into internal.weekly_picks (week, player, note, author_id) values (v_week, v_player, v_note, v_actor)
    on conflict (week) do update set player = excluded.player, note = excluded.note, author_id = excluded.author_id, updated_at = now();
    perform internal.log_admin(v_actor, 'weekly_pick_saved', null, jsonb_build_object('week', v_week, 'player', v_player));
    return jsonb_build_object('ok', true, 'week', v_week, 'player', v_player);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'encadrement retire le choix que l'accueil montre : celui de la semaine en cours, sinon celui de la semaine d'avant,
-- encore affiché tant qu'aucun autre n'est choisi. S'il reste un choix plus ancien dans cette fenêtre, il devient celui
-- que l'accueil montre, et l'espace Direction l'affiche avec son propre bouton.
create function public.delete_weekly_pick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date;
  v_player text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    select week into v_week from internal.weekly_picks
      where week between internal.paris_monday() - 7 and internal.paris_monday()
      order by week desc limit 1;
    if v_week is null then perform internal.fail('pick_not_found'); end if;
    delete from internal.weekly_picks where week = v_week returning player into v_player;
    perform internal.log_admin(v_actor, 'weekly_pick_deleted', null, jsonb_build_object('week', v_week, 'player', v_player));
    return jsonb_build_object('ok', true, 'week', v_week, 'player', v_player);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Le choix montré : celui de la semaine en cours, sinon celui de la semaine d'avant, tant qu'aucun autre n'est choisi.
-- Un choix reste donc affiché sa semaine, et au plus la suivante. Sa semaine l'accompagne toujours. Ni l'auteur, ni les
-- dates d'écriture.
create function internal.shown_weekly_pick() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(t) from (
    select week, player, note from internal.weekly_picks
    where week between internal.paris_monday() - 7 and internal.paris_monday()
    order by week desc limit 1
  ) t
$$;

/* ---------- L'accueil public : une nouvelle version de get_site_news, avec le Gaulois de la semaine ---------- */

-- Comme la version du QG, avec en plus « weekly_pick » : `null` quand rien n'est choisi.
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
    'polls', '[]'::jsonb,
    'weekly_pick', internal.shown_weekly_pick()
  )
$$;

/* ---------- La sauvegarde : une nouvelle version d'export_site ---------- */

-- Comme la version 2, avec en plus les Gaulois de la semaine.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 3,
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
    'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t)
  )
$$;

/* ---------- Les visages du site, au pseudo d'aujourd'hui ---------- */

-- Pour un membre validé : la photo Discord de chaque membre qui a choisi de se montrer, avec son pseudo d'aujourd'hui dans
-- la liste officielle, retrouvé par l'empreinte de son identifiant OpenFront (`private_links` et `clan_roster`), et non le
-- nom gardé le jour de sa validation. Ainsi, après un changement de pseudo, la photo suit le joueur, et un autre membre qui
-- prendrait l'ancien pseudo ne reçoit jamais la photo d'un autre. Un membre sorti de la liste n'a pas de visage ici, pas plus
-- qu'un pseudo porté par deux membres. Seulement une photo choisie, à l'adresse exacte du serveur d'images de Discord.
create function public.get_member_faces() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  begin
    perform internal.require_rank(1);
    return jsonb_build_object('ok', true, 'faces', (
      select coalesce(jsonb_agg(jsonb_build_object('pseudo', f.pseudo, 'avatar', f.avatar) order by f.pseudo), '[]')
      from (
        select c.username as pseudo, internal.discord_avatar(p.user_id) as avatar
        from public.profiles p
        join public.private_links l on l.user_id = p.user_id
        join public.clan_roster c on c.public_id_hash = l.openfront_hash
        where p.status = 'validated' and p.show_to_members and c.username is not null
      ) f
      where f.avatar is not null
        and (select count(*) from public.clan_roster c2 where lower(c2.username) = lower(f.pseudo)) = 1
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

-- Une table privée, comme les idées : seules les fonctions ci-dessus la lisent.
alter table internal.weekly_picks enable row level security;
revoke all on internal.weekly_picks from public, anon, authenticated;

revoke all on function internal.paris_monday() from public, anon, authenticated;
revoke all on function internal.shown_weekly_pick() from public, anon, authenticated;
revoke all on function public.save_weekly_pick(text, text) from public, anon, authenticated;
revoke all on function public.delete_weekly_pick() from public, anon, authenticated;
revoke all on function public.get_member_faces() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même le compte, validé, et le rang de l'encadrement.
grant execute on function public.save_weekly_pick(text, text) to authenticated;
grant execute on function public.delete_weekly_pick() to authenticated;
grant execute on function public.get_member_faces() to authenticated;
