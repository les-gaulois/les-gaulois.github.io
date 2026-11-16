/**
 * Écrit `.cache/a-coller-prix-modeles.sql` (hors de Git) : la migration des prix des Gaulois uniques et de leur pochette à
 * 3 000 statères, seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Les Gaulois uniques »). À relancer depuis la racine du dépôt après tout changement de la
 * migration : `npx tsx scripts/a-coller-prix-modeles.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CHANCES_POCHETTE_MODELES, PRIX_MODELE_PAR_RARETE, PRIX_POCHETTE_MODELES } from "../src/lib/village/contrat";

const NOM = "20261116000500_gaulois_uniques_prix";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const p = PRIX_MODELE_PAR_RARETE;
const c = CHANCES_POCHETTE_MODELES;
const ATTENDU = `Gaulois uniques : pochette à ${PRIX_POCHETTE_MODELES}, boutique de ${p.commun} à ${p.legendaire}`;

const entete = `-- LES PRIX DES GAULOIS UNIQUES (16 novembre 2026), à coller en un seul fichier.
-- La pochette des Gaulois uniques passe à ${PRIX_POCHETTE_MODELES} statères, avec des chances recalculées (${c.commun}, ${c["peu-commun"]}, ${c.epique}, ${c.mystique} et ${c.legendaire} pour cent) ;
-- à la boutique, chaque Gaulois unique coûte ce que coûtent en moyenne les pochettes pour le tirer : de ${p.commun} à ${p.legendaire} statères.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une table et remplace deux fonctions ; il ne touche aucun compte, aucun modèle possédé
-- ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose les Gaulois uniques déjà collés (le 16 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.ouvrir_pochette_modeles(integer)') is null then
    raise exception 'Les Gaulois uniques ne sont pas installés : collez d''abord .cache/a-coller-modeles.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116000500', 'gaulois_uniques_prix', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les cinq prix, la pochette et ses chances, la fonction toujours fermée aux visiteurs.
select 'Gaulois uniques : '
  || case when (select count(*) from internal.modeles_prix) = 5
       and (select internal.modele_prix('commun')) = ${p.commun}
       and (select internal.modele_prix('legendaire')) = ${p.legendaire}
       and (select prix from internal.modeles_pochette where id) = ${PRIX_POCHETTE_MODELES}
       and (select legendaire from internal.modeles_pochette where id) = ${c.legendaire}
       and has_function_privilege('authenticated', 'public.get_mes_modeles()', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_modeles()', 'execute')
       and not has_function_privilege('authenticated', 'internal.modele_prix(text)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000500')
     then 'pochette à ${PRIX_POCHETTE_MODELES}, boutique de ${p.commun} à ${p.legendaire}' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-prix-modeles.sql", texte);
console.log(`.cache/a-coller-prix-modeles.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
