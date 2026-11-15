/**
 * Ce que le rejeu des victoires sait du dépôt d'OpenFront et de ses fiches de parties : `scripts/rejouer-victoires.ts` s'en
 * sert dans un job sans secret, `scripts/envoyer-victoires.ts` relit ce qu'il a laissé. Voir `carte-finale.ts`.
 *
 * Le moteur d'une partie est le code du jeu au commit qui l'a jouée (`gitCommit` de sa fiche) : le jeu n'est déterministe
 * qu'avec la même version, et c'est ainsi que son propre lecteur de replays choisit sa version (docs/Replays.md du dépôt).
 * Le site ne garde pas ce code : il le lit sur GitHub au besoin, ne prend que les dossiers `packages/` et quelques fichiers de
 * `resources/`, puis l'assemble en un seul fichier avec `scripts/rejeu-openfront/entree.ts`.
 */
import { z } from "zod";

export const OPENFRONT_DEPOT = "https://github.com/openfrontio/OpenFrontIO.git";
/** Les fichiers des cartes, au commit de la partie : les mêmes que le moteur a lus pendant la partie. */
export const FICHIERS_BRUTS = "https://raw.githubusercontent.com/openfrontio/OpenFrontIO";
/** Ce que le rejeu laisse à l'envoi : une description et des cases par partie, et la liste des parties vues. */
export const DOSSIER_CARTES = ".cache/cartes-finales";
export const FICHIER_PASSAGE = `${DOSSIER_CARTES}/passage.json`;

/** Ce que le rejeu prend du dépôt, en motifs de `git sparse-checkout --no-cone` : le code du moteur, sans les cartes ni le client. */
export const MOTIFS_DU_MOTEUR = ["/packages/", "/resources/*.json", "/tsconfig.base.json", "/package-lock.json"] as const;
/** Les paquets du moteur, dans `packages/` ; chacun s'importe sous `@openfront/<nom>`. */
export const PAQUETS_DU_MOTEUR = ["engine", "engine-api", "engine-lib", "shared", "zbin"] as const;
/** Le fichier où le jeu nomme ses cartes. Absent ou changé : le nom du dossier se déduit du nom de la carte. */
export const NOMS_DES_CARTES = "packages/engine-api/src/game/Maps.gen.ts";

/**
 * Une fiche de partie lue avec ses étapes (`/public/game/:id?turns=true`) : seul ce que le rejeu utilise est vérifié ici. Les
 * étapes passent telles quelles au moteur, qui les vérifie avec ses propres schémas.
 */
export const FicheDePartie = z.object({
  gitCommit: z.string().regex(/^[0-9a-f]{40}$/),
  info: z.object({
    gameID: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    config: z.object({ gameMap: z.string().min(1).max(80), gameMapSize: z.enum(["Normal", "Compact"]) }),
    num_turns: z.number().int().positive(),
  }),
  turns: z.array(z.unknown()).min(1),
});
export type FicheDePartie = z.infer<typeof FicheDePartie>;

/** Une fiche pèse quelques centaines de kilo-octets ; une partie de plusieurs heures, quelques méga-octets. */
export const MAX_OCTETS_FICHE = 64_000_000;

/** Les fichiers de la carte que le moteur lit, selon la taille de la partie (`loadMapFiles` du jeu). */
export function fichiersDeCarte(taille: "Normal" | "Compact"): string[] {
  return taille === "Normal" ? ["manifest.json", "map.bin", "map4x.bin"] : ["manifest.json", "map4x.bin", "map16x.bin"];
}
/** La plus grande carte, world10000 (10 000 × 5 000 cases, relevée le 15 novembre 2026), pèse 50 Mo en `map.bin`, un octet par case. */
export const MAX_OCTETS_CARTE = 64_000_000;

/**
 * Le dossier d'une carte dans `resources/maps/`, d'après le fichier où le jeu nomme ses cartes : le nom de la constante, en
 * minuscules (`mapDirName` du serveur du jeu). `null` si la carte n'y est pas.
 */
export function dossierDeCarte(nomsDesCartes: string, carte: string): string | null {
  for (const ligne of nomsDesCartes.split("\n")) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*,/.exec(ligne);
    if (m && m[2] === carte) return /^[A-Za-z0-9]{1,60}$/.test(m[1]!) ? m[1]!.toLowerCase() : null;
  }
  return null;
}

