/**
 * Ce que le site publie pour les commandes du robot sur Discord (docs/DIRECTION.md, « Les commandes du robot »), à chaque
 * construction : une image pour /records et /carte, une par chapitre du guide (/guide), une par clan de la liste
 * officielle (/rival) et celle du panneau des rôles (/roles, `roles-discord.ts`), dessinées par
 * `src/pages/commandes/[nom].png.ts` ; et l'index `/commandes.json`
 * (`src/pages/commandes.json.ts`), seul fichier que lit la fonction `code-discord`. /clan montre l'image d'aperçu de
 * l'accueil, déjà dessinée par `scripts/generate-accueil-image.ts`. Les dessins sont dans `commandes-image.ts`.
 *
 * L'adresse de chaque image porte une version tirée de son dessin : quand un chiffre change, l'adresse change, et Discord
 * ne montre pas l'image de la veille.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { clan } from "../../config/clan";
import { ACCUEIL_IMAGE, accueilFacts, accueilImageAlt, accueilRanking } from "./accueil-image";
import { clanRgb } from "./clanmap/codec";
import { clanFigures } from "./compare";
import { guideCard, guideImageAlt, mapCard, mapImageAlt, recordsCard, recordsImageAlt, rivalCard, rivalImageAlt, type GuideChapter, type MapFacts, type MapShape } from "./commandes-image";
import { loadClanMapFilm, loadGames, loadHistory, loadLeaderboard, loadMembers, loadMemberWeeks, loadMeta, loadSessions, loadTerritoryReadings } from "./data";
import { emojiEntries, vignetteEntries } from "./emojis-discord";
import { faceOffs, type FaceOff } from "./games";
import { gazetteEditions } from "./gazette";
import { GazetteFonts, renderGazetteCard, type GazetteCard, type Measure } from "./gazette-image";
import { ancreDuChapitre } from "./guide";
import { guichetCard, guichetImageAlt } from "./guichet-image";
import { clanRecords, type ClanRecords } from "./results";
import { rolesCard, rolesImageAlt } from "./roles-discord";
import { findClan, withOfficialRanks, type RankedClan } from "./stats";

/** L'image de la carte finale, dessinée par `scripts/generate-clanmap.ts` avant la construction des pages. */
export const MAP_IMAGE = "generated/carte/finale-1400.webp";

export interface CommandEntry {
  /** L'adresse de l'image depuis la racine du site, avec sa version. */
  image: string;
  /** Sa description, que Discord lit aux lecteurs d'écran. */
  alt: string;
  /** La page du site où mène le bouton. */
  page: string;
}

/** L'image du panneau des rôles : ses boutons donnent les rôles, il ne mène sur aucune page. */
export interface PanelEntry {
  image: string;
  alt: string;
}

export interface CommandIndex {
  builtAt: string;
  clan: CommandEntry | null;
  records: CommandEntry | null;
  carte: CommandEntry | null;
  /** L'image du guichet des tickets, que pose /tickets (docs/DIRECTION.md, « Les tickets d'assistance »). */
  guichet: CommandEntry | null;
  guide: (CommandEntry & { id: string; court: string })[];
  rivaux: (CommandEntry & { tag: string; rank: number })[];
  roles: PanelEntry | null;
  /** Les émojis du robot (`emojis-discord.ts`), que la fonction dépose chez Discord : leur nom et l'adresse de leur PNG. */
  emojis: IconEntry[];
  /** Les vignettes des icônes des rôles et des demandes de ticket : le nom de l'icône et l'adresse du PNG. */
  vignettes: IconEntry[];
}

/** Une image d'icône du site, par son nom. */
export interface IconEntry {
  name: string;
  image: string;
}

export type CommandImageKind = { kind: "records" } | { kind: "carte" } | { kind: "guide"; id: string; court: string } | { kind: "rival"; tag: string; rank: number } | { kind: "roles" } | { kind: "guichet" };

export type CommandImage = CommandImageKind & {
  /** Le nom du fichier, sans « .png » : « records », « carte », « guide-03-attaque », « rival-UN », « roles ». */
  name: string;
  card: GazetteCard;
  alt: string;
  /** L'image de la carte, posée sur le dessin : seulement pour /carte. */
  map?: { file: string; left: number; top: number; width: number; height: number };
};

export interface CommandInput {
  tag: string;
  siteUrl: string;
  archiveStart: string;
  records: ClanRecords | null;
  /** La fin de la collecte des sessions, que les records écrivent. */
  coveredUntil: string | null;
  map: { facts: MapFacts; shape: MapShape; file: string } | null;
  chapters: readonly GuideChapter[];
  /** La liste officielle, dans son ordre : le rang est la position. */
  clans: readonly RankedClan[];
  listedAt: string | null;
  /** Les face-à-face publiés sur la page Nos rivaux : vide s'ils sont suspendus. */
  faceOffs: readonly FaceOff[];
}

/** Un tag que l'index, l'adresse d'une image et la fonction `code-discord` acceptent tous : la règle de `parseCommandes`. */
const SAFE_TAG = /^[A-Z0-9]{1,10}$/;

