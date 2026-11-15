/**
 * Les achats du village des Gaulois sur Discord. Demande du pilote, 14 novembre 2026 : « dans le webhook qui notifie des
 * constructions du village, marquer aussi les achats faits dans le jeu par les joueurs, avec l'image du cosmétique » ; puis,
 * le 15 novembre, toutes les 5 minutes (workflow `victoires.yml`) et dans un salon à choisir dans Direction > Discord (le
 * salon des achats, sinon celui des nouvelles, `SALON_REPLI` de `salon-lien.ts`). Une image par Gaulois : son nom, et chaque objet reçu dessiné en
 * pixels, avec sa rareté, d'où il vient et son heure (`achats-image.ts`), puis un bouton vers `/village`, sans texte. Le texte
 * ne part que si l'image ne se dessine pas, ou si Discord la refuse (`discord-post.ts`).
 *
 * - **Ce qui est annoncé** : un objet acheté à la boutique, sorti d'une pochette surprise ou acheté au marché, par un compte
 *   encore validé. C'est le serveur qui le lit, au journal des statères (migration `20261114001700_village_achats_sur_discord`,
 *   `achats_du_village`, réservée à la clé de service). La forge grave une plaque, elle ne donne pas d'objet : rien à annoncer.
 * - **Ce qui ne l'est jamais** : un montant, un prix payé, un solde, un vendeur.
 * - **Le nom** : le nom d'utilisateur Discord de l'acheteur, précédé de « @ » (demande du pilote, 15 novembre 2026), tel que
 *   le serveur l'a relu chez Discord à sa dernière vraie connexion, qui peut dater (migration
 *   `20261115000100_achats_nom_discord`). Sans nom Discord lisible (vide, rien que des signes, ou qui ressemble à une adresse : `looksLikeLink`), le nom
 *   de secours : le pseudo public d'aujourd'hui, sinon « Gaulois n° » et le numéro du compte, jamais le nom du QG, qui
 *   garderait le pseudo d'un membre qui l'a caché depuis. Avant cette migration, le serveur ne rend que le nom de secours.
 * - **Au premier passage**, le robot note le dernier numéro du journal sans rien envoyer : les achats d'avant ne partent pas.
 *   Un état illisible repart de même, avec un avertissement : un achat des dernières minutes peut s'y perdre.
 * - **Un achat annoncé n'est pas réannoncé** : le robot note le dernier numéro traité (`jusqu_a`) et, au-delà, les achats déjà
 *   annoncés (`envoyes`), après chaque annonce acceptée (`note`) et dans une copie gardée par le cache du workflow
 *   (`mergeAchatsStates`). Un envoi refusé arrête le passage : il est retenté au suivant, et ceux d'avant restent notés.
 * - **Direction illisible** : le salon choisi n'est pas connu, rien ne part ce passage-là (`scripts/envoyer-achats.ts`).
 * - Les achats d'un même Gaulois vont sur la même image, quatre au plus ; cinq images au plus par passage, le reste part au
 *   suivant. Un achat de plus de 48 heures n'est plus annoncé : ce n'est plus une nouvelle (robot arrêté longtemps).
 * L'état est noté dans `data/achats-envoi.json`, écrit par le robot seulement : des numéros et des heures, aucun nom.
 */
import { z } from "zod";
import { looksLikeLink, MAX_NAME, tidyName } from "./arrivees";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, type Objet, type Rarete } from "./gaulois";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { parseNoted, siteLink } from "./salon-discord";

const isoDate = z.iso.datetime();

const PARIS = "Europe/Paris";
const jourLong = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "long", year: "numeric" });
const heureMinute = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "numeric", minute: "2-digit", hourCycle: "h23" });

/** « 2 novembre 2026 », et « 1er » pour le premier du mois. */
export const dateLongue = (iso: string) => jourLong.format(new Date(iso)).replace(/^1 /, "1er ");
/** « 20 h 10 ». */
export const heureEnMots = (iso: string) => heureMinute.format(new Date(iso)).replace(":", " h ");

