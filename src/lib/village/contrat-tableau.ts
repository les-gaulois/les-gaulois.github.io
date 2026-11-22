/**
 * Le contrat entre l'écran du tableau des duellistes (`src/components/village/duel-tableau/`) et le serveur
 * (`public.get_tableau_duel`, `public.get_mes_insignes_duel`, migration 20261122002000_duel_tableau_et_saison) : la forme
 * des réponses, lue sans confiance. Une réponse mal formée rend `null` : l'écran le dit et ne montre rien d'inventé.
 * Les noms sont ceux du village ; jamais un solde (la cagnotte est un total, à personne).
 */
import { lireTenue, type Tenue } from "../gaulois";
import { familierDe, type Familier } from "./familiers";
import { REGLES_DU_TABLEAU } from "./tableau-duel";

/** Un Gaulois du tableau : son nom du village et ce qu'il montre. `nom` null : un compte qui n'est plus là. */
export interface GauloisDuTableau {
  nom: string | null;
  tenue: Tenue | null;
  banniere: string | null;
  familier: Familier | null;
}

/** Une ligne d'un tableau : la note arrondie (50 : autant que prévu), les duels retenus, les semaines gagnées. */
export interface LigneDuTableau extends GauloisDuTableau {
  rang: number;
  note: number;
  duels: number;
  victoires: number;
  egalites: number;
  insignes: number;
  moi: boolean;
}

/** La place de l'appelant : son rang (null s'il n'est pas encore classé), sa note, ce qu'il lui manque de duels. */
export interface MaPlace {
  /** Son Gaulois, pour sa ligne quand il est classé après les vingt premiers ; null sans nom. */
  gaulois: GauloisDuTableau | null;
  rang: number | null;
  note: number | null;
  duels: number;
  victoires: number;
  egalites: number;
  manque: number;
}

export interface TableauLu {
  classes: number;
  /** Les duels retenus qu'il faut pour être classé. */
  minimum: number;
  /** Les vingt premiers. */
  lignes: LigneDuTableau[];
  moi: MaPlace | null;
}

export interface SemaineDuTableau extends TableauLu {
  /** Le mardi où elle finit (« AAAA-MM-JJ ») ; ses bornes, des instants. */
  semaine: string;
  debut: string;
  fin: string;
}

export interface PartDeLaSaison {
  place: 1 | 2 | 3;
  pourCent: number;
  montant: number;
}

export interface SaisonDuTableau extends TableauLu {
  saison: string;
  nom: string;
  /** Ses premier et dernier jours (« AAAA-MM-JJ »). */
  debut: string;
  fin: string;
  commencee: boolean;
  finie: boolean;
  /** L'heure du partage de sa cagnotte. */
  partageLe: string;
  cagnotte: number;
  parts: PartDeLaSaison[];
}

export interface PlaceDuPartage {
  place: 1 | 2 | 3;
  stateres: number;
  moi: boolean;
  /** null : un compte qui n'est plus validé, ou effacé. */
  gaulois: GauloisDuTableau | null;
}

export interface PartagePrecedent {
  saison: string;
  nom: string;
  partageeLe: string;
  cagnotte: number;
  reste: number;
  places: PlaceDuPartage[];
}

export interface PremierDAvant extends GauloisDuTableau {
  note: number;
  duels: number;
  insignes: number;
  moi: boolean;
}

export interface EtatDuTableau {
  maintenant: string;
  semaine: SemaineDuTableau;
  /** La dernière semaine couronnée, et son premier (null : personne de classé). */
  precedente: { semaine: string; fin: string; classes: number; premier: PremierDAvant | null } | null;
  /** La saison en jeu : la plus ancienne commencée et pas encore partagée, sinon la prochaine ; null sans saison prévue. */
  saison: SaisonDuTableau | null;
  /** Sans saison prévue, les parts des salles attendent ici. */
  aVenir: number;
  partagePrecedent: PartagePrecedent | null;
  /** Les semaines gagnées par l'appelant, la plus récente d'abord. */
  mesInsignes: { semaine: string; note: number }[];
  regles: { minimumSemaine: number; minimumSaison: number; parAdversaire: number; parts: number[] };
}

