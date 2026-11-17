/**
 * Le journal « Entre Gaulois » d'une partie, à côté du replay de « Revoir une partie » (demandes du pilote du 17 novembre 2026 :
 * « un chat des événements entre gal (don de troupe) (don argent) », puis, devant la liste de ce que le moteur annonce,
 * « vas-y ajoute tout ça ») : les dons, les éliminations, les bombes, les émojis, les cibles, les messages rapides et les
 * alliances où un Gaulois est en jeu.
 *
 * D'où ils viennent : le moteur d'OpenFront, quand le robot du site rejoue la partie (`scripts/rejeu-openfront/entree.ts`),
 * annonce chaque fait (`GameUpdateType`) : un don réussi avec le montant vraiment parti (un don refusé par le jeu n'y est donc
 * jamais), une élimination avec l'or pris, une bombe lancée, etc. Rien n'est estimé par le site. Une seule chose est déduite, au
 * rejeu : le joueur visé par une bombe est celui qui tenait la case visée à l'étape du lancement (le moteur annonce la case).
 *
 * Ce que le site en garde (`FILTRES`) : un fait n'entre au journal que si un joueur au tag du clan (`clients`) y tient le rôle
 * dit pour son code ; les robots du jeu, éliminés par dizaines, n'y sont jamais.
 *
 * Qui est nommé : un membre au pseudo public de la liste du clan, par ce pseudo ; un autre Gaulois (au tag du clan dans la
 * partie), par le pseudo qu'il y portait, sans son tag (`pseudoEnPartie` ; demande du pilote du 17 novembre 2026 : « tu peux
 * pas mettre les vrais pseudos, au lieu d'afficher Gaulois 1 » ; le replay d'à côté les montre déjà) ; un autre joueur, par le
 * tag de son clan s'il est au classement officiel (`nomsPubliables`, film-brut.ts). Tous les autres n'ont que leur camp : « un
 * coéquipier », « un adversaire », « une nation », « un robot » : jamais le pseudo d'un joueur d'un autre clan (on y trouve
 * des injures), jamais un identifiant. Un pseudo lu dans la partie n'est relié ni à une fiche ni à un Gaulois dessiné.
 *
 * Les messages rapides sont des phrases toutes faites du jeu, choisies dans une liste : le moteur n'en annonce que la clé. Leur
 * texte français vient de `resources/lang/fr.json` d'OpenFront, au commit de la partie (© OpenFront and Contributors,
 * CC BY-SA 4.0, section `chat`, lue par `scripts/filmer-parties.ts`, sans modification ; voir NOTICE.md). Une clé sans phrase
 * n'entre pas au journal. Les émojis sont ceux du jeu, vérifiés un à un (`EMOJI_PERMIS`).
 *
 * Les montants : l'or tel que le moteur le compte ; les troupes en dixièmes, comme le moteur, que l'écran du jeu divise par
 * dix (`renderTroops`, packages/engine-lib/src/Format.ts) : `montantAffiche` fait de même (`journal-ecran.ts`, ce que l'écran
 * en lit, sans Zod).
 */
import { z } from "zod";
import { EtatFinalMeta } from "../carte-finale";
import { equipeDesGaulois } from "./film-brut";
import { NOM_PERMIS } from "./film";
import { CAMPS, CODE_MAX, CODES, EMOJI_PERMIS, FAITS_MAX, FORMAT_DU_JOURNAL, FORME_DES_FAITS, ligneValable, PSEUDO_EN_PARTIE, type Camp } from "./journal-ecran";

export * from "./journal-ecran";

const Entier = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Ce que le rejeu laisse : l'étape, le code, puis les petits numéros des joueurs (0 : personne, ou tous) et un montant ou un texte. */
export const FaitsBruts = z.array(z.tuple([Entier, Entier.max(CODE_MAX)]).rest(z.union([Entier, z.string().max(80)]))).max(FAITS_MAX);

