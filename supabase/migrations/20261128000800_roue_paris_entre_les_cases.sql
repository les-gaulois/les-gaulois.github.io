-- La roue du charron : les paris entre les cases (28 novembre 2026, maquette validée par le pilote : « construit le »).
--
-- Aux 48 paris de la table s'ajoutent les 102 paris posés entre les cases du tapis :
--   - à cheval sur deux numéros voisins du tapis : h1 à h33 (le n et le n + 3) et v<n> (le n et le n + 1, n jamais
--     multiple de 3) : 18 fois la mise ;
--   - le carré de quatre, q<n> (n, n + 1, n + 3, n + 4, n jamais multiple de 3, jusqu'à 32) : 9 fois ;
--   - le trio, r1 à r12 (les trois numéros d'une colonne du tapis, du 3c - 2 au 3c) : 12 fois ;
--   - le six, s1 à s11 (deux colonnes voisines, du 3c - 2 au 3c + 3) : 6 fois.
-- Mise comprise. Sur 36 cases sans zéro, les numéros couverts multipliés par le paiement font toujours 36 : chaque pari
-- rend en moyenne exactement sa mise, comme ceux d'avant. Les règles du site (src/lib/village/casino/roue.ts) disent la
-- même chose ; tests/unit/casino-serveur.test.ts les compare au SQL, pari par pari, sur les 36 numéros.
--
-- Ne remplace que les trois règles de la roue (la liste des paris, leur paiement, les numéros qui les font gagner) ; le
-- tour (public.jouer_roue), la mise prise, le rendu et le journal ne changent pas. N'efface rien, ne touche aucune ligne,
-- ne crée aucun statère.

-- Les 150 paris de la table, dans l'ordre du contrat (PARIS_DE_LA_ROUE de src/lib/village/contrat-casino.ts).
create or replace function internal.casino_roue_paris() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array(select 'n' || n from generate_series(1, 36) n)
    || array['rouge', 'bleu', 'pair', 'impair', 'bas', 'haut', 't1', 't2', 't3', 'c1', 'c2', 'c3']
    || array(select 'h' || n from generate_series(1, 33) n)
    || array(select 'v' || n from generate_series(1, 35) n where n % 3 <> 0)
    || array(select 'q' || n from generate_series(1, 32) n where n % 3 <> 0)
    || array(select 'r' || c from generate_series(1, 12) c)
    || array(select 's' || c from generate_series(1, 11) c)
$$;

-- Ce que rend un pari gagnant, mise comprise, en fois la mise.
create or replace function internal.casino_roue_fois(p_pari text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_pari ~ '^n[0-9]+$' then 36
    when p_pari in ('rouge', 'bleu', 'pair', 'impair', 'bas', 'haut') then 2
    when p_pari in ('t1', 't2', 't3', 'c1', 'c2', 'c3') then 3
    when p_pari ~ '^[hv][0-9]+$' then 18
    when p_pari ~ '^q[0-9]+$' then 9
    when p_pari ~ '^r[0-9]+$' then 12
    when p_pari ~ '^s[0-9]+$' then 6
    else 0
  end
$$;

-- Le numéro p_n fait-il gagner le pari ? Un pari hors de la table ne gagne jamais (et casino_paris le refuse avant).
create or replace function internal.casino_roue_gagne(p_pari text, p_n integer) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_pari ~ '^n([1-9]|[12][0-9]|3[0-6])$' then substr(p_pari, 2)::integer = p_n
    when p_pari = 'rouge' then p_n = any (internal.casino_roue_rouges())
    when p_pari = 'bleu' then not (p_n = any (internal.casino_roue_rouges()))
    when p_pari = 'pair' then p_n % 2 = 0
    when p_pari = 'impair' then p_n % 2 = 1
    when p_pari = 'bas' then p_n <= 18
    when p_pari = 'haut' then p_n >= 19
    when p_pari = 't1' then p_n <= 12
    when p_pari = 't2' then p_n between 13 and 24
    when p_pari = 't3' then p_n >= 25
    when p_pari = 'c1' then p_n % 3 = 1
    when p_pari = 'c2' then p_n % 3 = 2
    when p_pari = 'c3' then p_n % 3 = 0
    when p_pari ~ '^h([1-9]|[12][0-9]|3[0-3])$' then p_n in (substr(p_pari, 2)::integer, substr(p_pari, 2)::integer + 3)
    when p_pari ~ '^v([1-9]|[12][0-9]|3[0-5])$' then
      case when substr(p_pari, 2)::integer % 3 <> 0 then p_n in (substr(p_pari, 2)::integer, substr(p_pari, 2)::integer + 1) else false end
    when p_pari ~ '^q([1-9]|[12][0-9]|3[0-2])$' then
      case when substr(p_pari, 2)::integer % 3 <> 0
        then p_n in (substr(p_pari, 2)::integer, substr(p_pari, 2)::integer + 1, substr(p_pari, 2)::integer + 3, substr(p_pari, 2)::integer + 4)
        else false end
    when p_pari ~ '^r([1-9]|1[0-2])$' then (p_n + 2) / 3 = substr(p_pari, 2)::integer
    when p_pari ~ '^s([1-9]|1[01])$' then (p_n + 2) / 3 in (substr(p_pari, 2)::integer, substr(p_pari, 2)::integer + 1)
    else false
  end
$$;

-- Les règles restent fermées aux visiteurs et aux membres : seul public.jouer_roue s'en sert.
revoke all on function internal.casino_roue_paris() from public, anon, authenticated;
revoke all on function internal.casino_roue_fois(text) from public, anon, authenticated;
revoke all on function internal.casino_roue_gagne(text, integer) from public, anon, authenticated;
