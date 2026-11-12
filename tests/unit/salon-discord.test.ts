import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BUTTON_LABEL_MAX, imageMessage, postWithImage, textMessage, type PostDeps } from "../../src/lib/discord-post";
import { ALT_MAX, fittedAlt, parseNoted, SEND_FROM_HOUR, sendWindow, shownAddress, siteLink } from "../../src/lib/salon-discord";

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

describe("fittedAlt", () => {
  const write = (shown: readonly string[], rest: number) => `Début. ${shown.join(" ; ")}${shown.length > 0 ? "." : ""}${rest > 0 ? ` Et ${rest} autres.` : ""} Fin entière.`;
  it("écrit tous les noms quand la description tient dans la limite de Discord", () => {
    expect(fittedAlt(["Alpha", "Beta"], write)).toBe("Début. Alpha ; Beta. Fin entière.");
    expect(fittedAlt([], write)).toBe("Début.  Fin entière.");
  });
  it("sinon, écrit autant de noms entiers que possible, compte les autres, et garde la fin", () => {
    const names = Array.from({ length: 100 }, (_, i) => `Capitaine Barbe GOAT.${7000 + i}`);
    const alt = fittedAlt(names, write);
    expect(alt.length).toBeLessThanOrEqual(ALT_MAX);
    const written = names.filter((name) => alt.includes(name)).length;
    expect(written).toBeGreaterThan(20);
    expect(alt.endsWith(`${names[written - 1]}. Et ${100 - written} autres. Fin entière.`)).toBe(true);
    // Un nom de plus aurait dépassé la limite.
    expect(write(names.slice(0, written + 1), 100 - written - 1).length).toBeGreaterThan(ALT_MAX);
  });
  it("si même sans nom la description est trop longue, elle est coupée à la limite", () => {
    expect(fittedAlt(["Alpha"], () => "x".repeat(ALT_MAX + 50))).toHaveLength(ALT_MAX);
  });
});

describe("le message d'une image", () => {
  const image = { alt: "Ce que l'image dit.", filename: "image.png" };
  it("n'a aucun texte : le fichier joint, sa description pour les lecteurs d'écran, et ses boutons", () => {
    const message = imageMessage("https://x.test/", image, [
      { label: "Voir la page", url: "https://x.test/page" },
      { label: "Voir l'autre", url: "https://x.test/autre" },
    ]);
    expect(message).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "image.png", description: "Ce que l'image dit." }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Voir la page", url: "https://x.test/page" },
            { type: 2, style: 5, label: "Voir l'autre", url: "https://x.test/autre" },
          ],
        },
      ],
    });
    for (const key of ["content", "embeds"]) expect(message).not.toHaveProperty(key);
  });
  it("garde le texte d'un bouton dans la limite de Discord", () => {
    const message = imageMessage("https://x.test", image, [{ label: "W".repeat(200), url: "https://x.test/page" }]);
    const label = (message["components"] as { components: { label: string }[] }[])[0]!.components[0]!.label;
    expect(label).toHaveLength(BUTTON_LABEL_MAX);
  });
  it("le message de secours est un texte seul, sans bouton, qui ne peut mentionner personne", () => {
    expect(textMessage("https://x.test/", "Bonjour")).toEqual({ content: "Bonjour", avatar_url: "https://x.test/generated/icon-192.png", allowed_mentions: { parse: [] } });
  });
});

describe("postWithImage", () => {
  const text = textMessage("https://x.test", "Le texte de secours");
  const setup = (over: Partial<PostDeps> = {}) => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const image = async () => ({ payload: imageMessage("https://x.test", { alt: "Description.", filename: "image.png" }, [{ label: "Voir", url: "https://x.test/page" }]), png: Uint8Array.of(137, 80, 78, 71), filename: "image.png" });
    const deps: PostDeps = { link: WEBHOOK, text, image, label: "Essai", fetch: post as unknown as typeof globalThis.fetch, log: (line) => logs.push(line), ...over };
    return { deps, logs, post };
  };
  it("envoie l'image seule, avec ses boutons, en un message, sans suivre de redirection : le texte ne part pas", async () => {
    const { deps, post, logs } = setup();
    expect(await postWithImage(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    // Sans ce réglage, Discord ignore les boutons.
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.method).toBe("POST");
    // Une redirection changerait l'envoi en simple lecture, qui répondrait « OK » sans rien poster.
    expect(init.redirect).toBe("error");
    const form = init.body as FormData;
    const sent = JSON.parse(String(form.get("payload_json")));
    expect(sent).not.toHaveProperty("content");
    expect(sent.attachments).toEqual([{ id: 0, filename: "image.png", description: "Description." }]);
    expect((form.get("files[0]") as File).name).toBe("image.png");
    expect(logs).toEqual([]);
  });
  it("si l'image ne se dessine pas, le texte de secours part à sa place, et l'Action le dit", async () => {
    const { deps, post, logs } = setup({ image: async () => Promise.reject(new Error("police absente")) });
    expect(await postWithImage(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    // Le secours part comme l'image : en POST, en JSON, sans suivre de redirection.
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual(text);
    expect(logs.join(" ")).toContain("::warning::Essai : image impossible à dessiner (police absente), le message part en texte.");
  });
  it.each([400, 403, 413])("si Discord refuse le message avec image (%i), le texte de secours part aussitôt", async (status) => {
    const answers = [new Response("non", { status }), new Response(null, { status: 204 })];
    const post = vi.fn(async () => answers.shift()!);
    const { deps, logs } = setup({ fetch: post as unknown as typeof globalThis.fetch });
    expect(await postWithImage(deps)).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    const [url, init] = post.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(String(init.body))).toEqual(text);
    expect(logs.join(" ")).toContain("il part en texte");
  });
  it("si le texte de secours est refusé aussi, rien n'est compté envoyé", async () => {
    const post = vi.fn(async () => new Response("non", { status: 400 }));
    const { deps } = setup({ fetch: post as unknown as typeof globalThis.fetch });
    expect(await postWithImage(deps)).toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it("un refus ou une panne se retente au passage suivant, sans jamais écrire le lien", async () => {
    for (const fetch of [vi.fn(async () => new Response(null, { status: 503 })), vi.fn(async () => Promise.reject(new Error(WEBHOOK)))]) {
      const { deps, logs } = setup({ fetch: fetch as unknown as typeof globalThis.fetch });
      expect(await postWithImage(deps)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(logs.join(" ")).toContain("Essai");
      for (const line of logs) expect(line).not.toContain("abc-DEF_123");
    }
  });
});
