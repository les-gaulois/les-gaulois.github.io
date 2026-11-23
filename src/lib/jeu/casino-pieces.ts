/**
 * Les images fixes du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22
 * novembre 2026), faites à la construction dans `/village/kit.css` (`kit-css.ts`), comme le reste du kit :
 *
 * - les variantes « casino » des pièces du kit : les mêmes dessins (`PIECES_EN_NEUF_PARTS`), aux matières du palais (laque et
 *   or la nuit, ivoire et or le jour) : `--cas-s-panneau`, `--cas-s-ecran`, `--cas-s-bulle` ; le bouton bleu et le ruban
 *   rouge reteints en bordeaux : `--cas-s-btn-bordeaux-<état>`, `--cas-s-ruban` ;
 * - les pièces des tables (`PIECES_DES_TABLES` de `casino-toile.ts`) : `--cas-s-<nom>` ;
 * - les petites icônes blanches du casino, sur 16 cases comme celles de la barre : `--cas-pic-<nom>` ;
 * - l'icône du menu, « Le casino » : un dé d'os appuyé sur un statère, finie comme les icônes du kit : `--jeu-ic-casino`.
 */
import { JETONS_DES_PIECES, type JetonsDesPieces } from "./palette";
import { PIECES_EN_NEUF_PARTS } from "./pieces";
import { Planche, R, cerne, ell, marge, rr, volume } from "./planche";
import { PIECES_DES_TABLES, type Toile } from "./casino-toile";

type Theme = "clair" | "sombre";

/**
 * Les matières du palais, aux mêmes noms que les jetons des pièces du kit : ivoire et or le jour, laque bordeaux presque
 * noire et or la nuit (le bordeaux à la place du pourpre, soir du 22 novembre 2026). L'écriture en pixels du kit y garde AA
 * (texte, doux et or : 5,8 à 18 de contraste).
 */
export const MATIERES_DU_PALAIS: Readonly<Record<Theme, JetonsDesPieces>> = {
  clair: { trait: "#2a1a05", face: "#fffdf6", lumiere: "#f0c44a", ombrePiece: "#9c6a0c", creux: "#eadfc2", ombre: "rgba(42,26,5,.28)", page: "#f8f3e6" },
  sombre: { trait: "#070305", face: "#1d0910", lumiere: "#d9a21b", ombrePiece: "#6b4208", creux: "#3a0d18", ombre: "rgba(2,2,8,.55)", page: "#11050a" },
};

const piece = (nom: string): ((j: JetonsDesPieces) => Planche) => {
  const p = PIECES_EN_NEUF_PARTS.find((x) => x.nom === nom);
  if (!p) throw new Error(`pièce du kit inconnue : ${nom}`);
  return p.dessin;
};

/**
 * Le bouton bordeaux et le ruban bordeaux du palais : les couleurs du bouton bleu et du ruban rouge du kit
 * (`pieces.ts`), une à une, et leur bordeaux. Crème cerné d'encre dessus : 6,4 à 9,1 de contraste, AA dans les deux thèmes.
 */
export const BORDEAUX_DU_BOUTON: Readonly<Record<string, string>> = {
  // au repos : clair, corps, bas, tranche
  "#7fa6ff": "#d9727f",
  "#2f55d8": "#8f1f35",
  "#2343b4": "#73182a",
  "#12256e": "#3f0c17",
  // survolé
  "#b9d4ff": "#efa3ad",
  "#3f6dff": "#a3263e",
  "#2a50d0": "#841c31",
  // enfoncé
  "#5f86e8": "#c25c6a",
  "#2647b8": "#7c1a2e",
  "#1d3897": "#641527",
};
export const BORDEAUX_DU_RUBAN: Readonly<Record<string, string>> = { "#ff8a8f": "#d06a78", "#e0263a": "#7f1a2e", "#a8101f": "#611424", "#c01a2c": "#6e1729", "#6e0a15": "#3a0912" };

