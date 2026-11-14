import { describe, expect, it } from "vitest";
import { currentPickWeek, fetchLiveNews, goingLabel, mergeAnnouncements, mergeEvents, pickWeekEnding, pickWeekLabel, safeUrl, seriesNote, toLocalInput, weeklyPickOf } from "../../src/lib/compte/news";

const NOW = Date.parse("2026-11-06T12:00:00Z");

describe("les annonces", () => {
  it("mêle le dépôt et le direct, les plus récentes d'abord", () => {
    const items = mergeAnnouncements([{ date: "2026-11-01", title: "Dépôt", body: "b" }], [{ id: 1, title: "Direct", body: "b", url: null, created_at: "2026-11-05T10:00:00Z" }]);
    expect(items.map((i) => i.title)).toEqual(["Direct", "Dépôt"]);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });
  it("écarte un lien dangereux reçu du serveur", () => {
    const [item] = mergeAnnouncements([], [{ id: 1, title: "T", body: "b", url: "javascript:alert(1)", created_at: "2026-11-05T10:00:00Z" }]);
    expect(item?.url).toBeNull();
  });
});

describe("safeUrl", () => {
  it("n'accepte que https, sans espace ni guillemet", () => {
    expect(safeUrl("https://discord.gg/x")).toBe("https://discord.gg/x");
    for (const bad of ["http://a.fr", "javascript:x", "data:text/html,x", "https://a b", 'https://a"b', "", null, undefined]) expect(safeUrl(bad), String(bad)).toBeNull();
  });
});

describe("les événements", () => {
  it("garde ceux à venir, les plus proches d'abord", () => {
    const items = mergeEvents(
      [
        { start: "2026-11-20T20:00:00Z", title: "Loin" },
        { start: "2026-11-01T20:00:00Z", title: "Passé" },
      ],
      [{ id: 1, title: "Proche", description: null, url: null, starts_at: "2026-11-07T20:00:00Z" }],
      NOW,
    );
    expect(items.map((i) => i.title)).toEqual(["Proche", "Loin"]);
  });
});

