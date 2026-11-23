/**
 * La course des familiers du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, `c2/jeux/course/`,
 * validée par le pilote le 22 novembre 2026, portée telle quelle ; le velours pourpre de la tribune et des oriflammes est
 * passé au bordeaux) : six vrais familiers du site sur six couloirs, un champ de courses gaulois de trois quarts (le pré, le
 * gué, la forêt, la tribune d'or de l'arrivée et ses Gaulois), une caméra qui glisse avec le meneur, sans jamais zoomer.
 *
 * Le serveur tire le couloir gagnant d'abord (`jouer_course`) ; la course est ensuite écrite pour lui
 * (`ecrireLaCourse` des règles du serveur, `src/lib/village/casino/course.ts`) : il passe la ligne le premier, personne ne
 * recule, personne ne saute d'une place à l'autre. Rien ici ne dépend d'un navigateur : la scène reçoit de quoi faire ses
 * images (`FabriqueDImages`) et le pinceau où dessiner.
 */
import { FAMILIER_LARGEUR, casesDuFamilier } from "../../../supabase/functions/code-discord/familiers/familier";
import { familierDe } from "../../../supabase/functions/code-discord/familiers/index";
import { GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, type Tenue } from "../gaulois";
import { COULOIRS, TOTAL_DES_PARTS, avancee, ecrireLaCourse, heureDArrivee, type Coureur } from "../village/casino/course";
import { SONS, peau, souffle, timbale, type Roulement } from "./casino-sons";
import type { FabriqueDImages, ImageDeLaScene, Pinceau, SurfaceDeLaScene } from "./casino-scene";
import { AMBRE, BAYER, BORDEAUX, EMERAUDE, ENCRE, IVOIRE, JOUR, NOIR, OR, RUBIS, SAPHIR, Toile, borne, cadreOr, ecrisSur, hex, hexDe, largeurDuTexte, pair, toileDesCases, ton, type Rampe, type Rvb } from "./casino-toile";
import { COULEURS_DES_RARETES } from "./icones-de-rarete";
import { MATIERES_DU_PALAIS } from "./casino-pieces";
import { nombreEcrit } from "./ecriture";

/* ---------- La géométrie de la scène, en points ---------- */

/** La hauteur de la scène, l'horizon, le haut de la piste, la largeur d'un couloir, la ligne de départ, le bas de la piste. */
export const H = 200;
export const HORIZON = 72;
export const PISTE = 84;
export const VOIE = 18;
export const DEPART_X = 100;
export const BAS = PISTE + 6 * VOIE;
/** La ligne où courent les pattes d'un couloir. */
export const base = (voie: number): number => PISTE + voie * VOIE + 14;
/** La vue de trois quarts : les couloirs du fond sont décalés vers la droite, les lignes de départ et d'arrivée penchent d'autant. */
export const biais = (y: number): number => Math.round((BAS - y) * (7 / VOIE));
const TUILE = 512;
const MORCEAU = 256;
const HC = HORIZON + 2;
const hache = (n: number): number => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
const css = (c: Rvb): string => hexDe(c);

/** La largeur de la scène en points pour une boîte de `largeur` pixels, et la longueur de la piste. */
export function mesuresDeLaScene(largeur: number): { W: number; L: number } {
  const W = Math.max(120, pair((largeur - 16) / 2));
  return { W, L: Math.max(860, Math.min(2300, Math.round(W * 3.6))) };
}

/* ---------- Le paysage gaulois, de jour et de nuit ; l'or et le velours du champ de courses ---------- */

export interface PaletteDeLaCourse {
  ciel: readonly string[];
  nuage: string;
  nuage2: string;
  loin: string;
  loin2: string;
  colline: string;
  colline2: string;
  arbre: string;
  arbre2: string;
  arbre3: string;
  tronc: string;
  tronc2: string;
  herbe: string;
  herbe2: string;
  herbe3: string;
  terre: string;
  terre2: string;
  grain: string;
  grain2: string;
  trait: string;
  ombre: string;
  eau: string;
  eau2: string;
  eau3: string;
  ecume: string;
  fond: string;
  foret: string;
  foret2: string;
  foret3: string;
  sousBois: string;
  tache: string;
  feuille: readonly string[];
  fleurs: readonly string[];
  poussiere: string;
  etoile: string | null;
  nuit: boolean;
  or: readonly [string, string, string, string];
  vel: readonly [string, string, string, string];
  lampe: string;
}
const O = (i: number): string => css(ton(OR, i));
const V = (i: number): string => css(ton(BORDEAUX, i));
export const PALETTE_DU_JOUR: PaletteDeLaCourse = {
  ciel: ["#79b2f1", "#93c3f6", "#b2d6fa", "#d3e8fd", "#ecf5ff"],
  nuage: "#ffffff",
  nuage2: "#d6e4fa",
  loin: "#a6c2ec",
  loin2: "#8fb0e2",
  colline: "#93d48a",
  colline2: "#79c27a",
  arbre: "#4fa35e",
  arbre2: "#3b8a52",
  arbre3: "#7cc878",
  tronc: "#7a5232",
  tronc2: "#5a3a22",
  herbe: "#86cf6b",
  herbe2: "#a2dd80",
  herbe3: "#5fae52",
  terre: "#e6c896",
  terre2: "#ddbd88",
  grain: "#c9a26c",
  grain2: "#f1dbb2",
  trait: "#fff6dc",
  ombre: "rgba(60,36,14,.3)",
  eau: "#62a9ec",
  eau2: "#93c9f7",
  eau3: "#3f86d6",
  ecume: "#eef7ff",
  fond: "#2f7648",
  foret: "#3f9458",
  foret2: "#2d6f44",
  foret3: "#5fb86a",
  sousBois: "rgba(24,70,36,.2)",
  tache: "rgba(255,244,190,.2)",
  feuille: ["#c98a3a", "#a86a2a", "#e0b25a"],
  fleurs: ["#ffffff", "#ffd84a", "#ff8a8f", "#b9a3ff"],
  poussiere: "#f3e2bb",
  etoile: null,
  nuit: false,
  or: [O(3), O(5), O(6), O(8)],
  vel: [V(3), V(4), V(5), V(6)],
  lampe: O(4),
};
/**
 * La nuit : la piste, son sable, ses traits et sa poussière sont d'un gris de lune bleuté (revue du 23 novembre 2026) ; le
 * lavande de la maquette, à même clarté, tirait vers le pourpre écarté au profit du bordeaux.
 */
export const PALETTE_DE_LA_NUIT: PaletteDeLaCourse = {
  ciel: ["#060a20", "#0a1230", "#0e1a46", "#14245e", "#1c3078"],
  nuage: "#24389e",
  nuage2: "#18265e",
  loin: "#16236a",
  loin2: "#111c50",
  colline: "#16404a",
  colline2: "#11343f",
  arbre: "#0f3a3a",
  arbre2: "#0a2c30",
  arbre3: "#1c5450",
  tronc: "#3a2a26",
  tronc2: "#261b18",
  herbe: "#1f5a52",
  herbe2: "#2a6e60",
  herbe3: "#174640",
  terre: "#616076",
  terre2: "#59586d",
  grain: "#4a4a5c",
  grain2: "#737288",
  trait: "#acb1cb",
  ombre: "rgba(2,4,14,.42)",
  eau: "#1f4f9a",
  eau2: "#3f7ad0",
  eau3: "#143a78",
  ecume: "#b9d4ff",
  fond: "#081e26",
  foret: "#12403c",
  foret2: "#0a2c2c",
  foret3: "#1e5a4c",
  sousBois: "rgba(2,10,20,.3)",
  tache: "rgba(150,190,255,.1)",
  feuille: ["#5a4a3a", "#4a3a30", "#6e5c44"],
  fleurs: ["#c8d0e6", "#c9a43a", "#b0606a", "#7a6cc0"],
  poussiere: "#9ca1bb",
  etoile: "#f6f1e3",
  nuit: true,
  or: [O(2), O(4), O(5), O(7)],
  vel: [V(2), V(3), V(4), V(5)],
  lampe: O(8),
};

/* ---------- Les coureurs et la tribune : les vrais familiers et de vrais Gaulois du site ---------- */

/** Les familiers qui courent (ceux de la maquette), tirés six par six à chaque course. La rareté ne change rien aux chances. */
export const FAMILIERS_DE_LA_COURSE: readonly string[] = [
  "souris-des-greniers",
  "escargot-du-potager",
  "poule-rousse",
  "lapin-de-garenne",
  "oie-blanche",
  "agneau-laineux",
  "cochon-rose",
  "chevre-a-la-clochette",
  "ane-gris",
  "molosse-au-collier-de-bronze",
  "vache-tachetee",
  "cheval-de-trait",
  "taureau-noir-aux-cornes-de-bronze",
  "belier-aux-cornes-d-or",
  "herisson-des-haies",
  "renardeau-roux",
  "loup-gris",
  "renard-argente",
  "biche-blanche",
  "cerf-aux-bois-d-or",
  "bison-des-forets",
  "tortue-des-mares",
  "licorne",
  "miche-qui-marche",
  "meule-de-fromage",
  "marmite-a-pattes",
  "cochon-tirelire",
  "canard-dore-couronne",
];
/** Les familiers sont dessinés tournés vers la gauche, sauf ceux-ci : on retourne les autres, la course va vers la droite. */
const REGARDE_DEJA_A_DROITE: ReadonlySet<string> = new Set(["tortue-des-mares"]);

