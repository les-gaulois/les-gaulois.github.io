-- Le coffre en images (demande du pilote, 16 novembre 2026, docs/DIRECTION.md, « Le coffre du druide ») : le jeu /coffre,
-- installé par 20261116001000_coffre_du_druide.sql, reçoit ce que le pilote a choisi sur planches : un gardien différent à
-- chaque manche, le tableau des indices, une cagnotte en statères, le palmarès de la semaine et deux soirs spéciaux.
--
-- Ce que le serveur garde en plus :
-- - pour chaque manche, son gardien (druide, forgeron, barde, marchande, à tour de rôle) et son tableau : si la longueur du
--   mot a été dite, les places des lettres déjà données, et six indices au plus, de 28 signes au plus ;
-- - pour chaque essai, l'humeur du gardien et la mise du membre ;
-- - la cagnotte, et le champion de la semaine, à qui le robot donne un rôle sur Discord.
--
-- La cagnotte ne crée aucun statère. Un membre ne mise que s'il le demande (20, 50 ou 100 statères), s'il a un compte
-- validé avec son Gaulois, et s'il a de quoi payer. La mise n'est prise qu'une fois la réponse du gardien gardée : un essai
-- sans réponse ne coûte rien. Chaque mise entre telle quelle dans la cagnotte ; le gagnant d'une manche la reçoit entière
-- s'il a un compte validé avec son Gaulois, sinon elle reste pour la manche suivante. La somme des mises est donc toujours
-- égale à la somme des gains plus la cagnotte du moment. Un compte en essai du mode GOD (20261116000900) ne mise pas et ne
-- reçoit pas la cagnotte : ses mouvements de statères sont rendus aussitôt, la cagnotte en serait faussée. Une mise n'est
-- pas prise non plus quand un autre vient d'ouvrir le coffre.
--
-- Les soirs spéciaux, à l'heure de Paris : le vendredi de 20 h à minuit, « soir de cervoise », le gardien se méfie moins
-- (la fonction serveur baisse sa vigilance d'un palier) ; le dimanche de 20 h à minuit, « veillée », chaque membre a deux
-- fois plus d'essais.
--
-- Qui peut quoi : comme avant, tout est réservé à la clé de service, celle de la fonction serveur code-discord. Les
-- fonctions de la première migration restent en place pour la version du robot déjà en ligne : celles-ci portent d'autres
-- paramètres, ou les remplacent par les mêmes avec un champ de plus.
--
-- Des colonnes et des fonctions ajoutées, rien de retiré. Rejouée, la migration ne change rien.

alter table internal.coffre_manches
  add column if not exists gardien text not null default 'druide' check (gardien in ('druide', 'forgeron', 'barde', 'marchande')),
  add column if not exists longueur_dite boolean not null default false,
  add column if not exists lettres integer[] not null default '{}',
  add column if not exists indices text[] not null default '{}';

alter table internal.coffre_essais
  add column if not exists mise integer not null default 0 check (mise in (0, 20, 50, 100)),
  add column if not exists humeur text check (humeur is null or humeur in ('confiant', 'flatte', 'mefiant', 'agace', 'panique', 'vaincu'));

alter table internal.coffre_reglages
  add column if not exists cagnotte integer not null default 0 check (cagnotte >= 0),
  add column if not exists champion text check (champion is null or champion ~ '^[0-9]{17,20}$');

-- Le soir spécial du moment, à l'heure de Paris : 'cervoise' le vendredi de 20 h à minuit, 'veillee' le dimanche de 20 h à
-- minuit, sinon rien.
create or replace function internal.coffre_soir() returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when extract(hour from now() at time zone 'Europe/Paris') < 20 then null
    when extract(isodow from now() at time zone 'Europe/Paris') = 5 then 'cervoise'
    when extract(isodow from now() at time zone 'Europe/Paris') = 7 then 'veillee'
  end
$$;

-- Le compte du site d'un membre du Discord, s'il peut miser et gagner la cagnotte : validé, avec son Gaulois créé.
create or replace function internal.coffre_compte(p_discord_id text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select l.user_id
  from public.private_links l
  join public.profiles p on p.user_id = l.user_id
  where l.discord_id = p_discord_id
    and p.status = 'validated'
    and exists (select 1 from internal.gaulois g where g.user_id = l.user_id)
  limit 1
$$;

-- Le compte qui peut payer une mise et recevoir la cagnotte : celui de coffre_compte, sauf pendant un essai du mode GOD, où
-- chaque mouvement de statères est rendu aussitôt. La table du mode GOD est lue seulement si elle existe : cette migration
-- ne dépend pas de la sienne.
create or replace function internal.coffre_payeur(p_discord_id text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_compte uuid := internal.coffre_compte(p_discord_id);
  v_essai boolean := false;
begin
  if v_compte is null then
    return null;
  end if;
  if to_regclass('internal.village_god') is not null then
    execute 'select exists (select 1 from internal.village_god g where g.user_id = $1)' into v_essai using v_compte;
  end if;
  return case when v_essai then null else v_compte end;
end $$;

-- La manche ouverte, avec son gardien et son tableau (remplace celle de la première migration, un champ de plus).
create or replace function internal.coffre_manche_ouverte() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', m.id,
    'mot', m.mot,
    'essais', (select count(*) from internal.coffre_essais e where e.manche_id = m.id and e.reponse is not null),
    'gardien', m.gardien,
    'longueur_dite', m.longueur_dite,
    'lettres', to_jsonb(m.lettres),
    'indices', to_jsonb(m.indices))
  from internal.coffre_manches m
  where m.trouvee_le is null
$$;

-- Garde le mot d'une nouvelle manche (remplace celle de la première migration) : le gardien change à chaque manche, à
-- tour de rôle.
create or replace function public.coffre_manche(p_mot text, p_microdollars bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_manche jsonb;
begin
  perform internal.coffre_depense(p_microdollars);
  v_manche := internal.coffre_manche_ouverte();
  if v_manche is not null then
    return jsonb_build_object('ok', true, 'manche', v_manche);
  end if;
  if p_mot is null or p_mot !~ '^[a-z]{5,10}$' or exists (select 1 from internal.coffre_manches where mot = p_mot) then
    return jsonb_build_object('ok', false, 'error', 'invalid_word');
  end if;
  begin
    insert into internal.coffre_manches (mot, gardien)
    values (p_mot, (array['druide', 'forgeron', 'barde', 'marchande'])[1 + (select count(*) from internal.coffre_manches)::integer % 4]);
  exception when unique_violation then
    null;
  end;
  v_manche := internal.coffre_manche_ouverte();
  if v_manche is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_word');
  end if;
  return jsonb_build_object('ok', true, 'manche', v_manche);
end $$;

-- Ouvre un essai, avec une mise demandée (0, 20, 50 ou 100). Comme la première, et en plus : { soir, cagnotte, tenue } ;
-- `tenue` : celle du Gaulois du membre, s'il a un compte validé, pour le dessiner face au gardien. Refus en plus :
-- no_stake (mise demandée sans compte validé ni Gaulois, ou pendant un essai du mode GOD), stake_short (pas assez de statères). La mise n'est pas prise ici.
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
  v_mise integer := coalesce(p_mise, 0);
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$'
    or p_interaction_id is null or p_interaction_id !~ '^[0-9]{17,20}$'
    or p_nom is null or char_length(p_nom) not between 1 and 32
    or p_message is null or char_length(p_message) not between 2 and 300
    or v_mise not in (0, 20, 50, 100) then
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
  if v_mise > 0 then
    if internal.coffre_payeur(p_discord_id) is null then
      return jsonb_build_object('ok', false, 'error', 'no_stake');
    end if;
    -- Ce qui lui revient déjà de ses parties est d'abord versé, comme à la boutique.
    perform internal.crediter_stateres(v_compte);
    if coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_compte), 0) < v_mise then
      return jsonb_build_object('ok', false, 'error', 'stake_short');
    end if;
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
    'tenue', (select g.tenue from internal.gaulois g where g.user_id = v_compte));
