/**
 * Les victoires en duel sur Discord (chantier du duel « Coup pour coup », 22 novembre 2026, septième des neuf chantiers
 * choisis par le pilote) : après chaque victoire d'un membre sur un autre membre en duel de cartes, le robot poste une image,
 * « Jod bat Astérion en 7 manches », avec les deux Gaulois devant la bannière du lieu du duel : celle du vaincu pour un défi
 * contre sa main de défense, celle du Gaulois qui attendait dans la salle pour un match en direct (`banniere_du_lieu`).
 *
 * - **Ce qui est annoncé** : la file du serveur (`duel_annonces_a_envoyer`, réservée à la clé de service, migration du duel)
 *   donne chaque duel compté gagné, et chaque match de salle en direct gagné au combat (migration 20261122001000). Partent
 *   les victoires d'un membre sur la main de défense d'un autre membre, ou sur un autre membre en salle. Les essais
 *   joués pendant que le duel est fermé (`essai`, les parties du pilote) et les victoires contre le boss du jour, sans second
 *   Gaulois, sont notées sans être postées, comme une ligne illisible ou une victoire de plus de 48 heures.
 * - **Ce qui est écrit** : les pseudos publics du clan seulement (« Un Gaulois » sans pseudo public), le nombre de manches, la
 *   carte décisive (l'objet que le vainqueur a joué à la dernière manche) et la salle d'un duel misé. Jamais un solde, ni un
 *   gain en statères.
 * - **Où et quand** : toutes les 5 minutes, avec les victoires du clan et les achats (workflow `victoires.yml`), dans le
 *   salon des duels réglé dans Direction > Discord, sinon celui des achats, sinon celui des nouvelles (`SALON_REPLI`).
 *   Cinq images au plus par passage ; la suite part au passage suivant. Rien de plus vieux que 48 heures.
 * - **Une annonce partie ne repart pas** : chaque envoi accepté par Discord est gardé par le robot (cache du workflow,
 *   `DuelsSendState`), puis noté au serveur (`noter_annonces_duel`). Si le serveur ne prend pas la note, le passage
 *   s'arrête, et le suivant ne retente que la note. Un refus de Discord n'est pas noté : la victoire repart au passage
 *   suivant, jusqu'à 48 heures.
 * - **Le nom** : le pseudo public du clan (`pseudo` de l'annonce), jamais le nom du village (`nom`), que seuls les membres
 *   voient sur le site.
 *
 * Le message n'a pas de texte : l'image et un bouton vers « Mon Gaulois ». Le texte ne part que si l'image ne se dessine pas,
 * ou si Discord la refuse (`discord-post.ts`). L'image : `duels-image.ts`, sur la scène en cases de
 * `supabase/functions/code-discord/duel-image.ts`.
 */
import { z } from "zod";
import { imageMessage, postWithImage, textMessage, type LinkButton } from "./discord-post";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, RARETES_DES_OBJETS, lireTenue, type Tenue } from "./gaulois";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { parseNoted, siteLink } from "./salon-discord";
import { dateLongue, heureEnMots, nomDiscord } from "./achats-discord";
import { fmtInt } from "./format";
import { banniereParId } from "../../supabase/functions/code-discord/bannieres/index";
import { familierDe } from "../../supabase/functions/code-discord/familiers/index";

/** Les images d'un passage : au-delà, la suite part au passage suivant. */
export const DUELS_PAR_PASSAGE = 5;
/** Une victoire plus vieille n'est plus une nouvelle. */
export const TROP_ANCIEN_MS = 48 * 3_600_000;
/** Le chemin du bouton : « Mon Gaulois », où se joue le duel. */
export const CHEMIN_DU_DUEL = "/village";
/** Le bouton sous l'image : le seul lien vers le site, sans texte dans le message. */
export const BOUTON_DU_DUEL = "Mon Gaulois";
/** Ce qui manque d'un Gaulois sans pseudo public : il ne se nomme pas. */
export const SANS_PSEUDO = "Un Gaulois";
/** Le même, après le verbe : « Jod bat un Gaulois en 7 manches ». */
export const SANS_PSEUDO_APRES = "un Gaulois";
/** Les fonctions SQL du serveur, réservées à la clé de service (migration du duel, session « Duel : moteur et serveur »). */
export const FONCTION_DES_DUELS = "duel_annonces_a_envoyer";
export const FONCTION_DE_LA_NOTE = "noter_annonces_duel";
/** Le plus de manches qu'une annonce accepte : au-delà, la ligne est tenue pour mal formée. */
export const MANCHES_MAX = 99;

