-- Le duel des Gaulois, suite (docs/DIRECTION.md, « Le duel des Gaulois » ; première migration : 20261122000100_duel_des_gaulois).
--
-- Collée avec la première, dans le même fichier, le 22 novembre 2026. Elle ajoute :
-- - LES BOSS DU JOUR et LES NIVEAUX de la machine, recopiés de supabase/functions/code-discord/duel/contenu/ (la session
--   « boss, défis et niveaux ») par scripts/fabriquer-sql-duel.ts : onze boss dans l'ordre du cycle, chacun avec sa main, son
--   pouvoir (des atouts du moteur, pour son camp seul), sa bannière et son lieu, joués au niveau du guerrier ; apprenti,
--   guerrier et druide, mesurés contre un joueur de bon sens (il gagne 80, 50 et 33 fois sur 100), deux manches devant au
--   plus. Un test compare le boss du jour du serveur à celui du TypeScript sur un an de jours.
-- - LE SALON DES DUELS (demande de la session de l'image de victoire) : le serveur accepte « duels » parmi les salons du
--   robot, comme celui des achats ; la page Direction > Discord et le robot des duels (session de l'image, 140d0959) le
--   lisent. Les fonctions des salons sont celles de 20261115000200_salon_des_achats.sql, recopiées telles quelles avec
--   « duels » en plus.
-- - DES CORRECTIONS de la relecture, avant tout collage :
--   - rien n'est compté tant que le duel est fermé : un essai du titulaire ne gagne aucun pas du pass ;
--   - pendant un essai du mode GOD, rien ne paraît chez les autres : un membre en essai ne se défie pas et ne paraît pas
--     parmi les adversaires, il ne défie que le boss, et sa main de défense ne change pas ;
--   - un seul duel compté par jour contre un même boss, comme contre un même membre ;
--   - une partie laissée 24 heures est perdue par abandon même quand on y rejoue (l'abandon n'est plus annulé) ;
--   - le nom d'un compte qui n'est plus validé ne paraît plus dans l'historique ;
--   - la file des victoires n'annonce plus que la victoire comptée sur un autre membre, duel ouvert, avec le pseudo public
--     de chaque Gaulois, la carte décisive et la salle (null ici).
--
-- Fonctions remplacées : internal.duel_finir, get_mon_duel, enregistrer_main_duel, get_adversaires_duel, commencer_duel,
-- jouer_manche_duel, duel_annonces_a_envoyer (de 20261122000100), internal.discord_salon_test, get_discord_salons,
-- save_discord_salon, test_discord_salon, clear_discord_salon, robot_discord_salons, note_discord_salon (de
-- 20261115000200). Les contrôles des salons permis sont élargis à « duels ». Aucune ligne n'est retirée ni changée.
-- Rejouée, elle se remplace par la même.

/* ---------- Les boss et les niveaux ---------- */

-- <duel-niveaux> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_niveaux (niveau, fantaisie, loin) values
  ('apprenti', 40, 1),
  ('guerrier', 2, 2),
  ('druide', 0.05, 2)
on conflict (niveau) do update set fantaisie = excluded.fantaisie, loin = excluded.loin;
-- </duel-niveaux>

-- <duel-boss> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.
insert into internal.duel_boss (boss, rang, main, passif, banniere, lieu, niveau) values
  ('loup', 0, array['epee-courte', 'chapeau-berger', 'veste-peau', 'bottes-fourrees', 'braies-loup'], '{"rage":1}'::jsonb, 'nuit-de-neige', 'saisons', 'guerrier'),
  ('axolotl', 1, array['canne-peche', 'bocal-poisson', 'pelerine-pluie', 'bottes-pecheur', 'pantalon-marin'], '{"soufflePlus":2}'::jsonb, 'mer-des-lueurs', 'mers', 'guerrier'),
  ('automate', 2, array['epee-bronze', 'bonnet', 'cuirasse-bronze', 'bottes-bronze', 'braies-rapiecees'], '{"energieDepart":2,"plafond":1}'::jsonb, 'salle-d-arcade', 'legendes', 'guerrier'),
  ('magma', 3, array['torche', 'lunettes-forgeron', 'tablier-forgeron', 'bottes-ecarlates', 'bleu-travail'], '{"brule":1}'::jsonb, 'forge-du-volcan', 'legendes', 'guerrier'),
  ('sanglier', 4, array['baton-marche', 'barrette-mineur', 'gilet-berger', 'bottes-cavalier', 'braies-cuir'], '{"premierCoup":2}'::jsonb, 'poste-sur-la-crete', 'front', 'guerrier'),
  ('squelette', 5, array['faux-guerre', 'seau-bois', 'armure-os', 'bottes', 'braies-rapiecees'], '{"vie":2,"survie":1}'::jsonb, 'nuit-des-citrouilles', 'saisons', 'guerrier'),
  ('lezard', 6, array['fronde', 'bandeau', 'cuirasse-ecailles', 'bottes-ecailles', 'jambieres-ecailles'], '{"vie":3,"premierSouffle":2}'::jsonb, 'delta-verdoyant', 'cartes', 'guerrier'),
  ('givre', 7, array['javelot', 'chapka', 'cape-voyage', 'patins-glace', 'braies-fete'], '{"fatigueAdverse":3}'::jsonb, 'banquise-du-nord', 'cartes', 'guerrier'),
  ('corbeau', 8, array['sabre-courbe', 'casque-plumet', 'cape-capuche', 'bottes-plumes', 'braies-courtes'], '{"elanPlus":1}'::jsonb, 'mer-de-nuages', 'legendes', 'guerrier'),
  ('ovni', 9, array['lance-patates', 'abat-jour', 'tunique-etoilee', 'mocassins', 'braies-bleues'], '{"gardePlus":2,"rempart":1}'::jsonb, 'sous-la-nebuleuse', 'legendes', 'guerrier'),
  ('dragon', 10, array['torche', 'citrouille', 'armure-dragon', 'sandales', 'braies-rouges'], '{"rempart":1}'::jsonb, 'dragon-de-pierre', 'legendes', 'guerrier')
on conflict (boss) do update set rang = excluded.rang, main = excluded.main, passif = excluded.passif, banniere = excluded.banniere, lieu = excluded.lieu, niveau = excluded.niveau;
-- </duel-boss>

/* ---------- Les corrections ---------- */

-- Finit une partie : son issue, sa récompense (des pas du pass pour un duel compté gagné) et l'annonce de la victoire.
-- Remplacée par 20261122000200 : seule la victoire comptée sur la main de défense d'un autre membre est annoncée, et
-- seulement quand le duel est ouvert (ni les essais du titulaire, ni les boss : l'image montre deux vrais Gaulois).
create or replace function internal.duel_finir(p_id bigint, p_verdict integer, p_abandon boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_d internal.duel_parties%rowtype;
  v_saison text;
  v_rang integer;
  v_pas integer;
begin
  select * into v_d from internal.duel_parties d where d.id = p_id for update;
  if not found or v_d.fini then return; end if;
  if v_d.compte and p_verdict = 1 then
    v_saison := internal.sentier_saison_du(v_d.jour);
    if v_saison is not null then
      v_rang := 1 + (select count(*) from internal.duel_parties d where d.user_id = v_d.user_id and d.jour = v_d.jour and d.compte and d.fini and d.verdict = 1);
      insert into internal.sentier_gains (user_id, saison, jour, source, pas)
      values (v_d.user_id, v_saison, v_d.jour, 'duel/' || v_rang, 5)
      on conflict (user_id, jour, source) do nothing
      returning pas into v_pas;
    end if;
    if v_d.contre = 'membre' and v_d.adversaire is not null and v_d.adversaire <> v_d.user_id
       and coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false) then
      insert into internal.duel_annonces (partie, essai) values (p_id, false) on conflict (partie) do nothing;
    end if;
  end if;
  update internal.duel_parties d set fini = true, verdict = p_verdict, abandon = p_abandon, pas = v_pas, fini_le = now() where d.id = p_id;
end $$;

-- La main de défense : `p_main` { arme, tete, haut, pieds, bas }, une main que le compte peut jouer.
-- Remplacée par 20261122000200 : refusée pendant un essai du mode GOD ('mode_god'), qui ne la copie pas : elle resterait
-- celle de l'essai, avec ses objets d'essai, une fois l'essai fini.
create or replace function public.enregistrer_main_duel(p_main jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_main text[] := internal.duel_main_lue(p_main);
  v_refus text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    if internal.duel_en_essai(v_uid) then perform internal.fail('mode_god'); end if;
    if v_main is null then perform internal.fail('main_invalide'); end if;
    v_refus := internal.duel_refus_de_main(v_uid, v_main);
    if v_refus is not null then perform internal.fail(v_refus); end if;
    insert into internal.duel_mains as m (user_id, main) values (v_uid, v_main)
    on conflict (user_id) do update set main = excluded.main, maj_le = now();
    return jsonb_build_object('ok', true, 'defense', internal.duel_main_json(v_main));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les Gaulois qu'on peut défier : ceux d'un compte validé, permis, avec une main de défense jouable. Jamais un identifiant
-- de compte : la clé de la main. Tant que le duel est fermé, le titulaire y trouve sa propre main, pour l'essayer.
-- Remplacée par 20261122000200 : un membre en essai du mode GOD n'y paraît pas (sa main serait celle de l'essai).
create or replace function public.get_adversaires_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    return jsonb_build_object('ok', true, 'adversaires', coalesce((
      select jsonb_agg(internal.duel_gaulois_json(m.user_id) || jsonb_build_object(
          'cle', m.cle, 'main', internal.duel_main_json(m.main),
          'options', jsonb_build_object('lieu', internal.duel_lieu_de(m.user_id), 'compagnon', internal.duel_compagnon_de(m.user_id), 'passifs', '[]'::jsonb))
        order by m.maj_le desc)
      from internal.duel_mains m
      join public.profiles p on p.user_id = m.user_id
      join internal.gaulois g on g.user_id = m.user_id
      where p.status = 'validated' and internal.duel_permis(m.user_id)
        and (m.user_id <> v_uid or not v_ouvert)
        and not internal.duel_en_essai(m.user_id)
        and internal.duel_refus_de_main(m.user_id, m.main) is null), '[]'::jsonb));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Commence un duel : `p_contre` 'membre' (avec `p_cle`, la clé de sa main de défense) ou 'boss' (le boss du jour), avec la
-- main `p_main` du joueur. Le serveur tire la graine de la machine et ne la montre jamais.
-- Remplacée par 20261122000200 : rien n'est compté tant que le duel est fermé ; pendant un essai du mode GOD, seul le
-- boss se joue (rien ne doit paraître chez les autres, et la main de défense est celle d'avant l'essai) ; un membre en
-- essai ne se défie pas ; un seul duel compté par jour contre un même boss, comme contre un même membre.
create or replace function public.commencer_duel(p_contre text, p_cle uuid, p_main jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_jour date := internal.duel_jour(now());
  v_main text[] := internal.duel_main_lue(p_main);
  v_refus text;
  v_adv uuid;
  v_main_b text[];
  v_boss internal.duel_boss%rowtype;
  v_niveau text;
  v_lieu text;
  v_opt_a jsonb;
  v_opt_b jsonb;
  v_a record;
  v_b record;
  v_compte boolean;
  v_faits integer;
  v_joues integer;
  v_id bigint;
  v_essai boolean;
  v_ouvert boolean := coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    perform internal.duel_abandonner_les_vieilles(v_uid);
    if exists (select 1 from internal.duel_parties d where d.user_id = v_uid and not d.fini) then perform internal.fail('partie_en_cours'); end if;
    if v_main is null then perform internal.fail('main_invalide'); end if;
    v_refus := internal.duel_refus_de_main(v_uid, v_main);
    if v_refus is not null then perform internal.fail(v_refus); end if;
    select count(*) filter (where d.compte), count(*) into v_faits, v_joues from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour;
    if v_joues >= 30 then perform internal.fail('trop_de_duels'); end if;
    v_essai := internal.duel_en_essai(v_uid);
    v_compte := v_ouvert and v_faits < internal.duel_comptes_du_jour(v_uid) and not v_essai;
    if p_contre = 'membre' then
      -- pendant un essai, rien ne doit paraître chez les autres (ni défense, ni bilan) : seul le boss se joue
      if v_essai then perform internal.fail('mode_god'); end if;
      select m.user_id, m.main into v_adv, v_main_b
      from internal.duel_mains m join public.profiles p on p.user_id = m.user_id join internal.gaulois g on g.user_id = m.user_id
      where m.cle = p_cle and p.status = 'validated' and internal.duel_permis(m.user_id);
      if v_adv is null or internal.duel_refus_de_main(v_adv, v_main_b) is not null or internal.duel_en_essai(v_adv) then perform internal.fail('adversaire_inconnu'); end if;
      if v_adv = v_uid then
        -- contre sa propre main : seulement pour l'essayer, tant que le duel est fermé ; jamais compté
        if v_ouvert then perform internal.fail('adversaire_inconnu'); end if;
        v_compte := false;
      end if;
      -- un seul duel compté par jour contre un même membre
      if v_compte and exists (select 1 from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour and d.adversaire = v_adv and d.compte) then
        v_compte := false;
      end if;
      v_niveau := 'guerrier';
      v_lieu := internal.duel_lieu_de(v_adv);
      v_opt_b := jsonb_build_object('lieu', v_lieu, 'compagnon', internal.duel_compagnon_de(v_adv), 'passifs', '[]'::jsonb);
    elsif p_contre = 'boss' then
      select * into v_boss from internal.duel_boss b where b.boss = internal.duel_boss_du(v_jour);
      if v_boss.boss is null then perform internal.fail('pas_de_boss'); end if;
      v_main_b := v_boss.main;
      v_niveau := v_boss.niveau;
      v_lieu := v_boss.lieu;
      v_opt_b := jsonb_build_object('lieu', v_lieu, 'compagnon', null, 'passifs', jsonb_build_array(v_boss.passif));
      if v_compte and exists (select 1 from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour and d.boss = v_boss.boss and d.compte) then
        v_compte := false;
      end if;
    else
      perform internal.fail('invalid_request');
    end if;
    v_opt_a := jsonb_build_object('lieu', v_lieu, 'compagnon', internal.duel_compagnon_de(v_uid), 'passifs', '[]'::jsonb);
    select * into v_a from internal.duel_preparer(v_main, v_opt_a);
    select * into v_b from internal.duel_preparer(v_main_b, v_opt_b);
    insert into internal.duel_parties (user_id, contre, adversaire, boss, niveau, compte, jour, main_a, main_b, options_a, options_b,
      cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, graine)
    values (v_uid, p_contre, v_adv, v_boss.boss, v_niveau, v_compte, v_jour, v_main, v_main_b, v_opt_a, v_opt_b,
      v_a.cartes, v_b.cartes, v_a.atouts, v_b.atouts, v_a.etat, v_b.etat, 1 + floor(internal.village_hasard() * 2147483646)::bigint)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_id));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Joue la manche `p_manche` de la partie : le joueur pose sa carte `p_carte` (de 0 à 4) ; la machine choisit la sienne sans
-- la voir, avec la graine de la partie ; la manche se résout.
-- Remplacée par 20261122000200 : une partie laissée 24 heures sans manche jouée est perdue par abandon et rendue telle
-- quelle, au lieu d'un refus qui annulait l'abandon.
create or replace function public.jouer_manche_duel(p_partie bigint, p_manche integer, p_carte integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_d internal.duel_parties%rowtype;
  v_n internal.duel_niveaux%rowtype;
  v_g bigint;
  v_ib integer;
  v_r integer[];
  v_a integer[];
  v_b integer[];
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.village_verrou(v_uid);
    select * into v_d from internal.duel_parties d where d.id = p_partie and d.user_id = v_uid for update;
    if not found then perform internal.fail('duel_inconnu'); end if;
    if v_d.fini then perform internal.fail('partie_finie'); end if;
    if v_d.joue_le < now() - interval '24 hours' then
      perform internal.duel_finir(v_d.id, -1, true);
      return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_d.id));
    end if;
    if p_manche is distinct from v_d.manche then perform internal.fail('mauvaise_manche'); end if;
    if p_carte is null or not (p_carte = any (internal.duel_libres(v_d.etat_a))) then perform internal.fail('carte_au_repos'); end if;
    select * into v_n from internal.duel_niveaux n where n.niveau = v_d.niveau;
    v_g := internal.duel_graine_suivante(v_d.graine);
    v_ib := internal.duel_choisir(v_d.etat_b, v_d.etat_a, v_d.cartes_b, v_d.cartes_a, v_d.atouts_b, v_d.atouts_a, v_d.manche,
      v_g::double precision / 2147483647::double precision, v_n.fantaisie, v_n.loin);
    v_r := internal.duel_manche(v_d.etat_a, v_d.etat_b, v_d.cartes_a, v_d.cartes_b, v_d.atouts_a, v_d.atouts_b, p_carte, v_ib, v_d.manche);
    v_a := v_r[2:1 + v_r[1]];
    v_b := v_r[2 + v_r[1]:cardinality(v_r)];
    update internal.duel_parties d
    set etat_a = v_a, etat_b = v_b, coups = d.coups || array[p_carte, v_ib], manche = d.manche + 1, graine = v_g, joue_le = now()
    where d.id = v_d.id;
    if v_a[1] <= 0 or v_b[1] <= 0 or v_d.manche >= 40 then
      perform internal.duel_finir(v_d.id, internal.duel_verdict(v_a, v_b), false);
    end if;
    return jsonb_build_object('ok', true, 'partie', internal.duel_partie_json(v_d.id), 'carte_machine', v_ib);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Tout l'écran du duel (EtatDuDuel du contrat).
-- Remplacée par 20261122000200 : le nom d'un compte qui n'est plus validé ne paraît plus dans les défenses ni dans les
-- parties (null : l'écran écrit « un Gaulois »), comme au marché.
create or replace function public.get_mon_duel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_jour date := internal.duel_jour(now());
  v_comptes integer;
  v_faits integer;
  v_joues integer;
  v_boss internal.duel_boss%rowtype;
  v_defense internal.duel_mains%rowtype;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.duel_joueur();
    perform internal.duel_abandonner_les_vieilles(v_uid);
    v_comptes := internal.duel_comptes_du_jour(v_uid);
    select count(*) filter (where d.compte), count(*) into v_faits, v_joues from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour;
    select * into v_boss from internal.duel_boss b where b.boss = internal.duel_boss_du(v_jour);
    select * into v_defense from internal.duel_mains m where m.user_id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'ouvert', coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false),
      'collection', (
        select jsonb_object_agg(e.emplacement, coalesce((
          select jsonb_agg(c.objet order by c.rang) from internal.duel_cartes c
          where c.emplacement = e.emplacement and (c.rarete = 'base' or exists (
            select 1 from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = c.emplacement and i.objet = c.objet and i.quantite >= 1))
        ), '[]'::jsonb))
        from unnest(array['arme', 'tete', 'haut', 'pieds', 'bas']) e(emplacement)),
      'defense', case when v_defense.user_id is not null then internal.duel_main_json(v_defense.main) end,
      'defense_valide', v_defense.user_id is not null and internal.duel_refus_de_main(v_uid, v_defense.main) is null,
      'jour', jsonb_build_object(
        'jour', v_jour, 'comptes', 3, 'flamme', v_comptes > 3,
        'releve', (select r.le from internal.duel_flammes_releve r where r.id),
        'faits', v_faits, 'restants', greatest(0, v_comptes - v_faits), 'joues', v_joues, 'au_plus', 30),
      'boss', case when v_boss.boss is not null then jsonb_build_object(
        'boss', v_boss.boss, 'niveau', v_boss.niveau, 'main', internal.duel_main_json(v_boss.main),
        'options', jsonb_build_object('lieu', v_boss.lieu, 'compagnon', null, 'passifs', jsonb_build_array(v_boss.passif)),
        'battu', exists (select 1 from internal.duel_parties d where d.user_id = v_uid and d.jour = v_jour and d.boss = v_boss.boss and d.verdict = 1)) end,
      'partie', (select internal.duel_partie_json(d.id) from internal.duel_parties d where d.user_id = v_uid and not d.fini),
      'defenses', coalesce((
        select jsonb_agg(x.j order by x.le desc) from (
          select d.fini_le as le, jsonb_build_object(
              'le', d.fini_le, 'nom', case when p.status = 'validated' then internal.village_nom(p.display_name, p.gaul_number) end,
              'issue', case d.verdict when 1 then 'battu' when -1 then 'repousse' else 'egalite' end,
              'manches', cardinality(d.coups) / 2) as j
          from internal.duel_parties d join public.profiles p on p.user_id = d.user_id
          where d.adversaire = v_uid and d.fini and d.user_id <> v_uid
          order by d.fini_le desc limit 20) x), '[]'::jsonb),
      'attaques', coalesce((
        select jsonb_agg(x.j order by x.le desc) from (
          select d.fini_le as le, jsonb_build_object(
              'le', d.fini_le, 'contre', d.contre,
              'nom', case when d.contre = 'membre' then (select internal.village_nom(p.display_name, p.gaul_number) from public.profiles p where p.user_id = d.adversaire and p.status = 'validated') end,
              'boss', d.boss, 'verdict', d.verdict, 'manches', cardinality(d.coups) / 2, 'compte', d.compte) as j
          from internal.duel_parties d
          where d.user_id = v_uid and d.fini
          order by d.fini_le desc limit 20) x), '[]'::jsonb),
      'bilan', (
        select jsonb_build_object(
          'victoires', count(*) filter (where d.user_id = v_uid and d.verdict = 1),
          'defaites', count(*) filter (where d.user_id = v_uid and d.verdict = -1),
          'egalites', count(*) filter (where d.user_id = v_uid and d.verdict = 0),
          'repousses', count(*) filter (where d.adversaire = v_uid and d.user_id <> v_uid and d.verdict = -1),
          'battus', count(*) filter (where d.adversaire = v_uid and d.user_id <> v_uid and d.verdict = 1))
        from internal.duel_parties d where d.fini and (d.user_id = v_uid or d.adversaire = v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les victoires à annoncer sur Discord, les plus anciennes d'abord, 20 au plus : le vainqueur, le vaincu (un membre ou un
-- boss), le nombre de manches, et `essai` (le duel était fermé).
-- Remplacée par 20261122000200 (demande de la session de l'image) : chaque Gaulois porte en plus son pseudo public du
-- clan (`pseudo`, null sans pseudo public : jamais le nom du village sur Discord) ; `carte`, la carte posée par le
-- vainqueur à la dernière manche ({ emplacement, objet }, null sans manche jouée) ; `salle`, la mise d'une salle en
-- direct (null : pas de salle ici). Seules y entrent désormais les victoires sur un autre membre, duel ouvert : `essai`
-- reste dans la forme, toujours faux pour une victoire notée depuis.
create or replace function public.duel_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'annonces', coalesce((
    select jsonb_agg(jsonb_build_object(
        'partie', a.partie, 'essai', a.essai, 'le', d.fini_le, 'contre', d.contre, 'boss', d.boss, 'manches', cardinality(d.coups) / 2,
        'main', internal.duel_main_json(d.main_a), 'main_vaincue', internal.duel_main_json(d.main_b),
        'carte', case when cardinality(d.coups) >= 2 then jsonb_build_object(
          'emplacement', (array['arme', 'tete', 'haut', 'pieds', 'bas'])[d.coups[cardinality(d.coups) - 1] + 1],
          'objet', d.main_a[d.coups[cardinality(d.coups) - 1] + 1]) end,
        'salle', null,
        'vainqueur', internal.duel_gaulois_json(d.user_id) || jsonb_build_object('pseudo', internal.member_pseudo(d.user_id)),
        'vaincu', case when d.contre = 'membre' and d.adversaire is not null
          then internal.duel_gaulois_json(d.adversaire) || jsonb_build_object('pseudo', internal.member_pseudo(d.adversaire)) end)
      order by a.cree_le, a.partie)
    from (select * from internal.duel_annonces a where a.annoncee_le is null order by a.cree_le, a.partie limit 20) a
    join internal.duel_parties d on d.id = a.partie), '[]'::jsonb))
$$;

/* ---------- Le salon des duels ---------- */

-- Postgres a nommé ces contrôles d'après la table et la colonne. Retirer un contrôle ne touche à aucune ligne.
alter table internal.discord_salons drop constraint if exists discord_salons_salon_check;
alter table internal.discord_salons add constraint discord_salons_salon_check check (salon in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels'));
alter table internal.discord_salon_checks drop constraint if exists discord_salon_checks_salon_check;
alter table internal.discord_salon_checks add constraint discord_salon_checks_salon_check check (salon in ('nouvelles', 'encadrement', 'victoires', 'achats', 'duels'));

-- Poste l'essai d'un salon réglé et le note. Ne mentionne personne. Une erreur ici n'arrête jamais ce qui l'appelle :
-- elle est notée pour l'espace Direction, sans le jeton du lien.
create or replace function internal.discord_salon_test(p_salon text) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
  v_request bigint;
begin
  select webhook_url into v_url from internal.discord_salons where salon = p_salon;
  if not found then return null; end if;
  begin
    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'content', case p_salon
          when 'nouvelles' then 'Essai du site du clan : la gazette, les alertes, les paliers, les messages du jour et la course du soir arriveront dans ce salon.'
          when 'victoires' then 'Essai du site du clan : chaque victoire du clan, avec l''image de la carte, arrivera dans ce salon.'
          -- Ajout de 20261113001600 : le français puis l'anglais, chacun sur sa ligne avec son drapeau (lettres régionales
          -- F R et G B, que Discord affiche en drapeaux), une ligne vide entre les deux.
          when 'alliance' then chr(127467) || chr(127479) || ' Essai du site du clan : les zones nouvelles de la carte de l''alliance, et chaque zone dont l''état change, arriveront dans ce salon.'
            || chr(10) || chr(10)
            || chr(127468) || chr(127463) || ' Site test: new zones of the alliance map, and zones whose status changes, will be posted here.'
          -- Ajout de 20261115000200.
          when 'achats' then 'Essai du site du clan : les objets reçus au village des Gaulois, en image, arriveront dans ce salon.'
          -- Ajout de 20261122000200.
          when 'duels' then 'Essai du site du clan : chaque victoire en duel de cartes entre Gaulois, en image, arrivera dans ce salon.'
          else 'Essai du site du clan : les demandes qui attendent et le compte rendu des sauvegardes arriveront dans ce salon.'
        end,
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
      ),
      timeout_milliseconds := 5000
    );
    update internal.discord_salons set last_at = now(), last_request = v_request, last_error = null where salon = p_salon;
    return v_request;
  exception when others then
    update internal.discord_salons set last_at = now(), last_request = null, last_error = left(sqlerrm, 300) where salon = p_salon;
    return null;
  end;
