/**
 * Les dessins en pixels de l'onglet « Le sentier » (16 novembre 2026) : une image par mission, le chaudron du défi du clan
 * et la pochette d'un palier, teintée à la couleur de sa rareté. Dessins originaux, faits pour le site (Claude Fable 5.2),
 * case par case : ils ne reprennent aucune œuvre. Tous sont décoratifs : ce qu'ils montrent est toujours écrit à côté.
 * Depuis le 21 novembre 2026 (« Le pass » habillé du kit), le pass garde les images des missions ; le chaudron sert au
 * creuset de la fusion, la pochette teintée au marché de la boutique. Ses autres dessins sont dans `src/lib/jeu/pass-forge.ts`.
 */
import type { MissionDuSentier, RareteDePalier } from "../../lib/village/contrat";
import { POCHETTE_COTE, casesDeLaPochette } from "./PochetteDessin";

/** Un dessin : ses dimensions en cases et ses couleurs « #rrggbb », rangée par rangée ; `null` pour une case vide. */
export interface DessinDuSentier {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** Un dessin écrit en rangées de lettres : chaque lettre est une couleur de la palette, le point une case vide. */
function dessin(rangees: readonly string[], palette: Readonly<Record<string, string>>): DessinDuSentier {
  const largeur = Math.max(...rangees.map((r) => r.length));
  const cases: (string | null)[] = [];
  for (const rangee of rangees) for (let x = 0; x < largeur; x++) cases.push(palette[rangee[x] ?? "."] ?? null);
  return { largeur, hauteur: rangees.length, cases };
}

const EPEE = ["..............ww", ".............wsw", "............wssw", "...........wssd.", "..........wssd..", ".........wssd...", "........wssd....", ".......wssd.....", "..g...wssd......", "..gg.wssd.......", "...ggssd........", "....ggg.........", "...bbggg........", "..bb...gg.......", ".bb.............", "kb.............."] as const;
const ACIER = { w: "#ffffff", s: "#c3cee8", d: "#8a97c4", g: "#f2b632", b: "#b9783a", k: "#a86d0c" } as const;

/** Deux épées croisées : la même épée et son reflet ; là où elles se croisent, la première passe devant. */
function croiser(rangees: readonly string[]): string[] {
  return rangees.map((rangee) => {
    const reflet = [...rangee].reverse();
    return [...rangee].map((lettre, x) => (lettre !== "." ? lettre : (reflet[x] ?? "."))).join("");
  });
}

const MEDAILLE = [".rr....bb.", ".rr....bb.", "..rr..bb..", "..rr..bb..", "...rrbb...", "...yyyy...", "..yllyyy..", ".ylyyyyyd.", ".yyyyyydd.", ".yyyyyydd.", "..yyyydd..", "...dddd..."] as const;
const TROIS = ["......hhhh......", ".hhh..hssh..hhh.", ".sss..ssss..sss.", ".sss..hhhh..sss.", "rrrrr.bbbb.yyyyy", "rrrrrbbbbbbyyyyy", "rrrrrbbbbbbyyyyy", ".rrr.bbbbbb.yyy.", ".k.k..bbbb..k.k.", ".k.k..k..k..k.k."] as const;
const ETOILE = ["......y......", "......y......", ".....yly.....", ".....yly.....", "yyyyyylyyyyyy", ".yylllllllyy.", "..yyllllyyd..", "...yylllyd...", "...yylyyyd...", "..yyyd.yyyd..", "..yyd...yyd..", ".yyd.....ydd."] as const;
const VOIX = ["..wwwwwwwwww..", ".wwwwwwwwwwww.", "wwwwwwbwwwwwww", "wwwbwwbwwbwwww", "wwwbwwbwwbwwww", "wwwbwwbwwbwwww", "wwwwwwbwwwwwww", ".wwwwwwwwwwww.", "..wwwwwwwwww..", "...www........", "...ww.........", "...w.........."] as const;
const OR_ET_RUBANS = { r: "#ff4a5f", b: "#4aa3ff", y: "#f2b632", l: "#fff1a8", d: "#a86d0c" } as const;

/** L'image de chaque mission, sur sa tuile marine. */
export const DESSINS_DES_MISSIONS: Readonly<Record<MissionDuSentier, DessinDuSentier>> = {
  partie: dessin(EPEE, ACIER),
  parties_3: dessin(croiser(EPEE), ACIER),
  victoire: dessin(ETOILE, OR_ET_RUBANS),
  points_3: dessin(MEDAILLE, OR_ET_RUBANS),
  equipe: dessin(TROIS, { h: "#d99a1c", s: "#f2c9a0", r: "#ff4a5f", b: "#4aa3ff", y: "#f2b632", k: "#c3cee8" }),
  vocal: dessin(VOIX, { w: "#ffffff", b: "#0b5fff" }),
  pochette: { largeur: POCHETTE_COTE, hauteur: POCHETTE_COTE, cases: casesDeLaPochette() },
};

const CHAUDRON = { largeur: 40, hauteur: 36 } as const;

/**
 * Le chaudron du défi du clan, rempli d'or à hauteur de `part` (de 0 à 1) : la part des points rapportés au clan
 * aujourd'hui sur ce que le défi demande. Le chiffre est écrit à côté.
 */
export function casesDuChaudron(part: number): DessinDuSentier {
  const { largeur, hauteur } = CHAUDRON;
  const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
  const r = (x: number, y: number, l: number, h: number, couleur: string): void => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + l; i++) if (i >= 0 && j >= 0 && i < largeur && j < hauteur) cases[j * largeur + i] = couleur;
  };
  const ENCRE = "#0a1230";
  const cx = 20;
  const cy = 19;
  const dehors = 13;
  const dedans = 10;
  const plein = Math.min(Math.max(Number.isFinite(part) ? part : 0, 0), 1);
  const niveau = cy + dedans - Math.round(2 * dedans * plein);
  for (let y = -dehors; y <= dehors; y++) {
    if (cy + y < 9) continue;
    const dx = Math.floor(Math.sqrt(dehors * dehors - y * y));
    r(cx - dx - 1, cy + y, dx * 2 + 3, 1, ENCRE);
    r(cx - dx, cy + y, dx * 2 + 1, 1, "#a86d0c");
    r(cx - dx, cy + y, 2, 1, "#f2b632");
    if (Math.abs(y) <= dedans) {
      const di = Math.floor(Math.sqrt(dedans * dedans - y * y));
      r(cx - di, cy + y, di * 2 + 1, 1, plein > 0 && cy + y >= niveau ? "#f2b632" : "#1c2752");
      if (plein > 0 && cy + y === niveau) r(cx - di, cy + y, di * 2 + 1, 1, "#fff1a8");
    }
  }
  // Le bord du chaudron, le feu dessous, deux bulles de vapeur dessus.
  r(cx - 15, 7, 31, 3, ENCRE);
  r(cx - 14, 7, 29, 2, "#f2b632");
  r(cx - 14, 7, 29, 1, "#fff1a8");
  r(10, 33, 20, 3, "#3a2412");
  r(13, 31, 14, 3, "#d91228");
  r(15, 29, 3, 2, "#d91228");
  r(22, 28, 3, 3, "#d91228");
  r(15, 31, 10, 2, "#f2b632");
  r(19, 30, 2, 1, "#fff1a8");
  r(cx - 1, 3, 2, 2, "#c3cee8");
  r(cx + 3, 1, 2, 2, "#c3cee8");
  return { largeur, hauteur, cases };
}

