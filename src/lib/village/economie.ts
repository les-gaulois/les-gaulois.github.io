/**
 * La mesure de l'économie du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois ») : ce que la règle des
 * statères distribue, ce que coûte le catalogue, ce que vaut une pochette surprise, et si les réglages du contrat
 * (`village/contrat.ts`) tiennent debout.
 *
 * Des calculs purs, sans Node : les prix, les chances, le catalogue et les parties viennent toujours en paramètres, rien
 * n'est recopié du contrat. `npm run village:economie` (`scripts/mesurer-economie-village.ts`) les applique aux données du
 * clan et écrit les tableaux dans le terminal. Aucun identifiant ni pseudo de joueur n'en sort : des comptes et des
 * quantiles seulement.
 *
 * Le modèle de la pochette est celui du contrat : une rareté tirée selon les chances, puis un objet payant de cette rareté,
 * tous à chances égales ; un objet déjà possédé sort en double.
 */
import { ORDRE_RARETES, type Rarete } from "../gaulois";
import { stateresDeVictoire } from "../stateres";
import { parisParts } from "../time";

// ---------------------------------------------------------------------------------------------------------------------
// Le catalogue
// ---------------------------------------------------------------------------------------------------------------------

/** Ce que la mesure lit d'un objet du catalogue (`OBJETS` de `gaulois.ts`). */
export interface ObjetDuCatalogue {
  rarete: Rarete | null;
  gratuit: boolean;
}

/** Le catalogue : pour chaque emplacement, les objets par identifiant. */
export type Catalogue = Readonly<Record<string, Readonly<Record<string, ObjetDuCatalogue>>>>;

/** Un nombre par rareté : des prix en statères, ou des chances en pour cent. */
export type ParRarete = Readonly<Record<Rarete, number>>;

/** Un objet de la boutique : ni gratuit, ni sans rareté. `cle` : « emplacement/objet ». */
export interface ObjetPayant {
  cle: string;
  emplacement: string;
  objet: string;
  rarete: Rarete;
}

export const cleObjet = (emplacement: string, objet: string): string => `${emplacement}/${objet}`;

/** Les objets payants du catalogue, emplacement par emplacement, dans l'ordre du catalogue. */
export function objetsPayants(catalogue: Catalogue): ObjetPayant[] {
  const liste: ObjetPayant[] = [];
  for (const [emplacement, objets] of Object.entries(catalogue)) {
    for (const [objet, o] of Object.entries(objets)) {
      if (!o.gratuit && o.rarete !== null) liste.push({ cle: cleObjet(emplacement, objet), emplacement, objet, rarete: o.rarete });
    }
  }
  return liste;
}

const parRareteVide = <T>(valeur: () => T): Record<Rarete, T> => Object.fromEntries(ORDRE_RARETES.map((r) => [r, valeur()])) as Record<Rarete, T>;

/** Les objets payants rangés par rareté. */
export function objetsParRarete(catalogue: Catalogue): Record<Rarete, ObjetPayant[]> {
  const rangs = parRareteVide<ObjetPayant[]>(() => []);
  for (const o of objetsPayants(catalogue)) rangs[o.rarete].push(o);
  return rangs;
}

export interface Cout {
  nombre: number;
  cout: number;
}

export interface CoutDuCatalogue extends Cout {
  parRarete: Record<Rarete, Cout>;
  parEmplacement: Record<string, Cout & { parRarete: Record<Rarete, number> }>;
}

