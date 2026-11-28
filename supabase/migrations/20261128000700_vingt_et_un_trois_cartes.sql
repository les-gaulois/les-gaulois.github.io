-- « Trois cartes », la mise à côté du vingt-et-un du casino des Gaulois (28 novembre 2026).
--
-- Le pilote a demandé une mise à côté au vingt-et-un, vu trois maquettes, puis laissé le choix : « Trois cartes ». Avant la
-- donne, le joueur peut poser des jetons sur une seconde place de la table. Ses deux premières cartes et la carte visible du
-- tavernier forment une main de trois cartes, décidée aussitôt la quatrième carte posée :
--   brelan de même enseigne : 100 fois la mise à côté, mise comprise (52 tirages sur 140 608) ;
--   suite de même enseigne : 39 fois (288) ; brelan : 28 fois (780) ; suite : 10 fois (4 320) ; même enseigne : 7 fois (8 448).
-- Une suite : trois rangs qui se suivent, l'as avant le 2 ou après le roi. Sur le paquet sans fin, ces gains rendent
-- exactement la mise en moyenne (calcul exact : src/lib/village/casino/vingt-et-un.ts, comptesDesTrois). La carte cachée ne
-- compte pas et n'est jamais montrée plus tôt.
--
-- La mise et la mise à côté : 200 statères au plus ensemble, en multiples de 10, prises ensemble au début (refus, comme
-- avant : pari_invalide, mise_trop_haute, solde_insuffisant). Ce que rend la mise à côté arrive au journal avec la fin de la
-- main, dans le même gain que la main. Mode GOD : rien n'est pris ni rendu, comme ailleurs.
--
-- Ce qui change :
-- - internal.casino_v21_trois(a, b, c) et internal.casino_v21_trois_fois(combinaison) : la règle et ses gains ;
-- - internal.casino_v21_distribuer(p_mise, p_trois, p_pioche) : la donne avec la mise à côté ; celle d'avant
--   (p_mise, p_pioche) la rappelle sans mise à côté. L'état d'une main garde « trois » (null sans mise à côté) ;
-- - internal.casino_v21_table : « trois », et « misee » et « rendu » qui la comptent ;
-- - internal.casino_v21_conclure : la partie note la mise à côté dans sa mise, son rendu et son résultat ;
-- - internal.casino_v21_commencer(p_mise, p_trois) : la donne d'un membre, appelée par public.distribuer_vingt_et_un(p_mise)
--   (l'écran d'avant, sans mise à côté) et par la nouvelle public.distribuer_vingt_et_un(p_mise, p_trois).
-- Rien n'est effacé, aucune ligne n'est touchée, aucun statère n'est créé. Les mains ouvertes avant cette migration se
-- finissent comme avant (sans « trois »).

/* ---------- La règle ---------- */

