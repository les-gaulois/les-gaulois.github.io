/**
 * Les peintures du hall du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote
 * le 22 novembre 2026, portée telle quelle) : la roue vue de trois quarts, les six vignettes des jeux et la bannière « À
 * l'affiche ». Chacune est peinte point par point à la taille de sa place, dans le thème du moment (de nuit, la laque et la
 * bordeaux ; de jour, l'ivoire et le rose).
 */
import type { JeuDuCasino } from "../village/contrat-casino";
import { familier, statere } from "./casino-dessins";
import {
  AMBRE,
  EMERAUDE,
  ENCRE,
  IVOIRE,
  JOUR,
  NOIR,
  OR,
  BORDEAUX,
  RUBIS,
  SAPHIR,
  Toile,
  bille,
  cadreOr,
  carte,
  de,
  disque,
  ecrisSur,
  grain,
  lueur,
  mur,
  pile,
  plateau,
  ton,
} from "./casino-toile";

/** La roue vue de trois quarts : jonc d'or, piste, 36 cases rubis et saphir, moyeu à rayons, et la bille dans sa case. */
export function roueVue(Tl: Toile, cx: number, cy: number, R: number, k = 0.46, rot = 0.25, ombre = true): void {
  const ry = Math.round(R * k);
  const ep = Math.max(3, Math.round(R * 0.13));
  const c = new Toile(2 * R + 4, 2 * ry + ep + 5);
  const ox = R + 2;
  const oy = ry + 2;
  c.tout((x, y) => {
    const dx = (x - ox) / R;
    const dy = (y - oy) / ry;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    if (r > 1) {
      if (Math.abs(dx) > 1) return null;
      const bas = oy + Math.sqrt(1 - dx * dx) * ry;
      if (y > bas + ep || y < oy) return null;
      const t = (y - bas) / ep;
      return t > 0.82 ? ton(OR, 1) : OR.t(0.62 - Math.abs(dx + 0.35) * 0.42 - t * 0.12 + 0.1 * Math.sin(dx * 14), x, y);
    }
    const lum = 0.5 + 0.5 * Math.cos(a + 2.2);
    const haut = dy < 0 ? 1 : 0;
    if (r > 0.9) return OR.t(0.36 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(2 * a + 1.1), 1.5) + (r > 0.965 ? -0.12 : r < 0.925 ? -0.14 : 0.06), x, y);
    if (r > 0.74) return NOIR.t(0.3 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(a - 4.0), 6) + (haut ? -0.08 : 0.1), x, y, 1);
    if (r > 0.72) return OR.t(0.5 + lum * 0.3, x, y);
    if (r > 0.5) {
      const s = (((a + rot) / (Math.PI * 2)) * 36 + 720) % 36;
      const n = Math.floor(s);
      const f = s - n;
      if (f < 0.1 || f > 0.9) return OR.t(0.52 + lum * 0.3, x, y, 0.4);
      const rp = n % 2 ? SAPHIR : RUBIS;
      return rp.t(0.44 + lum * 0.16 - (r < 0.58 ? 0.14 : 0) + (haut ? -0.1 : 0.06), x, y, 0.8);
    }
    if (r > 0.45) return OR.t(0.4 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(2 * a + 0.4), 2), x, y);
    if (r > 0.17) {
      const s = ((((a + rot * 2) / (Math.PI * 2)) * 8 + 80) % 1);
      if (Math.abs(s - 0.5) < (0.07 / r) * 0.3 + 0.03) return OR.t(0.48 + lum * 0.4, x, y);
      return BORDEAUX.t(0.3 + lum * 0.22 - r * 0.2, x, y, 1);
    }
    return OR.t(0.9 - r * 3 + lum * 0.2 - (dy > 0 ? 0.2 : 0), x, y);
  });
  c.cerne();
  if (ombre)
    Tl.f(cx - R - 6, cy + ry - 2, cx + R + 8, cy + ry + ep + 9, (x, y) => {
      const dx = (x - cx - 2) / (R + 5);
      const dy = (y - cy - ep - 2) / (ry + 4);
      if (dx * dx + dy * dy < 1 && dy > 0.2) Tl.m(x, y, ENCRE, 0.5);
      return null;
    });
  Tl.pose(c, cx - ox, cy - oy);
  // la bille d'ivoire, dans sa case
  const ab = -0.7;
  bille(Tl, Math.round(cx + Math.cos(ab) * R * 0.61), Math.round(cy + Math.sin(ab) * ry * 0.61), Math.max(2, Math.round(R * 0.045)));
}

