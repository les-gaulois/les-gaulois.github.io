-- Les paliers de victoires et leur booster offert (docs/DIRECTION.md, « Les paliers de victoires et leur booster » ;
-- paliers du site : WIN_TIERS de src/lib/paliers.ts ; lecture : src/lib/compte/roster.ts).
--
-- Décisions du pilote, 20 et 21 novembre 2026, pour le jeu « Mon Gaulois » : quatorze paliers de victoires, de 10 à 3 000
-- (10, 25, 50, 100, 200, 350, 500, 700, 900, 1 000, 1 500, 2 000, 2 500, 3 000), chacun avec son insigne ; et « un
-- booster surprise offert à chaque palier, en plus de l'insigne (un objet reçu sans payer, donc pas revendable au jeu ;
-- aucun statère créé) ».
--
-- Les règles :
-- - Les victoires d'un membre sont celles de la liste officielle du clan (`stats.team.wins` : parties publiques en équipe
--   sous le tag), lues une fois par jour par la GitHub Action avec la liste elle-même, et envoyées sous l'empreinte SHA-256
--   de l'identifiant public, comme la liste (public.clan_roster). Le serveur ne garde que les comptes du site reconnus par
--   cette empreinte (private_links.openfront_hash) ; le reste n'est pas écrit. Un membre sans stats n'est pas envoyé : pas de
--   données n'est pas zéro victoire.
-- - LE POINT DE DÉPART : la première fois qu'un compte est vu, son palier du moment est noté, et rien n'est offert. Les
--   paliers qu'un membre avait déjà dépassés avant cette migration, ou avant d'avoir un compte validé, ne donnent donc rien :
--   on ne sait pas quand il les a passés. Seul un palier franchi entre deux lectures, sous les yeux du serveur, est offert.
--   Le point de départ suit le lien OpenFront du compte : si l'équipe relie le compte à un autre identifiant (« refaire la
--   demande »), la lecture suivante repart d'un nouveau point de départ, sans rien offrir pour l'écart entre les deux.
-- - Chaque palier franchi ensuite par un compte validé lui offre UN booster surprise : un bon de la pochette surprise
--   (internal.loterie_bons, 'surprise'), le même que ceux de la loterie. Il s'ouvre dans « Mon Gaulois », par la fonction
--   habituelle de la pochette, avec le même tirage, les mêmes chances et les mêmes règles : internal.village_debiter
--   crédite le prix juste avant de le débiter (nature 'loterie_pochette'), donc rien n'est créé, et l'objet reçu ne se
--   revend pas au jeu (internal.revente_droits écarte une pochette payée par un bon). Plusieurs paliers franchis entre deux
--   lectures : un booster par palier.
-- - Un palier n'est offert qu'une fois par compte (internal.paliers_boosters), même si le nombre de victoires recule puis
--   remonte : le palier noté ne redescend jamais.
-- - Un compte suspendu suit ses paliers sans rien recevoir : comme pour les statères, ce qui se passe pendant une suspension
--   ne rapporte rien, même une fois la suspension levée.
--
-- Ce qui est gardé : internal.paliers_victoires (le plus haut palier vu de chaque compte, ses victoires de la dernière
-- lecture) et internal.paliers_boosters (chaque palier offert, et quand). Tout s'efface avec le compte.
--
-- Qui peut quoi :
-- - noter_paliers_victoires : la clé de service seulement (la GitHub Action).
-- - get_pochettes_gagnees (remplacée ligne pour ligne depuis la 20261116001200) : tout compte connecté, pour lui seul ; elle
--   donne en plus `paliers`, les paliers de victoires qui lui ont offert un booster, du plus haut au plus bas.
--
-- Deux tables et quatre fonctions ajoutées, une fonction remplacée. Aucune table, colonne ni donnée existante retirée ou
-- changée. Rejouée, elle se remplace par la même.

/* ---------- Les tables ---------- */

create table if not exists internal.paliers_victoires (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  -- Le plus haut palier vu pour ce compte, 0 sous le premier. Il ne redescend jamais.
  palier integer not null check (palier >= 0),
  -- Les victoires de la dernière lecture.
  victoires integer not null check (victoires >= 0),
  -- L'empreinte du lien OpenFront lu : un autre lien, un nouveau point de départ.
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  -- La première lecture : le point de départ.
  depart_le timestamptz not null default now(),
  vu_le timestamptz not null default now()
);

