-- Le mode GOD du village : un essai sans trace, pour un seul compte (docs/DIRECTION.md, « Le mode GOD du village »).
--
-- Demande du pilote, 16 novembre 2026 : « un bouton uniquement pour moi, GOD, qui me donne argent infini pour tester les
-- fonctionnalités, et une fois que je retire le mode GOD ça me remet à mon perso de base ; je veux rien me giver mais
-- tester ; aucune notif sur Discord ; attention, seulement moi ai droit à cette fonctionnalité ».
--
-- Les règles :
-- - Un seul compte y a droit : celui dont l'identifiant Discord est dans internal.village_god_titulaire. Cette table est
--   vide ici : l'identifiant s'écrit dans l'éditeur SQL de Supabase, jamais dans le dépôt. Le compte se reconnaît par
--   public.private_links.discord_id, qui ne vient que de Discord (auth.identities, ou la commande /code signée). Tout autre
--   compte, fondateur compris, reçoit { permis: false } à la lecture et 'forbidden' aux deux boutons.
-- - Allumer : le serveur garde une copie de ce que le compte possède et porte (tenue, familier, bannière, inventaire,
--   familiers, bannières, Gaulois uniques, gravures), puis ajoute 1 000 000 de statères au journal (nature 'god_debut').
--   Refusé s'il a une offre ouverte au marché ('offres_ouvertes').
-- - Pendant l'essai, chaque mouvement de statères du compte change de nature : 'achat' devient 'test_achat', 'pochette'
--   'test_pochette', etc. Un mouvement de sens inverse l'annule aussitôt (nature 'god_retour') : le solde ne bouge pas, il
--   reste « infini ». Ainsi rien de ce qui lit le journal par sa nature ne voit l'essai : ni l'annonce des achats sur
--   Discord (public.achats_du_village), ni les totaux de l'onglet Village de la Direction.
-- - Les vrais gains restent vrais : 'victoire', 'pronostic_gain', 'pronostic_rendu' et 'marche_vente' ne sont pas touchés.
-- - Rien ne sort du compte : acheter ou vendre au marché et miser sur un pronostic sont refusés ('mode_god').
-- - Les autres ne voient rien : la vitrine, /gaulois, les images du robot et la bannière de /liste montrent le Gaulois de la
--   copie tant que l'essai dure. Le titulaire, lui, voit son Gaulois d'essai dans « Mon Gaulois ».
-- - Éteindre : tout ce que le compte possède et porte redevient la copie, les fusions de l'essai sont oubliées, le million
--   est repris (nature 'god_fin'). Le journal des statères ne s'efface pas : les lignes de l'essai y restent, leur somme
--   vaut zéro.
-- - Allumer et éteindre vont au journal de l'encadrement ('village_god_on', 'village_god_off').
--
-- Ce qui change :
-- - Deux tables privées : internal.village_god_titulaire (qui y a droit) et internal.village_god (l'essai en cours).
-- - Deux déclencheurs sur internal.stateres_mouvements, un sur internal.marche_offres.
-- - public.get_village_god, public.activer_village_god, public.desactiver_village_god (nouvelles).
-- - public.get_village (depuis la 20261116000200), public.discord_gaulois (20261115000900), public.gaulois_des_joueurs
--   (20261114000400) et public.bannieres_des_joueurs (20261116000400), remplacées ligne pour ligne : elles lisent le
--   Gaulois par internal.gaulois_montre, qui rend la copie pendant un essai.
-- - public.get_village_economie (depuis la 20261114001000), remplacée ligne pour ligne : les statères « en circulation »
--   ne comptent pas les lignes du mode GOD (natures 'god_…' et 'test_…'), sinon le million prêté s'y verrait.
--
-- Aucune donnée existante n'est touchée. Rejouée, elle ne change plus rien.

create table if not exists internal.village_god_titulaire (
  discord_id text primary key check (discord_id ~ '^[0-9]{17,20}$')
);

create table if not exists internal.village_god (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  depuis timestamptz not null default now(),
  -- { gaulois, inventaire, familiers, bannieres, modeles, gravures } : les lignes du compte, telles qu'elles étaient.
  sauvegarde jsonb not null
);

alter table internal.village_god_titulaire enable row level security;
alter table internal.village_god enable row level security;
revoke all on table internal.village_god_titulaire from public, anon, authenticated;
revoke all on table internal.village_god from public, anon, authenticated;

-- Ce que le mode GOD ajoute au départ et reprend à la fin.
create or replace function internal.village_god_somme() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 1000000 $$;

-- L'appelant a-t-il droit au mode GOD ? Son identifiant Discord, lu chez Discord, est dans la table des titulaires, et son
-- compte est validé.
create or replace function internal.village_god_permis() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    join public.private_links l on l.user_id = p.user_id
    join internal.village_god_titulaire t on t.discord_id = l.discord_id
    where p.user_id = auth.uid() and p.status = 'validated'
  )
