-- La remise des essais du coffre (demande du pilote, 17 novembre 2026 : « reset les limites aujourd'hui, que tout le monde
-- ait de nouveau 30 utilisations », docs/DIRECTION.md, « Le coffre du druide »).
--
-- Jusqu'ici, coffre_ouvrir comptait les essais du membre, et ceux de tout le serveur, depuis minuit (heure de Paris) :
-- rendre ses essais à tout le monde aurait demandé d'effacer les essais du jour, donc l'historique de la manche.
-- Ce qui change :
-- - internal.coffre_reglages reçoit la colonne essais_depuis, vide par défaut : l'instant de la dernière remise.
-- - coffre_ouvrir, reprise ici en entier de 20261117000100_coffre_mise_dix_et_garde.sql, compte les essais depuis le plus
--   tardif de minuit et de essais_depuis. Vide ou d'un jour passé, la colonne ne change rien : le compte repart à minuit.
-- Rien d'autre ne change : la mise, la cagnotte, le plafond de dépense, la date de fin, l'historique et le podium.
--
-- La migration ne remet rien elle-même et n'efface rien ; rejouée, elle ne change rien. La remise est un geste du pilote,
-- dans l'éditeur SQL : update internal.coffre_reglages set essais_depuis = now() where id;
-- Mêmes paramètres qu'avant : les droits déjà donnés restent, redits plus bas.

alter table internal.coffre_reglages add column if not exists essais_depuis timestamptz;

create or replace function public.coffre_ouvrir(p_discord_id text, p_nom text, p_message text, p_interaction_id text, p_mise integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r internal.coffre_reglages;
  v_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_soir text := internal.coffre_soir();
  v_permis integer;
  v_du_membre integer;
  v_du_jour integer;
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

revoke all on function public.coffre_ouvrir(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.coffre_ouvrir(text, text, text, text, integer) to service_role;
