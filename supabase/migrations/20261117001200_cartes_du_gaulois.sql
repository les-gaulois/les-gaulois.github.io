-- Le rayon « Cartes » de la boutique, côté serveur (docs/DIRECTION.md, « Le rayon Cartes » ; liste et formes des
-- réponses : src/lib/village/cartes.ts ; dessins : src/lib/fx/finitions-carte.ts et src/styles/feuilles/04-poste.css).
--
-- Demande du pilote, 17 novembre 2026 : « des idées d'achats dans la boutique Mon Gaulois pour avoir accès à des animations
-- différentes », « +20 finitions avec leur rareté », puis « Oui, le rayon Cartes ». Une finition est la brillance ou
-- l'animation de la carte du membre, celle qui paraît en haut de l'accueil quand il est sur le podium de la semaine.
--
-- Les règles :
-- - Une finition s'achète à la boutique, au prix d'une bannière de sa rareté (internal.banniere_prix : le triple du prix
--   d'un objet de cette rareté, que l'équipe règle dans l'onglet Village de la Direction). Aucun prix nouveau.
-- - Ni pochette, ni marché, ni forge, ni revente au jeu : une finition achetée reste à son compte, en un seul exemplaire.
-- - Le débit est une ligne du journal des statères de nature 'achat', `ref` : « carte/<identifiant> ». Aucun statère
--   n'est créé.
-- - Le compte montre une finition, ou aucune (sa carte du podium porte alors celle de sa place) : internal.gaulois.carte.
--   Une contrainte de la table garantit que c'est une finition qu'il possède.
-- - Pas d'achat pendant un essai en mode GOD (internal.village_god) : la copie de l'essai ne garde pas les finitions, et
--   un achat y resterait après l'essai. Refus mode_god. Toutes les finitions se voient avant l'achat, à l'écran.
--
-- Ce qui est gardé :
-- - internal.cartes : la liste des finitions et leur rareté, celle de src/lib/village/cartes.ts (un test garde les deux
--   identiques).
-- - internal.gaulois_cartes : les finitions de chaque compte, et quand il les a achetées. S'efface avec le compte.
-- - internal.gaulois.carte : la finition montrée, ou null.
--
-- Qui peut quoi :
-- - get_mes_cartes : un compte connecté, non suspendu ; son solde, les prix, ses finitions, celle qu'il montre.
-- - acheter_carte, choisir_carte : un compte validé qui a créé son Gaulois, sous le verrou du compte
--   (internal.village_verrou), comme les achats d'objets et de bannières.
-- - cartes_des_joueurs : la clé de service seulement, pour la construction du site ; par empreinte, la finition que
--   montre un membre validé au pseudo public. Jamais un solde, jamais la liste de ce qu'il possède.
-- - export_site (remplacée, depuis la 20261115001000, version 9, ligne pour ligne) : la sauvegarde chiffrée garde en plus
--   les finitions de chaque compte (version 10). La finition montrée y est déjà, avec la ligne du Gaulois.
--
-- Rien n'est écrit au journal de l'équipe : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
-- Deux tables, une colonne et quatre fonctions ajoutées, une fonction remplacée, aucune donnée existante touchée.
-- Rejouée, elle se remplace par la même.

create table if not exists internal.cartes (
  finition text primary key check (finition ~ '^[a-z]+(-[a-z]+)*$' and length(finition) <= 40),
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
);

-- <cartes> : écrit depuis src/lib/village/cartes.ts ; ne pas modifier à la main.
insert into internal.cartes (finition, rarete) values
  ('arc-en-ciel', 'commun'),
  ('tricolore', 'commun'),
  ('confettis', 'commun'),
  ('averse', 'commun'),
  ('bulles', 'commun'),
  ('tube-neon', 'commun'),
  ('pluie-d-eclats', 'peu-commun'),
  ('cristal', 'peu-commun'),
  ('braise', 'peu-commun'),
  ('pluie-de-code', 'peu-commun'),
  ('radar', 'peu-commun'),
  ('feu-d-artifice', 'peu-commun'),
  ('blizzard', 'peu-commun'),
  ('boule-a-facettes', 'peu-commun'),
  ('bain-de-canards', 'peu-commun'),
  ('feuille-d-or', 'epique'),
  ('prisme', 'epique'),
  ('hologramme', 'epique'),
  ('piratage', 'epique'),
  ('foudre', 'epique'),
  ('coulee-de-lave', 'epique'),
  ('vitesse-lumiere', 'epique'),
  ('lancement', 'epique'),
  ('pluie-de-stateres', 'epique'),
  ('aurore', 'mystique'),
  ('cosmos', 'mystique'),
  ('trou-noir', 'mystique'),
  ('portail', 'mystique'),
  ('voile-boreal', 'mystique'),
  ('plasma', 'mystique'),
  ('champignon-atomique', 'legendaire'),
  ('explosion', 'legendaire'),
  ('supernova', 'legendaire')
on conflict (finition) do update set rarete = excluded.rarete;
-- </cartes>

-- Les finitions de chaque compte : un seul exemplaire de chacune.
create table if not exists internal.gaulois_cartes (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  finition text not null references internal.cartes (finition),
  acquis_le timestamptz not null default now(),
  primary key (user_id, finition)
);

-- La finition montrée : null (celle de la place, sur le podium), ou une finition que le compte possède.
alter table internal.gaulois add column if not exists carte text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gaulois_carte_possedee' and conrelid = 'internal.gaulois'::regclass) then
    alter table internal.gaulois add constraint gaulois_carte_possedee
      foreign key (user_id, carte) references internal.gaulois_cartes (user_id, finition);
  end if;
end $$;

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.cartes enable row level security;
alter table internal.gaulois_cartes enable row level security;
revoke all on table internal.cartes from public, anon, authenticated;
revoke all on table internal.gaulois_cartes from public, anon, authenticated;

-- Les finitions du compte connecté : { ok: true, solde, peut_acheter, prix: { rareté: statères }, finitions: [{ finition,
-- acquis_le }], porte }. `peut_acheter` : compte validé avec un Gaulois créé. `porte` : la finition montrée, ou null.
-- Crédite d'abord ce qui lui revient déjà, comme get_mes_bannieres. Jamais le solde ni les finitions d'un autre.
create or replace function public.get_mes_cartes() returns jsonb
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
  select g.carte into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, internal.banniere_prix(p.rarete)) from internal.village_prix p),
    'finitions', coalesce((
      select jsonb_agg(jsonb_build_object('finition', g.finition, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.finition)
      from internal.gaulois_cartes g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_cartes() from public, anon, authenticated;
grant execute on function public.get_mes_cartes() to authenticated;

-- Achète une finition au prix de sa rareté : { ok: true, solde, finition: { finition, rarete } }. `p_prix_vu` : le prix que
-- le membre a vu ; s'il a changé entre-temps (réglage de l'équipe), refus prix_change, rien n'est débité. Refus, dans
-- l'ordre : not_validated, no_gaulois, unknown_finition (hors de la liste), mode_god (mode GOD), deja_possede,
-- prix_change, solde_insuffisant ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.acheter_carte(p_finition text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_rarete text;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    select c.rarete into v_rarete from internal.cartes c where c.finition = p_finition;
    if not found then perform internal.fail('unknown_finition'); end if;
    v_prix := internal.banniere_prix(v_rarete);
    if v_prix is null or v_prix <= 0 then perform internal.fail('unknown_finition'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.village_god d where d.user_id = v_uid) then
      perform internal.fail('mode_god');
    end if;
    if exists (select 1 from internal.gaulois_cartes g where g.user_id = v_uid and g.finition = p_finition) then
      perform internal.fail('deja_possede');
    end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, 'carte/' || p_finition);
    insert into internal.gaulois_cartes (user_id, finition) values (v_uid, p_finition)
    on conflict (user_id, finition) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'finition', jsonb_build_object('finition', p_finition, 'rarete', v_rarete)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_carte(text, integer) from public, anon, authenticated;
grant execute on function public.acheter_carte(text, integer) to authenticated;

-- Montre une finition, ou aucune (`p_finition` null ou vide : celle de la place) : { ok: true, porte }.
-- Refus : not_validated, no_gaulois, unknown_finition (hors de la liste), pas_possede ; et ceux de tout compte. Gratuit.
create or replace function public.choisir_carte(p_finition text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_finition text := nullif(btrim(coalesce(p_finition, '')), '');
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    if v_finition is not null and not exists (select 1 from internal.cartes c where c.finition = v_finition) then
      perform internal.fail('unknown_finition');
    end if;
    perform internal.village_verrou(v_uid);
    if v_finition is not null and not exists (
      select 1 from internal.gaulois_cartes g where g.user_id = v_uid and g.finition = v_finition
    ) then
      perform internal.fail('pas_possede');
    end if;
    update internal.gaulois g set carte = v_finition where g.user_id = v_uid;
    return jsonb_build_object('ok', true, 'porte', v_finition);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.choisir_carte(text) from public, anon, authenticated;
grant execute on function public.choisir_carte(text) to authenticated;

-- Les finitions du podium de l'accueil, pour la construction du site : { ok: true, cartes: { empreinte: finition } }.
-- Comme bannieres_des_joueurs : seulement les membres validés, liés à Discord, au pseudo public, qui en montrent une.
-- L'empreinte est celle de l'identifiant public (internal.hash_public_id) : aucun identifiant ne sort d'ici.
create or replace function public.cartes_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cartes jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, g.carte), '{}'::jsonb) into v_cartes
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  where p.status = 'validated'
    and l.discord_id is not null
    and g.carte is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'cartes', v_cartes);
end $$;

revoke all on function public.cartes_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.cartes_des_joueurs(text[]) to service_role;

-- La sauvegarde chiffrée (remplace celle de la migration 20261115001000, version 9, ligne pour ligne) : version 10, avec
-- les finitions de carte de chaque compte. La liste des finitions, elle, vient de cette migration.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 10,
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
    'familiers_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.familiers_pochette t),
    -- Ajout de la version 8 : les bannières de chaque compte.
    'gaulois_bannieres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.banniere), '[]') from internal.gaulois_bannieres t),
    -- Ajouts de la version 9 : les Gaulois uniques de chaque compte et le réglage de leur pochette.
    'gaulois_modeles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.modele), '[]') from internal.gaulois_modeles t),
    'modeles_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.modeles_pochette t),
    -- Ajout de la version 10 : les finitions de carte de chaque compte.
    'gaulois_cartes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.finition), '[]') from internal.gaulois_cartes t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
