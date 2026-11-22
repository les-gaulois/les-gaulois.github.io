/**
 * La finition commune à tous les fonds d'objets, posée sur la scène avant la chose (voir `socle.ts`) : ce qui fait
 * ressortir la chose et dit sa rareté sans un mot. Dessin de Claude Fable 5.2, 22 novembre 2026.
 *
 * Trois gestes, toujours dans cet ordre, les mêmes sur les 41 scènes et à toute taille :
 *   1. la lumière de la rareté, derrière tout : une aura d'or pour le légendaire, des rayons turquoise pour le divin ;
 *   2. un halo doux derrière la chose, plus clair que la scène, tramé en paliers (jamais un rond net), puis son ombre au sol ;
 *   3. les éclats de la rareté, de petites étoiles à quatre branches dans les coins et sur les bords, jamais sur la chose.
 * Tout éclaircit la scène, sauf l'ombre, petite : un fond clair le reste. Rien n'est tiré au hasard, sauf par la graine.
 */
import { assombrir, eclaircir, hasard, melanger, trame, type Planche, type ParametresDuFond } from "./socle";

/** Les couleurs des raretés (jetons du site), par rang : 1 commun, 2 peu commun, 3 épique, 4 mystique, 5 légendaire, 6 divin. */
const COULEURS_DES_RANGS = ["#4aa3ff", "#4aa3ff", "#3a4fe8", "#9b4dff", "#ff2e4a", "#f2b632", "#19d3c5"] as const;

/** La part de la couleur de la rareté dans le blanc du halo, par rang : le halo d'un commun est blanc. */
const TEINTE_DU_HALO = [0, 0, 0.04, 0.1, 0.1, 0.3, 0.16] as const;

/** Le nombre d'éclats sur une case du vestiaire (56 × 38), par rang ; moins sur une petite carte, plus sur une grande. */
const ECLATS_PAR_RANG = [0, 0, 2, 4, 6, 8, 7] as const;

const borne = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

/** Éclaircit une case vers `couleur`, de `part`. Une case vide ne change pas. */
function teinter(p: Planche, x: number, y: number, couleur: string, part: number): void {
  const c = p.lire(x, y);
  if (c) p.poser(x, y, melanger(c, couleur, part));
}

/** La distance d'une case au centre d'une ellipse, 1 sur son bord. */
const dansLEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): number => Math.hypot((x - cx) / rx, (y - cy) / ry);

/** Le halo : une ellipse claire derrière la chose, pleine au cœur puis tramée en trois paliers vers le bord. */
function poserLeHalo(p: Planche, cx: number, cy: number, rx: number, ry: number, couleur: string, force: number): void {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(p.hauteur - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(p.largeur - 1, Math.ceil(cx + rx)); x++) {
      const d = dansLEllipse(x, y, cx, cy, rx, ry);
      if (d >= 1) continue;
      const part = d < 0.56 ? 1 : d < 0.72 ? 0.75 : d < 0.87 ? 0.5 : 0.25;
      if (trame(x, y, part)) teinter(p, x, y, couleur, force);
      else if (d < 0.72) teinter(p, x, y, couleur, force * 0.5);
    }
  }
}

/** L'ombre portée : une ellipse plate sur le sol, pleine au cœur, tramée au bord. Plus pâle et plus petite sous une chose qui flotte. */
function poserLOmbre(p: Planche, o: ParametresDuFond, cx: number): void {
  const flotte = o.sol > o.zone.y + o.zone.hauteur;
  const rx = Math.max(2, o.zone.largeur * (flotte ? 0.3 : 0.4));
  const ry = borne(Math.round(o.hauteur / 30), 1, 3) + (flotte ? 0 : 0.5);
  const cy = flotte ? Math.min(p.hauteur - 2, o.sol + Math.max(1, Math.round(o.hauteur * 0.05))) : o.sol;
  const force = flotte ? 0.12 : 0.2;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(p.hauteur - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(p.largeur - 1, Math.ceil(cx + rx)); x++) {
      const d = dansLEllipse(x, y, cx, cy, rx, ry);
      if (d >= 1) continue;
      if (d >= 0.7 && !trame(x, y, 0.5)) continue;
      const c = p.lire(x, y);
      if (c) p.poser(x, y, assombrir(c, force));
    }
  }
}

/** Les rayons du divin : des faisceaux turquoise très clairs qui partent de derrière la chose, tramés sur leurs bords. */
function poserLesRayons(p: Planche, o: ParametresDuFond, cx: number, cy: number, rx: number, ry: number, couleur: string): void {
  const h = hasard(o.graine ^ 0x5eed);
  const nombre = o.largeur < 40 ? 8 : 12;
  const tour = h();
  const clair = eclaircir(couleur, 0.62);
  for (let y = 0; y < p.hauteur; y++) {
    for (let x = 0; x < p.largeur; x++) {
      const d = dansLEllipse(x, y, cx, cy, rx, ry);
      if (d < 0.8) continue;
      const angle = Math.atan2(y - cy, x - cx) / (Math.PI * 2) + 0.5;
      const dans = (angle * nombre + tour) % 1;
      if (dans > 0.44) continue;
      const bord = dans < 0.08 || dans > 0.36;
      if (trame(x, y, bord ? 0.5 : 1)) teinter(p, x, y, clair, d < 1.6 ? 0.4 : 0.3);
    }
  }
}

