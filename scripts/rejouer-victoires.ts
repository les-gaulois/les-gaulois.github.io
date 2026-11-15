/**
 * Rejoue chaque victoire que le passage va annoncer avec le moteur d'OpenFront, pour sa carte de fin (demande du pilote du
 * 15 novembre 2026 : « l'image de la map en fin game »). Lancé par le job « rejouer » de `.github/workflows/victoires.yml`,
 * avant l'envoi, dans un job sans aucun secret. Ce script exécute le code du jeu, lu sur GitHub au commit de la partie : dans
 * l'Action, seulement dans un conteneur sans réseau ni droits (`commandeIsolee`), et jamais sans lui. Sur un ordinateur, il le
 * lance directement, ce que le pilote a accepté.
 *   npm run victoires:rejouer
 *   npm run victoires:rejouer -- --partie <identifiant>   (une partie précise, pour essayer)
 *
 * Pour chaque victoire, dans l'ordre de l'envoi (`victoriesToAnnounce`) : la fiche de la partie avec toutes ses étapes
 * (`/public/game/:id?turns=true`), le moteur de sa version (construit une fois par version, gardé dans le cache du workflow),
 * les fichiers de sa carte au même commit, puis le rejeu, arrêté à la dernière empreinte de la fiche. Toutes les empreintes
 * doivent concorder : sinon, pas de carte. Le résultat va dans `.cache/cartes-finales/`, que l'envoi récupère et vérifie
 * (`src/lib/carte-finale.ts`), avec la liste des parties vues (`passage.json`) : une victoire que ce passage n'a pas vue attend
 * le suivant, au plus `WAIT_FINAL_MS` après la fin de la partie. Si ce script s'arrête en route, rien n'attend. Rien n'est
 * écrit dans le dépôt.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { clan } from "../config/clan";
import { lireEtatFinal, MAX_OCTETS_CASES, MAX_OCTETS_DESCRIPTION } from "../src/lib/carte-finale";
import { loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { mapKey } from "../src/lib/map-names";
import { ApiClient } from "../src/lib/pipeline";
import { DOSSIER_CARTES, dossierDeCarte, FicheDePartie, FICHIER_PASSAGE, fichiersDeLaPartie, NOTICE_DES_CARTES, noticeDesCartes, type PassageDuRejeu } from "../src/lib/rejeu-openfront";
import { parseNoted } from "../src/lib/salon-discord";
import { mergeStates, parseResend, passSessions, readRecentSessions, VictoryState, victoriesToAnnounce } from "../src/lib/victoires";
import { construireMoteur, FicheInattendue, lancerMoteur, lireCarte, lireFiche, message, type Moteur, RACINE, rangerCartes, rangerMoteurs, sleep, TropLong } from "./rejeu-commun";

/** Le job a 12 minutes : le rejeu s'arrête de commencer des parties au bout de 7, et une partie n'en prend jamais plus de 4. */
const BUDGET_MS = 7 * 60_000;
const PAR_PARTIE_MS = 4 * 60_000;

