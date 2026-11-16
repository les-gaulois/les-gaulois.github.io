-- Le divin et la fusion à la forge (docs/DIRECTION.md, « Le village des Gaulois » ; formes des réponses :
-- src/lib/village/contrat.ts ; dessins : supabase/functions/code-discord/garde-robe/divin.ts).
--
-- Demandes du pilote, 16 novembre 2026 : « 3 tenues ensemble, séparées en plusieurs cosmétiques, 10 fois plus rares que les
-- légendaires et obtenables uniquement dans la pochette […] quelque chose qui claque plus que légendaire », et « changer la
-- fonctionnalité de la forge : tant d'objets rares fusionnés deviennent épique, tant d'épiques deviennent légendaire ».
--
-- 1. LE DIVIN
-- - Une sixième rareté pour les objets, 'divin', au-dessus du légendaire. Ses objets vont par tenues de cinq pièces (tête,
--   haut, bas, pieds, arme), choisies par le pilote sur planches ; leur liste est plus bas, écrite depuis les dessins.
-- - Un objet divin n'a pas de prix (aucune ligne dans internal.village_prix). Il ne s'achète donc pas : acheter_objet, qui
--   ne change pas, répond 'unknown_objet' pour un objet sans prix. Il ne se vend pas au marché : mettre_en_vente, qui ne
--   change pas, répond 'prix_invalide' faute de plafond. La forge n'en fabrique pas : la fusion s'arrête au légendaire. Il
--   ne sort que de la pochette surprise.
-- - Sa chance dans la pochette surprise : celle du légendaire divisée par dix (internal.village_chance_divine), prise sur
--   celle du commun, et jamais plus que celle-ci. Au réglage de départ : 0,2 pour cent, le commun passant de 50 à 49,8. Elle
--   suit le réglage de la Direction (regler_village_pochette, inchangée, cinq chances qui font 100) sans champ de plus.
--   Puis un des objets divins, tous à chances égales, comme pour les autres raretés ; un double est possible.
-- - get_ma_boutique rend les cinq chances réglées, comme avant, et à part `pochette.divin` : un site d'avant cette
--   migration continue de lire la boutique.
-- - Un objet divin se porte, se grave à la forge et reste dans la sauvegarde comme tout objet de l'inventaire.
-- - L'onglet Village de la Direction ne change pas : son détail des pochettes par rareté ne compte pas le divin (le total
--   des pochettes, lui, le compte).
--
-- 2. LA FUSION
-- - À la forge, un membre validé qui a créé son Gaulois donne trois objets payants d'une même rareté (trois exemplaires
--   de son inventaire, d'un même objet ou non) et reçoit un objet payant de la rareté suivante, tiré au hasard parmi tous
--   ceux de cette rareté, à chances égales : commun, peu commun, épique, mystique, légendaire. Un double est possible ; il
--   se fond à son tour ou se vend au marché. Ni le légendaire ni le divin ne se fondent ('rarete_sans_fusion').
-- - Elle ne coûte aucun statère et n'écrit rien au journal des statères. Aux prix de départ, trois objets valent plus, à
--   la boutique, que celui qu'ils donnent (300 pour 250, 750 pour 500, 1 500 pour 1 000, 3 000 pour 2 500).
-- - Le dernier exemplaire d'un objet que le Gaulois porte ('objet_porte') ou qui porte une plaque ('objet_grave') ne se
--   donne pas, comme au marché. Les exemplaires venus du marché partent les premiers ; l'objet reçu compte comme sorti
--   d'une pochette (il se revend), sauf si les trois objets donnés venaient du marché : il compte alors comme venu du
--   marché, et ne se revend pas (la règle du marché tient). Le nombre d'objets ne fait que baisser : aucun statère ne se crée.
-- - Le hasard vient du générateur sûr de Postgres (internal.village_hasard). Tout se fait sous le verrou du compte.
-- - internal.forge_fusions garde chaque fusion (le compte, ce qui a été donné, ce qui a été reçu, l'heure), pour répondre à
--   une réclamation. Elle n'est lue par aucune fonction publique et n'est pas dans la sauvegarde (l'inventaire, lui, y est).
-- - La gravure d'une partie sur un objet ne change pas.
--
-- Qui peut quoi :
-- - fusionner_objets : un compte validé qui a créé son Gaulois, pour ses propres objets. Limitée comme les gestes.
-- - get_ma_forge, graver_objet, effacer_gravure : inchangées ; leur réponse (internal.forge_json, remplacée ligne pour
--   ligne depuis la 20261114001000) donne en plus `fusion`.
-- - ouvrir_pochette (remplacée ligne pour ligne depuis la 20261113001900) : tire avec le divin.
-- - get_ma_boutique (remplacée ligne pour ligne depuis la 20261113002000) : rend en plus `pochette.divin`.
--
-- Une contrainte élargie, les objets divins, une table et cinq fonctions ajoutées, trois fonctions remplacées. Aucune table ni
-- colonne retirée, aucune donnée existante touchée. Rejouée, elle se remplace par la même.

/* ---------- La rareté et ses objets ---------- */

-- La contrainte des raretés, élargie au divin. Elle est retirée par son contenu, quel que soit son nom, puis remise.
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
    check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire', 'divin'));
end $$;

-- <objets-divins> : écrit depuis supabase/functions/code-discord/garde-robe/divin.ts ; ne pas modifier à la main.
insert into internal.gaulois_objets (emplacement, objet, rarete, gratuit) values
  ('tete', 'tete-introuvable', 'divin', false),
  ('haut', 'torse-en-chargement', 'divin', false),
  ('bas', 'braies-sans-texture', 'divin', false),
  ('pieds', 'bottes-sans-texture', 'divin', false),
  ('arme', 'panneau-d-erreur', 'divin', false),
  ('tete', 'soucoupe-curieuse', 'divin', false),
  ('haut', 'costume-de-vache', 'divin', false),
  ('bas', 'braies-de-vache', 'divin', false),
  ('pieds', 'sabots-de-vache', 'divin', false),
  ('arme', 'pancarte-par-ici', 'divin', false),
  ('tete', 'champignon-atomique', 'divin', false),
  ('haut', 'combinaison-jaune', 'divin', false),
  ('bas', 'braies-etanches', 'divin', false),
  ('pieds', 'bottes-de-decontamination', 'divin', false),
  ('arme', 'gros-bouton-rouge', 'divin', false),
  ('tete', 'ogive', 'divin', false),
  ('haut', 'fuselage', 'divin', false),
  ('bas', 'ailerons', 'divin', false),
  ('pieds', 'tuyeres', 'divin', false),
  ('arme', 'telecommande-de-tir', 'divin', false)
on conflict (emplacement, objet) do nothing;
-- </objets-divins>

/* ---------- La pochette surprise ---------- */

-- La chance du divin dans la pochette surprise, en pour cent : celle du légendaire divisée par dix, jamais plus que celle du
-- commun, sur laquelle elle est prise. Le même calcul que chancesAvecLeDivin de contrat.ts (un test garde le diviseur).
create or replace function internal.village_chance_divine() returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select least(p.legendaire / 10.0, p.commun) from internal.village_pochette p where p.id), 0)
$$;

