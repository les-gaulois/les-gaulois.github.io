-- Le rayon « Cadres » de la boutique, côté serveur (docs/DIRECTION.md, « Le rayon Cadres » ; liste et formes des
-- réponses : src/lib/village/cadres.ts ; dessins : src/lib/fx/cadres-carte.ts).
--
-- Demande du pilote, 17 novembre 2026 : « cadres animés », six choisis sur maquette, puis vingt de plus, « détaillé selon
-- la rareté ». Un cadre entoure la carte du membre, celle de sa fiche et de la boutique.
--
-- Les règles sont celles des finitions du rayon « Cartes » (migration 20261117001200), reprises fonction pour fonction :
-- - Un cadre s'achète à la boutique, au prix d'une bannière de sa rareté (internal.banniere_prix). Aucun prix nouveau.
-- - Ni pochette, ni marché, ni forge, ni revente au jeu : un cadre acheté reste à son compte, en un seul exemplaire.
-- - Le débit est une ligne du journal des statères de nature 'achat', `ref` : « cadre/<identifiant> ». Aucun statère
--   n'est créé.
-- - Le compte montre un cadre, ou aucun : internal.gaulois.cadre. Une contrainte de la table garantit que c'est un cadre
--   qu'il possède.
-- - Pas d'achat pendant un essai en mode GOD (internal.village_god). Refus mode_god.
--
-- Ce qui est gardé : internal.cadres (la liste et les raretés, celles de src/lib/village/cadres.ts, un test garde les deux
-- identiques), internal.gaulois_cadres (les cadres de chaque compte, effacés avec lui), internal.gaulois.cadre.
--
-- Qui peut quoi :
-- - get_mes_cadres : un compte connecté, non suspendu ; son solde, les prix, ses cadres, celui qu'il montre.
-- - acheter_cadre, choisir_cadre : un compte validé qui a créé son Gaulois, sous le verrou du compte.
-- - cadres_des_joueurs : la clé de service seulement, pour la construction du site ; par empreinte, le cadre que montre
--   un membre validé au pseudo public. Jamais un solde, jamais la liste de ce qu'il possède.
-- - export_site (remplacée, depuis la 20261117001200, version 10, ligne pour ligne) : la sauvegarde chiffrée garde en plus
--   les cadres de chaque compte (version 11).
--
-- Rien n'est écrit au journal de l'équipe. Aucun solde ne se lit pour un autre compte. Deux tables, une colonne et quatre
-- fonctions ajoutées, une fonction remplacée, aucune donnée existante touchée. Rejouée, elle se remplace par la même.

create table if not exists internal.cadres (
  cadre text primary key check (cadre ~ '^[a-z]+(-[a-z]+)*$' and length(cadre) <= 40),
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
);

-- <cadres> : écrit depuis src/lib/village/cadres.ts ; ne pas modifier à la main.
insert into internal.cadres (cadre, rarete) values
  ('corde', 'commun'),
  ('bois', 'commun'),
  ('pierre', 'commun'),
  ('fer', 'commun'),
  ('lierre', 'peu-commun'),
  ('vagues', 'peu-commun'),
  ('damier', 'peu-commun'),
  ('tartan', 'peu-commun'),
  ('sablier', 'peu-commun'),
  ('tricolore', 'peu-commun'),
  ('braise', 'peu-commun'),
  ('givre', 'peu-commun'),
  ('or-liquide', 'epique'),
  ('runes', 'epique'),
  ('lave', 'epique'),
  ('circuit', 'epique'),
  ('rubis', 'epique'),
  ('aurore', 'mystique'),
  ('toxique', 'mystique'),
  ('neon', 'mystique'),
  ('galaxie', 'mystique'),
  ('foudre', 'legendaire'),
  ('arc-en-ciel', 'legendaire'),
  ('glitch', 'legendaire'),
  ('plasma', 'legendaire'),
  ('soleil', 'legendaire')
