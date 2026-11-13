/**
 * Les commandes du serveur Discord du clan suivent celles du code (demande du pilote, 13 novembre 2026 : « j'en ai marre je
 * dois tout le temps reset le token »). Avant, chaque nouvelle commande passait par `npm run discord:commande`, qui demandait
 * le jeton de « Le Gaulois » ; Discord ne montrant un jeton qu'une fois, il fallait un « Reset Token », qui annulait celui
 * que garde la fonction (rôles, tickets et concours arrêtés jusqu'au recollage), et deux fois un Reset ou un collage a touché
 * le robot des images de bienvenue, au nom presque pareil.
 *
 * La fonction garde ce jeton (`LE_GAULOIS_BOT_TOKEN`) : au premier appel de chaque instance (Supabase en démarre une neuve
 * après chaque mise en ligne, et une instance ne vit que quelques minutes), elle lit les commandes que Discord connaît sur le
 * serveur du clan, et met à jour, une à une, celles qui diffèrent des définitions (`definitions.ts`) : une commande qui
 * existe se modifie (PATCH), seule une commande absente se crée (POST), car Discord limite les créations à 200 par jour et
 * par serveur. Elle n'en retire jamais : une commande que le code ne connaît plus reste sur le serveur.
 *
 * Rien n'est noté ailleurs que dans la mémoire de l'instance : chaque instance neuve compare de nouveau, ce qui ne coûte qu'une
 * lecture quand tout est à jour. Discord rend chaque commande telle qu'il l'a gardée : si elle diffère encore du code, la
 * comparaison ignore un champ, chaque instance la renverrait, et `/etat` le dit (`"inscription":false`). Les journaux ne
 * nomment que des commandes.
 */
import { COMMANDS } from "./definitions.ts";

/** Ce dont l'inscription a besoin du monde : remplacé dans les tests. */
export interface InscriptionDeps {
  /** L'application « Le Gaulois » : celle du jeton, vérifié avant l'appel. */
  applicationId: string;
  guildId: string;
  /** Un appel à l'API de Discord avec le jeton du robot ; `null` si Discord ne répond pas. */
  discord(method: string, path: string, call?: { body?: unknown; timeoutMs?: number }): Promise<{ status: number; body: unknown } | null>;
  log(message: string): void;
}

export interface InscriptionResult {
  /** Toutes les commandes du code sont sur le serveur, comme le code les décrit. */
  ok: boolean;
  /** Les commandes créées ou remises à jour, par leur nom. */
  sent: string[];
  /** Les commandes déjà à jour. */
  same: number;
}

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : null);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Une option réduite à ce que le code règle. Discord la rend avec des champs de plus (traductions…) et sans ceux qui valent
 * leur valeur par défaut (`required` faux, par exemple) : les deux côtés prennent donc ici la même forme.
 */
function optionShape(value: unknown): Loose {
  const option = record(value) ?? {};
  return {
    type: option["type"] ?? null,
    name: option["name"] ?? null,
    description: option["description"] ?? null,
    required: option["required"] === true,
    autocomplete: option["autocomplete"] === true,
    choices: list(option["choices"]).map((choice) => ({ name: record(choice)?.["name"] ?? null, value: record(choice)?.["value"] ?? null })),
    channel_types: list(option["channel_types"]),
    min_value: option["min_value"] ?? null,
    max_value: option["max_value"] ?? null,
    min_length: option["min_length"] ?? null,
    max_length: option["max_length"] ?? null,
    options: list(option["options"]).map(optionShape),
  };
}

/** Une commande réduite à ce que le code règle, en texte : deux commandes de même forme ont le même texte. */
export function commandShape(value: unknown): string {
  const command = record(value) ?? {};
  return JSON.stringify({
    type: command["type"] ?? 1,
    name: command["name"] ?? null,
    description: command["description"] ?? null,
    default_member_permissions: command["default_member_permissions"] ?? null,
    options: list(command["options"]).map(optionShape),
  });
}

/** Une lecture ou un envoi : Discord répond vite, et une tâche de fond n'a rien qui presse. */
const CALL_TIMEOUT_MS = 8000;

/** Les champs de commande et d'option que `commandShape` compare : un champ hors de ces listes, dans une définition, ne compterait pas. */
export const COMPARED_COMMAND_KEYS = ["type", "name", "description", "default_member_permissions", "options"] as const;
export const COMPARED_OPTION_KEYS = ["type", "name", "description", "required", "autocomplete", "choices", "channel_types", "min_value", "max_value", "min_length", "max_length", "options"] as const;

/** Une commande se reconnaît à son type et à son nom : Discord permet une commande « / » et un menu qui portent le même nom. */
const commandKey = (command: unknown): string => `${record(command)?.["type"] ?? 1}:${String(record(command)?.["name"] ?? "")}`;

/**
 * Ce qu'envoie la modification d'une commande qui existe (PATCH) : tous ses champs, et ceux qu'elle n'a pas, remis à vide, pour
 * qu'il ne reste rien d'avant. Sans le type, que Discord ne laisse pas changer.
 */
