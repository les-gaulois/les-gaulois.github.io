/**
 * Les règles du vingt-et-un, reprises au chiffre près de la maquette validée (`c2/jeux/vingt-et-un/regles.js`, copie de
 * `outils-a/logique.js`) : paquet sans fin (chaque carte tirée parmi 52 puis remise), tavernier qui regarde sa carte cachée
 * sur un as ou un 10 et s'arrête à tous les 17, 21 d'entrée payé 3 pour 2, doubler sur deux cartes (et après séparation),
 * séparer une fois, as séparés une carte chacun, ni assurance ni abandon. Joué au mieux, le jeu rend 99,43 % de la mise
 * (`rendementAuMieux`, calcul exact).
 *
 * Le serveur joue la même machine en SQL (`internal.casino_v21_distribuer`, `internal.casino_v21_jouer`, migration
 * `20261123000100_casino_des_gaulois`), comparée à celle-ci par `tests/unit/casino-serveur.test.ts` : il tire chaque carte au
 * moment de la donner, garde la carte cachée et ne la montre qu'une fois retournée (`faitsMontres`). L'écran s'en sert pour
 * le conseil du druide (`conseil`, sur les seules cartes visibles), jamais pour décider.
 *
 * Deux écarts voulus avec la maquette, pour le serveur : « retourne » porte la carte cachée, et une carte se tire d'un
 * nombre de 0 à 51 (`carteDuNombre`) donné par la source du serveur.
 */
import type { CarteDuVingtEtUn, CombinaisonDesTrois, CoupDuVingtEtUn, CoupsPermis, FaitDuVingtEtUn, IssueDuVingtEtUn, MainDuVingtEtUn, TroisCartes } from "../contrat-casino";

export const ENSEIGNES = ["torques", "flammes", "épées", "chênes"] as const;
export const RANGS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "V", "D", "R"] as const;
export const NOMS_DES_RANGS = ["as", "2", "3", "4", "5", "6", "7", "8", "9", "10", "valet", "dame", "roi"] as const;

/** La carte d'un nombre de 0 à 51 : le rang `n % 13`, l'enseigne `n / 13`. */
export const carteDuNombre = (n: number): CarteDuVingtEtUn => ({ r: n % 13, e: Math.floor(n / 13) });
export const nombreDeLaCarte = (c: CarteDuVingtEtUn): number => c.e * 13 + c.r;
export const valeur = (c: CarteDuVingtEtUn): number => (c.r === 0 ? 1 : c.r >= 9 ? 10 : c.r + 1);
export const nomDeLaCarte = (c: CarteDuVingtEtUn): string => `${NOMS_DES_RANGS[c.r]} de ${ENSEIGNES[c.e]}`;

/** Le total d'une main : `t` le meilleur, `souple` si un as y compte 11, `dur` tous les as à 1. */
export function total(cartes: readonly CarteDuVingtEtUn[]): { t: number; souple: boolean; dur: number } {
  let dur = 0;
  let as = false;
  for (const c of cartes) {
    dur += valeur(c);
    if (c.r === 0) as = true;
  }
  const souple = as && dur + 10 <= 21;
  return { t: souple ? dur + 10 : dur, souple, dur };
}
export const vingtEtUnDEntree = (cartes: readonly CarteDuVingtEtUn[]): boolean => cartes.length === 2 && total(cartes).t === 21;

/* ---------- Le conseil du druide : la recherche du meilleur coup de la maquette ---------- */

const P = [0, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 4 / 13]; // 1 : as ; 10 : dix et figures

function ajoute(t: number, s: boolean, c: number): [number, boolean] {
  let tot = t + c;
  let soft = s;
  if (c === 1 && tot + 10 <= 21) {
    tot += 10;
    soft = true;
  }
  if (tot > 21 && soft) {
    tot -= 10;
    soft = false;
  }
  return [tot, soft];
}

type FinDuTavernier = Record<17 | 18 | 19 | 20 | 21 | "b", number>;