-- Les chances du tirage, une ligne par rareté, divin compris : celles du réglage (internal.village_chances), le commun
-- diminué de la chance du divin. Leur somme reste 100.
create or replace function internal.village_chances_tirage() returns table (rarete text, rang integer, chance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.rarete, c.rang, case when c.rarete = 'commun' then c.chance - internal.village_chance_divine() else c.chance end
  from internal.village_chances() c
  union all
  select 'divin', 6, internal.village_chance_divine()
$$;

revoke all on function internal.village_chance_divine() from public, anon, authenticated;
revoke all on function internal.village_chances_tirage() from public, anon, authenticated;

-- Comme la version de 20261113001900 (mêmes droits, mêmes refus, même réponse), au tirage près : la rareté se tire parmi
-- les chances du tirage, divin compris.
create or replace function public.ouvrir_pochette(p_prix_vu integer) returns jsonb
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
  v_emplacement text;
  v_objet text;
  v_quantite integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    select p.prix into v_prix from internal.village_pochette p where p.id;
    if v_prix is not null and p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    -- La rareté : parmi celles qui ont des chances et au moins un objet payant, selon leurs chances.
    -- Changement de 20261116000300 : les chances du tirage, divin compris (internal.village_chances_tirage).
    select sum(c.chance) into v_total from internal.village_chances_tirage() c
    where c.chance > 0 and exists (select 1 from internal.gaulois_objets o where o.rarete = c.rarete and not o.gratuit);
    if v_prix is null or v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.village_chances_tirage() c
      where c.chance > 0 and exists (select 1 from internal.gaulois_objets o where o.rarete = c.rarete and not o.gratuit)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    -- L'objet : un des objets payants de cette rareté, tous à chances égales.
    select count(*)::integer into v_n from internal.gaulois_objets o where o.rarete = v_rarete and not o.gratuit;
    select o.emplacement, o.objet into v_emplacement, v_objet
    from internal.gaulois_objets o
    where o.rarete = v_rarete and not o.gratuit
    order by o.emplacement, o.objet
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, v_emplacement || '/' || v_objet);
    insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine)
    values (v_uid, v_emplacement, v_objet, 1, 'pochette')
    on conflict (user_id, emplacement, objet) do update
      set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = now()
    returning i.quantite into v_quantite;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'objet', jsonb_build_object('emplacement', v_emplacement, 'objet', v_objet, 'rarete', v_rarete, 'double', v_quantite > 1)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette(integer) to authenticated;

