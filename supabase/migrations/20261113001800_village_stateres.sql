-- Le village des Gaulois, deuxième lot : le statère, la monnaie (docs/DIRECTION.md, « Le village des Gaulois »).
--
-- Règles du pilote, 13 novembre 2026 :
-- - Les statères viennent des points rapportés au clan : le `score` positif de la session du clan, dans une partie jouée
--   sous le tag GAL. Une partie qui fait perdre des points ne retire rien. Aujourd'hui, seule une partie gagnée contre des
--   joueurs rapporte des points (relevé de novembre 2026 : 538 parties à points positifs, toutes gagnées).
-- - « Entiers à chacun » : chaque Gaulois présent dans la partie reçoit tous les points qu'elle a rapportés, sans partage.
--   30 statères par point rapporté au clan (le pilote, le soir même : d'abord 10, puis 30 quand la mesure de l'économie a
--   montré des gains trois fois plus bas que prévu, les prix restant les mêmes), arrondi à l'entier (une demie vers le
--   haut), au moins 1 statère pour une partie qui rapporte des points. La règle est dans une seule fonction,
--   internal.stateres_de_victoire, la même que stateresDeVictoire (src/lib/stateres.ts) ; chaque crédit garde ses données
--   brutes (partie, début, points, nombre de Gaulois) et le nom de sa règle (« entier-30 »), pour qu'elle puisse changer
--   sans perdre l'historique.
-- - Seul un compte validé reçoit des statères, reconnu par l'empreinte de son identifiant OpenFront
--   (private_links.openfront_hash), et seulement s'il a créé son Gaulois. Comptent les parties commencées depuis le 1er du
--   mois de création du Gaulois, à Paris ; ensuite, chaque nouvelle partie qui rapporte des points s'ajoute.
-- - Le solde se garde d'un mois à l'autre. Il est privé : aucune fonction ne classe les soldes. Il ne s'achète pas.
--
-- Les noms techniques (tables stateres_victoires, fonctions noter_victoires_stateres et stateres_de_victoire, nature
-- 'victoire' du journal) datent de la première écriture : ils désignent les parties qui ont rapporté des points au clan et
-- ne sont jamais montrés à un membre. Les textes, eux, disent « points rapportés au clan ».
--
-- Choix de la relecture, que le pilote peut changer : une partie commencée pendant la suspension d'un compte ne lui rapporte
-- jamais rien, même une fois la suspension levée ; et la présence d'un joueur dans une partie ne paie qu'une fois, même si
-- son empreinte passe d'un compte à un autre (lien refait, compte supprimé puis recréé).
--
-- D'où viennent les parties : scripts/crediter-stateres.ts, lancé avec le workflow des victoires toutes les 5 minutes,
-- relit une fois chaque partie du mois qui a rapporté des points et envoie, avec la clé de service, la partie, son début, ses
-- points, le nombre de Gaulois de la session et l'empreinte SHA-256 de chaque Gaulois présent (tag du clan et stats).
-- Jamais un identifiant.
--
-- Ce qui est gardé :
-- - internal.stateres_victoires et internal.stateres_presences : les parties du mois en cours et du mois précédent, à
--   Paris, avec les empreintes de leurs Gaulois, comptes ou pas, et l'heure où chaque présence a été payée. Effacées à la
--   fin du mois qui suit la partie : de quoi créditer un compte validé ou un Gaulois créé un peu après ses parties.
-- - internal.stateres_mouvements : le journal des statères de chaque compte, crédits (> 0) et, au lot 3, débits (< 0) ; on
--   n'y ajoute que des lignes. internal.stateres_soldes : le solde, tenu par le journal seul, jamais négatif. Les deux
--   s'effacent avec le compte.
-- - internal.stateres_suspensions : le début et la fin de chaque suspension d'un compte, jusqu'à la fin du mois qui suit sa
--   levée, ou l'effacement du compte.
-- - internal.stateres_releve : l'heure de la dernière relecture, montrée avec le solde.
--
-- Qui peut quoi :
-- - get_mes_stateres : un compte connecté, pour lui seul.
-- - stateres_parties_notees, noter_victoires_stateres : la clé de service seulement.
--
-- Pour le lot 3 et les suivants : un achat ou un échange s'écrit en ajoutant une ligne au journal (débit négatif), jamais en
-- touchant au solde, que la table refuse d'écrire autrement. Une fonction qui touche les soldes de plusieurs comptes ajoute
-- leurs lignes dans l'ordre des user_id, comme internal.crediter_stateres : deux transactions ne se bloquent pas en croix.
--
-- Six tables, quatre déclencheurs et quatorze fonctions ajoutés, aucune donnée existante touchée (un déclencheur s'ajoute
-- sur public.profiles, qui note les suspensions sans rien changer au profil). Rejouée, elle se remplace par la même.

