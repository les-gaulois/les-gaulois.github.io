/**
 * Les nouvelles offres et demandes du marché des Gaulois sur Discord (19 novembre 2026, quatrième proposition choisie par le
 * pilote : « le robot annonce chaque nouvelle offre dans le salon des achats : l'objet, son prix, et combien il coûte à la
 * boutique »). Avant, seuls les achats faits partaient (`achats-discord.ts`) : personne ne savait qu'un objet était à vendre,
 * ni qu'un membre en cherchait un. Toutes les 5 minutes, avec les victoires et les achats (workflow `victoires.yml`), dans le
 * salon des achats réglé dans Direction > Discord, sinon celui des nouvelles.
 *
 * - **Ce qui est annoncé** : une offre mise en vente, ou une demande d'achat posée, encore ouverte, par un compte validé. Le
 *   serveur les lit (`annonces_du_marche`, migration 20261119000100_marche_tournant_et_demandes, réservée à la clé de service).
 * - **Ce qui est écrit** : le nom Discord du membre précédé de « @ » (le nom de secours sinon, comme les achats), l'objet, sa
 *   rareté, le prix d'une offre (celui que tout membre validé voit au marché), et le prix de l'objet à la boutique, ou qu'il
 *   n'est pas en rayon cette semaine. Le prix d'une demande ne part pas : ses statères sont mis de côté, il dirait un
 *   minimum du solde de son auteur ; il se lit au marché, entre membres. Jamais un solde.
 * - **Une image** par membre et par sorte (offres ou demandes), quatre objets au plus, cinq images au plus par passage ; le
 *   reste part au suivant. Un bouton mène au marché (`/village#marche`), sans texte ; le texte ne part que si l'image ne se
 *   dessine pas, ou si Discord la refuse (`discord-post.ts`).
 * - **Au premier passage**, le robot note les derniers numéros sans rien envoyer : ce qui est déjà au marché ne part pas. Plus
 *   de 48 heures après sa mise au marché, une offre ou une demande n'est plus une nouvelle.
 * - **Une annonce partie ne repart pas** : les derniers numéros traités, et au-delà les annonces parties, notés après chaque
 *   envoi accepté, dans `data/marche-envoi.json` et sa copie gardée par le cache du workflow (comme les achats).
 */
import { z } from "zod";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, aUnPrix, type Emplacement, type RareteDObjet } from "./gaulois";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { parseNoted, siteLink } from "./salon-discord";
import { dateLongue, heureEnMots, nomAffiche, nomDiscord } from "./achats-discord";
import { fmtInt } from "./format";

const isoDate = z.iso.datetime();

/** Les objets d'un même membre sur une image : au-delà, une autre image. */
export const OBJETS_PAR_IMAGE = 4;
/** Les images d'un passage : au-delà, la suite part au passage suivant. */
export const IMAGES_PAR_PASSAGE = 5;
/** Une offre ou une demande plus vieille n'est plus annoncée. */
export const TROP_ANCIEN_MS = 48 * 3_600_000;
/** Le nom de la migration, pour l'avertissement d'une fonction encore absente. */
export const MIGRATION_MARCHE = "20261119000100_marche_tournant_et_demandes";
/** Le chemin du bouton : le marché, dans l'onglet « La boutique » de « Mon Gaulois ». */
export const CHEMIN_DU_MARCHE = "/village#marche";

export type SorteDAnnonce = "offre" | "demande";

export const MarcheSendState = z.object({
  /** Le premier passage : ce qui était au marché avant n'a pas été annoncé. */
  depuis: isoDate,
  /** Les derniers numéros traités, des offres et des demandes. */
  offres_jusqu_a: z.number().int().nonnegative(),
  demandes_jusqu_a: z.number().int().nonnegative(),
  /** Les annonces parties au-delà de ces numéros : « o12 » pour l'offre 12, « d5 » pour la demande 5. */
  envoyees: z.array(z.string().regex(/^[od][1-9][0-9]{0,17}$/)),
  /** L'heure du dernier message accepté par Discord. */
  dernier_envoi: isoDate.nullable(),
});
export type MarcheSendState = z.infer<typeof MarcheSendState>;

/** L'état noté. Illisible : `null` et un avertissement ; le passage repart alors comme au premier. */
export const parseMarcheState = (raw: string | null, restart = "ce qui est au marché est noté comme connu, rien n'est envoyé pour lui") => parseNoted(MarcheSendState, raw, restart);