const NOM_DE_BIBLIOTHEQUE = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;
const EntreeDuVerrou = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/),
    resolved: z.string().startsWith("https://registry.npmjs.org/"),
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/=]+$/),
    dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

/**
 * Les bibliothèques dont le moteur a besoin, telles que le jeu les a verrouillées : les dépendances des paquets du moteur (hors
 * des paquets du jeu eux-mêmes), puis les leurs, à la même place que dans le verrou du jeu, chacune avec son adresse et son
 * empreinte. Le site en fait un petit projet (`paquet`, `verrou`) que `npm ci --ignore-scripts` installe en vérifiant chaque
 * empreinte, sans rien résoudre à neuf. Lève une erreur si une bibliothèque manque ou paraît étrange : le moteur ne se
 * construit pas.
 */
export function verrouDuMoteur(paquets: readonly string[], verrou: string): { noms: string[]; paquet: object; verrou: object } {
  const lock = z.object({ packages: z.record(z.string(), z.unknown()) }).parse(JSON.parse(verrou));
  const directes = new Set<string>();
  for (const texte of paquets) {
    const deps = z.object({ dependencies: z.record(z.string(), z.string()).optional() }).parse(JSON.parse(texte)).dependencies ?? {};
    for (const nom of Object.keys(deps)) if (!nom.startsWith("@openfront/")) directes.add(nom);
  }
  const entree = (chemin: string) => {
    const brut = lock.packages[chemin];
    if (brut === undefined) return null;
    const lue = EntreeDuVerrou.safeParse(brut);
    if (!lue.success) throw new Error(`bibliothèque ${chemin.replace(/^.*node_modules\//, "")} au format inattendu dans le verrou`);
    return lue.data;
  };
  // Comme Node : la bibliothèque `nom` vue depuis `depuis` est dans son dossier `node_modules`, sinon dans celui d'un parent.
  const trouver = (nom: string, depuis: string): string | null => {
    let base = depuis;
    for (;;) {
      const chemin = `${base ? `${base}/` : ""}node_modules/${nom}`;
      if (entree(chemin)) return chemin;
      if (!base) return null;
      const i = base.lastIndexOf("/node_modules/");
      base = i < 0 ? "" : base.slice(0, i);
    }
  };
  const gardees = new Map<string, z.infer<typeof EntreeDuVerrou>>();
  const aVoir: [string, string, boolean][] = [...directes].sort().map((nom) => [nom, "", false]);
  while (aVoir.length > 0) {
    const [nom, depuis, optionnelle] = aVoir.shift()!;
    if (!NOM_DE_BIBLIOTHEQUE.test(nom)) throw new Error("nom de bibliothèque inattendu");
    const chemin = trouver(nom, depuis);
    if (!chemin) {
      if (optionnelle) continue;
      throw new Error(`${nom} introuvable dans le verrou`);
    }
    if (gardees.has(chemin)) continue;
    const e = entree(chemin)!;
    gardees.set(chemin, e);
    for (const sous of Object.keys(e.dependencies ?? {})) aVoir.push([sous, chemin, false]);
    for (const sous of Object.keys(e.optionalDependencies ?? {})) aVoir.push([sous, chemin, true]);
  }
  const noms = [...directes].sort();
  const dependencies = Object.fromEntries(noms.map((nom) => [nom, gardees.get(`node_modules/${nom}`)!.version]));
  const racine = { name: "moteur-openfront", version: "0.0.0", dependencies };
  return {
    noms,
    paquet: { ...racine, private: true },
    verrou: { name: "moteur-openfront", version: "0.0.0", lockfileVersion: 3, requires: true, packages: { "": racine, ...Object.fromEntries([...gardees].sort(([a], [b]) => a.localeCompare(b))) } },
  };
}

/**
 * La liste des parties que le rejeu a vues à ce passage, rejouées ou non : l'envoi fait attendre une victoire qui n'y est pas
 * (`WAIT_FINAL_MS`). `fini` : le rejeu est allé au bout de son passage. Sans liste lisible, ou si le rejeu s'est arrêté en route
 * (panne, délai de l'étape), rien n'attend : une panne du rejeu ne retient aucune victoire.
 */