create table if not exists internal.stateres_victoires (
  partie text primary key check (partie ~ '^[A-Za-z0-9]{4,20}$'),
  debut timestamptz not null,
  points numeric not null check (points > 0 and points < 1000),
  gaulois integer not null check (gaulois between 1 and 200),
  notee_le timestamptz not null default now()
);
create index if not exists stateres_victoires_debut on internal.stateres_victoires (debut);

create table if not exists internal.stateres_presences (
  partie text not null references internal.stateres_victoires (partie) on delete cascade,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  -- L'heure où cette présence a été payée à un compte : elle ne paie plus jamais, à aucun compte.
  versee_le timestamptz,
  primary key (partie, empreinte)
);
create index if not exists stateres_presences_a_verser on internal.stateres_presences (empreinte) where versee_le is null;

create table if not exists internal.stateres_mouvements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  -- 'victoire' : les points rapportés au clan par une partie. Les achats et les échanges du lot 3 auront leur nature.
  nature text not null check (nature ~ '^[a-z][a-z_]{1,31}$'),
  -- Une borne large : une partie vaut moins de 30 000 statères (moins de 1 000 points ; 6,71 au plus en novembre 2026),
  -- l'objet le plus cher 2 500.
  montant integer not null check (montant <> 0 and montant between -1000000 and 1000000),
  -- Les données brutes de la partie.
  partie text,
  debut timestamptz,
  points numeric,
  gaulois integer,
  regle text check (regle is null or char_length(regle) between 1 and 40),
  -- Ce que vise un débit du lot 3 (un objet, un échange).
  ref text check (ref is null or char_length(ref) between 1 and 80),
  cree_le timestamptz not null default now(),
  check (nature <> 'victoire' or (montant > 0 and partie is not null and debut is not null and points > 0 and gaulois >= 1 and regle is not null))
);
-- Une partie ne compte qu'une fois par compte.
create unique index if not exists stateres_une_victoire on internal.stateres_mouvements (user_id, partie) where nature = 'victoire';
create index if not exists stateres_mouvements_compte on internal.stateres_mouvements (user_id, cree_le desc);

create table if not exists internal.stateres_soldes (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  solde bigint not null default 0 check (solde >= 0),
  maj_le timestamptz not null default now()
);

create table if not exists internal.stateres_suspensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  debut timestamptz not null,
  -- null : la suspension dure encore.
  fin timestamptz,
  check (fin is null or fin >= debut)
);
create unique index if not exists stateres_une_suspension_ouverte on internal.stateres_suspensions (user_id) where fin is null;