$$;

-- Le Gaulois d'un compte tel que les autres le voient : la copie pendant un essai, sinon celui d'aujourd'hui.
create or replace function internal.gaulois_montre(p_user uuid) returns table (tenue jsonb, familier text, banniere text, essai boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    case when d.user_id is null then g.tenue else d.sauvegarde -> 'gaulois' -> 'tenue' end,
    case when d.user_id is null then g.familier else d.sauvegarde -> 'gaulois' ->> 'familier' end,
    case when d.user_id is null then g.banniere else d.sauvegarde -> 'gaulois' ->> 'banniere' end,
    d.user_id is not null
  from internal.gaulois g
  left join internal.village_god d on d.user_id = g.user_id
  where g.user_id = p_user
$$;

/* ---------- Le journal des statères pendant un essai ---------- */

-- Avant chaque ligne du journal : pour un compte en essai, la nature devient 'test_…' ; ce qui sortirait du compte est
-- refusé ; les vrais gains passent tels quels.
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

-- Après chaque ligne d'essai : la même somme dans l'autre sens. Le solde ne bouge pas. Seulement pendant un essai : une
-- sauvegarde restaurée, qui réécrit d'anciennes lignes 'test_…' avec leurs retours, ne rend rien une seconde fois.
create or replace function internal.village_god_retour() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature like 'test\_%' and exists (select 1 from internal.village_god d where d.user_id = new.user_id) then
    insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (new.user_id, 'god_retour', -new.montant, new.ref);
  end if;
  return null;
end $$;

-- Un compte en essai ne met rien en vente : un objet d'essai ne doit jamais arriver chez un autre.
create or replace function internal.village_god_pas_de_vente() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from internal.village_god d where d.user_id = new.vendeur_id) then perform internal.fail('mode_god'); end if;
  return new;
end $$;

create or replace trigger village_god_mouvement before insert on internal.stateres_mouvements
  for each row execute function internal.village_god_mouvement();
-- Son nom le place après stateres_tenir_solde : le solde est déjà à jour quand le retour s'écrit.
create or replace trigger village_god_retour after insert on internal.stateres_mouvements
  for each row execute function internal.village_god_retour();
create or replace trigger village_god_pas_de_vente before insert on internal.marche_offres
  for each row execute function internal.village_god_pas_de_vente();

revoke all on function internal.village_god_somme() from public, anon, authenticated;
revoke all on function internal.village_god_permis() from public, anon, authenticated;
revoke all on function internal.gaulois_montre(uuid) from public, anon, authenticated;
revoke all on function internal.village_god_mouvement() from public, anon, authenticated;
revoke all on function internal.village_god_retour() from public, anon, authenticated;
revoke all on function internal.village_god_pas_de_vente() from public, anon, authenticated;

/* ---------- Les trois fonctions du bouton ---------- */

-- { ok: true, permis: false } pour tout autre compte : l'écran ne montre alors rien.
-- { ok: true, permis: true, actif, depuis, somme } pour le titulaire.
create or replace function public.get_village_god() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_depuis timestamptz;
begin
  if v_uid is null or not internal.village_god_permis() then
    return jsonb_build_object('ok', true, 'permis', false);
  end if;
  select d.depuis into v_depuis from internal.village_god d where d.user_id = v_uid;
  return jsonb_build_object('ok', true, 'permis', true, 'actif', v_depuis is not null, 'depuis', v_depuis, 'somme', internal.village_god_somme());
end $$;