export const PassageDuRejeu = z.object({
  format: z.literal(1),
  fini: z.boolean(),
  vues: z.array(z.string().regex(/^[A-Za-z0-9]{1,32}$/)).max(100),
});
export type PassageDuRejeu = z.infer<typeof PassageDuRejeu>;

export function lirePassage(texte: string | null): ReadonlySet<string> | null {
  if (texte === null) return null;
  try {
    const passage = PassageDuRejeu.parse(JSON.parse(texte));
    return passage.fini ? new Set(passage.vues) : null;
  } catch {
    return null;
  }
}

/**
 * Le moteur ne tourne, dans l'Action, que dans ce conteneur : Node 22, image officielle fixée par son empreinte (relevée le
 * 15 novembre 2026), sans réseau, sans droits, en lecture seule. Le code du jeu ne peut ainsi rien toucher du job qui le lance.
 */
export const IMAGE_DU_MOTEUR = "node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee";
/** La mémoire du conteneur, et celle que Node peut prendre dedans : la plus grande carte et les parties de plusieurs heures. */
export const MEMOIRE_DU_MOTEUR_MO = 6_144;

/**
 * La commande `docker run` qui lance le moteur sur une partie : seuls le moteur, la fiche et la carte y sont visibles, en
 * lecture seule, et un dossier de sortie à elle, en écriture. Ni réseau, ni variable du job, ni droit de l'utilisateur. `film` :
 * le moteur note aussi le film de la partie (`scripts/filmer-parties.ts`).
 */
export function commandeIsolee(chemins: { moteur: string; fiche: string; carte: string; sortie: string }, nom: string, film = false): string[] {
  return [
    "run",
    "--rm",
    `--name=${nom}`,
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=65534:65534",
    "--pids-limit=256",
    `--memory=${MEMOIRE_DU_MOTEUR_MO + 1_024}m`,
    "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
    `--volume=${chemins.moteur}:/rejeu/moteur.mjs:ro`,
    `--volume=${chemins.fiche}:/rejeu/fiche.json:ro`,
    `--volume=${chemins.carte}:/rejeu/carte:ro`,
    `--volume=${chemins.sortie}:/rejeu/sortie`,
    "--workdir=/rejeu",
    IMAGE_DU_MOTEUR,
    "node",
    `--max-old-space-size=${MEMOIRE_DU_MOTEUR_MO}`,
    "/rejeu/moteur.mjs",
    "/rejeu/fiche.json",
    "/rejeu/carte",
    "/rejeu/sortie/etat",
    ...(film ? ["film"] : []),
  ];
}

/** La notice posée avec les cartes de fin dans l'artefact du workflow, public : les cases du terrain viennent des cartes du jeu. */
export function noticeDesCartes(commits: readonly string[], date: string): string {
  return [
    "Cartes de fin des victoires du clan [GAL], rejouées par le robot du site https://les-gaulois.github.io/",
    "",
    "Les fichiers .bin.gz contiennent, pour chaque case de la carte, l'octet de terrain des cartes du jeu OpenFront",
    "(resources/maps/<carte>/map.bin, map4x.bin ou map16x.bin du dépôt https://github.com/openfrontio/OpenFrontIO,",
    `au commit de chaque partie : ${commits.length > 0 ? commits.join(", ") : "aucune partie à ce passage"}).`,
    "© OpenFront and Contributors, CC BY-SA 4.0 : https://creativecommons.org/licenses/by-sa/4.0/deed.fr",
    `Modifié le ${date} par le site du clan : terrain à la fin de chaque partie, rejouée par le moteur du jeu, avec le`,
    "propriétaire et les retombées nucléaires de chaque case. Ces données restent sous la même licence.",
    "",
  ].join("\n");
}
export const NOTICE_DES_CARTES = `${DOSSIER_CARTES}/LISEZ-MOI.txt`;

/** Les fichiers d'une partie dans `DOSSIER_CARTES`. L'identifiant vient de l'API : vérifié avant d'en faire un nom de fichier. */
export function fichiersDeLaPartie(partie: string): { meta: string; cases: string } | null {
  if (!/^[A-Za-z0-9]{1,32}$/.test(partie)) return null;
  return { meta: `${DOSSIER_CARTES}/${partie}.json`, cases: `${DOSSIER_CARTES}/${partie}.bin.gz` };
}
