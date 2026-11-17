-- Le cycle des quinze manches à thème du coffre (demande du pilote, 17 novembre 2026, docs/DIRECTION.md, « Le coffre du
-- druide ») : « un thème par round avec sa propre image et ses propres personnages, 15 rounds en tout, avec différentes
-- difficultés : 0 à 5 facile, medium, fois 2 ; 5 à 10 difficile, fois 3 ; 10 à 15 très difficile, extrême, fois 4 ».
--
-- Le robot fait les gardiens, les décors et la vigilance (coffre.ts, MANCHES_DU_CYCLE) ; le serveur dit seulement où en est
-- le cycle, et par combien la cagnotte est multipliée :
-- - internal.coffre_reglages.cycle_base : le numéro de la dernière manche d'avant le cycle. Vide, il n'y a pas de cycle,
--   et tout marche comme avant. La migration le laisse vide : c'est le fichier à coller qui lance le cycle.
-- - internal.coffre_rang(manche) : le rang de la manche dans le cycle, de 1 à 15, puis de nouveau 1 ; rien sans cycle,
--   ou pour une manche d'avant.
-- - internal.coffre_fois_du_rang(rang) : fois 2 pour les manches 1 à 5, fois 3 pour 6 à 10, fois 4 pour 11 à 15.
-- - internal.coffre_manche_ouverte(), reprise de 20261116001300_coffre_en_images.sql, rend ce rang en plus (« rang »).
-- - public.coffre_clore, reprise ici en entier de 20261117000700_coffre_lettre_tableau_bilan.sql : dans le cycle, la
--   prime ('coffre_prime') multiplie les mises par le multiplicateur du niveau au lieu de celui de la garde ; rien
--   d'autre n'y bouge. Les lettres achetées restent hors de la prime. La réponse dit le rang.
-- - public.coffre_tableau(), reprise de la même migration, dit en plus si le cycle est lancé (« cycle »), pour que l'aide
--   du robot n'annonce les quinze manches que s'il tourne.
--
-- Le coffre crée moins qu'avant au plus haut niveau (fois 4 au lieu de fois 5), et autant ou plus aux premiers : c'est
-- toujours la seule prime, notée 'coffre_prime'. Aucune table ni donnée touchée. Rejouée, la migration ne change rien.

alter table internal.coffre_reglages add column if not exists cycle_base bigint;

create or replace function internal.coffre_rang(p_manche bigint) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when r.cycle_base is null or p_manche is null or p_manche <= r.cycle_base then null
    else 1 + (((select count(*) from internal.coffre_manches m where m.id > r.cycle_base and m.id <= p_manche)::integer - 1) % 15)
  end
  from internal.coffre_reglages r
  where r.id
$$;

create or replace function internal.coffre_fois_du_rang(p_rang integer) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_rang is null then null when p_rang <= 5 then 2 when p_rang <= 10 then 3 else 4 end
$$;

create or replace function internal.coffre_manche_ouverte() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', m.id,
    'mot', m.mot,
    'essais', (select count(*) from internal.coffre_essais e where e.manche_id = m.id and e.reponse is not null),
    'gardien', m.gardien,
    'longueur_dite', m.longueur_dite,
    'lettres', to_jsonb(m.lettres),
    'indices', to_jsonb(m.indices),
    'rang', internal.coffre_rang(m.id))
  from internal.coffre_manches m
  where m.trouvee_le is null
$$;

create or replace function public.coffre_tableau() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'cycle', r.cycle_base is not null,
    'ouvert', r.ouvert and now() < r.fin and r.depense_microdollars < r.plafond_microdollars,
    'manche', internal.coffre_manche_ouverte(),
    'numero', (select count(*) from internal.coffre_manches),
    'niveau', (select count(*) from internal.coffre_manches where trouvee_le is not null),
    'soir', internal.coffre_soir(),
    'cagnotte', r.cagnotte,
    'essais_par_membre', r.essais_par_membre,
    'prix_lettre', (select internal.coffre_prix_lettre(m.id) from internal.coffre_manches m where m.trouvee_le is null))
  from internal.coffre_reglages r
  where r.id
$$;

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
  v_indice text := nullif(btrim(coalesce(p_indice, '')), '');
  v_semaine timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_champion text;
  v_ancien text;
begin
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
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_compte, 'coffre_gain', v_cagnotte, 'manche/' || p_manche::text);
      update internal.coffre_reglages set cagnotte = 0 where id;
      -- Dans le cycle, le niveau de la manche fixe le multiplicateur ; sans cycle, la garde, comme avant.
      v_rang := internal.coffre_rang(p_manche);
      v_fois := case when v_mise > 0 then coalesce(internal.coffre_fois_du_rang(v_rang), v_garde + 1) else 1 end;
      v_gain := v_cagnotte;
      if v_fois > 1 and v_cagnotte - v_lettres > 0 then
        insert into internal.stateres_mouvements (user_id, nature, montant, ref)
        values (v_compte, 'coffre_prime', least((v_cagnotte - v_lettres)::bigint * (v_fois - 1), 1000000)::integer, 'manche/' || p_manche::text);
        v_gain := v_cagnotte + least((v_cagnotte - v_lettres)::bigint * (v_fois - 1), 1000000)::integer;
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
    'garde', case when v_gagne then v_garde end,
    'tableau', jsonb_build_object('longueur_dite', m.longueur_dite, 'lettres', to_jsonb(m.lettres), 'indices', to_jsonb(m.indices)),
    'champion', case when v_gagne then v_champion end,
    'ancien_champion', case when v_gagne then v_ancien end);
end $$;

revoke all on function internal.coffre_rang(bigint) from public, anon, authenticated;
revoke all on function internal.coffre_fois_du_rang(integer) from public, anon, authenticated;
revoke all on function internal.coffre_manche_ouverte() from public, anon, authenticated;
revoke all on function public.coffre_tableau() from public, anon, authenticated;
grant execute on function public.coffre_tableau() to service_role;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) from public, anon, authenticated;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) to service_role;
