/**
 * L'écriture de l'almanach des petits moments (`type.ts`), une seule fois, par Claude Fable 5.2 et l'API Claude (demande du
 * pilote, 15 novembre 2026 : « 650 », sur le crédit à utiliser avant le 15 décembre 2026). Lancée par
 * `scripts/almanach-ecrire.ts`, dans l'Action `.github/workflows/almanach.yml`, sur la seule branche `robot/almanach`.
 *
 * - **La demande.** Le modèle `claude-fable-5-2`, à l'effort `medium`, par l'API Message Batches (moitié prix), en sortie
 *   structurée (le schéma JSON est tiré du schéma Zod de `moment.ts` par le SDK, `zodOutputFormat`). Ni `fallbacks` (que
 *   les lots refusent), ni `thinking` (toujours là sur ce modèle), ni `temperature`.
 * - **La consigne** ne contient que le catalogue des figurants (`figurants.ts`), les lieux (`ancres.ts`), les règles et des
 *   exemples tirés de ces deux listes : aucune donnée du site, aucun membre, aucun chiffre du clan (un test le garde : la
 *   construire ne lit ni `data/` ni le serveur).
 * - **La variété.** Une liste fixe de graines (une phase, trois lieux, une forme de moment) répartie sur les requêtes, dix
 *   moments par requête : 65 requêtes pour 650. Chaque moment écrit est contrôlé (`validerMoment`), les doublons sont
 *   écartés (mêmes figurants au même lieu par un chemin voisin) ; puis un lot plus petit complète, deux fois au plus.
 * - **Le plafond** (`config/almanach.json`) : avant d'envoyer un lot, son pire coût (chaque requête au plus long de sa
 *   réponse, `max_tokens`, et son entrée comptée à un jeton par octet, aux prix des lots) doit tenir sous ce qui reste du
 *   plafond, sinon rien ne part. Après, le vrai coût est lu dans `usage`.
 * - **Ce qui est écrit** : `moments.json` (les moments gardés, triés) et `ecriture.json` (le journal : date, modèle, nombre
 *   demandé, gardé, refusé par raison, jetons, coût en dollars). Le journal est public : il ne dit que des nombres, des
 *   identifiants et des raisons. Un lot en route y est noté : une Action coupée reprend le même lot au passage suivant, sans
 *   rien renvoyer ni repayer.
 * - **L'essai** (`--essai`, ou `"essai": true` dans `config/almanach.json` pour l'Action) : une seule requête, sans lot, au
 *   prix normal, qui affiche les moments et leurs refus et ne les écrit que dans `essai.json`, pour les regarder avant de
 *   payer le lot. Son coût est hors du plafond du lot (une requête : 1,67 $ au pire).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BATIMENT_IDS } from "../../chantier-liste";
import type { Phase } from "../../lumiere";
import { ANCRES, type Ancre, zonesDuMilieu } from "./ancres";
import { FIGURANTS } from "./figurants";
import {
  DUREE_MAX,
  DUREE_MIN,
  ECART_DE_LA_FIN,
  ETAPES_MAX,
  ETAPES_MIN,
  FONDU_MIN,
  FONDU_VITESSE_MAX,
  MOMENT,
  MOMENTS,
  type Moment,
  type MomentEcrit,
  ROLES_MAX,
  VITESSES,
  schemaDeLaReponse,
  sontDoublons,
  validerMoment,
} from "./moment";
import { reglageDe } from "./reglages-figurants";
import type { Figurant } from "./type";

/* ---------- Les réglages ---------- */

export const MODELE = "claude-fable-5-2";
export const EFFORT = "medium";
/** La réponse la plus longue d'une requête, réflexion du modèle comprise : dix moments en JSON en prennent quelques milliers. */
export const MAX_TOKENS = 32_000;
export const MOMENTS_PAR_REQUETE = 10;
/** Les lots de complément, au plus, après le premier. */
export const COMPLEMENTS_MAX = 2;
/** Les prix de Claude Fable 5.2, en dollars par million de jetons ; les lots coûtent moitié moins. */
export const PRIX = { entree: 8, sortie: 40 } as const;
export const REMISE_DES_LOTS = 0.5;
/** Les jetons ajoutés à l'entrée d'une requête dans le pire cas, au-delà d'un par octet de son corps : le cadre du message. */
export const MARGE_D_ENTREE = 2000;

export const CHEMINS = {
  config: "config/almanach.json",
  moments: "src/lib/village/monde/almanach/moments.json",
  ecriture: "src/lib/village/monde/almanach/ecriture.json",
  /** Ce que rend l'essai : les moments valides et les raisons des refus, pour les regarder avant le lot. Jamais lu par le site. */
  essai: "src/lib/village/monde/almanach/essai.json",
} as const;

/**
 * Ce que règle le pilote : le nombre de moments voulus et le plafond de dépense, en dollars. `essai` à vrai fait de la
 * prochaine Action un essai d'une seule requête (l'Action ne passe pas d'option au script : c'est ce fichier qu'on pousse).
 */
export const CONFIG = z.object({ moments: z.number().int().min(1).max(2000), plafond_dollars: z.number().positive().max(1000), essai: z.boolean().optional() });
export type ConfigDeLAlmanach = z.infer<typeof CONFIG>;

/* ---------- Le catalogue ---------- */

/** Ce que la consigne montre : les figurants dessinés, et les lieux où l'un d'eux au moins a un milieu. */
export interface CatalogueEcrit {
  figurants: readonly Figurant[];
  ancres: readonly Ancre[];
}

export function catalogueUtilisable(figurants: readonly Figurant[] = FIGURANTS, ancres: readonly Ancre[] = ANCRES): CatalogueEcrit {
  const milieux = new Set(figurants.map((f) => f.milieu));
  return { figurants, ancres: ancres.filter((a) => a.zones.some((z) => milieux.has(z.milieu))) };
}

