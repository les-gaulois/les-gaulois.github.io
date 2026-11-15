-- Les pronostics ferment le lundi à 0 h, heure de Paris, avant le début de la semaine pronostiquée (choix du pilote,
-- 15 novembre 2026, sur une remarque de la relecture des pronostics avec mise, migration 20261115000400). Avant, on
-- pronostiquait encore la semaine en cours le lundi et le mardi, jusqu'au mardi minuit : avec deux jours de victoires déjà
-- connus, et maintenant de l'argent en jeu, miser tard prenait la cagnotte de ceux qui avaient misé tôt.
--
-- Désormais, on pronostique toujours la semaine suivante, jusqu'à son lundi 0 h ; la semaine en cours est close dès son
-- début. internal.prediction_week et internal.prediction_closes (migration 20261111000400) sont remplacées par les mêmes,
-- avec cette règle : tout ce qui les lit (place_prediction, get_qg_tools) suit sans changer, et l'écran du QG lit l'heure
-- de clôture que le serveur lui donne.
--
-- Aucune donnée touchée : les pronostics déjà posés pour la semaine du 16 novembre restent tels quels ; ils ferment le
-- dimanche 15 novembre à minuit au lieu du mardi 17. Rejouée, elle se remplace par la même.

-- La semaine qu'on pronostique : toujours la suivante, à Paris.
create or replace function internal.prediction_week() returns date
language sql stable set search_path = public, pg_temp as $$
  select internal.paris_monday() + 7
$$;

-- La fin des pronostics d'une semaine : son lundi à 0 h, heure de Paris (le dimanche à minuit). Ensuite, chacun voit ceux
-- des autres.
create or replace function internal.prediction_closes(p_week date) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select p_week::timestamp at time zone 'Europe/Paris'
$$;

revoke all on function internal.prediction_week() from public, anon, authenticated;
revoke all on function internal.prediction_closes(date) from public, anon, authenticated;
