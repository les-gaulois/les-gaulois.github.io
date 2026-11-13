import { describe, expect, it } from "vitest";
import { DISCORD_EMOJIS, EMOJI_SIZE, emojiEntries, emojiSvg, VIGNETTE_ICONES, VIGNETTE_SIZE, vignetteEntries, vignetteSvg } from "../../src/lib/emojis-discord";
import { GUICHET_ROWS } from "../../src/lib/guichet-image";
import { ICONES_PARTIES, ICONE_DEMI, ICONE_PLEIN } from "../../src/lib/icones-parties";
import { PANEL_ROLES as SITE_PANEL_ROLES } from "../../src/lib/roles-discord";
import { appEmojis, buttonEmoji, ensureEmojis, toBase64, vignetteUrl } from "../../supabase/functions/code-discord/emojis";
import { PANEL_EMOJIS, PANEL_ROLES, type CommandIndex, type DiscordCall, type DiscordReply, type Deps } from "../../supabase/functions/code-discord/index";
import { KINDS, TICKET_EMOJIS, TICKET_KINDS } from "../../supabase/functions/code-discord/tickets";

const SITE = "https://les-gaulois.github.io";
const APP = "222233334444555566";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
const count = (svg: string, needle: string) => svg.split(needle).length - 1;

describe("les émojis et les vignettes que dessine le site", () => {
  it("un émoji par bouton du panneau et des tickets, chacun d'une icône du site, nommé comme Discord l'accepte", () => {
    const names = DISCORD_EMOJIS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const emoji of DISCORD_EMOJIS) {
      expect(emoji.name).toMatch(/^[a-z_]{2,32}$/);
      expect(ICONES_PARTIES[emoji.icone], emoji.name).toBeDefined();
    }
  });

  it("dessine chaque case de l'icône, en blanc, la demi-teinte à moitié transparente, dans 128 pixels", () => {
    for (const emoji of DISCORD_EMOJIS) {
      const svg = emojiSvg(emoji.icone);
      expect(svg).toContain(`width="${EMOJI_SIZE}" height="${EMOJI_SIZE}"`);
      // Autant de rectangles que de suites de cases ; chaque demi-teinte porte la transparence, et rien d'autre ne l'a.
      const lines = ICONES_PARTIES[emoji.icone];
      const runs = (shade: string) => lines.reduce((sum, line) => sum + (line.match(new RegExp(`[${shade === ICONE_PLEIN ? "#" : "+"}]+`, "g"))?.length ?? 0), 0);
      expect(count(svg, "<rect "), emoji.name).toBe(runs(ICONE_PLEIN) + runs(ICONE_DEMI));
      expect(count(svg, 'fill-opacity="0.55"'), emoji.name).toBe(runs(ICONE_DEMI));
      for (const [, x, w] of svg.matchAll(/<rect x="(\d+)" y="\d+" width="(\d+)"/g)) expect(Number(x) + Number(w)).toBeLessThanOrEqual(EMOJI_SIZE);
    }
  });

  it("dessine les vignettes dans la case sombre des images, et donne leur adresse versionnée à l'index", () => {
    for (const icone of VIGNETTE_ICONES) expect(vignetteSvg(icone)).toContain(`width="${VIGNETTE_SIZE}"`);
    expect(emojiEntries().map((e) => e.name)).toEqual(DISCORD_EMOJIS.map((e) => e.name));
    for (const entry of emojiEntries()) expect(entry.image).toMatch(new RegExp(`^/commandes/emojis/${entry.name}\\.png\\?v=[0-9a-f]{12}$`));
    for (const entry of vignetteEntries()) expect(entry.image).toMatch(new RegExp(`^/commandes/vignettes/${entry.name}\\.png\\?v=[0-9a-f]{12}$`));
  });
});

describe("les mêmes noms et les mêmes icônes, côté site et côté robot", () => {
  it("le robot ne pose que des émojis que le site dessine", () => {
    const drawn = new Set(DISCORD_EMOJIS.map((e) => e.name));
    for (const name of [...PANEL_EMOJIS, ...TICKET_EMOJIS]) expect(drawn.has(name), name).toBe(true);
    expect(new Set([...PANEL_EMOJIS, ...TICKET_EMOJIS]).size).toBe(DISCORD_EMOJIS.length);
  });

  it("chaque bouton porte l'icône de sa case sur l'image, et sa vignette existe", () => {
    const byName = new Map(DISCORD_EMOJIS.map((e) => [e.name, e.icone]));
    PANEL_ROLES.forEach((role, i) => {
      expect(role.icone).toBe(SITE_PANEL_ROLES[i]?.icone);
      expect(byName.get(role.pixel)).toBe(role.icone);
      expect(VIGNETTE_ICONES).toContain(role.icone);
    });
    TICKET_KINDS.forEach((kind, i) => {
      expect(KINDS[kind].icone).toBe(GUICHET_ROWS[i]?.icone);
      expect(byName.get(KINDS[kind].pixel)).toBe(KINDS[kind].icone);
      expect(VIGNETTE_ICONES).toContain(KINDS[kind].icone);
    });
  });
});

