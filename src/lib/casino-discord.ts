/**
 * Les gros gains du casino sur Discord (demande du pilote, 26 novembre 2026 : « c'est dommage qu'on reçoit pas de notifs
 * pour le casino comme pour l'achat de cosmétiques ou ouverture de pochettes » ; maquette validée le même jour, règle
 * choisie : « 1 000 statères ou plus »). Après chaque coup du casino qui gagne au moins 1 000 statères, le robot poste une
 * image : le nom Discord du joueur, « 100 fois sa mise à la machine du forgeron », les statères gagnés et la mise, la vraie
 * chance du coup, et le jeu dessiné avec son vrai tirage.
 *
 * - **Ce qui est annoncé** : la file du serveur (`casino_annonces_a_envoyer`, réservée à la clé de service, migration
 *   20261126000100) donne chaque coup fini qui gagne au moins `SEUIL_DU_CASINO` statères (ce qui revient, moins la mise),
 *   joué après l'installation, jamais un essai du mode GOD, jamais le vingt-et-un (il ne gagne pas autant), d'un compte
 *   encore validé, de moins de 48 heures. Jamais chaque coup, jamais une perte, jamais un solde, aucun classement.
 * - **Rien d'inventé** : le robot refait le compte avec les règles du site (`src/lib/village/casino/`) ; un coup dont le
 *   tirage ne rend pas ce que dit le serveur, ou qui gagne moins que le seuil, est noté sans être posté (`illisible`).
 *   La chance est celle de ce rendu-là avec les mêmes paris, calculée sur toutes les issues du jeu, sans arrondi.
 * - **Où et quand** : toutes les 5 minutes, après les duels (workflow `victoires.yml`), dans le salon du casino réglé dans
 *   Direction > Discord, sinon celui des achats, sinon celui des nouvelles (`SALON_REPLI`). Cinq images au plus par passage ;
 *   la suite part au passage suivant.
 * - **Une annonce partie ne repart pas** : chaque envoi accepté par Discord est gardé par le robot (cache du workflow,
 *   `CasinoSendState`), puis noté au serveur (`noter_annonces_casino`). Si le serveur ne prend pas la note, le passage
 *   s'arrête, et le suivant ne retente que la note. Un refus de Discord n'est pas noté : le coup repart au passage suivant.
 * - **Le nom** : celui de l'annonce des achats, « @ » et le nom Discord, sinon le pseudo du clan, sinon « Gaulois n° ».
 *
 * Le message n'a pas de texte : l'image et un bouton vers « Mon Gaulois ». Le texte ne part que si l'image ne se dessine pas,
 * ou si Discord la refuse (`discord-post.ts`). L'image : `casino-image.ts`.
 */
import { z } from "zod";
import { dateLongue, heureEnMots, nomAffiche, nomDiscord } from "./achats-discord";
import { messageSur } from "./duels-discord";
import { imageMessage, postWithImage, textMessage, type LinkButton } from "./discord-post";
import { fmtInt } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { parseNoted, siteLink } from "./salon-discord";
import { COULOIRS, TOTAL_DES_PARTS, renduDeLaCourse } from "./village/casino/course";
import { verifierLesParis } from "./village/casino/commun";
import { IDS_DES_DES, payerLesDes } from "./village/casino/des";
import { FOIS_DE_LA_MACHINE, SUR_MILLE_DE_LA_MACHINE, lireLaLigne, renduDeLaMachine } from "./village/casino/machine";
import { CHANCES_DES_COUPES, DIXIEMES_DES_COUPES, RANGEES, coupeDe, renduDeLaCoupe } from "./village/casino/palissade";
import { IDS_DE_LA_ROUE, payerLaRoue } from "./village/casino/roue";
import type { ResultatDeLaMachine } from "./village/contrat-casino";

/** Le gain d'un coup, au moins, pour qu'il soit annoncé : celui du serveur (`internal.casino_annonce_seuil`), choisi par le pilote. */
export const SEUIL_DU_CASINO = 1000;
/** Les images d'un passage : au-delà, la suite part au passage suivant. */
export const CASINO_PAR_PASSAGE = 5;
/** Au-delà, un gain n'est plus une nouvelle : le serveur ne le rend plus. */
export const TROP_ANCIEN_MS = 48 * 3_600_000;
export const CHEMIN_DU_CASINO = "/village";
export const BOUTON_DU_CASINO = "Mon Gaulois";
export const FONCTION_DU_CASINO = "casino_annonces_a_envoyer";
export const FONCTION_DE_LA_NOTE = "noter_annonces_casino";

