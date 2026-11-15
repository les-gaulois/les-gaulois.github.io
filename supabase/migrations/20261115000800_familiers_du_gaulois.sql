-- Les familiers du Gaulois, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; dessins :
-- supabase/functions/code-discord/familiers/ ; formes des réponses : src/lib/village/contrat.ts).
--
-- Demande du pilote, 15 novembre 2026 : « des pets pour les gaulois obtenables uniquement en pochettes prix min 2000 ». Il a
-- choisi les 100 familiers dessinés par Claude Fable 5.2 (« j'aime tout »). Un familier est un animal ou une créature qui se
-- tient à côté du Gaulois, sur le site et sur l'image de /gaulois.
--
-- Les règles :
-- - Un familier ne s'obtient que dans la pochette des familiers : jamais à la boutique, jamais au marché. Elle coûte 2 000
--   statères ; son prix ne peut pas descendre en dessous (règle de la table).
-- - La pochette ne donne jamais un familier déjà possédé (choix du chef de chantier : à 2 000 statères, un double serait une
--   perte sèche, et un familier ne se revend pas). Elle tire d'abord une rareté selon ses chances (au départ 45, 28, 15, 8 et
--   4 pour cent), parmi celles où le compte a encore un familier à recevoir : une rareté épuisée est sautée et les autres se
--   partagent ses chances à proportion. Puis un familier de cette rareté que le compte n'a pas, tous à chances égales. Le
--   hasard vient du générateur sûr de Postgres (internal.village_hasard), jamais du navigateur. Qui les a tous reçoit le
--   refus 'tout_possede', sans rien payer.
-- - Le débit est une ligne du journal des statères de nature 'pochette', `ref` : « familier/<identifiant> » : l'onglet Village
--   de la Direction compte cette dépense avec les pochettes (son détail par rareté ne lit que les objets), et l'annonce des
--   achats sur Discord la lit comme les autres pochettes.
-- - Le compte montre un seul familier à la fois, ou aucun : internal.gaulois.familier. Une contrainte de la table garantit
--   que c'est un familier qu'il possède.
--
-- Ce qui est gardé :
-- - internal.familiers : la liste des familiers et leur rareté, celle des dessins (un test garde les deux identiques).
-- - internal.familiers_pochette : le prix de la pochette des familiers et ses chances par rareté, sur une seule ligne. Un
--   réglage se change, il ne s'efface pas (internal.village_reglage_garde). Rejouée, la migration ne le remet pas à sa valeur
--   de départ.
-- - internal.gaulois_familiers : les familiers de chaque compte, et quand il les a reçus. S'efface avec le compte.
-- - internal.gaulois.familier : le familier montré à côté du Gaulois, ou null.
--
-- Qui peut quoi :
-- - get_mes_familiers : un compte connecté, non suspendu ; son solde, ses familiers, celui qu'il montre, la pochette.
-- - ouvrir_pochette_familiers, choisir_familier : un compte validé qui a créé son Gaulois. Ils prennent le verrou du compte
--   (internal.village_verrou), comme les achats et la tenue.
-- - discord_gaulois (remplacée, depuis la 20261114000500) : rend en plus le familier montré, pour l'image de /gaulois.
--   Toujours la clé de service seulement.
-- - export_site (remplacée, depuis la 20261113002400) : la sauvegarde chiffrée garde en plus les familiers de chaque compte
--   et le réglage de leur pochette (version 7). Le familier montré y est déjà, avec la ligne du Gaulois.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
--
-- Trois tables, une colonne et cinq fonctions ajoutées, deux fonctions remplacées, aucune donnée existante touchée. Rejouée,
-- elle se remplace par la même.

create table if not exists internal.familiers (
  familier text primary key check (familier ~ '^[a-z][a-z-]{0,39}$'),
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
);

