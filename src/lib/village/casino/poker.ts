import type { CarteDuVingtEtUn } from "../contrat-casino";

/**
 * Le poker du barde (28 novembre 2026, choisi par le pilote parmi les idées pour le casino, maquette jouable validée :
 * « Oui, construis ») : cinq cartes d'un paquet de 52, on garde celles qu'on veut, les autres sont remplacées une fois par
 * des cartes du même paquet, puis la main paie selon la table. Les cartes jetées ne reviennent pas. Le barde montre le
 * meilleur choix, calculé sur toutes les cartes qui peuvent venir.
 *
 * La table paie 250, 50, 25, 10, 6, 4, 3, 2 et 1 fois la mise, mise comprise. Joué au mieux, le jeu rend 99,5238 % de la
 * mise en moyenne, jamais plus : `rendementAuMieux`, calcul exact sur les 2 598 960 donnes et leurs 32 choix
 * (tests/unit/casino-poker.test.ts). Le serveur (migration 20261128000500_casino_poker_et_bilan) tire comme `donneDuPoker`
 * et `tirageDuPoker`, et classe comme `sorteDuPoker` (tests/unit/casino-poker-serveur.test.ts).
 */

export type CarteDuPoker = CarteDuVingtEtUn;

export interface SorteDuPoker {
  id: string;
  nom: string;
  /** Ce que la main rend, mise comprise, en nombre de fois la mise. */
  fois: number;
  /** Sur combien de mains, joué au mieux, cette sorte sort une fois (calcul exact, arrondi). */
  uneSur: number;
}

/** Les sortes de main, de la plus faible à la plus forte. */
export const SORTES_DU_POKER: readonly SorteDuPoker[] = [
  { id: "rien", nom: "Rien", fois: 0, uneSur: 2 },
  { id: "valets", nom: "Valets ou mieux", fois: 1, uneSur: 5 },
  { id: "deux-paires", nom: "Deux paires", fois: 2, uneSur: 8 },
  { id: "brelan", nom: "Brelan", fois: 3, uneSur: 13 },
  { id: "quinte", nom: "Quinte", fois: 4, uneSur: 91 },
  { id: "couleur", nom: "Couleur", fois: 6, uneSur: 83 },
  { id: "full", nom: "Full", fois: 10, uneSur: 87 },
  { id: "carre", nom: "Carré", fois: 25, uneSur: 423 },
  { id: "quinte-flush", nom: "Quinte flush", fois: 50, uneSur: 9445 },
  { id: "royale", nom: "Quinte flush royale", fois: 250, uneSur: 51787 },
];

/** Ce que le jeu rend joué au mieux, en part de la mise. */
export const RENDEMENT_DU_POKER = 0.995238;

/** Le nombre d'une carte, de 0 à 51 (comme au vingt-et-un). */
export const nombre = (c: CarteDuPoker): number => c.e * 13 + c.r;
export const carte = (n: number): CarteDuPoker => ({ r: n % 13, e: Math.floor(n / 13) });

// Les dix suites de cinq rangs (le rang 0 est l'as, en bas ou en haut), et celle de la quinte royale.
const SUITES: number[] = [];
for (let s = 0; s <= 8; s++) SUITES.push(0b11111 << s);
const ROYALE = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);
SUITES.push(ROYALE);

const CPT = new Int8Array(13);
/** La sorte de cinq cartes données par leur nombre (index dans `SORTES_DU_POKER`). */
function sorteDesNombres(a: number, b: number, c: number, d: number, e: number): number {
  CPT.fill(0);
  const ra = a % 13, rb = b % 13, rc = c % 13, rd = d % 13, re = e % 13;
  CPT[ra]!++;
  CPT[rb]!++;
  CPT[rc]!++;
  CPT[rd]!++;
  CPT[re]!++;
  const ea = (a / 13) | 0;
  const couleur = ((b / 13) | 0) === ea && ((c / 13) | 0) === ea && ((d / 13) | 0) === ea && ((e / 13) | 0) === ea;
  let masque = 0, paires = 0, trois = 0, quatre = 0, pairHaute = false;
  for (let r = 0; r < 13; r++) {
    const n = CPT[r]!;
    if (!n) continue;
    masque |= 1 << r;
    if (n === 2) {
      paires++;
      if (r === 0 || r >= 10) pairHaute = true;
    } else if (n === 3) trois++;
    else if (n === 4) quatre++;
  }
  if (quatre) return 7;
  if (trois && paires) return 6;
  const quinte = !paires && !trois && SUITES.includes(masque);
  if (quinte && couleur) return masque === ROYALE ? 9 : 8;
  if (couleur) return 5;
  if (quinte) return 4;
  if (trois) return 3;
  if (paires === 2) return 2;
  if (paires === 1 && pairHaute) return 1;
  return 0;
}

