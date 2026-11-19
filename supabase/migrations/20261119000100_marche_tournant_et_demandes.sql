-- Le marché qui vit (19 novembre 2026). Le pilote, devant une analyse des achats qui avaient presque cessé : « Le 1, 2, 3 et 4 »,
-- parmi cinq propositions pour redonner un intérêt au marché entre membres (docs/DIRECTION.md, « La boutique tournante et les
-- demandes d'achat ») :
--   1. la boutique tournante : chaque semaine, un tiers seulement des objets est en rayon ;
--   2. les demandes d'achat : un membre dit « je cherche tel objet, je paie tant », ses statères sont mis de côté ;
--   3. le choix à la sortie d'une pochette, pour un double (l'écran seul : il appelle les fonctions d'ici et de la revente) ;
--   4. les nouvelles offres et demandes annoncées sur Discord.
-- Formes des réponses : src/lib/village/contrat.ts (`BoutiqueTournante`, `DemandeDuMarche`, `Marche`, `RefusMarche`).
--
-- 1. La boutique tournante.
-- - Une semaine de la boutique va du mardi 21 h 30 au mardi suivant, heure de Paris : l'heure du tirage de la loterie. La
--   première commence le mardi 17 novembre 2026 à 21 h 30 (internal.boutique_tour_debut).
-- - Les objets payants ont chacun un tour, de 0 à 2 (internal.boutique_tours_des_objets) : dans chaque emplacement et chaque
--   rareté, ils sont rangés par l'empreinte md5 de « emplacement/objet », puis distribués à tour de rôle. Chaque semaine, dans
--   chaque rayon, à peu près le tiers des objets de chaque rareté est en rayon ; chaque objet revient une semaine sur trois.
--   Un objet ajouté plus tard prend sa place dans ce rangement et peut décaler ses voisins : l'écran relit la rotation.
-- - acheter_objet (remplacée, depuis la 20261113002000, ligne pour ligne) refuse un objet hors du rayon (`hors_rayon`).
-- - Rien d'autre ne change : la pochette surprise, la forge, le sentier, la loterie et l'étal du jour donnent toujours tous les
--   objets, en rayon ou non. Un objet hors du rayon s'obtient donc là, ou au marché : c'est ce qui donne au marché sa raison.
-- - Le prix le plus haut au marché reste celui de la boutique (internal.village_prix) : sans ce plafond, deux comptes se
--   passeraient des statères en vendant un objet commun très cher.
-- - get_boutique_tournante (nouvelle) dit ce qui est hors du rayon et quand chaque objet revient.
--
-- 2. Les demandes d'achat.
-- - Un membre validé demande un objet payant qu'il n'a pas, à un prix entier de 1 statère au prix de la boutique, pour 14
--   jours (internal.marche_duree, la même que les offres) ; 5 demandes ouvertes au plus (internal.marche_demandes_max), 20
--   posées par jour au plus (internal.marche_demandes_par_jour, contre une boucle qui ferait grossir le journal) ; une seule
--   demande ouverte par objet. Les deux nombres : MARCHE_DEMANDES_MAX et MARCHE_DEMANDES_PAR_JOUR de contrat.ts (un test).
-- - Ses statères sont mis de côté : un débit au journal, nature `marche_demande`, `ref` « demande/<numéro> ». Ils lui
--   reviennent (`marche_demande_rendue`, même ref) quand il retire la demande, quand elle finit, quand le prix de la boutique
--   passe sous son prix, ou quand il a reçu l'objet par un autre chemin (boutique, pochette, sentier, forge, offre) : ces
--   fermetures se constatent à la lecture, comme la fin des offres (internal.marche_expirer, remplacée).
-- - Un autre membre qui a l'objet sert la demande (servir_demande) : aux règles d'une mise en vente (pas le seul exemplaire
--   porté ni le dernier gravé, pas un exemplaire venu du marché), son exemplaire passe à l'acheteur, comme venu du marché, et
--   il reçoit le prix en entier (`marche_vente`). Pour l'acheteur, les statères mis de côté lui sont rendus et l'achat s'écrit
--   comme un achat au marché (`marche_achat`), ref « demande/<numéro> » : l'annonce des achats sur Discord le lit ainsi
--   (achats_du_village, remplacée). Le jeu ne crée ni ne retire aucun statère : le prix va de l'acheteur au vendeur.
-- - Mode GOD : ni demande posée, ni demande servie par un compte en essai ; la demande d'un compte en essai ne se voit pas et
--   ne se sert pas ; un remboursement reste un vrai gain (internal.village_god_mouvement, remplacée).
-- - get_marche, mettre_en_vente, retirer_offre et acheter_offre répondent le marché avec, en plus, les demandes ouvertes
--   (internal.marche_json, remplacée) : `demandes`, `demandes_max`, `mis_de_cote` (les statères mis de côté de l'appelant).
--
-- 4. Les annonces sur Discord : annonces_du_marche (nouvelle, clé de service seulement) rend au robot les offres et les
--    demandes posées depuis son dernier passage, encore ouvertes, avec le nom Discord du membre, comme achats_du_village.
--    Le robot les annonce dans le salon des achats (scripts/annoncer-marche.ts, src/lib/marche-discord.ts).
--
-- La sauvegarde (export_site, remplacée, depuis la 20261117001600, version 11, ligne pour ligne) passe en version 12, avec
-- les demandes : leurs statères mis de côté sont au journal, la demande dit à qui ils reviennent.
--
-- Une table, onze fonctions internes et cinq fonctions publiques ajoutées ; six fonctions remplacées (acheter_objet,
-- internal.marche_expirer, internal.marche_json, internal.village_god_mouvement, achats_du_village, export_site). Aucune
-- donnée existante touchée. Rejouée, elle se remplace par la même.

/* ---------- 1. La boutique tournante ---------- */

-- Le nombre de tours : les mêmes que BOUTIQUE_TOURS de contrat.ts (un test le garde).
create or replace function internal.boutique_tours() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 3 $$;

-- Le début de la première semaine de la boutique, à l'heure de Paris : le mardi 17 novembre 2026 à 21 h 30.
create or replace function internal.boutique_tour_debut() returns timestamp
language sql immutable set search_path = public, pg_temp as $$ select timestamp '2026-11-17 21:30' $$;

-- La semaine de la boutique à l'instant `p_quand` : 0 pour celle qui commence le 17 novembre 2026 à 21 h 30 (heure de Paris),
-- négative avant. Comptée sur l'heure de Paris : le changement d'heure ne déplace pas le mardi 21 h 30.
create or replace function internal.boutique_semaine(p_quand timestamptz) returns integer
language sql stable set search_path = public, pg_temp as $$
  select floor(extract(epoch from ((p_quand at time zone 'Europe/Paris') - internal.boutique_tour_debut())) / 604800)::integer
$$;

-- L'instant où commence la semaine `p_semaine` de la boutique.
create or replace function internal.boutique_semaine_debut(p_semaine integer) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (internal.boutique_tour_debut() + p_semaine * interval '7 days') at time zone 'Europe/Paris'
$$;

-- Le tour en rayon pendant la semaine `p_semaine` : de 0 à 2, aussi pour une semaine négative.
create or replace function internal.boutique_tour_de_la_semaine(p_semaine integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select ((p_semaine % internal.boutique_tours()) + internal.boutique_tours()) % internal.boutique_tours()
$$;

-- Le tour de chaque objet payant (un objet qui a un prix : ni gratuit, ni divin). Dans chaque emplacement et chaque rareté,
-- les objets sont rangés par l'empreinte md5 de « emplacement/objet », puis distribués à tour de rôle.
create or replace function internal.boutique_tours_des_objets() returns table (emplacement text, objet text, tour integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.emplacement, o.objet,
    ((row_number() over (partition by o.emplacement, o.rarete order by md5(o.emplacement || '/' || o.objet)) - 1) % internal.boutique_tours())::integer
  from internal.gaulois_objets o
  join internal.village_prix p on p.rarete = o.rarete
  where not o.gratuit
$$;

-- L'objet est-il en rayon à l'instant `p_quand` ? Un objet sans prix ne l'est jamais.
create or replace function internal.boutique_en_rayon(p_emplacement text, p_objet text, p_quand timestamptz) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from internal.boutique_tours_des_objets() t
    where t.emplacement = p_emplacement and t.objet = p_objet
      and t.tour = internal.boutique_tour_de_la_semaine(internal.boutique_semaine(p_quand))
  )
$$;

revoke all on function internal.boutique_tours() from public, anon, authenticated;
revoke all on function internal.boutique_tour_debut() from public, anon, authenticated;
revoke all on function internal.boutique_semaine(timestamptz) from public, anon, authenticated;
revoke all on function internal.boutique_semaine_debut(integer) from public, anon, authenticated;
revoke all on function internal.boutique_tour_de_la_semaine(integer) from public, anon, authenticated;
revoke all on function internal.boutique_tours_des_objets() from public, anon, authenticated;
revoke all on function internal.boutique_en_rayon(text, text, timestamptz) from public, anon, authenticated;

-- La boutique tournante (`BoutiqueTournante` du contrat) : { ok: true, semaine, tours, change_le, hors_rayon: [{ emplacement,
-- objet, revient_le }] }. `change_le` : le prochain changement ; `revient_le` : le début de la semaine où l'objet revient.
-- Pour tout compte connecté, comme la boutique : rien n'y est privé. Refus : not_signed_in.
create or replace function public.get_boutique_tournante() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_semaine integer := internal.boutique_semaine(now());
  v_tour integer;
begin
  if auth.uid() is null then return internal.error_json('not_signed_in', ''); end if;
  v_tour := internal.boutique_tour_de_la_semaine(v_semaine);
  return jsonb_build_object(
    'ok', true,
    'semaine', v_semaine,
    'tours', internal.boutique_tours(),
    'change_le', internal.boutique_semaine_debut(v_semaine + 1),
    'hors_rayon', coalesce((
      select jsonb_agg(jsonb_build_object(
          'emplacement', t.emplacement,
          'objet', t.objet,
          'revient_le', internal.boutique_semaine_debut(v_semaine + internal.boutique_tour_de_la_semaine(t.tour - v_tour)))
        order by t.emplacement, t.objet)
      from internal.boutique_tours_des_objets() t
      where t.tour <> v_tour), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_boutique_tournante() from public, anon, authenticated;
grant execute on function public.get_boutique_tournante() to authenticated;

-- Comme la version de 20261113002000 (prix vu, objet en vente compté comme possédé), avec un refus de plus : hors_rayon, un
-- objet qui n'est pas en rayon cette semaine.
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
    -- Ajout de 20261119000100 : seul un objet en rayon cette semaine s'achète.
    if not internal.boutique_en_rayon(p_emplacement, p_objet, now()) then perform internal.fail('hors_rayon'); end if;
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

/* ---------- 2. Les demandes d'achat ---------- */

create table if not exists internal.marche_demandes (
  id bigint generated always as identity primary key,
  acheteur_id uuid not null references public.profiles (user_id) on delete cascade,
  emplacement text not null,
  objet text not null,
  prix integer not null check (prix between 1 and 1000000),
  etat text not null default 'ouverte' check (etat in ('ouverte', 'servie', 'retiree', 'expiree')),
  -- Le membre qui a servi la demande ; null avant, ou si son compte est effacé.
  vendeur_id uuid references public.profiles (user_id) on delete set null,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  -- L'heure du service, du retrait ou de la fin ; null tant que la demande est ouverte.
  ferme_le timestamptz,
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet),
  check (expire_le > cree_le),
  check ((etat = 'ouverte') = (ferme_le is null)),
  check (vendeur_id is null or etat = 'servie')
);
-- Une seule demande ouverte par compte et par objet.
create unique index if not exists marche_demandes_une_par_objet on internal.marche_demandes (acheteur_id, emplacement, objet) where etat = 'ouverte';
create index if not exists marche_demandes_a_finir on internal.marche_demandes (expire_le) where etat = 'ouverte';
create index if not exists marche_demandes_closes on internal.marche_demandes (ferme_le) where etat <> 'ouverte';
create index if not exists marche_demandes_du_compte on internal.marche_demandes (acheteur_id, cree_le);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.marche_demandes enable row level security;
revoke all on table internal.marche_demandes from public, anon, authenticated;

-- Les règles des demandes : les mêmes nombres que MARCHE_DEMANDES_MAX et MARCHE_DEMANDES_PAR_JOUR de contrat.ts (un test).
create or replace function internal.marche_demandes_max() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 5 $$;

create or replace function internal.marche_demandes_par_jour() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 20 $$;

-- Le prix le plus haut d'une offre ou d'une demande pour un objet : son prix à la boutique. `null` : l'objet n'a pas de prix
-- (gratuit, divin ou inconnu), il ne passe pas au marché.
create or replace function internal.marche_plafond(p_emplacement text, p_objet text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select p.prix
  from internal.gaulois_objets o
  join internal.village_prix p on p.rarete = o.rarete
  where o.emplacement = p_emplacement and o.objet = p_objet and not o.gratuit
$$;

-- Les demandes ouvertes à fermer, statères rendus : finies (leur heure est passée), plus chères que le prix de la boutique
-- (l'encadrement l'a baissé) ou d'un objet qui n'a plus de prix, ou dont l'acheteur a déjà l'objet (reçu par un autre
-- chemin) ou l'a lui-même en vente.
create or replace function internal.marche_demandes_a_fermer() returns table (id bigint, acheteur_id uuid, prix integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id, d.acheteur_id, d.prix
  from internal.marche_demandes d
  where d.etat = 'ouverte' and (
    d.expire_le <= now()
    or d.prix > coalesce(internal.marche_plafond(d.emplacement, d.objet), 0)
    or exists (select 1 from internal.gaulois_inventaire i where i.user_id = d.acheteur_id and i.emplacement = d.emplacement and i.objet = d.objet)
    or exists (select 1 from internal.marche_offres m where m.vendeur_id = d.acheteur_id and m.etat = 'ouverte' and m.emplacement = d.emplacement and m.objet = d.objet)
  )
$$;

revoke all on function internal.marche_demandes_max() from public, anon, authenticated;
revoke all on function internal.marche_demandes_par_jour() from public, anon, authenticated;
revoke all on function internal.marche_plafond(text, text) from public, anon, authenticated;
revoke all on function internal.marche_demandes_a_fermer() from public, anon, authenticated;

-- Comme la version de 20261113002000 (fin des offres, objet rendu à son vendeur, offres closes effacées après 30 jours), avec
-- les demandes : celles à fermer le sont (`expiree`, à l'heure de leur fin si elle est passée, sinon maintenant), et leurs
-- statères mis de côté reviennent à leur acheteur. Les comptes vus touchés, vendeurs et acheteurs, sont verrouillés ensemble,
-- dans l'ordre des user_id, après le verrou du marché ; les lignes du journal s'écrivent dans le même ordre. Une demande
-- devenue à fermer entre les deux lectures l'est sans le verrou de son compte : la garde `etat = 'ouverte'` ne la rend
-- qu'une fois (un crédit, que la table des soldes range comme tout autre). Les demandes
-- closes depuis plus de 30 jours s'effacent comme les offres. Renvoie le nombre d'offres et de demandes fermées.
create or replace function internal.marche_expirer() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_compte uuid;
  v_o record;
  v_n integer := 0;
begin
  delete from internal.marche_offres m where m.etat <> 'ouverte' and m.ferme_le < now() - interval '30 days';
  delete from internal.marche_demandes d where d.etat <> 'ouverte' and d.ferme_le < now() - interval '30 days';
  if not exists (select 1 from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le <= now())
    and not exists (select 1 from internal.marche_demandes_a_fermer()) then
    return 0;
  end if;
  perform internal.marche_verrou();
  for v_compte in
    select m.vendeur_id from internal.marche_offres m where m.etat = 'ouverte' and m.expire_le <= now()
    union
    select f.acheteur_id from internal.marche_demandes_a_fermer() f
    order by 1
  loop
    perform internal.village_verrou(v_compte);
  end loop;
  for v_o in
    update internal.marche_offres m set etat = 'expiree', ferme_le = m.expire_le
    where m.etat = 'ouverte' and m.expire_le <= now()
    returning m.vendeur_id, m.emplacement, m.objet, m.origine, m.expire_le
  loop
    perform internal.marche_rendre(v_o.vendeur_id, v_o.emplacement, v_o.objet, v_o.origine, v_o.expire_le);
    v_n := v_n + 1;
  end loop;
  for v_o in
    select f.id, f.acheteur_id, f.prix from internal.marche_demandes_a_fermer() f order by f.acheteur_id, f.id
  loop
    update internal.marche_demandes d set etat = 'expiree', ferme_le = least(d.expire_le, now())
    where d.id = v_o.id and d.etat = 'ouverte';
    if found then
      insert into internal.stateres_mouvements (user_id, nature, montant, ref)
      values (v_o.acheteur_id, 'marche_demande_rendue', v_o.prix, 'demande/' || v_o.id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function internal.marche_expirer() from public, anon, authenticated;

-- Comme la version de 20261113002000 (solde, offres ouvertes, offres permises), avec les demandes : les demandes ouvertes, la
-- plus chère d'abord, sauf celles d'un compte qui n'est plus validé ou en essai du mode GOD (ses propres demandes, toujours) ;
-- `demandes_max` ; `mis_de_cote`, la somme des demandes ouvertes de l'appelant. Jamais le solde d'un autre.
create or replace function internal.marche_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_uid), 0),
    'offres', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'emplacement', m.emplacement, 'objet', m.objet, 'prix', m.prix,
          -- Le nom du vendeur, pour tout vendeur : celui du QG (décision du pilote du 14 novembre 2026).
          'vendeur', internal.village_nom(p.display_name, p.gaul_number),
          'a_moi', m.vendeur_id = p_uid, 'expire_le', m.expire_le)
        order by m.cree_le desc, m.id desc)
      from internal.marche_offres m
      join public.profiles p on p.user_id = m.vendeur_id
      where m.etat = 'ouverte' and m.expire_le > now() and (p.status = 'validated' or m.vendeur_id = p_uid)), '[]'::jsonb),
    'offres_max', internal.marche_offres_max(),
    -- Ajouts de 20261119000100 : les demandes d'achat.
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', d.id, 'emplacement', d.emplacement, 'objet', d.objet, 'prix', d.prix,
          'acheteur', internal.village_nom(p.display_name, p.gaul_number),
          'a_moi', d.acheteur_id = p_uid, 'expire_le', d.expire_le)
        order by d.prix desc, d.cree_le, d.id)
      from internal.marche_demandes d
      join public.profiles p on p.user_id = d.acheteur_id
      where d.etat = 'ouverte' and d.expire_le > now()
        and (d.acheteur_id = p_uid
          or (p.status = 'validated' and not exists (select 1 from internal.village_god g where g.user_id = d.acheteur_id)))), '[]'::jsonb),
    'demandes_max', internal.marche_demandes_max(),
    'mis_de_cote', coalesce((select sum(d.prix) from internal.marche_demandes d where d.acheteur_id = p_uid and d.etat = 'ouverte'), 0)
  )
