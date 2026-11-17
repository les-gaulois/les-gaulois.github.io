/**
 * Écrit `.cache/a-coller-cartes.sql` (hors de Git) : la migration du rayon « Cartes » de la boutique, seule, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle (docs/DIRECTION.md,
 * « Le rayon Cartes »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-cartes.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117001200_cartes_du_gaulois";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "rayon des cartes : installé";

const entete = `-- LE RAYON « CARTES » DE LA BOUTIQUE (17 novembre 2026), à coller en un seul fichier.
-- Trente-trois finitions pour la carte d'un membre, celle du podium en haut de l'accueil, au prix d'une bannière.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il ajoute deux tables, une colonne et quatre fonctions, et remplace la sauvegarde par la même
-- avec les finitions en plus. Il n'efface rien et ne touche aucun Gaulois, aucune bannière ni aucun statère. Collé une
-- seconde fois, il ne change rien.
-- Il suppose les bannières, les Gaulois uniques et le mode GOD déjà collés (en ligne depuis le 16 novembre 2026) : sinon,
-- il s'arrête sans rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regprocedure('internal.banniere_prix(text)') is null or to_regclass('internal.village_god') is null or to_regclass('internal.gaulois_modeles') is null then
    raise exception 'Les bannières, les Gaulois uniques ou le mode GOD ne sont pas installés. Rien n''a changé.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117001200', 'cartes_du_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les trente-trois finitions sont là, la lecture du site n'est ouverte qu'à la clé de service, la migration est notée.
select 'rayon des cartes : '
  || case when (select count(*) from internal.cartes) = 33
       and (public.cartes_des_joueurs(array[]::text[]) ->> 'ok')::boolean
       and has_function_privilege('service_role', 'public.cartes_des_joueurs(text[])', 'execute')
       and not has_function_privilege('anon', 'public.cartes_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.cartes_des_joueurs(text[])', 'execute')
       and has_function_privilege('authenticated', 'public.acheter_carte(text, integer)', 'execute')
       and not has_function_privilege('anon', 'public.acheter_carte(text, integer)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117001200')
     then 'installé' else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-cartes.sql", texte);
console.log(`.cache/a-coller-cartes.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