/** La clé d'une annonce dans `envoyees`. */
export const cleDAnnonce = (a: Pick<AnnonceDuMarche, "sorte" | "id">): string => `${a.sorte === "offre" ? "o" : "d"}${a.id}`;
const numeroDeCle = (cle: string): number => Number(cle.slice(1));

/** Les deux copies de l'état réunies : les numéros les plus avancés, les annonces parties de l'une ou de l'autre au-delà. */
export function mergeMarcheStates(...states: readonly (MarcheSendState | null)[]): MarcheSendState | null {
  const present = states.filter((s): s is MarcheSendState => s !== null);
  if (present.length === 0) return null;
  const offres = Math.max(...present.map((s) => s.offres_jusqu_a));
  const demandes = Math.max(...present.map((s) => s.demandes_jusqu_a));
  const envoyees = [...new Set(present.flatMap((s) => s.envoyees))].filter((c) => numeroDeCle(c) > (c.startsWith("o") ? offres : demandes)).sort();
  const envois = present.map((s) => s.dernier_envoi).filter((d): d is string => d !== null).sort();
  return { depuis: present.map((s) => s.depuis).sort()[0]!, offres_jusqu_a: offres, demandes_jusqu_a: demandes, envoyees, dernier_envoi: envois.at(-1) ?? null };
}

/** Une offre ou une demande, telle que le robot l'annonce. */
export interface AnnonceDuMarche {
  sorte: SorteDAnnonce;
  id: number;
  emplacement: Emplacement;
  objet: string;
  nomObjet: string;
  rarete: Exclude<RareteDObjet, "divin" | "saison">;
  prix: number;
  /** Le prix de l'objet à la boutique ; `null` : le serveur ne l'a pas dit. */
  prixBoutique: number | null;
  /** L'objet est-il en rayon à la boutique cette semaine ? */
  enRayon: boolean;
  /** Le numéro du compte : il range les annonces d'un même membre, il ne s'écrit nulle part. */
  compte: number;
  nom: string;
  discord: string | null;
  le: string;
}

/** Une image : les offres, ou les demandes, d'un même membre, de un à `OBJETS_PAR_IMAGE`. */
export interface ImageDuMarche {
  sorte: SorteDAnnonce;
  nom: string;
  discord: string | null;
  annonces: AnnonceDuMarche[];
}

/** « tête », « arme » : la place de l'objet, en minuscules. */
const placeDe = (emplacement: Emplacement): string => NOMS_EMPLACEMENTS[emplacement].toLocaleLowerCase("fr");

/** La rareté en mots, accordée à « rareté » : « rareté commune ». */
const RARETE_ACCORDEE: Readonly<Record<Exclude<RareteDObjet, "divin" | "saison">, string>> = { commun: "commune", "peu-commun": "peu commune", epique: "épique", mystique: "mystique", legendaire: "légendaire" };

/** « 2 objets », « 1 objet ». */
const objets = (n: number) => (n >= 2 ? `${n} objets` : "1 objet");

/** « 1 800 statères ». */
const enStateres = (n: number) => `${fmtInt(n)} ${n > 1 ? "statères" : "statère"}`;

/** Le titre : « @nom vend au marché », « @nom vend 2 objets au marché », « @nom cherche un objet au marché ». */
export function titreDuMarche(image: ImageDuMarche, nom: string): string {
  const n = image.annonces.length;
  if (image.sorte === "offre") return n >= 2 ? `${nom} vend ${objets(n)} au marché` : `${nom} vend au marché`;
  return n >= 2 ? `${nom} cherche ${objets(n)} au marché` : `${nom} cherche un objet au marché`;
}

/** Ce que dit la boutique de l'objet : « 2 500 à la boutique », ou qu'il n'y est pas cette semaine. */
export function boutiqueEnMots(a: Pick<AnnonceDuMarche, "prixBoutique" | "enRayon">): string {
  if (!a.enRayon) return "pas en rayon à la boutique cette semaine";
  return a.prixBoutique === null ? "aussi à la boutique" : `${enStateres(a.prixBoutique)} à la boutique`;
}

/**
 * Une ligne par objet : « Casque d'or (tête, rareté légendaire) : 1 800 statères, 2 500 statères à la boutique » pour une
 * offre, « … : cherché au marché, 2 500 statères à la boutique » pour une demande, sans son prix.
 */
