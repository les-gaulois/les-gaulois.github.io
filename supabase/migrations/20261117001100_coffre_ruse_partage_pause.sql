-- La ruse récompensée, le partage de la cagnotte et la pause entre deux essais (trois des cinq retouches proposées au
-- pilote le 17 novembre 2026, après ses premières parties, et qu'il a renvoyées telles quelles ; les chiffres, un
-- cinquième partagé et 20 secondes, sont ceux de la proposition : docs/DIRECTION.md, « Le coffre du druide ») :
--
-- - public.coffre_clore, reprise ici en entier de 20261117000800_coffre_cycle_des_manches.sql :
--   * la prime du jeu ('coffre_prime') n'est versée que si le gardien a lâché le mot : un mot deviné (p_devine) gagne la
--     cagnotte, sans multiplicateur. La ruse est le cœur du jeu ; deviner à partir des lettres ne crée plus de statères.
--   * un cinquième de la cagnotte est partagé entre les autres villageois qui ont misé dans la manche, à proportion de
--     leurs essais répondus (mouvement 'coffre_part') ; le gagnant reçoit le reste, arrondis compris, et tout s'il était
--     seul. Un compte en mode GOD ne reçoit pas de part. La prime ne multiplie que la part du gagnant, lettres achetées
--     toujours exclues. La somme des mises et des lettres achetées reste égale à la somme des 'coffre_gain' et des
--     'coffre_part' plus la cagnotte du moment : le partage ne crée rien. La réponse dit ce qui a été partagé, et à combien.
-- - public.coffre_ouvrir, reprise ici en entier de 20261117000500_coffre_remise_des_essais.sql : 20 secondes de pause
--   entre deux essais d'un même membre (refus 'cooldown', avec les secondes qui restent).
--
-- Au début de coffre_clore, les réglages du coffre sont verrouillés avant tout compte : le partage, qui verse à d'autres
-- membres, ne peut pas se croiser avec leur propre essai clos au même instant.
--
-- Le coffre crée donc moins de statères qu'avant, jamais plus. Aucune table ni donnée touchée. Mêmes paramètres : les
-- droits déjà donnés restent, redits plus bas. Rejouée, la migration ne change rien.

