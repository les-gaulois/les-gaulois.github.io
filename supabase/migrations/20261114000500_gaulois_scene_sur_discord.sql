-- /gaulois devant le décor de son lieu (14 novembre 2026, docs/DIRECTION.md, « Le village des Gaulois », lot 6).
--
-- Demande du pilote : « plus de 12 fonds différents en fonction de la journée et où se trouve la personne au moment de
-- /gaulois ». La fonction code-discord choisit le décor avec la règle de la place du village (supabase/functions/
-- code-discord/scene.ts, copie de lieuDuGaulois) : il lui faut les mêmes faits que la place.
--
-- discord_gaulois (remplacée, depuis la 001700) rend en plus, pour un compte validé seulement, comme la place
-- (get_village de la 002300) :
-- - partie_le : le début de sa dernière partie qui a rapporté des points au clan, de moins de 24 heures, seulement si le
--   compte a un pseudo public unique dans la liste du clan (internal.village_vie_partie) ; sinon null. Un membre anonyme
--   n'est donc jamais montré au champ de bataille ni à la taverne : l'heure d'une partie, croisée avec les sessions
--   publiques, le démasquerait ;
-- - vocal : l'état de son dernier relevé vocal de moins de 15 minutes (internal.village_vie_vocal) ; sinon null ;
-- - releve : l'heure de ce relevé.
-- Un compte en attente de validation a toujours son Gaulois sur /gaulois, sans ces trois faits : la place et les maisons,
-- selon l'heure. C'est le joueur qui tape /gaulois, pour son propre Gaulois, dans le salon de son choix.
--
-- Mêmes refus, mêmes droits qu'avant : la clé de service seule. Aucune table touchée. Rejouée, elle se remplace par la même.

create or replace function public.discord_gaulois(p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_status public.member_status;
  v_tenue jsonb;
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
  select g.tenue into v_tenue from internal.gaulois g where g.user_id = v_uid;
  if v_tenue is null then
    return jsonb_build_object('ok', false, 'error', 'no_gaulois');
  end if;
  if v_status = 'validated' then
    select d.debut into v_partie from internal.village_vie_partie(v_uid) d;
    select internal.village_vie_vocal(v.vocal, v.vocal_le), v.vocal_le into v_vocal, v_releve
    from internal.village_vie v where v.user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'tenue', v_tenue, 'partie_le', v_partie, 'vocal', v_vocal, 'releve', v_releve);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de la fonction code-discord, l'appelle.
revoke all on function public.discord_gaulois(text) from public, anon, authenticated;
grant execute on function public.discord_gaulois(text) to service_role;