export function ligneEnMots(a: AnnonceDuMarche): string {
  const prix = a.sorte === "offre" ? enStateres(a.prix) : "cherché au marché";
  return `${a.nomObjet} (${placeDe(a.emplacement)}, rareté ${RARETE_ACCORDEE[a.rarete]}) : ${prix}, ${boutiqueEnMots(a)}`;
}

/** La réserve de chaque annonce : d'où viennent les statères. */
export const STATERES_DU_CLAN = "Les statères viennent des points rapportés au clan.";

/** Ce que dit l'annonce, pour un lecteur d'écran et pour le texte de secours. */
export function annonceDuMarcheEnMots(image: ImageDuMarche): string[] {
  return [`${titreDuMarche(image, nomAffiche(image))}.`, ...image.annonces.map((a) => `${ligneEnMots(a)}, le ${dateLongue(a.le)} à ${heureEnMots(a.le)}.`), STATERES_DU_CLAN];
}

/** Le bouton du message : le marché. */
export const boutonDuMarche = (siteUrl: string) => ({ label: "Voir le marché", url: siteLink(siteUrl, CHEMIN_DU_MARCHE) });

/** Le message. `image` : le fichier joint et sa description, avec le bouton, sans texte. Sans elle, le secours en texte. */
export function marchePayload(image: ImageDuMarche, siteUrl: string, fichier: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (fichier) return imageMessage(site, fichier, [boutonDuMarche(site)]);
  const lignes = image.annonces.map((a) => `- ${escapeDiscord(ligneEnMots(a))}`);
  return textMessage(site, [titreDuMarche(image, `**${escapeDiscord(nomAffiche(image))}**`), ...lignes, `[Voir le marché sur le site](<${siteLink(site, CHEMIN_DU_MARCHE)}>)`, `-# ${STATERES_DU_CLAN}`].join("\n"));
}

export interface MarcheSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  image: ImageDuMarche;
  renderImage: (image: ImageDuMarche) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'annonce en image, ou en texte si elle ne se dessine pas. Un échec se retente au passage suivant. */
