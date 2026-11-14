/**
 * Le décor de /gaulois « bataille » : le champ de bataille hors de la palissade, là où le Gaulois se bat quand sa partie
 * vient de commencer. À gauche le village derrière ses pieux et la bannière du clan plantée dans la terre retournée ; à
 * droite, au loin, les tentes prune du clan d'en face (un clan inventé, sans nom), sa ligne de guerriers, ses fumées ;
 * devant, l'herbe piétinée, des flèches fichées, des pieux taillés. Aux quatre moments de la journée : la brume rose de
 * l'aube, la poussière et les flèches du plein jour, le couchant rouge derrière le camp d'en face, les feux de camp de
 * la nuit. Dessin original de Claude Fable 5.2 pour le clan [GAL], 14 novembre 2026 ; rien n'y est emprunté à une œuvre
 * existante.
 */
import type { Moment } from "../scene.ts";
import { HAUTEUR, HORIZON, LARGEUR, PIEDS, Toile, grain, melanger, type DessinDuLieu } from "./commun.ts";

type Phase = Moment["phase"];

/** Les couleurs du champ de bataille à un moment de la journée. */
interface Tons {
  /** Cinq bandes de ciel, du haut vers l'horizon. */
  ciel: readonly [string, string, string, string, string];
  /** Le halo de l'astre et la clarté de l'horizon de son côté. */
  halo: string;
  nuage: { haut: string; bas: string };
  collines: string;
  foret: { loin: string; pres: string; claire: string };
  /** Le pré lointain, entre la forêt et le champ. */
  pre: { fond: string; clair: string };
  herbe: { fond: string; claire: string; sombre: string; bas: string };
  terre: { fond: string; claire: string; sombre: string };
  bois: { fond: string; clair: string; sombre: string; creux: string; corde: string };
  chaume: { fond: string; clair: string; sombre: string };
  /** Le clan d'en face : des toiles et des silhouettes prune. */
  prune: { fond: string; clair: string; sombre: string; trait: string };
  /** La bannière du clan : un bleu uni, deux galons dorés. */
  banniere: { fond: string; clair: string; sombre: string; or: string; hampe: string };
  /** La fumée, du sombre au clair. */
  fumee: readonly [string, string, string];
  pierre: string;
  /** Le visage des guerriers d'en face, vu de loin. */
  visage: string;
  empenne: string;
  ombre: string;
}

