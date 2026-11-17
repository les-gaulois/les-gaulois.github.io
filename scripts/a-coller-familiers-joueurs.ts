/**
 * Écrit `.cache/a-coller-familiers-joueurs.sql` (hors de Git) : la migration du familier sur la carte, seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Le rayon Cartes »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-familiers-joueurs.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001400_familiers_des_joueurs";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "familiers des cartes : installés";

const entete = `-- LE FAMILIER SUR LA CARTE DU MEMBRE (17 novembre 2026), à coller en un seul fichier.
-- La carte d'un membre, sur l'accueil et sur sa fiche, montre le familier qu'il montre à côté de son Gaulois.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute une fonction de lecture, réservée à la clé de service. Il n'efface rien et ne touche
-- aucune table, aucun Gaulois, aucun familier ni aucun statère. Collé une seconde fois, il ne change rien.
-- Il suppose les familiers et le mode GOD déjà collés (en ligne depuis le 16 novembre 2026) : sinon, il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('internal.gaulois_montre(uuid)') is null then
    raise exception 'Le mode GOD du village n''est pas installé. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001400', 'familiers_des_joueurs', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction répond, elle n'est ouverte qu'à la clé de service, la migration est notée.
select 'familiers des cartes : '
  || case when (public.familiers_des_joueurs(array[]::text[]) ->> 'ok')::boolean
       and has_function_privilege('service_role', 'public.familiers_des_joueurs(text[])', 'execute')
       and not has_function_privilege('anon', 'public.familiers_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.familiers_des_joueurs(text[])', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117001400')
     then 'installés' else 'PAS INSTALLÉS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-familiers-joueurs.sql", texte);
console.log(`.cache/a-coller-familiers-joueurs.sql : ${texte.split("\n").length} lignes`);