/** Le bouton du message : la page de son Gaulois, `/village`, comme le bouton de /gaulois. */
export const gauloisButton = (siteUrl: string) => ({ label: "Habiller mon Gaulois", url: siteLink(siteUrl, "/village") });

/** Les objets d'un même Gaulois sur une image : au-delà, une autre image. */
export const OBJETS_PAR_IMAGE = 4;
/** Les images d'un passage : au-delà, la suite part au passage suivant. */
export const IMAGES_PAR_PASSAGE = 5;
/** Un achat plus vieux n'est plus annoncé. */
export const TROP_ANCIEN_MS = 48 * 3_600_000;
/** Le nom de la migration, pour l'avertissement d'une fonction encore absente. */
export const MIGRATION_ACHATS = "20261114001700_village_achats_sur_discord";

export const AchatsSendState = z.object({
  /** Le premier passage : les achats d'avant n'ont pas été annoncés. */
  depuis: isoDate,
  /** Le dernier numéro du journal traité : tout achat jusque-là est annoncé, trop ancien, ou d'un compte qui n'est plus validé. */
  jusqu_a: z.number().int().nonnegative(),
  /** Les achats annoncés au-delà de `jusqu_a` : un passage arrêté en route ne les renvoie pas. */
  envoyes: z.array(z.number().int().positive()),
  /** L'heure du dernier message accepté par Discord. */
  dernier_envoi: isoDate.nullable(),
});
export type AchatsSendState = z.infer<typeof AchatsSendState>;

/** L'état noté. Illisible : `null` et un avertissement ; le passage repart alors comme au premier. */
export const parseAchatsState = (raw: string | null, restart = "les achats d'avant sont notés comme connus, rien n'est envoyé pour eux") => parseNoted(AchatsSendState, raw, restart);

/**
 * L'état noté dans `data/` et sa copie gardée par le cache du workflow, réunis : le plus avancé des deux numéros, les achats
 * annoncés de l'un ou de l'autre au-delà, le premier départ et le dernier envoi. Si l'enregistrement sur main a échoué, la
 * copie garde ce qui est parti, et rien ne repart au passage suivant. `null` : ni l'un ni l'autre.
 */
export function mergeAchatsStates(...states: readonly (AchatsSendState | null)[]): AchatsSendState | null {
  const present = states.filter((s): s is AchatsSendState => s !== null);
  if (present.length === 0) return null;
  const jusqu_a = Math.max(...present.map((s) => s.jusqu_a));
  const envoyes = [...new Set(present.flatMap((s) => s.envoyes))].filter((id) => id > jusqu_a).sort((a, b) => a - b);
  const depuis = present.map((s) => s.depuis).sort()[0]!;
  const envois = present.map((s) => s.dernier_envoi).filter((d): d is string => d !== null).sort();
  return { depuis, jusqu_a, envoyes, dernier_envoi: envois.at(-1) ?? null };
}

/** D'où vient l'objet : les natures du journal des statères. */
export const NATURES = ["achat", "pochette", "marche_achat"] as const;
export type NatureDAchat = (typeof NATURES)[number];
export type EmplacementDObjet = (typeof EMPLACEMENTS_OBJETS)[number];

/** Un objet reçu par un Gaulois, tel que le robot l'annonce. */
export interface AchatDuVillage {
  /** Le numéro de la ligne du journal des statères. */
  id: number;
  nature: NatureDAchat;
  emplacement: EmplacementDObjet;
  objet: string;
  /** Le numéro du compte : il range les achats d'un même Gaulois, il ne s'écrit nulle part. */
  compte: number;
  /** Le nom de secours : le pseudo public d'aujourd'hui, sinon « Gaulois n° » et le numéro du compte. */
  nom: string;
  /** Le nom Discord, remis d'aplomb (`nomDiscord`), sans « @ ». `null` : aucun nom Discord lisible. */
  discord: string | null;
  /** L'heure de l'achat. */
  le: string;
}