/** Les refus propres au tableau (les autres sont ceux du duel et du village). */
export const REFUS_DU_TABLEAU = { duel_ferme: "Le duel est fermé pour l'instant." } as const;

type Brut = Record<string, unknown>;
const objet = (x: unknown): Brut | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Brut) : null);
const entier = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) ? x : null);
const positif = (x: unknown): number | null => {
  const n = entier(x);
  return n !== null && n >= 0 ? n : null;
};
const texte = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);
const jour = (x: unknown): string | null => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
const instant = (x: unknown): string | null => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null);
const place = (x: unknown): 1 | 2 | 3 | null => (x === 1 || x === 2 || x === 3 ? x : null);

/** Le Gaulois d'une ligne : son nom (ou null), sa tenue lisible (ou null), sa bannière, son familier. */
export function lireGauloisDuTableau(x: unknown): GauloisDuTableau {
  const o = objet(x) ?? {};
  return {
    nom: texte(o.nom),
    tenue: lireTenue(o.tenue),
    banniere: typeof o.banniere === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.banniere) ? o.banniere : null,
    familier: familierDe(o.familier),
  };
}

function lireLigne(x: unknown): LigneDuTableau | null {
  const o = objet(x);
  if (!o) return null;
  const rang = positif(o.rang), note = entier(o.note), duels = positif(o.duels), victoires = positif(o.victoires), egalites = positif(o.egalites);
  if (!rang || note === null || duels === null || victoires === null || egalites === null) return null;
  return { ...lireGauloisDuTableau(o), rang, note, duels, victoires, egalites, insignes: positif(o.insignes) ?? 0, moi: o.moi === true };
}

function lireMaPlace(x: unknown): MaPlace | null {
  const o = objet(x);
  if (!o) return null;
  const duels = positif(o.duels), manque = positif(o.manque);
  if (duels === null || manque === null) return null;
  const g = lireGauloisDuTableau(o);
  return { gaulois: g.nom ? g : null, rang: positif(o.rang) || null, note: entier(o.note), duels, victoires: positif(o.victoires) ?? 0, egalites: positif(o.egalites) ?? 0, manque };
}

function lireTableauLu(o: Brut): TableauLu | null {
  const classes = positif(o.classes), minimum = positif(o.minimum);
  if (classes === null || minimum === null || !Array.isArray(o.lignes)) return null;
  const lignes = o.lignes.map(lireLigne);
  if (lignes.some((l) => l === null)) return null;
  return { classes, minimum, lignes: lignes as LigneDuTableau[], moi: lireMaPlace(o.moi) };
}

function lireSaison(x: unknown): SaisonDuTableau | null {
  const o = objet(x);
  if (!o) return null;
  const t = lireTableauLu(o);
  const saison = texte(o.saison), nom = texte(o.nom), debut = jour(o.debut), fin = jour(o.fin), partageLe = instant(o.partage_le), cagnotte = positif(o.cagnotte);
  if (!t || !saison || !nom || !debut || !fin || !partageLe || cagnotte === null || !Array.isArray(o.parts)) return null;
  const parts: PartDeLaSaison[] = [];
  for (const p of o.parts) {
    const q = objet(p), pl = place(q?.place), pc = positif(q?.pour_cent), m = positif(q?.montant);
    if (!pl || pc === null || m === null) return null;
    parts.push({ place: pl, pourCent: pc, montant: m });
  }
  return { ...t, saison, nom, debut, fin, commencee: o.commencee === true, finie: o.finie === true, partageLe, cagnotte, parts };
}