/** Reteint une planche : chaque couleur de `carte` (`#rrggbb`) devient la sienne ; les autres ne bougent pas (or, encre, ombre). */
export function reteindre(p: Planche, carte: Readonly<Record<string, string>>): Planche {
  const d = p.data;
  const cible = new Map<number, [number, number, number]>();
  for (const [de, vers] of Object.entries(carte)) cible.set(parseInt(de.slice(1), 16), [parseInt(vers.slice(1, 3), 16), parseInt(vers.slice(3, 5), 16), parseInt(vers.slice(5, 7), 16)]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = cible.get((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    if (!c) continue;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  return p;
}

/** L'icône du menu, « Le casino » : un dé d'os appuyé sur un statère (24 cases, finie comme les icônes du kit). */
export function iconeDuCasino(): Planche {
  const ic = new Planche(24, 24);
  ell(ic, 15.5, 8.5, 7, 7, "#d9981b");
  ell(ic, 15.5, 8.5, 5.4, 5.4, "#ffd84a");
  ell(ic, 15.5, 8.5, 3.2, 3.2, "#ffc61a");
  R(ic, 13, 5, 3, 1, "#fffbe6");
  R(ic, 14, 8, 3, 1, "#9c6a0c");
  R(ic, 16, 7, 2, 1, "#9c6a0c");
  R(ic, 14, 9, 1, 2, "#9c6a0c");
  R(ic, 17, 9, 1, 2, "#9c6a0c");
  rr(ic, 2, 8, 14, 14, 2, "#f6f1e3");
  R(ic, 3, 20, 12, 1, "#cfc9b8");
  R(ic, 14, 10, 1, 10, "#cfc9b8");
  R(ic, 4, 9, 9, 1, "#fffbe6");
  for (const [x, y] of [
    [5, 11],
    [11, 11],
    [8, 14],
    [5, 17],
    [11, 17],
  ] as const)
    R(ic, x, y, 2, 2, "#070b1f");
  marge(ic, 24);
  return volume(cerne(ic));
}

/* ---------- Les petites icônes blanches du casino, sur 16 cases ---------- */

/** Une plume de 16 sur 16 : un masque (1 peint, 0 vide) et ses outils. */
interface Plume {
  g: Uint8Array;
  p(x: number, y: number, v?: number): void;
  r(x: number, y: number, w: number, h: number, v?: number): void;
  l(x0: number, y0: number, x1: number, y1: number, e?: number): void;
  c(cx: number, cy: number, r: number, e?: number, v?: number): void;
  d(cx: number, cy: number, r: number, v?: number): void;
}
function plume(): Plume {
  const g = new Uint8Array(256);
  const api: Plume = {
    g,
    p(x, y, v = 1) {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y * 16 + x] = v;
    },
    r(x, y, w, h, v = 1) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) api.p(i, j, v);
    },
    l(x0, y0, x1, y1, e = 1) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
      for (let k = 0; k <= n; k++) api.r(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), e, e);
    },
    c(cx, cy, r, e = 1.2, v = 1) {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r && d > r - e) g[y * 16 + x] = v;
        }
    },
    d(cx, cy, r, v = 1) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= r) g[y * 16 + x] = v;
    },
  };
  return api;
}
const PETITES: Readonly<Record<string, (g: Plume) => void>> = {
  retour(g) {
    g.l(3, 7, 7, 3, 2);
    g.l(3, 7, 7, 11, 2);
    g.r(4, 7, 9, 2);
  },
  annuler(g) {
    g.c(8, 8.5, 5.2, 1.6);
    g.r(0, 0, 8, 8, 0);
    g.l(3, 4, 7, 4, 2);
    g.l(3, 4, 3, 8, 2);
    g.r(3, 4, 2, 2);
    g.l(4, 5, 6, 3);
  },
  effacer(g) {
    g.l(4, 4, 11, 11, 2);
    g.l(11, 4, 4, 11, 2);
  },
  rejouer(g) {
    g.c(7.5, 8, 5.4, 1.6);
    g.r(8, 0, 8, 7, 0);
    g.l(8, 3, 12, 3, 1);
    g.r(9, 1, 2, 5);
    g.r(11, 2, 1, 3);
    g.p(12, 3);
  },
  roue(g) {
    g.c(7.5, 7.5, 6.8, 1.6);
    g.d(7.5, 7.5, 1.6);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      g.l(7.5 + Math.cos(a) * 2, 7.5 + Math.sin(a) * 2, 7.5 + Math.cos(a) * 5, 7.5 + Math.sin(a) * 5);
    }
  },
  bourse(g) {
    g.d(7.5, 9.5, 4.8);
    g.r(5, 3, 6, 2);
    g.r(6, 5, 4, 1);
    g.r(6, 8, 4, 1, 0);
    g.r(6, 10, 4, 1, 0);
    g.r(7, 8, 1, 3, 0);
  },
  tout(g) {
    g.r(3, 3, 4, 4);
    g.r(9, 3, 4, 4);
    g.r(3, 9, 4, 4);
    g.r(9, 9, 4, 4);
  },
  table(g) {
    g.r(3, 2, 8, 11);
    g.r(4, 3, 6, 9, 0);
    g.r(6, 4, 8, 11);
    g.r(7, 5, 6, 9, 0);
    g.d(9.5, 9, 1.4);
    g.p(9.5, 7);
    g.p(10, 7);
  },
  machine(g) {
    g.r(2, 3, 10, 10);
    g.r(3, 5, 8, 5, 0);
    g.r(5, 5, 1, 5);
    g.r(8, 5, 1, 5);
    g.r(13, 4, 1, 6);
    g.d(13.5, 3.5, 1.4);
    g.r(4, 11, 6, 1, 0);
  },
  course(g) {
    g.r(3, 2, 1, 12);
    g.r(4, 3, 8, 6);
    g.r(6, 3, 2, 2, 0);
    g.r(10, 3, 2, 2, 0);
    g.r(4, 5, 2, 2, 0);
    g.r(8, 5, 2, 2, 0);
    g.r(6, 7, 2, 2, 0);
    g.r(10, 7, 2, 2, 0);
  },
  bouclier(g) {
    g.r(3, 2, 10, 6);
    g.l(3, 8, 7, 13, 2);
    g.l(12, 8, 8, 13, 2);
    g.r(5, 4, 6, 4, 0);
    g.r(6, 8, 4, 2, 0);
    g.r(7, 10, 2, 1, 0);
    g.l(6, 6, 7, 8);
    g.l(7, 8, 10, 5);
  },
  balance(g) {
    g.r(7, 2, 2, 11);
    g.r(4, 13, 8, 1);
    g.r(2, 4, 12, 1);
    g.l(2, 5, 1, 9);
    g.l(3, 5, 4, 9);
    g.r(1, 9, 4, 1);
    g.l(12, 5, 11, 9);
    g.l(13, 5, 14, 9);
    g.r(11, 9, 4, 1);
  },
  piece(g) {
    g.c(7.5, 7.5, 6.4, 1.6);
    g.d(7.5, 7.5, 2.2);
  },
  chevron(g) {
    g.l(4, 6, 7, 9, 2);
    g.l(11, 6, 8, 9, 2);
  },
  livre(g) {
    g.r(2, 3, 5, 10);
    g.r(9, 3, 5, 10);
    g.r(7, 4, 2, 10);
    g.r(3, 4, 3, 8, 0);
    g.r(10, 4, 3, 8, 0);
    g.r(3, 6, 3, 1);
    g.r(10, 6, 3, 1);
    g.r(3, 8, 3, 1);
    g.r(10, 8, 3, 1);
  },
  sablier(g) {
    g.c(7.5, 7.5, 6.4, 1.6);
    g.r(7, 4, 2, 4);
    g.r(7, 7, 4, 2);
  },
  fleche(g) {
    g.l(12, 7, 8, 3, 2);
    g.l(12, 7, 8, 11, 2);
    g.r(3, 7, 9, 2);
  },
  losange(g) {
    for (let i = 0; i < 6; i++) {
      g.r(7 - i, 2 + i, 2 + 2 * i, 1);
      g.r(7 - i, 13 - i, 2 + 2 * i, 1);
    }
  },
  rond(g) {
    g.d(7.5, 7.5, 5.6);
    g.d(7.5, 7.5, 2.6, 0);
  },
  colonne(g) {
    for (let i = 0; i < 5; i++) g.r(9 - i, 3 + i, 1, 10 - 2 * i);
  },
  des(g) {
    g.r(2, 2, 12, 12);
    g.r(3, 3, 10, 10, 0);
    g.r(5, 5, 2, 2);
    g.r(9, 9, 2, 2);
    g.r(9, 5, 2, 2);
    g.r(5, 9, 2, 2);
  },
};
/** Les noms des petites icônes du casino (`--cas-pic-<nom>`). */
export const PETITES_ICONES_DU_CASINO = Object.keys(PETITES);
export type PetiteIconeDuCasino = keyof typeof PETITES;

