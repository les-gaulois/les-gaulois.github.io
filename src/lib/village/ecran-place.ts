/**
 * Les Gaulois du monde du village (`/village`) : ce que la page calcule à partir de la réponse du serveur (`get_village`,
 * contrat dans `contrat.ts`). Le serveur décide de qui est au village et donne les faits ; ici, seulement la relecture de
 * sa réponse et les mots. Qui est où : `vie.ts`.
 */
import { EMPLACEMENTS_OBJETS, OBJETS, lireTenue } from "../gaulois";
import type { GauloisDeLaPlace, PlaqueVue, Village } from "./contrat";
import { lirePlaques } from "./forge";
import { lireReplique } from "./vie";

/** Un instant écrit par le serveur : gardé tel quel s'il se lit comme une date, `null` sinon. */
function lireInstant(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur !== "" && !Number.isNaN(new Date(valeur).getTime()) ? valeur : null;
}

/**
 * La réponse de `get_village`, relue : un Gaulois sans nom ou à la tenue illisible n'est pas dessiné. Les faits de la vie
 * du village que le serveur ne donne pas, ou donne mal, valent `null` : « rien de connu ». Les plaques de la forge
 * (`gravures`) : une plaque illisible est ignorée, une liste absente est vide. `null` : la réponse n'a pas la forme du
 * contrat.
 */
export function lireVillage(reponse: unknown): Village | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Record<string, unknown>;
  if (!Array.isArray(brut["gaulois"])) return null;
  const gaulois: GauloisDeLaPlace[] = [];
  for (const ligne of brut["gaulois"] as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const { nom, tenue, moi, partie_le, vocal, replique, gravures } = ligne as Record<string, unknown>;
    const lue = lireTenue(tenue);
    if (typeof nom !== "string" || nom.trim() === "" || !lue) continue;
    gaulois.push({ nom: nom.trim(), tenue: lue, moi: moi === true, partie_le: lireInstant(partie_le), vocal: typeof vocal === "boolean" ? vocal : null, replique: lireReplique(replique), gravures: lirePlaques(gravures) });
  }
  return { ok: true, gaulois, releve: lireInstant(brut["releve"]) };
}

/** Le membre n'est pas au village : il n'a pas encore créé son Gaulois. */
export const sonGauloisManque = (village: Village): boolean => !village.gaulois.some((g) => g.moi);

/** Les mots de la place pour un refus du serveur ; `null` : le message courant du refus convient. */
export function messageDeLaPlace(code: string): string | null {
  return code === "not_validated" ? "La place s'ouvre une fois votre compte validé." : null;
}

/** Une plaque de la forge telle que la place la montre : le nom de l'objet et le texte gravé. */
export interface PlaqueEnMots {
  cle: string;
  objet: string;
  texte: string;
}

/**
 * Les plaques des objets que porte un Gaulois, de la tête à l'arme, avec le nom de chaque objet : « Épée longue »,
 * « 12 novembre, à quatre, 2,33 points rapportés ». Le serveur ne donne que celles qu'on peut voir (`contrat.ts`).
 */
export function plaquesEnMots(gaulois: { gravures?: readonly PlaqueVue[] | undefined }): PlaqueEnMots[] {
  const plaques = gaulois.gravures ?? [];
  const lues: PlaqueEnMots[] = [];
  for (const emplacement of EMPLACEMENTS_OBJETS) {
    for (const plaque of plaques) {
      if (plaque.emplacement !== emplacement) continue;
      const catalogue = OBJETS[emplacement];
      const fiche = Object.hasOwn(catalogue, plaque.objet) ? catalogue[plaque.objet] : undefined;
      if (fiche && plaque.texte.trim() !== "") lues.push({ cle: `${emplacement}-${plaque.objet}`, objet: fiche.nom, texte: plaque.texte.trim() });
    }
  }
  return lues;
}