$$;

revoke all on function internal.marche_json(uuid) from public, anon, authenticated;

-- Celle de 20261117000200_don_de_stateres.sql, avec deux ajouts : les statères mis de côté rendus (`marche_demande_rendue`)
-- sont un vrai gain, et une demande d'achat (`marche_demande`) est refusée pendant un essai, comme un achat au marché. Le
-- déclencheur qui l'appelle reste le même.
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

-- Demande un objet au marché : ses statères sont mis de côté, pour 14 jours, et la fonction répond le marché à jour. Refus,
-- dans cet ordre : not_validated ; mode_god (essai en cours) ; unknown_objet (objet hors du catalogue ou gratuit) ;
-- prix_invalide (pas un entier de 1 au prix de la boutique, ou objet sans prix) ; deja_possede (dans son inventaire, ou en
-- vente par lui) ; deja_demande ; trop_de_demandes (5 ouvertes) ; demandes_du_jour (20 en 24 heures) ; solde_insuffisant ;
-- et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus n'écrit rien.
create or replace function public.poser_demande(p_emplacement text, p_objet text, p_prix numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_plafond integer;
  v_id bigint;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- La fin des offres et des demandes, hors du bloc protégé : elle reste constatée même si la demande est refusée.
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    if exists (select 1 from internal.village_god g where g.user_id = v_uid) then perform internal.fail('mode_god'); end if;
    perform internal.village_verrou(v_uid);
    if not exists (select 1 from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet and not o.gratuit) then
      perform internal.fail('unknown_objet');
    end if;
    v_plafond := internal.marche_plafond(p_emplacement, p_objet);
    if p_prix is null or p_prix <> trunc(p_prix) or p_prix < 1 or v_plafond is null or p_prix > v_plafond then
      perform internal.fail('prix_invalide');
    end if;
    if exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet)
      or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte' and m.emplacement = p_emplacement and m.objet = p_objet) then
      perform internal.fail('deja_possede');
    end if;
    if exists (select 1 from internal.marche_demandes d where d.acheteur_id = v_uid and d.etat = 'ouverte' and d.emplacement = p_emplacement and d.objet = p_objet) then
      perform internal.fail('deja_demande');
    end if;
    if (select count(*) from internal.marche_demandes d where d.acheteur_id = v_uid and d.etat = 'ouverte') >= internal.marche_demandes_max() then
      perform internal.fail('trop_de_demandes');
    end if;
    if (select count(*) from internal.marche_demandes d where d.acheteur_id = v_uid and d.cree_le > now() - interval '1 day') >= internal.marche_demandes_par_jour() then
      perform internal.fail('demandes_du_jour');
    end if;
    insert into internal.marche_demandes (acheteur_id, emplacement, objet, prix, expire_le)
    values (v_uid, p_emplacement, p_objet, p_prix::integer, now() + internal.marche_duree())
    returning id into v_id;
    -- Les points rapportés au clan pas encore crédités le sont d'abord, comme avant un achat.
    if exists (select 1 from internal.gaulois g where g.user_id = v_uid) then
      perform internal.crediter_stateres(v_uid);
    end if;
    -- Un solde trop court fait refuser le débit par la table des soldes : la demande s'annule avec lui.
    perform internal.village_debiter(v_uid, 'marche_demande', p_prix::integer, 'demande/' || v_id);
    return internal.marche_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.poser_demande(text, text, numeric) from public, anon, authenticated;