-- Comme la version de 20261113002000 (mêmes droits, mêmes refus, mêmes champs), avec en plus `pochette.divin`.
create or replace function public.get_ma_boutique() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_gaulois boolean;
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
  -- Ajout de 20261113002000 : les offres finies rendent leur objet.
  perform internal.marche_expirer();
  v_gaulois := exists (select 1 from internal.gaulois g where g.user_id = v_uid);
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.village_prix p),
    'pochette', jsonb_build_object(
      'prix', (select p.prix from internal.village_pochette p where p.id),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.village_chances() c),
      -- Ajout de 20261116000300 : la chance du divin, prise sur celle du commun.
      'divin', trim_scale(internal.village_chance_divine())
    ),
    'inventaire', coalesce((
      select jsonb_agg(jsonb_build_object('emplacement', i.emplacement, 'objet', i.objet, 'quantite', i.quantite, 'origine', i.origine, 'acquis_le', i.acquis_le)
        order by i.acquis_le desc, i.emplacement, i.objet)
      from internal.gaulois_inventaire i
      where i.user_id = v_uid), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_ma_boutique() from public, anon, authenticated;
grant execute on function public.get_ma_boutique() to authenticated;

/* ---------- La fusion à la forge ---------- */

create table if not exists internal.forge_fusions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  -- La rareté des objets donnés, ce qui a été donné ([{ emplacement, objet }]) et l'objet reçu.
  rarete text not null,
  donnes jsonb not null,
  emplacement text not null,
  objet text not null,
  cree_le timestamptz not null default now(),
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet)
);

-- Table privée : seule la fusion y écrit.
alter table internal.forge_fusions enable row level security;
revoke all on table internal.forge_fusions from public, anon, authenticated;

-- Combien d'objets d'une rareté donnent un objet de la suivante : le même nombre que OBJETS_POUR_UNE_FUSION de contrat.ts.
create or replace function internal.forge_fusion_nombre() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 3 $$;

