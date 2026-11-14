import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  annonceEnMots,
  batimentsAAnnoncer,
  chantierPass,
  chantierPayload,
  parseChantierState,
  sendChantier,
  type AnnonceDuChantier,
  type ChantierPassDeps,
  type ChantierSendDeps,
  type ChantierSendState,
} from "../../src/lib/chantier-discord";
import { BATIMENT, chantierCard, chantierImageAlt, placeDuBatiment, renderChantierCard } from "../../src/lib/chantier-image";
import { drawnWidth, GazetteFonts, type CardText } from "../../src/lib/gazette-image";
import { dessinDuBatiment } from "../../src/lib/village/batiments/index";
import { etatDuChantier } from "../../src/lib/village/chantier";
import { BATIMENTS, DEBUT_DU_CHANTIER } from "../../src/lib/village/chantier-liste";
import { PLEIN_JOUR } from "../../src/lib/village/lumiere";
import type { EtatDuMonde } from "../../src/lib/village/monde-etat";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const DEBUT = Date.parse(DEBUT_DU_CHANTIER);
const HEURE = 3_600_000;
const RELEVE = "2026-11-14T12:53:28.840Z";
const NOW = new Date("2026-11-14T13:05:00.000Z");
const at = (heures: number) => new Date(DEBUT + heures * HEURE).toISOString();

/** Le monde quand ces points ont été rapportés au clan, une partie par nombre, une heure après l'autre. */
function monde(points: readonly number[], releve = RELEVE): EtatDuMonde {
  const sessions = points.map((score, i) => ({ gameId: `g${i}`, gameStart: at(i + 1), score }));
  return { releve, chantier: etatDuChantier(sessions, releve, []), feu: null };
}

describe("l'état noté des annonces", () => {
  it("se relit, et un état illisible repart comme au premier passage, avec un avertissement", () => {
    const state: ChantierSendState = { depuis: RELEVE, connus: ["palissade"], annonces: [] };
    expect(parseChantierState(JSON.stringify(state))).toEqual({ state, warning: null });
    expect(parseChantierState(null)).toEqual({ state: null, warning: null });
    for (const bad of ["{", JSON.stringify({ ...state, connus: ["menhir"] }), JSON.stringify({ connus: [] })]) {
      const read = parseChantierState(bad);
      expect(read.state).toBeNull();
      expect(read.warning).toContain("rien n'est envoyé pour eux");
    }
  });
});