/** Une image : les achats d'un même Gaulois, de un à `OBJETS_PAR_IMAGE`, dans l'ordre du journal. */
export interface AnnonceDesAchats {
  nom: string;
  discord: string | null;
  achats: AchatDuVillage[];
}

/**
 * Un nom Discord tel que l'annonce l'écrit : lettres de fantaisie ramenées à leurs lettres, signes invisibles retirés, 32
 * caractères au plus (`tidyName`, comme l'image de bienvenue). `null` s'il ne reste ni lettre ni chiffre, ou s'il ressemble à
 * une adresse : l'image l'écrirait en grand, comme une publicité.
 */
export function nomDiscord(brut: string | null | undefined): string | null {
  if (typeof brut !== "string") return null;
  const nom = [...tidyName(brut)].slice(0, MAX_NAME).join("").trim();
  return /[\p{L}\p{N}]/u.test(nom) && !looksLikeLink(nom) ? nom : null;
}

/** Le nom écrit dans la description et le texte de secours : « @nom Discord », sinon le nom de secours. */
export const nomAffiche = (annonce: Pick<AnnonceDesAchats, "nom" | "discord">): string => (annonce.discord ? `@${annonce.discord}` : annonce.nom);

/** L'objet du catalogue, s'il est payant : seuls ceux-là s'achètent. */
export function objetDe(achat: Pick<AchatDuVillage, "emplacement" | "objet">): (Objet & { rarete: Rarete }) | null {
  const objet = OBJETS[achat.emplacement]?.[achat.objet];
  return objet && !objet.gratuit && objet.rarete ? (objet as Objet & { rarete: Rarete }) : null;
}

/** La rareté en mots, accordée à « rareté » : « rareté commune ». */
const RARETE_ACCORDEE: Readonly<Record<Rarete, string>> = { commun: "commune", "peu-commun": "peu commune", epique: "épique", mystique: "mystique", legendaire: "légendaire" };

/** D'où vient l'objet, dans une phrase, et en court, sur l'image. */
export const ORIGINES: Readonly<Record<NatureDAchat, { phrase: string; court: string }>> = {
  achat: { phrase: "à la boutique", court: "Boutique" },
  pochette: { phrase: "dans une pochette surprise", court: "Pochette surprise" },
  marche_achat: { phrase: "au marché", court: "Marché" },
};

/** La réserve de chaque annonce : ce qui a payé ces objets. */
export const PAYE_EN_STATERES = "Payé en statères, qui viennent des points rapportés au clan.";

/** « Baguette (arme, rareté commune) ». */
export function objetEnMots(achat: AchatDuVillage): string {
  const objet = objetDe(achat);
  if (!objet) return achat.objet;
  return `${objet.nom} (${NOMS_EMPLACEMENTS[achat.emplacement].toLocaleLowerCase("fr")}, rareté ${RARETE_ACCORDEE[objet.rarete]})`;
}

/** « 1 nouvel objet », « 3 nouveaux objets ». */
export const nouveauxObjets = (n: number) => (n >= 2 ? `${n} nouveaux objets` : "1 nouvel objet");

/** Ce que dit l'annonce, pour un lecteur d'écran et pour le texte de secours : le titre, une ligne par objet, la réserve. */
export function annonceEnMots(annonce: AnnonceDesAchats): string[] {
  return [
    `${nomAffiche(annonce)} habille son Gaulois : ${nouveauxObjets(annonce.achats.length)}.`,
    ...annonce.achats.map((a) => `${objetEnMots(a)} : ${ORIGINES[a.nature].phrase}, le ${dateLongue(a.le)} à ${heureEnMots(a.le)}.`),
    PAYE_EN_STATERES,
  ];
}