/** Les jeux annoncés : tous ceux du casino, sauf le vingt-et-un, qui ne gagne jamais autant. */
export const JEUX_ANNONCES = ["roue", "machine", "course", "palissade", "des"] as const;
export type JeuAnnonce = (typeof JEUX_ANNONCES)[number];

/** Le nom de chaque jeu, comme dans le hall : « à la machine du forgeron » ; et ce qu'il rend en moyenne, en une phrase. */
export const JEUX: Readonly<Record<JeuAnnonce, { a: string; moyenne: string }>> = {
  roue: { a: "à la roue du charron", moyenne: "La roue rend en moyenne la mise." },
  machine: { a: "à la machine du forgeron", moyenne: "La machine rend en moyenne la mise." },
  course: { a: "à la course des familiers", moyenne: "La course rend en moyenne la mise." },
  palissade: { a: "à la palissade", moyenne: "La palissade rend en moyenne la mise." },
  des: { a: "aux dés", moyenne: "Les dés rendent en moyenne la mise." },
};

/** Le tirage d'un coup, tel que le serveur l'a gardé, avec les paris d'une table. */
export type TirageDuCoup =
  | { jeu: "roue"; numero: number; paris: Record<string, number> }
  | { jeu: "machine"; resultat: ResultatDeLaMachine; ligne: [number, number, number] }
  | { jeu: "course"; couloir: number; gagnant: number }
  | { jeu: "palissade"; coupe: number }
  | { jeu: "des"; faces: [number, number]; paris: Record<string, number> };

/** Un gros gain, relu et recompté. */
export interface GrosGain {
  /** Le numéro de la partie, au serveur. */
  id: number;
  /** La fin du coup (ISO). */
  le: string;
  mise: number;
  /** Ce qui est revenu, mise comprise. */
  rendu: number;
  tirage: TirageDuCoup;
  /** Le nom de secours : le pseudo du clan, sinon « Gaulois n° ». */
  nom: string;
  /** Le nom d'utilisateur Discord, s'il est connu et se lit. */
  discord: string | null;
}

/** Les statères gagnés : ce qui revient, moins la mise. */
export const gainDe = (g: Pick<GrosGain, "mise" | "rendu">): number => g.rendu - g.mise;

/** « 100 fois », « 7,2 fois », ou « plus de 7,1 fois » quand le dixième ne tombe pas juste. */
export function foisEnMots(rendu: number, mise: number): string {
  if (rendu % mise === 0) return `${fmtInt(rendu / mise)} fois`;
  const dixiemes = Math.floor((rendu * 10) / mise);
  const ecrit = String(dixiemes / 10).replace(".", ",");
  return (rendu * 10) % mise === 0 ? `${ecrit} fois` : `plus de ${ecrit} fois`;
}

/** « 100 fois sa mise à la machine du forgeron ». */
export const titreDuGain = (g: Pick<GrosGain, "mise" | "rendu" | "tirage">): string => `${foisEnMots(g.rendu, g.mise)} sa mise ${JEUX[g.tirage.jeu].a}`;

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));

/**
 * La chance de ce coup : sur toutes les issues du jeu, également probables, celles qui rendent exactement autant avec les
 * mêmes paris. `sur` et `parmi` réduits : 1 sur 500 à la machine pour 100 fois la mise, 1 sur 24 au couloir de 24 fois,
 * 1 sur 128 aux coupes du bord de la palissade, sur 36 à la roue et aux dés.
 */