insert into internal.familiers (familier, rarete) values
  ('souris-des-greniers', 'commun'),
  ('poussin-jaune', 'commun'),
  ('escargot-du-potager', 'commun'),
  ('poule-rousse', 'commun'),
  ('lapin-de-garenne', 'commun'),
  ('chat-tigre', 'commun'),
  ('canard-colvert', 'peu-commun'),
  ('oie-blanche', 'peu-commun'),
  ('agneau-laineux', 'peu-commun'),
  ('chien-de-berger', 'peu-commun'),
  ('cochon-rose', 'peu-commun'),
  ('chevre-a-la-clochette', 'epique'),
  ('ane-gris', 'epique'),
  ('molosse-au-collier-de-bronze', 'epique'),
  ('vache-tachetee', 'epique'),
  ('chat-noir-aux-yeux-d-or', 'mystique'),
  ('cheval-de-trait', 'mystique'),
  ('taureau-noir-aux-cornes-de-bronze', 'mystique'),
  ('coq-aux-plumes-d-or', 'legendaire'),
  ('belier-aux-cornes-d-or', 'legendaire'),
  ('loir-gourmand', 'commun'),
  ('herisson-des-haies', 'commun'),
  ('taupe-des-pres', 'commun'),
  ('ecureuil-roux', 'commun'),
  ('lievre-brun', 'commun'),
  ('hermine-blanche', 'epique'),
  ('martre-des-pins', 'peu-commun'),
  ('renardeau-roux', 'peu-commun'),
  ('blaireau', 'commun'),
  ('castor-batisseur', 'peu-commun'),
  ('lynx-des-forets', 'epique'),
  ('faon-tachete', 'peu-commun'),
  ('sanglier-des-chenaies', 'peu-commun'),
  ('loup-gris', 'epique'),
  ('renard-argente', 'mystique'),
  ('biche-blanche', 'mystique'),
  ('loup-blanc', 'legendaire'),
  ('ours-brun-dresse', 'mystique'),
  ('cerf-aux-bois-d-or', 'legendaire'),
  ('bison-des-forets', 'epique'),
  ('papillon-citron', 'commun'),
  ('grenouille-verte', 'commun'),
  ('martin-pecheur', 'peu-commun'),
  ('escargot-des-vignes', 'commun'),
  ('tortue-des-mares', 'commun'),
  ('corbeau-freux', 'commun'),
  ('chouette-effraie', 'peu-commun'),
  ('mouette-rieuse', 'commun'),
  ('pie-bavarde', 'peu-commun'),
  ('loutre-de-riviere', 'peu-commun'),
  ('salamandre-tachetee', 'epique'),
  ('faucon-chaperonne', 'epique'),
  ('heron-cendre', 'peu-commun'),
  ('cigogne-blanche', 'epique'),
  ('cygne-blanc', 'epique'),
  ('grand-duc', 'mystique'),
  ('carpe-doree', 'legendaire'),
  ('cygne-noir', 'mystique'),
  ('paon-bleu', 'mystique'),
  ('paon-blanc-en-roue', 'legendaire'),
  ('crapaud-couronne', 'commun'),
  ('lievre-cornu', 'commun'),
  ('feu-follet', 'commun'),
  ('salamandre-de-feu', 'commun'),
  ('souche-vive', 'commun'),
  ('golem-moussu', 'commun'),
  ('chat-aile', 'peu-commun'),
  ('serpent-cornu', 'peu-commun'),
  ('gargouille', 'peu-commun'),
  ('dragonnet-vert', 'peu-commun'),
  ('cheval-des-mers', 'peu-commun'),
  ('dragon-rouge', 'epique'),
  ('loup-de-brume', 'epique'),
  ('griffon', 'epique'),
  ('vouivre', 'epique'),
  ('hibou-de-cristal', 'mystique'),
  ('licorne', 'mystique'),
  ('tortue-ile', 'mystique'),
  ('phenix', 'legendaire'),
  ('cerf-blanc', 'legendaire'),
  ('canard-de-bain', 'commun'),
  ('escargot-cuirasse', 'commun'),
  ('rat-de-tranchee', 'commun'),
  ('pigeon-voyageur', 'commun'),
  ('miche-qui-marche', 'commun'),
  ('chat-dans-un-carton', 'commun'),
  ('poulet-en-armure', 'peu-commun'),
  ('chien-de-chantier', 'peu-commun'),
  ('meule-de-fromage', 'peu-commun'),
  ('mouette-aux-frites', 'peu-commun'),
  ('chevre-au-tambour', 'peu-commun'),
  ('herisson-de-fer', 'epique'),
  ('marmite-a-pattes', 'epique'),
  ('bouclier-qui-marche', 'epique'),
  ('tortue-char', 'epique'),
  ('coq-tricolore', 'mystique'),
  ('catapulte-vivante', 'mystique'),
  ('automate-a-vapeur', 'mystique'),
  ('cochon-tirelire', 'legendaire'),
  ('canard-dore-couronne', 'legendaire')
