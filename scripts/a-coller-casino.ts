/**
 * Écrit `.cache/a-coller-casino.sql` (hors de Git) : la migration du casino des Gaulois (20261123000100), à coller en un
 * seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec une dernière ligne de contrôle
 * (docs/DIRECTION.md, « Le casino des Gaulois »). À relancer depuis la racine du dépôt après tout changement de la
 * migration : `npx tsx scripts/a-coller-casino.ts`. N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le
 * SQL : « $$ » y deviendrait « $ » (piège du dollar double). `tests/unit/casino-serveur.test.ts` colle ce fichier deux fois
 * sur le banc PGlite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const NOMS = ["20261123000100_casino_des_gaulois"] as const;
export const ATTENDU = "casino des Gaulois : installé, ouvert";
export const FICHIER = ".cache/a-coller-casino.sql";

/** Le texte du fichier à coller. */
export function texteAColler(): string {
  const sql = NOMS.map((nom) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd()).join("\n\n");
  const entete = `-- LE CASINO DES GAULOIS (22 novembre 2026), à coller en un seul fichier.
-- Le serveur des six jeux de « Mon Gaulois » : la roue du charron, le vingt-et-un, la machine du forgeron, la course des
-- familiers, la palissade et les dés. Il tire tout, prend chaque mise au journal des statères, rend chaque gain, tient le
-- plafond de 2 000 statères misés par jour et par compte. Il est OUVERT à tous les comptes validés dès qu'il est collé.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOMS.join(".sql, ")}.sql. Il ajoute trois tables et les fonctions du casino. Il ne remplace aucune
-- fonction existante, n'efface rien, ne retire ni ne change aucune ligne, ne crée aucun statère. Collé une seconde fois,
-- il ne change rien. Il suppose le village, ses statères et le mode GOD déjà installés : sinon, il s'arrête sans rien
-- changer.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

do $$
begin
  if to_regclass('internal.stateres_mouvements') is null or to_regclass('internal.stateres_soldes') is null
     or to_regclass('internal.gaulois') is null or to_regclass('internal.village_god') is null
     or to_regprocedure('internal.village_acheteur()') is null or to_regprocedure('internal.village_verrou(uuid)') is null
     or to_regprocedure('internal.village_debiter(uuid, text, integer, text)') is null
     or to_regprocedure('internal.crediter_stateres(uuid)') is null or to_regprocedure('internal.limit_exceeded(integer)') is null then
    raise exception 'Le village, ses statères ou le mode GOD ne sont pas installés. Rien n''a changé.';
  end if;
end $$;

`;
  const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261123000100', 'casino_des_gaulois', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : les tables et les neuf fonctions du casino sont là, la migration est notée ; puis l'interrupteur.
select 'casino des Gaulois : '
  || case when to_regclass('internal.casino_parties') is not null and to_regclass('internal.casino_mains') is not null
       and to_regprocedure('public.get_casino()') is not null and to_regprocedure('public.lire_vingt_et_un()') is not null
       and to_regprocedure('public.jouer_roue(jsonb)') is not null and to_regprocedure('public.jouer_machine(integer)') is not null
       and to_regprocedure('public.jouer_course(integer, integer)') is not null and to_regprocedure('public.jouer_palissade(integer)') is not null
       and to_regprocedure('public.jouer_des(jsonb)') is not null and to_regprocedure('public.distribuer_vingt_et_un(integer)') is not null
       and to_regprocedure('public.jouer_vingt_et_un(bigint, integer, text)') is not null
       and (select count(*) from supabase_migrations.schema_migrations where version = '20261123000100') = 1
     then 'installé, ' || case when (select o.ouvert from internal.casino_ouvert o where o.id) then 'ouvert' else 'fermé' end
     else 'PAS INSTALLÉ' end as controle;
`;
  return entete + sql + fin;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/a-coller-casino.ts")) {
  mkdirSync(".cache", { recursive: true });
  const texte = texteAColler();
  writeFileSync(FICHIER, texte);
  console.log(`${FICHIER} : ${texte.split("\n").length} lignes`);
}
