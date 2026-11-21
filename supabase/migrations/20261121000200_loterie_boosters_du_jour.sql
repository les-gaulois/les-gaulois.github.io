-- La loterie du mardi, nouvelle règle : un booster de loterie par jour joué avec le clan (docs/DIRECTION.md, « La loterie
-- du mardi » ; formes des réponses : src/lib/village/contrat.ts ; calculs de l'écran : src/lib/village/loterie.ts).
--
-- Décisions du pilote, 20 et 21 novembre 2026 : « un booster de loterie par jour joué avec le clan, autant de billets que de
-- points rapportés ce jour-là, parfois un ticket d'or ; plus aucun billet acheté », et pour le ticket d'or : « vaut 5
-- billets, sort une fois sur 10 du booster de loterie quotidien ».
--
-- Les règles :
-- - PLUS AUCUN BILLET ACHETÉ : acheter_billets_loterie refuse ('achat_ferme'). Les billets déjà achetés pour le tirage du
--   mardi 24 novembre 2026, payés avant cette migration, restent à ce tirage : ils ne sont ni perdus ni remboursés.
-- - UN BOOSTER PAR JOUR JOUÉ : chaque jour (à l'heure de Paris) où le compte a joué au moins une partie du clan, gagnée ou
--   non, il reçoit un booster de loterie, pour le tirage du mardi qui suit : celui du mardi au lundi d'avant. Au plus un par
--   jour, donc sept par semaine de loterie. « Joué » se lit sur ce que le serveur sait déjà, comme les missions du pass :
--   les parties qui ont rapporté des points (internal.stateres_victoires et leurs présences, notées toutes les 5 minutes),
--   les autres parties du clan (internal.sentier_parties, notées par le même passage) et le journal des statères. Une
--   partie compte pour le jour où elle a commencé. Comme pour les statères : un compte validé qui a créé son Gaulois,
--   depuis le 1er du mois de sa création, et rien pendant une suspension.
-- - SES BILLETS : autant que de points rapportés au clan ce jour-là (le journal des statères, nature 'victoire'), arrondis
--   à l'entier, au moins un dès qu'une partie a rapporté des points ; zéro un jour sans points rapportés. Une partie
--   relevée plus tard dans la journée s'ajoute au booster de son jour, même déjà ouvert.
-- - LE TICKET D'OR : à l'ouverture, une fois sur 10, le booster contient en plus un ticket d'or qui vaut 5 billets. Le
--   tirage vient du générateur sûr de Postgres (internal.village_hasard), jamais d'un navigateur, et ne se refait pas.
-- - L'OUVERTURE : le membre ouvre ses boosters dans « Mon Gaulois » (ouvrir_booster_loterie), jusqu'au tirage. Un booster
--   qu'il n'a pas ouvert compte quand même : juste avant le tirage, le serveur ouvre lui-même ceux qui restent, avec les
--   mêmes chances. Avant le tirage, la part de chacun ne montre que ses boosters ouverts.
-- - Le premier tirage de cette règle est celui du mardi 24 novembre 2026 (internal.loterie_premier_booster) : les jours du
--   mardi 17 au lundi 23 novembre y donnent leurs boosters, même passés avant cette migration. Les tirages faits avant ne
--   changent pas.
-- - Ne changent pas : le tirage du mardi à 21 h 30, heure de Paris ; l'or d'abord, puis l'argent, puis le bronze ; un
--   gagnant ne regagne pas ; les lots (3 000, 1 500 et 750 statères, et des boosters). Le booster de loterie ne crée aucun
--   statère : il ne donne que des billets.
-- - Le mode GOD : un booster de loterie s'ouvre aussi pendant un essai ; il ne touche pas au journal des statères, et son
--   ticket d'or reste au vrai tirage, comme il y serait resté sans l'essai.
--
-- Ce qui est gardé : internal.loterie_boosters, chaque booster (son jour, son tirage, son ouverture et son ticket d'or),
-- huit semaines comme les tirages ; internal.loterie_parts garde en plus le nombre de tickets d'or de chaque part. Tout
-- s'efface avec le compte.
--
-- Qui peut quoi :
-- - ouvrir_booster_loterie : un compte validé qui a créé son Gaulois (internal.village_acheteur), pour ses boosters.
-- - get_loterie (remplacée) : comme avant, avec en plus les boosters de la semaine du compte connecté, jamais ceux d'un
--   autre ; `peut_acheter` vaut toujours false.
-- - acheter_billets_loterie (remplacée) : refuse toujours.
-- - le tirage : pg_cron seul, inchangé ; une tâche de plus, chaque heure, note les boosters d'hier et d'aujourd'hui.
--
-- Une table, une colonne (internal.loterie_parts.tickets_or, 0 par défaut) et douze fonctions ajoutées ; remplacées, avec
-- les mêmes signatures et les mêmes droits : internal.loterie_gratuits, internal.loterie_parts_json, internal.loterie_tirer,
-- public.get_loterie et public.acheter_billets_loterie. Aucune table, colonne ni donnée existante retirée ou changée.
-- Rejouée, elle se remplace par la même.

/* ---------- La table ---------- */

create table if not exists internal.loterie_boosters (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Le jour joué avec le clan, à l'heure de Paris, et le mardi du tirage dont il est.
  jour date not null,
  tirage date not null,
  -- null tant qu'il n'est pas ouvert.
  ouvert_le timestamptz,
  ticket_or boolean,
  -- true : ouvert par le membre ; false : par le serveur, juste avant le tirage.
  par_le_membre boolean,
  primary key (user_id, jour),
  check (tirage > jour and tirage <= jour + 7),
  check ((ouvert_le is null) = (ticket_or is null) and (ouvert_le is null) = (par_le_membre is null))
);
create index if not exists loterie_boosters_tirage on internal.loterie_boosters (tirage, user_id);

alter table internal.loterie_parts add column if not exists tickets_or integer not null default 0 check (tickets_or >= 0);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.loterie_boosters enable row level security;
revoke all on table internal.loterie_boosters from public, anon, authenticated;

/* ---------- Les réglages, écrits ici : les changer demande une nouvelle migration ---------- */

-- Le premier tirage qui compte les boosters de loterie : celui du mardi 24 novembre 2026.
create or replace function internal.loterie_premier_booster() returns date
language sql immutable set search_path = public, pg_temp as $$
  select date '2026-11-24'
$$;

-- Le ticket d'or sort une fois sur ce nombre.
create or replace function internal.loterie_or_sur() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 10
$$;

-- Les billets que vaut un ticket d'or.
create or replace function internal.loterie_or_billets() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 5
$$;

revoke all on function internal.loterie_premier_booster() from public, anon, authenticated;
revoke all on function internal.loterie_or_sur() from public, anon, authenticated;
revoke all on function internal.loterie_or_billets() from public, anon, authenticated;

/* ---------- Les jours ---------- */

-- Le mardi du tirage d'un jour : le premier mardi qui le suit (le lendemain, pour un lundi).
create or replace function internal.loterie_tirage_du_jour(p_jour date) returns date
language sql immutable set search_path = public, pg_temp as $$
  -- Le lundi de la semaine du jour, sans fuseau : un jour n'a pas d'heure.
  select case
    when p_jour < date_trunc('week', p_jour::timestamp)::date + 1 then date_trunc('week', p_jour::timestamp)::date + 1
    else date_trunc('week', p_jour::timestamp)::date + 8
  end
$$;

-- Les jours, de `p_de` à `p_a` compris (à l'heure de Paris), où chaque compte a joué au moins une partie du clan ; un seul
-- compte si `p_user` n'est pas null. Un compte validé qui a créé son Gaulois, une partie commencée depuis le 1er du mois
-- de sa création et hors d'une suspension, comme pour les statères.
create or replace function internal.loterie_jours_joues(p_user uuid, p_de date, p_a date)
returns table (user_id uuid, jour date)
language sql stable security definer set search_path = public, pg_temp as $$
  with parties as (
    select pr.empreinte, v.debut
    from internal.stateres_presences pr
    join internal.stateres_victoires v on v.partie = pr.partie
    where v.debut >= internal.sentier_minuit(p_de) and v.debut < internal.sentier_minuit(p_a + 1)
    union all
    select pr.empreinte, s.debut
    from internal.sentier_presences pr
    join internal.sentier_parties s on s.partie = pr.partie
    where s.debut >= internal.sentier_minuit(p_de) and s.debut < internal.sentier_minuit(p_a + 1)
  ),
  par_compte as (
    select l.user_id, x.debut
    from parties x
    join public.private_links l on l.openfront_hash = x.empreinte
    where p_user is null or l.user_id = p_user
    union all
    -- Le journal garde les parties payées, même quand leurs présences ne sont plus là.
    select m.user_id, m.debut
    from internal.stateres_mouvements m
    where m.nature = 'victoire'
      and (p_user is null or m.user_id = p_user)
      and m.debut >= internal.sentier_minuit(p_de) and m.debut < internal.sentier_minuit(p_a + 1)
  )
  select distinct c.user_id, internal.sentier_jour(c.debut)
  from par_compte c
  join public.profiles p on p.user_id = c.user_id and p.status = 'validated'
  join internal.gaulois g on g.user_id = c.user_id
  where c.debut >= internal.stateres_debut_du_mois(g.created_at)
    and not exists (
      select 1 from internal.stateres_suspensions s
      where s.user_id = c.user_id and c.debut >= s.debut and (s.fin is null or c.debut < s.fin)
    )
$$;

revoke all on function internal.loterie_tirage_du_jour(date) from public, anon, authenticated;
revoke all on function internal.loterie_jours_joues(uuid, date, date) from public, anon, authenticated;

/* ---------- Les boosters ---------- */

-- Note les boosters des jours joués de `p_de` à `p_a`, pour un compte ou pour tous, à partir des tirages de cette règle :
-- le nombre de boosters ajoutés. Un booster déjà noté ne change pas.
create or replace function internal.loterie_noter_boosters(p_user uuid, p_de date, p_a date) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  if p_de is null or p_a is null or p_a < p_de then return 0; end if;
  insert into internal.loterie_boosters (user_id, jour, tirage)
  select j.user_id, j.jour, internal.loterie_tirage_du_jour(j.jour)
  from internal.loterie_jours_joues(p_user, greatest(p_de, internal.loterie_premier_booster() - 7), p_a) j
  where internal.loterie_tirage_du_jour(j.jour) >= internal.loterie_premier_booster()
  order by j.user_id, j.jour
  on conflict (user_id, jour) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Les billets de points d'un jour : les points rapportés au clan ce jour-là, arrondis, au moins un s'il y en a ; 0 sinon.
create or replace function internal.loterie_billets_du_jour(p_user uuid, p_jour date) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce(sum(m.points), 0) > 0 then greatest(1, round(sum(m.points)))::integer else 0 end
  from internal.stateres_mouvements m
  where m.user_id = p_user and m.nature = 'victoire'
    and m.debut >= internal.sentier_minuit(p_jour) and m.debut < internal.sentier_minuit(p_jour + 1)
$$;

-- Ouvre un booster pas encore ouvert : son ticket d'or est tiré. Vrai s'il vient d'être ouvert.
create or replace function internal.loterie_ouvrir(p_user uuid, p_jour date, p_par_le_membre boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update internal.loterie_boosters b
    set ouvert_le = now(),
        ticket_or = internal.village_hasard() * internal.loterie_or_sur() < 1,
        par_le_membre = p_par_le_membre
    where b.user_id = p_user and b.jour = p_jour and b.ouvert_le is null;
  return found;
end $$;

-- Les billets de chaque compte dans un tirage de cette règle, d'après ses boosters ouverts : les billets de points de
-- chaque jour, plus ceux des tickets d'or. Les comptes validés qui ont créé leur Gaulois, avec au moins un billet.
create or replace function internal.loterie_billets_des_boosters(p_tirage date)
returns table (user_id uuid, billets integer, tickets_or integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with points as (
    select m.user_id, internal.sentier_jour(m.debut) as jour, sum(m.points) as points
    from internal.stateres_mouvements m
    where m.nature = 'victoire'
      and m.debut >= internal.loterie_semaine_debut(p_tirage)
      and m.debut < internal.loterie_semaine_fin(p_tirage)
    group by m.user_id, internal.sentier_jour(m.debut)
  ),
  par_booster as (
    select b.user_id,
      case when coalesce(pt.points, 0) > 0 then greatest(1, round(pt.points))::integer else 0 end
        + case when b.ticket_or then internal.loterie_or_billets() else 0 end as billets,
      case when b.ticket_or then 1 else 0 end as tickets_or
    from internal.loterie_boosters b
    left join points pt on pt.user_id = b.user_id and pt.jour = b.jour
    where b.tirage = p_tirage and b.ouvert_le is not null
  )
  select x.user_id, sum(x.billets)::integer, sum(x.tickets_or)::integer
  from par_booster x
  join public.profiles p on p.user_id = x.user_id and p.status = 'validated'
  join internal.gaulois g on g.user_id = x.user_id
  group by x.user_id
  having sum(x.billets) >= 1
$$;

revoke all on function internal.loterie_noter_boosters(uuid, date, date) from public, anon, authenticated;
revoke all on function internal.loterie_billets_du_jour(uuid, date) from public, anon, authenticated;
revoke all on function internal.loterie_ouvrir(uuid, date, boolean) from public, anon, authenticated;
revoke all on function internal.loterie_billets_des_boosters(date) from public, anon, authenticated;

/* ---------- Les billets, remplacée ---------- */

-- Les billets gagnés d'un tirage : depuis le tirage du 24 novembre 2026, ceux des boosters ouverts ; avant, un par point
-- rapporté au clan dans la semaine, arrondi, au moins un (la règle de la 20261116001200, gardée pour les tirages d'avant).
-- Même signature et mêmes droits que celle de la 20261116001200.
create or replace function internal.loterie_gratuits(p_tirage date) returns table (user_id uuid, billets integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.user_id, b.billets
  from internal.loterie_billets_des_boosters(p_tirage) b
  where p_tirage >= internal.loterie_premier_booster()
  union all
  select m.user_id, greatest(1, round(sum(m.points)))::integer
  from internal.stateres_mouvements m
  join public.profiles p on p.user_id = m.user_id and p.status = 'validated'
  join internal.gaulois g on g.user_id = m.user_id
  where p_tirage < internal.loterie_premier_booster()
    and m.nature = 'victoire'
    and m.debut >= internal.loterie_semaine_debut(p_tirage)
    and m.debut < internal.loterie_semaine_fin(p_tirage)
  group by m.user_id
$$;

revoke all on function internal.loterie_gratuits(date) from public, anon, authenticated;

-- La part de chacun dans un tirage, pour l'écran : [{ nom, tenue, banniere, moi, gratuits, achetes, tickets_or }], la plus
-- grosse part d'abord ; pour un tirage fait (`p_fait`), avec en plus `rang` et `billet`, ou null. Jamais un identifiant.
-- Celle de 20261116001600_loterie_bannieres.sql, avec `tickets_or` en plus : les tickets d'or de la part, dont les
-- billets sont déjà comptés dans `gratuits`.
create or replace function internal.loterie_parts_json(p_uid uuid, p_tirage date, p_fait boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'nom', internal.village_nom(p.display_name, p.gaul_number),
        -- Le Gaulois que les autres voient : la copie pendant un essai du mode GOD.
        'tenue', m.tenue,
        'banniere', m.banniere,
        'moi', x.user_id = p_uid,
        'gratuits', x.gratuits,
        'achetes', x.achetes,
        'tickets_or', x.tickets_or)
      || case when p_fait then jsonb_build_object('rang', x.rang, 'billet', x.billet) else '{}'::jsonb end
      order by x.gratuits + x.achetes desc, x.user_id), '[]'::jsonb)
  from (
    select pa.user_id, pa.gratuits, pa.achetes, pa.tickets_or, pa.rang, pa.billet
    from internal.loterie_parts pa
    where p_fait and pa.tirage = p_tirage
    union all
    select gr.user_id, gr.billets, coalesce(a.billets, 0), coalesce(bo.tickets_or, 0), null::smallint, null::integer
    from internal.loterie_gratuits(p_tirage) gr
    left join internal.loterie_achats a on a.tirage = p_tirage and a.user_id = gr.user_id
    left join internal.loterie_billets_des_boosters(p_tirage) bo on bo.user_id = gr.user_id
    where not p_fait
  ) x
  join public.profiles p on p.user_id = x.user_id
  join lateral internal.gaulois_montre(x.user_id) m on true
$$;

revoke all on function internal.loterie_parts_json(uuid, date, boolean) from public, anon, authenticated;

/* ---------- Les boosters du compte connecté ---------- */

-- Les boosters d'un compte pour un tirage, pour l'écran : [{ jour, ouvert, billets, ticket_or }], du plus ancien au plus
-- récent. Un booster pas encore ouvert ne dit rien de ce qu'il contient : billets et ticket_or y valent null.
create or replace function internal.loterie_boosters_json(p_user uuid, p_tirage date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'jour', b.jour,
      'ouvert', b.ouvert_le is not null,
      'billets', case when b.ouvert_le is null then null else internal.loterie_billets_du_jour(b.user_id, b.jour) end,
      'ticket_or', b.ticket_or)
    order by b.jour), '[]'::jsonb)
  from internal.loterie_boosters b
  where b.user_id = p_user and b.tirage = p_tirage
$$;

revoke all on function internal.loterie_boosters_json(uuid, date) from public, anon, authenticated;

-- Ouvre un booster de loterie du compte connecté, pour le tirage à venir : celui du jour `p_jour`, ou, sans jour, le plus
-- ancien qui reste fermé. { ok: true, jour, tirage, billets, ticket_or, billets_or, total, restants } : `billets` ceux
-- des points du jour, `billets_or` ceux du ticket d'or (0 sans lui), `total` leur somme, `restants` les boosters de la
-- semaine encore fermés. Refus, dans l'ordre : not_validated, no_gaulois, aucun_booster (pas de booster ce jour-là pour
-- ce tirage, ou plus aucun de fermé), deja_ouvert ; et ceux de tout compte (not_signed_in, suspended, rate_limited).
create or replace function public.ouvrir_booster_loterie(p_jour date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_tirage date;
  v_aujourdhui date := internal.sentier_jour(now());
  v_jour date;
  v_ouvert timestamptz;
  v_or boolean;
  v_billets integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    -- Le tirage tient ce verrou seul : aucun booster ne s'ouvre pendant qu'il se fait. Puis le verrou du compte.
    perform pg_advisory_xact_lock_shared(hashtext('gal_loterie'), 0);
    perform internal.village_verrou(v_uid);
    v_tirage := internal.loterie_tirage_a_venir();
    perform internal.crediter_stateres(v_uid);
    perform internal.loterie_noter_boosters(v_uid, v_tirage - 7, least(v_tirage - 1, v_aujourdhui));
    if p_jour is null then
      select b.jour into v_jour from internal.loterie_boosters b
      where b.user_id = v_uid and b.tirage = v_tirage and b.ouvert_le is null
      order by b.jour limit 1;
      if v_jour is null then perform internal.fail('aucun_booster'); end if;
    else
      v_jour := p_jour;
    end if;
    select b.ouvert_le into v_ouvert from internal.loterie_boosters b where b.user_id = v_uid and b.jour = v_jour and b.tirage = v_tirage;
    if not found then perform internal.fail('aucun_booster'); end if;
    if v_ouvert is not null then perform internal.fail('deja_ouvert'); end if;
    perform internal.loterie_ouvrir(v_uid, v_jour, true);
    select b.ticket_or into v_or from internal.loterie_boosters b where b.user_id = v_uid and b.jour = v_jour;
    v_billets := internal.loterie_billets_du_jour(v_uid, v_jour);
    return jsonb_build_object(
      'ok', true,
      'jour', v_jour,
      'tirage', v_tirage,
      'billets', v_billets,
      'ticket_or', v_or,
      'billets_or', case when v_or then internal.loterie_or_billets() else 0 end,
      'total', v_billets + case when v_or then internal.loterie_or_billets() else 0 end,
      'restants', (select count(*)::integer from internal.loterie_boosters b where b.user_id = v_uid and b.tirage = v_tirage and b.ouvert_le is null)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_booster_loterie(date) from public, anon, authenticated;
grant execute on function public.ouvrir_booster_loterie(date) to authenticated;

/* ---------- L'écran, remplacée ---------- */

-- La loterie vue par le compte connecté : { ok: true, tirage, heure, close, prix, lots: [{ rang, gain, pochettes }],
-- parts: [...], peut_acheter, achat_ferme, solde, bons, boosters, or: { sur, billets }, dernier: { tirage, tire_le,
-- parts: [...] } | null, releve }.
-- Celle de la 20261116001200, avec : `peut_acheter` toujours false et `achat_ferme` true (plus aucun billet ne s'achète) ;
-- `boosters`, ceux du compte pour le tirage à venir (internal.loterie_boosters_json), notés d'abord ; `or`, la chance du
-- ticket d'or (une fois sur `sur`) et ce qu'il vaut. `prix` reste, pour un écran d'avant cette migration.
create or replace function public.get_loterie() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_role public.site_role;
  v_gaulois boolean;
  v_tirage date := internal.loterie_tirage_a_venir();
  v_dernier date;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select p.status, p.role into v_status, v_role from public.profiles p where p.user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;
  v_gaulois := exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
    perform internal.loterie_noter_boosters(v_uid, v_tirage - 7, least(v_tirage - 1, internal.sentier_jour(now())));
  end if;
  select max(t.tirage) into v_dernier from internal.loterie_tirages t;
  return jsonb_build_object(
    'ok', true,
    'tirage', v_tirage,
    'heure', internal.loterie_heure(v_tirage),
    'close', now() >= internal.loterie_semaine_fin(v_tirage),
    'prix', internal.loterie_prix_billet(),
    'lots', (select jsonb_agg(jsonb_build_object(
        'rang', l.rang,
        'gain', l.gain,
        'pochettes', jsonb_build_object('surprise', l.p_surprise, 'familiers', l.p_familiers, 'bannieres', l.p_bannieres, 'modeles', l.p_modeles, 'stateres', l.p_stateres))
      order by l.rang) from internal.loterie_lots() l),
    'parts', internal.loterie_parts_json(v_uid, v_tirage, false),
    'peut_acheter', false,
    'achat_ferme', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'bons', coalesce((select jsonb_object_agg(b.pochette, b.nombre) from internal.loterie_bons b where b.user_id = v_uid and b.nombre > 0), '{}'::jsonb),
    'boosters', internal.loterie_boosters_json(v_uid, v_tirage),
    'or', jsonb_build_object('sur', internal.loterie_or_sur(), 'billets', internal.loterie_or_billets()),
    'dernier', case when v_dernier is null then null else jsonb_build_object(
      'tirage', v_dernier,
      'tire_le', (select t.tire_le from internal.loterie_tirages t where t.tirage = v_dernier),
      'parts', internal.loterie_parts_json(v_uid, v_dernier, true)) end,
    'releve', (select r.le from internal.stateres_releve r where r.id)
  );
end $$;

revoke all on function public.get_loterie() from public, anon, authenticated;
grant execute on function public.get_loterie() to authenticated;

-- Plus aucun billet ne s'achète (décision du pilote, 20 novembre 2026) : toujours { ok: false, error: 'achat_ferme' }, sans
-- rien débiter. Même signature et mêmes droits, pour qu'un écran d'avant cette migration reçoive un refus lisible.
create or replace function public.acheter_billets_loterie(p_nombre integer, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if auth.uid() is null then return internal.error_json('not_signed_in', ''); end if;
  return internal.error_json('achat_ferme', '');
end $$;

revoke all on function public.acheter_billets_loterie(integer, integer) from public, anon, authenticated;
grant execute on function public.acheter_billets_loterie(integer, integer) to authenticated;

/* ---------- Le tirage, remplacée ---------- */

-- Fait le tirage du mardi `p_tirage`, s'il est l'heure et s'il n'est pas déjà fait : vrai s'il vient d'avoir lieu.
-- Celle de la 20261116001200, avec, pour un tirage de cette règle : les boosters de la semaine notés pour tous, ceux qui
-- restent fermés ouverts par le serveur, et les tickets d'or de chaque part gardés. Le reste ne change pas : crédite d'abord
-- tous les comptes, fige la part de chacun, tire l'or, l'argent puis le bronze, donne les lots dans l'ordre des comptes,
-- puis efface ce qui a plus de huit semaines.
create or replace function internal.loterie_tirer(p_tirage date) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rang integer;
  v_total integer;
  v_tire integer;
  v_cumul integer;
  v_p record;
begin
  if p_tirage is null or p_tirage < internal.loterie_premier_tirage() or now() < internal.loterie_heure(p_tirage) then return false; end if;
  perform pg_advisory_xact_lock(hashtext('gal_loterie'), 0);
  insert into internal.loterie_tirages (tirage, billets) values (p_tirage, 0) on conflict (tirage) do nothing;
  if not found then return false; end if;
  perform internal.crediter_stateres();
  if p_tirage >= internal.loterie_premier_booster() then
    perform internal.loterie_noter_boosters(null, p_tirage - 7, p_tirage - 1);
    for v_p in
      select b.user_id, b.jour from internal.loterie_boosters b
      where b.tirage = p_tirage and b.ouvert_le is null
      order by b.user_id, b.jour
    loop
      perform internal.loterie_ouvrir(v_p.user_id, v_p.jour, false);
    end loop;
  end if;
  insert into internal.loterie_parts (tirage, user_id, gratuits, achetes, tickets_or)
    select p_tirage, gr.user_id, gr.billets, coalesce(a.billets, 0), coalesce(bo.tickets_or, 0)
    from internal.loterie_gratuits(p_tirage) gr
    left join internal.loterie_achats a on a.tirage = p_tirage and a.user_id = gr.user_id
    left join internal.loterie_billets_des_boosters(p_tirage) bo on bo.user_id = gr.user_id;
  update internal.loterie_tirages t
    set billets = coalesce((select sum(pa.gratuits + pa.achetes) from internal.loterie_parts pa where pa.tirage = p_tirage), 0)
    where t.tirage = p_tirage;
  for v_rang in 1..3 loop
    select coalesce(sum(pa.gratuits + pa.achetes), 0) into v_total from internal.loterie_parts pa where pa.tirage = p_tirage and pa.rang is null;
    exit when v_total = 0;
    -- Un billet parmi ceux qui restent, de 0 compris à leur nombre non compris ; les parts à la suite, dans l'ordre des comptes.
    v_tire := least(v_total - 1, floor(internal.village_hasard() * v_total)::integer);
    v_cumul := 0;
    for v_p in select pa.user_id, pa.gratuits + pa.achetes as billets from internal.loterie_parts pa where pa.tirage = p_tirage and pa.rang is null order by pa.user_id loop
      if v_tire < v_cumul + v_p.billets then
        update internal.loterie_parts pa set rang = v_rang, billet = v_tire - v_cumul where pa.tirage = p_tirage and pa.user_id = v_p.user_id;
        exit;
      end if;
      v_cumul := v_cumul + v_p.billets;
    end loop;
  end loop;
  for v_p in
    select pa.user_id, l.rang, l.gain, l.p_surprise, l.p_familiers, l.p_bannieres, l.p_modeles, l.p_stateres
    from internal.loterie_parts pa
    join internal.loterie_lots() l on l.rang = pa.rang
    where pa.tirage = p_tirage
    order by pa.user_id
  loop
    perform internal.village_verrou(v_p.user_id);
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
      values (v_p.user_id, 'loterie_lot', v_p.gain, 'tirage/' || p_tirage::text || '/' || v_p.rang::text);
    insert into internal.loterie_bons as b (user_id, pochette, nombre)
      select v_p.user_id, x.pochette, x.nombre
      from (values ('surprise', v_p.p_surprise), ('familiers', v_p.p_familiers), ('bannieres', v_p.p_bannieres), ('modeles', v_p.p_modeles), ('stateres', v_p.p_stateres)) x (pochette, nombre)
      where x.nombre > 0
      on conflict (user_id, pochette) do update set nombre = b.nombre + excluded.nombre;
  end loop;
  delete from internal.loterie_tirages t where t.tirage < p_tirage - 56;
  delete from internal.loterie_achats a where a.tirage < p_tirage - 56;
  delete from internal.loterie_boosters b where b.tirage < p_tirage - 56;
  return true;
end $$;

revoke all on function internal.loterie_tirer(date) from public, anon, authenticated;

/* ---------- Les boosters de tous, chaque heure ---------- */

-- Note les boosters d'hier et d'aujourd'hui de tous les comptes : un booster dont les parties ne seraient plus là au
-- tirage (les parties sans points s'effacent après 8 jours) est déjà noté. Le tirage, lui, note toute sa semaine.
create or replace function internal.loterie_boosters_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aujourdhui date := internal.sentier_jour(now());
begin
  perform internal.loterie_noter_boosters(null, v_aujourdhui - 1, v_aujourdhui);
end $$;

revoke all on function internal.loterie_boosters_reveil() from public, anon, authenticated;

-- Chaque heure, à la 41e minute. La tâche porte un nom : la planifier de nouveau la remplace. Sans pg_cron, rien n'est
-- planifié.
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-loterie-boosters', '41 * * * *', 'select internal.loterie_boosters_reveil()');
  end if;
end $cron$;
