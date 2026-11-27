-- Le duel sans limite de trois (27 novembre 2026, demande du pilote : « tu peu enlevé la limite de 3 duel par personnes »,
-- puis « Les deux » quand on lui a demandé laquelle).
--
-- 1. Les duels comptés (contre le boss du jour et les mains de défense) : il n'y en a plus 3 par jour (4 avec la flamme de
--    série). Tout duel commencé est compté, dans le plafond de 30 duels par jour qui reste (chaque manche se calcule chez le
--    serveur). Reste aussi la règle d'un seul duel compté par jour contre un même membre ou un même boss : rejouer le même
--    adversaire le même jour se fait pour le plaisir, sans pas du pass. Rien n'est compté quand le duel est fermé, pendant un
--    essai du mode GOD, ni contre sa propre main, comme avant. La flamme n'ajoute plus rien ; son relevé reste, et
--    `jour.flamme` dit toujours si elle brûle.
-- 2. Les salles avec mise : il n'y a plus 3 matchs au plus par jour contre un même adversaire. La limite de 10 matchs avec mise
--    par jour, contre tous, reste ; `internal.duel_salle_meme_adversaire()` vaut désormais ce plafond, et l'appariement ne
--    saute donc plus personne.
--
-- 3. Les pas du pass (choix du pilote, même jour : « 4 victoires par jour ») : seules les 4 premières victoires comptées du
--    jour donnent leurs 5 pas (sources « duel/1 » à « duel/4 » de `internal.sentier_gains`, 20 pas par jour au plus, comme
--    avant avec la flamme) ; les suivantes comptent au tableau des duellistes et partent sur Discord, sans pas. Le pass
--    garde ainsi son rythme de six semaines.
--
-- Aucun statère créé ni pris. Le tableau des duellistes ne change pas de règle : un même adversaire y compte une fois par
-- jour et deux fois par semaine au plus ; son essai contre le hasard est refait sans les limites de trois
-- (`scripts/essai-tableau-duel.ts`).

-- Les duels comptés permis aujourd'hui : autant que de duels joués, 30. Remplace celle de 20261122000100 (3, et 1 de plus
-- quand la flamme brûle).
create or replace function internal.duel_comptes_du_jour(p_uid uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select 30
$$;

-- Les matchs avec mise permis par jour contre un même adversaire : autant que contre tous. Remplace celle de 20261122001000 (3).
create or replace function internal.duel_salle_meme_adversaire() returns integer
language sql immutable set search_path = public, pg_temp as $$ select internal.duel_salle_par_jour() $$;

-- Les victoires comptées du jour qui donnent des pas du pass : les 4 premières.
create or replace function internal.duel_victoires_avec_pas() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 4 $$;

-- Finit une partie : son issue, sa récompense (des pas du pass pour un duel compté gagné) et l'annonce de la victoire.
-- Remplacée par 20261127000200 : des pas pour les 4 premières victoires comptées du jour seulement
-- (`internal.duel_victoires_avec_pas`) ; l'annonce, elle, part pour chaque victoire comptée sur un autre membre.
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
      -- des pas pour les premières victoires comptées du jour seulement : les suivantes comptent au tableau, sans pas
      if v_rang <= internal.duel_victoires_avec_pas() then
        insert into internal.sentier_gains (user_id, saison, jour, source, pas)
        values (v_d.user_id, v_saison, v_d.jour, 'duel/' || v_rang, 5)
        on conflict (user_id, jour, source) do nothing
        returning pas into v_pas;
      end if;
    end if;
    if v_d.contre = 'membre' and v_d.adversaire is not null and v_d.adversaire <> v_d.user_id
       and coalesce((select o.ouvert from internal.duel_ouvert o where o.id), false) then
      insert into internal.duel_annonces (partie, essai) values (p_id, false) on conflict (partie) do nothing;
    end if;
  end if;
  update internal.duel_parties d set fini = true, verdict = p_verdict, abandon = p_abandon, pas = v_pas, fini_le = now() where d.id = p_id;
end $$;

-- Tout l'écran du duel (EtatDuDuel du contrat).
-- Remplacée par 20261127000200 : `jour.comptes` dit les 30 duels comptés permis, `jour.flamme` lit la flamme elle-même
-- (elle n'ajoute plus de duel), `jour.restants` ne dépasse pas les duels qui restent à jouer.
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
        'jour', v_jour, 'comptes', v_comptes, 'flamme', internal.duel_flamme(v_uid),
        'releve', (select r.le from internal.duel_flammes_releve r where r.id),
        'faits', v_faits, 'restants', greatest(0, least(v_comptes - v_faits, 30 - v_joues)), 'joues', v_joues, 'au_plus', 30),
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

/* ---------- Les droits ---------- */

-- Remplacer une fonction garde ses droits ; ils sont reposés ici pour que le fichier se lise seul.
revoke all on function internal.duel_comptes_du_jour(uuid) from public, anon, authenticated;
revoke all on function internal.duel_salle_meme_adversaire() from public, anon, authenticated;
revoke all on function internal.duel_victoires_avec_pas() from public, anon, authenticated;
revoke all on function internal.duel_finir(bigint, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_mon_duel() from public, anon, authenticated;
grant execute on function public.get_mon_duel() to authenticated;
