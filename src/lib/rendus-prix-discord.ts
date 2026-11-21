/**
 * Les messages du trop-payé rendu (docs/DIRECTION.md, « Le trop-payé rendu ») : un message public dans le salon des
 * nouvelles, qui explique la baisse et le remboursement sans aucun montant d'un joueur, puis un message privé du robot à
 * chaque joueur remboursé, avec son montant et le détail de ses achats (choix du pilote, 21 novembre 2026 : « Les deux »).
 * Toutes les 5 minutes (workflow victoires.yml, `npm run rendus:envoyer`), jusqu'à ce que tout soit parti ; ensuite, plus
 * rien. Un joueur qui a fermé ses messages privés est compté, pas relancé : il a le message public, et son solde.
 *
 * L'identifiant Discord d'un joueur ne sort jamais du passage : ni journal de l'Action, ni état noté (qui ne garde que des
 * numéros du journal des statères et des nombres).
 */
import { z } from "zod";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { lireRendusDesPrix, type RendusDesPrix, type RenduDUnJoueur } from "./rendus-prix";
import { parseNoted, siteLink } from "./salon-discord";

export const MIGRATION_RENDUS = "20261121000600_prix_baisses_rendus";
export const DISCORD_API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (rendus-des-prix, 1.0)";

/* ---------- L'état noté ---------- */

/**
 * Ce qui est parti : `public_le` l'heure du message public (null : pas encore), `jusqu_a` la ligne du journal du dernier
 * joueur traité, et des nombres : messages privés partis, refusés par Discord (messages privés fermés, joueur parti du
 * serveur), joueurs sans Discord connu ; `bloque` : le joueur dont le message a échoué, et combien de passages de suite ;
 * `abandons` : ceux passés après `ESSAIS_PAR_JOUEUR` échecs ; `fini` : tout est parti, le robot n'appelle plus personne.
 */
export interface RendusSendState {
  public_le: string | null;
  jusqu_a: number | null;
  prives: number;
  fermes: number;
  sans_discord: number;
  bloque?: { n: number; fois: number };
  abandons?: number;
  fini?: boolean;
}

const EtatNote = z.object({
  public_le: z.string().refine((s) => !Number.isNaN(Date.parse(s))).nullable(),
  jusqu_a: z.number().int().nonnegative().nullable(),
  prives: z.number().int().nonnegative(),
  fermes: z.number().int().nonnegative(),
  sans_discord: z.number().int().nonnegative(),
  bloque: z.object({ n: z.number().int().positive(), fois: z.number().int().positive() }).optional(),
  abandons: z.number().int().nonnegative().optional(),
  fini: z.boolean().optional(),
});

/**
 * Après tant de passages de suite où le message d'un même joueur échoue (une heure, à un passage toutes les 5 minutes), il
 * est passé : les suivants n'attendent pas sans fin, et une panne de Discord de quelques minutes ne fait perdre personne.
 */
export const ESSAIS_PAR_JOUEUR = 12;

export const ETAT_DE_DEPART: RendusSendState = { public_le: null, jusqu_a: null, prives: 0, fermes: 0, sans_discord: 0 };

/** L'état noté, ou null s'il manque ; un état illisible donne un avertissement. */
export const parseRendusState = (raw: string | null, restart = "rien n'est renvoyé tant que sa copie en cache ne se lit pas") => parseNoted(EtatNote, raw, restart);

/** L'état le plus avancé des deux (celui de main et sa copie en cache) : rien ne repart deux fois. */
export function mergeRendusStates(a: RendusSendState | null, b: RendusSendState | null): RendusSendState | null {
  if (!a) return b;
  if (!b) return a;
  const avance = (a.jusqu_a ?? 0) >= (b.jusqu_a ?? 0) ? a : b;
  return { ...avance, public_le: a.public_le ?? b.public_le, ...(a.fini || b.fini ? { fini: true } : {}) };
}

/* ---------- La lecture au serveur ---------- */

