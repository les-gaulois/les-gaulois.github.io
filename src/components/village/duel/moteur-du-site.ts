/**
 * Le moteur partagé du duel (`supabase/functions/code-discord/duel/`, session « Duel : moteur et serveur »), tel que
 * l'écran s'en sert (`MoteurDuDuel` de `moteur.ts`). Rien n'est recalculé ici : ce ne sont que ses fonctions et ses
 * données, rangées sous les noms que l'écran attend.
 */
import * as D from "../../../../supabase/functions/code-discord/duel/index";
import type { Catalogue } from "../../../lib/village/ecran-duel";
import type { CampDuMoteur, CarteDuMoteur, MancheDuMoteur, MoteurDuDuel, OptionsDUnCamp } from "./moteur";

type CampD = D.Camp;
type CarteD = D.Carte;
const camps = (c: CampDuMoteur): CampD => c as unknown as CampD;
const cartes = (m: readonly CarteDuMoteur[]): CarteD[] => m as unknown as CarteD[];
const options = (o: OptionsDUnCamp | undefined): D.OptionsDuCamp => (o ?? {}) as D.OptionsDuCamp;

export const MOTEUR: MoteurDuDuel = {
  P: D.P,
  catalogue: D.CATALOGUE_DU_DUEL as unknown as Catalogue,
  mots: D.MOTS,
  panoplies: D.PANOPLIES,
  lieux: D.LIEUX,
  compagnons: D.COMPAGNONS,
  carte: (id) => D.carte(id) as unknown as CarteDuMoteur,
  prix: (id) => D.prix(D.CATALOGUE_DU_DUEL[id]?.r ?? "base"),
  camp: (main, o) => D.camp(cartes(main), options(o)) as unknown as CampDuMoteur,
  manche: (a, b, ia, ib, m) => D.manche(camps(a), camps(b), ia, ib, m) as unknown as MancheDuMoteur,
  verdict: (a, b) => D.verdict(camps(a), camps(b)),
  forceJouee: (c, carte, lui) => D.forceJouee(camps(c), carte as unknown as CarteD, lui ? camps(lui) : null),
  estCoup: D.estCoup,
  fatigueDe: (m, c) => D.fatigueDe(m, c ? camps(c) : null),
  prixDeLaMain: (main) => D.prixDeLaMain(cartes(main)),
  panopliesDe: (main) => D.panopliesDe(cartes(main)),
  vieDeLaMain: (main, o) => D.vieDeLaMain(cartes(main), options(o)),
};

/** Les trois niveaux de la machine, dans l'ordre. */
export const NIVEAUX = D.NIVEAUX_DE_LA_MACHINE;
export type Niveau = D.NiveauDeLaMachine;

/** Le choix de la machine du navigateur, à un niveau (le duel d'entraînement). */
export const choisirAuNiveau = (moi: CampDuMoteur, lui: CampDuMoteur, m: number, niveau: Niveau): number => D.choisirAuNiveau(camps(moi), camps(lui), m, niveau);

/** Un lieu connu du moteur (la famille d'une bannière) ; un compagnon connu (la famille d'un familier). */
export const estUnLieu = D.estUnLieu;
export const estUnCompagnon = D.estUnCompagnon;