-- La main de trois cartes (nombres de 0 à 51 : rang n % 13, l'as à 0 et le roi à 12 ; enseigne n / 13) : 'brelan-enseigne',
-- 'suite-enseigne', 'brelan', 'suite', 'enseigne', ou null. La meilleure seule compte.
create or replace function internal.casino_v21_trois(p_a integer, p_b integer, p_c integer) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_r integer[];
  v_meme boolean := p_a / 13 = p_b / 13 and p_b / 13 = p_c / 13;
begin
  select array_agg(x order by x) into v_r from unnest(array[p_a % 13, p_b % 13, p_c % 13]) x;
  if v_r[1] = v_r[3] then return case when v_meme then 'brelan-enseigne' else 'brelan' end; end if;
  if v_r[1] <> v_r[2] and v_r[2] <> v_r[3] and (v_r[3] - v_r[1] = 2 or (v_r[1] = 0 and v_r[2] = 11 and v_r[3] = 12)) then
    return case when v_meme then 'suite-enseigne' else 'suite' end;
  end if;
  return case when v_meme then 'enseigne' end;
end $$;

-- Ce que rend chaque main, en fois la mise à côté, mise comprise ; 0 pour rien.
create or replace function internal.casino_v21_trois_fois(p_combinaison text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_combinaison
    when 'brelan-enseigne' then 100 when 'suite-enseigne' then 39 when 'brelan' then 28 when 'suite' then 10 when 'enseigne' then 7
    else 0 end
$$;

/* ---------- La donne ---------- */

-- Une main commence, avec les quatre premières cartes de p_pioche et p_trois statères sur « Trois cartes » (0 : sans) :
-- { etat, faits, prises }. Le fait « trois » suit la quatrième carte. Les faits gardent la carte cachée : ils ne sortent que
-- par internal.casino_v21_table.
create or replace function internal.casino_v21_distribuer(p_mise integer, p_trois integer, p_pioche integer[]) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_j1 integer := internal.casino_v21_carte_de(p_pioche, 1);
  v_t1 integer := internal.casino_v21_carte_de(p_pioche, 2);
  v_j2 integer := internal.casino_v21_carte_de(p_pioche, 3);
  v_t2 integer := internal.casino_v21_carte_de(p_pioche, 4);
  v_main jsonb;
  v_faits jsonb;
  v_phase text := 'joueur';
  v_tbj boolean;
  v_jbj boolean;
  v_issue text;
  v_recu integer;
  v_comb text;
  v_trois jsonb;
begin
  v_faits := jsonb_build_array(
    jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', 0, 'carte', v_j1),
    jsonb_build_object('t', 'carte', 'a', 'tavernier', 'carte', v_t1),
    jsonb_build_object('t', 'carte', 'a', 'joueur', 'main', 0, 'carte', v_j2),
    jsonb_build_object('t', 'carte', 'a', 'tavernier', 'carte', v_t2, 'cachee', true)
  );
  if coalesce(p_trois, 0) > 0 then
    -- les deux cartes du joueur et la carte visible du tavernier, jamais la carte cachée
    v_comb := internal.casino_v21_trois(v_j1, v_j2, v_t1);
    v_trois := jsonb_build_object('mise', p_trois, 'combinaison', v_comb, 'recu', p_trois * internal.casino_v21_trois_fois(v_comb));
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'trois', 'combinaison', v_comb, 'recu', v_trois -> 'recu'));
  end if;
  v_main := internal.casino_v21_main(jsonb_build_array(v_j1, v_j2), p_mise);
  v_tbj := internal.casino_v21_total(jsonb_build_array(v_t1, v_t2)) = 21;
  v_jbj := internal.casino_v21_total(jsonb_build_array(v_j1, v_j2)) = 21;
  if internal.casino_v21_valeur(v_t1) in (1, 10) then v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'regarde')); end if;
  if v_tbj then
    -- la main s'arrête aussitôt : on ne perd que sa mise
    v_issue := case when v_jbj then 'egal' else 'perdu' end;
    v_recu := case when v_jbj then p_mise else 0 end;
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'retourne', 'carte', v_t2),
      jsonb_build_object('t', 'bilan', 'main', 0, 'issue', v_issue, 'recu', v_recu, 'entree', true));
    v_main := v_main || jsonb_build_object('finie', true, 'issue', v_issue, 'recu', v_recu);
    v_phase := 'fini';
  elsif v_jbj then
    -- payé 3 pour 2
    v_recu := p_mise * 5 / 2;
    v_faits := v_faits || jsonb_build_array(jsonb_build_object('t', 'retourne', 'carte', v_t2),
      jsonb_build_object('t', 'bilan', 'main', 0, 'issue', 'vingt-et-un', 'recu', v_recu));
    v_main := v_main || jsonb_build_object('finie', true, 'issue', 'vingt-et-un', 'recu', v_recu);
    v_phase := 'fini';
  end if;
  return jsonb_build_object(
    'etat', jsonb_build_object('mise', p_mise, 'tavernier', jsonb_build_array(v_t1, v_t2), 'mains', jsonb_build_array(v_main),
      'separee', false, 'courante', 0, 'phase', v_phase, 'trois', v_trois),
    'faits', v_faits,
    'prises', 4
  );
