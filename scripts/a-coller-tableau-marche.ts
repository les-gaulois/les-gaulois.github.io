/**
 * Écrit `.cache/a-coller-tableau-marche.sql` (hors de Git) : la migration du tableau du marché de la Direction
 * (20261119000200), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle (docs/DIRECTION.md, « Le tableau du marché »). À relancer depuis la racine du dépôt après
 * tout changement de la migration : `npx tsx scripts/a-coller-tableau-marche.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261119000200_tableau_du_marche";
const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "tableau du marché : installé";

const entete = `-- LE TABLEAU DU MARCHÉ (19 novembre 2026), à coller en un seul fichier.
-- Une lecture pour l'onglet Village de la Direction : offres et demandes ouvertes, ventes, semaines de la boutique, prix
-- payés, sans aucun nom de membre, pour un officier ou au-dessus.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ajoute une seule fonction, qui ne fait que lire. Il n'efface rien et ne touche aucune donnée.
-- Collé une seconde fois, il ne change rien. Il suppose le marché qui vit (boutique tournante et demandes) déjà collé :
-- sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.marche_demandes') is null or to_regprocedure('internal.boutique_tours_des_objets()') is null then
    raise exception 'Le marché qui vit n''est pas installé : collez d''abord .cache/a-coller-marche-vivant.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261119000200', 'tableau_du_marche', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction est là, fermée aux visiteurs, ouverte aux comptes connectés (le serveur revérifie le rang), et la
-- migration est notée.
select 'tableau du marché : '
  || case when to_regprocedure('public.get_village_marche()') is not null
       and has_function_privilege('authenticated', 'public.get_village_marche()', 'execute')
       and not has_function_privilege('anon', 'public.get_village_marche()', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261119000200') = 1
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + sql + fin;
writeFileSync(".cache/a-coller-tableau-marche.sql", texte);
console.log(`.cache/a-coller-tableau-marche.sql : ${texte.split("\n").length} lignes`);
