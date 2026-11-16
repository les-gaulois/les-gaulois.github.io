/**
 * Écrit `.cache/a-coller-modeles.sql` (hors de Git) : la migration des Gaulois uniques, seule, dans une transaction, notée
 * dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le village des
 * Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-modeles.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MODELES } from "../supabase/functions/code-discord/modeles/index";

const NOM = "20261115001000_gaulois_uniques";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = `Gaulois uniques : ${MODELES.length} installés`;

const entete = `-- LES GAULOIS UNIQUES (15 novembre 2026), à coller en un seul fichier.
-- Les ${MODELES.length} Gaulois uniques (lézard, dragon, axolotl…), à la boutique au quintuple du prix d'un objet de leur rareté,
-- ou dans leur pochette dédiée, qui ne donne jamais deux fois le même.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute trois tables et des fonctions ; il remplace la vérification de la tenue et la fonction
-- de la sauvegarde par les mêmes, avec les Gaulois uniques en plus. Il n'efface rien et ne touche aucun Gaulois, aucun
-- objet, aucun familier, aucune bannière ni aucun statère. Collé une seconde fois, il ne change rien.
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
values ('20261115001000', 'gaulois_uniques', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les modèles, les prix au quintuple de ceux des objets, la pochette, les fonctions ouvertes aux seuls
-- comptes connectés, la sauvegarde en version 9.
select 'Gaulois uniques : '
  || case when (select count(*) from internal.modeles) = ${MODELES.length}
       and (select internal.modele_prix('legendaire')) = 5 * (select prix from internal.village_prix where rarete = 'legendaire')
       and (select count(*) from internal.modeles_pochette) = 1
       and has_function_privilege('authenticated', 'public.get_mes_modeles()', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_modele(text, integer)', 'execute')
       and has_function_privilege('authenticated', 'public.ouvrir_pochette_modeles(integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_modeles()', 'execute')
       and not has_function_privilege('anon', 'public.acheter_modele(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette_modeles(integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.modele_prix(text)', 'execute')
       and (public.export_site() ->> 'version') = '9'
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261115001000')
     then '${MODELES.length} installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-modeles.sql", texte);
console.log(`.cache/a-coller-modeles.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