type EmplacementDObjet = (typeof EMPLACEMENTS_OBJETS)[number];

/** Un des deux Gaulois, tel que l'image le montre. */
export interface GauloisDuDuel {
  /** Le pseudo public du clan, remis d'aplomb ; `null` : pas de pseudo public, il s'écrit « Un Gaulois ». */
  pseudo: string | null;
  tenue: Tenue;
  /** Le familier montré, s'il est connu de ce code. */
  familier: string | null;
}

/** L'objet que le vainqueur a joué à la dernière manche. */
export interface CarteDecisive {
  emplacement: EmplacementDObjet;
  objet: string;
}

/** Une victoire à annoncer. */
export interface VictoireEnDuel {
  id: number;
  /** La fin du duel. */
  le: string;
  manches: number;
  /** La mise de la salle, en statères, ou `null` sans mise. */
  salle: number | null;
  /**
   * `null` : le serveur dit que le vaincu est tombé sans coup (fatigue, blessures). `"inconnue"` : le serveur nomme un objet
   * que ce code ne connaît pas encore ; l'image ne dit alors rien de la fin du duel, plutôt que d'inventer une cause.
   */
  carte: CarteDecisive | "inconnue" | null;
  /** La bannière du lieu du duel (du vaincu, ou de qui attendait dans la salle), si elle est connue de ce code. */
  lieu: string | null;
  vainqueur: GauloisDuDuel;
  vaincu: GauloisDuDuel;
}

/* ---------- Les mots ---------- */

/** Le nom d'un Gaulois, tel que l'image et le texte l'écrivent. */
export const nomDuGaulois = (g: Pick<GauloisDuDuel, "pseudo">): string => g.pseudo ?? SANS_PSEUDO;

/** « en 1 manche », « en 7 manches ». */
export const enManches = (n: number): string => `en ${fmtInt(n)} ${n > 1 ? "manches" : "manche"}`;

/** « Jod bat Astérion en 7 manches ». */
export const titreDuDuel = (v: Pick<VictoireEnDuel, "vainqueur" | "vaincu" | "manches">): string =>
  `${nomDuGaulois(v.vainqueur)} bat ${v.vaincu.pseudo ?? SANS_PSEUDO_APRES} ${enManches(v.manches)}`;

/** « Salle des 250 statères », ou `null` sans mise. */
export const salleEnMots = (salle: number | null): string | null => (salle === null ? null : `Salle des ${fmtInt(salle)} ${salle > 1 ? "statères" : "statère"}`);

/** Un objet que le duel peut jouer : un objet dessiné de la garde-robe, payant ou gratuit (les « cartes de base »). */
const objetJouable = (emplacement: EmplacementDObjet, id: string) => {
  const objet = OBJETS[emplacement]?.[id];
  return objet?.dessin ? objet : null;
};

/**
 * Une carte de base : un des objets gratuits de la garde-robe, que tout le monde a. Le duel lui donne la rareté « base »
 * (`RARETES_DU_DUEL` du moteur), pas celle de la garde-robe : l'image la dit « de base ».
 */
export const DE_BASE = "De base";

/**
 * La carte décisive : son nom, sa rareté (`null` pour une carte de base), sa rareté en mots et sa place. `null` : pas de
 * carte, ou objet inconnu.
 */