export function chanceDuCoup(g: Pick<GrosGain, "mise" | "rendu" | "tirage">): { sur: number; parmi: number } {
  const t = g.tirage;
  let sur: number;
  let parmi: number;
  if (t.jeu === "machine") {
    sur = SUR_MILLE_DE_LA_MACHINE[t.resultat] ?? 0;
    parmi = 1000;
  } else if (t.jeu === "course") {
    sur = COULOIRS[t.couloir]?.parts ?? 0;
    parmi = TOTAL_DES_PARTS;
  } else if (t.jeu === "palissade") {
    sur = DIXIEMES_DES_COUPES.reduce((s, d, k) => s + (renduDeLaCoupe(g.mise, k) === g.rendu ? (CHANCES_DES_COUPES[k] ?? 0) : 0), 0);
    parmi = 2 ** RANGEES;
  } else if (t.jeu === "roue") {
    sur = Array.from({ length: 36 }, (_, i) => payerLaRoue(t.paris, i + 1).total).filter((r) => r === g.rendu).length;
    parmi = 36;
  } else {
    sur = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (payerLesDes(t.paris, [a, b]).total === g.rendu) sur++;
    parmi = 36;
  }
  const d = sur > 0 ? pgcd(sur, parmi) : 1;
  return { sur: sur / d, parmi: parmi / d };
}

/** « 1 sur 500 », « 5 sur 36 ». */
export const chanceEnMots = (c: { sur: number; parmi: number }): string => `${fmtInt(c.sur)} sur ${fmtInt(c.parmi)}`;

/** Le pied de l'image, et la dernière ligne du texte de secours. */
export const MISE_EN_STATERES = "Misé en statères, qui viennent des points rapportés au clan.";

/** « Une chance sur 500. », « 5 chances sur 36. » */
export const chanceEnPhrase = (c: { sur: number; parmi: number }): string => `${c.sur > 1 ? `${fmtInt(c.sur)} chances` : "Une chance"} sur ${fmtInt(c.parmi)}.`;

/** Ce que l'image dit, en phrases : la description de l'image, et le texte de secours. */
export function gainEnMots(g: GrosGain): string[] {
  const fois = foisEnMots(g.rendu, g.mise);
  return [
    `${nomAffiche(g)} gagne ${fmtInt(gainDe(g))} statères ${JEUX[g.tirage.jeu].a}.`,
    `${fois.charAt(0).toUpperCase()}${fois.slice(1)} sa mise de ${fmtInt(g.mise)}, le ${dateLongue(g.le)} à ${heureEnMots(g.le)}.`,
    `${chanceEnPhrase(chanceDuCoup(g))} ${JEUX[g.tirage.jeu].moyenne}`,
    MISE_EN_STATERES,
  ];
}

/** La description de l'image : 1 024 caractères au plus. */
export const casinoImageAlt = (g: GrosGain): string => gainEnMots(g).join(" ").slice(0, 1024);

const bouton = (site: string): LinkButton => ({ label: BOUTON_DU_CASINO, url: siteLink(site, CHEMIN_DU_CASINO) });

/** Le message. `image` : le fichier joint et sa description, avec le bouton, sans texte. Sans elle, le secours en texte. */
export function casinoPayload(g: GrosGain, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (image) return imageMessage(site, image, [bouton(site)]);
  const [titre, ...reste] = gainEnMots(g);
  const pied = reste.pop() ?? "";
  return textMessage(site, [`**${escapeDiscord(titre ?? "")}**`, ...reste.map(escapeDiscord), `[Jouer sur le site](<${siteLink(site, CHEMIN_DU_CASINO)}>)`, `-# ${pied}`].join("\n"));
}

export interface CasinoSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  gain: GrosGain;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (gain: GrosGain) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'annonce en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. */
export function sendCasino({ link, gain, renderImage, siteUrl, fetch, log }: CasinoSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Casino",
    text: casinoPayload(gain, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(gain);
      const filename = `casino-${gain.id}.png`;
      return { payload: casinoPayload(gain, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

/* ---------- La lecture au serveur ---------- */

/**
 * Ce que la lecture a donné :
 * - `lu` : `gains` à annoncer, et `illisibles`, les coups à noter sans les poster (forme inconnue, compte qui ne tombe pas
 *   juste avec les règles du site, gain sous le seuil) ;
 * - `sans-reglage` : pas de `SUPABASE_URL` ou de clé de service, rien n'a été demandé ;
 * - `fonction-absente` : la migration n'est pas encore collée dans Supabase ;
 * - `panne` : refus, délai dépassé ou réponse illisible.
 */
export type LectureDuCasino = { etat: "lu"; gains: GrosGain[]; illisibles: number[] } | { etat: "sans-reglage" | "fonction-absente" | "panne"; warning: string };

const NumeroDePartie = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9][0-9]{0,15}$/).transform(Number)]);
const Montant = z.number().int().positive().max(1_000_000);
const Paris = z.record(z.string(), z.number());
const Face = z.number().int().min(1).max(6);
const LigneDuServeur = z.object({
  partie: NumeroDePartie,
  le: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  jeu: z.enum(JEUX_ANNONCES),
  mise: Montant,
  rendu: z.number().int().min(0).max(1_000_000),
  paris: z.unknown(),
  resultat: z.unknown(),
  nom: z.string().min(1).max(80),
  discord: z.string().nullish(),
});
const ReponseDuServeur = z.object({ ok: z.literal(true), annonces: z.array(z.unknown()) });