-- Allume le mode GOD. Déjà allumé : ne refait rien. Refus : 'forbidden', 'no_gaulois', 'offres_ouvertes'.
create or replace function public.activer_village_god() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_sauvegarde jsonb;
begin
  if v_uid is null or not internal.village_god_permis() then return internal.error_json('forbidden', ''); end if;
  perform internal.village_verrou(v_uid);
  if exists (select 1 from internal.village_god d where d.user_id = v_uid) then return public.get_village_god(); end if;
  if not exists (select 1 from internal.gaulois g where g.user_id = v_uid) then return internal.error_json('no_gaulois', ''); end if;
  if exists (select 1 from internal.marche_offres o where o.vendeur_id = v_uid and o.etat = 'ouverte') then
    return internal.error_json('offres_ouvertes', '');
  end if;

  select jsonb_build_object(
    'gaulois', (select to_jsonb(g) from internal.gaulois g where g.user_id = v_uid),
    'inventaire', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from internal.gaulois_inventaire t where t.user_id = v_uid),
    'familiers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from internal.gaulois_familiers t where t.user_id = v_uid),
    'bannieres', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from internal.gaulois_bannieres t where t.user_id = v_uid),
    'modeles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from internal.gaulois_modeles t where t.user_id = v_uid),
    'gravures', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from internal.gaulois_gravures t where t.user_id = v_uid)
  ) into v_sauvegarde;

  -- Le million d'abord : la ligne 'god_debut' n'est pas une ligne d'essai.
  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'god_debut', internal.village_god_somme(), 'god');
  insert into internal.village_god (user_id, sauvegarde) values (v_uid, v_sauvegarde);
  perform internal.log_admin(v_uid, 'village_god_on', v_uid);
  return public.get_village_god();
end $$;

-- Éteint le mode GOD : le compte redevient la copie. Déjà éteint : ne refait rien. Refus : 'forbidden'.
create or replace function public.desactiver_village_god() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_essai internal.village_god;
  v_s jsonb;
  v_reprise integer;
begin
  -- Un essai en cours s'éteint toujours, même si le compte n'est plus titulaire : il ne reste jamais bloqué allumé.
  if v_uid is null or not (internal.village_god_permis() or exists (select 1 from internal.village_god d where d.user_id = v_uid)) then
    return internal.error_json('forbidden', '');
  end if;
  perform internal.village_verrou(v_uid);
  select * into v_essai from internal.village_god d where d.user_id = v_uid;
  if not found then return public.get_village_god(); end if;
  v_s := v_essai.sauvegarde;

  -- Le Gaulois ne montre plus rien de ce qui va partir, puis tout ce qu'il possède redevient la copie.
  update internal.gaulois g set familier = null, banniere = null where g.user_id = v_uid;
  delete from internal.gaulois_gravures t where t.user_id = v_uid;
  delete from internal.gaulois_inventaire t where t.user_id = v_uid;
  delete from internal.gaulois_familiers t where t.user_id = v_uid;
  delete from internal.gaulois_bannieres t where t.user_id = v_uid;
  delete from internal.gaulois_modeles t where t.user_id = v_uid;
  delete from internal.forge_fusions t where t.user_id = v_uid and t.cree_le >= v_essai.depuis;

  insert into internal.gaulois_inventaire select * from jsonb_populate_recordset(null::internal.gaulois_inventaire, v_s -> 'inventaire');
  insert into internal.gaulois_familiers select * from jsonb_populate_recordset(null::internal.gaulois_familiers, v_s -> 'familiers');
  insert into internal.gaulois_bannieres select * from jsonb_populate_recordset(null::internal.gaulois_bannieres, v_s -> 'bannieres');
  insert into internal.gaulois_modeles select * from jsonb_populate_recordset(null::internal.gaulois_modeles, v_s -> 'modeles');
  insert into internal.gaulois_gravures select * from jsonb_populate_recordset(null::internal.gaulois_gravures, v_s -> 'gravures');

  update internal.gaulois g
  set tenue = v_s -> 'gaulois' -> 'tenue',
      familier = v_s -> 'gaulois' ->> 'familier',
      banniere = v_s -> 'gaulois' ->> 'banniere',
      updated_at = (v_s -> 'gaulois' ->> 'updated_at')::timestamptz
  where g.user_id = v_uid;

  -- L'essai se ferme avant la reprise : la ligne 'god_fin' n'est pas une ligne d'essai, rien ne l'annule.
  delete from internal.village_god d where d.user_id = v_uid;
  select least(internal.village_god_somme(), s.solde)::integer into v_reprise from internal.stateres_soldes s where s.user_id = v_uid;
  if v_reprise > 0 then
    insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'god_fin', -v_reprise, 'god');
  end if;
  perform internal.log_admin(v_uid, 'village_god_off', v_uid);
  return public.get_village_god();
