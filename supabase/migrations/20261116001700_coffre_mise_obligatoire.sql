-- La mise obligatoire et la cagnotte multipliée (demande du pilote, 16 novembre 2026, docs/DIRECTION.md, « Le coffre du
-- druide ») : après une manche gagnée sans que personne ait misé, donc sans rien à gagner, le pilote a voulu que chaque
-- essai coûte au moins 20 statères et que le jeu grossisse la cagnotte du gagnant.
--
-- Ce qui change, dans les deux fonctions de 20261116001300_coffre_en_images.sql, reprises ici en entier :
-- - coffre_ouvrir : plus d'essai sans mise. Une mise absente ou de 0 vaut 20 ; il faut donc un compte validé avec son
--   Gaulois (refus no_stake) et de quoi payer (refus stake_short). La réponse dit la mise retenue, « mise ».
-- - coffre_clore : la cagnotte reste faite des seules mises. Quand le coffre s'ouvre, le gagnant la reçoit (mouvement
--   'coffre_gain', comme avant) et le jeu y ajoute une prime (mouvement 'coffre_prime') selon la mise prise pour l'essai
--   gagnant : cagnotte fois deux pour 20 statères, fois trois pour 50, fois quatre pour 100. La réponse dit « fois ».
--
-- Le coffre crée donc des statères, par choix du pilote : seulement la prime, toujours notée 'coffre_prime'. La somme des
-- mises reste égale à la somme des 'coffre_gain' plus la cagnotte du moment.
--
-- Mêmes paramètres qu'avant : les droits déjà donnés restent, redits plus bas. Rien de retiré. Rejouée, la migration ne
-- change rien.

create or replace function public.coffre_ouvrir(p_discord_id text, p_nom text, p_message text, p_interaction_id text, p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r internal.coffre_reglages;
  v_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_soir text := internal.coffre_soir();
  v_permis integer;
  v_du_membre integer;
  v_du_jour integer;
  v_manche jsonb;
  v_manche_id bigint;
  v_essai bigint;
  v_compte uuid;
  -- Sans mise demandée, la plus petite : personne ne joue sans miser.
  v_mise integer := case when coalesce(p_mise, 0) = 0 then 20 else p_mise end;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$'
    or p_interaction_id is null or p_interaction_id !~ '^[0-9]{17,20}$'
    or p_nom is null or char_length(p_nom) not between 1 and 32
    or p_message is null or char_length(p_message) not between 2 and 300
    or v_mise not in (20, 50, 100) then
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
  v_permis := r.essais_par_membre * case when v_soir = 'veillee' then 2 else 1 end;
  select count(*) into v_du_membre from internal.coffre_essais where discord_id = p_discord_id and cree_le >= v_jour;
  if v_du_membre >= v_permis then
    return jsonb_build_object('ok', false, 'error', 'daily_limit');
  end if;
  select count(*) into v_du_jour from internal.coffre_essais where cree_le >= v_jour;
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
  v_cagnotte integer;
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
            and cardinality(indices) < 6 and not (v_indice = any (indices)) then indices || v_indice
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
    -- La cagnotte, faite des mises, va entière au gagnant ; le jeu y ajoute sa prime, selon la mise prise pour cet essai :
    -- autant que la cagnotte pour 20 statères, deux fois pour 50, trois fois pour 100. Sans compte ou sans mise prise, rien
    -- n'est multiplié. Le journal des statères n'accepte pas un mouvement de plus d'un million : au-delà, la prime est bornée.
    v_compte := internal.coffre_payeur(e.discord_id);
    select cagnotte into v_cagnotte from internal.coffre_reglages where id for update;
    if v_compte is not null and v_cagnotte > 0 then
      perform internal.village_verrou(v_compte);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_compte, 'coffre_gain', v_cagnotte, 'manche/' || p_manche::text);
      update internal.coffre_reglages set cagnotte = 0 where id;
      v_fois := case v_mise when 100 then 4 when 50 then 3 when 20 then 2 else 1 end;
      v_gain := v_cagnotte;
      if v_fois > 1 then
        insert into internal.stateres_mouvements (user_id, nature, montant, ref)
        values (v_compte, 'coffre_prime', least(v_cagnotte::bigint * (v_fois - 1), 1000000)::integer, 'manche/' || p_manche::text);
        v_gain := v_cagnotte + least(v_cagnotte::bigint * (v_fois - 1), 1000000)::integer;
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
    'tableau', jsonb_build_object('longueur_dite', m.longueur_dite, 'lettres', to_jsonb(m.lettres), 'indices', to_jsonb(m.indices)),
    'champion', case when v_gagne then v_champion end,
    'ancien_champion', case when v_gagne then v_ancien end);
end $$;

revoke all on function public.coffre_ouvrir(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) from public, anon, authenticated;
grant execute on function public.coffre_ouvrir(text, text, text, text, integer) to service_role;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) to service_role;
