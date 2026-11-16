-- Les remboursements de la pochette des Gaulois uniques (docs/DIRECTION.md, « Les Gaulois uniques » ; formes des réponses :
-- src/lib/village/contrat.ts ; lecture et calculs : src/lib/village/modeles.ts).
--
-- Demande du pilote, 16 novembre 2026 : « tu penses que les probabilités sont bien calculées, sachant que la pochette est
-- à 3 000 et que le moins bien qu'on peut avoir, c'est un commun à 11 500 ? Rajoute la probabilité de récupérer 20 à 60 %
-- de sa somme, pour mieux répartir les probabilités ». Devant quatre partages calculés (80, 85, 70 ou 50 % de
-- remboursements), il a choisi 85 %.
--
-- Les règles :
-- - Une pochette des Gaulois uniques donne, selon son réglage, un remboursement ou un Gaulois unique : au départ, 85 % de
--   remboursements et 15 % de Gaulois uniques (colonne internal.modeles_pochette.remboursement, en pour cent).
-- - Un remboursement rend 20, 30, 40, 50 ou 60 % du prix payé, ces cinq paliers à chances égales (600, 900, 1 200, 1 500
--   ou 1 800 statères à 3 000) : en moyenne 40 %. Les paliers sont écrits à un seul endroit, internal.modeles_paliers().
-- - Un Gaulois unique se tire comme avant parmi ceux que le compte n'a pas, selon les chances par rareté (50, 30, 12, 6, 2
--   pour cent de cette part). Pour un compte qui n'a rien : 2,5 % pour chaque commun, 1,5 % pour chaque peu commun, 0,9 %
--   pour chaque épique, 0,45 % pour chaque mystique, 0,3 % pour le dragon, à chaque pochette.
-- - Au prix de la boutique (11 500 à 28 000), une pochette vaut alors en moyenne 3 249 statères pour 3 000 au départ : elle
--   est à peu près juste, et elle devient meilleure à mesure que les modèles courants sont possédés.
-- - Qui a tous les Gaulois uniques ne peut plus ouvrir de pochette ('tout_possede'), même pour un remboursement.
-- - Le hasard vient du générateur sûr de Postgres (internal.village_hasard), jamais du navigateur.
-- - Au journal des statères, la pochette reste un débit de nature 'pochette' ; un remboursement s'y ajoute en crédit de la
--   même nature, `ref` « modeles-rembourse » pour les deux lignes. L'onglet Village de la Direction compte donc la
--   dépense nette en pochettes. L'annonce des achats sur Discord ne lit que les `ref` « emplacement/objet » : un
--   remboursement n'est jamais annoncé, et aucun montant ne l'est.
--
-- Ce qui change :
-- - internal.modeles_pochette : une colonne, `remboursement` (0 à 95), mise à 85 quand elle est créée.
-- - internal.modeles_paliers() (nouvelle) : les cinq paliers d'un remboursement.
-- - public.ouvrir_pochette_modeles (remplacée, depuis la 20261115001000) : { ok: true, solde, modele: { modele, rarete } ou
--   null, remboursement: { pourcent, rendu } ou null, reste }. Les refus ne changent pas.
-- - public.get_mes_modeles (remplacée, depuis la 20261116000500, ligne pour ligne) : la pochette dit aussi
--   `remboursement` (sa part, en pour cent) et `paliers` (les pourcentages rendus).
-- - export_site ne change pas : la ligne de la pochette, remboursement compris, y est déjà (`modeles_pochette`).
--
-- Rien n'est écrit au journal de l'encadrement. Aucun compte, aucun modèle possédé, aucun statère existant n'est touché.
-- Une colonne et une fonction ajoutées, deux fonctions remplacées. Rejouée, elle ne change plus rien.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'internal' and table_name = 'modeles_pochette' and column_name = 'remboursement'
  ) then
    alter table internal.modeles_pochette add column remboursement numeric(5, 2) not null default 0
      check (remboursement between 0 and 95);
    update internal.modeles_pochette set remboursement = 85, maj_le = now() where id;
  end if;
end $$;

-- Les paliers d'un remboursement, en pour cent du prix payé, tous à chances égales.
create or replace function internal.modeles_paliers() returns integer[]
language sql immutable set search_path = public, pg_temp as $$
  select array[20, 30, 40, 50, 60]
$$;

revoke all on function internal.modeles_paliers() from public, anon, authenticated;

