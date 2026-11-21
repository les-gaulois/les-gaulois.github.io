/**
 * Écrit `.cache/a-coller-prix-baisses.sql` (hors de Git) : la migration des prix baissés du 21 novembre 2026
 * (20261121000500), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle (docs/DIRECTION.md, « Les prix baissés du 21 novembre »). À relancer depuis la racine du
 * dépôt après tout changement de la migration : `npx tsx scripts/a-coller-prix-baisses.ts`. N'envoie rien et ne lit que le
 * dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261121000500_prix_baisses";
const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "prix baissés : installés";

const entete = `-- LES PRIX BAISSÉS (21 novembre 2026), à coller en un seul fichier.
-- Gaulois uniques 6 000 à 15 000 et leur pochette 1 600 ; bannières, finitions et cadres de carte au double du prix d'un
-- objet au lieu du triple ; pochette des bannières 1 000 ; pochette des familiers 1 000. Objets, pochette surprise et
-- pochette de statères inchangés ; chances inchangées.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ne change que des prix : il n'efface rien, ne crée aucun statère et ne touche aucun compte.
-- Collé une seconde fois, il ne change rien. Il suppose les Gaulois uniques, les bannières et leurs pochettes déjà
-- installés : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.modeles_prix') is null or to_regclass('internal.modeles_pochette') is null
     or to_regclass('internal.familiers_pochette') is null or to_regclass('internal.village_prix') is null
     or to_regprocedure('internal.banniere_prix(text)') is null or to_regprocedure('internal.bannieres_pochette_prix()') is null then
    raise exception 'Les Gaulois uniques, les bannières ou les pochettes ne sont pas installés. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261121000500', 'prix_baisses', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les nouveaux prix sont lus par le serveur, et la migration est notée.
select 'prix baissés : '
  || case when internal.banniere_prix('legendaire') = 2 * (select p.prix from internal.village_prix p where p.rarete = 'legendaire')
       and internal.bannieres_pochette_prix() = 1000
       and (select p.prix from internal.familiers_pochette p where p.id) = 1000
       and (select p.prix from internal.modeles_pochette p where p.id) = 1600
       and (select string_agg(p.rarete || '=' || p.prix, ',' order by p.prix) from internal.modeles_prix p)
         = 'commun=6000,peu-commun=8000,epique=10000,mystique=12500,legendaire=15000'
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261121000500') = 1
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + sql + fin;
writeFileSync(".cache/a-coller-prix-baisses.sql", texte);
console.log(`.cache/a-coller-prix-baisses.sql : ${texte.split("\n").length} lignes`);
