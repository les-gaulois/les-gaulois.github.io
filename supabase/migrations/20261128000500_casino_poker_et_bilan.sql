-- Le poker du barde et « Mon bilan » du casino des Gaulois (docs/direction/43-le-casino-des-gaulois.md ; contrat :
-- src/lib/village/contrat-casino.ts ; règles : src/lib/village/casino/poker.ts).
--
-- Choix du pilote, 28 novembre 2026 : parmi les idées proposées pour le casino, « le bilan perso et le poker du barde » ;
-- maquette jouable validée (« Oui, construis »).
--
-- Le poker du barde : cinq cartes d'un paquet de 52 (nombre de 0 à 51 : rang n % 13, 0 l'as, enseigne n / 13), le joueur
-- garde celles qu'il veut, les autres sont remplacées une seule fois par des cartes du même paquet (les cartes jetées ne
-- reviennent pas), puis la main paie, mise comprise : valets ou mieux 1 fois, deux paires 2, brelan 3, quinte 4, couleur 6,
-- full 10, carré 25, quinte flush 50, quinte flush royale 250. Joué au mieux, il rend 99,5238 % de la mise, jamais plus
-- (calcul exact : rendementAuMieux de poker.ts, tests/unit/casino-poker.test.ts). Le serveur tire la donne et le tirage
-- avec internal.casino_entier ; la main ouverte attend son joueur (internal.casino_poker_mains), comme au vingt-et-un.
-- Rien qui puisse échouer ne vient après le tirage : les cartes gardées sont vérifiées avant.
--
-- Mon bilan : get_casino rend `bilan`, ce que le compte a misé et reçu depuis sa première partie, en tout et jeu par jeu,
-- essais du mode GOD exclus. À lui seul : jamais rien d'un autre compte, aucun classement.
--
-- Les gros gains du poker ne partent pas encore sur Discord : la file des annonces le laisse de côté, en attendant la règle
-- du pilote (une couleur à 200 de mise gagne déjà 1 000 statères).
--
-- Ce qui change dans les tables : internal.casino_parties accepte le jeu « poker » et un rendu jusqu'à 50 000 (250 fois 200 ;
-- 20 000 jusqu'ici, la machine à 100 fois) ; deux contraintes remplacées, aucune ligne touchée. Une table nouvelle,
-- internal.casino_poker_mains. Aucun statère créé : le jeu prend la mise et rend selon la table. Rejouée, elle ne change
-- rien.

/* ---------- Les tables ---------- */

alter table internal.casino_parties drop constraint if exists casino_parties_jeu_check;
alter table internal.casino_parties add constraint casino_parties_jeu_check
  check (jeu in ('roue', 'vingt-et-un', 'machine', 'course', 'palissade', 'des', 'poker'));
alter table internal.casino_parties drop constraint if exists casino_parties_rendu_check;
alter table internal.casino_parties add constraint casino_parties_rendu_check check (rendu >= 0 and rendu <= 50000);

-- Les mains du poker : la donne, puis, une fois jouée, les cartes gardées et la main finale. Une seule ouverte par compte.
create table if not exists internal.casino_poker_mains (
  partie bigint primary key references internal.casino_parties (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  donne integer[] not null check (cardinality(donne) = 5),
  gardes boolean[] check (gardes is null or cardinality(gardes) = 5),
  finale integer[] check (finale is null or cardinality(finale) = 5),
  ouverte boolean not null default true,
  maj_le timestamptz not null default now(),
  check (ouverte = (finale is null))
);
create unique index if not exists casino_poker_une_main_ouverte on internal.casino_poker_mains (user_id) where ouverte;

alter table internal.casino_poker_mains enable row level security;
revoke all on table internal.casino_poker_mains from public, anon, authenticated;

/* ---------- Les règles ---------- */

-- Ce que paie chaque sorte de main, mise comprise, de « rien » (index 1) à la quinte flush royale (index 10).
create or replace function internal.casino_poker_fois() returns integer[]
language sql immutable set search_path = public, pg_temp as $$ select array[0, 1, 2, 3, 4, 6, 10, 25, 50, 250] $$;

-- La sorte de cinq cartes, de 0 (rien) à 9 (quinte flush royale), comme sorteDuPoker de poker.ts.
create or replace function internal.casino_poker_sorte(p_main integer[]) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_n integer[] := array_fill(0, array[13]);
  v_c integer;
  v_r integer;
  v_couleur boolean := true;
  v_masque integer := 0;
  v_paires integer := 0;
  v_trois integer := 0;
  v_quatre integer := 0;
  v_haute boolean := false;
  v_quinte boolean := false;
  v_royale constant integer := 1 | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);