create table if not exists internal.paliers_boosters (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  palier integer not null check (palier > 0),
  offert_le timestamptz not null default now(),
  primary key (user_id, palier)
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.paliers_victoires enable row level security;
alter table internal.paliers_boosters enable row level security;
revoke all on table internal.paliers_victoires from public, anon, authenticated;
revoke all on table internal.paliers_boosters from public, anon, authenticated;

/* ---------- Les paliers ---------- */

-- <paliers-de-victoires> : les mêmes que WIN_TIERS de src/lib/paliers.ts, un test compare.
create or replace function internal.paliers_de_victoires() returns integer[]
language sql immutable set search_path = public, pg_temp as $$
  select array[10, 25, 50, 100, 200, 350, 500, 700, 900, 1000, 1500, 2000, 2500, 3000]
$$;
-- </paliers-de-victoires>

-- Le plus haut palier atteint avec ces victoires, 0 sous le premier.
create or replace function internal.palier_de_victoires(p_victoires integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(max(t), 0)::integer from unnest(internal.paliers_de_victoires()) t where t <= p_victoires
$$;

revoke all on function internal.paliers_de_victoires() from public, anon, authenticated;
revoke all on function internal.palier_de_victoires(integer) from public, anon, authenticated;

/* ---------- La lecture du jour ---------- */

-- Une entrée telle que la GitHub Action l'envoie : { hash, victoires }, rien d'autre.
create or replace function internal.paliers_entree_valide(e jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select e is not null
    and jsonb_typeof(e) = 'object'
    and (select count(*) from jsonb_object_keys(e)) = 2
    and jsonb_typeof(e -> 'hash') = 'string'
    and (e ->> 'hash') ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(e -> 'victoires') = 'number'
    and (e ->> 'victoires') ~ '^[0-9]{1,7}$'
$$;

revoke all on function internal.paliers_entree_valide(jsonb) from public, anon, authenticated;

-- Note les victoires de la liste : { ok: true, comptes, nouveaux, boosters }. `comptes` : les comptes du site reconnus ;
-- `nouveaux` : ceux vus pour la première fois, ou avec un autre lien OpenFront, dont le palier du moment devient le point
-- de départ ; `boosters` : les
-- boosters offerts par cette lecture. Tout ou rien : une entrée mal formée fait refuser l'envoi entier ('invalid_request'),
-- sans rien écrire.
create or replace function public.noter_paliers_victoires(p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c record;
  v_palier integer;
  v_avant integer;
  v_empreinte text;
  v_t integer;
  v_comptes integer := 0;
  v_nouveaux integer := 0;
  v_boosters integer := 0;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 5000
     or exists (select 1 from jsonb_array_elements(p_entries) e where not internal.paliers_entree_valide(e)) then
    return internal.error_json('invalid_request', '');
  end if;
  for v_c in
    select l.user_id, l.openfront_hash as empreinte, p.status, max((e ->> 'victoires')::integer) as victoires
    from jsonb_array_elements(p_entries) e
    join public.private_links l on l.openfront_hash = e ->> 'hash'
    join public.profiles p on p.user_id = l.user_id
    group by l.user_id, l.openfront_hash, p.status
    order by l.user_id
  loop
    v_comptes := v_comptes + 1;
    v_palier := internal.palier_de_victoires(v_c.victoires);
    -- Le verrou du compte, comme pour toute écriture du village : un bon ne s'ajoute pas pendant qu'une pochette s'ouvre.
    perform internal.village_verrou(v_c.user_id);
    select pv.palier, pv.empreinte into v_avant, v_empreinte from internal.paliers_victoires pv where pv.user_id = v_c.user_id for update;
    if not found then
      insert into internal.paliers_victoires (user_id, palier, victoires, empreinte) values (v_c.user_id, v_palier, v_c.victoires, v_c.empreinte);
      v_nouveaux := v_nouveaux + 1;
      continue;
    end if;
    -- Un autre lien OpenFront : un nouveau point de départ, rien d'offert.
    if v_empreinte <> v_c.empreinte then
      update internal.paliers_victoires pv
        set palier = v_palier, victoires = v_c.victoires, empreinte = v_c.empreinte, depart_le = now(), vu_le = now()
        where pv.user_id = v_c.user_id;
      v_nouveaux := v_nouveaux + 1;
      continue;
    end if;
    update internal.paliers_victoires pv
      set palier = greatest(pv.palier, v_palier), victoires = v_c.victoires, vu_le = now()
      where pv.user_id = v_c.user_id;
    continue when v_c.status <> 'validated';
    for v_t in select t from unnest(internal.paliers_de_victoires()) t where t > v_avant and t <= v_palier order by t loop
      insert into internal.paliers_boosters (user_id, palier) values (v_c.user_id, v_t) on conflict (user_id, palier) do nothing;
      if found then
        insert into internal.loterie_bons as b (user_id, pochette, nombre) values (v_c.user_id, 'surprise', 1)
          on conflict (user_id, pochette) do update set nombre = b.nombre + 1;
        v_boosters := v_boosters + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'comptes', v_comptes, 'nouveaux', v_nouveaux, 'boosters', v_boosters);
end $$;

revoke all on function public.noter_paliers_victoires(jsonb) from public, anon, authenticated;
grant execute on function public.noter_paliers_victoires(jsonb) to service_role;

/* ---------- Les boosters à ouvrir ---------- */

-- Les pochettes gagnées ou offertes du compte connecté, qui restent à ouvrir : { ok: true, bons: { <pochette>: nombre },
-- paliers: [palier, ...] }. `paliers` : les paliers de victoires qui lui ont offert un booster surprise, du plus haut au
-- plus bas, ouverts ou non. Jamais celles d'un autre.
-- Celle de 20261116001200_loterie_du_lundi.sql, avec `paliers` en plus.
create or replace function public.get_pochettes_gagnees() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  return jsonb_build_object(
    'ok', true,
    'bons', coalesce(
      (select jsonb_object_agg(b.pochette, b.nombre) from internal.loterie_bons b where b.user_id = v_uid and b.nombre > 0), '{}'::jsonb),
    'paliers', coalesce(
      (select jsonb_agg(pb.palier order by pb.palier desc) from internal.paliers_boosters pb where pb.user_id = v_uid), '[]'::jsonb));
end $$;

revoke all on function public.get_pochettes_gagnees() from public, anon, authenticated;
grant execute on function public.get_pochettes_gagnees() to authenticated;
