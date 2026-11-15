/**
 * Du film brut que laisse le moteur d'OpenFront (`Film` de scripts/rejeu-openfront/entree.ts) au film du site (`film.ts`). Le
 * moteur tourne dans un conteneur sans réseau ni droits : tout ce qu'il écrit est relu ici comme une donnée venue de l'extérieur,
 * vérifié, puis réécrit par le site. Les joueurs n'y gardent que leur camp : les Gaulois, leur équipe, les robots, les autres
 * équipes. Aucun nom, aucun identifiant ne passe dans le film.
 *
 * Film brut, un fichier compressé par gzip : l'octet de terrain de chaque case de la grille, puis chaque image : le nombre de
 * cases changées, et pour chacune l'écart avec la précédente changée (moins un) et sa valeur, le propriétaire fois deux, plus un
 * s'il y a des retombées, en entiers LEB128. Sa description est dans `film` de la description de la partie.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { COULEUR_EQUIPE, COULEUR_GAULOIS, COULEUR_ROBOTS, COULEURS_ADVERSES, couleursDesJoueurs, EtatFinalMeta, type Rgb } from "../carte-finale";
import { CLASSE, EcrivainFilm, FORMAT_FILM, grilleDuFilm, imagesDuFilm, RETOMBEES, type EnteteFilm } from "./film";

/** Un film brut décompressé ne dépasse pas ce poids : une partie de plusieurs heures sur la plus grande carte. */
export const MAX_OCTETS_FILM_BRUT = 64_000_000;

export const FilmBrutMeta = z.object({
  facteur: z.number().int().min(1).max(100),
  largeur: z.number().int().min(1),
  hauteur: z.number().int().min(1),
  pas: z.number().int().min(1),
  images: z.number().int().min(1),
});

/** Ce que le site sait de la partie, hors du moteur : la session du clan et la fiche de la partie. */
export interface PartieAFilmer {
  partie: string;
  carte: string;
  debut: string;
  victoire: boolean;
  equipes: string;
  gaulois: number;
  joueurs: number;
  /** Les identifiants en partie des joueurs au tag du clan, d'après la fiche de la partie. */
  clients: ReadonlySet<string>;
}

/** Le camp de chaque couleur de la carte de fin, en classes du film. */
function classeDeCouleur(): Map<Rgb, number> {
  const m = new Map<Rgb, number>([
    [COULEUR_GAULOIS, CLASSE.gaulois],
    [COULEUR_EQUIPE, CLASSE.equipe],
    [COULEUR_ROBOTS, CLASSE.robots],
  ]);
  COULEURS_ADVERSES.forEach((c, k) => m.set(c, CLASSE.adverses + k));
  return m;
}

/** L'équipe des Gaulois : celle du plus grand nombre d'entre eux. `null` : aucun, ou une partie sans équipes. */
export function equipeDesGaulois(joueurs: readonly { client: string | null; equipe: string | null }[], clients: ReadonlySet<string>): string | null {
  const compte = new Map<string, number>();
  for (const j of joueurs) if (j.client !== null && clients.has(j.client) && j.equipe !== null) compte.set(j.equipe, (compte.get(j.equipe) ?? 0) + 1);
  let meilleure: string | null = null;
  for (const [e, n] of [...compte].sort(([a], [b]) => a.localeCompare(b))) if (meilleure === null || n > compte.get(meilleure)!) meilleure = e;
  return meilleure;
}

/**
 * Relit ce que le moteur a laissé pour une partie et en fait le film du site, compressé. Lève une erreur, en mots, si quoi que ce
 * soit ne va pas : rien n'est alors publié pour cette partie.
 */
