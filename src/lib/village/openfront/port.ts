/**
 * Lot « port » du monde d'OpenFront autour du village : le port, le navire de transport, le navire de guerre, le navire
 * de commerce. Dessinés case par case pour ce site, à l'échelle des Gaulois (48 × 64 cases) : ce sont des dessins
 * originaux des idées du jeu (un port, des navires), jamais une copie de ses images. Les matières du village (bois,
 * pierre, corde de `decor.ts`) y rencontrent « un peu de technologie » : tôle peinte, rivets, fumée.
 *
 * Le port : sa dernière rangée est le niveau de l'eau, que le monde dessine lui-même ; ce qui est sous le ponton, entre
 * les pilotis, reste vide. Les Gaulois marchent sur la bande du quai (`PORT_QUAI`, 8 rangées).
 * Les navires : vus de côté, proue à droite ; leur dernière rangée est la ligne de flottaison. 4 images lentes : le navire
 * s'enfonce d'une case aux images 2 et 3, le pavillon ondule, la fumée monte, le radar du navire de guerre tourne.
 * Rien ne tire, rien ne clignote. La nuit, hublots, fenêtres et feux gardent leur couleur. Design : Claude Fable 5.2.
 */
import { type Decor, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import type { DessinDeBatiment } from "../batiments/type";
import type { PieceOpenFrontId } from "./index";

/* ---------- Les repères pour poser les pièces dans le monde ---------- */

/** Le port : largeur et hauteur en cases ; la dernière rangée est le niveau de l'eau. */
export const PORT_LARGEUR = 460;
export const PORT_HAUTEUR = 212;
/** La bande où l'on marche sur le quai : de la rangée `haut` à la rangée `bas`, de la colonne `de` à la colonne `a`. */
export const PORT_QUAI = { haut: 176, bas: 183, de: 0, a: 455 } as const;
/** Où finit la pierre et où commence le ponton de bois sur pilotis (colonne). */
export const PORT_PONTON = 214;
/** Le nombre de cases vides au-dessus de chaque navire, pour sa fumée. */
export const NAVIRE_MARGE = 30;

/* ---------- Les matières ---------- */

interface Ton {
  clair: string;
  fond: string;
  sombre: string;
  trait: string;
}

const NUIT = "#0b1028";
const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function matieres(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  /** Une couleur peinte : la nuit, elle tire vers le bleu sombre. */
  const n = (couleur: string, part = 0.56) => couleurDuDehors(couleur, melanger(couleur, NUIT, part), l);
  const ton = (clair: string, fond: string, sombre: string, trait: string): Ton => ({ clair: n(clair), fond: n(fond), sombre: n(sombre), trait: n(trait) });
  /** La lumière du dedans : nulle en plein jour, entière à la nuit (comme les huttes de la place). */
  const veille = borner((0.8 - l.jour) / 0.5, 0, 1);
  return {
    ...paletteDuDehors(l),
    n,
    veille,
    pierre: { clair: c("#a69f90", "#565e72"), fond: c("#8c8577", "#474e62"), sombre: c("#736d61", "#393f52"), joint: c("#5a554c", "#2b3042"), trou: c("#3b362f", "#171a24") },
    algue: c("#4d6b48", "#243a36"),
    fer: ton("#8d95a3", "#5f6776", "#434a57", "#2a2f3a"),
    gris: ton("#bcc4cf", "#99a3b1", "#79838f", "#515a68"),
    grisHaut: ton("#d2d8e0", "#b3bbc7", "#8f98a6", "#5f6876"),
    blanc: ton("#f3efe2", "#dcd7c7", "#b6b1a2", "#7d7a70"),
    marine: ton("#5a6f96", "#3d4f72", "#2c3a58", "#18223a"),
    bleu: ton("#6a9aea", "#2f66c8", "#234c98", "#16305f"),
    olive: ton("#93a06c", "#727e54", "#59633f", "#363d28"),
    kaki: ton("#c2bb88", "#a39d6e", "#827d55", "#5a5638"),
    jaune: ton("#f2c658", "#d9a53a", "#b0812a", "#6e4f1a"),
    vert: ton("#7fb08a", "#56886a", "#3f684f", "#243f2e"),
    rouille: ton("#c0703e", "#9a542e", "#753c22", "#4a2414"),
    carene: ton("#b65040", "#933a2e", "#702b23", "#481a16"),
    orange: ton("#f59a4a", "#e0742a", "#b3561e", "#7a3a14"),
    noir: n("#20242c"),
    dedans: melanger(n("#2a2520"), "#7a5428", 0.55 * veille),
    /** Une vitre : sombre le jour, éclairée du dedans la nuit. */
    vitre: melanger(n("#35506e", 0.3), "#ffd070", veille),
    vitreClaire: melanger(n("#6f97b8", 0.3), "#ffe9a8", veille),
    /** Un feu de position : éteint le jour, sa couleur entière la nuit. */
    feu: (allume: string) => melanger(n(melanger(allume, "#40444c", 0.6)), allume, veille),
    pavillon: {
      bleu: n("#0b5fff", 0.42),
      bleuOmbre: n("#0a48c4", 0.42),
      blanc: n("#f2f4fa", 0.42),
      blancOmbre: n("#c4cadb", 0.42),
      rouge: n("#ff1a2e", 0.42),
      rougeOmbre: n("#c41424", 0.42),
    },
    /** Le clan d'en face, inventé : prune et ocre (les trois bandes de son pavillon, sous les mêmes noms que le nôtre). */
    pruneHaut: ton("#b9a0cc", "#9a7ab4", "#7a5a94", "#46305c"),
    pavillonEnnemi: {
      bleu: n("#4a3560", 0.42),
      bleuOmbre: n("#3a2848", 0.42),
      blanc: n("#e0b84e", 0.42),
      blancOmbre: n("#b48c3a", 0.42),
      rouge: n("#4a3560", 0.42),
      rougeOmbre: n("#3a2848", 0.42),
    },
    fumee: { clair: n("#e4e6ea", 0.5), fond: n("#c4c8cf", 0.5), sombre: n("#a3a8b2", 0.5) },
  };
}
type Matieres = ReturnType<typeof matieres>;

/* ---------- Les outils de dessin ---------- */

/** Un trait d'un point à un autre, épais de `gras` cases vers le bas. */
function ligne(pl: Planche, x0: number, y0: number, x1: number, y1: number, couleur: string, gras = 1): void {
  const pas = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= pas; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / pas);
    const y = Math.round(y0 + ((y1 - y0) * k) / pas);
    for (let g = 0; g < gras; g++) pl.poser(x, y + g, couleur);
  }
}

/** Pose un dessin sur un autre, cases vides exceptées. */
function coller(sur: Planche, dessin: Planche, ox: number, oy: number): void {
  for (let y = 0; y < dessin.hauteur; y++) {
    for (let x = 0; x < dessin.largeur; x++) {
      const couleur = dessin.lire(x, y);
      if (couleur !== null) sur.poser(ox + x, oy + y, couleur);
    }
  }
}

/** Une tôle peinte : claire en haut, sombre en bas, un joint debout tous les `joint` cases et sa rangée de rivets. */
function tole(pl: Planche, x: number, y: number, l: number, h: number, t: Ton, joint = 16, graine = 0): void {
  pl.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return t.clair;
    if (dy === h - 1) return t.sombre;
    if (dx === 0) return t.clair;
    if (dx === l - 1) return t.sombre;
    if (dx % joint === joint - 1) return t.sombre;
    if (dx % joint === joint - 3 && dy % 4 === 2) return t.sombre;
    const a = alea(i + graine, j + 91);
    return a < 0.05 ? t.clair : a > 0.96 ? t.sombre : t.fond;
  });
}

/** Un mur de pierres : des lits de 5 rangées, des blocs de 10 cases décalés d'un lit à l'autre (comme le lot B). */
function pierres(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, ombre: (i: number, j: number) => number = () => 0, graine = 0): void {
  const tons = [m.pierre.clair, m.pierre.fond, m.pierre.sombre, m.pierre.joint] as const;
  pl.rect(x, y, l, h, (i, j) => {
    const lit = Math.floor((j - y) / 5);
    const decale = i - x + (lit % 2) * 5 + Math.floor(alea(lit + 3, graine + 11) * 4);
    const o = ombre(i, j);
    if ((j - y) % 5 === 4 || decale % 10 === 0) return o >= 2 ? m.pierre.trou : m.pierre.joint;
    const a = alea(Math.floor(decale / 10) + graine * 31, lit + 17);
    const rang = (a < 0.28 ? 0 : a < 0.8 ? 1 : 2) + o;
    return tons[borner(rang, 0, 3)]!;
  });
}

/** Un mur de planches debout. */
function planches(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, pas = 6): void {
  pl.rect(x, y, l, h, (i, j) => {
    const k = (i - x) % pas;
    if (k === pas - 1) return m.bois.sombre;
    if (k === 0) return m.bois.clair;
    if (alea(i, j + 40) < 0.05) return m.bois.sombre;
    return Math.floor((i - x) / pas) % 2 === 0 ? m.bois.fond : m.bois.autre;
  });
}

/** Un poteau debout : clair à gauche, sombre à droite. `loin` : un poteau de derrière, dans l'ombre. */
function poteau(pl: Planche, m: Matieres, x: number, y: number, h: number, l = 6, loin = false): void {
  pl.rect(x, y, l, h, (i, j) => {
    if (loin) return i === x + l - 1 ? m.bois.creux : m.bois.sombre;
    if (i === x) return m.bois.clair;
    if (i >= x + l - 2) return m.bois.sombre;
    return alea(i, j + 9) < 0.08 ? m.bois.sombre : m.bois.fond;
  });
}