-- La rareté qu'on obtient en fondant des objets de `p_rarete` ; null pour le légendaire et le divin, qui ne se fondent pas.
create or replace function internal.forge_rarete_suivante(p_rarete text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_rarete
    when 'commun' then 'peu-commun'
    when 'peu-commun' then 'epique'
    when 'epique' then 'mystique'
    when 'mystique' then 'legendaire'
  end
$$;

revoke all on function internal.forge_fusion_nombre() from public, anon, authenticated;
revoke all on function internal.forge_rarete_suivante(text) from public, anon, authenticated;

-- Comme la version de 20261114001000 (mêmes champs), avec en plus `fusion`.
create or replace function internal.forge_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'prix', internal.forge_prix(),
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_uid), 0),
    'peut_graver', exists (
      select 1 from public.profiles p join internal.gaulois g on g.user_id = p.user_id
      where p.user_id = p_uid and p.status = 'validated'),
    'plaques_vues', internal.member_pseudo(p_uid) is not null,
    'parties', coalesce((
      select jsonb_agg(jsonb_build_object('partie', c.partie, 'debut', c.debut, 'jour', c.jour, 'gaulois', c.gaulois,
          'points', c.points, 'texte', internal.forge_plaque(c.jour, c.gaulois, c.points)) order by c.debut desc, c.partie)
      from (
        select m.partie, m.debut, (m.debut at time zone 'Europe/Paris')::date as jour, m.gaulois, m.points
        from internal.stateres_mouvements m
        where m.user_id = p_uid and m.nature = 'victoire'
        order by m.debut desc, m.partie
        limit 100
      ) c), '[]'::jsonb),
    'objets', coalesce((
      select jsonb_agg(jsonb_build_object('emplacement', f.emplacement, 'objet', f.objet,
          'porte', coalesce(g.tenue ->> f.emplacement = f.objet, false),
          'gravure', case when gr.user_id is null then null else jsonb_build_object('jour', gr.jour, 'gaulois', gr.gaulois,
            'points', gr.points, 'texte', internal.forge_plaque(gr.jour, gr.gaulois, gr.points), 'grave_le', gr.grave_le) end)
        order by f.rang, f.objet)
      from internal.forge_objets(p_uid) f
      left join internal.gaulois g on g.user_id = p_uid
      left join internal.gaulois_gravures gr on gr.user_id = p_uid and gr.emplacement = f.emplacement and gr.objet = f.objet), '[]'::jsonb),
    -- Ajout de 20261116000300 : la fusion. `nombre` : combien d'objets d'une rareté donnent un objet de la suivante ;
    -- `objets` : ses objets qui peuvent se fondre (du commun au mystique), { emplacement, objet, rarete, quantite, libres },
    -- `libres` : les exemplaires qu'il peut donner (le dernier exemplaire d'un objet porté ou gravé reste).
    'fusion', jsonb_build_object(
      'nombre', internal.forge_fusion_nombre(),
      'objets', coalesce((
        select jsonb_agg(jsonb_build_object('emplacement', i.emplacement, 'objet', i.objet, 'rarete', o.rarete, 'quantite', i.quantite,
            'libres', i.quantite - case when coalesce(g.tenue ->> i.emplacement = i.objet, false) or gr.user_id is not null then 1 else 0 end)
          order by array_position(array['commun', 'peu-commun', 'epique', 'mystique'], o.rarete),
            array_position(array['tete', 'haut', 'bas', 'pieds', 'arme'], i.emplacement), i.objet)
        from internal.gaulois_inventaire i
        join internal.gaulois_objets o on o.emplacement = i.emplacement and o.objet = i.objet
        left join internal.gaulois g on g.user_id = p_uid
        left join internal.gaulois_gravures gr on gr.user_id = p_uid and gr.emplacement = i.emplacement and gr.objet = i.objet
        where i.user_id = p_uid and not o.gratuit and internal.forge_rarete_suivante(o.rarete) is not null), '[]'::jsonb)
    )
  )
$$;

revoke all on function internal.forge_json(uuid) from public, anon, authenticated;