const PHASES_ECRITES: Readonly<Record<Phase, string>> = { aube: "aube", jour: "jour", crepuscule: "crepuscule", nuit: "nuit" };

/** Un figurant tel que la consigne le présente : ce qu'il est, où il va, à quelle allure, quand, et sa taille. */
const figurantEcrit = (f: Figurant) => ({
  id: f.id,
  nom: f.nom,
  description: f.description,
  milieu: f.milieu,
  allure: f.allure,
  vitesse_max: VITESSES[f.allure],
  phases: f.quand ? [...f.quand] : "toutes",
  largeur: f.largeur,
  hauteur: f.hauteur,
  ...(reglageDe(f) ? { regle: reglageDe(f)!.note } : {}),
});

/** Un lieu tel que la consigne le présente : sa description, sa place, ses zones par milieu, ses bâtiments. */
const ancreEcrite = (a: Ancre) => ({
  id: a.id,
  description: a.description,
  milieu: a.milieu,
  place: a.place,
  zones: a.zones.map((z) => ({ milieu: z.milieu, colonnes: [z.de, z.a], rangees: [z.haut, z.bas] })),
  batiments: [...a.batiments],
});

/**
 * Un exemple valide, tiré du catalogue : ce figurant traverse sa zone de ce lieu à 70 % de sa vitesse, en fondu à l'entrée
 * et à la sortie ; posé, il paraît, reste, puis s'efface. `null` si rien ne tient. Il passe la validation, ou il n'est
 * pas montré.
 */
