-- La forge aux souvenirs du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois » ; formes des réponses :
-- src/lib/village/contrat.ts, `MaForge`, `PlaqueVue`, `RefusForge` ; lecture et textes côté site : src/lib/village/forge.ts).
--
-- L'idée du pilote, 14 novembre 2026 : « On paie des statères pour graver une vraie partie sur son épée : “12 novembre, à
-- quatre, 2,33 points rapportés”. Les objets racontent enfin quelque chose, et les statères servent à autre chose qu'à la
-- boutique. »
--
-- Les règles (choix du chef de chantier, le même jour) :
-- - Un membre validé qui a créé son Gaulois grave une de SES parties qui ont rapporté des points au clan, celles de son
--   journal des statères (internal.stateres_mouvements, nature 'victoire', migration 20261113001800), sur un objet qu'il
--   porte ou possède : un objet à rareté d'un des cinq emplacements d'objets (tête, haut, bas, pieds, arme), gratuit ou dans
--   son inventaire. Jamais le corps, le visage ni une case « rien » (`objet_non_gravable`).
-- - Une plaque par objet et par compte. Regraver remplace la plaque et se paie de nouveau ; effacer est gratuit.
-- - Le texte de la plaque se fait des seuls faits de la partie : le jour à Paris, le nombre de Gaulois du clan dans la partie
--   (`gaulois` du journal, le clanPlayerCount de la session du clan) et ses points rapportés au clan, arrondis à deux
--   décimales (internal.forge_plaque, la même règle que texteDeLaPlaque de src/lib/village/forge.ts). Exemple : « 12
--   novembre, à quatre, 2,33 points rapportés ». Ces faits sont copiés du journal au moment de graver. Aucun nom, aucun
--   identifiant ni aucune heure de partie n'est gardé avec la plaque.
-- - Prix : 150 statères (internal.forge_prix, le même que PRIX_GRAVURE de contrat.ts : un test garde les deux identiques),
--   débité au journal des statères (nature 'gravure', `ref` : « emplacement/objet ») dans la même transaction que la plaque.
--   C'est la table des soldes qui refuse un solde insuffisant (`solde_insuffisant`). Le prix vu à l'écran est vérifié comme à
--   la boutique (`prix_change`). La contrainte des natures du journal admet déjà 'gravure' : elle ne change pas.
-- - Le dernier exemplaire d'un objet gravé ne se met pas en vente au marché (`objet_grave`, mettre_en_vente remplacée) :
--   effacer la plaque d'abord. Choix de cette migration : un double de la pochette se vend toujours, la plaque reste sur
--   l'exemplaire gardé.
--
-- Qui voit une plaque :
-- - son propriétaire, toujours : get_ma_forge (tout), get_mon_gaulois (ses plaques), la place (celles de ce qu'il porte) ;
-- - les autres, sur la place (get_village, comptes validés et encadrement), seulement les plaques des objets que ce Gaulois
--   porte, et seulement si son compte a un pseudo public unique dans la liste du clan (internal.member_pseudo), la règle de
--   `partie_le` (revue de sécurité du 14 novembre 2026). Le jour et les points d'une partie, croisés avec les sessions
--   publiques du clan, donneraient sinon l'identifiant OpenFront d'un membre anonyme, que le site ne publie jamais. Pour un
--   anonyme, la liste est vide, comme pour qui n'a rien gravé : la réponse ne dit pas qui est anonyme. Seulement ce qu'il
--   porte : la place ne dit jamais ce qu'un membre possède.
--
-- Ce qui est gardé : internal.gaulois_gravures, la plaque de chaque objet gravé (l'objet, le jour, le nombre de Gaulois, les
-- points, l'heure de la gravure), jusqu'à ce qu'elle soit effacée, remplacée, ou que le compte soit effacé. La sauvegarde
-- chiffrée (export_site, version 6) ne la garde pas : le jour et les points d'une partie désigneraient le joueur OpenFront
-- d'un membre, et la sauvegarde ne garde jamais les parties d'un compte (migration 20261113002200). Après une restauration,
-- les plaques sont perdues ; leurs débits, eux, restent au journal comme les autres achats.
--
-- L'onglet Village de la Direction (get_village_economie, remplacée) compte en plus les statères dépensés à la forge, sous la
-- règle des 5 comptes. Comme distribués, moins dépensés à la boutique et en pochettes, moins dépensés à la forge, égale en
-- circulation, la circulation est cachée tant que les gravures le sont (de 1 à 4 comptes) : la soustraction la redonnerait.
--
-- Qui peut quoi :
-- - get_ma_forge : un compte connecté, non suspendu, pour lui seul. Limitée comme les gestes.
-- - graver_objet : un compte validé qui a créé son Gaulois. effacer_gravure : un compte connecté non suspendu, sa propre
--   plaque seulement. Limitées comme les gestes. Sous le verrou du compte (internal.village_verrou), comme la boutique et le
--   marché ; la fin des offres du marché est constatée avant (verrou du marché d'abord).
--
-- Rien n'est écrit au journal de l'encadrement : c'est l'habit d'un joueur.
--
-- Une table, treize fonctions ajoutées (trois publiques), quatre fonctions remplacées (mettre_en_vente, get_mon_gaulois,
-- get_village, get_village_economie), chacune depuis sa dernière version et sans rien perdre. Aucune table ni colonne
-- retirée, aucune donnée existante touchée. Rejouée, elle se remplace par la même.

/* ---------- La table ---------- */

create table if not exists internal.gaulois_gravures (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  emplacement text not null check (emplacement in ('tete', 'haut', 'bas', 'pieds', 'arme')),
  objet text not null,
  -- Les faits de la partie, copiés du journal des statères au moment de graver : le jour à Paris, le nombre de Gaulois du clan
  -- dans la partie, les points rapportés au clan. Ni l'identifiant de la partie, ni son heure.
  jour date not null,
  gaulois integer not null check (gaulois between 1 and 200),
  points numeric not null check (points > 0 and points < 1000),
  grave_le timestamptz not null default now(),
  primary key (user_id, emplacement, objet),
  foreign key (emplacement, objet) references internal.gaulois_objets (emplacement, objet)
);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.gaulois_gravures enable row level security;
revoke all on table internal.gaulois_gravures from public, anon, authenticated;

/* ---------- Le prix et le texte de la plaque ---------- */

-- Le prix d'une gravure, en statères : le même nombre que PRIX_GRAVURE de contrat.ts (un test le garde).
create or replace function internal.forge_prix() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 150 $$;

-- Le jour, en français : « 1er novembre », « 12 novembre ».
create or replace function internal.forge_jour(p_jour date) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when extract(day from p_jour) = 1 then '1er' else extract(day from p_jour)::integer::text end
    || ' ' || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from p_jour)::integer]
$$;

-- Le nombre de Gaulois du clan dans la partie, en mots : « seul », « à deux »… « à vingt », puis en chiffres : « à 23 ».
create or replace function internal.forge_compagnie(p_gaulois integer) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_gaulois = 1 then 'seul'
    when p_gaulois between 2 and 20 then 'à ' || (array['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt'])[p_gaulois - 1]
    else 'à ' || p_gaulois::text
  end
$$;

-- Les points rapportés au clan, arrondis à deux décimales (une demie vers le haut), sans zéro inutile, avec la virgule :
-- « 2,33 points rapportés », « 1,5 point rapporté » (au singulier sous 2). Moins d'un centième, qui s'arrondirait à zéro :
-- « moins de 0,01 point rapporté », jamais « 0 point » pour une partie qui en a rapporté.
create or replace function internal.forge_points(p_points numeric) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when round(p_points, 2) < 0.01 then 'moins de 0,01 point rapporté'
    else replace(trim_scale(round(p_points, 2))::text, '.', ',')
      || case when round(p_points, 2) >= 2 then ' points rapportés' else ' point rapporté' end
  end
$$;

-- Le texte de la plaque : « 12 novembre, à quatre, 2,33 points rapportés ».
create or replace function internal.forge_plaque(p_jour date, p_gaulois integer, p_points numeric) returns text
language sql immutable set search_path = public, pg_temp as $$
  select internal.forge_jour(p_jour) || ', ' || internal.forge_compagnie(p_gaulois) || ', ' || internal.forge_points(p_points)
$$;

revoke all on function internal.forge_prix() from public, anon, authenticated;
revoke all on function internal.forge_jour(date) from public, anon, authenticated;
revoke all on function internal.forge_compagnie(integer) from public, anon, authenticated;
revoke all on function internal.forge_points(numeric) from public, anon, authenticated;
revoke all on function internal.forge_plaque(date, integer, numeric) from public, anon, authenticated;

/* ---------- Les outils internes ---------- */

-- L'appelant, s'il entre à la forge : connecté, non suspendu. Sinon une erreur, comme ailleurs. Graver demande en plus un
-- compte validé avec son Gaulois (internal.village_acheteur, migration 20261113001900).
create or replace function internal.forge_titulaire() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select p.status into v_status from public.profiles p where p.user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  return v_uid;
end $$;

-- Les objets que `p_uid` peut graver : un objet à rareté d'un des cinq emplacements d'objets, gratuit ou dans son
-- inventaire. `rang` : l'ordre des emplacements, de la tête à l'arme.
create or replace function internal.forge_objets(p_uid uuid) returns table (emplacement text, objet text, rang integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.emplacement, o.objet, array_position(array['tete', 'haut', 'bas', 'pieds', 'arme'], o.emplacement)
  from internal.gaulois_objets o
  where o.emplacement in ('tete', 'haut', 'bas', 'pieds', 'arme') and o.rarete is not null
    and (o.gratuit or exists (
      select 1 from internal.gaulois_inventaire i
      where i.user_id = p_uid and i.emplacement = o.emplacement and i.objet = o.objet))
$$;

-- Les plaques de `p_uid` sur ses objets encore gravables (pour lui seul) : [{ emplacement, objet, texte }].
create or replace function internal.forge_mes_plaques(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('emplacement', gr.emplacement, 'objet', gr.objet, 'texte', internal.forge_plaque(gr.jour, gr.gaulois, gr.points))
      order by f.rang, gr.objet), '[]'::jsonb)
  from internal.gaulois_gravures gr
  join internal.forge_objets(p_uid) f on f.emplacement = gr.emplacement and f.objet = gr.objet
  where gr.user_id = p_uid
$$;

-- Les plaques de `p_uid` sur les seuls objets de la tenue `p_tenue`, celle que la place montre : [{ emplacement, objet,
-- texte }]. Rien de ce qu'il possède sans le porter.
create or replace function internal.forge_plaques_portees(p_uid uuid, p_tenue jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('emplacement', gr.emplacement, 'objet', gr.objet, 'texte', internal.forge_plaque(gr.jour, gr.gaulois, gr.points))
      order by array_position(array['tete', 'haut', 'bas', 'pieds', 'arme'], gr.emplacement), gr.objet), '[]'::jsonb)
  from internal.gaulois_gravures gr
  where gr.user_id = p_uid and p_tenue ->> gr.emplacement = gr.objet
