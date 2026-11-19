/**
 * Annonce les nouvelles offres et demandes du marché des Gaulois sur Discord, en image, toutes les 5 minutes, après les achats
 * (workflow victoires.yml, lancé par la tâche « Victoires GAL » de cron-job.org).
 *   npm run marche:annoncer
 * Le salon des achats, réglé dans Direction > Discord ; sans lui, le salon des nouvelles (lien de la Direction, sinon le
 * secret DISCORD_WEBHOOK_GAZETTE). Les offres et demandes se lisent au serveur avec SUPABASE_URL et SUPABASE_SECRET_KEY
 * (fonction annonces_du_marche). Sans lien ou sans serveur, ne fait rien, et ne note rien.
 * Les derniers numéros traités et les annonces parties sont notés dans data/marche-envoi.json, et dans sa copie
 * .cache/marche-envoi.json, gardée par le cache du workflow. Voir src/lib/marche-discord.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { lireLeMarche, marchePass, mergeMarcheStates, parseMarcheState, sendMarche, type MarcheSendState } from "../src/lib/marche-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/marche-envoi.json";
const CACHED_STATE_FILE = ".cache/marche-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le même salon que les achats : sans lecture de la Direction, rien ne part dans un autre ; le passage suivant réessaie.
const { link, warning: linkWarning } = await salonLink("achats");
if (linkWarning) {
  console.log(`::notice::Marché des Gaulois : ${linkWarning} ; le salon choisi n'est pas connu, rien n'est envoyé ce passage-ci.`);
  process.exit(0);
}
if (!link) {
  console.log("Pas de lien pour le salon des achats ni pour celui des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : rien n'est annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Marché des Gaulois : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const cached = parseMarcheState(readText(CACHED_STATE_FILE), "elle est ignorée");
  if (cached.warning) console.log("Marché des Gaulois : copie en cache de l'état illisible, elle est ignorée.");
  const noted = parseMarcheState(readText(STATE_FILE), cached.state ? "sa copie gardée en cache sert" : undefined);
  if (noted.warning) console.log(`::warning::Marché des Gaulois : ${noted.warning}.`);
  const stored = mergeMarcheStates(noted.state, cached.state);
  const now = new Date();
  const ecrire = (state: MarcheSendState) => {
    const text = `${JSON.stringify(state)}\n`;
    writeFileSync(STATE_FILE, text);
    mkdirSync(dirname(CACHED_STATE_FILE), { recursive: true });
    writeFileSync(CACHED_STATE_FILE, text);
  };
  const result = await marchePass({
    stored,
    lire: (offres, demandes) => lireLeMarche(offres, demandes),
    now,
    note: ecrire,
    send: (image) =>
      sendMarche({
        link,
        image,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { marcheCard, marcheImageAlt, renderMarcheCard } = await import("../src/lib/marche-image");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = marcheCard(a, clan.links.site, fonts.width, (char) => fonts.draws(char, "strong"));
          return { png: await renderMarcheCard(card, fonts, root), alt: marcheImageAlt(a) };
        },
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    log: console.log,
  });
  const state = result.state ?? (stored && JSON.stringify(stored) !== JSON.stringify(noted.state) ? stored : null);
  if (state) ecrire(state);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit.
  console.log(`::warning::Marché des Gaulois : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