/** Un familier qui court : son nom et sa rareté (ceux du site), son dessin tourné vers la droite. */
export interface FamilierQuiCourt {
  id: string;
  nom: string;
  rarete: string;
  toile: Toile;
}
const memoFamiliers = new Map<string, FamilierQuiCourt | null>();
/** Un familier de la course, tourné vers la droite ; `null` s'il n'existe pas au site. */
export function familierQuiCourt(id: string): FamilierQuiCourt | null {
  let f = memoFamiliers.get(id);
  if (f !== undefined) return f;
  const d = familierDe(id);
  if (!d) f = null;
  else {
    const t = toileDesCases(casesDuFamilier(d), FAMILIER_LARGEUR);
    let toile = t;
    if (!REGARDE_DEJA_A_DROITE.has(id)) {
      toile = new Toile(t.w, t.h);
      toile.pose(t, 0, 0, true);
    }
    f = { id, nom: d.nom, rarete: d.rarete, toile };
  }
  memoFamiliers.set(id, f);
  return f;
}

/** Les Gaulois de la tribune (les tenues de la maquette) : six du premier tour, et les croupiers en habit de fête. */
export const TENUES_DE_LA_TRIBUNE: readonly Tenue[] = [
  { teinte_cheveux: "blond", cheveux: "longs", barbe: "grande", tete: "casque", haut: "tunique-rouge", bas: "braies-carreaux", arme: "cor-guerre" },
  { peau: "mate", teinte_cheveux: "chatain", cheveux: "tresses", barbe: "aucune", tete: "couronne-fleurs", haut: "tunique-verte", bas: "jupe-laine", pieds: "sandales", arme: "drapeau", bouche: "grand-sourire" },
  { peau: "doree", teinte_cheveux: "noir", cheveux: "crete", barbe: "bouc", tete: "aucun", haut: "gilet-berger", bas: "braies-bleues", arme: "tambour" },
  { peau: "foncee", teinte_cheveux: "gris", cheveux: "degarni", barbe: "fleuve", tete: "chapeau-paille", haut: "chemise-carreaux", bas: "braies-rapiecees", pieds: "sabots-bois", arme: "baton-marche" },
  { cheveux: "boucles", barbe: "longue-moustache", tete: "bonnet", haut: "tablier-boulanger", bas: "braies-grises", arme: "louche", bouche: "grand-sourire" },
  { teinte_cheveux: "blond", cheveux: "queue-de-cheval", barbe: "aucune", tete: "bandeau", haut: "maillot-clan", bas: "kilt-carreaux", arme: "etendard", yeux: "rieurs" },
  { cheveux: "raie", teinte_cheveux: "noir", barbe: "guidon", tete: "chapeau-feutre", haut: "gilet-cuir-cloute", bas: "braies-grises", arme: "aucune", bouche: "grand-sourire" },
  { peau: "doree", cheveux: "queue-de-cheval", teinte_cheveux: "chatain", barbe: "courte", tete: "bandeau", haut: "tunique-rayee", bas: "braies-bleues", arme: "aucune", bouche: "grand-sourire" },
  { peau: "mate", cheveux: "degarni", teinte_cheveux: "gris", barbe: "grande", tete: "aucun", haut: "tablier-forgeron", bas: "braies-cuir", pieds: "bottes-fer", arme: "aucune", yeux: "rieurs" },
  { peau: "foncee", cheveux: "courts", teinte_cheveux: "noir", barbe: "bouc", tete: "casque-cuir", haut: "plastron-cuir", bas: "braies-lacees", arme: "aucune", bouche: "sourire" },
  { cheveux: "meches", teinte_cheveux: "roux", barbe: "longue-moustache", tete: "bonnet", haut: "chemise-jabot", bas: "braies-rayees", arme: "aucune", bouche: "grand-sourire" },
  { cheveux: "tresses", teinte_cheveux: "roux", barbe: "aucune", tete: "couronne-fleurs", haut: "tunique-rouge", bas: "jupe-laine", arme: "aucune", yeux: "rieurs", bouche: "grand-sourire" },
];
let memoFoule: Toile[] | null = null;
/** Les Gaulois de la tribune, recadrés au plus près. */
export function gauloisDeLaTribune(): Toile[] {
  return (memoFoule ??= TENUES_DE_LA_TRIBUNE.map((t) => toileDesCases(casesDuGaulois({ ...TENUE_DE_DEPART, ...t }), GAULOIS_LARGEUR)));
}

/* ---------- Les pièces des couloirs : dossards, flèche, plaque du départ, plaques d'or, portraits, corde ---------- */

/** Les six couleurs des couloirs, en pierres du palais : saphir, rubis, ambre, émeraude, bordeaux, ivoire. Le chiffre fait foi. */
export const TONS_DES_COULOIRS: readonly { rp: Rampe; i: number; encre: Rvb; plaque: "bleue" | "rouge" | "or" | "verte" | "feutre" }[] = [
  { rp: SAPHIR, i: 4, encre: ton(IVOIRE, 6), plaque: "bleue" },
  { rp: RUBIS, i: 4, encre: ton(IVOIRE, 6), plaque: "rouge" },
  { rp: AMBRE, i: 4, encre: ENCRE, plaque: "or" },
  { rp: EMERAUDE, i: 4, encre: ENCRE, plaque: "verte" },
  { rp: BORDEAUX, i: 7, encre: ton(IVOIRE, 6), plaque: "feutre" },
  { rp: IVOIRE, i: 5, encre: ENCRE, plaque: "feutre" },
];

/** Le dossard d'un couloir : un petit écu avec son chiffre. `choisi` : celui du pari, cerclé d'or. */
export function dossard(n: number, choisi = false): Toile {
  const { rp, i, encre } = TONS_DES_COULOIRS[n] ?? TONS_DES_COULOIRS[0]!;
  const T = new Toile(13, 15);
  const forme = (x: number, y: number, w: number, h: number, c: Rvb): void => {
    for (let j = 0; j < h; j++) {
      const r = j === 0 ? 1 : j >= h - 5 ? Math.round(((j - (h - 6)) * (w / 2 - 0.5)) / 5) : 0;
      T.r(x + r, y + j, w - 2 * r, 1, c);
    }
  };
  forme(0, 0, 13, 15, choisi ? ton(OR, 6) : ENCRE);
  forme(1, 1, 11, 13, choisi ? ton(OR, 3) : ton(rp, i));
  if (choisi) forme(2, 2, 9, 11, ton(rp, i));
  T.r(3, choisi ? 2 : 1, 7, 1, ton(rp, Math.min(rp.n - 1, i + 2)));
  T.r(3, 10, 7, 1, ton(rp, i - 2));
  const t = String(n + 1);
  ecrisSur(T, t, Math.floor((13 - largeurDuTexte(t)) / 2), 3, encre);
  return T;
}
/** La flèche d'or au-dessus du coureur du pari. */
export function fleche(): Toile {
  const T = new Toile(9, 7);
  for (let j = 0; j < 5; j++) T.r(j, j + 1, 9 - 2 * j, 1, j < 2 ? ton(OR, 7) : ton(OR, 6));
  return T.cerne();
}
/** La plaque du départ : laque noire, filet d'or, lettres d'or. */
export function plaqueDuDepart(): Toile {
  const t = "DÉPART";
  const w = largeurDuTexte(t) + 10;
  const T = new Toile(w, 15);
  T.r(0, 0, w, 15, ton(NOIR, 2));
  cadreOr(T, 0, 0, w, 15, 3, false);
  ecrisSur(T, t, 5, 4, ton(OR, 6));
  return T;
}
/**
 * Les encres sur l'or des plaques et sur la bulle de l'arrivée (crème) : les mêmes dans les deux thèmes, comme l'or et la
 * bulle. L'encre est le trait du palais de jour ; la douce, celle des chances (maquette). Contraste AA testé.
 */
export const ENCRES_DES_PLAQUES = { encre: MATIERES_DU_PALAIS.clair.trait, douce: "#4a2f06" } as const;
/** Le champ d'or d'une plaque : au repos, survolée, misée. */
export const CHAMPS_DES_PLAQUES: readonly [string, string, string] = ["#d7a41e", "#ecbb30", hexDe(ton(OR, 6))];

/** La plaque d'or d'un couloir, en neuf parts (6, 6, 8, 6) : biseau clair, filet gravé, quatre rivets, une tranche. `etat` : 0 repos, 1 survol, 2 misée. */
export function plaqueDOr(etat: 0 | 1 | 2): Toile {
  const n = 24;
  const T = new Toile(n, n + 2);
  const champ = hex(CHAMPS_DES_PLAQUES[etat]);
  T.f(0, 0, n, n, (x, y) => {
    const m = Math.min(x, y, n - 1 - x, n - 1 - y);
    const hg = x + y < n - 1;
    if (m === 0) return (x === 0 || x === n - 1) && (y === 0 || y === n - 1) ? null : ton(OR, 1);
    if (m === 1) return hg ? ton(OR, etat ? 8 : 7) : ton(OR, 4);
    if (m === 2) return hg ? ton(OR, 6) : ton(OR, etat === 2 ? 5 : 4);
    if (m === 3) return etat === 2 ? ton(OR, 8) : ton(OR, 3);
    return champ;
  });
  for (const [x, y] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
    [n - 4, n - 4],
  ] as const) {
    T.p(x, y, ton(OR, 8));
    T.p(x + 1, y + 1, ton(OR, 2));
  }
  T.r(1, n, n - 2, 1, ton(OR, 3));
  T.p(0, n, ton(OR, 1));
  T.p(n - 1, n, ton(OR, 1));
  T.r(1, n + 1, n - 2, 1, ton(OR, 1));
  return T;
}
/**
 * Le portrait d'un familier sur sa plaque : son vrai dessin dans un cadre à la couleur de sa rareté, cadré sur la tête pour
 * les plus grands (ils regardent à droite). `cote` : le côté en pixels (96, 80 ou 56) ; la toile est en points (2 pixels).
 */
