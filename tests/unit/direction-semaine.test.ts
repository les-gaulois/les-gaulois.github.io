import type { VNode } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import WeeklyPickCard from "../../src/components/WeeklyPickCard";
import {
  TYPED_LABELS,
  WEEK_STATE_LABELS,
  countLabel,
  findChoice,
  pickChoices,
  previewNote,
  readMembersList,
  searchChoices,
  showsPreview,
  shownOnHome,
  typedState,
  weekShort,
  weekState,
  type PickChoice,
  type TypedState,
} from "../../src/lib/compte/direction-semaine";
import { WEEKLY_PICK_PLAYER_MAX, currentPickWeek, type LiveNews, type WeeklyPick } from "../../src/lib/compte/news";

/**
 * De quoi faire tourner `WeeklyPickCard` sans navigateur : `useState` et `useEffect` réduits à leur plus simple, la lecture
 * du serveur remplacée par le choix du cas. Le composant de l'accueil décide alors lui-même s'il montre le choix, et on
 * compare sa décision à `shownOnHome` sur la même liste.
 */
const h = vi.hoisted(() => {
  const slots: unknown[] = [];
  const deps: (readonly unknown[] | undefined)[] = [];
  let cursor = 0;
  let queued: (() => void)[] = [];
  let dirty = false;
  return {
    news: null as unknown,
    reset() {
      slots.length = 0;
      deps.length = 0;
      queued = [];
      dirty = false;
    },
    begin() {
      cursor = 0;
      dirty = false;
    },
    useState<T>(init: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => T)() : init;
      const set = (next: T | ((prev: T) => T)) => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(slots[i] as T) : next;
        if (!Object.is(value, slots[i])) {
          slots[i] = value;
          dirty = true;
        }
      };
      return [slots[i] as T, set];
    },
    useEffect(effect: () => unknown, list?: readonly unknown[]) {
      const i = cursor++;
      const before = deps[i];
      const first = !(i in deps);
      if (first || !list || !before || list.length !== before.length || list.some((v, k) => !Object.is(v, before[k]))) {
        deps[i] = list;
        queued.push(() => void effect());
      }
    },
    flush() {
      const run = queued;
      queued = [];
      for (const effect of run) effect();
    },
    isDirty: () => dirty,
  };
});

vi.mock("preact/hooks", () => ({ useState: h.useState, useEffect: h.useEffect }));
vi.mock("../../src/lib/compte/news", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/compte/news")>()),
  fetchLiveNewsOnce: () => Promise.resolve(h.news as LiveNews | null),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

type Fetcher = typeof fetch;
const answer = (body: unknown): Fetcher => (() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)) as Fetcher;
const refused = (status: number): Fetcher => (() => Promise.resolve({ ok: false, status, json: () => Promise.reject(new Error("pas de corps")) } as unknown as Response)) as Fetcher;
const broken: Fetcher = (() => Promise.reject(new TypeError("Failed to fetch"))) as Fetcher;
const garbled: Fetcher = (() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token")) } as unknown as Response)) as Fetcher;

/** `WeeklyPickCard` rendu jusqu'à ce qu'il ne change plus : vrai s'il montre le choix. */
async function cardShows(pick: WeeklyPick, fetcher: Fetcher): Promise<boolean> {
  h.reset();
  h.news = { announcements: [], events: [], weeklyPick: pick } satisfies LiveNews;
  vi.stubGlobal("fetch", fetcher);
  for (let round = 0; round < 10; round++) {
    h.begin();
    const out = WeeklyPickCard({ membersSrc: "/data/members.json", fichesBase: "/membres" }) as VNode | null;
    h.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!h.isDirty()) return out !== null;
  }
  throw new Error("WeeklyPickCard ne se stabilise pas");
}

const LONG = "Vercingetorix_le_Tres_Grand_Chef_de_Tous_les_Arvernes_et_Allies"; // 63 caractères
const names = (choices: readonly PickChoice[] | null) => choices?.map((c) => c.name) ?? null;