function lirePartage(x: unknown): PartagePrecedent | null {
  const o = objet(x);
  if (!o) return null;
  const saison = texte(o.saison), nom = texte(o.nom), partageeLe = instant(o.partagee_le), cagnotte = positif(o.cagnotte), reste = positif(o.reste);
  if (!saison || !nom || !partageeLe || cagnotte === null || reste === null || !Array.isArray(o.places)) return null;
  const places: PlaceDuPartage[] = [];
  for (const p of o.places) {
    const q = objet(p), pl = place(q?.place), s = positif(q?.stateres);
    if (!q || !pl || s === null) return null;
    const g = lireGauloisDuTableau(q);
    places.push({ place: pl, stateres: s, moi: q.moi === true, gaulois: g.nom ? g : null });
  }
  return { saison, nom, partageeLe, cagnotte, reste, places };
}

function lirePrecedente(x: unknown): EtatDuTableau["precedente"] | undefined {
  if (x === null) return null;
  const o = objet(x);
  if (!o) return undefined;
  const semaine = jour(o.semaine), fin = instant(o.fin), classes = positif(o.classes);
  if (!semaine || !fin || classes === null) return undefined;
  const p = objet(o.premier);
  let premier: PremierDAvant | null = null;
  if (p) {
    const note = entier(p.note), duels = positif(p.duels);
    if (note === null || duels === null) return undefined;
    premier = { ...lireGauloisDuTableau(p), note, duels, insignes: positif(p.insignes) ?? 0, moi: p.moi === true };
  }
  return { semaine, fin, classes, premier };
}

/** La réponse de `get_tableau_duel`, ou null si elle n'a pas la forme attendue. */
export function lireLeTableau(brut: unknown): EtatDuTableau | null {
  const o = objet(brut);
  if (!o || o.ok !== true) return null;
  const s = objet(o.semaine);
  const t = s ? lireTableauLu(s) : null;
  const semaine = jour(s?.semaine), debut = instant(s?.debut), fin = instant(s?.fin), maintenant = instant(o.maintenant);
  if (!s || !t || !semaine || !debut || !fin || !maintenant) return null;
  const precedente = lirePrecedente(o.precedente ?? null);
  if (precedente === undefined) return null;
  const saison = o.saison === null || o.saison === undefined ? null : lireSaison(o.saison);
  if (o.saison && !saison) return null;
  const partagePrecedent = o.partage_precedent === null || o.partage_precedent === undefined ? null : lirePartage(o.partage_precedent);
  if (o.partage_precedent && !partagePrecedent) return null;
  const r = objet(o.regles);
  const regles = {
    minimumSemaine: positif(r?.minimum_semaine) ?? t.minimum,
    minimumSaison: positif(r?.minimum_saison) ?? saison?.minimum ?? REGLES_DU_TABLEAU.minimumSaison,
    parAdversaire: positif(r?.par_adversaire) ?? REGLES_DU_TABLEAU.parAdversaireEtParSemaine,
    parts: Array.isArray(r?.parts) && r.parts.every((p) => positif(p) !== null) ? (r.parts as number[]) : [...REGLES_DU_TABLEAU.parts],
  };
  const mesInsignes = Array.isArray(o.mes_insignes)
    ? o.mes_insignes.flatMap((x) => {
        const q = objet(x), sem = jour(q?.semaine), note = entier(q?.note);
        return sem && note !== null ? [{ semaine: sem, note }] : [];
      })
    : [];
  return { maintenant, semaine: { ...t, semaine, debut, fin }, precedente, saison, aVenir: positif(o.a_venir) ?? 0, partagePrecedent, mesInsignes, regles };
}

/** La réponse de `get_mes_insignes_duel` : les semaines gagnées, la plus récente d'abord ; null si elle est mal formée. */
export function lireMesInsignes(brut: unknown): { semaine: string; note: number }[] | null {
  const o = objet(brut);
  if (!o || o.ok !== true || !Array.isArray(o.insignes)) return null;
  return o.insignes.flatMap((x) => {
    const q = objet(x), sem = jour(q?.semaine), note = entier(q?.note);
    return sem && note !== null ? [{ semaine: sem, note }] : [];
  });
}