export function carteEnClair(carte: VictoireEnDuel["carte"]): { nom: string; rarete: keyof typeof RARETES_DES_OBJETS | null; rareteEnMots: string; place: string } | null {
  if (!carte || carte === "inconnue") return null;
  const objet = objetJouable(carte.emplacement, carte.objet);
  if (!objet) return null;
  const rarete = objet.gratuit ? null : objet.rarete;
  return { nom: objet.nom, rarete, rareteEnMots: rarete ? RARETES_DES_OBJETS[rarete].nom : DE_BASE, place: NOMS_EMPLACEMENTS[carte.emplacement].toLocaleLowerCase("fr") };
}

/** « le 22 novembre 2026 à 21 h 05 ». */
const quand = (le: string) => `le ${dateLongue(le)} à ${heureEnMots(le)}`;

/** Ce que dit l'image, phrase par phrase : pour un lecteur d'écran, et pour le texte de secours. */
export function duelEnMots(v: VictoireEnDuel): string[] {
  const lieu = v.lieu ? banniereParId(v.lieu) : null;
  const carte = carteEnClair(v.carte);
  const familier = (g: GauloisDuDuel) => (g.familier ? familierDe(g.familier)?.nom.toLocaleLowerCase("fr") : null);
  const avec = (g: GauloisDuDuel) => (familier(g) ? `, avec son familier (${familier(g)})` : "");
  return [
    `${titreDuDuel(v)}, en duel de cartes, ${quand(v.le)}.`,
    `${lieu ? `Devant la bannière « ${lieu.nom} », lieu du duel` : "Au village"} : ${nomDuGaulois(v.vainqueur)} debout${avec(v.vainqueur)}, ${nomDuGaulois(v.vaincu)} à terre${avec(v.vaincu)}.`,
    ...(carte ? [`Carte décisive : ${carte.nom} (${carte.rareteEnMots.toLocaleLowerCase("fr")}, ${carte.place}).`] : v.carte === null ? ["Pas de carte décisive : le vaincu est tombé sans coup."] : []),
    ...(v.salle !== null ? [`${salleEnMots(v.salle)}.`] : []),
    "Pseudos publics du clan seulement.",
  ];
}

/** La description de l'image : 1 024 caractères au plus. */
export const duelImageAlt = (v: VictoireEnDuel): string => duelEnMots(v).join(" ").slice(0, 1024);

const bouton = (site: string): LinkButton => ({ label: BOUTON_DU_DUEL, url: siteLink(site, CHEMIN_DU_DUEL) });

/** Le message. `image` : le fichier joint et sa description, avec le bouton, sans texte. Sans elle, le secours en texte. */
export function duelPayload(v: VictoireEnDuel, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (image) return imageMessage(site, image, [bouton(site)]);
  const [titre, ...reste] = duelEnMots(v);
  return textMessage(site, [`**${escapeDiscord(titre ?? "")}**`, ...reste.map(escapeDiscord), `[Jouer sur le site](<${siteLink(site, CHEMIN_DU_DUEL)}>)`].join("\n"));
}

