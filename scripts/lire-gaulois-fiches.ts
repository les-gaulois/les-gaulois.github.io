/**
 * Lit, avant la construction du site, les Gaulois des membres au pseudo public, pour l'image d'aperçu de leur fiche :
 *   npm run gaulois:fiches
 * Lancé par la GitHub Action (`.github/workflows/site.yml`, étape « Lire les Gaulois des fiches ») avec `SUPABASE_URL` et
 * `SUPABASE_SECRET_KEY` : l'étape « Construire le site », elle, n'a pas la clé de service. Écrit `.cache/gaulois-fiches.json`
 * (hors de Git et de `dist/`), rangé par empreinte et non par identifiant, que la construction relit par `gauloisDuCache`.
 * Sans réglage, sans la migration ou en cas de panne, le fichier n'est pas écrit (un ancien est retiré) : les fiches se
 * dessinent comme avant. Voir `src/lib/gaulois-joueurs.ts`.
 *
 * Depuis le 16 novembre 2026, la construction tire aussi de ce fichier l'image de chaque Gaulois, publiée sous
 * `/gaulois/<identifiant public>.png` et montrée à côté du pseudo sur les pages (`src/lib/gaulois-site.ts`).
 *
 * La même étape lit la bannière que ces membres montrent, pour leur ligne de la liste des membres (16 novembre 2026) :
 * `.cache/bannieres-membres.json`, de la même façon, relu par `bannieresDuCache` (`src/lib/bannieres-joueurs.ts`).
 *
 * Et la finition de carte qu'ils montrent, pour le podium de l'accueil (17 novembre 2026) : `.cache/finitions-membres.json`,
 * relu par `finitionsDuCache` (`src/lib/finitions-joueurs.ts`).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadMembers } from "../src/lib/data";
import { BANNIERES_MEMBRES_FILE, cacheDesBannieres, journalDesBannieres, lireBannieresDesJoueurs } from "../src/lib/bannieres-joueurs";
import { cacheDesFamiliers, FAMILIERS_MEMBRES_FILE, journalDesFamiliers, lireFamiliersDesJoueurs } from "../src/lib/familiers-joueurs";
import { cacheDesCadres, CADRES_MEMBRES_FILE, journalDesCadres, lireCadresDesJoueurs } from "../src/lib/cadres-joueurs";
import { cacheDesFinitions, FINITIONS_MEMBRES_FILE, journalDesFinitions, lireFinitionsDesJoueurs } from "../src/lib/finitions-joueurs";
import { cacheDesGaulois, GAULOIS_FICHES_FILE, journalDesGaulois, lireGauloisDesJoueurs } from "../src/lib/gaulois-joueurs";

// Jamais un ancien fichier : un membre suspendu depuis garderait son Gaulois sur sa fiche.
rmSync(GAULOIS_FICHES_FILE, { force: true });
rmSync(BANNIERES_MEMBRES_FILE, { force: true });
rmSync(FINITIONS_MEMBRES_FILE, { force: true });
rmSync(FAMILIERS_MEMBRES_FILE, { force: true });

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

// Les bannières de la liste des membres : une lecture à part, qu'une panne des Gaulois n'empêche pas.
const bannieres = await lireBannieresDesJoueurs(ids, process.env["SUPABASE_URL"], process.env["SUPABASE_SECRET_KEY"]);
const ligneDesBannieres = journalDesBannieres(bannieres);
if (ligneDesBannieres) console.log(ligneDesBannieres);

if (bannieres.etat === "lu") {
  mkdirSync(dirname(BANNIERES_MEMBRES_FILE), { recursive: true });
  writeFileSync(BANNIERES_MEMBRES_FILE, `${JSON.stringify(cacheDesBannieres(bannieres.bannieres, new Date()))}
`);
  console.log(`Bannières de la liste : ${bannieres.bannieres.size} bannière${bannieres.bannieres.size > 1 ? "s" : ""} pour ${ids.length} membres au pseudo public.`);
} else if (bannieres.etat === "panne") {
  process.exitCode = 1;
}

// Les finitions des cartes du podium : une lecture à part, qu'une panne des Gaulois ou des bannières n'empêche pas.
const finitions = await lireFinitionsDesJoueurs(ids, process.env["SUPABASE_URL"], process.env["SUPABASE_SECRET_KEY"]);
const ligneDesFinitions = journalDesFinitions(finitions);
if (ligneDesFinitions) console.log(ligneDesFinitions);

if (finitions.etat === "lu") {
  mkdirSync(dirname(FINITIONS_MEMBRES_FILE), { recursive: true });
  writeFileSync(FINITIONS_MEMBRES_FILE, `${JSON.stringify(cacheDesFinitions(finitions.finitions, new Date()))}\n`);
  console.log(`Finitions des cartes : ${finitions.finitions.size} finition${finitions.finitions.size > 1 ? "s" : ""} pour ${ids.length} membres au pseudo public.`);
} else if (finitions.etat === "panne") {
  process.exitCode = 1;
}

// Le familier des cartes : une lecture à part, elle aussi.
const familiers = await lireFamiliersDesJoueurs(ids, process.env["SUPABASE_URL"], process.env["SUPABASE_SECRET_KEY"]);
const ligneDesFamiliers = journalDesFamiliers(familiers);
if (ligneDesFamiliers) console.log(ligneDesFamiliers);

if (familiers.etat === "lu") {
  mkdirSync(dirname(FAMILIERS_MEMBRES_FILE), { recursive: true });
  writeFileSync(FAMILIERS_MEMBRES_FILE, JSON.stringify(cacheDesFamiliers(familiers.familiers, new Date())) + "\n");
  console.log(`Familiers des cartes : ${familiers.familiers.size} familier${familiers.familiers.size > 1 ? "s" : ""} pour ${ids.length} membres au pseudo public.`);
} else if (familiers.etat === "panne") {
  process.exitCode = 1;
}

// Les cadres des cartes (rayon « Cadres ») : une lecture à part, elle aussi.
const cadres = await lireCadresDesJoueurs(ids, process.env["SUPABASE_URL"], process.env["SUPABASE_SECRET_KEY"]);
const ligneDesCadres = journalDesCadres(cadres);
if (ligneDesCadres) console.log(ligneDesCadres);
if (cadres.etat === "lu") {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(CADRES_MEMBRES_FILE, `${JSON.stringify(cacheDesCadres(cadres.cadres, new Date()))}\n`);
  console.log(`Cadres des cartes : ${cadres.cadres.size} cadre${cadres.cadres.size > 1 ? "s" : ""} pour ${ids.length} membres au pseudo public.`);
} else if (cadres.etat === "panne") {
  process.exitCode = 1;
}