create or replace function public.coffre_ouvrir(p_discord_id text, p_nom text, p_message text, p_interaction_id text, p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r internal.coffre_reglages;
  v_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_soir text := internal.coffre_soir();
  v_permis integer;
  v_du_membre integer;
  v_du_jour integer;
  -- Ce qu'il reste à attendre, en secondes, avant le prochain essai de ce membre.
  v_attente integer;
  -- Les essais comptent depuis minuit, ou depuis la dernière remise du pilote si elle est d'aujourd'hui.
  v_depuis timestamptz;
  v_manche jsonb;
  v_manche_id bigint;
  v_essai bigint;
  v_compte uuid;
  -- La mise est la même pour tous, 10 statères : ce que le robot demande dans p_mise ne compte plus.
  v_mise integer := 10;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$'
    or p_interaction_id is null or p_interaction_id !~ '^[0-9]{17,20}$'
    or p_nom is null or char_length(p_nom) not between 1 and 32
    or p_message is null or char_length(p_message) not between 2 and 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  delete from internal.coffre_essais where cree_le < now() - interval '30 days';

  select * into r from internal.coffre_reglages where id for update;
  if not found or not r.ouvert then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if now() >= r.fin then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;
  if r.depense_microdollars >= r.plafond_microdollars then
    return jsonb_build_object('ok', false, 'error', 'budget');
  end if;
  if exists (select 1 from internal.coffre_essais
             where discord_id = p_discord_id and reponse is null and not annule and cree_le > now() - interval '2 minutes') then
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  -- Une pause de 20 secondes entre deux essais d'un même membre : personne ne garde le gardien pour lui seul.
  select 20 - floor(extract(epoch from (now() - max(x.cree_le))))::integer into v_attente
  from internal.coffre_essais x
  where x.discord_id = p_discord_id and x.cree_le > now() - interval '20 seconds';
  if v_attente is not null and v_attente > 0 then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'secondes', v_attente);
  end if;
  v_depuis := greatest(v_jour, coalesce(r.essais_depuis, v_jour));
  v_permis := r.essais_par_membre * case when v_soir = 'veillee' then 2 else 1 end;
  select count(*) into v_du_membre from internal.coffre_essais where discord_id = p_discord_id and cree_le >= v_depuis;
  if v_du_membre >= v_permis then
    return jsonb_build_object('ok', false, 'error', 'daily_limit');
  end if;
  select count(*) into v_du_jour from internal.coffre_essais where cree_le >= v_depuis;
  if v_du_jour >= r.essais_par_jour then
    return jsonb_build_object('ok', false, 'error', 'daily_total');
  end if;

  v_compte := internal.coffre_compte(p_discord_id);
  if internal.coffre_payeur(p_discord_id) is null then
    return jsonb_build_object('ok', false, 'error', 'no_stake');
  end if;
  -- Ce qui lui revient déjà de ses parties est d'abord versé, comme à la boutique.
  perform internal.crediter_stateres(v_compte);
  if coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_compte), 0) < v_mise then
    return jsonb_build_object('ok', false, 'error', 'stake_short');
  end if;

  v_manche := internal.coffre_manche_ouverte();
  v_manche_id := (v_manche ->> 'id')::bigint;
  begin
    insert into internal.coffre_essais (manche_id, discord_id, nom, message, interaction_id, mise)
    values (v_manche_id, p_discord_id, p_nom, p_message, p_interaction_id, v_mise)
    returning id into v_essai;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end;

  return jsonb_build_object(
    'ok', true,
    'essai', v_essai,
    'manche', v_manche,
    'niveau', (select count(*) from internal.coffre_manches where trouvee_le is not null),
    'passes', (select coalesce(jsonb_agg(t.mot), '[]'::jsonb)
               from (select mot from internal.coffre_manches order by id desc limit 300) t),
    'ruses', (select coalesce(jsonb_agg(t.ruse), '[]'::jsonb)
              from (select ruse from internal.coffre_manches
                    where trouvee_le is not null and ruse is not null order by id desc limit 6) t),
    'historique', (select coalesce(jsonb_agg(jsonb_build_object('nom', t.nom, 'message', t.message, 'reponse', t.reponse) order by t.id), '[]'::jsonb)
                   from (select id, nom, message, reponse from internal.coffre_essais
                         where manche_id = v_manche_id and reponse is not null order by id desc limit 8) t),
    'restants', v_permis - v_du_membre,
    'soir', v_soir,
    'cagnotte', r.cagnotte,
    'mise', v_mise,
    'tenue', (select g.tenue from internal.gaulois g where g.user_id = v_compte));
end $$;

