-- Une rareté terminée rend des statères (docs/DIRECTION.md, « Les Gaulois uniques » et « La pochette des bannières » ;
-- calculs du site : src/lib/village/modeles.ts et src/lib/village/bannieres.ts).
--
-- Demande du pilote, 16 novembre 2026 : « quand on complète la série mystique ou épique, ça augmente le % de chance du
-- légendaire et je ne veux pas ! Je veux que ça augmente le % du statères », dans les pochettes.
--
-- Avant : une rareté où le compte avait déjà tout était sautée, et les raretés qui restaient se partageaient ses chances
-- à proportion. Finir les épiques et les mystiques des trésors faisait passer le légendaire de 6 à 60 pour cent.
--
-- Les règles, pour la pochette des Gaulois uniques et la pochette des bannières :
-- - Chaque rareté garde toujours sa chance de départ. La rareté se tire parmi toutes, terminées ou non.
-- - Si la rareté tirée est une rareté où le compte a déjà tout, la pochette rend des statères à la place, comme un
--   remboursement ordinaire : 20, 30, 40, 50 ou 60 % du prix, à chances égales.
-- - La part des remboursements d'un compte est donc sa part de départ, plus les chances des raretés qu'il a terminées.
--   Trésors, épiques et mystiques terminés : 94 % de statères rendus, 6 % de légendaire, comme au premier jour.
-- - Rien d'autre ne change : jamais deux fois le même, 'tout_possede' quand il ne reste rien, le journal des statères
--   (`ref` « modeles-rembourse » et « bannieres-rembourse »), les formes des réponses.
-- - La pochette des familiers et la pochette surprise ne rendent pas de statères : elles ne changent pas.
--
-- Ce qui change : public.ouvrir_pochette_modeles (remplacée, depuis la 20261116000600) et
-- public.ouvrir_pochette_bannieres (remplacée, depuis la 20261116000700). Aucune table, aucun compte, aucun objet possédé,
-- aucun statère existant n'est touché. Rejouée, elle se remplace par la même.

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
  v_rend boolean;
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
    -- Il faut qu'une rareté qui a des chances ait encore un modèle à lui donner.
    if not exists (
      select 1 from internal.modeles_chances() c
      where c.chance > 0 and exists (select 1 from internal.modeles_a_recevoir(v_uid) a where a.rarete = c.rarete)
    ) then perform internal.fail('invalid_request'); end if;

    -- D'abord : un remboursement, selon sa part, ou un tirage de rareté.
    v_rend := internal.village_hasard() * 100 < coalesce(v_rembourse, 0);
    if not v_rend then
      -- La rareté selon ses chances, toutes comptées, même celles où il a déjà tout.
      select sum(c.chance) into v_total from internal.modeles_chances() c where c.chance > 0;
      v_tirage := internal.village_hasard() * v_total;
      for v_r in
        select c.rarete, c.chance from internal.modeles_chances() c where c.chance > 0 order by c.rang
      loop
        v_cumul := v_cumul + v_r.chance;
        v_rarete := v_r.rarete;
        exit when v_tirage < v_cumul;
      end loop;
      select count(*)::integer into v_n from internal.modeles_a_recevoir(v_uid) a where a.rarete = v_rarete;
      -- Une rareté terminée : ses chances vont aux statères rendus, jamais aux autres raretés.
      if v_n = 0 then v_rend := true; end if;
    end if;

    if v_rend then
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

    -- Sinon, un modèle de cette rareté qu'il n'a pas encore, tous à chances égales.
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
  v_rend boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if not exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;
    -- Il faut qu'une rareté qui a des chances ait encore une bannière à lui donner.
    if not exists (
      select 1 from internal.bannieres_pochette_chances() c
      where c.chance > 0 and exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = c.rarete)
    ) then perform internal.fail('invalid_request'); end if;

    -- D'abord : un remboursement, selon sa part, ou un tirage de rareté.
    v_rend := internal.village_hasard() * 100 < internal.bannieres_pochette_remboursement();
    if not v_rend then
      -- La rareté selon ses chances, toutes comptées, même celles où il a déjà tout.
      select sum(c.chance) into v_total from internal.bannieres_pochette_chances() c where c.chance > 0;
      v_tirage := internal.village_hasard() * v_total;
      for v_r in
        select c.rarete, c.chance from internal.bannieres_pochette_chances() c where c.chance > 0 order by c.rang
      loop
        v_cumul := v_cumul + v_r.chance;
        v_rarete := v_r.rarete;
        exit when v_tirage < v_cumul;
      end loop;
      select count(*)::integer into v_n from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = v_rarete;
      -- Une rareté terminée : ses chances vont aux statères rendus, jamais aux autres raretés.
      if v_n = 0 then v_rend := true; end if;
    end if;

    if v_rend then
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

    -- Sinon, une bannière de cette rareté qu'il n'a pas encore, toutes à chances égales.
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
