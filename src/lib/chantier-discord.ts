/**
 * L'annonce d'un bâtiment fini du village des Gaulois sur le salon des nouvelles (idée 1 du pilote, 14 novembre 2026 : « Le
 * robot poste l'image sur Discord à chaque bâtiment fini ») : l'image du bâtiment et un bouton vers `/village`, sans texte,
 * comme les paliers franchis. Le texte ne part que si l'image ne se dessine pas, ou si Discord la refuse (`discord-post.ts`).
 *
 * - Le chantier vient de `village/chantier.ts`, au dernier relevé des sessions du clan. Sans chantier lisible (sessions jamais
 *   relevées ou mois illisible), rien ne part et rien n'est noté.
 * - **Au premier passage**, les bâtiments déjà finis sont notés comme connus, sans rien envoyer : ils l'ont été avant la mise
 *   en ligne. Un état illisible repart de même, avec un avertissement : un bâtiment fini dans l'heure peut s'y perdre, jamais
 *   partir deux fois.
 * - **Jamais deux fois le même bâtiment** : un bâtiment annoncé reste connu, même si le chantier recule un jour.
 * - Plusieurs bâtiments finis depuis le passage précédent partent l'un après l'autre, dans l'ordre du chantier. Un envoi
 *   refusé arrête le passage : il est retenté au suivant, et ceux d'avant restent notés.
 * L'état est noté dans `data/chantier-envoi.json`, écrit par le robot seulement.
 */
import { z } from "zod";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtInt } from "./format";
import type { RenderedImage } from "./gazette-discord";
import { parseNoted, siteLink } from "./salon-discord";
import { BATIMENT_IDS, BATIMENTS, type BatimentId } from "./village/chantier-liste";
import { batimentEnCours, pointsQuiRestent } from "./village/chantier";
import type { EtatDuBatiment, EtatDuMonde } from "./village/monde-etat";

const isoDate = z.iso.datetime();
const Batiment = z.enum(BATIMENT_IDS as [BatimentId, ...BatimentId[]]);

export const ChantierSendState = z.object({
  /** Le premier passage : les bâtiments finis à cette heure-là ont été notés sans être annoncés. */
  depuis: isoDate,
  /** Les bâtiments finis déjà connus, annoncés ou trouvés finis au premier passage : ils ne partent jamais. */
  connus: z.array(Batiment),
  /** Les annonces acceptées par Discord : le bâtiment, le début de la partie qui l'a fini, l'heure de l'envoi. */
  annonces: z.array(z.object({ id: Batiment, fini_le: isoDate, envoye_le: isoDate })),
});
export type ChantierSendState = z.infer<typeof ChantierSendState>;

/** L'état noté. Illisible : `null` et un avertissement ; le passage repart alors comme au premier. */
export const parseChantierState = (raw: string | null) =>
  parseNoted(ChantierSendState, raw, "les bâtiments déjà finis sont notés comme connus, rien n'est envoyé pour eux");

/** Un bâtiment fini à annoncer, et ce que le chantier en dit au relevé. */
export interface AnnonceDuChantier {
  batiment: EtatDuBatiment & { fini_le: string };
  /** Le bâtiment en cours au relevé, ou `null` quand tout est bâti. */
  prochain: EtatDuBatiment | null;
  /** L'heure du relevé des sessions. */
  releve: string;
}

const PARIS = "Europe/Paris";
const jourLong = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "long", year: "numeric" });
const heureMinute = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "numeric", minute: "2-digit", hourCycle: "h23" });

/** « 2 novembre 2026 », et « 1er » pour le premier du mois. */
export const dateLongue = (iso: string) => jourLong.format(new Date(iso)).replace(/^1 /, "1er ");
/** « 20 h 10 ». */
export const heureEnMots = (iso: string) => heureMinute.format(new Date(iso)).replace(":", " h ");

/** « 100 points », « 1 point ». */
export const pointsEnMots = (n: number) => `${fmtInt(n)} ${n >= 2 ? "points" : "point"}`;

/** Le prochain chantier en mots : « Prochain chantier : le puits, encore 150 points. » */
export function prochainEnMots(prochain: EtatDuBatiment | null): string {
  if (!prochain) return `Tout le village est bâti : les ${BATIMENTS.length} chantiers sont finis.`;
  return `Prochain chantier : ${prochain.nom}, encore ${pointsEnMots(pointsQuiRestent(prochain))}.`;
}

