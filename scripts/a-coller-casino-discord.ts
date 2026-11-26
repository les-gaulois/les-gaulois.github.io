/**
 * Écrit `.cache/a-coller-casino-discord.sql` (hors de Git) : la migration des gros gains du casino sur Discord
 * (20261126000100), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations,
 * avec une dernière ligne de contrôle (docs/DIRECTION.md, « Le casino des Gaulois »). À relancer depuis la racine du dépôt
 * après tout changement de la migration : `npx tsx scripts/a-coller-casino-discord.ts`. N'envoie rien et ne lit que le
 * dépôt. Pas de String.replace sur le SQL (piège du dollar double). `tests/unit/casino-discord-serveur.test.ts` colle ce
 * fichier deux fois sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOMS = ["20261126000100_casino_sur_discord"] as const;
export const ATTENDU = "casino sur Discord : installé";
export const FICHIER = ".cache/a-coller-casino-discord.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = NOMS.map((nom) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd()).join("\n\n");
  const entete = `-- LES GROS GAINS DU CASINO SUR DISCORD (26 novembre 2026), à coller en un seul fichier.
-- Chaque coup du casino qui gagne 1 000 statères ou plus est annoncé en image sur Discord, quelques minutes après (décision
-- du pilote : « 1 000 statères ou plus »). Seuls les coups joués après ce collage. Un salon « casino » se règle dans
-- Direction > Discord ; sans lui, les annonces suivent le salon des achats, puis celui des nouvelles.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOMS.join(".sql, ")}.sql. Il crée deux petites tables privées et trois fonctions, et ajoute « casino » aux
-- salons du robot. Il n'efface rien, ne touche aucune partie, aucune mise, aucun gain, ne crée aucun statère. Collé une
-- seconde fois, il ne change rien. Il suppose le casino et les salons du robot déjà installés : sinon, il s'arrête sans
-- rien changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.casino_parties') is null or to_regclass('internal.discord_salons') is null
     or to_regclass('internal.discord_salon_checks') is null or to_regclass('public.private_links') is null
     or to_regprocedure('internal.member_pseudo(uuid)') is null then
    raise exception 'Le casino des Gaulois ou les salons du robot ne sont pas installés. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261126000100', 'casino_sur_discord', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la file du casino se lit, le salon du casino est connu du robot, et la migration est notée.
select 'casino sur Discord : '
  || case when (public.casino_annonces_a_envoyer() ->> 'ok') = 'true'
       and public.robot_discord_salons() ? 'casino'
       and (select count(*) from internal.casino_annonces_depart) = 1
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261126000100') = 1
     then 'installé'
     else 'PAS INSTALLÉ' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino-discord.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