on conflict (familier) do nothing;

-- Une seule ligne. Le prix ne descend jamais sous 2 000 statères (demande du pilote). Chaque chance va de 0 à 100 pour cent,
-- avec deux décimales au plus ; ensemble, elles font 100.
create table if not exists internal.familiers_pochette (
  id boolean primary key default true check (id),
  prix integer not null check (prix between 2000 and 1000000),
  commun numeric(5, 2) not null check (commun between 0 and 100),
  peu_commun numeric(5, 2) not null check (peu_commun between 0 and 100),
  epique numeric(5, 2) not null check (epique between 0 and 100),
  mystique numeric(5, 2) not null check (mystique between 0 and 100),
  legendaire numeric(5, 2) not null check (legendaire between 0 and 100),
  maj_le timestamptz not null default now(),
  constraint familiers_pochette_cent check (commun + peu_commun + epique + mystique + legendaire = 100)
);

insert into internal.familiers_pochette (id, prix, commun, peu_commun, epique, mystique, legendaire) values
  (true, 2000, 45, 28, 15, 8, 4)
on conflict (id) do nothing;

-- Les familiers de chaque compte : un seul exemplaire de chacun, jamais de double.
create table if not exists internal.gaulois_familiers (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  familier text not null references internal.familiers (familier),
  acquis_le timestamptz not null default now(),
  primary key (user_id, familier)
);

-- Le familier montré à côté du Gaulois : null, ou un familier que le compte possède.
alter table internal.gaulois add column if not exists familier text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gaulois_familier_possede' and conrelid = 'internal.gaulois'::regclass) then
    alter table internal.gaulois add constraint gaulois_familier_possede
      foreign key (user_id, familier) references internal.gaulois_familiers (user_id, familier);
  end if;
end $$;

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.familiers enable row level security;
alter table internal.familiers_pochette enable row level security;
alter table internal.gaulois_familiers enable row level security;
revoke all on table internal.familiers from public, anon, authenticated;
revoke all on table internal.familiers_pochette from public, anon, authenticated;
revoke all on table internal.gaulois_familiers from public, anon, authenticated;

create or replace trigger familiers_pochette_garde before delete on internal.familiers_pochette
  for each statement execute function internal.village_reglage_garde();

