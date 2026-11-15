/**
 * Ce que partagent les tests de l'almanach des petits moments : des figurants d'essai (le contrat `Figurant`, dessinés d'un
 * aplat), et des moments valides tirés d'eux. Rien n'y vient des vrais dessins : les tests du moteur ne dépendent pas du
 * dessinateur.
 */
import type { Decor } from "../../src/lib/village/decor";
import type { Phase } from "../../src/lib/village/lumiere";
import type { Moment, MomentEcrit } from "../../src/lib/village/monde/almanach/moment";
import type { Allure, Figurant, Milieu } from "../../src/lib/village/monde/almanach/type";

export function figurantDEssai(id: string, milieu: Milieu, allure: Allure, largeur: number, hauteur: number, options: { quand?: Phase[]; images?: number } = {}): Figurant {
  const images = options.images ?? 2;
  return {
    id,
    nom: `un figurant d'essai ${id}`,
    description: "Un aplat de couleur, pour les essais du moteur.",
    milieu,
    allure,
    ...(options.quand ? { quand: options.quand } : {}),
    largeur,
    hauteur,
    images,
    dessiner: (_l, image): Decor => ({ largeur, hauteur, cases: new Array<string | null>(largeur * hauteur).fill(image % 2 === 0 ? "#336699" : "#996633") }),
  };
}

export const ESSAI_SOL = figurantDEssai("essai-sol", "sol", "pas", 40, 30);
export const ESSAI_CIEL = figurantDEssai("essai-ciel", "ciel", "vol", 60, 30, { images: 4 });
export const ESSAI_POSE = figurantDEssai("essai-pose", "sol", "posee", 24, 20);
export const ESSAI_EAU = figurantDEssai("essai-eau", "eau", "lente", 30, 12);
export const ESSAI_NUIT = figurantDEssai("essai-nuit", "sol", "pas", 30, 20, { quand: ["nuit"] });
export const ESSAI_TOIT = figurantDEssai("essai-toit", "toit", "posee", 20, 16);
export const FIGURANTS_D_ESSAI: readonly Figurant[] = [ESSAI_SOL, ESSAI_CIEL, ESSAI_POSE, ESSAI_EAU, ESSAI_NUIT, ESSAI_TOIT];
export const PAR_ID = new Map(FIGURANTS_D_ESSAI.map((f) => [f.id, f]));

/** Une traversée au sol, valide : à 10 cases par seconde, en fondu de trois secondes, dans la rue des maisons. */
export function traversee(options: Partial<MomentEcrit> = {}, decalage = 0): MomentEcrit {
  return {
    titre: "Une traversée d'essai",
    phases: ["jour"],
    batiments: [],
    ancre: "rue-des-maisons",
    duree: 30,
    roles: [
      {
        figurant: "essai-sol",
        etapes: [
          { t: 0, x: -150 + decalage, y: 0, o: 0 },
          { t: 3, x: -120 + decalage, y: 0, o: 1 },
          { t: 27, x: 120 + decalage, y: 0, o: 1 },
          { t: 30, x: 150 + decalage, y: 0, o: 0 },
        ],
      },
    ],
    ...options,
  };
}

/** Des moments gardés d'essai, numérotés : chacun une traversée, aux phases et aux bâtiments donnés. */
export function momentsDEssai(liste: readonly { phases: Phase[]; batiments?: MomentEcrit["batiments"]; ancre?: string; figurant?: string }[]): Moment[] {
  return liste.map((m, i) => {
    const base = traversee({ phases: m.phases, batiments: m.batiments ?? [], titre: `Moment d'essai ${i + 1}`, ...(m.ancre ? { ancre: m.ancre } : {}) });
    if (m.figurant) base.roles[0]!.figurant = m.figurant;
    return { id: `m${String(i + 1).padStart(3, "0")}`, ...base };
  });
}
