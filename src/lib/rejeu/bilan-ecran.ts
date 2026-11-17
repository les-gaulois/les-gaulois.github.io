/**
 * Le bilan des Gaulois d'une partie, tel que l'écran le lit et le compte (sans Zod, pour le navigateur). Son origine, ses
 * règles et son schéma sont dans `bilan.ts`.
 *
 * Le score d'utilité (demande du pilote, 17 novembre 2026 : « que chaque action des membres gal soit comptabilisée pour
 * faire une liste de score de classement de celui qui a été le plus utile dans la partie ») ne convertit jamais une chose
 * en une autre (pas de « une troupe vaut tant d'or ») : chaque axe est la part du joueur dans le total des Gaulois de la
 * partie.
 *   - Économie : l'or qu'il a produit (travail, commerce, trains), sur l'or produit par les Gaulois.
 *   - Combat : la moyenne de deux parts, les troupes qu'il a envoyées à l'attaque et les unités et bâtiments ennemis qu'il
 *     a détruits ou pris.
 *   - Soutien : la moyenne de deux parts, les troupes et l'or qu'il a donnés.
 * Une part dont le total des Gaulois est nul n'est pas comptée (ce n'est pas zéro pour chacun : il n'y a rien à partager).
 * L'utilité est la moyenne des axes comptés, multipliée par le nombre de Gaulois : 100 est la part moyenne d'un Gaulois de
 * la partie, 200 le double. Elle se compare donc d'une partie à l'autre, quel que soit le nombre de Gaulois. Seul dans la
 * partie, un Gaulois n'a pas d'utilité : il n'y a personne à qui le comparer.
 *
 * Ce que le score ne dit pas : la place de départ, les dons reçus (qui gonflent le combat de celui qui les reçoit) et une
 * élimination précoce pèsent sur lui. L'écran le dit.
 */

export const FORMAT_DU_BILAN = 1;
/** Au-delà, un bilan n'est pas lu : aucune partie n'a autant de joueurs au tag du clan. */
export const GAULOIS_MAX = 200;

/** Ce qu'un Gaulois a fait dans la partie, en nombres du jeu. Les troupes sont celles de l'écran du jeu (dixièmes du moteur divisés par dix). */
export interface GauloisDuBilan {
  /** Son pseudo public de la liste du clan, ou le pseudo qu'il portait dans la partie (`enPartie`) ; `null` : pas de nom écrivable. */
  nom: string | null;
  enPartie: boolean;
  /** L'or produit : travail, commerce, trains. */
  or: number;
  /** Les troupes envoyées à l'attaque. */
  attaque: number;
  /** Les unités et bâtiments ennemis détruits ou pris. */
  prises: number;
  /** Les joueurs éliminés (humains, nations et robots) : montrés, pas comptés dans le score. */
  eliminations: number;
  /** Les troupes et l'or donnés pendant la partie. */
  troupesDonnees: number;
  orDonne: number;
}

export interface BilanALEcran {
  partie: string;
  gaulois: GauloisDuBilan[];
}

export const AXES = ["economie", "combat", "soutien"] as const;
export type Axe = (typeof AXES)[number];
export const NOM_DE_L_AXE: Record<Axe, string> = { economie: "Économie", combat: "Combat", soutien: "Soutien" };
/** Le titre du premier de chaque axe dans une partie. */
export const TITRE_DE_L_AXE: Record<Axe, string> = { economie: "Trésorier", combat: "Fer de lance", soutien: "Ravitailleur" };

export interface ScoreDuGaulois {
  /** La part du joueur sur chaque axe, de 0 à 1 ; `null` : rien à partager sur cet axe dans cette partie. */
  parts: Record<Axe, number | null>;
  /** 100 : la part moyenne d'un Gaulois de la partie. `null` : pas d'utilité (seul Gaulois, ou aucun axe compté). */
  utilite: number | null;
  /** Les axes où il est seul premier, avec une part non nulle. */
  titres: Axe[];
}

