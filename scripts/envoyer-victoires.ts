/**
 * Envoie chaque nouvelle victoire du clan sur le salon des victoires, avec l'image de la carte, lancé par le workflow
 * `.github/workflows/victoires.yml`, toutes les 5 minutes.
 *   npm run victoires:envoyer
 * Avec le lien du salon des victoires, réglé dans Direction > Discord (lu avec SUPABASE_URL et SUPABASE_SECRET_KEY), sinon le
 * secret DISCORD_WEBHOOK_VICTOIRES. Sans lien, ne fait rien, et ne note rien.
 * Les sessions des dernières heures sont lues sur l'API, plus fraîches que celles de la collecte horaire, qui servent aussi.
 * Après l'envoi, elles sont gardées dans .cache/sessions-du-passage.json pour l'étape des statères qui suit, dans le même job :
 * elle n'a pas à les relire. Une erreur d'écriture est seulement notée. Voir src/lib/sessions-du-passage.ts.
 * Les victoires passées sont notées dans data/victoires-envoi.json, enregistré sur main par le workflow, et dans
 * .cache/victoires-envoi.json, gardé par le cache du workflow : si l'enregistrement sur main échoue, rien ne repart.
 * Les victoires de config/victoires-rattrapage.json repartent une fois, même déjà notées : pour un salon qui ne les a pas reçues.
 * Voir src/lib/victoires.ts.
 * Le Gaulois du village de chaque membre nommé, sur sa pastille : lus au serveur une seule fois par passage, à la première
 * image, pour tous les membres au pseudo public de la liste ; chaque image ne porte que ceux de sa partie. Sans lecture, les
 * images partent comme avant. Voir src/lib/gaulois-envois.ts.
 * La carte de fin de chaque victoire, laissée dans .cache/cartes-finales/ par le job du rejeu (scripts/rejouer-victoires.ts),
 * qui n'a aucun secret : relue et vérifiée ici comme une donnée venue de l'extérieur. Sans elle, la vignette de la carte. Une
 * victoire que ce rejeu n'a pas vue attend le passage suivant, s'il vient encore dans les 10 minutes après la fin de la partie
 * (waitsForFinalMap). Voir src/lib/carte-finale.ts.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clan } from "../config/clan";
import { loadGames, loadLeaderboard, loadMembers, loadMeta, loadSessions, unreadableSessionFiles } from "../src/lib/data";
import { lireEtatFinal, MAX_OCTETS_CASES, MAX_OCTETS_DESCRIPTION, type EtatFinal } from "../src/lib/carte-finale";
import { avecOuSansGaulois, gauloisDuPassage, idsAuPseudoPublic } from "../src/lib/gaulois-envois";
import { isWebhookUrl } from "../src/lib/gazette-discord";
import { ApiClient } from "../src/lib/pipeline";
import { FICHIER_PASSAGE, fichiersDeLaPartie, lirePassage } from "../src/lib/rejeu-openfront";
import { parseNoted } from "../src/lib/salon-discord";
import { salonLink } from "../src/lib/salon-lien";
import type { StoredSession } from "../src/lib/schemas";
import { garderSessionsDuPassage, SESSIONS_DU_PASSAGE } from "../src/lib/sessions-du-passage";
import { isClanMember, mergeStates, parseResend, passSessions, readRecentSessions, readVictoryGame, usableOfficialTags, VictoryState, victoryPass, waitsForFinalMap, type VictoryState as State } from "../src/lib/victoires";
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

// Les sessions lues sur l'API à ce passage, gardées pour l'étape des statères une fois l'envoi fini.
let lues: { sessions: StoredSession[]; lecture: Date } | null = null;
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
    lues = { sessions: fresh, lecture: now };
  } catch (e) {
    console.log(`Victoires : sessions des dernières heures illisibles (${e instanceof Error ? e.message : String(e)}).`);
  }
  const collected = unreadableSessionFiles().length > 0 ? null : loadSessions();
  const { sessions, warning: sessionsWarning } = passSessions(collected, fresh);
  if (sessionsWarning) console.log(`::warning::Victoires : ${sessionsWarning}.`);
  // Les clans en face ne s'écrivent que s'ils sont dans la liste officielle, et tant que le calcul des équipes concorde avec les
  // résultats récents, comme dans le journal des parties : sinon, aucun.
  const officialTags = loadLeaderboard()?.clans.map((c) => c.clanTag) ?? [];
  const official = collected ? usableOfficialTags(collected, loadGames(), clan.tag, officialTags, loadMeta().sessions.coveredUntil) : [];
  if (officialTags.length > 0 && official.length === 0) console.log("Victoires : les clans en face ne sont pas écrits (sessions de la collecte illisibles, ou calcul des équipes en doute).");
  const root = process.cwd();
  // Chargés une seule fois, et seulement au premier message : si le dessin ne marche pas, le message part quand même, en texte.
  const drawing = (async () => {
    const [{ GazetteFonts }, image] = await Promise.all([import("../src/lib/gazette-image"), import("../src/lib/victoires-image")]);
    return { fonts: new GazetteFonts(root), image };
  })();
  drawing.catch(() => {});
  // Une même carte revient souvent dans la soirée : sa vignette n'est lue qu'une fois par passage.
  const thumbnails = new Map<string, Promise<import("../src/lib/victoires-image").Thumbnail | null>>();
  // La carte de fin laissée par le rejeu, relue et vérifiée : un fichier qui ne passe pas est écarté, l'image garde la vignette.
  const finalMap = (gameId: string): EtatFinal | null => {
    const files = fichiersDeLaPartie(gameId);
    if (!files || !existsSync(files.meta) || !existsSync(files.cases)) return null;
    try {
      if (statSync(files.meta).size > MAX_OCTETS_DESCRIPTION || statSync(files.cases).size > MAX_OCTETS_CASES) throw new Error("fichiers trop lourds");
      return lireEtatFinal(readFileSync(files.meta, "utf8"), readFileSync(files.cases), gameId);
    } catch (e) {
      console.log(`::warning::Victoires : la carte de fin de la partie ${gameId} est écartée (${e instanceof Error ? e.message : String(e)}), l'image garde la vignette.`);
      return null;
    }
  };
  // Les parties que le rejeu a vues à ce passage. Sans liste lisible (rejeu en panne), rien n'attend.
  const seenByReplay = lirePassage(readText(FICHIER_PASSAGE));
  if (!seenByReplay) console.log("Victoires : pas de liste du rejeu, les victoires partent sans attendre leur carte de fin.");
  const members = loadMembers();
  // Les Gaulois du village : une seule lecture par passage, à la première image, pour tous ceux qu'une pastille peut nommer.
  const gauloisDe = gauloisDuPassage({ tous: () => idsAuPseudoPublic(members) });
  const result = await victoryPass({
    stored,
    sessions,
    members,
    tag: clan.tag,
    official,
    now,
    readGame: (gameId) => readVictoryGame(gameId, fetch, sleep),
    isMember: (publicID) => isClanMember(api, publicID, clan.tag),
    send: (victory) =>
      sendVictory({
        link,
        victory,
        renderImage: async (v) => {
          const { fonts, image } = await drawing;
          // Un caractère qu'aucune police ne sait dessiner devient « ? » sur l'image ; sa description garde le nom entier.
          const drawn = { ...v, crew: v.crew.map((p) => ({ ...p, name: fonts.drawable(p.name, "strong") })), rivals: v.rivals.map((t) => fonts.drawable(t, "strong")) };
          // Seuls les membres au pseudo public de la partie ont un identifiant (`victoryOf`) : les autres n'ont jamais de Gaulois.
          const gaulois = await gauloisDe(v.crew.map((p) => p.id));
          const etat = finalMap(v.id);
          if (etat) {
            try {
              return await avecOuSansGaulois(gaulois, async (g) => {
                const card = image.victoryCard(drawn, clan.tag, clan.links.site, fonts.width, image.finalMapShape(etat), undefined, g);
                if (!card.map) throw new Error("pas de place pour la carte");
                const final = await image.renderFinalMap(etat, v, card.map);
                return { png: await image.renderVictoryCard(card, fonts, root, final), alt: image.victoryImageAlt(v, clan.tag, true, undefined, image.finalMapWords(etat, v)) };
              });
            } catch (e) {
              console.log(`::warning::Victoires : la carte de fin de la partie ${v.id} ne se dessine pas (${e instanceof Error ? e.message : String(e)}), l'image garde la vignette.`);
            }
          }
          let thumbnail = thumbnails.get(v.map);
          if (!thumbnail) {
            thumbnail = image.readThumbnail(v.map, fetch).catch((e: unknown) => {
              console.log(`Victoires : pas de vignette pour la carte ${v.map} (${e instanceof Error ? e.message : String(e)}), l'image se dessine sans elle.`);
              return null;
            });
            thumbnails.set(v.map, thumbnail);
          }
          const thumb = await thumbnail;
          return avecOuSansGaulois(gaulois, async (g) => {
            // `undefined` : les statères gardent leur réglage.
            const card = image.victoryCard(drawn, clan.tag, clan.links.site, fonts.width, thumb, undefined, g);
            return { png: await image.renderVictoryCard(card, fonts, root, thumb), alt: image.victoryImageAlt(v, clan.tag, card.map !== null) };
          });
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
    waitFor: (gameId, end) => waitsForFinalMap(seenByReplay, gameId, end, now.getTime()),
  });
  if (result.state) writeState(result.state);
  if (result.failed) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais le lien : seul l'appel à Discord le reçoit, et `postWithImage` ne laisse rien sortir de cet appel.
  console.log(`::warning::Victoires : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  // Après l'envoi, jamais avant : l'écriture ne retarde aucune image, et une erreur d'écriture est seulement notée.
  if (lues) {
    garderSessionsDuPassage({
      ecrire: (texte) => {
        mkdirSync(dirname(SESSIONS_DU_PASSAGE), { recursive: true });
        writeFileSync(SESSIONS_DU_PASSAGE, texte);
      },
      ...lues,
      log: console.log,
    });
  }
}