/** Le message. `image` : le fichier joint et sa description, avec le bouton, sans texte. Sans elle, le secours en texte. */
export function achatsPayload(annonce: AnnonceDesAchats, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (image) return imageMessage(site, image, [gauloisButton(site)]);
  const lignes = annonce.achats.map((a) => `- ${escapeDiscord(objetEnMots(a))} : ${ORIGINES[a.nature].phrase}, le ${dateLongue(a.le)} à ${heureEnMots(a.le)}`);
  return textMessage(site, [`**${escapeDiscord(nomAffiche(annonce))}** habille son Gaulois : ${nouveauxObjets(annonce.achats.length)}`, ...lignes, `[Habiller son Gaulois sur le site](<${siteLink(site, "/village")}>)`, `-# ${PAYE_EN_STATERES}`].join("\n"));
}

export interface AchatsSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  annonce: AnnonceDesAchats;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (annonce: AnnonceDesAchats) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'annonce en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendAchats({ link, annonce, renderImage, siteUrl, fetch, log }: AchatsSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Achats du village",
    text: achatsPayload(annonce, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(annonce);
      const filename = `achats-${annonce.achats[0]?.id ?? 0}.png`;
      return { payload: achatsPayload(annonce, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

/* ---------- La lecture au serveur ---------- */

/**
 * Ce que la lecture a donné :
 * - `lu` : le serveur a répondu ; `jusqu_a` est le dernier numéro qu'il a lu, `achats` ceux à annoncer, `inconnus` les objets
 *   que ce code ne sait pas dessiner (un objet ajouté au serveur avant d'arriver ici), sautés ;
 * - `sans-reglage` : pas de `SUPABASE_URL` ou de clé de service, rien n'a été demandé ;
 * - `fonction-absente` : la migration n'est pas encore collée dans Supabase ;
 * - `panne` : refus, délai dépassé ou réponse illisible.
 */
export type LectureDesAchats =
  | { etat: "lu"; jusqu_a: number; achats: AchatDuVillage[]; inconnus: number }
  | { etat: "sans-reglage" | "fonction-absente" | "panne"; warning: string };

const LigneDuServeur = z.object({
  id: z.number().int().positive(),
  nature: z.enum(NATURES),
  emplacement: z.string(),
  objet: z.string(),
  compte: z.number().int(),
  nom: z.string(),
  // Absent avant la migration 20261115000100 : l'annonce prend alors le nom de secours.
  discord: z.string().nullish(),
  le: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
});
const ReponseDuServeur = z.object({ ok: z.literal(true), jusqu_a: z.number().int().nonnegative(), achats: z.array(z.unknown()) });

/** Un nom sans retour à la ligne ni caractère de contrôle, coupé à 64 caractères comme au serveur. */
const nomPropre = (nom: string) =>
  [...nom.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim()]
    .slice(0, 64)
    .join("")
    .trim();

/** La réponse du serveur, relue. `null` : illisible. Une ligne mal formée ou d'un objet inconnu est sautée et comptée. */
export function lireReponseDesAchats(data: unknown): Extract<LectureDesAchats, { etat: "lu" }> | null {
  const reponse = ReponseDuServeur.safeParse(data);
  if (!reponse.success) return null;
  const achats: AchatDuVillage[] = [];
  let inconnus = 0;
  for (const brut of reponse.data.achats) {
    const ligne = LigneDuServeur.safeParse(brut);
    const nom = ligne.success ? nomPropre(ligne.data.nom) : "";
    const emplacement = ligne.success ? (EMPLACEMENTS_OBJETS as readonly string[]).find((e) => e === ligne.data.emplacement) : undefined;
    if (!ligne.success || !emplacement || !nom || !objetDe({ emplacement: emplacement as EmplacementDObjet, objet: ligne.data.objet })) {
      inconnus++;
      continue;
    }
    achats.push({ ...ligne.data, emplacement: emplacement as EmplacementDObjet, nom, discord: nomDiscord(ligne.data.discord), le: new Date(ligne.data.le).toISOString() });
  }
  achats.sort((a, b) => a.id - b.id);
  return { etat: "lu", jusqu_a: reponse.data.jusqu_a, achats, inconnus };
}

/** Appelle `achats_du_village` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type AchatsCall = (url: string, key: string, apres: number | null) => Promise<unknown>;

/** Au-delà, le serveur est tenu pour absent : le même délai que les liens des salons (`DIRECTION_TIMEOUT_MS`). */
export const ACHATS_TIMEOUT_MS = 10_000;

const callSupabase: AchatsCall = async (url, key, apres) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("achats_du_village", { p_apres: apres }).abortSignal(AbortSignal.timeout(ACHATS_TIMEOUT_MS));
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

/** Les codes d'une fonction que le serveur ne connaît pas : celui de PostgREST, puis celui de Postgres. */
const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*achats_du_village\b.* does not exist/i.test(e.message);
}

/** Un message d'erreur qui ne peut contenir ni lien ni clé : tout ce qui y ressemble est remplacé par « … », puis le message est coupé. */
function messageSur(e: unknown, secrets: readonly string[]): string {
  let texte = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…");
  for (const secret of secrets) if (secret.length >= 4) texte = texte.split(secret).join("…");
  return texte
    .replace(/\b[0-9a-fA-F]{32,}\b/g, "…")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]+/g, "…")
    .slice(0, 160);
}

