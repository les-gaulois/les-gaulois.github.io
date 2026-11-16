/**
 * Écrit `.cache/a-coller-bannieres-joueurs.sql` (hors de Git) : la migration des bannières de la liste des membres, seule,
 * dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle
 * (docs/DIRECTION.md, « La bannière sur la liste des membres »). À relancer depuis la racine du dépôt après tout changement
 * de la migration : `npx tsx scripts/a-coller-bannieres-joueurs.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261116000400_bannieres_des_joueurs";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "bannières de la liste : installées";

const entete = `-- LA BANNIÈRE SUR LA LISTE DES MEMBRES (16 novembre 2026), à coller en un seul fichier.
-- La ligne d'un membre qui a choisi une bannière pour son Gaulois la porte en fond, sur la page « Liste des membres ».
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une fonction de lecture, réservée à la clé de service. Il n'efface rien et ne touche
-- aucune table, aucun Gaulois, aucune bannière ni aucun statère. Collé une seconde fois, il ne change rien.
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
values ('20261116000400', 'bannieres_des_joueurs', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction répond, elle n'est ouverte qu'à la clé de service, la migration est notée.
select 'bannières de la liste : '
  || case when (public.bannieres_des_joueurs(array[]::text[]) ->> 'ok')::boolean
       and has_function_privilege('service_role', 'public.bannieres_des_joueurs(text[])', 'execute')
       and not has_function_privilege('anon', 'public.bannieres_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.bannieres_des_joueurs(text[])', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000400')
     then 'installées' else 'PAS INSTALLÉES' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-bannieres-joueurs.sql", texte);
console.log(`.cache/a-coller-bannieres-joueurs.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