export function portraitDuFamilier(f: FamilierQuiCourt, cote: number): Toile {
  const n = Math.round(cote / 2);
  const T = new Toile(n, n);
  const coul = hex(COULEURS_DES_RARETES[f.rarete as keyof typeof COULEURS_DES_RARETES] ?? COULEURS_DES_RARETES.commun);
  T.r(1, 0, n - 2, n, ENCRE);
  T.r(0, 1, n, n - 2, ENCRE);
  T.r(1, 1, n - 2, n - 2, coul);
  T.r(3, 3, n - 6, n - 6, ton(JOUR, 6));
  for (let y = 3; y < n - 3; y++) for (let x = 3; x < n - 3; x++) T.m(x, y, coul, 0.18);
  const sol = pair(cote * 0.74) / 2;
  for (let y = sol; y < n - 3; y++) for (let x = 3; x < n - 3; x++) T.m(x, y, coul, 0.16);
  const fen = n - 6;
  const sw = Math.min(f.toile.w, fen);
  const sh = Math.min(f.toile.h, fen);
  const x0 = 3 + Math.floor((fen - sw) / 2);
  const y0 = n - 3 - sh - (sh < fen - 2 ? 2 : 0);
  const sx = f.toile.w - sw;
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const i = (y * f.toile.w + sx + x) * 4;
      if (f.toile.d[i + 3]! > 127) T.p(x0 + x, y0 + y, [f.toile.d[i]!, f.toile.d[i + 1]!, f.toile.d[i + 2]!]);
    }
  return T;
}
/** Le fil d'or de la corde (un motif de 4 points qui se répète). */
export function filDeLaCorde(): Toile {
  const fil = new Toile(4, 5);
  fil.r(0, 0, 4, 1, ENCRE);
  fil.r(0, 1, 4, 1, ton(OR, 7));
  fil.r(0, 2, 4, 1, ton(OR, 5));
  fil.r(0, 3, 4, 1, ton(OR, 3));
  fil.r(0, 4, 4, 1, ENCRE);
  return fil;
}
/** Le mât d'arrivée de la corde et son fanion bordeaux. */
export function fanionDeLaCorde(): Toile {
  const m = new Toile(11, 18);
  m.r(1, 1, 2, 17, ton(OR, 5));
  m.r(2, 1, 1, 17, ton(OR, 3));
  m.r(0, 0, 4, 2, ton(OR, 7));
  for (let i = 0; i < 7; i++) m.r(3, 2 + i, Math.max(1, 7 - Math.abs(i - 3) * 2), 1, i < 2 ? ton(BORDEAUX, 7) : ton(BORDEAUX, 5));
  return m.cerne();
}
/** Où se pose le pion d'un couloir sur la corde (`large` : la longueur du fil en pixels), en pixels pairs. */
export const placeSurLaCorde = (part: number, large: number): number => Math.round((borne(part) * large) / 2) * 2;

/* ---------- Ce qui se dit ---------- */

/** Ce que dit le croupier d'un pari posé : le couloir, la mise, ce que rapporterait la victoire (mise comprise). */
export function motsDuPari(v: number, total: number): [string, string] {
  return [`Couloir ${v + 1}`, `${nombreEcrit(total)} misés, ${nombreEcrit(total * (COULOIRS[v]?.fois ?? 0))} pour la victoire`];
}

/** Les chances d'un couloir, celles que la plaque écrit : « une fois sur 6 ». */
export const chanceDuCouloir = (v: number): string => `une fois sur ${COULOIRS[v] ? TOTAL_DES_PARTS / COULOIRS[v].parts : 0}`;
/** Ce qu'un lecteur d'écran entend de plus que ce que la plaque écrit : le couloir, la rareté du familier, ce qu'il paie. */
export function detailDuCouloir(v: number, rarete: string | null): string {
  const mots: Readonly<Record<string, string>> = { commun: "commun", "peu-commun": "peu commun", epique: "épique", mystique: "mystique", legendaire: "légendaire" };
  return `couloir ${v + 1}${rarete ? `, ${mots[rarete] ?? ""}` : ""} : paie ${COULOIRS[v]?.fois ?? 0} fois la mise, gagne`;
}
/**
 * Ce que dit une plaque aux lecteurs d'écran, tiré de son contenu : le familier et ses chances écrits sur la plaque, avec,
 * entre les deux, le couloir, la rareté et ce qu'il paie. Le nom lu contient ainsi tout ce qui est écrit (WCAG 2.5.3).
 */
export function nomDuCouloir(v: number, nom: string, rarete: string): string {
  return `${nom}, ${detailDuCouloir(v, rarete)} ${chanceDuCouloir(v)}`;
}

/* ---------- Le champ de courses ---------- */

/** Les phases d'une course : les paris, le départ (les coureurs se ramassent), la course, l'arrivée passée, le repos. */
export type PhaseDeLaCourse = "paris" | "depart" | "course" | "fini" | "repos";

/** Un coureur en piste. */
export interface CoureurEnPiste {
  f: FamilierQuiCourt;
  img: ImageDeLaScene;
  w: number;
  h: number;
  voie: number;
  x: number;
  part: number;
  vitesse: number;
  phase: number;
  cadence: number;
  saut: number;
  hop: number;
  souffle: number;
  arrive: boolean;
  ecrase: boolean;
}
interface Particule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  age: number;
  vie: number;
  t: number;
  coul: string;
  alpha: number;
  devant: boolean;
}
/** Ce que la course dit au jeu : un commentaire du croupier en course, l'arrivée du gagnant. */
export interface EvenementsDeLaCourse {
  commente?(titre: string, sous: string): void;
  arrivee?(): void;
}
interface Cone {
  image: ImageDeLaScene;
  ax: number;
}

/**
 * Le champ de courses : la piste, le décor peint par morceaux, les coureurs, la tribune, la caméra et les sons de la course.
 * `pas(dt)` fait avancer le temps, `dessiner(g)` peint une image. Une course : `nouvelleCourse()` (les paris), puis
 * `depart(gagnant)` avec le gagnant du serveur.
 */
export class ChampDeCourses {
  W = 480;
  L = 2000;
  cam = 0;
  camCible = 0;
  phase: PhaseDeLaCourse = "paris";
  t = 0;
  horloge = 0;
  coureurs: CoureurEnPiste[] = [];
  ecrit: Coureur[] = [];
  heures: number[] = [];
  gagnant = -1;
  /** Le couloir du pari (-1 sans pari) : son dossard est d'or, la flèche est au-dessus. */
  voie = -1;
  /** La fête de la tribune, de 1 à 0 après l'arrivée. */
  fete = 0;
  private lueur = 0;
  private lueurT: number | undefined;
  private lueurDuree = 3.2;
  private particules: Particule[] = [];
  private dernierGalop = 0;
  private tambourA = 0;
  private dits = 0;
  private annonce = false;
  private murmure: Roulement | null = null;
  private clameur: Roulement | null = null;
  private jour = true;
  private readonly fabrique: FabriqueDImages;
  private readonly sansMouvement: () => boolean;
  private readonly maintenant: () => number;
  private readonly ev: EvenementsDeLaCourse;
  private ciel: SurfaceDeLaScene | null = null;
  private loin: SurfaceDeLaScene | null = null;
  private pres: SurfaceDeLaScene | null = null;
  private toit: SurfaceDeLaScene | null = null;
  private rampeT: SurfaceDeLaScene | null = null;
  private readonly morceaux = new Map<number, ImageDeLaScene>();
  private readonly devants = new Map<number, ImageDeLaScene>();
  private readonly images = new Map<string, ImageDeLaScene>();
  private cones: { faisceau: Cone; douche: Cone; lanterne: Cone } | null = null;

