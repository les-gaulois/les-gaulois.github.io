/**
 * Construit le vrai lecteur de replay d'OpenFront pour chaque version du jeu qui a joué une partie filmée (voir
 * `src/lib/rejeu/lecteur-jeu.ts`). Lancé par le job « films » de `.github/workflows/site.yml`, après `parties:filmer`, dans un job
 * sans aucun secret. Le code du jeu est lu sur GitHub au commit de la version, sans ses fichiers propriétaires, ses cartes ni
 * ses outils ; ses bibliothèques sont installées par `npm ci` sans leurs scripts (leur empreinte vérifiée, rien d'exécuté) ;
 * puis la construction, qui exécute la configuration du jeu, ne tourne dans l'Action que dans un conteneur sans réseau ni
 * droits (`commandeDeConstruction`). Sur un ordinateur, directement, ce que le pilote a accepté.
 *   npm run lecteurs:construire
 *
 * Résultat, gardé dans le cache du workflow (`.cache/lecteurs/`, jamais dans Git) : par version, le code construit
 * (`assets/`), le modèle de page (`modele.html`), les images SVG du jeu (`res/`) et la liste de ses fichiers (`fichiers.txt`) ;
 * et les drapeaux du jeu (`drapeaux/`), communs. `scripts/publier-films.ts` en fait les pages du site.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { appliquerRetouche, commandeDeConstruction, dependanceHorsRegistre, DEPOT_DU_JEU, lireRecette, RECETTE_DU_LECTEUR, RETOUCHES_DU_CODE, DOSSIER_DES_LECTEURS, IMAGE_DU_LECTEUR, manifesteDuLecteur, MANIFESTE_DU_JEU, MANIFESTE_DU_SITE, MOTIFS_DU_LECTEUR, svgRepris } from "../src/lib/rejeu/lecteur-jeu";
import { INDEX_DES_FILMS, lireIndex } from "../src/lib/rejeu/films-index";


/** Les dernières versions du jeu seulement : une partie plus ancienne garde le film du site. */
const LECTEURS_MAX = 3;
/** Le code construit d'une version pèse environ 5 Mo (4,9 Mo au commit 8b5d071) : au-delà, quelque chose a changé. */
const MAX_OCTETS_DU_CODE = 30_000_000;
const ISOLE = process.env.GITHUB_ACTIONS === "true";

/** Le dossier où le code du jeu est construit : hors du cache des lecteurs, pour qu'une construction coupée n'y parte jamais. */
const TRAVAIL = ".cache/openfront/lecteur-construction";

function lancer(commande: string, args: readonly string[], limiteMs: number, options: { cwd?: string; env?: NodeJS.ProcessEnv; arreter?: () => void } = {}): Promise<void> {
  return new Promise((ok, ko) => {
    const enfant = spawn(commande, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" && (commande === "npm" || commande === "npx") });
    let erreur = "";
    enfant.stderr.on("data", (d: Buffer) => {
      erreur = (erreur + d.toString()).slice(-2_000);
    });
    const minuterie = setTimeout(() => {
      // Un conteneur ne s'arrête pas avec le client docker qui l'a lancé.
      options.arreter?.();
      enfant.kill("SIGKILL");
    }, limiteMs);
    enfant.on("error", (e) => {
      clearTimeout(minuterie);
      ko(e);
    });
    enfant.on("close", (code) => {
      clearTimeout(minuterie);
      if (code === 0) ok();
      else ko(new Error(`${commande} : code ${code} ${erreur.trim().split("\n").pop() ?? ""}`.trim()));
    });
  });
}

function taille(dossier: string): number {
  let total = 0;
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    const s = statSync(chemin);
    total += s.isDirectory() ? taille(chemin) : s.size;
  }
  return total;
}

/**
 * Le dossier ne contient que des dossiers et des fichiers ordinaires : un lien symbolique laissé par la construction pourrait
 * mener ailleurs sur la machine, et être suivi au moment de publier. Lève une erreur sinon.
 */
function sansLien(dossier: string) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    const s = lstatSync(chemin);
    if (s.isDirectory()) sansLien(chemin);
    else if (!s.isFile()) throw new Error(`fichier inattendu dans la construction : ${nom}`);
  }
}

/**
 * Efface le dossier de travail après une construction. Un échec n'annule pas un lecteur construit (la machine du workflow est
 * jetée après le passage) : il est signalé, sans plus.
 */
function effacerTravail(chemin: string) {
  try {
    rmSync(chemin, { recursive: true, force: true });
  } catch (e) {
    console.log(`::warning::Lecteurs : le dossier de travail ne s'efface pas (${e instanceof Error ? e.message.slice(0, 160) : String(e)}).`);
  }
}

