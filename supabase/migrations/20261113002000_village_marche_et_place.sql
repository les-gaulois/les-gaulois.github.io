-- Le village des Gaulois, quatrième lot : le marché entre membres et la place du village, côté serveur (docs/DIRECTION.md,
-- « Le village des Gaulois » ; formes des réponses : src/lib/village/contrat.ts, `Marche`, `OffreDuMarche`, `RefusMarche`,
-- `Village`).
--
-- Le marché, règles du contrat :
-- - Un membre validé met en vente un objet payant de son inventaire, à un prix entier de 1 statère au prix de l'objet à la
--   boutique (internal.village_prix) ; 5 offres ouvertes au plus par membre (internal.marche_offres_max), chacune 14 jours
--   (internal.marche_duree) ; un test garde ces deux nombres identiques à ceux de contrat.ts.
-- - Un objet mis en vente quitte l'inventaire jusqu'à la vente, au retrait ou à la fin de l'offre. Une offre finie se
--   constate à la lecture, sans tâche planifiée (internal.marche_expirer) : son objet revient à son vendeur, à l'heure de sa
--   fin. Son seul exemplaire porté par le Gaulois ne se vend pas (`objet_porte`).
-- - L'acheteur paie le prix, le vendeur le reçoit en entier : deux lignes du journal des statères (migration
--   20261113001800), `marche_achat` (débit de l'acheteur) et `marche_vente` (crédit du vendeur), `ref` : « offre/<numéro> »,
--   écrites dans l'ordre des user_id, sous le verrou des deux comptes (internal.village_verrou) pris dans le même ordre. C'est
--   la table des soldes qui refuse un solde insuffisant : un refus n'écrit rien.
-- - On n'achète ni sa propre offre (`offre_a_soi`) ni un objet qu'on a déjà (`deja_possede`), dans son inventaire ou en vente
--   par soi-même. L'offre d'un compte qui n'est plus validé (suspendu, ou remis en attente) ne se voit pas et ne s'achète pas
--   (`offre_fermee`) ; elle finit à son heure, et l'objet revient à son vendeur.
-- - Un objet acheté au marché ne se remet pas en vente (`achete_au_marche`, mesure de l'économie) : sans cette règle, deux
--   comptes se passeraient des statères par un aller-retour. L'inventaire compte les exemplaires venus du marché
--   (internal.gaulois_inventaire.du_marche, ajoutée ici) ; une vente prend d'abord les autres exemplaires. Comme on n'achète
--   pas au marché un objet qu'on a déjà, il y en a au plus un par ligne, et il ne part jamais. `origine` vaut 'marche'
--   exactement quand tous les exemplaires de la ligne viennent du marché : l'écran grise alors la case (seVend de
--   src/lib/village/ecran-marche.ts). Un objet retiré de la vente, ou revenu à la fin de l'offre, garde son origine de départ
--   (achat ou pochette), gardée dans l'offre.
-- - Trou bouché dans la boutique : un objet en vente compte comme possédé. acheter_objet (remplacée) refuse de le racheter
--   (`deja_possede`), comme acheter_offre.
-- - `vendeur` : le nom que le QG montre déjà pour ce compte, public.profiles.display_name (internal.member_face, migration
--   20261109000100), seulement s'il se montre aux autres membres (profiles.show_to_members, la règle du mur du QG) ou si
--   c'est l'appelant ; sinon « Un Gaulois ». Jamais une adresse ni raw_user_meta_data.
-- - Une baisse des prix de la boutique ferme les offres plus chères que le nouveau prix (internal.marche_fermer_au_dessus_des_prix,
--   appelée par regler_village_prix, migration 20261113002100) : l'objet revient à son vendeur.
--
-- La place du village : les Gaulois de tous les comptes validés, par ordre de création de leur Gaulois, avec le nom que le QG
-- montre (« Un Gaulois » pour qui ne se montre pas aux autres membres) et leur tenue. Le pilote n'a pas voulu de case pour s'en retirer (13 novembre 2026). Elle se lit par un compte validé
-- ou de l'encadrement (officier et au-dessus). Un solde ne s'y lit jamais.
--
-- Les verrous, pour que deux gestes ne se bloquent jamais en croix : un geste du marché qui touche plusieurs comptes (un
-- achat, la fin des offres) prend d'abord le verrou du marché (internal.marche_verrou), puis ceux des comptes, dans l'ordre
-- des user_id. Une fonction qui ne prend que le verrou de son compte (la boutique, la pochette, la tenue) ne demande le verrou
-- du marché qu'avant le sien : acheter_objet constate la fin des offres avant de verrouiller son compte.
--
-- Ce qui est gardé :
-- - internal.marche_offres : chaque offre, son vendeur, l'objet, son prix, l'origine de l'exemplaire, son état (ouverte,
--   vendue, finie), son acheteur et ses dates. S'efface avec le compte du vendeur (une offre ouverte part avec son objet) ;
--   l'acheteur d'un compte effacé n'y est plus nommé. Une offre retirée s'efface aussitôt ; une offre vendue ou finie, 30 jours
--   après, à la lecture suivante du marché ou de la boutique (internal.marche_expirer) : la table ne grossit pas sans fin.
-- - internal.gaulois_inventaire.du_marche : le nombre d'exemplaires venus du marché.
--
-- Qui peut quoi :
-- - get_marche, mettre_en_vente, retirer_offre, acheter_offre : un compte validé. Toutes sont limitées à 30 appels par
--   minute, comme les achats (les lectures aussi : elles renvoient de grosses réponses).
-- - get_village : un compte validé ou de l'encadrement, limitée de même.
-- - get_ma_boutique (remplacée) : la même, qui constate d'abord la fin des offres, pour que l'objet revenu se voie.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des gestes de joueurs. Aucun solde ne se lit pour un autre compte.
--
-- Une table, une colonne, sept fonctions internes et cinq fonctions publiques ajoutées, deux fonctions remplacées, aucune
-- donnée existante touchée. Rejouée, elle se remplace par la même.

