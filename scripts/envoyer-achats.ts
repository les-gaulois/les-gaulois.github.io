/**
 * Annonce les objets reçus au village des Gaulois (boutique, pochette surprise, marché) sur Discord, en image, toutes les 5
 * minutes, avec les victoires (workflow victoires.yml, lancé par la tâche « Victoires GAL » de cron-job.org).
 *   npm run achats:envoyer
 * Le salon des achats, réglé dans Direction > Discord ; sans lui, le salon des nouvelles (lien de la Direction, sinon le
 * secret DISCORD_WEBHOOK_GAZETTE). Les achats se lisent au serveur avec SUPABASE_URL et SUPABASE_SECRET_KEY (fonction
 * achats_du_village). Sans lien ou sans serveur, ne fait rien, et ne note rien.
 * Le dernier numéro traité et les achats déjà annoncés sont notés dans data/achats-envoi.json, et dans sa copie
 * .cache/achats-envoi.json, gardée par le cache du workflow : si l'enregistrement sur main échoue, rien ne repart. Voir
 * src/lib/achats-discord.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { achatsPass, lireAchats, mergeAchatsStates, parseAchatsState, sendAchats, type AchatsSendState } from "../src/lib/achats-discord";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/achats-envoi.json";
const CACHED_STATE_FILE = ".cache/achats-envoi.json";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Le salon des achats réglé dans la Direction, sinon celui des nouvelles, sinon le secret DISCORD_WEBHOOK_GAZETTE : voir
// src/lib/salon-lien.ts (SALON_REPLI).
const { link, warning: linkWarning } = await salonLink("achats");
// Sans lecture de la Direction, le salon choisi pour les achats n'est pas connu : rien ne part dans un autre. Les achats se lisent
// au même serveur ; le passage suivant, 5 minutes plus tard, réessaie.
if (linkWarning) {
  console.log(`::notice::Achats du village : ${linkWarning} ; le salon choisi n'est pas connu, rien n'est envoyé ce passage-ci.`);
  process.exit(0);
}
if (!link) {
  console.log("Pas de lien pour le salon des achats ni pour celui des nouvelles, ni dans la Direction ni dans DISCORD_WEBHOOK_GAZETTE : aucun achat annoncé.");
  process.exit(0);
}
if (!isWebhookUrl(link)) {
  console.log("::warning::Achats du village : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
  process.exit(1);
}

try {
  const cached = parseAchatsState(readText(CACHED_STATE_FILE), "elle est ignorée");
  if (cached.warning) console.log("Achats du village : copie en cache de l'état illisible, elle est ignorée.");
  const noted = parseAchatsState(readText(STATE_FILE), cached.state ? "sa copie gardée en cache sert" : undefined);
  if (noted.warning) console.log(`::warning::Achats du village : ${noted.warning}.`);
  const stored = mergeAchatsStates(noted.state, cached.state);
  const now = new Date();
  // Les deux copies de l'état, écrites ensemble : après chaque annonce acceptée, puis à la fin du passage.
  const ecrire = (state: AchatsSendState) => {
    const text = `${JSON.stringify(state)}\n`;
    writeFileSync(STATE_FILE, text);
    mkdirSync(dirname(CACHED_STATE_FILE), { recursive: true });
    writeFileSync(CACHED_STATE_FILE, text);
  };
  const result = await achatsPass({
    stored,
    lire: (apres) => lireAchats(apres),
    now,
    note: ecrire,
    send: (annonce) =>
      sendAchats({
        link,
        annonce,
        // Chargé seulement au moment d'envoyer : si le dessin ne marche pas, le message part quand même, en texte.
        renderImage: async (a) => {
          const { GazetteFonts } = await import("../src/lib/gazette-image");
          const { achatsCard, achatsImageAlt, renderAchatsCard } = await import("../src/lib/achats-image");
          const { vignetteDeLObjet } = await import("../src/lib/gaulois");
          const root = process.cwd();
          const fonts = new GazetteFonts(root);
          const card = achatsCard(a, a.achats.map((achat) => vignetteDeLObjet(achat.emplacement, achat.objet)), clan.links.site, fonts.width, (char) => fonts.draws(char, "strong"));
          return { png: await renderAchatsCard(card, fonts, root), alt: achatsImageAlt(a) };
        },
        siteUrl: clan.links.site,
        fetch,
        log: console.log,
      }),
    log: console.log,
  });
  // L'état du passage, ou celui d'avant réuni avec sa copie, si la copie était plus avancée que data/.
  const state = result.state ?? (stored && JSON.stringify(stored) !== JSON.stringify(noted.state) ? stored : null);
  if (state) ecrire(state);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postWithImage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Achats du village : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
