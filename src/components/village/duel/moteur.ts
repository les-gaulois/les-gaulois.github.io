/**
 * Ce que l'écran du duel attend du moteur partagé (`supabase/functions/code-discord/duel/`, session « Duel : moteur et
 * serveur ») : ses règles, son catalogue, ses mots-clés, ses panoplies, ses lieux et ses compagnons, et la machine. L'écran
 * ne recalcule rien : il demande au moteur ce que fait une manche et le montre. Le serveur rejoue chaque manche qui compte.
 *
 * Ici aussi, ce que l'écran tire du moteur pour dessiner une carte (`dessinDeLaCarte`) et l'écrire en phrases (`ficheDe`).
 */
import { vignetteDeLObjet } from "../../../lib/gaulois";
import { Planche } from "../../../lib/jeu/planche";
import { enCapitales } from "../../../lib/jeu/ecriture";
import { NOMS_DES_EMPLACEMENTS, NOMS_DES_RANGS, nomDeLObjet, type Catalogue, type EmplacementDeLaMain, type RangDeCarte, type Role } from "../../../lib/village/ecran-duel";
import type { CarteDessinee, EtatDeCarte } from "./dessins-des-cartes";

/** Une carte, telle que les règles la font d'un objet : rôle, prix, force, repos, mots-clés. */
export interface CarteDuMoteur {
  id: string;
  e: EmplacementDeLaMain;
  r: RangDeCarte;
  role: Role;
  /** Le prix, en énergie et en points de bourse. */
  c: number;
  /** La force imprimée. */
  f: number;
  mots: Readonly<Record<string, number>>;
  liste: readonly (readonly [string] | readonly [string, number])[];
  unique: string | null;
  panoplie: string | null;
  repos: number;
}

export interface CampDuMoteur {
  vie: number;
  vieMax: number;
  energie: number;
  plafond: number;
  elan: number;
  souffles: number;
  saignes: readonly { n: number; t: number }[];
  main: readonly CarteDuMoteur[];
  repos: readonly number[];
  at: Readonly<Record<string, number | undefined>>;
}

/** Un effet qui se voit jouer : un mot-clé, son chiffre, ce qu'il fait à la vie ou à l'énergie, et sur quel camp. */
export interface EvenementDuMoteur {
  mot: string;
  n?: number;
  vie?: number;
  energie?: number;
  sur?: "a" | "b";
}

/** Ce qu'a fait la carte d'un camp pendant la manche. */
export interface FaitDuMoteur {
  i: number;
  carte: CarteDuMoteur;
  qui: "a" | "b";
  role: Role;
  essouffle: boolean;
  force: number;
  paye: number;
  degats: number;
  pare: number;
  renvoi: number;
  subis: number;
  recul: number;
  soin: number;
  elan: number;
  coupe: boolean;
  evts: readonly EvenementDuMoteur[];
  enchaine?: number;
  saignement?: number;
}

export interface MancheDuMoteur {
  a: CampDuMoteur;
  b: CampDuMoteur;
  fa: FaitDuMoteur;
  fb: FaitDuMoteur;
  fatigue: { a: number; b: number };
  fini: boolean;
}

/** Ce qui accompagne un camp : son compagnon (la famille de son familier), le lieu du duel, et des atouts de plus (un boss). */
export interface OptionsDUnCamp {
  compagnon?: string | null;
  lieu?: string | null;
  passifs?: readonly Readonly<Record<string, number>>[];
}

export interface DefinitionDUnMot {
  nom: string;
  phrase: string;
  unique?: boolean;
  coup?: boolean;
}

