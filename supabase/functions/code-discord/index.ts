/**
 * Se connecter sans lier son compte Discord (docs/DIRECTION.md, « Se connecter avec un code ») : dans le serveur Discord du
 * clan, le joueur tape /code ; ce robot lui montre un code, à lui seul ; il le tape sur le site, qui ouvre sa session.
 * Une fonction serveur de Supabase (Deno), à trois portes :
 *
 * - `POST …/code-discord/discord` : l'adresse des interactions de l'application Discord. Discord y envoie chaque commande,
 *   signée de sa clé. La fonction vérifie la signature et l'heure, que la commande vient du serveur du clan, garde
 *   l'empreinte d'un nouveau code (`discord_code_issue`), et répond au seul joueur qui l'a tapée.
 * - `POST …/code-discord/session` : le site y envoie le code tapé. S'il est bon (`discord_code_redeem`), la fonction
 *   retrouve le compte de ce Discord par son seul identifiant, ou le crée, marqué de cet identifiant dans ses métadonnées
 *   d'application, avec une adresse tirée au sort, puis lui donne son identifiant (`discord_code_attach`). Elle demande
 *   ensuite à Supabase de quoi ouvrir sa session : un lien magique qui n'est envoyé nulle part, dont elle vérifie qu'il
 *   ouvre bien ce compte, et dont le navigateur échange l'empreinte contre sa session (`verifyOtp`).
 * - `GET …/code-discord/etat` : dit si les réglages sont posés, sans en montrer aucun, et si le moteur sait vérifier une
 *   signature (essayé sur l'exemple de la RFC 8032).
 *
 * Réglages : aucun. Le serveur du clan et la clé publique de l'application sont écrits plus bas, publics tous deux ; les
 * secrets `DISCORD_GUILD_ID` et `DISCORD_PUBLIC_KEY` les remplacent s'ils sont posés. Supabase donne lui-même `SUPABASE_URL`
 * et la clé de service. Déployée
 * sans vérification de jeton (`verify_jwt = false`, `supabase/config.toml`) : Discord n'en envoie pas, et la fonction
 * vérifie elle-même chaque appel. Elle ne note jamais un code, une adresse ni un jeton dans ses journaux.
 *
 * Sans import : elle se colle telle quelle dans l'éditeur de Supabase, et les tests du dépôt la lisent avec Node
 * (`tests/unit/code-discord.test.ts`).
 */

/** Le nom de la commande, tel que le joueur la tape. `scripts/discord-commande.ts` la crée sur le serveur du clan. */
export const COMMAND_NAME = "code";
/** Sans les signes qui se confondent (0 et O, 1, I et L) : 31 signes, et plus de 850 milliards de codes de huit signes. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
/** Le site, où l'on tape le code. */
export const SITE_URL = "https://les-gaulois.github.io";
/**
 * Le serveur Discord du clan et la clé publique de l'application de la connexion, « Le Gaulois » : publics tous deux, lus le
 * 12 novembre 2026, le premier dans l'invitation du clan (`config/clan.ts`), la seconde dans les informations publiques de
 * l'application (`/applications/1473059048546107434/rpc`). Les secrets DISCORD_GUILD_ID et DISCORD_PUBLIC_KEY de la fonction
 * les remplacent s'ils sont posés, pour une autre application ou un autre serveur.
 */
export const GAL_GUILD_ID = "1350905494600024094";
export const APP_PUBLIC_KEY = "d9d55bd88a96ebd72728cfd0a87b494065dd9b094f1a9254e24640ee02441855";
/** Discord date chaque commande qu'il signe : au-delà de cinq minutes d'écart, elle ne vaut plus. */
const MAX_SKEW_SECONDS = 300;
/** Une réponse que seul le joueur voit. */
const EPHEMERAL = 64;

/** Ce dont la fonction a besoin du monde : remplacé dans les tests. */
export interface Deps {
  publicKey: string;
  guildId: string;
  serviceReady: boolean;
  nowSeconds(): number;
  randomBytes(n: number): Uint8Array<ArrayBuffer>;
  /** Une fonction SQL avec la clé de service : sa réponse, ou `null` si le serveur ne répond pas. */
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  /** Crée le compte d'un joueur au code, son identifiant Discord dans ses métadonnées d'application. Son numéro, ou `null`. */
  createUser(email: string, discordId: string): Promise<string | null>;
  deleteUser(id: string): Promise<void>;
  /** L'empreinte du lien magique du compte à cette adresse, et le numéro de ce compte, ou `null`. Rien n'est envoyé. */
  magicLink(email: string): Promise<{ tokenHash: string; userId: string } | null>;
  log(message: string): void;
}

