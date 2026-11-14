/**
 * Écrit `.cache/a-coller-village.sql` (hors de Git) : les migrations du village des Gaulois après la 001700, dans l'ordre, en
 * un seul fichier que le pilote colle dans l'éditeur SQL de Supabase (docs/DIRECTION.md, « Le village des Gaulois »). À
 * relancer depuis la racine du dépôt après tout changement d'une de ces migrations : `npx tsx scripts/a-coller-village.ts`.
 * N'envoie rien et ne lit que le dépôt.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const DOSSIER = "supabase/migrations";
const noms = readdirSync(DOSSIER)
  .filter((n) => /^202611130(018|019|020|021|022|023|024)00_village_.*\.sql$/.test(n))
  .sort();
if (noms.length !== 7) throw new Error(`7 migrations attendues, ${noms.length} trouvées : ${noms.join(", ")}`);

const FONCTIONS = [
  "get_mes_stateres", "noter_victoires_stateres", "stateres_parties_notees",
  "get_ma_boutique", "acheter_objet", "ouvrir_pochette",
  "get_marche", "mettre_en_vente", "retirer_offre", "acheter_offre", "get_village",
  "get_village_economie", "regler_village_prix", "regler_village_pochette",
  "vie_du_village_travail", "noter_vie_du_village", "get_vie_du_village", "regler_bulles_du_village", "regler_plafond_du_village",
];
const TABLES = [
  "stateres_victoires", "stateres_presences", "stateres_mouvements", "stateres_soldes", "stateres_suspensions", "stateres_releve",
  "village_prix", "village_pochette", "gaulois_inventaire", "marche_offres",
  "village_vie_reglage", "village_vie_depense", "village_vie",
];
const liste = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

const entete = `-- LE VILLAGE DES GAULOIS : la suite du vestiaire, en un seul fichier à coller.
-- Statères, boutique et pochette surprise, marché et place, onglet Village de la Direction, sauvegarde, vie du village.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il réunit, dans l'ordre :
${noms.map((n) => `--   ${n}`).join("\n")}
-- Il n'efface rien et ne touche aucune donnée existante. Collé une seconde fois, il ne change rien.
-- Ne jamais coller un de ces fichiers seul après coup : il remettrait en place d'anciennes fonctions.
-- La dernière ligne doit dire : « village : ${FONCTIONS.length} fonctions sur ${FONCTIONS.length}, ${TABLES.length} tables sur ${TABLES.length} ».
`;
const corps = noms.map((n) => `\n-- ==================== ${n} ====================\n\n${readFileSync(`${DOSSIER}/${n}`, "utf8").replace(/\r\n/g, "\n").trimEnd()}\n`).join("\n;\n");
const fin = `
;
-- Le contrôle : ce que ce fichier devait installer est-il là ?
select 'village : '
  || (select count(distinct p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in (${liste(FONCTIONS)}))
  || ' fonctions sur ${FONCTIONS.length}, '
  || (select count(*) from pg_tables t where t.schemaname = 'internal' and t.tablename in (${liste(TABLES)}))
  || ' tables sur ${TABLES.length}' as controle;
`;
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/a-coller-village.sql", entete + corps + fin);
console.log(`.cache/a-coller-village.sql : ${noms.length} migrations, ${(entete + corps + fin).split("\n").length} lignes`);
