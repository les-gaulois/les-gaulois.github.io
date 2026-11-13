/**
 * Les émojis du robot « Le Gaulois » : les icônes en pixels du site, posées sur les boutons du panneau des rôles et des
 * tickets (`src/lib/emojis-discord.ts`, qui les dessine ; docs/DIRECTION.md, « Les rôles sur Discord »). Ce sont des émojis
 * de l'application, pas du serveur : la fonction les dépose elle-même chez Discord la première fois qu'elle en a besoin,
 * avec le jeton du robot, d'après leur PNG publié par le site (`emojis` de /commandes.json), puis s'en sert par leur numéro.
 * Sans eux, un bouton garde son émoji ordinaire, ou n'en a pas : rien ne casse. Et les vignettes, l'icône d'un rôle ou d'une
 * demande dans la case sombre des images du robot, que la fonction pose à côté d'une réponse.
 */
import type { CommandIndex, Deps } from "./index.ts";

/** Les numéros des émojis de l'application chez Discord, par nom. */
export type EmojiIds = ReadonlyMap<string, string>;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Un numéro de Discord : seul un numéro de cette forme part sur un bouton. */
const DISCORD_ID = /^[0-9]{17,20}$/;

/** Un PNG en base64, pour l'envoyer à Discord dans une adresse « data: ». */
export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Les émojis de l'application chez Discord : le numéro de chacun, par nom. `null` sans jeton, ou si Discord ne répond pas. */
export async function appEmojis(deps: Deps): Promise<Map<string, string> | null> {
  if (deps.botId === "") return null;
  const reply = await deps.discord("GET", `/applications/${deps.botId}/emojis`);
  const items = reply?.status === 200 ? record(reply.body)?.["items"] : null;
  if (!Array.isArray(items)) return null;
  const ids = new Map<string, string>();
  for (const item of items) {
    const id = record(item)?.["id"];
    const name = record(item)?.["name"];
    if (typeof id === "string" && DISCORD_ID.test(id) && typeof name === "string") ids.set(name, id);
  }
  return ids;
}

/**
 * Les émojis `names`, déposés chez Discord s'il en manque, chacun d'après son PNG du site. Rend les numéros connus ; un émoji
 * qui n'a pas pu être déposé n'y est pas, et son bouton part sans lui. Discord refuse deux émojis du même nom à une
 * application : deux commandes lancées en même temps n'en déposent qu'un. Si la liste ne se lit pas, rien n'est déposé, pour
 * ne pas doubler ce qui existe peut-être déjà.
 */
export async function ensureEmojis(names: readonly string[], index: CommandIndex | null, deps: Deps): Promise<Map<string, string>> {
  const known = await appEmojis(deps);
  if (!known) return new Map();
  for (const name of names) {
    if (known.has(name)) continue;
    const source = index?.emojis?.find((emoji) => emoji.name === name);
    const bytes = source ? await deps.siteImage(source.image) : null;
    if (!bytes) {
      deps.log(`émoji ${name} : pas d'image sur le site`);
      continue;
    }
    const reply = await deps.discord("POST", `/applications/${deps.botId}/emojis`, { body: { name, image: `data:image/png;base64,${toBase64(bytes)}` } });
    const id = record(reply?.body)?.["id"];
    if (reply && reply.status >= 200 && reply.status < 300) {
      // Son numéro, s'il en a la forme ; sinon le bouton part sans lui, et le prochain panneau le retrouvera dans la liste.
      if (typeof id === "string" && DISCORD_ID.test(id)) known.set(name, id);
      else deps.log(`émoji ${name} : déposé, mais son numéro ne se lit pas`);
    } else deps.log(`émoji ${name} : pas déposé (${reply ? reply.status : "Discord ne répond pas"})`);
  }
  return known;
}

/** Le champ `emoji` d'un bouton : l'émoji du robot s'il est déposé, sinon `fallback` (un émoji ordinaire), sinon rien. */
export function buttonEmoji(name: string, ids: EmojiIds, fallback?: string): { emoji?: { id?: string; name: string } } {
  const id = ids.get(name);
  if (id) return { emoji: { id, name } };
  return fallback ? { emoji: { name: fallback } } : {};
}

/** L'adresse d'une vignette du site, par le nom de son icône, ou `null` si l'index ne la donne pas. */
export function vignetteUrl(index: CommandIndex | null, icone: string, siteUrl: string): string | null {
  const vignette = index?.vignettes?.find((v) => v.name === icone);
  return vignette ? `${siteUrl}${vignette.image}` : null;
}