describe("Gaulois de la semaine : la liste à choisir", () => {
  const list = {
    members: [
      { username: "Zoé" },
      { username: "alba" },
      { username: null },
      { username: "Brennos" },
      { username: "Doublon" },
      { username: "doublon" },
      { username: "Élan" },
      {},
      { username: "alba" },
      { username: "   " },
      { username: 42 },
      null,
    ],
  };
  const choices = pickChoices(list)!;

  it("donne chaque pseudo une fois, à l'orthographe de la liste, dans l'ordre alphabétique, sans les membres sans pseudo", () => {
    expect(names(choices)).toEqual(["alba", "Brennos", "doublon", "Doublon", "Élan", "Zoé"]);
  });

  it("marque un pseudo porté par plusieurs membres, à la casse près, en comptant chaque membre comme le serveur", () => {
    expect(Object.fromEntries(choices.map((c) => [c.name, c.twin]))).toEqual({ alba: true, Brennos: false, doublon: true, Doublon: true, Élan: false, Zoé: false });
  });

  it("ne propose rien d'une liste illisible, vide ou sans aucun pseudo : le champ reste libre", () => {
    for (const bad of [null, undefined, "texte", 42, [], {}, { members: null }, { members: "non" }, { members: [] }, { members: [{ username: null }, {}] }]) {
      expect(pickChoices(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(names(pickChoices({ members: [{ username: "Seul" }] }))).toEqual(["Seul"]);
  });

  it("cherche sans accent ni majuscule", () => {
    expect(names(searchChoices(choices, "ELA"))).toEqual(["Élan"]);
    expect(names(searchChoices(choices, "zoe"))).toEqual(["Zoé"]);
    expect(names(searchChoices(choices, "ZOÉ"))).toEqual(["Zoé"]);
    expect(names(searchChoices(choices, "xyz"))).toEqual([]);
  });

  it("montre tout sans recherche, et rien dans une liste vide", () => {
    expect(searchChoices(choices, "")).toEqual(choices);
    expect(searchChoices(choices, "   ")).toEqual(choices);
    expect(searchChoices([], "a")).toEqual([]);
    expect(searchChoices([], "")).toEqual([]);
  });

  it("met les débuts de pseudo d'abord, puis ceux qui contiennent le texte, chacun dans l'ordre de la liste", () => {
    const some = pickChoices({ members: [{ username: "Alan" }, { username: "Anextio" }, { username: "Bran" }, { username: "Dan" }, { username: "Ollo" }] })!;
    expect(names(searchChoices(some, "an"))).toEqual(["Anextio", "Alan", "Bran", "Dan"]);
  });

  it("retrouve le pseudo tapé : l'orthographe exacte d'abord, puis à la casse près, comme le serveur", () => {
    expect(findChoice(choices, " Brennos ")?.name).toBe("Brennos");
    expect(findChoice(choices, "BRENNOS")?.name).toBe("Brennos");
    expect(findChoice(choices, "ZOÉ")?.name).toBe("Zoé");
    expect(findChoice(choices, "Doublon")?.name).toBe("Doublon");
    expect(findChoice(choices, "doublon")?.name).toBe("doublon");
    // Le serveur compare les accents : « Zoe » n'est pas « Zoé ».
    expect(findChoice(choices, "Zoe")).toBeNull();
    expect(findChoice(choices, "Zo")).toBeNull();
    expect(findChoice(choices, "  ")).toBeNull();
    expect(findChoice([], "Zoé")).toBeNull();
  });

  it("ne dit « Dans la liste » que pour un pseudo entier, « Pas dans la liste » que si la recherche ne trouve plus personne", () => {
    const cases: [string, TypedState][] = [
      ["", "empty"],
      ["   ", "empty"],
      ["Z", "searching"],
      ["Zo", "searching"],
      // Sans l'accent, la recherche trouve encore Zoé, mais le serveur refuserait : ni vert ni jaune.
      ["Zoe", "searching"],
      ["Zoé", "listed"],
      ["zoé", "listed"],
      [" Zoé ", "listed"],
      ["Zoéx", "unlisted"],
      ["xyz", "unlisted"],
      ["alba", "twin"],
      ["Doublon", "twin"],
      ["DOUBLON", "twin"],
    ];
    for (const [typed, state] of cases) expect(typedState(choices, typed), typed).toBe(state);
    expect(typedState(null, "Zoé")).toBe("free");
    expect(typedState(null, "")).toBe("empty");
  });

  it("écrit chaque état du pseudo tapé avec son mot et sa couleur, et rien pendant la recherche", () => {
    expect(TYPED_LABELS.listed).toEqual({ tone: "ok", label: "Dans la liste" });
    expect(TYPED_LABELS.unlisted).toEqual({ tone: "warn", label: "Pas dans la liste" });
    expect(TYPED_LABELS.twin).toEqual({ tone: "warn", label: "Porté par plusieurs membres : le serveur le refuse" });
    for (const state of ["empty", "free", "searching"] as const) expect(TYPED_LABELS[state], state).toBeUndefined();
  });

  it("ne donne l'aperçu que d'un choix que le serveur peut accepter", () => {
    const shown = (["empty", "free", "listed", "twin", "searching", "unlisted"] as const).filter(showsPreview);
    expect(shown).toEqual(["free", "listed"]);
  });

  it("accepte un pseudo de 63 caractères, sous la limite du champ", () => {
    expect(LONG).toHaveLength(63);
    expect(LONG.length).toBeLessThanOrEqual(WEEKLY_PICK_PLAYER_MAX);
    const withLong = pickChoices({ members: [...list.members, { username: LONG }] })!;
    expect(names(searchChoices(withLong, "grand_chef"))).toEqual([LONG]);
    expect(findChoice(withLong, LONG.toUpperCase())?.name).toBe(LONG);
    expect(typedState(withLong, LONG)).toBe("listed");
    expect(typedState(withLong, LONG.slice(0, 40))).toBe("searching");
  });

  it("écrit le nombre de membres, et le nombre trouvé pendant une recherche", () => {
    expect(countLabel(311, 311, "")).toBe("311 membres");
    expect(countLabel(1, 1, "")).toBe("1 membre");
    expect(countLabel(311, 311, "   ")).toBe("311 membres");
    expect(countLabel(15, 311, "al")).toBe("15 sur 311");
    expect(countLabel(0, 311, "xyz")).toBe("0 sur 311");
    expect(countLabel(1, 311, "Zoé")).toBe("1 sur 311");
  });

  it("montre le mot comme l'accueil le montrera : espaces des bouts ôtés, rien s'il est vide, 300 caractères au plus", () => {
    expect(previewNote("  Bravo.  ")).toBe("Bravo.");
    expect(previewNote("")).toBeNull();
    expect(previewNote("    ")).toBeNull();
    expect(previewNote("\n \n")).toBeNull();
    expect(previewNote("Ligne 1\nLigne 2")).toBe("Ligne 1\nLigne 2");
    expect(previewNote("x".repeat(310))).toHaveLength(300);
  });
});

describe("Gaulois de la semaine : l'état de la semaine", () => {
  const pick = (week: string): WeeklyPick => ({ week, player: "Zoé", note: null });

  it("distingue choisi, semaine passée, rien et illisible", () => {
    expect(weekState(pick("2026-11-09"), "2026-11-09", false)).toBe("chosen");
    expect(weekState(pick("2026-11-02"), "2026-11-09", false)).toBe("previous");
    expect(weekState(null, "2026-11-09", false)).toBe("none");
    expect(weekState(null, "2026-11-09", true)).toBe("unread");
    // Une lecture en échec ne dit rien de ce que montre l'accueil, même avec un choix gardé d'avant.
    expect(weekState(pick("2026-11-09"), "2026-11-09", true)).toBe("unread");
  });

  it("tient un choix daté après la semaine de l'appareil pour celui de la semaine en cours (horloge en retard)", () => {
    expect(weekState(pick("2026-11-16"), "2026-11-09", false)).toBe("chosen");
  });

  it("change de semaine le lundi à minuit à Paris, changements d'heure compris", () => {
    const at = (iso: string, week: string) => weekState(pick(week), currentPickWeek(new Date(iso)), false);
    // Heure d'hiver : dimanche 15 novembre 23 h 59 à Paris, puis lundi 16 à minuit (UTC + 1).
    expect(at("2026-11-15T22:59:59Z", "2026-11-09")).toBe("chosen");
    expect(at("2026-11-15T23:00:00Z", "2026-11-09")).toBe("previous");
    expect(at("2026-11-15T23:00:00Z", "2026-11-16")).toBe("chosen");
    // Passage à l'heure d'été, le dimanche 29 mars 2026 : lundi 30 à minuit à Paris est 22 h en temps universel.
    expect(at("2026-03-29T21:59:59Z", "2026-03-23")).toBe("chosen");
    expect(at("2026-03-29T22:00:00Z", "2026-03-23")).toBe("previous");
    // Retour à l'heure d'hiver, le dimanche 25 octobre 2026 : lundi 26 à minuit à Paris est 23 h en temps universel.
    expect(at("2026-10-25T22:59:59Z", "2026-10-19")).toBe("chosen");
    expect(at("2026-10-25T23:00:00Z", "2026-10-19")).toBe("previous");
  });

  it("écrit chaque état avec son mot et sa couleur", () => {
    expect(WEEK_STATE_LABELS).toEqual({
      chosen: { tone: "ok", label: "Choisi" },
      previous: { tone: "warn", label: "Pas encore choisi" },
      none: { tone: "warn", label: "Pas encore choisi" },
      unread: { tone: "danger", label: "Illisible" },
    });
  });

  it("écrit la semaine sans article", () => {
    expect(weekShort("2026-11-09")).toBe("semaine du 9 nov. au 15 nov.");
    expect(weekShort("2026-12-28")).toBe("semaine du 28 déc. au 3 janv.");
  });
});

describe("Gaulois de la semaine : ce que l'accueil montre, même règle que WeeklyPickCard", () => {
  const pick = (player: string): WeeklyPick => ({ week: "2026-11-09", player, note: null });
  const roster = (...usernames: unknown[]) => ({ fetchedAt: "2026-11-14T00:00:00Z", members: usernames.map((username, i) => ({ publicId: `id${i}`, username })) });
  const cases: { name: string; player: string; fetcher: Fetcher; shown: boolean }[] = [
    { name: "pseudo présent, à l'orthographe exacte", player: "Zoé", fetcher: answer(roster("Zoé", "Brennos")), shown: true },
    { name: "pseudo de 63 caractères", player: LONG, fetcher: answer(roster(LONG)), shown: true },
    { name: "porté par deux membres, dont l'un à l'orthographe exacte", player: "Doublon", fetcher: answer(roster("Doublon", "doublon")), shown: true },
    { name: "seulement à une autre casse", player: "Zoé", fetcher: answer(roster("zoé")), shown: false },
    { name: "seulement sans l'accent", player: "Zoé", fetcher: answer(roster("Zoe")), shown: false },
    { name: "avec des espaces autour dans la liste", player: "Élan", fetcher: answer(roster(" Élan ")), shown: false },
    { name: "parti de la liste", player: "Un_Gaulois_Parti", fetcher: answer(roster("Zoé")), shown: false },
    { name: "liste vide", player: "Zoé", fetcher: answer(roster()), shown: false },
    { name: "liste sans tableau de membres", player: "Zoé", fetcher: answer({ members: "non" }), shown: true },
    { name: "fichier qui n'est pas un objet", player: "Zoé", fetcher: answer(null), shown: true },
    { name: "une entrée vide dans la liste", player: "Zoé", fetcher: answer({ members: [null, { username: "Brennos" }] }), shown: true },
    { name: "liste refusée (404)", player: "Zoé", fetcher: refused(404), shown: true },
    { name: "réseau en panne", player: "Zoé", fetcher: broken, shown: true },
    { name: "fichier illisible", player: "Zoé", fetcher: garbled, shown: true },
  ];

  for (const { name, player, fetcher, shown } of cases) {
    it(name, async () => {
      const list = await readMembersList("/data/members.json", fetcher);
      expect(shownOnHome(list, player)).toBe(shown);
      expect(await cardShows(pick(player), fetcher)).toBe(shown);
    });
  }
});
