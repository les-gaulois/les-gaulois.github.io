import { describe, expect, it } from "vitest";
import { commandImages, commandIndex, commandImagePath, imageVersion, type CommandInput } from "../../src/lib/commandes-discord";
import { GUICHET_ROWS, guichetCard, guichetImageAlt } from "../../src/lib/guichet-image";
import { KINDS, TICKET_KINDS } from "../../supabase/functions/code-discord/tickets";
import { guideCard, guideImageAlt, mapCard, MAP_CREDIT, MAP_NOTE, MAP_SOURCES, paragraph, plainPhrase, POSTE_EN_MOTS, RATE_NOTE, recordsCard, rivalCard, rivalFacts, type GuideChapter } from "../../src/lib/commandes-image";
import { POSTE } from "../../src/lib/guide-clan";
import { clanFigures } from "../../src/lib/compare";
import type { FaceOff } from "../../src/lib/games";
import type { CardText, GazetteCard, Measure } from "../../src/lib/gazette-image";
import { RECORD_LABELS } from "../../src/lib/records-discord";
import type { ClanRecords } from "../../src/lib/results";
import { DISCORD_EMOJIS, VIGNETTE_ICONES } from "../../src/lib/emojis-discord";
import { rolesImageAlt } from "../../src/lib/roles-discord";
import type { RankedClan } from "../../src/lib/stats";
import { parseCommandes } from "../../supabase/functions/code-discord/index";

// Une police à chasse fixe imaginaire : chaque signe vaut un peu plus d'une demi-taille.
const measure: Measure = (text, _font, size) => [...text].length * size * 0.55;
const SITE = "https://les-gaulois.github.io";
// Les nombres s'écrivent avec des espaces insécables, que les attentes écrivent en espaces simples.
const SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(SPACES, " ");
const textsOf = (card: GazetteCard) => plain(card.texts.map((t) => t.text).join(" | "));

const RECORDS: ClanRecords = {
  streak: { wins: 13, endedAt: "2026-11-12T18:00:00Z" },
  bestDay: { date: "2026-10-25", wins: 78, games: 196 },
  biggestGroup: { players: 14, at: "2026-05-30T20:00:00Z" },
  mostTeams: { teams: 78, players: 156, at: "2026-09-22T20:00:00Z" },
};

const ranked = (rank: number, clanTag: string, over: Partial<RankedClan> = {}): RankedClan => ({
  rank,
  clanTag,
  games: 1000,
  wins: 400,
  losses: 600,
  playerSessions: 2600,
  weightedWins: 2000 - rank * 100,
  weightedLosses: 300,
  weightedWLRatio: 1.5,
  ...over,
});
const CLANS = [ranked(1, "UN"), ranked(2, "GAL"), ranked(3, "LUX", { games: 0, wins: 0, losses: 0, playerSessions: 0 })];
const FACE_OFF: FaceOff = { tag: "UN", meetings: 1206, ours: 592, theirs: 143, others: 471, share: 80.5, allTime: null };

const CHAPTER: GuideChapter = {
  id: "03-attaque",
  order: 3,
  title: "Comprendre une attaque",
  court: "L'attaque",
  chapeau: "Pour comprendre un combat, regardez surtout quatre choses :",
  essentiel: ["**Ratio :** les troupes du défenseur comparées à celles de votre attaque. Une grosse attaque fait baisser ce ratio.", "**Terrain :** plaine, colline et montagne n'ont pas le même coût."],
  bloc: "terrain",
  blocTitre: "Valeurs de terrain à connaître",
  points: [
    { titre: "Plaine", texte: "Base de référence" },
    { titre: "Montagne", texte: "Encore plus coûteux", marque: "Lent" },
  ],
  retenir: { titre: "Réflexe", texte: "Avant une attaque, ne regardez pas seulement le nombre de troupes." },
  ouvert: false,
};
// Un aide-mémoire : tout est dans le tableau de son texte.
const MEMO: GuideChapter = { id: "10-memo-combat", order: 10, title: "Mémo combat", court: "Mémo combat", chapeau: "Gardez ce tableau sous les yeux pendant une partie.", essentiel: [], points: [], ouvert: true };
// Un essai à faire sur le site, sans repère : la ligne qui y renvoie.
const ESSAI: GuideChapter = { id: "07-bateaux", order: 7, title: "Les bateaux de trade", court: "Bateaux", essentiel: ["**Un bateau** rapporte de l'or."], bloc: "bateau", blocTitre: "Repères de paiement, avant multiplicateur", points: [], ouvert: false };