/* La pochette surprise du site (`PochetteDessin.ts`), son cuir reteint aux cinq tons de chaque rareté. Sur le rouge du
   mystique, le cordon rouge passe à l'or ; sur l'or du légendaire, le losange doré passe au blanc. */
const CUIR = ["#f0c27c", "#d99a55", "#b9783a", "#8f5727", "#6b3d1a"] as const;
const CORDON = ["#ff6b78", "#d81e33", "#8f1220"] as const;
const OR = ["#fff1a8", "#f2b632", "#a86d0c"] as const;
const TEINTES: Readonly<Record<RareteDePalier, { cuir: readonly string[]; cordon?: readonly string[]; or?: readonly string[] }>> = {
  commun: { cuir: ["#cfe6ff", "#8cc4ff", "#4aa3ff", "#2478d6", "#0b5cad"] },
  "peu-commun": { cuir: ["#c3caff", "#7f8ef5", "#3a4fe8", "#2a3bc4", "#1b2590"] },
  epique: { cuir: ["#e3ccff", "#bf8cff", "#9b4dff", "#6a1fd0", "#4a1496"] },
  mystique: { cuir: ["#ffc9d1", "#ff7d8f", "#ff2e4a", "#c41730", "#8a0f20"], cordon: OR },
  legendaire: { cuir: ["#fff1a8", "#f8d66a", "#f2b632", "#c98a14", "#8f5f08"], or: ["#ffffff", "#fff6dd", "#d9c79a"] },
};

const POCHETTES = new Map<RareteDePalier, DessinDuSentier>();

/** La pochette d'un palier, à la couleur de la rareté de son objet. Calculée une fois par rareté. */
export function pochetteDeRarete(rarete: RareteDePalier): DessinDuSentier {
  const faite = POCHETTES.get(rarete);
  if (faite) return faite;
  const teinte = TEINTES[rarete];
  const vers = new Map<string, string>();
  CUIR.forEach((couleur, i) => vers.set(couleur, teinte.cuir[i] ?? couleur));
  if (teinte.cordon) CORDON.forEach((couleur, i) => vers.set(couleur, teinte.cordon?.[i] ?? couleur));
  if (teinte.or) OR.forEach((couleur, i) => vers.set(couleur, teinte.or?.[i] ?? couleur));
  const pochette = { largeur: POCHETTE_COTE, hauteur: POCHETTE_COTE, cases: casesDeLaPochette().map((couleur) => (couleur ? (vers.get(couleur) ?? couleur) : null)) };
  POCHETTES.set(rarete, pochette);
  return pochette;
}
