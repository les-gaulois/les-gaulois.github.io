/**
 * Écrit `.cache/a-coller-bannieres.sql` (hors de Git) : la migration des bannières du Gaulois, seule, dans une transaction,
 * notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le village des
 * Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-bannieres.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BANNIERES as TOUTES, estDeLaPochette } from "../supabase/functions/code-discord/bannieres/index";

const NOM = "20261115000900_bannieres_du_gaulois";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
// Les bannières de la boutique seules : les trésors de la pochette arrivent avec leur propre migration (20261116000100).
const BANNIERES = TOUTES.filter((b) => !estDeLaPochette(b));
const ATTENDU = `bannières : ${BANNIERES.length} installées`;

const entete = `-- LES BANNIÈRES DU GAULOIS (15 novembre 2026), à coller en un seul fichier.
-- Les ${BANNIERES.length} bannières, achetées en statères au triple du prix d'un objet de leur rareté, et celle que chacun montre sur /gaulois.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute deux tables, une colonne et des fonctions ; il remplace la fonction de /gaulois et celle
-- de la sauvegarde par les mêmes, avec les bannières en plus. Il n'efface rien et ne touche aucun Gaulois, aucun objet,
-- aucun familier ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose les familiers déjà collés (ils sont en ligne depuis le 15 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.choisir_familier(text)') is null then
    raise exception 'Les familiers ne sont pas installés : collez d''abord .cache/a-coller-familiers.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000900', 'bannieres_du_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les bannières, les prix au triple de ceux des objets, la colonne de la bannière montrée, les fonctions
-- ouvertes aux seuls comptes connectés (et /gaulois à la seule clé de service), la sauvegarde en version 8.
select 'bannières : '
  || case when (select count(*) from internal.bannieres) = ${BANNIERES.length}
       and (select internal.banniere_prix('legendaire')) = 3 * (select prix from internal.village_prix where rarete = 'legendaire')
       and exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'gaulois' and column_name = 'banniere')
       and has_function_privilege('authenticated', 'public.get_mes_bannieres()', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_banniere(text, integer)', 'execute')
       and has_function_privilege('authenticated', 'public.choisir_banniere(text)', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_bannieres()', 'execute')
       and not has_function_privilege('anon', 'public.acheter_banniere(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.choisir_banniere(text)', 'execute')
       and not has_function_privilege('authenticated', 'public.discord_gaulois(text)', 'execute')
       and (public.export_site() ->> 'version') = '8'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000900')
     then '${BANNIERES.length} installées' else 'PAS INSTALLÉES' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-bannieres.sql", texte);
console.log(`.cache/a-coller-bannieres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
