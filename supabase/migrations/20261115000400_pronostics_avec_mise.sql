-- Le pronostic de la semaine, avec une mise en statères (demande du pilote, 15 novembre 2026) : « une fois posé, pas de
-- retour en arrière », « perdre ou gagner grâce aux statères », « seul l'argent posé peut être gagné, aucun argent n'est
-- généré », et « voir qui a misé quoi sur quel pronostic ».
--
-- Les règles :
-- - Un pronostic se pose une fois par semaine et par membre, avec une mise de 0 à 1 000 statères (0 : pour l'honneur, on ne
--   gagne ni ne perd rien). Posé, il ne change plus et ne se retire pas. La mise quitte aussitôt le solde : une ligne
--   « pronostic_mise » au journal des statères (migration 20261113001800), refusée si le solde ne suffit pas.
-- - Un pronostic fait avant cette migration, sans mise (`mise` vide), se pose une seule fois encore, avec ou sans mise ; s'il
--   ne l'est pas, il compte pour l'honneur.
-- - La semaine visée est donnée par l'écran (`p_week`) : si les pronostics ont fermé entre l'affichage et le clic, le serveur
--   refuse au lieu de poser la mise sur la semaine suivante.
-- - Les mises font la cagnotte de la semaine. Une fois la semaine finie et entièrement relevée, la cagnotte entière va aux
--   mises les plus proches du résultat (tous, en cas d'égalité d'écart), au prorata de la mise. Ce partage se fait en statères
--   entiers : chacun reçoit d'abord la part entière, puis les statères qui restent vont, un par un, aux plus grands restes
--   (à égalité, au premier posé). La somme versée est exactement la cagnotte : rien n'est créé, rien ne se perd. Un gagnant
--   reçoit au moins sa mise. Seul à miser, on la récupère.
-- - Le résultat vient des données publiques du site, comme l'affichage : le nombre de victoires de la semaine, dit complet
--   une fois son dimanche relevé (`clanWeeks`, src/lib/semaine-du-clan.ts). Le script scripts/regler-pronostics.ts l'envoie
--   chaque heure, avec la clé de service, pour chaque semaine complète (settle_predictions). Une semaine se règle une seule
--   fois : un second envoi ne change rien.
-- - Faute de résultat le jeudi qui suit la semaine (trois jours après sa fin, à Paris), chaque mise est rendue à son auteur
--   (« pronostic_rendu ») ; le QG le montre encore, avec la semaine passée.
-- - Les pronostics des autres restent cachés jusqu'à la clôture (le mardi à minuit, heure de Paris) : sinon, le dernier à
--   poser se placerait juste à côté des autres. Avant la clôture, chacun voit la cagnotte et qui a misé combien ; après, le
--   pronostic de chacun, sa mise, et, une fois la semaine réglée, ce qu'il a reçu.
-- - Les mises ne sont jamais classées par montant : la liste suit les noms (aucun classement des plus riches, CLAUDE.md).
-- - Le nom d'un compte suspendu n'est pas montré : sa mise reste dans la cagnotte, sous « Compte suspendu ».
-- - Un compte effacé emporte son pronostic : sa mise sort de la cagnotte et n'est versée à personne.
--
-- Ce qui change : deux colonnes ajoutées à internal.predictions (mise, gain), une table ajoutée (internal.prediction_results),
-- save_prediction remplacée par place_prediction (posée une fois, avec mise), settle_predictions ajoutée (clé de service
-- seulement), get_qg_tools remplacée par la même avec la cagnotte et les mises. L'effacement des pronostics trop anciens ne
-- touche plus une mise que la semaine n'a pas encore réglée ou rendue. Aucune donnée existante n'est effacée ni changée.
-- Rejouée, elle se remplace par la même.

/* ---------- Les mises et le règlement ---------- */

-- `mise` : vide pour un pronostic d'avant les mises (il peut se poser une fois encore) ; de 0 à 1 000 une fois posé.
-- `gain` : vide tant que la semaine n'est pas réglée, et pour un pronostic sans mise ; ensuite, les statères versés à son
-- auteur (0 pour une mise perdue, la mise elle-même quand elle est rendue).
alter table internal.predictions add column if not exists mise integer check (mise is null or mise between 0 and 1000);
alter table internal.predictions add column if not exists gain integer check (gain is null or gain >= 0);

