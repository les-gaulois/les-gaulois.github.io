/**
 * Envoie les messages du trop-payé rendu après les prix baissés du 21 novembre 2026 : le message public, une fois, dans le
 * salon des nouvelles, puis un message privé du robot à chaque joueur remboursé (docs/DIRECTION.md, « Le trop-payé
 * rendu »). Toutes les 5 minutes, après le marché (workflow victoires.yml) ; une fois tout parti, il ne fait plus rien.
 *   npm run rendus:envoyer
 * Le salon des nouvelles : lien de la Direction, sinon le secret DISCORD_WEBHOOK_GAZETTE. Les messages privés : le jeton du
 * robot, DISCORD_BOT_TOKEN. Les joueurs remboursés se lisent au serveur avec SUPABASE_URL et SUPABASE_SECRET_KEY (fonction
 * rendus_des_prix). Sans serveur ou sans la migration, ne fait rien et ne note rien.
 * Ce qui est parti est noté dans data/rendus-prix-envoi.json, et dans sa copie .cache/rendus-prix-envoi.json, gardée par le
 * cache du workflow : des numéros du journal des statères et des nombres, jamais un identifiant ni un nom.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { envoyerEnPrive, lireLesRendus, mergeRendusStates, parseRendusState, payloadPrive, posterLePublic, rendusPass, type RendusSendState } from "../src/lib/rendus-prix-discord";
import { salonLink } from "../src/lib/salon-lien";

const STATE_FILE = "data/rendus-prix-envoi.json";
const CACHED_STATE_FILE = ".cache/rendus-prix-envoi.json";
const LABEL = "Trop-payé rendu";

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

try {
  const cached = parseRendusState(readText(CACHED_STATE_FILE), "elle est ignorée");
  if (cached.warning) console.log(`${LABEL} : copie en cache de l'état illisible, elle est ignorée.`);
  const noted = parseRendusState(readText(STATE_FILE), cached.state ? "sa copie gardée en cache sert" : "rien n'est envoyé");
  if (noted.warning && !cached.state) {
    // Sans état lisible, rien ne part : sinon le message public et les messages privés partiraient une seconde fois.
    console.log(`::warning::${LABEL} : ${noted.warning}.`);
    process.exit(1);
  }
  const stored = mergeRendusStates(noted.state, cached.state);
  // Une fois tout parti, plus aucun appel : ni au serveur, ni à Discord.
  if (stored?.fini) process.exit(0);

  const { link, warning: linkWarning } = await salonLink("nouvelles");
  if (linkWarning) {
    console.log(`::notice::${LABEL} : ${linkWarning} ; le salon choisi n'est pas connu, rien n'est envoyé ce passage-ci.`);
    process.exit(0);
  }
  if (!link || !isWebhookUrl(link)) {
    console.log(`::warning::${LABEL} : pas de lien utilisable pour le salon des nouvelles, rien n'est envoyé.`);
    process.exit(0);
  }
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim() ?? "";

  const ecrire = (state: RendusSendState) => {
    const text = `${JSON.stringify(state)}\n`;
    writeFileSync(STATE_FILE, text);
    mkdirSync(dirname(CACHED_STATE_FILE), { recursive: true });
    writeFileSync(CACHED_STATE_FILE, text);
  };
  const root = process.cwd();
  const siteUrl = clan.links.site;
  // Chargé seulement au moment de dessiner : si le dessin ne marche pas, le message part quand même, en texte.
  const dessin = () => import("../src/lib/rendus-prix-image");

  const result = await rendusPass({
    stored,
    lire: (apres) => lireLesRendus(apres),
    now: new Date(),
    note: ecrire,
    log: console.log,
    pause: () => new Promise((r) => setTimeout(r, 1_200)),
    envoyerPublic: async (r) => {
      const { COULEUR_DES_RENDUS, dessinerLePublic, texteDuPublic } = await dessin();
      return posterLePublic({ link, r, couleur: COULEUR_DES_RENDUS, dessiner: (x) => dessinerLePublic(x, siteUrl, root), texte: texteDuPublic(r), siteUrl, fetch, log: console.log });
    },
    envoyerPrive: async (rendu) => {
      if (!token) {
        console.log(`::warning::${LABEL} : pas de DISCORD_BOT_TOKEN, les messages privés attendent.`);
        return "echec";
      }
      const { COULEUR_DES_RENDUS, dessinerLePrive, texteDuPrive } = await dessin();
      const texte = texteDuPrive(rendu);
      let message: { payload: Record<string, unknown>; png: Uint8Array | null; filename: string };
      try {
        const { png, alt } = await dessinerLePrive(rendu, siteUrl, root);
        message = { payload: payloadPrive(siteUrl, COULEUR_DES_RENDUS, { alt, filename: "trop-paye-rendu.png" }, texte), png, filename: "trop-paye-rendu.png" };
      } catch (e) {
        console.log(`::warning::${LABEL} : image impossible à dessiner (${e instanceof Error ? e.message.slice(0, 120) : "erreur inconnue"}), le message privé part en texte.`);
        message = { payload: payloadPrive(siteUrl, COULEUR_DES_RENDUS, null, texte), png: null, filename: "trop-paye-rendu.png" };
      }
      return envoyerEnPrive(rendu.discord, message, { token, fetch });
    },
  });
  if (result.public) console.log(`${LABEL} : message public posté dans le salon des nouvelles.`);
  if (result.prives + result.fermes + result.sansDiscord > 0) {
    console.log(`::notice::${LABEL} : ${result.prives} messages privés partis, ${result.fermes} joueurs injoignables en privé, ${result.sansDiscord} sans Discord connu${result.reste ? " ; la suite au prochain passage" : ""}.`);
  }
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien ni le jeton : seuls les appels à Discord les reçoivent.
  console.log(`::warning::${LABEL} : ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  process.exitCode = 1;
}