grant execute on function public.poser_demande(text, text, numeric) to authenticated;

-- Retire une de ses demandes ouvertes : ses statères mis de côté reviennent, et la fonction répond le marché à jour. La
-- demande reste notée 30 jours (`retiree`), pour compter les demandes du jour. Refus : demande_fermee (inconnue, d'un autre,
-- servie, retirée ou finie), not_validated, et ceux de tout compte.
create or replace function public.retirer_demande(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_demande internal.marche_demandes;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    perform internal.village_verrou(v_uid);
    select * into v_demande from internal.marche_demandes d where d.id = p_id for update;
    if not found or v_demande.acheteur_id <> v_uid or v_demande.etat <> 'ouverte' then perform internal.fail('demande_fermee'); end if;
    update internal.marche_demandes d set etat = 'retiree', ferme_le = now() where d.id = v_demande.id;
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
    values (v_uid, 'marche_demande_rendue', v_demande.prix, 'demande/' || v_demande.id);
    return internal.marche_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.retirer_demande(bigint) from public, anon, authenticated;
grant execute on function public.retirer_demande(bigint) to authenticated;

-- Sert la demande d'un autre membre validé avec un exemplaire de son inventaire : l'exemplaire passe à l'acheteur, comme venu
-- du marché ; le vendeur reçoit le prix en entier (`marche_vente`) ; pour l'acheteur, les statères mis de côté reviennent
-- (`marche_demande_rendue`) et l'achat s'écrit comme un achat au marché (`marche_achat`), les trois lignes avec la ref
-- « demande/<numéro> », dans l'ordre des user_id. Répond le marché à jour, avec `vendu` : { emplacement, objet, prix }.
-- Refus, dans cet ordre : not_validated ; mode_god ; demande_fermee (inconnue, servie, retirée, finie, d'un compte qui n'est
-- plus validé ou en essai, plus chère que la boutique, ou dont l'acheteur a déjà l'objet) ; demande_a_soi ; pas_possede ;
-- objet_porte ; achete_au_marche ; objet_grave (les règles d'une mise en vente) ; et ceux de tout compte. Un refus n'écrit rien.
create or replace function public.servir_demande(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_acheteur uuid;
  v_demande internal.marche_demandes;
  v_ligne internal.gaulois_inventaire;
  v_plafond integer;
  v_ref text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- Le verrou du marché d'abord, puis ceux des deux comptes dans l'ordre des user_id.
  perform internal.marche_verrou();
  perform internal.marche_expirer();
  begin
    v_uid := internal.marche_membre();
    if exists (select 1 from internal.village_god g where g.user_id = v_uid) then perform internal.fail('mode_god'); end if;
    select d.acheteur_id into v_acheteur from internal.marche_demandes d where d.id = p_id;
    if not found then perform internal.fail('demande_fermee'); end if;
    perform internal.village_verrou(least(v_uid, v_acheteur));
    if v_acheteur <> v_uid then perform internal.village_verrou(greatest(v_uid, v_acheteur)); end if;
    select * into v_demande from internal.marche_demandes d where d.id = p_id for update;
    if not found or v_demande.etat <> 'ouverte'
      or not exists (select 1 from public.profiles p where p.user_id = v_demande.acheteur_id and p.status = 'validated')
      or exists (select 1 from internal.village_god g where g.user_id = v_demande.acheteur_id) then
      perform internal.fail('demande_fermee');
    end if;
    if v_demande.acheteur_id = v_uid then perform internal.fail('demande_a_soi'); end if;
    v_plafond := internal.marche_plafond(v_demande.emplacement, v_demande.objet);
    if v_plafond is null or v_demande.prix > v_plafond
      or exists (select 1 from internal.gaulois_inventaire i where i.user_id = v_demande.acheteur_id and i.emplacement = v_demande.emplacement and i.objet = v_demande.objet)
      or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_demande.acheteur_id and m.etat = 'ouverte' and m.emplacement = v_demande.emplacement and m.objet = v_demande.objet) then
      perform internal.fail('demande_fermee');
    end if;
    -- L'exemplaire du vendeur, aux règles de mettre_en_vente (version de 20261114001000).
    select * into v_ligne from internal.gaulois_inventaire i
    where i.user_id = v_uid and i.emplacement = v_demande.emplacement and i.objet = v_demande.objet
    for update;
    if not found then perform internal.fail('pas_possede'); end if;
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois g where g.user_id = v_uid and g.tenue ->> v_demande.emplacement = v_demande.objet) then
      perform internal.fail('objet_porte');
    end if;
    if v_ligne.quantite - v_ligne.du_marche < 1 then perform internal.fail('achete_au_marche'); end if;
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = v_demande.emplacement and gr.objet = v_demande.objet) then
      perform internal.fail('objet_grave');
    end if;
    -- Un exemplaire qui ne vient pas du marché quitte l'inventaire ; s'il ne reste que celui du marché, la ligne le dit.
    if v_ligne.quantite = 1 then
      delete from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = v_demande.emplacement and i.objet = v_demande.objet;
    else
      update internal.gaulois_inventaire i
      set quantite = i.quantite - 1, origine = case when i.quantite - 1 = i.du_marche then 'marche' else i.origine end
      where i.user_id = v_uid and i.emplacement = v_demande.emplacement and i.objet = v_demande.objet;
    end if;
    -- Les lignes du journal, dans l'ordre des user_id. L'acheteur reçoit ses statères mis de côté juste avant de payer :
    -- son solde ne peut pas manquer.
    v_ref := 'demande/' || v_demande.id;
    if v_demande.acheteur_id < v_uid then
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_demande.acheteur_id, 'marche_demande_rendue', v_demande.prix, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_demande.acheteur_id, 'marche_achat', -v_demande.prix, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'marche_vente', v_demande.prix, v_ref);
    else
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'marche_vente', v_demande.prix, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_demande.acheteur_id, 'marche_demande_rendue', v_demande.prix, v_ref);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_demande.acheteur_id, 'marche_achat', -v_demande.prix, v_ref);
    end if;
    update internal.marche_demandes d set etat = 'servie', vendeur_id = v_uid, ferme_le = now() where d.id = v_demande.id;
    insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine, du_marche)
    values (v_demande.acheteur_id, v_demande.emplacement, v_demande.objet, 1, 'marche', 1)
    on conflict (user_id, emplacement, objet) do nothing;
    -- Arrivé entre-temps par un autre chemin : tout s'annule avec le refus.
    if not found then perform internal.fail('demande_fermee'); end if;
    return internal.marche_json(v_uid) || jsonb_build_object('vendu', jsonb_build_object('emplacement', v_demande.emplacement, 'objet', v_demande.objet, 'prix', v_demande.prix));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.servir_demande(bigint) from public, anon, authenticated;
