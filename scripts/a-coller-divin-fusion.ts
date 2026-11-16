/**
 * Écrit `.cache/a-coller-divin-fusion.sql` (hors de Git) : la migration du divin et de la fusion à la forge, seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Le village des Gaulois »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-divin-fusion.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LOT_DIVIN } from "../supabase/functions/code-discord/garde-robe/divin";

const NOM = "20261116000300_divin_et_fusion";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const OBJETS = LOT_DIVIN.length;
const ATTENDU = `divin et fusion : ${OBJETS} objets divins installés`;

const entete = `-- LE DIVIN ET LA FUSION À LA FORGE (16 novembre 2026), à coller en un seul fichier.
-- Les tenues divines de cinq pièces, dix fois plus rares que le légendaire, dans la pochette surprise seulement ; et la
-- fusion à la forge : trois objets d'une rareté en donnent un de la suivante.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il élargit la liste des raretés, ajoute ${OBJETS} objets, une table et des fonctions ; il remplace
-- l'ouverture de la pochette surprise, la lecture de la boutique et celle de la forge par les mêmes, avec le divin et la
-- fusion en plus. Il n'efface rien et ne touche aucun Gaulois, aucun objet possédé, aucune plaque ni aucun statère. Collé
-- une seconde fois, il ne change rien.
-- Il suppose la forge déjà collée (elle est en ligne depuis le 14 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.get_ma_forge()') is null or to_regprocedure('public.ouvrir_pochette(integer)') is null then
    raise exception 'La boutique ou la forge du village ne sont pas installées : collez d''abord leurs fichiers. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261116000300', 'divin_et_fusion', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les objets divins et aucun prix pour eux, la chance du divin prise sur le commun, le tirage qui fait 100, la
-- fusion ouverte aux seuls comptes connectés, ses fonctions internes fermées.
select 'divin et fusion : '
  || case when (select count(*) from internal.gaulois_objets where rarete = 'divin' and not gratuit) = ${OBJETS}
       and not exists (select 1 from internal.village_prix where rarete = 'divin')
       and internal.village_chance_divine() = (select least(legendaire / 10.0, commun) from internal.village_pochette where id)
       and (select sum(chance) from internal.village_chances_tirage()) = 100
       and internal.forge_fusion_nombre() = 3
       and internal.forge_rarete_suivante('mystique') = 'legendaire'
       and internal.forge_rarete_suivante('legendaire') is null
       and has_function_privilege('authenticated', 'public.fusionner_objets(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.fusionner_objets(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_pochette(integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_ma_boutique()', 'execute')
       and not has_function_privilege('authenticated', 'internal.forge_json(uuid)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000300')
     then '${OBJETS} objets divins installés' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-divin-fusion.sql", texte);
console.log(`.cache/a-coller-divin-fusion.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