const INPUT: CommandInput = {
  tag: "GAL",
  siteUrl: SITE,
  archiveStart: "2026-04-10",
  records: RECORDS,
  coveredUntil: "2026-11-12T19:53:00Z",
  map: { facts: { rank: 5, clans: 49, pixels: 144646, at: "2026-11-12T10:52:00Z", color: "#38bdf8" }, shape: { width: 1400, height: 664 }, file: "public/generated/carte/finale-1400.webp" },
  chapters: [CHAPTER],
  clans: CLANS,
  listedAt: "2026-11-12T19:10:08Z",
  faceOffs: [FACE_OFF],
};

describe("les images des commandes", () => {
  it("/records : les quatre records de la page, avec leur marque et leur date", () => {
    const text = textsOf(recordsCard(RECORDS, "GAL", SITE, "2026-04-10", "2026-11-12T19:53:00Z", measure));
    for (const label of Object.values(RECORD_LABELS)) expect(text).toContain(label);
    expect(text).toContain("13 victoires d'affilée");
    expect(text).toContain("78 victoires sur 196 parties");
    expect(text).toContain("les-gaulois.github.io/records");
  });

  it("/rival : les chiffres du comparateur, l'écart, et la réserve sur le taux", () => {
    const facts = rivalFacts(clanFigures(CLANS[1]!), clanFigures(CLANS[0]!), FACE_OFF);
    expect(facts.map((f) => plain(f.label))).toEqual(["Rang", "Score", "Parties", "Taux de victoire", "Joueurs du clan par partie", "Face-à-face, sur 1 206 parties dont le détail est lu"]);
    expect(facts[0]?.value).toBe("[GAL] 2e, [UN] 1er");
    expect(facts[1]?.detail).toContain("de retard pour [GAL]");
    // Les mots du comparateur : c'est l'équipe qui gagne, pas forcément tout le clan.
    expect(facts[5]?.value).toBe("L'équipe de [GAL] gagne 592 fois, celle de [UN] 143 fois, une autre équipe 471 fois");
    expect(RATE_NOTE).toBe("Un taux dépend surtout du format et du nombre de joueurs : il ne dit pas qui joue le mieux.");
    const card = rivalCard(clanFigures(CLANS[1]!), clanFigures(CLANS[2]!), null, INPUT.listedAt ?? "", SITE, measure);
    // Sans partie, pas de taux ni de joueurs par partie : « pas de données », jamais zéro. Sans face-à-face, pas de ligne.
    expect(textsOf(card)).toContain("[LUX] —");
    expect(textsOf(card)).not.toContain("Face-à-face");
    expect(textsOf(card)).toContain(RATE_NOTE);
  });

  it("/carte : la place au nombre de pixels, la couleur de GAL, et le crédit de la carte écrit sur l'image", () => {
    const card = mapCard(INPUT.map!.facts, "GAL", SITE, INPUT.map!.shape, measure);
    // Sous l'en-tête, comme le contenu des autres images du robot.
    expect(card.map).toEqual({ left: 36, top: 230, width: 1128, height: Math.round((1128 * 664) / 1400) });
    expect(card.rects.some((r) => r.color === "#38bdf8")).toBe(true);
    const text = textsOf(card);
    expect(text).toContain("5e sur 49 clans");
    expect(text).toContain("144 646 pixels");
    expect(text).toContain(MAP_NOTE);
    expect(text).toContain(MAP_CREDIT);
    expect(MAP_CREDIT).toContain("© OpenFront and Contributors, CC BY-SA 4.0");
    expect(text).toContain(MAP_SOURCES);
    // Les adresses de la source et de la licence tiennent entières sur leur ligne.
    const sources = card.texts.find((t) => t.text === MAP_SOURCES)!;
    expect(measure(sources.text, sources.font, sources.size)).toBeLessThanOrEqual(1128);
  });

  it("/guide : les phrases du chapitre, en lignes qui tiennent, le gras compris", () => {
    const card = guideCard(CHAPTER, SITE, measure);
    const words = card.texts.map((t) => t.text).join(" ");
    for (const phrase of [...CHAPTER.essentiel, CHAPTER.retenir!.texte]) for (const word of plainPhrase(phrase).split(/\s+/)) expect(words).toContain(word);
    expect(card.texts.find((t) => t.text === "Ratio :")?.font).toBe("strong");
    expect(textsOf(card)).toContain("les-gaulois.github.io/debuter");
    expect(guideImageAlt(CHAPTER)).not.toContain("**");
    expect(guideImageAlt(CHAPTER)).toContain("Ratio : les troupes du défenseur");
  });

  it("/guide : les repères du bloc, comme sur la page, ou l'essai à faire sur le site", () => {
    const text = textsOf(guideCard(CHAPTER, SITE, measure));
    expect(text).toContain("Valeurs de terrain à connaître");
    expect(text).toContain("Plaine :");
    expect(text).toContain("Base de référence");
    expect(text).toContain("(Lent)");
    expect(guideImageAlt(CHAPTER)).toContain("Montagne : Encore plus coûteux (Lent).");
    const essai = textsOf(guideCard(ESSAI, SITE, measure));
    expect(essai).toContain("À essayer sur le site :");
    expect(essai).toContain("Repères de paiement, avant multiplicateur");
    // Sans phrase d'entrée, le titre n'est écrit qu'une fois, en haut.
    expect(essai.split("Les bateaux de trade").length - 1).toBe(1);
  });

  it("/guide : les valeurs du poste en mots, rien après un « ? », jamais deux points de suite", () => {
    const poste: GuideChapter = {
      ...CHAPTER,
      bloc: "poste",
      points: [
        { titre: "Portée", texte: "Le poste protège et agit dans cette portée." },
        { titre: "Pertes de l'attaquant", texte: "Une attaque contre le poste coûte beaucoup plus cher en pertes." },
        { titre: "Coût de vitesse", texte: "La prise de la tuile est ralentie." },
      ],
    };
    const text = textsOf(guideCard(poste, SITE, measure));
    expect(text).toContain(`Portée, ${POSTE_EN_MOTS[0]} :`);
    expect(POSTE_EN_MOTS).toEqual([`${POSTE.portee} tuiles`, `multipliées par ${POSTE.pertes}`, `multiplié par ${POSTE.vitesse}`]);
    const reflexe: GuideChapter = { ...CHAPTER, bloc: "reflexes", points: [{ titre: "Combien de troupes ai-je ?", texte: "Assurez-vous de ne pas vider inutilement votre défense." }] };
    expect(textsOf(guideCard(reflexe, SITE, measure))).not.toContain("? :");
    for (const chapter of [poste, reflexe, CHAPTER, ESSAI]) expect(guideImageAlt(chapter)).not.toContain("..");
    expect(guideImageAlt(poste)).toContain("Portée, 30 tuiles : Le poste protège et agit dans cette portée. Pertes de l'attaquant, multipliées par 5 : ");
  });

  it("une ligne de texte ne dépasse jamais sa largeur, et les mots voisins de même police restent ensemble", () => {
    const { texts, bottom } = paragraph(
      [
        { text: "Gras :", font: "strong", color: "#fff" },
        { text: " un texte assez long pour tenir sur plusieurs lignes dans une largeur étroite.", font: "body", color: "#fff" },
      ],
      100,
      50,
      300,
      20,
      30,
      measure,
    );
    const lines = new Map<number, CardText[]>();
    for (const t of texts) lines.set(t.y, [...(lines.get(t.y) ?? []), t]);
    expect(lines.size).toBeGreaterThan(2);
    for (const line of lines.values()) {
      const last = line.at(-1)!;
      expect(last.x + measure(last.text, last.font, last.size)).toBeLessThanOrEqual(100 + 300 + 0.001);
    }
    expect(bottom).toBe(50 + (lines.size - 1) * 30);
    expect([...lines.values()][0]?.map((t) => t.font)).toEqual(["strong", "body"]);
  });
});