end $$;

-- Garde la réponse du gardien, son humeur et ce qu'elle ajoute au tableau, prend la mise, et ferme la manche si le mot a
-- été dit ou deviné. { ok: true, gagne, manche, essai, mise: celle vraiment prise, cagnotte: après cet essai, gain: ce que le
-- gagnant reçoit, tableau: { longueur_dite, lettres, indices }, champion, ancien_champion } ; mêmes refus que la première.
-- `p_lettres` : les places (1 pour la première lettre) que le gardien vient de donner ; hors du mot, elles sont ignorées.
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
    -- La cagnotte va entière au gagnant s'il a un compte validé avec son Gaulois ; sinon elle attend la manche suivante.
    -- Le journal des statères n'accepte pas un mouvement de plus d'un million : hors d'atteinte avec des mises de 100 au plus
    -- et 300 essais par jour jusqu'au 15 décembre.
    v_compte := internal.coffre_payeur(e.discord_id);
    select cagnotte into v_cagnotte from internal.coffre_reglages where id for update;
    if v_compte is not null and v_cagnotte > 0 then
      perform internal.village_verrou(v_compte);
      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_compte, 'coffre_gain', v_cagnotte, 'manche/' || p_manche::text);
      update internal.coffre_reglages set cagnotte = 0 where id;
      v_gain := v_cagnotte;
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
    'tableau', jsonb_build_object('longueur_dite', m.longueur_dite, 'lettres', to_jsonb(m.lettres), 'indices', to_jsonb(m.indices)),
    'champion', case when v_gagne then v_champion end,
    'ancien_champion', case when v_gagne then v_ancien end);