grant execute on function public.servir_demande(bigint) to authenticated;

/* ---------- 4. Les annonces sur Discord ---------- */

-- Les offres et les demandes posées depuis le dernier passage du robot, pour le salon des achats : { ok: true,
-- offres_jusqu_a, demandes_jusqu_a, offres: [{ id, emplacement, objet, prix, prix_boutique, en_rayon, compte, nom, discord,
-- le }], demandes: [même forme] } ; { ok: false, error: 'invalid_request' } pour un numéro négatif. Au premier passage
-- (un numéro null), les derniers numéros seulement : ce qui est déjà au marché n'est pas annoncé. Comme achats_du_village :
-- rien de plus récent que 2 minutes (une ligne d'un numéro plus petit peut encore arriver), 100 au plus par passage, le nom
-- Discord (public.private_links.discord_name) ou le nom de secours (pseudo public, sinon « Gaulois n° »). Seules les offres
-- et demandes encore ouvertes d'un compte validé sont rendues ; les numéros avancent sur toutes. Réservée à la clé de service.
create or replace function public.annonces_du_marche(p_offres_apres bigint, p_demandes_apres bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_avant timestamptz := now() - interval '2 minutes';
  v_borne_offres bigint;
  v_borne_demandes bigint;
  v_offres_jusqu_a bigint;
  v_demandes_jusqu_a bigint;
  v_offres jsonb;
  v_demandes jsonb;
begin
  if (p_offres_apres is not null and p_offres_apres < 0) or (p_demandes_apres is not null and p_demandes_apres < 0) then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select coalesce(min(m.id), 9223372036854775807) into v_borne_offres from internal.marche_offres m where m.cree_le > v_avant;
  select coalesce(min(d.id), 9223372036854775807) into v_borne_demandes from internal.marche_demandes d where d.cree_le > v_avant;

  if p_offres_apres is null or p_demandes_apres is null then
    return jsonb_build_object(
      'ok', true,
      'offres_jusqu_a', coalesce((select max(m.id) from internal.marche_offres m where m.id < v_borne_offres), 0),
      'demandes_jusqu_a', coalesce((select max(d.id) from internal.marche_demandes d where d.id < v_borne_demandes), 0),
      'offres', '[]'::jsonb,
      'demandes', '[]'::jsonb
    );
  end if;

  with lues as (
    select m.id, m.vendeur_id as user_id, m.emplacement, m.objet, m.prix, m.etat, m.cree_le
    from internal.marche_offres m
    where m.id > p_offres_apres and m.id < v_borne_offres
    order by m.id
    limit 100
  )
  select
    (select coalesce(max(l.id), p_offres_apres) from lues l),
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', l.id, 'emplacement', l.emplacement, 'objet', l.objet, 'prix', l.prix,
          'prix_boutique', internal.marche_plafond(l.emplacement, l.objet),
          'en_rayon', internal.boutique_en_rayon(l.emplacement, l.objet, now()),
          'compte', p.gaul_number,
          'nom', coalesce(internal.member_pseudo(p.user_id), 'Gaulois n° ' || p.gaul_number),
          'discord', nullif(btrim(pl.discord_name), ''),
          'le', l.cree_le)
        order by l.id)
      from lues l
      join public.profiles p on p.user_id = l.user_id
      left join public.private_links pl on pl.user_id = l.user_id
      where l.etat = 'ouverte' and p.status = 'validated'), '[]'::jsonb)
  into v_offres_jusqu_a, v_offres;

  with lues as (
    select d.id, d.acheteur_id as user_id, d.emplacement, d.objet, d.prix, d.etat, d.cree_le
    from internal.marche_demandes d
    where d.id > p_demandes_apres and d.id < v_borne_demandes
    order by d.id
    limit 100
  )
  select
    (select coalesce(max(l.id), p_demandes_apres) from lues l),
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', l.id, 'emplacement', l.emplacement, 'objet', l.objet, 'prix', l.prix,
          'prix_boutique', internal.marche_plafond(l.emplacement, l.objet),
          'en_rayon', internal.boutique_en_rayon(l.emplacement, l.objet, now()),
          'compte', p.gaul_number,
          'nom', coalesce(internal.member_pseudo(p.user_id), 'Gaulois n° ' || p.gaul_number),
          'discord', nullif(btrim(pl.discord_name), ''),
          'le', l.cree_le)
        order by l.id)
      from lues l
      join public.profiles p on p.user_id = l.user_id
      left join public.private_links pl on pl.user_id = l.user_id
      where l.etat = 'ouverte' and p.status = 'validated'
        and not exists (select 1 from internal.village_god g where g.user_id = l.user_id)), '[]'::jsonb)
  into v_demandes_jusqu_a, v_demandes;

  return jsonb_build_object(
    'ok', true,
    'offres_jusqu_a', v_offres_jusqu_a,
    'demandes_jusqu_a', v_demandes_jusqu_a,
    'offres', v_offres,
    'demandes', v_demandes
  );