describe("l'index des commandes", () => {
  it("une image par commande, par chapitre et par clan de la liste officielle, GAL excepté", () => {
    const images = commandImages(INPUT, measure);
    expect(images.map((i) => i.name)).toEqual(["records", "carte", "guide-03-attaque", "rival-UN", "rival-LUX", "roles", "guichet"]);
    expect(images.find((i) => i.kind === "carte")?.map).toMatchObject({ file: INPUT.map!.file, left: 36, top: 230 });
  });

  it("rien pour ce qui manque : pas de records, pas de carte, GAL hors de la liste, ni pour un aide-mémoire ; le guichet, toujours", () => {
    const images = commandImages({ ...INPUT, records: null, map: null, chapters: [CHAPTER, MEMO], clans: CLANS.filter((c) => c.clanTag !== "GAL") }, measure);
    expect(images.map((i) => i.name)).toEqual(["guide-03-attaque", "roles", "guichet"]);
  });

  it("une image qui ne se dessine pas est sautée, et n'arrête jamais les autres", () => {
    // Une police qui ne connaît pas la flèche, comme celles du site.
    const strict: Measure = (text, font, size) => {
      if (text.includes(String.fromCodePoint(0x2192))) throw new Error("un caractère ne peut pas être dessiné");
      return measure(text, font, size);
    };
    const arrow = { ...CHAPTER, essentiel: [`Attaque ${String.fromCodePoint(0x2192)} défense`] };
    const skipped: string[] = [];
    const images = commandImages({ ...INPUT, chapters: [arrow], clans: [...CLANS, ranked(4, "X/Y")] }, strict, (name) => skipped.push(name));
    expect(skipped).toEqual(["guide-03-attaque", "rival-X/Y"]);
    expect(images.map((i) => i.name)).toEqual(["records", "carte", "rival-UN", "rival-LUX", "roles", "guichet"]);
  });

  it("l'adresse d'une image change avec son dessin, et avec l'image posée dessus", () => {
    const [records] = commandImages(INPUT, measure);
    expect(commandImagePath(records!)).toMatch(/^\/commandes\/records\.png\?v=[0-9a-f]{12}$/);
    const later = commandImages({ ...INPUT, records: { ...RECORDS, streak: { wins: 14, endedAt: "2026-11-13T18:00:00Z" } } }, measure)[0]!;
    expect(imageVersion(later.card)).not.toBe(imageVersion(records!.card));
    expect(imageVersion(records!.card, "carte-a")).not.toBe(imageVersion(records!.card, "carte-b"));
  });

  it("se relit tel quel par la fonction code-discord", () => {
    const clanEntry = { image: "/generated/accueil.png?v=abcdef012345", alt: "[GAL] Les Gaulois. 2e au classement officiel.", page: "/classement" };
    const index = commandIndex(commandImages(INPUT, measure), clanEntry, "2026-11-12T20:00:00.000Z");
    expect(index.guide).toEqual([expect.objectContaining({ id: "03-attaque", court: "L'attaque", page: "/debuter#chapitre-03-attaque" })]);
    expect(index.rivaux.map((r) => [r.tag, r.rank, r.page])).toEqual([
      ["UN", 1, "/rivaux"],
      ["LUX", 3, "/rivaux"],
    ]);
    // Le panneau des rôles : son image et sa description, sans page.
    expect(index.roles).toEqual({ image: expect.stringMatching(/^\/commandes\/roles\.png\?v=[0-9a-f]{12}$/), alt: rolesImageAlt(SITE) });
    // Tout ce que la fonction lit revient à l'identique ; l'heure de construction ne la regarde pas.
    expect(index.guichet).toEqual({ image: expect.stringMatching(/^\/commandes\/guichet\.png\?v=[0-9a-f]{12}$/), alt: guichetImageAlt(), page: "/rejoindre" });
    expect(parseCommandes(JSON.parse(JSON.stringify(index)))).toEqual({ clan: index.clan, records: index.records, carte: index.carte, guichet: index.guichet, guide: index.guide, rivaux: index.rivaux, roles: index.roles, emojis: index.emojis, vignettes: index.vignettes });
    // Les émojis et les vignettes du robot, chacun à son adresse versionnée.
    expect(index.emojis.map((e) => e.name)).toEqual(DISCORD_EMOJIS.map((e) => e.name));
    expect(index.vignettes.map((v) => v.name)).toEqual([...VIGNETTE_ICONES]);
  });
});