export interface DuelSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  victoire: VictoireEnDuel;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (victoire: VictoireEnDuel) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'annonce en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. */
export function sendDuel({ link, victoire, renderImage, siteUrl, fetch, log }: DuelSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Duels",
    text: duelPayload(victoire, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(victoire);
      const filename = `duel-${victoire.id}.png`;
      return { payload: duelPayload(victoire, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

/* ---------- La lecture au serveur ---------- */

/**
 * Pourquoi une annonce de la file est notée sans être postée :
 * - `essai` : un duel joué pendant que le duel était fermé, un essai du pilote, qui ne part pas dans le salon du clan ;
 * - `boss` : une victoire contre le boss du jour, sans second Gaulois à montrer ;
 * - `illisible` : une forme ou une tenue que ce code ne sait pas lire ;
 * - `ancienne` : plus de 48 heures, ce n'est plus une nouvelle (décidé au passage, `duelsPass`).
 * Notées quand même, pour qu'elles ne retiennent pas la file, que le serveur rend par lots, la plus ancienne d'abord.
 */
export type RaisonDeLaisser = "essai" | "boss" | "illisible" | "ancienne";

/**
 * Ce que la lecture a donné :
 * - `lu` : `victoires` à annoncer, et `aLaisser`, les annonces à noter sans les poster ;
 * - `sans-reglage` : pas de `SUPABASE_URL` ou de clé de service, rien n'a été demandé ;
 * - `fonction-absente` : la migration du duel n'est pas encore collée dans Supabase ;
 * - `panne` : refus, délai dépassé ou réponse illisible.
 */
export type LectureDesDuels =
  | { etat: "lu"; victoires: VictoireEnDuel[]; aLaisser: { id: number; raison: RaisonDeLaisser }[] }
  | { etat: "sans-reglage" | "fonction-absente" | "panne"; warning: string };

/** Le numéro d'une partie : un bigint, que le serveur peut rendre en nombre ou en texte. */
const NumeroDePartie = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9][0-9]{0,15}$/).transform(Number)]);
const GauloisDuServeur = z.object({ pseudo: z.string().nullish(), tenue: z.unknown(), banniere: z.string().nullish(), familier: z.string().nullish() });
const LigneDuServeur = z.object({
  partie: NumeroDePartie,
  // Un match de salle en direct (migration 20261122001000) : la bannière de qui attendait dans la salle, `null` s'il n'en
  // montrait pas. Absente pour un défi contre une main de défense : le lieu est alors la bannière du vaincu.
  banniere_du_lieu: z.string().nullish(),
  essai: z.boolean(),
  le: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  contre: z.enum(["membre", "boss"]),
  manches: z.number().int().min(1).max(MANCHES_MAX),
  salle: z.number().int().positive().max(1_000_000).nullish(),
  // Absente : le serveur ne la donne pas encore ; `null` : le vaincu est tombé sans coup.
  carte: z.object({ emplacement: z.string(), objet: z.string() }).nullish(),
  vainqueur: GauloisDuServeur,
  vaincu: GauloisDuServeur.nullish(),
});
const ReponseDuServeur = z.object({ ok: z.literal(true), annonces: z.array(z.unknown()) });

/** Un Gaulois de la réponse, relu ; `null` si sa tenue ne se lit pas. Jamais son nom du village : seulement son pseudo public. */
function gauloisDe(brut: z.infer<typeof GauloisDuServeur>): GauloisDuDuel | null {
  const tenue = lireTenue(brut.tenue);
  if (!tenue) return null;
  const familier = brut.familier && familierDe(brut.familier) ? brut.familier : null;
  return { pseudo: nomDiscord(brut.pseudo), tenue, familier };
}

/**
 * La carte décisive : `null` si le serveur dit qu'il n'y en a pas, `"inconnue"` s'il n'en dit rien ou en nomme une que ce
 * code ne connaît pas.
 */
function carteDe(brut: z.infer<typeof LigneDuServeur>["carte"]): VictoireEnDuel["carte"] {
  if (brut === null) return null;
  if (brut === undefined) return "inconnue";
  const emplacement = EMPLACEMENTS_OBJETS.find((e) => e === brut.emplacement);
  return emplacement && objetJouable(emplacement, brut.objet) ? { emplacement, objet: brut.objet } : "inconnue";
}

