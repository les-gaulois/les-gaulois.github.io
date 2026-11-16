/**
 * Écrit `.cache/a-coller-remboursements-bannieres.sql` (hors de Git) : la migration du prix baissé et des remboursements
 * de la pochette des bannières, seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une
 * dernière ligne de contrôle (docs/DIRECTION.md, « La pochette des bannières »). À relancer depuis la racine du dépôt
 * après tout changement de la migration : `npx tsx scripts/a-coller-remboursements-bannieres.ts`. N'envoie rien et ne lit
 * que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PALIERS_DE_REMBOURSEMENT_DES_BANNIERES, PRIX_POCHETTE_BANNIERES, REMBOURSEMENT_POCHETTE_BANNIERES } from "../src/lib/village/contrat";

const VERSION = "20261116000700";
const NOM = `${VERSION}_pochette_bannieres_remboursements`;
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const PALIERS = PALIERS_DE_REMBOURSEMENT_DES_BANNIERES.join(", ");
const ATTENDU = `pochette des bannières : ${PRIX_POCHETTE_BANNIERES} statères, remboursements installés`;

const entete = `-- LA POCHETTE DES BANNIÈRES À ${PRIX_POCHETTE_BANNIERES} STATÈRES ET SES REMBOURSEMENTS (16 novembre 2026), à coller en un seul fichier.
-- La pochette passe de 3 000 à ${PRIX_POCHETTE_BANNIERES} statères ; ${REMBOURSEMENT_POCHETTE_BANNIERES} fois sur 100, elle rend ${PALIERS} % de son prix au lieu d'un trésor.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute deux fonctions et en remplace trois (le prix, la lecture des bannières, l'ouverture de
-- la pochette). Il n'efface rien et ne touche aucun Gaulois, aucune bannière déjà reçue ni aucun statère : une pochette
-- déjà ouverte à 3 000 n'est pas remboursée. Collé une seconde fois, il ne change rien.
-- Il suppose la pochette des bannières déjà collée (elle est en ligne depuis le 16 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.ouvrir_pochette_bannieres(integer)') is null then
    raise exception 'La pochette des bannières n''est pas installée : collez d''abord .cache/a-coller-pochette-bannieres.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'pochette_bannieres_remboursements', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : le prix, la part des remboursements, les paliers, les chances inchangées, les fonctions de réglage fermées,
-- la pochette ouverte aux seuls comptes connectés.
select 'pochette des bannières : '
  || case when internal.bannieres_pochette_prix() = ${PRIX_POCHETTE_BANNIERES}
       and internal.bannieres_pochette_remboursement() = ${REMBOURSEMENT_POCHETTE_BANNIERES}
       and internal.bannieres_pochette_paliers() = array[${PALIERS}]
       and (select sum(chance) from internal.bannieres_pochette_chances()) = 100
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_bannieres(integer)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_bannieres(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.get_mes_bannieres()', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_bannieres()', 'execute')
       and not has_function_privilege('authenticated', 'internal.bannieres_pochette_remboursement()', 'execute')
       and not has_function_privilege('authenticated', 'internal.bannieres_pochette_paliers()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then '${PRIX_POCHETTE_BANNIERES} statères, remboursements installés' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/a-coller-remboursements-bannieres.sql", `${entete}${migration}${fin}`);
console.log(`Écrit : .cache/a-coller-remboursements-bannieres.sql (${(entete + migration + fin).split("\n").length} lignes). Dernière ligne attendue : « ${ATTENDU} ».`);
