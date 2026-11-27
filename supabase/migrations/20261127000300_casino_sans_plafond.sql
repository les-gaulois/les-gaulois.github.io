-- Le casino des Gaulois n'a plus de plafond du jour (docs/direction/43-le-casino-des-gaulois.md ; contrat :
-- PLAFOND_DU_JOUR_DU_CASINO de src/lib/village/contrat-casino.ts).
--
-- Décision du pilote, 27 novembre 2026 : « enleve la limite de statere au casino ». Les 50 000 statères misés au plus par
-- jour et par compte (migration 20261124000200) ne tiennent plus.
--
-- internal.casino_plafond() rend null : pas de plafond. internal.casino_miser ne refuse casino_plafond que s'il y a un
-- plafond ; get_casino rend `plafond` et `reste_du_jour` à null, et la réponse de chaque coup `reste_du_jour` à null, par la
-- nouvelle internal.casino_reste_du_jour. Remettre un plafond plus tard : une migration qui ne remplace que
-- internal.casino_plafond(), comme celles du 24 novembre 2026.
--
-- Le reste ne bouge pas : 200 au plus de mise de départ, jetons de 10 à 200, la bourse qui doit suffire, 30 actions par
-- minute, le mode GOD, `mise_du_jour` toujours compté. Aucune table, aucune donnée touchée, aucun statère créé. Rejouée,
-- elle se remplace par la même.

/* ---------- Les chiffres ---------- */

-- Les statères misés par jour et par compte, au plus : null, pas de plafond.
create or replace function internal.casino_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$ select null::integer $$;

-- Ce qu'il reste à miser aujourd'hui : null quand il n'y a pas de plafond.
create or replace function internal.casino_reste_du_jour(p_user uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when internal.casino_plafond() is null then null
              else greatest(0, internal.casino_plafond() - internal.casino_mise_du_jour(p_user)) end
$$;

/* ---------- La mise ---------- */

-- Prend p_montant statères pour la partie p_partie : refus casino_plafond si un plafond existe et que le compte du jour le
-- passerait, puis solde_insuffisant si la bourse ne suffit pas. Rien pendant un essai du mode GOD.
create or replace function internal.casino_miser(p_user uuid, p_partie bigint, p_montant integer, p_god boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_god then return; end if;
  if internal.casino_plafond() is not null
     and internal.casino_mise_du_jour(p_user) + p_montant > internal.casino_plafond() then
    perform internal.fail('casino_plafond');
  end if;
  perform internal.village_debiter(p_user, 'casino_mise', p_montant, 'casino/' || p_partie::text);
end $$;

/* ---------- Les réponses ---------- */

-- Ce que rend tout coup : la partie, la mise, ce qui revient, le solde après, le compte du jour.
create or replace function internal.casino_coup(p_user uuid, p_partie bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'partie', p.id,
    'jeu', p.jeu,
    'mise', p.mise,
    'rendu', p.rendu,
    'god', p.god,
    'solde_apres', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_user), 0),
    'mise_du_jour', internal.casino_mise_du_jour(p_user),
    'reste_du_jour', internal.casino_reste_du_jour(p_user)
  )
  from internal.casino_parties p
  where p.id = p_partie and p.user_id = p_user
$$;

-- La réponse d'un coup du vingt-et-un : la main avec ses faits nouveaux, le solde après et le compte du jour.
create or replace function internal.casino_v21_reponse(p_user uuid, p_partie bigint, p_faits jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'table', internal.casino_v21_table(p_partie, p_faits),
    'solde_apres', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_user), 0),
    'mise_du_jour', internal.casino_mise_du_jour(p_user),
    'reste_du_jour', internal.casino_reste_du_jour(p_user)
  )
$$;

/* ---------- L'écran entier ---------- */

-- Tout l'écran du casino du compte connecté : EtatDuCasino. Crédite d'abord ce qui lui revient déjà, comme
-- get_pochette_stateres. Jamais rien d'un autre compte. `plafond` et `reste_du_jour` à null : pas de plafond du jour.
create or replace function public.get_casino() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_peut boolean;
  v_detail text;
begin
  begin
    v_uid := internal.casino_lecteur();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  v_peut := exists (select 1 from public.profiles p where p.user_id = v_uid and p.status = 'validated')
    and exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_peut then perform internal.crediter_stateres(v_uid); end if;
  return jsonb_build_object(
    'ok', true,
    'ouvert', internal.casino_est_ouvert(),
    'peut_jouer', v_peut,
    'god', internal.casino_en_essai(v_uid),
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'jour', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'plafond', internal.casino_plafond(),
    'mise_au_plus', internal.casino_mise_au_plus(),
    'jetons', to_jsonb(internal.casino_jetons()),
    'mise_du_jour', internal.casino_mise_du_jour(v_uid),
    'reste_du_jour', internal.casino_reste_du_jour(v_uid),
    'parties', (select coalesce(jsonb_agg(jsonb_build_object(
                   'partie', p.id, 'jeu', p.jeu, 'mise', p.mise, 'rendu', p.rendu, 'god', p.god, 'le', p.fini_le,
                   'resume', p.resultat - 'par_pari' - 'cases' - 'chemin') order by p.id desc), '[]'::jsonb)
                from (select * from internal.casino_parties q where q.user_id = v_uid and q.fini order by q.id desc limit 10) p),
    'main', (select internal.casino_v21_table(m.partie, m.faits) from internal.casino_mains m where m.user_id = v_uid and m.ouverte)
  );
end $$;

/* ---------- Les droits ---------- */

revoke all on function internal.casino_plafond() from public, anon, authenticated;
revoke all on function internal.casino_reste_du_jour(uuid) from public, anon, authenticated;
revoke all on function internal.casino_miser(uuid, bigint, integer, boolean) from public, anon, authenticated;
revoke all on function internal.casino_coup(uuid, bigint) from public, anon, authenticated;
revoke all on function internal.casino_v21_reponse(uuid, bigint, jsonb) from public, anon, authenticated;