export type LectureDesRendus = { etat: "lu"; reponse: RendusDesPrix } | { etat: "sans-reglage" | "fonction-absente" | "panne"; warning: string };

export type RendusCall = (url: string, key: string, apres: number | null) => Promise<unknown>;

const callSupabase: RendusCall = async (url, key, apres) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("rendus_des_prix", { p_apres: apres }).abortSignal(AbortSignal.timeout(10_000));
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*rendus_des_prix\b.* does not exist/i.test(e.message);
}

/** Un message d'erreur sans lien, clé ni identifiant : tout ce qui y ressemble est remplacé par « … », puis coupé. */
export function messageSur(e: unknown, secrets: readonly string[]): string {
  let texte = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…");
  for (const secret of secrets) if (secret.length >= 4) texte = texte.split(secret).join("…");
  return texte
    .replace(/\b[0-9]{17,20}\b/g, "…")
    .replace(/\b[0-9a-fA-F]{32,}\b/g, "…")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]+/g, "…")
    .slice(0, 160);
}

/** Les joueurs remboursés après `apres` (null : depuis le début). Ne lève jamais d'erreur. */
export async function lireLesRendus(apres: number | null, env: Record<string, string | undefined> = process.env, call: RendusCall = callSupabase): Promise<LectureDesRendus> {
  const url = env["SUPABASE_URL"]?.trim();
  const key = env["SUPABASE_SECRET_KEY"]?.trim();
  if (!url || !key) return { etat: "sans-reglage", warning: "pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, rien de lu" };
  try {
    const reponse = lireRendusDesPrix(await call(url, key, apres));
    return reponse ? { etat: "lu", reponse } : { etat: "panne", warning: "réponse du serveur illisible, rien n'est envoyé" };
  } catch (e) {
    if (fonctionAbsente(e)) return { etat: "fonction-absente", warning: `la migration ${MIGRATION_RENDUS} n'est pas encore collée dans Supabase, rien n'est envoyé` };
    return { etat: "panne", warning: `lecture impossible (${messageSur(e, [url, key])}), rien n'est envoyé` };
  }
}

/* ---------- Les messages ---------- */

/** Une image dessinée et sa description pour les lecteurs d'écran. */
export interface ImageDuRendu {
  png: Uint8Array;
  alt: string;
}

/** Le bouton des deux messages : la bourse et la boutique, dans Mon Gaulois. */
export const boutonsDuRendu = (siteUrl: string) => [{ label: "Ouvrir Mon Gaulois", url: siteLink(siteUrl, "/village#boutique") }];

/**
 * Le message public : l'image (le texte y est dessiné) dans un cadre de Discord à la couleur choisie, et le bouton.
 * `texte` : le message de secours, si l'image ne se dessine pas.
 */
export function payloadPublic(siteUrl: string, couleur: number, image: { alt: string; filename: string } | null, texte: string): Record<string, unknown> {
  if (!image) return textMessage(siteUrl, texte);
  const base = imageMessage(siteUrl, image, boutonsDuRendu(siteUrl));
  return { ...base, embeds: [{ color: couleur, image: { url: `attachment://${image.filename}` } }] };
}

/** Le message privé : l'image du joueur dans un cadre à la couleur choisie, le bouton, et le texte en secours. */
export function payloadPrive(siteUrl: string, couleur: number, image: { alt: string; filename: string } | null, texte: string): Record<string, unknown> {
  const boutons = { components: [{ type: 1, components: boutonsDuRendu(siteUrl).map(({ label, url }) => ({ type: 2, style: 5, label, url })) }] };
  if (!image) return { content: texte, allowed_mentions: { parse: [] }, ...boutons };
  return {
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: image.filename, description: image.alt }],
    embeds: [{ color: couleur, image: { url: `attachment://${image.filename}` } }],
    ...boutons,
  };
}

/* ---------- Le robot, pour les messages privés ---------- */

interface Reponse {
  status: number;
  body: unknown;
}

export type ResultatPrive = "envoye" | "ferme" | "echec";

