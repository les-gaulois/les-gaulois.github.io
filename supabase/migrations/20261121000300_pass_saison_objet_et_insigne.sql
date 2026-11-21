-- Le pass (ex-« sentier des Gaulois ») : saisons de six semaines, objet de la saison et insigne de saison (docs/DIRECTION.md,
-- « Le pass » ; formes des réponses : src/lib/village/contrat.ts ; dessins : supabase/functions/code-discord/garde-robe/
-- saison.ts pour l'objet, src/lib/village/insignes-de-saison.ts pour l'insigne).
--
-- Décisions du pilote, 21 novembre 2026 : « Le sentier » devient « Le pass » ; une saison dure six semaines ; au dernier
-- palier, « un objet légendaire dessiné pour la saison, qu'on n'obtient que là, et un insigne de saison sur la carte ». Le
-- pass ne donne toujours jamais de statères, de divin, de familier, de bannière ni de Gaulois unique.
--
-- Les règles :
-- - SIX SEMAINES : la saison 1 va du mardi 17 novembre au lundi 28 décembre 2026 (elle devait finir le 31 décembre).
--   Ses paliers atteints se prennent encore 7 jours après, comme avant. Une saison suivante s'ajoute par une nouvelle
--   migration, avec son objet ; sans saison en cours, personne n'avance.
-- - L'OBJET DE LA SAISON : une nouvelle rareté, « légendaire de saison » ('saison'), pour les objets dessinés pour une
--   saison. Comme le divin, elle n'a pas de prix (aucune ligne dans internal.village_prix) : un tel objet ne s'achète pas
--   (acheter_objet répond 'unknown_objet'), n'est jamais en rayon ni à l'étal, ne se vend ni ne se demande au marché
--   ('prix_invalide'), ne se revend pas au jeu, ne sort d'aucune pochette et la forge ne le fond pas ni n'en fabrique
--   (internal.forge_rarete_suivante ne connaît pas cette rareté). Aucune de ces fonctions ne change : elles l'écartent déjà.
--   Celui de la saison 1 : « Couronne du solstice » (tête), dessin original de Claude Fable 5.2.
-- - LE DERNIER PALIER : prendre le 30e palier d'une saison qui a son objet donne cet objet, au lieu d'un légendaire tiré au
--   hasard, et l'insigne de la saison (internal.pass_insignes). L'objet entre à l'inventaire comme sorti d'une pochette :
--   il se porte et se grave. Les autres paliers ne changent pas. Pendant un essai du mode GOD, aucun palier ne se prend,
--   comme avant ('mode_god').
-- - L'INSIGNE DE SAISON : il se garde pour toujours, une fois par saison, et se montre sur la carte du joueur. Le membre le
--   voit dans get_mon_sentier ; la construction du site le lit pour les membres au pseudo public, comme les bannières
--   (insignes_des_joueurs, clé de service seulement).
--
-- Ce qui change : la contrainte des raretés de internal.gaulois_objets, élargie à 'saison' (retirée par son contenu, puis
-- remise) ; un objet ajouté au catalogue ; deux colonnes ajoutées à internal.sentier_saisons (l'objet de la saison) ; la fin
-- de la saison 1 et son objet ; une table (internal.pass_insignes) ; public.prendre_palier et public.get_mon_sentier,
-- remplacées depuis la 20261116001100 avec les mêmes signatures et les mêmes droits ; une fonction ajoutée. Aucune table ni
-- colonne retirée, aucune donnée effacée. Rejouée, elle se remplace par la même.

/* ---------- La rareté et l'objet de la saison 1 ---------- */

-- La contrainte des raretés, élargie à 'saison'. Elle est retirée par son contenu, quel que soit son nom, puis remise.
do $$
declare
  v_nom text;
begin
  for v_nom in
    select c.conname from pg_constraint c
    where c.conrelid = 'internal.gaulois_objets'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%rarete%'
  loop
    execute format('alter table internal.gaulois_objets drop constraint %I', v_nom);
  end loop;
  alter table internal.gaulois_objets add constraint gaulois_objets_rarete_check
    check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire', 'saison', 'divin'));
end $$;

-- <objets-de-saison> : écrit depuis supabase/functions/code-discord/garde-robe/saison.ts ; un test compare.
insert into internal.gaulois_objets (emplacement, objet, rarete, gratuit) values
  ('tete', 'couronne-solstice', 'saison', false)
on conflict (emplacement, objet) do nothing;
-- </objets-de-saison>

/* ---------- Les saisons ---------- */

alter table internal.sentier_saisons add column if not exists objet_emplacement text;
alter table internal.sentier_saisons add column if not exists objet text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sentier_saisons_objet_fkey' and conrelid = 'internal.sentier_saisons'::regclass) then
    alter table internal.sentier_saisons add constraint sentier_saisons_objet_fkey
      foreign key (objet_emplacement, objet) references internal.gaulois_objets (emplacement, objet);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sentier_saisons_objet_entier' and conrelid = 'internal.sentier_saisons'::regclass) then
    alter table internal.sentier_saisons add constraint sentier_saisons_objet_entier check ((objet_emplacement is null) = (objet is null));
  end if;
end $$;

-- La saison 1 : six semaines, du 17 novembre au 28 décembre 2026, et son objet.
update internal.sentier_saisons
  set fin = date '2026-12-28', objet_emplacement = 'tete', objet = 'couronne-solstice'
  where saison = 'saison-1';

/* ---------- Les insignes ---------- */

create table if not exists internal.pass_insignes (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  saison text not null references internal.sentier_saisons (saison) on delete cascade,
  obtenu_le timestamptz not null default now(),
  primary key (user_id, saison)
);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.pass_insignes enable row level security;
revoke all on table internal.pass_insignes from public, anon, authenticated;

-- Les insignes de saison d'un compte, pour l'écran : [{ saison, nom, obtenu_le }], le plus récent d'abord.
create or replace function internal.pass_insignes_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('saison', i.saison, 'nom', s.nom, 'obtenu_le', i.obtenu_le) order by s.debut desc), '[]'::jsonb)
  from internal.pass_insignes i
  join internal.sentier_saisons s on s.saison = i.saison
  where i.user_id = p_user