/** La réponse du serveur, relue. `null` : illisible. Une ligne mal formée est laissée, et son numéro gardé s'il se lit. */
export function lireReponseDesDuels(data: unknown): Extract<LectureDesDuels, { etat: "lu" }> | null {
  const reponse = ReponseDuServeur.safeParse(data);
  if (!reponse.success) return null;
  const victoires: VictoireEnDuel[] = [];
  const aLaisser: { id: number; raison: RaisonDeLaisser }[] = [];
  for (const brut of reponse.data.annonces) {
    const ligne = LigneDuServeur.safeParse(brut);
    if (ligne.success && ligne.data.essai) {
      aLaisser.push({ id: ligne.data.partie, raison: "essai" });
      continue;
    }
    if (ligne.success && (ligne.data.contre === "boss" || !ligne.data.vaincu)) {
      aLaisser.push({ id: ligne.data.partie, raison: "boss" });
      continue;
    }
    const vainqueur = ligne.success ? gauloisDe(ligne.data.vainqueur) : null;
    const vaincu = ligne.success && ligne.data.vaincu ? gauloisDe(ligne.data.vaincu) : null;
    if (!ligne.success || !vainqueur || !vaincu) {
      const id = z.object({ partie: NumeroDePartie }).safeParse(brut);
      if (id.success) aLaisser.push({ id: id.data.partie, raison: "illisible" });
      continue;
    }
    // Le lieu du duel : la bannière de qui attendait dans la salle quand l'annonce la donne (même `null`), sinon celle du
    // vaincu ; seulement si ce code la connaît.
    const banniere = ligne.data.banniere_du_lieu !== undefined ? ligne.data.banniere_du_lieu : ligne.data.vaincu?.banniere;
    victoires.push({
      id: ligne.data.partie,
      le: new Date(ligne.data.le).toISOString(),
      manches: ligne.data.manches,
      salle: ligne.data.salle ?? null,
      carte: carteDe(ligne.data.carte),
      lieu: banniere && banniereParId(banniere) ? banniere : null,
      vainqueur,
      vaincu,
    });
  }
  victoires.sort((a, b) => Date.parse(a.le) - Date.parse(b.le) || a.id - b.id);
  return { etat: "lu", victoires, aLaisser };
}

/** Les deux appels au serveur, avec la clé de service. Chacun lève une erreur si le serveur refuse ou ne répond pas. */
export interface DuelsCalls {
  lire: (url: string, key: string) => Promise<unknown>;
  noter: (url: string, key: string, parties: readonly number[]) => Promise<unknown>;
}

/** Au-delà, le serveur est tenu pour absent : le même délai que les liens des salons (`DIRECTION_TIMEOUT_MS`). */
export const DUELS_TIMEOUT_MS = 10_000;

async function client(url: string, key: string) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const appelsSupabase: DuelsCalls = {
  lire: async (url, key) => {
    const { data, error } = await (await client(url, key)).rpc(FONCTION_DES_DUELS).abortSignal(AbortSignal.timeout(DUELS_TIMEOUT_MS));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  },
  noter: async (url, key, parties) => {
    const { data, error } = await (await client(url, key)).rpc(FONCTION_DE_LA_NOTE, { p_parties: parties }).abortSignal(AbortSignal.timeout(DUELS_TIMEOUT_MS));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if ((data as { ok?: unknown } | null)?.ok !== true) throw new Error("le serveur a refusé la note");
    return data;
  },
};

const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*(duel_annonces_a_envoyer|noter_annonces_duel)\b.* does not exist/i.test(e.message);
}

/** Un message d'erreur qui ne peut contenir ni lien ni clé : tout ce qui y ressemble est remplacé par « … », puis il est coupé. */
export function messageSur(e: unknown, secrets: readonly string[]): string {
  let texte = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…");
  for (const secret of secrets) if (secret.length >= 4) texte = texte.split(secret).join("…");
  return texte
    .replace(/\b[0-9a-fA-F]{32,}\b/g, "…")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]+/g, "…")
    .slice(0, 160);
}

/** Le serveur, avec l'environnement de l'Action : lire la file, et noter des annonces traitées. */
export interface ServeurDesDuels {
  lire: () => Promise<LectureDesDuels>;
  /** Lève une erreur si la note n'a pas pu être prise. */
  noter: (parties: readonly number[]) => Promise<void>;
}