/** Le tirage d'une ligne, relu et vérifié avec les règles du site ; `null` s'il ne se lit pas ou ne rend pas ce que dit le serveur. */
function tirageDe(l: z.infer<typeof LigneDuServeur>): TirageDuCoup | null {
  if (l.jeu === "roue" || l.jeu === "des") {
    const paris = Paris.safeParse(l.paris);
    const ids = l.jeu === "roue" ? IDS_DE_LA_ROUE : IDS_DES_DES;
    const verifies = paris.success ? verifierLesParis(paris.data, ids) : null;
    if (!paris.success || !verifies?.ok || verifies.total !== l.mise) return null;
    if (l.jeu === "roue") {
      const r = z.object({ numero: z.number().int().min(1).max(36) }).safeParse(l.resultat);
      if (!r.success || payerLaRoue(paris.data, r.data.numero).total !== l.rendu) return null;
      return { jeu: "roue", numero: r.data.numero, paris: paris.data };
    }
    const r = z.object({ faces: z.tuple([Face, Face]) }).safeParse(l.resultat);
    if (!r.success || payerLesDes(paris.data, r.data.faces).total !== l.rendu) return null;
    return { jeu: "des", faces: r.data.faces, paris: paris.data };
  }
  if (l.jeu === "machine") {
    const Symbole = z.number().int().min(0).max(FOIS_DE_LA_MACHINE.length - 1);
    const Rouleau = z.tuple([Symbole, Symbole, Symbole]);
    const r = z.object({ resultat: z.number().int().min(-1).max(FOIS_DE_LA_MACHINE.length - 1), cases: z.tuple([Rouleau, Rouleau, Rouleau]) }).safeParse(l.resultat);
    if (!r.success) return null;
    const resultat = r.data.resultat as ResultatDeLaMachine;
    if (lireLaLigne(r.data.cases) !== resultat || renduDeLaMachine(l.mise, resultat) !== l.rendu) return null;
    return { jeu: "machine", resultat, ligne: [r.data.cases[0][1], r.data.cases[1][1], r.data.cases[2][1]] };
  }
  if (l.jeu === "course") {
    const Couloir = z.number().int().min(0).max(COULOIRS.length - 1);
    const r = z.object({ couloir: Couloir, gagnant: Couloir }).safeParse(l.resultat);
    if (!r.success || renduDeLaCourse(l.mise, r.data.couloir, r.data.gagnant) !== l.rendu) return null;
    return { jeu: "course", couloir: r.data.couloir, gagnant: r.data.gagnant };
  }
  const r = z.object({ chemin: z.array(z.union([z.literal(0), z.literal(1)])).length(RANGEES), coupe: z.number().int().min(0).max(RANGEES) }).safeParse(l.resultat);
  if (!r.success || coupeDe(r.data.chemin) !== r.data.coupe || renduDeLaCoupe(l.mise, r.data.coupe) !== l.rendu) return null;
  return { jeu: "palissade", coupe: r.data.coupe };
}

