/**
 * Un bâtiment en chantier, pour les 15 bâtiments du village quelle que soit leur forme. Tout se lit dans les cases non
 * vides du dessin fini :
 * - à 0, rien n'est bâti : la terre retournée, des piquets et un cordeau sur l'emprise du bâtiment, un tas de matériaux ;
 * - ensuite le bâtiment monte, et un échafaudage de perches et de planches, avec son échelle, suit la silhouette de ce
 *   qui reste à faire. Un bâtiment haut monte du bas vers le haut. Un bâtiment bas et large (palissade, potager, pont,
 *   rempart) se bâtit de gauche à droite, par tranches : à gauche c'est fini, au milieu on y travaille sous
 *   l'échafaudage, à droite le cordeau attend ;
 * - à 1, le bâtiment fini, rendu tel quel.
 * Le dessin rendu a toujours la taille du bâtiment fini. Rien n'est tiré au hasard : le même dessin, le même avancement
 * et la même lumière donnent toujours le même chantier. Le bois neuf des perches suit la lumière du dehors.
 * Design : Claude Fable 5.2 (14 novembre 2026).
 */
import { type Decor, Planche, alea } from "../decor";
import { type Lumiere, couleurDuDehors } from "../lumiere";

/** L'écart entre deux planchers de l'échafaudage, en cases : un peu moins que la taille d'un Gaulois. */
const ETAGE = 20;
/** L'écart visé entre deux perches, et la largeur visée d'une tranche d'un bâtiment large. */
const ENTRE_PERCHES = 26;
const TRANCHE = 30;

function couleursDuChantier(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return {
    // Le bois neuf, plus clair que celui des bâtiments.
    perche: c("#c9a06a", "#7d6846"),
    percheClaire: c("#e0bd86", "#917a54"),
    percheSombre: c("#94703f", "#57452c"),
    creux: c("#5d3d22", "#33241a"),
    corde: c("#c9b278", "#8a7a55"),
    cordeSombre: c("#a08c5c", "#6a5c3e"),
    terre: c("#8a6a45", "#5a4630"),
    terreClaire: c("#a07d52", "#6b5439"),
    terreSombre: c("#735638", "#4a3926"),
    pierre: c("#8d95a6", "#4a536c"),
    pierreClaire: c("#a9aebb", "#5d6680"),
    pierreSombre: c("#6a7284", "#353d55"),
    rondin: c("#8a5a30", "#5d3d22"),
  };
}
type Couleurs = ReturnType<typeof couleursDuChantier>;

const borner = (v: number): number => Math.min(1, Math.max(0, v));

/** Le tas de matériaux : des rondins rangés, quelques planches, des pierres. `x` sa gauche, `sol` la rangée du sol. */
function poserTas(pl: Planche, p: Couleurs, x: number, sol: number, large: number): void {
  const rondin = (rx: number, ry: number): void => {
    pl.lettres(rx, ry, [".aaaa.", "abbbbc", "abddbc", "abddbc", "abbbbc", ".cccc."], { a: p.percheClaire, b: p.perche, c: p.percheSombre, d: p.rondin });
  };
  const rangs = large >= 28 ? 3 : 2;
  for (let rang = 0; rang < rangs; rang++) for (let k = 0; k < rangs - rang; k++) rondin(x + k * 6 + rang * 3, sol - 5 - rang * 5);
  const suite = x + rangs * 6 + 2;
  if (large >= 28) {
    // Les pierres, en petit tas.
    pl.lettres(suite, sol - 6, ["...aab....", "..abbbc.ab", ".abbbbcabb", "abbcabbbbc", "abbcabbccc"], { a: p.pierreClaire, b: p.pierre, c: p.pierreSombre });
    // Deux planches posées dessus.
    pl.rect(suite - 1, sol - 8, 12, 1, p.percheClaire);
    pl.rect(suite - 1, sol - 7, 12, 1, p.percheSombre);
  } else {
    pl.lettres(suite, sol - 3, [".ab.", "abbc", "abcc"], { a: p.pierreClaire, b: p.pierre, c: p.pierreSombre });
  }
}

/** Un piquet planté, taillé en haut. */
function poserPiquet(pl: Planche, p: Couleurs, x: number, sol: number): void {
  pl.rect(x, sol - 8, 2, 9, (i, j) => (j === sol - 8 ? p.percheClaire : i === x ? p.perche : p.percheSombre));
}

/**
 * `fini` : le dessin du bâtiment fini ; `avancement` de 0 (rien de posé : seulement le tracé au sol) à 1 (fini, rendu tel
 * quel, sans échafaudage). Le dessin rendu a toujours la taille du bâtiment fini.
 */