-- Les chances de la pochette des familiers, une ligne par rareté, de la plus courante à la plus rare.
create or replace function internal.familiers_chances() returns table (rarete text, rang integer, chance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.rarete, r.rang, r.chance
  from internal.familiers_pochette p
  cross join lateral (values
    ('commun', 1, p.commun),
    ('peu-commun', 2, p.peu_commun),
    ('epique', 3, p.epique),
    ('mystique', 4, p.mystique),
    ('legendaire', 5, p.legendaire)
  ) as r (rarete, rang, chance)
  where p.id
$$;

revoke all on function internal.familiers_chances() from public, anon, authenticated;

-- Les familiers qu'un compte n'a pas encore.
create or replace function internal.familiers_a_recevoir(p_user uuid) returns table (familier text, rarete text)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.familier, f.rarete
  from internal.familiers f
  where not exists (select 1 from internal.gaulois_familiers g where g.user_id = p_user and g.familier = f.familier)
$$;

revoke all on function internal.familiers_a_recevoir(uuid) from public, anon, authenticated;

-- Les familiers du compte connecté : { ok: true, solde, peut_ouvrir, pochette: { prix, chances }, familiers: [{ familier,
-- acquis_le }], porte }. `peut_ouvrir` : compte validé avec un Gaulois créé. `porte` : le familier montré, ou null. Crédite
-- d'abord ce qui lui revient déjà, comme get_ma_boutique. Jamais le solde ni les familiers d'un autre.
create or replace function public.get_mes_familiers() returns jsonb
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
  select g.familier into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_ouvrir', v_status = 'validated' and v_gaulois,
    'pochette', jsonb_build_object(
      'prix', (select p.prix from internal.familiers_pochette p where p.id),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.familiers_chances() c)
    ),
    'familiers', coalesce((
      select jsonb_agg(jsonb_build_object('familier', g.familier, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.familier)
      from internal.gaulois_familiers g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_familiers() from public, anon, authenticated;
grant execute on function public.get_mes_familiers() to authenticated;

-- Ouvre une pochette des familiers au prix réglé : { ok: true, solde, familier: { familier, rarete }, reste }. `reste` : le
-- nombre de familiers que le compte n'a pas encore, après celui-ci. `p_prix_vu` : le prix que le membre a vu ; s'il a changé
-- entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, prix_change, tout_possede (il les a tous),
-- solde_insuffisant ; 'invalid_request' si aucune rareté qui lui reste n'a de chances ; et ceux de tout compte
-- (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_familiers(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer;
  v_total numeric;
  v_tirage double precision;
  v_cumul numeric := 0;
  v_rarete text;
  v_r record;
  v_n integer;
  v_familier text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    select p.prix into v_prix from internal.familiers_pochette p where p.id;
    if v_prix is null then perform internal.fail('invalid_request'); end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if not exists (select 1 from internal.familiers_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;
    -- La rareté : parmi celles qui ont des chances et un familier qu'il n'a pas encore, selon leurs chances.
    select sum(c.chance) into v_total from internal.familiers_chances() c
    where c.chance > 0 and exists (select 1 from internal.familiers_a_recevoir(v_uid) a where a.rarete = c.rarete);
    if v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.familiers_chances() c
      where c.chance > 0 and exists (select 1 from internal.familiers_a_recevoir(v_uid) a where a.rarete = c.rarete)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    -- Le familier : un de ceux de cette rareté qu'il n'a pas encore, tous à chances égales.
    select count(*)::integer into v_n from internal.familiers_a_recevoir(v_uid) a where a.rarete = v_rarete;
    select a.familier into v_familier
    from internal.familiers_a_recevoir(v_uid) a
    where a.rarete = v_rarete
    order by a.familier
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, 'familier/' || v_familier);
    insert into internal.gaulois_familiers (user_id, familier) values (v_uid, v_familier)
    on conflict (user_id, familier) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('invalid_request'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'familier', jsonb_build_object('familier', v_familier, 'rarete', v_rarete),
      'reste', (select count(*) from internal.familiers_a_recevoir(v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_familiers(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_familiers(integer) to authenticated;

-- Montre un familier à côté du Gaulois, ou aucun (`p_familier` null ou vide) : { ok: true, porte }. Refus : not_validated,
-- no_gaulois, unknown_familier (hors de la liste), pas_possede ; et ceux de tout compte. Gratuit.
create or replace function public.choisir_familier(p_familier text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_familier text := nullif(btrim(coalesce(p_familier, '')), '');
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    if v_familier is not null and not exists (select 1 from internal.familiers f where f.familier = v_familier) then
      perform internal.fail('unknown_familier');
    end if;
    perform internal.village_verrou(v_uid);
    if v_familier is not null and not exists (
      select 1 from internal.gaulois_familiers g where g.user_id = v_uid and g.familier = v_familier
    ) then
      perform internal.fail('pas_possede');
    end if;
    update internal.gaulois g set familier = v_familier where g.user_id = v_uid;
    return jsonb_build_object('ok', true, 'porte', v_familier);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.choisir_familier(text) from public, anon, authenticated;
grant execute on function public.choisir_familier(text) to authenticated;

-- /gaulois (remplace celle de la migration 20261114000500, ligne pour ligne) : rend en plus `familier`, le familier montré
-- à côté du Gaulois, ou null.
create or replace function public.discord_gaulois(p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_status public.member_status;
  v_tenue jsonb;
  v_familier text;
  v_partie timestamptz;
  v_vocal boolean;
  v_releve timestamptz;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select l.user_id, p.status into v_uid, v_status
  from public.private_links l
  join public.profiles p on p.user_id = l.user_id
  where l.discord_id = p_discord_id and p.status <> 'suspended'
  limit 1;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;
  select g.tenue, g.familier into v_tenue, v_familier from internal.gaulois g where g.user_id = v_uid;
  if v_tenue is null then
    return jsonb_build_object('ok', false, 'error', 'no_gaulois');
  end if;
  if v_status = 'validated' then
    select d.debut into v_partie from internal.village_vie_partie(v_uid) d;
    select internal.village_vie_vocal(v.vocal, v.vocal_le), v.vocal_le into v_vocal, v_releve
    from internal.village_vie v where v.user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'tenue', v_tenue, 'familier', v_familier, 'partie_le', v_partie, 'vocal', v_vocal, 'releve', v_releve);
end $$;

revoke all on function public.discord_gaulois(text) from public, anon, authenticated;
grant execute on function public.discord_gaulois(text) to service_role;

-- La sauvegarde chiffrée (remplace celle de la migration 20261113002400, version 6, ligne pour ligne) : version 7, avec
-- les familiers de chaque compte et le réglage de leur pochette. Après une restauration, la ligne du réglage existe déjà
-- (cette migration la sème) : elle se remet par un `update`. La liste des familiers, elle, vient de cette migration.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 7,
    'exported_at', now(),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profiles t),
    'private_links', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash'), '[]') from public.private_links t),
    'membership_requests', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash' - 'claimed_text' - 'note'), '[]') from public.membership_requests t),
    'admin_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.admin_log t),
    'site_announcements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_announcements t),
    'site_events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_events t),
    'event_attendance', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.event_attendance t),
    'polls', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.polls t),
    'poll_totals', (select coalesce(jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'choice', v.choice, 'votes', v.votes)), '[]') from (
      select poll_id, choice, count(*) as votes from internal.poll_votes group by poll_id, choice
    ) v),
    'ideas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.ideas t),
    'idea_support_totals', (select coalesce(jsonb_agg(jsonb_build_object('idea_id', s.idea_id, 'supports', s.supports)), '[]') from (
      select idea_id, count(*) as supports from internal.idea_supports group by idea_id
    ) s),
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome'),
    'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t),
    'alliances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliances t),
    'alliance_clans', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_clans t),
    'alliance_zones', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('mask', translate(encode(t.mask, 'base64'), E'\n', ''))), '[]') from internal.alliance_zones t),
    'alliance_allies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_allies t),
    'alliance_troops', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_troops t),
    -- Ajouts de la version 5 : le village des Gaulois.
    'gaulois', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.user_id), '[]') from internal.gaulois t),
    'gaulois_inventaire', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.emplacement, t.objet), '[]') from internal.gaulois_inventaire t),
    'stateres_mouvements', (select coalesce(jsonb_agg(to_jsonb(t) - 'partie' - 'debut' - 'points' - 'gaulois' order by t.id), '[]') from internal.stateres_mouvements t where t.nature <> 'victoire'),
    'stateres_victoires_totaux', (select coalesce(jsonb_agg(jsonb_build_object('user_id', v.user_id, 'stateres', v.stateres) order by v.user_id), '[]') from (
      select user_id, sum(montant) as stateres from internal.stateres_mouvements where nature = 'victoire' group by user_id
    ) v),
    'stateres_soldes', (select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'solde', t.solde) order by t.user_id), '[]') from internal.stateres_soldes t),
    'village_prix', (select coalesce(jsonb_agg(to_jsonb(t) order by t.rarete), '[]') from internal.village_prix t),
    'village_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_pochette t),
    'marche_offres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_offres t),
    -- Ajouts de la version 6 : le réglage et la dépense des bulles du village.
    'village_vie_reglage', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_vie_reglage t),
    'village_vie_depense', (select coalesce(jsonb_agg(to_jsonb(t) order by t.mois), '[]') from internal.village_vie_depense t),
    -- Ajouts de la version 7 : les familiers de chaque compte et le réglage de leur pochette.
    'gaulois_familiers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.familier), '[]') from internal.gaulois_familiers t),
    'familiers_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.familiers_pochette t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
