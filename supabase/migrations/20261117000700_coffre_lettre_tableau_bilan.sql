-- Le coffre du druide : la lettre à acheter, le tableau entier, le bilan de la manche (demandes du pilote, 17 novembre
-- 2026, docs/DIRECTION.md, « Le coffre du druide ») : « une commande qui affiche tous les indices enregistrés dans le
-- round », et, parmi les idées proposées, la lettre à acheter, l'alerte de cagnotte et le bilan de fin de manche.
--
-- Ce qui est ajouté :
-- - internal.coffre_lettres_achetees : une ligne par lettre vendue (la manche, la place, le prix, l'heure), sans le nom
--   ni l'identifiant de l'acheteur : son achat est au journal de ses statères ('coffre_indice').
-- - internal.coffre_prix_lettre(manche) : le prix de la prochaine lettre à vendre, 50, 100 puis 200 statères, ou rien :
--   trois lettres au plus par manche, et jamais quand il reste moins de trois lettres cachées (le mot ne s'achète pas).
-- - public.coffre_tableau() : la manche ouverte et ce que le robot dessine autour (numéro, coffres déjà ouverts, soir,
--   cagnotte, essais par membre, prix de la prochaine lettre). Une lecture, sans rien écrire.
-- - public.coffre_indice(discord, nom) : vend une lettre tirée au sort parmi les cachées. Son prix sort de la bourse de
--   l'acheteur et entre entier dans la cagnotte. La somme des mises et des lettres achetées reste égale à la somme des
--   'coffre_gain' plus la cagnotte du moment. Un compte en mode GOD n'achète pas. Le nom donné n'est pas gardé.
-- - public.coffre_bilan(manche) : les essais répondus d'une manche, ses joueurs, le plus acharné, ses lettres vendues,
--   sa durée. Une lecture.
-- Ce qui change : public.coffre_clore, reprise ici en entier de 20261117000100_coffre_mise_dix_et_garde.sql :
-- - elle garde jusqu'à 12 indices par manche au lieu de 6 ;
-- - la prime du jeu ('coffre_prime') ne multiplie que les mises : le prix des lettres achetées de la manche est gagné
--   avec la cagnotte, mais sorti de la base de la prime. Sans cela, qui connaît le mot achèterait trois lettres pour
--   les voir multipliées : les lettres ne créent aucun statère. La réponse dit cette somme (« lettres »).
--
-- L'alerte de cagnotte ne demande rien au serveur : le robot compare la cagnotte avant et après.
-- Tout est réservé à la clé de service de la fonction code-discord. Rejouée, la migration ne change rien.

create table if not exists internal.coffre_lettres_achetees (
  id bigint generated always as identity primary key,
  manche_id bigint not null references internal.coffre_manches (id) on delete cascade,
  place integer not null check (place between 1 and 10),
  prix integer not null check (prix > 0),
  cree_le timestamptz not null default now(),
  unique (manche_id, place)
);
alter table internal.coffre_lettres_achetees enable row level security;
revoke all on table internal.coffre_lettres_achetees from public, anon, authenticated;

create or replace function internal.coffre_prix_lettre(p_manche bigint) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when m.trouvee_le is not null then null
    when char_length(m.mot) - cardinality(m.lettres) < 3 then null
    else (array[50, 100, 200])[1 + (select count(*) from internal.coffre_lettres_achetees a where a.manche_id = m.id)::integer]
  end
  from internal.coffre_manches m
  where m.id = p_manche
$$;

create or replace function public.coffre_tableau() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
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

create or replace function public.coffre_indice(p_discord_id text, p_nom text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r internal.coffre_reglages;
  m internal.coffre_manches;
  v_compte uuid;
  v_prix integer;
  v_place integer;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$' or p_nom is null or char_length(p_nom) not between 1 and 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select * into r from internal.coffre_reglages where id for update;
  if not found or not r.ouvert then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if now() >= r.fin then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;
  -- Le plafond de dépense atteint, plus personne ne peut ouvrir le coffre : aucune lettre ne se vend.
  if r.depense_microdollars >= r.plafond_microdollars then
    return jsonb_build_object('ok', false, 'error', 'budget');
  end if;
  select * into m from internal.coffre_manches where trouvee_le is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_round');
  end if;
  v_compte := internal.coffre_payeur(p_discord_id);
  if v_compte is null then
    return jsonb_build_object('ok', false, 'error', 'no_stake');
  end if;
  if (select count(*) from internal.coffre_lettres_achetees a where a.manche_id = m.id) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'sold_out');
  end if;
  v_prix := internal.coffre_prix_lettre(m.id);
  if v_prix is null then
    return jsonb_build_object('ok', false, 'error', 'too_few');
  end if;
  select x into v_place from generate_series(1, char_length(m.mot)) x where not (x = any (m.lettres)) order by random() limit 1;
  if v_place is null then
    return jsonb_build_object('ok', false, 'error', 'too_few');
  end if;

  -- Comme à la boutique : le verrou du compte, ce qui lui revient déjà de ses parties, puis le prix sort de sa bourse.
  perform internal.village_verrou(v_compte);
  perform internal.crediter_stateres(v_compte);
  begin
    perform internal.village_debiter(v_compte, 'coffre_indice', v_prix, 'manche/' || m.id::text);
  exception when sqlstate 'GA001' then
    return jsonb_build_object('ok', false, 'error', 'stake_short', 'prix', v_prix);
  end;
  update internal.coffre_reglages set cagnotte = cagnotte + v_prix where id;
  update internal.coffre_manches
  set lettres = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(lettres || v_place) x)
  where id = m.id;
  insert into internal.coffre_lettres_achetees (manche_id, place, prix) values (m.id, v_place, v_prix);

  return jsonb_build_object(
    'ok', true,
    'place', v_place,
    'prix', v_prix,
    'manche', internal.coffre_manche_ouverte(),
    'numero', (select count(*) from internal.coffre_manches),
    'niveau', (select count(*) from internal.coffre_manches where trouvee_le is not null),
    'soir', internal.coffre_soir(),
    'cagnotte', (select cagnotte from internal.coffre_reglages where id),
    'prix_lettre', internal.coffre_prix_lettre(m.id),
    'tenue', (select g.tenue from internal.gaulois g where g.user_id = v_compte));
end $$;

create or replace function public.coffre_bilan(p_manche bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'essais', (select count(*) from internal.coffre_essais e where e.manche_id = m.id and e.reponse is not null),
    'joueurs', (select count(distinct e.discord_id) from internal.coffre_essais e where e.manche_id = m.id and e.reponse is not null),
    'acharne', (
      select jsonb_build_object('nom', t.nom, 'essais', t.essais)
      from (
        select (array_agg(e.nom order by e.id desc))[1] as nom, count(*) as essais, min(e.id) as premier
        from internal.coffre_essais e
        where e.manche_id = m.id and e.reponse is not null
        group by e.discord_id
        order by count(*) desc, min(e.id) asc
        limit 1
      ) t),
    'lettres_achetees', (select count(*) from internal.coffre_lettres_achetees a where a.manche_id = m.id),
    'minutes', floor(extract(epoch from (coalesce(m.trouvee_le, now()) - m.ouverte_le)) / 60)::bigint)
  from internal.coffre_manches m
  where m.id = p_manche
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
      v_fois := case when v_mise > 0 then v_garde + 1 else 1 end;
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
    'garde', case when v_gagne then v_garde end,
    'tableau', jsonb_build_object('longueur_dite', m.longueur_dite, 'lettres', to_jsonb(m.lettres), 'indices', to_jsonb(m.indices)),
    'champion', case when v_gagne then v_champion end,
    'ancien_champion', case when v_gagne then v_ancien end);
end $$;

revoke all on function internal.coffre_prix_lettre(bigint) from public, anon, authenticated;
revoke all on function public.coffre_tableau() from public, anon, authenticated;
revoke all on function public.coffre_indice(text, text) from public, anon, authenticated;
revoke all on function public.coffre_bilan(bigint) from public, anon, authenticated;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) from public, anon, authenticated;
grant execute on function public.coffre_tableau() to service_role;
grant execute on function public.coffre_indice(text, text) to service_role;
grant execute on function public.coffre_bilan(bigint) to service_role;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) to service_role;
