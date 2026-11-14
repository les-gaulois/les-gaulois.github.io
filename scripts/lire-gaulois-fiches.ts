/**
 * Lit, avant la construction du site, les Gaulois des membres au pseudo public, pour l'image d'aperçu de leur fiche :
 *   npm run gaulois:fiches
 * Lancé par la GitHub Action (`.github/workflows/site.yml`, étape « Lire les Gaulois des fiches ») avec `SUPABASE_URL` et
 * `SUPABASE_SECRET_KEY` : l'étape « Construire le site », elle, n'a pas la clé de service. Écrit `.cache/gaulois-fiches.json`
 * (hors de Git et de `dist/`), rangé par empreinte et non par identifiant, que la construction relit par `gauloisDuCache`.
 * Sans réglage, sans la migration ou en cas de panne, le fichier n'est pas écrit (un ancien est retiré) : les fiches se
 * dessinent comme avant. Voir `src/lib/gaulois-joueurs.ts`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadMembers } from "../src/lib/data";
import { cacheDesGaulois, GAULOIS_FICHES_FILE, journalDesGaulois, lireGauloisDesJoueurs } from "../src/lib/gaulois-joueurs";

// Jamais un ancien fichier : un membre suspendu depuis garderait son Gaulois sur sa fiche.
rmSync(GAULOIS_FICHES_FILE, { force: true });

const list = loadMembers();
if (!list) {
  console.log("Gaulois des fiches : aucune liste de membres collectée, rien à lire.");
  process.exit(0);
}

// Seuls les membres au pseudo public ont une fiche, et un identifiant dans la liste.
const ids = list.members.flatMap((member) => (member.username && member.publicId ? [member.publicId] : []));
const lecture = await lireGauloisDesJoueurs(ids, process.env["SUPABASE_URL"], process.env["SUPABASE_SECRET_KEY"]);
const ligne = journalDesGaulois(lecture);
if (ligne) console.log(ligne);

if (lecture.etat === "lu") {
  mkdirSync(dirname(GAULOIS_FICHES_FILE), { recursive: true });
  writeFileSync(GAULOIS_FICHES_FILE, `${JSON.stringify(cacheDesGaulois(lecture.gaulois, new Date()))}\n`);
  console.log(`Gaulois des fiches : ${lecture.gaulois.size} Gaulois pour ${ids.length} membres au pseudo public.`);
} else if (lecture.etat === "panne") {
  process.exitCode = 1;
}
