/**
 * Les poses des Gaulois du village : tout part des cases rendues par `casesDuGaulois` (48 × 64), sans toucher aux dessins
 * de `gaulois.ts`. La marche lève un pied puis l'autre ; attablé, le Gaulois est coupé à la taille, derrière la table, sa
 * chope devant lui ; couché, il est tourné d'un quart de tour sous une couverture, les yeux fermés. Les guerriers d'en
 * face, au champ de bataille, sont d'un autre clan inventé pour ce site : sans tag, sans nom, en prune, un trait de craie
 * sur les joues. Design : Claude Fable 5.2.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, PEAUX, casesDuGaulois, type Tenue } from "../gaulois";
import { type Decor, Planche, alea } from "./decor";

type Cases = readonly (string | null)[];
const L = GAULOIS_LARGEUR;
const H = GAULOIS_HAUTEUR;

/** La tenue sans son arme : on la pose pour s'attabler et pour dormir. */
export const sansArme = (tenue: Tenue): Tenue => ({ ...tenue, arme: "aucune" });

/** Les rangées des jambes sous l'entrejambe, et les colonnes de chaque jambe : ce que la marche déplace. */
const JAMBES_DE = 51;
const JAMBES_A = 61;
const JAMBE = { gauche: [10, 23], droite: [24, 35] } as const;
/** De combien de cases le pied se lève. */
const LEVEE = 2;

/** Le Gaulois un pied levé : la jambe remonte de deux cases, le reste ne bouge pas. */
export function poseDeMarche(cases: Cases, pied: "gauche" | "droite"): (string | null)[] {
  const pose = [...cases];
  const [de, a] = JAMBE[pied];
  for (let y = JAMBES_DE; y <= JAMBES_A; y++) {
    for (let x = de; x <= a; x++) pose[y * L + x] = y + LEVEE <= JAMBES_A ? (cases[(y + LEVEE) * L + x] ?? null) : null;
  }
  return pose;
}

/** Le même dessin, retourné de gauche à droite. */
export function miroir(cases: Cases, largeur = L): (string | null)[] {
  const retourne = new Array<string | null>(cases.length).fill(null);
  const hauteur = cases.length / largeur;
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) retourne[y * largeur + (largeur - 1 - x)] = cases[y * largeur + x] ?? null;
  return retourne;
}

/** Le blanc de l'œil des Gaulois (`FIXES` de `gaulois.ts`). */
const BLANC_DE_L_OEIL = "#eef2f7";

/**
 * Le Gaulois qui dort, debout avant d'être couché : sans arme, les yeux fermés, quels que soient ses yeux (un trait sous
 * chaque œil, dessiné par `gaulois.ts` ; un œil caché par une coiffe le reste).
 */
export const casesEndormies = (tenue: Tenue): (string | null)[] => casesDuGaulois(sansArme(tenue), { yeuxFermes: true });

/** La taille d'un Gaulois attablé : coupé sous la ceinture, puis la place de la chope posée sur la table. */
export const ATTABLE_COUPE = 47;
export const ATTABLE_HAUTEUR = 58;

const CHOPE = [".fffff...", "afffffa..", "abbbbbaaa", "abcbbba.a", "abcbbba.a", "abcbbbaaa", "abbbbba..", ".aaaaa..."] as const;
const COULEURS_DE_CHOPE = { a: "#1a1410", b: "#8d95a6", c: "#c0c9e2", f: "#fff6dc" } as const;

/**
 * Le Gaulois à table, sans arme : `chope` posée devant lui, levée jusqu'à sa bouche, ou absente (salle de réunion). La
 * table elle-même est dans le décor, derrière la découpe.
 */
export function poseAttable(cases: Cases, chope: "posee" | "levee" | null): Decor {
  const planche = new Planche(L, ATTABLE_HAUTEUR);
  for (let y = 0; y < ATTABLE_COUPE; y++) for (let x = 0; x < L; x++) planche.poser(x, y, cases[y * L + x] ?? null);
  if (chope === "posee") planche.lettres(31, 44, CHOPE, COULEURS_DE_CHOPE);
  if (chope === "levee") {
    // L'avant-bras monte de la main à la chope : la couleur de la main, entre deux traits.
    const main = cases[44 * L + 36] ?? "#f2c9a0";
    for (let y = 35; y <= 43; y++) {
      const x = 33 + Math.round((y - 35) / 4);
      planche.poser(x - 1, y, "#1a1410");
      planche.rect(x, y, 3, 1, main);
      planche.poser(x + 3, y, "#1a1410");
    }
    planche.lettres(26, 27, CHOPE, COULEURS_DE_CHOPE);
  }
  return planche.decor();
}

/** La taille d'un Gaulois couché dans son lit. */
export const LIT_LARGEUR = 68;
export const LIT_HAUTEUR = 44;

const COUVERTURES = [
  { fond: "#a8483a", sombre: "#7e3028", clair: "#c96a58" },
  { fond: "#3f5f9a", sombre: "#2c4474", clair: "#5f80ba" },
  { fond: "#4f7d3a", sombre: "#36572a", clair: "#6f9d56" },
  { fond: "#b98a3a", sombre: "#8e6828", clair: "#d6aa5a" },
] as const;

