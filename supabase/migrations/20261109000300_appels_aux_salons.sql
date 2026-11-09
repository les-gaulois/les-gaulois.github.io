-- Les appels aux salons, au QG : un membre validé qui attend dans un salon d'OpenFront le dit, avec le lien que le jeu
-- lui donne pour inviter ses amis (bouton de copie de l'écran du salon, ou barre d'adresse). Les membres validés qui ont
-- le QG ouvert le voient, dans un pop-up, avec un son s'ils l'ont gardé. Le site ne lit rien chez OpenFront : seul le
-- membre partage son salon, comme il le ferait sur Discord.
-- Un appel est montré 15 minutes au plus : une file de six salons publics part en une douzaine de minutes. Il n'est pas
-- sauvegardé (export_site ne change pas) : il ne sert plus à rien un quart d'heure plus tard.
-- Cette migration ne fait qu'ajouter : une table et trois fonctions. Aucune donnée n'est retirée.

/* ---------- Les appels ---------- */

-- Une ligne par membre au plus : un nouvel appel remplace le précédent. Seul l'identifiant de la partie est gardé, jamais
-- l'adresse collée : le site refait lui-même l'adresse, sur openfront.io. L'identifiant suit la règle du jeu
-- (`GAME_ID_REGEX`, de 8 à 10 lettres et chiffres). Un appel retiré garde sa ligne jusqu'à sa fin, pour que retirer puis
-- relancer ne contourne pas l'attente entre deux appels.
create table internal.lobby_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles (user_id) on delete cascade,
  game_id text not null check (game_id ~ '^[A-Za-z0-9]{8,10}$'),
  team_format text not null check (team_format in ('duos', 'trios', 'quads', '2', '3', '4', '5', '6', '7', 'private')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
create index lobby_calls_expires on internal.lobby_calls (expires_at);

-- Un membre validé prévient les autres qu'il attend dans un salon. Le format, qu'il indique lui-même, aide les autres à
-- savoir quelle équipe les attend. Le chacun pour soi n'en fait pas partie : le jeu y cache les tags, et ses conditions y
-- interdisent toute entente arrangée hors de la partie. Redonner le même salon ne change que le format, sans nouvel appel.
-- Un nouveau salon, au plus une fois par minute : chaque appel fait sonner le QG des autres.
create function public.save_lobby_call(p_game text, p_format text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_game text := btrim(coalesce(p_game, ''));
  v_previous internal.lobby_calls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if v_game !~ '^[A-Za-z0-9]{8,10}$' then perform internal.fail('invalid_game'); end if;
    if p_format is null or p_format not in ('duos', 'trios', 'quads', '2', '3', '4', '5', '6', '7', 'private') then perform internal.fail('invalid_format'); end if;
    -- Deux envois simultanés du même membre comptent l'un après l'autre : sinon, chacun passerait l'attente.
    perform pg_advisory_xact_lock(hashtext('gal_lobby_call'), hashtext(v_actor::text));
    delete from internal.lobby_calls where expires_at <= now();
    select * into v_previous from internal.lobby_calls where user_id = v_actor;
    if found and v_previous.game_id = v_game and v_previous.ended_at is null then
      update internal.lobby_calls set team_format = p_format where user_id = v_actor;
    else
      if found and v_previous.created_at > now() - interval '1 minute' then perform internal.fail('call_too_soon'); end if;
      insert into internal.lobby_calls (user_id, game_id, team_format, expires_at)
      values (v_actor, v_game, p_format, now() + interval '15 minutes')
      on conflict (user_id) do update
        set game_id = excluded.game_id, team_format = excluded.team_format, created_at = now(), expires_at = excluded.expires_at, ended_at = null;
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Le membre retire son appel : sa partie a commencé, ou il a quitté le salon.
create function public.end_lobby_call() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    update internal.lobby_calls set ended_at = now() where user_id = v_actor and ended_at is null;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les appels en cours, pour un membre validé : le salon, son format, depuis quand, et qui appelle. Le nom est le pseudo
-- d'aujourd'hui dans la liste officielle, retrouvé par l'empreinte de son identifiant OpenFront comme pour les visages,
-- sinon le nom du compte. Appeler, c'est se montrer le temps de l'appel ; la photo Discord, elle, reste réservée à ceux
-- qui ont choisi de se montrer. Un compte suspendu n'appelle plus personne. Chaque lecture efface les appels finis.
-- `now` : l'heure du serveur, pour que la page compte les minutes sans dépendre de l'horloge du visiteur.
create function public.get_lobby_calls() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_detail text;
begin
  begin
    v_actor := internal.require_rank(1);
    delete from internal.lobby_calls where expires_at <= now();
    return jsonb_build_object('ok', true, 'now', now(), 'calls', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from (
        select k.id, k.game_id as game, k.team_format as format, k.created_at, k.expires_at,
          k.user_id = v_actor as mine,
          coalesce((
            select c.username from public.private_links l
            join public.clan_roster c on c.public_id_hash = l.openfront_hash
            where l.user_id = k.user_id and c.username is not null
            limit 1
          ), p.display_name) as name,
          case when p.show_to_members then internal.discord_avatar(p.user_id) end as avatar
        from internal.lobby_calls k
        join public.profiles p on p.user_id = k.user_id and p.status = 'validated'
        where k.ended_at is null and k.expires_at > now()
        order by k.created_at desc
        limit 20
      ) t
    ));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Règles d'accès ---------- */

-- Une table privée, comme les idées : seules les fonctions ci-dessus la lisent.
alter table internal.lobby_calls enable row level security;
revoke all on internal.lobby_calls from public, anon, authenticated;

revoke all on function public.save_lobby_call(text, text) from public, anon, authenticated;
revoke all on function public.end_lobby_call() from public, anon, authenticated;
revoke all on function public.get_lobby_calls() from public, anon, authenticated;

-- Tout compte connecté peut appeler : chaque fonction vérifie elle-même que le compte est validé.
grant execute on function public.save_lobby_call(text, text) to authenticated;
grant execute on function public.end_lobby_call() to authenticated;
grant execute on function public.get_lobby_calls() to authenticated;
