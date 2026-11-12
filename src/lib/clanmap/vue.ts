/**
 * La vue de la carte quand le visiteur la manie lui-même : zoom à la molette ou au pincement, déplacement à la souris,
 * au doigt ou au clavier, et cadrage d'un clan choisi. Des calculs purs : le dessin est dans `src/scripts/film.ts`.
 * La carte du film est réduite : les vues et les cadres d'ici ne servent qu'à la caméra, jamais à compter des pixels.
 * Deux textes affichés viennent d'ici : la position de la souris sur la carte complète, et la phrase d'un clan choisi,
 * dont les chiffres sont ceux du dernier relevé du film.
 */
import { fmtInt, fmtRank } from "../format";
import type { CameraView } from "../fx/camera";

/** La taille de la carte du film, en cases. */
export interface Monde {
  width: number;
  height: number;
}

/** La taille du dessin, en pixels du dessin (pas en pixels CSS). */
export interface Ecran {
  width: number;
  height: number;
}

/** L'échelle de la vue d'ensemble : toute la carte tient dans le dessin. */
export const echelleDuMonde = (monde: Monde, ecran: Ecran): number => Math.min(ecran.width / monde.width, ecran.height / monde.height);

/** Le point de la carte, en cases, sous un point du dessin. */
export function pointDeCarte(vue: CameraView, px: number, py: number, ecran: Ecran): [number, number] {
  return [(px - ecran.width / 2) / vue.s + vue.x, (py - ecran.height / 2) / vue.s + vue.y];
}

/** Change d'échelle en gardant sous le curseur le point de la carte qui s'y trouvait. */
export function zoomer(vue: CameraView, echelle: number, px: number, py: number, ecran: Ecran): CameraView {
  const dx = px - ecran.width / 2;
  const dy = py - ecran.height / 2;
  return { x: vue.x + dx / vue.s - dx / echelle, y: vue.y + dy / vue.s - dy / echelle, s: echelle };
}

/**
 * Garde une vue dans ses limites : jamais plus loin que la vue d'ensemble, jamais plus près que `echelleMax`, et la carte
 * ne sort pas du dessin. `margeDroite` : la largeur, en pixels du dessin, qu'une fenêtre couvre à droite ; le bord est de
 * la carte peut alors venir jusqu'au bord de cette fenêtre.
 */
export function borner(vue: CameraView, monde: Monde, ecran: Ecran, echelleMax: number, margeDroite = 0): CameraView {
  const mini = echelleDuMonde(monde, ecran);
  const s = Math.min(Math.max(vue.s, mini), Math.max(echelleMax, mini));
  const demiLargeur = ecran.width / (2 * s);
  const demiHauteur = ecran.height / (2 * s);
  const gauche = Math.min(demiLargeur, monde.width / 2);
  const droite = Math.max(monde.width - demiLargeur, monde.width / 2) + Math.max(0, margeDroite) / s;
  const haut = Math.min(demiHauteur, monde.height / 2);
  const bas = Math.max(monde.height - demiHauteur, monde.height / 2);
  return { x: Math.min(Math.max(vue.x, gauche), droite), y: Math.min(Math.max(vue.y, haut), bas), s };
}

/** Décale une vue pour que sa cible paraisse au milieu de la partie du dessin qu'aucune fenêtre ne couvre. */
export const decaler = (vue: CameraView, margeDroite: number): CameraView => (margeDroite > 0 ? { ...vue, x: vue.x + margeDroite / (2 * vue.s) } : vue);

/** La vue est-elle, à très peu près, la vue d'ensemble ? */
export function estVueDEnsemble(vue: CameraView, monde: Monde, ecran: Ecran): boolean {
  const s = echelleDuMonde(monde, ecran);
  return vue.s <= s * 1.002 && Math.abs(vue.x - monde.width / 2) * s < 1 && Math.abs(vue.y - monde.height / 2) * s < 1;
}