/**
 * Les images à dessiner, et ce que chacune dit. Rien n'est dessiné pour ce qui manque : la commande le dira. Une image dont
 * un texte ne peut pas être dessiné (un signe qu'aucune police du site ne connaît) est sautée et nommée à `skipped` : elle
 * n'arrête jamais la construction du site.
 */
export function commandImages(input: CommandInput, measure: Measure, skipped: (name: string, reason: string) => void = () => undefined): CommandImage[] {
  const images: CommandImage[] = [];
  const add = (name: string, make: () => CommandImage) => {
    try {
      const image = make();
      // La mesure lève une erreur sur un signe impossible à dessiner : chaque texte passe par elle avant le dessin.
      for (const text of image.card.texts) measure(text.text, text.font, text.size);
      images.push(image);
    } catch (e) {
      skipped(name, e instanceof Error ? e.message : "erreur inconnue");
    }
  };
  const { records, coveredUntil, map, listedAt } = input;
  if (records && coveredUntil) {
    add("records", () => ({
      kind: "records",
      name: "records",
      card: recordsCard(records, input.tag, input.siteUrl, input.archiveStart, coveredUntil, measure),
      alt: recordsImageAlt(records, input.tag, input.archiveStart, coveredUntil),
    }));
  }
  if (map) {
    add("carte", () => {
      const card = mapCard(map.facts, input.tag, input.siteUrl, map.shape, measure);
      return { kind: "carte", name: "carte", card, alt: mapImageAlt(map.facts, input.tag), map: { file: map.file, ...card.map } };
    });
  }
  // Les deux aide-mémoire ne sont qu'un tableau, dans le texte du chapitre : /guide ne les propose pas.
  for (const chapter of input.chapters.filter((c) => !c.ouvert)) {
    add(`guide-${chapter.id}`, () => ({ kind: "guide", id: chapter.id, court: chapter.court, name: `guide-${chapter.id}`, card: guideCard(chapter, input.siteUrl, measure), alt: guideImageAlt(chapter) }));
  }
  const me = findClan(input.clans, input.tag);
  if (me && listedAt) {
    const mine = clanFigures(me);
    for (const other of input.clans) {
      if (other.clanTag === me.clanTag) continue;
      if (!SAFE_TAG.test(other.clanTag)) {
        skipped(`rival-${other.clanTag}`, "tag hors des lettres et des chiffres");
        continue;
      }
      const theirs = clanFigures(other);
      const faceOff = input.faceOffs.find((row) => row.tag === other.clanTag) ?? null;
      add(`rival-${other.clanTag}`, () => ({
        kind: "rival",
        tag: other.clanTag,
        rank: other.rank,
        name: `rival-${other.clanTag}`,
        card: rivalCard(mine, theirs, faceOff, listedAt, input.siteUrl, measure),
        alt: rivalImageAlt(mine, theirs, faceOff, listedAt),
      }));
    }
  }
  // Le panneau des rôles ne lit aucune donnée : il se dessine à chaque construction.
  add("roles", () => ({ kind: "roles", name: "roles", card: rolesCard(input.siteUrl, measure), alt: rolesImageAlt(input.siteUrl) }));
  // Le guichet des tickets ne dépend d'aucune donnée : il se dessine toujours.
  add("guichet", () => ({ kind: "guichet", name: "guichet", card: guichetCard(input.siteUrl, measure), alt: guichetImageAlt() }));
  return images;
}

/** La version d'une image : douze signes tirés de son dessin, et de l'image posée dessus s'il y en a une. */
export const imageVersion = (card: GazetteCard, extra = ""): string => createHash("sha256").update(JSON.stringify(card)).update(extra).digest("hex").slice(0, 12);

/** L'adresse d'une image de commande, avec sa version. */
export const commandImagePath = (image: Pick<CommandImage, "name" | "card">, extra = ""): string => `/commandes/${image.name}.png?v=${imageVersion(image.card, extra)}`;

/** L'index que lit la fonction `code-discord`. `extraOf` : ce qui s'ajoute au dessin pour faire la version (l'image de la carte). */
export function commandIndex(images: readonly CommandImage[], clanEntry: CommandEntry | null, builtAt: string, extraOf: (image: CommandImage) => string = () => ""): CommandIndex {
  const entry = (image: CommandImage, page: string): CommandEntry => ({ image: commandImagePath(image, extraOf(image)), alt: image.alt, page });
  const records = images.find((i) => i.kind === "records");
  const carte = images.find((i) => i.kind === "carte");
  const roles = images.find((i) => i.kind === "roles");
  const guichet = images.find((i) => i.kind === "guichet");
  return {
    builtAt,
    clan: clanEntry,
    records: records ? entry(records, "/records") : null,
    carte: carte ? entry(carte, "/carte") : null,
    guichet: guichet ? entry(guichet, "/rejoindre") : null,
    guide: images.flatMap((i) => (i.kind === "guide" ? [{ id: i.id, court: i.court, ...entry(i, `/debuter#${ancreDuChapitre(i.id)}`) }] : [])),
    rivaux: images.flatMap((i) => (i.kind === "rival" ? [{ tag: i.tag, rank: i.rank, ...entry(i, "/rivaux") }] : [])),
    roles: roles ? { image: commandImagePath(roles, extraOf(roles)), alt: roles.alt } : null,
    emojis: emojiEntries(),
    vignettes: vignetteEntries(),
  };
}