/** Où finit le tavernier, sachant qu'il n'a pas 21 d'entrée (il a regardé). Il s'arrête à tous les 17. */
function finDuTavernier(up: number): FinDuTavernier {
  const res: FinDuTavernier = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, b: 0 };
  const va = (t: number, s: boolean, pr: number, n: number): void => {
    if (t > 21) {
      res.b += pr;
      return;
    }
    if (t >= 17) {
      res[t as 17 | 18 | 19 | 20 | 21] += pr;
      return;
    }
    for (let c = 1; c <= 10; c++) {
      if (n === 1 && ((up === 1 && c === 10) || (up === 10 && c === 1))) continue;
      const [t2, s2] = ajoute(t, s, c);
      va(t2, s2, pr * P[c]!, n + 1);
    }
  };
  const [t0, s0] = ajoute(0, false, up);
  va(t0, s0, 1, 1);
  const tot = Object.values(res).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(res) as (keyof FinDuTavernier)[]) res[k] /= tot;
  return res;
}

interface Etude {
  rester: (t: number) => number;
  tirerSeul: (t: number, s: boolean) => number;
  auMieux: (t: number, s: boolean) => number;
  doubler: (t: number, s: boolean) => number;
  separer: (a: number) => number;
}
const ETUDES: Etude[] = [];

function etude(up: number): Etude {
  const deja = ETUDES[up];
  if (deja) return deja;
  const d = finDuTavernier(up);
  const memo = new Map<string, number>();
  const rester = (t: number): number => {
    if (t > 21) return -1;
    let ev = d.b;
    for (const v of [17, 18, 19, 20, 21] as const) ev += d[v] * (t > v ? 1 : t < v ? -1 : 0);
    return ev;
  };
  const tirerSeul = (t: number, s: boolean): number => {
    let h = 0;
    for (let c = 1; c <= 10; c++) {
      const [t2, s2] = ajoute(t, s, c);
      h += P[c]! * (t2 > 21 ? -1 : auMieux(t2, s2));
    }
    return h;
  };
  const auMieux = (t: number, s: boolean): number => {
    if (t > 21) return -1;
    const k = t + (s ? "s" : "h");
    const vu = memo.get(k);
    if (vu !== undefined) return vu;
    const v = Math.max(rester(t), tirerSeul(t, s));
    memo.set(k, v);
    return v;
  };
  const doubler = (t: number, s: boolean): number => {
    let e = 0;
    for (let c = 1; c <= 10; c++) {
      const [t2] = ajoute(t, s, c);
      e += P[c]! * rester(t2);
    }
    return 2 * e;
  };
  // a : valeur de chaque carte de la paire ; une seule séparation, doubler permis ensuite, une carte par as
  const separer = (a: number): number => {
    const [ta, sa] = ajoute(0, false, a);
    let un = 0;
    for (let c = 1; c <= 10; c++) {
      const [t2, s2] = ajoute(ta, sa, c);
      un += P[c]! * (a === 1 ? rester(t2) : Math.max(auMieux(t2, s2), doubler(t2, s2)));
    }
    return 2 * un;
  };
  const e: Etude = { rester, tirerSeul, auMieux, doubler, separer };
  ETUDES[up] = e;
  return e;
}

/** Ce que vaut chaque coup permis (en mises), et le meilleur : le conseil du druide, sur les cartes du joueur et la carte visible du tavernier. */
export function conseil(cartes: readonly CarteDuVingtEtUn[], visible: CarteDuVingtEtUn, permis: CoupsPermis): { coup: CoupDuVingtEtUn | null; gains: Partial<Record<CoupDuVingtEtUn, number>> } {
  const { dur, souple } = total(cartes);
  const t = souple ? dur + 10 : dur;
  const E = etude(valeur(visible));
  const gains: Partial<Record<CoupDuVingtEtUn, number>> = {};
  if (permis.rester) gains.rester = E.rester(t);
  if (permis.tirer) gains.tirer = E.tirerSeul(t, souple);
  if (permis.doubler) gains.doubler = E.doubler(t, souple);
  if (permis.separer && cartes[0]) gains.separer = E.separer(valeur(cartes[0]));
  let coup: CoupDuVingtEtUn | null = null;
  for (const k of ["rester", "tirer", "doubler", "separer"] as const) {
    const g = gains[k];
    if (g !== undefined && (coup === null || g > gains[coup]! + 1e-12)) coup = k;
  }
  return { coup, gains };
}