-- Le règlement de chaque semaine : 'regle' d'après le résultat, 'rendu' quand chaque mise a été rendue faute de résultat.
create table if not exists internal.prediction_results (
  week date primary key check (extract(isodow from week) = 1),
  wins integer check (wins is null or wins between 0 and 10000),
  outcome text not null check (outcome in ('regle', 'rendu')),
  pot integer not null default 0 check (pot >= 0),
  settled_at timestamptz not null default now(),
  check ((outcome = 'regle') = (wins is not null))
);

alter table internal.prediction_results enable row level security;
revoke all on table internal.prediction_results from public, anon, authenticated;

-- L'heure des règlements et des remboursements : now(), dans une fonction, que l'essai sur PGlite remplace pour avancer
-- dans le temps.
create or replace function internal.prediction_now() returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select now()
$$;

-- La plus grosse mise permise, la même que PREDICTION_STAKE_MAX (src/lib/compte/outils.ts).
create or replace function internal.prediction_stake_max() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 1000
$$;

-- Rend chaque mise d'une semaine restée sans résultat le jeudi qui suit (son lundi + 10 jours, à Paris) : le règlement
-- arrive d'habitude le lundi matin, et le QG montre encore la semaine passée, « Mises rendues ». Appelée avant chaque
-- effacement des pronostics trop anciens et à chaque règlement : une mise n'est jamais effacée sans être réglée ou rendue.
-- Les lignes du journal s'ajoutent dans l'ordre des comptes (règle de la migration 20261113001800).
create or replace function internal.prediction_refund_stale() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_week date;
  v_row record;
begin
  for v_week in
    select distinct pr.week from internal.predictions pr
    where pr.mise > 0 and pr.week + 10 <= (internal.prediction_now() at time zone 'Europe/Paris')::date
      and not exists (select 1 from internal.prediction_results r where r.week = pr.week)
    order by pr.week
  loop
    insert into internal.prediction_results (week, wins, outcome) values (v_week, null, 'rendu') on conflict (week) do nothing;
    if found then
      update internal.predictions set gain = mise where week = v_week and mise > 0;
      for v_row in select user_id, mise from internal.predictions where week = v_week and mise > 0 order by user_id loop
        insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_row.user_id, 'pronostic_rendu', v_row.mise, 'pronostic/' || v_week::text);
      end loop;
      update internal.prediction_results
        set pot = (select coalesce(sum(mise), 0) from internal.predictions where week = v_week and mise > 0)
        where week = v_week;
    end if;
  end loop;
end $$;

-- Efface les pronostics d'avant la semaine dernière, comme avant, mais jamais une mise que sa semaine n'a pas réglée ou rendue.
create or replace function internal.prediction_forget_old() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform internal.prediction_refund_stale();
  delete from internal.predictions pr
  where pr.week < internal.paris_monday() - 7
    and (coalesce(pr.mise, 0) = 0 or exists (select 1 from internal.prediction_results r where r.week = pr.week));
end $$;

/* ---------- Poser son pronostic ---------- */

-- L'ancienne fonction laissait changer le pronostic à l'infini : elle disparaît. Un écran resté ouvert reçoit un refus de
-- l'API, qu'il dit « Le serveur ne répond pas pour le moment » ; rechargé, il appelle la nouvelle.
drop function if exists public.save_prediction(integer);

