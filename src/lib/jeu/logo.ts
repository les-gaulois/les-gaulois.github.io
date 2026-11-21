/**
 * Le logo « Mon Gaulois » dessiné en cases : onze lettres, « MON » en crème et « GAULOIS » en or, avec leur épaisseur et
 * leur cerne d'encre (maquette validée par le pilote, planche de Claude Fable 5.2, 20 novembre 2026). `grand` : deux fois
 * plus fin, angles adoucis, et le filet tricolore dessous (l'écran d'ordinateur) ; sinon la version de la barre du jeu.
 */
import { PAL } from "./palette";
import { Planche, R, rr } from "./planche";

const LETTRES: Readonly<Record<string, string[]>> = {
  M: ["###.....###", "####...####", "#####.#####", "###########", "###.###.###", "###..#..###", "###.....###", "###.....###", "###.....###", "###.....###", "###.....###"],
  O: ["..#####..", ".#######.", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", ".#######.", "..#####.."],
  N: ["###....###", "####...###", "#####..###", "######.###", "###.######", "###..#####", "###...####", "###....###", "###....###", "###....###", "###....###"],
  G: ["..######.", ".########", "###....##", "###......", "###......", "###.#####", "###.#####", "###...###", "###...###", ".########", "..######."],
  A: ["...###...", "..#####..", ".###.###.", "###...###", "###...###", "###...###", "#########", "#########", "###...###", "###...###", "###...###"],
  U: ["###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", ".#######.", "..#####.."],
  L: ["###.....", "###.....", "###.....", "###.....", "###.....", "###.....", "###.....", "###.....", "###.....", "########", "########"],
  I: ["###", "###", "###", "###", "###", "###", "###", "###", "###", "###", "###"],
  S: ["..######.", ".########", "###....##", "###......", ".#####...", "..#####..", "...#####.", "......###", "##....###", "########.", ".######.."],
};

const MOTS: readonly (readonly [string, readonly string[], string])[] = [
  ["MON", ["#ffffff", "#ffffff", "#f6f1e3", "#f6f1e3", "#ffffff", "#e6e0cf", "#e6e0cf", "#cfd6ee", "#b9c6ee", "#9cb0e6", "#7f95d6"], "#1a2f8a"],
  ["GAULOIS", ["#fffbe6", "#fff2a8", "#ffd84a", "#ffd84a", "#fffbe6", "#ffc61a", "#ffc61a", "#e8aa14", "#d9981b", "#c8860e", "#9c6a0c"], "#6b2d00"],
];

const DEJA = new Map<boolean, Planche>();

/** Le logo. Dessiné une fois par taille. */
export function logo(grand: boolean): Planche {
  const deja = DEJA.get(grand);
  if (deja) return deja;
  let w = 0;
  const lettres: [string[], number, number][] = [];
  MOTS.forEach(([mot], im) => {
    for (const ch of mot) {
      const l = LETTRES[ch]!;
      lettres.push([l, w, im]);
      w += l[0]!.length + 1;
    }
    w += 4;
  });
  w -= 5;
  let lw = w;
  let lh = 11;
  let masque = new Uint8Array(lw * lh);
  for (const [lignes, x0, im] of lettres)
    lignes.forEach((l, y) => {
      for (let x = 0; x < l.length; x++) if (l[x] === "#") masque[y * lw + x0 + x] = im + 1;
    });
  const f = grand ? 2 : 1;
  if (grand) {
    // Doublé, les marches d'escalier adoucies.
    const m2 = new Uint8Array(lw * 2 * lh * 2);
    const v = (x: number, y: number): number => (x < 0 || y < 0 || x >= lw || y >= lh ? 0 : masque[y * lw + x]!);
    for (let y = 0; y < lh; y++)
      for (let x = 0; x < lw; x++) {
        const P = v(x, y);
        const A = v(x, y - 1);
        const B = v(x + 1, y);
        const C = v(x - 1, y);
        const D = v(x, y + 1);
        const i = y * 2 * lw * 2 + x * 2;
        m2[i] = C === A && C !== D && A !== B ? A : P;
        m2[i + 1] = A === B && A !== C && B !== D ? B : P;
        m2[i + lw * 2] = D === C && D !== B && C !== A ? C : P;
        m2[i + lw * 2 + 1] = B === D && B !== A && D !== C ? D : P;
      }
    masque = m2;
    lw *= 2;
    lh *= 2;
  }
  const creux = grand ? 3 : 2;
  const W = lw + 4;
  const HL = lh + creux + 3;
  const H = grand ? HL + 8 : HL;
  const c = new Planche(W, H);
  const carte: (string | null)[] = new Array(W * H).fill(null);
  const m = (x: number, y: number): number => (x < 0 || y < 0 || x >= lw || y >= lh ? 0 : masque[y * lw + x]!);
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const im = m(x, y);
      if (!im) continue;
      let coul = MOTS[im - 1]![1][Math.floor(y / f)]!;
      if (grand) {
        if (!m(x, y - 1)) coul = "#ffffff";
        else if (!m(x - 1, y) && y % 2 === 0) coul = im === 1 ? "#ffffff" : "#fff2a8";
        else if (!m(x, y + 1)) coul = im === 1 ? "#6f86cf" : "#8a5a06";
      }
      carte[(y + 1) * W + x + 2] = coul;
    }
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const im = m(x, y);
      if (!im) continue;
      for (let d = 1; d <= creux; d++) {
        const i = (y + 1 + d) * W + x + 2;
        if (!carte[i]) carte[i] = d === creux && grand ? (im === 1 ? "#12205e" : "#3a1800") : MOTS[im - 1]![2];
      }
    }
  const plein = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < HL && carte[y * W + x] !== null;
  for (let y = 0; y < HL; y++)
    for (let x = 0; x < W; x++) {
      const coul = carte[y * W + x];
      if (coul) {
        R(c, x, y, 1, 1, coul);
        continue;
      }
      let voisin = false;
      for (let dy = -1; dy <= 1 && !voisin; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (plein(x + dx, y + dy)) {
            voisin = true;
            break;
          }
      if (voisin) R(c, x, y, 1, 1, PAL.k);
    }
  if (grand) {
    // Le filet tricolore.
    const y0 = HL + 1;
    rr(c, 1, y0, W - 2, 7, 1, PAL.k);
    const t = Math.floor((W - 4) / 3);
    [
      ["#cfe2ff", "#9cc2ff", "#2f6bff", "#2f6bff", "#0b3fc4"],
      ["#ffffff", "#ffffff", "#f6f1e3", "#f6f1e3", "#cfc9b8"],
      ["#ffc2c5", "#ff8a8f", "#e0263a", "#e0263a", "#a8101f"],
    ].forEach((cl, i) => {
      const x = 2 + i * t;
      const l = i === 2 ? W - 4 - 2 * t : t;
      cl.forEach((coul, jj) => R(c, x, y0 + 1 + jj, l, 1, coul));
    });
  }
  DEJA.set(grand, c);
  return c;
}