/** Ce que rend le jeu joué au mieux, en fois la mise (calcul exact). */
export function rendementAuMieux(): number {
  let tot = 0;
  for (let up = 1; up <= 10; up++) {
    const pBJ = up === 1 ? P[10]! : up === 10 ? P[1]! : 0;
    const E = etude(up);
    for (let a = 1; a <= 10; a++)
      for (let b = 1; b <= 10; b++) {
        const pr = P[up]! * P[a]! * P[b]!;
        const [t1, s1] = ajoute(0, false, a);
        const [t, s] = ajoute(t1, s1, b);
        if (t === 21) {
          tot += pr * (1 - pBJ) * 1.5;
          continue;
        }
        let ev = Math.max(E.auMieux(t, s), E.doubler(t, s));
        if (a === b) ev = Math.max(ev, E.separer(a));
        tot += pr * (pBJ * -1 + (1 - pBJ) * ev);
      }
  }
  return 1 + tot;
}

/* ---------- Trois cartes : la mise à côté (maquette « Trois cartes », choisie le 28 novembre 2026) ---------- */

/**
 * Ce que rend chaque main de trois cartes (les deux premières du joueur et la carte visible du tavernier), en fois la mise
 * à côté, mise comprise. Sur le paquet sans fin, ces gains rendent exactement la mise en moyenne (`comptesDesTrois`).
 */
export const FOIS_DES_TROIS: Readonly<Record<CombinaisonDesTrois, number>> = { "brelan-enseigne": 100, "suite-enseigne": 39, brelan: 28, suite: 10, enseigne: 7 };

/**
 * La main de trois cartes : un brelan (trois mêmes rangs), une suite (trois rangs qui se suivent, l'as avant le 2 ou après
 * le roi), ou trois cartes de même enseigne ; la meilleure seule compte. `null` : rien.
 */
export function combinaisonDesTrois(a: CarteDuVingtEtUn, b: CarteDuVingtEtUn, c: CarteDuVingtEtUn): CombinaisonDesTrois | null {
  const meme = a.e === b.e && b.e === c.e;
  if (a.r === b.r && b.r === c.r) return meme ? "brelan-enseigne" : "brelan";
  const [x, y, z] = [a.r, b.r, c.r].sort((p, q) => p - q) as [number, number, number];
  const suite = x !== y && y !== z && (z - x === 2 || (x === 0 && y === 11 && z === 12));
  if (suite) return meme ? "suite-enseigne" : "suite";
  return meme ? "enseigne" : null;
}

/** Ce que rend la mise à côté `mise` sur la main `combinaison`, mise comprise. */
export const recuDesTrois = (mise: number, combinaison: CombinaisonDesTrois | null): number => (combinaison ? mise * FOIS_DES_TROIS[combinaison] : 0);

/** Combien des 52 × 52 × 52 tirages font chaque main (« rien » : aucune). Le calcul exact des chances. */
export function comptesDesTrois(): Record<CombinaisonDesTrois | "rien", number> {
  const n: Record<CombinaisonDesTrois | "rien", number> = { "brelan-enseigne": 0, "suite-enseigne": 0, brelan: 0, suite: 0, enseigne: 0, rien: 0 };
  for (let i = 0; i < 52; i++)
    for (let j = 0; j < 52; j++)
      for (let k = 0; k < 52; k++) n[combinaisonDesTrois(carteDuNombre(i), carteDuNombre(j), carteDuNombre(k)) ?? "rien"]++;
  return n;
}

/* ---------- La machine du serveur : il tire d'abord, et rend la liste de ce que l'écran doit montrer ---------- */

/** Une main entière, telle que le serveur la garde : la carte cachée comprise. */
export interface EtatDuVingtEtUn {
  /** La mise de départ. */
  mise: number;
  tavernier: CarteDuVingtEtUn[];
  mains: MainDuVingtEtUn[];
  separee: boolean;
  courante: number;
  phase: "joueur" | "fini";
  /** La mise à côté « Trois cartes », décidée à la donne, ou `null` sans elle. */
  trois: TroisCartes | null;
}

/** La source des cartes : un nombre de 0 à 51 à chaque appel. */
export type SourceDeCartes = () => number;

const nouvelleMain = (cartes: CarteDuVingtEtUn[], mise: number): MainDuVingtEtUn => ({ cartes, mise, doublee: false, finie: false, issue: null, recu: 0 });

