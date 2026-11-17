/**
 * Le bilan des Gaulois d'une partie, sous le replay de « Revoir une partie », et le score d'utilité qui en sort (demande du
 * pilote, 17 novembre 2026 : l'argent généré, les villes et la puissance ennemies attaquées, celui qui donne le plus aux
 * alliés, « que chaque action des membres gal soit comptabilisée » ; puis « par partie et aussi classement général
 * uniquement pour les gaulois »). C'est, avec le niveau du compte, une exception voulue par le pilote à la règle « stats des
 * membres : `stats.team` uniquement » (CLAUDE.md) : des faits de partie, jamais mêlés aux stats du clan ni au classé.
 *
 * D'où viennent les nombres :
 *   - la fiche publique de la partie (`/public/game/:id`, `info.players[].stats`), que le jeu écrit lui-même à la fin :
 *     l'or (`gold` : 0 travail, 1 guerre, 2 commerce, 3 prises, 4 et 5 trains, 6 dons reçus), les attaques (`attacks` :
 *     0 troupes envoyées), les unités par type (`units` : 0 construites, 1 détruites, 2 prises, 3 perdues, 4 améliorées) et
 *     les éliminations (`conquests` : humains, nations, robots). Le sens de chaque case est celui du jeu
 *     (`src/core/StatsSchemas.ts` d'OpenFront, lu le 17 novembre 2026 ; aucun code n'en est repris) ;
 *   - les dons donnés, que la fiche ne compte pas : le moteur du jeu les annonce pendant le rejeu du robot
 *     (`faits` de la description, codes `donTroupes` et `donOr` de `journal-ecran.ts`), au montant vraiment parti.
 * Rien n'est estimé. Le calcul du score est dans `bilan-ecran.ts`.
 *
 * Qui y est : les joueurs au tag du clan de la partie (`clients`), nommés comme dans le journal « Entre Gaulois » : le pseudo
 * public de la liste du clan, sinon le pseudo porté dans la partie (`pseudoEnPartie`). Jamais un identifiant.
 */
import { z } from "zod";
import { EtatFinalMeta } from "../carte-finale";
import { NOM_PERMIS } from "./film";
import { FORMAT_DU_BILAN, GAULOIS_MAX, type GauloisDuBilan } from "./bilan-ecran";
import { FaitsBruts, pseudoEnPartie } from "./journal";
import { CODES } from "./journal-ecran";

export * from "./bilan-ecran";

const Entier = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const Bilan = z.object({
  format: z.literal(FORMAT_DU_BILAN),
  partie: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  gaulois: z
    .array(
      z
        .object({ nom: z.string().regex(NOM_PERMIS).nullable(), enPartie: z.boolean(), or: Entier, attaque: Entier, prises: Entier, eliminations: Entier, troupesDonnees: Entier, orDonne: Entier })
        .strict()
        .refine((g) => !(g.enPartie && g.nom === null), "pseudo de partie sans nom"),
    )
    .min(1)
    .max(GAULOIS_MAX),
});
export type Bilan = z.infer<typeof Bilan>;

/** Un nombre de la fiche : le jeu les écrit en texte (de grands entiers). Tout ce qui n'en est pas un compte pour zéro. */
function nombre(v: unknown): number {
  const n = typeof v === "string" && /^\d{1,30}$/.test(v) ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), Number.MAX_SAFE_INTEGER) : 0;
}
const caseDe = (liste: unknown, rang: number): number => (Array.isArray(liste) ? nombre(liste[rang]) : 0);
const somme = (liste: unknown): number => (Array.isArray(liste) ? liste.reduce((t: number, v) => t + nombre(v), 0) : 0);

/** Les cases de l'or produit par le joueur lui-même : le travail, le commerce, ses trains et ceux des autres qui passent chez lui. */
const OR_PRODUIT: readonly number[] = [0, 2, 4, 5];
/** Les unités ennemies détruites (1) ou prises (2), tous types confondus. */
const UNITES_PRISES: readonly number[] = [1, 2];

/** Ce que le site lit des stats d'un joueur dans la fiche de la partie. */
export function statsDuJoueur(stats: unknown): Pick<GauloisDuBilan, "or" | "attaque" | "prises" | "eliminations"> {
  const s = typeof stats === "object" && stats !== null ? (stats as Record<string, unknown>) : {};
  const unites = typeof s["units"] === "object" && s["units"] !== null ? Object.values(s["units"] as Record<string, unknown>) : [];
  return {
    or: OR_PRODUIT.reduce((t: number, k) => t + caseDe(s["gold"], k), 0),
    // Les troupes de la fiche sont en dixièmes, comme celles du moteur : celles de l'écran du jeu.
    attaque: Math.floor(caseDe(s["attacks"], 0) / 10),
    prises: unites.reduce((t: number, u) => t + UNITES_PRISES.reduce((x: number, k) => x + caseDe(u, k), 0), 0),
    eliminations: somme(s["conquests"]),
  };
}