/** Une caisse de bois, clouée et sanglée, posée sur la rangée `bas`. */
function caisse(pl: Planche, m: Matieres, x: number, bas: number, l = 22, h = 18, graine = 0): void {
  const y = bas - h + 1;
  pl.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return m.bois.clair;
    if (dy === h - 1 || dx === l - 1) return m.bois.creux;
    if (dx === 0) return m.bois.clair;
    // Le cadre, puis une traverse en biais.
    if (dx < 3 || dx > l - 4 || dy < 3 || dy > h - 4) return dx === 2 || dy === 2 || dx === l - 3 || dy === h - 3 ? m.bois.sombre : m.bois.autre;
    const biais = graine % 2 === 0 ? dx * (h - 6) - (dy - 3) * (l - 6) : (l - 1 - dx) * (h - 6) - (dy - 3) * (l - 6);
    if (Math.abs(biais - 3 * (h - 6)) < 2.2 * (h - 6)) return m.bois.clair;
    if ((dy - 3) % 4 === 3) return m.bois.sombre;
    return alea(i + graine, j) < 0.06 ? m.bois.sombre : m.bois.fond;
  });
  // Les clous aux coins.
  for (const [cx, cy] of [[1, 1], [l - 2, 1], [1, h - 2], [l - 2, h - 2]] as const) pl.poser(x + cx, y + cy, m.fer.trait);
}

/** Un tonneau debout, cerclé de fer, posé sur la rangée `bas`. */
function tonneau(pl: Planche, m: Matieres, x: number, bas: number, l = 13, h = 18): void {
  const y = bas - h + 1;
  for (let r = 0; r < h; r++) {
    const retrait = r === 0 || r === h - 1 ? 2 : r < 3 || r > h - 4 ? 1 : 0;
    for (let i = x + retrait; i < x + l - retrait; i++) {
      const t = (i - x) / (l - 1);
      let couleur: string = t < 0.22 ? m.bois.clair : t > 0.72 ? m.bois.sombre : (i - x) % 3 === 0 ? m.bois.autre : m.bois.fond;
      if (r === 0) couleur = m.bois.clair;
      if (r === 2 || r === h - 3 || r === Math.floor(h / 2)) couleur = t < 0.3 ? m.fer.clair : t > 0.7 ? m.fer.trait : m.fer.sombre;
      if (r === h - 1) couleur = m.bois.creux;
      pl.poser(i, y + r, couleur);
    }
  }
}

/** Un conteneur de tôle ondulée, ses deux barres de porte à droite, son étiquette. */
function conteneur(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, t: Ton): void {
  pl.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dy === 0) return t.clair;
    if (dy === h - 1) return t.trait;
    if (dx === 0 || dx === l - 1) return t.trait;
    if (dx === 1) return t.clair;
    if (dx >= l - 8) return dx === l - 6 || dx === l - 3 ? t.trait : t.fond;
    return dx % 3 === 0 ? t.sombre : dx % 3 === 1 ? t.fond : alea(i, j) < 0.5 ? t.fond : t.clair;
  });
  pl.rect(x + 3, y + 3, 4, 3, m.blanc.fond);
  pl.poser(x + l - 5, y + Math.floor(h / 2), m.fer.clair);
}

/** Les lettres du clan, 5 × 7 cases chacune. */
const GAL = [" ###   ###  #    ", "#   # #   # #    ", "#     #   # #    ", "# ### ##### #    ", "#   # #   # #    ", "#   # #   # #    ", " ###  #   # #####"] as const;
function lettresDuClan(pl: Planche, x: number, y: number, couleur: string): void {
  pl.lettres(x, y, GAL, { "#": couleur });
}

/**
 * Le pavillon du clan, bleu, blanc, rouge : sa hampe est à la colonne `x`, il flotte vers la gauche. Une onde le parcourt en
 * 4 images, de la hampe vers le bout.
 */
function pavillon(pl: Planche, m: Matieres, x: number, y: number, image: number, l = 24, h = 15, p: Matieres["pavillon"] = m.pavillon): void {
  for (let i = 0; i < l; i++) {
    const phase = i / 4.2 - (image * Math.PI) / 2;
    const ampleur = Math.min(1, i / 7) * 1.7;
    const dy = Math.round(Math.sin(phase) * ampleur + i * 0.08);
    const ombre = Math.cos(phase) < -0.25;
    const tiers = Math.floor((i * 3) / l);
    const couleur = tiers === 0 ? (ombre ? p.bleuOmbre : p.bleu) : tiers === 1 ? (ombre ? p.blancOmbre : p.blanc) : ombre ? p.rougeOmbre : p.rouge;
    const sombre = tiers === 0 ? p.bleuOmbre : tiers === 1 ? p.blancOmbre : p.rougeOmbre;
    for (let j = 0; j < h; j++) pl.poser(x - 1 - i, y + j + dy, j === h - 1 ? sombre : couleur);
  }
}

/**
 * La fumée d'une cheminée : des bouffées qui montent de `pas` cases en 4 images, grossissent, dérivent vers la gauche et se
 * défont en damier avant de disparaître, sans à-coup. `x`, `y` : la bouche de la cheminée.
 */
function fumee(pl: Planche, m: Matieres, x: number, y: number, image: number, haut = 44, derive = 0.5, r0 = 2, croit = 0.1): void {
  const pas = 8;
  for (let k = Math.ceil(haut / pas); k >= 0; k--) {
    const h = k * pas + image * 2;
    if (h >= haut) continue;
    const t = h / haut;
    const r = Math.round(r0 + h * croit + (k % 2));
    const cx = x - Math.round(h * derive + 1.5 * Math.sin(h / 8));
    const cy = y - h;
    pl.disque(cx, cy, r, (dx, dy) => {
      const X = cx + dx;
      const Y = cy + dy;
      if (t > 0.8 && (X % 2 !== 0 || Y % 2 !== 0)) return null;
      if (t > 0.55 && (X + Y) % 2 !== 0) return null;
      if (dy < -r / 3 || dx < -r / 2) return m.fumee.clair;
      if (dy > r / 3) return m.fumee.sombre;
      return m.fumee.fond;
    });
  }
}

/** Un hublot rond de 5 cases, cerclé, éclairé la nuit. */
function hublot(pl: Planche, m: Matieres, x: number, y: number, t: Ton): void {
  pl.lettres(x, y, [" ooo ", "ocvvo", "ovvvo", "ovvvo", " ooo "], { o: t.trait, v: m.vitre, c: m.vitreClaire });
}

/** Une fenêtre à carreaux, éclairée la nuit. */
function fenetre(pl: Planche, m: Matieres, x: number, y: number, l: number, h: number, cadre: string, carreau = 5): void {
  pl.rect(x, y, l, h, (i, j) => {
    const dx = i - x;
    const dy = j - y;
    if (dx === 0 || dy === 0 || dx === l - 1 || dy === h - 1) return cadre;
    if (dx % carreau === 0) return cadre;
    return dx - dy === 2 || dx - dy === 3 ? m.vitreClaire : m.vitre;
  });
}

/** Un feu de 2 cases de côté, et sa lueur sur ce qui l'entoure la nuit. */
function feu(pl: Planche, m: Matieres, x: number, y: number, allume: string): void {
  if (m.veille > 0.3) {
    for (const [dx, dy] of [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]] as const) {
      const fond = pl.lire(x + dx, y + dy);
      if (fond !== null) pl.poser(x + dx, y + dy, melanger(fond, allume, 0.4 * m.veille));
    }
  }
  pl.rect(x, y, 2, 2, m.feu(allume));
}

/** Un garde-corps : une lisse en haut, une à mi-hauteur, un montant tous les `pas` cases. `bas` : la rangée du pont à cette colonne. */
function rambarde(pl: Planche, x0: number, x1: number, bas: number | ((x: number) => number), h: number, t: Ton, pas = 7): void {
  for (let x = x0; x <= x1; x++) {
    const b = typeof bas === "number" ? bas : bas(x);
    pl.poser(x, b - h, t.clair);
    pl.poser(x, b - Math.floor(h / 2), t.sombre);
    if ((x - x0) % pas === 0 || x === x1) for (let j = 1; j < h; j++) pl.poser(x, b - j, t.sombre);
  }
}

/** Une bitte d'amarrage de fer, posée sur la rangée `bas`. */
function bitte(pl: Planche, m: Matieres, x: number, bas: number): void {
  pl.lettres(x, bas - 9, [" ccmmmss ", "cmmmmmmss", "mmmmmmsss", " mmmssss ", "   cms   ", "   cms   ", "   cms   ", "  ccmss  ", " ccmmmss ", " mmmmsss "], {
    c: m.fer.clair,
    m: m.fer.sombre,
    s: m.fer.trait,
  });
}

/** Une ancre de fer, haute de 11 cases. */
function ancre(pl: Planche, m: Matieres, x: number, y: number): void {
  pl.lettres(x, y, ["  ooo  ", "  o o  ", "  ooo  ", " ooooo ", "   o   ", "   o   ", "   o   ", "o  o  o", "o  o  o", "oo o oo", " ooooo ", "  ooo  "], { o: m.fer.trait });
}

/** Une bouée de sauvetage, orange et blanche, de 7 cases. */
function bouee(pl: Planche, m: Matieres, x: number, y: number): void {
  pl.lettres(x, y, [" obbo  ", "ob  bo ", "b    b ", "o    o ", "b    b ", "ob  bo ", " obbo  "], { o: m.orange.fond, b: m.blanc.clair });
}

/** Un pneu pendu en défense contre le quai. */
function pneu(pl: Planche, m: Matieres, x: number, y: number): void {
  pl.lettres(x, y, ["  ooooo  ", " occcooo ", "oco   ooo", "oc     oo", "oo     oo", "oo     oo", "ooo   ooo", " ooooooo ", "  ooooo  "], { o: m.noir, c: m.fer.sombre });
}

/** Un lampadaire de fer : sa lanterne éclaire la nuit. `bas` : la rangée de son pied, `h` : sa hauteur. */
function lampadaire(pl: Planche, m: Matieres, x: number, bas: number, h: number): void {
  pl.rect(x, bas - h + 9, 2, h - 9, (i) => (i === x ? m.fer.fond : m.fer.trait));
  pl.rect(x - 1, bas - 2, 4, 3, m.fer.trait);
  pl.lettres(x - 3, bas - h, ["  oooo  ", " oooooo ", " ovccvo ", " ovccvo ", " ovvvvo ", "  oooo  ", "   oo   ", "   oo   ", "   oo   "], { o: m.fer.trait, v: m.vitre, c: m.vitreClaire });
}