export function exempleDe(f: Figurant, a: Ancre): MomentEcrit | null {
  const zone = zonesDuMilieu(a, f.milieu)[0];
  if (!zone) return null;
  const demi = Math.floor(f.largeur / 2);
  const gauche = Math.max(zone.de, -a.place.gauche) + demi;
  const droite = Math.min(zone.a, a.place.droite) - (f.largeur - 1 - demi);
  const y = Math.min(zone.bas, a.place.dessous, Math.max(zone.haut, f.hauteur - 1 - a.place.dessus, Math.round((zone.haut + zone.bas) / 2)));
  if (gauche > droite) return null;
  const vitesse = VITESSES[f.allure] * 0.7;
  let etapes: MomentEcrit["roles"][number]["etapes"];
  let duree: number;
  if (vitesse === 0) {
    const x = Math.round((gauche + droite) / 2);
    duree = 30;
    etapes = [
      { t: 0, x, y, o: 0 },
      { t: 4, x, y, o: 1 },
      { t: 26, x, y, o: 1 },
      { t: 30, x, y, o: 0 },
    ];
  } else {
    const distance = Math.min(droite - gauche, Math.floor(vitesse * 50));
    duree = Math.min(DUREE_MAX, Math.max(DUREE_MIN, Math.ceil(distance / vitesse)));
    const x0 = gauche + Math.floor((droite - gauche - distance) / 2);
    const a3 = Math.round((distance * 3) / duree);
    etapes = [
      { t: 0, x: x0, y, o: 0 },
      { t: 3, x: x0 + a3, y, o: 1 },
      { t: duree - 3, x: x0 + distance - a3, y, o: 1 },
      { t: duree, x: x0 + distance, y, o: 0 },
    ];
  }
  const moment: MomentEcrit = { titre: `${f.nom.slice(0, 40)} en passant`.replace(/[^A-Za-zÀ-ÿŒœÆæ0-9 ,.'’-]/g, ""), phases: f.quand ? [...f.quand] : ["jour"], batiments: [], ancre: a.id, duree, roles: [{ figurant: f.id, etapes }] };
  const catalogue = { figurants: new Map([[f.id, f]]), ancre: (id: string) => (id === a.id ? a : null) };
  return validerMoment(moment, catalogue) ? null : moment;
}

/** Deux exemples au plus, de deux milieux différents si possible. */
function exemples(catalogue: CatalogueEcrit): MomentEcrit[] {
  const liste: MomentEcrit[] = [];
  const milieux = new Set<string>();
  for (const f of catalogue.figurants) {
    if (liste.length >= 2 || milieux.has(f.milieu)) continue;
    for (const a of catalogue.ancres) {
      const e = exempleDe(f, a);
      if (e) {
        liste.push(e);
        milieux.add(f.milieu);
        break;
      }
    }
  }
  return liste;
}

/* ---------- La consigne ---------- */

/**
 * La consigne de l'API : le rôle, les mesures, les règles que le code contrôle, le catalogue, les lieux, des exemples.
 * Rien d'autre : ni donnée du site, ni membre, ni chiffre du clan. La même pour toutes les requêtes.
 */
export function consigne(catalogue: CatalogueEcrit): string {
  const vitesses = (Object.entries(VITESSES) as [string, number][]).map(([allure, v]) => `${allure} ${v}`).join(", ");
  return [
    "Tu écris des « petits moments » pour un village en pixels, vu de côté : un décor animé, calme, où de loin en loin passe une chose rare, une charrette de foin, un vol d'oies, la brume du matin sur le ruisseau. Chaque moment est une petite scène muette : des figurants déjà dessinés passent par un lieu, lentement, puis s'en vont. Rien ne s'écrit à l'écran, personne ne parle. Un même moment ne repasse presque jamais : chacun doit valoir d'être vu une fois.",
    "",
    "## Ce qui compte",
    "- Calme et doux : des mouvements lents et espacés, rien de vif, rien qui clignote. Des enfants regardent : rien d'effrayant, de violent ni de triste.",
    "- Varié : chaque moment diffère des autres par ses figurants, son lieu, son chemin, son rythme ou son heure. Une halte, une traversée, une rencontre, un passage dans le ciel, une nappe qui monte et se dissipe.",
    "- Juste : seulement les figurants du catalogue et les lieux de la liste, en suivant leurs descriptions (une bête de ferme au sol, un oiseau d'eau sur l'eau, la brume en nappe).",
    "- Aucune référence à une œuvre existante (livre, film, bande dessinée, jeu), à une marque ou à une personne réelle.",
    "",
    "## Les mesures",
    "- Tout se compte en cases. Un villageois mesure 48 cases de large et 64 de haut ; une porte, 72 de haut.",
    "- Chaque lieu a un point. Une étape place le pied d'un figurant : `x`, la colonne du milieu de la dernière rangée de son dessin, comptée depuis le point (négatif à gauche) ; `y`, la rangée de cette dernière rangée, depuis le point (négatif plus haut ; au sol, positif plus près de nous).",
    "- `t` en secondes depuis le début du moment. Entre deux étapes, le figurant va en ligne droite, à vitesse égale ; il se tourne de lui-même du côté où il va. Deux étapes au même endroit : il s'arrête.",
    "- `o`, l'opacité, de 0 (invisible) à 1 (plein).",
    "",
    "## Les règles (un moment qui en manque une seule est jeté)",
    `1. \`duree\` de ${DUREE_MIN} à ${DUREE_MAX} secondes ; la dernière étape du rôle qui finit le plus tard tombe à la durée, à ${ECART_DE_LA_FIN} secondes près.`,
    `2. De 1 à ${ROLES_MAX} rôles ; chaque rôle a de ${ETAPES_MIN} à ${ETAPES_MAX} étapes, aux \`t\` strictement croissants, entre 0 et la durée ; \`x\` et \`y\` sont des entiers.`,
    `3. Entrée et sortie en fondu : la première et la dernière étape de chaque rôle ont \`o\` à 0, à ${FONDU_MIN} secondes au moins de leur voisine. L'opacité change de ${String(FONDU_VITESSE_MAX).replace(".", ",")} au plus par seconde. Chaque rôle atteint au moins 0,5.`,
    `4. Vitesse : la distance entre deux étapes, divisée par le temps qui les sépare, ne dépasse jamais la vitesse de l'allure du figurant, en cases par seconde : ${vitesses}. Une allure posée ne bouge pas du tout. Plus lent est toujours mieux.`,
    "5. Milieu : à chaque instant, toute la largeur du pied d'un figurant (de x moins la moitié de sa largeur à x plus la moitié) et la rangée de son pied tiennent dans une zone de son milieu (`sol`, `eau`, `ciel`, `toit`, `nappe`) du lieu, entre ses `colonnes` et ses `rangees`, bornes comprises. Un lieu sans zone pour ce milieu ne reçoit pas ce figurant. Attention aux chemins en ligne droite qui coupent d'une zone à l'autre.",
    "   Sur l'eau, la dernière rangée d'un figurant est le bas de son sillage, la ligne d'eau 2 à 4 rangées plus haut : son pied se pose dans une zone d'eau, jamais sur la rive. Papillons, lucioles, libellules et martin-pêcheur ont le bas de leur dessin vide : posés sur leur zone, ils volettent au-dessus.",
    "   Quelques figurants ont leur propre règle (`regle` dans le catalogue) : le pêcheur assis, l'étoile filante et la fumée qui ne vont que vers la droite, les nappes que leurs étapes déplacent. Elle est contrôlée comme les autres.",
    "6. Place : à chaque instant, tout le dessin (sa largeur, et sa hauteur au-dessus de son pied) tient dans la `place` du lieu : tant de cases à gauche, à droite, au-dessus et au-dessous du point.",
    "7. Heures : `phases` dit quand le moment peut passer (aube, jour, crepuscule, nuit). Un figurant qui a ses phases n'entre que dans des moments dont toutes les phases sont les siennes.",
    `8. Bâtiments : un lieu en demande parfois (ils doivent être bâtis pour que le moment passe) ; \`batiments\` en ajoute seulement si le moment en a besoin, sinon reste vide. Les noms possibles : ${BATIMENT_IDS.join(", ")}.`,
    "9. `titre` : de 3 à 60 signes, en français, des lettres et une ponctuation simple, sans guillemets : il ne sert qu'au journal.",
    "",
    "## Le catalogue des figurants",
    JSON.stringify(catalogue.figurants.map(figurantEcrit)),
    "",
    "## Les lieux",
    JSON.stringify(catalogue.ancres.map(ancreEcrite)),
    "",
    "## Des exemples valides (simples : les tiens seront plus riches)",
    JSON.stringify(exemples(catalogue)),
    "",
    `Réponds seulement par le JSON demandé : un objet \`moments\`, la liste des moments. Les phases s'écrivent ${Object.values(PHASES_ECRITES).join(", ")}.`,
  ].join("\n");
}

/* ---------- Les graines ---------- */

/** Les phases des graines, sur vingt : plus de jour et de nuit (la plupart des heures), moins d'aube et de crépuscule. */
const PHASES_DES_GRAINES: readonly Phase[] = ["jour", "nuit", "jour", "aube", "nuit", "jour", "crepuscule", "jour", "nuit", "jour", "aube", "nuit", "jour", "crepuscule", "jour", "nuit", "aube", "jour", "crepuscule", "nuit"];
/** Les formes de moment proposées tour à tour. */
export const FORMES: readonly string[] = [
  "une traversée lente d'un bord à l'autre",
  "une halte : il arrive, s'arrête un long moment, repart",
  "deux ou trois figurants qui se croisent ou se suivent",
  "un passage dans le ciel au-dessus du lieu",
  "un moment sur l'eau, ou au bord de l'eau",
  "une nappe qui monte doucement puis se dissipe",
  "un petit événement de la saison, discret",
];

/** Une graine : ce qu'une requête demande d'abord, pour que les 65 requêtes ne se ressemblent pas. */
export interface Graine {
  rang: number;
  phase: Phase;
  ancres: string[];
  forme: string;
}

/** La graine de rang `rang` : sa phase, trois lieux pris tour à tour dans la liste, une forme. Fixe : le même rang, la même graine. */
export function graine(rang: number, ancres: readonly Pick<Ancre, "id">[]): Graine {
  const n = ancres.length;
  const lieux = n === 0 ? [] : [...new Set([0, 1, 2].map((k) => ancres[(rang * 3 + k) % n]!.id))];
  return { rang, phase: PHASES_DES_GRAINES[rang % PHASES_DES_GRAINES.length]!, ancres: lieux, forme: FORMES[rang % FORMES.length]! };
}

/** La demande d'une requête : combien de moments, sa graine, et les titres déjà gardés à ses lieux, pour ne pas les refaire. */
export function demande(g: Graine, dejaPris: readonly string[] = []): string {
  const lignes = [
    `Écris exactement ${MOMENTS_PAR_REQUETE} moments, tous différents.`,
    `- Au moins 6 d'entre eux à cette phase de la journée : ${PHASES_ECRITES[g.phase]} (les autres, comme tu veux).`,
    `- Les lieux à privilégier : ${g.ancres.join(", ")} (au moins 6 moments dans ces lieux).`,
    `- Une idée de forme pour une partie d'entre eux : ${g.forme}.`,
  ];
  if (dejaPris.length > 0) lignes.push(`- Déjà écrits à ces lieux, à ne pas refaire : ${dejaPris.slice(0, 40).join(" ; ")}.`);
  return lignes.join("\n");
}

/* ---------- Les requêtes et leur coût ---------- */

/** La forme de la réponse demandée, en schéma JSON, pour ce catalogue. */
export function formatDeLaReponse(catalogue: CatalogueEcrit): { type: "json_schema"; schema: Record<string, unknown> } {
  const { type, schema } = zodOutputFormat(schemaDeLaReponse(catalogue.figurants.map((f) => f.id), catalogue.ancres.map((a) => a.id)));
  return { type, schema };
}

/** Le corps d'une requête : le modèle, l'effort, la consigne, la demande, la sortie structurée. */
export function corpsDeLaRequete(systeme: string, format: ReturnType<typeof formatDeLaReponse>, g: Graine, dejaPris: readonly string[] = []): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODELE,
    max_tokens: MAX_TOKENS,
    system: systeme,
    output_config: { effort: EFFORT, format },
    messages: [{ role: "user", content: demande(g, dejaPris) }],
  };
}

/** L'identifiant d'une requête dans un lot : le rang de sa graine. */
export const idDeLaRequete = (rang: number): string => `r${String(rang).padStart(3, "0")}`;
export const rangDeLaRequete = (id: string): number | null => (/^r[0-9]{3,}$/.test(id) ? Number(id.slice(1)) : null);

const octets = (texte: string): number => new TextEncoder().encode(texte).length;

/**
 * Le pire coût de ces requêtes, en dollars : chacune au plus long de sa réponse (`max_tokens`), et son entrée comptée à un
 * jeton par octet de son corps (un jeton fait toujours au moins un octet), son schéma compté deux fois, plus une marge.
 */
export function pireCout(corps: readonly Anthropic.MessageCreateParamsNonStreaming[], enLot: boolean): number {
  const remise = enLot ? REMISE_DES_LOTS : 1;
  let dollars = 0;
  for (const c of corps) {
    const entree = octets(JSON.stringify(c)) + octets(JSON.stringify(c.output_config?.format ?? {})) + MARGE_D_ENTREE;
    dollars += ((entree * PRIX.entree + c.max_tokens * PRIX.sortie) / 1_000_000) * remise;
  }
  return dollars;
}

/** Les jetons d'une réponse : l'entrée (le cache compris, s'il y en a eu), la sortie (réflexion comprise). */
export interface Jetons {
  entree: number;
  sortie: number;
}

const entier = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/** Le vrai coût d'une réponse, lu dans `usage`, en dollars ; une écriture au cache coûte un quart de plus, une lecture un dixième. */
export function coutReel(usage: Partial<Anthropic.Usage> | null | undefined, enLot: boolean): { jetons: Jetons; dollars: number } {
  const entree = entier(usage?.input_tokens);
  const ecrit = entier(usage?.cache_creation_input_tokens);
  const lu = entier(usage?.cache_read_input_tokens);
  const sortie = entier(usage?.output_tokens);
  const remise = enLot ? REMISE_DES_LOTS : 1;
  const dollars = (((entree + ecrit * 1.25 + lu * 0.1) * PRIX.entree + sortie * PRIX.sortie) / 1_000_000) * remise;
  return { jetons: { entree: entree + ecrit + lu, sortie }, dollars };
}

/* ---------- La lecture des réponses ---------- */

/** La forme lue d'un moment, sans ses bornes : `validerMoment` dit ensuite, en clair, ce qui dépasse. */
const FORME_LUE = z.object({
  titre: z.string(),
  phases: z.array(z.string()),
  batiments: z.array(z.string()),
  ancre: z.string(),
  duree: z.number(),
  roles: z.array(z.object({ figurant: z.string(), etapes: z.array(z.object({ t: z.number(), x: z.number(), y: z.number(), o: z.number() })) })),
});

/**
 * Les moments d'une réponse de l'API, encore à contrôler, ou la raison de n'en lire aucun. La raison de l'arrêt se lit
 * avant le contenu : un refus ou une réponse coupée ne donnent rien, quoi que contienne le texte.
 */
export function lireLaReponse(message: Pick<Anthropic.Message, "stop_reason" | "content">): { moments: unknown[]; raison: string | null } {
  if (message.stop_reason === "refusal") return { moments: [], raison: "le modèle a refusé" };
  if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") return { moments: [], raison: "réponse coupée" };
  if (message.stop_reason !== "end_turn") return { moments: [], raison: "réponse arrêtée autrement" };
  const texte = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    return { moments: [], raison: "JSON illisible" };
  }
  if (typeof lu !== "object" || lu === null || !Array.isArray((lu as { moments?: unknown }).moments)) return { moments: [], raison: "JSON hors de la forme demandée" };
  return { moments: (lu as { moments: unknown[] }).moments, raison: null };
}