/** Une pierre de la machine : un rubis en losange ou un saphir rond, taillés. */
function pierre(rp: typeof RUBIS, losange: boolean): Toile {
  const t = new Toile(15, 15);
  t.tout((x, y) => {
    const d = losange ? Math.abs(x - 7) + Math.abs(y - 7) : Math.hypot(x - 7, y - 7) * 1.25;
    return d <= 7 ? rp.t(0.7 - ((x + y) / 28) * 0.5 + (d < 3 ? 0.14 : 0), x, y, 0.8) : null;
  });
  return t.cerne();
}

/* ---------- Les six vignettes ---------- */
/**
 * Le vrai tirage d'un coup, que la vignette montre à la place de son décor d'exemple : l'image d'un gros gain que le robot
 * poste sur Discord (`src/lib/casino-image.ts`, 26 novembre 2026). Le hall n'en passe jamais : ses vignettes restent les
 * mêmes. La machine reçoit les symboles de la ligne du milieu déjà peints (`symbole` de `casino-machine.ts`, que le hall
 * ne charge pas). La roue n'en a pas besoin : l'image pose le numéro sur sa plaque.
 */
export type TirageDeLaVignette =
  | { jeu: "machine"; signes: readonly [Toile, Toile, Toile] }
  | { jeu: "course"; gagnant: number }
  | { jeu: "palissade"; coupe: number }
  | { jeu: "des"; faces: readonly [number, number] };

/** Les trois faces vues d'un dé posé sur `dessus` : dessus, gauche, droite, deux à deux voisines (jamais deux faces opposées). */
export function facesVues(dessus: number): [number, number, number] {
  const voisines = [1, 2, 3, 4, 5, 6].filter((f) => f !== dessus && f !== 7 - dessus);
  const gauche = voisines[0]!;
  const droite = voisines.find((f) => f !== gauche && f !== 7 - gauche)!;
  return [dessus, gauche, droite];
}

/**
 * Les trois couloirs que montre la vignette de la course, de haut en bas, et la place du gagnant parmi eux : les trois
 * numéros qui se suivent autour du couloir gagnant (`gagnant`, de 0 à 5), sans sortir des six.
 */
export function couloirsVus(gagnant: number): { numeros: [number, number, number]; enTete: number } {
  const debut = Math.max(0, Math.min(3, gagnant - 1));
  return { numeros: [debut + 1, debut + 2, debut + 3], enTete: gagnant - debut };
}