/* ---------- La coque d'un navire ---------- */

interface Coque {
  /** La rangée du plat-bord à cette colonne. */
  haut: (x: number) => number;
  /** La rangée de la ligne de flottaison. */
  bas: number;
  /** La poupe et l'étrave à cette rangée. */
  gauche: (y: number) => number;
  droite: (y: number) => number;
  t: Ton;
  /** Le nombre de rangées de carène rouge au-dessus de l'eau. */
  carene: number;
  /** Un filet peint sous le plat-bord. */
  filet?: string;
}

function coque(pl: Planche, m: Matieres, o: Coque): void {
  const { t } = o;
  const joint = melanger(t.fond, t.sombre, 0.6);
  const jointBas = melanger(t.sombre, t.trait, 0.6);
  for (let y = 0; y <= o.bas; y++) {
    const a = o.gauche(y);
    const b = o.droite(y);
    for (let x = a; x <= b; x++) {
      const h = o.haut(x);
      if (y < h) continue;
      const d = y - h;
      const eau = o.bas - y;
      let couleur: string;
      if (eau < o.carene) {
        couleur = x === a ? m.carene.clair : x >= b - 1 ? m.carene.trait : eau === 0 ? m.carene.sombre : alea(x, y + 5) < 0.14 ? m.carene.sombre : m.carene.fond;
      } else if (eau === o.carene) couleur = x >= b - 1 ? t.trait : m.blanc.sombre;
      else if (d === 0) couleur = t.clair;
      else if (x >= b - 1) couleur = t.trait;
      else if (x === a) couleur = t.clair;
      else if (o.filet && (d === 4 || d === 5)) couleur = o.filet;
      else {
        const lit = Math.floor(d / 9);
        const dans = d % 9;
        const bas = eau < o.carene + 9 || (eau < o.carene + 11 && (x + y) % 2 === 0);
        if (dans === 8) couleur = bas ? jointBas : joint;
        else if ((x + lit * 13) % 28 === 0) couleur = bas ? jointBas : joint;
        else if (dans === 6 && x % 5 === 0) couleur = bas ? jointBas : joint;
        else {
          const g = alea(x, y + 3);
          couleur = bas ? (g < 0.03 ? joint : t.sombre) : g < 0.02 ? t.clair : g > 0.975 ? joint : t.fond;
        }
      }
      pl.poser(x, y, couleur);
    }
  }
}

/** Une coulure de rouille sous un dalot ou une ancre. */
function coulure(pl: Planche, m: Matieres, x: number, y: number, h: number): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < 2; i++) {
      const fond = pl.lire(x + i, y + j);
      if (fond !== null && alea(x + i, y + j) < 0.85 - j / (h * 1.6)) pl.poser(x + i, y + j, melanger(fond, m.rouille.fond, i === 0 ? 0.6 : 0.35));
    }
  }
}

/** Une cheminée de navire : peinte, coiffée de noir, la bande du clan autour. `penche` : cases de recul du haut. */
function cheminee(pl: Planche, m: Matieres, x: number, haut: number, bas: number, l: number, t: Ton, penche = 0, p: Matieres["pavillon"] = m.pavillon): void {
  for (let y = haut; y <= bas; y++) {
    const dx = Math.round(((bas - y) / (bas - haut)) * -penche);
    for (let i = 0; i < l; i++) {
      const r = y - haut;
      let couleur: string = i === 0 ? t.clair : i >= l - 3 ? t.sombre : i < 3 ? t.clair : t.fond;
      if (r < 4) couleur = i >= l - 3 ? NUIT : m.noir;
      else if (r === 4) couleur = t.trait;
      else if (r >= 8 && r < 14) {
        const ombre = i >= l - 3;
        couleur = r < 10 ? (ombre ? p.bleuOmbre : p.bleu) : r < 12 ? (ombre ? p.blancOmbre : p.blanc) : ombre ? p.rougeOmbre : p.rouge;
      } else if (r % 9 === 7 && i % 3 === 1) couleur = t.sombre;
      pl.poser(x + i + dx, y, couleur);
    }
  }
  pl.rect(x - 1 - penche, haut, l + 2, 1, m.fer.sombre);
}

/** Un navire fini : le corps, dessiné à part, se pose une case plus bas aux images 2 et 3 ; la fumée monte derrière lui. */
function navire(
  largeur: number,
  corpsHauteur: number,
  corps: (pl: Planche, m: Matieres, image: number) => void,
  bouche: { x: number; y: number; haut: number; derive: number; r0: number; croit: number },
  miroir = false,
): DessinDeBatiment {
  return {
    largeur,
    hauteur: corpsHauteur + NAVIRE_MARGE,
    images: 4,
    dessiner(lumiere: Lumiere, image: number): Decor {
      const m = matieres(lumiere);
      const i = ((Math.round(image) % 4) + 4) % 4;
      const dessin = new Planche(largeur, corpsHauteur);
      corps(dessin, m, i);
      const pl = new Planche(largeur, corpsHauteur + NAVIRE_MARGE);
      const creux = i >= 2 ? 1 : 0;
      fumee(pl, m, bouche.x, bouche.y + NAVIRE_MARGE + creux, i, bouche.haut, bouche.derive, bouche.r0, bouche.croit);
      coller(pl, dessin, 0, NAVIRE_MARGE + creux);
      if (!miroir) return pl.decor();
      // Le navire d'en face : le même dessin retourné, proue à gauche.
      const retourne = new Planche(largeur, corpsHauteur + NAVIRE_MARGE);
      for (let y = 0; y < retourne.hauteur; y++) for (let x = 0; x < largeur; x++) retourne.poser(largeur - 1 - x, y, pl.lire(x, y));
      return retourne.decor();
    },
  };
}

/* ---------- Le navire de commerce ---------- */

const COMMERCE = { largeur: 300, hauteur: 118 } as const;

function corpsDuCommerce(pl: Planche, m: Matieres, image: number): void {
  const bas = COMMERCE.hauteur - 1;
  const haut = (x: number): number => (x < 94 ? 70 : x >= 238 ? 68 : 78);

  // Les conteneurs, derrière le pavois : cinq piles.
  const tons = [m.marine, m.carene, m.jaune, m.vert, m.blanc, m.bleu, m.rouille, m.gris] as const;
  const piles = [3, 4, 3, 4, 2] as const;
  piles.forEach((nombre, k) => {
    for (let r = 0; r < nombre; r++) {
      const t = tons[Math.floor(alea(k * 7 + 1, r * 5 + 2) * tons.length)]!;
      conteneur(pl, m, 100 + k * 27, 80 - (r + 1) * 13, 26, 13, t);
    }
  });
  // Les montants qui tiennent les piles.
  for (const x of [98, 235]) pl.rect(x, 30, 2, 50, (i) => (i === x ? m.fer.fond : m.fer.trait));

  // Le château, à l'arrière : deux étages et la passerelle.
  tole(pl, 40, 54, 52, 16, m.blanc, 13, 1);
  tole(pl, 44, 38, 46, 16, m.blanc, 13, 2);
  tole(pl, 58, 24, 34, 14, m.blanc, 17, 3);
  pl.rect(38, 53, 56, 1, m.blanc.trait);
  pl.rect(42, 37, 52, 1, m.blanc.trait);
  pl.rect(55, 22, 40, 2, (_i, j) => (j === 22 ? m.blanc.clair : m.blanc.trait));
  // Les vitres de la passerelle, les fenêtres des étages, la porte.
  fenetre(pl, m, 61, 27, 29, 7, m.blanc.trait, 7);
  for (const x of [48, 58, 68, 80]) fenetre(pl, m, x, 42, 7, 7, m.blanc.trait, 3);
  for (const x of [45, 56, 67]) hublot(pl, m, x, 59, m.blanc);
  pl.rect(79, 57, 8, 13, (i, j) => (i === 79 || j === 57 ? m.marine.trait : i === 85 && j === 64 ? m.jaune.clair : m.marine.fond));
  // L'aileron de passerelle et son feu vert (on voit le flanc tribord).
  pl.rect(92, 37, 6, 1, m.blanc.trait);
  rambarde(pl, 92, 97, 37, 6, m.blanc, 5);
  feu(pl, m, 94, 33, "#3cf07a");
  // La cheminée, derrière la passerelle.
  cheminee(pl, m, 43, 6, 37, 13, m.marine);
  // Le mât du radar sur le toit.
  pl.rect(74, 6, 2, 16, (i) => (i === 74 ? m.blanc.fond : m.blanc.trait));
  pl.rect(68, 10, 14, 2, (_i, j) => (j === 10 ? m.blanc.clair : m.blanc.trait));
  pl.rect(70, 15, 10, 1, m.blanc.trait);
  pl.rect(83, 17, 1, 5, m.fer.sombre);
  feu(pl, m, 74, 4, "#fff6cf");
  // Le canot de sauvetage orange, à l'arrière.
  pl.lettres(26, 59, [" cccccccccc ", "cooooooooooo", "oooboooboooo", "sooooooooooo", " ssssssssss "], { c: m.orange.clair, o: m.orange.fond, s: m.orange.sombre, b: m.vitre });
  pl.rect(28, 64, 2, 6, m.fer.sombre);
  pl.rect(34, 64, 2, 6, m.fer.sombre);

  // Le mât de charge sur le gaillard d'avant, sa corne et ses haubans.
  ligne(pl, 257, 22, 292, 66, m.fer.trait);
  ligne(pl, 256, 22, 238, 60, m.fer.trait);
  ligne(pl, 257, 44, 236, 34, m.jaune.fond, 2);
  ligne(pl, 257, 24, 236, 34, m.fer.trait);
  pl.rect(256, 18, 3, 50, (i) => (i === 256 ? m.jaune.clair : i === 258 ? m.jaune.sombre : m.jaune.fond));
  pl.rect(252, 26, 11, 2, (_i, j) => (j === 26 ? m.jaune.clair : m.jaune.sombre));
  feu(pl, m, 256, 16, "#fff6cf");
  // Le guindeau et le garde-corps du gaillard.
  pl.lettres(268, 61, ["  ooo   ooo ", " occcoooccco", "occcccccccco", "osssssssssso", " oooooooooo ", "  o      o  ", "  o      o  "], { o: m.fer.trait, c: m.fer.clair, s: m.fer.sombre });
  rambarde(pl, 240, 293, 68, 8, m.blanc, 8);
  rambarde(pl, 24, 39, 70, 8, m.blanc, 5);
  // L'échelle du château au pont.
  for (let k = 0; k < 8; k++) pl.rect(94 + k, 70 + k, 3, 1, m.fer.clair);

  // La coque.
  coque(pl, m, {
    haut,
    bas,
    gauche: (y) => 24 + (y > 103 ? Math.round((y - 103) * 1.1) : 0),
    droite: (y) => 296 - Math.round((y - 68) * 0.5),
    t: m.marine,
    carene: 7,
    filet: m.blanc.fond,
  });
  // Le nom, l'ancre, les hublots de l'équipage, les dalots et leur rouille.
  lettresDuClan(pl, 250, 82, m.blanc.clair);
  pl.rect(274, 76, 5, 4, m.noir);
  ancre(pl, m, 273, 79);
  coulure(pl, m, 276, 92, 12);
  for (const x of [34, 47, 60, 73]) hublot(pl, m, x, 80, m.marine);
  for (const x of [118, 152, 186, 220]) {
    pl.rect(x, 85, 3, 2, m.noir);
    coulure(pl, m, x, 87, 14);
  }
  feu(pl, m, 25, 73, "#fff6cf");
  // Le mât de pavillon, à la poupe.
  pl.rect(28, 44, 1, 26, m.blanc.trait);
  pavillon(pl, m, 28, 45, image, 24, 15);
}