export function enChantier(fini: Decor, avancement: number, lumiere: Lumiere): Decor {
  const a = borner(Number.isFinite(avancement) ? avancement : 0);
  if (a >= 1) return fini;
  const { largeur, hauteur } = fini;
  const pl = new Planche(largeur, hauteur);
  const sol = hauteur - 1;
  const p = couleursDuChantier(lumiere);

  // La silhouette : la première case pleine de chaque colonne, et l'emprise au sol.
  const haut: number[] = [];
  let gauche = largeur;
  let droite = -1;
  for (let x = 0; x < largeur; x++) {
    let y = 0;
    while (y < hauteur && !fini.cases[y * largeur + x]) y++;
    haut.push(y);
    if (y < hauteur) {
      gauche = Math.min(gauche, x);
      droite = x;
    }
  }
  if (droite < 0) return pl.decor();
  const emprise = droite - gauche + 1;
  // Le haut de la silhouette autour d'une colonne : une perche ne tombe pas dans un trou étroit du dessin.
  const hautAutour = (x: number, rayon = 4): number => {
    let h = hauteur;
    for (let i = Math.max(gauche, x - rayon); i <= Math.min(droite, x + rayon); i++) h = Math.min(h, haut[i]!);
    return h;
  };

  // Les tranches : une seule pour un bâtiment haut, plusieurs de gauche à droite pour un bâtiment bas et large.
  const hauteurBatie = hauteur - Math.min(...haut);
  const large = emprise > hauteurBatie * 1.6 && emprise >= TRANCHE * 2;
  const tranches = large ? Math.max(2, Math.round(emprise / TRANCHE)) : 1;
  const trancheDe = (x: number): number => Math.min(tranches - 1, Math.max(0, Math.floor(((x - gauche) * tranches) / emprise)));
  const debutDe = (t: number): number => gauche + Math.ceil((t * emprise) / tranches);
  const part: number[] = [];
  const sommet: number[] = [];
  for (let t = 0; t < tranches; t++) {
    // Trois tranches montent à la fois : la plus à gauche est la plus avancée.
    part.push(tranches === 1 ? a : borner((a * (tranches + 2) - t) / 3));
    let h = hauteur;
    for (let x = debutDe(t); x < debutDe(t + 1) && x <= droite; x++) h = Math.min(h, haut[x]!);
    sommet.push(h);
  }
  /** La première rangée bâtie d'une colonne : au-dessus, il reste à faire. */
  const frontiere = (x: number): number => {
    const t = trancheDe(x);
    return hauteur - Math.round((hauteur - sommet[t]!) * part[t]!);
  };
  const enTravaux = (t: number): boolean => part[t]! > 0 && part[t]! < 1;

  // 1. La terre retournée, là où rien n'est encore posé.
  for (let x = gauche; x <= droite; x++) {
    if (part[trancheDe(x)]! >= 1) continue;
    const g = alea(x, 31);
    pl.poser(x, sol, g < 0.2 ? p.terreClaire : g < 0.5 ? p.terreSombre : p.terre);
    if (g > 0.55) pl.poser(x, sol - 1, g > 0.85 ? p.terreClaire : p.terre);
  }

  // 2. Ce qui est bâti.
  for (let x = gauche; x <= droite; x++) {
    for (let y = Math.max(frontiere(x), 0); y < hauteur; y++) {
      const couleur = fini.cases[y * largeur + x];
      if (couleur) pl.poser(x, y, couleur);
    }
  }

  // 3. Le cordeau et les piquets des tranches qui attendent.
  const piquets = Math.max(1, Math.round(emprise / 40));
  for (let x = gauche; x <= droite; x++) {
    if (part[trancheDe(x)]! > 0) continue;
    const entre = (((x - gauche) * piquets) / emprise) % 1;
    pl.poser(x, sol - 6 + (entre > 0.3 && entre < 0.7 ? 1 : 0), (x >> 1) % 2 === 0 ? p.corde : p.cordeSombre);
  }
  for (let k = 0; k <= piquets; k++) {
    const x = Math.min(droite - 1, gauche + Math.round((k * (emprise - 2)) / piquets));
    if (part[trancheDe(x)]! > 0) continue;
    poserPiquet(pl, p, x, sol);
    pl.rect(x, sol - 6, 2, 1, p.cordeSombre);
  }

  // 4. L'échafaudage des tranches en travaux : des perches du sol au haut de la silhouette, un plancher à chaque étage
  //    de ce qui reste à faire, des ligatures de corde aux croisements.
  const perches: number[] = [];
  const nombre = Math.max(2, Math.round(emprise / ENTRE_PERCHES) + 1);
  for (let k = 0; k < nombre; k++) perches.push(Math.min(droite - 1, gauche + Math.round((k * (emprise - 2)) / (nombre - 1))));
  const cime = (x: number): number => Math.max(0, hautAutour(x) - 4);
  // Les planchers, derrière les perches : seulement au-dessus de ce qui est bâti, là où le bâtiment montera.
  for (let y = sol - ETAGE; y >= 2; y -= ETAGE) {
    for (let x = gauche; x <= droite; x++) {
      if (!enTravaux(trancheDe(x))) continue;
      if (y > frontiere(x) + 1 || hautAutour(x, 6) > y - 3) continue;
      pl.poser(x, y, p.percheClaire);
      pl.poser(x, y + 1, (x - gauche) % 13 === 12 ? p.creux : p.percheSombre);
    }
  }
  // Une écharpe en biais par étage, d'une perche à sa voisine.
  for (let k = 0; k + 1 < perches.length; k++) {
    const de = perches[k]!;
    const vers = perches[k + 1]!;
    if (!enTravaux(trancheDe(de)) || !enTravaux(trancheDe(vers))) continue;
    for (let y = sol - ETAGE, etage = 0; y - ETAGE >= Math.max(cime(de), cime(vers)); y -= ETAGE, etage++) {
      if ((k + etage) % 2 !== 0 || y > Math.min(frontiere(de), frontiere(vers))) continue;
      for (let i = 0; i <= vers - de; i++) {
        const x = (k + etage) % 4 === 0 ? de + i : vers - i;
        pl.poser(x, y - 1 - Math.round((i * (ETAGE - 2)) / (vers - de)), p.percheSombre);
      }
    }
  }
  for (const x of perches) {
    if (!enTravaux(trancheDe(x))) continue;
    const de = cime(x);
    if (de >= sol - 6) continue;
    for (let y = de; y <= sol; y++) {
      pl.poser(x, y, y === de ? p.percheClaire : p.perche);
      pl.poser(x + 1, y, p.percheSombre);
    }
    for (let y = sol - ETAGE; y >= de + 2; y -= ETAGE) {
      if (y > frontiere(x) + 1) continue;
      pl.rect(x - 1, y - 1, 4, 1, p.corde);
      pl.rect(x - 1, y, 4, 2, p.cordeSombre);
      pl.poser(x, y, p.corde);
    }
  }

  // 5. L'échelle, du sol au plancher où l'on travaille.
  const tranche = part.findIndex((v) => v > 0 && v < 1);
  if (tranche >= 0) {
    const de = debutDe(tranche);
    const a2 = Math.min(droite + 1, debutDe(tranche + 1));
    const milieu = tranches === 1 ? gauche + Math.round(emprise * 0.62) : Math.round((de + a2) / 2);
    // À côté de la perche la plus proche, sans sortir du dessin.
    const pres = perches.reduce((m, x) => (Math.abs(x - milieu) < Math.abs(m - milieu) ? x : m), perches[0]!);
    const x = Math.max(gauche, Math.min(droite - 8, pres + 3));
    const f = frontiere(x);
    let jusque = sol - ETAGE;
    while (jusque - ETAGE >= Math.max(2, cime(x) + 2) && jusque > f) jusque -= ETAGE;
    jusque = Math.max(jusque - 4, 0);
    for (let y = jusque; y <= sol; y++) {
      pl.poser(x, y, p.percheClaire);
      pl.poser(x + 7, y, p.percheSombre);
      if ((sol - y) % 5 === 2 && y > jusque + 1) pl.rect(x + 1, y, 6, 1, p.perche);
      else if ((sol - y) % 5 === 1 && y > jusque + 1) pl.rect(x + 1, y, 6, 1, p.creux);
    }
  }

  // 6. Le tas de matériaux : au pied du chantier, du côté qui reste à faire.
  const largeDuTas = emprise >= 60 ? 30 : 18;
  if (emprise >= largeDuTas + 4 && hauteur >= 18) {
    const x = tranches === 1 ? gauche + (a === 0 ? Math.round(emprise * 0.2) : 3) : droite - largeDuTas - 6;
    if (tranches === 1 || part[trancheDe(x)]! === 0) poserTas(pl, p, Math.max(gauche + 1, x), sol, largeDuTas);
  }
  return pl.decor();
}