/**
 * Le Gaulois endormi, vu de dessus : sa paillasse, son oreiller, lui tourné d'un quart de tour, la tête à gauche, les yeux
 * fermés, sous une couverture de laine. `souffle` : 0 ou 1, la couverture se soulève d'une case. `rang` choisit la
 * couleur de la couverture.
 */
export function poseCouche(tenue: Tenue, souffle: 0 | 1, rang: number): Decor {
  const planche = new Planche(LIT_LARGEUR, LIT_HAUTEUR);
  // Le cadre de bois et la paille.
  planche.rect(0, 2, LIT_LARGEUR, 40, "#4a301c");
  planche.rect(1, 3, LIT_LARGEUR - 2, 38, (x, y) => {
    const a = alea(x + 40, y + 7);
    return a < 0.12 ? "#b3964f" : a > 0.9 ? "#dcc480" : "#cdb26a";
  });
  planche.rect(1, 40, LIT_LARGEUR - 2, 1, "#9c8145");
  // L'oreiller.
  planche.rect(3, 6, 27, 32, (x, y) => ((x === 3 || x === 29) && (y === 6 || y === 37) ? null : x === 29 || y === 37 ? "#cfc5aa" : "#e9e2cf"));
  // Le dormeur : la case (x, y) du Gaulois debout va en (y + 3, 45 − x).
  const endormi = casesEndormies(tenue);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const couleur = endormi[y * L + x];
      if (couleur) planche.poser(y + 3, 45 - x, couleur);
    }
  }
  // La couverture, des épaules aux pieds : un revers clair, des rayures, le renflement du corps.
  const laine = COUVERTURES[((rang % COUVERTURES.length) + COUVERTURES.length) % COUVERTURES.length]!;
  const debut = 38 - souffle;
  for (let y = 4; y <= 39; y++) {
    for (let x = debut; x <= 66; x++) {
      if ((x === 66 || x === debut) && (y === 4 || y === 39)) continue;
      let couleur: string = laine.fond;
      if (x < debut + 3) couleur = "#efe6d0";
      else if (x === debut + 3 || y === 4 || y === 39 || x === 66) couleur = laine.sombre;
      else if ((x - 38) % 7 === 6) couleur = laine.sombre;
      else if (y >= 14 - souffle && y <= 29 + souffle) couleur = (x + y) % 2 === 0 || (y > 16 && y < 27) ? laine.clair : laine.fond;
      planche.poser(x, y, couleur);
    }
  }
  return planche.decor();
}

/* ---------- Les guerriers d'en face ---------- */

const TRAIT = "#1a1410";
const CRAIE = "#e9e4f2";
/** Du plus sombre au plus clair : les étoffes, les cuirs et les fers de l'autre clan, tous en prune. */
const PRUNE = ["#2c2040", "#3f2f58", "#5a4070", "#7a5a94", "#9a7ab4", "#c4b0d8"] as const;
const SEUILS = [50, 85, 120, 160, 205] as const;

/** Les silhouettes de l'autre clan : des tenues du vestiaire, que la teinture rend méconnaissables. */
const SILHOUETTES: readonly Tenue[] = [
  { peau: "claire", cheveux: "herisses", teinte_cheveux: "noir", barbe: "grande", tete: "aucun", haut: "veste-peau", bas: "braies-cuir", pieds: "bottes-fourrees", arme: "hache" },
  { peau: "mate", cheveux: "longs", teinte_cheveux: "noir", barbe: "courte", tete: "capuche", haut: "cotte-mailles", bas: "braies", pieds: "bottes", arme: "masse" },
  { peau: "foncee", cheveux: "tresses", teinte_cheveux: "gris", barbe: "longue-moustache", tete: "aucun", haut: "tunique", bas: "braies-cuir", pieds: "bottes-fourrees", arme: "epee" },
  { peau: "doree", cheveux: "courts", teinte_cheveux: "noir", barbe: "grande", tete: "casque-cuir", haut: "veste-peau", bas: "braies", pieds: "bottes", arme: "bouclier-bois" },
];
export const ADVERSAIRES = SILHOUETTES.length;

/**
 * Un guerrier de l'autre clan, tourné vers les Gaulois : tout ce qu'il porte est teint en prune, du sombre au clair selon
 * la clarté du dessin ; sa peau garde sa couleur, barrée d'un trait de craie sur les joues.
 */
export function casesDeLAdversaire(variante: number): (string | null)[] {
  const tenue = SILHOUETTES[((variante % ADVERSAIRES) + ADVERSAIRES) % ADVERSAIRES]!;
  const peau = new Set<string>(Object.values(PEAUX[tenue["peau"] as keyof typeof PEAUX].couleurs));
  const cases = casesDuGaulois(tenue).map((couleur, i) => {
    if (couleur === null || couleur === TRAIT || couleur === BLANC_DE_L_OEIL) return couleur;
    if (peau.has(couleur)) {
      const y = Math.floor(i / L);
      return y === 23 || y === 24 ? CRAIE : couleur;
    }
    const clarte = 0.3 * parseInt(couleur.slice(1, 3), 16) + 0.59 * parseInt(couleur.slice(3, 5), 16) + 0.11 * parseInt(couleur.slice(5, 7), 16);
    return PRUNE[SEUILS.findIndex((seuil) => clarte < seuil)] ?? PRUNE[PRUNE.length - 1]!;
  });
  return miroir(cases);
}