/* ---------- Le code ---------- */

export function newCode(randomBytes: (n: number) => Uint8Array): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      // 248 = 8 × 31 : au-delà, le reste de la division favoriserait les premiers signes.
      if (byte < 248 && code.length < CODE_LENGTH) code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
    }
  }
  return code;
}

/** Le code tel que le joueur l'a tapé : minuscules, espaces et tiret acceptés. `null` s'il ne peut pas être un code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const c of code) if (!CODE_ALPHABET.includes(c)) return null;
  return code;
}

export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * L'adresse e-mail d'un compte ouvert avec un code : Supabase en veut une, Discord n'en donne pas par ce chemin. Le domaine
 * .invalid n'existe nulle part (RFC 2606) : aucun message n'y part. Sa fin est tirée au sort : personne ne peut prendre
 * d'avance l'adresse d'un autre joueur.
 */
export function codeAccountEmail(discordId: string, randomBytes: (n: number) => Uint8Array): string {
  const tail = [...randomBytes(8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `discord-${discordId}-${tail}@code.gal.invalid`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- La signature de Discord ---------- */

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** La clé publique Ed25519 dans son enveloppe SPKI, pour un moteur qui n'importe pas la clé brute. */
export function ed25519Spki(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
  const spki = new Uint8Array(prefix.length + raw.length);
  spki.set(prefix);
  spki.set(raw, prefix.length);
  return spki;
}

async function verifyEd25519(key: Uint8Array<ArrayBuffer>, signature: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>): Promise<boolean> {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]);
  } catch {
    cryptoKey = await crypto.subtle.importKey("spki", ed25519Spki(key), { name: "Ed25519" }, false, ["verify"]);
  }
  return crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, signature, message);
}

