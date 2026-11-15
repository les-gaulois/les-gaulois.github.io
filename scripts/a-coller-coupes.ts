/**
 * Écrit `.cache/a-coller-coupes.sql` (hors de Git) : la migration des coupes, des barbes et des couleurs de cheveux du
 * Gaulois seule, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Le village des Gaulois », lot 8). À relancer depuis la racine du dépôt après tout
 * changement de la migration : `npx tsx scripts/a-coller-coupes.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { OBJETS, POILS } from "../supabase/functions/code-discord/gaulois";

const NOM = "20261115000600_village_coupes_et_couleurs";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const coupes = Object.keys(OBJETS.cheveux).length;
const barbes = Object.keys(OBJETS.barbe).length;
const couleurs = Object.keys(POILS).length;
const ATTENDU = `coupes : ${coupes} coupes, ${barbes} barbes, ${couleurs} couleurs`;

const entete = `-- LES COUPES, LES BARBES ET LES COULEURS DE CHEVEUX DU GAULOIS (15 novembre 2026), à coller en un seul fichier.
-- Dix coupes de cheveux et dix barbes de plus, gratuites, et davantage de couleurs de cheveux.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run », AVANT la publication du site. Il contient
-- la seule migration ${NOM}.sql, notée comme appliquée. Il ajoute des lignes à la liste des objets et remplace la
-- vérification d'une tenue par la même, avec plus de couleurs. Il n'efface rien et ne touche aucun Gaulois enregistré.
-- Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261115000600', 'village_coupes_et_couleurs', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la migration est-elle notée, les coupes et les barbes gratuites sont-elles dans la liste, et la
-- vérification connaît-elle chaque couleur ?
select case when exists (select 1 from supabase_migrations.schema_migrations where version = '20261115000600')
            then 'coupes : ' else 'PAS NOTÉE, coupes : ' end
  || (select count(*) from internal.gaulois_objets where emplacement = 'cheveux' and gratuit) || ' coupes, '
  || (select count(*) from internal.gaulois_objets where emplacement = 'barbe' and gratuit) || ' barbes, '
  || (select count(*) from unnest(array[${Object.keys(POILS).map((id) => `'${id}'`).join(", ")}]) as t (id)
      where (select p.prosrc from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'internal' and p.proname = 'gaulois_tenue_valide') like '%''' || t.id || '''%') || ' couleurs'
  as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coupes.sql", texte);
console.log(`.cache/a-coller-coupes.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
console.log(`dernière ligne attendue : « ${ATTENDU} »`);