/** Une petite icône du casino : 16 cases, en blanc crème comme celles de la barre. */
export function petiteIconeDuCasino(nom: string): Planche {
  const f = PETITES[nom];
  if (!f) throw new Error(`icône du casino inconnue : ${nom}`);
  const g = plume();
  f(g);
  const p = new Planche(16, 16);
  for (let k = 0; k < 256; k++) if (g.g[k]) R(p, k % 16, (k / 16) | 0, 1, 1, "#f6f1e3");
  return p;
}

/**
 * Les marques de la roue, sur 5 cases (23 novembre 2026, dessin de Claude Opus 5.5 à la place de la relecture prévue pour
 * Claude Fable 5.2, « fini avec opus ») : le losange plein des rouges et le rond percé des bleus, les formes des icônes du
 * tapis en petit, pour dire la couleur d'un numéro sans la couleur, là où l'icône de 16 cases ne tient pas (« Vos tours »,
 * les cases étroites du tapis). Crème, comme les petites icônes. Le rond est un anneau épais percé d'un point, comme celui
 * du tapis : un rond fin, sous un chiffre, se lisait comme un zéro.
 */
const MARQUES: Readonly<Record<"losange" | "rond", readonly string[]>> = {
  losange: ["..X..", ".XXX.", "XXXXX", ".XXX.", "..X.."],
  rond: [".XXX.", "XXXXX", "XX.XX", "XXXXX", ".XXX."],
};
export const MARQUES_DE_LA_ROUE = Object.keys(MARQUES) as (keyof typeof MARQUES)[];
export function marqueDeLaRoue(forme: keyof typeof MARQUES): Planche {
  const p = new Planche(5, 5);
  MARQUES[forme].forEach((ligne, y) => [...ligne].forEach((c, x) => c === "X" && R(p, x, y, 1, 1, "#f6f1e3")));
  return p;
}