/** La sorte d'une main de cinq cartes. */
export function sorteDuPoker(main: readonly CarteDuPoker[]): number {
  const n = main.map(nombre);
  return sorteDesNombres(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!);
}

/** Ce que rend une main finie pour une mise, mise comprise. */
export const renduDuPoker = (main: readonly CarteDuPoker[], mise: number): number => SORTES_DU_POKER[sorteDuPoker(main)]!.fois * mise;

/** `tirer(n)` : un entier tiré au hasard de 0 à n - 1 (au serveur, le générateur sûr de Postgres). */
export type Tirage = (n: number) => number;

/** Cinq cartes différentes du paquet de 52. */
export function donneDuPoker(tirer: Tirage): CarteDuPoker[] {
  const paquet = Array.from({ length: 52 }, (_, i) => i);
  const main: CarteDuPoker[] = [];
  for (let k = 0; k < 5; k++) {
    const i = tirer(paquet.length);
    main.push(carte(paquet.splice(i, 1)[0]!));
  }
  return main;
}

/** Les cartes non gardées sont remplacées par des cartes du paquet qui restent (ni la main, ni les cartes jetées). */
export function tirageDuPoker(main: readonly CarteDuPoker[], gardes: readonly boolean[], tirer: Tirage): CarteDuPoker[] {
  const vues = new Set(main.map(nombre));
  const paquet = Array.from({ length: 52 }, (_, i) => i).filter((n) => !vues.has(n));
  return main.map((c, k) => {
    if (gardes[k]) return c;
    const i = tirer(paquet.length);
    return carte(paquet.splice(i, 1)[0]!);
  });
}

/**
 * Le conseil du barde : parmi les 32 façons de garder des cartes, celle qui rend le plus en moyenne, sur toutes les cartes
 * qui peuvent venir (2 598 960 mains comptées en tout, un quart de seconde environ). `esperance` : ce que ce choix rend en
 * moyenne, en nombre de fois la mise.
 */
export function conseilDuBarde(main: readonly CarteDuPoker[]): { gardes: boolean[]; esperance: number } {
  const n = main.map(nombre);
  const vues = new Set(n);
  const reste = Array.from({ length: 52 }, (_, i) => i).filter((x) => !vues.has(x));
  const fois = SORTES_DU_POKER.map((s) => s.fois);
  let mieux = -1;
  let choix = 0;
  const h = new Int32Array(5);
  for (let m = 31; m >= 0; m--) {
    let k = 0;
    for (let i = 0; i < 5; i++) if (m & (1 << i)) h[k++] = n[i]!;
    const manque = 5 - k;
    let somme = 0;
    let compte = 0;
    const L = reste.length;
    // toutes les façons de prendre `manque` cartes parmi les 47 qui restent
    const idx = [0, 1, 2, 3, 4].slice(0, manque);
    if (manque === 0) {
      somme = fois[sorteDesNombres(h[0]!, h[1]!, h[2]!, h[3]!, h[4]!)]!;
      compte = 1;
    } else {
      for (;;) {
        for (let j = 0; j < manque; j++) h[k + j] = reste[idx[j]!]!;
        somme += fois[sorteDesNombres(h[0]!, h[1]!, h[2]!, h[3]!, h[4]!)]!;
        compte++;
        let j = manque - 1;
        while (j >= 0 && idx[j] === L - manque + j) j--;
        if (j < 0) break;
        idx[j]!++;
        for (let t = j + 1; t < manque; t++) idx[t] = idx[t - 1]! + 1;
      }
    }
    const v = somme / compte;
    if (v > mieux + 1e-12) {
      mieux = v;
      choix = m;
    }
  }
  return { gardes: [0, 1, 2, 3, 4].map((i) => (choix & (1 << i)) !== 0), esperance: mieux };
}