create or replace function public.coffre_clore(
  p_essai bigint, p_manche bigint, p_reponse text, p_gagne boolean, p_devine boolean, p_microdollars bigint,
  p_humeur text, p_longueur boolean, p_lettres integer[], p_indice text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e internal.coffre_essais;
  m internal.coffre_manches;
  v_gagne boolean := false;
  v_compte uuid;
  v_mise integer := 0;
  v_gain integer := 0;
  v_fois integer := 1;
  v_garde integer := 1;
  -- Le rang de la manche dans le cycle des quinze manches à thème, ou rien : le cycle n'est pas lancé.
  v_rang integer;
  v_cagnotte integer;
  -- Ce que les lettres achetées de la manche ont mis dans la cagnotte : gagné, mais jamais multiplié.
  v_lettres integer := 0;
  -- Le partage : ce que la manche met de côté pour ceux qui ont essayé, ce qui leur est vraiment versé, et à combien.
  v_pot integer := 0;
  v_distribue integer := 0;
  v_partageurs integer := 0;
  v_part integer;
  q record;
  v_indice text := nullif(btrim(coalesce(p_indice, '')), '');
  v_semaine timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_champion text;
  v_ancien text;
begin
  -- Les réglages du coffre sont pris en premier, avant tout compte : deux essais clos au même instant passent ainsi l'un
  -- après l'autre, et le partage, qui touche la bourse d'autres membres, ne peut pas se croiser avec leur propre essai.
  perform 1 from internal.coffre_reglages where id for update;
  perform internal.coffre_depense(p_microdollars);
  if p_essai is null or p_manche is null or p_reponse is null or char_length(p_reponse) not between 1 and 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select * into m from internal.coffre_manches where id = p_manche;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_round');
  end if;
  update internal.coffre_essais
  set reponse = p_reponse, manche_id = p_manche,
      humeur = case when p_humeur in ('confiant', 'flatte', 'mefiant', 'agace', 'panique', 'vaincu') then p_humeur end
  where id = p_essai and reponse is null and not annule
  returning * into e;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_attempt');
  end if;

  -- La mise : prise maintenant, entière, dans la cagnotte ; ou pas du tout (plus de compte, plus assez de statères, essai
  -- du mode GOD, ou coffre déjà ouvert par un autre).
  if e.mise > 0 then
    v_compte := internal.coffre_payeur(e.discord_id);
    if v_compte is not null and m.trouvee_le is null then
      begin
        perform internal.village_verrou(v_compte);
        perform internal.village_debiter(v_compte, 'coffre_mise', e.mise, 'manche/' || p_manche::text);
        update internal.coffre_reglages set cagnotte = cagnotte + e.mise where id;
        v_mise := e.mise;
      exception when sqlstate 'GA001' then
        v_mise := 0;
      end;
    end if;
    if v_mise = 0 then
      update internal.coffre_essais set mise = 0 where id = p_essai;
    end if;
  end if;

  -- Le tableau : seulement tant que la manche est ouverte.
  if m.trouvee_le is null then
    update internal.coffre_manches
    set longueur_dite = longueur_dite or coalesce(p_longueur, false),
        lettres = (select coalesce(array_agg(distinct x order by x), '{}')
                   from unnest(lettres || coalesce(p_lettres, '{}')) x
                   where x between 1 and char_length(mot)),
        indices = case
          when v_indice is not null and char_length(v_indice) between 2 and 28
            and cardinality(indices) < 12 and not (v_indice = any (indices)) then indices || v_indice
          else indices end
    where id = p_manche;
  end if;

  if coalesce(p_gagne, false) then
    update internal.coffre_manches
    set trouvee_le = now(),
        gagnant_discord_id = e.discord_id,
        gagnant_nom = e.nom,
        devine = coalesce(p_devine, false),
        ruse = case when coalesce(p_devine, false) then null else e.message end
    where id = p_manche and trouvee_le is null;
    v_gagne := found;
  end if;

  if v_gagne then
    -- La garde du gardien pendant cet essai, de 1 à 4, comme le robot la dessine (palierDuDruide de coffre.ts) : elle monte
    -- avec les coffres déjà ouverts (0 ou 1, 2 ou 3, 4 à 6, 7 et plus), et baisse d'un cran après 40 essais dans la manche
    -- et le soir de cervoise.
    v_garde := internal.coffre_garde(p_manche, p_essai);
    -- La cagnotte, faite des mises, va entière au gagnant ; le jeu y ajoute sa prime, selon la garde : cagnotte fois deux
    -- pour une garde de 1, fois trois pour 2, fois quatre pour 3, fois cinq pour 4. Sans compte ou sans mise prise, rien
    -- n'est multiplié. Le journal des statères n'accepte pas un mouvement de plus d'un million : au-delà, la prime est bornée.
    v_compte := internal.coffre_payeur(e.discord_id);
    select cagnotte into v_cagnotte from internal.coffre_reglages where id for update;
    select least(v_cagnotte, coalesce(sum(a.prix), 0))::integer into v_lettres from internal.coffre_lettres_achetees a where a.manche_id = p_manche;
    if v_compte is not null and v_cagnotte > 0 then
      perform internal.village_verrou(v_compte);
      -- Le partage : un cinquième de la cagnotte va aux autres villageois qui ont misé dans la manche, à proportion de
      -- leurs essais ; le reste, arrondis compris, au gagnant. Seul dans sa manche, il garde tout. Rien n'est créé.
      v_pot := (v_cagnotte::bigint * 20 / 100)::integer;
      if v_pot > 0 then
        for q in
          select t.compte, t.essais, sum(t.essais) over () as total
          from (
            select internal.coffre_payeur(x.discord_id) as compte, count(*)::integer as essais
            from internal.coffre_essais x
            where x.manche_id = p_manche and x.mise > 0 and x.reponse is not null and x.discord_id <> e.discord_id
            group by x.discord_id
          ) t
          where t.compte is not null and t.compte <> v_compte
          order by t.compte
        loop
          v_part := (v_pot::bigint * q.essais / q.total)::integer;
          if v_part > 0 then
            -- Un versement ne demande pas le verrou du compte : le solde suit le journal par son déclencheur.
            insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (q.compte, 'coffre_part', v_part, 'manche/' || p_manche::text);
            v_distribue := v_distribue + v_part;
            v_partageurs := v_partageurs + 1;
          end if;
        end loop;
      end if;
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_compte, 'coffre_gain', v_cagnotte - v_distribue, 'manche/' || p_manche::text);
      update internal.coffre_reglages set cagnotte = 0 where id;
      -- Dans le cycle, le niveau de la manche fixe le multiplicateur ; sans cycle, la garde, comme avant.
      v_rang := internal.coffre_rang(p_manche);
      -- La ruse seule est multipliée : un mot deviné gagne la cagnotte, sans prime.
      v_fois := case when v_mise > 0 and not coalesce(p_devine, false) then coalesce(internal.coffre_fois_du_rang(v_rang), v_garde + 1) else 1 end;
      v_gain := v_cagnotte - v_distribue;
      if v_fois > 1 and v_cagnotte - v_distribue - v_lettres > 0 then
        insert into internal.stateres_mouvements (user_id, nature, montant, ref)
        values (v_compte, 'coffre_prime', least((v_cagnotte - v_distribue - v_lettres)::bigint * (v_fois - 1), 1000000)::integer, 'manche/' || p_manche::text);
        v_gain := v_cagnotte - v_distribue + least((v_cagnotte - v_distribue - v_lettres)::bigint * (v_fois - 1), 1000000)::integer;
      end if;
    end if;
    -- Le champion de la semaine : le plus de coffres ouverts depuis lundi 0 h, heure de Paris ; à égalité, le premier arrivé.
    select g.gagnant_discord_id into v_champion
    from internal.coffre_manches g
    where g.trouvee_le >= v_semaine and g.gagnant_discord_id is not null
    group by g.gagnant_discord_id
    order by count(*) desc, max(g.trouvee_le) asc
    limit 1;
    select champion into v_ancien from internal.coffre_reglages where id;
    if v_champion is distinct from v_ancien then
      update internal.coffre_reglages set champion = v_champion where id;
    end if;
  end if;

  select * into m from internal.coffre_manches where id = p_manche;
  return jsonb_build_object(
    'ok', true,
    'gagne', v_gagne,
    'manche', (select count(*) from internal.coffre_manches where id <= p_manche),
    'essai', (select count(*) from internal.coffre_essais where manche_id = p_manche and reponse is not null and id <= p_essai),
    'mise', v_mise,
    'cagnotte', (select cagnotte from internal.coffre_reglages where id),
    'gain', v_gain,
    'fois', case when v_gain > 0 then v_fois else 1 end,
    'lettres', case when v_gain > 0 then v_lettres else 0 end,
    'rang', internal.coffre_rang(p_manche),
    'partage', v_distribue,
    'partageurs', v_partageurs,
    'garde', case when v_gagne then v_garde end,
    'tableau', jsonb_build_object('longueur_dite', m.longueur_dite, 'lettres', to_jsonb(m.lettres), 'indices', to_jsonb(m.indices)),
    'champion', case when v_gagne then v_champion end,
    'ancien_champion', case when v_gagne then v_ancien end);
end $$;

revoke all on function public.coffre_ouvrir(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) from public, anon, authenticated;
grant execute on function public.coffre_ouvrir(text, text, text, text, integer) to service_role;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) to service_role;