$$;

revoke all on function internal.pass_insignes_json(uuid) from public, anon, authenticated;

/* ---------- Le dernier palier, remplacée ---------- */

-- Prend l'objet d'un palier atteint : { ok: true, palier, objet: { emplacement, objet, rarete, double }, insigne }. Celle
-- de la 20261116001100, avec un ajout : le dernier palier d'une saison qui a son objet donne cet objet (rareté 'saison'),
-- et l'insigne de la saison (`insigne` : { saison, nom }, null pour les autres paliers). Pour les autres paliers, l'objet
-- est tiré comme avant parmi les objets payants de la rareté du palier que le compte n'a pas ; s'il les a tous, parmi tous,
-- et c'est un double. Refus, dans l'ordre : not_validated, no_gaulois, mode_god, saison_fermee, unknown_palier,
-- palier_pas_atteint, deja_pris ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne donne rien.
create or replace function public.prendre_palier(p_palier integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_saison internal.sentier_saisons%rowtype;
  v_rarete text;
  v_emplacement text;
  v_objet text;
  v_quantite integer;
  v_insigne jsonb := null;
  v_essai boolean := false;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    -- Pendant un essai du mode GOD, l'inventaire revient à sa copie à la fin : l'objet d'un palier partirait avec l'essai,
    -- et le palier resterait pris.
    if to_regclass('internal.village_god') is not null then
      execute 'select exists (select 1 from internal.village_god d where d.user_id = $1)' into v_essai using v_uid;
      if v_essai then perform internal.fail('mode_god'); end if;
    end if;
    select s.* into v_saison from internal.sentier_saisons s where s.saison = internal.sentier_saison_montree(internal.sentier_jour(now()));
    if v_saison.saison is null then perform internal.fail('saison_fermee'); end if;
    select p.rarete into v_rarete from internal.sentier_paliers p
    where p.saison = v_saison.saison and p.palier = p_palier and p.palier <= v_saison.paliers;
    if v_rarete is null then perform internal.fail('unknown_palier'); end if;
    perform internal.sentier_regler(v_uid);
    if internal.sentier_pas(v_uid, v_saison.saison) < p_palier * v_saison.pas_par_palier then perform internal.fail('palier_pas_atteint'); end if;
    if exists (select 1 from internal.sentier_pris x where x.user_id = v_uid and x.saison = v_saison.saison and x.palier = p_palier) then
      perform internal.fail('deja_pris');
    end if;
    if p_palier = v_saison.paliers and v_saison.objet is not null then
      -- Le dernier palier : l'objet de la saison, qu'on n'obtient que là.
      select o.emplacement, o.objet, o.rarete into v_emplacement, v_objet, v_rarete
      from internal.gaulois_objets o where o.emplacement = v_saison.objet_emplacement and o.objet = v_saison.objet;
    else
      -- Un objet que le compte n'a pas d'abord ; à égalité, le hasard.
      select o.emplacement, o.objet into v_emplacement, v_objet
      from internal.gaulois_objets o
      where o.rarete = v_rarete and not o.gratuit
      order by exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = o.emplacement and i.objet = o.objet),
               internal.village_hasard()
      limit 1;
    end if;
    if v_objet is null then perform internal.fail('invalid_request'); end if;
    insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine)
    values (v_uid, v_emplacement, v_objet, 1, 'pochette')
    on conflict (user_id, emplacement, objet) do update
      set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = now()
    returning i.quantite into v_quantite;
    insert into internal.sentier_pris (user_id, saison, palier, emplacement, objet)
    values (v_uid, v_saison.saison, p_palier, v_emplacement, v_objet);
    if p_palier = v_saison.paliers then
      insert into internal.pass_insignes (user_id, saison) values (v_uid, v_saison.saison) on conflict (user_id, saison) do nothing;
      v_insigne := jsonb_build_object('saison', v_saison.saison, 'nom', v_saison.nom);
    end if;
    return jsonb_build_object(
      'ok', true,
      'palier', p_palier,
      'objet', jsonb_build_object('emplacement', v_emplacement, 'objet', v_objet, 'rarete', v_rarete, 'double', v_quantite > 1),
      'insigne', v_insigne
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.prendre_palier(integer) from public, anon, authenticated;
grant execute on function public.prendre_palier(integer) to authenticated;

/* ---------- Le pass du compte connecté, remplacée ---------- */

-- Le pass du compte connecté. Celle de la 20261116001100, avec deux ajouts :
-- - saison.objet : { emplacement, objet } l'objet de la saison, donné au dernier palier, ou null ;
-- - insignes : les insignes de saison du compte, [{ saison, nom, obtenu_le }], le plus récent d'abord.
-- Le reste ne change pas : { ok: true, peut_avancer, solde, jour, releve, regles, saison, pas, paliers, visites, missions,
-- defi, etal, insignes }. Jamais le pass, le solde ni les objets d'un autre.
create or replace function public.get_mon_sentier() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_peut boolean;
  v_jour date := internal.sentier_jour(now());
  v_saison internal.sentier_saisons%rowtype;
  v_j internal.sentier_jours%rowtype;
  v_finie boolean;
  v_rarete text;
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
  v_peut := v_status = 'validated' and exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  perform internal.sentier_ouvrir_jour(v_jour);
  if v_peut then
    perform internal.crediter_stateres(v_uid);
    perform internal.sentier_cocher(v_uid);
    perform internal.sentier_regler(v_uid);
  end if;
  select s.* into v_saison from internal.sentier_saisons s where s.saison = internal.sentier_saison_montree(v_jour);
  v_finie := v_saison.saison is not null and v_saison.fin < v_jour;
  select j.* into v_j from internal.sentier_jours j where j.jour = v_jour;
  select o.rarete into v_rarete from internal.gaulois_objets o where o.emplacement = v_j.etal_emplacement and o.objet = v_j.etal_objet;
  return jsonb_build_object(
    'ok', true,
    'peut_avancer', v_peut,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'jour', v_jour,
    'releve', (select r.le from internal.stateres_releve r where r.id),
    'regles', jsonb_build_object(
      'mission', internal.sentier_pas_mission(),
      'visite', internal.sentier_pas_visite(),
      'semaine', internal.sentier_pas_semaine(),
      'tous_les', 7,
      'defi', internal.sentier_pas_defi(),
      'remise', internal.sentier_remise()
    ),
    'saison', case when v_saison.saison is null then null else jsonb_build_object(
      'id', v_saison.saison, 'nom', v_saison.nom, 'debut', v_saison.debut, 'fin', v_saison.fin,
      'paliers', v_saison.paliers, 'pas_par_palier', v_saison.pas_par_palier,
      'finie', v_finie, 'prendre_jusqu_au', v_saison.fin + internal.sentier_delai(),
      'objet', case when v_saison.objet is null then null
        else jsonb_build_object('emplacement', v_saison.objet_emplacement, 'objet', v_saison.objet) end
    ) end,
    'pas', case when v_saison.saison is null then 0 else internal.sentier_pas(v_uid, v_saison.saison) end,
    'paliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'palier', p.palier,
        'rarete', p.rarete,
        'pris', (select jsonb_build_object('emplacement', x.emplacement, 'objet', x.objet)
                 from internal.sentier_pris x where x.user_id = v_uid and x.saison = p.saison and x.palier = p.palier)
      ) order by p.palier)
      from internal.sentier_paliers p
      where p.saison = v_saison.saison and p.palier <= v_saison.paliers), '[]'::jsonb),
    'visites', coalesce((
      select count(*)::integer from internal.sentier_visites v
      where v.user_id = v_uid and v.jour between v_saison.debut and v_saison.fin), 0),
    'missions', case when v_saison.saison is null or v_finie then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', m.code,
        'fait', trim_scale(m.fait),
        'cible', trim_scale(m.cible),
        'gagnee', exists (select 1 from internal.sentier_gains g where g.user_id = v_uid and g.jour = v_jour and g.source = 'mission/' || m.code)
      ) order by m.rang)
      from internal.sentier_missions_de(v_uid, v_jour) m), '[]'::jsonb) end,
    'defi', case when v_saison.saison is null or v_finie or v_j.defi is null then null else jsonb_build_object(
      'cible', v_j.defi,
      'points', trim_scale(internal.sentier_points_du_clan(v_jour)),
      'joue', (select f.parties >= 1 from internal.sentier_faits(v_uid, v_jour) f),
      'gagne', exists (select 1 from internal.sentier_gains g where g.user_id = v_uid and g.jour = v_jour and g.source = 'defi')
    ) end,
    'etal', case when v_j.etal_objet is null or v_rarete is null or internal.sentier_prix_etal(v_rarete) is null then null else jsonb_build_object(
      'emplacement', v_j.etal_emplacement,
      'objet', v_j.etal_objet,
      'rarete', v_rarete,
      'prix', internal.sentier_prix_etal(v_rarete),
      'prix_boutique', (select p.prix from internal.village_prix p where p.rarete = v_rarete),
      'possede', exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = v_j.etal_emplacement and i.objet = v_j.etal_objet)
        or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = v_j.etal_emplacement and m.objet = v_j.etal_objet)
    ) end,
    'insignes', internal.pass_insignes_json(v_uid)
  );
