/**
 * L'écriture en pixels du kit de « Mon Gaulois » : des capitales de 5 cases sur 7 (la cédille descend d'une case), celles de
 * la maquette validée par le pilote (planche de Claude Fable 5.2, 19-21 novembre 2026). Elle écrit les mots du cadre du jeu
 * (menu, rubans, chiffres de « Ma carte », pastilles) ; les textes des parties restent en lettres du site, lisibles et
 * sélectionnables. Chaque mot écrit en cases a son texte pour les lecteurs d'écran à côté (`Px.tsx`, `jeu.ts`).
 *
 * Deux façons d'écrire :
 * - `masqueDuTexte` : les lettres seules, en blanc, pour un masque CSS dont la feuille donne la couleur (`.jeu-px`, 16-jeu.css) :
 *   le texte suit alors le thème sans être redessiné ;
 * - `ecrire` : les lettres dans une couleur, avec leur ombre ou leur cerne, pour les dessins qui l'embarquent (étiquettes,
 *   compteur, cases).
 */
import { Planche, R } from "./planche";

/** La hauteur d'une ligne écrite, cédille comprise. */
export const HAUTEUR_DES_LETTRES = 8;

const BRUT: Readonly<Record<string, string>> = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".####/#..../#..../#..../#..../#..../.####",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".####/#..../#..../#.###/#...#/#...#/.###.",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "###/.#./.#./.#./.#./.#./###",
  J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
  N: "#...#/##..#/##..#/#.#.#/#..##/#..##/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#",
  X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": "..#../.##../..#../..#../..#../..#../.###.",
  "2": ".###./#...#/....#/...#./..#../.#.../#####",
  "3": "####./....#/....#/.###./....#/....#/####.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": ".###./#..../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../..#../..#../..#..",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/....#/.###.",
  " ": "../../../../../../..",
  ".": "./././././#/#",
  ",": "../../../../../.#/.#",
  ":": "././#/./#/./.",
  "!": "#/#/#/#/#/./#",
  "?": ".###./#...#/....#/...#./..#../...../..#..",
  "+": ".../.../.#./###/.#./.../...",
  "-": ".../.../.../###/.../.../...",
  "/": "..#/..#/.#./.#./.#./#../#..",
  "%": "#..#/#..#/..#./.##./.#../#..#/#..#",
  "'": "#/#/./././.",
  '"': "#.#/#.#/.../.../.../.../...",
  "(": ".#/#./#./#./#./#./.#",
  ")": "#./.#/.#/.#/.#/.#/#.",
  "[": "##/#./#./#./#./#./##",
  "]": "##/.#/.#/.#/.#/.#/##",
  "É": "..##./...../#####/#..../####./#..../#####",
  "È": ".##../...../#####/#..../####./#..../#####",
  "Ê": ".###./...../#####/#..../####./#..../#####",
  "Ë": ".#.#./...../#####/#..../####./#..../#####",
  "À": ".##../...../.###./#...#/#####/#...#/#...#",
  "Â": ".###./...../.###./#...#/#####/#...#/#...#",
  "Ô": ".###./...../.###./#...#/#...#/#...#/.###.",
  "Î": "###/.../###/.#./.#./.#./###",
  "Ï": "#.#/.../###/.#./.#./.#./###",
  "Ù": ".##../...../#...#/#...#/#...#/#...#/.###.",
  "Û": ".###./...../#...#/#...#/#...#/#...#/.###.",
  "Ü": ".#.#./...../#...#/#...#/#...#/#...#/.###.",
};

interface Glyphe {
  largeur: number;
  lignes: string[];
  /** La rangée sous la ligne : la cédille. */
  sous?: string;
}

const GLYPHES = new Map<string, Glyphe>(Object.entries(BRUT).map(([ch, t]) => [ch, { largeur: t.split("/")[0]!.length, lignes: t.split("/") }]));
GLYPHES.set("Ç", { largeur: 5, lignes: BRUT["C"]!.split("/"), sous: "..#.." });
const INCONNU = GLYPHES.get("?")!;

/** Les signes que l'écriture sait tracer. */
export const SIGNES_CONNUS: ReadonlySet<string> = new Set(GLYPHES.keys());

/** Un texte mis en capitales que l'écriture sait tracer : « Œ » devient « OE », les guillemets et apostrophes typographiques les droits. */
export function enCapitales(texte: string): string {
  return texte
    .toUpperCase()
    .replace(/Œ/g, "OE")
    .replace(/Æ/g, "AE")
    .replace(/[’‘]/g, "'")
    .replace(/«\s*/g, '"')
    .replace(/\s*»/g, '"')
    .replace(/[“”]/g, '"')
    .replace(/\s/g, " ")
    .replace(/[–—]/g, "-");
}

const glyphe = (ch: string): Glyphe => GLYPHES.get(ch) ?? INCONNU;

/** La largeur d'un texte, en cases, une case entre deux signes. */
export function largeurDuTexte(texte: string): number {
  let w = 0;
  for (const ch of texte) w += glyphe(ch).largeur + 1;
  return Math.max(1, w - 1);
}

/** Les signes d'un texte que l'écriture ne sait pas tracer (ils s'écriraient « ? »). */
export function signesInconnus(texte: string): string[] {
  return [...new Set([...texte].filter((ch) => !GLYPHES.has(ch)))];
}

function tracer(g: Planche, texte: string, x0: number, y0: number, coul: string): void {
  let x = x0;
  for (const ch of texte) {
    const gl = glyphe(ch);
    gl.lignes.forEach((ligne, y) => {
      for (let i = 0; i < ligne.length; i++) if (ligne[i] === "#") R(g, x + i, y0 + y, 1, 1, coul);
    });
    if (gl.sous) for (let i = 0; i < gl.sous.length; i++) if (gl.sous[i] === "#") R(g, x + i, y0 + 7, 1, 1, coul);
    x += gl.largeur + 1;
  }
}

/** Les lettres seules, en blanc, sur 8 cases de haut : le masque d'un mot (la couleur vient de la feuille de style). */
export function masqueDuTexte(texte: string): Planche {
  const c = new Planche(largeurDuTexte(texte), HAUTEUR_DES_LETTRES);
  tracer(c, texte, 0, 0, "#ffffff");
  return c;
}

/**
 * Un texte dans une couleur, sur 9 cases de haut. `ombre` : son ombre d'une case dessous. `cerne` : un contour d'une case
 * tout autour (la planche a alors une case de plus de chaque côté).
 */
export function ecrire(texte: string, coul: string, ombre: string | null = null, cerne: string | null = null): Planche {
  const c = new Planche(largeurDuTexte(texte) + (cerne ? 2 : 0), 9 + (cerne ? 1 : 0));
  if (cerne) {
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const) tracer(c, texte, dx, dy, cerne);
    tracer(c, texte, 1, 1, coul);
    return c;
  }
  if (ombre) tracer(c, texte, 0, 1, ombre);
  tracer(c, texte, 0, 0, coul);
  return c;
}

/** Coupe un texte en lignes de `max` cases au plus, sans couper un mot ; `n` lignes au plus. */
export function lignesDuTexte(texte: string, max: number, n = 3): string[] {
  const lignes: string[] = [];
  let cours = "";
  for (const mot of texte.split(" ")) {
    const essai = cours ? `${cours} ${mot}` : mot;
    if (largeurDuTexte(essai) <= max || !cours) cours = essai;
    else {
      lignes.push(cours);
      cours = mot;
    }
  }
  lignes.push(cours);
  return lignes.slice(0, n);
}

/** Un nombre écrit à la française, une espace entre les milliers : « 12 480 ». */
export const nombreEcrit = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
