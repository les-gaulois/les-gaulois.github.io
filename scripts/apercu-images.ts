/**
 * Dessine un exemple de chaque image du robot pour Discord, sans rien envoyer, dans test-results/images-discord/ (ignoré
 * par Git) :
 *   npm run images:apercu
 *   npm run images:apercu -- un/autre/dossier
 * La gazette, l'image de l'accueil, la fiche du premier du clan et les nouveautés reprennent les données collectées, vrais
 * pseudos compris : ces images ne se postent pas. Les alertes de place et la course du soir posent des chiffres d'exemple (place
 * de départ, points, écarts) sur le vrai classement. Les autres sont des exemples écrits ici, aux pseudos inventés : aucun
 * n'est celui d'un membre. La vignette d'une carte vient du dépôt d'OpenFront, comme au moment d'un envoi : sans réseau,
 * l'image des victoires se dessine sans elle.
 * Les images de bienvenue du serveur ont leur propre aperçu : npm run arrivees:apercu.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clan } from "../config/clan";
import { accueilCard, accueilFacts, accueilRanking } from "../src/lib/accueil-image";
import { activeCard } from "../src/lib/actifs-image";
import { mapReading, rankReading, type PlaceAlert, type PlaceReading } from "../src/lib/alerts";
import { alertCard } from "../src/lib/alerts-image";
import { welcomeCard } from "../src/lib/bienvenue-image";
import { courseCard } from "../src/lib/course-soir-image";
import { loadClanMapFilm, loadHistory, loadLeaderboard, loadMembers, loadMemberWeeks, loadMeta, loadNouveautes, loadSessions, loadTerritoryReadings } from "../src/lib/data";
import { ficheCard, ficheFacts } from "../src/lib/fiche-image";
import { gazetteEditions } from "../src/lib/gazette";
import { GazetteFonts, gazetteCard, renderGazetteCard, type GazetteCard } from "../src/lib/gazette-image";
import { groupsCard } from "../src/lib/groupes-image";
import { hierCard } from "../src/lib/hier-image";
import { newsCard } from "../src/lib/nouveautes-image";
import { milestoneCard } from "../src/lib/paliers-franchis-image";
import { recordCard } from "../src/lib/records-image";
import { readThumbnail, renderVictoryCard, victoryCard, type Thumbnail } from "../src/lib/victoires-image";

const OUT = process.argv[2] ?? join("test-results", "images-discord");
const SITE = clan.links.site;
const TAG = clan.tag;
/** Des pseudos inventés, de toutes les formes que prennent les vrais : espaces, points, chiffres, cyrillique. */
const NAMES = ["Brennos", "Epona la Rapide", "lug_du_nord", "Sucellos", "Taranis.0815", "Belisama", "Иван Петрович", "Capitaine Barbe GOAT.7362", "Cernunnos", "Rosmerta_22", "Ogmios", "Nantosuelta"];
const name = (i: number) => NAMES[i % NAMES.length] ?? "Brennos";

const root = process.cwd();
const fonts = new GazetteFonts(root);
const measure = fonts.width;
mkdirSync(OUT, { recursive: true });

