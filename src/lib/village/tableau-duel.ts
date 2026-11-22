/**
 * Le tableau des duellistes (chantier 5 du duel « Coup pour coup », 22 novembre 2026) : la règle du classement, en
 * TypeScript pur. Le serveur en a la copie qui fait foi (`internal.duel_tableau_classement`, migration
 * 20261122002000_duel_tableau_et_saison) ; `tests/unit/duel-tableau.test.ts` compare les deux sur des relevés tirés au
 * hasard. Demande du pilote : « Le tableau des duellistes de la semaine, avec un insigne pour le premier, statères en
 * récompense en fin de saison. Je vérifierai d'abord qu'il récompense vraiment le talent et pas la chance. »
 *
 * La règle, en mots simples :
 * - CE QUI COMPTE : les duels comptés contre le boss du jour et contre la main de défense d'un membre, et les matchs des
 *   salles avec mise (les essais, duel fermé, et le mode GOD n'en font jamais partie : le serveur ne les compte pas). Un
 *   même adversaire (un boss, ou un membre, qu'on l'affronte en défense ou en salle) ne compte qu'une fois par jour, le
 *   premier duel du jour contre lui, et deux fois par semaine au plus.
 * - L'ATTENDU : pour chaque duel, ce qu'on attendait d'un Gaulois ordinaire contre cet adversaire, d'après tous les duels
 *   connus contre lui (un boss, une main de défense telle qu'elle était) : la part de points que les Gaulois y ont prise,
 *   tirée vers la moyenne de son genre (boss ou défense) comme s'il avait déjà été joué `POIDS` fois à la moyenne. En salle,
 *   l'attendu est l'inverse de ce que l'adversaire prend d'ordinaire en salle, tiré vers une demie.
 * - LA NOTE : la somme, sur les duels retenus, de ce qu'on a pris de plus que l'attendu (1 par victoire, une demie par
 *   égalité, 0 par défaite), divisée par le nombre de duels plus une prudence (`prudence`) ; puis 50 plus cent fois ce
 *   nombre. 50 : autant que prévu. Jouer beaucoup ne fait pas monter : un Gaulois ordinaire reste autour de 50 ; battre
 *   des comptes faibles rapporte peu, puisque tout le monde les bat.
 * - LE CLASSEMENT : on est classé à partir de `minimum` duels retenus ; la meilleure note d'abord, puis le plus de duels,
 *   puis qui y est arrivé le premier.
 *
 * L'essai contre le hasard (`scripts/essai-tableau-duel.ts`, `src/lib/village/essai-tableau-duel.ts`) a choisi ces chiffres.
 */

/** Un résultat d'un duel qui compte, du côté d'un joueur. */
export interface ResultatDuTableau {
  /** Le joueur classé. */
  joueur: string;
  /** Contre le boss du jour, contre la main de défense d'un membre, ou en salle contre un membre. */
  type: "boss" | "defense" | "salle";
  /** Qui était en face : « boss:<id> » ou « membre:<id> ». Un même membre en défense ou en salle est le même adversaire. */
  adversaire: string;
  /** Contre une main de défense : laquelle (une main changée est un autre adversaire pour l'attendu). */
  main?: string;
  /** 1 gagné, une demie pour l'égalité, 0 perdu. */
  r: 0 | 0.5 | 1;
  /** Le jour où le duel a commencé (heure de Paris) : un même adversaire ne compte qu'une fois par jour. */
  jour: number | string;
  /** La semaine où il a fini (du mardi 21 h 30 au mardi 21 h 30) : un même adversaire deux fois par semaine au plus. */
  semaine: number | string;
  /** L'ordre de fin des duels (l'heure de fin, puis le numéro) : le premier du jour contre un adversaire est celui qui compte. */
  ordre: number;
}

/** Les chiffres du tableau, choisis par l'essai contre le hasard (22 novembre 2026). */
export const REGLES_DU_TABLEAU = {
  /** Combien de duels « à la moyenne » tirent l'attendu d'un adversaire vers celle de son genre. */
  poids: 3,
  /** La prudence de la note : autant de duels « à l'attendu » ajoutés à ceux du joueur. */
  prudenceSemaine: 10,
  prudenceSaison: 20,
  /** Les duels retenus qu'il faut pour être classé. */
  minimumSemaine: 5,
  minimumSaison: 15,
  /** Un même adversaire, au plus, dans une semaine. */
  parAdversaireEtParSemaine: 2,
  /** Le partage de la cagnotte de la saison, en pour cent, du premier au troisième. */
  parts: [50, 30, 20],
} as const;

/** Les duels retenus : le premier du jour contre chaque adversaire, puis au plus `plafond` par adversaire et par semaine. */
export function retenus(resultats: readonly ResultatDuTableau[], plafond: number = REGLES_DU_TABLEAU.parAdversaireEtParSemaine): ResultatDuTableau[] {
  const vus = new Set<string>(), fois = new Map<string, number>(), out: ResultatDuTableau[] = [];
  for (const x of [...resultats].sort((a, b) => a.ordre - b.ordre)) {
    const jour = `${x.joueur}|${x.adversaire}|${x.jour}`;
    if (vus.has(jour)) continue;
    vus.add(jour);
    const semaine = `${x.joueur}|${x.adversaire}|${x.semaine}`;
    const n = fois.get(semaine) ?? 0;
    if (n >= plafond) continue;
    fois.set(semaine, n + 1);
    out.push(x);
  }
  return out;
}