/** Les codes de Discord pour un joueur qu'on ne peut pas joindre : messages privés fermés, compte inconnu ou parti. */
const INJOIGNABLE = new Set([50007, 10013, 50278]);

const code = (body: unknown): number | null => {
  const c = body && typeof body === "object" ? (body as Record<string, unknown>)["code"] : null;
  return typeof c === "number" ? c : null;
};

/** Discord demande de ralentir : on attend ce qu'il dit, cinq secondes au plus, et on réessaie une fois. */
const ATTENTE_MAX_MS = 5_000;

export interface RobotDeps {
  token: string;
  fetch: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

/** Ouvre la conversation privée du robot avec le joueur et y poste le message. Ne lève jamais d'erreur. */
export async function envoyerEnPrive(discord: string, message: { payload: Record<string, unknown>; png: Uint8Array | null; filename: string }, { token, fetch: send, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }: RobotDeps): Promise<ResultatPrive> {
  const headers = { authorization: `Bot ${token}`, "user-agent": USER_AGENT };
  async function appel(path: string, body: BodyInit, json: boolean): Promise<Reponse | null> {
    for (let essai = 0; essai < 2; essai++) {
      let response: Response;
      try {
        response = await send(`${DISCORD_API}${path}`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
          headers: json ? { ...headers, "content-type": "application/json" } : headers,
          body,
        });
      } catch {
        return null;
      }
      let lu: unknown = null;
      try {
        const t = await response.text();
        lu = t === "" ? null : JSON.parse(t);
      } catch {
        lu = null;
      }
      if (response.status === 429 && essai === 0) {
        const s = Number(lu && typeof lu === "object" ? (lu as Record<string, unknown>)["retry_after"] : NaN);
        await wait(Math.min(ATTENTE_MAX_MS, Number.isFinite(s) ? Math.ceil(s * 1000) + 100 : 1000));
        continue;
      }
      return { status: response.status, body: lu };
    }
    return null;
  }
  const canal = await appel("/users/@me/channels", JSON.stringify({ recipient_id: discord }), true);
  if (!canal) return "echec";
  if (canal.status >= 400) return INJOIGNABLE.has(code(canal.body) ?? 0) ? "ferme" : "echec";
  const id = canal.body && typeof canal.body === "object" ? (canal.body as Record<string, unknown>)["id"] : null;
  if (typeof id !== "string" || !/^[0-9]{17,20}$/.test(id)) return "echec";
  let body: BodyInit;
  let json = false;
  if (message.png) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(message.payload));
    form.append("files[0]", new Blob([Buffer.from(message.png)], { type: "image/png" }), message.filename);
    body = form;
  } else {
    body = JSON.stringify(message.payload);
    json = true;
  }
  const poste = await appel(`/channels/${id}/messages`, body, json);
  if (!poste) return "echec";
  if (poste.status >= 200 && poste.status < 300) return "envoye";
  return INJOIGNABLE.has(code(poste.body) ?? 0) ? "ferme" : "echec";
}

/* ---------- Le passage ---------- */

export interface RendusPassDeps {
  stored: RendusSendState | null;
  lire: (apres: number | null) => Promise<LectureDesRendus>;
  /** Poste le message public ; `true` : Discord l'a accepté. */
  envoyerPublic: (r: RendusDesPrix) => Promise<boolean>;
  /** Envoie le message privé d'un joueur qui a un identifiant Discord. */
  envoyerPrive: (rendu: RenduDUnJoueur & { discord: string }) => Promise<ResultatPrive>;
  note: (state: RendusSendState) => void;
  now: Date;
  log: (line: string) => void;
  /** Combien de messages privés au plus par passage : le reste part au passage suivant. */
  maxPrives?: number;
  /** Entre deux messages privés, pour ne pas presser Discord. */
  pause?: () => Promise<void>;
}

export interface RendusPassResult {
  public: boolean;
  prives: number;
  fermes: number;
  sansDiscord: number;
  /** Il reste des joueurs à prévenir : le passage suivant continue. */
  reste: boolean;
}