/** Les achats après le numéro `apres` (`null` : premier passage, le dernier numéro seulement). Ne lève jamais d'erreur. */
export async function lireAchats(apres: number | null, env: Record<string, string | undefined> = process.env, call: AchatsCall = callSupabase): Promise<LectureDesAchats> {
  const url = env["SUPABASE_URL"]?.trim();
  const key = env["SUPABASE_SECRET_KEY"]?.trim();
  if (!url || !key) return { etat: "sans-reglage", warning: "pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, aucun achat lu" };
  try {
    const lu = lireReponseDesAchats(await call(url, key, apres));
    return lu ?? { etat: "panne", warning: "réponse du serveur illisible, aucun achat lu" };
  } catch (e) {
    if (fonctionAbsente(e)) return { etat: "fonction-absente", warning: `la migration ${MIGRATION_ACHATS} n'est pas encore collée dans Supabase, aucun achat lu` };
    return { etat: "panne", warning: `lecture impossible (${messageSur(e, [url, key])}), aucun achat lu` };
  }
}

/* ---------- Le passage du robot ---------- */

/** Les images à envoyer : les achats rangés par Gaulois, dans l'ordre de son premier achat, `OBJETS_PAR_IMAGE` par image. */
export function annoncesDesAchats(achats: readonly AchatDuVillage[]): AnnonceDesAchats[] {
  const parCompte = new Map<number, AchatDuVillage[]>();
  for (const achat of [...achats].sort((a, b) => a.id - b.id)) {
    const liste = parCompte.get(achat.compte);
    if (liste) liste.push(achat);
    else parCompte.set(achat.compte, [achat]);
  }
  const annonces: AnnonceDesAchats[] = [];
  for (const liste of parCompte.values()) {
    // Les noms du dernier achat : les plus récents.
    const { nom, discord } = liste.at(-1)!;
    for (let i = 0; i < liste.length; i += OBJETS_PAR_IMAGE) annonces.push({ nom, discord, achats: liste.slice(i, i + OBJETS_PAR_IMAGE) });
  }
  return annonces;
}

export interface AchatsPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage, ou état illisible. */
  stored: AchatsSendState | null;
  /** Lit les achats au serveur (`lireAchats`). */
  lire: (apres: number | null) => Promise<LectureDesAchats>;
  now: Date;
  /** Envoie l'annonce. `true` : Discord l'a acceptée. */
  send: (annonce: AnnonceDesAchats) => Promise<boolean>;
  /** Note l'état après chaque annonce acceptée : un passage coupé en route garde ce qui est parti. */
  note?: (state: AchatsSendState) => void;
  log: (line: string) => void;
}

export interface AchatsPassResult {
  /** L'état à écrire. `null` : rien n'a changé, rien à écrire. */
  state: AchatsSendState | null;
  /** Une annonce devait partir et Discord ne l'a pas acceptée, ou le serveur est en panne. */
  failed: boolean;
}