const CHAMPS = ["or", "attaque", "prises", "eliminations", "troupesDonnees", "orDonne"] as const;
const entier = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Le bilan publié d'une partie, relu pour l'écran. `null` : il ne convient pas, rien n'est montré. */
export function bilanALEcran(brut: unknown, partie: string): BilanALEcran | null {
  if (typeof brut !== "object" || brut === null) return null;
  const b = brut as { format?: unknown; partie?: unknown; gaulois?: unknown };
  if (b.format !== FORMAT_DU_BILAN || b.partie !== partie || !Array.isArray(b.gaulois) || b.gaulois.length < 1 || b.gaulois.length > GAULOIS_MAX) return null;
  const gaulois: GauloisDuBilan[] = [];
  for (const g of b.gaulois as unknown[]) {
    if (typeof g !== "object" || g === null) return null;
    const q = g as Record<string, unknown>;
    if (q["nom"] !== null && (typeof q["nom"] !== "string" || q["nom"].length < 1 || q["nom"].length > 40)) return null;
    if (typeof q["enPartie"] !== "boolean" || (q["enPartie"] && q["nom"] === null)) return null;
    if (!CHAMPS.every((c) => entier(q[c]))) return null;
    gaulois.push({ nom: q["nom"] as string | null, enPartie: q["enPartie"], or: q["or"] as number, attaque: q["attaque"] as number, prises: q["prises"] as number, eliminations: q["eliminations"] as number, troupesDonnees: q["troupesDonnees"] as number, orDonne: q["orDonne"] as number });
  }
  return { partie, gaulois };
}

/** La moyenne des nombres présents ; `null` s'il n'y en a aucun. */
const moyenne = (valeurs: readonly (number | null)[]): number | null => {
  const presentes = valeurs.filter((v): v is number => v !== null);
  return presentes.length > 0 ? presentes.reduce((t, v) => t + v, 0) / presentes.length : null;
};

/** Le rang de chaque score parmi les autres : à utilité égale, le même rang ; `null` sans utilité. */
export function rangsDesScores(scores: readonly ScoreDuGaulois[]): (number | null)[] {
  return scores.map((s) => (s.utilite === null ? null : 1 + scores.filter((autre) => autre.utilite !== null && autre.utilite > s.utilite!).length));
}

/** Le score de chaque Gaulois du bilan, dans l'ordre du bilan. */
export function scoresDuBilan(gaulois: readonly GauloisDuBilan[]): ScoreDuGaulois[] {
  const total = (champ: (typeof CHAMPS)[number]) => gaulois.reduce((t, g) => t + g[champ], 0);
  const totaux = { or: total("or"), attaque: total("attaque"), prises: total("prises"), troupesDonnees: total("troupesDonnees"), orDonne: total("orDonne") };
  const part = (g: GauloisDuBilan, champ: keyof typeof totaux) => (totaux[champ] > 0 ? g[champ] / totaux[champ] : null);
  const parts = gaulois.map((g) => ({ economie: part(g, "or"), combat: moyenne([part(g, "attaque"), part(g, "prises")]), soutien: moyenne([part(g, "troupesDonnees"), part(g, "orDonne")]) }));
  return gaulois.map((_, i) => {
    const p = parts[i]!;
    const globale = gaulois.length >= 2 ? moyenne(AXES.map((a) => p[a])) : null;
    const titres = AXES.filter((a) => {
      const mienne = p[a];
      return mienne !== null && mienne > 0 && parts.every((autre, k) => k === i || (autre[a] ?? 0) < mienne);
    });
    return { parts: p, utilite: globale === null ? null : Math.round(globale * gaulois.length * 100), titres };
  });
}

/** Une ligne du classement général : un membre au pseudo public, sur les parties à revoir. */
export interface LigneDuClassement {
  nom: string;
  parties: number;
  /** La moyenne de son utilité sur ces parties. */
  utilite: number;
  /** La moyenne de chaque axe, à la même échelle que l'utilité (100 : la part moyenne) ; `null` : jamais compté. */
  axes: Record<Axe, number | null>;
  /** Le nombre de parties où il a porté chaque titre. */
  titres: Record<Axe, number>;
}

/** Les parties qu'il faut, au moins, pour entrer au classement général : une seule bonne partie n'y suffit pas. */
export const PARTIES_MIN_DU_CLASSEMENT = 5;