  constructor(fabrique: FabriqueDImages, ev: EvenementsDeLaCourse = {}, options: { sansMouvement?: () => boolean; maintenant?: () => number } = {}) {
    this.fabrique = fabrique;
    this.ev = ev;
    this.sansMouvement = options.sansMouvement ?? (() => false);
    this.maintenant = options.maintenant ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  private img(cle: string, faire: () => Toile): ImageDeLaScene {
    let i = this.images.get(cle);
    if (!i) this.images.set(cle, (i = this.fabrique.image(faire())));
    return i;
  }
  private get p(): PaletteDeLaCourse {
    return this.jour ? PALETTE_DU_JOUR : PALETTE_DE_LA_NUIT;
  }
  /** La ligne d'arrivée. */
  fin(): number {
    return DEPART_X + this.L;
  }
  /** Les lieux de la course, le long de la piste : le pré, le gué, la forêt, la tribune d'or de l'arrivée. */
  lieux(): { gue0: number; gue1: number; foret0: number; foret1: number; pal0: number; pal1: number } {
    const L = this.L;
    const d = DEPART_X;
    return { gue0: d + L * 0.3, gue1: d + L * 0.3 + Math.max(46, L * 0.045), foret0: d + L * 0.5, foret1: d + L * 0.8, pal0: Math.round((d + L - Math.min(330, L * 0.17)) / 72) * 72, pal1: d + L + 300 };
  }
  private dansLeGue(x: number, y: number): boolean {
    const z = this.lieux();
    return x >= z.gue0 + rive(y, 1) && x <= z.gue1 + rive(y, 4);
  }
  /** Où se dresse un mât de projecteur (tous les 170 points, hors de la forêt, du gué et de la tribune). */
  private matIci(wx: number, z: ReturnType<ChampDeCourses["lieux"]>): boolean {
    return !(wx > z.foret0 - 10 && wx < z.foret1 + 10) && !this.dansLeGue(wx, HORIZON + 4) && wx < z.pal0 - 30 && Math.abs(wx - DEPART_X - 20) > 44;
  }

  /** La scène fait `W` points de large (la piste s'allonge avec elle) ; tout se repeint au thème du jour. */
  mesurer(W: number, jour: boolean): void {
    this.W = W;
    this.L = Math.max(860, Math.min(2300, Math.round(W * 3.6)));
    this.jour = jour;
    this.morceaux.clear();
    this.devants.clear();
    this.peindreLeCiel();
    if (this.phase !== "paris" && this.ecrit.length) {
      this.placer(this.t);
      this.camCible = Math.max(0, Math.min(Math.max(...this.coureurs.map((c) => c.x)) - W * 0.68, this.fin() - W * 0.7));
      this.cam = this.camCible;
    } else for (const c of this.coureurs) c.x = DEPART_X;
  }

  /* --- Le décor : le ciel et deux lignes de collines qui glissent, puis le monde, peint par morceaux --- */
  private peindreLeCiel(): void {
    const p = this.p;
    const W = this.W;
    const f = this.fabrique;
    this.ciel = f.surface(W, HC);
    const x = this.ciel.pinceau;
    const n = p.ciel.length;
    for (let i = 0; i < n; i++) {
      const y0 = Math.round((i * HC) / n);
      const y1 = Math.round(((i + 1) * HC) / n);
      x.fillStyle = p.ciel[i]!;
      x.fillRect(0, y0, W, y1 - y0);
      if (i + 1 < n) {
        x.fillStyle = p.ciel[i + 1]!;
        for (let xx = (i % 2) * 2; xx < W; xx += 4) x.fillRect(xx, y1 - 1, 2, 1);
      }
    }
    if (p.etoile) {
      x.fillStyle = p.etoile;
      for (let i = 0; i < W / 5; i++) {
        const sx = Math.floor(hache(i * 3 + 1) * W);
        const sy = Math.floor(hache(i * 3 + 2) * (HORIZON - 16));
        x.globalAlpha = 0.35 + hache(i * 3 + 3) * 0.55;
        x.fillRect(sx, sy, 1, 1);
      }
      x.globalAlpha = 1;
      const mx = Math.round(W * 0.82);
      const my = 17;
      x.fillStyle = css(ton(IVOIRE, 5));
      for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) if (xx * xx + yy * yy <= 50 && (xx - 3) * (xx - 3) + (yy + 2) * (yy + 2) > 40) x.fillRect(mx + xx, my + yy, 1, 1);
    }
    this.loin = f.surface(TUILE, HC);
    let y = this.loin.pinceau;
    const T2 = (Math.PI * 2) / TUILE;
    for (let xx = 0; xx < TUILE; xx++) {
      const h1 = Math.round(HORIZON - 24 + 7 * Math.sin(xx * T2 * 2 + 1) + 4 * Math.sin(xx * T2 * 5 + 2));
      const h2 = Math.round(HORIZON - 14 + 5 * Math.sin(xx * T2 * 3 + 4) + 3 * Math.sin(xx * T2 * 7));
      y.fillStyle = p.loin;
      y.fillRect(xx, h1, 1, HC - h1);
      y.fillStyle = p.loin2;
      y.fillRect(xx, h2, 1, HC - h2);
    }
    this.pres = f.surface(TUILE, HC);
    y = this.pres.pinceau;
    const crete = (xx: number): number => Math.round(HORIZON - 7 + 4 * Math.sin(xx * T2 * 4 + 0.6) + 2 * Math.sin(xx * T2 * 9 + 2));
    for (let xx = 0; xx < TUILE; xx++) {
      const h1 = crete(xx);
      y.fillStyle = p.colline;
      y.fillRect(xx, h1, 1, HC - h1);
      y.fillStyle = p.colline2;
      y.fillRect(xx, h1 + 5, 1, HC - h1 - 5);
    }
    for (let i = 0; i < 16; i++) {
      const ax = i * 32 + Math.floor(hache(i + 70) * 14);
      const ay = crete(ax) + 1;
      const r = 4 + Math.floor(hache(i + 90) * 3);
      rond(y, ax, ay - r, r + 1, r, p.arbre);
      rond(y, ax - 1, ay - r - 1, r - 1, r - 2, p.arbre3);
      y.fillStyle = p.tronc2;
      y.fillRect(ax, ay, 1, 2);
    }
    // Le toit de la tribune (une travée de 72 points) : la corniche d'or, le lambrequin de velours et ses glands.
    this.toit = f.surface(72, 18);
    y = this.toit.pinceau;
    const F = (a: number, b: number, w: number, h: number, c: string): void => {
      y.fillStyle = c;
      y.fillRect(a, b, w, h);
    };
    const ENC = css(ENCRE);
    F(0, 0, 72, 1, ENC);
    F(0, 1, 72, 1, p.or[3]);
    F(0, 2, 72, 4, p.or[1]);
    for (let xx = 0; xx < 72; xx++) {
      F(xx, 2 + ((xx >> 1) & 1), 1, 1, p.or[2]);
      if (xx % 6 === 0) F(xx, 4, 2, 1, p.or[0]);
    }
    F(0, 6, 72, 1, p.or[0]);
    F(0, 7, 72, 1, ENC);
    for (let xx = 0; xx < 72; xx++) {
      const u = xx % 12;
      const d = 3 + Math.round(4 * Math.sin((Math.PI * (u + 0.5)) / 12));
      F(xx, 8, 1, d, u < 2 ? p.vel[1] : u > 9 ? p.vel[0] : p.vel[2]);
      F(xx, 8 + d, 1, 1, p.or[2]);
      F(xx, 9 + d, 1, 1, ENC);
      if (u === 0) {
        F(xx, 11, 1, 3, p.or[3]);
        F(xx, 14, 1, 1, p.or[1]);
      }
    }
    // La rampe de la tribune (une travée de 24) : main courante d'or, balustres, plinthe.
    this.rampeT = f.surface(24, 13);
    y = this.rampeT.pinceau;
    F(0, 0, 24, 1, p.or[3]);
    F(0, 1, 24, 1, p.or[1]);
    F(0, 2, 24, 1, p.or[0]);
    for (let xx = 0; xx < 24; xx += 6) {
      F(xx + 2, 3, 1, 7, p.or[2]);
      F(xx + 3, 3, 1, 7, p.or[0]);
      F(xx + 1, 5, 1, 3, p.or[1]);
      F(xx + 4, 5, 1, 3, p.or[0]);
    }
    F(0, 10, 24, 1, p.or[2]);
    F(0, 11, 24, 1, p.or[1]);
    F(0, 12, 24, 1, p.or[0]);
    // Les projecteurs de la nuit : un cône de lumière tramé qui s'ouvre vers le bas.
    this.cones ??= {
      faisceau: this.cone(BAS - HORIZON + 34, 0.3, 0.2, "rgba(255,232,160,.26)"),
      douche: this.cone(BAS - 60, 0.06, 0.26, "rgba(255,226,150,.2)"),
      lanterne: this.cone(26, 0, 0.42, "rgba(255,200,110,.2)"),
    };
  }
  /** Un faisceau de projecteur : un cône de lumière tramé, qui s'ouvre vers le bas. */
  private cone(h: number, derive: number, ouv: number, coul: string): Cone {
    const w = Math.ceil(Math.abs(derive) * h + 2 * ouv * h + 10);
    const s = this.fabrique.surface(w, h);
    const x = s.pinceau;
    const ax = derive >= 0 ? 4 + ouv * h : w - 4 - ouv * h;
    x.fillStyle = coul;
    for (let y = 0; y < h; y++) {
      const cx = ax + derive * y;
      const hw = 1.5 + ouv * y;
      for (let xx = Math.floor(cx - hw); xx <= cx + hw; xx++) {
        const d = Math.abs(xx + 0.5 - cx) / hw;
        if (d < 1 && (1 - d) * (0.72 - (0.42 * y) / h) > BAYER[(y & 3) * 4 + (xx & 3)]! + 0.5) x.fillRect(xx, y, 1, 1);
      }
    }
    return { image: s.image, ax: Math.round(ax) };
  }