/** Ce que le site sait de la partie pour écrire son bilan. */
export interface PartieDuBilan {
  partie: string;
  /** Les identifiants en partie des joueurs au tag du clan, d'après la fiche de la partie. */
  clients: ReadonlySet<string>;
  /** Les noms publiables, par identifiant en partie (`nomsPubliables`), et le pseudo porté dans la partie. */
  noms: ReadonlyMap<string, string>;
  pseudos: ReadonlyMap<string, string>;
  /** Les stats de chaque joueur de la fiche, par identifiant en partie. */
  stats: ReadonlyMap<string, unknown>;
}

/**
 * Le bilan d'une partie, d'après ce que le rejeu a laissé (`<sortie>.json`) et la fiche de la partie. `null` : ce rejeu n'a
 * pas noté les faits (les dons ne sont pas connus : pas de bilan, ce n'est pas « aucun don »), ou aucun Gaulois de la fiche
 * n'est dans le rejeu avec ses stats. Lève une erreur, en mots, si la description ne convient pas.
 */
export function bilanDeLaPartie(metaTexte: string, partie: PartieDuBilan): Bilan | null {
  let brut: unknown;
  try {
    brut = JSON.parse(metaTexte);
  } catch {
    throw new Error("description illisible");
  }
  const lue = EtatFinalMeta.safeParse(brut);
  if (!lue.success) throw new Error("description au mauvais format");
  const meta = lue.data;
  if (meta.partie !== partie.partie) throw new Error("fichier d'une autre partie");
  const notes = (brut as { faits?: unknown }).faits;
  if (notes === undefined) return null;
  const faits = FaitsBruts.safeParse(notes);
  if (!faits.success) throw new Error("faits au mauvais format");

  // Un Gaulois sans stats dans la fiche (jamais apparu sur la carte) n'entre pas au bilan : pas de données, ce n'est pas zéro.
  const aDesStats = (client: string) => typeof partie.stats.get(client) === "object" && partie.stats.get(client) !== null;
  const gaulois = meta.joueurs.filter((j) => j.client !== null && partie.clients.has(j.client) && aDesStats(j.client));
  if (gaulois.length === 0) return null;
  const donnes = new Map<number, { troupes: number; or: number }>(gaulois.map((j) => [j.n, { troupes: 0, or: 0 }]));
  for (const ligne of faits.data) {
    const [etape, code, de, a, montant] = ligne;
    if ((code !== CODES.donTroupes && code !== CODES.donOr) || ligne.length !== 5 || etape >= meta.tours) continue;
    if (typeof de !== "number" || typeof a !== "number" || typeof montant !== "number" || de === a) continue;
    const d = donnes.get(de);
    if (!d) continue;
    // Les troupes du moteur sont en dixièmes : celles de l'écran du jeu, comme dans le journal (`montantAffiche`).
    if (code === CODES.donTroupes) d.troupes += Math.floor(montant / 10);
    else d.or += montant;
  }
  return Bilan.parse({
    format: FORMAT_DU_BILAN,
    partie: partie.partie,
    gaulois: gaulois.map((j) => {
      const publiable = partie.noms.get(j.client!);
      const public_ = publiable && NOM_PERMIS.test(publiable) && !publiable.startsWith("[") ? publiable : null;
      const porte = public_ === null ? pseudoEnPartie(partie.pseudos.get(j.client!)) : null;
      const d = donnes.get(j.n)!;
      return { nom: public_ ?? porte, enPartie: public_ === null && porte !== null, ...statsDuJoueur(partie.stats.get(j.client!)), troupesDonnees: Math.min(d.troupes, Number.MAX_SAFE_INTEGER), orDonne: Math.min(d.or, Number.MAX_SAFE_INTEGER) };
    }),
  });
}

/** Relit un bilan gardé ou publié. Lève une erreur, en mots, s'il ne convient pas ou n'est pas celui de la partie. */
export function lireBilan(texte: string, partie: string): Bilan {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error("bilan illisible");
  }
  const lu = Bilan.safeParse(brut);
  if (!lu.success) throw new Error("bilan au mauvais format");
  if (lu.data.partie !== partie) throw new Error("bilan d'une autre partie");
  return lu.data;
}

/** Le bilan à publier : un pseudo public qui n'est plus sur la liste du clan n'y reste pas ; son joueur garde ses nombres, sans nom. */
export function bilanPublie(bilan: Bilan, encorePublie: (nom: string) => boolean): Bilan {
  return { ...bilan, gaulois: bilan.gaulois.map((g) => (g.enPartie || g.nom === null || encorePublie(g.nom) ? g : { ...g, nom: null })) };
}