/**
 * Le journal d'une partie : l'étape où le rejeu s'arrête, les joueurs en jeu (nom publiable ou `null`, rang du camp dans
 * `CAMPS`, et `PSEUDO_EN_PARTIE` en troisième case quand le nom est le pseudo porté dans la partie), puis chaque fait dans l'ordre de la partie (`FORME_DES_FAITS` : l'étape, le code, les rangs des joueurs dans
 * `joueurs`, -1 pour personne, puis le montant, le genre ou le texte).
 */
export const Journal = z
  .object({
    format: z.literal(FORMAT_DU_JOURNAL),
    partie: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    fin: Entier.min(1),
    joueurs: z.array(z.union([z.tuple([z.string().regex(NOM_PERMIS).nullable(), Entier.max(CAMPS.length - 1)]), z.tuple([z.string().regex(NOM_PERMIS), z.literal(CAMPS.indexOf("gaulois")), z.literal(PSEUDO_EN_PARTIE)])])).max(2_000),
    faits: z.array(z.array(z.union([z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER), z.string().max(200)])).min(4).max(6)).max(FAITS_MAX),
  })
  .refine((j) => j.faits.every((f) => ligneValable(f, j.joueurs.length)), "fait au mauvais format")
  .refine((j) => j.faits.every((f, i) => i === 0 || (f[0] as number) >= (j.faits[i - 1]![0] as number)), "faits dans le désordre");
export type Journal = z.infer<typeof Journal>;

/** Les phrases des messages rapides, par « catégorie.clé », telles que le jeu les écrit en français. */
export type Phrases = ReadonlyMap<string, string>;
/** Une phrase du jeu : une ligne, sans caractère de contrôle ni chevron. */
const PHRASE_PERMISE = /^[^\p{Cc}\p{Cf}<>]{1,200}$/u;
/** Les phrases que le site ne reprend pas : elles renvoient au Discord d'OpenFront ou à son dépôt. */
const PHRASES_ECARTEES = new Set(["misc.join_discord", "misc.pr"]);

/**
 * Les phrases des messages rapides, d'après le fichier de langue du jeu (`resources/lang/fr.json`, section `chat`) : seules
 * les six catégories de phrases, sans les titres ni les versions courtes. Un fichier illisible, ou sans cette section : aucune
 * phrase, et les messages rapides n'entrent pas au journal.
 */
export function phrasesDuJeu(langue: string): Map<string, string> {
  const phrases = new Map<string, string>();
  let brut: unknown;
  try {
    brut = JSON.parse(langue);
  } catch {
    return phrases;
  }
  const chat = typeof brut === "object" && brut !== null ? (brut as { chat?: unknown }).chat : null;
  if (typeof chat !== "object" || chat === null) return phrases;
  for (const categorie of ["help", "attack", "defend", "greet", "misc", "warnings"]) {
    const liste = (chat as Record<string, unknown>)[categorie];
    if (typeof liste !== "object" || liste === null) continue;
    for (const [cle, texte] of Object.entries(liste)) {
      const nom = `${categorie}.${cle}`;
      if (typeof texte === "string" && /^[a-z0-9_]{1,40}$/.test(cle) && PHRASE_PERMISE.test(texte) && !PHRASES_ECARTEES.has(nom)) phrases.set(nom, texte);
    }
  }
  return phrases;
}

/** Ce que le site sait de la partie pour écrire son journal : comme pour son film (`PartieAFilmer`), plus les phrases du jeu. */
export interface PartieDuJournal {
  partie: string;
  clients: ReadonlySet<string>;
  noms: ReadonlyMap<string, string>;
  /** Le pseudo que chaque Gaulois portait dans la partie, par identifiant en partie (`pseudoEnPartie`). Absent : aucun. */
  pseudos?: ReadonlyMap<string, string>;
  phrases: Phrases;
}

