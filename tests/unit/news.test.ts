import { describe, expect, it } from "vitest";
import { fetchLiveNews, goingLabel, mergeAnnouncements, mergeEvents, safeUrl, seriesNote, toLocalInput } from "../../src/lib/compte/news";

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
  it("renvoie les données, sondages compris, même d'un serveur qui n'en connaît pas encore", async () => {
    expect(await fetchLiveNews(respond(200, { ok: true, announcements: [], events: [] }))).toEqual({ announcements: [], events: [], polls: [] });
    const poll = { id: 1, question: "Quel soir ?", options: ["Vendredi", "Samedi"], counts: [3, 1], is_open: true, closes_at: null, created_at: "2026-11-08T10:00:00Z" };
    const data = await fetchLiveNews(
      respond(200, { ok: true, announcements: [], events: [], polls: [poll, { id: 2, question: "Sans choix" }, null, { ...poll, id: 3, options: [1, 2] }, { ...poll, id: 4, counts: [3] }, { ...poll, id: 5, counts: [3, null] }] }),
    );
    // Un sondage aux totaux incomplets n'est pas montré : un total absent n'est pas zéro.
    expect(data?.polls).toEqual([poll]);
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