end $$;

-- Le palmarès de la semaine (depuis lundi 0 h, heure de Paris) : les trois membres qui ont ouvert le plus de coffres, avec
-- le nom sous lequel ils ont gagné et la tenue de leur Gaulois s'ils ont un compte validé. { ok: true, depuis, perceurs }.
create or replace function public.coffre_palmares() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'depuis', date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris',
    'perceurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'discord_id', t.gagnant_discord_id,
        'nom', t.nom,
        'coffres', t.coffres,
        'tenue', (select g.tenue from internal.gaulois g where g.user_id = internal.coffre_compte(t.gagnant_discord_id))) order by t.coffres desc, t.dernier asc)
      from (
        select m.gagnant_discord_id, count(*) as coffres, max(m.trouvee_le) as dernier,
               (array_agg(m.gagnant_nom order by m.trouvee_le desc))[1] as nom
        from internal.coffre_manches m
        where m.trouvee_le >= date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
          and m.gagnant_discord_id is not null
        group by m.gagnant_discord_id
        order by count(*) desc, max(m.trouvee_le) asc
        limit 3
      ) t), '[]'::jsonb))
$$;

revoke all on function internal.coffre_soir() from public, anon, authenticated;
revoke all on function internal.coffre_compte(text) from public, anon, authenticated;
revoke all on function internal.coffre_payeur(text) from public, anon, authenticated;
revoke all on function internal.coffre_manche_ouverte() from public, anon, authenticated;
revoke all on function public.coffre_manche(text, bigint) from public, anon, authenticated;
revoke all on function public.coffre_ouvrir(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) from public, anon, authenticated;
revoke all on function public.coffre_palmares() from public, anon, authenticated;
grant execute on function public.coffre_manche(text, bigint) to service_role;
grant execute on function public.coffre_ouvrir(text, text, text, text, integer) to service_role;
grant execute on function public.coffre_clore(bigint, bigint, text, boolean, boolean, bigint, text, boolean, integer[], text) to service_role;
grant execute on function public.coffre_palmares() to service_role;

-- Les nouvelles fonctions : l'API relit la description des fonctions.
notify pgrst, 'reload schema';