  private peindreUnMorceau(k: number): ImageDeLaScene {
    const p = this.p;
    const z = this.lieux();
    const x0 = k * MORCEAU;
    const s = this.fabrique.surface(MORCEAU, H);
    const x = s.pinceau;
    const R = (a: number, b: number, w: number, h: number, coul: string): void => {
      x.fillStyle = coul;
      x.fillRect(Math.round(a - x0), b, w, h);
    };
    const visible = (a: number, marge = 70): boolean => a > x0 - marge && a < x0 + MORCEAU + marge;
    // l'herbe, la piste de sable fin et ses six couloirs
    R(x0, HORIZON, MORCEAU, H - HORIZON, p.herbe);
    R(x0, HORIZON, MORCEAU, 1, p.herbe2);
    for (let l = 0; l < 6; l++) R(x0, PISTE + l * VOIE, MORCEAU, VOIE, l % 2 ? p.terre2 : p.terre);
    R(x0, PISTE - 1, MORCEAU, 1, p.herbe3);
    R(x0, BAS, MORCEAU, 1, p.herbe3);
    for (let i = 0; i < 340; i++) {
      const n = k * 977 + i;
      const wx = x0 + Math.floor(hache(n) * MORCEAU);
      const wy = PISTE + 1 + Math.floor(hache(n + 5000) * (6 * VOIE - 2));
      R(wx, wy, hache(n + 9000) < 0.3 ? 2 : 1, 1, hache(n + 7000) < 0.55 ? p.grain : p.grain2);
    }
    for (let l = 1; l < 6; l++) for (let wx = Math.ceil(x0 / 8) * 8; wx < x0 + MORCEAU; wx += 8) R(wx, PISTE + l * VOIE, 4, 1, p.trait);
    for (let i = 0; i < 60; i++) {
      const n = k * 311 + i;
      const wx = x0 + Math.floor(hache(n + 100) * MORCEAU);
      const haut = hache(n + 200) < 0.62;
      const wy = haut ? HORIZON + 2 + Math.floor(hache(n + 300) * 8) : BAS + 2 + Math.floor(hache(n + 300) * 3);
      if (hache(n + 400) < 0.3) R(wx, wy, 1, 1, p.fleurs[Math.floor(hache(n + 500) * p.fleurs.length)]!);
      else {
        R(wx, wy, 1, 2, p.herbe3);
        R(wx + 1, wy - 1, 1, 2, p.herbe2);
      }
    }
    // le gué : un ruisseau en travers de la piste, ses rives, ses roseaux
    if (visible(z.gue0, 120) || visible(z.gue1, 120)) {
      for (let y = HORIZON + 1; y < H; y++) {
        const a = z.gue0 + rive(y, 1);
        const b = z.gue1 + rive(y, 4);
        R(a - 2, y, 2, 1, p.grain);
        R(b + 1, y, 2, 1, p.grain);
        R(a, y, b - a + 1, 1, p.eau);
        R(a, y, 2, 1, p.eau3);
        R(b - 1, y, 2, 1, p.eau3);
        for (let i = 0; i < 3; i++) {
          const n = y * 31 + i * 7;
          const wx = a + 3 + Math.floor(hache(n) * Math.max(1, b - a - 8));
          if (hache(n + 1) < 0.5) R(wx, y, 2 + Math.floor(hache(n + 2) * 3), 1, p.eau2);
        }
      }
      for (let i = 0; i < 9; i++) {
        const wx = z.gue0 - 4 + i * ((z.gue1 - z.gue0 + 8) / 8) + hache(i + 40) * 3;
        const h = 7 + Math.floor(hache(i + 50) * 6);
        R(wx, HORIZON + 2 - h, 1, h, p.arbre2);
        R(wx, HORIZON + 1 - h, 1, 3, p.tronc2);
        R(wx + 1, HORIZON + 5 - h, 1, h - 4, p.arbre);
      }
      for (let i = 0; i < 12; i++) {
        const wy = PISTE + 4 + i * 9 + Math.floor(hache(i + 60) * 4);
        const a = z.gue0 + rive(wy, 1) - 5 + Math.floor(hache(i + 61) * 3);
        const b = z.gue1 + rive(wy, 4) + 3;
        R(i % 2 ? a : b, wy, 3, 2, p.grain2);
        R(i % 2 ? a : b, wy + 1, 3, 1, p.grain);
      }
    }
    // le pré : des buissons et de jeunes arbres, puis la lisse dorée devant eux
    const pre = (a: number): boolean => (a < z.foret0 - 30 && !(a > z.gue0 - 14 && a < z.gue1 + 14)) || (a > z.foret1 + 30 && a < z.pal0 - 2);
    for (let i = Math.floor((x0 - 80) / 58); i <= Math.floor((x0 + MORCEAU + 80) / 58); i++) {
      const wx = i * 58 + Math.floor(hache(i + 800) * 30);
      if (!pre(wx) || wx > z.pal0 - 16 || hache(i + 810) < 0.3) continue;
      if (hache(i + 820) < 0.45) {
        const h = 22 + Math.floor(hache(i + 830) * 12);
        R(wx - 1, HORIZON - h + 8, 3, h - 6, p.tronc);
        R(wx + 1, HORIZON - h + 8, 1, h - 6, p.tronc2);
        rond(x, Math.round(wx - x0), HORIZON - h + 2, 10, 9, p.arbre2);
        rond(x, Math.round(wx - x0) - 2, HORIZON - h, 8, 7, p.arbre);
        rond(x, Math.round(wx - x0) - 4, HORIZON - h - 2, 4, 3, p.arbre3);
      } else {
        rond(x, Math.round(wx - x0), HORIZON - 3, 9, 6, p.arbre2);
        rond(x, Math.round(wx - x0) - 1, HORIZON - 5, 7, 4, p.arbre);
        rond(x, Math.round(wx - x0) - 3, HORIZON - 6, 3, 2, p.arbre3);
      }
    }
    for (let wx = Math.floor((x0 - 20) / 16) * 16; wx < x0 + MORCEAU + 20; wx += 16) {
      if (!pre(wx)) continue;
      if (pre(wx + 16)) {
        R(wx, HORIZON - 3, 16, 1, p.or[3]);
        R(wx, HORIZON - 2, 16, 1, p.or[1]);
        R(wx, HORIZON - 1, 16, 1, p.or[0]);
        R(wx, HORIZON + 2, 16, 1, p.or[2]);
        R(wx, HORIZON + 3, 16, 1, p.or[0]);
      }
      R(wx, HORIZON - 6, 2, 13, p.or[1]);
      R(wx + 1, HORIZON - 6, 1, 13, p.or[0]);
      R(wx - 1, HORIZON - 8, 4, 2, p.or[2]);
      R(wx, HORIZON - 9, 2, 1, p.or[3]);
    }
    // la forêt : un fond sombre, des troncs, un toit de feuilles ; le sous-bois sur la piste ; des lanternes d'or aux troncs
    if (x0 + MORCEAU > z.foret0 - 40 && x0 < z.foret1 + 40) {
      const a = Math.max(x0, z.foret0);
      const b = Math.min(x0 + MORCEAU, z.foret1);
      if (b > a) R(a, 0, b - a, HORIZON + 1, p.fond);
      for (let y = PISTE; y < BAS; y++) {
        const a2 = z.foret0 + Math.round(hache(y * 13 + 5) * 14) - (y % 2) * 3;
        const b2 = z.foret1 - Math.round(hache(y * 13 + 9) * 14) + (y % 2) * 3;
        const aa = Math.max(x0, a2);
        const bb = Math.min(x0 + MORCEAU, b2);
        if (bb > aa) R(aa, y, bb - aa, 1, p.sousBois);
      }
      for (let i = Math.floor((x0 - 60) / 23); i <= Math.floor((x0 + MORCEAU + 60) / 23); i++) {
        const wx = i * 23 + Math.floor(hache(i + 1200) * 12);
        if (wx < z.foret0 - 8 || wx > z.foret1 + 8) continue;
        const w = 4 + Math.floor(hache(i + 1210) * 5);
        const pied = HORIZON + 3 + Math.floor(hache(i + 1220) * 6);
        R(wx, 20, w, pied - 20, p.tronc);
        R(wx + w - 2, 20, 2, pied - 20, p.tronc2);
        R(wx - 1, pied - 2, w + 2, 2, p.tronc);
        R(wx, 36 + Math.floor(hache(i + 1230) * 22), 2, 1, p.tronc2);
        if (i % 4 === 0) {
          R(wx + w, HORIZON - 22, 3, 1, p.or[0]);
          R(wx + w + 2, HORIZON - 21, 1, 2, p.or[0]);
          R(wx + w + 1, HORIZON - 19, 3, 1, p.or[2]);
          R(wx + w + 1, HORIZON - 18, 3, 3, p.nuit ? O(7) : p.or[1]);
          R(wx + w + 1, HORIZON - 15, 3, 1, p.or[0]);
        }
      }
      for (let i = Math.floor((x0 - 60) / 17); i <= Math.floor((x0 + MORCEAU + 60) / 17); i++) {
        const wx = i * 17 + Math.floor(hache(i + 1300) * 9);
        if (wx < z.foret0 - 22 || wx > z.foret1 + 22) continue;
        const cy = 16 + Math.floor(hache(i + 1310) * 18);
        const rx = 13 + Math.floor(hache(i + 1320) * 7);
        const cx = Math.round(wx - x0);
        rond(x, cx, cy, rx, 13, p.foret2);
        rond(x, cx - 2, cy - 3, rx - 4, 9, p.foret);
        if (hache(i + 1330) < 0.6) rond(x, cx - 5, cy - 6, 4, 3, p.foret3);
      }
      if (b > a) R(a, 0, b - a, 9, p.foret2);
      for (let i = 0; i < 46; i++) {
        const n = k * 131 + i;
        const wx = x0 + Math.floor(hache(n + 1400) * MORCEAU);
        if (wx < z.foret0 || wx > z.foret1) continue;
        const wy = PISTE + 2 + Math.floor(hache(n + 1410) * (6 * VOIE - 4));
        if (hache(n + 1420) < 0.2) {
          x.fillStyle = p.tache;
          const cx = Math.round(wx - x0);
          for (let yy = -2; yy <= 2; yy++) {
            const d = 7 - Math.abs(yy) * 2;
            x.fillRect(cx - d, wy + yy, 2 * d, 1);
          }
        } else R(wx, wy, 2, 1, p.feuille[Math.floor(hache(n + 1430) * 3)]!);
      }
      for (let i = Math.floor((x0 - 10) / 9); i <= Math.floor((x0 + MORCEAU + 10) / 9); i++) {
        const wx = i * 9 + Math.floor(hache(i + 1500) * 5);
        if (wx < z.foret0 || wx > z.foret1 || hache(i + 1510) < 0.4) continue;
        R(wx, HORIZON + 4, 1, 4, p.foret3);
        R(wx - 1, HORIZON + 5, 3, 1, p.foret);
        R(wx - 2, HORIZON + 7, 5, 1, p.foret);
      }
    }
    // la tribune d'or de l'arrivée : un mur de velours bordeaux à plis et à losanges, deux gradins, des colonnes d'or
    if (x0 + MORCEAU > z.pal0 - 10 && x0 < z.pal1 + 10) {
      const a = Math.max(x0, z.pal0);
      const b = Math.min(x0 + MORCEAU, z.pal1);
      const haut = 10;
      const bas = PISTE - 2;
      if (b > a) {
        R(a, haut, b - a, bas - haut, p.vel[1]);
        for (let wx = Math.ceil(a / 8) * 8; wx < b; wx += 8) {
          R(wx, haut, 1, bas - haut, p.vel[0]);
          R(wx + 1, haut, 1, bas - haut, p.vel[2]);
        }
        for (let wx = Math.ceil(a / 24) * 24; wx < b; wx += 24)
          for (let yy = haut + 12 + ((wx / 24) % 2) * 12; yy < bas - 8; yy += 24) {
            R(wx + 12, yy, 1, 1, p.or[2]);
            R(wx + 11, yy + 1, 3, 1, p.or[1]);
            R(wx + 12, yy + 2, 1, 1, p.or[0]);
          }
        for (const yy of [HORIZON - 24, HORIZON - 8]) {
          R(a, yy, b - a, 1, p.or[2]);
          R(a, yy + 1, b - a, 1, p.or[0]);
          R(a, yy + 2, b - a, 2, p.vel[0]);
        }
        R(a, bas, b - a, 1, p.or[1]);
        R(a, bas + 1, b - a, 1, p.or[0]);
      }
      for (let wx = Math.ceil(Math.max(x0 - 8, z.pal0) / 72) * 72; wx < Math.min(x0 + MORCEAU + 8, z.pal1); wx += 72) {
        R(wx, haut, 5, bas - haut + 2, p.or[1]);
        R(wx, haut, 1, bas - haut + 2, p.or[3]);
        R(wx + 1, haut, 1, bas - haut + 2, p.or[2]);
        R(wx + 4, haut, 1, bas - haut + 2, p.or[0]);
        R(wx - 1, haut + 6, 7, 2, p.or[2]);
        R(wx - 1, haut + 8, 7, 1, p.or[0]);
        R(wx - 1, bas - 1, 7, 3, p.or[1]);
        R(wx - 1, bas - 1, 7, 1, p.or[3]);
        R(wx - 1, bas + 2, 7, 1, p.or[0]);
      }
    }
    // la ligne d'arrivée : un damier de rubis et d'ivoire, un mât d'or et son oriflamme bordeaux
    const f = this.fin();
    const rubis = css(ton(RUBIS, 4));
    const ivoire = css(ton(IVOIRE, 5));
    if (visible(f, 120)) {
      for (let y = PISTE; y < BAS; y += 2) {
        const d = biais(y);
        R(f + d, y, 2, 2, (y / 2) % 2 ? ivoire : rubis);
        R(f + d + 2, y, 2, 2, (y / 2) % 2 ? rubis : ivoire);
      }
      const fm = f + biais(PISTE) + 1;
      R(fm, 24, 3, PISTE - 24, p.or[1]);
      R(fm, 24, 1, PISTE - 24, p.or[3]);
      R(fm + 2, 24, 1, PISTE - 24, p.or[0]);
      R(fm - 1, 21, 5, 3, p.or[2]);
      R(fm, 20, 3, 1, p.or[3]);
      R(fm - 1, 23, 5, 1, p.or[0]);
      for (let i = 0; i < 21; i++) {
        const r = i < 15 ? 0 : i - 14;
        const w = 13 - 2 * r;
        R(fm + 3 + r, 26 + i, w, 1, i < 2 ? V(7) : V(5));
        R(fm + 3 + r + w - 1, 26 + i, 1, 1, V(3));
      }
      for (let j = 0; j < 5; j++) R(fm + 9 - (j < 3 ? j : 4 - j), 31 + j, 1 + 2 * (j < 3 ? j : 4 - j), 1, j < 2 ? O(7) : O(5));
      R(fm + 3, 26, 13, 1, p.or[2]);
    }
    // la ligne de départ : un trait de chaux, un portique d'or et sa plaque de laque
    if (visible(DEPART_X, 140)) {
      for (let y = PISTE; y < BAS; y++) {
        R(DEPART_X + 2 + biais(y), y, 1, 1, p.trait);
        if (y % 3) R(DEPART_X + 3 + biais(y), y, 1, 1, p.trait);
      }
      const dp = DEPART_X + biais(PISTE) + 2;
      for (const dx of [-25, 23]) {
        R(dp + dx, HORIZON - 38, 3, 44, p.or[1]);
        R(dp + dx, HORIZON - 38, 1, 44, p.or[3]);
        R(dp + dx + 2, HORIZON - 38, 1, 44, p.or[0]);
        R(dp + dx - 1, HORIZON - 41, 5, 3, p.or[2]);
        R(dp + dx, HORIZON - 42, 3, 1, p.or[3]);
        R(dp + dx - 1, HORIZON + 5, 5, 2, p.or[0]);
      }
      const pl = this.img("depart", plaqueDuDepart);
      x.drawImage(pl, Math.round(dp - x0 - pl.width / 2), HORIZON - 36);
    }
    // les mâts des projecteurs le long de la piste : une lampe d'or, une oriflamme
    for (let wx = Math.ceil((x0 - 10) / 170) * 170 + 60; wx < x0 + MORCEAU + 10; wx += 170) {
      if (!this.matIci(wx, z)) continue;
      R(wx, HORIZON - 36, 2, 46, p.or[1]);
      R(wx + 1, HORIZON - 36, 1, 46, p.or[0]);
      R(wx - 1, HORIZON + 9, 4, 2, p.or[0]);
      R(wx - 2, HORIZON - 41, 8, 5, css(ENCRE));
      R(wx - 1, HORIZON - 40, 6, 3, p.or[1]);
      R(wx - 1, HORIZON - 40, 6, 1, p.or[3]);
      R(wx + 5, HORIZON - 39, 2, 2, p.lampe);
      R(wx + 5, HORIZON - 39, 1, 1, p.nuit ? O(8) : p.or[2]);
      for (let i = 0; i < 9; i++) R(wx - 5 + (i > 6 ? i - 6 : 0), HORIZON - 32 + i, 5 - (i > 6 ? i - 6 : 0), 1, i === 0 ? V(7) : V(5));
      R(wx - 4, HORIZON - 29, 2, 2, p.or[2]);
    }
    return s.image;
  }
  /** Ce qui passe devant les coureurs : l'herbe du bord, des fougères en forêt, la lisse dorée du premier plan. */
  private peindreUnDevant(k: number): ImageDeLaScene {
    const p = this.p;
    const z = this.lieux();
    const x0 = k * MORCEAU;
    const s = this.fabrique.surface(MORCEAU, 10);
    const x = s.pinceau;
    const R = (a: number, b: number, w: number, h: number, coul: string): void => {
      x.fillStyle = coul;
      x.fillRect(Math.round(a - x0), b, w, h);
    };
    for (let wx = Math.floor((x0 - 24) / 24) * 24; wx < x0 + MORCEAU + 24; wx += 24) {
      const eau = this.dansLeGue(wx + 1, H - 4);
      const eau2 = this.dansLeGue(wx + 25, H - 4);
      if (!eau && !eau2 && !this.dansLeGue(wx + 12, H - 4)) {
        R(wx, 3, 24, 1, p.or[3]);
        R(wx, 4, 24, 1, p.or[1]);
        R(wx, 5, 24, 1, p.or[0]);
      }
      if (!eau) {
        R(wx, 1, 2, 9, p.or[1]);
        R(wx + 1, 1, 1, 9, p.or[0]);
        R(wx - 1, 0, 4, 2, p.or[2]);
        R(wx, 0, 2, 1, p.or[3]);
      }
    }
    for (let i = Math.floor((x0 - 10) / 7); i <= Math.floor((x0 + MORCEAU + 10) / 7); i++) {
      const wx = i * 7 + Math.floor(hache(i + 2000) * 5);
      if (this.dansLeGue(wx, H - 2)) continue;
      const enForet = wx > z.foret0 && wx < z.foret1;
      const h = 2 + Math.floor(hache(i + 2010) * (enForet ? 5 : 3));
      if (hache(i + 2020) < (enForet ? 0.75 : 0.5)) {
        R(wx, 10 - h, 1, h, enForet ? p.foret : p.herbe3);
        R(wx + 1, 11 - h, 1, h - 1, enForet ? p.foret3 : p.herbe2);
        R(wx - 1, 12 - h, 1, h - 2, enForet ? p.foret2 : p.herbe3);
      }
    }
    return s.image;
  }
  private morceau(k: number): ImageDeLaScene {
    let m = this.morceaux.get(k);
    if (!m) {
      m = this.peindreUnMorceau(k);
      this.morceaux.set(k, m);
      if (this.morceaux.size > 24) this.morceaux.delete(this.morceaux.keys().next().value!);
    }
    return m;
  }
  private devant(k: number): ImageDeLaScene {
    let m = this.devants.get(k);
    if (!m) {
      m = this.peindreUnDevant(k);
      this.devants.set(k, m);
      if (this.devants.size > 24) this.devants.delete(this.devants.keys().next().value!);
    }
    return m;
  }