export function sendMarche({ link, image, renderImage, siteUrl, fetch, log }: MarcheSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Marché des Gaulois",
    text: marchePayload(image, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(image);
      const filename = `marche-${cleDAnnonce(image.annonces[0] ?? { sorte: image.sorte, id: 0 })}.png`;
      return { payload: marchePayload(image, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

/* ---------- La lecture au serveur ---------- */

export type LectureDuMarche =
  | { etat: "lu"; offresJusquA: number; demandesJusquA: number; annonces: AnnonceDuMarche[]; inconnus: number }
  | { etat: "sans-reglage" | "fonction-absente" | "panne"; warning: string };

const LigneDuServeur = z.object({
  id: z.number().int().positive(),
  emplacement: z.string(),
  objet: z.string(),
  prix: z.number().int().positive(),
  prix_boutique: z.number().int().positive().nullable(),
  en_rayon: z.boolean(),
  compte: z.number().int(),
  nom: z.string(),
  discord: z.string().nullish(),
  le: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
});
const ReponseDuServeur = z.object({
  ok: z.literal(true),
  offres_jusqu_a: z.number().int().nonnegative(),
  demandes_jusqu_a: z.number().int().nonnegative(),
  offres: z.array(z.unknown()),
  demandes: z.array(z.unknown()),
});

/** Un nom sans retour à la ligne ni caractère de contrôle, coupé à 64 caractères comme au serveur. */
const nomPropre = (nom: string) =>
  [...nom.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim()]
    .slice(0, 64)
    .join("")
    .trim();

/** La réponse du serveur, relue. `null` : illisible. Une ligne mal formée, ou d'un objet que ce code ne connaît pas, est sautée et comptée. */
export function lireReponseDuMarche(data: unknown): Extract<LectureDuMarche, { etat: "lu" }> | null {
  const reponse = ReponseDuServeur.safeParse(data);
  if (!reponse.success) return null;
  const annonces: AnnonceDuMarche[] = [];
  let inconnus = 0;
  const lire = (sorte: SorteDAnnonce, brut: unknown) => {
    const ligne = LigneDuServeur.safeParse(brut);
    if (!ligne.success) return void inconnus++;
    const emplacement = (EMPLACEMENTS_OBJETS as readonly string[]).find((e) => e === ligne.data.emplacement) as Emplacement | undefined;
    const fiche = emplacement ? OBJETS[emplacement]?.[ligne.data.objet] : undefined;
    const nom = nomPropre(ligne.data.nom);
    if (!emplacement || !fiche || fiche.gratuit || !fiche.rarete || !aUnPrix(fiche.rarete) || !nom) return void inconnus++;
    annonces.push({
      sorte,
      id: ligne.data.id,
      emplacement,
      objet: ligne.data.objet,
      nomObjet: fiche.nom,
      rarete: fiche.rarete,
      prix: ligne.data.prix,
      prixBoutique: ligne.data.prix_boutique,
      enRayon: ligne.data.en_rayon,
      compte: ligne.data.compte,
      nom,
      discord: nomDiscord(ligne.data.discord),
      le: new Date(ligne.data.le).toISOString(),
    });
  };
  for (const brut of reponse.data.offres) lire("offre", brut);
  for (const brut of reponse.data.demandes) lire("demande", brut);
  return { etat: "lu", offresJusquA: reponse.data.offres_jusqu_a, demandesJusquA: reponse.data.demandes_jusqu_a, annonces, inconnus };
}

/** Appelle `annonces_du_marche` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type MarcheCall = (url: string, key: string, offresApres: number | null, demandesApres: number | null) => Promise<unknown>;

export const MARCHE_TIMEOUT_MS = 10_000;

const callSupabase: MarcheCall = async (url, key, offresApres, demandesApres) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("annonces_du_marche", { p_offres_apres: offresApres, p_demandes_apres: demandesApres }).abortSignal(AbortSignal.timeout(MARCHE_TIMEOUT_MS));
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*annonces_du_marche\b.* does not exist/i.test(e.message);
}

/** Un message d'erreur qui ne peut contenir ni lien ni clé : tout ce qui y ressemble est remplacé par « … », puis il est coupé. */
function messageSur(e: unknown, secrets: readonly string[]): string {
  let texte = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…");
  for (const secret of secrets) if (secret.length >= 4) texte = texte.split(secret).join("…");
  return texte
    .replace(/\b[0-9a-fA-F]{32,}\b/g, "…")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]+/g, "…")
    .slice(0, 160);
}

/** Les offres et demandes après les numéros notés (`null` : premier passage). Ne lève jamais d'erreur. */
export async function lireLeMarche(offresApres: number | null, demandesApres: number | null, env: Record<string, string | undefined> = process.env, call: MarcheCall = callSupabase): Promise<LectureDuMarche> {
  const url = env["SUPABASE_URL"]?.trim();
  const key = env["SUPABASE_SECRET_KEY"]?.trim();
  if (!url || !key) return { etat: "sans-reglage", warning: "pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, rien de lu" };
  try {
    const lu = lireReponseDuMarche(await call(url, key, offresApres, demandesApres));
    return lu ?? { etat: "panne", warning: "réponse du serveur illisible, rien de lu" };
  } catch (e) {
    if (fonctionAbsente(e)) return { etat: "fonction-absente", warning: `la migration ${MIGRATION_MARCHE} n'est pas encore collée dans Supabase, rien de lu` };
    return { etat: "panne", warning: `lecture impossible (${messageSur(e, [url, key])}), rien de lu` };
  }
}

/* ---------- Le passage du robot ---------- */

/** Les images à envoyer : les annonces rangées par membre et par sorte, dans l'ordre de la première, quatre par image. */
export function imagesDuMarche(annonces: readonly AnnonceDuMarche[]): ImageDuMarche[] {
  const groupes = new Map<string, AnnonceDuMarche[]>();
  for (const a of [...annonces].sort((x, y) => Date.parse(x.le) - Date.parse(y.le) || x.id - y.id)) {
    const cle = `${a.sorte}/${a.compte}`;
    const liste = groupes.get(cle);
    if (liste) liste.push(a);
    else groupes.set(cle, [a]);
  }
  const images: ImageDuMarche[] = [];
  for (const liste of groupes.values()) {
    const { sorte, nom, discord } = liste.at(-1)!;
    for (let i = 0; i < liste.length; i += OBJETS_PAR_IMAGE) images.push({ sorte, nom, discord, annonces: liste.slice(i, i + OBJETS_PAR_IMAGE) });
  }
  return images;
}

export interface MarchePassDeps {
  stored: MarcheSendState | null;
  lire: (offresApres: number | null, demandesApres: number | null) => Promise<LectureDuMarche>;
  now: Date;
  send: (image: ImageDuMarche) => Promise<boolean>;
  note?: (state: MarcheSendState) => void;
  log: (line: string) => void;
}

export interface MarchePassResult {
  /** L'état à écrire. `null` : rien n'a changé. */
  state: MarcheSendState | null;
  failed: boolean;
}

/** Les mots d'une image, pour le journal du workflow : « 2 offres », « 1 demande ». */
const motsDuJournal = (image: ImageDuMarche) => {
  const n = image.annonces.length;
  return image.sorte === "offre" ? (n >= 2 ? `${n} offres` : "1 offre") : n >= 2 ? `${n} demandes` : "1 demande";
};

/** Un passage du robot : lit, décide, envoie au besoin, et rend l'état à noter. */
export async function marchePass({ stored, lire, now, send, note, log }: MarchePassDeps): Promise<MarchePassResult> {
  const lecture = await lire(stored ? stored.offres_jusqu_a : null, stored ? stored.demandes_jusqu_a : null);
  if (lecture.etat !== "lu") {
    log(`${lecture.etat === "panne" ? "::warning::" : "::notice::"}Marché des Gaulois : ${lecture.warning}.`);
    return { state: null, failed: lecture.etat === "panne" };
  }
  if (lecture.inconnus > 0) log(`::warning::Marché des Gaulois : ${lecture.inconnus} offre${lecture.inconnus > 1 ? "s ou demandes" : " ou demande"} que ce code ne sait pas dessiner, non annoncée${lecture.inconnus > 1 ? "s" : ""}.`);
  if (!stored) {
    log("::notice::Marché des Gaulois : premier passage, ce qui est déjà au marché est noté comme connu, rien n'est envoyé.");
    return { state: { depuis: now.toISOString(), offres_jusqu_a: lecture.offresJusquA, demandes_jusqu_a: lecture.demandesJusquA, envoyees: [], dernier_envoi: null }, failed: false };
  }

  const deja = new Set(stored.envoyees);
  const nouvelles = lecture.annonces.filter((a) => a.id > (a.sorte === "offre" ? stored.offres_jusqu_a : stored.demandes_jusqu_a) && !deja.has(cleDAnnonce(a)));
  const limite = now.getTime() - TROP_ANCIEN_MS;
  const images = imagesDuMarche(nouvelles.filter((a) => Date.parse(a.le) >= limite));

  const envoyees = [...stored.envoyees];
  let dernierEnvoi = stored.dernier_envoi;
  let failed = false;
  let parties = 0;
  for (const image of images) {
    if (parties >= IMAGES_PAR_PASSAGE) break;
    if (!(await send(image))) {
      failed = true;
      break;
    }
    parties++;
    envoyees.push(...image.annonces.map(cleDAnnonce));
    dernierEnvoi = now.toISOString();
    note?.({ ...stored, envoyees: [...envoyees].sort(), dernier_envoi: dernierEnvoi });
    log(`::notice::Marché des Gaulois : ${motsDuJournal(image)}, annonce acceptée par Discord.`);
  }
  const reste = images.length - parties;
  if (reste > 0 && !failed) log(`Marché des Gaulois : ${reste > 1 ? `${reste} images partiront` : "1 image partira"} au prochain passage.`);

  // Tout est parti : les numéros avancent jusqu'aux derniers lus, même sur ce qui n'était pas à annoncer.
  const fini = reste === 0;
  const offres = fini ? Math.max(stored.offres_jusqu_a, lecture.offresJusquA) : stored.offres_jusqu_a;
  const demandes = fini ? Math.max(stored.demandes_jusqu_a, lecture.demandesJusquA) : stored.demandes_jusqu_a;
  const state: MarcheSendState = {
    ...stored,
    offres_jusqu_a: offres,
    demandes_jusqu_a: demandes,
    envoyees: envoyees.filter((c) => numeroDeCle(c) > (c.startsWith("o") ? offres : demandes)).sort(),
    dernier_envoi: dernierEnvoi,
  };
  const change = JSON.stringify(state) !== JSON.stringify(stored);
  if (!change && images.length === 0) log("Marché des Gaulois : rien à envoyer (aucune nouvelle offre ni demande).");
  return { state: change ? state : null, failed };
}
