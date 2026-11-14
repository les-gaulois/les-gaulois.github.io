-- Plus d'heures de silence la nuit (14 novembre 2026, à la demande du pilote : « je veux pas qu'il se mette en pause pendant
-- la nuit », « il peut parler 24h24 »). Le robot horaire ne se tait plus de 23 h à 8 h (src/lib/alerts.ts) : l'avis que le
-- serveur poste dès qu'une demande d'adhésion arrive (migration 20261112000600) ne se tait plus non plus.
--
-- internal.staff_quiet_hour répond désormais toujours non ; le déclencheur qui la lit (internal.announce_request_now) ne
-- change pas. Tant que cette migration n'est pas appliquée, une demande faite la nuit est annoncée par le robot à son
-- passage suivant, dans l'heure.
--
-- Cette migration ne fait que remplacer une fonction : aucune table, aucune donnée touchée. Rejouée, elle ne change rien.
create or replace function internal.staff_quiet_hour(p_at timestamptz) returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select false
$$;
revoke all on function internal.staff_quiet_hour(timestamptz) from public, anon, authenticated;