async function save(file: string, card: () => GazetteCard | null): Promise<void> {
  try {
    const drawn = card();
    if (!drawn) {
      console.log(`${file} : pas de données, pas d'image.`);
      return;
    }
    writeFileSync(join(OUT, file), await renderGazetteCard(drawn, fonts, root));
    console.log(`${file} : ${drawn.width} × ${drawn.height}`);
  } catch (e) {
    console.log(`${file} : ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Les données collectées.
const members = loadMembers();
const meta = loadMeta();
const edition =
  gazetteEditions({
    sessions: loadSessions(),
    history: loadHistory(),
    territory: loadTerritoryReadings(),
    weekTops: loadMemberWeeks().tops,
    members,
    archiveStart: clan.archiveStart,
    completeThrough: meta.sessions.completeThrough,
  })[0] ?? null;
const leaderboard = loadLeaderboard();
const ranking = rankReading(leaderboard, TAG);
const territory = mapReading(loadClanMapFilm(), TAG);
const alertOf = (reading: PlaceReading | null): PlaceAlert | null => (reading ? { kind: reading.kind, from: reading.rank + 1, reading } : null);

await save("01-gazette.png", () => (edition ? gazetteCard(edition, TAG, SITE, measure) : null));
await save("02-alerte-classement.png", () => {
  const alert = alertOf(ranking);
  return alert ? alertCard(alert, TAG, SITE, measure) : null;
});
await save("03-alerte-carte.png", () => {
  const alert = alertOf(territory);
  return alert ? alertCard(alert, TAG, SITE, measure) : null;
});
await save("04-paliers.png", () =>
  milestoneCard(
    [
      { id: "a", username: name(0), tier: 500 },
      { id: "b", username: name(1), tier: 250 },
      { id: "c", username: name(2), tier: 100 },
      { id: "d", username: name(6), tier: 50 },
    ],
    { since: "2026-11-11T21:53:00.000Z", until: "2026-11-12T19:53:00.000Z", players: [] },
    TAG,
    SITE,
    measure,
  ),
);
await save("05-records.png", () =>
  recordCard(
    {
      beaten: [
        { key: "streak", before: 12, after: 13 },
        { key: "bestDay", before: 70, after: 78 },
      ],
      records: {
        streak: { wins: 13, endedAt: "2026-11-12T11:43:41.816Z" },
        bestDay: { date: "2026-10-25", wins: 78, games: 196 },
        biggestGroup: { players: 14, at: "2026-05-30T21:31:26.264Z" },
        mostTeams: { teams: 78, players: 156, at: "2026-09-22T18:14:43.121Z" },
      },
    },
    TAG,
    SITE,
    clan.archiveStart,
    "2026-11-12T11:53:00.000Z",
    measure,
  ),
);
await save("06-hier.png", () =>
  hierCard(
    {
      day: "2026-11-11",
      games: 66,
      wins: 41,
      previous: { day: "2026-11-10", games: 58, wins: 30 },
      streak: 8,
      best: { id: "x", at: "2026-11-11T20:14:00.000Z", won: true, format: "4", gaulois: 13, players: 85, map: "World", seconds: 1520, allies: [], rivals: [] },
    },
    TAG,
    SITE,
    measure,
  ),
);
await save("07-bienvenue.png", () =>
  welcomeCard(
    {
      since: "2026-11-11T09:53:00.000Z",
      until: "2026-11-12T09:53:00.000Z",
      named: [
        { id: "a", username: name(3), joinedAt: "2026-11-11T14:03:00.000Z" },
        { id: "b", username: name(4), joinedAt: "2026-11-11T19:40:00.000Z" },
        { id: "c", username: name(5), joinedAt: "2026-11-12T07:12:00.000Z" },
      ],
      anonymous: 2,
    },
    TAG,
    SITE,
    measure,
  ),
);
await save("08-plus-actifs.png", () =>
  activeCard(
    [
      { id: "a", username: name(7), games: 31, wins: 17, place: 1 },
      { id: "b", username: name(8), games: 27, wins: 12, place: 2 },
      { id: "c", username: name(9), games: 24, wins: 15, place: 3 },
      { id: "d", username: name(10), games: 20, wins: 9, place: 4 },
      { id: "e", username: name(11), games: 18, wins: 11, place: 5 },
    ],
    { since: "2026-11-11T13:54:00.000Z", until: "2026-11-12T13:53:00.000Z" },
    TAG,
    SITE,
    measure,
  ),
);
await save("09-nouveautes.png", () => {
  const entries = loadNouveautes().slice(0, 6);
  return entries.length > 0 ? newsCard(entries, SITE, measure) : null;
});
await save("10-course-du-soir.png", () =>
  ranking
    ? courseCard(
        {
          reading: ranking,
          points: { since: "2026-11-11T19:00:00.000Z", until: "2026-11-12T19:00:00.000Z", total: { games: 66, points: 71.58 }, group: { games: 48, points: 69.41 }, solo: { games: 18, points: 2.17 } },
          changes: { score: 2.25, above: -25.1, below: 12.3 },
        },
        TAG,
        SITE,
        measure,
      )
    : null,
);
const duo = (a: number, b: number, wins: number, games: number) => ({ a: { id: `a${a}`, name: name(a) }, b: { id: `b${b}`, name: name(b) }, wins, games });
await save("11-jouer-ensemble.png", () =>
  groupsCard(
    {
      monday: "2026-11-02",
      games: 412,
      groupGames: 251,
      points: 200,
      groupPoints: 194,
      perGame: { "1": 0.04, "2": 0.31, "3": 0.72, "4": 1.86 },
      duos: [duo(0, 1, 12, 15), duo(0, 3, 9, 14), duo(1, 4, 9, 10)],
    },
    TAG,
    SITE,
    measure,
  ),
);
await save("13-fiche.png", () => {
  if (!members) return null;
  for (const member of members.members) {
    const facts = member.publicId ? ficheFacts(members.members, member) : null;
    if (facts && facts.rank === 1) return ficheCard(facts, TAG, SITE, members.fetchedAt, measure);
  }
  return null;
});
await save("14-accueil.png", () => {
  const facts = accueilFacts(accueilRanking(leaderboard, TAG), edition);
  return facts ? accueilCard(facts, TAG, clan.name, clan.tagline, SITE, measure) : null;
});

// La victoire, avec la vignette de la carte si elle se lit.
const victory = {
  id: "apercu",
  start: "2026-11-12T17:04:58.000Z",
  map: "Four Islands",
  seconds: 943,
  format: "4",
  gaulois: 9,
  players: 23,
  points: 1.81,
  crew: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: null, name: name(i) })),
  unnamed: 1,
  outsiders: 0,
};
let thumbnail: Thumbnail | null = null;
try {
  thumbnail = await readThumbnail(victory.map, fetch);
} catch (e) {
  console.log(`Vignette illisible (${e instanceof Error ? e.message : String(e)}) : la victoire se dessine sans elle.`);
}
try {
  const card = victoryCard(victory, TAG, SITE, measure, thumbnail);
  writeFileSync(join(OUT, "12-victoire.png"), await renderVictoryCard(card, fonts, root, thumbnail));
  console.log(`12-victoire.png : ${card.width} × ${card.height}`);
} catch (e) {
  console.log(`12-victoire.png : ${e instanceof Error ? e.message : String(e)}`);
}
console.log(`Images dans ${OUT}`);
