-- Le village des Gaulois, troisième lot : la boutique et la pochette surprise, côté serveur (docs/DIRECTION.md, « Le village
-- des Gaulois » ; formes des réponses : src/lib/village/contrat.ts).
--
-- Règles du pilote, 13 novembre 2026 : un objet payant s'achète en statères, au prix de sa rareté (commun 100, peu commun
-- 250, épique 500, mystique 1 000, légendaire 2 500) ; la pochette surprise coûte 200 statères. Les statères ne s'achètent
-- jamais. Choix du chef d'orchestre : un objet déjà possédé ne se rachète pas à la boutique ; la pochette tire d'abord une
-- rareté selon des chances affichées (au départ 50, 30, 13, 5 et 2 pour cent, d'après la mesure de l'économie,
-- src/lib/village/economie.ts), puis un objet payant de cette rareté, tous à chances égales ; un objet déjà possédé peut
-- sortir : sa quantité augmente d'un, c'est un double (qui se vendra au marché).
--
-- Ce qui est gardé :
-- - internal.village_prix : le prix d'un objet, par rareté (cinq lignes). internal.village_pochette : le prix de la pochette
--   et ses chances par rareté, en pour cent, sur une seule ligne dont la somme fait 100. Semées avec les valeurs de
--   contrat.ts, qu'un test garde identiques ; une migration suivante les rendra réglables depuis la Direction, par un simple
--   `update` (un réglage se change, il ne s'efface pas). Rejouée, cette migration ne les remet pas à leur valeur de départ.
-- - internal.gaulois_inventaire : les objets payants de chaque compte, leur quantité et l'origine du dernier reçu (achat,
--   pochette ou marché). S'efface avec le compte.
-- - Chaque achat est un débit du journal des statères (internal.stateres_mouvements, migration 20261113001800) : nature
--   'achat' ou 'pochette', `ref` : l'objet reçu, « emplacement/objet ». C'est la table des soldes qui refuse un solde
--   insuffisant, dans la même transaction que l'achat : rien n'est débité sans objet, aucun objet n'entre sans débit.
--
-- Le tirage de la pochette : une rareté selon les chances, parmi celles qui ont au moins un objet payant (aujourd'hui toutes ;
-- une rareté sans objet payant serait sautée et les autres se partageraient ses chances à proportion, comme le calcule
-- chancesEffectives de src/lib/village/boutique.ts), puis un objet payant de cette rareté, à chances égales. Le hasard vient du
-- générateur sûr de Postgres, jamais du navigateur.
--
-- Qui peut quoi :
-- - get_ma_boutique : un compte connecté, non suspendu ; il lit son solde, ses objets et les réglages.
-- - acheter_objet, ouvrir_pochette : un compte validé qui a créé son Gaulois.
-- - enregistrer_mon_gaulois (remplacée, avec internal.gaulois_tenue_valide) : une tenue accepte maintenant, à chaque
--   emplacement, un objet gratuit ou un objet de l'inventaire de l'appelant. Ses autres refus restent les mêmes.
-- - Les achats, les pochettes et la tenue d'un même compte passent l'un après l'autre (internal.village_verrou) : deux achats
--   au même instant ne prennent pas deux fois le même objet. Le marché du lot suivant prend le même verrou, pour chacun des
--   deux comptes d'un échange, dans l'ordre des user_id (comme les lignes du journal) : deux échanges ne se bloquent pas en croix.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
--
-- Trois tables, deux déclencheurs et neuf fonctions ajoutés, deux fonctions remplacées, aucune donnée existante touchée.
-- Rejouée, elle se remplace par la même.

create table if not exists internal.village_prix (
  rarete text primary key check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire')),
  prix integer not null check (prix between 1 and 1000000),
  maj_le timestamptz not null default now()
);

insert into internal.village_prix (rarete, prix) values
  ('commun', 100),
  ('peu-commun', 250),
  ('epique', 500),
  ('mystique', 1000),
  ('legendaire', 2500)
on conflict (rarete) do nothing;