create table if not exists internal.stateres_releve (
  id boolean primary key default true check (id),
  le timestamptz not null
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.stateres_victoires enable row level security;
alter table internal.stateres_presences enable row level security;
alter table internal.stateres_mouvements enable row level security;
alter table internal.stateres_soldes enable row level security;
alter table internal.stateres_suspensions enable row level security;
alter table internal.stateres_releve enable row level security;
revoke all on table internal.stateres_victoires from public, anon, authenticated;
revoke all on table internal.stateres_presences from public, anon, authenticated;
revoke all on table internal.stateres_mouvements from public, anon, authenticated;
revoke all on table internal.stateres_soldes from public, anon, authenticated;
revoke all on table internal.stateres_suspensions from public, anon, authenticated;
revoke all on table internal.stateres_releve from public, anon, authenticated;

-- Le solde suit le journal, dans la même transaction. Un débit qui le rendrait négatif est refusé par la table des soldes.
create or replace function internal.stateres_tenir_solde() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- La mise à jour d'abord : Postgres vérifie la règle « jamais négatif » sur la ligne proposée avant de voir qu'elle existe.
  update internal.stateres_soldes set solde = solde + new.montant, maj_le = now() where user_id = new.user_id;
  if not found then
    insert into internal.stateres_soldes (user_id, solde) values (new.user_id, new.montant) on conflict (user_id) do nothing;
    if not found then
      update internal.stateres_soldes set solde = solde + new.montant, maj_le = now() where user_id = new.user_id;
    end if;
  end if;
  return new;
end $$;

-- Le journal ne se corrige pas : une erreur se répare par un nouveau mouvement. Une ligne ne s'efface qu'avec son compte,
-- par la suppression en cascade, qui passe par un déclencheur (pg_trigger_depth() vaut alors au moins 2).
create or replace function internal.stateres_journal_fige() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'le journal des statères ne se modifie pas';
end $$;

-- Le solde ne s'écrit que par le journal (internal.stateres_tenir_solde, un déclencheur) et ne s'efface qu'avec son compte :
-- jamais par une requête directe, même d'une fonction du serveur. Ainsi le solde reste la somme du journal.
create or replace function internal.stateres_solde_garde() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'le solde des statères ne s''écrit que par le journal';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- Note le début et la fin de chaque suspension : les parties commencées entre les deux ne rapportent rien à ce compte.
create or replace function internal.stateres_noter_suspension() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'suspended' and old.status <> 'suspended' then
    insert into internal.stateres_suspensions (user_id, debut) values (new.user_id, now())
    on conflict (user_id) where fin is null do nothing;
  elsif old.status = 'suspended' and new.status <> 'suspended' then
    update internal.stateres_suspensions set fin = greatest(debut, now()) where user_id = new.user_id and fin is null;
  end if;
  return null;
end $$;

create or replace trigger stateres_tenir_solde after insert on internal.stateres_mouvements
  for each row execute function internal.stateres_tenir_solde();
create or replace trigger stateres_journal_fige before update or delete on internal.stateres_mouvements
  for each row execute function internal.stateres_journal_fige();
create or replace trigger stateres_solde_garde before insert or update or delete on internal.stateres_soldes
  for each row execute function internal.stateres_solde_garde();
create or replace trigger stateres_suspensions after update of status on public.profiles
  for each row execute function internal.stateres_noter_suspension();

-- Les comptes déjà suspendus quand la migration est collée : depuis leur dernière suspension au journal, sinon depuis toujours.
insert into internal.stateres_suspensions (user_id, debut)
select p.user_id, coalesce((select max(a.at) from public.admin_log a where a.action = 'member_suspended' and a.target_id = p.user_id), '-infinity'::timestamptz)
from public.profiles p
where p.status = 'suspended'
on conflict (user_id) where fin is null do nothing;

revoke all on function internal.stateres_tenir_solde() from public, anon, authenticated;
revoke all on function internal.stateres_journal_fige() from public, anon, authenticated;
revoke all on function internal.stateres_solde_garde() from public, anon, authenticated;
revoke all on function internal.stateres_noter_suspension() from public, anon, authenticated;

-- La règle : les statères que reçoit chaque Gaulois présent dans une partie qui a rapporté des points au clan. La même que
-- stateresDeVictoire (src/lib/stateres.ts). Pour la changer : une nouvelle migration qui remplace ces deux fonctions ; les
-- crédits déjà donnés gardent leur montant, leurs données brutes et le nom de leur règle.
create or replace function internal.stateres_de_victoire(p_points numeric, p_gaulois integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_points is null or p_points <= 0 or p_gaulois is null or p_gaulois < 1 then 0
    else greatest(1, round(p_points * 30))::integer
  end
$$;

create or replace function internal.stateres_regle() returns text
language sql immutable set search_path = public, pg_temp as $$ select 'entier-30'::text $$;

-- Le 1er du mois de `p_at`, à minuit à Paris. Minuit n'est jamais dans un changement d'heure (à 2 h ou 3 h du matin).
create or replace function internal.stateres_debut_du_mois(p_at timestamptz) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select date_trunc('month', p_at at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

-- Ce qui est plus ancien s'efface : le 1er du mois précédent, à Paris.
create or replace function internal.stateres_limite_garde() returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month') at time zone 'Europe/Paris'
$$;

-- Efface ce qui a passé son temps : les parties d'avant le mois précédent avec leurs empreintes, les suspensions levées
-- avant lui. Appelée à chaque relecture et à chaque lecture d'un solde : même sans workflow, rien ne reste plus longtemps.
create or replace function internal.stateres_effacer_l_ancien() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limite timestamptz := internal.stateres_limite_garde();
begin
  delete from internal.stateres_victoires where debut < v_limite;
  delete from internal.stateres_suspensions where fin is not null and fin < v_limite;
end $$;

revoke all on function internal.stateres_de_victoire(numeric, integer) from public, anon, authenticated;
revoke all on function internal.stateres_regle() from public, anon, authenticated;
revoke all on function internal.stateres_debut_du_mois(timestamptz) from public, anon, authenticated;
revoke all on function internal.stateres_limite_garde() from public, anon, authenticated;
revoke all on function internal.stateres_effacer_l_ancien() from public, anon, authenticated;

-- Paie les présences notées qui reviennent à un compte et n'ont encore été payées à personne : compte validé, empreinte
-- OpenFront présente dans la partie, Gaulois créé, partie commencée depuis le 1er du mois de sa création et hors de toute
-- suspension du compte. `p_user` : un seul compte ; null : tous. Renvoie le nombre de crédits ajoutés.
-- Deux appels en même temps (la relecture et la lecture d'un solde) ne paient pas deux fois : chacun prend les présences
-- qu'il paie, et laisse à l'autre celles qu'il tient déjà (skip locked). Le journal refuse en plus une même partie deux fois
-- au même compte.
create or replace function internal.crediter_stateres(p_user uuid default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  with a_payer as materialized (
    select pr.partie, pr.empreinte, l.user_id, v.debut, v.points, v.gaulois
    from internal.stateres_presences pr
    join internal.stateres_victoires v on v.partie = pr.partie
    join public.private_links l on l.openfront_hash = pr.empreinte
    join public.profiles p on p.user_id = l.user_id
    join internal.gaulois g on g.user_id = l.user_id
    where pr.versee_le is null
      and p.status = 'validated'
      and (p_user is null or l.user_id = p_user)
      and v.debut >= internal.stateres_debut_du_mois(g.created_at)
      and internal.stateres_de_victoire(v.points, v.gaulois) > 0
      and not exists (
        select 1 from internal.stateres_suspensions s
        where s.user_id = l.user_id and v.debut >= s.debut and (s.fin is null or v.debut < s.fin)
      )
    order by pr.partie, pr.empreinte
    for update of pr skip locked
  ),
  versees as (
    update internal.stateres_presences pr set versee_le = now()
    from a_payer a
    where pr.partie = a.partie and pr.empreinte = a.empreinte
  ),
  nouveaux as (
    insert into internal.stateres_mouvements (user_id, nature, montant, partie, debut, points, gaulois, regle)
    select a.user_id, 'victoire', internal.stateres_de_victoire(a.points, a.gaulois), a.partie, a.debut, a.points, a.gaulois, internal.stateres_regle()
    from a_payer a
    order by a.user_id, a.debut, a.partie
    on conflict (user_id, partie) where nature = 'victoire' do nothing
    returning 1
  )
  select count(*)::integer into v_n from nouveaux;
  return v_n;
end $$;

revoke all on function internal.crediter_stateres(uuid) from public, anon, authenticated;

-- Une partie telle que le script l'envoie : { partie, debut, points, gaulois, empreintes }, rien d'autre. Le début est une
-- date ISO complète, comme toISOString() : ni « now », ni « today », ni une date à l'écriture ambiguë.
create or replace function internal.stateres_partie_valide(p jsonb) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_debut timestamptz;
  v_e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p)) <> 5 then return false; end if;
  if jsonb_typeof(p -> 'partie') is distinct from 'string' or (p ->> 'partie') !~ '^[A-Za-z0-9]{4,20}$' then return false; end if;
  if jsonb_typeof(p -> 'debut') is distinct from 'string'
     or (p ->> 'debut') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  begin
    v_debut := (p ->> 'debut')::timestamptz;
  exception when others then
    return false;
  end;
  if v_debut > now() + interval '1 hour' then return false; end if;
  if jsonb_typeof(p -> 'points') is distinct from 'number' or (p ->> 'points')::numeric <= 0 or (p ->> 'points')::numeric >= 1000 then return false; end if;
  if jsonb_typeof(p -> 'gaulois') is distinct from 'number' or (p ->> 'gaulois')::numeric <> trunc((p ->> 'gaulois')::numeric)
     or (p ->> 'gaulois')::numeric not between 1 and 200 then return false; end if;
  if jsonb_typeof(p -> 'empreintes') is distinct from 'array' or jsonb_array_length(p -> 'empreintes') > 200 then return false; end if;
  for v_e in select value from jsonb_array_elements(p -> 'empreintes') loop
    if jsonb_typeof(v_e) <> 'string' or (v_e #>> '{}') !~ '^[0-9a-f]{64}$' then return false; end if;
  end loop;
  return true;
end $$;

revoke all on function internal.stateres_partie_valide(jsonb) from public, anon, authenticated;

-- Pour le script : les parties déjà notées depuis `p_depuis`, qu'il ne relit pas. { ok: true, parties: [...] }.
create or replace function public.stateres_parties_notees(p_depuis timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_depuis is null then return internal.error_json('invalid_request', ''); end if;
  return jsonb_build_object('ok', true, 'parties', coalesce(
    (select jsonb_agg(v.partie order by v.debut, v.partie) from internal.stateres_victoires v where v.debut >= p_depuis), '[]'::jsonb));
end $$;

revoke all on function public.stateres_parties_notees(timestamptz) from public, anon, authenticated;
grant execute on function public.stateres_parties_notees(timestamptz) to service_role;

-- Pour le script : note jusqu'à 50 parties qui ont rapporté des points au clan et les empreintes de leurs Gaulois, efface
-- ce qui a passé son temps, note l'heure de la relecture, puis crédite les comptes. Tout ou rien : une partie mal formée
-- fait refuser l'envoi entier (`invalid_parties`), sans rien écrire. Une partie déjà notée garde ses points ; ses Gaulois
-- manquants s'ajoutent. Une partie plus ancienne que le mois précédent est ignorée.
-- { ok: true, notees, deja, ignorees, credits, releve }.
create or replace function public.noter_victoires_stateres(p_parties jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limite timestamptz := internal.stateres_limite_garde();
  v_p jsonb;
  v_notees integer := 0;
  v_deja integer := 0;
  v_ignorees integer := 0;
  v_credits integer;
  v_detail text;
begin
  begin
    if p_parties is null or jsonb_typeof(p_parties) <> 'array' or jsonb_array_length(p_parties) > 50 then
      perform internal.fail('invalid_parties');
    end if;
    for v_p in select value from jsonb_array_elements(p_parties) loop
      if not internal.stateres_partie_valide(v_p) then perform internal.fail('invalid_parties'); end if;
    end loop;
    for v_p in select value from jsonb_array_elements(p_parties) loop
      if (v_p ->> 'debut')::timestamptz < v_limite then
        v_ignorees := v_ignorees + 1;
        continue;
      end if;
      insert into internal.stateres_victoires (partie, debut, points, gaulois)
      values (v_p ->> 'partie', (v_p ->> 'debut')::timestamptz, (v_p ->> 'points')::numeric, (v_p ->> 'gaulois')::integer)
      on conflict (partie) do nothing;
      if found then v_notees := v_notees + 1; else v_deja := v_deja + 1; end if;
      insert into internal.stateres_presences (partie, empreinte)
      select v_p ->> 'partie', e from jsonb_array_elements_text(v_p -> 'empreintes') e
      on conflict do nothing;
    end loop;
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  perform internal.stateres_effacer_l_ancien();
  insert into internal.stateres_releve (id, le) values (true, now()) on conflict (id) do update set le = excluded.le;
  v_credits := internal.crediter_stateres(null);
  return jsonb_build_object('ok', true, 'notees', v_notees, 'deja', v_deja, 'ignorees', v_ignorees, 'credits', v_credits, 'releve', now());
end $$;

revoke all on function public.noter_victoires_stateres(jsonb) from public, anon, authenticated;
grant execute on function public.noter_victoires_stateres(jsonb) to service_role;

-- Les statères du compte connecté : son solde, ses 30 derniers crédits (partie, début, points, nombre de Gaulois, statères),
-- la date de départ de son Gaulois et l'heure de la dernière relecture. Crédite d'abord ce qui lui revient déjà, par exemple
-- juste après la création de son Gaulois. Jamais le solde d'un autre.
create or replace function public.get_mes_stateres() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_lie boolean;
  v_cree timestamptz;
  v_detail text;
begin
  begin
    if v_uid is null then perform internal.fail('not_signed_in'); end if;
    select p.status into v_status from public.profiles p where p.user_id = v_uid;
    if not found then perform internal.fail('not_signed_in'); end if;
    if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  perform internal.stateres_effacer_l_ancien();
  v_lie := exists (select 1 from public.private_links l where l.user_id = v_uid and l.openfront_hash is not null);
  select g.created_at into v_cree from internal.gaulois g where g.user_id = v_uid;
  if v_status = 'validated' and v_lie and v_cree is not null then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'valide', v_status = 'validated',
    'lie', v_lie,
    'gaulois', v_cree is not null,
    'depart', case when v_cree is null then null else internal.stateres_debut_du_mois(v_cree) end,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'credits', coalesce((
      select jsonb_agg(jsonb_build_object('partie', m.partie, 'debut', m.debut, 'points', m.points, 'gaulois', m.gaulois, 'stateres', m.montant, 'regle', m.regle) order by m.debut desc, m.partie)
      from (
        select * from internal.stateres_mouvements m
        where m.user_id = v_uid and m.nature = 'victoire'
        order by m.debut desc, m.partie
        limit 30
      ) m), '[]'::jsonb),
    'releve', (select r.le from internal.stateres_releve r where r.id),
    'regle', internal.stateres_regle()
  );
end $$;

revoke all on function public.get_mes_stateres() from public, anon, authenticated;
grant execute on function public.get_mes_stateres() to authenticated;
