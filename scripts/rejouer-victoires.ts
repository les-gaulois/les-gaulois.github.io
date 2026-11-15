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
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { clan } from "../config/clan";
import { lireEtatFinal, MAX_OCTETS_CASES, MAX_OCTETS_DESCRIPTION } from "../src/lib/carte-finale";
import { loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { mapKey } from "../src/lib/map-names";
import { API_BASE, ApiClient } from "../src/lib/pipeline";
import {
  commandeIsolee,
  DOSSIER_CARTES,
  dossierDeCarte,
  FicheDePartie,
  FICHIER_PASSAGE,
  FICHIERS_BRUTS,
  fichiersDeCarte,
  fichiersDeLaPartie,
  IMAGE_DU_MOTEUR,
  MAX_OCTETS_CARTE,
  MAX_OCTETS_FICHE,
  MEMOIRE_DU_MOTEUR_MO,
  MOTIFS_DU_MOTEUR,
  NOMS_DES_CARTES,
  NOTICE_DES_CARTES,
  noticeDesCartes,
  OPENFRONT_DEPOT,
  PAQUETS_DU_MOTEUR,
  verrouDuMoteur,
  type PassageDuRejeu,
} from "../src/lib/rejeu-openfront";
import { parseNoted } from "../src/lib/salon-discord";
import { mergeStates, parseResend, passSessions, readRecentSessions, VictoryState, victoriesToAnnounce } from "../src/lib/victoires";

const RACINE = ".cache/openfront";
/** Gardé par le cache du workflow : un moteur par version du jeu, construit une fois. */
const MOTEURS = `${RACINE}/moteurs`;
const MOTEURS_GARDES = 3;
/** Le job a 12 minutes : le rejeu s'arrête de commencer des parties au bout de 7, et une partie n'en prend jamais plus de 4. */
const BUDGET_MS = 7 * 60_000;
const PAR_PARTIE_MS = 4 * 60_000;
/** Dans l'Action, le moteur ne tourne que dans son conteneur. */
const ISOLE = process.env.GITHUB_ACTIONS === "true";

const debut = Date.now();
const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Une commande arrêtée parce qu'elle a dépassé son délai, et pour aucune autre raison. */
class TropLong extends Error {}

/**
 * Lance une commande sans shell (sauf npm sous Windows), et lève une erreur si elle échoue ou dépasse son délai. `arreter` :
 * ce qu'il faut faire en plus au délai (un conteneur ne s'arrête pas avec la commande qui l'a lancé).
 */
function lancer(commande: string, args: readonly string[], limiteMs: number, options: { env?: NodeJS.ProcessEnv; arreter?: () => void } = {}): Promise<void> {
  return new Promise((ok, ko) => {
    const enfant = spawn(commande, args, { env: options.env ?? process.env, stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" && commande === "npm" });
    let erreur = "";
    let depasse = false;
    enfant.stderr.on("data", (d: Buffer) => {
      erreur = (erreur + d.toString()).slice(-2_000);
    });
    const minuterie = setTimeout(() => {
      depasse = true;
      options.arreter?.();
      enfant.kill("SIGKILL");
    }, limiteMs);
    enfant.on("error", (e) => {
      clearTimeout(minuterie);
      ko(e);
    });
    enfant.on("close", (code, signal) => {
      clearTimeout(minuterie);
      if (code === 0) ok();
      else if (depasse) ko(new TropLong(`${commande} : trop long`));
      else ko(new Error(`${commande} : ${signal ? `arrêté (${signal})` : `code ${code}`} ${erreur.trim().split("\n").pop() ?? ""}`.trim()));
    });
  });
}

/* ---------- Le moteur d'une version du jeu ---------- */

interface Moteur {
  fichier: string;
  /** Le fichier où le jeu nomme ses cartes, à cette version. `null` : absent. */
  noms: string | null;
}

/**
 * Construit le moteur d'une version du jeu : le code de `packages/` au commit de la partie, lu sur GitHub sans les cartes ni le
 * client ; ses bibliothèques telles que le jeu les a verrouillées, installées par `npm ci` qui vérifie leur empreinte, sans
 * leurs scripts d'installation ; puis un seul fichier, avec `scripts/rejeu-openfront/entree.ts`. Rien de ce code n'est exécuté
 * ici. Gardé dans `MOTEURS` pour les parties suivantes de la même version.
 */
async function construireMoteur(commit: string): Promise<Moteur> {
  const fichier = `${MOTEURS}/${commit}.mjs`;
  const noms = `${MOTEURS}/${commit}.cartes.txt`;
  if (existsSync(fichier)) return { fichier, noms: readText(noms) };
  const dossier = resolve(RACINE, "construction");
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(dossier, { recursive: true });
  try {
    await lancer("git", ["init", "-q", dossier], 30_000);
    await lancer("git", ["-C", dossier, "remote", "add", "origin", OPENFRONT_DEPOT], 30_000);
    await lancer("git", ["-C", dossier, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", commit], 60_000);
    await lancer("git", ["-C", dossier, "config", "core.sparseCheckout", "true"], 30_000);
    writeFileSync(join(dossier, ".git", "info", "sparse-checkout"), `${MOTIFS_DU_MOTEUR.join("\n")}\n`);
    await lancer("git", ["-C", dossier, "checkout", "-q", "--detach", "FETCH_HEAD"], 90_000);
    const { paquet, verrou } = verrouDuMoteur(
      PAQUETS_DU_MOTEUR.map((p) => readFileSync(join(dossier, "packages", p, "package.json"), "utf8")),
      readFileSync(join(dossier, "package-lock.json"), "utf8"),
    );
    writeFileSync(join(dossier, "package.json"), `${JSON.stringify(paquet, null, 2)}\n`);
    writeFileSync(join(dossier, "package-lock.json"), `${JSON.stringify(verrou, null, 2)}\n`);
    await lancer("npm", ["ci", "--prefix", dossier, "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], 90_000);
    const { build } = await import("esbuild");
    mkdirSync(MOTEURS, { recursive: true });
    const paquetDuJeu = (nom: string) => join(dossier, "packages", nom, "src");
    await build({
      entryPoints: [resolve("scripts/rejeu-openfront/entree.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      outfile: `${fichier}.partiel`,
      // Les réglages du jeu (décorateurs, champs de classe) : le moteur doit se comporter comme dans le jeu.
      tsconfig: join(dossier, "tsconfig.base.json"),
      alias: { ...Object.fromEntries(PAQUETS_DU_MOTEUR.map((p) => [`@openfront/${p}`, paquetDuJeu(p)])), resources: join(dossier, "resources") },
      logLevel: "silent",
    });
    renameSync(`${fichier}.partiel`, fichier);
    const texte = readText(join(dossier, NOMS_DES_CARTES));
    if (texte) writeFileSync(noms, texte);
    return { fichier, noms: texte };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Ne garde que les moteurs des dernières versions : le cache du workflow ne grossit pas. */
function rangerMoteurs() {
  if (!existsSync(MOTEURS)) return;
  const moteurs = readdirSync(MOTEURS)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => ({ f, t: statSync(join(MOTEURS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of moteurs.slice(MOTEURS_GARDES)) {
    rmSync(join(MOTEURS, f), { force: true });
    rmSync(join(MOTEURS, f.replace(/\.mjs$/, ".cartes.txt")), { force: true });
  }
}

/* ---------- Les fichiers d'une partie ---------- */

/** Une réponse HTTP refusée, avec son code. */
class Refus extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
/** Un fichier plus lourd que permis : le relire ne changera rien. */
class TropLourd extends Error {}

async function lireOctets(url: string, max: number, limiteMs: number): Promise<Buffer> {
  const reponse = await fetch(url, { headers: { "User-Agent": "GAL-clan-site/1.0" }, redirect: "error", signal: AbortSignal.timeout(limiteMs) });
  if (!reponse.ok) throw new Refus(reponse.status);
  if (Number(reponse.headers.get("content-length") ?? 0) > max) throw new TropLourd("fichier trop lourd");
  const octets = Buffer.from(await reponse.arrayBuffer());
  if (octets.length > max) throw new TropLourd("fichier trop lourd");
  if (octets.length === 0) throw new Error("fichier vide");
  return octets;
}

/** Une fiche lue mais inutilisable, ou refusée pour de bon : la relire ne changera rien. */
class FicheInattendue extends Error {}

/**
 * La fiche de la partie, avec toutes ses étapes, en deux essais. Une fiche introuvable (404) peut ne pas être encore archivée :
 * elle sera relue au passage suivant. Un autre refus, une fiche trop lourde ou au mauvais format ne servira jamais.
 */
async function lireFiche(partie: string): Promise<{ texte: string; fiche: FicheDePartie }> {
  let derniere: unknown = null;
  for (let essai = 0; essai < 2; essai++) {
    if (essai > 0) await sleep(3_000);
    let texte: string;
    try {
      texte = (await lireOctets(`${API_BASE}/game/${encodeURIComponent(partie)}?turns=true`, MAX_OCTETS_FICHE, 60_000)).toString("utf8");
    } catch (e) {
      if (e instanceof TropLourd) throw new FicheInattendue(e.message);
      if (e instanceof Refus && e.status !== 404 && e.status !== 429 && e.status < 500) throw new FicheInattendue(e.message);
      derniere = e;
      continue;
    }
    let fiche: FicheDePartie;
    try {
      fiche = FicheDePartie.parse(JSON.parse(texte));
    } catch {
      throw new FicheInattendue("fiche au format inattendu");
    }
    if (fiche.info.gameID !== partie) throw new FicheInattendue("fiche d'une autre partie");
    return { texte, fiche };
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere));
}

/** Les fichiers de la carte au commit de la partie, dans un dossier à elle. */
async function lireCarte(commit: string, dossierCarte: string, taille: "Normal" | "Compact"): Promise<string> {
  const dossier = resolve(RACINE, "cartes", commit, `${dossierCarte}-${taille}`);
  mkdirSync(dossier, { recursive: true });
  for (const nom of fichiersDeCarte(taille)) {
    const chemin = join(dossier, nom);
    if (existsSync(chemin)) continue;
    const octets = await lireOctets(`${FICHIERS_BRUTS}/${commit}/resources/maps/${dossierCarte}/${nom}`, MAX_OCTETS_CARTE, 60_000);
    writeFileSync(`${chemin}.partiel`, octets);
    renameSync(`${chemin}.partiel`, chemin);
  }
  return dossier;
}

/* ---------- Le rejeu ---------- */

/** L'image du conteneur, tirée une fois par passage. `null` : pas encore tirée ; une erreur : impossible, rien ne se rejoue. */
let imagePrete: Promise<void> | null = null;

/**
 * Lance le moteur sur une partie : dans l'Action, dans son conteneur, qui ne voit que le moteur, la fiche et la carte, et écrit
 * dans `sortie` ; sur un ordinateur, directement, avec le seul chemin des exécutables.
 */
async function lancerMoteur(moteur: string, fiche: string, carte: string, sortie: string, partie: string, limite: number): Promise<void> {
  if (!ISOLE) {
    await lancer(process.execPath, [`--max-old-space-size=${MEMOIRE_DU_MOTEUR_MO}`, resolve(moteur), resolve(fiche), resolve(carte), join(resolve(sortie), "etat")], limite, { env: { PATH: process.env.PATH ?? "" } });
    return;
  }
  imagePrete ??= lancer("docker", ["pull", "--quiet", IMAGE_DU_MOTEUR], 180_000);
  await imagePrete;
  // Le conteneur tourne sous l'utilisateur « nobody » : il ne peut écrire que là.
  chmodSync(sortie, 0o777);
  const nom = `rejeu-${partie}-${process.pid}`;
  await lancer("docker", commandeIsolee({ moteur: resolve(moteur), fiche: resolve(fiche), carte: resolve(carte), sortie: resolve(sortie) }, nom), limite, {
    arreter: () => {
      spawn("docker", ["kill", nom], { stdio: "ignore" }).on("error", () => {});
    },
  });
}

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
rmSync(join(RACINE, "cartes"), { recursive: true, force: true });
noterPassage(true);