begin
  foreach v_c in array p_main loop
    v_n[v_c % 13 + 1] := v_n[v_c % 13 + 1] + 1;
    if v_c / 13 <> p_main[1] / 13 then v_couleur := false; end if;
  end loop;
  for v_r in 0..12 loop
    if v_n[v_r + 1] > 0 then v_masque := v_masque | (1 << v_r); end if;
    if v_n[v_r + 1] = 2 then
      v_paires := v_paires + 1;
      if v_r = 0 or v_r >= 10 then v_haute := true; end if;
    elsif v_n[v_r + 1] = 3 then v_trois := v_trois + 1;
    elsif v_n[v_r + 1] = 4 then v_quatre := v_quatre + 1;
    end if;
  end loop;
  if v_quatre > 0 then return 7; end if;
  if v_trois > 0 and v_paires > 0 then return 6; end if;
  if v_paires = 0 and v_trois = 0 then
    v_quinte := v_masque = v_royale or exists (select 1 from generate_series(0, 8) s where v_masque = (31 << s));
  end if;
  if v_quinte and v_couleur then return case when v_masque = v_royale then 9 else 8 end; end if;
  if v_couleur then return 5; end if;
  if v_quinte then return 4; end if;
  if v_trois > 0 then return 3; end if;
  if v_paires = 2 then return 2; end if;
  if v_paires = 1 and v_haute then return 1; end if;
  return 0;
end $$;

-- Cinq cartes différentes : chacune prise au hasard parmi celles qui restent, le paquet rangé de 0 à 51 (donneDuPoker).
create or replace function internal.casino_poker_donne() returns integer[]
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_paquet integer[] := array(select generate_series(0, 51));
  v_main integer[] := '{}';
  v_i integer;
begin
  for v_k in 1..5 loop
    v_i := internal.casino_entier(cardinality(v_paquet)) + 1;
    v_main := v_main || v_paquet[v_i];
    v_paquet := v_paquet[1:v_i - 1] || v_paquet[v_i + 1:];
  end loop;
  return v_main;
end $$;

-- Les cartes non gardées remplacées, dans l'ordre de la main, par des cartes du paquet qui n'étaient pas dans la donne
-- (tirageDuPoker).
create or replace function internal.casino_poker_tirage(p_donne integer[], p_gardes boolean[]) returns integer[]
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_paquet integer[] := array(select n from generate_series(0, 51) n where not (n = any (p_donne)) order by n);
  v_main integer[] := '{}';
  v_i integer;
begin
  for v_k in 1..5 loop
    if p_gardes[v_k] then
      v_main := v_main || p_donne[v_k];
    else
      v_i := internal.casino_entier(cardinality(v_paquet)) + 1;
      v_main := v_main || v_paquet[v_i];
      v_paquet := v_paquet[1:v_i - 1] || v_paquet[v_i + 1:];
    end if;
  end loop;
  return v_main;
end $$;

-- Des cartes en JSON, comme l'écran les lit : [{ r, e }, …].
create or replace function internal.casino_poker_cartes(p_main integer[]) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('r', c % 13, 'e', c / 13) order by n), '[]'::jsonb)
  from unnest(p_main) with ordinality t (c, n)
$$;