/**
 * Une main commence, avec `trois` statères sur « Trois cartes » (0 : sans mise à côté). Rend l'état et les faits à montrer,
 * dans l'ordre (la carte cachée y est encore : voir `faitsMontres`). La mise à côté se décide sur les deux cartes du joueur
 * et la carte visible du tavernier, aussitôt la quatrième carte posée.
 */
export function distribuer(mise: number, source: SourceDeCartes, trois = 0): { etat: EtatDuVingtEtUn; faits: FaitDuVingtEtUn[] } {
  const tire = () => carteDuNombre(source());
  const e: EtatDuVingtEtUn = { mise, tavernier: [], mains: [nouvelleMain([], mise)], separee: false, courante: 0, phase: "joueur", trois: null };
  const faits: FaitDuVingtEtUn[] = [];
  const j = e.mains[0]!;
  const c1 = tire();
  j.cartes.push(c1);
  faits.push({ t: "carte", a: "joueur", main: 0, carte: c1 });
  const t1 = tire();
  e.tavernier.push(t1);
  faits.push({ t: "carte", a: "tavernier", carte: t1 });
  const c2 = tire();
  j.cartes.push(c2);
  faits.push({ t: "carte", a: "joueur", main: 0, carte: c2 });
  const t2 = tire();
  e.tavernier.push(t2);
  faits.push({ t: "carte", a: "tavernier", carte: t2, cachee: true });
  if (trois > 0) {
    const combinaison = combinaisonDesTrois(c1, c2, t1);
    e.trois = { mise: trois, combinaison, recu: recuDesTrois(trois, combinaison) };
    faits.push({ t: "trois", combinaison, recu: e.trois.recu });
  }
  const vis = valeur(t1);
  const tBJ = vingtEtUnDEntree(e.tavernier);
  const jBJ = vingtEtUnDEntree(j.cartes);
  if (vis === 1 || vis === 10) faits.push({ t: "regarde" });
  if (tBJ) {
    // la main s'arrête aussitôt : on ne perd que sa mise
    faits.push({ t: "retourne", carte: t2 });
    j.finie = true;
    j.issue = jBJ ? "egal" : "perdu";
    j.recu = jBJ ? mise : 0;
    faits.push({ t: "bilan", main: 0, issue: j.issue, recu: j.recu, entree: true });
    e.phase = "fini";
  } else if (jBJ) {
    // payé 3 pour 2
    faits.push({ t: "retourne", carte: t2 });
    j.finie = true;
    j.issue = "vingt-et-un";
    j.recu = (mise * 5) / 2;
    faits.push({ t: "bilan", main: 0, issue: j.issue, recu: j.recu });
    e.phase = "fini";
  }
  return { etat: e, faits };
}

/** Les coups permis par les règles pour la main en cours (la bourse n'est pas regardée ici). */
export function coupsPermis(e: EtatDuVingtEtUn): CoupsPermis {
  const m = e.mains[e.courante];
  if (e.phase !== "joueur" || !m || m.finie) return { tirer: false, rester: false, doubler: false, separer: false };
  const deux = m.cartes.length === 2;
  return { tirer: true, rester: true, doubler: deux, separer: deux && !e.separee && valeur(m.cartes[0]!) === valeur(m.cartes[1]!) };
}

/** Ce que coûtent doubler ou séparer maintenant : la mise de la main en cours, ou 0 si aucun des deux n'est permis. */
export function complement(e: EtatDuVingtEtUn): number {
  const p = coupsPermis(e);
  return p.doubler || p.separer ? (e.mains[e.courante]?.mise ?? 0) : 0;
}

/**
 * Le joueur joue un coup ; le serveur tire tout ce qui suit (jusqu'au jeu du tavernier s'il le faut). Change `e` et rend les
 * faits nouveaux. Un coup non permis lève une erreur, sans rien changer.
 */
