-- La pochette des bannières, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; dessins :
-- supabase/functions/code-discord/bannieres/, lots F à I et cadres-pochette.ts ; formes des réponses :
-- src/lib/village/contrat.ts).
--
-- Demande du pilote, 16 novembre 2026 : « 20 bannières différentes obtenables uniquement en pochette, encore plus stylées
-- que celles en boutique ». Dessins de Claude Fable 5.2 : « Les trésors de la pochette », 8 épiques, 8 mystiques et 4
-- légendaires, sous un cadre à elles.
--
-- Les règles :
-- - Une bannière de la pochette (internal.bannieres.pochette) ne sort que de la pochette des bannières : jamais à la
--   boutique (acheter_banniere la refuse : 'pochette_seulement'), jamais au marché (aucune bannière ne s'y vend).
-- - La pochette coûte 3 000 statères (le prix d'une bannière mystique de la boutique, au départ). Elle ne donne jamais une
--   bannière déjà possédée : à ce prix, un double serait une perte sèche, et une bannière ne se revend pas. Elle tire
--   d'abord une rareté selon ses chances (épique 60, mystique 30, légendaire 10 pour cent), parmi celles où le compte a
--   encore une bannière de la pochette à recevoir : une rareté épuisée est sautée et les autres se partagent ses chances à
--   proportion. Puis une bannière de cette rareté qu'il n'a pas, toutes à chances égales. Le hasard vient du générateur sûr
--   de Postgres (internal.village_hasard), jamais du navigateur. Qui les a toutes reçoit le refus 'tout_possede', sans rien
--   payer.
-- - Le prix et les chances sont écrits dans deux fonctions, sans réglage : l'encadrement ne les change pas depuis la
--   Direction, et les changer demande une nouvelle migration. Rien de nouveau n'est donc à sauvegarder : la liste vient
--   des migrations, les bannières de chaque compte sont déjà dans la sauvegarde (internal.gaulois_bannieres, version 8).
-- - Le débit est une ligne du journal des statères de nature 'pochette', `ref` : « banniere/<identifiant> » : l'onglet
--   Village de la Direction compte cette dépense avec les pochettes (son détail par rareté ne lit que les objets), et
--   l'annonce des achats sur Discord la lit comme une bannière sortie d'une pochette.
-- - Une bannière reçue se montre sur /gaulois comme une bannière achetée (choisir_banniere, inchangée).
--
-- Qui peut quoi :
-- - get_mes_bannieres (remplacée, depuis la 20261115000900, ligne pour ligne) : rend en plus `pochette`, son prix et ses
--   chances.
-- - acheter_banniere (remplacée, depuis la 20261115000900, ligne pour ligne) : refuse en plus une bannière de la pochette.
-- - ouvrir_pochette_bannieres : un compte validé qui a créé son Gaulois, sous le verrou du compte
--   (internal.village_verrou), comme les achats et les autres pochettes.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
-- Une colonne, vingt bannières et quatre fonctions ajoutées, deux fonctions remplacées, aucune donnée existante touchée
-- (les 40 bannières de la boutique gardent pochette = false). Rejouée, elle se remplace par la même.

alter table internal.bannieres add column if not exists pochette boolean not null default false;

-- <bannieres-pochette> : écrit depuis supabase/functions/code-discord/bannieres/ (lots F à I) ; ne pas modifier à la main.
insert into internal.bannieres (banniere, rarete, pochette) values
  ('matin-de-la-victoire', 'epique', true),
  ('armada-sans-fin', 'epique', true),
  ('grande-comete', 'epique', true),
  ('pluie-d-etoiles-filantes', 'epique', true),
  ('iles-suspendues', 'epique', true),
  ('serpent-de-mer', 'epique', true),
  ('tornade-sur-la-plaine', 'epique', true),
  ('mur-de-sable', 'epique', true),
  ('dernier-bastion', 'mystique', true),
  ('salle-de-guerre', 'mystique', true),
  ('geante-aux-anneaux', 'mystique', true),
  ('lune-de-cristal', 'mystique', true),
  ('cite-d-or-engloutie', 'mystique', true),
  ('arbre-monde', 'mystique', true),
  ('cathedrale-de-glace', 'mystique', true),
  ('chutes-de-lave', 'mystique', true),
  ('frappe-vue-de-l-orbite', 'legendaire', true),
  ('trou-noir', 'legendaire', true),
  ('phenix-de-braise', 'legendaire', true),
  ('arbre-de-foudre', 'legendaire', true)
on conflict (banniere) do update set rarete = excluded.rarete, pochette = excluded.pochette;
-- </bannieres-pochette>

-- Le prix de la pochette des bannières, en statères.
create or replace function internal.bannieres_pochette_prix() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 3000
$$;

revoke all on function internal.bannieres_pochette_prix() from public, anon, authenticated;

-- Les chances de la pochette des bannières, une ligne par rareté, de la plus courante à la plus rare : 100 en tout.
create or replace function internal.bannieres_pochette_chances() returns table (rarete text, rang integer, chance numeric)
language sql immutable set search_path = public, pg_temp as $$
  values
    ('commun', 1, 0::numeric),
    ('peu-commun', 2, 0::numeric),
    ('epique', 3, 60::numeric),
    ('mystique', 4, 30::numeric),
    ('legendaire', 5, 10::numeric)
$$;

revoke all on function internal.bannieres_pochette_chances() from public, anon, authenticated;

-- Les bannières de la pochette qu'un compte n'a pas encore.
create or replace function internal.bannieres_pochette_a_recevoir(p_user uuid) returns table (banniere text, rarete text)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.banniere, b.rarete
  from internal.bannieres b
  where b.pochette
    and not exists (select 1 from internal.gaulois_bannieres g where g.user_id = p_user and g.banniere = b.banniere)
$$;

revoke all on function internal.bannieres_pochette_a_recevoir(uuid) from public, anon, authenticated;

-- Les bannières du compte connecté : { ok: true, solde, peut_acheter, prix: { rareté: statères }, pochette: { prix,
-- chances: { rareté: pour cent } }, bannieres: [{ banniere, acquis_le }], porte }. `peut_acheter` : compte validé avec un
-- Gaulois créé (il vaut aussi pour la pochette). `porte` : la bannière montrée, ou null. Crédite d'abord ce qui lui revient
-- déjà, comme get_ma_boutique. Jamais le solde ni les bannières d'un autre.
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
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.bannieres_pochette_chances() c)
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

-- Achète une bannière de la boutique au prix de sa rareté : { ok: true, solde, banniere: { banniere, rarete } }.
-- `p_prix_vu` : le prix que le membre a vu ; s'il a changé entre-temps (réglage de l'encadrement), refus prix_change, rien
-- n'est débité. Refus, dans l'ordre : not_validated, no_gaulois, unknown_banniere (hors de la liste), pochette_seulement
-- (une bannière de la pochette ne s'achète pas), deja_possede, prix_change, solde_insuffisant ; et ceux de tout compte
-- (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.acheter_banniere(p_banniere text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_rarete text;
  v_pochette boolean;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    select b.rarete, b.pochette into v_rarete, v_pochette from internal.bannieres b where b.banniere = p_banniere;
    if not found then perform internal.fail('unknown_banniere'); end if;
    if v_pochette then perform internal.fail('pochette_seulement'); end if;
    v_prix := internal.banniere_prix(v_rarete);
    if v_prix is null or v_prix <= 0 then perform internal.fail('unknown_banniere'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.gaulois_bannieres g where g.user_id = v_uid and g.banniere = p_banniere) then
      perform internal.fail('deja_possede');
    end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, 'banniere/' || p_banniere);
    insert into internal.gaulois_bannieres (user_id, banniere) values (v_uid, p_banniere)
    on conflict (user_id, banniere) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'banniere', jsonb_build_object('banniere', p_banniere, 'rarete', v_rarete)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_banniere(text, integer) from public, anon, authenticated;
grant execute on function public.acheter_banniere(text, integer) to authenticated;

-- Ouvre une pochette des bannières : { ok: true, solde, banniere: { banniere, rarete }, reste }. `reste` : le nombre de
-- bannières de la pochette que le compte n'a pas encore, après celle-ci. `p_prix_vu` : le prix que le membre a vu ; s'il a
-- changé entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, prix_change, tout_possede (il
-- les a toutes), solde_insuffisant ; 'invalid_request' si aucune rareté qui lui reste n'a de chances ; et ceux de tout
-- compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_bannieres(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer := internal.bannieres_pochette_prix();
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
    -- La rareté : parmi celles qui ont des chances et une bannière qu'il n'a pas encore, selon leurs chances.
    select sum(c.chance) into v_total from internal.bannieres_pochette_chances() c
    where c.chance > 0 and exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid) a where a.rarete = c.rarete);
    if v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;
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
    -- La bannière : une de celles de cette rareté qu'il n'a pas encore, toutes à chances égales.
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
      'reste', (select count(*) from internal.bannieres_pochette_a_recevoir(v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_bannieres(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_bannieres(integer) to authenticated;
