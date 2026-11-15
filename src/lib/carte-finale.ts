/**
 * La carte de fin d'une victoire : qui tenait chaque case de la carte au dernier contrôle de la partie, rejouée avec le moteur
 * du jeu (`scripts/rejouer-victoires.ts`, demande du pilote du 15 novembre 2026 : « l'image de la map en fin game », comme
 * OFStats). Ce fichier lit ce que le rejeu a écrit et le vérifie ; le dessin est dans `carte-dessin.ts`, qu'il reprend ici.
 *
 * Le rejeu tourne dans un job sans secret (il exécute le code d'OpenFront) : tout ce qu'il écrit est relu ici comme une
 * donnée venue de l'extérieur. Un fichier au mauvais format, d'une autre partie, ou dont la fin n'a pas été contrôlée par les
 * empreintes du jeu est écarté, et l'image garde la vignette de la carte.
 *
 * Format, un fichier JSON (`EtatFinalMeta`) et un fichier binaire compressé par gzip, de `largeur × hauteur` cases, rangées
 * ligne après ligne : le propriétaire de chaque case (deux octets, petit-boutiste, 0 pour personne), puis l'octet de terrain
 * de chaque case, au format des cartes du jeu (bit 7 terre, bit 6 littoral, bit 5 océan, bits 0 à 4 magnitude), puis 1 par
 * case touchée par des retombées nucléaires, 0 sinon.
 */
import { gunzipSync } from "node:zlib";
import { z } from "zod";

export * from "./carte-dessin";

export const FORMAT_CARTE_FINALE = 1;
/**
 * Les cartes du jeu, relevées le 15 novembre 2026 sur ses 146 cartes (commit 8b5d071) : la plus grande, world10000, fait
 * 10 000 × 5 000 cases ; Passage, 6 000 × 400 ; Fleuve Amazone, 5 536 × 276 ; Mississippi, 400 × 4 200. De la marge pour les
 * cartes à venir, sans laisser passer n'importe quoi. La première limite, 5 000 de côté, a écarté la carte de fin d'une victoire
 * sur le Fleuve Amazone le jour même : un test garde ces cartes, et la carte du monde géante.
 */
export const MAX_COTE = 16_000;
export const MAX_CASES = 64_000_000;
/** Octets par case dans le fichier binaire : deux pour le propriétaire, un pour le terrain, un pour les retombées. */
export const OCTETS_PAR_CASE = 4;
/**
 * Au-delà, les fichiers ne sont pas même lus : une description pèse quelques dizaines de kilo-octets (un joueur par robot), les
 * cases compressées quelques centaines.
 */
export const MAX_OCTETS_DESCRIPTION = 4_000_000;
export const MAX_OCTETS_CASES = MAX_CASES * OCTETS_PAR_CASE;
/**
 * Les empreintes du jeu viennent toutes les 10 étapes, soit une seconde. Au-delà de 5 secondes entre le dernier contrôle et la
 * fin de la fiche, la fin de la partie n'est pas contrôlée : pas de carte.
 */
export const ECART_FIN_MAX = 50;

export const JoueurFinal = z.object({
  /** Le petit numéro du joueur dans la partie : celui des cases. */
  n: z.number().int().min(1).max(65_535),
  /** L'identifiant du joueur dans la partie, public dans la fiche de la partie. `null` : robot ou nation. */
  client: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,32}$/)
    .nullable(),
  equipe: z.string().min(1).max(40).nullable(),
  type: z.string().min(1).max(20),
});
export type JoueurFinal = z.infer<typeof JoueurFinal>;

export const EtatFinalMeta = z
  .object({
    format: z.literal(FORMAT_CARTE_FINALE),
    partie: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    largeur: z.number().int().min(1).max(MAX_COTE),
    hauteur: z.number().int().min(1).max(MAX_COTE),
    /** Les étapes rejouées, jusqu'au dernier contrôle compris, et celles de la fiche. */
    tours: z.number().int().min(1),
    toursFiche: z.number().int().min(1),
    /** Les empreintes du jeu retrouvées, toutes, jusqu'au dernier contrôle. */
    empreintes: z.number().int().min(1),
    joueurs: z.array(JoueurFinal).max(5_000),
  })
  .refine((m) => m.largeur * m.hauteur <= MAX_CASES, "carte trop grande")
  .refine((m) => m.tours <= m.toursFiche && m.toursFiche - m.tours <= ECART_FIN_MAX, "fin de partie non contrôlée")
  .refine((m) => new Set(m.joueurs.map((j) => j.n)).size === m.joueurs.length, "joueur en double");
export type EtatFinalMeta = z.infer<typeof EtatFinalMeta>;

export interface EtatFinal extends EtatFinalMeta {
  proprio: Uint16Array;
  terrain: Uint8Array;
  retombees: Uint8Array;
}

/** Les cases rangées pour le fichier binaire, avant compression : ce qu'écrit le rejeu. */
export function casesEnOctets(proprio: Uint16Array, terrain: Uint8Array, retombees: Uint8Array): Uint8Array {
  const n = proprio.length;
  const out = new Uint8Array(n * OCTETS_PAR_CASE);
  const vue = new DataView(out.buffer);
  for (let i = 0; i < n; i++) vue.setUint16(i * 2, proprio[i]!, true);
  out.set(terrain, n * 2);
  out.set(retombees, n * 3);
  return out;
}

/**
 * Relit l'état final d'une partie, écrit par le rejeu. Lève une erreur, en mots, si quoi que ce soit ne va pas : l'image garde
 * alors la vignette de la carte. `partie` : l'identifiant de la victoire à dessiner, que le fichier doit porter.
 */
export function lireEtatFinal(metaTexte: string, binaireGz: Uint8Array, partie: string): EtatFinal {
  let brut: unknown;
  try {
    brut = JSON.parse(metaTexte);
  } catch {
    throw new Error("description illisible");
  }
  const parsed = EtatFinalMeta.safeParse(brut);
  if (!parsed.success) throw new Error(`description au mauvais format (${parsed.error.issues[0]?.message ?? "?"})`);
  const meta = parsed.data;
  if (meta.partie !== partie) throw new Error("fichier d'une autre partie");
  const n = meta.largeur * meta.hauteur;
  let octets: Buffer;
  try {
    octets = gunzipSync(binaireGz, { maxOutputLength: n * OCTETS_PAR_CASE });
  } catch {
    throw new Error("cases illisibles");
  }
  if (octets.length !== n * OCTETS_PAR_CASE) throw new Error("nombre de cases inattendu");
  const proprio = new Uint16Array(n);
  for (let i = 0; i < n; i++) proprio[i] = octets.readUInt16LE(i * 2);
  const connus = new Set(meta.joueurs.map((j) => j.n));
  for (let i = 0; i < n; i++) if (proprio[i] !== 0 && !connus.has(proprio[i]!)) throw new Error("case d'un joueur inconnu");
  const terrain = new Uint8Array(octets.subarray(n * 2, n * 3));
  const retombees = new Uint8Array(octets.subarray(n * 3, n * 4));
  return { ...meta, proprio, terrain, retombees };
}