/** La recette d'un lecteur construit (`recette.txt`), `null` sans elle. */
function recetteDe(dossier: string): number | null {
  const chemin = join(dossier, "recette.txt");
  return lstatSync(chemin, { throwIfNoEntry: false })?.isFile() ? lireRecette(readFileSync(chemin, "utf8")) : null;
}

/** Les SVG d'un dossier, chemins relatifs. */
function svgs(dossier: string, prefixe = ""): string[] {
  if (!existsSync(dossier)) return [];
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    const s = lstatSync(chemin);
    if (s.isDirectory()) out.push(...svgs(chemin, `${prefixe}${nom}/`));
    else if (!s.isFile()) continue;
    else if (nom.endsWith(".svg")) out.push(`${prefixe}${nom}`);
  }
  return out;
}

async function construire(commit: string, drapeaux: boolean): Promise<void> {
  const final = join(DOSSIER_DES_LECTEURS, commit);
  const travail = resolve(TRAVAIL);
  rmSync(travail, { recursive: true, force: true });
  mkdirSync(travail, { recursive: true });
  try {
    await lancer("git", ["init", "-q", travail], 30_000);
    await lancer("git", ["-C", travail, "remote", "add", "origin", DEPOT_DU_JEU], 30_000);
    await lancer("git", ["-C", travail, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", commit], 120_000);
    await lancer("git", ["-C", travail, "config", "core.sparseCheckout", "true"], 30_000);
    writeFileSync(join(travail, ".git", "info", "sparse-checkout"), `${MOTIFS_DU_LECTEUR.join("\n")}\n`);
    await lancer("git", ["-C", travail, "checkout", "-q", "--detach", "FETCH_HEAD"], 180_000);
    // La liste de tous les fichiers de resources/, cartes comprises (elles restent sur GitHub), sans les télécharger.
    const liste = await new Promise<string>((ok, ko) => {
      const enfant = spawn("git", ["-C", travail, "ls-tree", "-r", "--name-only", "FETCH_HEAD", "resources/"], { stdio: ["ignore", "pipe", "ignore"] });
      let s = "";
      enfant.stdout.on("data", (d: Buffer) => (s += d.toString()));
      enfant.on("close", (code) => (code === 0 ? ok(s) : ko(new Error("liste des fichiers du jeu illisible"))));
    });
    const fichiers = liste
      .split("\n")
      .filter((l) => l.startsWith("resources/"))
      .map((l) => l.slice("resources/".length));
    writeFileSync(join(travail, "gal-manifest.json"), JSON.stringify(manifesteDuLecteur(fichiers, commit, "/", RECETTE_DU_LECTEUR)));
    const config = readFileSync(join(travail, "vite.config.ts"), "utf8");
    if (!config.includes(MANIFESTE_DU_JEU)) throw new Error("la configuration du jeu a changé (manifeste)");
    writeFileSync(join(travail, "vite.config.ts"), config.replace(MANIFESTE_DU_JEU, MANIFESTE_DU_SITE));
    for (const r of RETOUCHES_DU_CODE) writeFileSync(join(travail, r.fichier), appliquerRetouche(readFileSync(join(travail, r.fichier), "utf8"), r));
    // `npm ci` tourne hors du conteneur : pas de réglages npm venus du jeu (déjà écartés par les motifs), et seulement des
    // bibliothèques du registre public, vérifiées par leur empreinte, jamais tirées de Git ou d'une autre adresse.
    rmSync(join(travail, ".npmrc"), { force: true });
    const horsRegistre = dependanceHorsRegistre(readFileSync(join(travail, "package-lock.json"), "utf8"));
    if (horsRegistre) throw new Error(`bibliothèque hors du registre npm : ${horsRegistre.slice(0, 80)}`);
    await lancer("npm", ["ci", "--ignore-scripts", "--engine-strict=false", "--no-audit", "--no-fund", "--loglevel=error"], 300_000, { cwd: travail });
    if (ISOLE) {
      await lancer("docker", ["pull", "--quiet", IMAGE_DU_LECTEUR], 180_000);
      await lancer("chmod", ["-R", "a+rwX", travail], 60_000);
      const nom = `lecteur-${commit.slice(0, 10)}-${process.pid}`;
      await lancer("docker", commandeDeConstruction(travail, commit, nom), 600_000, {
        arreter: () => {
          spawn("docker", ["kill", nom], { stdio: "ignore" }).on("error", () => {});
        },
      });
    } else {
      // Node 22 lit la configuration TypeScript du jeu avec cette option ; Node 24, de lui-même.
      await lancer(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--base", `/jeu/${commit.slice(0, 10)}/`], 600_000, {
        cwd: travail,
        env: { PATH: process.env.PATH ?? "", GAME_ENV: "prod", GAL_MANIFEST: join(travail, "gal-manifest.json"), NODE_OPTIONS: "--experimental-strip-types" },
      });
    }
    const statique = join(travail, "static");
    if (!existsSync(join(statique, "index.html")) || !existsSync(join(statique, "assets"))) throw new Error("construction sans page ni code");
    // Ce que laisse la construction vient du code du jeu : rien que des fichiers ordinaires.
    sansLien(statique);
    if (!lstatSync(join(statique, "index.html")).isFile()) throw new Error("page du lecteur inattendue");
    if (taille(join(statique, "assets")) > MAX_OCTETS_DU_CODE) throw new Error("code construit trop lourd");
    const partiel = `${final}.partiel`;
    rmSync(partiel, { recursive: true, force: true });
    mkdirSync(partiel, { recursive: true });
    cpSync(join(statique, "assets"), join(partiel, "assets"), { recursive: true });
    cpSync(join(statique, "index.html"), join(partiel, "modele.html"));
    writeFileSync(join(partiel, "fichiers.txt"), `${fichiers.join("\n")}\n`);
    writeFileSync(join(partiel, "recette.txt"), `${RECETTE_DU_LECTEUR}\n`);
    for (const f of svgs(join(travail, "resources")).filter((f) => !f.startsWith("flags/") && svgRepris(f))) {
      mkdirSync(join(partiel, "res", f, ".."), { recursive: true });
      cpSync(join(travail, "resources", f), join(partiel, "res", f));
    }
    if (drapeaux) {
      const dossier = join(DOSSIER_DES_LECTEURS, "drapeaux");
      rmSync(dossier, { recursive: true, force: true });
      mkdirSync(dossier, { recursive: true });
      for (const f of svgs(join(travail, "resources", "flags"))) {
        mkdirSync(join(dossier, f, ".."), { recursive: true });
        cpSync(join(travail, "resources", "flags", f), join(dossier, f));
      }
    }
    rmSync(final, { recursive: true, force: true });
    renameSync(partiel, final);
  } finally {
    effacerTravail(travail);
  }
}

mkdirSync(DOSSIER_DES_LECTEURS, { recursive: true });
const index = lireIndex(existsSync(INDEX_DES_FILMS) ? readFileSync(INDEX_DES_FILMS, "utf8") : null);
// Les versions des parties filmées, de la plus récente partie à la plus ancienne.
const commits: string[] = [];
for (const f of [...index.films].sort((a, b) => b.debut.localeCompare(a.debut))) if (f.commit && !commits.includes(f.commit)) commits.push(f.commit);
const gardes = commits.slice(0, LECTEURS_MAX);
for (const [i, commit] of gardes.entries()) {
  // Déjà construit, de la même recette : rien à refaire.
  if (existsSync(join(DOSSIER_DES_LECTEURS, commit, "modele.html")) && recetteDe(join(DOSSIER_DES_LECTEURS, commit)) === RECETTE_DU_LECTEUR && (i > 0 || existsSync(join(DOSSIER_DES_LECTEURS, "drapeaux")))) continue;
  const t0 = Date.now();
  try {
    await construire(commit, i === 0);
    console.log(`Lecteurs : version ${commit.slice(0, 10)} construite en ${Math.round((Date.now() - t0) / 1000)} s.`);
  } catch (e) {
    console.log(`::warning::Lecteurs : la version ${commit.slice(0, 10)} du jeu ne se construit pas (${e instanceof Error ? e.message.slice(0, 200) : String(e)}). Ses parties n'ont pas de replay en attendant.`);
  }
}
// Les lecteurs des versions qui n'ont plus de partie filmée s'en vont.
for (const nom of readdirSync(DOSSIER_DES_LECTEURS)) {
  if (/^[0-9a-f]{40}$/.test(nom) && !gardes.includes(nom)) rmSync(join(DOSSIER_DES_LECTEURS, nom), { recursive: true, force: true });
  if (nom.endsWith(".partiel") || nom === "construction") rmSync(join(DOSSIER_DES_LECTEURS, nom), { recursive: true, force: true });
}
effacerTravail(TRAVAIL);
// Rien que des fichiers ordinaires ne part dans le cache : un dossier qui contiendrait autre chose est effacé.
for (const nom of readdirSync(DOSSIER_DES_LECTEURS)) {
  const chemin = join(DOSSIER_DES_LECTEURS, nom);
  try {
    if (!lstatSync(chemin).isDirectory()) throw new Error("pas un dossier");
    sansLien(chemin);
  } catch (e) {
    rmSync(chemin, { recursive: true, force: true });
    console.log(`::warning::Lecteurs : ${nom} effacé du cache (${e instanceof Error ? e.message.slice(0, 120) : String(e)}).`);
  }
}