end $$;

-- Pour les admins et le fondateur : pour chaque salon, réglé ou non, la date du réglage et son auteur, le dernier essai
-- avec la réponse de Discord tant que pg_net la garde, et le dernier contrôle du robot. Jamais le lien : il permet
-- d'écrire dans le salon. Le détail d'une erreur ne contient jamais son jeton. `now` : l'heure du serveur.
create or replace function public.get_discord_salons() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_salon text;
  v_hook internal.discord_salons;
  v_check internal.discord_salon_checks;
  v_answered boolean;
  v_status integer;
  v_timed_out boolean;
  v_error text;
  v_rows jsonb := '[]';
  v_detail text;
begin
  begin
    perform internal.require_rank(3);
    foreach v_salon in array array['nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels'] loop
      v_answered := false;
      v_status := null;
      v_timed_out := null;
      v_error := null;
      select * into v_hook from internal.discord_salons where salon = v_salon;
      if not found then v_hook := null; end if;
      select * into v_check from internal.discord_salon_checks where salon = v_salon;
      if not found then v_check := null; end if;
      if v_hook.last_request is not null then
        begin
          select r.status_code, r.timed_out, r.error_msg into v_status, v_timed_out, v_error from net._http_response r where r.id = v_hook.last_request;
          v_answered := found;
        exception when others then
          v_answered := false;
        end;
      end if;
      if v_hook.salon is not null then
        v_error := left(replace(coalesce(v_hook.last_error, v_error), split_part(v_hook.webhook_url, '/', 7), '…'), 200);
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'salon', v_salon,
        'set', v_hook.salon is not null,
        'updated_at', v_hook.updated_at,
        'updated_by', (select p.display_name from public.profiles p where p.user_id = v_hook.updated_by),
        'last', case when v_hook.last_at is null then null else jsonb_build_object(
          'kind', 'test',
          'at', v_hook.last_at,
          'failed', v_hook.last_error is not null,
          'answered', v_answered,
          'status', v_status,
          'timed_out', coalesce(v_timed_out, false),
          'error', v_error
        ) end,
        'check', case when v_check.salon is null then null else jsonb_build_object(
          'at', v_check.checked_at,
          'source', v_check.source,
          'status', v_check.status,
          'name', v_check.webhook_name
        ) end
      ));
    end loop;
    return jsonb_build_object('ok', true, 'now', now(), 'salons', v_rows);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Règle un salon du robot : le lien de son webhook. Un essai part aussitôt, sans mentionner personne. Le contrôle du