/* ---------- Le navire de guerre ---------- */

const GUERRE = { largeur: 330, hauteur: 124 } as const;

/** Une tourelle et son canon au repos, à l'horizontale. `sens` : 1, le canon vers la proue ; −1, vers la poupe. */
function tourelle(pl: Planche, x: number, bas: number, sens: 1 | -1, t: Ton): void {
  const en = (i: number): number => (sens === 1 ? x + i : x + 29 - i);
  for (let r = 0; r < 13; r++) {
    const y = bas - 12 + r;
    const debut = r < 2 ? 2 - r : 0;
    const fin = 29 - Math.max(0, 5 - r);
    for (let i = debut; i <= fin; i++) {
      let couleur: string = r === 0 ? t.clair : r === 12 ? t.trait : i >= fin - 1 ? t.sombre : i === debut ? t.clair : t.fond;
      if (r > 1 && r < 11 && i > 2 && i < fin - 3 && r % 4 === 2 && i % 6 === 3) couleur = t.sombre;
      if (r === 6 && i > 3 && i < 12) couleur = t.sombre;
      pl.poser(en(i), y, couleur);
    }
  }
  // Le socle, le masque, le canon et sa bouche.
  for (let i = 3; i <= 26; i++) pl.poser(en(i), bas + 1, i < 6 ? t.fond : t.trait);
  for (let i = 27; i <= 31; i++) for (let j = 0; j < 7; j++) pl.poser(en(i), bas - 9 + j, j === 0 ? t.clair : j === 6 ? t.trait : t.sombre);
  for (let i = 32; i <= 58; i++) {
    pl.poser(en(i), bas - 7, t.clair);
    pl.poser(en(i), bas - 6, t.fond);
    pl.poser(en(i), bas - 5, t.trait);
  }
  for (let i = 57; i <= 59; i++) for (let j = 0; j < 5; j++) pl.poser(en(i), bas - 8 + j, j === 0 ? t.fond : t.trait);
}

function corpsDeGuerre(pl: Planche, m: Matieres, image: number, ennemi = false): void {
  const bas = GUERRE.hauteur - 1;
  const haut = (x: number): number => (x < 236 ? 92 : 92 - Math.round(((x - 236) * 10) / 88));
  /** Notre navire est gris ; celui du clan d'en face, prune, sans lettres, à la bande et au pavillon ocre. */
  const c: Ton = ennemi ? m.prune : m.gris;
  const g = ennemi ? m.pruneHaut : m.grisHaut;
  const bandes = ennemi ? m.pavillonEnnemi : m.pavillon;

  // La cheminée, penchée vers l'arrière, sur le premier rouf.
  cheminee(pl, m, 110, 46, 75, 17, c, 4, bandes);
  // Les roufs : deux étages et la passerelle.
  tole(pl, 96, 76, 133, 16, g, 19, 4);
  tole(pl, 132, 62, 64, 14, g, 16, 5);
  tole(pl, 154, 48, 42, 14, g, 14, 6);
  pl.rect(94, 75, 137, 1, g.trait);
  pl.rect(130, 61, 68, 1, g.trait);
  pl.rect(151, 45, 48, 3, (_i, j) => (j === 45 ? g.clair : j === 47 ? g.trait : g.sombre));
  // L'avant de la passerelle, en biais.
  for (let r = 0; r < 14; r++) for (let i = 0; i < Math.round((13 - r) / 3); i++) pl.poser(195 - i, 48 + r, null);
  fenetre(pl, m, 158, 51, 34, 6, g.trait, 6);
  // Portes étanches, hublots, manches à air.
  for (const x of [104, 150, 190]) pl.rect(x, 79, 7, 13, (i, j) => (i === x || j === 79 || i === x + 6 ? g.trait : i === x + 4 && j === 85 ? m.fer.trait : g.sombre));
  for (const x of [116, 127, 138, 162, 173, 202, 213]) hublot(pl, m, x, 81, g);
  for (const x of [138, 150, 174, 186]) hublot(pl, m, x, 66, g);
  for (const x of [136, 200]) pl.lettres(x, 54 + (x === 200 ? 14 : 0), [" ooo", "occo", "oso ", " o  ", " o  ", " o  ", " o  ", " o  "], { o: g.trait, c: m.noir, s: g.sombre });
  // Les radeaux de sauvetage, en bidons blancs.
  for (const x of [98, 106]) pl.lettres(x, 70, [" cccc ", "cbbbbs", "cbbbbs", " ssss ", " o  o "], { c: m.blanc.clair, b: m.blanc.fond, s: m.blanc.sombre, o: g.trait });
  // Le dôme du radar de veille.
  if (ennemi) {
    // Chez l'adversaire : un télémètre carré à deux bras.
    pl.rect(182, 38, 10, 7, (i, j) => (j === 38 ? g.clair : i === 191 || j === 44 ? g.trait : g.sombre));
    pl.rect(176, 40, 22, 2, (_i, j) => (j === 40 ? g.clair : g.trait));
  } else {
    pl.disque(187, 39, 5, (dx, dy) => (dx + dy < -3 ? m.blanc.clair : dx + dy > 4 ? m.blanc.sombre : m.blanc.fond));
    pl.rect(184, 44, 7, 1, g.trait);
  }

  // Le mât : un fût, deux hunes, une vergue, ses drisses.
  ligne(pl, 164, 45, 171, 20, g.trait);
  ligne(pl, 181, 45, 174, 20, g.trait);
  pl.rect(171, 6, 3, 40, (i) => (i === 171 ? g.clair : i === 173 ? g.trait : g.fond));
  pl.rect(165, 30, 15, 2, (_i, j) => (j === 30 ? g.clair : g.trait));
  pl.rect(160, 12, 25, 1, g.trait);
  ligne(pl, 160, 13, 165, 29, m.fer.sombre);
  ligne(pl, 184, 13, 179, 29, m.fer.sombre);
  pl.rect(172, 2, 1, 4, g.trait);
  feu(pl, m, 172, 8, "#fff6cf");
  // L'antenne du radar tourne : un demi-tour en 4 images.
  const demi = ennemi ? 6 : [13, 9, 2, 9][image]!;
  pl.rect(172 - demi, 20, demi * 2 + 1, 6, (i, j) => {
    if (j === 20 || j === 25 || i === 172 - demi || i === 172 + demi) return g.trait;
    return (i + j) % 2 === 0 ? g.sombre : m.fer.sombre;
  });
  pl.rect(171, 26, 3, 4, g.trait);

  // Les tourelles : deux à l'avant, l'une au-dessus de l'autre, une à l'arrière.
  tourelle(pl, 200, 73, 1, c);
  tourelle(pl, 242, 89, 1, c);
  tourelle(pl, 62, 90, -1, c);
  // Garde-corps et mâts de pavillon.
  rambarde(pl, 276, 318, haut, 7, g, 7);
  rambarde(pl, 36, 58, 92, 7, g, 7);
  pl.rect(320, 72, 1, 12, g.trait);
  pl.rect(34, 66, 1, 26, g.trait);
  feu(pl, m, 203, 58, ennemi ? "#ff5a4a" : "#3cf07a");

  // La coque : fine, l'étrave élancée, le tableau un peu rentré.
  coque(pl, m, {
    haut,
    bas,
    gauche: (y) => 30 + Math.round(Math.max(0, y - 92) * 0.3),
    droite: (y) => 324 - Math.round((y - 82) * 1.0),
    t: c,
    carene: 6,
    ...(ennemi ? { filet: m.pavillonEnnemi.blanc } : {}),
  });
  // La bande sombre du bas, les lettres du clan, l'ancre, les hublots, la rouille.
  if (!ennemi) lettresDuClan(pl, 262, 97, m.blanc.clair);
  pl.rect(296, 90, 5, 4, m.noir);
  ancre(pl, m, 295, 93);
  coulure(pl, m, 298, 105, 8);
  for (let x = 52; x <= 240; x += 13) {
    pl.rect(x, 100, 3, 3, (i, j) => (i === x + 1 && j === 101 ? m.vitreClaire : j === 100 || i === x ? c.trait : m.vitre));
  }
  for (const x of [90, 160, 226]) {
    pl.rect(x, 96, 3, 2, m.noir);
    coulure(pl, m, x, 98, 10);
  }
  feu(pl, m, 31, 95, "#fff6cf");
  pavillon(pl, m, 34, 67, image, 24, 15, bandes);
}