const VIGNETTES: Readonly<Record<JeuDuCasino, (Tl: Toile, jour: boolean, tirage?: TirageDeLaVignette) => void>> = {
  "vingt-et-un"(Tl, jour) {
    const h = Tl.h;
    const cx = Tl.w >> 1;
    mur(Tl, jour, 0.5, 0.36);
    plateau(Tl, Math.round(h * 0.56), EMERAUDE);
    lueur(Tl, cx, Math.round(h * 0.5), 60, jour ? 0.25 : 0.34);
    const as = carte(34, 48, "A", "pique").tourne(-0.2).cerne();
    const roi = carte(34, 48, "R", "coeur").tourne(0.16).cerne();
    Tl.poseOmbre(as, cx - 36, Math.round(h * 0.5) - 32, 3, 4);
    Tl.poseOmbre(roi, cx - 6, Math.round(h * 0.5) - 30, 3, 4);
    pile(Tl, cx - 62, h - 12, 5, RUBIS);
    pile(Tl, cx - 44, h - 6, 3, NOIR);
    pile(Tl, cx + 58, h - 10, 6, IVOIRE);
    pile(Tl, cx + 76, h - 18, 3, SAPHIR);
    const s = statere(12);
    Tl.poseOmbre(s, cx + 34, h - 14, 1, 1);
    Tl.poseOmbre(s, cx - 24, h - 13, 1, 1);
  },
  // Le poker du barde (28 novembre 2026) : la quinte flush royale en éventail sur le velours bordeaux.
  poker(Tl, jour) {
    const h = Tl.h;
    const cx = Tl.w >> 1;
    mur(Tl, jour, 0.5, 0.36);
    plateau(Tl, Math.round(h * 0.58), BORDEAUX);
    lueur(Tl, cx, Math.round(h * 0.48), 70, jour ? 0.25 : 0.36);
    const rangs = ["10", "V", "D", "R", "A"];
    rangs.forEach((r, i) => {
      const c = carte(30, 42, r, "coeur").tourne((i - 2) * 0.16).cerne();
      Tl.poseOmbre(c, cx - 15 + (i - 2) * 20, Math.round(h * 0.46) - 26 + Math.abs(i - 2) * 3, 3, 4);
    });
    pile(Tl, cx - 70, h - 10, 4, RUBIS);
    pile(Tl, cx + 66, h - 12, 5, IVOIRE);
    pile(Tl, cx + 84, h - 6, 2, NOIR);
    const s = statere(12);
    Tl.poseOmbre(s, cx - 48, h - 13, 1, 1);
  },
  roue(Tl, jour) {
    const h = Tl.h;
    const cx = Tl.w >> 1;
    mur(Tl, jour, 0.5, 0.4);
    plateau(Tl, Math.round(h * 0.66), BORDEAUX, 0.03);
    lueur(Tl, cx, Math.round(h * 0.5), 70, jour ? 0.2 : 0.3);
    roueVue(Tl, cx, Math.round(h * 0.5), Math.min(64, Math.round(h * 0.54)), 0.5, 0.2);
    pile(Tl, cx - 82, h - 8, 4, EMERAUDE, 8);
    pile(Tl, cx + 84, h - 10, 5, RUBIS, 8);
    pile(Tl, cx + 66, h - 4, 2, IVOIRE, 8);
  },
  machine(Tl, jour, tirage) {
    const tires = tirage?.jeu === "machine" ? tirage.signes : null;
    const h = Tl.h;
    const cx = Tl.w >> 1;
    mur(Tl, jour, 0.5, 0.45);
    plateau(Tl, Math.round(h * 0.84), NOIR, 0.02);
    lueur(Tl, cx, h >> 1, 64, jour ? 0.3 : 0.42, ton(AMBRE, 5));
    const mw = 92;
    const mh = Math.min(h - 14, 96);
    const c = new Toile(mw + 22, mh + 2);
    const x0 = 1;
    const y0 = 1;
    // le coffre : laque noire, fronton d'or, trois fenêtres d'ivoire
    c.f(x0, y0, x0 + mw, y0 + mh, (x, y) => {
      const u = x - x0;
      const v = y - y0;
      const coin = Math.hypot(Math.max(0, 10 - u, u - (mw - 11)), Math.max(0, 10 - v));
      if (coin > 10) return null;
      const bord = Math.min(u, mw - 1 - u, v, mh - 1 - v);
      if (bord < 3 || coin > 7) return OR.t(0.5 + 0.36 * Math.cos((u - v) * 0.09) - (bord === 2 ? 0.2 : 0), x, y);
      return NOIR.t(0.5 - (v / mh) * 0.3 + 0.12 * Math.cos(u * 0.07), x, y, 1);
    });
    const fy = y0 + Math.round(mh * 0.3);
    const fh = Math.round(mh * 0.36);
    const fw = 22;
    cadreOr(c, x0 + 7, fy - 4, mw - 14, fh + 8, 3);
    const signes = ["rubis", "statere", "saphir"] as const;
    for (let k = 0; k < 3; k++) {
      const fx = x0 + 11 + k * (fw + 2);
      c.f(fx, fy, fx + fw, fy + fh, (x, y) => IVOIRE.t(0.96 - Math.abs((y - fy) / fh - 0.5) * 0.5, x, y, 0.8));
      const mx = fx + (fw >> 1);
      const my = fy + (fh >> 1);
      const signe = signes[k]!;
      const tire = tires?.[k];
      if (tire) c.pose(tire, mx - (tire.w >> 1), my - (tire.h >> 1));
      else if (signe === "statere") c.pose(statere(16), mx - 8, my - 8);
      else c.pose(pierre(signe === "rubis" ? RUBIS : SAPHIR, signe === "rubis"), mx - 8, my - 8);
      c.r(fx + fw, fy, 2, fh, ton(NOIR, 1));
    }
    c.r(x0 + 9, fy + (fh >> 1), mw - 18, 1, ton(OR, 5));
    // le fronton : des feux d'or qui montent
    for (let k = 0; k < 7; k++) {
      const lx = x0 + 16 + k * 10;
      const ly = y0 + 9 + Math.round(Math.abs(k - 3) * 1.2);
      c.r(lx - 1, ly - 1, 3, 3, ton(OR, k % 2 ? 6 : 8));
      c.p(lx, ly, ton(OR, 8));
    }
    // le bac et ses statères
    const by = y0 + Math.round(mh * 0.78);
    c.f(x0 + 16, by, x0 + mw - 16, by + 9, (x, y) => NOIR.t(0.08 + (y - by) * 0.02, x, y));
    cadreOr(c, x0 + 14, by - 2, mw - 28, 13, 2, false);
    for (let k = 0; k < 4; k++) c.pose(statere(12), x0 + 20 + k * 13, by - 1 + (k % 2));
    // le levier
    c.r(x0 + mw, y0 + Math.round(mh * 0.5), 8, 5, ton(OR, 4));
    c.r(x0 + mw + 6, y0 + Math.round(mh * 0.2), 3, Math.round(mh * 0.32), ton(OR, 5));
    c.r(x0 + mw + 6, y0 + Math.round(mh * 0.2), 1, Math.round(mh * 0.32), ton(OR, 7));
    disque(c, x0 + mw + 7, y0 + Math.round(mh * 0.16), 6, (r, a, x, y) => RUBIS.t(0.75 - r * 0.3 + 0.2 * Math.cos(a + 2.4) * r, x, y));
    c.cerne();
    Tl.poseOmbre(c, cx - (mw >> 1) - 5, h - mh - 6, 4, 3, 0.5);
  },
  course(Tl, jour, tirage) {
    const vus = tirage?.jeu === "course" ? couloirsVus(tirage.gagnant) : null;
    const w = Tl.w;
    const h = Tl.h;
    mur(Tl, jour, 0.6, 0.3);
    const sol = Math.round(h * 0.42);
    // la lice : trois couloirs de gazon sous les projecteurs, des lisses d'or
    Tl.f(0, sol, w, h, (x, y) => {
      const v = (y - sol) / (h - sol);
      const couloir = Math.floor(v * 3);
      const l = (v * 3) % 1;
      if (l < 0.06) return OR.t(0.7 - v * 0.2 + 0.1 * Math.sin(x * 0.3), x, y);
      const raie = Math.floor((x + couloir * 9 + y * 0.6) / 14) % 2;
      return EMERAUDE.t(0.34 + raie * 0.07 + v * 0.1 - Math.abs(x / w - 0.55) * 0.22, x, y, 1);
    });
    Tl.r(0, sol - 1, w, 1, ton(OR, 1));
    // le poteau d'arrivée et son damier
    const px = w - 30;
    Tl.r(px, sol - 44, 3, h - sol + 44, ton(OR, 5));
    Tl.r(px, sol - 44, 1, h - sol + 44, ton(OR, 7));
    Tl.r(px - 1, sol - 46, 5, 3, ton(OR, 6));
    const dr = new Toile(22, 16);
    dr.tout((x, y) => (((x >> 2) + (y >> 2)) % 2 ? ton(IVOIRE, 5) : ton(NOIR, 1)));
    dr.cerne(ton(OR, 2));
    Tl.pose(dr, px + 3, sol - 43);
    const coureurs = [
      ["belier-aux-cornes-d-or", 0.12, 0],
      ["renardeau-roux", 0.4, 1],
      ["lapin-de-garenne", 0.62, 2],
    ] as const;
    // Avec un tirage, le familier du couloir gagnant est en tête, les deux autres derrière lui.
    const enTete = vus?.enTete ?? 2;
    const derriere = [0, 1, 2].filter((k) => k !== enTete);
    for (const [id, fxDuHall, k] of coureurs) {
      const fx = vus ? (k === enTete ? 0.62 : derriere.indexOf(k) === 0 ? 0.12 : 0.4) : fxDuHall;
      const c = familier(id, true);
      const bas = sol + Math.round(((h - sol) * (k + 0.82)) / 3);
      const x0 = Math.round(w * fx);
      for (let t = 0; t < 14; t++) {
        const y = bas - 4 - ((t * 7) % (c.h - 6));
        const l = 8 + ((t * 13) % 16);
        for (let i = 0; i < l; i++) Tl.m(x0 - 4 - i, y, ton(IVOIRE, 6), 0.3 * (1 - i / l));
      }
      Tl.poseOmbre(c, x0, bas - c.h, 2, 2, 0.4);
      const pl = new Toile(11, 11);
      pl.tout((x, y) => (x === 0 || y === 0 || x === 10 || y === 10 ? ton(OR, 5) : ton(NOIR, 1)));
      ecrisSur(pl, String(vus ? vus.numeros[k] : k + 1), 3, 2, ton(OR, 6));
      Tl.pose(pl, 4, bas - 12);
    }
  },
  palissade(Tl, jour, tirage) {
    const coupe = tirage?.jeu === "palissade" ? tirage.coupe : null;
    const w = Tl.w;
    const h = Tl.h;
    const cx = w >> 1;
    mur(Tl, jour, 0.5, 0.4);
    const bw = Math.min(w - 40, 150);
    const bh = h - 14;
    const x0 = cx - (bw >> 1);
    const y0 = 7;
    Tl.f(x0 + 3, y0 + 4, x0 + bw + 3, y0 + bh + 4, (x, y) => {
      Tl.m(x, y, ENCRE, 0.5);
      return null;
    });
    Tl.f(x0, y0, x0 + bw, y0 + bh, (x, y) => {
      const d = Math.hypot((x - cx) / bw, (y - y0 - bh * 0.35) / bh);
      return d < 0.42 ? SAPHIR.t(0.36 - d * 0.6, x, y, 1) : NOIR.t(0.5 - d * 0.5, x, y, 1);
    });
    cadreOr(Tl, x0, y0, bw, bh, 3);
    // les pieux d'or, en quinconce
    const rangs = Math.max(5, Math.floor((bh - 34) / 11));
    const pas = 12;
    for (let r = 0; r < rangs; r++)
      for (let k = 0; k <= r + 2; k++) {
        const x = Math.round(cx + (k - (r + 2) / 2) * pas);
        const y = y0 + 12 + r * 11;
        if (x < x0 + 8 || x > x0 + bw - 9) continue;
        Tl.m(x + 1, y + 4, ENCRE, 0.6);
        Tl.m(x + 2, y + 4, ENCRE, 0.6);
        Tl.r(x - 1, y, 3, 4, ton(OR, 4));
        Tl.p(x, y - 1, ton(OR, 7));
        Tl.r(x - 1, y, 1, 3, ton(OR, 7));
        Tl.r(x + 1, y + 1, 1, 3, ton(OR, 2));
      }
    // les cases du bas : plus on s'éloigne du milieu, plus elles brillent
    const n = 9;
    const cw = Math.floor((bw - 10) / n);
    const bx = cx - ((cw * n) >> 1);
    const by = y0 + bh - 15;
    for (let k = 0; k < n; k++) {
      const e = Math.abs(k - 4) / 4;
      const rp = e > 0.8 ? OR : e > 0.55 ? AMBRE : e > 0.3 ? RUBIS : BORDEAUX;
      Tl.f(bx + k * cw + 1, by, bx + (k + 1) * cw, by + 10, (x, y) => rp.t(0.66 - (y - by) * 0.03 + (y === by ? 0.2 : 0), x, y, 0.6));
      Tl.r(bx + k * cw, by - 3, 1, 13, ton(OR, 3));
    }
    Tl.r(bx + n * cw, by - 3, 1, 13, ton(OR, 3));
    // Avec un tirage : le statère posé dans sa coupe, sous sa lueur.
    if (coupe !== null) {
      const kx = bx + coupe * cw + (cw >> 1);
      lueur(Tl, kx, by + 2, 16, 0.5, ton(OR, 7));
      bille(Tl, kx, by + 3, 3);
      return;
    }
    // la bille et sa trace
    const tx = cx + 9;
    const ty = y0 + 12 + Math.round(rangs * 0.55) * 11 - 6;
    for (let i = 1; i < 14; i++) Tl.m(tx - Math.round(i * 0.7), ty - i * 2, ton(IVOIRE, 6), 0.4 * (1 - i / 14));
    bille(Tl, tx, ty, 3);
  },
  des(Tl, jour, tirage) {
    const faces = tirage?.jeu === "des" ? tirage.faces : null;
    const h = Tl.h;
    const cx = Tl.w >> 1;
    mur(Tl, jour, 0.5, 0.4);
    plateau(Tl, Math.round(h * 0.5), RUBIS, 0.04);
    lueur(Tl, cx, Math.round(h * 0.52), 62, jour ? 0.22 : 0.3);
    const a = Math.min(30, Math.round(h * 0.25));
    const d1 = de(a, faces ? facesVues(faces[0]) : [6, 3, 2]);
    const d2 = de(a - 3, faces ? facesVues(faces[1]) : [5, 1, 4], BORDEAUX);
    Tl.poseOmbre(d1, cx - a * 2 + 2, Math.round(h * 0.56) - a - 6, 4, 4);
    Tl.poseOmbre(d2, cx + 6, Math.round(h * 0.62) - a + 2, 4, 4);
    pile(Tl, cx - 78, h - 8, 4, NOIR, 8);
    pile(Tl, cx + 80, h - 12, 3, IVOIRE, 8);
    const s = statere(12);
    Tl.poseOmbre(s, cx - 56, h - 15, 1, 1);
    Tl.poseOmbre(s, cx + 52, h - 14, 1, 1);
  },
};