$$;

-- La forge vue par `p_uid` (`MaForge` du contrat) : { ok: true, prix, solde, peut_graver, plaques_vues, parties, objets }.
-- - peut_graver : compte validé avec un Gaulois créé ;
-- - plaques_vues : les autres membres voient ses plaques sur la place (pseudo public unique dans la liste du clan) ;
-- - parties : ses 100 dernières parties qui ont rapporté des points au clan, d'après son journal des statères, les plus
--   récentes d'abord : { partie, debut, jour, gaulois, points, texte } (`partie` sert à graver_objet ; l'écran ne la montre pas) ;
-- - objets : ses objets gravables, de la tête à l'arme, { emplacement, objet, porte, gravure }, `gravure` : { jour, gaulois,
--   points, texte, grave_le } ou null.
-- Jamais le solde ni les objets d'un autre.
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
      left join internal.gaulois_gravures gr on gr.user_id = p_uid and gr.emplacement = f.emplacement and gr.objet = f.objet), '[]'::jsonb)
  )
$$;

revoke all on function internal.forge_titulaire() from public, anon, authenticated;
revoke all on function internal.forge_objets(uuid) from public, anon, authenticated;
revoke all on function internal.forge_mes_plaques(uuid) from public, anon, authenticated;
revoke all on function internal.forge_plaques_portees(uuid, jsonb) from public, anon, authenticated;
revoke all on function internal.forge_json(uuid) from public, anon, authenticated;