/** Un faux Discord pour les émojis de l'application : la liste, puis chaque dépôt, qui reçoit le numéro suivant. */
function emojiDiscord(existing: Record<string, string>, over: { list?: DiscordReply | null; upload?: (name: string) => DiscordReply | null } = {}) {
  const sent: { method: string; path: string; call: DiscordCall | undefined }[] = [];
  const logs: string[] = [];
  const images: string[] = [];
  let next = 900000000000000001n;
  const deps = {
    botId: APP,
    discord: async (method: string, path: string, call?: DiscordCall) => {
      sent.push({ method, path, call });
      if (method === "GET") return over.list !== undefined ? over.list : { status: 200, body: { items: Object.entries(existing).map(([name, id]) => ({ id, name })) } };
      const name = String((call?.body as { name?: unknown }).name);
      if (over.upload) return over.upload(name);
      return { status: 201, body: { id: String(next++), name } };
    },
    siteImage: async (path: string) => {
      images.push(path);
      return PNG;
    },
    log: (message: string) => void logs.push(message),
  } as unknown as Deps;
  return { deps, sent, logs, images };
}

const INDEX = {
  emojis: DISCORD_EMOJIS.map((e) => ({ name: e.name, image: `/commandes/emojis/${e.name}.png?v=aaaaaaaaaaaa` })),
  vignettes: VIGNETTE_ICONES.map((icone) => ({ name: icone, image: `/commandes/vignettes/${icone}.png?v=bbbbbbbbbbbb` })),
} as unknown as CommandIndex;

describe("les émojis de l'application chez Discord", () => {
  it("lit leur liste, numéro par nom, et rien d'une réponse illisible", async () => {
    const { deps, sent } = emojiDiscord({ gal_cor: "111111111111111111" });
    expect(await appEmojis(deps)).toEqual(new Map([["gal_cor", "111111111111111111"]]));
    expect(sent[0]).toMatchObject({ method: "GET", path: `/applications/${APP}/emojis` });
    for (const list of [null, { status: 401, body: {} }, { status: 200, body: { items: "non" } }]) expect(await appEmojis(emojiDiscord({}, { list }).deps)).toBeNull();
    expect(await appEmojis({ ...deps, botId: "" } as Deps)).toBeNull();
  });

  it("dépose seulement ceux qui manquent, d'après le PNG du site, en base64", async () => {
    const { deps, sent, images } = emojiDiscord({ gal_cor: "111111111111111111" });
    const ids = await ensureEmojis(["gal_cor", "gal_cadeau"], INDEX, deps);
    expect(ids.get("gal_cor")).toBe("111111111111111111");
    expect(ids.get("gal_cadeau")).toBe("900000000000000001");
    expect(images).toEqual(["/commandes/emojis/gal_cadeau.png?v=aaaaaaaaaaaa"]);
    expect(sent[1]).toEqual({ method: "POST", path: `/applications/${APP}/emojis`, call: { body: { name: "gal_cadeau", image: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` } } });
  });

  it("ne dépose rien si la liste ne se lit pas, et part sans l'émoji qui n'a pas pu être déposé", async () => {
    const unreadable = emojiDiscord({}, { list: null });
    expect(await ensureEmojis(["gal_cor"], INDEX, unreadable.deps)).toEqual(new Map());
    expect(unreadable.sent.map((s) => s.method)).toEqual(["GET"]);
    const refused = emojiDiscord({}, { upload: () => ({ status: 400, body: { code: 50035 } }) });
    expect(await ensureEmojis(["gal_cor"], INDEX, refused.deps)).toEqual(new Map());
    expect(refused.logs).toEqual(["émoji gal_cor : pas déposé (400)"]);
    const noImage = emojiDiscord({});
    expect(await ensureEmojis(["gal_inconnu"], INDEX, noImage.deps)).toEqual(new Map());
    expect(noImage.logs).toEqual(["émoji gal_inconnu : pas d'image sur le site"]);
  });

  it("met l'émoji du robot sur un bouton s'il est déposé, sinon l'émoji ordinaire, sinon rien", () => {
    const ids = new Map([["gal_cor", "111111111111111111"]]);
    expect(buttonEmoji("gal_cor", ids, "x")).toEqual({ emoji: { id: "111111111111111111", name: "gal_cor" } });
    expect(buttonEmoji("gal_cadeau", ids, "x")).toEqual({ emoji: { name: "x" } });
    expect(buttonEmoji("gal_cadeau", ids)).toEqual({});
  });

  it("donne l'adresse d'une vignette d'après l'index, ou rien", () => {
    expect(vignetteUrl(INDEX, "epees", SITE)).toBe(`${SITE}/commandes/vignettes/epees.png?v=bbbbbbbbbbbb`);
    expect(vignetteUrl(INDEX, "inconnue", SITE)).toBeNull();
    expect(vignetteUrl(null, "epees", SITE)).toBeNull();
  });

  it("écrit un PNG en base64 par morceaux, même gros", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(toBase64(big)).toBe(Buffer.from(big).toString("base64"));
  });
});