  /* --- Les coureurs --- */

  /** Une nouvelle course : six familiers tirés parmi ceux de la course, la caméra au départ, la tribune au calme. */
  nouvelleCourse(alea: () => number = Math.random): void {
    const ids = [...FAMILIERS_DE_LA_COURSE];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    const choisis = ids.map(familierQuiCourt).filter((f): f is FamilierQuiCourt => f !== null).slice(0, 6);
    this.coureurs = choisis.map((f, voie) => {
      const taille = Math.max(f.toile.w, f.toile.h);
      const petit = 1 - Math.min(1, (taille - 14) / 50);
      return {
        f,
        img: this.img(`f|${f.id}`, () => f.toile),
        w: f.toile.w,
        h: f.toile.h,
        voie,
        x: DEPART_X,
        part: 0,
        vitesse: 0,
        phase: alea(),
        cadence: 2.7 + petit * 2.4,
        saut: 2.2 + (1 - petit) * 2.2,
        hop: 0,
        souffle: alea() * 6,
        arrive: false,
        ecrase: false,
      };
    });
    this.finDesSons();
    this.phase = "paris";
    this.voie = -1;
    this.gagnant = -1;
    this.t = 0;
    this.annonce = false;
    this.ecrit = [];
    this.heures = [];
    this.cam = this.camCible = 0;
    this.fete = 0;
    this.lueur = 0;
    this.lueurT = undefined;
    this.particules = [];
  }

  /** Le départ : la course est écrite pour le gagnant du serveur (`alea` ne fait que dessiner les allures). */
  depart(gagnant: number, alea: () => number = Math.random): void {
    this.gagnant = gagnant;
    this.ecrit = ecrireLaCourse(gagnant, alea, this.coureurs.length || 6);
    this.heures = this.ecrit.map(heureDArrivee);
    this.phase = "depart";
    this.t = 0;
    this.tambourA = 0;
    this.dits = 0;
    this.annonce = false;
  }