-- Les cartes gardées reçues de l'écran : un tableau JSON de cinq vrais ou faux, sinon coup_refuse.
create or replace function internal.casino_poker_gardes(p_gardes jsonb) returns boolean[]
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_gardes is null or jsonb_typeof(p_gardes) <> 'array' or jsonb_array_length(p_gardes) <> 5
     or exists (select 1 from jsonb_array_elements(p_gardes) g where jsonb_typeof(g) <> 'boolean') then
    perform internal.fail('coup_refuse');
  end if;
  return array(select (g #>> '{}')::boolean from jsonb_array_elements(p_gardes) with ordinality t (g, n) order by n);
end $$;

-- La main ouverte d'un compte, à reprendre (MainDuPoker), ou null.
create or replace function internal.casino_poker_ouverte(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('partie', m.partie, 'mise', p.mise, 'god', p.god, 'main', internal.casino_poker_cartes(m.donne))
  from internal.casino_poker_mains m
  join internal.casino_parties p on p.id = m.partie
  where m.user_id = p_user and m.ouverte
$$;

/* ---------- Le poker : les appels ---------- */

-- Une main commence avec la mise p_mise : DonneDuPoker. Refus, dans l'ordre : ceux de tout coup, pari_invalide,
-- mise_trop_haute, main_en_cours, casino_plafond (s'il y en a un), solde_insuffisant.
create or replace function public.distribuer_poker(p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_god boolean;
  v_mise integer;
  v_partie bigint;
  v_donne integer[];
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_commencer();
    v_mise := internal.casino_mise(p_mise);
    if exists (select 1 from internal.casino_poker_mains m where m.user_id = v_uid and m.ouverte) then perform internal.fail('main_en_cours'); end if;
    v_god := internal.casino_en_essai(v_uid);
    v_partie := internal.casino_nouvelle_partie(v_uid, 'poker', v_god, v_mise, jsonb_build_object('mise', v_mise));
    v_donne := internal.casino_poker_donne();
    insert into internal.casino_poker_mains (partie, user_id, donne) values (v_partie, v_uid, v_donne);
    return internal.casino_coup(v_uid, v_partie) || jsonb_build_object('main', internal.casino_poker_cartes(v_donne));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les cartes gardées p_gardes sur la main ouverte p_partie : CoupDuPoker. Refus, dans l'ordre : rate_limited, ceux du
-- compte, pas_de_main, coup_refuse, mode_god. Le casino fermé n'empêche pas de finir une main.
create or replace function public.jouer_poker(p_partie bigint, p_gardes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_m internal.casino_poker_mains;
  v_gardes boolean[];
  v_god boolean;
  v_mise integer;
  v_finale integer[];
  v_sorte integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.casino_joueur();
    select * into v_m from internal.casino_poker_mains m where m.partie = p_partie and m.user_id = v_uid and m.ouverte for update;
    if not found then perform internal.fail('pas_de_main'); end if;
    v_gardes := internal.casino_poker_gardes(p_gardes);
    select p.god, p.mise into v_god, v_mise from internal.casino_parties p where p.id = p_partie;
    -- Une vraie main attend la fin d'un essai : son gain, pendant l'essai, deviendrait une ligne d'essai annulée.
    if not v_god and internal.casino_en_essai(v_uid) then perform internal.fail('mode_god'); end if;
    -- Le tirage, puis plus rien qui puisse échouer.
    v_finale := internal.casino_poker_tirage(v_m.donne, v_gardes);
    v_sorte := internal.casino_poker_sorte(v_finale);
    update internal.casino_poker_mains m set gardes = v_gardes, finale = v_finale, ouverte = false, maj_le = now()
    where m.partie = p_partie;
    return internal.casino_finir(v_uid, p_partie, v_mise * (internal.casino_poker_fois())[v_sorte + 1],
      jsonb_build_object('jeu', 'poker', 'sorte', v_sorte, 'main', internal.casino_poker_cartes(v_finale), 'gardes', to_jsonb(v_gardes)));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Mon bilan ---------- */

-- Ce que le compte a misé et reçu depuis sa première partie, en tout et jeu par jeu (BilanDuCasino), essais exclus.
create or replace function internal.casino_bilan(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (
    select q.jeu, q.mise, q.rendu, q.cree_le from internal.casino_parties q where q.user_id = p_user and q.fini and not q.god
  )
  select jsonb_build_object(
    'depuis', (select min(p.cree_le) from p),
    'parties', (select count(*) from p),
    'mise', (select coalesce(sum(p.mise), 0) from p),
    'rendu', (select coalesce(sum(p.rendu), 0) from p),
    'jeux', (select coalesce(jsonb_agg(jsonb_build_object('jeu', j.jeu, 'parties', j.n, 'mise', j.mise, 'rendu', j.rendu) order by j.jeu), '[]'::jsonb)
             from (select p.jeu, count(*) as n, sum(p.mise) as mise, sum(p.rendu) as rendu from p group by p.jeu) j)
  )
$$;

/* ---------- L'écran entier ---------- */

-- Tout l'écran du casino du compte connecté : EtatDuCasino, avec la main du poker à reprendre et le bilan. Crédite d'abord
-- ce qui lui revient déjà. Jamais rien d'un autre compte. `plafond` et `reste_du_jour` à null : pas de plafond du jour.
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
                   'resume', p.resultat - 'par_pari' - 'cases' - 'chemin' - 'main' - 'gardes') order by p.id desc), '[]'::jsonb)
                from (select * from internal.casino_parties q where q.user_id = v_uid and q.fini order by q.id desc limit 10) p),
    'main', (select internal.casino_v21_table(m.partie, m.faits) from internal.casino_mains m where m.user_id = v_uid and m.ouverte),
    'poker', internal.casino_poker_ouverte(v_uid),
    'bilan', internal.casino_bilan(v_uid)
  );
end $$;

/* ---------- Les annonces sur Discord ---------- */

-- Les gros gains à annoncer, comme le 26 novembre 2026, le poker laissé de côté en attendant la règle du pilote.
create or replace function public.casino_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'seuil', internal.casino_annonce_seuil(), 'annonces', coalesce((
    select jsonb_agg(jsonb_build_object(
        'partie', c.id,
        'le', c.fini_le,
        'jeu', c.jeu,
        'mise', c.mise,
        'rendu', c.rendu,
        'paris', c.paris,
        'resultat', c.resultat,
        'nom', coalesce(internal.member_pseudo(c.user_id), 'Gaulois n° ' || pr.gaul_number),
        'discord', nullif(btrim(pl.discord_name), ''))
      order by c.id)
    from (
      select p.id, p.user_id, p.fini_le, p.jeu, p.mise, p.rendu, p.paris, p.resultat
      from internal.casino_parties p
      where p.id > coalesce((select d.partie from internal.casino_annonces_depart d where d.id), 9223372036854775807)
        and p.fini
        and not p.god
        and p.jeu not in ('vingt-et-un', 'poker')
        and p.rendu - p.mise >= internal.casino_annonce_seuil()
        and p.fini_le > now() - interval '48 hours'
        and not exists (select 1 from internal.casino_annonces a where a.partie = p.id)
        and exists (select 1 from public.profiles v where v.user_id = p.user_id and v.status = 'validated')
      order by p.id
      limit 20
    ) c
    join public.profiles pr on pr.user_id = c.user_id
    left join public.private_links pl on pl.user_id = c.user_id), '[]'::jsonb))
$$;

/* ---------- Les droits ---------- */

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'internal.casino_poker_fois()', 'internal.casino_poker_sorte(integer[])', 'internal.casino_poker_donne()',
    'internal.casino_poker_tirage(integer[], boolean[])', 'internal.casino_poker_cartes(integer[])',
    'internal.casino_poker_gardes(jsonb)', 'internal.casino_poker_ouverte(uuid)', 'internal.casino_bilan(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
  end loop;
  foreach v_f in array array['public.get_casino()', 'public.distribuer_poker(integer)', 'public.jouer_poker(bigint, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;