-- Une seule ligne. Chaque chance va de 0 à 100 pour cent, avec deux décimales au plus ; ensemble, elles font 100.
create table if not exists internal.village_pochette (
  id boolean primary key default true check (id),
  prix integer not null check (prix between 1 and 1000000),
  commun numeric(5, 2) not null check (commun between 0 and 100),
  peu_commun numeric(5, 2) not null check (peu_commun between 0 and 100),
  epique numeric(5, 2) not null check (epique between 0 and 100),
  mystique numeric(5, 2) not null check (mystique between 0 and 100),
  legendaire numeric(5, 2) not null check (legendaire between 0 and 100),
  maj_le timestamptz not null default now(),
  constraint village_pochette_cent check (commun + peu_commun + epique + mystique + legendaire = 100)
);

insert into internal.village_pochette (id, prix, commun, peu_commun, epique, mystique, legendaire) values
  (true, 200, 50, 30, 13, 5, 2)
on conflict (id) do nothing;

-- Les objets payants de chaque compte. `origine` et `acquis_le` : ceux du dernier exemplaire reçu.
create table if not exists internal.gaulois_inventaire (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  emplacement text not null,
  objet text not null,
  quantite integer not null default 1 check (quantite >= 1),
  origine text not null check (origine in ('achat', 'pochette', 'marche')),
  acquis_le timestamptz not null default now(),
  primary key (user_id, emplacement, objet),
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet)
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.village_prix enable row level security;
alter table internal.village_pochette enable row level security;
alter table internal.gaulois_inventaire enable row level security;
revoke all on table internal.village_prix from public, anon, authenticated;
revoke all on table internal.village_pochette from public, anon, authenticated;
revoke all on table internal.gaulois_inventaire from public, anon, authenticated;

-- Un réglage se change, il ne s'efface pas : sans ses cinq prix et sa pochette, la boutique ne saurait plus rien vendre.
create or replace function internal.village_reglage_garde() returns trigger
language plpgsql as $$
begin
  raise exception 'un réglage de la boutique se change, il ne s''efface pas';
end $$;

create or replace trigger village_prix_garde before delete on internal.village_prix
  for each statement execute function internal.village_reglage_garde();
create or replace trigger village_pochette_garde before delete on internal.village_pochette
  for each statement execute function internal.village_reglage_garde();

revoke all on function internal.village_reglage_garde() from public, anon, authenticated;

-- Un compte à la fois : ses achats, ses pochettes, sa tenue et, au lot suivant, ses ventes passent l'un après l'autre,
-- jusqu'à la fin de leur transaction.
create or replace function internal.village_verrou(p_user uuid) returns void
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('gal_village'), hashtext(p_user::text));
end $$;

revoke all on function internal.village_verrou(uuid) from public, anon, authenticated;

-- L'appelant, s'il peut acheter : connecté, non suspendu, validé, avec un Gaulois créé. Sinon une erreur, comme ailleurs.
create or replace function internal.village_acheteur() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select p.status into v_status from public.profiles p where p.user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  if v_status <> 'validated' then perform internal.fail('not_validated'); end if;
  if not exists (select 1 from internal.gaulois g where g.user_id = v_uid) then perform internal.fail('no_gaulois'); end if;
  return v_uid;
end $$;

revoke all on function internal.village_acheteur() from public, anon, authenticated;

-- Retire `p_montant` statères (plus de zéro) au compte, par une ligne du journal. La table des soldes refuse un solde qui
-- deviendrait négatif : son refus devient 'solde_insuffisant'. Toute autre erreur reste une erreur.
create or replace function internal.village_debiter(p_user uuid, p_nature text, p_montant integer, p_ref text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_contrainte text;
begin
  if p_user is null or p_montant is null or p_montant <= 0 then
    raise exception 'débit du village mal formé';
  end if;
  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, p_nature, -p_montant, p_ref);
exception when check_violation then
  get stacked diagnostics v_contrainte = constraint_name;
  if v_contrainte = 'stateres_soldes_solde_check' then perform internal.fail('solde_insuffisant'); end if;
  raise;
end $$;