/** La réponse du serveur, relue. `null` : illisible. Une ligne mal formée est laissée, et son numéro gardé s'il se lit. */
export function lireReponseDuCasino(data: unknown): Extract<LectureDuCasino, { etat: "lu" }> | null {
  const reponse = ReponseDuServeur.safeParse(data);
  if (!reponse.success) return null;
  const gains: GrosGain[] = [];
  const illisibles: number[] = [];
  for (const brut of reponse.data.annonces) {
    const ligne = LigneDuServeur.safeParse(brut);
    const tirage = ligne.success ? tirageDe(ligne.data) : null;
    if (!ligne.success || !tirage || ligne.data.rendu - ligne.data.mise < SEUIL_DU_CASINO) {
      const id = z.object({ partie: NumeroDePartie }).safeParse(brut);
      if (id.success) illisibles.push(id.data.partie);
      continue;
    }
    gains.push({
      id: ligne.data.partie,
      le: new Date(ligne.data.le).toISOString(),
      mise: ligne.data.mise,
      rendu: ligne.data.rendu,
      tirage,
      nom: ligne.data.nom,
      discord: nomDiscord(ligne.data.discord),
    });
  }
  gains.sort((a, b) => a.id - b.id);
  return { etat: "lu", gains, illisibles };
}

/** Les deux appels au serveur, avec la clé de service. Chacun lève une erreur si le serveur refuse ou ne répond pas. */
export interface CasinoCalls {
  lire: (url: string, key: string) => Promise<unknown>;
  noter: (url: string, key: string, parties: readonly number[]) => Promise<unknown>;
}

/** Au-delà, le serveur est tenu pour absent : le même délai que les duels. */
export const CASINO_TIMEOUT_MS = 10_000;

async function client(url: string, key: string) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const appelsSupabase: CasinoCalls = {
  lire: async (url, key) => {
    const { data, error } = await (await client(url, key)).rpc(FONCTION_DU_CASINO).abortSignal(AbortSignal.timeout(CASINO_TIMEOUT_MS));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  },
  noter: async (url, key, parties) => {
    const { data, error } = await (await client(url, key)).rpc(FONCTION_DE_LA_NOTE, { p_parties: parties }).abortSignal(AbortSignal.timeout(CASINO_TIMEOUT_MS));
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if ((data as { ok?: unknown } | null)?.ok !== true) throw new Error("le serveur a refusé la note");
    return data;
  },
};

const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*(casino_annonces_a_envoyer|noter_annonces_casino)\b.* does not exist/i.test(e.message);
}

/** Le serveur, avec l'environnement de l'Action : lire la file, et noter des coups traités. */
export interface ServeurDuCasino {
  lire: () => Promise<LectureDuCasino>;
  /** Lève une erreur si la note n'a pas pu être prise. */
  noter: (parties: readonly number[]) => Promise<void>;
}

