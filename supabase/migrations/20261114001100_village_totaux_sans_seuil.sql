-- Le village des Gaulois : l'onglet Village de la Direction donne tous ses totaux, sans seuil (docs/DIRECTION.md, « Le
-- village des Gaulois » ; écran : src/components/compte/DirectionVillage.tsx, lecture : src/lib/village/direction.ts).
--
-- Le 14 novembre 2026, devant un onglet où les statères distribués, dépensés et en circulation disaient tous « pas donné »
-- avec 4 comptes crédités, le pilote : « c'est pas grave que l'autre connaisse le solde de l'autre ». La migration
-- 20261113002100 cachait un chiffre venu de moins de 5 comptes, pour qu'un membre de l'encadrement, crédité lui-même, ne
-- retrouve pas par soustraction ce que d'autres possèdent. Le pilote accepte ce recoupement : chaque total est donné, même
-- s'il ne vient que d'un seul compte.
--
-- Le seuil passe donc à 1 compte. internal.village_passe (migration 20261113002100) laisse alors passer tout groupe de
-- comptes, vide ou non, et get_village_economie, inchangée, donne tous ses chiffres ; sa réponse dit "seuil": 1, et l'écran
-- ne parle plus de chiffres cachés. Rien d'autre ne change : des totaux seulement, sans aucun nom, pour les officiers et
-- au-dessus ; la table des soldes n'est toujours lue que par les fonctions d'un compte pour lui-même, et aucune fonction ne
-- classe les soldes. Remettre un seuil : une nouvelle migration qui redonne un autre nombre ici.
--
-- Stable et non plus immutable : une fonction immutable sans argument peut être remplacée par sa valeur dans un plan gardé
-- en mémoire par une connexion ouverte ; stable, elle est relue à chaque appel, et un seuil changé vaut tout de suite.
--
-- Une fonction remplacée, même nom, même signature, mêmes droits ; aucune table, aucune donnée touchée. Rejouée, elle se
-- remplace par la même.

create or replace function internal.village_seuil() returns integer
language sql stable set search_path = public, pg_temp as $$
  select 1
$$;

revoke all on function internal.village_seuil() from public, anon, authenticated;