/** Ce qu'une requête a donné : ses moments valides, et le compte de ses refus par raison. */
export interface Lecture {
  valides: MomentEcrit[];
  lus: number;
  refus: Record<string, number>;
}

const compter = (compte: Record<string, number>, raison: string, n = 1): void => {
  compte[raison] = (compte[raison] ?? 0) + n;
};

/** Le contrôle des moments lus d'une réponse : chacun passe la forme, puis la validation ; un moment refusé ne fait pas tomber les autres. */
export function controlerLesMoments(bruts: readonly unknown[], catalogue: CatalogueEcrit, journal?: (ligne: string) => void): Lecture {
  const figurants = new Map(catalogue.figurants.map((f) => [f.id, f]));
  const ancres = new Map(catalogue.ancres.map((a) => [a.id, a]));
  const lecture: Lecture = { valides: [], lus: bruts.length, refus: {} };
  bruts.forEach((brut, i) => {
    const forme = FORME_LUE.safeParse(brut);
    if (!forme.success) {
      compter(lecture.refus, "forme invalide");
      journal?.(`  moment ${i + 1} : refusé, forme invalide`);
      return;
    }
    const moment = { ...forme.data, titre: forme.data.titre.trim() } as MomentEcrit;
    const refus = validerMoment(moment, { figurants, ancre: (id) => ancres.get(id) ?? null });
    if (refus) {
      compter(lecture.refus, refus.raison);
      journal?.(`  moment ${i + 1} : refusé, ${refus.raison}${refus.detail ? ` (${refus.detail})` : ""}`);
      return;
    }
    journal?.(`  moment ${i + 1} : valide`);
    lecture.valides.push(moment);
  });
  return lecture;
}

