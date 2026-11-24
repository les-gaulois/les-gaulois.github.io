-- Le plafond du jour du casino passe de 2 000 à 12 500 statères misés par jour et par compte (docs/DIRECTION.md, « Le
-- casino des Gaulois » ; contrat : PLAFOND_DU_JOUR_DU_CASINO de src/lib/village/contrat-casino.ts).
--
-- Décision du pilote, 24 novembre 2026 au matin : « je veux que ça devienne 20000 », puis « 12500 plutôt ! ». Il avait
-- atteint les 2 000 au vingt-et-un et avait cru le casino cassé.
--
-- Seul le chiffre change : internal.casino_plafond(), lue par internal.casino_miser (refus casino_plafond), par get_casino
-- (`plafond`, `reste_du_jour`) et par la réponse de chaque coup (`reste_du_jour`). Le reste des règles ne bouge pas : le
-- jour de Paris, les compléments du vingt-et-un comptés, le mode GOD hors plafond, 200 au plus de mise de départ. Aucune
-- table, aucune donnée touchée, aucun statère créé. Rejouée, elle se remplace par la même.

create or replace function internal.casino_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 12500 $$;

revoke all on function internal.casino_plafond() from public, anon, authenticated;
