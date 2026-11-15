-- Les bannières du Gaulois, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; dessins :
-- supabase/functions/code-discord/bannieres/ ; formes des réponses : src/lib/village/contrat.ts).
--
-- Demande du pilote, 15 novembre 2026 : « un lot de bannières, dans le thème OpenFront, des thèmes spéciaux, de tous les
-- goûts », « avec un lot de rareté », « je veux que ça coûte 3 fois plus cher que les cosmétiques », « achetables par
-- statères », « il pourra choisir la bannière qui s'affichera en faisant /gaulois ». Une bannière est un fond de l'image de
-- /gaulois, dessiné par Claude Fable 5.2, à la place du décor du lieu où se trouve le Gaulois.
--
-- Les règles :
-- - Une bannière s'achète à la boutique, au triple du prix d'un objet de sa rareté (internal.village_prix, que l'encadrement
--   règle dans l'onglet Village de la Direction) : au départ 300, 750, 1 500, 3 000 et 7 500 statères. Le triple suit ce
--   réglage : il n'est écrit qu'à un endroit, internal.banniere_prix.
-- - Ni pochette, ni marché, ni forge : une bannière achetée reste à son compte, en un seul exemplaire.
-- - Le débit est une ligne du journal des statères de nature 'achat', `ref` : « banniere/<identifiant> ». L'onglet Village
--   de la Direction la compte avec les achats de la boutique (son détail par rareté ne lit que les objets) ; l'annonce des
--   achats sur Discord (achats_du_village) la lit comme un achat, sous l'emplacement « banniere ».
-- - Le compte montre une bannière sur /gaulois, ou aucune (le décor de son lieu) : internal.gaulois.banniere. Une
--   contrainte de la table garantit que c'est une bannière qu'il possède.
--
-- Ce qui est gardé :
-- - internal.bannieres : la liste des bannières et leur rareté, celle des dessins (un test garde les deux identiques).
-- - internal.gaulois_bannieres : les bannières de chaque compte, et quand il les a achetées. S'efface avec le compte.
-- - internal.gaulois.banniere : la bannière montrée sur /gaulois, ou null.
--
-- Qui peut quoi :
-- - get_mes_bannieres : un compte connecté, non suspendu ; son solde, les prix, ses bannières, celle qu'il montre.
-- - acheter_banniere, choisir_banniere : un compte validé qui a créé son Gaulois. Ils prennent le verrou du compte
--   (internal.village_verrou), comme les achats d'objets et la tenue.
-- - discord_gaulois (remplacée, depuis la 20261115000800) : rend en plus la bannière montrée, pour l'image de /gaulois.
--   Toujours la clé de service seulement.
-- - export_site (remplacée, depuis la 20261115000800, version 7) : la sauvegarde chiffrée garde en plus les bannières de
--   chaque compte (version 8). La bannière montrée y est déjà, avec la ligne du Gaulois.
--
-- Elle suit la migration des familiers (20261115000800), dont elle reprend les deux fonctions remplacées ligne pour ligne.
-- Rien n'est écrit au journal de l'encadrement : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
-- Deux tables, une colonne et quatre fonctions ajoutées, deux fonctions remplacées, aucune donnée existante touchée.
-- Rejouée, elle se remplace par la même.

create table if not exists internal.bannieres (
  banniere text primary key check (banniere ~ '^[a-z]+(-[a-z]+)*$' and length(banniere) <= 40),
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
);

-- <bannieres> : écrit depuis supabase/functions/code-discord/bannieres/ ; ne pas modifier à la main.
insert into internal.bannieres (banniere, rarete) values
  ('poste-sur-la-crete', 'commun'),
  ('ligne-de-front', 'commun'),
  ('ville-sous-alerte', 'peu-commun'),
  ('silo-ouvert', 'peu-commun'),
  ('champignon-au-crepuscule', 'epique'),
  ('barrage-anti-aerien', 'epique'),
  ('salve-se-separe', 'mystique'),
  ('aube-de-la-bombe-h', 'legendaire'),
  ('flotte-en-ligne', 'commun'),
  ('archipel-turquoise', 'commun'),
  ('port-au-couchant', 'peu-commun'),
  ('convoi-des-glaces', 'peu-commun'),
  ('debarquement-a-l-aube', 'epique'),
  ('bataille-de-nuit', 'epique'),
  ('mer-des-lueurs', 'mystique'),
  ('cuirasse-de-l-orage', 'legendaire'),
  ('dunes-et-oasis', 'commun'),
  ('banquise-du-nord', 'commun'),
  ('delta-verdoyant', 'peu-commun'),
  ('terres-des-clans', 'peu-commun'),
  ('cretes-au-levant', 'epique'),
  ('monde-de-nuit', 'epique'),
  ('pacte-de-lumiere', 'mystique'),
  ('table-du-stratege', 'legendaire'),
  ('foret-doree', 'commun'),
  ('plage-au-couchant', 'commun'),
  ('cerisiers-en-fleurs', 'peu-commun'),
  ('nuit-de-neige', 'peu-commun'),
  ('nuit-des-citrouilles', 'epique'),
  ('feux-du-nouvel-an', 'epique'),
  ('aurore-du-lac-gele', 'mystique'),
  ('eclipse-totale', 'legendaire'),
  ('crepuscule-neon', 'commun'),
  ('mer-de-nuages', 'commun'),
  ('salle-d-arcade', 'peu-commun'),
  ('grotte-aux-cristaux', 'peu-commun'),
  ('abysses-lumineuses', 'epique'),
  ('forge-du-volcan', 'epique'),
  ('sous-la-nebuleuse', 'mystique'),
  ('dragon-de-pierre', 'legendaire')
on conflict (banniere) do update set rarete = excluded.rarete;
-- </bannieres>

-- Les bannières de chaque compte : un seul exemplaire de chacune.
create table if not exists internal.gaulois_bannieres (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  banniere text not null references internal.bannieres (banniere),
  acquis_le timestamptz not null default now(),
  primary key (user_id, banniere)
);

-- La bannière montrée sur /gaulois : null (le décor de son lieu), ou une bannière que le compte possède.
alter table internal.gaulois add column if not exists banniere text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gaulois_banniere_possedee' and conrelid = 'internal.gaulois'::regclass) then
    alter table internal.gaulois add constraint gaulois_banniere_possedee
      foreign key (user_id, banniere) references internal.gaulois_bannieres (user_id, banniere);
  end if;
end $$;

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.bannieres enable row level security;
alter table internal.gaulois_bannieres enable row level security;
revoke all on table internal.bannieres from public, anon, authenticated;
revoke all on table internal.gaulois_bannieres from public, anon, authenticated;

-- Le prix d'une bannière de cette rareté : le triple de celui d'un objet de la même rareté (demande du pilote : « 3 fois
-- plus cher que les cosmétiques »). Null pour une rareté sans prix.
create or replace function internal.banniere_prix(p_rarete text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select 3 * p.prix from internal.village_prix p where p.rarete = p_rarete
$$;

revoke all on function internal.banniere_prix(text) from public, anon, authenticated;

-- Les bannières du compte connecté : { ok: true, solde, peut_acheter, prix: { rareté: statères }, bannieres: [{ banniere,
-- acquis_le }], porte }. `peut_acheter` : compte validé avec un Gaulois créé. `porte` : la bannière montrée, ou null.
-- Crédite d'abord ce qui lui revient déjà, comme get_ma_boutique. Jamais le solde ni les bannières d'un autre.
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
    'bannieres', coalesce((
      select jsonb_agg(jsonb_build_object('banniere', g.banniere, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.banniere)
      from internal.gaulois_bannieres g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_bannieres() from public, anon, authenticated;
grant execute on function public.get_mes_bannieres() to authenticated;

-- Achète une bannière au prix de sa rareté : { ok: true, solde, banniere: { banniere, rarete } }. `p_prix_vu` : le prix que
-- le membre a vu ; s'il a changé entre-temps (réglage de l'encadrement), refus prix_change, rien n'est débité. Refus, dans
-- l'ordre : not_validated, no_gaulois, unknown_banniere (hors de la liste), deja_possede, prix_change, solde_insuffisant ;
-- et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.acheter_banniere(p_banniere text, p_prix_vu integer) returns jsonb
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
    select b.rarete into v_rarete from internal.bannieres b where b.banniere = p_banniere;
    if not found then perform internal.fail('unknown_banniere'); end if;
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

-- Montre une bannière sur /gaulois, ou aucune (`p_banniere` null ou vide : le décor de son lieu) : { ok: true, porte }.
-- Refus : not_validated, no_gaulois, unknown_banniere (hors de la liste), pas_possede ; et ceux de tout compte. Gratuit.
create or replace function public.choisir_banniere(p_banniere text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_banniere text := nullif(btrim(coalesce(p_banniere, '')), '');
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    if v_banniere is not null and not exists (select 1 from internal.bannieres b where b.banniere = v_banniere) then
      perform internal.fail('unknown_banniere');
    end if;
    perform internal.village_verrou(v_uid);
    if v_banniere is not null and not exists (
      select 1 from internal.gaulois_bannieres g where g.user_id = v_uid and g.banniere = v_banniere
    ) then
      perform internal.fail('pas_possede');
    end if;
    update internal.gaulois g set banniere = v_banniere where g.user_id = v_uid;
    return jsonb_build_object('ok', true, 'porte', v_banniere);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.choisir_banniere(text) from public, anon, authenticated;
grant execute on function public.choisir_banniere(text) to authenticated;

-- /gaulois (remplace celle de la migration 20261115000800, ligne pour ligne) : rend en plus `banniere`, la bannière
-- montrée sur /gaulois, ou null.
create or replace function public.discord_gaulois(p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_status public.member_status;
  v_tenue jsonb;
  v_familier text;
  v_banniere text;
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
  select g.tenue, g.familier, g.banniere into v_tenue, v_familier, v_banniere from internal.gaulois g where g.user_id = v_uid;
  if v_tenue is null then
    return jsonb_build_object('ok', false, 'error', 'no_gaulois');
  end if;
  if v_status = 'validated' then
    select d.debut into v_partie from internal.village_vie_partie(v_uid) d;
    select internal.village_vie_vocal(v.vocal, v.vocal_le), v.vocal_le into v_vocal, v_releve
    from internal.village_vie v where v.user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'tenue', v_tenue, 'familier', v_familier, 'banniere', v_banniere, 'partie_le', v_partie, 'vocal', v_vocal, 'releve', v_releve);
end $$;

revoke all on function public.discord_gaulois(text) from public, anon, authenticated;
grant execute on function public.discord_gaulois(text) to service_role;

-- La sauvegarde chiffrée (remplace celle de la migration 20261115000800, version 7, ligne pour ligne) : version 8, avec
-- les bannières de chaque compte. La liste des bannières, elle, vient de cette migration.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 8,
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
    'gaulois_bannieres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.banniere), '[]') from internal.gaulois_bannieres t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