export interface Cadre {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

/**
 * Où est un clan sur la carte du film : le cadre qui contient presque toutes ses cases, sans les plus écartées de chaque
 * côté (`ecart` de ses cases), pour qu'un comptoir à l'autre bout du monde n'éloigne pas la caméra. `null` : aucune case.
 */
export function cadreDuClan(owner: ArrayLike<number>, cols: number, rows: number, clan: number, ecart = 0.03): Cadre | null {
  const enX = new Uint32Array(cols);
  const enY = new Uint32Array(rows);
  let total = 0;
  for (let y = 0; y < rows; y++) {
    const ligne = y * cols;
    for (let x = 0; x < cols; x++) {
      if (owner[ligne + x] !== clan) continue;
      enX[x]!++;
      enY[y]!++;
      total++;
    }
  }
  if (total === 0) return null;
  const coupe = Math.floor(total * ecart);
  const bornes = (comptes: Uint32Array): [number, number] => {
    let debut = 0;
    let vus = 0;
    while (vus + comptes[debut]! <= coupe) vus += comptes[debut++]!;
    let fin = comptes.length - 1;
    vus = 0;
    while (vus + comptes[fin]! <= coupe) vus += comptes[fin--]!;
    return [debut, fin];
  };
  const [x0, x1] = bornes(enX);
  const [y0, y1] = bornes(enY);
  return { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, halfWidth: (x1 - x0 + 1) / 2, halfHeight: (y1 - y0 + 1) / 2 };
}

/**
 * La position d'un point de la carte du film sur la carte complète, telle qu'elle s'écrit à côté de la date au passage de
 * la souris : « x 1283 · y 1150 ». Une case du film vaut `echelle` pixels de la carte complète. Quatre chiffres, pour que
 * la ligne ne change pas de largeur sous la souris. `null` : hors de la carte.
 */
export function positionSurLaCarte(mx: number, my: number, monde: Monde, echelle: number): string | null {
  if (mx < 0 || my < 0 || mx >= monde.width || my >= monde.height) return null;
  const ecrire = (cases: number) => String(Math.floor(cases * echelle)).padStart(4, "0");
  return `x ${ecrire(mx)} · y ${ecrire(my)}`;
}

/**
 * L'index de chaque clan du film par son tag, pour le retrouver sur la carte depuis la liste des clans. L'index 0 est la
 * terre neutre, et un clan supprimé n'a plus de tag. Un tag porté par deux clans n'en désigne aucun : il n'a pas d'index.
 */
export function indexDesClans(clans: readonly { tag: string | null }[]): Map<string, number> {
  const index = new Map<string, number>();
  const doubles = new Set<string>();
  clans.forEach((clan, i) => {
    if (i === 0 || clan.tag === null) return;
    if (index.has(clan.tag)) doubles.add(clan.tag);
    else index.set(clan.tag, i);
  });
  for (const tag of doubles) index.delete(tag);
  return index;
}

/**
 * Ce que la carte dit d'un clan choisi, d'un clic ou dans la liste : sa place et son territoire au dernier relevé du film
 * (`standings` : le territoire de chaque clan, rejoué depuis l'historique officiel, du plus grand au plus petit). Le film
 * peut montrer un autre jour : la phrase dit de quand sont ses chiffres. Un clan supprimé n'a plus de tag, et un tag porté
 * par deux clans ne dit pas lequel est choisi : la phrase ne donne alors aucun chiffre.
 */
export function ligneDuClan(tag: string | null, standings: readonly { tag: string | null; pixels: number }[]): string {
  if (tag === null) return "Clan supprimé";
  if (standings.filter((s) => s.tag === tag).length > 1) return tag;
  const place = standings.findIndex((s) => s.tag === tag);
  const standing = standings[place];
  if (!standing) return `${tag} : plus aucun pixel au dernier relevé`;
  return `${tag} : ${fmtRank(place + 1)} au dernier relevé, ${fmtInt(standing.pixels)} pixels`;
}
