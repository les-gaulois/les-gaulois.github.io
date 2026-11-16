/**
 * Écrit `.cache/a-coller-pochette-bannieres.sql` (hors de Git) : la migration de la pochette des bannières, seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Le village des Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-pochette-bannieres.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BANNIERES, estDeLaPochette } from "../supabase/functions/code-discord/bannieres/index";

const NOM = "20261116000100_pochette_des_bannieres";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const TRESORS = BANNIERES.filter(estDeLaPochette).length;
const BOUTIQUE = BANNIERES.length - TRESORS;
const ATTENDU = `pochette des bannières : ${TRESORS} trésors installés`;

const entete = `-- LA POCHETTE DES BANNIÈRES (16 novembre 2026), à coller en un seul fichier.
-- Les ${TRESORS} « trésors de la pochette » : des bannières qui ne s'achètent pas, tirées d'une pochette à 3 000 statères, sans doublon.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une colonne, ${TRESORS} bannières et des fonctions ; il remplace la lecture des bannières
-- et leur achat par les mêmes, avec la pochette en plus. Il n'efface rien et ne touche aucun Gaulois, aucun objet, aucun
-- familier, aucune bannière déjà achetée ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose les bannières déjà collées (elles sont en ligne depuis le 15 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.choisir_banniere(text)') is null then
    raise exception 'Les bannières ne sont pas installées : collez d''abord .cache/a-coller-bannieres.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116000100', 'pochette_des_bannieres', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les trésors marqués de la pochette, les bannières de la boutique non, le prix et les chances, la lecture qui
-- rend la pochette, la pochette ouverte aux seuls comptes connectés.
select 'pochette des bannières : '
  || case when (select count(*) from internal.bannieres where pochette) = ${TRESORS}
       and (select count(*) from internal.bannieres where not pochette) = ${BOUTIQUE}
       and internal.bannieres_pochette_prix() = 3000
       and (select sum(chance) from internal.bannieres_pochette_chances()) = 100
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_bannieres(integer)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_bannieres(integer)', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_banniere(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_bannieres()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000100')
     then '${TRESORS} trésors installés' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-pochette-bannieres.sql", texte);
console.log(`.cache/a-coller-pochette-bannieres.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