/* ---------- Les tables ---------- */

-- Le nombre d'exemplaires d'une ligne de l'inventaire venus du marché : jamais plus que la quantité.
alter table internal.gaulois_inventaire add column if not exists du_marche integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gaulois_inventaire_du_marche' and conrelid = 'internal.gaulois_inventaire'::regclass) then
    alter table internal.gaulois_inventaire add constraint gaulois_inventaire_du_marche check (du_marche >= 0 and du_marche <= quantite);
  end if;
end $$;

create table if not exists internal.marche_offres (
  id bigint generated always as identity primary key,
  vendeur_id uuid not null references public.profiles (user_id) on delete cascade,
  emplacement text not null,
  objet text not null,
  prix integer not null check (prix between 1 and 1000000),
  -- D'où vient l'exemplaire mis en vente : jamais du marché, qui ne se revend pas.
  origine text not null check (origine in ('achat', 'pochette')),
  etat text not null default 'ouverte' check (etat in ('ouverte', 'vendue', 'retiree', 'expiree')),
  acheteur_id uuid references public.profiles (user_id) on delete set null,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  -- L'heure de la vente, du retrait ou de la fin ; null tant que l'offre est ouverte.
  ferme_le timestamptz,
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet),
  check (expire_le > cree_le),
  check ((etat = 'ouverte') = (ferme_le is null)),
  check (acheteur_id is null or etat = 'vendue')
);
create index if not exists marche_offres_ouvertes on internal.marche_offres (vendeur_id) where etat = 'ouverte';
create index if not exists marche_offres_a_finir on internal.marche_offres (expire_le) where etat = 'ouverte';
create index if not exists marche_offres_closes on internal.marche_offres (ferme_le) where etat <> 'ouverte';

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.marche_offres enable row level security;
revoke all on table internal.marche_offres from public, anon, authenticated;

/* ---------- Les outils internes ---------- */

-- Les règles du marché : les mêmes nombres que MARCHE_OFFRES_MAX et MARCHE_DUREE_JOURS de contrat.ts (un test le garde).
create or replace function internal.marche_offres_max() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 5 $$;

create or replace function internal.marche_duree() returns interval
language sql immutable set search_path = public, pg_temp as $$ select interval '14 days' $$;

-- Le verrou du marché, jusqu'à la fin de la transaction : à prendre avant ceux des comptes.
create or replace function internal.marche_verrou() returns void
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('gal_marche'), 0);
end $$;