/* ---------- Ce qu'on garde ---------- */

const numeroDe = (id: string): number => Number(id.slice(1)) || 0;
/** L'identifiant du moment de ce numéro : `m001`. */
export const idDuMoment = (numero: number): string => `m${String(numero).padStart(3, "0")}`;

/**
 * Les moments gardés après ce lot : ceux d'avant, puis les nouveaux dans l'ordre des graines, sans doublon (ni entre eux,
 * ni avec ceux d'avant), jusqu'à l'objectif. Chaque nouveau reçoit le numéro suivant ; la liste est triée par identifiant.
 */
export function garder(avant: readonly Moment[], nouveaux: readonly MomentEcrit[], objectif: number): { moments: Moment[]; gardes: number; doublons: number; enTrop: number } {
  const moments = [...avant];
  let numero = Math.max(0, ...avant.map((m) => numeroDe(m.id)));
  let gardes = 0;
  let doublons = 0;
  let enTrop = 0;
  for (const m of nouveaux) {
    if (moments.some((g) => sontDoublons(g, m))) {
      doublons++;
      continue;
    }
    if (moments.length >= objectif) {
      enTrop++;
      continue;
    }
    numero++;
    moments.push(MOMENT.parse({ id: idDuMoment(numero), ...m }));
    gardes++;
  }
  moments.sort((a, b) => numeroDe(a.id) - numeroDe(b.id));
  return { moments, gardes, doublons, enTrop };
}

/** `moments.json` : un moment par ligne, lisible et sans place perdue. */
export const ecrireLesMoments = (moments: readonly Moment[]): string => (moments.length === 0 ? "[]\n" : `[\n${moments.map((m) => JSON.stringify(m)).join(",\n")}\n]\n`);

/* ---------- Le journal ---------- */

const JETONS = z.object({ entree: z.number().int().min(0), sortie: z.number().int().min(0) });
const COMPTE = z.record(z.string(), z.number().int().min(0));
const LOT = z.object({
  rang: z.number().int().min(1),
  date: z.string(),
  requetes: z.number().int().min(0),
  demandes: z.number().int().min(0),
  lus: z.number().int().min(0),
  valides: z.number().int().min(0),
  gardes: z.number().int().min(0),
  doublons: z.number().int().min(0),
  en_trop: z.number().int().min(0),
  refus: COMPTE,
  requetes_sans_moments: COMPTE,
  jetons: JETONS,
  pire_cout_dollars: z.number().min(0),
  cout_dollars: z.number().min(0),
});
const EN_COURS = z.object({ rang: z.number().int().min(1), lot: z.string(), date: z.string(), graines: z.array(z.number().int().min(0)), pire_cout_dollars: z.number().min(0) });
export const ECRITURE = z.object({
  modele: z.string(),
  effort: z.string(),
  objectif: z.number().int().min(0),
  plafond_dollars: z.number().min(0),
  gardes: z.number().int().min(0),
  cout_dollars: z.number().min(0),
  jetons: JETONS,
  lots: z.array(LOT),
  lot_en_cours: EN_COURS.nullable(),
});
export type Ecriture = z.infer<typeof ECRITURE>;
export type LotEcrit = z.infer<typeof LOT>;

export const ecritureVide = (config: ConfigDeLAlmanach): Ecriture => ({
  modele: MODELE,
  effort: EFFORT,
  objectif: config.moments,
  plafond_dollars: config.plafond_dollars,
  gardes: 0,
  cout_dollars: 0,
  jetons: { entree: 0, sortie: 0 },
  lots: [],
  lot_en_cours: null,
});

const auCentime = (dollars: number): number => Math.round(dollars * 10_000) / 10_000;