end $$;

-- La donne d'avant, sans mise à côté.
create or replace function internal.casino_v21_distribuer(p_mise integer, p_pioche integer[]) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select internal.casino_v21_distribuer(p_mise, 0, p_pioche)
$$;

/* ---------- Ce que l'écran voit, ce que la partie note ---------- */

-- La main p_partie telle que l'écran la voit (TableDuVingtEtUn du contrat), avec les faits p_faits (nombres, pas encore
-- montrés) : jamais la carte cachée avant la fin, jamais une carte à venir. « trois » ne dit que des cartes déjà montrées.
create or replace function internal.casino_v21_table(p_partie bigint, p_faits jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_m internal.casino_mains;
  v_p internal.casino_parties;
  v_e jsonb;
  v_fini boolean;
  v_permis jsonb;
begin
  select * into v_m from internal.casino_mains m where m.partie = p_partie;
  select * into v_p from internal.casino_parties p where p.id = p_partie;
  if v_m.partie is null or v_p.id is null then return null; end if;
  v_e := v_m.etat;
  v_fini := v_e ->> 'phase' = 'fini';
  v_permis := internal.casino_v21_permis(v_e);
  return jsonb_build_object(
    'partie', v_p.id,
    'god', v_p.god,
    'mise', (v_e ->> 'mise')::integer,
    'misee', (select coalesce(sum((x ->> 'mise')::integer), 0) from jsonb_array_elements(v_e -> 'mains') x) + coalesce((v_e #>> '{trois,mise}')::integer, 0),
    'trois', v_e -> 'trois',
    'tavernier', (select coalesce(jsonb_agg(internal.casino_v21_carte(c::integer) order by n), '[]'::jsonb)
                  from jsonb_array_elements_text(v_e -> 'tavernier') with ordinality t (c, n) where v_fini or n = 1),
    'cachee', not v_fini,
    'mains', (select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'cartes', (select coalesce(jsonb_agg(internal.casino_v21_carte(c::integer) order by k), '[]'::jsonb) from jsonb_array_elements_text(x -> 'cartes') with ordinality y (c, k)),
                   'mise', (x ->> 'mise')::integer,
                   'doublee', (x ->> 'doublee')::boolean,
                   'finie', (x ->> 'finie')::boolean,
                   'issue', x -> 'issue',
                   'recu', (x ->> 'recu')::integer
                 ) order by n), '[]'::jsonb)
              from jsonb_array_elements(v_e -> 'mains') with ordinality h (x, n)),
    'courante', (v_e ->> 'courante')::integer,
    'separee', (v_e ->> 'separee')::boolean,
    'phase', v_e ->> 'phase',
    'tour', v_m.tour,
    'permis', v_permis,
    'complement', case when (v_permis ->> 'doubler')::boolean or (v_permis ->> 'separer')::boolean
                    then (v_e #>> array['mains', v_e ->> 'courante', 'mise'])::integer else 0 end,
    'rendu', case when v_fini
               then (select coalesce(sum((x ->> 'recu')::integer), 0) from jsonb_array_elements(v_e -> 'mains') x) + coalesce((v_e #>> '{trois,recu}')::integer, 0)
               else 0 end,
    'faits', internal.casino_v21_faits_montres(p_faits, v_fini),
    'commence_le', v_p.cree_le
  );
end $$;

-- Une main finie se ferme : la partie note ce qui a été misé et rendu, « Trois cartes » comprise, et ce qui revient va au
-- journal. Rien si elle dure.
create or replace function internal.casino_v21_conclure(p_partie bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m internal.casino_mains;
  v_rendu integer;
  v_misee integer;
  v_god boolean;
begin
  select * into v_m from internal.casino_mains m where m.partie = p_partie and m.ouverte;
  if not found or v_m.etat ->> 'phase' <> 'fini' then return; end if;
  select coalesce(sum((x ->> 'recu')::integer), 0), coalesce(sum((x ->> 'mise')::integer), 0) into v_rendu, v_misee
  from jsonb_array_elements(v_m.etat -> 'mains') x;
  v_rendu := v_rendu + coalesce((v_m.etat #>> '{trois,recu}')::integer, 0);
  v_misee := v_misee + coalesce((v_m.etat #>> '{trois,mise}')::integer, 0);
  update internal.casino_mains m set ouverte = false, maj_le = now() where m.partie = p_partie;
  update internal.casino_parties p
  set mise = v_misee, rendu = v_rendu, fini = true, fini_le = now(),
      resultat = jsonb_build_object('jeu', 'vingt-et-un', 'issues', (select jsonb_agg(x -> 'issue' order by n) from jsonb_array_elements(v_m.etat -> 'mains') with ordinality h (x, n)))
        || case when jsonb_typeof(v_m.etat -> 'trois') = 'object' then jsonb_build_object('trois', v_m.etat -> 'trois') else '{}'::jsonb end
  where p.id = p_partie
  returning p.god into v_god;
  perform internal.casino_rendre(v_m.user_id, p_partie, v_rendu, v_god);
end $$;

/* ---------- Les appels ---------- */

-- Une main commence avec la mise p_mise et p_trois statères sur « Trois cartes » (0 : sans) : ReponseDuVingtEtUn. Refus,
-- dans l'ordre : rate_limited, ceux de tout coup, pari_invalide (une mise qui n'est pas un multiple de 10 plus grand que
-- zéro, une mise à côté qui n'est pas 0 ou un multiple de 10), mise_trop_haute (les deux ensemble au-delà de 200),
-- main_en_cours, casino_plafond, solde_insuffisant. Une main finie à la donne arrive finie.
create or replace function internal.casino_v21_commencer(p_mise integer, p_trois integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_r jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_mise(p_mise);
    if p_trois is null or p_trois < 0 or p_trois % 10 <> 0 then perform internal.fail('pari_invalide'); end if;
    if p_trois > internal.casino_mise_au_plus() or v_mise + p_trois > internal.casino_mise_au_plus() then perform internal.fail('mise_trop_haute'); end if;
    if exists (select 1 from internal.casino_mains m where m.user_id = v_uid and m.ouverte) then perform internal.fail('main_en_cours'); end if;
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'vingt-et-un', v_god, v_mise + p_trois,
      jsonb_build_object('mise', v_mise) || case when p_trois > 0 then jsonb_build_object('trois', p_trois) else '{}'::jsonb end);
    v_r := internal.casino_v21_distribuer(v_mise, p_trois, internal.casino_pioche(4));
    insert into internal.casino_mains (partie, user_id, etat, faits) values (v_partie, v_uid, v_r -> 'etat', v_r -> 'faits');
    perform internal.casino_v21_conclure(v_partie);
    return internal.casino_v21_reponse(v_uid, v_partie, v_r -> 'faits');
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- L'appel d'avant, sans mise à côté : les écrans déjà ouverts continuent de jouer.
create or replace function public.distribuer_vingt_et_un(p_mise integer) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select internal.casino_v21_commencer(p_mise, 0)
$$;

-- La donne avec « Trois cartes ».
create or replace function public.distribuer_vingt_et_un(p_mise integer, p_trois integer) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select internal.casino_v21_commencer(p_mise, p_trois)
$$;

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.casino_v21_trois(integer, integer, integer)', 'internal.casino_v21_trois_fois(text)',
    'internal.casino_v21_distribuer(integer, integer, integer[])', 'internal.casino_v21_distribuer(integer, integer[])',
    'internal.casino_v21_table(bigint, jsonb)', 'internal.casino_v21_conclure(bigint)', 'internal.casino_v21_commencer(integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
  foreach v_f in array array['public.distribuer_vingt_et_un(integer)', 'public.distribuer_vingt_et_un(integer, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;
