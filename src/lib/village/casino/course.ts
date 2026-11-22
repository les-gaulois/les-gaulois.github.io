/**
 * Les règles de la course des familiers, reprises au chiffre près de la maquette validée (`c2/jeux/course/regles.js`) : six
 * couloirs qui paient 3, 4, 6, 8, 12 et 24 fois la mise (mise comprise), avec 8, 6, 4, 3, 2 et 1 chances sur 24. Un seul
 * couloir par course ; chaque couloir rend en moyenne exactement sa mise. Le serveur tire le gagnant d'abord
 * (`jouer_course`) ; la course s'écrit ensuite pour lui (`ecrireLaCourse`), sans jamais rien changer au résultat.
 */

export interface CouloirDeLaCourse {
  /** Ce qu'il rend, mise comprise. */
  fois: number;
  /** Ses chances sur 24. */
  parts: number;
}

export const COULOIRS: readonly CouloirDeLaCourse[] = [
  { fois: 3, parts: 8 },
  { fois: 4, parts: 6 },
  { fois: 6, parts: 4 },
  { fois: 8, parts: 3 },
  { fois: 12, parts: 2 },
  { fois: 24, parts: 1 },
];
export const TOTAL_DES_PARTS = 24;

/** Le couloir gagnant pour un nombre tiré de 0 à 23. */
export function couloirPour(n: number): number {
  let s = 0;
  for (let i = 0; i < COULOIRS.length; i++) {
    s += COULOIRS[i]!.parts;
    if (n < s) return i;
  }
  return COULOIRS.length - 1;
}

/** Ce que rend le pari sur `couloir` quand `gagnant` gagne, mise comprise. */
export const renduDeLaCourse = (mise: number, couloir: number, gagnant: number): number => (couloir === gagnant ? mise * (COULOIRS[couloir]?.fois ?? 0) : 0);

/** L'allure d'un coureur : son heure d'arrivée et trois ondulations, une avance ou un retard qui se résorbe. */
export interface Coureur {
  T: number;
  a1: number;
  a2: number;
  a3: number;
}

/**
 * La course écrite pour que le gagnant gagne : chaque coureur a son heure d'arrivée (le gagnant la plus tôt) et son allure.
 * Jamais de marche arrière ni de saut : la vitesse reste positive. `alea` : de quoi dessiner, sans effet sur le résultat.
 */
export function ecrireLaCourse(gagnant: number, alea: () => number, n = 6): Coureur[] {
  const Tg = 12.9 + alea() * 0.5;
  const ecarts: number[] = [];
  let e = 0.2 + alea() * 0.22;
  for (let i = 0; i < n - 1; i++) {
    ecarts.push(e);
    e += 0.1 + alea() * 0.22;
  }
  for (let i = ecarts.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [ecarts[i], ecarts[j]] = [ecarts[j]!, ecarts[i]!];
  }
  const vientDeLoin = alea() < 0.62;
  return Array.from({ length: n }, (_, i) => {
    const moi = i === gagnant;
    const T = moi ? Tg : Tg + ecarts.pop()!;
    const a1 = moi ? (vientDeLoin ? -0.02 - alea() * 0.022 : 0.004 + alea() * 0.016) : -0.02 + alea() * 0.062;
    const a2 = (alea() * 2 - 1) * 0.016;
    const a3 = (alea() * 2 - 1) * 0.008;
    return { T, a1, a2, a3 };
  });
}

/** La part du chemin faite au temps t (0 à 1), et la vitesse (en parts par seconde). Après l'arrivée, le coureur ralentit sur sa lancée. */
export function avancee(c: Coureur, t: number): { part: number; vitesse: number; arrive: boolean } {
  const lag = 0.5;
  const te = Math.max(0, t - lag * (1 - Math.exp(-t / lag)));
  const u = te / c.T;
  const P = Math.PI;
  const f = (x: number) => x + c.a1 * Math.sin(P * x) + c.a2 * Math.sin(2 * P * x) + c.a3 * Math.sin(3 * P * x);
  const d = (x: number) => 1 + c.a1 * P * Math.cos(P * x) + 2 * c.a2 * P * Math.cos(2 * P * x) + 3 * c.a3 * P * Math.cos(3 * P * x);
  if (u <= 1) return { part: f(u), vitesse: d(u) / c.T, arrive: false };
  const v = d(1) / c.T;
  const tau = 0.55;
  const apres = te - c.T;
  return { part: 1 + v * tau * (1 - Math.exp(-apres / tau)), vitesse: v * Math.exp(-apres / tau), arrive: true };
}

/** L'instant (en secondes depuis le départ) où le coureur passe la ligne. */
export function heureDArrivee(c: Coureur): number {
  let a = c.T;
  let b = c.T + 1;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (avancee(c, m).part >= 1) b = m;
    else a = m;
  }
  return b;
}