revoke all on function internal.village_debiter(uuid, text, integer, text) from public, anon, authenticated;

-- Un nombre au hasard, de 0 compris à 1 non compris, tiré par le générateur sûr de Postgres : les 48 premiers bits d'un UUID
-- aléatoire (version 4), qui sont tous tirés au hasard.
create or replace function internal.village_hasard() returns double precision
language sql volatile as $$
  select ('x' || left(replace(gen_random_uuid()::text, '-', ''), 12))::bit(48)::bigint / 281474976710656.0::double precision
$$;

revoke all on function internal.village_hasard() from public, anon, authenticated;

-- Les chances de la pochette, une ligne par rareté, de la plus courante à la plus rare.
create or replace function internal.village_chances() returns table (rarete text, rang integer, chance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.rarete, r.rang, r.chance
  from internal.village_pochette p
  cross join lateral (values
    ('commun', 1, p.commun),
    ('peu-commun', 2, p.peu_commun),
    ('epique', 3, p.epique),
    ('mystique', 4, p.mystique),
    ('legendaire', 5, p.legendaire)
  ) as r (rarete, rang, chance)
  where p.id
$$;

revoke all on function internal.village_chances() from public, anon, authenticated;

-- La boutique du compte connecté : son solde, s'il peut acheter (compte validé avec un Gaulois créé), les prix, la pochette et
-- ses objets. Crédite d'abord ce qui lui revient déjà, comme get_mes_stateres. Jamais le solde ni les objets d'un autre.
create or replace function public.get_ma_boutique() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_gaulois boolean;
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
  v_gaulois := exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.village_prix p),
    'pochette', jsonb_build_object(
      'prix', (select p.prix from internal.village_pochette p where p.id),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.village_chances() c)
    ),
    'inventaire', coalesce((
      select jsonb_agg(jsonb_build_object('emplacement', i.emplacement, 'objet', i.objet, 'quantite', i.quantite, 'origine', i.origine, 'acquis_le', i.acquis_le)
        order by i.acquis_le desc, i.emplacement, i.objet)
      from internal.gaulois_inventaire i
      where i.user_id = v_uid), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_ma_boutique() from public, anon, authenticated;
grant execute on function public.get_ma_boutique() to authenticated;

-- Achète un objet payant du catalogue au prix de sa rareté : { ok: true, solde, objet: { emplacement, objet } }. Refus :
-- not_validated, no_gaulois, unknown_objet (hors du catalogue), objet_gratuit, deja_possede, solde_insuffisant ; et ceux de
-- tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.acheter_objet(p_emplacement text, p_objet text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_gratuit boolean;
  v_rarete text;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    select o.gratuit, o.rarete into v_gratuit, v_rarete
    from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet;
    if not found then perform internal.fail('unknown_objet'); end if;
    if v_gratuit then perform internal.fail('objet_gratuit'); end if;
    select p.prix into v_prix from internal.village_prix p where p.rarete = v_rarete;
    if v_prix is null then perform internal.fail('unknown_objet'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet) then
      perform internal.fail('deja_possede');
    end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, p_emplacement || '/' || p_objet);
    insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine)
    values (v_uid, p_emplacement, p_objet, 1, 'achat')
    on conflict (user_id, emplacement, objet) do nothing;
    -- Arrivé entre-temps par un autre chemin : le débit s'annule avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'objet', jsonb_build_object('emplacement', p_emplacement, 'objet', p_objet)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_objet(text, text) from public, anon, authenticated;
grant execute on function public.acheter_objet(text, text) to authenticated;