/* ---------- Le navire de transport de troupes ---------- */

const TRANSPORT = { largeur: 236, hauteur: 112 } as const;

function corpsDuTransport(pl: Planche, m: Matieres, image: number): void {
  const bas = TRANSPORT.hauteur - 1;
  const o = m.olive;
  const k = m.kaki;

  // La cheminée et la timonerie, à l'arrière.
  cheminee(pl, m, 40, 20, 51, 11, o);
  tole(pl, 40, 52, 54, 20, k, 14, 7);
  tole(pl, 52, 34, 42, 18, k, 14, 8);
  pl.rect(38, 51, 58, 1, k.trait);
  pl.rect(49, 32, 48, 2, (_i, j) => (j === 32 ? k.clair : k.trait));
  fenetre(pl, m, 56, 38, 36, 8, k.trait, 7);
  for (const x of [45, 57]) hublot(pl, m, x, 58, k);
  pl.rect(70, 56, 9, 16, (i, j) => (i === 70 || j === 56 || i === 78 ? k.trait : i === 76 && j === 64 ? m.jaune.clair : o.fond));
  bouee(pl, m, 83, 58);
  rambarde(pl, 38, 51, 51, 7, k, 6);
  // Le mât : feu, corne de brume, petite antenne.
  pl.rect(72, 8, 2, 24, (i) => (i === 72 ? k.fond : k.trait));
  pl.rect(66, 14, 14, 1, k.trait);
  pl.rect(68, 20, 10, 2, (_i, j) => (j === 20 ? k.clair : k.trait));
  pl.rect(84, 26, 6, 3, (i, j) => (j === 26 ? m.jaune.clair : i === 89 ? m.jaune.sombre : m.jaune.fond));
  pl.rect(86, 29, 2, 3, k.trait);
  feu(pl, m, 72, 6, "#fff6cf");
  feu(pl, m, 94, 47, "#3cf07a");

  // Le puits des troupes : l'ombre du dedans, les arceaux, la bâche de toile.
  pl.rect(98, 62, 98, 10, (i, j) => (j > 67 && (i - 98) % 16 > 3 && (i - 98) % 16 < 13 ? melanger(m.dedans, m.bois.fond, 0.45) : m.dedans));
  for (let x = 98; x <= 194; x++) {
    const dans = (x - 98) % 24;
    const creux = Math.round(3 * Math.sin((dans / 24) * Math.PI));
    const hautDeBache = 49 + creux;
    for (let y = hautDeBache; y <= 61 + (creux > 1 ? 1 : 0); y++) {
      const r = y - hautDeBache;
      let couleur: string = r === 0 ? k.clair : r < 4 ? k.fond : r > 9 ? k.sombre : alea(x, y) < 0.08 ? k.sombre : k.fond;
      if (dans === 0 || dans === 23) couleur = k.trait;
      else if (dans === 1) couleur = k.clair;
      else if (y === 61 + (creux > 1 ? 1 : 0)) couleur = k.trait;
      else if (r === 6 && dans % 4 === 2) couleur = m.bois.corde;
      pl.poser(x, y, couleur);
    }
    if (dans === 0 || dans === 23) for (let y = 62; y < 72; y++) pl.poser(x, y, o.trait);
  }
  // La potence et les chaînes de la rampe d'avant.
  pl.rect(198, 40, 4, 32, (i) => (i === 198 ? o.clair : i === 201 ? o.trait : o.fond));
  pl.rect(196, 38, 8, 3, (_i, j) => (j === 38 ? o.clair : o.trait));
  for (let s = 0; s <= 16; s++) pl.poser(203 + s, 41 + Math.round(s * 0.2 + 2 * Math.sin((s / 16) * Math.PI)), s % 2 === 0 ? m.fer.trait : m.fer.clair);
  // La rampe d'avant, relevée : une grande porte nervurée.
  for (let y = 38; y <= 98; y++) {
    const x0 = 216 + Math.round((y - 38) * 0.06);
    for (let i = 0; i < 8; i++) {
      const r = y - 38;
      let couleur: string = i === 0 ? o.clair : i >= 6 ? o.trait : r % 6 === 5 ? o.trait : r % 6 === 0 ? o.clair : o.sombre;
      if (r < 2) couleur = i < 6 ? o.clair : o.trait;
      if (r < 1 && (i === 0 || i === 7)) continue;
      pl.poser(x0 + i, y, couleur);
    }
  }

  // La coque : trapue, l'avant droit sous la rampe.
  coque(pl, m, {
    haut: () => 72,
    bas,
    gauche: (y) => 30 + (y > 99 ? Math.round((y - 99) * 0.9) : 0),
    droite: (y) => 218 - (y > 94 ? Math.round((y - 94) * 0.9) : 0),
    t: o,
    carene: 7,
  });
  // La lisse de bois, les pneus de défense, les lettres et les couleurs du clan.
  pl.rect(31, 88, 187, 3, (i, j) => (j === 88 ? m.bois.clair : j === 90 ? m.bois.creux : i % 17 === 0 ? m.bois.sombre : m.bois.fond));
  for (const x of [58, 190]) {
    pl.rect(x + 4, 73, 1, 10, m.bois.cordeSombre);
    pneu(pl, m, x, 82);
  }
  lettresDuClan(pl, 148, 77, m.blanc.clair);
  pl.rect(170, 76, 12, 9, (i, j) => {
    const p = m.pavillon;
    if (j === 84) return i < 174 ? p.bleuOmbre : i < 178 ? p.blancOmbre : p.rougeOmbre;
    return i < 174 ? p.bleu : i < 178 ? p.blanc : p.rouge;
  });
  for (const x of [38, 50]) hublot(pl, m, x, 78, o);
  pl.rect(204, 77, 5, 4, m.noir);
  ancre(pl, m, 203, 80);
  // La passerelle de coupée, rangée le long du bord : marches, limon, main courante.
  for (let s = 0; s <= 48; s++) {
    const x = 92 + s;
    const y = 74 + Math.round(s * 0.5);
    pl.poser(x, y - 7, m.blanc.clair);
    if (s % 8 === 0) for (let j = 0; j < 7; j++) pl.poser(x, y - j, m.blanc.sombre);
    pl.poser(x, y, m.blanc.clair);
    pl.poser(x, y + 1, s % 4 < 2 ? m.blanc.fond : m.blanc.trait);
    pl.poser(x, y + 2, m.blanc.trait);
  }
  pl.rect(140, 99, 14, 2, (_i, j) => (j === 99 ? m.blanc.clair : m.blanc.trait));
  for (const x of [74]) {
    pl.rect(x, 80, 3, 2, m.noir);
    coulure(pl, m, x, 82, 6);
  }
  feu(pl, m, 31, 75, "#fff6cf");
  // Le mât de pavillon, à la poupe : un grand pavillon du clan.
  pl.rect(34, 42, 1, 30, k.trait);
  pavillon(pl, m, 34, 43, image, 26, 17);
}

/* ---------- Le port ---------- */

const QUAI = PORT_QUAI.haut;
const FACE = PORT_QUAI.bas + 1;
const EAU = PORT_HAUTEUR - 1;

/** Le phare : une tour de pierre enduite, sa galerie, sa lanterne allumée la nuit. */
function phare(pl: Planche, m: Matieres): void {
  const cx = 32;
  const haut = 62;
  const pied = QUAI - 1;
  for (let y = haut; y <= pied; y++) {
    const demi = 14 + Math.round(((y - haut) / (pied - haut)) * 8);
    for (let x = cx - demi; x <= cx + demi; x++) {
      const t = (x - (cx - demi)) / (demi * 2);
      const mele = (x + y) % 2 === 0;
      const rang = t < 0.22 || (t < 0.3 && mele) ? 0 : t > 0.74 || (t > 0.66 && mele) ? 2 : 1;
      let tons: Ton = m.blanc;
      if (y >= 70 && y < 82) tons = m.bleu;
      let couleur = [tons.clair, tons.fond, tons.sombre][rang]!;
      // Le soubassement de pierre nue, puis l'enduit et ses lits.
      if (y > pied - 14) {
        const lit = Math.floor((pied - y) / 5);
        const joint = (pied - y) % 5 === 4 || (x + lit * 5) % 10 === 0;
        couleur = joint ? m.pierre.joint : [m.pierre.clair, m.pierre.fond, m.pierre.sombre][rang]!;
      } else if (tons === m.blanc && (y - haut) % 7 === 6 && alea(x >> 2, y) < 0.5) couleur = m.blanc.sombre;
      if (x === cx + demi) couleur = tons === m.bleu ? tons.trait : m.blanc.trait;
      pl.poser(x, y, couleur);
    }
  }
  // La porte de bois, cintrée, ses pentures et sa lanterne.
  for (let y = 108; y <= pied; y++) {
    const r = y - 108;
    const retrait = r < 2 ? 4 - r * 2 : r < 4 ? 1 : 0;
    for (let x = cx - 12 + retrait; x <= cx + 12 - retrait; x++) {
      const bord = x === cx - 12 + retrait || x === cx + 12 - retrait || r === 0;
      const dx = x - (cx - 12);
      let couleur: string = bord ? m.pierre.joint : dx % 6 === 0 ? m.bois.creux : dx % 6 === 1 ? m.bois.clair : m.bois.fond;
      if (!bord && (r === 14 || r === 15 || r === 50 || r === 51) && dx < 18) couleur = r % 2 === 0 ? m.fer.fond : m.fer.trait;
      if (!bord && dx === 20 && r > 32 && r < 37) couleur = m.fer.clair;
      pl.poser(x, y, couleur);
    }
  }
  pl.lettres(cx - 3, 97, [" oooo ", "ovccvo", "ovccvo", "ovvvvo", " oooo "], { o: m.fer.trait, v: m.vitre, c: m.vitreClaire });
  // Deux meurtrières éclairées.
  for (const y of [86, 96]) if (y === 86) pl.rect(cx + 6, y, 4, 9, (i, j) => (i === cx + 6 || j === y ? m.blanc.trait : m.vitre));
  pl.rect(cx - 9, 87, 4, 9, (i, j) => (i === cx - 9 || j === 87 ? m.blanc.trait : m.vitre));
  // La galerie : consoles, dalle, garde-corps.
  for (let r = 0; r < 5; r++) pl.rect(cx - 20 + r * 2, 62 + r, 41 - r * 4, 1, r === 0 ? m.fer.sombre : m.fer.trait);
  pl.rect(cx - 22, 59, 45, 3, (_i, j) => (j === 59 ? m.fer.clair : j === 61 ? m.fer.trait : m.fer.fond));
  // La lanterne : ses vitres, sa lentille au milieu.
  pl.rect(cx - 11, 38, 23, 21, (i, j) => {
    const dx = i - (cx - 11);
    if (j === 38 || j === 58) return m.fer.sombre;
    if (dx % 6 === 0 || dx === 22) return m.fer.trait;
    const d = Math.abs(i - cx) + Math.abs(j - 48) * 0.9;
    return d < 5 ? melanger(m.vitreClaire, "#fff8d8", m.veille) : d < 9 ? m.vitreClaire : m.vitre;
  });
  rambarde(pl, cx - 22, cx + 22, 59, 9, m.fer, 5);
  // Le toit de tôle, sa boule, son paratonnerre.
  for (let r = 0; r < 13; r++) {
    const demi = 2 + Math.round(r * 0.95);
    for (let x = cx - demi; x <= cx + demi; x++) {
      const t = (x - (cx - demi)) / (demi * 2);
      pl.poser(x, 25 + r, r === 12 ? m.marine.trait : t < 0.3 ? m.marine.clair : t > 0.7 ? m.marine.sombre : (x - cx) % 5 === 0 ? m.marine.sombre : m.marine.fond);
    }
  }
  pl.disque(cx, 22, 2, m.jaune.fond);
  pl.poser(cx - 1, 21, m.jaune.clair);
  pl.rect(cx, 13, 1, 7, m.fer.trait);
}

