-- La pochette des bannières à 1 500 statères, et ses remboursements (docs/DIRECTION.md, « La pochette des bannières » ;
-- formes des réponses : src/lib/village/contrat.ts ; lecture et calculs : src/lib/village/bannieres.ts).
--
-- Demande du pilote, 16 novembre 2026 : « baisse le prix des pochettes de bannière car c'est déséquilibré par rapport au
-- prix des bannières dans l'ensemble, et instaure la possibilité de gagner un % de la somme investie en statères, comme
-- pour la pochette des Gaulois ».
--
-- Les règles :
-- - La pochette des bannières coûte 1 500 statères (au lieu de 3 000) : le prix d'une bannière épique de la boutique, la
--   rareté la plus courante de ses trésors. À 3 000, six pochettes sur dix donnaient une bannière d'une rareté vendue
--   1 500 à la boutique.
-- - Une pochette donne un remboursement 40 fois sur 100, un trésor 60 fois sur 100
--   (internal.bannieres_pochette_remboursement, en pour cent).
-- - Un remboursement rend 20, 30, 40, 50 ou 60 % du prix payé, ces cinq paliers à chances égales (300, 450, 600, 750 ou
--   900 statères à 1 500) : en moyenne 40 % (internal.bannieres_pochette_paliers).
-- - Un trésor se tire comme avant parmi ceux que le compte n'a pas, selon les chances par rareté (épique 60, mystique 30,
--   légendaire 10 pour cent de cette part) : pour un compte qui n'a rien, 36, 18 et 6 pour cent à chaque pochette.
-- - Au prix de la boutique pour la même rareté (1 500, 3 000 et 7 500), une pochette vaut alors en moyenne 1 770 statères
--   pour 1 500 au départ (0,6 × 2 550 + 0,4 × 600). Un trésor revient en moyenne à 2 100 statères, remboursements déduits,
--   au lieu de 3 000 ; les vingt, à 42 000 au lieu de 60 000.
-- - Qui a tous les trésors ne peut plus ouvrir de pochette ('tout_possede'), même pour un remboursement.
-- - Le hasard vient du générateur sûr de Postgres (internal.village_hasard), jamais du navigateur.
-- - Au journal des statères, la pochette reste un débit de nature 'pochette' ; un remboursement s'y ajoute en crédit de la
--   même nature, `ref` « bannieres-rembourse » pour les deux lignes. L'onglet Village de la Direction compte donc la
--   dépense nette en pochettes. L'annonce des achats sur Discord ne lit que les `ref` « emplacement/objet » : un
--   remboursement n'est jamais annoncé, et aucun montant ne l'est.
-- - Prix, part des remboursements et paliers sont écrits dans trois fonctions, sans réglage dans la Direction : les
--   changer demande une nouvelle migration.
--
-- Ce qui change :
-- - internal.bannieres_pochette_prix (remplacée, depuis la 20261116000100) : 1 500.
-- - internal.bannieres_pochette_remboursement et internal.bannieres_pochette_paliers (nouvelles).
-- - public.ouvrir_pochette_bannieres (remplacée, depuis la 20261116000100) : { ok: true, solde, banniere: { banniere,
--   rarete } ou null, remboursement: { pourcent, rendu } ou null, reste }. Les refus ne changent pas.
-- - public.get_mes_bannieres (remplacée, depuis la 20261116000100, ligne pour ligne) : la pochette dit aussi
--   `remboursement` (sa part, en pour cent) et `paliers` (les pourcentages rendus).
--
-- Rien n'est écrit au journal de l'encadrement. Aucun compte, aucune bannière possédée, aucun statère existant n'est
-- touché ; une pochette déjà ouverte à 3 000 n'est pas remboursée. La sauvegarde ne change pas. Deux fonctions ajoutées,
-- trois remplacées. Rejouée, elle se remplace par la même.

-- Le prix de la pochette des bannières, en statères.
create or replace function internal.bannieres_pochette_prix() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 1500
$$;

revoke all on function internal.bannieres_pochette_prix() from public, anon, authenticated;

-- La part des pochettes qui rendent une partie de leur prix au lieu d'un trésor, en pour cent.
create or replace function internal.bannieres_pochette_remboursement() returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select 40::numeric
$$;

revoke all on function internal.bannieres_pochette_remboursement() from public, anon, authenticated;