export function serveurDesDuels(env: Record<string, string | undefined> = process.env, calls: DuelsCalls = appelsSupabase): ServeurDesDuels {
  const url = env["SUPABASE_URL"]?.trim();
  const key = env["SUPABASE_SECRET_KEY"]?.trim();
  return {
    lire: async () => {
      if (!url || !key) return { etat: "sans-reglage", warning: "pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, rien de lu" };
      try {
        const lu = lireReponseDesDuels(await calls.lire(url, key));
        return lu ?? { etat: "panne", warning: "réponse du serveur illisible, rien de lu" };
      } catch (e) {
        if (fonctionAbsente(e)) return { etat: "fonction-absente", warning: "la migration du duel n'est pas encore collée dans Supabase, rien de lu" };
        return { etat: "panne", warning: `lecture impossible (${messageSur(e, [url, key])}), rien de lu` };
      }
    },
    noter: async (parties) => {
      if (!url || !key) throw new Error("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY");
      try {
        await calls.noter(url, key, parties);
      } catch (e) {
        throw new Error(messageSur(e, [url, key]));
      }
    },
  };
}

/* ---------- Le passage du robot ---------- */

/**
 * Ce que le robot garde lui-même des envois, dans le cache du workflow (`.cache/duels-envoi.json`) : chaque victoire acceptée
 * par Discord, notée avant de le dire au serveur. Si le serveur ne prend pas la note, la victoire n'est jamais renvoyée : le
 * passage suivant retente seulement la note. Gardée 48 heures de plus que la victoire, puis oubliée.
 */
export const DuelsSendState = z.object({
  envoyees: z.array(z.object({ id: z.number().int().positive(), le: z.iso.datetime() })),
});
export type DuelsSendState = z.infer<typeof DuelsSendState>;

/** L'état gardé. Illisible ou absent : vide, avec un avertissement s'il était illisible. */
export const parseDuelsState = (raw: string | null) => parseNoted(DuelsSendState, raw, "les victoires que le serveur n'a pas notées pourraient repartir une fois");

/** L'état sans ce qui a plus de deux fois l'âge d'une victoire encore annoncée. */
const sansLesVieilles = (state: DuelsSendState, now: Date): DuelsSendState => ({ envoyees: state.envoyees.filter((e) => Date.parse(e.le) >= now.getTime() - 2 * TROP_ANCIEN_MS) });

export interface DuelsPassDeps {
  serveur: ServeurDesDuels;
  /** L'état gardé au passage d'avant ; `null` : rien de gardé. */
  stored: DuelsSendState | null;
  now: Date;
  send: (victoire: VictoireEnDuel) => Promise<boolean>;
  /** Garde l'état, aussitôt une victoire acceptée par Discord, avant de la noter au serveur. */
  note: (state: DuelsSendState) => void;
  log: (line: string) => void;
}

const raison = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ce que dit le journal des annonces laissées, par raison. */
const LAISSEES: Readonly<Record<RaisonDeLaisser, (n: number) => string>> = {
  essai: (n) => `::notice::Duels : ${n > 1 ? `${n} essais` : "1 essai"} du pilote, joué${n > 1 ? "s" : ""} pendant que le duel est fermé, noté${n > 1 ? "s" : ""} sans être posté${n > 1 ? "s" : ""}.`,
  boss: (n) => `Duels : ${n > 1 ? `${n} victoires` : "1 victoire"} contre le boss du jour, sans second Gaulois à montrer, noté${n > 1 ? "es" : "e"} sans être posté${n > 1 ? "es" : "e"}.`,
  illisible: (n) => `::warning::Duels : ${n > 1 ? `${n} annonces` : "1 annonce"} que ce code ne sait pas lire (forme ou tenue inconnue), noté${n > 1 ? "es" : "e"} sans être posté${n > 1 ? "es" : "e"}.`,
  ancienne: (n) => `Duels : ${n > 1 ? `${n} victoires` : "1 victoire"} de plus de 48 heures, noté${n > 1 ? "es" : "e"} sans être posté${n > 1 ? "es" : "e"}.`,
};

