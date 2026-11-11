import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { postText } from "../../src/lib/discord-post";
import { parseNoted, SEND_FROM_HOUR, sendWindow, shownAddress, siteLink } from "../../src/lib/salon-discord";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
// En novembre, Paris est à UTC+1.
const at = (iso: string) => new Date(iso);

describe("sendWindow", () => {
  it("jamais la nuit, de 23 h à 8 h à Paris", () => {
    expect(sendWindow(at("2026-11-11T22:05:00.000Z"), 12, null)).toEqual({ open: false, reason: "la nuit : le message attend 12 h" });
    expect(sendWindow(at("2026-11-11T05:53:00.000Z"), 9, null).open).toBe(false);
  });
  it("pas avant l'heure du message", () => {
    expect(sendWindow(at("2026-11-11T15:53:00.000Z"), SEND_FROM_HOUR.actifs, null)).toEqual({ open: false, reason: "le message part à partir de 17 h" });
    expect(sendWindow(at("2026-11-11T16:00:00.000Z"), SEND_FROM_HOUR.actifs, null)).toEqual({ open: true, reason: "" });
  });
  it("une fois par jour à Paris", () => {
    expect(sendWindow(at("2026-11-11T18:53:00.000Z"), 9, "2026-11-11").reason).toContain("déjà un message aujourd'hui");
    expect(sendWindow(at("2026-11-12T08:53:00.000Z"), 9, "2026-11-11").open).toBe(true);
  });
  it("étale les messages dans la journée, du matin au soir", () => {
    expect(Object.values(SEND_FROM_HOUR)).toEqual([9, 12, 17, 19, 21]);
  });
});

describe("parseNoted", () => {
  const Schema = z.object({ lastDay: z.string() });
  it("lit l'état, rien d'un fichier absent, et repart de zéro avec un avertissement s'il est illisible", () => {
    expect(parseNoted(Schema, JSON.stringify({ lastDay: "2026-11-10" }), "nouveau départ")).toEqual({ state: { lastDay: "2026-11-10" }, warning: null });
    expect(parseNoted(Schema, null, "nouveau départ")).toEqual({ state: null, warning: null });
    for (const raw of ["{", "[]", JSON.stringify({ lastDay: 3 })]) expect(parseNoted(Schema, raw, "nouveau départ")).toEqual({ state: null, warning: "l'état noté est illisible : nouveau départ" });
  });
});

describe("les adresses du site", () => {
  it("sans barre en double, et sans « https:// » sur une image", () => {
    expect(siteLink("https://x.test/", "/parties")).toBe("https://x.test/parties");
    expect(shownAddress("https://x.test", "/membres")).toBe("x.test/membres");
  });
});

describe("postText", () => {
  const setup = (fetch: typeof globalThis.fetch) => {
    const logs: string[] = [];
    return { logs, deps: { link: WEBHOOK, text: { content: "Bonjour", allowed_mentions: { parse: [] } }, label: "Nouveautés", fetch, log: (line: string) => logs.push(line) } };
  };
  it("envoie le texte en JSON, sans suivre de redirection", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const { deps } = setup(fetch as unknown as typeof globalThis.fetch);
    expect(await postText(deps)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(WEBHOOK, expect.objectContaining({ method: "POST", redirect: "error", body: JSON.stringify(deps.text) }));
  });
  it("un refus ou une panne se retente au passage suivant, sans jamais écrire le lien", async () => {
    for (const fetch of [vi.fn(async () => new Response(null, { status: 503 })), vi.fn(async () => Promise.reject(new Error(WEBHOOK)))]) {
      const { deps, logs } = setup(fetch as unknown as typeof globalThis.fetch);
      expect(await postText(deps)).toBe(false);
      expect(logs.join(" ")).toContain("Nouveautés");
      for (const line of logs) expect(line).not.toContain("abc-DEF_123");
    }
  });
});