/** Ce qui reste du plafond pour un nouveau lot : le plafond, moins ce qui est dépensé, moins le pire coût d'un lot encore en route. */
export const resteDuPlafond = (ecriture: Ecriture, config: ConfigDeLAlmanach): number => config.plafond_dollars - ecriture.cout_dollars - (ecriture.lot_en_cours?.pire_cout_dollars ?? 0);

/**
 * Le prochain lot : ses graines, ou `null` quand l'objectif est atteint ou que les deux compléments sont faits. Le premier
 * demande l'objectif entier (65 requêtes pour 650) ; un complément, ce qui manque, au taux de moments gardés des lots
 * précédents, plus un cinquième, sans dépasser le lot d'avant.
 */
export function prochainLot(ecriture: Ecriture, config: ConfigDeLAlmanach, gardes: number): { rang: number; graines: number[] } | { rang: null; raison: string } {
  const manque = config.moments - gardes;
  if (manque <= 0) return { rang: null, raison: `les ${config.moments} moments sont écrits` };
  const rang = ecriture.lots.length + 1;
  if (rang > 1 + COMPLEMENTS_MAX) return { rang: null, raison: `il manque ${manque} moments, mais les ${COMPLEMENTS_MAX} lots de complément sont faits` };
  const deja = ecriture.lots.reduce((n, l) => n + l.requetes, 0);
  let requetes = Math.ceil(config.moments / MOMENTS_PAR_REQUETE);
  if (rang > 1) {
    const demandes = ecriture.lots.reduce((n, l) => n + l.demandes, 0);
    const garde = ecriture.lots.reduce((n, l) => n + l.gardes, 0);
    const taux = Math.max(0.2, demandes > 0 ? garde / demandes : 0.2);
    requetes = Math.min(ecriture.lots[ecriture.lots.length - 1]!.requetes, Math.ceil((manque / (MOMENTS_PAR_REQUETE * taux)) * 1.2));
  }
  return { rang, graines: Array.from({ length: Math.max(1, requetes) }, (_v, k) => deja + k) };
}

/* ---------- Le client ---------- */