/** Une variable de `/village/kit.css` pour le casino : son nom entier, si elle change avec le thème, et son image. */
export interface VariableDuCasino {
  nom: string;
  theme: boolean;
  valeur: (theme: Theme) => Planche;
}

/** Une toile du casino en planche du kit, que `kit-css.ts` sait changer en image. */
function enPlanche(t: Toile): Planche {
  const p = new Planche(t.w, t.h);
  p.data.set(t.d);
  return p;
}

/** Toutes les images du casino, dans l'ordre où `kit-css.ts` les écrit. */
export const VARIABLES_DU_CASINO: readonly VariableDuCasino[] = [
  ...(["panneau", "ecran", "bulle"] as const).map((nom): VariableDuCasino => ({ nom: `--cas-s-${nom}`, theme: true, valeur: (theme) => piece(nom)(MATIERES_DU_PALAIS[theme]) })),
  ...(["repos", "survol", "enfonce"] as const).map((etat): VariableDuCasino => ({ nom: `--cas-s-btn-bordeaux-${etat}`, theme: true, valeur: (theme) => reteindre(piece(`btn-bleu-${etat}`)(JETONS_DES_PIECES[theme]), BORDEAUX_DU_BOUTON) })),
  { nom: "--cas-s-ruban", theme: false, valeur: () => reteindre(piece("ruban")(JETONS_DES_PIECES.clair), BORDEAUX_DU_RUBAN) },
  ...Object.entries(PIECES_DES_TABLES).map(([nom, dessin]): VariableDuCasino => ({ nom: `--cas-s-${nom}`, theme: false, valeur: () => enPlanche(dessin()) })),
  ...PETITES_ICONES_DU_CASINO.map((nom): VariableDuCasino => ({ nom: `--cas-pic-${nom}`, theme: false, valeur: () => petiteIconeDuCasino(nom) })),
  ...MARQUES_DE_LA_ROUE.map((forme): VariableDuCasino => ({ nom: `--cas-marque-${forme}`, theme: false, valeur: () => marqueDeLaRoue(forme) })),
  { nom: "--jeu-ic-casino", theme: false, valeur: iconeDuCasino },
];