/* ---------- À la construction du site ---------- */

/** La couleur d'un clan sur la carte, comme le film la dessine : en gris s'il n'en a pas (`clanRgb`). */
const hex = (color: number | null | undefined): string => `#${clanRgb(color ?? null).map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Les chiffres de GAL sur la dernière image du film de la carte. `null` : pas de film, ou GAL absent de la carte. */
function mapFacts(): CommandInput["map"] {
  const film = loadClanMapFilm();
  const last = film?.frames.at(-1);
  const file = join("public", MAP_IMAGE);
  if (!film || !last || last.rank === null || last.gal === 0 || !existsSync(file)) return null;
  const at = last.at !== undefined ? new Date(last.at * 1000).toISOString() : film.fetchedAt;
  return {
    facts: { rank: last.rank, clans: last.clans, pixels: last.gal, at, color: hex(film.gal === null ? null : film.clans[film.gal]?.color) },
    shape: { width: film.cols, height: film.rows },
    file,
  };
}

/** Tout ce que les images lisent, depuis les données collectées. Les chapitres viennent de la collection du guide. */
export function commandInput(chapters: readonly GuideChapter[]): CommandInput {
  const meta = loadMeta();
  const leaderboard = loadLeaderboard();
  const sessions = loadSessions();
  const meetings = leaderboard ? faceOffs(sessions, loadGames(), clan.tag, leaderboard.clans.map((c) => c.clanTag), meta.sessions.coveredUntil) : null;
  return {
    tag: clan.tag,
    siteUrl: clan.links.site,
    archiveStart: clan.archiveStart,
    records: meta.sessions.coveredUntil ? clanRecords(sessions) : null,
    coveredUntil: meta.sessions.coveredUntil,
    map: mapFacts(),
    chapters,
    clans: leaderboard ? withOfficialRanks(leaderboard.clans) : [],
    listedAt: leaderboard?.end ?? null,
    faceOffs: meetings?.reliable ? meetings.rows : [],
  };
}

/** L'image d'aperçu de l'accueil, pour /clan : la même adresse et la même description que sur l'accueil (`index.astro`). */
export function clanEntry(): CommandEntry | null {
  const file = join("public", ACCUEIL_IMAGE);
  if (!existsSync(file)) return null;
  // La même gazette que l'accueil et `scripts/generate-accueil-image.ts`.
  const meta = loadMeta();
  const edition =
    gazetteEditions({
      sessions: loadSessions(),
      history: loadHistory(),
      territory: loadTerritoryReadings(),
      weekTops: loadMemberWeeks().tops,
      members: loadMembers(),
      archiveStart: clan.archiveStart,
      completeThrough: meta.sessions.completeThrough,
    })[0] ?? null;
  const facts = accueilFacts(accueilRanking(loadLeaderboard(), clan.tag), edition);
  if (!facts) return null;
  const version = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
  return { image: `/${ACCUEIL_IMAGE}?v=${version}`, alt: accueilImageAlt(facts, clan.tag, clan.name), page: "/classement" };
}

/** L'empreinte de l'image de la carte : elle entre dans la version de l'image de /carte. */
const fileVersion = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

let built: Promise<{ images: CommandImage[]; fonts: GazetteFonts }> | null = null;

/** Les images de la construction, calculées une fois pour les deux pages qui s'en servent. */
export function commandImagesForBuild(chapters: readonly GuideChapter[]): Promise<{ images: CommandImage[]; fonts: GazetteFonts }> {
  built ??= (async () => {
    const fonts = new GazetteFonts(process.cwd());
    // Le nom seul va au journal : un texte qui ne se dessine pas peut contenir n'importe quoi.
    const images = commandImages(commandInput(chapters), fonts.width, (name, reason) => console.log(`Commandes : image ${name} sautée (${reason}) : la commande ne la propose pas, ou répond « Pas de données ».`));
    return { images, fonts };
  })();
  return built;
}

export const extraOfBuild = (image: CommandImage): string => (image.map ? fileVersion(image.map.file) : "");

/** Le PNG d'une image : le dessin, l'image de la carte posée dessus pour /carte, puis une palette pour l'alléger. */
export async function renderCommandImage(image: CommandImage, fonts: GazetteFonts): Promise<Buffer> {
  const root = process.cwd();
  const layers = image.map ? [{ input: await sharp(join(root, image.map.file)).resize(image.map.width, image.map.height, { fit: "fill" }).toBuffer(), left: image.map.left, top: image.map.top }] : [];
  const png = await renderGazetteCard(image.card, fonts, root, layers);
  return sharp(png).png({ palette: true, compressionLevel: 9 }).toBuffer();
}
