/**
 * Envoie chaque nouvelle victoire du clan sur le salon des victoires, avec l'image de la carte, lancé par le workflow
 * `.github/workflows/victoires.yml`, toutes les 5 minutes.
 *   npm run victoires:envoyer
 * Avec le lien du salon des victoires, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon le
 * secret DISCORD_WEBHOOK_VICTOIRES. Sans lien, ne fait rien, et ne note rien.
 * Les sessions des dernières heures sont lues sur l'API, plus fraîches que celles de la collecte horaire, qui servent aussi.
 * Les victoires passées sont notées dans data/victoires-envoi.json, enregistré sur main par le workflow, et dans
 * .cache/victoires-envoi.json, gardé par le cache du workflow : si l'enregistrement sur main échoue, rien ne repart.
 * Les victoires de config/victoires-rattrapage.json repartent une fois, même déjà notées : pour un salon qui ne les a pas reçues.
 * Voir src/lib/victoires.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { loadMembers, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { ApiClient } from "../src/lib/pipeline";
import { parseNoted } from "../src/lib/salon-discord";
import { salonLink } from "../src/lib/salon-lien";
import type { StoredSession } from "../src/lib/schemas";
import { isClanMember, mergeStates, parseResend, passSessions, readRecentSessions, readVictoryGame, VictoryState, victoryPass, type VictoryState as State } from "../src/lib/victoires";
import { sendVictory } from "../src/lib/victoires-discord";

const STATE_FILE = "data/victoires-envoi.json";
const CACHED_STATE_FILE = ".cache/victoires-envoi.json";
const RESEND_FILE = "config/victoires-rattrapage.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const writeState = (state: State) => {
  const text = `${JSON.stringify(state)}\n`;
  writeFileSync(STATE_FILE, text);
  mkdirSync(dirname(CACHED_STATE_FILE), { recursive: true });
  writeFileSync(CACHED_STATE_FILE, text);
};

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_VICTOIRES : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("victoires");
if (linkWarning) console.log(`Victoires : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des victoires, ni dans la Direction ni dans DISCORD_WEBHOOK_VICTOIRES : aucune victoire envoyée.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Victoires : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  // Les deux copies réunies : une victoire notée dans l'une ne repart pas, même si l'enregistrement sur main a échoué. Une copie
  // illisible est ignorée ; sans aucune, les victoires du moment servent de départ.
  const cached = parseNoted(VictoryState, readText(CACHED_STATE_FILE), "elle est ignorée");
  if (cached.warning) console.log("Victoires : copie en cache de l'état illisible, elle est ignorée.");
  const noted = parseNoted(VictoryState, readText(STATE_FILE), cached.state ? "sa copie gardée en cache sert" : "les victoires du moment servent de départ, sans rien envoyer");
  if (noted.warning) console.log(`::warning::Victoires : ${noted.warning}.`);
  const stored = mergeStates(noted.state, cached.state);
  const { games: resend, warning: resendWarning } = parseResend(readText(RESEND_FILE));
  if (resendWarning) console.log(`::warning::Victoires : ${resendWarning}.`);
  const now = new Date();
  const api = new ApiClient({ fetch, sleep, delayMs: 300 });
  let fresh: StoredSession[] | null = null;
  try {
    fresh = await readRecentSessions(api, clan.tag, now);
  } catch (e) {
    console.log(`Victoires : sessions des dernières heures illisibles (${e instanceof Error ? e.message : String(e)}).`);
  }
  const { sessions, warning: sessionsWarning } = passSessions(unreadableSessionFiles().length > 0 ? null : loadSessions(), fresh);
  if (sessionsWarning) console.log(`::warning::Victoires : ${sessionsWarning}.`);
  const root = process.cwd();
  // Chargés une seule fois, et seulement au premier message : si le dessin ne marche pas, le message part quand même, en texte.
  const drawing = (async () => {
    const [{ GazetteFonts }, image] = await Promise.all([import("../src/lib/gazette-image"), import("../src/lib/victoires-image")]);
    return { fonts: new GazetteFonts(root), image };
  })();
  drawing.catch(() => {});
  // Une même carte revient souvent dans la soirée : sa vignette n'est lue qu'une fois par passage.
  const thumbnails = new Map<string, Promise<import("../src/lib/victoires-image").Thumbnail | null>>();
  const result = await victoryPass({
    stored,
    sessions,
    members: loadMembers(),
    tag: clan.tag,
    now,
    readGame: (gameId) => readVictoryGame(gameId, fetch, sleep),
    isMember: (publicID) => isClanMember(api, publicID, clan.tag),
    send: (victory) =>
      sendVictory({
        link,
        victory,
        renderImage: async (v) => {
          const { fonts, image } = await drawing;
          let thumbnail = thumbnails.get(v.map);
          if (!thumbnail) {
            thumbnail = image.readThumbnail(v.map, fetch).catch((e: unknown) => {
              console.log(`Victoires : pas de vignette pour la carte ${v.map} (${e instanceof Error ? e.message : String(e)}), l'image se dessine sans elle.`);
              return null;
            });
            thumbnails.set(v.map, thumbnail);
          }
          const thumb = await thumbnail;
          // Un caractère qu'aucune police ne sait dessiner devient « ? » sur l'image ; sa description garde le nom entier.
          const drawn = { ...v, crew: v.crew.map((p) => ({ ...p, name: fonts.drawable(p.name, "strong") })) };
          const card = image.victoryCard(drawn, clan.tag, clan.links.site, fonts.width, thumb);
          return { png: await image.renderVictoryCard(card, fonts, root, thumb), alt: image.victoryImageAlt(v, clan.tag, card.map !== null) };
        },
        tag: clan.tag,
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    pause: sleep,
    // Noté après chaque message : si l'étape est coupée en route, ce qui est parti ne repart pas.
    progress: writeState,
    log: console.log,
    resend,
  });
  if (result.state) writeState(result.state);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postWithImage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Victoires : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