end $$;

revoke all on function public.annonces_du_marche(bigint, bigint) from public, anon, authenticated;
grant execute on function public.annonces_du_marche(bigint, bigint) to service_role;

-- Celle de 20261115000100_achats_nom_discord.sql, avec un ajout : un achat au marché fait en servant une demande (`ref`
-- « demande/<numéro> ») se lit dans la demande, comme un achat d'une offre (« offre/<numéro> ») se lit dans l'offre.
create or replace function public.achats_du_village(p_apres bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_avant timestamptz := now() - interval '2 minutes';
  v_borne bigint;
  v_jusqu_a bigint;
  v_achats jsonb;
begin
  if p_apres is not null and p_apres < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  -- Le premier achat trop récent : rien ne se lit à partir de lui.
  select coalesce(min(m.id), 9223372036854775807) into v_borne
  from internal.stateres_mouvements m
  where m.nature in ('achat', 'pochette', 'marche_achat') and m.cree_le > v_avant;

  -- Premier passage : le dernier numéro seulement.
  if p_apres is null then
    select coalesce(max(m.id), 0) into v_jusqu_a
    from internal.stateres_mouvements m
    where m.nature in ('achat', 'pochette', 'marche_achat') and m.id < v_borne;
    return jsonb_build_object('ok', true, 'jusqu_a', v_jusqu_a, 'achats', '[]'::jsonb);
  end if;

  with lus as (
    select m.id, m.user_id, m.nature, m.ref, m.cree_le
    from internal.stateres_mouvements m
    where m.id > p_apres and m.id < v_borne and m.nature in ('achat', 'pochette', 'marche_achat')
    order by m.id
    limit 100
  ),
  objets as (
    select l.id, l.user_id, l.nature, l.cree_le,
      case when l.nature = 'marche_achat' then coalesce(o.emplacement, d.emplacement)
           when l.ref ~ '^[a-z]{1,20}/[a-z][a-z-]{0,39}$' then split_part(l.ref, '/', 1) end as emplacement,
      case when l.nature = 'marche_achat' then coalesce(o.objet, d.objet)
           when l.ref ~ '^[a-z]{1,20}/[a-z][a-z-]{0,39}$' then split_part(l.ref, '/', 2) end as objet
    from lus l
    -- Le `case` garde la conversion : un « emplacement/objet » n'est jamais lu comme un numéro.
    left join internal.marche_offres o
      on l.nature = 'marche_achat'
      and o.id = case when l.ref ~ '^offre/[0-9]{1,18}$' then substring(l.ref from 7)::bigint end
    -- Ajout de 20261119000100 : la demande servie.
    left join internal.marche_demandes d
      on l.nature = 'marche_achat'
      and d.id = case when l.ref ~ '^demande/[0-9]{1,18}$' then substring(l.ref from 9)::bigint end
  )
  select
    (select coalesce(max(l.id), p_apres) from lus l),
    coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id,
        'nature', x.nature,
        'emplacement', x.emplacement,
        'objet', x.objet,
        'compte', p.gaul_number,
        'nom', coalesce(internal.member_pseudo(p.user_id), 'Gaulois n° ' || p.gaul_number),
        'discord', nullif(btrim(pl.discord_name), ''),
        'le', x.cree_le)
      order by x.id), '[]'::jsonb)
  into v_jusqu_a, v_achats
  from objets x
  join public.profiles p on p.user_id = x.user_id
  left join public.private_links pl on pl.user_id = x.user_id
  where p.status = 'validated' and x.emplacement is not null and x.objet is not null;

  return jsonb_build_object('ok', true, 'jusqu_a', v_jusqu_a, 'achats', v_achats);
end $$;

-- Les droits ne changent pas : seule la clé de service, celle du robot, l'appelle.
revoke all on function public.achats_du_village(bigint) from public, anon, authenticated;
grant execute on function public.achats_du_village(bigint) to service_role;

/* ---------- La sauvegarde ---------- */

-- La sauvegarde chiffrée (remplace celle de la migration 20261117001600, version 11, ligne pour ligne) : version 12, avec
-- les demandes d'achat du marché. Leurs statères mis de côté sont au journal (stateres_mouvements, déjà sauvegardé) ; la
-- demande dit à qui ils reviennent.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 12,
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
    'gaulois_cadres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.cadre), '[]') from internal.gaulois_cadres t),
    -- Ajout de la version 12 : les demandes d'achat du marché.
    'marche_demandes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_demandes t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