/**
 * Un passage du robot : lit la file, envoie au besoin, note chaque envoi, au robot puis au serveur. `failed` : quelque chose
 * n'a pas marché. Un refus de Discord n'est pas noté : la victoire repart au passage suivant, jusqu'à 48 heures.
 */
export async function duelsPass({ serveur, stored, now, send, note, log }: DuelsPassDeps): Promise<{ failed: boolean; envoyees: number }> {
  const lecture = await serveur.lire();
  if (lecture.etat !== "lu") {
    log(`${lecture.etat === "panne" ? "::warning::" : "::notice::"}Duels : ${lecture.warning}.`);
    return { failed: lecture.etat === "panne", envoyees: 0 };
  }
  let state = sansLesVieilles(stored ?? { envoyees: [] }, now);
  const dejaParties = new Set(state.envoyees.map((e) => e.id));
  let failed = false;
  /** Note des annonces au serveur ; `false` : la note n'a pas pris, le passage s'arrête. */
  const noter = async (parties: readonly number[], quoi: string) => {
    if (parties.length === 0) return true;
    try {
      await serveur.noter(parties);
      return true;
    } catch (e) {
      log(`::warning::Duels : ${quoi} non noté${parties.length > 1 ? "s" : ""} au serveur (n° ${parties.join(", ")} ; ${raison(e)}).`);
      failed = true;
      return false;
    }
  };

  // D'abord, ce qui ne part pas : essais, boss, lignes illisibles, victoires trop vieilles, et ce qui est déjà parti.
  const limite = now.getTime() - TROP_ANCIEN_MS;
  const aLaisser = [...lecture.aLaisser, ...lecture.victoires.filter((v) => !dejaParties.has(v.id) && Date.parse(v.le) < limite).map((v) => ({ id: v.id, raison: "ancienne" as const }))];
  const dejaEnvoyees = lecture.victoires.filter((v) => dejaParties.has(v.id)).map((v) => v.id);
  if (!(await noter(aLaisser.map((a) => a.id), "annonces laissées"))) return { failed, envoyees: 0 };
  for (const [r, phrase] of Object.entries(LAISSEES) as [RaisonDeLaisser, (n: number) => string][]) {
    const n = aLaisser.filter((a) => a.raison === r).length;
    if (n > 0) log(phrase(n));
  }
  // Déjà acceptées par Discord, mais pas notées au serveur : seulement la note, jamais une seconde image.
  if (!(await noter(dejaEnvoyees, "envois déjà faits"))) return { failed, envoyees: 0 };
  if (dejaEnvoyees.length > 0) log(`Duels : ${dejaEnvoyees.length > 1 ? `${dejaEnvoyees.length} victoires déjà envoyées, enfin notées` : "1 victoire déjà envoyée, enfin notée"} au serveur.`);

  const laissees = new Set([...aLaisser.map((a) => a.id), ...dejaEnvoyees]);
  const aEnvoyer = lecture.victoires.filter((v) => !laissees.has(v.id));
  let envoyees = 0;
  for (const victoire of aEnvoyer) {
    if (envoyees >= DUELS_PAR_PASSAGE) break;
    if (!(await send(victoire))) {
      failed = true;
      break;
    }
    envoyees++;
    state = { envoyees: [...state.envoyees, { id: victoire.id, le: victoire.le }] };
    note(state);
    log(`::notice::Duels : victoire n° ${victoire.id} (${enManches(victoire.manches)}), annonce acceptée par Discord.`);
    // Sans cette note, l'état gardé empêche un second envoi : le passage suivant la retente.
    if (!(await noter([victoire.id], "envoi"))) return { failed, envoyees };
  }
  const reste = aEnvoyer.length - envoyees;
  if (reste > 0 && !failed) log("Duels : la suite partira au prochain passage.");
  if (lecture.victoires.length === 0 && lecture.aLaisser.length === 0) log("Duels : rien à envoyer.");
  return { failed, envoyees };
}
