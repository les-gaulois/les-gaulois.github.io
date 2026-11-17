/**
 * Écrit `.cache/a-coller-cartes-suite.sql` (hors de Git) : les deux migrations qui suivent le rayon « Cartes », en un seul
 * fichier à coller, dans une transaction, notées dans supabase_migrations.schema_migrations, avec une dernière ligne de
 * contrôle (docs/DIRECTION.md, « Le rayon Cartes ») : le familier sur la carte (20261117001400) et la finition dans la
 * vitrine (20261117001500). À relancer depuis la racine du dépôt après tout changement de l'une d'elles :
 * `npx tsx scripts/a-coller-cartes-suite.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOMS = ["20261117001400_familiers_des_joueurs", "20261117001500_vitrine_des_cartes"] as const;
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "suite des cartes : installée";

const entete = `-- LA SUITE DU RAYON « CARTES » (17 novembre 2026), à coller en un seul fichier.
-- Le familier d'un membre sur sa carte (accueil, fiche), et la finition de chaque Gaulois dans la vitrine.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient deux migrations, notées comme
-- appliquées : ${NOMS.join(".sql et ")}.sql. Il ajoute une fonction de lecture, réservée à la clé de service, et remplace
-- celle de la vitrine par la même, avec la finition de chaque Gaulois en plus. Il n'efface rien et ne touche aucune table,
-- aucun Gaulois, aucun familier, aucune finition ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose le rayon « Cartes » et le mode GOD déjà collés : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('internal.gaulois_montre(uuid)') is null or to_regprocedure('public.choisir_carte(text)') is null then
    raise exception 'Le rayon des cartes ou le mode GOD n''est pas installé : collez d''abord .cache/a-coller-cartes.sql. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001400', 'familiers_des_joueurs', array[]::text[]), ('20261117001500', 'vitrine_des_cartes', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la lecture des familiers répond et n'est ouverte qu'à la clé de service, la vitrine reste fermée aux
-- visiteurs, les deux migrations sont notées.
select 'suite des cartes : '
  || case when (public.familiers_des_joueurs(array[]::text[]) ->> 'ok')::boolean
       and has_function_privilege('service_role', 'public.familiers_des_joueurs(text[])', 'execute')
       and not has_function_privilege('anon', 'public.familiers_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.familiers_des_joueurs(text[])', 'execute')
       and has_function_privilege('authenticated', 'public.get_village()', 'execute')
       and not has_function_privilege('anon', 'public.get_village()', 'execute')
       and (select count(*) from supabase_migrations.schema_migrations where version in ('20261117001400', '20261117001500')) = 2
     then 'installée' else 'PAS INSTALLÉE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + NOMS.map(lire).join("\n\n") + fin;
writeFileSync(".cache/a-coller-cartes-suite.sql", texte);
console.log(`.cache/a-coller-cartes-suite.sql : ${texte.split("\n").length} lignes`);