/**
 * Le pseudo qu'un joueur portait dans la partie, tel que le journal peut l'écrire : sans le tag de clan en tête (« [GAL] »),
 * sur une ligne, 40 caractères au plus. `null` : rien d'écrivable (vide, ou seulement un tag).
 */
export function pseudoEnPartie(pseudo: string | null | undefined): string | null {
  if (typeof pseudo !== "string") return null;
  let net = pseudo
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(\[[^\]]{0,12}\]\s*)+/, "")
    .trim();
  // Coupé par caractères entiers : un émoji ne se casse pas en deux.
  net = [...net].slice(0, 40).join("").trim();
  while (net.length > 40) net = [...net].slice(0, -1).join("").trim();
  return net !== "" && !net.startsWith("[") && NOM_PERMIS.test(net) ? net : null;
}

/**
 * Qui doit être un Gaulois pour que le fait entre au journal, par code : `tous`, les deux premiers joueurs ; `premier`, le
 * premier (l'auteur) ; `un`, l'un des deux. Les dons : entre Gaulois seulement, comme le pilote l'a demandé. Un émoji reçu
 * d'un autre joueur est gardé aussi (`un`) ; un message rapide, une cible : seulement ceux d'un Gaulois.
 */
const FILTRES: Record<number, "tous" | "premier" | "un"> = {
  [CODES.donTroupes]: "tous",
  [CODES.donOr]: "tous",
  [CODES.elimination]: "un",
  [CODES.bombe]: "un",
  [CODES.emoji]: "un",
  [CODES.cible]: "premier",
  [CODES.message]: "premier",
  [CODES.allianceDemandee]: "un",
  [CODES.allianceAcceptee]: "un",
  [CODES.allianceRefusee]: "un",
  [CODES.allianceRompue]: "un",
  [CODES.allianceFinie]: "un",
  // Les embargos n'entrent pas au journal : le jeu les pose de lui-même contre chaque adversaire (95 en une partie à quatre
  // équipes, relevés sur la partie crm49gH7RY du 16 novembre 2026). Leurs codes restent, pour le jour où ils serviraient.
};

/**
 * Le journal d'une partie, d'après ce que le rejeu a laissé (`<sortie>.json`). `null` : ce rejeu n'a pas noté les faits (moteur
 * plus ancien, ou trop de faits) ; ce n'est pas « aucun fait ». Lève une erreur, en mots, si la description ne convient pas.
 * Un fait que le site ne sait pas lire (code inconnu, joueur inconnu, émoji ou phrase qui ne convient pas) est laissé de côté.
 */