/** L'entrepôt : soubassement de pierre, murs de planches, toit de tôle ondulée, grande porte coulissante ouverte. */
function entrepot(pl: Planche, m: Matieres, image: number): void {
  const x0 = 64;
  const l = 145;
  // Le tuyau du poêle et sa fumée, derrière le toit.
  fumee(pl, m, 189, 50, image, 44, 0.5, 2, 0.11);
  pl.rect(186, 54, 6, 30, (i) => (i === 186 ? m.fer.clair : i >= 190 ? m.fer.trait : m.fer.fond));
  pl.rect(184, 51, 10, 3, (_i, j) => (j === 51 ? m.fer.clair : m.fer.trait));
  pl.rect(185, 66, 8, 2, m.fer.trait);
  // Les murs.
  planches(pl, m, x0, 96, l, 68);
  pierres(pl, m, x0, 164, l, 12, () => 0, 3);
  pl.rect(x0, 163, l, 1, m.pierre.clair);
  pl.rect(x0, 96, l, 4, (i, j) => (j === 99 && i % 2 === 0 ? m.bois.sombre : m.bois.creux));
  // Les poteaux de fer rivetés aux angles.
  for (const x of [x0, x0 + l - 4]) pl.rect(x, 96, 4, 68, (i, j) => (i === x ? m.fer.clair : i === x + 3 ? m.fer.trait : j % 6 === 3 ? m.fer.trait : m.fer.fond));
  // Le toit de tôle ondulée, son faîtage, ses deux aérateurs, sa verrière.
  for (let y = 72; y <= 95; y++) {
    const retrait = Math.round((95 - y) * 0.3);
    const ombre = y > 92 || (y - 72) % 8 === 7;
    for (let x = x0 - 5 + retrait; x < x0 + l + 5 - retrait; x++) {
      const k = (x - x0 + 8) % 4;
      const bord = x === x0 - 5 + retrait || x === x0 + l + 4 - retrait;
      const tons = ombre ? [m.carene.fond, m.carene.sombre, m.carene.trait] : [m.carene.clair, m.carene.fond, m.carene.sombre];
      pl.poser(x, y, bord ? m.carene.trait : k === 0 ? tons[0]! : k === 3 ? tons[2]! : alea(x, y + 33) < 0.05 ? tons[2]! : tons[1]!);
    }
  }
  pl.rect(x0 - 5, 95, l + 10, 1, m.carene.trait);
  pl.rect(x0 + 2, 70, l - 4, 3, (_i, j) => (j === 70 ? m.fer.clair : j === 72 ? m.fer.trait : m.fer.fond));
  for (const x of [92, 150]) pl.lettres(x, 61, ["  oooooo  ", " occccsso ", " ocssssso ", "oooooooooo", "  ocssso  ", "  ocssso  ", "  ocssso  ", "  ocssso  ", " oooooooo "], { o: m.fer.trait, c: m.fer.clair, s: m.fer.sombre });
  pl.rect(108, 78, 30, 12, (i, j) => (i === 108 || i === 137 || j === 78 || j === 89 || (i - 108) % 6 === 0 ? m.fer.trait : (i - j) % 7 === 0 ? m.vitreClaire : m.vitre));
  // Des coulures de rouille sous le faîtage.
  for (const x of [76, 121, 163, 198]) coulure(pl, m, x, 74, 14);

  // La grande porte : le dedans, ses caisses dans l'ombre, sa lampe pendue.
  const d = m.dedans;
  const ombre = melanger(d, "#000000", 0.35);
  const forme = melanger(d, m.bois.fond, 0.35);
  pl.rect(118, 104, 52, 72, (i, j) => {
    const lueur = m.veille * Math.max(0, 1 - Math.hypot(i - 144, (j - 122) * 0.8) / 34);
    const fond = j > 168 ? melanger(d, m.pierre.fond, 0.25) : d;
    return melanger(fond, "#e0a850", lueur * 0.5);
  });
  for (const [x, y, w, h] of [[120, 150, 16, 19], [137, 156, 13, 13], [124, 136, 13, 14], [153, 146, 15, 23]] as const) {
    pl.rect(x, y, w, h, (i, j) => (i === x || j === y ? forme : (j - y) % 5 === 4 ? ombre : melanger(forme, d, 0.5)));
  }
  pl.rect(144, 104, 1, 12, ombre);
  pl.lettres(141, 116, [" ooooo ", "ooooooo", " vcccv ", "  vvv  "], { o: m.fer.trait, v: m.vitre, c: m.vitreClaire });
  // Le rail, ses galets, et le vantail glissé sur la gauche.
  pl.rect(86, 100, 88, 3, (_i, j) => (j === 100 ? m.fer.clair : j === 102 ? m.fer.trait : m.fer.fond));
  pl.rect(90, 103, 28, 73, (i, j) => {
    const dx = i - 90;
    const dy = j - 103;
    if (dx === 0 || dy === 0 || dx === 27 || dy === 72) return m.bois.creux;
    if (dx < 3 || dx > 24 || dy < 3 || dy > 69 || Math.abs(dy - 36) < 2) return dx === 1 || dy === 1 ? m.bois.clair : m.bois.autre;
    if (Math.abs((dx - 3) * 33 - ((dy < 36 ? dy - 3 : dy - 38) * 21)) < 50) return m.bois.clair;
    return dx % 5 === 0 ? m.bois.sombre : m.bois.fond;
  });
  for (const x of [94, 112]) pl.rect(x, 98, 4, 6, (i, j) => (j === 98 ? m.fer.clair : i === x + 3 ? m.fer.trait : m.fer.sombre));
  pl.rect(113, 138, 2, 7, m.fer.clair);
  // Les fenêtres à carreaux, l'enseigne peinte du clan, la lanterne de la porte.
  fenetre(pl, m, 70, 110, 16, 16, m.bois.creux, 5);
  fenetre(pl, m, 178, 110, 21, 16, m.bois.creux, 5);
  pl.rect(69, 126, 18, 2, m.bois.clair);
  pl.rect(177, 126, 23, 2, m.bois.clair);
  pl.rect(176, 134, 25, 15, (i, j) => {
    const p = m.pavillon;
    if (i === 176 || i === 200 || j === 134 || j === 148) return m.marine.trait;
    if (j >= 145) return i < 184 ? p.bleu : i < 192 ? p.blanc : p.rouge;
    return m.marine.fond;
  });
  lettresDuClan(pl, 180, 136, m.blanc.clair);
  pl.rect(172, 106, 3, 1, m.fer.trait);
  pl.lettres(171, 107, [" ooo ", "ovcvo", "ovcvo", " ooo "], { o: m.fer.trait, v: m.vitre, c: m.vitreClaire });
}