function patchBody(command: unknown): Loose {
  const body: Loose = { ...(record(command) ?? {}) };
  delete body["type"];
  return { ...body, options: body["options"] ?? [], default_member_permissions: body["default_member_permissions"] ?? null };
}

const SNOWFLAKE = /^[0-9]{17,20}$/;

/**
 * Compare les commandes du serveur du clan à celles du code, et met à jour celles qui diffèrent : PATCH pour une commande qui
 * existe, POST pour une commande absente. S'arrête au premier refus : les suivantes n'auraient pas plus de chance (jeton,
 * droits), et la fois suivante reprendra. `ok` : toutes sont comme le code les décrit, de l'avis même de Discord.
 */
export async function registerCommands(deps: InscriptionDeps, commands: readonly unknown[] = COMMANDS): Promise<InscriptionResult> {
  const path = `/applications/${deps.applicationId}/guilds/${deps.guildId}/commands`;
  const result: InscriptionResult = { ok: false, sent: [], same: 0 };
  const listed = await deps.discord("GET", path, { timeoutMs: CALL_TIMEOUT_MS });
  if (!listed || listed.status !== 200 || !Array.isArray(listed.body)) {
    deps.log(`commandes de Discord illisibles (${listed ? listed.status : "injoignable"}) : nouvel essai plus tard`);
    return result;
  }
  const known = new Map<string, { id: string | null; shape: string }>();
  for (const entry of listed.body) {
    const found = record(entry);
    if (typeof found?.["name"] !== "string") continue;
    const id = found["id"];
    known.set(commandKey(found), { id: typeof id === "string" && SNOWFLAKE.test(id) ? id : null, shape: commandShape(found) });
  }
  let faithful = true;
  for (const command of commands) {
    const name = String(record(command)?.["name"] ?? "");
    const wanted = commandShape(command);
    const existing = known.get(commandKey(command));
    if (existing?.shape === wanted) {
      result.same++;
      continue;
    }
    // Modifier une commande n'est pas en créer une : seules les créations comptent dans la limite de 200 par jour.
    const sent = existing?.id
      ? await deps.discord("PATCH", `${path}/${existing.id}`, { body: patchBody(command), timeoutMs: CALL_TIMEOUT_MS })
      : await deps.discord("POST", path, { body: command, timeoutMs: CALL_TIMEOUT_MS });
    if (!sent || sent.status < 200 || sent.status >= 300) {
      deps.log(`commande /${name} refusée par Discord (${sent ? sent.status : "injoignable"}) : nouvel essai plus tard`);
      return result;
    }
    result.sent.push(name);
    // Discord rend la commande telle qu'il l'a gardée. Si elle diffère encore du code, la comparaison ignore un champ : chaque
    // instance la renverrait. Le journal le dit, et `/etat` aussi.
    if (commandShape(sent.body) !== wanted) {
      faithful = false;
      deps.log(`commande /${name} gardée par Discord autrement que dans le code : la comparaison est à revoir (inscription.ts)`);
    }
  }
  if (result.sent.length > 0) deps.log(`commandes mises à jour sur Discord : ${result.sent.map((name) => `/${name}`).join(", ")}`);
  return { ...result, ok: faithful };
}

/**
 * Dans une même instance, après une comparaison réussie, la suivante attend six heures ; après un échec, cinq minutes. Une
 * instance vivant quelques minutes, c'est surtout chaque instance neuve qui compare.
 */
export const RECHECK_MS = 6 * 60 * 60_000;
export const RETRY_MS = 5 * 60_000;

/** Ce que la fonction retient de la dernière comparaison, le temps de sa vie. */
export interface SyncState {
  /** L'heure de la dernière comparaison terminée, ou `null`. */
  at: number | null;
  ok: boolean;
  /** La comparaison en cours : deux appels en même temps attendent la même. */
  running: Promise<boolean> | null;
}

export const newSyncState = (): SyncState => ({ at: null, ok: false, running: null });

/**
 * Compare si l'heure est venue, sinon redit le dernier résultat. `true` : les commandes du serveur sont celles du code. Ne
 * lève jamais d'erreur : un échec se dit au journal, et l'essai suivant vient cinq minutes plus tard.
 */
export function syncCommands(state: SyncState, now: number, deps: InscriptionDeps): Promise<boolean> {
  if (state.running) return state.running;
  if (state.at !== null && now - state.at < (state.ok ? RECHECK_MS : RETRY_MS)) return Promise.resolve(state.ok);
  const running = registerCommands(deps)
    .then(
      (result) => result.ok,
      (e: unknown) => {
        deps.log(`inscription des commandes : ${e instanceof Error ? e.message : String(e)}`);
        return false;
      },
    )
    .then((ok) => {
      state.at = now;
      state.ok = ok;
      state.running = null;
      return ok;
    });
  state.running = running;
  return running;
}