end $$;

revoke all on function public.get_village_god() from public, anon, authenticated;
revoke all on function public.activer_village_god() from public, anon, authenticated;
revoke all on function public.desactiver_village_god() from public, anon, authenticated;
-- Tout compte connecté peut les appeler : chacune vérifie elle-même le titulaire.
grant execute on function public.get_village_god() to authenticated;
grant execute on function public.activer_village_god() to authenticated;
grant execute on function public.desactiver_village_god() to authenticated;

/* ---------- Ce que voient les autres ---------- */

-- La place et la vitrine (remplace celle de la migration 20261116000200, ligne pour ligne) : pour les autres, un compte en
-- essai montre sa copie, sans plaque de forge ; pour lui-même, son Gaulois d'essai.
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
          'tenue', case when g.user_id = v_uid then g.tenue else m.tenue end,
          'moi', g.user_id = v_uid,
          'partie_le', d.debut,
          'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),
          'replique', case when v_bulles and v.replique_le > now() - interval '12 hours'
            and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))
            then v.replique end,
          -- Ajout de 20261114001000 : les plaques de la forge sur ce qu'il porte, pour lui toujours, pour les autres
          -- seulement avec un pseudo public (la règle de partie_le).
          'gravures', case when g.user_id = v_uid or (internal.member_pseudo(g.user_id) is not null and not m.essai)
            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end,
          -- Ajout de 20261116000200 : le familier et la bannière qu'il montre, pour la vitrine.
          'familier', case when g.user_id = v_uid then g.familier else m.familier end,
          'banniere', case when g.user_id = v_uid then g.banniere else m.banniere end)
        order by g.created_at, g.user_id)
      from internal.gaulois g
      join public.profiles p on p.user_id = g.user_id
      join lateral internal.gaulois_montre(g.user_id) m on true
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

-- /gaulois (remplace celle de la migration 20261115000900, ligne pour ligne) : le Gaulois de la copie pendant un essai.
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
  select m.tenue, m.familier, m.banniere into v_tenue, v_familier, v_banniere from internal.gaulois_montre(v_uid) m;
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

-- Les Gaulois des images du robot (remplace celle de la migration 20261114000400, ligne pour ligne).
create or replace function public.gaulois_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_gaulois jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, m.tenue), '{}'::jsonb) into v_gaulois
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  join lateral internal.gaulois_montre(g.user_id) m on true
  where p.status = 'validated'
    and l.discord_id is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'gaulois', v_gaulois);
end $$;

revoke all on function public.gaulois_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.gaulois_des_joueurs(text[]) to service_role;

-- Les bannières de /liste (remplace celle de la migration 20261116000400, ligne pour ligne).
create or replace function public.bannieres_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_bannieres jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, m.banniere), '{}'::jsonb) into v_bannieres
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  join lateral internal.gaulois_montre(g.user_id) m on true
  where p.status = 'validated'
    and l.discord_id is not null
    and m.banniere is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'bannieres', v_bannieres);
end $$;

revoke all on function public.bannieres_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.bannieres_des_joueurs(text[]) to service_role;

/* ---------- Les totaux de la Direction ---------- */

-- L'onglet Village de la Direction (remplace celle de la migration 20261114001000, ligne pour ligne) : une seule ligne
-- change, celle des statères en circulation.
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
  -- Changé par 20261116000900 : sans les lignes du mode GOD, dont le million prêté ferait un faux total pendant un essai.
  from (select m.user_id, sum(m.montant) as s from internal.stateres_mouvements m where m.nature !~ '^(god|test)_' group by m.user_id) t;

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