export function journalDeLaPartie(metaTexte: string, partie: PartieDuJournal): Journal | null {
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
  const bruts = FaitsBruts.safeParse(notes);
  if (!bruts.success) throw new Error("faits au mauvais format");

  const parNumero = new Map(meta.joueurs.map((j) => [j.n, j]));
  const equipe = equipeDesGaulois(meta.joueurs, partie.clients);
  const campDe = (n: number): Camp | null => {
    const j = parNumero.get(n);
    if (!j) return null;
    if (j.client !== null && partie.clients.has(j.client)) return "gaulois";
    if (j.type === "BOT") return "robot";
    if (j.type !== "HUMAN") return "nation";
    return equipe !== null && j.equipe === equipe ? "equipe" : "adverse";
  };
  const rangs = new Map<number, number>();
  const joueurs: Journal["joueurs"] = [];
  const rang = (n: number): number => {
    let r = rangs.get(n);
    if (r === undefined) {
      const j = parNumero.get(n)!;
      const camp = campDe(n)!;
      const nom = j.client !== null ? partie.noms.get(j.client) : undefined;
      // Un Gaulois n'est nommé que par son pseudo : un tag (« [GAL] ») n'en est pas un.
      const publiable = nom && NOM_PERMIS.test(nom) && (camp === "gaulois" ? !nom.startsWith("[") : camp === "equipe" || camp === "adverse") ? nom : null;
      // Un Gaulois hors de la liste publique du clan : le pseudo qu'il portait dans la partie.
      const porte = publiable === null && camp === "gaulois" && j.client !== null ? pseudoEnPartie(partie.pseudos?.get(j.client)) : null;
      r = joueurs.push(porte !== null ? [porte, CAMPS.indexOf("gaulois"), PSEUDO_EN_PARTIE] : [publiable, CAMPS.indexOf(camp)]) - 1;
      rangs.set(n, r);
    }
    return r;
  };

  const gardes: Journal["faits"] = [];
  for (const ligne of [...bruts.data].sort((x, y) => x[0] - y[0])) {
    const [etape, code] = ligne;
    const forme = FORME_DES_FAITS[code];
    if (!forme || etape >= meta.tours || ligne.length !== 2 + forme.joueurs + (forme.fin === "rien" ? 0 : 1)) continue;
    const numeros = ligne.slice(2, 2 + forme.joueurs);
    if (!numeros.every((n, k): n is number => typeof n === "number" && (n === 0 ? forme.facultatifs.includes(k) : campDe(n) !== null))) continue;
    const camps = numeros.map((n) => (n === 0 ? null : campDe(n)));
    // Les robots du jeu, éliminés par dizaines, n'entrent jamais au journal.
    if (camps.includes("robot") || numeros[0] === numeros[1]) continue;
    const filtre = FILTRES[code];
    if (!filtre) continue;
    const gaulois = [camps[0] === "gaulois", camps[1] === "gaulois"];
    if (filtre === "tous" ? !(gaulois[0] && gaulois[1]) : filtre === "premier" ? !gaulois[0] : !(gaulois[0] || gaulois[1])) continue;
    // Un émoji ne vient jamais d'une nation dans le journal : elles répondent d'elles-mêmes à chaque don.
    if (code === CODES.emoji && camps[0] === "nation") continue;
    let fin = ligne[2 + forme.joueurs];
    if (forme.fin === "texte") {
      if (typeof fin !== "string") continue;
      if (code === CODES.message) {
        const phrase = partie.phrases.get(fin);
        // Une phrase qui parle d'un joueur a besoin de ce joueur.
        if (!phrase || (phrase.includes("[P1]") && numeros[2] === 0)) continue;
        fin = phrase;
      } else if (!EMOJI_PERMIS.test(fin)) continue;
    } else if (forme.fin !== "rien" && typeof fin !== "number") continue;
    const fait = [etape, code, ...numeros.map((n) => (n === 0 ? -1 : rang(n))), ...(fin === undefined ? [] : [fin])];
    if (ligneValable(fait, Number.MAX_SAFE_INTEGER)) gardes.push(fait);
  }
  return Journal.parse({ format: FORMAT_DU_JOURNAL, partie: partie.partie, fin: meta.tours, joueurs, faits: gardes });
}

/** Relit un journal gardé ou publié. Lève une erreur, en mots, s'il ne convient pas ou n'est pas celui de la partie. */
export function lireJournal(texte: string, partie: string): Journal {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error("journal illisible");
  }
  const lu = Journal.safeParse(brut);
  if (!lu.success) throw new Error("journal au mauvais format");
  if (lu.data.partie !== partie) throw new Error("journal d'une autre partie");
  return lu.data;
}

/**
 * Le journal à publier : un pseudo qui n'est plus sur la liste du clan, ou un tag qui n'est plus au classement officiel, n'y
 * reste pas ; son joueur n'a plus que son camp. Le pseudo porté dans la partie par un Gaulois reste : il ne vient pas de la liste.
 */
export function journalPublie(journal: Journal, encorePublie: (nom: string) => boolean): Journal {
  return { ...journal, joueurs: journal.joueurs.map((j) => (j.length === 3 ? j : [j[0] !== null && encorePublie(j[0]) ? j[0] : null, j[1]])) };
}