describe("chantierPass", () => {
  const setup = (stored: ChantierSendState | null, etat: EtatDuMonde, answers: boolean[] = []) => {
    const logs: string[] = [];
    const send = vi.fn<(annonce: AnnonceDuChantier) => Promise<boolean>>(async () => answers.shift() ?? true);
    const deps: ChantierPassDeps = { stored, monde: etat, now: NOW, send, log: (line) => logs.push(line) };
    return { deps, send, logs };
  };

  it("au premier passage, note les bâtiments déjà finis sans rien envoyer", async () => {
    const { deps, send, logs } = setup(null, monde([100, 160]));
    expect(await chantierPass(deps)).toEqual({ state: { depuis: NOW.toISOString(), connus: ["palissade", "puits"], annonces: [] }, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("2 bâtiments déjà finis notés");
  });

  it("annonce un bâtiment fini depuis, une fois, avec le prochain chantier et le relevé", async () => {
    const stored: ChantierSendState = { depuis: RELEVE, connus: ["palissade"], annonces: [] };
    const etat = monde([100, 160]);
    const { deps, send, logs } = setup(stored, etat);
    const result = await chantierPass(deps);
    expect(send).toHaveBeenCalledTimes(1);
    const annonce = send.mock.calls[0]![0];
    expect(annonce.batiment).toMatchObject({ id: "puits", cout: 150, poses: 150, fini_le: at(2) });
    expect(annonce.prochain).toMatchObject({ id: "four", poses: 10 });
    expect(annonce.releve).toBe(RELEVE);
    expect(result).toEqual({ state: { ...stored, connus: ["palissade", "puits"], annonces: [{ id: "puits", fini_le: at(2), envoye_le: NOW.toISOString() }] }, failed: false });
    expect(logs.at(-1)).toMatch(/^::notice::Chantier : le puits/);
    // Le passage suivant n'a plus rien à envoyer.
    const again = setup(result.state, etat);
    expect(await chantierPass(again.deps)).toEqual({ state: null, failed: false });
    expect(again.send).not.toHaveBeenCalled();
  });

  it("plusieurs bâtiments finis d'un coup partent l'un après l'autre, dans l'ordre du chantier", async () => {
    const { deps, send } = setup({ depuis: RELEVE, connus: [], annonces: [] }, monde([500]));
    const result = await chantierPass(deps);
    expect(send.mock.calls.map((c) => c[0].batiment.id)).toEqual(["palissade", "puits", "four"]);
    expect(result.state?.connus).toEqual(["palissade", "puits", "four"]);
  });

  it("un envoi refusé arrête le passage : ce qui est parti reste noté, le reste est retenté au suivant", async () => {
    const etat = monde([500]);
    const first = setup({ depuis: RELEVE, connus: [], annonces: [] }, etat, [true, false]);
    const result = await chantierPass(first.deps);
    expect(result.failed).toBe(true);
    expect(result.state?.connus).toEqual(["palissade"]);
    expect(first.send).toHaveBeenCalledTimes(2);
    const next = setup(result.state, etat);
    await chantierPass(next.deps);
    expect(next.send.mock.calls.map((c) => c[0].batiment.id)).toEqual(["puits", "four"]);
    // Refusé dès le premier : rien n'a changé, rien à écrire.
    const refused = setup({ depuis: RELEVE, connus: [], annonces: [] }, etat, [false]);
    expect(await chantierPass(refused.deps)).toEqual({ state: null, failed: true });
  });

  it("jamais deux fois le même bâtiment, même si le chantier recule", async () => {
    const stored: ChantierSendState = { depuis: RELEVE, connus: ["palissade", "puits"], annonces: [] };
    const { deps, send } = setup(stored, monde([120]));
    expect(await chantierPass(deps)).toEqual({ state: null, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(batimentsAAnnoncer(stored, monde([500])).map((a) => a.batiment.id)).toEqual(["four"]);
  });

  it("sans chantier lisible, ne fait rien et ne note rien, même au premier passage", async () => {
    for (const etat of [{ releve: null, chantier: null, feu: null }, { releve: RELEVE, chantier: null, feu: null }] satisfies EtatDuMonde[]) {
      const { deps, send } = setup(null, etat);
      expect(await chantierPass(deps)).toEqual({ state: null, failed: false });
      expect(send).not.toHaveBeenCalled();
    }
  });
});

const ANNONCE: AnnonceDuChantier = {
  batiment: { id: "tour", nom: "la tour de guet", titre: "La tour de guet", cout: 350, poses: 350, fini_le: "2026-11-13T21:03:15.629Z" },
  prochain: { id: "pont", nom: "le pont", titre: "Le pont", cout: 450, poses: 13.91, fini_le: null },
  releve: RELEVE,
};

describe("le message", () => {
  it("dit le bâtiment, ce qu'il a coûté, le jour, le prochain chantier et le relevé, en mots", () => {
    expect(annonceEnMots(ANNONCE).map(plain)).toEqual([
      "La tour de guet : chantier terminé au village des Gaulois, le 13 novembre 2026, avec 350 points rapportés au clan.",
      "Prochain chantier : le pont, encore 437 points.",
      "Au relevé du 14 novembre 2026 à 13 h 53.",
    ]);
    expect(annonceEnMots({ ...ANNONCE, prochain: null })[1]).toBe(`Tout le village est bâti : les ${BATIMENTS.length} chantiers sont finis.`);
  });

  it("avec l'image : l'image et un bouton vers le village, sans texte", () => {
    expect(chantierPayload(ANNONCE, SITE, { alt: "Description.", filename: "chantier-tour.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "chantier-tour.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le village", url: "https://x.test/village" }] }],
    });
  });

  it("en secours, un texte qui ne mentionne personne, avec le lien du village et le relevé", () => {
    const payload = chantierPayload(ANNONCE, SITE, null);
    expect(plain(String(payload["content"])).split("\n")).toEqual([
      "**La tour de guet : chantier terminé au village des Gaulois, le 13 novembre 2026, avec 350 points rapportés au clan.**",
      "Prochain chantier : le pont, encore 437 points.",
      "[Voir le village sur le site](<https://x.test/village>)",
      "-# Au relevé du 14 novembre 2026 à 13 h 53.",
    ]);
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(payload).not.toHaveProperty("components");
  });

  it("part en un seul envoi avec l'image, sans suivre de redirection ; en texte si l'image ne se dessine pas ; le lien n'est écrit nulle part", async () => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: ChantierSendDeps = { link: WEBHOOK, annonce: ANNONCE, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description." }), siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (line) => logs.push(line) };
    expect(await sendChantier(deps)).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    const sent = JSON.parse(String((init.body as FormData).get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ filename: "chantier-tour.png" }] });
    expect(sent).not.toHaveProperty("content");

    const text = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await sendChantier({ ...deps, fetch: text as unknown as typeof fetch, renderImage: async () => Promise.reject(new Error("dessin impossible")) })).toBe(true);
    expect((text.mock.calls[0] as unknown as [string])[0]).toBe(WEBHOOK);
    expect(logs.join(" ")).toContain("Chantier : image impossible à dessiner");

    const down = vi.fn(async () => new Response("panne", { status: 503 }));
    expect(await sendChantier({ ...deps, fetch: down as unknown as typeof fetch })).toBe(false);
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

describe("l'image d'un bâtiment fini", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const plainText = (t: CardText) => t.text.replace(NUMBER_SPACES, " ");
  // Chaque bâtiment, avec son vrai dessin, puis le dernier, quand tout est bâti.
  const cards = BATIMENTS.map((b, i) => {
    const next = BATIMENTS[i + 1];
    const annonce: AnnonceDuChantier = {
      batiment: { ...b, poses: b.cout, fini_le: "2026-11-13T21:03:15.629Z" },
      prochain: next ? { ...next, poses: 0.5, fini_le: null } : null,
      releve: RELEVE,
    };
    return { id: b.id, annonce, card: chantierCard(annonce, dessinDuBatiment(b.id, PLEIN_JOUR, 1), SITE, fonts.width) };
  });

  it("est assez large pour que Discord la montre en grand", () => {
    for (const { id, card } of cards) expect(card.width / card.height, id).toBeGreaterThanOrEqual(1.55);
  });

  it("aucun texte n'est coupé ni ne sort de l'image", () => {
    for (const { id, card } of cards) {
      for (const t of card.texts) {
        expect(plainText(t).endsWith("…"), `${id} : ${t.text}`).toBe(false);
        const width = drawnWidth(t, fonts.width);
        const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
        expect(left, `${id} : ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(left + width, `${id} : ${t.text}`).toBeLessThanOrEqual(card.width + 0.5);
      }
    }
  });

  it("le bâtiment tient dans sa colonne, sur le sol, sans toucher aucun texte, à des cases entières", () => {
    const column = card0Column();
    for (const { id, card } of cards) {
      const d = card.dessin!;
      expect(Number.isInteger(d.echelle) && d.echelle >= 2, id).toBe(true);
      expect(d.x, id).toBeGreaterThanOrEqual(column);
      expect(d.x + d.decor.largeur * d.echelle, id).toBeLessThanOrEqual(card.width - 36);
      expect(d.y, id).toBeGreaterThanOrEqual(BATIMENT.top);
      expect(d.y + d.decor.hauteur * d.echelle, id).toBe(BATIMENT.ground);
      for (const t of card.texts) {
        if (t.y > BATIMENT.ground) continue;
        const width = drawnWidth(t, fonts.width);
        const right = t.anchor === "end" ? t.x : t.anchor === "middle" ? t.x + width / 2 : t.x + width;
        expect(right, `${id} : ${t.text}`).toBeLessThanOrEqual(column);
      }
    }
  });

  it("le plus grand des cases entières qui tienne : une tour haute à 3 pixels, une palissade très large à 2", () => {
    const echelleDe = (id: string) => cards.find((c) => c.id === id)!.card.dessin!.echelle;
    expect(echelleDe("tour")).toBe(3);
    expect(echelleDe("grande-tour")).toBe(3);
    expect(echelleDe("palissade")).toBe(2);
    expect(placeDuBatiment({ largeur: 0, hauteur: 10, cases: [] })).toBeNull();
  });

  it("sa description dit tout ce que montre l'image", () => {
    const { annonce } = cards.find((c) => c.id === "tour")!;
    const alt = plain(chantierImageAlt(annonce));
    for (const words of ["La tour de guet", "350 points rapportés au clan", "13 novembre 2026", "Prochain chantier : le pont", "encore 450 points", "Au relevé du 14 novembre 2026 à 13 h 53"]) expect(alt).toContain(words);
  });

  it("se dessine, le bâtiment posé sans lissage", async () => {
    const { card } = cards.find((c) => c.id === "palissade")!;
    const png = await renderChantierCard(card, fonts, root);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([card.width, card.height]);
    // Une case du dessin, deux pixels plus loin : la même couleur, sans mélange.
    const d = card.dessin!;
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const index = d.decor.cases.findIndex((c) => c !== null);
    const cx = d.x + (index % d.decor.largeur) * d.echelle;
    const cy = d.y + Math.floor(index / d.decor.largeur) * d.echelle;
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    const hex = d.decor.cases[index]!;
    const expected = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    expect(pixel(cx, cy)).toEqual(expected);
    expect(pixel(cx + d.echelle - 1, cy + d.echelle - 1)).toEqual(expected);
  });

  /** Le bord gauche de la colonne du bâtiment. */
  function card0Column() {
    return cards[0]!.card.width - 36 - BATIMENT.column;
  }
});