describe("fetchLiveNews", () => {
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("renvoie les annonces et les événements, jamais de sondage : ils sont au QG", async () => {
    expect(await fetchLiveNews(respond(200, { ok: true, announcements: [], events: [] }))).toEqual({ announcements: [], events: [], weeklyPick: null });
    // Un serveur plus ancien donne encore des sondages : l'accueil, public, ne les garde pas.
    const poll = { id: 1, question: "Quel soir ?", options: ["Vendredi", "Samedi"], counts: [3, 1], is_open: true, closes_at: null, created_at: "2026-11-08T10:00:00Z" };
    expect(await fetchLiveNews(respond(200, { ok: true, announcements: [], events: [], polls: [poll] }))).toEqual({ announcements: [], events: [], weeklyPick: null });
  });
  it("renvoie le Gaulois de la semaine choisi par l'encadrement", async () => {
    const weekly_pick = { week: "2026-11-09", player: "Ancien Gaulois", note: "Une semaine énorme." };
    expect(await fetchLiveNews(respond(200, { ok: true, announcements: [], events: [], weekly_pick }))).toEqual({ announcements: [], events: [], weeklyPick: { week: "2026-11-09", player: "Ancien Gaulois", note: "Une semaine énorme." } });
  });
  it("renvoie null en cas de panne ou de réponse inattendue : la page garde le dépôt", async () => {
    expect(await fetchLiveNews(respond(500, {}))).toBeNull();
    expect(await fetchLiveNews(respond(200, { ok: false }))).toBeNull();
    expect(
      await fetchLiveNews((async () => {
        throw new Error("réseau");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});

describe("les réponses aux événements", () => {
  it("gardent l'identifiant, le nombre de membres qui viennent et la série d'un événement de la Direction", () => {
    const [item] = mergeEvents([], [{ id: 7, title: "Soirée", description: null, url: null, starts_at: "2026-11-13T20:00:00Z", going: 3, series: { left: 4, until: "2026-12-04T20:00:00Z" } }], NOW);
    expect(item).toMatchObject({ eventId: 7, going: 3, series: { left: 4, until: "2026-12-04T20:00:00Z" } });
    // Un serveur plus ancien ne donne ni réponses ni série.
    const [old] = mergeEvents([], [{ id: 8, title: "Ancien", description: null, url: null, starts_at: "2026-11-13T20:00:00Z" }], NOW);
    expect(old).toMatchObject({ eventId: 8, series: null });
    expect(old?.going).toBeUndefined();
  });

  it("n'ont pas de bouton pour un événement du dépôt", () => {
    const [item] = mergeEvents([{ start: "2026-11-20T20:00:00Z", title: "Dépôt" }], [], NOW);
    expect(item?.eventId).toBeUndefined();
  });

  it("s'écrivent au singulier comme au pluriel, et rien sans personne", () => {
    expect(goingLabel(undefined)).toBeNull();
    expect(goingLabel(0)).toBeNull();
    expect(goingLabel(1)).toBe("1 membre vient");
    expect(goingLabel(12)).toBe("12 membres viennent");
  });

  it("disent combien de rendez-vous restent dans une série, et jusqu'à quand, tant qu'il en reste plus d'un", () => {
    expect(seriesNote(null)).toBeNull();
    expect(seriesNote({ left: 1, until: "2026-12-04T20:00:00Z" })).toBeNull();
    expect(seriesNote({ left: 4, until: "2026-12-04T20:00:00Z" })).toBe("Encore 4 rendez-vous, jusqu'au 4 déc. 2026");
    expect(seriesNote({ left: 4, until: "pas une date" })).toBeNull();
  });
});

describe("toLocalInput", () => {
  it("écrit la date comme l'attend un champ datetime-local, et revient à la même heure", () => {
    const iso = "2026-11-20T19:30:00.000Z";
    const local = toLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(local).toISOString()).toBe(iso);
  });
});

describe("le Gaulois de la semaine", () => {
  it("se lit tel que le serveur le donne, mot facultatif", () => {
    expect(weeklyPickOf({ week: "2026-11-09", player: "Ancien Gaulois", note: "Bravo." })).toEqual({ week: "2026-11-09", player: "Ancien Gaulois", note: "Bravo." });
    expect(weeklyPickOf({ week: "2026-11-09", player: "Ancien Gaulois", note: null })).toEqual({ week: "2026-11-09", player: "Ancien Gaulois", note: null });
    expect(weeklyPickOf({ week: "2026-11-09", player: "Ancien Gaulois", note: "   " })?.note).toBeNull();
  });

  it("n'affiche rien d'illisible plutôt que de deviner : pas de choix, pas de lundi, pas de pseudo", () => {
    for (const bad of [null, undefined, [], "Ancien Gaulois", { week: "2026-11-10", player: "Ancien Gaulois" }, { week: "9 nov.", player: "Ancien Gaulois" }, { week: "2026-11-09", player: "" }, { week: "2026-11-09", player: "x".repeat(65) }, { week: "2026-11-09" }]) {
      expect(weeklyPickOf(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("donne la semaine en cours à Paris, du lundi au dimanche, comme le serveur", () => {
    // Dimanche 15 novembre 2026 à 23 h 30 à Paris : encore la semaine du lundi 9.
    expect(currentPickWeek(new Date("2026-11-15T22:30:00Z"))).toBe("2026-11-09");
    // Lundi 16 novembre à 0 h 30 à Paris : la semaine suivante, même si l'heure universelle dit encore dimanche.
    expect(currentPickWeek(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
    expect(pickWeekLabel("2026-11-09")).toBe("la semaine du 9 nov. au 15 nov.");
    // En fin de phrase, un seul point : « 15 nov. », pas « 15 nov.. » ; et un mois sans abréviation reçoit le sien.
    expect(pickWeekEnding("2026-11-09")).toBe("la semaine du 9 nov. au 15 nov.");
    expect(pickWeekEnding("2026-08-03")).toBe("la semaine du 3 août au 9 août.");
  });
});