-- Fond les objets `p_objets` ([{ emplacement, objet }], autant que internal.forge_fusion_nombre, le même objet pouvant y
-- être plusieurs fois) en un objet de la rareté suivante, tiré au hasard, et répond { ok: true, recu: { emplacement, objet,
-- rarete, double }, forge } (`forge` : la forge à jour). Refus, dans cet ordre : not_validated, no_gaulois ;
-- fusion_invalide (pas la bonne liste) ; unknown_objet (un objet hors du catalogue, ou gratuit) ; raretes_melangees ;
-- rarete_sans_fusion (légendaire ou divin) ; pas_possede (pas assez d'exemplaires) ; objet_porte, objet_grave (le dernier
-- exemplaire d'un objet porté ou gravé) ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne
-- prend aucun objet.
create or replace function public.fusionner_objets(p_objets jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_n integer := internal.forge_fusion_nombre();
  v_trouves integer;
  v_raretes integer;
  v_rarete text;
  v_suivante text;
  v_r record;
  v_ligne internal.gaulois_inventaire;
  v_k integer;
  v_emplacement text;
  v_objet text;
  v_quantite integer;
  v_du_marche integer := 0;
  v_donnes jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- La fin des offres, avant le verrou du compte (verrou du marché d'abord), et hors du bloc protégé.
  perform internal.marche_expirer();
  begin
    v_uid := internal.village_acheteur();
    -- Le type d'abord, à part : les lectures d'un tableau échoueraient sur autre chose.
    if p_objets is null or jsonb_typeof(p_objets) <> 'array' then perform internal.fail('fusion_invalide'); end if;
    if jsonb_array_length(p_objets) <> v_n
      or exists (
        select 1 from jsonb_array_elements(p_objets) e
        where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'emplacement') is distinct from 'string' or jsonb_typeof(e -> 'objet') is distinct from 'string')
    then
      perform internal.fail('fusion_invalide');
    end if;
    perform internal.village_verrou(v_uid);
    -- Tous au catalogue, payants, et d'une seule rareté, qui a une suivante.
    select count(*)::integer, count(distinct o.rarete)::integer, min(o.rarete) into v_trouves, v_raretes, v_rarete
    from jsonb_array_elements(p_objets) e
    join internal.gaulois_objets o on o.emplacement = e ->> 'emplacement' and o.objet = e ->> 'objet'
    where not o.gratuit and o.rarete is not null;
    if v_trouves <> v_n then perform internal.fail('unknown_objet'); end if;
    if v_raretes <> 1 then perform internal.fail('raretes_melangees'); end if;
    v_suivante := internal.forge_rarete_suivante(v_rarete);
    if v_suivante is null then perform internal.fail('rarete_sans_fusion'); end if;
    -- Assez d'exemplaires de chacun ; le dernier exemplaire d'un objet porté ou gravé reste à son propriétaire.
    for v_r in
      select e ->> 'emplacement' as emplacement, e ->> 'objet' as objet, count(*)::integer as nombre
      from jsonb_array_elements(p_objets) e group by 1, 2 order by 1, 2
    loop
      select * into v_ligne from internal.gaulois_inventaire i
      where i.user_id = v_uid and i.emplacement = v_r.emplacement and i.objet = v_r.objet
      for update;
      if not found or v_ligne.quantite < v_r.nombre then perform internal.fail('pas_possede'); end if;
      -- Les exemplaires venus du marché partent les premiers : combien en partent.
      v_du_marche := v_du_marche + least(v_ligne.du_marche, v_r.nombre);
      if v_ligne.quantite = v_r.nombre then
        if exists (select 1 from internal.gaulois g where g.user_id = v_uid and g.tenue ->> v_r.emplacement = v_r.objet) then
          perform internal.fail('objet_porte');
        end if;
        if exists (select 1 from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = v_r.emplacement and gr.objet = v_r.objet) then
          perform internal.fail('objet_grave');
        end if;
      end if;
    end loop;
    -- L'objet reçu : un des objets payants de la rareté suivante, tous à chances égales.
    select count(*)::integer into v_k from internal.gaulois_objets o where o.rarete = v_suivante and not o.gratuit;
    if v_k = 0 then perform internal.fail('invalid_request'); end if;
    select o.emplacement, o.objet into v_emplacement, v_objet
    from internal.gaulois_objets o
    where o.rarete = v_suivante and not o.gratuit
    order by o.emplacement, o.objet
    offset least(floor(internal.village_hasard() * v_k)::integer, v_k - 1)
    limit 1;
    -- Les objets donnés quittent l'inventaire : les exemplaires venus du marché d'abord.
    for v_r in
      select e ->> 'emplacement' as emplacement, e ->> 'objet' as objet, count(*)::integer as nombre
      from jsonb_array_elements(p_objets) e group by 1, 2 order by 1, 2
    loop
      delete from internal.gaulois_inventaire i
      where i.user_id = v_uid and i.emplacement = v_r.emplacement and i.objet = v_r.objet and i.quantite = v_r.nombre;
      if not found then
        update internal.gaulois_inventaire i
        set quantite = i.quantite - v_r.nombre,
          du_marche = greatest(i.du_marche - v_r.nombre, 0),
          origine = case
            when i.quantite - v_r.nombre = greatest(i.du_marche - v_r.nombre, 0) then 'marche'
            when i.origine = 'marche' then 'achat'
            else i.origine end
        where i.user_id = v_uid and i.emplacement = v_r.emplacement and i.objet = v_r.objet;
      end if;
    end loop;
    -- Tous les objets donnés venaient du marché : l'objet reçu aussi, il ne se revend pas.
    insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine, du_marche)
    values (v_uid, v_emplacement, v_objet, 1, case when v_du_marche = v_n then 'marche' else 'pochette' end, case when v_du_marche = v_n then 1 else 0 end)
    on conflict (user_id, emplacement, objet) do update
      set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = now(), du_marche = i.du_marche + excluded.du_marche
    returning i.quantite into v_quantite;
    -- Ce qui a été donné, réduit à l'emplacement et à l'objet de chaque exemplaire.
    select jsonb_agg(jsonb_build_object('emplacement', e ->> 'emplacement', 'objet', e ->> 'objet')) into v_donnes from jsonb_array_elements(p_objets) e;
    insert into internal.forge_fusions (user_id, rarete, donnes, emplacement, objet)
    values (v_uid, v_rarete, v_donnes, v_emplacement, v_objet);
    return jsonb_build_object(
      'ok', true,
      'recu', jsonb_build_object('emplacement', v_emplacement, 'objet', v_objet, 'rarete', v_suivante, 'double', v_quantite > 1),
      'forge', internal.forge_json(v_uid)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.fusionner_objets(jsonb) from public, anon, authenticated;
grant execute on function public.fusionner_objets(jsonb) to authenticated;