/** La grue de chargement : un portique sur rail, sa cabine, sa flèche en treillis, une caisse pendue au crochet. */
function grue(pl: Planche, m: Matieres): void {
  const j = m.jaune;
  // Les haubans, du chevalet au bout de la flèche.
  ligne(pl, 284, 40, 404, 30, m.fer.trait);
  ligne(pl, 284, 41, 356, 62, m.fer.trait);
  // La flèche en treillis.
  const n = 100;
  let avant: [number, number] | null = null;
  for (let s = 0; s <= n; s++) {
    const x = 306 + Math.round((s / n) * 98);
    const y = 100 - Math.round((s / n) * 68);
    const large = Math.round(9 - (s / n) * 6);
    pl.poser(x, y, j.sombre);
    pl.poser(x, y + 1, j.trait);
    pl.poser(x, y - large, j.clair);
    pl.poser(x, y - large + 1, j.fond);
    if (s % 10 === 0) {
      const point: [number, number] = s % 20 === 0 ? [x, y] : [x, y - large];
      if (avant) ligne(pl, avant[0], avant[1], point[0], point[1], j.sombre);
      avant = point;
    }
  }
  // La poulie du bout, le câble, la moufle et son crochet, les élingues et la caisse.
  pl.rect(402, 28, 5, 5, (i, y) => (i === 404 && y === 30 ? m.fer.clair : m.fer.trait));
  pl.rect(404, 33, 1, 66, m.fer.trait);
  pl.lettres(401, 99, [" ooooo ", " ocmso ", " ocmso ", "  ooo  ", "   o   ", "  o o  ", "  ooo  "], { o: m.fer.trait, c: j.clair, m: j.fond, s: j.sombre });
  ligne(pl, 404, 106, 394, 117, m.bois.cordeSombre);
  ligne(pl, 404, 106, 414, 117, m.bois.cordeSombre);
  caisse(pl, m, 393, 135, 23, 18, 5);
  // Le chevalet au-dessus de la cabine.
  ligne(pl, 266, 77, 283, 40, j.sombre, 2);
  ligne(pl, 302, 77, 285, 40, j.sombre, 2);
  ligne(pl, 274, 60, 294, 60, j.trait);
  pl.rect(282, 37, 5, 5, (i, y) => (i === 284 && y === 39 ? m.fer.clair : m.fer.trait));
  feu(pl, m, 284, 34, "#ff5a4a");
  // Le contrepoids, la cabine des machines, ses persiennes, la vitre du grutier.
  tole(pl, 242, 88, 18, 22, m.fer, 9, 12);
  tole(pl, 258, 78, 56, 32, j, 14, 13);
  pl.rect(256, 76, 60, 2, (_i, y) => (y === 76 ? m.fer.clair : m.fer.trait));
  pl.rect(264, 86, 16, 12, (i, y) => (i === 264 || i === 279 || y === 86 || y === 97 ? j.trait : (y - 86) % 3 === 0 ? j.clair : j.trait));
  fenetre(pl, m, 294, 83, 17, 15, j.trait, 8);
  pl.rect(284, 88, 7, 22, (i, y) => (i === 284 || y === 88 || i === 290 ? j.trait : i === 288 && y === 99 ? m.fer.clair : j.sombre));
  lettresDuClan(pl, 262, 101, j.trait);
  // La couronne d'orientation.
  pl.rect(266, 110, 40, 4, (i, y) => (y === 110 ? m.fer.clair : y === 113 ? m.fer.trait : i % 4 === 0 ? m.fer.trait : m.fer.fond));
  // Le portique : la poutre aux bandes de sécurité, les jambes rivetées, les goussets, les boggies sur le rail.
  tole(pl, 244, 114, 84, 10, j, 12, 14);
  pl.rect(244, 121, 84, 3, (i, y) => ((i + y) % 8 < 4 ? m.noir : j.fond));
  for (const x of [248, 316]) {
    tole(pl, x, 124, 8, 46, j, 20, x);
    pl.rect(x + 3, 126, 2, 42, (_i, y) => (y % 6 === 2 ? j.trait : j.sombre));
  }
  ligne(pl, 256, 140, 268, 124, j.sombre, 2);
  ligne(pl, 315, 140, 303, 124, j.sombre, 2);
  pl.rect(256, 150, 60, 2, (_i, y) => (y === 150 ? j.clair : j.trait));
  // L'échelle du grutier le long de la jambe.
  for (let y = 126; y < 170; y++) {
    pl.poser(326, y, m.fer.sombre);
    pl.poser(330, y, m.fer.sombre);
    if (y % 4 === 0) pl.rect(327, y, 3, 1, m.fer.clair);
  }
  for (const x of [244, 312]) {
    pl.lettres(x, 170, ["  oooooooooooo  ", " occccccccccsso ", " omooommmooomso ", "oooccoooooccoooo", " occcco  occcco ", " ocssco  ocssco ", " occcco  occcco ", "  oooo    oooo  "], { o: m.fer.trait, c: m.fer.fond, m: m.fer.clair, s: m.fer.sombre });
  }
}

/** Le quai de pierre et le ponton de bois sur pilotis : la bande où l'on marche, puis la face jusqu'à l'eau. */
function quai(pl: Planche, m: Matieres): void {
  // La pierre : des dalles vues d'en haut, une bordure, puis le mur jusqu'à l'eau, mouillé et verdi en bas.
  pl.rect(0, QUAI, PORT_PONTON, 8, (i, j) => {
    const r = j - QUAI;
    if (r === 0) return m.pierre.clair;
    if (r === 7) return m.pierre.sombre;
    const rang = r < 4 ? 0 : 1;
    if (r === 4 || (i + rang * 9) % 18 === 0) return m.pierre.joint;
    const a = alea(Math.floor((i + rang * 9) / 18), rang + 40);
    return alea(i, j) < 0.05 ? m.pierre.sombre : a < 0.4 ? m.pierre.clair : m.pierre.fond;
  });
  pierres(pl, m, 0, FACE, PORT_PONTON, EAU - FACE + 1, (_i, j) => (j < FACE + 2 ? 1 : j > EAU - 7 ? 1 : 0), 7);
  pl.rect(0, EAU - 8, PORT_PONTON, 9, (i, j) => {
    const fond = pl.lire(i, j);
    const a = alea(i, j + 300);
    const part = (j - (EAU - 8)) / 8;
    if (fond === null) return null;
    return a < part * 0.75 ? m.algue : a > 0.94 ? melanger(fond, m.algue, 0.5) : fond;
  });
  // Deux anneaux d'amarrage, un dalot et sa trace, une échelle de fer scellée.
  for (const x of [44, 150]) {
    pl.rect(x + 2, FACE + 4, 3, 2, m.fer.trait);
    pl.lettres(x, FACE + 6, [" ooooo ", "oo   oo", "o     o", "o     o", "oo   oo", " ooooo "], { o: m.fer.sombre });
    pl.poser(x + 1, FACE + 7, m.fer.clair);
    coulure(pl, m, x + 3, FACE + 12, 8);
  }
  pl.rect(96, FACE + 8, 6, 5, (i, j) => (j === FACE + 8 || i === 96 || i === 101 ? m.pierre.trou : m.noir));
  for (let j = FACE + 13; j <= EAU; j++) for (let i = 97; i < 101; i++) if (alea(i, j) < 0.7) pl.poser(i, j, melanger(pl.lire(i, j) ?? m.pierre.fond, m.algue, 0.55));
  for (let y = FACE - 1; y <= EAU; y++) {
    pl.poser(196, y, m.fer.sombre);
    pl.poser(202, y, m.fer.trait);
    if ((y - FACE) % 4 === 1) pl.rect(197, y, 5, 1, m.fer.clair);
  }

  // Le ponton : d'abord les pilotis du fond et les croisillons, dans l'ombre.
  const fin = PORT_QUAI.a;
  for (let x = 240; x < fin - 8; x += 38) poteau(pl, m, x, FACE + 6, EAU - FACE - 5, 5, true);
  for (let x = 222; x + 38 < fin; x += 38) {
    const monte = ((x - 222) / 38) % 2 === 0;
    ligne(pl, x + 7, monte ? EAU - 4 : FACE + 8, x + 37, monte ? FACE + 8 : EAU - 4, m.bois.sombre, 2);
  }
  // Le platelage : des planches en travers, clouées ; le rail de la grue.
  pl.rect(PORT_PONTON, QUAI, fin - PORT_PONTON + 1, 8, (i, j) => {
    const r = j - QUAI;
    const dx = (i - PORT_PONTON) % 7;
    if (r === 0) return m.bois.clair;
    if (r === 7) return m.bois.sombre;
    if (dx === 6) return m.bois.creux;
    if (r === 2 && dx === 3) return m.fer.trait;
    const planche = Math.floor((i - PORT_PONTON) / 7);
    return alea(i, j + 77) < 0.07 ? m.bois.sombre : alea(planche, 5) < 0.3 ? m.bois.clair : planche % 2 === 0 ? m.bois.fond : m.bois.autre;
  });
  pl.rect(238, QUAI + 3, 100, 2, (i, j) => (i === 238 || i === 337 ? m.fer.trait : j === QUAI + 3 ? m.fer.clair : m.fer.trait));
  // Le chapeau du ponton, puis les pilotis de devant, cerclés de fer, verdis au pied.
  pl.rect(PORT_PONTON, FACE, fin - PORT_PONTON + 1, 6, (i, j) => {
    if (j === FACE) return m.bois.clair;
    if (j === FACE + 5) return m.bois.creux;
    if ((i - PORT_PONTON) % 38 === 5) return m.bois.sombre;
    return alea(i, j + 14) < 0.06 ? m.bois.sombre : j === FACE + 4 ? m.bois.sombre : m.bois.fond;
  });
  for (let x = 222; x <= fin - 5; x += 38) {
    poteau(pl, m, x, FACE - 1, EAU - FACE + 2, 7);
    pl.rect(x, FACE - 2, 7, 2, (i, j) => (j === FACE - 2 ? m.bois.clair : i === x + 6 ? m.bois.creux : m.bois.autre));
    pl.rect(x, FACE + 8, 7, 2, (i, j) => (i === x ? m.fer.clair : j === FACE + 9 ? m.fer.trait : m.fer.sombre));
    for (let j = EAU - 7; j <= EAU; j++) for (let i = x; i < x + 7; i++) if (alea(i, j + 50) < (j - (EAU - 8)) / 9) pl.poser(i, j, m.algue);
  }
  // Les pneus de défense, pendus à leur corde, et l'échelle du bout.
  for (const x of [259, 335, 411]) {
    pl.rect(x + 4, FACE + 2, 1, 9, m.bois.cordeSombre);
    pneu(pl, m, x, FACE + 10);
  }
  for (let y = FACE - 2; y <= EAU; y++) {
    pl.poser(433, y, m.fer.sombre);
    pl.poser(439, y, m.fer.trait);
    if ((y - FACE) % 4 === 1) pl.rect(434, y, 5, 1, m.fer.clair);
  }
}

/** Un rouleau de cordage posé à plat. */
function cordage(pl: Planche, m: Matieres, x: number, bas: number): void {
  pl.lettres(x, bas - 5, ["  cccccccc  ", " cssssssssc ", "ccccccccccss", "cssssssssscs", "ccccccccccss", " ssssssssss "], { c: m.bois.corde, s: m.bois.cordeSombre });
}

