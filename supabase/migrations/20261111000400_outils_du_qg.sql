-- Les outils du QG, demandés par le pilote le 11 novembre 2026 (« Fais les 7 ») : « Ce soir je joue », l'objectif de la
-- semaine, le salon vocal, les GG, les parrains, le pronostic de la semaine, et, pour l'onglet « Moi », le pseudo
-- d'aujourd'hui du membre. Tout se lit par une seule fonction, get_qg_tools, réservée aux membres validés : get_qg ne
-- change pas, et une page d'avant cette migration continue de marcher.
-- Cette migration ne fait qu'ajouter : cinq tables privées et des fonctions. Aucune donnée n'est retirée. Rejouée, elle ne change rien.
-- La sauvegarde (export_site) ne change pas : ces tables ne valent que pour la semaine, ou se refont d'un clic.

/* ---------- Outils communs ---------- */

-- Le début de l'heure d'un instant. Paris est décalé d'heures entières : l'heure pile y est la même qu'en temps universel.
create or replace function internal.hour_start(p_at timestamptz) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select to_timestamp((floor(extract(epoch from p_at) / 3600) * 3600)::double precision)
$$;

-- Le pseudo d'aujourd'hui d'un membre, dans la liste officielle, retrouvé par l'empreinte de son identifiant OpenFront, comme
-- pour les visages (get_member_faces). `null` : pas de profil lié, membre sorti de la liste, anonyme, ou pseudo porté par
-- deux membres. Le pseudo est public chez OpenFront ; il ne sert qu'à l'onglet « Moi » du membre lui-même.
create or replace function internal.member_pseudo(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select c.username
  from public.private_links l
  join public.clan_roster c on c.public_id_hash = l.openfront_hash
  where l.user_id = p_user and c.username is not null
    and (select count(*) from public.clan_roster c2 where lower(c2.username) = lower(c.username)) = 1
  limit 1
$$;

/* ---------- Ce soir je joue ---------- */

-- L'heure à laquelle chaque membre compte jouer, une seule à la fois, à l'heure pile. Elle quitte l'affichage une fois son
-- heure passée ; la ligne est remplacée au choix suivant, ou effacée avec le compte.
create table if not exists internal.play_plans (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  plays_at timestamptz not null check (extract(epoch from plays_at) % 3600 = 0),
  updated_at timestamptz not null default now()
);

-- Un membre validé dit à quelle heure il compte jouer : l'heure en cours ou l'une des onze suivantes, à l'heure pile. Une
-- heure qui vient de finir passe pour l'heure en cours : l'horloge du navigateur peut avoir une minute de retard.
-- Sans heure, il retire son choix.
create or replace function public.set_play_plan(p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_hour timestamptz := internal.hour_start(now());
  v_at timestamptz;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if p_at is null then
      delete from internal.play_plans where user_id = v_actor;
      return jsonb_build_object('ok', true, 'at', null);
    end if;
    if extract(epoch from p_at) % 3600 <> 0 or p_at < v_hour - interval '1 hour' or p_at > v_hour + interval '12 hours' then
      perform internal.fail('invalid_plan');
    end if;
    v_at := greatest(p_at, v_hour);
    insert into internal.play_plans (user_id, plays_at) values (v_actor, v_at)
    on conflict (user_id) do update set plays_at = excluded.plays_at, updated_at = now();
    return jsonb_build_object('ok', true, 'at', v_at);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les GG ---------- */

-- Un merci d'un membre à un autre, pour la semaine en cours (du lundi au dimanche, à Paris). Un seul par membre remercié et
-- par semaine. Le site ne montre que leur nombre, jamais qui remercie qui. Deux semaines sont gardées, pas davantage.
create table if not exists internal.gg (
  week date not null check (extract(isodow from week) = 1),
  giver_id uuid not null references public.profiles (user_id) on delete cascade,
  receiver_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (week, giver_id, receiver_id),
  check (giver_id <> receiver_id)
);
create index if not exists gg_receiver on internal.gg (week, receiver_id);
create index if not exists gg_giver on internal.gg (giver_id);

-- Les GG reçus par un membre dans une semaine : un par membre validé qui l'a remercié. Celui d'un compte suspendu ne compte plus.
create or replace function internal.gg_count(p_user uuid, p_week date) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from internal.gg g
  join public.profiles p on p.user_id = g.giver_id and p.status = 'validated'
  where g.week = p_week and g.receiver_id = p_user
$$;

-- Un membre validé remercie un membre du mur (validé, et qui a choisi de se montrer), ou retire son merci. Pas soi-même.
-- `p_member` : le numéro de Gaulois, public ; l'identifiant du compte ne sort jamais du serveur.
create or replace function public.give_gg(p_member integer, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_target uuid;
  v_week date := internal.paris_monday();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    select user_id into v_target from public.profiles where gaul_number = p_member and status = 'validated' and show_to_members;
    if v_target is null then perform internal.fail('member_not_shown'); end if;
    if v_target = v_actor then perform internal.fail('own_gg'); end if;
    if coalesce(p_on, false) then
      insert into internal.gg (week, giver_id, receiver_id) values (v_week, v_actor, v_target) on conflict do nothing;
    else
      delete from internal.gg where week = v_week and giver_id = v_actor and receiver_id = v_target;
    end if;
    delete from internal.gg where week < v_week - 7;
    return jsonb_build_object('ok', true, 'gg', internal.gg_count(v_target, v_week));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les parrains ---------- */

-- Les membres qui proposent d'aider les nouveaux. Le choix est le leur : les membres validés voient alors leur nom sur le
-- site, leur rôle et leur pseudo Discord, pour leur écrire. Le QG le dit avant le choix. Leur photo, dont l'adresse contient
-- l'identifiant Discord, n'est donnée que s'ils ont aussi choisi de se montrer sur le mur.
create table if not exists internal.mentors (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  since timestamptz not null default now()
);

create or replace function public.set_mentor(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if coalesce(p_on, false) then
      insert into internal.mentors (user_id) values (v_actor) on conflict do nothing;
    else
      delete from internal.mentors where user_id = v_actor;
    end if;
    return jsonb_build_object('ok', true, 'mentor', coalesce(p_on, false));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- L'objectif de la semaine ---------- */

-- Un objectif par semaine, fixé par l'encadrement : un nombre de victoires du clan, ou un clan du classement à dépasser
-- (ou à garder derrière). Le serveur ne garde que le but : le site calcule la progression avec les données publiques.
create table if not exists internal.weekly_goals (
  week date primary key check (extract(isodow from week) = 1),
  kind text not null check (kind in ('wins', 'clan')),
  wins integer check (wins between 1 and 10000),
  clan text check (clan ~ '^[A-Z0-9]{2,5}$'),
  author_id uuid references public.profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((kind = 'wins' and wins is not null and clan is null) or (kind = 'clan' and clan is not null and wins is null))
);

-- L'encadrement fixe l'objectif de la semaine en cours, ou le change. Un clan s'écrit par son tag, de 2 à 5 lettres ou
-- chiffres, comme au classement d'OpenFront ; jamais GAL.
create or replace function public.save_weekly_goal(p_kind text, p_wins integer, p_clan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date := internal.paris_monday();
  v_clan text := upper(btrim(coalesce(p_clan, '')));
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    if p_kind = 'wins' then
      if p_wins is null or p_wins not between 1 and 10000 then perform internal.fail('invalid_goal'); end if;
      insert into internal.weekly_goals (week, kind, wins, clan, author_id) values (v_week, 'wins', p_wins, null, v_actor)
      on conflict (week) do update set kind = 'wins', wins = excluded.wins, clan = null, author_id = excluded.author_id, updated_at = now();
      perform internal.log_admin(v_actor, 'weekly_goal_saved', null, jsonb_build_object('week', v_week, 'kind', 'wins', 'wins', p_wins));
    elsif p_kind = 'clan' then
      if v_clan !~ '^[A-Z0-9]{2,5}$' or v_clan = 'GAL' then perform internal.fail('invalid_goal'); end if;
      insert into internal.weekly_goals (week, kind, wins, clan, author_id) values (v_week, 'clan', null, v_clan, v_actor)
      on conflict (week) do update set kind = 'clan', wins = null, clan = excluded.clan, author_id = excluded.author_id, updated_at = now();
      perform internal.log_admin(v_actor, 'weekly_goal_saved', null, jsonb_build_object('week', v_week, 'kind', 'clan', 'clan', v_clan));
    else
      perform internal.fail('invalid_goal');
    end if;
    return jsonb_build_object('ok', true, 'week', v_week);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

create or replace function public.delete_weekly_goal() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date := internal.paris_monday();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(2);
    delete from internal.weekly_goals where week = v_week;
    if not found then perform internal.fail('goal_not_found'); end if;
    perform internal.log_admin(v_actor, 'weekly_goal_deleted', null, jsonb_build_object('week', v_week));
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le salon vocal ---------- */

-- Le lien d'un salon du serveur Discord du clan, tel que Discord le copie (clic droit sur le salon, « Copier le lien ») :
-- https://discord.com/channels/<serveur>/<salon>. Rien d'autre n'est accepté : le QG en fait un bouton. `null` sinon.
create or replace function internal.voice_link_of(p_text text) returns text
language sql immutable as $$
  select 'https://discord.com/channels/' || m[1] || '/' || m[2]
  from regexp_match(btrim(coalesce(p_text, '')), '^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/channels/([0-9]{17,20})/([0-9]{17,20})/?$') as m
$$;

-- Les admins et le fondateur règlent le lien, comme les salons Discord. Il n'est pas secret, mais il ne sort que vers les
-- membres validés, par get_qg_tools. Le journal ne le recopie pas.
create or replace function public.save_voice_channel(p_url text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text := internal.voice_link_of(p_url);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if v_url is null then perform internal.fail('invalid_voice'); end if;
    insert into public.app_state (key, value) values ('voice_channel', jsonb_build_object('url', v_url))
    on conflict (key) do update set value = excluded.value, updated_at = now();
    perform internal.log_admin(v_actor, 'voice_channel_saved', null);
    return jsonb_build_object('ok', true, 'url', v_url);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

create or replace function public.clear_voice_channel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    delete from public.app_state where key = 'voice_channel';
    if found then perform internal.log_admin(v_actor, 'voice_channel_cleared', null); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Le pronostic de la semaine ---------- */

-- Combien de victoires le clan fera dans une semaine, du lundi au dimanche à Paris : un pronostic par membre et par semaine,
-- qu'il change tant que c'est ouvert. Le résultat vient des données publiques du site, pas du serveur.
create table if not exists internal.predictions (
  week date not null check (extract(isodow from week) = 1),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  wins integer not null check (wins between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (week, user_id)
);

-- La semaine qu'on pronostique : la semaine en cours le lundi et le mardi, à Paris ; à partir du mercredi, la suivante.
create or replace function internal.prediction_week() returns date
language sql stable set search_path = public, pg_temp as $$
  select case when (now() at time zone 'Europe/Paris')::date < internal.paris_monday() + 2
    then internal.paris_monday() else internal.paris_monday() + 7 end
$$;

-- La fin des pronostics d'une semaine : son mercredi à minuit, heure de Paris. Ensuite, chacun voit ceux des autres.
create or replace function internal.prediction_closes(p_week date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (p_week + 2)::timestamp at time zone 'Europe/Paris'
$$;

-- Un membre validé fait ou change son pronostic pour la semaine ouverte. Celle de la semaine passée et de la suivante
-- suffisent : les plus anciens s'effacent.
create or replace function public.save_prediction(p_wins integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date := internal.prediction_week();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if p_wins is null or p_wins not between 0 and 10000 then perform internal.fail('invalid_prediction'); end if;
    insert into internal.predictions (week, user_id, wins) values (v_week, v_actor, p_wins)
    on conflict (week, user_id) do update set wins = excluded.wins, updated_at = now();
    delete from internal.predictions where week < internal.paris_monday() - 7;
    return jsonb_build_object('ok', true, 'week', v_week, 'wins', p_wins, 'closes_at', internal.prediction_closes(v_week));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les outils du QG : tout ce qu'un membre validé y lit, en un appel ---------- */

-- Refusé à un visiteur, à un compte en attente et à un compte suspendu, comme get_qg. Chaque lecture efface d'abord ce qui
-- est passé, comme get_lobby_calls : les heures finies, les GG et les pronostics d'avant la semaine dernière.
--  - me : son numéro de Gaulois, son pseudo d'aujourd'hui (onglet « Moi »), s'il est parrain, ses GG de la semaine.
--  - voice : le lien du salon vocal, ou null.
--  - plans : son heure, et pour chaque heure à venir, le nombre de membres et les visages de ceux qui se montrent (12 au plus).
--  - goal : l'objectif de la semaine en cours, ou null.
--  - wall : les membres qui se montrent, comme le mur de get_qg, avec leur numéro, leurs GG de la semaine et le merci de l'appelant.
--  - mentors : les parrains validés, avec leur pseudo Discord, et leur photo seulement s'ils se montrent sur le mur.
--  - predictions : la semaine ouverte (son pronostic, le nombre de pronostics, jamais ceux des autres), et les semaines
--    closes (en cours ou passée) avec le pronostic de chacun, sous son nom.
create or replace function public.get_qg_tools() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date;
  v_target date;
  v_plans jsonb;
  v_wall jsonb;
  v_mentors jsonb;
  v_closed jsonb;
  v_detail text;
begin
  v_actor := internal.require_rank(1);
  v_week := internal.paris_monday();
  v_target := internal.prediction_week();

  delete from internal.play_plans where plays_at + interval '1 hour' <= now();
  delete from internal.gg where week < v_week - 7;
  delete from internal.predictions where week < v_week - 7;

  select coalesce(jsonb_agg(jsonb_build_object('at', h.plays_at, 'count', h.members, 'faces', h.faces) order by h.plays_at), '[]') into v_plans from (
    select pp.plays_at, count(*) as members,
      (select coalesce(jsonb_agg(internal.member_face(f.user_id) order by f.display_name), '[]') from (
        select p2.user_id, p2.display_name
        from internal.play_plans q
        join public.profiles p2 on p2.user_id = q.user_id and p2.status = 'validated' and p2.show_to_members
        where q.plays_at = pp.plays_at
        order by p2.display_name limit 12
      ) f) as faces
    from internal.play_plans pp
    join public.profiles p on p.user_id = pp.user_id and p.status = 'validated'
    where pp.plays_at + interval '1 hour' > now()
    group by pp.plays_at
  ) h;

  select coalesce(jsonb_agg(internal.member_face(t.user_id) || jsonb_build_object('number', t.gaul_number, 'gg', t.gg, 'given', t.given) order by t.role_rank desc, t.display_name), '[]') into v_wall from (
    select p.user_id, p.gaul_number, p.display_name, internal.rank_of(p.role) as role_rank,
      internal.gg_count(p.user_id, v_week) as gg,
      exists (select 1 from internal.gg g where g.week = v_week and g.giver_id = v_actor and g.receiver_id = p.user_id) as given
    from public.profiles p
    where p.status = 'validated' and p.show_to_members
    order by internal.rank_of(p.role) desc, p.display_name limit 300
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', t.display_name,
      'role', t.role,
      'avatar', case when t.shown then internal.discord_avatar(t.user_id) end,
      'discord', t.discord_name,
      'mine', t.user_id = v_actor
    ) order by t.since), '[]') into v_mentors from (
    select m.user_id, m.since, p.display_name, p.role, p.show_to_members as shown, l.discord_name
    from internal.mentors m
    join public.profiles p on p.user_id = m.user_id and p.status = 'validated'
    left join public.private_links l on l.user_id = m.user_id
    order by m.since limit 50
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
      'week', w.week,
      'closes_at', internal.prediction_closes(w.week),
      'guesses', (
        select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'wins', pr.wins, 'mine', pr.user_id = v_actor) order by pr.wins, p.display_name), '[]')
        from internal.predictions pr
        join public.profiles p on p.user_id = pr.user_id and p.status = 'validated'
        where pr.week = w.week
      )
    ) order by w.week desc), '[]') into v_closed
  from (select v_week as week union all select v_week - 7) w
  where internal.prediction_closes(w.week) <= now();

  return jsonb_build_object(
    'ok', true,
    'me', jsonb_build_object(
      'number', (select gaul_number from public.profiles where user_id = v_actor),
      'pseudo', internal.member_pseudo(v_actor),
      'mentor', exists (select 1 from internal.mentors where user_id = v_actor),
      'gg', internal.gg_count(v_actor, v_week)
    ),
    'voice', (select value ->> 'url' from public.app_state where key = 'voice_channel'),
    'plans', jsonb_build_object(
      'mine', (select plays_at from internal.play_plans where user_id = v_actor and plays_at + interval '1 hour' > now()),
      'hours', v_plans
    ),
    'goal', (select jsonb_build_object('week', g.week, 'kind', g.kind, 'wins', g.wins, 'clan', g.clan) from internal.weekly_goals g where g.week = v_week),
    'wall', v_wall,
    'mentors', v_mentors,
    'predictions', jsonb_build_object(
      'week', v_target,
      'closes_at', internal.prediction_closes(v_target),
      'mine', (select wins from internal.predictions where week = v_target and user_id = v_actor),
      'count', (select count(*) from internal.predictions pr join public.profiles p on p.user_id = pr.user_id and p.status = 'validated' where pr.week = v_target),
      'closed', v_closed
    )
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Règles d'accès ---------- */

-- Des tables privées, dans `internal`, comme les idées : seules les fonctions ci-dessus les lisent.
alter table internal.play_plans enable row level security;
alter table internal.gg enable row level security;
alter table internal.mentors enable row level security;
alter table internal.weekly_goals enable row level security;
alter table internal.predictions enable row level security;
revoke all on internal.play_plans, internal.gg, internal.mentors, internal.weekly_goals, internal.predictions from public, anon, authenticated;

revoke all on function internal.hour_start(timestamptz) from public, anon, authenticated;
revoke all on function internal.member_pseudo(uuid) from public, anon, authenticated;
revoke all on function internal.gg_count(uuid, date) from public, anon, authenticated;
revoke all on function internal.voice_link_of(text) from public, anon, authenticated;
revoke all on function internal.prediction_week() from public, anon, authenticated;
revoke all on function internal.prediction_closes(date) from public, anon, authenticated;
revoke all on function public.set_play_plan(timestamptz) from public, anon, authenticated;
revoke all on function public.give_gg(integer, boolean) from public, anon, authenticated;
revoke all on function public.set_mentor(boolean) from public, anon, authenticated;
revoke all on function public.save_weekly_goal(text, integer, text) from public, anon, authenticated;
revoke all on function public.delete_weekly_goal() from public, anon, authenticated;
revoke all on function public.save_voice_channel(text) from public, anon, authenticated;
revoke all on function public.clear_voice_channel() from public, anon, authenticated;
revoke all on function public.save_prediction(integer) from public, anon, authenticated;
revoke all on function public.get_qg_tools() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même que le compte est validé, et son rang.
grant execute on function public.set_play_plan(timestamptz) to authenticated;
grant execute on function public.give_gg(integer, boolean) to authenticated;
grant execute on function public.set_mentor(boolean) to authenticated;
grant execute on function public.save_weekly_goal(text, integer, text) to authenticated;
grant execute on function public.delete_weekly_goal() to authenticated;
grant execute on function public.save_voice_channel(text) to authenticated;
grant execute on function public.clear_voice_channel() to authenticated;
grant execute on function public.save_prediction(integer) to authenticated;
grant execute on function public.get_qg_tools() to authenticated;