/** Ce que coûte à la boutique tout le catalogue payant, par rareté et par emplacement. */
export function coutDuCatalogue(catalogue: Catalogue, prix: ParRarete): CoutDuCatalogue {
  const parRarete = parRareteVide<Cout>(() => ({ nombre: 0, cout: 0 }));
  const parEmplacement: CoutDuCatalogue["parEmplacement"] = {};
  let nombre = 0;
  let cout = 0;
  for (const o of objetsPayants(catalogue)) {
    const p = prix[o.rarete];
    nombre++;
    cout += p;
    parRarete[o.rarete].nombre++;
    parRarete[o.rarete].cout += p;
    const e = (parEmplacement[o.emplacement] ??= { nombre: 0, cout: 0, parRarete: parRareteVide(() => 0) });
    e.nombre++;
    e.cout += p;
    e.parRarete[o.rarete]++;
  }
  return { nombre, cout, parRarete, parEmplacement };
}

/** Les mois qu'il faut pour réunir `cout` statères avec `revenuMensuel` statères par mois. `null` : sans revenu, jamais. */
export function moisPourSOffrir(cout: number, revenuMensuel: number): number | null {
  if (!(revenuMensuel > 0)) return null;
  return Math.max(0, cout) / revenuMensuel;
}

// ---------------------------------------------------------------------------------------------------------------------
// La pochette surprise
// ---------------------------------------------------------------------------------------------------------------------

const sommeDesChances = (chances: ParRarete): number => ORDRE_RARETES.reduce((n, r) => n + chances[r], 0);

/** Ce que vaut en moyenne une pochette, au prix de la boutique, pour qui ne possède encore rien : doubles comptés plein pot. */
export function valeurMoyennePochette(chances: ParRarete, prix: ParRarete): number {
  return ORDRE_RARETES.reduce((n, r) => n + (chances[r] * prix[r]) / 100, 0);
}

/**
 * Ce que vaut en moyenne une pochette pour qui possède déjà `possedes` (clés « emplacement/objet ») : seuls les objets
 * nouveaux comptent, au prix de la boutique ; un double compte pour rien. Borne basse : un double se vend au marché.
 */
export function valeurNeuvePochette(chances: ParRarete, prix: ParRarete, catalogue: Catalogue, possedes: ReadonlySet<string>): number {
  const rangs = objetsParRarete(catalogue);
  return ORDRE_RARETES.reduce((n, r) => {
    const tous = rangs[r].length;
    if (tous === 0) return n;
    const neufs = rangs[r].filter((o) => !possedes.has(o.cle)).length;
    return n + (chances[r] / 100) * (neufs / tous) * prix[r];
  }, 0);
}

/** Le nombre moyen de pochettes pour tirer un objet quelconque de la rareté `rarete`. `Infinity` : chance nulle. */
export function pochettesMoyennesPourRarete(chances: ParRarete, rarete: Rarete): number {
  return chances[rarete] > 0 ? 100 / chances[rarete] : Infinity;
}

/** Le nombre moyen de pochettes pour tirer UN objet précis de la rareté `rarete`, parmi les objets payants de cette rareté. */
export function pochettesMoyennesPourObjet(chances: ParRarete, catalogue: Catalogue, rarete: Rarete): number {
  const n = objetsParRarete(catalogue)[rarete].length;
  return n > 0 && chances[rarete] > 0 ? (100 * n) / chances[rarete] : Infinity;
}