/** Un passage sans lecture : rien à écrire. Une fonction absente ou un réglage manquant n'est qu'une note. */
function sansLecture(lecture: Exclude<LectureDesAchats, { etat: "lu" }>, log: (line: string) => void): AchatsPassResult {
  log(`${lecture.etat === "panne" ? "::warning::" : "::notice::"}Achats du village : ${lecture.warning}.`);
  return { state: null, failed: lecture.etat === "panne" };
}

/**
 * Un passage du robot : lit, décide, envoie au besoin, et rend l'état à noter. Un achat ne devient connu qu'après un envoi
 * accepté ; après un échec, le passage suivant réessaie.
 */
export async function achatsPass({ stored, lire, now, send, note, log }: AchatsPassDeps): Promise<AchatsPassResult> {
  const lecture = await lire(stored ? stored.jusqu_a : null);
  if (lecture.etat !== "lu") return sansLecture(lecture, log);
  if (lecture.inconnus > 0) log(`::warning::Achats du village : ${lecture.inconnus > 1 ? `${lecture.inconnus} achats d'objets` : "1 achat d'un objet"} que ce code ne sait pas dessiner, non annoncé${lecture.inconnus > 1 ? "s" : ""}.`);
  if (!stored) {
    log("::notice::Achats du village : premier passage, les achats d'avant sont notés comme connus, rien n'est envoyé.");
    return { state: { depuis: now.toISOString(), jusqu_a: lecture.jusqu_a, envoyes: [], dernier_envoi: null }, failed: false };
  }

  const dejaEnvoyes = new Set(stored.envoyes);
  const nouveaux = lecture.achats.filter((a) => a.id > stored.jusqu_a && !dejaEnvoyes.has(a.id));
  const limite = now.getTime() - TROP_ANCIEN_MS;
  const anciens = nouveaux.filter((a) => Date.parse(a.le) < limite);
  if (anciens.length > 0) log(`::notice::Achats du village : ${anciens.length > 1 ? `${anciens.length} achats de plus de 48 heures, non annoncés` : "1 achat de plus de 48 heures, non annoncé"}.`);
  const annonces = annoncesDesAchats(nouveaux.filter((a) => Date.parse(a.le) >= limite));

  const envoyes = [...stored.envoyes];
  let dernierEnvoi = stored.dernier_envoi;
  let failed = false;
  let partis = 0;
  for (const annonce of annonces) {
    if (partis >= IMAGES_PAR_PASSAGE) break;
    if (!(await send(annonce))) {
      failed = true;
      break;
    }
    partis++;
    envoyes.push(...annonce.achats.map((a) => a.id));
    dernierEnvoi = now.toISOString();
    note?.({ ...stored, envoyes: [...envoyes].sort((a, b) => a - b), dernier_envoi: dernierEnvoi });
    log(`::notice::Achats du village : ${nouveauxObjets(annonce.achats.length)}, annonce acceptée par Discord.`);
  }
  const reste = annonces.length - partis;
  if (reste > 0 && !failed) log(`Achats du village : ${reste > 1 ? `${reste} images partiront` : "1 image partira"} au prochain passage.`);

  // Tout est parti : le numéro avance jusqu'au dernier lu, même sur ce qui n'était pas à annoncer.
  const fini = reste === 0;
  const jusquA = fini ? Math.max(stored.jusqu_a, lecture.jusqu_a) : stored.jusqu_a;
  const state: AchatsSendState = { ...stored, jusqu_a: jusquA, envoyes: envoyes.filter((id) => id > jusquA).sort((a, b) => a - b), dernier_envoi: dernierEnvoi };
  const change = state.jusqu_a !== stored.jusqu_a || JSON.stringify(state.envoyes) !== JSON.stringify(stored.envoyes) || state.dernier_envoi !== stored.dernier_envoi;
  if (!change && annonces.length === 0) log("Achats du village : rien à envoyer (aucun nouvel achat).");
  return { state: change ? state : null, failed };
}