/** Une étoile à quatre branches : un cœur presque blanc, des branches à la couleur de la rareté. `taille` : la longueur d'une branche. */
function poserUnEclat(p: Planche, x: number, y: number, taille: number, couleur: string): void {
  const coeur = eclaircir(couleur, 0.85);
  const branche = eclaircir(couleur, 0.3);
  const pointe = eclaircir(couleur, 0.6);
  for (let i = 1; i <= taille; i++) {
    const c = i === taille && taille > 1 ? pointe : branche;
    p.poser(x - i, y, c);
    p.poser(x + i, y, c);
    p.poser(x, y - i, c);
    p.poser(x, y + i, c);
  }
  p.poser(x, y, coeur);
}

/** Les éclats de la rareté : semés par la graine dans les quatre coins, chacun son tour, loin de la chose et les uns des autres. */
function poserLesEclats(p: Planche, o: ParametresDuFond, couleur: string): void {
  const prevus = ECLATS_PAR_RANG[borne(o.rang, 0, 6)] ?? 0;
  if (prevus === 0) return;
  const surface = (o.largeur * o.hauteur) / (56 * 38);
  const nombre = Math.max(o.rang >= 3 ? 2 : 1, Math.round(prevus * borne(Math.sqrt(surface), 0.5, 1.6)));
  const h = hasard(o.graine ^ 0xec1a7);
  const grand = o.largeur >= 40 && o.rang >= 4 ? 2 : 1;
  const poses: { x: number; y: number }[] = [];
  const gx = Math.max(4, Math.round(o.largeur * 0.3));
  const gy = Math.max(4, Math.round(o.hauteur * 0.36));
  const garde = Math.max(2, Math.round(o.largeur / 28));
  for (let i = 0, essais = 0; i < nombre && essais < nombre * 14; essais++) {
    const coin = (i + (o.graine & 3)) % 4;
    const taille = i < 2 ? grand : 1;
    const dx = taille + 1 + Math.floor(h() * (gx - taille - 1));
    const dy = taille + 1 + Math.floor(h() * (gy - taille - 1));
    const x = coin % 2 === 0 ? dx : o.largeur - 1 - dx;
    const y = coin < 2 ? dy : o.hauteur - 1 - dy;
    const dansLaZone = x >= o.zone.x - garde - taille && x < o.zone.x + o.zone.largeur + garde + taille && y >= o.zone.y - garde - taille && y <= o.zone.y + o.zone.hauteur + garde + taille + 1;
    if (dansLaZone || poses.some((e) => Math.abs(e.x - x) < 5 && Math.abs(e.y - y) < 5)) continue;
    poserUnEclat(p, x, y, taille, couleur);
    poses.push({ x, y });
    i++;
  }
}

/** Pose la finition sur la scène déjà peinte. */
export function poserLaFinition(p: Planche, o: ParametresDuFond): void {
  const rang = borne(Math.round(o.rang), 1, 6);
  const couleur = COULEURS_DES_RANGS[rang] ?? COULEURS_DES_RANGS[1];
  const cx = o.zone.x + (o.zone.largeur - 1) / 2;
  const cy = o.zone.y + (o.zone.hauteur - 1) / 2;
  const rx = o.zone.largeur * 0.62 + 2.5;
  const ry = o.zone.hauteur * 0.6 + 2.5;

  // 1. La lumière de la rareté, derrière le halo.
  if (rang === 6) poserLesRayons(p, o, cx, cy, rx, ry, couleur);
  if (rang === 5) poserLeHalo(p, cx, cy, rx * 1.55, ry * 1.55, eclaircir(couleur, 0.45), 0.34);
  if (rang === 4) poserLeHalo(p, cx, cy, rx * 1.3, ry * 1.3, eclaircir(couleur, 0.7), 0.2);

  // 2. Le halo, puis l'ombre au sol.
  // Une chose qui prend presque toute la carte a un halo plus léger : la scène doit rester lisible autour d'elle.
  const large = o.zone.largeur > o.largeur * 0.7 || o.zone.hauteur > o.hauteur * 0.85;
  poserLeHalo(p, cx, cy, rx, ry, melanger("#ffffff", couleur, TEINTE_DU_HALO[rang] ?? 0), large ? 0.34 : 0.46);
  poserLOmbre(p, o, cx);

  // 3. Les éclats, sur les bords.
  poserLesEclats(p, o, couleur);
}
