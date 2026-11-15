/**
 * Du film brut que laisse le moteur d'OpenFront (`Film` de scripts/rejeu-openfront/entree.ts) au film du site (`film.ts`). Le
 * moteur tourne dans un conteneur sans réseau ni droits : tout ce qu'il écrit est relu ici comme une donnée venue de l'extérieur,
 * vérifié, puis réécrit par le site. Les joueurs n'y gardent que leur camp : les Gaulois, leur équipe, les robots, les autres
 * équipes. Aucun identifiant ne passe dans le film, et les seuls noms sont ceux que le site donne lui-même (`PartieAFilmer.noms`,
 * choisis par `nomsPubliables`) : jamais un nom lu dans la partie.
 *
 * Film brut, un fichier compressé par gzip : l'octet de terrain de chaque case de la grille, puis chaque image : le nombre de
 * cases changées, et pour chacune l'écart avec la précédente changée (moins un) et sa valeur, le propriétaire fois deux, plus un
 * s'il y a des retombées ; puis le nombre d'unités changées, et pour chacune son numéro fois deux, plus un si elle est là, et si
 * elle est là son type, sa case (x, y), son propriétaire, son niveau et 1 si elle est en construction ; tout en entiers
 * LEB128. Sa description est dans `film` de la description de la partie.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { COULEUR_EQUIPE, COULEUR_GAULOIS, COULEUR_ROBOTS, COULEURS_ADVERSES, couleursDesJoueurs, EtatFinalMeta, type Rgb } from "../carte-finale";
import { CLASSE, EcrivainFilm, FORMAT_FILM, grilleDuFilm, imagesDuFilm, NOM_PERMIS, RETOMBEES, UNITES, type ChangementUnite, type EnteteFilm, type Etiquette } from "./film";

/** Un film brut décompressé ne dépasse pas ce poids : une partie de plusieurs heures sur la plus grande carte. */
export const MAX_OCTETS_FILM_BRUT = 64_000_000;
/** Au-delà, une image du film brut est refusée : aucune partie n'a ce nombre d'unités suivies. */
const UNITES_BRUTES_MAX = 50_000;

/** Les types d'unités suivis, dans les noms du moteur et dans l'ordre de `UNITES` (film.ts) : comme `UNITES_FILMEES` de entree.ts. */
export const UNITES_DU_FILM = ["City", "Port", "Factory", "Defense Post", "SAM Launcher", "Missile Silo", "Warship", "Transport", "Atom Bomb", "Hydrogen Bomb", "MIRV", "MIRV Warhead"] as const;

export const FilmBrutMeta = z.object({
  facteur: z.number().int().min(1).max(100),
  largeur: z.number().int().min(1),
  hauteur: z.number().int().min(1),
  pas: z.number().int().min(1),
  images: z.number().int().min(1),
  unites: z.array(z.string()).max(50),
});

/**
 * Les noms que le film peut poser sur les territoires, par identifiant en partie (`clientID`) : le pseudo des membres du clan
 * tel que la liste du clan le donne (relié par l'identifiant public de la fiche de la partie), et le tag des joueurs dont le tag
 * est dans le classement officiel (`[UN]`). Jamais le pseudo choisi dans la partie, ni un tag libre : on y trouve des injures et
 * des codes néonazis (relevé du 7 novembre 2026 sur les tags, `faceOffs`). Un anonyme de la liste reste sans nom.
 */
export function nomsPubliables(
  joueurs: readonly { clientID?: string | null; publicID?: string | null; clanTag?: string | null }[],
  pseudosDuClan: ReadonlyMap<string, string>,
  tagsOfficiels: readonly string[],
): Map<string, string> {
  const officiels = new Set(tagsOfficiels);
  const noms = new Map<string, string>();
  for (const j of joueurs) {
    if (!j.clientID) continue;
    const pseudo = j.publicID ? pseudosDuClan.get(j.publicID) : undefined;
    const texte = pseudo ? pseudo.replace(/\s+/g, " ").trim().slice(0, 40) : j.clanTag && officiels.has(j.clanTag) ? `[${j.clanTag}]` : null;
    if (texte && NOM_PERMIS.test(texte)) noms.set(j.clientID, texte);
  }
  return noms;
}

/**
 * Où poser le nom de chaque joueur nommé sur la grille : la case de son territoire la plus loin de son bord (distance en cases,
 * dans les huit directions, le bord de la grille compté comme un bord), la première en lisant ligne après ligne en cas
 * d'égalité ; sa taille est cette distance. `proprio` : le propriétaire de chaque case ; `nomDe` : le rang du nom de chaque
 * propriétaire, -1 s'il n'en a pas.
 */