export interface MoteurDuDuel {
  P: {
    BOURSE: number;
    VIE_DE_BASE: number;
    VIE_PAR_POINT: number;
    POINTS_POUR_UNE_VIE: number;
    FORCE_ESSOUFFLEE: number;
    ENERGIE_PAR_MANCHE: number;
    ENERGIE_PLAFOND: number;
    FATIGUE_DES: number;
    RECUL_DE_TETE: number;
    USURE_DU_SOUFFLE: number;
  };
  catalogue: Catalogue;
  mots: Readonly<Record<string, DefinitionDUnMot>>;
  panoplies: Readonly<Record<string, { nom: string; pieces: number; phrase: string }>>;
  lieux: Readonly<Record<string, { phrase: string }>>;
  compagnons: Readonly<Record<string, { phrase: string }>>;
  carte(id: string): CarteDuMoteur;
  prix(id: string): number;
  camp(main: readonly CarteDuMoteur[], opts?: OptionsDUnCamp): CampDuMoteur;
  manche(a: CampDuMoteur, b: CampDuMoteur, ia: number, ib: number, m: number): MancheDuMoteur;
  /** 1 : a gagne ; -1 : b gagne ; 0 : égalité. */
  verdict(a: CampDuMoteur, b: CampDuMoteur): number;
  forceJouee(c: CampDuMoteur, carte: CarteDuMoteur, lui?: CampDuMoteur): number;
  estCoup(role: Role): boolean;
  /**
   * Les cartes qu'un camp peut poser : celles qui ne se reposent pas, ou, quand toutes se reposent, celles qui reviennent le
   * plus tôt. Le serveur refuse selon la même règle.
   */
  libres(c: CampDuMoteur): number[];
  fatigueDe(m: number, c?: CampDuMoteur): number;
  prixDeLaMain(main: readonly CarteDuMoteur[]): number;
  panopliesDe(main: readonly CarteDuMoteur[]): string[];
  vieDeLaMain(main: readonly CarteDuMoteur[], opts?: OptionsDUnCamp): number;
}

/* ---------- Ce que l'écran tire du moteur ---------- */

const VIGNETTES = new Map<string, Planche | null>();
/** Le dessin d'un objet seul, rogné à son contour, en planche. */
export function dessinDeLObjet(e: EmplacementDeLaMain, id: string): Planche | null {
  const cle = `${e}|${id}`;
  if (VIGNETTES.has(cle)) return VIGNETTES.get(cle) ?? null;
  const v = vignetteDeLObjet(e, id);
  let p: Planche | null = null;
  if (v) {
    p = new Planche(v.largeur, v.hauteur);
    v.cases.forEach((coul, i) => {
      if (!coul || !p) return;
      p.fillStyle = coul;
      p.fillRect(i % v.largeur, Math.floor(i / v.largeur), 1, 1);
    });
  }
  VIGNETTES.set(cle, p);
  return p;
}

/** L'effet d'une carte en très peu de mots : le nom de son effet unique, ou son premier mot-clé et son chiffre. */
export function effetCourt(m: MoteurDuDuel, carte: CarteDuMoteur): string {
  if (carte.unique) return enCapitales(carte.unique);
  const premier = carte.liste[0];
  if (!premier) return "";
  const def = m.mots[premier[0]];
  return def ? enCapitales(def.nom) + (premier[1] ? ` ${premier[1]}` : "") : "";
}

/** Ce qu'une carte montre, pour ses dessins. */
export function dessinDeLaCarte(m: MoteurDuDuel, carte: CarteDuMoteur): CarteDessinee {
  return {
    role: carte.role,
    c: carte.c,
    f: carte.f,
    mots: carte.liste.map(([mot, n]) => ({ mot, n: n ?? 1, unique: !!m.mots[mot]?.unique })),
    unique: carte.unique,
    r: carte.r,
    nom: nomDeLObjet(carte.e, carte.id),
    dessin: dessinDeLObjet(carte.e, carte.id),
    effetCourt: effetCourt(m, carte),
  };
}

const VERBES: Readonly<Record<Role, string>> = { frappe: "frappe", tete: "cogne", garde: "garde", elan: "prend de l'élan", souffle: "souffle" };

/** Ce que fait le rôle d'une carte, à sa force du moment, en une phrase. */
export function quoiDuRole(m: MoteurDuDuel, role: Role, f: number): string {
  return {
    frappe: `${f} dégâts.`,
    tete: `${f} dégâts, coupe l'élan ou le souffle d'en face, te coûte ${m.P.RECUL_DE_TETE} de vie.`,
    garde: `Arrête ${f} dégâts et les renvoie.`,
    elan: `${f} de plus à ton coup de la manche suivante.`,
    souffle: `Rend ${f} de vie.`,
  }[role];
}

