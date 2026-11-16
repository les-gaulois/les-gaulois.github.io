-- La pochette de statères, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; formes des réponses :
-- src/lib/village/contrat.ts ; calculs de l'écran : src/lib/village/pochette-stateres.ts).
--
-- Demande du pilote, 16 novembre 2026 : « des pochettes de statères (un casino) », avec « des probabilités justes ». Il a
-- choisi la première de quatre idées : une pochette à 200 statères qui rend, en moyenne, exactement 200 statères.
--
-- Les règles :
-- - La pochette coûte 200 statères et rend un des six lots de internal.stateres_pochette_lots(), tiré selon sa chance par
--   le générateur sûr de Postgres (internal.village_hasard), jamais par le navigateur :
--     55 %  60 · 28 %  160 · 11 %  350 · 4,5 %  700 · 1,3 %  2 000 · 0,2 %  13 100.
--   Les chances font 100 ; la somme des chances fois les gains vaut 200,00 : le jeu ne crée ni ne détruit de statères en
--   moyenne. tests/unit/pochette-stateres.test.ts vérifie que ces lignes sont celles du contrat.
-- - Un compte en ouvre dix par jour au plus, le jour allant de minuit à minuit à l'heure de Paris : au-delà, refus
--   'plafond_du_jour', rien n'est débité. Le compte du jour se lit dans le journal : aucune table nouvelle.
-- - Le prix, les lots et le plafond sont écrits dans trois fonctions, sans réglage : l'encadrement ne les change pas depuis
--   la Direction, et les changer demande une nouvelle migration. Rien de nouveau n'est à sauvegarder : le journal des
--   statères est déjà dans la sauvegarde.
-- - Chaque ouverture écrit deux lignes au journal des statères, sous le verrou du compte : le prix, de nature
--   'pochette_stateres' (`ref` : « lot/<rang> »), puis le gain, de nature 'pochette_stateres_gain' (même `ref`). Ces
--   natures sont à elles : l'onglet Village de la Direction ne les compte pas dans les dépenses à la boutique, et l'annonce
--   des achats sur Discord (natures 'achat', 'pochette', 'marche_achat') ne les lit pas.
-- - Le solde ne peut pas passer sous zéro : le prix est débité avant que le gain soit crédité.
--
-- Qui peut quoi :
-- - get_pochette_stateres : tout compte connecté lit la pochette et son propre compte du jour ; jamais ceux d'un autre.
-- - ouvrir_pochette_stateres : un compte validé qui a créé son Gaulois (internal.village_acheteur), comme les achats et
--   les autres pochettes.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des jeux de joueurs. Six fonctions ajoutées, aucune table, aucune
-- donnée existante touchée. Rejouée, elle se remplace par la même.

-- Le prix de la pochette de statères, en statères.
create or replace function internal.stateres_pochette_prix() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 200
$$;

revoke all on function internal.stateres_pochette_prix() from public, anon, authenticated;

-- Le nombre de pochettes de statères qu'un compte ouvre par jour, au plus.
create or replace function internal.stateres_pochette_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 10
$$;

revoke all on function internal.stateres_pochette_plafond() from public, anon, authenticated;

-- Les lots de la pochette de statères, du plus courant au plus rare : la chance en pour cent (100 en tout), le gain en
-- statères. La somme des chances fois les gains vaut le prix.
create or replace function internal.stateres_pochette_lots() returns table (rang integer, chance numeric, gain integer)
language sql immutable set search_path = public, pg_temp as $$
  values
    (1, 55::numeric, 60),
    (2, 28::numeric, 160),
    (3, 11::numeric, 350),
    (4, 4.5::numeric, 700),
    (5, 1.3::numeric, 2000),
    (6, 0.2::numeric, 13100)
$$;

revoke all on function internal.stateres_pochette_lots() from public, anon, authenticated;

-- Les pochettes de statères qu'un compte a ouvertes aujourd'hui, le jour commençant à minuit à l'heure de Paris.
create or replace function internal.stateres_pochette_ouvertes(p_user uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from internal.stateres_mouvements m
  where m.user_id = p_user
    and m.nature = 'pochette_stateres'
    and m.cree_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

revoke all on function internal.stateres_pochette_ouvertes(uuid) from public, anon, authenticated;

-- La pochette de statères du compte connecté : { ok: true, solde, peut_ouvrir, prix, plafond, ouvertes, lots: [{ rang,
-- chance, gain }] }. `peut_ouvrir` : compte validé avec un Gaulois créé. `ouvertes` : ses ouvertures d'aujourd'hui. Crédite
-- d'abord ce qui lui revient déjà, comme get_ma_boutique. Jamais le solde ni le compte du jour d'un autre.
create or replace function public.get_pochette_stateres() returns jsonb
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
    'peut_ouvrir', v_status = 'validated' and v_gaulois,
    'prix', internal.stateres_pochette_prix(),
    'plafond', internal.stateres_pochette_plafond(),
    'ouvertes', internal.stateres_pochette_ouvertes(v_uid),
    'lots', (select jsonb_agg(jsonb_build_object('rang', l.rang, 'chance', trim_scale(l.chance), 'gain', l.gain) order by l.rang) from internal.stateres_pochette_lots() l)
  );
end $$;

revoke all on function public.get_pochette_stateres() from public, anon, authenticated;
grant execute on function public.get_pochette_stateres() to authenticated;

-- Ouvre une pochette de statères : { ok: true, solde, lot: { rang, gain }, ouvertes }. `solde` : après le prix payé et le
-- gain reçu. `ouvertes` : les ouvertures d'aujourd'hui, celle-ci comprise. `p_prix_vu` : le prix que le membre a vu ; s'il
-- a changé entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, prix_change, plafond_du_jour,
-- solde_insuffisant ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_stateres(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer := internal.stateres_pochette_prix();
  v_tirage double precision;
  v_cumul numeric := 0;
  v_r record;
  v_rang integer;
  v_gain integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if internal.stateres_pochette_ouvertes(v_uid) >= internal.stateres_pochette_plafond() then perform internal.fail('plafond_du_jour'); end if;
    -- Le lot : un nombre de 0 compris à 100 non compris, et les lots à la suite, chacun sur une longueur égale à sa chance.
    v_tirage := internal.village_hasard() * 100;
    for v_r in select l.rang, l.chance, l.gain from internal.stateres_pochette_lots() l order by l.rang loop
      v_cumul := v_cumul + v_r.chance;
      v_rang := v_r.rang;
      v_gain := v_r.gain;
      exit when v_tirage < v_cumul;
    end loop;
    if v_rang is null or v_gain is null or v_gain <= 0 then perform internal.fail('invalid_request'); end if;
    -- Le prix d'abord (refus solde_insuffisant s'il manque), puis le gain.
    perform internal.village_debiter(v_uid, 'pochette_stateres', v_prix, 'lot/' || v_rang::text);
    insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'pochette_stateres_gain', v_gain, 'lot/' || v_rang::text);
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'lot', jsonb_build_object('rang', v_rang, 'gain', v_gain),
      'ouvertes', internal.stateres_pochette_ouvertes(v_uid)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_stateres(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_stateres(integer) to authenticated;
