/**
 * Ce que partagent les deux scripts qui rejouent des parties avec le moteur d'OpenFront : `rejouer-victoires.ts` (la carte de
 * fin de chaque victoire) et `filmer-parties.ts` (le film de chaque partie du clan). Construire le moteur d'une version du jeu,
 * lire la fiche d'une partie et les fichiers de sa carte, puis lancer le moteur : dans l'Action, seulement dans un conteneur
 * sans réseau ni droits (`commandeIsolee`), et jamais sans lui. Sur un ordinateur, directement, ce que le pilote a accepté.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { API_BASE } from "../src/lib/pipeline";
import { commandeIsolee, FicheDePartie, FICHIERS_BRUTS, fichiersDeCarte, IMAGE_DU_MOTEUR, MAX_OCTETS_CARTE, MAX_OCTETS_FICHE, MEMOIRE_DU_MOTEUR_MO, MOTIFS_DU_MOTEUR, NOMS_DES_CARTES, OPENFRONT_DEPOT, PAQUETS_DU_MOTEUR, verrouDuMoteur } from "../src/lib/rejeu-openfront";

export const RACINE = ".cache/openfront";
/** Gardé par le cache du workflow : un moteur par version du jeu, construit une fois. */
const MOTEURS = `${RACINE}/moteurs`;
const MOTEURS_GARDES = 3;
/** Dans l'Action, le moteur ne tourne que dans son conteneur. */
const ISOLE = process.env.GITHUB_ACTIONS === "true";
const ENTREE = "scripts/rejeu-openfront/entree.ts";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** Une commande arrêtée parce qu'elle a dépassé son délai, et pour aucune autre raison. */
export class TropLong extends Error {}

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

export interface Moteur {
  fichier: string;
  /** Le fichier où le jeu nomme ses cartes, à cette version. `null` : absent. */
  noms: string | null;
}

/** L'empreinte du programme d'entrée : un moteur construit avec une autre version de ce programme est reconstruit. */
const versionDeLEntree = () => createHash("sha256").update(readFileSync(ENTREE)).digest("hex").slice(0, 10);

/**
 * Construit le moteur d'une version du jeu : le code de `packages/` au commit de la partie, lu sur GitHub sans les cartes ni le
 * client ; ses bibliothèques telles que le jeu les a verrouillées, installées par `npm ci` qui vérifie leur empreinte, sans
 * leurs scripts d'installation ; puis un seul fichier, avec `scripts/rejeu-openfront/entree.ts`. Rien de ce code n'est exécuté
 * ici. Gardé dans `MOTEURS` pour les parties suivantes de la même version.
 */
export async function construireMoteur(commit: string): Promise<Moteur> {
  const fichier = `${MOTEURS}/${commit}-${versionDeLEntree()}.mjs`;
  const noms = fichier.replace(/\.mjs$/, ".cartes.txt");
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
      entryPoints: [resolve(ENTREE)],
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
export function rangerMoteurs() {
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
export class FicheInattendue extends Error {}

/**
 * La fiche de la partie, avec toutes ses étapes, en deux essais. Une fiche introuvable (404) peut ne pas être encore archivée :
 * elle sera relue au passage suivant. Un autre refus, une fiche trop lourde ou au mauvais format ne servira jamais.
 */
export async function lireFiche(partie: string): Promise<{ texte: string; fiche: FicheDePartie }> {
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
export async function lireCarte(commit: string, dossierCarte: string, taille: "Normal" | "Compact"): Promise<string> {
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

/**
 * Le fichier de langue français du jeu au commit de la partie (`resources/lang/fr.json`, © OpenFront and Contributors,
 * CC BY-SA 4.0) : le journal « Entre Gaulois » y lit les phrases des messages rapides (`phrasesDuJeu`, src/lib/rejeu/journal.ts).
 * Jamais gardé : relu à chaque passage.
 */
export async function lireLangueDuJeu(commit: string): Promise<string> {
  return (await lireOctets(`${FICHIERS_BRUTS}/${commit}/resources/lang/fr.json`, 2_000_000, 60_000)).toString("utf8");
}

/** Les cartes lues pendant le passage : effacées à la fin, elles ne vont pas dans le cache. */
export function rangerCartes() {
  rmSync(join(RACINE, "cartes"), { recursive: true, force: true });
}

/* ---------- Le rejeu ---------- */

/** L'image du conteneur, tirée une fois par passage. `null` : pas encore tirée ; une erreur : impossible, rien ne se rejoue. */
let imagePrete: Promise<void> | null = null;

/**
 * Lance le moteur sur une partie : dans l'Action, dans son conteneur, qui ne voit que le moteur, la fiche et la carte, et écrit
 * dans `sortie` ; sur un ordinateur, directement, avec le seul chemin des exécutables. `film` : il note aussi le film de la partie.
 */
export async function lancerMoteur(moteur: string, fiche: string, carte: string, sortie: string, partie: string, limite: number, film = false): Promise<void> {
  if (!ISOLE) {
    const args = [`--max-old-space-size=${MEMOIRE_DU_MOTEUR_MO}`, resolve(moteur), resolve(fiche), resolve(carte), join(resolve(sortie), "etat")];
    await lancer(process.execPath, film ? [...args, "film"] : args, limite, { env: { PATH: process.env.PATH ?? "" } });
    return;
  }
  imagePrete ??= lancer("docker", ["pull", "--quiet", IMAGE_DU_MOTEUR], 180_000);
  await imagePrete;
  // Le conteneur tourne sous l'utilisateur « nobody » : il ne peut écrire que là.
  chmodSync(sortie, 0o777);
  const nom = `rejeu-${partie}-${process.pid}`;
  await lancer("docker", commandeIsolee({ moteur: resolve(moteur), fiche: resolve(fiche), carte: resolve(carte), sortie: resolve(sortie) }, nom, film), limite, {
    arreter: () => {
      spawn("docker", ["kill", nom], { stdio: "ignore" }).on("error", () => {});
    },
  });
}
