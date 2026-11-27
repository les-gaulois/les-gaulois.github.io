/**
 * Les mots de l'écran du tableau des duellistes (dessin de Claude Fable 5.2, `src/components/village/duel-tableau/`) :
 * rangs, dates à l'heure de Paris, accords, et la phrase de l'essai contre le hasard. Pur, testé
 * (`tests/unit/duel-tableau.test.ts`). Des mots, pas des signes : « 50 pour cent », jamais « % ».
 */

const RANGS = ["premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième", "huitième", "neuvième", "dixième", "onzième", "douzième", "treizième", "quatorzième", "quinzième", "seizième", "dix-septième", "dix-huitième", "dix-neuvième", "vingtième"];

/** Le rang écrit court : « 1er », « 2e », « 27e ». */
export const rangCourt = (n: number): string => (n === 1 ? "1er" : `${n}e`);

/** Le rang en toutes lettres pour les lecteurs d'écran : « premier », « deuxième »… ; au-delà de vingt, « 27e ». */
export const rangEnMots = (n: number): string => RANGS[n - 1] ?? `${n}e`;

/** Une place du podium en toutes lettres, avec sa majuscule : « Premier », « Deuxième », « Troisième ». */
export const placeEnMots = (n: number): string => {
  const m = rangEnMots(n);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

/** Un nombre et son nom, accordé : « 1 duel », « 12 duels ». */
export const compte = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

const PARIS = "Europe/Paris";
const JOUR_ET_HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const JOUR_SEUL = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });
const DATE_SEULE = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long" });

/** Un instant, à l'heure de Paris : « mardi 24 novembre, 21 h 30 ». */
export function jourEtHeure(iso: string): string {
  const p = Object.fromEntries(JOUR_ET_HEURE.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const jour = p.day === "1" ? "1er" : p.day;
  return `${p.weekday} ${jour} ${p.month}, ${Number(p.hour)} h ${p.minute}`;
}

/** Le jour d'un instant, à Paris : « mardi 29 décembre ». */
export function jourDeLInstant(iso: string): string {
  const p = Object.fromEntries(JOUR_SEUL.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day === "1" ? "1er" : p.day} ${p.month}`;
}

/** Un jour du calendrier (« AAAA-MM-JJ ») : « 28 décembre ». */
export function jourEnLettres(ymd: string): string {
  const p = Object.fromEntries(DATE_SEULE.formatToParts(new Date(`${ymd}T12:00:00Z`)).map((x) => [x.type, x.value]));
  return `${p.day === "1" ? "1er" : p.day} ${p.month}`;
}

/** Le premier jour d'une semaine du tableau (elle porte le nom du mardi où elle finit) : « 17 novembre ». */
export function debutDeLaSemaine(semaine: string): string {
  const t = Date.parse(`${semaine}T12:00:00Z`) - 7 * 86_400_000;
  return jourEnLettres(new Date(t).toISOString().slice(0, 10));
}

const PARTIES_A_PARIS = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
const JOURS_DE_LA_SEMAINE: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/**
 * La semaine d'un instant, comme le serveur (`internal.duel_semaine_de`) : le mardi (« AAAA-MM-JJ », à Paris) du premier
 * 21 h 30 qui le suit.
 */
export function semaineDe(t: Date): string {
  const p = Object.fromEntries(PARTIES_A_PARIS.formatToParts(t).map((x) => [x.type, x.value]));
  const jour = JOURS_DE_LA_SEMAINE[p.weekday!]!;
  const aujourdhui = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const mardi = aujourdhui + (2 - jour) * 86_400_000;
  const heure = Number(p.hour), minute = Number(p.minute);
  const avant = jour < 2 || (jour === 2 && (heure < 21 || (heure === 21 && minute < 30)));
  return new Date(avant ? mardi : mardi + 7 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Ce que dit l'essai contre le hasard (`scripts/essai-tableau-duel.ts`, 22 novembre 2026, refait le 27 novembre 2026 sans
 * les limites de trois duels comptés par jour et de trois matchs contre un même adversaire), pour le pli « Comment on est
 * classé ». À refaire, et à réécrire ici, si la règle du tableau change.
 */
export const TEXTE_DE_L_ESSAI =
  "Essai sur 60 saisons simulées avec le vrai moteur et des Gaulois de forces connues : le premier de la semaine est l'un des plus forts 70 fois sur 100, contre 28 pour un Gaulois tiré au sort ; celui de la saison, 83 fois sur 100. Jouer beaucoup ou ne battre que des comptes faibles n'y change presque rien, et un forfait ne rapporte rien à celui qui reste.";