/**
 * Ce que le jeu rend, joué au mieux, en part de la mise, et la part des mains finies de chaque sorte : calcul exact sur les
 * 2 598 960 donnes, pour chacune le meilleur des 32 choix (quelques secondes). Méthode : pour chaque groupe de 0 à 4 cartes,
 * le compte des mains de chaque sorte qui le contiennent ; pour une donne et un choix, le compte des mains qu'on peut finir
 * se lit par inclusion-exclusion sur les cartes jetées (elles ne reviennent pas). `fois` : une autre table, pour l'essayer.
 */
export function rendementAuMieux(fois: readonly number[] = SORTES_DU_POKER.map((s) => s.fois)): { rendu: number; parts: number[] } {
  const NC = SORTES_DU_POKER.length;
  const C = Array.from({ length: 53 }, () => new Array<number>(6).fill(0));
  for (let n = 0; n <= 52; n++) {
    C[n]![0] = 1;
    for (let k = 1; k <= 5; k++) C[n]![k] = n === 0 ? 0 : C[n - 1]![k - 1]! + C[n - 1]![k]!;
  }
  const taille = Int32Array.from({ length: 32 }, (_, m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1));
  const pos = new Int32Array(5);
  const rangs = new Int32Array(32);
  const ranger = (): void => {
    for (let m = 0; m < 32; m++) {
      let r = 0;
      let j = 0;
      for (let i = 0; i < 5; i++) if (m & (1 << i)) r += C[pos[i]!]![++j]!;
      rangs[m] = r;
    }
  };
  // compte[k][rang * NC + sorte] : les mains de cette sorte qui contiennent ce groupe de k cartes
  const compte = [0, 1, 2, 3, 4].map((k) => new Int32Array(C[52]![k]! * NC));
  const sortes = new Uint8Array(C[52]![5]!);
  let i = 0;
  const chaqueMain = (f: (s: number) => void): void => {
    i = 0;
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              pos[0] = a;
              pos[1] = b;
              pos[2] = c;
              pos[3] = d;
              pos[4] = e;
              ranger();
              f(i++);
            }
  };
  chaqueMain((k) => {
    const s = sorteDesNombres(pos[0]!, pos[1]!, pos[2]!, pos[3]!, pos[4]!);
    sortes[k] = s;
    for (let m = 0; m < 31; m++) compte[taille[m]!]![rangs[m]! * NC + s]!++;
  });
  const vaut = [0, 1, 2, 3, 4].map((k) => {
    const t = new Float64Array(C[52]![k]!);
    for (let r = 0; r < t.length; r++) {
      let v = 0;
      for (let s = 0; s < NC; s++) v += compte[k]![r * NC + s]! * fois[s]!;
      t[r] = v;
    }
    return t;
  });
  let total = 0;
  const parts = new Float64Array(NC);
  chaqueMain((k) => {
    const s5 = sortes[k]!;
    let mieux = -1;
    let choix = 0;
    for (let S = 0; S < 32; S++) {
      const R = 31 & ~S;
      let v = 0;
      for (let T = R; ; T = (T - 1) & R) {
        const U = S | T;
        const val = taille[U] === 5 ? fois[s5]! : vaut[taille[U]!]![rangs[U]!]!;
        v += taille[T]! & 1 ? -val : val;
        if (T === 0) break;
      }
      v /= C[47]![5 - taille[S]!]!;
      if (v > mieux + 1e-12) {
        mieux = v;
        choix = S;
      }
    }
    total += mieux;
    const R = 31 & ~choix;
    const n = C[47]![5 - taille[choix]!]!;
    for (let s = 0; s < NC; s++) {
      let v = 0;
      for (let T = R; ; T = (T - 1) & R) {
        const U = choix | T;
        const val = taille[U] === 5 ? (s5 === s ? 1 : 0) : compte[taille[U]!]![rangs[U]! * NC + s]!;
        v += taille[T]! & 1 ? -val : val;
        if (T === 0) break;
      }
      parts[s]! += v / n;
    }
  });
  const N = C[52]![5]!;
  return { rendu: total / N, parts: Array.from(parts, (p) => p / N) };
}