/** Ce dont l'écriture a besoin de l'API : un lot (le créer, le relire, en lire les résultats), et une seule demande pour l'essai. */
export interface ClientDeLAlmanach {
  creerLeLot(requetes: Anthropic.Messages.BatchCreateParams.Request[]): Promise<{ id: string }>;
  lireLeLot(id: string): Promise<{ processing_status: string; request_counts?: Partial<Anthropic.Messages.MessageBatchRequestCounts> }>;
  resultatsDuLot(id: string): Promise<AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>>;
  demander(corps: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

/** Le client du SDK officiel (`@anthropic-ai/sdk`) ; l'essai passe en flux, comme le veut le SDK pour une réponse aussi longue. */
export function clientDuSdk(sdk: Anthropic): ClientDeLAlmanach {
  return {
    creerLeLot: (requests) => sdk.messages.batches.create({ requests }),
    lireLeLot: (id) => sdk.messages.batches.retrieve(id),
    resultatsDuLot: (id) => sdk.messages.batches.results(id),
    demander: (corps) => sdk.messages.stream(corps).finalMessage(),
  };
}

/** Ce que le journal dit d'une erreur de l'API : sa classe et son statut, jamais d'en-tête ni de clé. */
function erreurDeLAPI(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "la clé ANTHROPIC_API_KEY est refusée (401)";
  if (e instanceof Anthropic.PermissionDeniedError) return "la clé n'a pas le droit d'appeler ce modèle ou les lots (403)";
  if (e instanceof Anthropic.NotFoundError) return "introuvable (404)";
  if (e instanceof Anthropic.RateLimitError) return "trop de demandes, ou la limite de dépense fixée chez Anthropic est atteinte (429)";
  if (e instanceof Anthropic.InternalServerError) return `l'API ne répond pas bien (${e.status})`;
  if (e instanceof Anthropic.APIConnectionError) return "l'API ne répond pas (réseau)";
  if (e instanceof Anthropic.APIError) return `réponse ${e.status ?? "inconnue"} de l'API (${e.type ?? "erreur"})`;
  return e instanceof Error ? e.message.slice(0, 200) : "erreur inconnue";
}

/** Une erreur dont on se remet en réessayant plus tard : trop de demandes, panne de l'API, réseau. */
const passagere = (e: unknown): boolean => e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;

/* ---------- L'écriture ---------- */

export interface DepsDeLEcriture {
  /** `null` : pas de clé, rien ne part. */
  client: ClientDeLAlmanach | null;
  /** Le texte d'un fichier du dépôt, ou `null` s'il n'existe pas. */
  lire(chemin: string): string | null;
  ecrire(chemin: string, texte: string): void;
  maintenant(): Date;
  attendre(ms: number): Promise<void>;
  journal(ligne: string): void;
  essai?: boolean;
  /** Pour les essais du code : un autre catalogue que celui du dépôt. */
  figurants?: readonly Figurant[];
  ancres?: readonly Ancre[];
  /** Le temps laissé à un lot pour finir, en millisecondes (4 h 40) ; au-delà, il reste noté en route et l'écriture s'arrête. */
  delaiMs?: number;
  /** Le temps entre deux relectures d'un lot (une minute). */
  pasMs?: number;
}

/** Le code de sortie : 0 fait ou rien à faire, 1 rien n'est parti ou une erreur, 2 un lot est encore en route (à reprendre). */
export type Sortie = 0 | 1 | 2;

const lireJson = <T>(deps: DepsDeLEcriture, chemin: string, schema: z.ZodType<T>): { ok: true; valeur: T | null } | { ok: false } => {
  const texte = deps.lire(chemin);
  if (texte === null) return { ok: true, valeur: null };
  try {
    const lu = schema.safeParse(JSON.parse(texte));
    return lu.success ? { ok: true, valeur: lu.data } : { ok: false };
  } catch {
    return { ok: false };
  }
};

const dollars = (v: number): string => `${v.toFixed(2).replace(".", ",")} $`;

/** Les titres déjà gardés aux lieux d'une graine : la demande les montre pour ne pas les refaire. */
const titresAuxLieux = (moments: readonly Moment[], g: Graine): string[] => moments.filter((m) => g.ancres.includes(m.ancre)).map((m) => m.titre);

/**
 * Écrit l'almanach : reprend un lot en route, sinon envoie le prochain lot si son pire coût tient sous le plafond, lit
 * les réponses, contrôle chaque moment, écarte les doublons, garde jusqu'à l'objectif ; puis complète, deux fois au plus.
 * L'essai : une seule requête, sans lot, sans rien écrire.
 */
export async function ecrireLAlmanach(deps: DepsDeLEcriture): Promise<Sortie> {
  const log = deps.journal;
  const config = lireJson(deps, CHEMINS.config, CONFIG);
  if (!config.ok || !config.valeur) {
    log(`${CHEMINS.config} manque ou est illisible : rien n'est envoyé.`);
    return 1;
  }
  const reglage = config.valeur;
  const catalogue = catalogueUtilisable(deps.figurants ?? FIGURANTS, deps.ancres ?? ANCRES);
  if (catalogue.figurants.length === 0 || catalogue.ancres.length === 0) {
    log("Aucun figurant dessiné (figurants.ts) : rien n'est envoyé.");
    return 1;
  }
  const lusMoments = lireJson(deps, CHEMINS.moments, MOMENTS);
  const lusEcriture = lireJson(deps, CHEMINS.ecriture, ECRITURE);
  if (!lusMoments.ok || !lusEcriture.ok) {
    log(`${!lusMoments.ok ? CHEMINS.moments : CHEMINS.ecriture} est illisible : rien n'est envoyé, rien n'est écrasé.`);
    return 1;
  }
  let moments: Moment[] = lusMoments.valeur ?? [];
  const ecriture: Ecriture = lusEcriture.valeur ?? ecritureVide(reglage);
  ecriture.objectif = reglage.moments;
  ecriture.plafond_dollars = reglage.plafond_dollars;
  if (!deps.client) {
    log("Pas de clé ANTHROPIC_API_KEY : rien n'est envoyé.");
    return 1;
  }
  const client = deps.client;
  const systeme = consigne(catalogue);
  const format = formatDeLaReponse(catalogue);
  log(`Catalogue : ${catalogue.figurants.length} figurants, ${catalogue.ancres.length} lieux. Moments gardés : ${moments.length} sur ${reglage.moments}. Dépensé : ${dollars(ecriture.cout_dollars)} sur ${dollars(reglage.plafond_dollars)}.`);

  if (deps.essai || reglage.essai === true) {
    const g = graine(0, catalogue.ancres);
    const corps = corpsDeLaRequete(systeme, format, g, titresAuxLieux(moments, g));
    const pire = pireCout([corps], false);
    const reste = resteDuPlafond(ecriture, reglage);
    if (pire > reste) {
      log(`Essai : son pire coût (${dollars(pire)}) dépasse ce qui reste du plafond (${dollars(reste)}) : rien n'est envoyé.`);
      return 1;
    }
    log(`Essai : une requête, sans lot, au prix normal (pire coût ${dollars(pire)}). Seul ${CHEMINS.essai} sera écrit.`);
    let message: Anthropic.Message;
    try {
      message = await client.demander(corps);
    } catch (e) {
      log(`Essai : ${erreurDeLAPI(e)}.`);
      return 1;
    }
    const cout = coutReel(message.usage, false);
    const reponse = lireLaReponse(message);
    if (reponse.raison) log(`Essai : aucun moment, ${reponse.raison}.`);
    const lecture = controlerLesMoments(reponse.moments, catalogue, log);
    reponse.moments.forEach((m, i) => log(`moment ${i + 1} : ${JSON.stringify(m)}`));
    log(`Essai : ${lecture.lus} moments lus, ${lecture.valides.length} valides ; refus : ${JSON.stringify(lecture.refus)}. Jetons : ${cout.jetons.entree} en entrée, ${cout.jetons.sortie} en sortie ; coût ${dollars(cout.dollars)}.`);
    // Les moments de l'essai, pour les regarder dans le vrai monde avant de payer le lot. Ni moments.json ni ecriture.json.
    const rendu = { date: deps.maintenant().toISOString(), modele: MODELE, effort: EFFORT, raison: reponse.raison, lus: lecture.lus, refus: lecture.refus, jetons: cout.jetons, cout_dollars: cout.dollars, valides: lecture.valides };
    deps.ecrire(CHEMINS.essai, `${JSON.stringify(rendu, null, 2)}\n`);
    return 0;
  }

  const sauver = () => {
    ecriture.gardes = moments.length;
    deps.ecrire(CHEMINS.moments, ecrireLesMoments(moments));
    deps.ecrire(CHEMINS.ecriture, `${JSON.stringify(ecriture, null, 2)}\n`);
  };
  const debut = deps.maintenant().getTime();
  const delai = deps.delaiMs ?? 280 * 60_000;
  const pas = deps.pasMs ?? 60_000;

  for (;;) {
    let enCours = ecriture.lot_en_cours;
    if (!enCours) {
      const prochain = prochainLot(ecriture, reglage, moments.length);
      if (prochain.rang === null) {
        log(`Rien de plus à écrire : ${prochain.raison}.`);
        sauver();
        return 0;
      }
      const graines = prochain.graines.map((rang) => graine(rang, catalogue.ancres));
      const requetes = graines.map((g) => ({ custom_id: idDeLaRequete(g.rang), params: corpsDeLaRequete(systeme, format, g, titresAuxLieux(moments, g)) }));
      const pire = pireCout(
        requetes.map((r) => r.params),
        true,
      );
      const reste = resteDuPlafond(ecriture, reglage);
      if (pire > reste) {
        log(`Lot ${prochain.rang} : ${requetes.length} requêtes, pire coût ${dollars(pire)}, au-dessus de ce qui reste du plafond (${dollars(reste)}) : rien n'est envoyé.`);
        return 1;
      }
      let id: string;
      try {
        id = (await client.creerLeLot(requetes)).id;
      } catch (e) {
        log(`Lot ${prochain.rang} : non créé, ${erreurDeLAPI(e)}. Rien n'est parti.`);
        return 1;
      }
      enCours = ecriture.lot_en_cours = { rang: prochain.rang, lot: id, date: deps.maintenant().toISOString(), graines: prochain.graines, pire_cout_dollars: auCentime(pire) };
      // Noté tout de suite : une Action coupée pendant l'attente reprendra ce lot, sans le renvoyer.
      sauver();
      log(`Lot ${prochain.rang} envoyé : ${requetes.length} requêtes, ${requetes.length * MOMENTS_PAR_REQUETE} moments demandés, pire coût ${dollars(pire)}.`);
    } else log(`Lot ${enCours.rang} en route depuis ${enCours.date} : reprise.`);

    // L'attente : une relecture par minute, jusqu'à la fin du lot ou du temps laissé.
    let fini = false;
    let echecs = 0;
    while (!fini) {
      try {
        const etat = await client.lireLeLot(enCours.lot);
        echecs = 0;
        if (etat.processing_status === "ended") {
          fini = true;
          break;
        }
        const c = etat.request_counts;
        log(`Lot ${enCours.rang} : en cours${c ? `, ${c.succeeded ?? 0} réponses, ${c.processing ?? 0} en attente` : ""}.`);
      } catch (e) {
        echecs++;
        log(`Lot ${enCours.rang} : relecture impossible, ${erreurDeLAPI(e)}.`);
        if (!passagere(e) || echecs >= 10) {
          log(`Lot ${enCours.rang} : laissé en route, à reprendre au prochain passage.`);
          sauver();
          return 2;
        }
      }
      if (deps.maintenant().getTime() - debut >= delai) {
        log(`Lot ${enCours.rang} : pas fini dans le temps laissé ; il reste noté en route, le prochain passage le reprendra.`);
        sauver();
        return 2;
      }
      await deps.attendre(pas);
    }

    // Les résultats, dans n'importe quel ordre : chacun se range par le rang de sa graine.
    const parGraine = new Map<number, MomentEcrit[]>();
    const lot: LotEcrit = {
      rang: enCours.rang,
      date: deps.maintenant().toISOString(),
      requetes: enCours.graines.length,
      demandes: enCours.graines.length * MOMENTS_PAR_REQUETE,
      lus: 0,
      valides: 0,
      gardes: 0,
      doublons: 0,
      en_trop: 0,
      refus: {},
      requetes_sans_moments: {},
      jetons: { entree: 0, sortie: 0 },
      pire_cout_dollars: enCours.pire_cout_dollars,
      cout_dollars: 0,
    };
    let lues = 0;
    try {
      for await (const r of await client.resultatsDuLot(enCours.lot)) {
        const rang = rangDeLaRequete(r.custom_id);
        if (rang === null || !enCours.graines.includes(rang) || parGraine.has(rang)) continue;
        lues++;
        if (r.result.type !== "succeeded") {
          compter(lot.requetes_sans_moments, r.result.type === "errored" ? "requête en erreur" : r.result.type === "expired" ? "requête expirée" : "requête annulée");
          parGraine.set(rang, []);
          continue;
        }
        const cout = coutReel(r.result.message.usage, true);
        lot.jetons.entree += cout.jetons.entree;
        lot.jetons.sortie += cout.jetons.sortie;
        lot.cout_dollars += cout.dollars;
        const reponse = lireLaReponse(r.result.message);
        if (reponse.raison) compter(lot.requetes_sans_moments, reponse.raison);
        const lecture = controlerLesMoments(reponse.moments, catalogue);
        lot.lus += lecture.lus;
        lot.valides += lecture.valides.length;
        for (const [raison, n] of Object.entries(lecture.refus)) compter(lot.refus, raison, n);
        parGraine.set(rang, lecture.valides);
      }
    } catch (e) {
      log(`Lot ${enCours.rang} : résultats illisibles, ${erreurDeLAPI(e)} ; il reste noté en route, le prochain passage le reprendra.`);
      sauver();
      return 2;
    }
    const manquantes = enCours.graines.length - lues;
    if (manquantes > 0) compter(lot.requetes_sans_moments, "requête sans résultat", manquantes);
    const nouveaux = [...parGraine.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, liste]) => liste);
    const garde = garder(moments, nouveaux, reglage.moments);
    moments = garde.moments;
    lot.gardes = garde.gardes;
    lot.doublons = garde.doublons;
    lot.en_trop = garde.enTrop;
    lot.cout_dollars = auCentime(lot.cout_dollars);
    ecriture.lots.push(lot);
    ecriture.cout_dollars = auCentime(ecriture.cout_dollars + lot.cout_dollars);
    ecriture.jetons = { entree: ecriture.jetons.entree + lot.jetons.entree, sortie: ecriture.jetons.sortie + lot.jetons.sortie };
    ecriture.lot_en_cours = null;
    sauver();
    log(
      `Lot ${lot.rang} lu : ${lot.lus} moments lus sur ${lot.demandes} demandés, ${lot.valides} valides, ${lot.doublons} doublons, ${lot.gardes} gardés (${moments.length} en tout). Refus : ${JSON.stringify(lot.refus)}. Requêtes sans moments : ${JSON.stringify(lot.requetes_sans_moments)}. Coût ${dollars(lot.cout_dollars)} (pire ${dollars(lot.pire_cout_dollars)}).`,
    );
  }
}