/** Un tirage pseudo-aléatoire reproductible (mulberry32) : même graine, mêmes nombres, de 0 inclus à 1 exclu. */
export function hasardAGraine(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Une pochette : une rareté selon les chances, puis un objet payant de cette rareté, tous à chances égales. */
export function tirerPochette(chances: ParRarete, rangs: Readonly<Record<Rarete, readonly ObjetPayant[]>>, hasard: () => number): ObjetPayant {
  let x = hasard() * sommeDesChances(chances);
  for (const r of ORDRE_RARETES) {
    if (chances[r] <= 0) continue;
    if (x < chances[r]) {
      const liste = rangs[r];
      const objet = liste[Math.min(liste.length - 1, Math.floor(hasard() * liste.length))];
      if (!objet) throw new Error(`La rareté ${r} a une chance mais aucun objet payant.`);
      return objet;
    }
    x -= chances[r];
  }
  throw new Error("Chances de la pochette illisibles.");
}

/** Ce qu'on cherche en ouvrant des pochettes : un objet précis (sa clé), une rareté quelconque, ou tout le catalogue. */
export type But = { objet: string } | { rarete: Rarete } | "tout";

export interface Ouverture {
  pochettes: number;
  doubles: number;
}

/** Ouvre des pochettes en partant de rien jusqu'à atteindre le but ; compte les pochettes et les doubles sortis. */
export function ouvrirJusqua(but: But, chances: ParRarete, catalogue: Catalogue, hasard: () => number, max = 10_000_000): Ouverture {
  const rangs = objetsParRarete(catalogue);
  const total = ORDRE_RARETES.reduce((n, r) => n + rangs[r].length, 0);
  const possedes = new Set<string>();
  let pochettes = 0;
  let doubles = 0;
  const atteint = (o: ObjetPayant): boolean =>
    but === "tout" ? possedes.size === total : "objet" in but ? o.cle === but.objet : o.rarete === but.rarete;
  while (pochettes < max) {
    const o = tirerPochette(chances, rangs, hasard);
    pochettes++;
    if (possedes.has(o.cle)) doubles++;
    else possedes.add(o.cle);
    if (atteint(o)) return { pochettes, doubles };
  }
  throw new Error("But jamais atteint : chances ou catalogue absurdes.");
}

export interface Resume {
  nombre: number;
  moyenne: number;
  p10: number;
  p25: number;
  mediane: number;
  p75: number;
  p90: number;
  max: number;
}

/** Le quantile `q` (de 0 à 1) d'une liste triée, par interpolation linéaire entre les deux rangs voisins. */
function quantile(tries: readonly number[], q: number): number {
  const h = (tries.length - 1) * q;
  const bas = Math.floor(h);
  const a = tries[bas] ?? 0;
  const b = tries[Math.min(tries.length - 1, bas + 1)] ?? a;
  return a + (h - bas) * (b - a);
}

/** Nombre, moyenne et quantiles d'une liste de valeurs. `null` : liste vide, pas de données (ce n'est pas zéro). */
export function resume(valeurs: readonly number[]): Resume | null {
  if (valeurs.length === 0) return null;
  const tries = [...valeurs].sort((a, b) => a - b);
  return {
    nombre: tries.length,
    moyenne: tries.reduce((n, v) => n + v, 0) / tries.length,
    p10: quantile(tries, 0.1),
    p25: quantile(tries, 0.25),
    mediane: quantile(tries, 0.5),
    p75: quantile(tries, 0.75),
    p90: quantile(tries, 0.9),
    max: tries[tries.length - 1] ?? 0,
  };
}

/** `essais` ouvertures jusqu'au but, toutes tirées d'une même graine : le résultat ne change pas d'un lancement à l'autre. */
export function simulerPochettes(p: { but: But; chances: ParRarete; catalogue: Catalogue; essais: number; graine: number }): {
  pochettes: Resume;
  doubles: Resume;
} {
  const hasard = hasardAGraine(p.graine);
  const ouvertures = Array.from({ length: Math.max(1, p.essais) }, () => ouvrirJusqua(p.but, p.chances, p.catalogue, hasard));
  return {
    pochettes: resume(ouvertures.map((o) => o.pochettes)) as Resume,
    doubles: resume(ouvertures.map((o) => o.doubles)) as Resume,
  };
}

export interface Collection {
  pochettes: number;
  doubles: number;
  achats: number;
  depense: number;
}

/**
 * Le collectionneur avisé, parti de rien : il ouvre des pochettes tant qu'une pochette lui rapporte en moyenne plus d'objets
 * neufs, au prix de la boutique, qu'elle ne coûte (`valeurNeuvePochette` au-dessus de `prixPochette`), puis achète tout le
 * reste à la boutique. Ses doubles ne comptent pour rien. Rend sa dépense pour tout le catalogue.
 */
export function collectionMixte(p: { chances: ParRarete; prix: ParRarete; prixPochette: number; catalogue: Catalogue; hasard: () => number }): Collection {
  const rangs = objetsParRarete(p.catalogue);
  const possedes = new Set<string>();
  let pochettes = 0;
  let doubles = 0;
  while (valeurNeuvePochette(p.chances, p.prix, p.catalogue, possedes) > p.prixPochette) {
    const o = tirerPochette(p.chances, rangs, p.hasard);
    pochettes++;
    if (possedes.has(o.cle)) doubles++;
    else possedes.add(o.cle);
  }
  const reste = objetsPayants(p.catalogue).filter((o) => !possedes.has(o.cle));
  return {
    pochettes,
    doubles,
    achats: reste.length,
    depense: pochettes * p.prixPochette + reste.reduce((n, o) => n + p.prix[o.rarete], 0),
  };
}

/** `essais` collections mixtes tirées d'une même graine. */
export function simulerCollectionMixte(p: {
  chances: ParRarete;
  prix: ParRarete;
  prixPochette: number;
  catalogue: Catalogue;
  essais: number;
  graine: number;
}): { pochettes: Resume; doubles: Resume; depense: Resume } {
  const hasard = hasardAGraine(p.graine);
  const collections = Array.from({ length: Math.max(1, p.essais) }, () => collectionMixte({ ...p, hasard }));
  return {
    pochettes: resume(collections.map((c) => c.pochettes)) as Resume,
    doubles: resume(collections.map((c) => c.doubles)) as Resume,
    depense: resume(collections.map((c) => c.depense)) as Resume,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Les réglages
// ---------------------------------------------------------------------------------------------------------------------

export interface Reglages {
  prix: ParRarete;
  prixPochette: number;
  chances: ParRarete;
  catalogue: Catalogue;
}

const entierPositif = (n: number): boolean => Number.isInteger(n) && n > 0;

/**
 * Les réglages absurdes, en phrases ; une liste vide si tout tient debout : chances entières, positives ou nulles, qui font
 * 100 ; une rareté qui a une chance a des objets payants ; prix entiers positifs, chaque rareté plus chère que celle d'en
 * dessous ; pochette au prix entier positif, pas plus chère que ce qu'elle vaut en moyenne.
 */
export function controlerReglages(r: Reglages): string[] {
  const problemes: string[] = [];
  const rangs = objetsParRarete(r.catalogue);
  for (const rarete of ORDRE_RARETES) {
    const c = r.chances[rarete];
    if (!Number.isInteger(c) || c < 0) problemes.push(`Chance de la rareté ${rarete} : ${c}, pas un entier positif ou nul.`);
    if (c > 0 && rangs[rarete].length === 0) problemes.push(`La rareté ${rarete} a une chance mais aucun objet payant.`);
    if (!entierPositif(r.prix[rarete])) problemes.push(`Prix de la rareté ${rarete} : ${r.prix[rarete]}, pas un entier positif.`);
  }
  const somme = sommeDesChances(r.chances);
  if (somme !== 100) problemes.push(`Les chances de la pochette font ${somme}, pas 100.`);
  ORDRE_RARETES.forEach((rarete, i) => {
    const dessous = ORDRE_RARETES[i - 1];
    if (dessous && !(r.prix[rarete] > r.prix[dessous])) {
      problemes.push(`Un objet ${rarete} (${r.prix[rarete]}) ne coûte pas plus qu'un objet ${dessous} (${r.prix[dessous]}).`);
    }
  });
  if (!entierPositif(r.prixPochette)) problemes.push(`Prix de la pochette : ${r.prixPochette}, pas un entier positif.`);
  const valeur = valeurMoyennePochette(r.chances, r.prix);
  if (r.prixPochette > valeur) problemes.push(`La pochette (${r.prixPochette}) coûte plus que ce qu'elle vaut en moyenne (${valeur}).`);
  return problemes;
}

// ---------------------------------------------------------------------------------------------------------------------
// Les revenus
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Ce que la mesure lit d'une victoire du clan qui rapporte des points (`StoredSession`). L'appelant choisit lesquelles :
 * celles que relit le serveur (`victoiresARelire` de `stateres-releve.ts`), pour ne pas écrire la règle deux fois.
 */
export interface VictoireDuClan {
  gameId: string;
  gameStart: string;
  clanPlayerCount: number;
  score: number;
}

/** Les tailles de partie mesurées : seul, à deux, à trois, à quatre et plus. */
export const TAILLES = ["1", "2", "3", "4+"] as const;
export type Taille = (typeof TAILLES)[number];
export const tailleDePartie = (gaulois: number): Taille => (gaulois >= 4 ? "4+" : gaulois === 3 ? "3" : gaulois === 2 ? "2" : "1");

/** Le mois d'un instant, à Paris : « AAAA-MM ». */
export const moisParis = (iso: string): string => parisParts(iso).date.slice(0, 7);

export interface Distribution {
  victoires: number;
  points: number;
  /** La somme de ce que reçoit UN Gaulois présent, victoire par victoire. */
  parGaulois: number;
  /** Ce que la règle distribue en tout : ce que reçoit un Gaulois, fois le nombre de Gaulois présents. */
  distribues: number;
}

const distributionVide = (): Distribution => ({ victoires: 0, points: 0, parGaulois: 0, distribues: 0 });

function ajouter(d: Distribution, v: VictoireDuClan): void {
  const chacun = stateresDeVictoire(v.score, v.clanPlayerCount);
  d.victoires++;
  d.points += v.score;
  d.parGaulois += chacun;
  d.distribues += chacun * v.clanPlayerCount;
}

const moisSuivant = (mois: string): string => {
  const [a, m] = mois.split("-").map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};
const dernierJour = (mois: string): string => new Date(Date.parse(`${moisSuivant(mois)}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const joursEntre = (de: string, a: string): number => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;

/** Les mois de `debut` à `fin` (jours « AAAA-MM-JJ »), et pour chacun les jours qu'en couvre la période. */
export function moisDeLaPeriode(debut: string, fin: string): { mois: string; jours: number; complet: boolean }[] {
  const liste: { mois: string; jours: number; complet: boolean }[] = [];
  for (let mois = debut.slice(0, 7); mois <= fin.slice(0, 7); mois = moisSuivant(mois)) {
    const premier = `${mois}-01`;
    const de = premier > debut ? premier : debut;
    const a = dernierJour(mois) < fin ? dernierJour(mois) : fin;
    liste.push({ mois, jours: joursEntre(de, a), complet: de === premier && a === dernierJour(mois) });
  }
  return liste;
}

export interface RevenusDuClan {
  parTaille: Record<Taille, Distribution>;
  parMois: { mois: string; jours: number; complet: boolean; distribution: Distribution }[];
  total: Distribution & { jours: number };
}

/**
 * Ce que la règle « entiers à chacun » distribue, par taille de partie, par mois et en tout, si chaque Gaulois présent
 * avait un compte validé et son Gaulois : un plafond, pas ce que le serveur a crédité. `debut` et `fin` : les jours, à
 * Paris, que couvrent les données lues (une période sans victoire y compte pour zéro, une période hors des données non).
 */
export function revenusDuClan(victoires: readonly VictoireDuClan[], debut: string, fin: string): RevenusDuClan {
  const parTaille = Object.fromEntries(TAILLES.map((t) => [t, distributionVide()])) as Record<Taille, Distribution>;
  const periode = moisDeLaPeriode(debut, fin);
  const parMois = new Map(periode.map((m) => [m.mois, distributionVide()]));
  const total = distributionVide();
  for (const v of victoires) {
    const jour = parisParts(v.gameStart).date;
    if (jour < debut || jour > fin) continue;
    ajouter(parTaille[tailleDePartie(v.clanPlayerCount)], v);
    const d = parMois.get(jour.slice(0, 7));
    if (d) ajouter(d, v);
    ajouter(total, v);
  }
  return {
    parTaille,
    parMois: periode.map((m) => ({ ...m, distribution: parMois.get(m.mois) ?? distributionVide() })),
    total: { ...total, jours: joursEntre(debut, fin) },
  };
}

/** Une ligne de la liste des parties d'un membre (`StoredMemberResult.games`) : [partie, début, 1 victoire ou 0 défaite]. */
export type PartieDuMembre = readonly [string, string, 0 | 1];

/** Un joueur pendant une période (un mois, par défaut), sans rien qui dise qui il est. */
export interface MoisDeJoueur {
  periode: string;
  /** Ses parties sous le tag pendant la période, victoires et défaites. */
  parties: number;
  /** Les victoires de sa liste. */
  victoires: number;
  /** Ses parties qui ont rapporté des points au clan : celles qui donnent des statères. */
  creditees: number;
  /** Ses victoires absentes des sessions du clan : leurs points ne se connaissent pas, elles ne comptent pas. */
  introuvables: number;
  stateres: number;
}

/**
 * Ce que chaque joueur aurait reçu, période par période, d'après sa liste de parties croisée avec les victoires du clan
 * par partie : une partie qui a rapporté des points au clan donne ses statères à chaque Gaulois présent, quel que soit le résultat noté dans sa
 * liste, comme le fait le serveur. `listes` : une liste de parties par joueur, sans son identifiant ; `connues` : toutes
 * les parties des sessions du clan, victoires ou non ; `regrouper` : la période d'un début de partie (le mois à Paris par
 * défaut), `null` hors de la mesure. Rend une ligne par joueur et par période où il a joué, dans le désordre des joueurs.
 */
export function revenusParJoueur(
  listes: Iterable<readonly PartieDuMembre[]>,
  victoires: ReadonlyMap<string, VictoireDuClan>,
  connues: ReadonlySet<string>,
  regrouper: (debut: string) => string | null = moisParis,
): MoisDeJoueur[] {
  const lignes: MoisDeJoueur[] = [];
  for (const parties of listes) {
    const parPeriode = new Map<string, MoisDeJoueur>();
    const vues = new Set<string>();
    for (const [partie, debut, resultat] of parties) {
      if (vues.has(partie)) continue;
      vues.add(partie);
      const periode = regrouper(debut);
      if (periode === null) continue;
      let l = parPeriode.get(periode);
      if (!l) parPeriode.set(periode, (l = { periode, parties: 0, victoires: 0, creditees: 0, introuvables: 0, stateres: 0 }));
      l.parties++;
      if (resultat === 1) l.victoires++;
      const v = victoires.get(partie);
      if (v) {
        l.creditees++;
        l.stateres += stateresDeVictoire(v.score, v.clanPlayerCount);
      } else if (resultat === 1 && !connues.has(partie)) l.introuvables++;
    }
    lignes.push(...parPeriode.values());
  }
  return lignes;
}

/**
 * Les profils de joueur d'un ensemble de lignes : statères de la période pour qui a joué, pour qui en a reçu au moins une
 * fois, et pour qui a joué au moins tant de parties dans la période.
 */
export function profilsDeJoueurs(lignes: readonly MoisDeJoueur[], seuils: readonly number[] = [10, 30]): {
  nom: string;
  resume: Resume | null;
}[] {
  return [
    { nom: "a joué au moins une partie", resume: resume(lignes.map((l) => l.stateres)) },
    { nom: "a reçu des statères au moins une fois", resume: resume(lignes.filter((l) => l.stateres > 0).map((l) => l.stateres)) },
    ...seuils.map((s) => ({ nom: `au moins ${s} parties`, resume: resume(lignes.filter((l) => l.parties >= s).map((l) => l.stateres)) })),
  ];
}
