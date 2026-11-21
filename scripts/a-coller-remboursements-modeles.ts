/**
 * Écrit `.cache/a-coller-remboursements-modeles.sql` (hors de Git) : la migration des remboursements de la pochette des
 * Gaulois uniques, seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Les Gaulois uniques »). À relancer depuis la racine du dépôt après tout changement de la
 * migration : `npx tsx scripts/a-coller-remboursements-modeles.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 * Le prix de la pochette est celui de cette migration, écrit ici en clair : le contrat a celui d'aujourd'hui (1 600 depuis
 * le 21 novembre 2026, migration 20261121000500).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PALIERS_DE_REMBOURSEMENT, REMBOURSEMENT_POCHETTE_MODELES } from "../src/lib/village/contrat";

/** Le prix de la pochette des Gaulois uniques à cette migration (20261116000600), du 16 au 21 novembre 2026. */
const PRIX_POCHETTE_MODELES = 3000;

const NOM = "20261116000600_gaulois_uniques_remboursements";
const VERSION = NOM.slice(0, 14);
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const paliers = PALIERS_DE_REMBOURSEMENT;
const ATTENDU = `Gaulois uniques : ${REMBOURSEMENT_POCHETTE_MODELES} % de remboursements, de ${paliers[0]} à ${paliers[paliers.length - 1]} %`;

const entete = `-- LES REMBOURSEMENTS DE LA POCHETTE DES GAULOIS UNIQUES (16 novembre 2026), à coller en un seul fichier.
-- ${REMBOURSEMENT_POCHETTE_MODELES} % des pochettes rendent ${paliers.join(", ")} % de leur prix (à ${PRIX_POCHETTE_MODELES} statères : de ${(PRIX_POCHETTE_MODELES * paliers[0]!) / 100} à ${(PRIX_POCHETTE_MODELES * paliers[paliers.length - 1]!) / 100}) ;
-- les ${100 - REMBOURSEMENT_POCHETTE_MODELES} % restants donnent un Gaulois unique, comme avant.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une colonne et une fonction, et remplace l'ouverture de la pochette et la lecture des
-- Gaulois uniques ; il ne touche aucun compte, aucun modèle possédé ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose les prix du 16 novembre déjà collés (.cache/a-coller-prix-modeles.sql) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.modeles_prix') is null then
    raise exception 'Les prix des Gaulois uniques ne sont pas installés : collez d''abord .cache/a-coller-prix-modeles.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', 'gaulois_uniques_remboursements', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la part des remboursements, les paliers, les fonctions toujours fermées aux visiteurs.
select 'Gaulois uniques : '
  || case when (select remboursement from internal.modeles_pochette where id) = ${REMBOURSEMENT_POCHETTE_MODELES}
       and internal.modeles_paliers() = array[${paliers.join(", ")}]
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_modeles(integer)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_modeles(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.get_mes_modeles()', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_modeles()', 'execute')
       and not has_function_privilege('authenticated', 'internal.modeles_paliers()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
     then '${REMBOURSEMENT_POCHETTE_MODELES} % de remboursements, de ${paliers[0]} à ${paliers[paliers.length - 1]} %' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-remboursements-modeles.sql", texte);
console.log(`.cache/a-coller-remboursements-modeles.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