-- Ouvre une pochette surprise au prix réglé : { ok: true, solde, objet: { emplacement, objet, rarete, double } }. `double` :
-- l'objet était déjà dans l'inventaire, sa quantité augmente d'un. Mêmes refus que l'achat, sauf ceux d'un objet choisi ;
-- 'invalid_request' si aucune rareté ne peut sortir (aucune n'a à la fois des chances et un objet payant). Un refus ne
-- débite rien.
create or replace function public.ouvrir_pochette() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer;
  v_total numeric;
  v_tirage double precision;
  v_cumul numeric := 0;
  v_rarete text;
  v_r record;
  v_n integer;
  v_emplacement text;
  v_objet text;
  v_quantite integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    select p.prix into v_prix from internal.village_pochette p where p.id;
    -- La rareté : parmi celles qui ont des chances et au moins un objet payant, selon leurs chances.
    select sum(c.chance) into v_total from internal.village_chances() c
    where c.chance > 0 and exists (select 1 from internal.gaulois_objets o where o.rarete = c.rarete and not o.gratuit);
    if v_prix is null or v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.village_chances() c
      where c.chance > 0 and exists (select 1 from internal.gaulois_objets o where o.rarete = c.rarete and not o.gratuit)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    -- L'objet : un des objets payants de cette rareté, tous à chances égales.
    select count(*)::integer into v_n from internal.gaulois_objets o where o.rarete = v_rarete and not o.gratuit;
    select o.emplacement, o.objet into v_emplacement, v_objet
    from internal.gaulois_objets o
    where o.rarete = v_rarete and not o.gratuit
    order by o.emplacement, o.objet
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, v_emplacement || '/' || v_objet);
    insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine)
    values (v_uid, v_emplacement, v_objet, 1, 'pochette')
    on conflict (user_id, emplacement, objet) do update
      set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = now()
    returning i.quantite into v_quantite;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'objet', jsonb_build_object('emplacement', v_emplacement, 'objet', v_objet, 'rarete', v_rarete, 'double', v_quantite > 1)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette() from public, anon, authenticated;
grant execute on function public.ouvrir_pochette() to authenticated;

-- La tenue (remplace celle du vestiaire, migration 20261113001700) : pour chaque emplacement un objet de la liste, gratuit ou
-- dans l'inventaire de l'appelant, la couleur des cheveux, et rien d'autre. Sans appelant, seuls les objets gratuits.
create or replace function internal.gaulois_tenue_valide(p_tenue jsonb) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_emplacement text;
begin
  if p_tenue is null or jsonb_typeof(p_tenue) <> 'object' then
    return false;
  end if;
  foreach v_emplacement in array array['peau', 'cheveux', 'barbe', 'tete', 'haut', 'bas', 'pieds', 'arme'] loop
    if jsonb_typeof(p_tenue -> v_emplacement) is distinct from 'string' then
      return false;
    end if;
    if not exists (
      select 1 from internal.gaulois_objets o
      where o.emplacement = v_emplacement and o.objet = p_tenue ->> v_emplacement
        and (o.gratuit or exists (
          select 1 from internal.gaulois_inventaire i
          where i.user_id = v_uid and i.emplacement = o.emplacement and i.objet = o.objet))
    ) then
      return false;
    end if;
  end loop;
  if jsonb_typeof(p_tenue -> 'teinte_cheveux') is distinct from 'string'
    or not ((p_tenue ->> 'teinte_cheveux') = any (array['roux', 'blond', 'chatain', 'noir', 'gris', 'blanc'])) then
    return false;
  end if;
  return (select count(*) from jsonb_object_keys(p_tenue)) = 9;
end $$;

revoke all on function internal.gaulois_tenue_valide(jsonb) from public, anon, authenticated;

-- Enregistre la tenue de l'appelant (remplace celle du vestiaire) : la même, sous le verrou du compte, pour que l'inventaire
-- ne change pas pendant la vérification. { ok: true, tenue }, ou { ok: false, error: 'invalid_tenue' }.
create or replace function public.enregistrer_mon_gaulois(p_tenue jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.gaulois_titulaire();
    perform internal.village_verrou(v_uid);
    if not internal.gaulois_tenue_valide(p_tenue) then
      perform internal.fail('invalid_tenue');
    end if;
    insert into internal.gaulois (user_id, tenue) values (v_uid, p_tenue)
    on conflict (user_id) do update set tenue = excluded.tenue, updated_at = now();
    return jsonb_build_object('ok', true, 'tenue', p_tenue);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.enregistrer_mon_gaulois(jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_mon_gaulois(jsonb) to authenticated;