/** Un goéland posé, de 9 cases. */
function goeland(pl: Planche, m: Matieres, x: number, y: number): void {
  pl.lettres(x, y, ["      bb ", "      bbj", " ggggbb  ", "gggggbb  ", " bbbbb   ", "   o     "], { b: m.blanc.clair, g: m.gris.sombre, j: m.jaune.fond, o: m.orange.sombre });
}

function dessinerLePort(lumiere: Lumiere, image: number): Decor {
  const m = matieres(lumiere);
  const i = ((Math.round(image) % 4) + 4) % 4;
  const pl = new Planche(PORT_LARGEUR, PORT_HAUTEUR);
  const fond = QUAI - 1;
  const devant = PORT_QUAI.bas - 1;

  phare(pl, m);
  entrepot(pl, m, i);
  // Le mât de signaux du bout du ponton : son feu, sa vergue, le pavillon du clan.
  pl.rect(446, 92, 3, 84, (x) => (x === 446 ? m.blanc.clair : x === 448 ? m.blanc.trait : m.blanc.fond));
  pl.rect(438, 116, 19, 2, (_x, y) => (y === 116 ? m.blanc.clair : m.blanc.trait));
  ligne(pl, 439, 118, 444, 174, m.bois.cordeSombre);
  ligne(pl, 455, 118, 450, 174, m.bois.cordeSombre);
  pl.rect(444, 88, 7, 4, (x, y) => (y === 88 || x === 444 || x === 450 ? m.fer.trait : m.feu("#3cf07a")));
  pl.rect(445, 170, 5, 6, m.fer.sombre);
  pavillon(pl, m, 446, 95, i, 26, 17);
  grue(pl, m);
  quai(pl, m);

  // Au fond du quai : lampadaires, tonneaux, caisses en pile, sacs.
  lampadaire(pl, m, 59, fond, 62);
  lampadaire(pl, m, 236, fond, 62);
  tonneau(pl, m, 211, fond);
  tonneau(pl, m, 225, fond);
  tonneau(pl, m, 218, fond - 18);
  caisse(pl, m, 334, fond, 22, 18, 0);
  caisse(pl, m, 357, fond, 22, 18, 1);
  caisse(pl, m, 380, fond, 20, 16, 2);
  caisse(pl, m, 345, fond - 18, 22, 18, 3);
  caisse(pl, m, 368, fond - 18, 18, 14, 4);
  // Une bâche de toile sur la caisse du haut, et un goéland dessus.
  pl.rect(344, fond - 37, 24, 7, (x, y) => (y === fond - 37 ? m.kaki.clair : x === 367 || y === fond - 31 ? m.kaki.trait : (x + y) % 5 === 0 ? m.kaki.sombre : m.kaki.fond));
  for (const x of [346, 365]) pl.rect(x, fond - 30, 1, 5, m.bois.corde);
  goeland(pl, m, 352, fond - 43);
  tonneau(pl, m, 404, fond);
  tonneau(pl, m, 418, fond, 12, 16);
  // Au bord du quai, devant : les bittes d'amarrage, un cordage, une ancre posée contre une caisse.
  for (const x of [34, 122, 228, 296, 368, 424]) bitte(pl, m, x, devant);
  cordage(pl, m, 274, devant);
  cordage(pl, m, 16, devant);
  goeland(pl, m, 122, devant - 15);
  return pl.decor();
}

/* ---------- Le tir d'un canon et l'obus ---------- */

/** Le feu garde sa couleur de jour comme de nuit : orange et jaune, jamais un éclair blanc. */
const FEU = { rouge: "#e2452a", orange: "#f58a1f", jaune: "#ffd75a", coeur: "#ffe58a" } as const;

/** Le tir : 64 × 44 cases, la bouche du canon au milieu du bord gauche (`TIR_BOUCHE`), le coup part vers la droite. */
export const TIR_BOUCHE = { x: 0, y: 22 } as const;
const TIR = { largeur: 64, hauteur: 44, images: 5 } as const;

/**
 * La bouffée au bout du canon, en 5 images : une langue de feu qui grossit (0, 1), retombe dans sa fumée (2), puis la fumée
 * seule qui s'élargit et se défait en damier (3, 4). Rien ne clignote : chaque image prolonge la précédente.
 */
function dessinerLeTir(lumiere: Lumiere, image: number): Decor {
  const m = matieres(lumiere);
  const i = borner(Math.round(image), 0, TIR.images - 1);
  const pl = new Planche(TIR.largeur, TIR.hauteur);
  const cy = TIR_BOUCHE.y;
  // La fumée : des bouffées rondes, de plus en plus larges et de plus en plus loin.
  const toutes: readonly (readonly (readonly [number, number, number])[])[] = [
    [[5, -5, 3], [6, 5, 3]],
    [[9, -3, 4], [11, 4, 4]],
    [[12, -6, 7], [14, 6, 7], [24, 0, 8], [6, 0, 5]],
    [[14, -8, 9], [17, 8, 9], [30, -2, 11], [42, 3, 8], [8, 1, 6]],
    [[16, -10, 10], [20, 9, 10], [34, -3, 12], [48, 4, 10], [10, 2, 6]],
  ];
  const bouffees = toutes[i]!;
  for (const [dx, dy, r] of bouffees) {
    pl.disque(dx, cy + dy, r, (ex, ey) => {
      const X = dx + ex;
      const Y = cy + dy + ey;
      const bord = ex * ex + ey * ey > (r - 2) * (r - 2);
      if (i === 4 && (X % 2 !== 0 || Y % 2 !== 0)) return null;
      if (i === 3 && (X + Y) % 2 !== 0 && bord) return null;
      if (i === 3 && (X + Y) % 2 !== 0 && alea(X, Y) < 0.5) return null;
      if (ey < -r / 3) return m.fumee.clair;
      if (ey > r / 3) return m.fumee.sombre;
      return m.fumee.fond;
    });
  }
  // La langue de feu : rouge au bord, orange, jaune au cœur.
  const long = [12, 30, 20, 0, 0][i]!;
  const demi = [4, 9, 6, 0, 0][i]!;
  for (let x = 0; x < long; x++) {
    const t = x / long;
    const large = demi * Math.sin(Math.PI * Math.pow(t, 0.55)) + 1;
    const frange = Math.round(alea(x, i) * 2);
    for (let dy = -Math.round(large) - frange; dy <= Math.round(large) + frange; dy++) {
      const d = Math.abs(dy) / (large + 0.01);
      if (d > 1 && alea(x, dy + 9) < 0.5) continue;
      let couleur: string = d < 0.3 && t < 0.55 ? FEU.coeur : d < 0.55 && t < 0.75 ? FEU.jaune : d < 0.85 ? FEU.orange : FEU.rouge;
      if (i === 2) couleur = d < 0.45 && t < 0.5 ? FEU.jaune : d < 0.8 ? FEU.orange : FEU.rouge;
      pl.poser(x, cy + dy, couleur);
    }
  }
  return pl.decor();
}

/** L'obus : 14 × 5 cases, la pointe à droite ; un petit sillage de fumée derrière lui, qui change d'une image à l'autre. */
function dessinerLObus(lumiere: Lumiere, image: number): Decor {
  const m = matieres(lumiere);
  const pl = new Planche(14, 5);
  pl.lettres(6, 0, [" cccc   ", "jcmmmmc ", "jmmmmmms", "jsssss  ", " ssss   "], { c: m.fer.clair, m: m.fer.fond, s: m.fer.trait, j: m.jaune.fond });
  const sillage = Math.round(image) % 2 === 0 ? ["  f f ", " f f f", "  f f "] : [" f f  ", "f f f ", " f f  "];
  pl.lettres(0, 1, sillage, { f: m.fumee.fond });
  return pl.decor();
}

/**
 * Les bouches des canons du navire de guerre, dans son dessin (ajouter 1 à `y` aux images 2 et 3, quand il s'enfonce) : la
 * colonne et la rangée où poser `TIR_BOUCHE`. `avant` : les deux tourelles de proue ; `arriere` : celle de poupe.
 * Pour le navire d'en face, retourné : x devient `largeur − 1 − x`, et le tir se retourne aussi.
 */
export const NAVIRE_GUERRE_BOUCHES = {
  avant: [
    { x: 260, y: 66 + NAVIRE_MARGE },
    { x: 302, y: 82 + NAVIRE_MARGE },
  ],
  arriere: [{ x: 32, y: 83 + NAVIRE_MARGE }],
} as const;

/* ---------- Le lot ---------- */

export const LOT_PORT: Partial<Record<PieceOpenFrontId, DessinDeBatiment>> = {
  port: { largeur: PORT_LARGEUR, hauteur: PORT_HAUTEUR, images: 4, dessiner: dessinerLePort },
  "navire-transport": navire(TRANSPORT.largeur, TRANSPORT.hauteur, corpsDuTransport, { x: 45, y: 18, haut: 40, derive: 0.75, r0: 2, croit: 0.11 }),
  "navire-guerre": navire(GUERRE.largeur, GUERRE.hauteur, (pl, m, image) => corpsDeGuerre(pl, m, image), { x: 114, y: 44, haut: 36, derive: 1.1, r0: 2, croit: 0.08 }),
  "navire-ennemi": navire(GUERRE.largeur, GUERRE.hauteur, (pl, m, image) => corpsDeGuerre(pl, m, image, true), { x: 114, y: 44, haut: 36, derive: 1.1, r0: 2, croit: 0.08 }, true),
  "tir-canon": { largeur: TIR.largeur, hauteur: TIR.hauteur, images: TIR.images, dessiner: dessinerLeTir },
  obus: { largeur: 14, hauteur: 5, images: 2, dessiner: dessinerLObus },
  "navire-commerce": navire(COMMERCE.largeur, COMMERCE.hauteur, corpsDuCommerce, { x: 49, y: 4, haut: 34, derive: 0.9, r0: 3, croit: 0.11 }),
};