/**
 * Le classement général : la moyenne de l'utilité de chaque membre au pseudo public, sur les parties dont le bilan est
 * publié, pour qui en a joué `partiesMin` au moins. Un Gaulois nommé par son pseudo de partie n'y est pas : le site ne le
 * relie à aucun membre ; `unSeulMembre` écarte un pseudo public porté par plusieurs membres, qui ne désigne personne. À
 * égalité : le plus de parties, puis l'ordre des noms.
 */
export function classementGeneral(bilans: readonly BilanALEcran[], partiesMin = PARTIES_MIN_DU_CLASSEMENT, unSeulMembre: (nom: string) => boolean = () => true): LigneDuClassement[] {
  const cumul = new Map<string, { utilites: number[]; axes: Record<Axe, number[]>; titres: Record<Axe, number> }>();
  for (const bilan of bilans) {
    const scores = scoresDuBilan(bilan.gaulois);
    bilan.gaulois.forEach((g, i) => {
      const s = scores[i]!;
      // Un pseudo écrit deux fois dans la même partie ne désigne personne.
      if (g.nom === null || g.enPartie || s.utilite === null || !unSeulMembre(g.nom) || bilan.gaulois.filter((x) => x.nom === g.nom && !x.enPartie).length !== 1) return;
      const c = cumul.get(g.nom) ?? { utilites: [], axes: { economie: [], combat: [], soutien: [] }, titres: { economie: 0, combat: 0, soutien: 0 } };
      c.utilites.push(s.utilite);
      for (const a of AXES) {
        const p = s.parts[a];
        if (p !== null) c.axes[a].push(p * bilan.gaulois.length * 100);
        if (s.titres.includes(a)) c.titres[a]++;
      }
      cumul.set(g.nom, c);
    });
  }
  const lignes: LigneDuClassement[] = [];
  for (const [nom, c] of cumul) {
    if (c.utilites.length < partiesMin) continue;
    const moy = (v: number[]) => (v.length > 0 ? Math.round(v.reduce((t, x) => t + x, 0) / v.length) : null);
    lignes.push({ nom, parties: c.utilites.length, utilite: moy(c.utilites)!, axes: { economie: moy(c.axes.economie), combat: moy(c.axes.combat), soutien: moy(c.axes.soutien) }, titres: c.titres });
  }
  return lignes.sort((a, b) => b.utilite - a.utilite || b.parties - a.parties || a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Les bilans des parties commencées avant le jour de `fait`, heure de Paris (`jourDe` : le jour d'une heure ISO, comme
 * `parisParts(...).date`) : la matière du classement « d'avant », pour dire qui monte ou descend avec les parties du jour.
 * Sans `fait`, tous les bilans : aucun mouvement à dire.
 */
export function bilansDAvant<B>(bilans: readonly { bilan: B; debut: string }[], fait: string | null, jourDe: (iso: string) => string): B[] {
  if (fait === null) return bilans.map((b) => b.bilan);
  const jour = jourDe(fait);
  return bilans.filter((b) => jourDe(b.debut) < jour).map((b) => b.bilan);
}

/** Le rang de chaque ligne du classement, par nom : à utilité égale, le même rang. */
export function rangsDuClassement(lignes: readonly LigneDuClassement[]): Map<string, number> {
  return new Map(lignes.map((l) => [l.nom, 1 + lignes.filter((autre) => autre.utilite > l.utilite).length]));
}

/**
 * Les places gagnées (nombre positif) ou perdues (négatif) par chaque membre du classement d'aujourd'hui, par rapport à un
 * classement d'avant ; 0 : même rang ; `null` : il n'y était pas.
 */
export function mouvementsDuClassement(actuel: readonly LigneDuClassement[], avant: readonly LigneDuClassement[]): Map<string, number | null> {
  const rangs = rangsDuClassement(actuel);
  const rangsAvant = rangsDuClassement(avant);
  return new Map(actuel.map((l) => [l.nom, rangsAvant.has(l.nom) ? rangsAvant.get(l.nom)! - rangs.get(l.nom)! : null]));
}