-- L'appelant, s'il entre au marché : connecté, non suspendu, validé. Sinon une erreur, comme ailleurs.
create or replace function internal.marche_membre() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select p.status into v_status from public.profiles p where p.user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  if v_status <> 'validated' then perform internal.fail('not_validated'); end if;
  return v_uid;
end $$;

-- Un exemplaire qui revient à son vendeur (retrait, fin de l'offre), avec son origine de départ, reçu à `p_quand`.
create or replace function internal.marche_rendre(p_vendeur uuid, p_emplacement text, p_objet text, p_origine text, p_quand timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into internal.gaulois_inventaire as i (user_id, emplacement, objet, quantite, origine, acquis_le, du_marche)
  values (p_vendeur, p_emplacement, p_objet, 1, p_origine, p_quand, 0)
  on conflict (user_id, emplacement, objet) do update
    set quantite = i.quantite + 1, origine = excluded.origine, acquis_le = greatest(i.acquis_le, excluded.acquis_le);
end $$;

-- Constate la fin des offres ouvertes dont l'heure est passée : chacune finit à son heure, et son objet revient à son
-- vendeur, quel que soit l'état de son compte. Appelée à chaque lecture du marché et de la boutique, et avant chaque geste :
-- aucune tâche planifiée. Rien à faire, rien de verrouillé. Renvoie le nombre d'offres finies.
-- Efface aussi les offres closes (vendues ou finies) depuis plus de 30 jours : plus rien ne les lit (le journal des statères
-- ne garde que le numéro d'une offre vendue, dans `ref`), et la table ne grossit pas sans fin.
create or replace function internal.marche_expirer() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_vendeur uuid;
  v_o record;
  v_n integer := 0;
begin
  delete from internal.marche_offres m where m.etat <> 'ouverte' and m.ferme_le < now() - interval '30 days';
  if not exists (select 1 from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le <= now()) then
    return 0;
  end if;
  perform internal.marche_verrou();
  for v_vendeur in
    select distinct m.vendeur_id from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le <= now() order by 1
  loop
    perform internal.village_verrou(v_vendeur);
  end loop;
  for v_o in
    update internal.marche_offres m set etat = 'expiree', ferme_le = m.expire_le
    where m.etat = 'ouverte' and m.expire_le <= now()
    returning m.vendeur_id, m.emplacement, m.objet, m.origine, m.expire_le
  loop
    perform internal.marche_rendre(v_o.vendeur_id, v_o.emplacement, v_o.objet, v_o.origine, v_o.expire_le);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Ferme les offres ouvertes plus chères que le prix de leur objet à la boutique : après une baisse des prix par
-- l'encadrement (regler_village_prix, migration 20261113002100), personne ne paie au marché plus que la boutique. Chacune
-- finit comme une offre arrivée à son heure (« expiree », maintenant), et son objet revient à son vendeur, avec son origine.
-- Le verrou du marché, puis ceux des vendeurs dans l'ordre des user_id, comme marche_expirer. Renvoie le nombre d'offres
-- fermées.
create or replace function internal.marche_fermer_au_dessus_des_prix() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_vendeur uuid;
  v_o record;
  v_n integer := 0;
begin
  perform internal.marche_verrou();
  for v_vendeur in
    select distinct m.vendeur_id
    from internal.marche_offres m
    join internal.gaulois_objets o on o.emplacement = m.emplacement and o.objet = m.objet
    join internal.village_prix p on p.rarete = o.rarete
    where m.etat = 'ouverte' and m.prix > p.prix
    order by 1
  loop
    perform internal.village_verrou(v_vendeur);
  end loop;
  for v_o in
    update internal.marche_offres m set etat = 'expiree', ferme_le = now()
    from internal.gaulois_objets o, internal.village_prix p
    where m.etat = 'ouverte' and o.emplacement = m.emplacement and o.objet = m.objet and p.rarete = o.rarete and m.prix > p.prix
    returning m.vendeur_id, m.emplacement, m.objet, m.origine
  loop
    perform internal.marche_rendre(v_o.vendeur_id, v_o.emplacement, v_o.objet, v_o.origine, now());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Le marché vu par `p_uid`, l'appelant : son solde, les offres ouvertes (les plus récentes d'abord), sauf celles d'un compte
-- qui n'est plus validé, et le nombre d'offres permis. Jamais le solde d'un autre.
create or replace function internal.marche_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_uid), 0),
    'offres', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'emplacement', m.emplacement, 'objet', m.objet, 'prix', m.prix,
          -- Le nom du vendeur seulement s'il se montre aux autres membres (le choix du QG), ou si c'est l'appelant.
          'vendeur', case when p.show_to_members or m.vendeur_id = p_uid then p.display_name else 'Un Gaulois' end,
          'a_moi', m.vendeur_id = p_uid, 'expire_le', m.expire_le)
        order by m.cree_le desc, m.id desc)
      from internal.marche_offres m
      join public.profiles p on p.user_id = m.vendeur_id
      where m.etat = 'ouverte' and m.expire_le > now() and (p.status = 'validated' or m.vendeur_id = p_uid)), '[]'::jsonb),
    'offres_max', internal.marche_offres_max()
  )
