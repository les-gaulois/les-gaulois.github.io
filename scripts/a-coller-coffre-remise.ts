/**
 * Écrit `.cache/a-coller-coffre-remise.sql` (hors de Git) : la migration de la remise des essais du coffre, dans une
 * transaction, notée dans supabase_migrations.schema_migrations, puis la remise elle-même, demandée par le pilote le
 * 17 novembre 2026 (30 essais par membre, et le compte du jour qui repart), et une dernière ligne de contrôle
 * (docs/DIRECTION.md, « Le coffre du druide »). Depuis la racine du dépôt : `npx tsx scripts/a-coller-coffre-remise.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000500_coffre_remise_des_essais";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ESSAIS = 30;
/** Le total du jour pour tout le serveur : 300 ne laissait jouer que dix membres à 30 essais. */
const TOTAL = 900;

const entete = `-- LA REMISE DES ESSAIS DU COFFRE (17 novembre 2026), à coller en un seul fichier.
-- Tout le monde retrouve ${ESSAIS} essais aujourd'hui, et le compte du jour de tout le serveur repart aussi.
-- Les ${ESSAIS} essais par membre restent les jours suivants (le double le soir de veillée, comme avant). Le total du jour de
-- tout le serveur passe à ${TOTAL} s'il était plus bas, pour que ${ESSAIS} essais chacun tiennent ; le plafond de 150 dollars reste.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée, puis la remise. Il ajoute une colonne et refait une fonction. Il n'efface rien : les essais déjà
-- faits, la manche en cours, la cagnotte et la dépense comptée restent tels quels. Le robot en ligne continue de marcher.
-- Collé une seconde fois, il rend de nouveau leurs essais à tous.
-- La dernière ligne doit dire : « coffre : essais remis, ${ESSAIS} par membre ».

begin;

-- La fonction refaite s'appuie sur la mise de 10 statères : sans elle, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000100') then
    raise exception 'Il faut d''abord coller .cache/a-coller-coffre-garde.sql (migration 20261117000100).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000500', 'coffre_remise_des_essais', array[]::text[])
on conflict (version) do nothing;

-- La remise : ${ESSAIS} essais par membre et par jour, comptés à partir de maintenant pour aujourd'hui.
update internal.coffre_reglages
set essais_par_membre = ${ESSAIS}, essais_par_jour = greatest(essais_par_jour, ${TOTAL}), essais_depuis = now() where id;

commit;

select 'coffre : '
  || case when (select essais_par_membre = ${ESSAIS} and essais_depuis > now() - interval '5 minutes' from internal.coffre_reglages)
       and not has_function_privilege('anon', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and has_function_privilege('service_role', 'public.coffre_ouvrir(text, text, text, text, integer)', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000500')
     then 'essais remis, ${ESSAIS} par membre' else 'PAS REMIS' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + migration + fin;
writeFileSync(".cache/a-coller-coffre-remise.sql", texte);
console.log(`.cache/a-coller-coffre-remise.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(migration.match(/\$\$/g) ?? []).length})`);