/** Discord signe l'heure suivie du corps de la requête, en Ed25519, avec la clé de l'application. */
export async function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): Promise<boolean> {
  const key = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (!key || key.length !== 32 || !signature || signature.length !== 64 || timestamp === "") return false;
  try {
    return await verifyEd25519(key, signature, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

/** Le premier exemple de la RFC 8032 (section 7.1) : une clé publique, et sa signature d'un message vide. */
const RFC8032_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const RFC8032_SIGNATURE = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

/** Le moteur qui fait tourner la fonction sait-il vérifier une signature Ed25519 ? Essayé sur l'exemple de la RFC. */
export async function signatureWorks(): Promise<boolean> {
  try {
    return await verifyEd25519(hexToBytes(RFC8032_KEY) ?? new Uint8Array(0), hexToBytes(RFC8032_SIGNATURE) ?? new Uint8Array(0), new Uint8Array(0));
  } catch {
    return false;
  }
}

/* ---------- Les réponses ---------- */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

const ephemeral = (content: string): Response => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

/** Le message du code, que Discord écrit à l'heure et dans la langue de chacun (`<t:…:t>`, `<t:…:R>`). */
export function codeMessage(code: string, expiresAt: number): string {
  return [
    `Votre code pour le site du clan : \`${formatCode(code)}\``,
    `Tapez-le sur ${SITE_URL}/compte#code avant <t:${expiresAt}:t> (<t:${expiresAt}:R>). Il ne sert qu'une fois.`,
    "Ne le donnez à personne : l'encadrement ne vous le demandera jamais.",
  ].join("\n");
}

export const MESSAGES = {
  wrongPlace: "Tapez /code dans le serveur Discord du clan.",
  tooMany: "Vous avez demandé cinq codes en dix minutes : attendez un peu avant le suivant.",
  down: "Le site ne répond pas pour l'instant. Réessayez dans un moment.",
  failed: "Le code n'a pas pu être créé. Réessayez dans un moment.",
  unknown: "Cette commande n'existe pas.",
};

/* ---------- Les portes ---------- */

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

async function discordRoute(req: Request, deps: Deps): Promise<Response> {
  const body = await req.text();
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  if (deps.publicKey === "" || !(await verifyDiscordSignature(deps.publicKey, signature, timestamp, body))) {
    return new Response("Signature invalide.", { status: 401 });
  }
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(deps.nowSeconds() - sentAt) > MAX_SKEW_SECONDS) {
    return new Response("Signature trop ancienne.", { status: 401 });
  }
  let interaction: Record<string, unknown> | null;
  try {
    interaction = record(JSON.parse(body));
  } catch {
    interaction = null;
  }
  if (!interaction) return new Response("Requête illisible.", { status: 400 });
  // Discord vérifie l'adresse avant de l'accepter : il attend la même réponse à son « ping ».
  if (interaction["type"] === 1) return json({ type: 1 });
  if (interaction["type"] !== 2 || record(interaction["data"])?.["name"] !== COMMAND_NAME) return ephemeral(MESSAGES.unknown);

  const user = record(record(interaction["member"])?.["user"]);
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId || !user) return ephemeral(MESSAGES.wrongPlace);
  const id = user["id"];
  const username = user["username"];
  const interactionId = interaction["id"];
  if (user["bot"] === true || typeof id !== "string" || typeof username !== "string" || typeof interactionId !== "string") {
    return ephemeral(MESSAGES.failed);
  }

  const code = newCode(deps.randomBytes);
  const result = await deps.rpc("discord_code_issue", {
    p_code_hash: await sha256Hex(code),
    p_discord_id: id,
    p_discord_name: username,
    p_interaction_id: interactionId,
  });
  if (!result) return ephemeral(MESSAGES.down);
  if (result["ok"] !== true) {
    deps.log(`code refusé : ${String(result["error"])}`);
    return ephemeral(result["error"] === "too_many_codes" ? MESSAGES.tooMany : MESSAGES.failed);
  }
  const parsed = Date.parse(String(result["expires_at"]));
  const expiresAt = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : deps.nowSeconds() + 300;
  return ephemeral(codeMessage(code, expiresAt));
}

const refuse = (status: number, error: string): Response => json({ ok: false, error }, status, CORS);

async function sessionRoute(req: Request, deps: Deps): Promise<Response> {
  let payload: Record<string, unknown> | null;
  try {
    payload = record(await req.json());
  } catch {
    payload = null;
  }
  const typed = payload?.["code"];
  const code = typeof typed === "string" && typed.length <= 32 ? normalizeCode(typed) : null;
  if (!code) return refuse(400, "code_format");

  const redeemed = await deps.rpc("discord_code_redeem", { p_code_hash: await sha256Hex(code) });
  if (!redeemed) return refuse(503, "code_unavailable");
  if (redeemed["ok"] !== true) {
    return redeemed["error"] === "code_busy" ? refuse(429, "code_busy") : refuse(400, "code_invalid");
  }
  const discordId = redeemed["discord_id"];
  const discordName = redeemed["discord_name"];
  const foundId = redeemed["user_id"];
  const foundEmail = redeemed["email"];
  if (typeof discordId !== "string" || typeof discordName !== "string") return refuse(503, "code_unavailable");

  let userId: string;
  let email: string;
  if (typeof foundId === "string" && typeof foundEmail === "string") {
    // Ce Discord a déjà son compte, ouvert avec Discord ou avec un code.
    userId = foundId;
    email = foundEmail;
  } else if (foundId === null) {
    // Un nouveau joueur : son compte, marqué de son identifiant Discord, puis cet identifiant dans ses liens.
    email = codeAccountEmail(discordId, deps.randomBytes);
    const created = await deps.createUser(email, discordId);
    if (created === null) return refuse(503, "code_unavailable");
    userId = created;
    const attached = await deps.rpc("discord_code_attach", { p_user: created, p_discord_id: discordId, p_discord_name: discordName });
    if (attached?.["ok"] !== true) {
      await deps.deleteUser(created);
      // Ce Discord a eu un compte entre-temps, par un autre code : celui tout juste créé s'efface, la session ouvre l'autre.
      const otherId = attached?.["user_id"];
      const otherEmail = attached?.["email"];
      if (attached?.["error"] !== "discord_taken" || typeof otherId !== "string" || typeof otherEmail !== "string") return refuse(503, "code_unavailable");
      userId = otherId;
      email = otherEmail;
    }
  } else {
    return refuse(503, "code_unavailable");
  }

  // Le lien ouvre le compte attendu, et aucun autre : Supabase le retrouve par son adresse, la fonction vérifie son numéro.
  const link = await deps.magicLink(email);
  if (link === null) return refuse(503, "code_unavailable");
  if (link.userId !== userId) {
    deps.log("le lien de session vise un autre compte : refusé");
    return refuse(503, "code_unavailable");
  }
  return json({ ok: true, token_hash: link.tokenHash }, 200, CORS);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path.endsWith("/etat") && req.method === "GET") {
    const discord = deps.publicKey !== "" && deps.guildId !== "";
    // Une empreinte mal formée : la fonction SQL la refuse avant d'écrire quoi que ce soit. Sa réponse prouve à la fois la
    // clé de service et la migration installée.
    const probe = deps.serviceReady ? await deps.rpc("discord_code_redeem", { p_code_hash: "etat" }) : null;
    const service = probe?.["error"] === "invalid_request";
    return json({ ok: true, discord, service, signature: await signatureWorks() }, 200, CORS);
  }
  if (req.method !== "POST") return new Response("Méthode refusée.", { status: 405 });
  if (path.endsWith("/discord")) return discordRoute(req, deps);
  if (path.endsWith("/session")) return sessionRoute(req, deps);
  return new Response("Adresse inconnue.", { status: 404 });
}