/** La clé de l'adversaire pour l'attendu : le boss, ou la main de défense telle qu'elle était. */
const cleDeLAttendu = (x: ResultatDuTableau): string => (x.type === "defense" ? `${x.adversaire}|${x.main ?? ""}` : x.adversaire);

/**
 * L'attendu de chaque duel, d'après `tous` les duels connus (comptés, avant le tri des duels retenus) : contre un boss ou une
 * main de défense, la part de points prise contre lui, tirée vers la moyenne de son genre ; en salle, l'inverse de la part
 * que l'adversaire prend d'ordinaire en salle, tirée vers une demie.
 */
export function attendus(tous: readonly ResultatDuTableau[], poids: number = REGLES_DU_TABLEAU.poids): (x: ResultatDuTableau) => number {
  const genre = new Map<string, [number, number]>(), contre = new Map<string, [number, number]>(), enSalle = new Map<string, [number, number]>();
  const ajouter = (m: Map<string, [number, number]>, k: string, r: number): void => {
    const s = m.get(k);
    if (s) {
      s[0] += r;
      s[1]++;
    } else m.set(k, [r, 1]);
  };
  for (const x of tous) {
    if (x.type === "salle") ajouter(enSalle, x.joueur, x.r);
    else {
      ajouter(genre, x.type, x.r);
      ajouter(contre, cleDeLAttendu(x), x.r);
    }
  }
  return (x) => {
    if (x.type === "salle") {
      const [s, n] = enSalle.get(x.adversaire.replace(/^membre:/, "")) ?? [0, 0];
      return 1 - (s + poids * 0.5) / (n + poids);
    }
    const [sg, ng] = genre.get(x.type) ?? [0, 0];
    const moyenne = ng > 0 ? sg / ng : 0.5;
    const [s, n] = contre.get(cleDeLAttendu(x)) ?? [0, 0];
    return (s + poids * moyenne) / (n + poids);
  };
}

/** Une ligne du tableau. */
export interface LigneClassee {
  joueur: string;
  /** La note exacte : 50, plus cent fois ce que le joueur a pris de plus que l'attendu, par duel (avec la prudence). */
  note: number;
  duels: number;
  victoires: number;
  egalites: number;
  /** L'ordre de son dernier duel retenu : à note et duels égaux, qui y est arrivé le premier passe devant. */
  dernier: number;
}

/**
 * Le tableau d'une fenêtre (une semaine, une saison) : `fenetre` les duels retenus qui y ont fini, `tous` tous les duels
 * comptés connus à la fin de la fenêtre (pour l'attendu). Seuls les classés (au moins `minimum` duels), le premier d'abord.
 */
export function classer(fenetre: readonly ResultatDuTableau[], tous: readonly ResultatDuTableau[], { prudence, minimum, poids = REGLES_DU_TABLEAU.poids }: { prudence: number; minimum: number; poids?: number }): LigneClassee[] {
  const e = attendus(tous, poids);
  const par = new Map<string, { plus: number; duels: number; victoires: number; egalites: number; dernier: number }>();
  for (const x of fenetre) {
    const l = par.get(x.joueur) ?? { plus: 0, duels: 0, victoires: 0, egalites: 0, dernier: -Infinity };
    l.plus += x.r - e(x);
    l.duels++;
    if (x.r === 1) l.victoires++;
    if (x.r === 0.5) l.egalites++;
    l.dernier = Math.max(l.dernier, x.ordre);
    par.set(x.joueur, l);
  }
  const out: LigneClassee[] = [];
  for (const [joueur, l] of par) {
    if (l.duels < minimum) continue;
    out.push({ joueur, note: 50 + (100 * l.plus) / (l.duels + prudence), duels: l.duels, victoires: l.victoires, egalites: l.egalites, dernier: l.dernier });
  }
  return out.sort((a, b) => b.note - a.note || b.duels - a.duels || a.dernier - b.dernier || (a.joueur < b.joueur ? -1 : a.joueur > b.joueur ? 1 : 0));
}

/** Le tableau d'une semaine : ses duels retenus, l'attendu de tous les duels connus à sa fin. */
export const tableauDeLaSemaine = (fenetre: readonly ResultatDuTableau[], tous: readonly ResultatDuTableau[]): LigneClassee[] =>
  classer(fenetre, tous, { prudence: REGLES_DU_TABLEAU.prudenceSemaine, minimum: REGLES_DU_TABLEAU.minimumSemaine });

/** Le tableau d'une saison. */
export const tableauDeLaSaison = (fenetre: readonly ResultatDuTableau[], tous: readonly ResultatDuTableau[]): LigneClassee[] =>
  classer(fenetre, tous, { prudence: REGLES_DU_TABLEAU.prudenceSaison, minimum: REGLES_DU_TABLEAU.minimumSaison });

/**
 * Le partage de la cagnotte d'une saison entre ses trois premiers : la part de chaque place, en statères entiers, arrondie
 * vers le bas ; la part d'une place vide et ce qui reste des arrondis vont à la saison suivante. La somme des parts et du
 * reste est toujours la cagnotte : rien ne se crée, rien ne se perd.
 */
export function partageDeLaCagnotte(cagnotte: number, places: number): { parts: number[]; reste: number } {
  if (!Number.isInteger(cagnotte) || cagnotte < 0) throw new Error("cagnotte invalide");
  const parts = REGLES_DU_TABLEAU.parts.slice(0, Math.max(0, Math.min(3, places))).map((p) => Math.floor((cagnotte * p) / 100));
  return { parts, reste: cagnotte - parts.reduce((s, p) => s + p, 0) };
}
