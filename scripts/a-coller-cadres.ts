/**
 * Écrit `.cache/a-coller-cadres.sql` (hors de Git) : la migration du rayon « Cadres » (20261117001600), à coller en un
 * seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Le rayon Cadres »). À relancer depuis la racine du dépôt après tout changement de la
 * migration : `npx tsx scripts/a-coller-cadres.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001600_cadres_des_cartes";
const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "cadres : installés";

const entete = `-- LE RAYON « CADRES » (17 novembre 2026), à coller en un seul fichier.
-- Vingt-six cadres animés pour la carte des membres, vendus à la boutique au prix d'une bannière de leur rareté.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ajoute deux tables, une colonne et quatre fonctions, et remplace la sauvegarde par la même,
-- avec les cadres en plus. Il n'efface rien et ne touche aucun Gaulois, aucune finition ni aucun statère. Collé une
-- seconde fois, il ne change rien. Il suppose le rayon « Cartes » déjà collé : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.choisir_carte(text)') is null or to_regprocedure('internal.banniere_prix(text)') is null then
    raise exception 'Le rayon des cartes n''est pas installé : collez d''abord .cache/a-coller-cartes.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001600', 'cadres_des_cartes', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les vingt-six cadres sont là, la lecture pour le site n'est ouverte qu'à la clé de service, les achats
-- restent fermés aux visiteurs, la migration est notée.
select 'cadres : '
  || case when (select count(*) from internal.cadres) = 26
       and (public.cadres_des_joueurs(array[]::text[]) ->> 'ok')::boolean
       and has_function_privilege('service_role', 'public.cadres_des_joueurs(text[])', 'execute')
       and not has_function_privilege('anon', 'public.cadres_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.cadres_des_joueurs(text[])', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_cadre(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.acheter_cadre(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.get_mes_cadres()', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261117001600') = 1
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + sql + fin;
writeFileSync(".cache/a-coller-cadres.sql", texte);
console.log(`.cache/a-coller-cadres.sql : ${texte.split("\n").length} lignes`);