/* ---------- Le vrai monde ---------- */

type Env = { get(name: string): string | undefined };

/** La clé de service : la nouvelle (`SUPABASE_SECRET_KEYS`, clé « default »), sinon l'ancienne. */
function serviceKey(env: Env): string {
  try {
    const keys = record(JSON.parse(env.get("SUPABASE_SECRET_KEYS") ?? "{}"));
    const key = keys?.["default"];
    if (typeof key === "string" && key !== "") return key;
  } catch {
    // Illisible : l'ancienne clé, plus bas.
  }
  return env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

export function liveDeps(env: Env, fetcher: typeof fetch = fetch): Deps {
  const url = (env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = serviceKey(env);
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const log = (message: string): void => console.log(`code-discord : ${message}`);

  async function call(path: string, init: RequestInit): Promise<{ status: number; body: unknown } | null> {
    try {
      const res = await fetcher(`${url}${path}`, { ...init, headers });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text === "" ? null : JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (e) {
      log(`${path.split("?")[0]} injoignable : ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  return {
    publicKey: (env.get("DISCORD_PUBLIC_KEY") ?? "").trim() || APP_PUBLIC_KEY,
    guildId: (env.get("DISCORD_GUILD_ID") ?? "").trim() || GAL_GUILD_ID,
    serviceReady: url !== "" && key !== "",
    nowSeconds: () => Math.floor(Date.now() / 1000),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    log,
    async rpc(name, args) {
      const res = await call(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
      if (!res || res.status !== 200) {
        if (res) log(`${name} : ${res.status}`);
        return null;
      }
      return record(res.body);
    },
    async createUser(email, discordId) {
      // Les métadonnées d'application ne s'écrivent qu'avec la clé de service : discord_code_attach les exige.
      const res = await call("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, email_confirm: true, app_metadata: { connexion: "code-discord", discord_id: discordId } }),
      });
      const id = record(res?.body)?.["id"];
      if (!res || res.status >= 300 || typeof id !== "string") {
        log(`création du compte : ${res?.status ?? "injoignable"}`);
        return null;
      }
      return id;
    },
    async deleteUser(id) {
      const res = await call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res || res.status >= 300) log(`effacement du compte : ${res?.status ?? "injoignable"}`);
    },
    async magicLink(email) {
      // La réponse porte le lien et, à côté, le compte qu'il ouvre (`id`).
      const res = await call("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
      const body = record(res?.body);
      const tokenHash = body?.["hashed_token"];
      const userId = body?.["id"];
      if (!res || res.status >= 300 || typeof tokenHash !== "string" || typeof userId !== "string") {
        log(`ouverture de session : ${res?.status ?? "injoignable"}`);
        return null;
      }
      return { tokenHash, userId };
    },
  };
}

const deno = (globalThis as unknown as { Deno?: { serve(handler: (req: Request) => Promise<Response>): unknown; env: Env } }).Deno;
if (deno) deno.serve((req) => handle(req, liveDeps(deno.env)));
