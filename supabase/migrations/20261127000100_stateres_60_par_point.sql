-- Les statères des points rapportés au clan doublés : 60 par point au lieu de 30 (le pilote, 27 novembre 2026 : « double
-- la somme apportée lors des points sur OpenFront »), et novembre rattrapé (« et bien sûr rembourser ceux du mois de
-- novembre avec un message quand il entre dans mon gaulois avec + (montant stateres) avec explications », puis « si ils ont
-- gagné 6000 ils auront +6000 »). docs/direction/26-2-lot-2-le-statere.md, « La règle » et « Novembre doublé ».
--
-- 1. La règle. Remplace les deux fonctions posées par 20261113001800_village_stateres.sql, qui ne se modifie pas :
--    - internal.stateres_de_victoire : 60 statères par point rapporté au clan, à chaque Gaulois présent dans la partie
--      (« entiers à chacun »), arrondi à l'entier (une demie vers le haut), au moins 1 statère pour une partie qui rapporte
--      des points. La même que stateresDeVictoire (src/lib/stateres.ts) ; le banc PGlite les compare
--      (tests/unit/stateres-serveur.test.ts).
--    - internal.stateres_regle : « entier-60 », le nom gardé dans chaque nouveau crédit et rendu par get_mes_stateres.
--    Un crédit déjà donné garde son montant et sa règle « entier-30 » ; une présence déjà payée ne se paie plus, et le
--    journal refuse une même partie deux fois au même compte. Une présence payée après cette migration, même d'une partie
--    plus ancienne du mois (Gaulois créé ou compte validé après coup), l'est à 60.
--    Le journal est d'abord fermé aux écritures des autres (lock … in exclusive mode) : une relecture qui paierait encore à
--    30 pendant le collage attend la fin, puis paie à 60 ; aucun crédit à 30 n'arrive après le rattrapage.
--
-- 2. Novembre doublé. Chaque compte reçoit une seule fois, au journal des statères, nature 'points_doubles', ref
--    'novembre-2026', exactement la somme de ses crédits des points rapportés au clan (nature 'victoire') de novembre 2026,
--    à Paris, sous la règle « entier-30 » : 6 000 reçus, 6 000 de plus, sans recalcul ni arrondi. Rien pour la loterie, le
--    don, le trop-payé rendu ni rien d'autre. Ce sont des statères créés, à la demande du pilote, comme le trop-payé rendu
--    du 21 novembre 2026 : seulement une fois. internal.stateres_points_doubles garde, par compte, le montant, le nombre de
--    parties doublées, la ligne du journal qui le verse et l'heure où le membre a vu son message dans « Mon Gaulois »
--    (public.get_mes_points_doubles, public.voir_points_doubles) : le serveur sait s'il a été vu, le message ne revient pas.
--    internal.village_god_mouvement, reprise de 20261122002000_duel_tableau_et_saison.sql, compte 'points_doubles' parmi
--    les vrais gains : versé pendant un essai du mode GOD, il deviendrait sinon un mouvement d'essai, annulé au retour.
--
-- Les prix ne changent pas. Rien n'est effacé ni vidé. Recollée, elle ne verse rien une seconde fois : un compte déjà
-- rattrapé ne l'est plus (clé unique), et plus aucun crédit à 30 ne s'écrit. Les bornes du journal tiennent : moins de 1 000
-- points par partie, donc moins de 60 000 statères, sous le million.

lock table internal.stateres_mouvements in exclusive mode;

/* ---------- La règle : 60 par point ---------- */

create or replace function internal.stateres_de_victoire(p_points numeric, p_gaulois integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_points is null or p_points <= 0 or p_gaulois is null or p_gaulois < 1 then 0
    else greatest(1, round(p_points * 60))::integer
  end
$$;

create or replace function internal.stateres_regle() returns text
language sql immutable set search_path = public, pg_temp as $$ select 'entier-60'::text $$;

revoke all on function internal.stateres_de_victoire(numeric, integer) from public, anon, authenticated;
revoke all on function internal.stateres_regle() from public, anon, authenticated;

/* ---------- Le mode GOD ---------- */

create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue', 'coffre_rendu', 'prix_baisse_rendu', 'duel_gain', 'duel_rendu', 'duel_saison', 'points_doubles') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande', 'duel_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;
revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

/* ---------- Novembre doublé ---------- */

-- Un compte rattrapé : la somme versée (celle de ses crédits de novembre à 30), le nombre de parties doublées, la ligne du
-- journal qui la verse, l'heure du versement et celle où il a vu son message. Gardé jusqu'à l'effacement du compte.
create table if not exists internal.stateres_points_doubles (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  montant integer not null check (montant > 0),
  parties integer not null check (parties > 0),
  mouvement bigint not null unique,
  verse_le timestamptz not null default now(),
  vu_le timestamptz
);

alter table internal.stateres_points_doubles enable row level security;
revoke all on table internal.stateres_points_doubles from public, anon, authenticated;

do $$
declare
  u record;
  v_mouvement bigint;
begin
  for u in
    select m.user_id, sum(m.montant)::integer as total, count(*)::integer as parties
    from internal.stateres_mouvements m
    where m.nature = 'victoire'
      and m.regle = 'entier-30'
      and m.debut >= timestamptz '2026-11-01 00:00:00 Europe/Paris'
      and m.debut < timestamptz '2026-12-01 00:00:00 Europe/Paris'
      and not exists (select 1 from internal.stateres_points_doubles d where d.user_id = m.user_id)
    group by m.user_id
    having sum(m.montant) > 0
    order by m.user_id
  loop
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
    values (u.user_id, 'points_doubles', u.total, 'novembre-2026')
    returning id into v_mouvement;
    insert into internal.stateres_points_doubles (user_id, montant, parties, mouvement)
    values (u.user_id, u.total, u.parties, v_mouvement);
  end loop;
end $$;

/* ---------- Le message dans « Mon Gaulois » ---------- */

-- Le rattrapage du compte connecté : { ok: true, doubles: null } s'il n'en a pas reçu, sinon { ok: true, doubles: {
-- montant, parties, vu } }. Jamais celui d'un autre.
create or replace function public.get_mes_points_doubles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_d internal.stateres_points_doubles%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_d from internal.stateres_points_doubles d where d.user_id = v_uid;
  if not found then return jsonb_build_object('ok', true, 'doubles', null); end if;
  return jsonb_build_object('ok', true, 'doubles', jsonb_build_object('montant', v_d.montant, 'parties', v_d.parties, 'vu', v_d.vu_le is not null));
end $$;

-- Le membre a vu son message : il ne revient plus. Rien d'autre ne change ; rappelée, elle ne fait rien.
create or replace function public.voir_points_doubles() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update internal.stateres_points_doubles set vu_le = now() where user_id = v_uid and vu_le is null;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.get_mes_points_doubles() from public, anon, authenticated;
revoke all on function public.voir_points_doubles() from public, anon, authenticated;
grant execute on function public.get_mes_points_doubles() to authenticated;
grant execute on function public.voir_points_doubles() to authenticated;
