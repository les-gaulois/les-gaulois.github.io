/**
 * Envoie la course du soir sur le salon de la gazette, lancé par la GitHub Action après la collecte.
 *   npm run course:envoyer
 * Avec le lien du salon des nouvelles, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon
 * le secret DISCORD_WEBHOOK_GAZETTE. Sans lien, ne fait rien, et ne note rien.
 * Le jour du dernier message, le score de GAL et ses écarts avec les clans voisins sont notés dans data/course-envoi.json : voir src/lib/course-soir.ts.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, même d'erreur.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clan } from "../config/clan";
import { parseCourseState } from "../src/lib/course-soir";
import { coursePass, sendCourse } from "../src/lib/course-soir-discord";
import { loadLeaderboard, loadMeta, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/course-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir src/lib/salon-lien.ts.
const { link, warning: linkWarning } = await salonLink("nouvelles");
if (linkWarning) console.log(`Course : ${linkWarning}.`);
if (!link) {
  console.log("Pas de lien pour le salon des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : pas de course du soir.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Course : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}
const webhook = link;

try {
  const { state: stored, warning } = parseCourseState(readText(STATE_FILE));
  if (warning) console.log(`::warning::Course : ${warning}.`);
  const result = await coursePass({
    stored,
    leaderboard: loadLeaderboard(),
    sessions: loadSessions(),
    coveredUntil: loadMeta().sessions.coveredUntil,
    unreadable: unreadableSessionFiles(),
    now: new Date(),
    tag: clan.tag,
    send: (race) =>
      sendCourse({
        link: webhook,
        race,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (r) => {
          const { GazetteFonts, renderGazetteCard } = await import("../src/lib/gazette-image");
          const { courseCard, courseImageAlt } = await import("../src/lib/course-soir-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          return { png: await renderGazetteCard(courseCard(r, clan.tag, clan.links.site, fonts.width), fonts, root), alt: courseImageAlt(r, clan.tag) };
        },
        tag: clan.tag,
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    log: console.log,
  });
  if (result.state) writeFileSync(STATE_FILE, `${JSON.stringify(result.state)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postWithImage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Course : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
  process.exitCode = 1;
}