export function placesDesNoms(proprio: Int32Array, largeur: number, hauteur: number, nomDe: Int32Array): Etiquette[] {
  const n = largeur * hauteur;
  const d = new Uint16Array(n);
  const nomme = (i: number) => {
    const o = proprio[i]!;
    return o > 0 && o < nomDe.length && nomDe[o]! >= 0;
  };
  const voisin = (i: number, x: number, y: number, dx: number, dy: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= largeur || ny >= hauteur) return 0;
    const j = ny * largeur + nx;
    return proprio[j] === proprio[i] ? d[j]! : 0;
  };
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      if (!nomme(i)) continue;
      d[i] = 1 + Math.min(voisin(i, x, y, -1, 0), voisin(i, x, y, -1, -1), voisin(i, x, y, 0, -1), voisin(i, x, y, 1, -1));
    }
  }
  const meilleures = new Map<number, Etiquette>();
  for (let y = hauteur - 1; y >= 0; y--) {
    for (let x = largeur - 1; x >= 0; x--) {
      const i = y * largeur + x;
      if (!nomme(i)) continue;
      d[i] = Math.min(d[i]!, 1 + Math.min(voisin(i, x, y, 1, 0), voisin(i, x, y, 1, 1), voisin(i, x, y, 0, 1), voisin(i, x, y, -1, 1)));
    }
  }
  for (let i = 0; i < n; i++) {
    if (!nomme(i)) continue;
    const o = proprio[i]!;
    const avant = meilleures.get(o);
    if (!avant || d[i]! > avant.taille) meilleures.set(o, { nom: nomDe[o]!, x: i % largeur, y: Math.floor(i / largeur), taille: d[i]! });
  }
  return [...meilleures.values()].sort((a, b) => a.nom - b.nom || a.y - b.y || a.x - b.x);
}

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
  /** Les noms à poser sur les territoires, par identifiant en partie : `nomsPubliables`. */
  noms: ReadonlyMap<string, string>;
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
  if (film.unites.length !== UNITES_DU_FILM.length || film.unites.some((u, i) => u !== UNITES_DU_FILM[i]) || UNITES.length !== UNITES_DU_FILM.length) throw new Error("unités du film inattendues");

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
  // Les noms : un par texte et par camp, dans l'ordre des petits numéros ; le rang du nom de chaque joueur nommé.
  const noms: EnteteFilm["noms"] = [];
  const nomDe = new Int32Array(maxN + 1).fill(-1);
  for (const j of [...meta.joueurs].sort((a, b) => a.n - b.n)) {
    const texte = j.client !== null ? partie.noms.get(j.client) : undefined;
    if (!texte) continue;
    const classe = classes[j.n]!;
    let rang = noms.findIndex((m) => m.texte === texte && m.classe === classe);
    if (rang < 0) rang = noms.push({ texte, classe }) - 1;
    nomDe[j.n] = rang;
  }

  const proprio = new Int32Array(n);
  const qui = new Int32Array(n);
  const grille = new Uint8Array(n);
  // Les unités : le numéro du moteur devient un petit numéro du site.
  const numeros = new Map<number, number>();
  let prochain = 0;
  const largeurCarte = film.largeur * film.facteur;
  const hauteurCarte = film.hauteur * film.facteur;
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
      const joueur = Math.floor(v / 2);
      if (joueur !== 0 && (joueur > maxN || !connus[joueur])) throw new Error("case d'un joueur inconnu");
      proprio[i] = v;
    }
    for (let c = 0; c < n; c++) {
      const v = proprio[c]!;
      qui[c] = v >> 1;
      const classe = classes[v >> 1]!;
      grille[c] = classe | (v & 1 ? RETOMBEES : 0);
      if (classe !== CLASSE.personne) utilisees.add(classe);
    }
    const unites: ChangementUnite[] = [];
    const changees = lire();
    if (changees > UNITES_BRUTES_MAX) throw new Error("trop d'unités changées");
    for (let q = 0; q < changees; q++) {
      const v = lire();
      const id = Math.floor(v / 2);
      if (v % 2 === 0) {
        const numero = numeros.get(id);
        if (numero === undefined) throw new Error("unité inconnue retirée");
        numeros.delete(id);
        unites.push({ id: numero, unite: null });
        continue;
      }
      const code = lire();
      const x = lire();
      const y = lire();
      const joueur = lire();
      const niveau = lire();
      const chantier = lire();
      if (code >= UNITES.length || x >= meta.largeur || y >= meta.hauteur || x >= largeurCarte || y >= hauteurCarte) throw new Error("unité hors de la carte");
      if (joueur === 0 || joueur > maxN || !connus[joueur]) throw new Error("unité d'un joueur inconnu");
      if (niveau < 1 || niveau > 1_000 || chantier > 1) throw new Error("unité au mauvais format");
      let numero = numeros.get(id);
      if (numero === undefined) {
        numero = prochain++;
        numeros.set(id, numero);
      }
      unites.push({ id: numero, unite: { code, x, y, classe: classes[joueur]!, niveau, chantier: chantier === 1 } });
    }
    ecrivain.ajouter(grille, noms.length > 0 ? placesDesNoms(qui, film.largeur, film.hauteur, nomDe) : [], unites);
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
    noms,
  };
  return { octets: gzipSync(ecrivain.octetsDuFilm(entete, terrain), { level: 9 }), entete };
}