$$;

revoke all on function internal.marche_offres_max() from public, anon, authenticated;
revoke all on function internal.marche_duree() from public, anon, authenticated;
revoke all on function internal.marche_verrou() from public, anon, authenticated;
revoke all on function internal.marche_membre() from public, anon, authenticated;
revoke all on function internal.marche_rendre(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function internal.marche_expirer() from public, anon, authenticated;
revoke all on function internal.marche_fermer_au_dessus_des_prix() from public, anon, authenticated;
revoke all on function internal.marche_json(uuid) from public, anon, authenticated;

/* ---------- Le marché ---------- */

-- Le marché de l'appelant (`Marche` du contrat) : { ok: true, solde, offres, offres_max }. Constate d'abord la fin des offres,
-- et crédite ce qui revient déjà à l'appelant, comme la boutique. Refus : not_signed_in, suspended, not_validated,
-- rate_limited (limitée comme les gestes : l'écran ne la lit qu'à l'ouverture de l'onglet et après un refus).
create or replace function public.get_marche() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.marche_membre();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  perform internal.marche_expirer();
  if exists (select 1 from internal.gaulois g where g.user_id = v_uid) then
    perform internal.crediter_stateres(v_uid);
  end if;
  return internal.marche_json(v_uid);
end $$;

revoke all on function public.get_marche() from public, anon, authenticated;
grant execute on function public.get_marche() to authenticated;

-- Met en vente un exemplaire d'un objet de l'inventaire, pour 14 jours, et répond le marché à jour. Refus, dans cet ordre
-- (celui de l'écran) : not_validated ; pas_possede (objet hors du catalogue, gratuit, ou absent de l'inventaire) ;
-- prix_invalide (pas un entier de 1 au prix de la boutique) ; trop_d_offres (déjà 5 offres ouvertes) ; objet_porte (seul
-- exemplaire, porté par le Gaulois) ; achete_au_marche (il ne reste que l'exemplaire venu du marché) ; et ceux de tout compte
-- (not_signed_in, suspended, rate_limited). Un refus ne change rien.
create or replace function public.mettre_en_vente(p_emplacement text, p_objet text, p_prix numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_rarete text;
  v_gratuit boolean;
  v_plafond integer;
  v_ligne internal.gaulois_inventaire;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- La fin des offres, hors du bloc protégé : elle reste constatée même si la vente est refusée.
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    perform internal.village_verrou(v_uid);
    select o.rarete, o.gratuit into v_rarete, v_gratuit
    from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet;
    if not found or v_gratuit or v_rarete is null then perform internal.fail('pas_possede'); end if;
    select * into v_ligne from internal.gaulois_inventaire i
    where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet
    for update;
    if not found then perform internal.fail('pas_possede'); end if;
    select p.prix into v_plafond from internal.village_prix p where p.rarete = v_rarete;
    if p_prix is null or p_prix <> trunc(p_prix) or p_prix < 1 or v_plafond is null or p_prix > v_plafond then
      perform internal.fail('prix_invalide');
    end if;
    if (select count(*) from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte') >= internal.marche_offres_max() then
      perform internal.fail('trop_d_offres');
    end if;
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois g where g.user_id = v_uid and g.tenue ->> p_emplacement = p_objet) then
      perform internal.fail('objet_porte');
    end if;
    if v_ligne.quantite - v_ligne.du_marche < 1 then perform internal.fail('achete_au_marche'); end if;
    -- Un exemplaire qui ne vient pas du marché quitte l'inventaire ; s'il ne reste que celui du marché, la ligne le dit.
    if v_ligne.quantite = 1 then
      delete from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet;
    else
      update internal.gaulois_inventaire i
      set quantite = i.quantite - 1, origine = case when i.quantite - 1 = i.du_marche then 'marche' else i.origine end
      where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet;
    end if;
    insert into internal.marche_offres (vendeur_id, emplacement, objet, prix, origine, expire_le)
    values (v_uid, p_emplacement, p_objet, p_prix::integer,
      case when v_ligne.origine = 'pochette' then 'pochette' else 'achat' end, now() + internal.marche_duree());
    return internal.marche_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.mettre_en_vente(text, text, numeric) from public, anon, authenticated;
grant execute on function public.mettre_en_vente(text, text, numeric) to authenticated;

-- Retire une de ses offres ouvertes : l'objet revient dans l'inventaire, avec son origine de départ, et l'offre s'efface
-- (rien ne la lit plus ; gardée, la boucle « mettre en vente, retirer » ferait grossir la table sans fin). Répond le marché
-- à jour. Refus : offre_fermee (offre inconnue, d'un autre, vendue, retirée ou finie), not_validated, et ceux de tout compte.
create or replace function public.retirer_offre(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_offre internal.marche_offres;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    perform internal.village_verrou(v_uid);
    select * into v_offre from internal.marche_offres m where m.id = p_id for update;
    if not found or v_offre.vendeur_id <> v_uid or v_offre.etat <> 'ouverte' then perform internal.fail('offre_fermee'); end if;
    delete from internal.marche_offres m where m.id = v_offre.id;
    perform internal.marche_rendre(v_uid, v_offre.emplacement, v_offre.objet, v_offre.origine, now());
    return internal.marche_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.retirer_offre(bigint) from public, anon, authenticated;
grant execute on function public.retirer_offre(bigint) to authenticated;

-- Achète une offre ouverte d'un autre membre validé : l'acheteur paie le prix, le vendeur le reçoit en entier, l'objet
-- entre dans l'inventaire de l'acheteur comme venu du marché. Répond le marché à jour. Refus, dans cet ordre : not_validated ;
-- offre_fermee (offre inconnue, vendue, retirée, finie, ou d'un compte qui n'est plus validé) ; offre_a_soi ; deja_possede
-- (l'objet est dans l'inventaire de l'acheteur, ou en vente par lui) ; solde_insuffisant ; et ceux de tout compte. Un refus
-- n'écrit rien.
create or replace function public.acheter_offre(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_vendeur uuid;
  v_offre internal.marche_offres;
  v_ref text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- Le verrou du marché d'abord, puis ceux des deux comptes dans l'ordre des user_id.
  perform internal.marche_verrou();
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    select m.vendeur_id into v_vendeur from internal.marche_offres m where m.id = p_id;
    if not found then perform internal.fail('offre_fermee'); end if;
    perform internal.village_verrou(least(v_uid, v_vendeur));
    if v_vendeur <> v_uid then perform internal.village_verrou(greatest(v_uid, v_vendeur)); end if;
    select * into v_offre from internal.marche_offres m where m.id = p_id for update;
    if not found or v_offre.etat <> 'ouverte'
      or not exists (select 1 from public.profiles p where p.user_id = v_offre.vendeur_id and p.status = 'validated') then
      perform internal.fail('offre_fermee');
    end if;
    if v_offre.vendeur_id = v_uid then perform internal.fail('offre_a_soi'); end if;
    if exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = v_offre.emplacement and i.objet = v_offre.objet)
      or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = v_offre.emplacement and m.objet = v_offre.objet) then
      perform internal.fail('deja_possede');
    end if;
    -- Les deux lignes du journal, dans l'ordre des user_id. Un solde trop court fait refuser le débit par la table des
    -- soldes : tout ce bloc est alors annulé, crédit du vendeur compris.
    v_ref := 'offre/' || v_offre.id;
    if v_uid < v_offre.vendeur_id then
      perform internal.village_debiter(v_uid, 'marche_achat', v_offre.prix, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_offre.vendeur_id, 'marche_vente', v_offre.prix, v_ref);
    else
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_offre.vendeur_id, 'marche_vente', v_offre.prix, v_ref);
      perform internal.village_debiter(v_uid, 'marche_achat', v_offre.prix, v_ref);
    end if;
    update internal.marche_offres m set etat = 'vendue', acheteur_id = v_uid, ferme_le = now() where m.id = v_offre.id;
    insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine, du_marche)
    values (v_uid, v_offre.emplacement, v_offre.objet, 1, 'marche', 1)
    on conflict (user_id, emplacement, objet) do nothing;
    -- Arrivé entre-temps par un autre chemin : tout s'annule avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return internal.marche_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_offre(bigint) from public, anon, authenticated;
grant execute on function public.acheter_offre(bigint) to authenticated;

/* ---------- La place du village ---------- */

-- La place (`Village` du contrat) : { ok: true, gaulois: [{ nom, tenue, moi }] }, les Gaulois de tous les comptes validés,
-- par ordre de création de leur Gaulois. Pour un compte validé ou de l'encadrement ; refus : not_signed_in, suspended,
-- not_validated, rate_limited. Ni solde, ni objet possédé : seulement la tenue que chacun porte. `nom` : le nom que le QG
-- montre, seulement pour un compte qui se montre aux autres membres (profiles.show_to_members) et pour l'appelant ; sinon
-- « Un Gaulois ». Remplacée par la vie du village (migration 20261113002300), avec les mêmes règles.
create or replace function public.get_village() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_role public.site_role;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select p.status, p.role into v_status, v_role from public.profiles p where p.user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;
  return jsonb_build_object(
    'ok', true,
    'gaulois', coalesce((
      select jsonb_agg(jsonb_build_object(
          'nom', case when p.show_to_members or g.user_id = v_uid then p.display_name else 'Un Gaulois' end,
          'tenue', g.tenue, 'moi', g.user_id = v_uid) order by g.created_at, g.user_id)
      from internal.gaulois g
      join public.profiles p on p.user_id = g.user_id
      where p.status = 'validated'), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_village() from public, anon, authenticated;
grant execute on function public.get_village() to authenticated;

/* ---------- La boutique : deux fonctions de 20261113001900 remplacées ---------- */

-- Comme la version de 20261113001900, et constate d'abord la fin des offres : l'objet revenu se voit tout de suite. Rien
-- d'autre ne change, pas même la forme de la réponse.
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
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.village_chances() c)
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

-- Comme la version de 20261113001900 (prix vu compris : `prix_change`), et un objet que l'appelant a en vente compte comme
-- possédé (`deja_possede`) : sans cela, il le rachèterait à la boutique, puis retirerait son offre pour en avoir deux. La fin
-- des offres est constatée avant le verrou du compte (verrou du marché d'abord).
create or replace function public.acheter_objet(p_emplacement text, p_objet text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_gratuit boolean;
  v_rarete text;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- Ajout de 20261113002000 : la fin des offres, avant le verrou du compte, et hors du bloc protégé.
  perform internal.marche_expirer();
  begin
    v_uid := internal.village_acheteur();
    select o.gratuit, o.rarete into v_gratuit, v_rarete
    from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet;
    if not found then perform internal.fail('unknown_objet'); end if;
    if v_gratuit then perform internal.fail('objet_gratuit'); end if;
    select p.prix into v_prix from internal.village_prix p where p.rarete = v_rarete;
    if v_prix is null then perform internal.fail('unknown_objet'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet)
      -- Ajout de 20261113002000 : un objet en vente reste à son vendeur.
      or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = p_emplacement and m.objet = p_objet) then
      perform internal.fail('deja_possede');
    end if;
    -- Le prix a changé depuis que le membre l'a vu : rien n'est débité.
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, p_emplacement || '/' || p_objet);
    insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine)
    values (v_uid, p_emplacement, p_objet, 1, 'achat')
    on conflict (user_id, emplacement, objet) do nothing;
    -- Arrivé entre-temps par un autre chemin : le débit s'annule avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'objet', jsonb_build_object('emplacement', p_emplacement, 'objet', p_objet)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_objet(text, text, integer) from public, anon, authenticated;
grant execute on function public.acheter_objet(text, text, integer) to authenticated;