/** La vignette d'un jeu, de `w` sur `h` points ; avec `tirage`, le vrai tirage d'un coup (l'image du robot seulement). */
export function vignette(id: JeuDuCasino, w: number, h: number, jour: boolean, tirage?: TirageDeLaVignette): Toile {
  const Tl = new Toile(w, h);
  VIGNETTES[id](Tl, jour, tirage);
  return Tl;
}

/** La place de la grande roue dans la bannière : son centre et son rayon (le portrait du croupier se pose à sa gauche). */
export function placeDeLaRoue(w: number, h: number, etroit: boolean): { rx: number; ry: number; R: number } {
  return { rx: Math.round(etroit ? w * 0.5 : w * 0.73), R: Math.round(Math.min(etroit ? w * 0.4 : w * 0.2, h * 0.62)), ry: Math.round(h * (etroit ? 0.6 : 0.56)) };
}

/** La bannière du hall : le palais, ses colonnes de marbre, ses tentures, ses lustres, la grande roue sur sa table. */
export function banniere(w: number, h: number, jour: boolean, etroit: boolean): Toile {
  const Tl = new Toile(w, h);
  const sol = Math.round(h * 0.8);
  const { rx, ry, R } = placeDeLaRoue(w, h, etroit);
  // le mur et son sol poli
  Tl.tout((x, y) => {
    const d = Math.hypot((x - rx) / (h * 1.5), (y - ry) / (h * 1.1));
    if (y >= sol) {
      const v = (y - sol) / (h - sol);
      const refl = 0.5 + 0.5 * Math.cos((x - rx) * 0.012);
      if (y === sol) return ton(OR, 4);
      if (y === sol + 1) return ton(OR, 2);
      return jour ? JOUR.t(0.72 - v * 0.2 + refl * 0.16 - d * 0.14, x, y, 1) : NOIR.t(0.3 - v * 0.14 + refl * 0.3 * (1 - d), x, y, 1);
    }
    const los = Math.abs(((x + 800) % 20) - 10) + Math.abs(((y + 800) % 20) - 10) === 10 ? 1 : 0;
    if (jour) return JOUR.t(0.99 - d * 0.16 - los * 0.07, x, y, 0.9);
    const v = 0.62 - d * 0.7;
    return v > 0.26 ? BORDEAUX.t(v - 0.12 + los * 0.04, x, y, 1) : NOIR.t(v * 2 + los * 0.07, x, y, 1);
  });
  // les colonnes
  const pas = etroit ? 96 : 132;
  for (let cxn = etroit ? 14 : 40; cxn < w + 20; cxn += pas) {
    const lw = 13;
    Tl.f(cxn - lw, 0, cxn + lw, sol, (x, y) => {
      const u = (x - cxn) / lw;
      if (Math.abs(u) > 1) return null;
      const base = y > sol - 9 || y < 10;
      const larg = base ? 1 : 0.72;
      if (Math.abs(u) > larg) return null;
      if (base) return OR.t(0.56 - u * 0.3 + ((y > sol - 9 ? y - sol + 9 : y) % 3 === 0 ? -0.2 : 0), x, y);
      const veine = 0.1 * Math.sin(y * 0.13 + Math.sin(y * 0.05 + cxn) * 3 + u * 2);
      return jour ? IVOIRE.t(0.86 - (u + 0.3) * (u + 0.3) * 0.5 + veine, x, y, 1) : NOIR.t(0.52 - (u + 0.35) * (u + 0.35) * 0.55 + veine, x, y, 1);
    });
  }
  // les tentures de velours bordeaux et leur frange d'or
  Tl.f(0, 0, w, Math.round(h * 0.34), (x, y) => {
    const f = ((x + 30) % pas) / pas;
    const bord = h * 0.11 + Math.pow(Math.abs(Math.sin(f * Math.PI)), 0.8) * h * 0.17;
    if (y > bord + 2) return null;
    if (y > bord) return OR.t(0.6 + 0.3 * Math.sin(x * 1.3), x, y);
    if (y > bord - 1) return ton(OR, 2);
    const pli = 0.5 + 0.5 * Math.sin(x * 0.42 + Math.sin(y * 0.2) * 0.8);
    return BORDEAUX.t((jour ? 0.5 : 0.38) + pli * 0.24 - (y / h) * 0.3, x, y, 1);
  });
  // les lueurs des lustres
  for (let k = 0; k * pas < w + pas; k++) {
    const lx = Math.round((k + 0.5) * pas + (etroit ? 14 : 40));
    if (Math.abs(lx - rx) < R * 0.6 || (!etroit && lx < w * 0.46)) continue;
    lueur(Tl, lx, Math.round(h * 0.36), 26, jour ? 0.3 : 0.5);
    Tl.r(lx - 1, Math.round(h * 0.3), 3, Math.round(h * 0.07), ton(OR, 5));
    disque(Tl, lx, Math.round(h * 0.39), 4, (r, _a, x, y) => OR.t(1 - r * 0.5, x, y));
    Tl.r(lx - 6, Math.round(h * 0.39) + 4, 13, 1, ton(OR, 4));
  }
  lueur(Tl, rx, ry, Math.round(R * 1.7), jour ? 0.22 : 0.4);
  // la table de velours, la roue, les jetons, les statères
  Tl.f(0, 0, w, h, (x, y) => {
    const dx = (x - rx) / (R * 1.9);
    const dy = (y - ry - R * 0.36) / (R * 0.5);
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (d > 0.93) return OR.t(0.7 - dy * 0.3 + 0.1 * Math.sin(x * 0.2), x, y);
    if (d > 0.9) return ton(OR, 2);
    return BORDEAUX.t(0.5 - d * 0.2 - dy * 0.08 + 0.04 * grain(x >> 1, y >> 1), x, y, 1);
  });
  roueVue(Tl, rx, ry, R, 0.48, 0.3);
  if (!etroit) {
    pile(Tl, rx - R - 30, ry + Math.round(R * 0.5), 6, RUBIS, 10);
    pile(Tl, rx - R - 8, ry + Math.round(R * 0.62), 3, IVOIRE, 10);
    pile(Tl, rx + R + 26, ry + Math.round(R * 0.5), 7, NOIR, 10);
    pile(Tl, rx + R + 4, ry + Math.round(R * 0.64), 4, SAPHIR, 10);
    pile(Tl, rx + R + 48, ry + Math.round(R * 0.4), 3, EMERAUDE, 10);
    const s = statere(16);
    for (const [dx, dy] of [
      [-R - 54, 0.52],
      [-R + 14, 0.72],
      [R - 22, 0.74],
      [R + 66, 0.56],
    ] as const)
      Tl.poseOmbre(s, rx + dx, ry + Math.round(R * dy) - 8, 1, 2);
  }
  return Tl;
}