-- robot noté pour l'ancien lien est effacé : le passage suivant contrôle le nouveau.
create or replace function public.save_discord_salon(p_salon text, p_webhook text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_url text := internal.discord_webhook_of(p_webhook);
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels') then perform internal.fail('invalid_salon'); end if;
    if v_url is null then perform internal.fail('invalid_webhook'); end if;
    insert into internal.discord_salons (salon, webhook_url, updated_by, updated_at)
    values (p_salon, v_url, v_actor, now())
    on conflict (salon) do update
      set webhook_url = excluded.webhook_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        last_at = null, last_request = null, last_error = null;
    delete from internal.discord_salon_checks where salon = p_salon;
    perform internal.log_admin(v_actor, 'discord_salon_saved', null, jsonb_build_object('salon', p_salon));
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Renvoie l'essai d'un salon réglé, quinze secondes au moins après le précédent.
create or replace function public.test_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hook internal.discord_salons;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    perform internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels') then perform internal.fail('invalid_salon'); end if;
    select * into v_hook from internal.discord_salons where salon = p_salon for update;
    if not found then perform internal.fail('discord_not_set'); end if;
    if v_hook.last_at > now() - interval '15 seconds' then perform internal.fail('test_too_soon'); end if;
    perform internal.discord_salon_test(p_salon);
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Débranche un salon du robot : le réglage est effacé, lien compris. Le robot reprend alors le secret GitHub, s'il en
-- reste un ; pour les achats, le salon des nouvelles. Les messages déjà postés restent dans le salon.
create or replace function public.clear_discord_salon(p_salon text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_found boolean;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(3);
    if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'alliance', 'achats', 'duels') then perform internal.fail('invalid_salon'); end if;
    delete from internal.discord_salons where salon = p_salon;
    v_found := found;
    delete from internal.discord_salon_checks where salon = p_salon;
    if v_found then perform internal.log_admin(v_actor, 'discord_salon_cleared', null, jsonb_build_object('salon', p_salon)); end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les liens réglés ici. Null : rien de réglé, le robot garde le secret GitHub (pour les achats : le salon des nouvelles).
-- Le robot reconnaît à la présence de la clé « achats » que la migration des achats est installée, à celle de « duels »
-- celle du salon des duels (20261122000200).
create or replace function public.robot_discord_salons() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nouvelles', (select webhook_url from internal.discord_salons where salon = 'nouvelles'),
    'encadrement', (select webhook_url from internal.discord_salons where salon = 'encadrement'),
    'victoires', (select webhook_url from internal.discord_salons where salon = 'victoires'),
    'achats', (select webhook_url from internal.discord_salons where salon = 'achats'),
    'duels', (select webhook_url from internal.discord_salons where salon = 'duels')
  )