/** Le nom d'un emplacement en phrase : « Arme », « Tête ». */
export const nomDEmplacement = (e: EmplacementDeLaMain): string => NOMS_DES_EMPLACEMENTS[e].charAt(0) + NOMS_DES_EMPLACEMENTS[e].slice(1).toLowerCase();

/** Une ligne de la fiche : une icône (son adresse d'image), un mot en gras, une phrase. */
export interface LigneDeFiche {
  icone: { role: Role } | { mot: string; unique: boolean } | null;
  gras: string;
  texte: string;
  ton?: "unique" | "alerte" | "panoplie";
}
export interface Fiche {
  nom: string;
  sous: string;
  lignes: LigneDeFiche[];
}

/**
 * La fiche d'une carte : ce qu'elle fait, mot-clé par mot-clé, en phrases simples. `main` : la main où elle est, pour
 * compter les pièces de sa panoplie.
 */
export function ficheDe(m: MoteurDuDuel, carte: CarteDuMoteur, etat: EtatDeCarte = {}, main: readonly CarteDuMoteur[] | null = null): Fiche {
  const f = etat.force ?? carte.f;
  const lignes: LigneDeFiche[] = [{ icone: { role: carte.role }, gras: `${nomDEmplacement(carte.e)} : ${VERBES[carte.role]}.`, texte: quoiDuRole(m, carte.role, f) }];
  if (carte.unique) lignes.push({ icone: null, gras: "Effet unique", texte: `« ${carte.unique} »`, ton: "unique" });
  for (const [mot, n] of carte.liste) {
    const def = m.mots[mot];
    if (!def) continue;
    lignes.push({ icone: { mot, unique: !!def.unique }, gras: `${def.nom}${n ? ` ${n}` : ""}.`, texte: def.phrase.replace("{n}", String(n ?? 1)) });
  }
  if (etat.essouffle) lignes.push({ icone: null, gras: "Pas assez d'énergie", texte: `: force ${m.P.FORCE_ESSOUFFLEE}, sans ses mots-clés.`, ton: "alerte" });
  if (etat.repos) lignes.push({ icone: null, gras: "Au repos", texte: `: revient dans ${etat.repos} manche${etat.repos > 1 ? "s" : ""}.`, ton: "alerte" });
  if (carte.panoplie) {
    const p = m.panoplies[carte.panoplie];
    if (p) {
      const n = main ? main.filter((c) => c.panoplie === carte.panoplie).length : 0;
      lignes.push({ icone: null, gras: `Panoplie « ${p.nom} »`, texte: `${main ? ` (${Math.min(n, p.pieces)} sur ${p.pieces})` : ` : ${p.pieces} pièces`}. ${p.phrase}`, ton: "panoplie" });
    }
  }
  return { nom: nomDeLObjet(carte.e, carte.id), sous: `${NOMS_DES_RANGS[carte.r]} · prix ${carte.c}`, lignes };
}

/** La phrase d'une carte de la main, en capitales du kit, pour la ligne d'aide sous la main. */
export function phraseDeLaCarte(m: MoteurDuDuel, carte: CarteDuMoteur, etat: EtatDeCarte): string {
  const f = etat.force ?? carte.f;
  if (etat.repos) return `AU REPOS : REVIENT DANS ${etat.repos} MANCHE${etat.repos > 1 ? "S" : ""}`;
  return (
    (etat.essouffle ? "ESSOUFFLÉE, PAS ASSEZ D'ÉNERGIE. " : "") +
    {
      frappe: `FRAPPE : ${f} DÉGÂTS`,
      tete: `COUP DE TÊTE : ${f} DÉGÂTS, COUPE L'ÉLAN ET LE SOUFFLE, TE COÛTE ${m.P.RECUL_DE_TETE} DE VIE`,
      garde: `GARDE : ARRÊTE ${f} DÉGÂTS ET LES RENVOIE`,
      elan: `ÉLAN : ${f} DE PLUS À TON COUP DE LA MANCHE SUIVANTE`,
      souffle: `SOUFFLE : REND ${f} DE VIE, PUIS S'USE DE ${m.P.USURE_DU_SOUFFLE}`,
    }[carte.role]
  );
}