-- Les paliers d'un remboursement, en pour cent du prix payé, tous à chances égales.
create or replace function internal.bannieres_pochette_paliers() returns integer[]
language sql immutable set search_path = public, pg_temp as $$
  select array[20, 30, 40, 50, 60]
$$;

revoke all on function internal.bannieres_pochette_paliers() from public, anon, authenticated;

-- Les bannières du compte connecté (remplace celle de la migration 20261116000100, ligne pour ligne, plus la part des
-- remboursements et leurs paliers dans la pochette) : { ok: true, solde, peut_acheter, prix: { rareté: statères },
-- pochette: { prix, chances: { rareté: pour cent }, remboursement, paliers }, bannieres: [{ banniere, acquis_le }], porte }.
create or replace function public.get_mes_bannieres() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_gaulois boolean;
  v_porte text;
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
  select g.banniere into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, internal.banniere_prix(p.rarete)) from internal.village_prix p),
    'pochette', jsonb_build_object(
      'prix', internal.bannieres_pochette_prix(),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.bannieres_pochette_chances() c),
      'remboursement', trim_scale(internal.bannieres_pochette_remboursement()),
      'paliers', to_jsonb(internal.bannieres_pochette_paliers())
    ),
    'bannieres', coalesce((
      select jsonb_agg(jsonb_build_object('banniere', g.banniere, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.banniere)
      from internal.gaulois_bannieres g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_bannieres() from public, anon, authenticated;
grant execute on function public.get_mes_bannieres() to authenticated;

-- Ouvre une pochette des bannières : { ok: true, solde, banniere, remboursement, reste }. `banniere` : { banniere, rarete }
-- quand elle donne un trésor, sinon null ; `remboursement` : { pourcent, rendu } quand elle rend une part du prix, sinon
-- null. `reste` : le nombre de trésors que le compte n'a pas encore. `p_prix_vu` : le prix que le membre a vu ; s'il a
-- changé entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, prix_change, tout_possede (il
-- les a tous), solde_insuffisant ; 'invalid_request' si aucune rareté qui lui reste n'a de chances ; et ceux de tout
-- compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_bannieres(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer := internal.bannieres_pochette_prix();
  v_paliers integer[] := internal.bannieres_pochette_paliers();
  v_pourcent integer;
  v_rendu integer;
  v_total numeric;
  v_tirage double precision;
  v_cumul numeric := 0;
  v_rarete text;
  v_r record;
  v_n integer;
  v_banniere text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if not exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;
    -- La rareté qu'il pourrait recevoir : parmi celles qui ont des chances et une bannière qu'il n'a pas encore.
    select sum(c.chance) into v_total from internal.bannieres_pochette_chances() c
    where c.chance > 0 and exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = c.rarete);
    if v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;

    -- D'abord : un remboursement, selon sa part, ou un trésor.
    if internal.village_hasard() * 100 < internal.bannieres_pochette_remboursement() then
      v_pourcent := v_paliers[1 + least(floor(internal.village_hasard() * array_length(v_paliers, 1))::integer, array_length(v_paliers, 1) - 1)];
      v_rendu := round(v_prix * v_pourcent / 100.0)::integer;
      perform internal.village_debiter(v_uid, 'pochette', v_prix, 'bannieres-rembourse');
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'pochette', v_rendu, 'bannieres-rembourse');
      return jsonb_build_object(
        'ok', true,
        'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
        'banniere', null,
        'remboursement', jsonb_build_object('pourcent', v_pourcent, 'rendu', v_rendu),
        'reste', (select count(*) from internal.bannieres_pochette_a_recevoir(v_uid))
      );
    end if;

    -- Sinon, la rareté selon ses chances, puis une bannière de cette rareté qu'il n'a pas encore, toutes à chances égales.
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.bannieres_pochette_chances() c
      where c.chance > 0 and exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = c.rarete)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    select count(*)::integer into v_n from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = v_rarete;
    select a.banniere into v_banniere
    from internal.bannieres_pochette_a_recevoir(v_uid) a
    where a.rarete = v_rarete
    order by a.banniere
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, 'banniere/' || v_banniere);
    insert into internal.gaulois_bannieres (user_id, banniere) values (v_uid, v_banniere)
    on conflict (user_id, banniere) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('invalid_request'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'banniere', jsonb_build_object('banniere', v_banniere, 'rarete', v_rarete),
      'remboursement', null,
      'reste', (select count(*) from internal.bannieres_pochette_a_recevoir(v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_bannieres(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_bannieres(integer) to authenticated;