on conflict (cadre) do update set rarete = excluded.rarete;
-- </cadres>

create table if not exists internal.gaulois_cadres (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  cadre text not null references internal.cadres (cadre),
  acquis_le timestamptz not null default now(),
  primary key (user_id, cadre)
);

alter table internal.gaulois add column if not exists cadre text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gaulois_cadre_possedee' and conrelid = 'internal.gaulois'::regclass) then
    alter table internal.gaulois add constraint gaulois_cadre_possedee
      foreign key (user_id, cadre) references internal.gaulois_cadres (user_id, cadre);
  end if;
end $$;

alter table internal.cadres enable row level security;
alter table internal.gaulois_cadres enable row level security;
revoke all on table internal.cadres from public, anon, authenticated;
revoke all on table internal.gaulois_cadres from public, anon, authenticated;

create or replace function public.get_mes_cadres() returns jsonb
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
  select g.cadre into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, internal.banniere_prix(p.rarete)) from internal.village_prix p),
    'cadres', coalesce((
      select jsonb_agg(jsonb_build_object('cadre', g.cadre, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.cadre)
      from internal.gaulois_cadres g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_cadres() from public, anon, authenticated;
grant execute on function public.get_mes_cadres() to authenticated;

create or replace function public.acheter_cadre(p_cadre text, p_prix_vu integer) returns jsonb
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
    select c.rarete into v_rarete from internal.cadres c where c.cadre = p_cadre;
    if not found then perform internal.fail('unknown_cadre'); end if;
    v_prix := internal.banniere_prix(v_rarete);
    if v_prix is null or v_prix <= 0 then perform internal.fail('unknown_cadre'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.village_god d where d.user_id = v_uid) then
      perform internal.fail('mode_god');
    end if;
    if exists (select 1 from internal.gaulois_cadres g where g.user_id = v_uid and g.cadre = p_cadre) then
      perform internal.fail('deja_possede');
    end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, 'cadre/' || p_cadre);
    insert into internal.gaulois_cadres (user_id, cadre) values (v_uid, p_cadre)
    on conflict (user_id, cadre) do nothing;
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'cadre', jsonb_build_object('cadre', p_cadre, 'rarete', v_rarete)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_cadre(text, integer) from public, anon, authenticated;
grant execute on function public.acheter_cadre(text, integer) to authenticated;

create or replace function public.choisir_cadre(p_cadre text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_cadre text := nullif(btrim(coalesce(p_cadre, '')), '');
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    if v_cadre is not null and not exists (select 1 from internal.cadres c where c.cadre = v_cadre) then
      perform internal.fail('unknown_cadre');
    end if;
    perform internal.village_verrou(v_uid);
    if v_cadre is not null and not exists (
      select 1 from internal.gaulois_cadres g where g.user_id = v_uid and g.cadre = v_cadre
    ) then
      perform internal.fail('pas_possede');
    end if;
    update internal.gaulois g set cadre = v_cadre where g.user_id = v_uid;
    return jsonb_build_object('ok', true, 'porte', v_cadre);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.choisir_cadre(text) from public, anon, authenticated;
grant execute on function public.choisir_cadre(text) to authenticated;

create or replace function public.cadres_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cadres jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, g.cadre), '{}'::jsonb) into v_cadres
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  where p.status = 'validated'
    and l.discord_id is not null
    and g.cadre is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'cadres', v_cadres);
end $$;

revoke all on function public.cadres_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.cadres_des_joueurs(text[]) to service_role;

-- La sauvegarde chiffrée (remplace celle de la migration 20261117001200, version 10, ligne pour ligne) : version 11, avec
-- les cadres de carte de chaque compte.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 11,
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
    'gaulois_cartes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.finition), '[]') from internal.gaulois_cartes t),
    -- Ajout de la version 11 : les cadres de carte de chaque compte.
    'gaulois_cadres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.cadre), '[]') from internal.gaulois_cadres t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