-- Un membre validé pose son pronostic pour la semaine ouverte, une fois, avec sa mise. `p_week` : la semaine affichée.
create or replace function public.place_prediction(p_week date, p_wins integer, p_stake integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_week date := internal.prediction_week();
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    -- D'abord les remboursements et l'effacement, avant de toucher au solde de l'appelant : un remboursement qui le
    -- créditerait en même temps ne l'attend pas en croix.
    perform internal.prediction_forget_old();
    if p_week is distinct from v_week then perform internal.fail('prediction_closed'); end if;
    if p_wins is null or p_wins not between 0 and 10000 then perform internal.fail('invalid_prediction'); end if;
    if p_stake is null or p_stake not between 0 and internal.prediction_stake_max() then perform internal.fail('invalid_stake'); end if;
    -- Pas encore de pronostic : il se pose. Un pronostic d'avant les mises (`mise` vide) se pose une seule fois. Sinon, refusé.
    insert into internal.predictions as pr (week, user_id, wins, mise, updated_at) values (v_week, v_actor, p_wins, p_stake, now())
    on conflict (week, user_id) do update set wins = excluded.wins, mise = excluded.mise, updated_at = now()
      where pr.mise is null;
    if not found then perform internal.fail('prediction_placed'); end if;
    -- Le solde refuse de passer sous zéro : 'solde_insuffisant', et le pronostic n'est pas posé (tout le bloc est annulé).
    if p_stake > 0 then
      perform internal.village_debiter(v_actor, 'pronostic_mise', p_stake, 'pronostic/' || v_week::text);
    end if;
    return jsonb_build_object('ok', true, 'week', v_week, 'wins', p_wins, 'stake', p_stake, 'closes_at', internal.prediction_closes(v_week));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Régler une semaine ---------- */

-- Le résultat d'une semaine finie, envoyé par scripts/regler-pronostics.ts avec la clé de service : la cagnotte va aux
-- mises les plus proches, au prorata (voir en tête). Une semaine déjà réglée ou rendue ne change plus : la réponse redit
-- ce qui a été fait. Refusé pour une semaine pas encore finie à Paris ; arrivé après le jeudi qui la suit, le résultat
-- trouve les mises déjà rendues. Le même partage, en TypeScript : partageDeLaCagnotte (src/lib/pronostics-reglement.ts),
-- que l'essai de la migration compare à celui-ci sur des tirages au hasard.
create or replace function public.settle_predictions(p_week date, p_wins integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_done internal.prediction_results;
  v_pot bigint;
  v_best integer;
  v_winning bigint;
  v_left bigint;
  v_winners integer := 0;
  v_row record;
begin
  if p_week is null or extract(isodow from p_week) <> 1 then return internal.error_json('invalid_week', ''); end if;
  if p_wins is null or p_wins not between 0 and 10000 then return internal.error_json('invalid_prediction', ''); end if;
  if internal.prediction_now() < (p_week + 7)::timestamp at time zone 'Europe/Paris' then return internal.error_json('week_not_over', ''); end if;
  perform internal.prediction_refund_stale();

  insert into internal.prediction_results (week, wins, outcome) values (p_week, p_wins, 'regle') on conflict (week) do nothing;
  if not found then
    select * into v_done from internal.prediction_results where week = p_week;
    return jsonb_build_object('ok', true, 'week', p_week, 'already', true, 'outcome', v_done.outcome, 'wins', v_done.wins, 'pot', v_done.pot);
  end if;

  select coalesce(sum(mise), 0) into v_pot from internal.predictions where week = p_week and mise > 0;
  if v_pot > 0 then
    select min(abs(wins - p_wins)) into v_best from internal.predictions where week = p_week and mise > 0;
    select sum(mise), count(*) into v_winning, v_winners from internal.predictions where week = p_week and mise > 0 and abs(wins - p_wins) = v_best;
    -- La part entière de chacun, puis les statères qui restent, un par un, aux plus grands restes, puis au premier posé.
    select v_pot - sum((v_pot * mise) / v_winning) into v_left
    from internal.predictions where week = p_week and mise > 0 and abs(wins - p_wins) = v_best;
    update internal.predictions pr set gain = s.share + case when s.rank <= v_left then 1 else 0 end
    from (
      select user_id, (v_pot * mise) / v_winning as share,
        row_number() over (order by (v_pot * mise) % v_winning desc, updated_at, user_id) as rank
      from internal.predictions where week = p_week and mise > 0 and abs(wins - p_wins) = v_best
    ) s
    where pr.week = p_week and pr.user_id = s.user_id;
    update internal.predictions set gain = 0 where week = p_week and mise > 0 and gain is null;
    for v_row in select user_id, gain from internal.predictions where week = p_week and gain > 0 order by user_id loop
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_row.user_id, 'pronostic_gain', v_row.gain, 'pronostic/' || p_week::text);
    end loop;
    update internal.prediction_results set pot = v_pot where week = p_week;
  end if;
  return jsonb_build_object('ok', true, 'week', p_week, 'already', false, 'outcome', 'regle', 'wins', p_wins, 'pot', v_pot, 'winners', v_winners);
end $$;

/* ---------- Les outils du QG ---------- */

-- La même que dans la migration 20261111000400, avec, pour le pronostic :
--  - la semaine ouverte : son pronostic, sa mise (`stake`, vide s'il n'est pas encore posé), s'il est posé (`placed`), son
--    solde (`balance`, à lui seul), la mise permise (`stake_max`), le nombre de pronostics, la cagnotte (`pot`) et qui a misé
--    combien (`stakes`, par nom, sans les pronostics), jamais le pronostic d'un autre ;
--  - les semaines closes (en cours ou passée) : le pronostic, la mise et le gain de chacun, sous son nom, la cagnotte, et le
--    règlement (`result`), ou vide tant que la semaine n'est pas réglée.
-- Les mises d'un compte suspendu restent dans la cagnotte et dans la liste, sous « Compte suspendu », sans son nom : la
-- somme de la liste est la cagnotte.
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
  perform internal.prediction_forget_old();

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
      'pot', (select coalesce(sum(pr.mise), 0) from internal.predictions pr where pr.week = w.week and pr.mise > 0),
      'result', (select jsonb_build_object('outcome', r.outcome, 'wins', r.wins, 'pot', r.pot, 'at', r.settled_at) from internal.prediction_results r where r.week = w.week),
      'guesses', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'name', case when p.status = 'validated' then p.display_name else 'Compte suspendu' end,
            'wins', pr.wins, 'mine', pr.user_id = v_actor, 'stake', coalesce(pr.mise, 0), 'gain', pr.gain
          ) order by pr.wins, p.display_name), '[]')
        from internal.predictions pr
        join public.profiles p on p.user_id = pr.user_id and (p.status = 'validated' or pr.mise > 0)
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
      'stake', (select mise from internal.predictions where week = v_target and user_id = v_actor),
      'placed', exists (select 1 from internal.predictions where week = v_target and user_id = v_actor and mise is not null),
      'balance', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_actor), 0),
      'stake_max', internal.prediction_stake_max(),
      'count', (select count(*) from internal.predictions pr join public.profiles p on p.user_id = pr.user_id and p.status = 'validated' where pr.week = v_target),
      'pot', (select coalesce(sum(pr.mise), 0) from internal.predictions pr where pr.week = v_target and pr.mise > 0),
      'stakes', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'name', case when p.status = 'validated' then p.display_name else 'Compte suspendu' end,
            'stake', pr.mise, 'mine', pr.user_id = v_actor
          ) order by p.status <> 'validated', p.display_name), '[]')
        from internal.predictions pr
        join public.profiles p on p.user_id = pr.user_id
        where pr.week = v_target and pr.mise > 0
      ),
      'closed', v_closed
    )
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Règles d'accès ---------- */

revoke all on function internal.prediction_now() from public, anon, authenticated;
revoke all on function internal.prediction_stake_max() from public, anon, authenticated;
revoke all on function internal.prediction_refund_stale() from public, anon, authenticated;
revoke all on function internal.prediction_forget_old() from public, anon, authenticated;
revoke all on function public.place_prediction(date, integer, integer) from public, anon, authenticated;
revoke all on function public.settle_predictions(date, integer) from public, anon, authenticated;
revoke all on function public.get_qg_tools() from public, anon, authenticated;

-- Tout compte connecté peut poser : la fonction vérifie elle-même que le compte est validé. Le règlement : la clé de service.
grant execute on function public.place_prediction(date, integer, integer) to authenticated;
grant execute on function public.get_qg_tools() to authenticated;
grant execute on function public.settle_predictions(date, integer) to service_role;