end $$;

revoke all on function public.get_mon_sentier() from public, anon, authenticated;
grant execute on function public.get_mon_sentier() to authenticated;

/* ---------- Pour la construction du site ---------- */

-- Les insignes de saison des membres au pseudo public, pour leur carte sur les pages du site : { ok: true, insignes:
-- { <empreinte>: [saison, ...] } }, du plus ancien au plus récent, seulement pour les empreintes demandées qui en ont. Comme
-- bannieres_des_joueurs : un compte validé, lié à Discord, au pseudo public ; jamais un identifiant ni un nom.
create or replace function public.insignes_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_insignes jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(x.empreinte, x.saisons), '{}'::jsonb) into v_insignes
  from (
    select l.openfront_hash as empreinte, jsonb_agg(i.saison order by s.debut) as saisons
    from (select distinct e from unnest(p_empreintes) e) d
    join public.private_links l on l.openfront_hash = d.e
    join public.profiles p on p.user_id = l.user_id
    join internal.pass_insignes i on i.user_id = l.user_id
    join internal.sentier_saisons s on s.saison = i.saison
    where p.status = 'validated'
      and l.discord_id is not null
      and internal.member_pseudo(l.user_id) is not null
    group by l.openfront_hash
  ) x;
  return jsonb_build_object('ok', true, 'insignes', v_insignes);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de l'Action, l'appelle.
revoke all on function public.insignes_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.insignes_des_joueurs(text[]) to service_role;