const TONS: Record<Phase, Tons> = {
  aube: {
    ciel: ["#55629c", "#8478a8", "#bd90a6", "#e8ac94", "#f6d09e"],
    halo: "#fff0c0",
    nuage: { haut: "#f8cdb4", bas: "#c49ab0" },
    collines: "#b49ab0",
    foret: { loin: "#7e8c9a", pres: "#4c6a66", claire: "#5c7a6e" },
    pre: { fond: "#84a088", clair: "#98b298" },
    herbe: { fond: "#5c8862", claire: "#72a074", sombre: "#4a7254", bas: "#3c604a" },
    terre: { fond: "#84685a", claire: "#9e8270", sombre: "#6a5248" },
    bois: { fond: "#80583e", clair: "#a47652", sombre: "#60402f", creux: "#3a2620", corde: "#c0a67c" },
    chaume: { fond: "#c49c60", clair: "#e2ba7a", sombre: "#9c7a48" },
    prune: { fond: "#6e5488", clair: "#8e72a6", sombre: "#523c68", trait: "#34263e" },
    banniere: { fond: "#3a5ea4", clair: "#5278bc", sombre: "#2b4680", or: "#e0b858", hampe: "#4c3424" },
    fumee: ["#8c7e98", "#a898ac", "#c8b6c0"],
    pierre: "#8a8490",
    visage: "#d8a890",
    empenne: "#b89cc8",
    ombre: "#4c3a36",
  },
  jour: {
    ciel: ["#3f8ad0", "#5199d9", "#69abe2", "#86bfea", "#acd2ea"],
    halo: "#fff3b0",
    nuage: { haut: "#f0f5f8", bas: "#c6daea" },
    collines: "#8fb6c4",
    foret: { loin: "#679a8c", pres: "#3a7a58", claire: "#4a8c64" },
    pre: { fond: "#6c9a5a", clair: "#7eaa68" },
    herbe: { fond: "#4a8846", claire: "#5e9c52", sombre: "#3c743a", bas: "#346636" },
    terre: { fond: "#886a4a", claire: "#a2845c", sombre: "#6e543a" },
    bois: { fond: "#885a34", clair: "#aa7a48", sombre: "#684426", creux: "#3e2818", corde: "#c9b278" },
    chaume: { fond: "#d0aa52", clair: "#e8c86c", sombre: "#aa863c" },
    prune: { fond: "#7a5a94", clair: "#9a7ab4", sombre: "#5a4070", trait: "#3a2848" },
    banniere: { fond: "#3566b4", clair: "#4d80cc", sombre: "#274c8c", or: "#e8c24a", hampe: "#553822" },
    fumee: ["#868c94", "#a4aab0", "#c6cace"],
    pierre: "#8e9296",
    visage: "#e8b88c",
    empenne: "#c4b0d8",
    ombre: "#55412e",
  },
  crepuscule: {
    ciel: ["#262454", "#483570", "#874a7a", "#cc6a56", "#eb9a50"],
    halo: "#ffc470",
    nuage: { haut: "#5e4070", bas: "#e08458" },
    collines: "#7a4c6c",
    foret: { loin: "#4c4458", pres: "#2c383c", claire: "#3c4844" },
    pre: { fond: "#66663f", clair: "#7c7446" },
    herbe: { fond: "#525c36", claire: "#6c7040", sombre: "#424b2e", bas: "#363e28" },
    terre: { fond: "#765036", claire: "#986a44", sombre: "#5a3c2a" },
    bois: { fond: "#744629", clair: "#ac6c3a", sombre: "#54321f", creux: "#321d14", corde: "#b89460" },
    chaume: { fond: "#bc8842", clair: "#e4aa54", sombre: "#90642e" },
    prune: { fond: "#5c4270", clair: "#805c8c", sombre: "#44304f", trait: "#2a1c30" },
    banniere: { fond: "#2e4e90", clair: "#4668a8", sombre: "#223a70", or: "#e0a840", hampe: "#3e281a" },
    fumee: ["#463a58", "#62506c", "#886476"],
    pierre: "#6c6468",
    visage: "#c88a64",
    empenne: "#a488b4",
    ombre: "#3a2a20",
  },
  nuit: {
    ciel: ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"],
    halo: "#3a4c8c",
    nuage: { haut: "#16224e", bas: "#111a42" },
    collines: "#13214c",
    foret: { loin: "#0f1c3e", pres: "#0b1732", claire: "#11223e" },
    pre: { fond: "#152e48", clair: "#1c3a54" },
    herbe: { fond: "#122a40", claire: "#1b3a50", sombre: "#0e2136", bas: "#0a1830" },
    terre: { fond: "#28283e", claire: "#38364e", sombre: "#1e1e32" },
    bois: { fond: "#2a2c4e", clair: "#3c4068", sombre: "#1c1e3a", creux: "#101228", corde: "#4a5080" },
    chaume: { fond: "#363c6c", clair: "#4a5286", sombre: "#282e56" },
    prune: { fond: "#3e2f68", clair: "#56468c", sombre: "#2c2050", trait: "#170f2c" },
    banniere: { fond: "#203878", clair: "#2e4c94", sombre: "#172a5a", or: "#8a8658", hampe: "#141630" },
    fumee: ["#1a2650", "#263462", "#35447a"],
    pierre: "#3a4064",
    visage: "#5a5478",
    empenne: "#5a4a84",
    ombre: "#080e22",
  },
};

const FEU = { flamme: "#f2b632", clair: "#ffdd80", coeur: "#fff1a8", braise: "#c2661a", lueur: "#e09040" } as const;

const BRUME = "#ecd6d6";

/** Où commencent les bandes du ciel, et le pré lointain au pied de la forêt. */
const BANDES = [0, 13, 25, 35, 44] as const;
const PRE = 55;