-- Ouvre une pochette des Gaulois uniques au prix réglé : { ok: true, solde, modele, remboursement, reste }. `modele` :
-- { modele, rarete } quand elle donne un Gaulois unique, sinon null ; `remboursement` : { pourcent, rendu } quand elle
-- rend une part du prix, sinon null. `reste` : le nombre de modèles que le compte n'a pas encore. `p_prix_vu` : le prix que
-- le membre a vu ; s'il a changé entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois,
-- prix_change, tout_possede (il les a tous), solde_insuffisant ; 'invalid_request' si aucune rareté qui lui reste n'a de
-- chances ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_modeles(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer;
  v_rembourse numeric;
  v_paliers integer[] := internal.modeles_paliers();
  v_pourcent integer;
  v_rendu integer;
  v_total numeric;
  v_tirage double precision;
  v_cumul numeric := 0;
  v_rarete text;
  v_r record;
  v_n integer;
  v_modele text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    select p.prix, p.remboursement into v_prix, v_rembourse from internal.modeles_pochette p where p.id;
    if v_prix is null then perform internal.fail('invalid_request'); end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if not exists (select 1 from internal.modeles_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;
    -- La rareté qu'il pourrait recevoir : parmi celles qui ont des chances et un modèle qu'il n'a pas encore.
    select sum(c.chance) into v_total from internal.modeles_chances() c
    where c.chance > 0 and exists (select 1 from internal.modeles_a_recevoir(v_uid) a where a.rarete = c.rarete);
    if v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;

    -- D'abord : un remboursement, selon sa part, ou un Gaulois unique.
    if internal.village_hasard() * 100 < coalesce(v_rembourse, 0) then
      v_pourcent := v_paliers[1 + least(floor(internal.village_hasard() * array_length(v_paliers, 1))::integer, array_length(v_paliers, 1) - 1)];
      v_rendu := round(v_prix * v_pourcent / 100.0)::integer;
      perform internal.village_debiter(v_uid, 'pochette', v_prix, 'modeles-rembourse');
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'pochette', v_rendu, 'modeles-rembourse');
      return jsonb_build_object(
        'ok', true,
        'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
        'modele', null,
        'remboursement', jsonb_build_object('pourcent', v_pourcent, 'rendu', v_rendu),
        'reste', (select count(*) from internal.modeles_a_recevoir(v_uid))
      );
    end if;

    -- Sinon, la rareté selon ses chances, puis un modèle de cette rareté qu'il n'a pas encore, tous à chances égales.
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.modeles_chances() c
      where c.chance > 0 and exists (select 1 from internal.modeles_a_recevoir(v_uid) a where a.rarete = c.rarete)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    select count(*)::integer into v_n from internal.modeles_a_recevoir(v_uid) a where a.rarete = v_rarete;
    select a.modele into v_modele
    from internal.modeles_a_recevoir(v_uid) a
    where a.rarete = v_rarete
    order by a.modele
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, 'modele/' || v_modele);
    insert into internal.gaulois_modeles (user_id, modele) values (v_uid, v_modele)
    on conflict (user_id, modele) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('invalid_request'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'modele', jsonb_build_object('modele', v_modele, 'rarete', v_rarete),
      'remboursement', null,
      'reste', (select count(*) from internal.modeles_a_recevoir(v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_modeles(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_modeles(integer) to authenticated;

-- Les Gaulois uniques du compte connecté (remplace celle de la migration 20261116000500, ligne pour ligne, plus la part
-- des remboursements et leurs paliers dans la pochette) : { ok: true, solde, peut_acheter, prix: { rareté: statères },
-- pochette: { prix, chances, remboursement, paliers }, modeles: [{ modele, acquis_le }], porte }.
create or replace function public.get_mes_modeles() returns jsonb
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
  select g.tenue ->> 'modele' into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.modeles_prix p),
    'pochette', jsonb_build_object(
      'prix', (select p.prix from internal.modeles_pochette p where p.id),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.modeles_chances() c),
      'remboursement', (select trim_scale(p.remboursement) from internal.modeles_pochette p where p.id),
      'paliers', to_jsonb(internal.modeles_paliers())
    ),
    'modeles', coalesce((
      select jsonb_agg(jsonb_build_object('modele', g.modele, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.modele)
      from internal.gaulois_modeles g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_modeles() from public, anon, authenticated;
grant execute on function public.get_mes_modeles() to authenticated;