export function jouerUnCoup(e: EtatDuVingtEtUn, coup: CoupDuVingtEtUn, source: SourceDeCartes): FaitDuVingtEtUn[] {
  const permis = coupsPermis(e);
  if (!permis[coup]) throw new Error(`coup refusé : ${coup}`);
  const faits: FaitDuVingtEtUn[] = [];
  const m = e.mains[e.courante]!;
  const i = e.courante;
  const donne = (k: number): number => {
    const c = carteDuNombre(source());
    e.mains[k]!.cartes.push(c);
    faits.push({ t: "carte", a: "joueur", main: k, carte: c });
    return total(e.mains[k]!.cartes).t;
  };
  if (coup === "rester") m.finie = true;
  if (coup === "tirer") {
    const t = donne(i);
    if (t > 21) {
      m.finie = true;
      m.issue = "perdu";
      faits.push({ t: "bilan", main: i, issue: "perdu", recu: 0, saute: true });
    } else if (t === 21) m.finie = true;
  }
  if (coup === "doubler") {
    m.mise *= 2;
    m.doublee = true;
    faits.push({ t: "double", main: i });
    const t = donne(i);
    m.finie = true;
    if (t > 21) {
      m.issue = "perdu";
      faits.push({ t: "bilan", main: i, issue: "perdu", recu: 0, saute: true });
    }
  }
  if (coup === "separer") {
    const [a, b] = m.cartes as [CarteDuVingtEtUn, CarteDuVingtEtUn];
    const as = a.r === 0;
    e.separee = true;
    e.mains = [nouvelleMain([a], m.mise), nouvelleMain([b], m.mise)];
    faits.push({ t: "separe" });
    if (as) {
      // des as séparés : une seule carte chacun
      donne(0);
      donne(1);
      e.mains[0]!.finie = true;
      e.mains[1]!.finie = true;
    } else if (donne(0) === 21) e.mains[0]!.finie = true;
  }
  // la main suivante, puis le tavernier
  while (e.courante < e.mains.length && e.mains[e.courante]!.finie) {
    e.courante++;
    const s = e.mains[e.courante];
    if (s && !s.finie) {
      faits.push({ t: "main", main: e.courante });
      if (s.cartes.length === 1 && donne(e.courante) === 21) s.finie = true;
    }
  }
  if (e.courante >= e.mains.length) {
    e.phase = "fini";
    faits.push({ t: "retourne", carte: e.tavernier[1]! });
    if (e.mains.some((x) => !x.issue)) {
      // il tire jusqu'à 16 et s'arrête dès 17, même avec un as compté 11
      while (total(e.tavernier).t < 17) {
        const c = carteDuNombre(source());
        e.tavernier.push(c);
        faits.push({ t: "carte", a: "tavernier", carte: c });
      }
      const tt = total(e.tavernier).t;
      e.mains.forEach((x, k) => {
        if (x.issue) return;
        const tj = total(x.cartes).t;
        const issue: IssueDuVingtEtUn = tt > 21 || tj > tt ? "gagne" : tj === tt ? "egal" : "perdu";
        x.issue = issue;
        x.recu = issue === "gagne" ? 2 * x.mise : issue === "egal" ? x.mise : 0;
        faits.push({ t: "bilan", main: k, issue, recu: x.recu });
      });
    }
  }
  return faits;
}

/** Ce que la main rend en tout, mise comprise, « Trois cartes » comprise. */
export const renduDeLaMain = (e: EtatDuVingtEtUn): number => e.mains.reduce((s, m) => s + m.recu, 0) + (e.trois?.recu ?? 0);

/** Ce qui a été misé sur la main en tout : chaque main, doublée ou non, et « Trois cartes ». */
export const miseeDeLaMain = (e: EtatDuVingtEtUn): number => e.mains.reduce((s, m) => s + m.mise, 0) + (e.trois?.mise ?? 0);

/**
 * Les faits tels que l'écran peut les voir : la carte cachée du tavernier reste `null` tant qu'aucun « retourne » ne la
 * montre. `faits` : tous ceux de la main depuis la donne, dans l'ordre.
 */
export function faitsMontres(faits: readonly FaitDuVingtEtUn[]): FaitDuVingtEtUn[] {
  const retournee = faits.some((f) => f.t === "retourne");
  return faits.map((f) => (f.t === "carte" && f.a === "tavernier" && f.cachee && !retournee ? { ...f, carte: null } : f));
}

/** Les cartes du tavernier que l'écran peut voir : la première seule tant que la carte cachée ne l'est pas. */
export const tavernierMontre = (e: EtatDuVingtEtUn): CarteDuVingtEtUn[] => (e.phase === "fini" ? [...e.tavernier] : e.tavernier.slice(0, 1));
