import { describe, expect, it, vi } from "vitest";
import { MAX_CONTENT } from "../../src/lib/paliers-franchis-discord";
import { MAX_ENTRIES, newsContent, newsKey, newsPass, newsPayload, NewsState, sendNews, unseenNews, type NewsPassDeps } from "../../src/lib/nouveautes-discord";
import { Nouveautes, type Nouveaute } from "../../src/lib/schemas";

const SITE = "https://x.test/";
const entry = (date: string, title: string, link?: Nouveaute["link"]): Nouveaute => ({ date, kind: "nouveau", title, body: `Ce qui change avec ${title}.`, ...(link ? { link } : {}) });
const NEW = entry("2026-11-11", "Les appels partent sur Discord", { href: "/qg#salons", label: "Voir les salons" });
const ALSO = entry("2026-11-11", "Les podiums des Gaulois");
const OLD = entry("2026-11-02", "Une ancienne nouveauté");
const ENTRIES = [NEW, ALSO, OLD];
const STATE: NewsState = { seen: [newsKey(OLD)], lastSentOn: "2026-11-10" };

describe("unseenNews", () => {
  it("garde les entrées pas encore passées ; celles de plus de trois jours ne sont plus des nouvelles", () => {
    expect(unseenNews(ENTRIES, { seen: [], lastSentOn: null }, "2026-11-11")).toEqual({ fresh: [NEW, ALSO], stale: [OLD] });
    expect(unseenNews(ENTRIES, STATE, "2026-11-11")).toEqual({ fresh: [NEW, ALSO], stale: [] });
    expect(unseenNews([entry("2026-11-09", "Avant-hier")], STATE, "2026-11-11").fresh).toHaveLength(1);
  });
});

describe("le message", () => {
  it("reprend chaque titre, sa phrase et le lien de sa page, en texte, sans pouvoir mentionner personne", () => {
    expect(newsContent([NEW, ALSO], SITE).split("\n")).toEqual([
      "**Nouveau sur le site du clan**",
      "🆕 **Les appels partent sur Discord** : Ce qui change avec Les appels partent sur Discord. [Voir les salons](<https://x.test/qg#salons>)",
      "🆕 **Les podiums des Gaulois** : Ce qui change avec Les podiums des Gaulois.",
      "[Toutes les nouveautés](<https://x.test/nouveautes>)",
    ]);
    expect(newsPayload([NEW], SITE, null)).toEqual({ content: newsContent([NEW], SITE), avatar_url: "https://x.test/generated/icon-192.png", allowed_mentions: { parse: [] } });
  });
  it("avec l'image : le fichier joint et un bouton vers la page Nouveautés, sans aucun texte", () => {
    expect(newsPayload([NEW, ALSO], SITE, { alt: "Description.", filename: "nouveautes-du-site.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "nouveautes-du-site.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Toutes les nouveautés", url: "https://x.test/nouveautes" }] }],
    });
  });
  it("part en image, et en texte seulement si elle ne se dessine pas, sans jamais écrire le lien", async () => {
    const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps = { link: WEBHOOK, entries: [NEW, ALSO], siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (l: string) => logs.push(l) };
    expect(await sendNews({ ...deps, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description de l'image." }) })).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    const sent = JSON.parse(String((init.body as FormData).get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ id: 0, filename: "nouveautes-du-site.png", description: "Description de l'image." }] });
    expect(sent).not.toHaveProperty("content");
    expect(await sendNews({ ...deps, renderImage: () => Promise.reject(new Error("police")) })).toBe(true);
    const [fallbackUrl, fallback] = post.mock.calls[1] as unknown as [string, RequestInit];
    expect(fallbackUrl).toBe(WEBHOOK);
    expect(JSON.parse(String(fallback.body)).content).toBe(newsContent([NEW, ALSO], SITE));
    expect(logs.join(" ")).toContain("Nouveautés : image impossible à dessiner");
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
  it("trop long pour Discord : les titres seuls, puis moins d'entrées, et compte les autres", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...entry("2026-11-11", `Nouveauté numéro ${i}`), body: "x".repeat(400) }));
    const content = newsContent(many, SITE);
    expect(content.length).toBeLessThanOrEqual(MAX_CONTENT);
    expect(content).not.toContain("xxxx");
    expect(content).toContain(`Et ${14 - MAX_ENTRIES} autres nouveautés.`);
  });
  it("un texte ne peut ni mettre en forme le message ni y glisser une mention", () => {
    const content = newsContent([entry("2026-11-11", "**@everyone**")], SITE);
    expect(content).not.toContain("**@everyone**");
  });
});

describe("newsPass", () => {
  const NOW = new Date("2026-11-11T18:53:00.000Z");
  const setup = (over: Partial<NewsPassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: NewsPassDeps = { stored: STATE, entries: ENTRIES, gazetteLastSent: "2026-11-02", now: NOW, send, log: (l) => logs.push(l), ...over };
    return { deps, logs, send };
  };
  it("au premier passage, les entrées du moment servent de départ : rien n'est envoyé", async () => {
    const { deps, send } = setup({ stored: null });
    expect(await newsPass(deps)).toEqual({ state: { seen: ENTRIES.map(newsKey), lastSentOn: null }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("dès 19 h à Paris, envoie les nouvelles entrées, puis les note toutes", async () => {
    const { deps, send } = setup();
    expect(await newsPass(deps)).toEqual({ state: { seen: ENTRIES.map(newsKey), lastSentOn: "2026-11-11" }, failed: false });
    expect(send).toHaveBeenCalledWith([NEW, ALSO]);
  });
  it("avant 19 h, attend sans rien noter", async () => {
    const { deps, send } = setup({ now: new Date("2026-11-11T16:53:00.000Z") });
    expect(await newsPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("une entrée trop ancienne est notée sans être envoyée, et une entrée retirée est oubliée", async () => {
    const { deps, send } = setup({ stored: { seen: [newsKey(NEW), newsKey(ALSO), "2026-10-01 Retirée"], lastSentOn: "2026-11-11" } });
    expect(await newsPass(deps)).toEqual({ state: { seen: [newsKey(NEW), newsKey(ALSO), newsKey(OLD)], lastSentOn: "2026-11-11" }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("après un refus de Discord, ne note pas l'envoi : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    expect(await newsPass(deps)).toEqual({ state: null, failed: true });
  });
  it("sans rien de neuf, ou avant la gazette du lundi 9 novembre, ne fait rien", async () => {
    for (const over of [{ stored: { seen: ENTRIES.map(newsKey), lastSentOn: null } }, { gazetteLastSent: "2026-10-26" }]) {
      const { deps, send } = setup(over);
      expect(await newsPass(deps)).toEqual({ state: null, failed: false });
      expect(send).not.toHaveBeenCalled();
    }
  });
  it("l'état noté se relit", () => {
    expect(NewsState.safeParse({ seen: ENTRIES.map(newsKey), lastSentOn: "2026-11-11" }).success).toBe(true);
  });
  it("les vraies nouveautés du site se lisent et donnent un message assez court", async () => {
    const { default: raw } = await import("../../content/nouveautes.json");
    const entries = Nouveautes.parse(raw);
    expect(newsContent(entries.slice(0, 20), SITE).length).toBeLessThanOrEqual(MAX_CONTENT);
  });
});