/* ---------- La forge ---------- */

-- La forge de l'appelant (`MaForge` du contrat). Constate d'abord la fin des offres du marché (un objet revenu se grave) et
-- crédite ce qui lui revient déjà, comme la boutique. Refus : not_signed_in, suspended, rate_limited.
create or replace function public.get_ma_forge() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.forge_titulaire();
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  perform internal.marche_expirer();
  if exists (select 1 from public.profiles p join internal.gaulois g on g.user_id = p.user_id where p.user_id = v_uid and p.status = 'validated') then
    perform internal.crediter_stateres(v_uid);
  end if;
  return internal.forge_json(v_uid);
end $$;

revoke all on function public.get_ma_forge() from public, anon, authenticated;
grant execute on function public.get_ma_forge() to authenticated;

-- Grave la partie `p_partie` de l'appelant (une partie de son journal des statères) sur l'objet `p_emplacement`/`p_objet`, au
-- prix de la forge, et répond la forge à jour. Une plaque déjà là est remplacée, et se paie de nouveau. `p_prix_vu` : le prix
-- que le membre a vu à l'écran. Refus, dans cet ordre : not_validated, no_gaulois ; objet_non_gravable (hors du catalogue,
-- corps, visage ou case « rien ») ; pas_possede (objet payant absent de l'inventaire) ; partie_inconnue (pas une partie de son
-- journal) ; deja_grave (l'objet porte déjà cette plaque) ; prix_change ; solde_insuffisant ; et ceux de tout compte
-- (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.graver_objet(p_emplacement text, p_objet text, p_partie text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer := internal.forge_prix();
  v_partie record;
  v_jour date;
  v_avant internal.gaulois_gravures;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  -- La fin des offres, avant le verrou du compte (verrou du marché d'abord), et hors du bloc protégé.
  perform internal.marche_expirer();
  begin
    v_uid := internal.village_acheteur();
    if p_emplacement is null or p_emplacement not in ('tete', 'haut', 'bas', 'pieds', 'arme') or not exists (
      select 1 from internal.gaulois_objets o where o.emplacement = p_emplacement and o.objet = p_objet and o.rarete is not null
    ) then
      perform internal.fail('objet_non_gravable');
    end if;
    perform internal.village_verrou(v_uid);
    if not exists (select 1 from internal.forge_objets(v_uid) f where f.emplacement = p_emplacement and f.objet = p_objet) then
      perform internal.fail('pas_possede');
    end if;
    select m.debut, m.gaulois, m.points into v_partie
    from internal.stateres_mouvements m
    where m.user_id = v_uid and m.nature = 'victoire' and m.partie = p_partie;
    if not found then perform internal.fail('partie_inconnue'); end if;
    v_jour := (v_partie.debut at time zone 'Europe/Paris')::date;
    select * into v_avant from internal.gaulois_gravures gr
    where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet
    for update;
    -- La même plaque : rien à payer (un double clic ne débite pas deux fois).
    if found and internal.forge_plaque(v_avant.jour, v_avant.gaulois, v_avant.points) = internal.forge_plaque(v_jour, v_partie.gaulois, v_partie.points) then
      perform internal.fail('deja_grave');
    end if;
    -- Le prix a changé depuis que le membre l'a vu : rien n'est débité.
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'gravure', v_prix, p_emplacement || '/' || p_objet);
    insert into internal.gaulois_gravures as gr (user_id, emplacement, objet, jour, gaulois, points)
    values (v_uid, p_emplacement, p_objet, v_jour, v_partie.gaulois, v_partie.points)
    on conflict (user_id, emplacement, objet) do update
      set jour = excluded.jour, gaulois = excluded.gaulois, points = excluded.points, grave_le = now();
    return internal.forge_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.graver_objet(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.graver_objet(text, text, text, integer) to authenticated;

-- Efface la plaque d'un de ses objets, sans rien rendre ni payer, et répond la forge à jour. Refus : pas_grave (aucune plaque
-- sur cet objet), et ceux de tout compte (not_signed_in, suspended, rate_limited).
create or replace function public.effacer_gravure(p_emplacement text, p_objet text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.forge_titulaire();
    perform internal.village_verrou(v_uid);
    delete from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet;
    if not found then perform internal.fail('pas_grave'); end if;
    return internal.forge_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.effacer_gravure(text, text) from public, anon, authenticated;
grant execute on function public.effacer_gravure(text, text) to authenticated;

/* ---------- Le marché : mettre_en_vente de 20261113002000 remplacée ---------- */

-- Comme la version de 20261113002000, avec un refus de plus, le dernier : objet_grave (le dernier exemplaire d'un objet qui
-- porte une plaque de la forge ; effacer la plaque d'abord). Un double se vend : la plaque reste sur l'exemplaire gardé.
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
    -- Ajout de 20261114001000 : le dernier exemplaire d'un objet gravé à la forge reste à son propriétaire.
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet) then
      perform internal.fail('objet_grave');
    end if;
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

/* ---------- Le vestiaire : get_mon_gaulois de 20261113001700 remplacée ---------- */

-- Comme la version de 20261113001700 (mêmes droits, mêmes refus), avec en plus `gravures` : les plaques de la forge sur ses
-- objets, [{ emplacement, objet, texte }], pour lui seul. { ok: true, tenue, gravures }.
create or replace function public.get_mon_gaulois() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.gaulois_titulaire();
    return jsonb_build_object('ok', true, 'tenue', (select g.tenue from internal.gaulois g where g.user_id = v_uid),
      -- Ajout de 20261114001000 : les plaques de la forge sur ses objets.
      'gravures', internal.forge_mes_plaques(v_uid));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.get_mon_gaulois() from public, anon, authenticated;
grant execute on function public.get_mon_gaulois() to authenticated;

/* ---------- La place : get_village de 20261113002300 remplacée ---------- */

-- Comme la version de 20261113002300 (mêmes droits, mêmes lignes, mêmes champs), avec en plus, pour chaque Gaulois,
-- `gravures` : les plaques de la forge sur les objets qu'il porte, [{ emplacement, objet, texte }]. Toujours pour le Gaulois
-- de l'appelant ; pour un autre, seulement si son compte a un pseudo public unique dans la liste du clan
-- (internal.member_pseudo), la règle de `partie_le` ; sinon une liste vide, comme pour qui n'a rien gravé.
create or replace function public.get_village() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_role public.site_role;
  v_bulles boolean;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if v_uid is null then return internal.error_json('not_signed_in', ''); end if;
  select p.status, p.role into v_status, v_role from public.profiles p where p.user_id = v_uid;
  if not found then return internal.error_json('not_signed_in', ''); end if;
  if v_status = 'suspended' then return internal.error_json('suspended', ''); end if;
  if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;
  perform internal.village_vie_effacer_l_ancien();
  v_bulles := coalesce((select r.bulles from internal.village_vie_reglage r where r.id), false);
  return jsonb_build_object(
    'ok', true,
    'gaulois', coalesce((
      select jsonb_agg(jsonb_build_object(
          'nom', internal.village_nom(p.display_name, p.gaul_number),
          'tenue', g.tenue,
          'moi', g.user_id = v_uid,
          'partie_le', d.debut,
          'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),
          'replique', case when v_bulles and v.replique_le > now() - interval '12 hours'
            and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))
            then v.replique end,
          -- Ajout de 20261114001000 : les plaques de la forge sur ce qu'il porte, pour lui toujours, pour les autres
          -- seulement avec un pseudo public (la règle de partie_le).
          'gravures', case when g.user_id = v_uid or internal.member_pseudo(g.user_id) is not null
            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end)
        order by g.created_at, g.user_id)
      from internal.gaulois g
      join public.profiles p on p.user_id = g.user_id
      left join internal.village_vie v on v.user_id = g.user_id
      left join lateral internal.village_vie_partie(g.user_id) d on true
      where p.status = 'validated'), '[]'::jsonb),
    'releve', coalesce(
      (select max(v.vocal_le) from internal.village_vie v join public.profiles p on p.user_id = v.user_id where p.status = 'validated'),
      (select r.le from internal.stateres_releve r where r.id))
  );
end $$;

revoke all on function public.get_village() from public, anon, authenticated;
grant execute on function public.get_village() to authenticated;

/* ---------- L'onglet Village de la Direction : get_village_economie de 20261113002100 remplacée ---------- */

-- Comme la version de 20261113002100 (mêmes droits, mêmes seuils, mêmes champs), avec en plus `gravures` : les statères
-- dépensés à la forge (nature 'gravure'), depuis le début et sur 30 jours, sous la règle des 5 comptes, comme les autres
-- chiffres. Les « dépensés » restent ceux de la boutique et des pochettes. Distribués, moins dépensés, moins gravures, égale
-- en circulation : tant que les gravures sont cachées, la circulation l'est aussi.
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
  -- Ajout de 20261114001000 : les gravures de la forge.
  v_graves boolean;
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
    coalesce(-(sum(m.montant) filter (where m.nature = 'pochette' and m.cree_le >= v_depuis)), 0) as pochettes_30,
    -- Ajout de 20261114001000 : les comptes qui ont gravé à la forge, et ce qu'ils y ont dépensé.
    count(distinct m.user_id) filter (where m.nature = 'gravure') as graveurs,
    count(distinct m.user_id) filter (where m.nature = 'gravure' and m.cree_le >= v_depuis) as graveurs_30,
    count(distinct m.user_id) filter (where m.nature = 'gravure' and m.cree_le < v_depuis) as graveurs_avant,
    coalesce(-(sum(m.montant) filter (where m.nature = 'gravure')), 0) as gravures,
    coalesce(-(sum(m.montant) filter (where m.nature = 'gravure' and m.cree_le >= v_depuis)), 0) as gravures_30
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
  -- Ajout de 20261114001000 : distribués, moins dépensés, moins gravures, égale en circulation. Les gravures cachées (de 1 à
  -- 4 comptes), la circulation l'est aussi : sinon distribués moins dépensés moins circulation les redonnerait. La
  -- circulation cachée, les distribués et les dépensés laissent deux inconnues : rien de plus à cacher.
  v_graves := internal.village_passe(v_j.graveurs);
  if not v_graves then v_circule := false; end if;

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
    -- Ajout de 20261114001000 : les statères dépensés à la forge, sous le même seuil.
    'gravures', jsonb_build_object('total', case when v_graves then v_j.gravures end, 'trente_jours', case when internal.village_passe(v_j.graveurs_30) and internal.village_passe(v_j.graveurs_avant) then v_j.gravures_30 end),
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

-- Officiers et au-dessus pour la lecture : la fonction le vérifie elle-même.
revoke all on function public.get_village_economie() from public, anon, authenticated;
grant execute on function public.get_village_economie() to authenticated;