/** Un nuage plat : pour chaque rangée, son retrait et sa longueur. */
const NUAGES: readonly (readonly (readonly [number, number])[])[] = [
  [[5, 7], [2, 14], [0, 19], [3, 13]],
  [[3, 5], [0, 11], [2, 7]],
  [[4, 12], [0, 22], [8, 11]],
];

export const DECOR_BATAILLE: DessinDuLieu = (moment: Moment) => {
  const phase = moment.phase;
  const p = TONS[phase];
  const nuit = phase === "nuit";
  const jour = phase === "jour";
  const aube = phase === "aube";
  const soir = phase === "crepuscule";
  /** Le côté d'où vient la lumière : la gauche, sauf au couchant. */
  const deDroite = soir;
  const t = new Toile(p.ciel[0]);

  const teinter = (x: number, y: number, couleur: string, part: number) => {
    const ici = t.lire(x, y);
    if (ici) t.poser(x, y, melanger(ici, couleur, part));
  };
  /** Une lueur chaude autour d'un feu, en trois anneaux nets. */
  const lueur = (cx: number, cy: number, rx: number, ry: number, force: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        const anneau = d < 0.22 ? 1 : d < 0.55 ? 0.62 : 0.3;
        if (d > 0.8 && (x + y) % 2 === 0) continue;
        teinter(x, y, FEU.lueur, force * anneau);
      }
    }
  };

  /* ---------- Le ciel ---------- */

  for (let y = 0; y < PRE; y++) {
    let b = 0;
    for (let i = 1; i < BANDES.length; i++) if (y >= BANDES[i]!) b = i;
    const suite = BANDES[b + 1];
    for (let x = 0; x < LARGEUR; x++) {
      let couleur = p.ciel[b]!;
      if (suite !== undefined && y === suite - 1 && (x + y) % 2 === 0) couleur = p.ciel[b + 1]!;
      else if (suite !== undefined && y === suite - 2 && (x + 2 * y) % 4 === 0) couleur = p.ciel[b + 1]!;
      else if (b > 0 && y === BANDES[b] && (x + 2 * y) % 4 === 2) couleur = p.ciel[b - 1]!;
      t.poser(x, y, couleur);
    }
  }
  // Les étoiles : toute la nuit ; les dernières à l'aube du côté encore sombre, les premières au couchant.
  if (!jour) {
    const jusque = nuit ? 43 : 15;
    for (let y = 1; y < jusque; y++) {
      for (let x = 0; x < LARGEUR; x++) {
        if (aube && x < 56) continue;
        if (soir && x > 68) continue;
        const g = grain(x, y) % 260;
        if (g === 0) teinter(x, y, "#c0c9e2", nuit ? 1 : 0.4);
        else if (g < 3 && nuit) teinter(x, y, "#5469ae", 1);
      }
    }
  }

  /* ---------- L'astre ---------- */

  const astre = moment.astre;
  if (astre) {
    const hauteur = Math.min(1, Math.max(0, astre.hauteur));
    const ax = Math.round(7 + Math.min(1.04, Math.max(-0.04, astre.course)) * 110);
    const ay = Math.round(42 - hauteur * 36);
    if (astre.sorte === "soleil") {
      // Près de l'horizon, le ciel s'éclaire de son côté.
      if (hauteur < 0.5) {
        const force = 1 - hauteur * 2;
        for (let y = 26; y < PRE; y++) {
          for (let x = 0; x < LARGEUR; x++) {
            const f = (1 - Math.abs(x - ax) / 44 - Math.abs(y - 45) / 16) * force;
            if (f > 0.5) teinter(x, y, p.halo, 0.4);
            else if (f > 0.26 && (x + y) % 2 === 0) teinter(x, y, p.halo, 0.36);
            else if (f > 0.06 && (x + 2 * y) % 4 === 0) teinter(x, y, p.halo, 0.3);
          }
        }
      }
      const coeur = melanger("#ff9a3c", "#fff3b0", hauteur * 1.4);
      const bord = melanger("#f5722a", "#ffd75a", hauteur * 1.4);
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          const d = Math.hypot(dx, dy);
          const x = ax + dx;
          const y = ay + dy;
          if (y >= PRE) continue;
          if (d <= 3.6) t.poser(x, y, coeur);
          else if (d <= 5.2) t.poser(x, y, bord);
          else if (d <= 7.2) teinter(x, y, bord, 0.34);
          else if (d <= 9.4 && (x + y) % 2 === 0) teinter(x, y, bord, 0.24);
        }
      }
    } else {
      // La lune : un croissant, et un peu de clarté autour.
      for (let dy = -9; dy <= 9; dy++) {
        for (let dx = -9; dx <= 9; dx++) {
          const d = Math.hypot(dx, dy);
          const x = ax + dx;
          const y = ay + dy;
          if (y >= PRE) continue;
          const dans = d <= 5.6;
          const creux = Math.hypot(dx + 2.6, dy + 1.7) <= 5;
          if (dans && !creux) t.poser(x, y, Math.hypot(dx - 0.8, dy - 0.4) <= 5.3 ? "#e3e9ff" : "#a9b7ec");
          else if (d <= 7.6 && d > 5.6 && !creux && (x + y) % 2 === 0) teinter(x, y, p.halo, 0.24);
        }
      }
    }
  }

  /* ---------- Les nuages ---------- */

  const nuage = (x: number, y: number, forme: number) => {
    const rangees = NUAGES[forme]!;
    rangees.forEach(([retrait, longueur], dy) => {
      for (let dx = 0; dx < longueur; dx++) t.poser(x + retrait + dx, y + dy, dy === rangees.length - 1 ? p.nuage.bas : p.nuage.haut);
    });
  };
  if (jour) {
    nuage(101, 7, 0);
    nuage(86, 37, 2);
  } else if (aube) {
    nuage(84, 30, 2);
    nuage(20, 21, 1);
  } else if (soir) {
    nuage(18, 30, 2);
    nuage(96, 21, 1);
    nuage(60, 38, 2);
  } else {
    nuage(92, 34, 2);
  }

  /* ---------- Les collines, la forêt, le pré lointain ---------- */

  const dent = (x: number, pas: number): number => 1 - Math.abs((((x % pas) + pas) % pas) / pas - 0.5) * 2;
  for (let x = 0; x < LARGEUR; x++) {
    const colline = Math.round(48 - 2.6 * Math.sin(x / 15 + 0.8) - 1.4 * Math.sin(x / 7 + 2));
    for (let y = colline; y < PRE; y++) t.poser(x, y, p.collines);
    const loin = Math.round(51.6 - 2.4 * dent(x, 5) - 1.1 * Math.sin(x / 17 + 1));
    for (let y = loin; y < PRE; y++) t.poser(x, y, p.foret.loin);
    const pres = Math.round(54.4 - 3 * dent(x + 2, 6) - 0.9 * Math.sin(x / 11 + 3));
    const flanc = (((x + 2) % 6) + 6) % 6;
    for (let y = pres; y < PRE; y++) t.poser(x, y, (deDroite ? flanc > 3 : flanc < 3) && y < 54 ? p.foret.claire : p.foret.pres);
  }
  for (let y = PRE; y < HORIZON; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      let couleur = p.pre.fond;
      if (y === PRE && grain(x, y) % 3 !== 0) couleur = p.pre.clair;
      else if (grain(x, y) % 9 === 0) couleur = p.pre.clair;
      if (y === HORIZON - 1 && (x + y) % 2 === 0) couleur = p.herbe.fond;
      t.poser(x, y, couleur);
    }
  }

  // La brume de l'aube, derrière : une nappe au pied de la forêt, que le toit, les pieux et les tentes dépassent.
  if (aube) {
    for (let x = 0; x < LARGEUR; x++) {
      const haut = 53 - Math.round(0.6 + 0.8 * Math.sin(x / 9 + 0.6) + 0.5 * Math.sin(x / 4 + 2));
      for (let y = haut; y <= 56; y++) {
        if (y === haut && x % 2 === 0) continue;
        teinter(x, y, BRUME, y === haut ? 0.3 : 0.5);
      }
    }
  }

  /* ---------- Le champ : herbe piétinée et terre retournée ---------- */

  for (let y = HORIZON; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const g = grain(x, y);
      let couleur = p.herbe.fond;
      if (y === HORIZON && (x + y) % 2 === 0) couleur = p.pre.fond;
      else if (g % 23 === 0) couleur = p.herbe.claire;
      else if (g % 29 === 0 || grain(x - 1, y) % 61 === 0 || grain(x - 2, y) % 61 === 0) couleur = p.herbe.sombre;
      t.poser(x, y, couleur);
    }
  }
  /** Une plaque de terre à nu : labourée au milieu, mêlée d'herbe au bord. */
  const terre = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (y <= HORIZON) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        const g = grain(x + 13, y + 900);
        if (d > 0.62) {
          if ((x + y) % 2 === 0) t.poser(x, y, g % 2 === 0 ? p.terre.fond : p.terre.sombre);
          continue;
        }
        // Les sillons : des traits sombres décalés d'une rangée à l'autre, une crête claire au-dessus.
        const sillon = (x + y * 5) % 9;
        let couleur = p.terre.fond;
        if (y % 3 === 0 && sillon < 6) couleur = p.terre.sombre;
        else if (y % 3 === 2 && sillon > 0 && sillon < 5) couleur = p.terre.claire;
        else if (g % 11 === 0) couleur = p.terre.claire;
        else if (g % 13 === 0) couleur = p.terre.sombre;
        t.poser(x, y, couleur);
      }
    }
  };
  terre(62, PIEDS - 1, 41, 6.6);
  terre(16, 63.5, 13, 2.2);
  terre(94, 64, 8, 1.6);
  terre(27, 76.5, 13, 2.2);
  terre(98, 77, 15, 2.2);
  // Des touffes restées debout.
  for (const [x, y] of [[4, 71], [23, 68], [34, 62], [89, 62], [119, 71], [33, 73], [91, 70], [8, 77], [121, 62]] as const) {
    t.poser(x, y, p.herbe.claire);
    t.poser(x + 1, y - 1, p.herbe.claire);
    t.poser(x + 2, y, p.herbe.sombre);
    t.poser(x - 1, y - 1, p.herbe.sombre);
  }

  /* ---------- À gauche : le village derrière sa palissade ---------- */

  const clairA = deDroite ? "sombre" : "clair";
  const sombreA = deDroite ? "clair" : "sombre";
  // Le toit de chaume qui dépasse.
  {
    const cx = 18;
    const haut = 37;
    for (let r = 0; r <= 12; r++) {
      const demi = Math.round(1 + (r * 9) / 12);
      for (let x = cx - demi; x <= cx + demi; x++) {
        const u = (x - cx) / demi;
        let couleur = p.chaume.fond;
        if (u < -0.3) couleur = p.chaume[clairA];
        else if (u > 0.4) couleur = p.chaume[sombreA];
        if (r % 3 === 2 && (x + r) % 4 !== 0) couleur = p.chaume.sombre;
        t.poser(x, haut + r, couleur);
      }
    }
    t.poser(cx, haut - 1, p.chaume.sombre);
    t.poser(cx - 1, haut - 2, p.chaume.sombre);
    t.poser(cx + 1, haut - 2, p.chaume.sombre);
  }
  // Les pieux, taillés en pointe, liés d'une corde.
  for (let i = 0; i < 9; i++) {
    const x = i * 3;
    const haut = 47 + (grain(i, 3) % 2);
    for (let y = haut; y <= 58; y++) {
      for (let dx = 0; dx < 3; dx++) {
        if (y === haut && dx !== 1) continue;
        let couleur = dx === 0 ? p.bois[clairA] : dx === 2 ? p.bois[sombreA] : p.bois.fond;
        if (y === 52 && dx < 2) couleur = p.bois.corde;
        if (y === 58) couleur = p.bois.creux;
        t.poser(x + dx, y, couleur);
      }
    }
  }
  // Les deux montants de la porte, plus hauts.
  for (let y = 43; y <= 59; y++) {
    for (let dx = 0; dx < 4; dx++) {
      let couleur = dx === 0 ? p.bois[clairA] : dx === 3 ? p.bois[sombreA] : p.bois.fond;
      if ((y - 43) % 6 === 4 && dx > 0 && dx < 3) couleur = p.bois.sombre;
      if (y === 59) couleur = p.bois.creux;
      t.poser(27 + dx, y, couleur);
    }
  }
  t.bloc(28, 42, 2, 1, p.bois.fond);

  /* ---------- À droite, au loin : le camp et la ligne du clan d'en face ---------- */

  /** Une fumée qui monte en volutes et penche vers la gauche avec le vent. */
  const fumee = (x0: number, y0: number, sommet: number, derive: number, r0: number, r1: number, volutes: number) => {
    for (let i = 0; i < volutes; i++) {
      const k = i / (volutes - 1);
      const cx = x0 + derive * k ** 1.5 + (i % 2 === 0 ? -1.1 : 1.1);
      const cy = y0 - (y0 - sommet) * k;
      const gros = 0.82 + 0.18 * (grain(i, x0) % 3);
      const r = (k < 0.62 ? r0 + (r1 - r0) * Math.sin((k / 0.62) * (Math.PI / 2)) : r1 * (1 - ((k - 0.62) / 0.38) * 0.72)) * gros;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (Math.hypot(dx, dy) > r) continue;
          const cote = ((deDroite ? -dx : dx) + dy) / r;
          let couleur = cote < -0.45 ? p.fumee[2] : cote > 0.55 ? p.fumee[0] : p.fumee[1];
          // Le bas de la fumée rougit au-dessus des feux, le soir et la nuit.
          if ((nuit || soir) && k < 0.3) couleur = melanger(couleur, FEU.braise, 0.42 * (1 - k / 0.3));
          t.poser(x, y, couleur);
        }
      }
    }
  };
  fumee(106, 52, aube ? 27 : 14, aube ? -8 : -15, 1.5, aube ? 2.8 : 3.9, aube ? 7 : 10);
  if (jour) fumee(123, 50, 29, -7, 1.4, 3.4, 6);

  /** Une tente de toile prune, pâlie par la distance, un fanion à la pointe. */
  const auLoin = (couleur: string): string => melanger(couleur, p.ciel[4], nuit ? 0.2 : 0.34);
  const tente = (cx: number, pied: number, haut: number, base: number) => {
    for (let r = 0; r < haut; r++) {
      const demi = Math.round(((r + 1) * base) / haut);
      for (let dx = -demi; dx <= demi; dx++) {
        let couleur = dx < -demi / 3 ? p.prune[clairA] : dx > demi / 3 ? p.prune[sombreA] : p.prune.fond;
        if (r > haut * 0.45 && Math.abs(dx) <= (r - haut * 0.45) / 3) couleur = p.prune.sombre;
        t.poser(cx + dx, pied - haut + 1 + r, auLoin(couleur));
      }
    }
    const pointe = pied - haut;
    t.bloc(cx, pointe - 3, 1, 4, auLoin(p.prune.sombre));
    t.bloc(cx - 3, pointe - 3, 3, 2, auLoin(p.prune.clair));
  };
  tente(96, 56, 8, 5);
  tente(114, 56, 11, 7);

  // La poussière que leur ligne soulève, le jour et le soir : une bande pâle derrière leurs jambes.
  if (jour || soir) {
    const poussiere = melanger(p.pre.clair, jour ? "#e8e0c8" : "#e0a070", 0.55);
    for (let x = 86; x < LARGEUR; x++) {
      const haut = 58 - Math.round(0.9 + 0.9 * Math.sin(x / 2.6) + 0.5 * Math.sin(x / 1.3 + 2));
      for (let y = haut; y <= 60; y++) t.poser(x, y, y === haut || y === 60 ? melanger(poussiere, p.pre.fond, 0.45) : poussiere);
    }
  }
  // Leur bannière : une toile prune, un chevron plus clair, sans signe.
  t.bloc(102, 42, 1, 14, p.prune.trait);
  t.grille(96, 42, ["fffccf", "ffccff", "fccfff", "ffccff", "fffccf"], { f: p.prune.fond, c: p.prune.clair });
  t.poser(96, 44, auLoin(p.prune.fond));
  // La ligne des guerriers, de loin : un rang de silhouettes prune, le visage clair sous le casque, un bouclier ; des
  // lances dressées, deux couchées vers le village, des lames levées.
  const rang = [87, 92, 97, 102, 107, 112, 117, 122];
  rang.forEach((x, i) => {
    const pied = 59 + (i % 2);
    if (i === 1 || i === 5) {
      t.poser(x, pied - 5, p.prune.clair);
      t.poser(x, pied - 6, p.prune.clair);
      t.poser(x - 1, pied - 7, p.prune.clair);
    } else if (i !== 3) {
      const couchee = i === 2 || i === 6;
      const longueur = 9 + (grain(i, 5) % 2);
      for (let k = 0; k < longueur; k++) {
        const sx = couchee ? x - Math.floor(k / 2) : x;
        const sy = couchee ? pied - 3 - k : pied - k;
        t.poser(sx, sy, k === longueur - 1 ? p.prune.clair : p.prune.trait);
      }
    }
    t.bloc(x + 1, pied - 7, 2, 1, p.prune.trait);
    t.bloc(x + 1, pied - 6, 2, 1, p.visage);
    t.bloc(x + 1, pied - 5, 3, 4, p.prune.fond);
    t.bloc(x + 3, pied - 5, 1, 4, p.prune.sombre);
    t.bloc(x, pied - 4, 2, 2, p.prune.clair);
    t.bloc(x + 1, pied - 1, 1, 2, p.prune.trait);
    t.bloc(x + 3, pied - 1, 1, 2, p.prune.trait);
  });
  // Le soir et la nuit, leurs feux et leurs torches au loin.
  if (nuit || soir) {
    for (const [x, y] of [[94, 62], [112, 62], [121, 63]] as const) {
      lueur(x, y - 1, 5, 3.4, nuit ? 0.5 : 0.28);
      t.poser(x, y, FEU.flamme);
      t.poser(x, y - 1, FEU.clair);
    }
    for (const [x, y] of [[87, 49], [109, 49]] as const) {
      lueur(x, y, 2.6, 2.6, nuit ? 0.5 : 0.3);
      t.poser(x, y, FEU.clair);
    }
  }

  // La brume de l'aube, devant : un banc bas sur le pré, où trempent les pieds de la palissade et de la ligne d'en face.
  if (aube) {
    for (let x = 0; x < LARGEUR; x++) {
      const haut = 58 - Math.round(0.7 + 0.9 * Math.sin(x / 7 + 1.2) + 0.5 * Math.sin(x / 3 + 0.4));
      for (let y = haut; y <= 61; y++) {
        if ((y === haut || y === 61) && (x + y) % 2 === 0) continue;
        teinter(x, y, BRUME, y === haut || y >= 60 ? 0.34 : 0.58);
      }
    }
  }

  /* ---------- Devant : les traces du combat ---------- */

  // À droite, des pieux taillés, plantés de biais vers le camp d'en face.
  for (const x0 of [99, 107, 115]) {
    t.grille(x0, 62, [".....c.", "....cb.", "....cbs", "...cbs.", "...cbs.", "..cbs..", "..cbs..", ".cbs...", ".cbs...", "cbs....", "cbs...."], {
      c: p.bois[clairA],
      b: p.bois.fond,
      s: p.bois[sombreA],
    });
    t.poser(x0 + 5, 62, p.bois.corde);
    t.bloc(x0 - 1, 73, 5, 1, p.terre.sombre);
    t.bloc(x0 + 3, 72, 2, 1, p.terre.fond);
  }
  // Des flèches fichées dans le sol, empennées de prune : elles viennent d'en face.
  for (const [x, y] of [[26, 71], [93, 67], [35, 67], [96, 76], [10, 74]] as const) {
    t.poser(x, y, p.bois.creux);
    t.poser(x - 1, y - 1, p.bois.creux);
    t.poser(x - 1, y - 2, p.bois.sombre);
    t.poser(x - 2, y - 3, p.empenne);
    t.poser(x - 2, y - 4, p.empenne);
    t.poser(x - 3, y - 4, p.prune.fond);
  }
  // Un bouclier rond posé contre une motte, aux couleurs du clan.
  t.bloc(1, 68, 8, 1, p.terre.sombre);
  t.grille(2, 61, ["..bbb..", ".bcffb.", "bcffffb", "bffoffb", "bfffffb", ".bfffb.", "..bbb.."], { b: p.bois.clair, c: p.banniere.clair, f: p.banniere.fond, o: p.banniere.or });

  // Le feu de camp des Gaulois : des pierres, des bûches ; il brûle le soir et la nuit, il fume à l'aube.
  const fx = 16;
  const fy = 68;
  if (nuit || soir) {
    lueur(fx, fy - 1, 17, 6.5, nuit ? 0.46 : 0.24);
    lueur(fx, fy - 9, 15, 9, nuit ? 0.34 : 0.16);
  }
  for (const dx of [-4, -2, 2, 4]) t.poser(fx + dx, fy + 1, p.pierre);
  t.bloc(fx - 3, fy, 7, 1, p.bois.creux);
  t.bloc(fx - 2, fy - 1, 5, 1, p.bois.sombre);
  t.poser(fx - 3, fy - 1, p.bois.fond);
  t.poser(fx + 3, fy - 1, p.bois.fond);
  if (nuit || soir) {
    t.grille(fx - 3, fy - 7, ["...f...", "..ff...", "..fcf..", ".ffcff.", ".fcocf.", "..coc.."], { f: FEU.flamme, c: FEU.clair, o: FEU.coeur });
    t.poser(fx - 2, fy - 1, FEU.braise);
    t.poser(fx + 2, fy - 1, FEU.braise);
    t.poser(fx + 2, fy - 9, FEU.flamme);
    t.poser(fx - 2, fy - 11, FEU.braise);
  } else if (aube) {
    t.poser(fx - 1, fy - 1, FEU.braise);
    t.poser(fx + 1, fy - 1, FEU.flamme);
    for (let i = 0; i < 12; i++) {
      const x = fx + Math.round(1.2 * Math.sin(i / 1.7)) - Math.floor(i / 5);
      if (i % 3 !== 2) teinter(x, fy - 3 - i, p.fumee[2], 0.6 - i * 0.03);
    }
  }

  // La bannière du clan, plantée dans la terre : un bleu uni, deux galons dorés, deux pointes au vent.
  {
    const hx = 34;
    for (let y = 25; y <= 66; y++) t.poser(hx, y, p.banniere.hampe);
    t.poser(hx, 24, p.banniere.or);
    t.bloc(hx - 1, 66, 3, 1, p.terre.sombre);
    for (let i = 1; i <= 12; i++) {
      const x = hx - i;
      const vague = Math.round(1.3 * Math.sin(i / 2.1 + 0.4));
      const pli = Math.cos(i / 2.1 + 0.4);
      for (let j = 0; j < 10; j++) {
        // Les deux pointes : une encoche au bout.
        if (i > 9 && Math.abs(j - 4.5) < (i - 9) * 1.4) continue;
        let couleur = pli > 0.5 ? p.banniere.clair : pli < -0.5 ? p.banniere.sombre : p.banniere.fond;
        if (j === 1 || j === 8) couleur = p.banniere.or;
        t.poser(x, 26 + j + vague, couleur);
      }
    }
  }
  // Une torche au montant de la porte, le soir et la nuit.
  if (nuit || soir) {
    lueur(28.5, 41, 6, 6, nuit ? 0.44 : 0.22);
    t.poser(28, 41, FEU.flamme);
    t.poser(29, 41, FEU.clair);
    t.poser(29, 40, FEU.flamme);
    t.poser(28, 39, FEU.braise);
  }

  // Une volée de flèches partie du village, le jour et le soir : des traits parallèles qui montent vers la droite.
  if (jour || soir) {
    const trait = jour ? "#34506e" : "#2a2444";
    for (const [x, y] of [[21, 14], [28, 9], [26, 17], [33, 12]] as const) {
      t.poser(x, y, jour ? "#dfe8f0" : "#8a6c8c");
      t.poser(x + 1, y - 1, trait);
      t.poser(x + 2, y - 1, trait);
      t.poser(x + 3, y - 2, trait);
      t.poser(x + 4, y - 2, trait);
    }
  }

  // Le bas de l'image s'assombrit, comme au pied d'un cadre.
  for (let y = 75; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (y === 75 && (x + y) % 2 === 0) continue;
      teinter(x, y, p.herbe.bas, y >= 78 ? 0.5 : 0.3);
    }
  }

  return t.decor(p.ombre);
};