export function serveurDuCasino(env: Record<string, string | undefined> = process.env, calls: CasinoCalls = appelsSupabase): ServeurDuCasino {
  const url = env["SUPABASE_URL"]?.trim();
  const key = env["SUPABASE_SECRET_KEY"]?.trim();
  return {
    lire: async () => {
      if (!url || !key) return { etat: "sans-reglage", warning: "pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, rien de lu" };
      try {
        const lu = lireReponseDuCasino(await calls.lire(url, key));
        return lu ?? { etat: "panne", warning: "réponse du serveur illisible, rien de lu" };
      } catch (e) {
        if (fonctionAbsente(e)) return { etat: "fonction-absente", warning: "la migration des gros gains n'est pas encore collée dans Supabase, rien de lu" };
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
 * Ce que le robot garde lui-même des envois, dans le cache du workflow (`.cache/casino-envoi.json`) : chaque coup accepté
 * par Discord, noté avant de le dire au serveur. Si le serveur ne prend pas la note, le coup n'est jamais renvoyé : le
 * passage suivant retente seulement la note. Gardé 48 heures de plus que le coup, puis oublié.
 */
export const CasinoSendState = z.object({
  envoyes: z.array(z.object({ id: z.number().int().positive(), le: z.iso.datetime() })),
});
export type CasinoSendState = z.infer<typeof CasinoSendState>;

/** L'état gardé. Illisible ou absent : vide, avec un avertissement s'il était illisible. */
export const parseCasinoState = (raw: string | null) => parseNoted(CasinoSendState, raw, "les gains que le serveur n'a pas notés pourraient repartir une fois");

const sansLesVieux = (state: CasinoSendState, now: Date): CasinoSendState => ({ envoyes: state.envoyes.filter((e) => Date.parse(e.le) >= now.getTime() - 2 * TROP_ANCIEN_MS) });

export interface CasinoPassDeps {
  serveur: ServeurDuCasino;
  /** L'état gardé au passage d'avant ; `null` : rien de gardé. */
  stored: CasinoSendState | null;
  now: Date;
  send: (gain: GrosGain) => Promise<boolean>;
  /** Garde l'état, aussitôt un gain accepté par Discord, avant de le noter au serveur. */
  note: (state: CasinoSendState) => void;
  log: (line: string) => void;
}

const raison = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? `${n} ${plusieurs}` : `1 ${un}`);

/**
 * Un passage du robot : lit la file, envoie au besoin, note chaque envoi, au robot puis au serveur. `failed` : quelque chose
 * n'a pas marché. Un refus de Discord n'est pas noté : le coup repart au passage suivant, tant que le serveur le rend.
 */
export async function casinoPass({ serveur, stored, now, send, note, log }: CasinoPassDeps): Promise<{ failed: boolean; envoyes: number }> {
  const lecture = await serveur.lire();
  if (lecture.etat !== "lu") {
    log(`${lecture.etat === "panne" ? "::warning::" : "::notice::"}Casino : ${lecture.warning}.`);
    return { failed: lecture.etat === "panne", envoyes: 0 };
  }
  let state = sansLesVieux(stored ?? { envoyes: [] }, now);
  const dejaPartis = new Set(state.envoyes.map((e) => e.id));
  let failed = false;
  /** Note des coups au serveur ; `false` : la note n'a pas pris, le passage s'arrête. */
  const noter = async (parties: readonly number[], quoi: string) => {
    if (parties.length === 0) return true;
    try {
      await serveur.noter(parties);
      return true;
    } catch (e) {
      log(`::warning::Casino : ${quoi} non noté${parties.length > 1 ? "s" : ""} au serveur (n° ${parties.join(", ")} ; ${raison(e)}).`);
      failed = true;
      return false;
    }
  };

  // D'abord, ce qui ne part pas : les lignes illisibles, et ce qui est déjà parti.
  if (!(await noter(lecture.illisibles, "coups illisibles"))) return { failed, envoyes: 0 };
  if (lecture.illisibles.length > 0) log(`::warning::Casino : ${pluriel(lecture.illisibles.length, "coup", "coups")} que ce code ne sait pas lire ou recompter (n° ${lecture.illisibles.join(", ")}), noté${lecture.illisibles.length > 1 ? "s" : ""} sans être posté${lecture.illisibles.length > 1 ? "s" : ""}.`);
  const dejaEnvoyes = lecture.gains.filter((g) => dejaPartis.has(g.id)).map((g) => g.id);
  if (!(await noter(dejaEnvoyes, "envois déjà faits"))) return { failed, envoyes: 0 };
  if (dejaEnvoyes.length > 0) log(`Casino : ${pluriel(dejaEnvoyes.length, "gain déjà envoyé, enfin noté", "gains déjà envoyés, enfin notés")} au serveur.`);

  const aEnvoyer = lecture.gains.filter((g) => !dejaPartis.has(g.id));
  let envoyes = 0;
  for (const gain of aEnvoyer) {
    if (envoyes >= CASINO_PAR_PASSAGE) break;
    if (!(await send(gain))) {
      failed = true;
      break;
    }
    envoyes++;
    state = { envoyes: [...state.envoyes, { id: gain.id, le: gain.le }] };
    note(state);
    log(`::notice::Casino : coup n° ${gain.id} (${fmtInt(gainDe(gain))} statères ${JEUX[gain.tirage.jeu].a}), annonce acceptée par Discord.`);
    // Sans cette note, l'état gardé empêche un second envoi : le passage suivant la retente.
    if (!(await noter([gain.id], "envoi"))) return { failed, envoyes };
  }
  if (aEnvoyer.length - envoyes > 0 && !failed) log("Casino : la suite partira au prochain passage.");
  if (lecture.gains.length === 0 && lecture.illisibles.length === 0) log("Casino : rien à envoyer.");
  return { failed, envoyes };
}
