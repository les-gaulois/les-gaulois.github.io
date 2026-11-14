-- Le village des Gaulois, finitions : l'onglet « Village » de la Direction (docs/DIRECTION.md, « Le village des Gaulois » ;
-- lecture et contrôles côté site : src/lib/village/direction.ts, écran : src/components/compte/DirectionVillage.tsx).
--
-- Deux besoins de l'encadrement, le 13 novembre 2026 : suivre l'économie du village, et régler les prix et les chances sans
-- toucher au code (le pilote ne développe pas : c'est là qu'il les réglera).
--
-- get_village_economie, pour l'encadrement (officiers et au-dessus, comme l'activité du site) : des totaux seulement, jamais
-- le solde ni les achats d'un membre. Depuis le début et sur les 30 derniers jours : les Gaulois créés, les comptes qui ont
-- reçu des statères, les statères distribués (les points rapportés au clan, nature 'victoire' du journal des statères),
-- dépensés à la boutique (nature 'achat') et en pochettes (nature 'pochette'), les objets achetés et les pochettes ouvertes
-- par rareté (la rareté de l'objet reçu, lue dans `ref`) ; depuis le début seulement, les statères encore en circulation
-- (la somme du journal de tous les comptes, qui est la somme des soldes : la table des soldes n'est lue que par les fonctions
-- d'un compte pour lui-même). Puis l'heure de la dernière relecture des parties et les réglages en vigueur. Tout vient du
-- journal des statères (internal.stateres_mouvements, migration 20261113001800), qui s'efface avec un compte : un compte
-- supprimé sort aussi de ces totaux.
--
-- Le seuil : 5 comptes. Un chiffre qui viendrait d'un, deux, trois ou quatre comptes pourrait désigner quelqu'un : il n'est
-- pas donné (null, que l'écran écrit « pas donné »). Aucun compte : le chiffre vaut 0, c'est un vrai zéro. Les nombres de
-- comptes eux-mêmes (Gaulois créés, comptes crédités) sont toujours donnés : ils ne disent rien de ce que possède quelqu'un.
-- Le seuil se pose par groupe de comptes, et aussi là où une soustraction redonnerait un chiffre caché :
-- - les statères distribués : les comptes qui en ont reçu ;
-- - les dépenses en tout : les comptes qui ont acheté à la boutique ou ouvert une pochette ;
-- - le partage entre boutique et pochettes, et le détail par rareté : en plus, les acheteurs de la boutique et ceux qui ont
--   ouvert une pochette, chacun de son côté (sinon le total moins l'un donnerait l'autre ; et le détail par rareté, multiplié
--   par les prix, redonnerait le montant de la boutique) ;
-- - les statères en circulation : les comptes qui en ont. Et comme distribués moins dépensés égale en circulation, un seul des
--   trois ne reste jamais caché : trop peu de comptes qui ont encore des statères cachent aussi les distribués ; trop peu de
--   comptes qui en ont reçu ou dépensé cachent aussi la circulation ;
-- - sur 30 jours : en plus, la part d'avant ces 30 jours doit passer le même seuil (sinon le total moins les 30 jours la
--   donnerait).
-- Le seuil n'empêche pas tout recoupement : deux lectures faites à des moments différents peuvent se soustraire, et un chiffre
-- donné peut venir pour l'essentiel d'un seul compte d'un groupe de cinq. Il ne dit jamais lequel.
--
-- regler_village_prix(p_prix) et regler_village_pochette(p_prix, p_chances), pour les admins et le fondateur, comme les autres
-- réglages de la Direction (salons Discord, salon vocal) : contrôles stricts, tout ou rien, et une ligne au journal de
-- l'encadrement à chaque changement, avec les valeurs d'avant et d'après ('village_prix_saved', 'village_pochette_saved').
-- Les mêmes valeurs qu'avant ne changent rien et ne notent rien. Les prix : un objet JSON avec les cinq raretés, chacune un
-- nombre entier de 1 à 1 000 000 statères, chaque rareté plus chère que la précédente. La pochette : un prix entier de 1 à
-- 1 000 000 statères, et cinq chances, des nombres entiers de 0 à 100 pour cent, 100 en tout ; une rareté qui a une chance
-- doit avoir au moins un objet payant. Des chances entières, comme le contrat (src/lib/village/contrat.ts) et la mesure de
-- l'économie (controlerReglages, src/lib/village/economie.ts) : la table en accepte deux décimales, l'écran n'en propose pas.
-- Deux réglages au même instant passent l'un après l'autre (un verrou), et le journal dit le vrai « avant ». La boutique
-- applique un nouveau prix dès l'achat suivant.
--
-- Aucune table ajoutée : les réglages sont dans internal.village_prix et internal.village_pochette (migration
-- 20261113001900), déjà privées, RLS active. Neuf fonctions ajoutées, aucune donnée retirée. Rejouée, elle se remplace par la
-- même.

/* ---------- Le seuil ---------- */

-- Le nombre de comptes sous lequel un chiffre n'est pas donné.
create or replace function internal.village_seuil() returns integer
language sql immutable set search_path = public, pg_temp as $$
  select 5
$$;

-- Un groupe de comptes passe le seuil : aucun compte (le chiffre est un vrai zéro), ou au moins cinq.
create or replace function internal.village_passe(p_comptes bigint) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_comptes is not null and (p_comptes = 0 or p_comptes >= internal.village_seuil())
$$;

revoke all on function internal.village_seuil() from public, anon, authenticated;
revoke all on function internal.village_passe(bigint) from public, anon, authenticated;

/* ---------- La lecture de l'encadrement ---------- */

create or replace function public.get_village_economie() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
  v_depuis timestamptz := now() - interval '30 days';
  v_j record;
  v_gaulois bigint;
  v_gaulois_30 bigint;
  v_circulation bigint;
  v_detenteurs bigint;
  v_achats jsonb;
  v_achats_30 jsonb;
  v_ouvertures jsonb;
  v_ouvertures_30 jsonb;
  v_distribues boolean;
  v_depenses boolean;
  v_circule boolean;
  v_partage boolean;
  v_partage_30 boolean;
begin
  perform internal.require_rank(2);

  -- Le journal des statères : pour chaque groupe, ses comptes (depuis le début, sur 30 jours, avant ces 30 jours) et ses sommes.
  select
    min(m.cree_le) as debut,
    count(distinct m.user_id) filter (where m.nature = 'victoire') as recus,
    count(distinct m.user_id) filter (where m.nature = 'victoire' and m.cree_le >= v_depuis) as recus_30,
    count(distinct m.user_id) filter (where m.nature = 'victoire' and m.cree_le < v_depuis) as recus_avant,
    coalesce(sum(m.montant) filter (where m.nature = 'victoire'), 0) as distribues,
    coalesce(sum(m.montant) filter (where m.nature = 'victoire' and m.cree_le >= v_depuis), 0) as distribues_30,
    count(distinct m.user_id) filter (where m.nature in ('achat', 'pochette')) as depensiers,
    count(distinct m.user_id) filter (where m.nature in ('achat', 'pochette') and m.cree_le >= v_depuis) as depensiers_30,
    count(distinct m.user_id) filter (where m.nature in ('achat', 'pochette') and m.cree_le < v_depuis) as depensiers_avant,
    coalesce(-(sum(m.montant) filter (where m.nature in ('achat', 'pochette'))), 0) as depenses,
    coalesce(-(sum(m.montant) filter (where m.nature in ('achat', 'pochette') and m.cree_le >= v_depuis)), 0) as depenses_30,
    count(distinct m.user_id) filter (where m.nature = 'achat') as acheteurs,
    count(distinct m.user_id) filter (where m.nature = 'achat' and m.cree_le >= v_depuis) as acheteurs_30,
    count(distinct m.user_id) filter (where m.nature = 'achat' and m.cree_le < v_depuis) as acheteurs_avant,
    coalesce(-(sum(m.montant) filter (where m.nature = 'achat')), 0) as boutique,
    coalesce(-(sum(m.montant) filter (where m.nature = 'achat' and m.cree_le >= v_depuis)), 0) as boutique_30,
    count(distinct m.user_id) filter (where m.nature = 'pochette') as ouvreurs,
    count(distinct m.user_id) filter (where m.nature = 'pochette' and m.cree_le >= v_depuis) as ouvreurs_30,
    count(distinct m.user_id) filter (where m.nature = 'pochette' and m.cree_le < v_depuis) as ouvreurs_avant,
    coalesce(-(sum(m.montant) filter (where m.nature = 'pochette')), 0) as pochettes,
    coalesce(-(sum(m.montant) filter (where m.nature = 'pochette' and m.cree_le >= v_depuis)), 0) as pochettes_30
  into v_j
  from internal.stateres_mouvements m;

  -- En circulation : la somme du journal de tous les comptes ; ceux qui en ont, ceux dont la somme est positive.
  select coalesce(sum(t.s), 0), count(*) filter (where t.s > 0)
  into v_circulation, v_detenteurs
  from (select m.user_id, sum(m.montant) as s from internal.stateres_mouvements m group by m.user_id) t;

  -- Les objets achetés et les pochettes ouvertes, par rareté de l'objet reçu (`ref` : « emplacement/objet »).
  with lignes as (
    select m.nature, m.cree_le >= v_depuis as recente, o.rarete
    from internal.stateres_mouvements m
    join internal.gaulois_objets o on o.emplacement = split_part(m.ref, '/', 1) and o.objet = split_part(m.ref, '/', 2)
    where m.nature in ('achat', 'pochette')
  ),
  parts as (
    select r.rarete,
      count(*) filter (where l.nature = 'achat') as achats,
      count(*) filter (where l.nature = 'achat' and l.recente) as achats_30,
      count(*) filter (where l.nature = 'pochette') as ouvertures,
      count(*) filter (where l.nature = 'pochette' and l.recente) as ouvertures_30
    from (values ('commun'), ('peu-commun'), ('epique'), ('mystique'), ('legendaire')) as r (rarete)
    left join lignes l on l.rarete = r.rarete
    group by r.rarete
  )
  select jsonb_object_agg(p.rarete, p.achats), jsonb_object_agg(p.rarete, p.achats_30),
    jsonb_object_agg(p.rarete, p.ouvertures), jsonb_object_agg(p.rarete, p.ouvertures_30)
  into v_achats, v_achats_30, v_ouvertures, v_ouvertures_30
  from parts p;

  select count(*), count(*) filter (where g.created_at >= v_depuis) into v_gaulois, v_gaulois_30 from internal.gaulois g;

  -- Distribués moins dépensés égale en circulation : si un seul des trois était caché, la soustraction des deux autres le
  -- redonnerait. Les comptes qui ont encore des statères sont trop peu : les distribués sont cachés aussi. Ceux qui en ont reçu
  -- ou ceux qui en ont dépensé sont trop peu : la circulation est cachée aussi.
  v_distribues := internal.village_passe(v_j.recus);
  v_depenses := internal.village_passe(v_j.depensiers);
  v_circule := internal.village_passe(v_detenteurs);
  if v_distribues and v_depenses and not v_circule then v_distribues := false; end if;
  if not (v_distribues and v_depenses) then v_circule := false; end if;

  -- Le partage entre boutique et pochettes, et le détail par rareté (voir le seuil, en tête).
  v_partage := internal.village_passe(v_j.depensiers) and internal.village_passe(v_j.acheteurs) and internal.village_passe(v_j.ouvreurs);
  v_partage_30 := internal.village_passe(v_j.depensiers_30) and internal.village_passe(v_j.depensiers_avant)
    and internal.village_passe(v_j.acheteurs_30) and internal.village_passe(v_j.acheteurs_avant)
    and internal.village_passe(v_j.ouvreurs_30) and internal.village_passe(v_j.ouvreurs_avant);

  return jsonb_build_object(
    'ok', true,
    'lu_le', now(),
    'seuil', internal.village_seuil(),
    'debut', v_j.debut,
    'releve', (select r.le from internal.stateres_releve r where r.id),
    'gaulois', jsonb_build_object('total', v_gaulois, 'trente_jours', v_gaulois_30),
    'comptes_credites', jsonb_build_object('total', v_j.recus, 'trente_jours', v_j.recus_30),
    'distribues', jsonb_build_object(
      'total', case when v_distribues then v_j.distribues end,
      'trente_jours', case when internal.village_passe(v_j.recus_30) and internal.village_passe(v_j.recus_avant) then v_j.distribues_30 end
    ),
    'depenses', jsonb_build_object(
      'total', case when v_depenses then v_j.depenses end,
      'trente_jours', case when internal.village_passe(v_j.depensiers_30) and internal.village_passe(v_j.depensiers_avant) then v_j.depenses_30 end
    ),
    'boutique', jsonb_build_object('total', case when v_partage then v_j.boutique end, 'trente_jours', case when v_partage_30 then v_j.boutique_30 end),
    'pochettes', jsonb_build_object('total', case when v_partage then v_j.pochettes end, 'trente_jours', case when v_partage_30 then v_j.pochettes_30 end),
    'circulation', case when v_circule then v_circulation end,
    'achats', jsonb_build_object('total', case when v_partage then v_achats end, 'trente_jours', case when v_partage_30 then v_achats_30 end),
    'ouvertures', jsonb_build_object('total', case when v_partage then v_ouvertures end, 'trente_jours', case when v_partage_30 then v_ouvertures_30 end),
    'reglages', jsonb_build_object(
      'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.village_prix p),
      'prix_maj_le', (select max(p.maj_le) from internal.village_prix p),
      'pochette', jsonb_build_object(
        'prix', (select p.prix from internal.village_pochette p where p.id),
        'chances', (select jsonb_object_agg(ch.rarete, trim_scale(ch.chance)) from internal.village_chances() ch),
        'maj_le', (select p.maj_le from internal.village_pochette p where p.id)
      ),
      -- Les objets que la boutique vend, par rareté : une rareté sans objet ne peut pas avoir de chance dans la pochette.
      'objets_payants', (
        select jsonb_object_agg(r.rarete, coalesce(k.nombre, 0))
        from (values ('commun'), ('peu-commun'), ('epique'), ('mystique'), ('legendaire')) as r (rarete)
        left join (select o.rarete, count(*) as nombre from internal.gaulois_objets o where not o.gratuit and o.rarete is not null group by o.rarete) k
          on k.rarete = r.rarete
      )
    )
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Les contrôles des réglages ---------- */

-- Les cinq prix reçus : un objet JSON avec exactement les cinq raretés, chacune un nombre entier de 1 à 1 000 000, chaque
-- rareté plus chère que la précédente. Rend les prix remis en forme, ou null.
create or replace function internal.village_prix_valides(p_prix jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_rarete text;
  v_valeur numeric;
  v_precedent numeric := 0;
  v_prix jsonb := '{}'::jsonb;
begin
  if p_prix is null or jsonb_typeof(p_prix) <> 'object' then return null; end if;
  if (select count(*) from jsonb_object_keys(p_prix)) <> 5 then return null; end if;
  foreach v_rarete in array array['commun', 'peu-commun', 'epique', 'mystique', 'legendaire'] loop
    if jsonb_typeof(p_prix -> v_rarete) is distinct from 'number' then return null; end if;
    v_valeur := (p_prix ->> v_rarete)::numeric;
    if v_valeur <> trunc(v_valeur) or v_valeur < 1 or v_valeur > 1000000 or v_valeur <= v_precedent then return null; end if;
    v_prix := v_prix || jsonb_build_object(v_rarete, v_valeur::integer);
    v_precedent := v_valeur;
  end loop;
  return v_prix;
end $$;

-- Le prix de la pochette reçu : un nombre entier de 1 à 1 000 000, ou null.
create or replace function internal.village_prix_pochette_valide(p_prix jsonb) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_valeur numeric;
begin
  if p_prix is null or jsonb_typeof(p_prix) <> 'number' then return null; end if;
  v_valeur := (p_prix #>> '{}')::numeric;
  if v_valeur <> trunc(v_valeur) or v_valeur < 1 or v_valeur > 1000000 then return null; end if;
  return v_valeur::integer;
end $$;

-- Les cinq chances reçues : un objet JSON avec exactement les cinq raretés, chacune un nombre entier de 0 à 100, 100 en tout.
-- Rend les chances remises en forme, ou null.
create or replace function internal.village_chances_valides(p_chances jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_rarete text;
  v_valeur numeric;
  v_somme numeric := 0;
  v_chances jsonb := '{}'::jsonb;
begin
  if p_chances is null or jsonb_typeof(p_chances) <> 'object' then return null; end if;
  if (select count(*) from jsonb_object_keys(p_chances)) <> 5 then return null; end if;
  foreach v_rarete in array array['commun', 'peu-commun', 'epique', 'mystique', 'legendaire'] loop
    if jsonb_typeof(p_chances -> v_rarete) is distinct from 'number' then return null; end if;
    v_valeur := (p_chances ->> v_rarete)::numeric;
    if v_valeur <> trunc(v_valeur) or v_valeur < 0 or v_valeur > 100 then return null; end if;
    v_chances := v_chances || jsonb_build_object(v_rarete, v_valeur::integer);
    v_somme := v_somme + v_valeur;
  end loop;
  if v_somme <> 100 then return null; end if;
  return v_chances;
end $$;

-- Deux réglages au même instant passent l'un après l'autre, jusqu'à la fin de leur transaction.
create or replace function internal.village_reglages_verrou() returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('gal_village'), hashtext('reglages'));
end $$;

revoke all on function internal.village_prix_valides(jsonb) from public, anon, authenticated;
revoke all on function internal.village_prix_pochette_valide(jsonb) from public, anon, authenticated;
revoke all on function internal.village_chances_valides(jsonb) from public, anon, authenticated;
revoke all on function internal.village_reglages_verrou() from public, anon, authenticated;

/* ---------- Les réglages des admins et du fondateur ---------- */

-- Les prix de la boutique : { ok: true, change, prix }. `change` : faux si les prix étaient déjà ceux-là (rien n'est noté).
-- Refus : prix_invalides ; et ceux de tout réglage (not_signed_in, suspended, not_validated, forbidden, rate_limited).
-- Après une baisse, les offres du marché plus chères que le nouveau prix de leur objet sont fermées, et leur objet revient
-- à son vendeur (internal.marche_fermer_au_dessus_des_prix, migration 20261113002000) ; le journal en dit le nombre.
create or replace function public.regler_village_prix(p_prix jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_avant jsonb;
  v_apres jsonb;
  v_fermees integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    v_apres := internal.village_prix_valides(p_prix);
    if v_apres is null then perform internal.fail('prix_invalides'); end if;
    perform internal.village_reglages_verrou();
    select jsonb_object_agg(p.rarete, p.prix) into v_avant from internal.village_prix p;
    if v_avant is not distinct from v_apres then
      return jsonb_build_object('ok', true, 'change', false, 'prix', v_apres);
    end if;
    insert into internal.village_prix as p (rarete, prix, maj_le)
    select n.key, (n.value #>> '{}')::integer, now() from jsonb_each(v_apres) n
    on conflict (rarete) do update set prix = excluded.prix, maj_le = excluded.maj_le
      where p.prix is distinct from excluded.prix;
    v_fermees := internal.marche_fermer_au_dessus_des_prix();
    perform internal.log_admin(v_actor, 'village_prix_saved', null,
      jsonb_build_object('avant', v_avant, 'apres', v_apres) || case when v_fermees > 0 then jsonb_build_object('offres_fermees', v_fermees) else '{}'::jsonb end);
    return jsonb_build_object('ok', true, 'change', true, 'prix', v_apres);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- La pochette surprise : son prix et ses chances, ensemble. { ok: true, change, pochette: { prix, chances } }.
-- Refus : prix_pochette_invalide, chances_invalides, rarete_sans_objet (une chance pour une rareté sans objet payant) ;
-- et ceux de tout réglage.
create or replace function public.regler_village_pochette(p_prix jsonb, p_chances jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_prix integer;
  v_chances jsonb;
  v_avant jsonb;
  v_apres jsonb;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    v_prix := internal.village_prix_pochette_valide(p_prix);
    if v_prix is null then perform internal.fail('prix_pochette_invalide'); end if;
    v_chances := internal.village_chances_valides(p_chances);
    if v_chances is null then perform internal.fail('chances_invalides'); end if;
    if exists (
      select 1 from jsonb_each(v_chances) c
      where (c.value #>> '{}')::integer > 0
        and not exists (select 1 from internal.gaulois_objets o where o.rarete = c.key and not o.gratuit)
    ) then
      perform internal.fail('rarete_sans_objet');
    end if;
    v_apres := jsonb_build_object('prix', v_prix, 'chances', v_chances);
    perform internal.village_reglages_verrou();
    select jsonb_build_object('prix', p.prix, 'chances', (select jsonb_object_agg(ch.rarete, trim_scale(ch.chance)) from internal.village_chances() ch))
    into v_avant
    from internal.village_pochette p where p.id;
    if v_avant is not distinct from v_apres then
      return jsonb_build_object('ok', true, 'change', false, 'pochette', v_apres);
    end if;
    insert into internal.village_pochette as p (id, prix, commun, peu_commun, epique, mystique, legendaire, maj_le)
    values (true, v_prix, (v_chances ->> 'commun')::numeric, (v_chances ->> 'peu-commun')::numeric, (v_chances ->> 'epique')::numeric,
      (v_chances ->> 'mystique')::numeric, (v_chances ->> 'legendaire')::numeric, now())
    on conflict (id) do update set prix = excluded.prix, commun = excluded.commun, peu_commun = excluded.peu_commun,
      epique = excluded.epique, mystique = excluded.mystique, legendaire = excluded.legendaire, maj_le = excluded.maj_le
      where p.id;
    perform internal.log_admin(v_actor, 'village_pochette_saved', null, jsonb_build_object('avant', v_avant, 'apres', v_apres));
    return jsonb_build_object('ok', true, 'change', true, 'pochette', v_apres);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

/* ---------- Les droits ---------- */

revoke all on function public.get_village_economie() from public, anon, authenticated;
revoke all on function public.regler_village_prix(jsonb) from public, anon, authenticated;
revoke all on function public.regler_village_pochette(jsonb, jsonb) from public, anon, authenticated;

-- Officiers et au-dessus pour la lecture, admins et fondateur pour les réglages : chaque fonction le vérifie elle-même.
grant execute on function public.get_village_economie() to authenticated;
grant execute on function public.regler_village_prix(jsonb) to authenticated;
grant execute on function public.regler_village_pochette(jsonb, jsonb) to authenticated;
