/**
 * Le boss du jour et les défis d'entraînement du duel, sans leurs écrans (`BossEtDefis.tsx`) : ce que l'écran tire du
 * contenu (`supabase/functions/code-discord/duel/contenu/`, session « Duel : boss, défis et niveaux ») et la partie contre le
 * boss jouée au serveur. Rien n'y décide d'une règle : le moteur et le serveur font foi.
 */
import * as C from "../../../../supabase/functions/code-discord/duel/contenu/index";
import { ServerError, duel } from "../../../lib/compte/api";
import { CLE_MODELE, TENUE_DE_DEPART, changerObjet, type Tenue } from "../../../lib/gaulois";
import { EMPLACEMENTS_DE_LA_MAIN } from "../../../lib/village/ecran-duel";
import type { MainDuDuel } from "../../../lib/village/contrat-duel";
import { choisirAuNiveau, type Niveau } from "./moteur-du-site";
import type { CampDuMoteur } from "./moteur";
import type { FinDuDuel } from "./SceneDuDuel";

/** Un boss, tel que le contenu le décrit. */
export type Boss = C.BossDuJour;
/** Le boss de cet identifiant (celui d'une partie à reprendre), ou celui du jour. */
export const bossDAujourdHui = (id: string | null = null, maintenant = new Date()): Boss => C.bossParId(id) ?? C.bossDuJour(maintenant);

/** La tenue du boss : le corps de son Gaulois unique, habillé des objets de sa main. */
export function tenueDuBoss(boss: Boss): Tenue {
  return boss.main.reduce<Tenue>((t, id, i) => changerObjet(t, EMPLACEMENTS_DE_LA_MAIN[i]!, id), { ...TENUE_DE_DEPART, [CLE_MODELE]: boss.id });
}

/** Les options du camp du boss : son lieu et son pouvoir (le joueur prend le même lieu). */
export const optionsDuBossDuJour = (boss: Boss): { lieu: string; passifs: readonly Readonly<Record<string, number>>[] } =>
  C.optionsDuBoss(boss) as { lieu: string; passifs: readonly Readonly<Record<string, number>>[] };

/** Le niveau de la machine qui joue les boss. */
export const NIVEAU_DES_BOSS: Niveau = C.NIVEAU_DES_BOSS;

/** La machine du navigateur au niveau des boss (l'essai, tant que le serveur n'a pas le duel). */
export const choisirLeBoss = (b: CampDuMoteur, a: CampDuMoteur, m: number): number => choisirAuNiveau(b, a, m, NIVEAU_DES_BOSS);

/**
 * Une partie contre le boss jouée au serveur : la première manche la commence (`commencer_duel`, avec la main), chaque
 * manche envoie la carte posée et reçoit celle de la machine (`jouer_manche_duel`). `enCours` : le numéro d'une partie
 * que le serveur garde ouverte, à poursuivre. Le serveur fait foi : l'écran rejoue la manche avec le moteur pour la montrer.
 * Une partie que le serveur a close entre-temps (24 heures sans manche) rend le refus `partie_finie`.
 */
export function partieContreLeBoss(main: () => readonly string[], enCours: number | null = null): { jouer: (ia: number, m: number) => Promise<number>; pas: () => number | null } {
  let partie: number | null = enCours;
  let pas: number | null = null;
  const jouer = async (ia: number, m: number): Promise<number> => {
    if (partie === null) {
      const mienne = Object.fromEntries(EMPLACEMENTS_DE_LA_MAIN.map((e, i) => [e, main()[i] ?? ""])) as unknown as MainDuDuel;
      partie = (await duel.commencer("boss", null, mienne)).partie.partie;
    }
    const r = await duel.jouerManche(partie, m, ia);
    if (typeof r.carte_machine !== "number") throw new ServerError("partie_finie");
    if (r.partie.recompense) pas = r.partie.recompense.pas;
    return r.carte_machine;
  };
  return { jouer, pas: () => pas };
}

/**
 * Le mot de la fin contre le boss : sa réplique, puis ce que le serveur a donné (des pas du pass, jamais de statères) ;
 * sans le serveur, l'essai ne donne rien.
 */
export const motDeFinDuBoss =
  (boss: Boss, auServeur: boolean, pas: () => number | null) =>
  (f: FinDuDuel): string => {
    const replique = f.verdict > 0 ? boss.repliques.vaincu : f.verdict < 0 ? boss.repliques.vainqueur : "Égalité.";
    if (!auServeur) return `${replique} Essai : rien n'est gagné ni perdu.`;
    const n = pas();
    return n ? `${replique} Duel compté : ${n} pas du pass.` : replique;
  };

/* ---------- Les défis ---------- */

export type Defi = C.Defi;
export const DEFIS: readonly Defi[] = C.DEFIS;

/** La clé des défis réussis, gardés sur l'appareil (les défis ne passent pas par le serveur). */
export const CLE_DES_DEFIS = "gal-duel-defis";

/**
 * Les options de la scène pour un défi : son départ, son adversaire, son issue. Un adversaire qui annonce joue la carte
 * annoncée à chaque manche (la première manche du défi est la manche `d.manche`) ; un adversaire « libre » est la machine.
 */
export function sceneDuDefi(d: Defi): {
  depart: () => { a: CampDuMoteur; b: CampDuMoteur; m: number };
  annonce: boolean;
  issue: (a: CampDuMoteur, b: CampDuMoteur, fini: boolean, jouees: number) => "en-cours" | "reussi" | "rate";
  choisir: (b: CampDuMoteur, a: CampDuMoteur, m: number) => number;
} {
  const annonce = d.adversaire !== "libre";
  return {
    depart: () => C.departDuDefi(d) as unknown as { a: CampDuMoteur; b: CampDuMoteur; m: number },
    annonce,
    issue: (a, b, fini, jouees) => C.issueDuDefi(d, a, b, fini, jouees),
    choisir: (b, a, m) => (annonce ? C.coupAnnonce(d, b as unknown as Parameters<typeof C.coupAnnonce>[1], m - d.manche) : choisirAuNiveau(b, a, m, "guerrier")),
  };
}