const debut = Date.now();
const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Rejoue une partie. Renvoie `true` si elle est vue (rejouée, ou impossible à rejouer pour de bon), `false` pour réessayer. */
async function rejouer(partie: string, moteurs: Map<string, Promise<Moteur>>, commits: Set<string>): Promise<boolean> {
  const sortie = fichiersDeLaPartie(partie);
  if (!sortie) return true;
  let fiche: { texte: string; fiche: FicheDePartie };
  try {
    fiche = await lireFiche(partie);
  } catch (e) {
    if (e instanceof FicheInattendue) {
      console.log(`::warning::Rejeu : la fiche de la partie ${partie} ne sert pas (${message(e)}). La victoire part avec la vignette de la carte.`);
      return true;
    }
    console.log(`Rejeu : la fiche de la partie ${partie} ne se lit pas (${message(e)}). Nouvel essai au prochain passage.`);
    return false;
  }
  const { gitCommit: commit, info } = fiche.fiche;
  let moteur: Moteur;
  try {
    if (!moteurs.has(commit)) moteurs.set(commit, construireMoteur(commit));
    moteur = await moteurs.get(commit)!;
  } catch (e) {
    console.log(`::warning::Rejeu : le moteur de la version ${commit.slice(0, 8)} du jeu ne se construit pas (${message(e)}). La victoire part avec la vignette de la carte.`);
    return true;
  }
  const dossierCarte = (moteur.noms ? dossierDeCarte(moteur.noms, info.config.gameMap) : null) ?? mapKey(info.config.gameMap);
  let carte: string;
  try {
    if (!/^[a-z0-9]{1,60}$/.test(dossierCarte)) throw new Error("nom de carte inattendu");
    carte = await lireCarte(commit, dossierCarte, info.config.gameMapSize);
  } catch (e) {
    console.log(`::warning::Rejeu : les fichiers de la carte ${info.config.gameMap} ne se lisent pas (${message(e)}). La victoire part avec la vignette.`);
    return true;
  }
  const travail = resolve(RACINE, "travail", partie);
  rmSync(travail, { recursive: true, force: true });
  mkdirSync(join(travail, "sortie"), { recursive: true });
  const ficheChemin = join(travail, "fiche.json");
  writeFileSync(ficheChemin, fiche.texte);
  const t0 = Date.now();
  const limite = Math.min(PAR_PARTIE_MS, Math.max(30_000, BUDGET_MS + 60_000 - (Date.now() - debut)));
  try {
    await lancerMoteur(moteur.fichier, ficheChemin, carte, join(travail, "sortie"), partie, limite);
    const metaChemin = join(travail, "sortie", "etat.json");
    const casesChemin = join(travail, "sortie", "etat.bin.gz");
    // Ce que le conteneur laisse vient du code du jeu : de vrais fichiers, à la taille attendue, avant même d'être lus.
    for (const [chemin, max] of [[metaChemin, MAX_OCTETS_DESCRIPTION], [casesChemin, MAX_OCTETS_CASES]] as const) {
      const info = lstatSync(chemin);
      if (!info.isFile() || info.size > max) throw new Error("sortie du moteur inattendue");
    }
    const meta = readFileSync(metaChemin, "utf8");
    const cases = readFileSync(casesChemin);
    // Relu comme l'envoi le relira : un fichier qui ne passerait pas n'est pas transmis.
    const etat = lireEtatFinal(meta, cases, partie);
    renameSync(metaChemin, sortie.meta);
    renameSync(casesChemin, sortie.cases);
    commits.add(commit);
    console.log(`Rejeu : partie ${partie} (${info.config.gameMap}) rejouée en ${Math.round((Date.now() - t0) / 1000)} s, ${etat.empreintes} empreintes du jeu retrouvées.`);
  } catch (e) {
    // Coupée parce que le passage n'avait plus le temps, pas parce qu'elle est trop longue : elle repasse en premier au suivant.
    if (e instanceof TropLong && limite < PAR_PARTIE_MS) {
      console.log(`Rejeu : plus le temps de finir la partie ${partie}, elle sera rejouée au prochain passage.`);
      return false;
    }
    console.log(`::warning::Rejeu : la partie ${partie} ne se rejoue pas (${message(e)}). La victoire part avec la vignette de la carte.`);
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
  return true;
}

mkdirSync(DOSSIER_CARTES, { recursive: true });
const vues: string[] = [];
const commits = new Set<string>();
const noterPassage = (fini: boolean) => {
  writeFileSync(FICHIER_PASSAGE, `${JSON.stringify({ format: 1, fini, vues } satisfies PassageDuRejeu)}\n`);
  // Les cases du terrain viennent des cartes du jeu, sous CC BY-SA : l'artefact public dit d'où, sous quelle licence, et ce qui a changé.
  writeFileSync(NOTICE_DES_CARTES, noticeDesCartes([...commits], aujourdhui()));
};
noterPassage(false);

const demandee = process.argv.indexOf("--partie");
let parties: string[];
if (demandee >= 0) {
  parties = [process.argv[demandee + 1] ?? ""];
} else {
  // Les mêmes victoires que l'envoi, dans le même ordre : l'état noté (et sa copie en cache), les sessions des dernières heures.
  const cached = parseNoted(VictoryState, readText(".cache/victoires-envoi.json"), "elle est ignorée").state;
  const stored = mergeStates(parseNoted(VictoryState, readText("data/victoires-envoi.json"), "rien n'est rejoué").state, cached);
  const { games: resend } = parseResend(readText("config/victoires-rattrapage.json"));
  const now = new Date();
  let fresh = null;
  try {
    fresh = await readRecentSessions(new ApiClient({ fetch, sleep, delayMs: 300 }), clan.tag, now);
  } catch (e) {
    console.log(`Rejeu : sessions des dernières heures illisibles (${message(e)}).`);
  }
  const { sessions } = passSessions(unreadableSessionFiles().length > 0 ? null : loadSessions(), fresh);
  parties = victoriesToAnnounce(stored, sessions, now, resend).map((s) => s.gameId);
}

const moteurs = new Map<string, Promise<Moteur>>();
let faites = 0;
for (const partie of parties) {
  if (Date.now() - debut > BUDGET_MS) {
    const reste = parties.length - faites;
    console.log(`Rejeu : temps écoulé, ${reste > 1 ? `${reste} victoires attendent` : "1 victoire attend"} le passage suivant.`);
    break;
  }
  if (await rejouer(partie, moteurs, commits)) vues.push(partie);
  faites++;
  noterPassage(false);
}
if (parties.length === 0) console.log("Rejeu : aucune victoire à rejouer.");
rangerMoteurs();
rangerCartes();
noterPassage(true);
