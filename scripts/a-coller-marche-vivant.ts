/**
 * Écrit `.cache/a-coller-marche-vivant.sql` (hors de Git) : la migration de la boutique tournante et des demandes d'achat
 * (20261119000100), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle (docs/DIRECTION.md, « La boutique tournante et les demandes d'achat »). À relancer depuis la
 * racine du dépôt après tout changement de la migration : `npx tsx scripts/a-coller-marche-vivant.ts`. N'envoie rien et ne
 * lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261119000100_marche_tournant_et_demandes";
const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "marché : installé";

const entete = `-- LE MARCHÉ QUI VIT (19 novembre 2026), à coller en un seul fichier.
-- La boutique tournante (un tiers des objets en rayon chaque semaine, changement le mardi à 21 h 30), les demandes d'achat
-- (statères mis de côté), et la lecture des nouvelles offres et demandes pour le robot Discord.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il ajoute une table et seize fonctions, et remplace six fonctions par les mêmes, avec leurs
-- ajouts (dont la sauvegarde, en version 12). Il n'efface rien et ne touche aucun Gaulois, aucun objet ni aucun statère.
-- Collé une seconde fois, il ne change rien. Il suppose le rayon « Cadres » déjà collé : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('public.acheter_cadre(text, integer)') is null or to_regprocedure('public.revendre_objet(text, text, integer)') is null then
    raise exception 'Le rayon des cadres ou la revente au jeu ne sont pas installés : collez-les d''abord. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261119000100', 'marche_tournant_et_demandes', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la rotation répond, les demandes sont fermées aux visiteurs, la lecture du robot n'est ouverte qu'à la clé de
-- service, la sauvegarde est en version 12, la migration est notée.
select 'marché : '
  || case when (select count(distinct t.tour) from internal.boutique_tours_des_objets() t) = 3
       and to_regclass('internal.marche_demandes') is not null
       and has_function_privilege('authenticated', 'public.poser_demande(text, text, numeric)', 'execute')
       and not has_function_privilege('anon', 'public.poser_demande(text, text, numeric)', 'execute')
       and has_function_privilege('authenticated', 'public.servir_demande(bigint)', 'execute')
       and not has_function_privilege('anon', 'public.servir_demande(bigint)', 'execute')
       and has_function_privilege('authenticated', 'public.get_boutique_tournante()', 'execute')
       and not has_function_privilege('anon', 'public.get_boutique_tournante()', 'execute')
       and has_function_privilege('service_role', 'public.annonces_du_marche(bigint, bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.annonces_du_marche(bigint, bigint)', 'execute')
       and (public.annonces_du_marche(null, null) ->> 'ok')::boolean
       and (public.export_site() ->> 'version')::integer = 12
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261119000100') = 1
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + sql + fin;
writeFileSync(".cache/a-coller-marche-vivant.sql", texte);
console.log(`.cache/a-coller-marche-vivant.sql : ${texte.split("\n").length} lignes`);