$$;

-- Le contrôle du passage : d'où venait le lien et ce que Discord a répondu à sa simple lecture (rien n'est posté). Le nom
-- du webhook est réduit à une ligne de 80 signes au plus.
create or replace function public.note_discord_salon(p_salon text, p_source text, p_status integer, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_salon is null or p_salon not in ('nouvelles', 'encadrement', 'victoires', 'achats', 'duels') or p_source is null or p_source not in ('direction', 'secret', 'none') then
    return jsonb_build_object('ok', false, 'error', 'invalid_salon');
  end if;
  insert into internal.discord_salon_checks (salon, checked_at, source, status, webhook_name)
  values (
    p_salon,
    now(),
    p_source,
    case when p_status between 0 and 599 then p_status end,
    left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g')), ''), 80)
  )
  on conflict (salon) do update
    set checked_at = excluded.checked_at, source = excluded.source, status = excluded.status, webhook_name = excluded.webhook_name;
  return jsonb_build_object('ok', true);
end $$;

/* ---------- Les droits ---------- */

-- Remplacer une fonction garde ses droits ; ils sont reposés ici pour que le fichier se lise seul.
revoke all on function internal.duel_finir(bigint, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_mon_duel() from public, anon, authenticated;
revoke all on function public.enregistrer_main_duel(jsonb) from public, anon, authenticated;
revoke all on function public.get_adversaires_duel() from public, anon, authenticated;
revoke all on function public.commencer_duel(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.jouer_manche_duel(bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.duel_annonces_a_envoyer() from public, anon, authenticated;
grant execute on function public.get_mon_duel() to authenticated;
grant execute on function public.enregistrer_main_duel(jsonb) to authenticated;
grant execute on function public.get_adversaires_duel() to authenticated;
grant execute on function public.commencer_duel(text, uuid, jsonb) to authenticated;
grant execute on function public.jouer_manche_duel(bigint, integer, integer) to authenticated;
grant execute on function public.duel_annonces_a_envoyer() to service_role;

revoke all on function internal.discord_salon_test(text) from public, anon, authenticated;
revoke all on function public.get_discord_salons() from public, anon, authenticated;
revoke all on function public.save_discord_salon(text, text) from public, anon, authenticated;
revoke all on function public.test_discord_salon(text) from public, anon, authenticated;
revoke all on function public.clear_discord_salon(text) from public, anon, authenticated;
grant execute on function public.get_discord_salons() to authenticated;
grant execute on function public.save_discord_salon(text, text) to authenticated;
grant execute on function public.test_discord_salon(text) to authenticated;
grant execute on function public.clear_discord_salon(text) to authenticated;
revoke all on function public.robot_discord_salons() from public, anon, authenticated;
revoke all on function public.note_discord_salon(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.robot_discord_salons() to service_role;
grant execute on function public.note_discord_salon(text, text, integer, text) to service_role;