/** Ce que dit l'annonce, pour un lecteur d'écran et pour le texte de secours. */
export function annonceEnMots(annonce: AnnonceDuChantier): string[] {
  const { batiment, prochain, releve } = annonce;
  return [
    `${batiment.titre} : chantier terminé au village des Gaulois, le ${dateLongue(batiment.fini_le)}, avec ${pointsEnMots(batiment.cout)} rapportés au clan.`,
    prochainEnMots(prochain),
    `Au relevé du ${dateLongue(releve)} à ${heureEnMots(releve)}.`,
  ];
}

/** Le bouton du message : le village. */
export const villageButton = (siteUrl: string) => ({ label: "Voir le village", url: siteLink(siteUrl, "/village") });

/** Le message. `image` : le fichier joint et sa description, avec le bouton, sans texte. Sans elle, le secours en texte. */
export function chantierPayload(annonce: AnnonceDuChantier, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (image) return imageMessage(site, image, [villageButton(site)]);
  const [titre, ...reste] = annonceEnMots(annonce);
  return textMessage(site, [`**${titre}**`, ...reste.slice(0, -1), `[Voir le village sur le site](<${siteLink(site, "/village")}>)`, `-# ${reste.at(-1) ?? ""}`].join("\n"));
}

export interface ChantierSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  annonce: AnnonceDuChantier;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (annonce: AnnonceDuChantier) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'annonce en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendChantier({ link, annonce, renderImage, siteUrl, fetch, log }: ChantierSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Chantier",
    text: chantierPayload(annonce, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(annonce);
      const filename = `chantier-${annonce.batiment.id}.png`;
      return { payload: chantierPayload(annonce, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface ChantierPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage, ou état illisible. */
  stored: ChantierSendState | null;
  /** L'état du monde au dernier relevé (`etatDuMondeDuSite`). */
  monde: EtatDuMonde;
  now: Date;
  /** Envoie l'annonce. `true` : Discord l'a acceptée. */
  send: (annonce: AnnonceDuChantier) => Promise<boolean>;
  log: (line: string) => void;
}

export interface ChantierPassResult {
  /** L'état à écrire. `null` : rien n'a changé, rien à écrire. */
  state: ChantierSendState | null;
  /** Une annonce devait partir et Discord ne l'a pas acceptée. */
  failed: boolean;
}

/** Les bâtiments finis pas encore connus, dans l'ordre du chantier. */
export function batimentsAAnnoncer(stored: ChantierSendState, monde: EtatDuMonde): AnnonceDuChantier[] {
  const { chantier, releve } = monde;
  if (!chantier || releve === null) return [];
  const connus = new Set(stored.connus);
  const prochain = batimentEnCours(chantier);
  return chantier.batiments.flatMap((b) => (b.fini_le !== null && !connus.has(b.id) ? [{ batiment: { ...b, fini_le: b.fini_le }, prochain, releve }] : []));
}

/**
 * Un passage du robot : décide, envoie au besoin, et rend l'état à noter. Un bâtiment ne devient connu qu'après un envoi
 * accepté ; après un échec, le passage suivant réessaie.
 */
export async function chantierPass({ stored, monde, now, send, log }: ChantierPassDeps): Promise<ChantierPassResult> {
  const { chantier } = monde;
  if (!chantier || monde.releve === null) {
    log("Chantier : pas de chantier lisible au dernier relevé des sessions, rien à faire.");
    return { state: null, failed: false };
  }
  const finis = chantier.batiments.filter((b) => b.fini_le !== null).map((b) => b.id);
  if (!stored) {
    log(`::notice::Chantier : premier passage, ${finis.length > 1 ? `${finis.length} bâtiments déjà finis notés` : finis.length === 1 ? "1 bâtiment déjà fini noté" : "aucun bâtiment fini"}, rien n'est envoyé.`);
    return { state: { depuis: now.toISOString(), connus: finis, annonces: [] }, failed: false };
  }
  const dues = batimentsAAnnoncer(stored, monde);
  if (dues.length === 0) {
    log("Chantier : rien à envoyer (aucun nouveau bâtiment fini).");
    return { state: null, failed: false };
  }
  let state = stored;
  for (const annonce of dues) {
    if (!(await send(annonce))) return { state: state === stored ? null : state, failed: true };
    const { id, fini_le } = annonce.batiment;
    state = { ...state, connus: [...state.connus, id], annonces: [...state.annonces, { id, fini_le, envoye_le: now.toISOString() }] };
    log(`::notice::Chantier : ${annonce.batiment.nom} (${pointsEnMots(annonce.batiment.cout)}), annonce acceptée par Discord.`);
  }
  return { state, failed: false };
}