  /** Les coureurs à l'instant `t` de la course. */
  placer(t: number): void {
    for (const c of this.coureurs) {
      const e = this.ecrit[c.voie];
      if (!e) continue;
      const a = avancee(e, t);
      c.part = a.part;
      c.vitesse = a.vitesse;
      c.x = DEPART_X + a.part * this.L;
      if (a.arrive) c.arrive = true;
    }
  }

  /** La course est-elle en route (départ, course, arrivée en train de passer) ? */
  enCourse(): boolean {
    return this.phase === "depart" || this.phase === "course" || this.phase === "fini";
  }
  /** Faut-il des images vives (la course, la fête, les poussières, la lueur, la caméra qui glisse) ? Sinon, une image lente suffit. */
  vif(): boolean {
    return this.enCourse() || this.fete > 0 || this.particules.length > 0 || this.lueurT !== undefined || Math.abs(this.camCible - this.cam) > 0.5;
  }
  /** Le meneur de la course (le plus avancé). */
  meneur(): CoureurEnPiste | null {
    return this.coureurs.reduce<CoureurEnPiste | null>((a, c) => (!a || c.x > a.x ? c : a), null);
  }

  /** Le temps passe de `dt` secondes. */
  pas(dt: number): void {
    this.horloge += dt;
    if (this.phase === "depart") {
      this.t += dt;
      for (const c of this.coureurs) {
        c.ecrase = this.t > 0.25;
        c.hop = 0;
      }
      if (this.t >= 1.05) {
        this.phase = "course";
        this.t = 0;
        for (const c of this.coureurs) c.ecrase = false;
        timbale(0, 52, 0.2, 0.5);
      }
    } else if (this.phase === "course" || this.phase === "fini") {
      this.t += dt;
      this.placer(this.t);
      const allure = 1 / 13.4;
      for (const c of this.coureurs) {
        const elan = Math.min(1.5, c.vitesse / allure);
        const av = c.phase;
        c.phase += dt * c.cadence * (0.35 + 0.65 * elan);
        c.hop = elan < 0.08 ? 0 : Math.abs(Math.sin(c.phase * Math.PI)) * c.saut * Math.min(1, elan + 0.2);
        c.ecrase = elan >= 0.08 && c.phase % 1 < 0.14;
        if (Math.floor(c.phase) !== Math.floor(av) && elan > 0.15) this.atterrir(c);
      }
      const meneur = this.meneur();
      if (meneur) this.camCible = Math.max(0, Math.min(meneur.x - this.W * 0.68, this.fin() - this.W * 0.7));
      this.sonsDeCourse(dt);
      // le croupier commente, sobrement : qui mène vraiment, à mi-course puis dans la dernière ligne droite
      if (meneur && this.phase === "course" && ((this.dits === 0 && meneur.part > 0.5) || (this.dits === 1 && meneur.part > 0.8))) {
        this.ev.commente?.(this.dits ? "Dernière ligne droite" : "La forêt", `Le couloir ${meneur.voie + 1} mène`);
        this.dits++;
      }
      if (this.phase === "course" && this.t >= (this.heures[this.gagnant] ?? Infinity)) {
        this.phase = "fini";
        this.arrivee();
      }
      if (this.phase === "fini" && this.t > Math.max(...this.heures) + 2.2) {
        this.phase = "repos";
        for (const c of this.coureurs) {
          c.hop = 0;
          c.ecrase = false;
        }
        this.finDesSons();
      }
    } else
      for (const c of this.coureurs) {
        c.souffle += dt;
        c.ecrase = c.souffle % 3.4 < 0.5;
        c.hop = 0;
      }
    this.cam += (this.camCible - this.cam) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.camCible - this.cam) < 0.3) this.cam = this.camCible;
    for (const q of this.particules) {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += q.g * dt;
    }
    this.particules = this.particules.filter((q) => q.age < q.vie);
    if (this.fete > 0) this.fete = Math.max(0, this.fete - dt / 5);
    if (this.lueurT !== undefined) {
      this.lueurT += dt;
      const d = this.lueurDuree;
      this.lueur = this.lueurT >= d ? 0 : Math.sin((this.lueurT / d) * Math.PI) * (0.75 + 0.25 * Math.sin(this.lueurT * 1.6));
      if (this.lueurT >= d) this.lueurT = undefined;
    }
  }

  /** Une foulée qui retombe : un peu de poussière, une gerbe d'eau dans le gué, et le galop. */
  private atterrir(c: CoureurEnPiste): void {
    const p = this.p;
    const b = base(c.voie);
    const bx = c.x + biais(b);
    const eau = this.dansLeGue(bx - c.w / 2, b);
    const n = eau ? 5 : 2 + (c.w > 34 ? 1 : 0);
    for (let i = 0; i < n; i++)
      this.particules.push({
        x: bx - c.w * (0.3 + Math.random() * 0.6),
        y: b - 1,
        vx: -(14 + Math.random() * 22),
        vy: -(eau ? 26 + Math.random() * 22 : 6 + Math.random() * 10),
        g: eau ? 90 : 14,
        age: 0,
        vie: eau ? 0.5 : 0.45 + Math.random() * 0.3,
        t: Math.random() < 0.4 ? 2 : 1,
        coul: eau ? p.ecume : p.poussiere,
        alpha: eau ? 0.95 : 0.7,
        devant: eau,
      });
    const sx = c.x - this.cam;
    if (sx < -20 || sx > this.W + 20) return;
    const tps = this.maintenant();
    if (tps - this.dernierGalop < 48) return;
    this.dernierGalop = tps;
    // le galop : une peau sourde par foulée, plus grave pour les gros ; dans le gué, une gerbe d'eau
    const gros = Math.min(1, Math.max(c.w, c.h) / 60);
    if (eau) souffle(0, 0.16, "bandpass", 1400, 500, 0.9, 0.035 + gros * 0.03, 0.01);
    else {
      peau(0, 150 - gros * 78, 0.03 + gros * 0.05, 0.09, 1.7);
      souffle(0, 0.035, "lowpass", 420, 140, 0.7, 0.012 + gros * 0.02, 0.002);
    }
  }

  /** Les sons de la course : le murmure de la tribune, la clameur qui monte, le tambour de la dernière ligne droite. */
  private sonsDeCourse(dt: number): void {
    const fait = Math.min(1, Math.max(...this.coureurs.map((c) => c.part)));
    if (!this.murmure && this.phase === "course") {
      this.murmure = SONS.roulement(380, 0.7, 0.012);
      this.clameur = this.murmure && SONS.roulement(820, 1.1, 0.0001);
    }
    if (this.murmure && this.clameur && this.phase === "course") {
      this.murmure.regle(0.012 + 0.016 * fait, 360 + 160 * fait);
      this.clameur.regle((0.016 * Math.max(0, fait - 0.6)) / 0.4, 820);
    }
    if (this.phase === "course" && fait > 0.62) {
      this.tambourA -= dt;
      if (this.tambourA <= 0) {
        const k = (fait - 0.62) / 0.38;
        timbale(0, 56, 0.05 + 0.1 * k, 0.5);
        this.tambourA = 0.62 - 0.4 * k;
      }
    }
  }
  /** Le silence de la tribune (fin de la course, son coupé, jeu quitté). */
  finDesSons(): void {
    this.murmure?.fin();
    this.clameur?.fin();
    this.murmure = this.clameur = null;
  }

  /** Le gagnant passe la ligne : la tribune exulte, le jeu est prévenu (une seule fois par course). */
  private arrivee(): void {
    if (this.annonce) return;
    this.annonce = true;
    this.fete = 1;
    const gagne = this.voie === this.gagnant;
    const c = this.clameur;
    if (c) {
      c.regle(gagne ? 0.05 : 0.03, 820);
      setTimeout(() => c.regle(0.004, 820), 1600);
    }
    this.murmure?.regle(0.02, 520);
    this.ev.arrivee?.();
  }
  /** Un gain : une lueur chaude qui monte et redescend lentement sur la scène (plus longue pour un grand gain). */
  allumer(grand: boolean): void {
    this.lueurT = 0;
    this.lueurDuree = grand ? 6.5 : 3.2;
  }

  /** Sans mouvement (pause, mouvement réduit, jeu quitté) : la course en route est posée à son arrivée, le résultat se lit tout de suite. */
  finirDUnCoup(): void {
    if (this.phase !== "depart" && this.phase !== "course") return;
    this.phase = "repos";
    this.t = Math.max(...this.heures) + 3;
    this.placer(this.t);
    for (const c of this.coureurs) {
      c.hop = 0;
      c.ecrase = false;
    }
    this.cam = this.camCible = Math.max(0, this.fin() - this.W * 0.7);
    this.finDesSons();
    this.arrivee();
  }
  /** Tout s'arrête : une course en route est posée à son arrivée, les effets s'éteignent. */
  figer(): void {
    if (this.phase === "depart" || this.phase === "course") this.finirDUnCoup();
    else if (this.phase === "fini") {
      this.phase = "repos";
      this.t = Math.max(...this.heures) + 3;
      this.placer(this.t);
      this.finDesSons();
    }
    this.lueur = 0;
    this.lueurT = undefined;
    this.particules = [];
    for (const c of this.coureurs) {
      c.hop = 0;
      c.ecrase = false;
    }
  }

  /* --- Le dessin d'une image --- */

  /** Peint l'image entière. */
  dessiner(g: Pinceau): void {
    if (!this.ciel || !this.loin || !this.pres || !this.toit || !this.rampeT || !this.cones) return;
    const p = this.p;
    const W = this.W;
    const cam = Math.round(this.cam);
    const z = this.lieux();
    const t = this.horloge;
    const fige = this.sansMouvement();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.ciel.image, 0, 0);
    if (!p.etoile)
      for (let i = 0; i < 5; i++) {
        const nx = Math.round(((((i * 173 + 40 - cam * 0.04 - t * (fige ? 0 : 1.1)) % (W + 120)) + W + 120) % (W + 120)) - 60);
        const ny = 9 + ((i * 13) % 30);
        nuage(g, nx, ny, 12 + (i % 3) * 5, p);
      }
    for (const [im, par] of [
      [this.loin.image, 0.1],
      [this.pres.image, 0.3],
    ] as const) {
      const dx = -((((cam * par) % TUILE) + TUILE) % TUILE);
      for (let x = dx; x < W; x += TUILE) g.drawImage(im, Math.round(x), 0);
    }
    const k0 = Math.floor(cam / MORCEAU);
    const k1 = Math.floor((cam + W) / MORCEAU);
    for (let k = k0; k <= k1; k++) g.drawImage(this.morceau(k), k * MORCEAU - cam, 0);
    // l'eau du gué scintille, lentement
    if (cam + W > z.gue0 - 10 && cam < z.gue1 + 10) {
      g.fillStyle = p.ecume;
      for (let i = 0; i < 14; i++) {
        const y = HORIZON + 4 + ((i * 37) % (H - HORIZON - 6));
        const a = z.gue0 + rive(y, 1) + 3;
        const b = z.gue1 + rive(y, 4) - 4;
        const ph = (t * 0.35 + i * 0.37) % 1;
        if (ph < 0.5) g.fillRect(Math.round(a + hache(i + 3) * (b - a) - cam), y, 2, 1);
      }
    }
    // la tribune : de vrais Gaulois, qui se balancent et sautent de joie à l'arrivée ; devant eux la rampe d'or, au-dessus le toit
    if (cam + W > z.pal0 - 10) {
      const foule = gauloisDeLaTribune();
      const poteau = this.fin() + biais(PISTE) + 2;
      for (let rang = 0; rang < 2; rang++)
        for (let i = rang; i < 40; i += 2) {
          const wx = z.pal0 + 10 + i * 33;
          if (wx > z.pal1 - 44) break;
          const n = (i * 5 + 3) % foule.length;
          const im = this.img(`g|${n}`, () => foule[n]!);
          const sx = Math.round(wx - cam);
          if (sx < -44 || sx > W + 4 || Math.abs(wx + im.width / 2 - poteau - 8) < 20) continue;
          const joie = this.fete > 0 ? Math.abs(Math.sin(t * 5.2 + i * 1.3)) * 4 * Math.min(1, this.fete) : 0;
          const calmeY = fige ? 0 : Math.round(Math.abs(Math.sin(t * 1.1 + i * 2.1)) * 1.2);
          g.drawImage(im, sx, Math.round(PISTE - 3 - (rang ? 0 : 3) - im.height - joie - calmeY));
        }
      for (let wx = Math.max(z.pal0, Math.floor(cam / 24) * 24); wx < Math.min(cam + W, z.pal1); wx += 24) g.drawImage(this.rampeT.image, Math.round(wx - cam), PISTE - 14);
      for (let wx = Math.max(z.pal0, Math.floor(cam / 72) * 72); wx < Math.min(cam + W + 6, z.pal1); wx += 72) {
        const sx = Math.round(wx - cam);
        g.drawImage(this.toit.image, sx, 2);
        g.fillStyle = p.vel[2];
        g.fillRect(sx - 3, PISTE - 12, 11, 9);
        g.fillRect(sx - 2, PISTE - 3, 9, 1);
        g.fillRect(sx, PISTE - 2, 5, 1);
        g.fillStyle = p.vel[0];
        g.fillRect(sx + 7, PISTE - 12, 1, 9);
        g.fillStyle = p.or[2];
        g.fillRect(sx - 3, PISTE - 12, 11, 1);
        g.fillRect(sx + 2, PISTE - 9, 1, 1);
        g.fillRect(sx + 1, PISTE - 8, 3, 1);
        g.fillRect(sx + 2, PISTE - 7, 1, 1);
      }
      g.fillStyle = p.or[1];
      g.fillRect(Math.round(z.pal0 - 4 - cam), 2, 4, 7);
      g.fillStyle = p.or[3];
      g.fillRect(Math.round(z.pal0 - 4 - cam), 3, 4, 1);
    }
    // les ombres, puis les coureurs, du couloir du fond à celui de devant
    for (const c of this.coureurs) {
      const b = base(c.voie);
      const sx = Math.round(c.x - cam) + biais(b);
      if (sx < -10 || sx - c.w > W + 10 || this.dansLeGue(c.x + biais(b) - c.w / 2, b)) continue;
      g.fillStyle = p.ombre;
      const lw = Math.max(4, Math.round(c.w * (0.78 - c.hop * 0.03)));
      g.fillRect(sx - c.w + Math.round((c.w - lw) / 2), b, lw, 2);
      g.fillRect(sx - c.w + Math.round((c.w - lw) / 2) + 2, b + 2, lw - 4, 1);
    }
    for (const q of this.particules) if (!q.devant) this.particule(g, q, cam);
    for (const c of this.coureurs) {
      const b = base(c.voie);
      const sx = Math.round(c.x - cam) + biais(b);
      if (sx < -6 || sx - c.w > W + 6) continue;
      const hop = Math.round(c.hop);
      const ecrase = c.ecrase ? 1 : 0;
      const dansLEau = this.dansLeGue(c.x + biais(b) - c.w / 2, b);
      const enfonce = dansLEau ? 2 : 0;
      g.drawImage(c.img, 0, 0, c.w, c.h, sx - c.w, b + 1 - c.h - hop + ecrase + enfonce, c.w, c.h - ecrase);
      if (dansLEau) {
        g.fillStyle = p.eau;
        g.fillRect(sx - c.w - 1, b, c.w + 2, 3);
        g.fillStyle = p.eau2;
        g.fillRect(sx - c.w, b - 1, c.w, 1);
        g.fillStyle = p.ecume;
        g.fillRect(sx - c.w + 1, b - 1, 2, 1);
        g.fillRect(sx - 4, b - 1, 3, 1);
      }
    }
    for (const q of this.particules) if (q.devant) this.particule(g, q, cam);
    // la nuit, les projecteurs : un faisceau par mât, une douche de lumière par travée de la tribune, les lanternes de la forêt
    if (p.nuit) {
      const { faisceau, douche, lanterne } = this.cones;
      const r = fige ? 0 : Math.sin(t * 0.5) * 0.08;
      g.globalAlpha = 0.92 + r;
      for (let wx = Math.ceil((cam - 160) / 170) * 170 + 60; wx < cam + W + 20; wx += 170) if (this.matIci(wx, z)) g.drawImage(faisceau.image, Math.round(wx + 6 - cam) - faisceau.ax, HORIZON - 38);
      for (let wx = Math.max(z.pal0, Math.floor((cam - 80) / 72) * 72); wx < Math.min(cam + W + 40, z.pal1); wx += 72) g.drawImage(douche.image, Math.round(wx + 38 - cam) - douche.ax, 15);
      for (let i = Math.floor((cam - 60) / 92); i <= Math.floor((cam + W + 60) / 92); i++) {
        const j = i * 4;
        const wx = j * 23 + Math.floor(hache(j + 1200) * 12);
        if (wx < z.foret0 - 8 || wx > z.foret1 + 8) continue;
        g.drawImage(lanterne.image, Math.round(wx + 4 + Math.floor(hache(j + 1210) * 5) + 2 - cam) - lanterne.ax, HORIZON - 15);
      }
      g.globalAlpha = 1;
    }
    for (let k = k0; k <= k1; k++) g.drawImage(this.devant(k), k * MORCEAU - cam, H - 10);
    // les dossards, au-dessus de chacun ; la flèche d'or au-dessus du pari
    const flecheImg = this.img("fleche", fleche);
    for (const c of this.coureurs) {
      const b = base(c.voie);
      const sx = Math.round(c.x - cam - c.w / 2) + biais(b);
      const mien = c.voie === this.voie;
      if (sx < -10 || sx > W + 10) continue;
      const y = b - c.h - 18 - Math.round(c.hop * 0.4);
      g.drawImage(this.img(`d|${c.voie}|${mien}`, () => dossard(c.voie, mien)), sx - 6, y);
      if (mien) g.drawImage(flecheImg, sx - 4, y - 8 - (fige ? 0 : Math.round(Math.sin(t * 2.2) * 1.4 + 1)));
    }
    // un gain : une lueur chaude qui monte et redescend lentement
    if (this.lueur > 0) {
      g.fillStyle = `rgba(255,196,80,${(0.16 * this.lueur).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }
  private particule(g: Pinceau, q: Particule, cam: number): void {
    const sx = Math.round(q.x - cam);
    const a = Math.max(0, 1 - q.age / q.vie);
    if (sx < -4 || sx > this.W + 4) return;
    g.globalAlpha = a * q.alpha;
    g.fillStyle = q.coul;
    g.fillRect(sx, Math.round(q.y), q.t, q.t);
    g.globalAlpha = 1;
  }
}

/** Le bord ondulé du gué. */
const rive = (y: number, k: number): number => Math.round(3 * Math.sin(y / 7 + k) + 2 * Math.sin(y / 3 + k * 2));
/** Un rond plein, ligne par ligne. */
function rond(x: Pinceau, cx: number, cy: number, rx: number, ry: number, coul: string): void {
  x.fillStyle = coul;
  for (let yy = -ry; yy <= ry; yy++) {
    const d = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry + 0.01))));
    x.fillRect(cx - d, cy + yy, 2 * d + 1, 1);
  }
}
/** Un nuage de jour. */
function nuage(g: Pinceau, x: number, y: number, r: number, p: PaletteDeLaCourse): void {
  rond(g, x, y, r, 3, p.nuage2);
  rond(g, x - 3, y - 2, Math.round(r * 0.6), 3, p.nuage);
  rond(g, x + 4, y - 1, Math.round(r * 0.5), 2, p.nuage);
  g.fillStyle = p.nuage;
  g.fillRect(x - r, y, 2 * r, 1);
}