describe("l'image du guichet des tickets", () => {
  it("nomme les trois boutons du guichet, dans leur ordre, et rien d'autre", () => {
    expect(GUICHET_ROWS.map((r) => r.name)).toEqual(TICKET_KINDS.map((kind) => KINDS[kind].button));
    const card = guichetCard("https://les-gaulois.github.io", measure);
    const texts = card.texts.map((t) => t.text);
    // Chaque nom sur sa case ; sa phrase, sur une ou plusieurs lignes, écrite en entier dans l'ordre.
    for (const row of GUICHET_ROWS) {
      expect(texts).toContain(row.name);
      expect(texts.join(" ")).toContain(row.detail);
    }
    expect(texts).toEqual(expect.arrayContaining(["Besoin d'aide ?", "Le guichet des Gaulois", "./aide", "les-gaulois.github.io"]));
    // Chaque texte tient dans l'image, sans dépasser à droite.
    for (const t of card.texts) {
      const width = measure(t.text, t.font, t.size);
      const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
      expect(left, t.text).toBeGreaterThanOrEqual(0);
      expect(left + width, t.text).toBeLessThanOrEqual(card.width);
      expect(t.y, t.text).toBeLessThan(card.height);
    }
  });

  it("se décrit aux lecteurs d'écran avec tout ce qu'elle écrit", () => {
    const alt = guichetImageAlt();
    for (const row of GUICHET_ROWS) expect(alt).toContain(`${row.name} : ${row.detail.charAt(0).toLowerCase()}${row.detail.slice(1)}.`);
    expect(alt.length).toBeLessThanOrEqual(1024);
  });
});