/** Le message public d'abord, une fois ; puis chaque joueur, dans l'ordre, à partir du dernier noté. */
export async function rendusPass({ stored, lire, envoyerPublic, envoyerPrive, note, now, log, maxPrives = 40, pause = async () => {} }: RendusPassDeps): Promise<RendusPassResult> {
  const etat: RendusSendState = { ...(stored ?? ETAT_DE_DEPART) };
  const resultat: RendusPassResult = { public: false, prives: 0, fermes: 0, sansDiscord: 0, reste: false };
  let lu = await lire(etat.jusqu_a);
  if (lu.etat !== "lu") {
    log(lu.etat === "panne" ? `::warning::Trop-payé rendu : ${lu.warning}.` : `Trop-payé rendu : ${lu.warning}.`);
    return resultat;
  }
  if (lu.reponse.comptes === 0) {
    log("Trop-payé rendu : personne à rembourser, rien n'est envoyé.");
    etat.fini = true;
    note(etat);
    return resultat;
  }
  if (!etat.public_le) {
    if (!(await envoyerPublic(lu.reponse))) return { ...resultat, reste: true };
    etat.public_le = now.toISOString();
    resultat.public = true;
    note(etat);
  }
  let envoyes = 0;
  for (;;) {
    for (const rendu of lu.reponse.rendus) {
      if (rendu.n <= (etat.jusqu_a ?? 0)) continue;
      if (rendu.discord) {
        if (envoyes >= maxPrives) return { ...resultat, reste: true };
        if (envoyes > 0) await pause();
        const r = await envoyerPrive({ ...rendu, discord: rendu.discord });
        if (r === "echec") {
          const fois = etat.bloque?.n === rendu.n ? etat.bloque.fois + 1 : 1;
          if (fois < ESSAIS_PAR_JOUEUR) {
            etat.bloque = { n: rendu.n, fois };
            note(etat);
            log("::warning::Trop-payé rendu : Discord n'a pas pris un message privé. Nouvel essai au prochain passage.");
            return { ...resultat, reste: true };
          }
          log(`::warning::Trop-payé rendu : un message privé a échoué ${ESSAIS_PAR_JOUEUR} passages de suite, le joueur est passé.`);
          etat.abandons = (etat.abandons ?? 0) + 1;
        }
        delete etat.bloque;
        envoyes++;
        if (r === "envoye") {
          etat.prives++;
          resultat.prives++;
        } else if (r === "ferme") {
          etat.fermes++;
          resultat.fermes++;
        }
      } else {
        etat.sans_discord++;
        resultat.sansDiscord++;
      }
      etat.jusqu_a = rendu.n;
      note(etat);
    }
    // Une page pleine : il peut en rester. Une page vide ou partielle : tout est lu.
    if (lu.reponse.rendus.length < 25) break;
    const suite = await lire(etat.jusqu_a);
    if (suite.etat !== "lu") {
      log(`::warning::Trop-payé rendu : ${suite.warning}. Suite au prochain passage.`);
      return { ...resultat, reste: true };
    }
    lu = suite;
    if (lu.reponse.rendus.length === 0) break;
  }
  etat.fini = true;
  note(etat);
  return resultat;
}

/** Poste le message public par le lien du salon, en image, ou en texte si elle ne se dessine pas. */
export interface PublicDeps {
  link: string;
  r: RendusDesPrix;
  couleur: number;
  dessiner: (r: RendusDesPrix) => Promise<ImageDuRendu>;
  texte: string;
  siteUrl: string;
  fetch: typeof globalThis.fetch;
  log: (line: string) => void;
}

export function posterLePublic({ link, r, couleur, dessiner, texte, siteUrl, fetch: poster, log }: PublicDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Trop-payé rendu",
    text: payloadPublic(siteUrl, couleur, null, texte),
    image: async () => {
      const { png, alt } = await dessiner(r);
      const filename = "prix-baisses.png";
      return { payload: payloadPublic(siteUrl, couleur, { alt, filename }, texte), png, filename };
    },
    fetch: poster,
    log,
  });
}