export function filmDeLaPartie(metaTexte: string, filmGz: Uint8Array, partie: PartieAFilmer): { octets: Buffer; entete: EnteteFilm } {
  let brut: unknown;
  try {
    brut = JSON.parse(metaTexte);
  } catch {
    throw new Error("description illisible");
  }
  const lue = EtatFinalMeta.safeParse(brut);
  if (!lue.success) throw new Error(`description au mauvais format (${lue.error.issues[0]?.message ?? "?"})`);
  const meta = lue.data;
  if (meta.partie !== partie.partie) throw new Error("fichier d'une autre partie");
  const filmLu = z.object({ film: FilmBrutMeta }).safeParse(brut);
  if (!filmLu.success) throw new Error("description du film absente ou au mauvais format");
  const film = filmLu.data.film;
  const attendue = grilleDuFilm(meta.largeur, meta.hauteur);
  const { pas, images } = imagesDuFilm(meta.tours - 1);
  if (film.facteur !== attendue.facteur || film.largeur !== attendue.largeur || film.hauteur !== attendue.hauteur) throw new Error("grille du film inattendue");
  if (film.pas !== pas || film.images !== images) throw new Error("images du film inattendues");

  let octets: Buffer;
  try {
    octets = gunzipSync(filmGz, { maxOutputLength: MAX_OCTETS_FILM_BRUT });
  } catch {
    throw new Error("film illisible ou trop lourd");
  }
  const n = film.largeur * film.hauteur;
  if (octets.length < n) throw new Error("film coupé");
  const terrain = new Uint8Array(octets.subarray(0, n));

  const equipe = equipeDesGaulois(meta.joueurs, partie.clients);
  const couleurs = couleursDesJoueurs(meta.joueurs, partie.clients, equipe);
  const parCouleur = classeDeCouleur();
  // Le camp de chaque joueur, par son petit numéro ; 0 pour personne.
  const maxN = meta.joueurs.reduce((m, j) => Math.max(m, j.n), 0);
  const classes = new Uint8Array(maxN + 1);
  const connus = new Uint8Array(maxN + 1);
  for (const j of meta.joueurs) {
    connus[j.n] = 1;
    classes[j.n] = parCouleur.get(couleurs.get(j.n)!) ?? CLASSE.personne;
  }

  const proprio = new Int32Array(n);
  const grille = new Uint8Array(n);
  const ecrivain = new EcrivainFilm(film.largeur, film.hauteur);
  const utilisees = new Set<number>();
  let p = n;
  const lire = () => {
    let v = 0;
    let echelle = 1;
    for (let k = 0; k < 5; k++) {
      if (p >= octets.length) throw new Error("film coupé");
      const o = octets[p++]!;
      v += (o & 0x7f) * echelle;
      if (o < 0x80) return v;
      echelle *= 128;
    }
    throw new Error("nombre trop long");
  };
  for (let k = 0; k < film.images; k++) {
    const nombre = lire();
    if (nombre > n) throw new Error("trop de cases changées");
    let i = -1;
    for (let q = 0; q < nombre; q++) {
      i += lire() + 1;
      if (i >= n) throw new Error("case hors de la grille");
      const v = lire();
      const qui = Math.floor(v / 2);
      if (qui !== 0 && (qui > maxN || !connus[qui])) throw new Error("case d'un joueur inconnu");
      proprio[i] = v;
    }
    for (let c = 0; c < n; c++) {
      const v = proprio[c]!;
      const classe = classes[v >> 1]!;
      grille[c] = classe | (v & 1 ? RETOMBEES : 0);
      if (classe !== CLASSE.personne) utilisees.add(classe);
    }
    ecrivain.ajouter(grille);
  }
  if (p !== octets.length) throw new Error("octets en trop à la fin du film");

  const entete: EnteteFilm = {
    format: FORMAT_FILM,
    partie: partie.partie,
    carte: partie.carte,
    debut: partie.debut,
    victoire: partie.victoire,
    equipes: partie.equipes,
    gaulois: partie.gaulois,
    joueurs: partie.joueurs,
    largeur: film.largeur,
    hauteur: film.hauteur,
    facteur: film.facteur,
    pas: film.pas,
    images: film.images,
    tours: meta.tours,
    adverses: Math.max(0, ...[...utilisees].filter((c) => c >= CLASSE.adverses).map((c) => c - CLASSE.adverses + 1)),
    equipe: utilisees.has(CLASSE.equipe),
  };
  return { octets: gzipSync(ecrivain.octetsDuFilm(entete, terrain), { level: 9 }), entete };
}
