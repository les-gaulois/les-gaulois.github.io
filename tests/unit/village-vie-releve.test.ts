import { describe, expect, it } from "vitest";
import type { RpcResult } from "../../src/lib/compte/roster";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { CONSIGNE } from "../../src/lib/village/consigne-repliques";
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  MAX_TOKENS,
  choisirLeLot,
  controlerReplique,
  corpsDeLaDemande,
  demanderLesBulles,
  faitsDuGaulois,
  jetonsDeLaReponse,
  lirePlafond,
  lireTravail,
  lireVieDuVillage,
  momentDeLaJournee,
  objetsPortes,
  phrasesDeLaReponse,
  pointsEcrits,
  releverLesVocaux,
  vieDuVillage,
  type FaitsDuGaulois,
} from "../../src/lib/village/vie-releve";

/* ---------- Des données d'essai : numéros et identifiants inventés, qui ne désignent personne ---------- */

const GUILDE = "1350905494600024094";
const discordDe = (i: number) => `20000000000000000${String(i).padStart(2, "0")}`;
const numeroDe = (i: number) => `${String(i).padStart(2, "0")}aa${"0".repeat(12)}`;
const MAINTENANT = "2026-11-14T20:05:00.000Z"; // 21 h 05 à Paris, le soir.

const TENUE_RICHE = { ...TENUE_DE_DEPART, tete: "casque-or", arme: "carnyx", haut: "aucun" };

function gaulois(i: number, plus: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { n: numeroDe(i), discord: discordDe(i), vocal: null, partie_le: null, points: null, tenue: TENUE_DE_DEPART, tente_le: null, besoin: true, ...plus };
}

function travail(lignes: Record<string, unknown>[], plus: Record<string, unknown> = {}): RpcResult {
  return { ok: true, maintenant: MAINTENANT, bulles: true, modele: "claude-haiku-5-5", depense: { mois: "2026-11-01", cout: 0, plafond: 10 }, gaulois: lignes, ...plus };
}

const lu = (r: RpcResult) => lireTravail(r)!;

type Route = { status: number; body?: unknown; headers?: Record<string, string> };
/** Un faux `fetch` : chaque appel prend la réponse suivante de sa file, selon l'adresse. */
function fauxFetch(reponses: (url: string, init: RequestInit | undefined) => Route | "panne") {
  const appels: { url: string; init: RequestInit | undefined }[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    appels.push({ url, init });
    const r = reponses(url, init);
    if (r === "panne") throw new TypeError("fetch failed");
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: r.headers ?? {} });
  }) as typeof fetch;
  return { send, appels };
}

const sansPause = async () => {};

/* ---------- Le moment de la journée ---------- */

describe("le moment de la journée, à Paris", () => {
  // Des heures de Paris : en hiver, UTC + 1 ; en été, UTC + 2.
  const hiver = (heure: string) => new Date(`2026-11-14T${heure}:00+01:00`);
  const ete = (heure: string) => new Date(`2026-07-14T${heure}:00+02:00`);

  it("suit les heures de la règle, en hiver comme en été, avec la nuit de l'écran", () => {
    for (const quand of [hiver, ete]) {
      expect(momentDeLaJournee(quand("06:59"))).toBe("nuit");
      expect(momentDeLaJournee(quand("07:00"))).toBe("matin");
      expect(momentDeLaJournee(quand("11:59"))).toBe("matin");
      expect(momentDeLaJournee(quand("12:00"))).toBe("apres-midi");
      expect(momentDeLaJournee(quand("17:59"))).toBe("apres-midi");
      expect(momentDeLaJournee(quand("18:00"))).toBe("soir");
      expect(momentDeLaJournee(quand("22:59"))).toBe("soir");
      expect(momentDeLaJournee(quand("23:00"))).toBe("nuit");
      expect(momentDeLaJournee(quand("00:00"))).toBe("nuit");
    }
  });

  it("lit l'heure de Paris, pas celle de la machine", () => {
    expect(momentDeLaJournee(new Date("2026-11-14T22:30:00Z"))).toBe("nuit");
    expect(momentDeLaJournee(new Date("2026-07-14T05:30:00Z"))).toBe("matin");
    // Le passage à l'heure d'été (29 mars 2026, 2 h devient 3 h) et à l'heure d'hiver (25 octobre 2026).
    expect(momentDeLaJournee(new Date("2026-03-29T05:30:00Z"))).toBe("matin");
    expect(momentDeLaJournee(new Date("2026-10-25T05:30:00Z"))).toBe("nuit");
  });
});

/* ---------- La liste de travail ---------- */

describe("la liste de travail du serveur", () => {
  it("se lit, ligne par ligne", () => {
    const t = lu(travail([gaulois(1, { vocal: true, partie_le: "2026-11-14T19:50:00+00:00", points: 1.65 }), gaulois(2, { discord: null, besoin: false, tente_le: "2026-11-14T10:00:00+00:00" })]));
    expect(t.bulles).toBe(true);
    expect(t.modele).toBe("claude-haiku-5-5");
    expect(t.maintenant.toISOString()).toBe(MAINTENANT);
    expect(t.gaulois[0]).toMatchObject({ n: numeroDe(1), discord: discordDe(1), vocal: true, partie_le: "2026-11-14T19:50:00+00:00", points: 1.65, besoin: true, tente_le: null });
    expect(t.gaulois[1]).toMatchObject({ discord: null, besoin: false, tente_le: "2026-11-14T10:00:00+00:00" });
  });

  it("saute une ligne illisible et refuse une réponse hors de la forme", () => {
    const t = lu(travail([gaulois(1, { n: "pas-un-numero" }), gaulois(2, { discord: "123", tenue: { peau: "verte" }, points: -1, partie_le: "hier" }), "rien"] as Record<string, unknown>[]));
    expect(t.gaulois).toHaveLength(1);
    expect(t.gaulois[0]).toMatchObject({ discord: null, tenue: null, points: null, partie_le: null });
    expect(lireTravail({ ok: false, error: "forbidden" })).toBeNull();
    expect(lireTravail({ ok: true, gaulois: [] })).toBeNull();
    expect(lireTravail({ ok: true, maintenant: "jamais", gaulois: [] })).toBeNull();
    expect(lu(travail([], { modele: "gpt" })).modele).toBeNull();
    expect(lu(travail([], { bulles: "oui" })).bulles).toBe(false);
  });

  it("ne garde les points que d'une partie datée", () => {
    expect(lu(travail([gaulois(1, { points: 2 })])).gaulois[0]?.points).toBeNull();
  });
});

/* ---------- Le relevé vocal ---------- */

describe("le relevé vocal sur Discord", () => {
  const deps = (send: typeof fetch, horloge: () => number = () => 0) => ({ token: "jeton.du.robot", guildId: GUILDE, fetch: send, sleep: sansPause, horloge });
  const membre = (url: string) => Number(url.split("/").pop()!.slice(-2));

  it("demande l'état vocal de chaque membre lié, un par un, avec le jeton du robot", async () => {
    const { send, appels } = fauxFetch((url) => {
      const i = membre(url);
      if (i === 1) return { status: 200, body: { channel_id: "1350905494600099999", user_id: discordDe(1), guild_id: GUILDE } };
      if (i === 2) return { status: 200, body: { channel_id: null, user_id: discordDe(2) } };
      return { status: 404, body: { message: "Unknown Voice State", code: 10065 } };
    });
    const t = lu(travail([gaulois(1), gaulois(2), gaulois(3, { discord: null }), gaulois(4)]));
    const { releves, arret } = await releverLesVocaux(t.gaulois, deps(send));
    expect(arret).toBeNull();
    expect(releves).toEqual([{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }, { n: numeroDe(4), vocal: false }]);
    expect(appels.map((a) => a.url)).toEqual([1, 2, 4].map((i) => `https://discord.com/api/v10/guilds/${GUILDE}/voice-states/${discordDe(i)}`));
    const entetes = new Headers(appels[0]?.init?.headers);
    expect(entetes.get("authorization")).toBe("Bot jeton.du.robot");
    expect(entetes.get("user-agent")).toMatch(/^DiscordBot \(/);
    expect(appels[0]?.init?.method).toBe("GET");
  });

  it("compte un membre inconnu du serveur comme hors du vocal, mais s'arrête si le serveur est inconnu", async () => {
    const inconnu = fauxFetch(() => ({ status: 404, body: { message: "Unknown Member", code: 10007 } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(inconnu.send))).releves).toEqual([{ n: numeroDe(1), vocal: false }]);
    const serveur = fauxFetch(() => ({ status: 404, body: { message: "Unknown Guild", code: 10004 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(serveur.send));
    expect(r).toEqual({ releves: [], arret: "serveur" });
    expect(serveur.appels).toHaveLength(1);
  });

  it("s'arrête net au premier 401, sans rien noter", async () => {
    const { send, appels } = fauxFetch((url) => (membre(url) === 1 ? { status: 404, body: { code: 10065 } } : { status: 401, body: { message: "401: Unauthorized", code: 0 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2), gaulois(3)])).gaulois, deps(send));
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: "jeton" });
    expect(appels).toHaveLength(2);
  });

  it("s'arrête net au premier 403, en notant ce membre illisible", async () => {
    const { send, appels } = fauxFetch((url) => (membre(url) === 2 ? { status: 403, body: { message: "Missing Permissions", code: 50013 } } : { status: 404, body: { code: 10065 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2), gaulois(3)])).gaulois, deps(send));
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }, { n: numeroDe(2), vocal: null }], arret: "droits" });
    expect(appels).toHaveLength(2);
  });

  it("attend ce que demande un 429 court, une fois, et s'arrête sur un 429 long ou global", async () => {
    let premier = true;
    const court = fauxFetch(() => {
      if (premier) {
        premier = false;
        return { status: 429, body: { message: "You are being rate limited.", retry_after: 0.4, global: false } };
      }
      return { status: 404, body: { code: 10065 } };
    });
    const pauses: number[] = [];
    const r = await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, { ...deps(court.send), sleep: async (ms) => void pauses.push(ms) });
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: null });
    expect(court.appels).toHaveLength(2);
    expect(pauses).toEqual([500]);

    const long = fauxFetch(() => ({ status: 429, body: { retry_after: 64.57, global: false } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(long.send))).toEqual({ releves: [], arret: "limite" });
    expect(long.appels).toHaveLength(1);

    const global = fauxFetch(() => ({ status: 429, body: { retry_after: 0.1, global: true } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(global.send))).arret).toBe("limite");
    expect(global.appels).toHaveLength(1);

    const deuxFois = fauxFetch(() => ({ status: 429, body: { retry_after: 0.1, global: false } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(deuxFois.send))).arret).toBe("limite");
    expect(deuxFois.appels).toHaveLength(2);
  });

  it("attend quand le seau de Discord est vide, et s'arrête s'il faut attendre trop longtemps", async () => {
    const vide = fauxFetch(() => ({ status: 404, body: { code: 10065 }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "1.2" } }));
    const pauses: number[] = [];
    await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, { ...deps(vide.send), sleep: async (ms) => void pauses.push(ms) });
    expect(pauses).toEqual([1200]);
    const tropLong = fauxFetch(() => ({ status: 404, body: { code: 10065 }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "30" } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(tropLong.send))).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: "limite" });
  });

  it("s'arrête sur une panne de Discord ou du réseau", async () => {
    const panne = fauxFetch(() => ({ status: 502, body: null }));
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(panne.send))).toEqual({ releves: [], arret: "discord" });
    const reseau = fauxFetch(() => "panne");
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(reseau.send))).toEqual({ releves: [], arret: "reseau" });
  });

  it("borne le nombre d'appels et le temps du passage, une pause entre deux appels", async () => {
    const { send, appels } = fauxFetch(() => ({ status: 404, body: { code: 10065 } }));
    const pauses: number[] = [];
    const dix = lu(travail(Array.from({ length: 10 }, (_, i) => gaulois(i + 1)))).gaulois;
    const r = await releverLesVocaux(dix, { ...deps(send), sleep: async (ms) => void pauses.push(ms) }, { max: 4, pauseMs: 250, dureeMs: 60_000 });
    expect(r.arret).toBe("nombre");
    expect(r.releves).toHaveLength(4);
    expect(appels).toHaveLength(4);
    expect(pauses).toEqual([250, 250, 250]);
    let t = 0;
    const horloge = () => (t += 15_000);
    const temps = await releverLesVocaux(dix, deps(send, horloge), { max: 80, pauseMs: 0, dureeMs: 40_000 });
    expect(temps.arret).toBe("temps");
    expect(temps.releves.length).toBeLessThan(3);
  });
});

/* ---------- Les faits d'une bulle ---------- */

describe("les faits d'une bulle", () => {
  it("écrivent les points à la française, deux décimales au plus", () => {
    expect(pointsEcrits(1.65)).toBe("1,65");
    expect(pointsEcrits(2)).toBe("2");
    expect(pointsEcrits(1.5)).toBe("1,5");
    expect(pointsEcrits(1.666666)).toBe("1,67");
    expect(pointsEcrits(0)).toBeNull();
    expect(pointsEcrits(-1)).toBeNull();
    expect(pointsEcrits(null)).toBeNull();
    expect(pointsEcrits(0.001)).toBeNull();
  });

  it("nomment les objets portés par le catalogue, sans les cases « rien »", () => {
    expect(objetsPortes(TENUE_DE_DEPART)).toEqual(["Tunique bleue", "Braies à carreaux", "Bottes de cuir", "Gourdin"]);
    expect(objetsPortes(TENUE_RICHE)).toEqual(["Casque d'or", "Braies à carreaux", "Bottes de cuir", "Carnyx d'or"]);
  });

  it("ne disent rien de l'identité du joueur", () => {
    const t = lu(travail([gaulois(1, { partie_le: "2026-11-14T19:40:00+00:00", points: 1.65, tenue: TENUE_RICHE })]));
    const faits = faitsDuGaulois(t.gaulois[0]!, t.maintenant);
    expect(faits).toEqual({ heure: "21 h 05", moment: "soir", lieu: "bataille", points: "1,65", objets: ["Casque d'or", "Braies à carreaux", "Bottes de cuir", "Carnyx d'or"] });
    expect(Object.keys(faits!).sort()).toEqual(["heure", "lieu", "moment", "objets", "points"]);
    expect(JSON.stringify(faits)).not.toContain(discordDe(1));
    expect(JSON.stringify(faits)).not.toContain(numeroDe(1));
  });

  it("choisissent au plus 20 Gaulois qui ont besoin d'une bulle, ceux qui n'en ont jamais eu d'abord", () => {
    const lignes = [
      gaulois(1, { tente_le: "2026-11-14T08:00:00+00:00" }),
      gaulois(2, { besoin: false }),
      gaulois(3, { tenue: { peau: "verte" } }),
      gaulois(4),
      gaulois(5, { tente_le: "2026-11-14T02:00:00+00:00" }),
      ...Array.from({ length: 30 }, (_, i) => gaulois(10 + i)),
    ];
    const t = lu(travail(lignes));
    const lot = choisirLeLot(t.gaulois, t.maintenant);
    expect(lot).toHaveLength(20);
    expect(lot.map((g) => g.g)).toEqual(Array.from({ length: 20 }, (_, i) => `g${i + 1}`));
    expect(lot[0]?.n).toBe(numeroDe(4));
    expect(lot.some((g) => g.n === numeroDe(2) || g.n === numeroDe(3))).toBe(false);
    const petit = choisirLeLot(lu(travail([gaulois(1, { tente_le: "2026-11-14T08:00:00+00:00" }), gaulois(5, { tente_le: "2026-11-14T02:00:00+00:00" })])).gaulois, t.maintenant);
    expect(petit.map((g) => g.n)).toEqual([numeroDe(5), numeroDe(1)]);
  });
});

describe("le lieu des faits, celui de l'écran", () => {
  const nuit = "2026-11-14T23:30:00.000Z"; // 0 h 30 à Paris.

  it("suit la règle de vie.ts : la partie avant le vocal, le vocal avant le sommeil, rien du futur", () => {
    const lieu = (plus: Partial<Record<string, unknown>>, quand = MAINTENANT) => faitsDuGaulois(lu(travail([gaulois(1, plus)], { maintenant: quand })).gaulois[0]!, new Date(quand))?.lieu;
    expect(lieu({ partie_le: "2026-11-14T19:30:00Z", vocal: true })).toBe("bataille");
    expect(lieu({ partie_le: "2026-11-14T18:30:00Z", vocal: true })).toBe("taverne");
    expect(lieu({ partie_le: "2026-11-14T16:00:00Z", vocal: true })).toBe("reunion");
    expect(lieu({ vocal: true }, nuit)).toBe("reunion");
    expect(lieu({}, nuit)).toBe("maisons");
    expect(lieu({})).toBe("place");
    expect(lieu({ partie_le: "2026-11-14T21:00:00Z" })).toBe("place");
  });

  it("n'écrit pas de bulle pour qui dort : l'écran ne la montrerait pas", () => {
    const t = lu(travail([gaulois(1), gaulois(2, { vocal: true }), gaulois(3, { partie_le: "2026-11-14T23:00:00Z", points: 2 })], { maintenant: nuit }));
    const lot = choisirLeLot(t.gaulois, t.maintenant);
    expect(lot.map((g) => [g.n, g.faits.lieu])).toEqual([[numeroDe(2), "reunion"], [numeroDe(3), "bataille"]]);
    expect(lot[0]?.faits.heure).toBe("0 h 30");
  });
});

/* ---------- L'appel à Claude ---------- */

const FAITS: FaitsDuGaulois = { heure: "21 h 05", moment: "soir", lieu: "taverne", points: "1,65", objets: ["Casque d'or", "Gourdin"] };
const LOT = [
  { g: "g1", n: numeroDe(1), faits: FAITS },
  { g: "g2", n: numeroDe(2), faits: { ...FAITS, lieu: "reunion" as const, points: null } },
];

/** Une réponse de l'API Messages, de la forme documentée. */
function reponseClaude(texte: string, plus: Record<string, unknown> = {}) {
  return {
    id: "msg_essai",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: texte }],
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 812, output_tokens: 240, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...plus,
  };
}
const json = (repliques: unknown) => JSON.stringify({ repliques });

describe("la demande à Claude", () => {
  it("ne contient que la consigne et des faits sans identité", () => {
    const corps = corpsDeLaDemande("claude-haiku-5-5", LOT);
    expect(corps).toMatchObject({ model: "claude-haiku-5-5", max_tokens: MAX_TOKENS, system: CONSIGNE, output_config: { effort: "low", format: { type: "json_schema" } } });
    expect(corps).not.toHaveProperty("temperature");
    expect(corps).not.toHaveProperty("thinking");
    const texte = JSON.stringify(corps);
    for (const interdit of [numeroDe(1), numeroDe(2), discordDe(1), "user_id"]) expect(texte).not.toContain(interdit);
    const message = (corps["messages"] as { content: string }[])[0]!.content;
    for (const interdit of ['"n"', '"nom"', "pseudo", "discord"]) expect(message).not.toContain(interdit);
    expect(message).toContain('"g":"g1"');
    expect(message).toContain("à la taverne");
    expect(message).toContain('"points_rapportes_au_clan_par_sa_derniere_partie":"1,65"');
    expect(message).toContain("Casque d'or");
    // Sans points, pas de champ des points.
    expect(message.split('"g":"g2"')[1]).not.toContain("points");
  });

  it("part avec la clé dans l'en-tête et la version de l'API", async () => {
    const { send, appels } = fauxFetch(() => ({ status: 200, body: reponseClaude(json([{ g: "g1", texte: "Une pause à la taverne, ça se mérite !" }])) }));
    const r = await demanderLesBulles("claude-haiku-5-5", LOT, "cle-essai", send);
    expect(appels[0]?.url).toBe(ANTHROPIC_URL);
    const entetes = new Headers(appels[0]?.init?.headers);
    expect(entetes.get("x-api-key")).toBe("cle-essai");
    expect(entetes.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(entetes.get("content-type")).toBe("application/json");
    expect(r.jetons).toEqual({ entree: 812, sortie: 240 });
    expect(r.phrases.get("g1")).toBe("Une pause à la taverne, ça se mérite !");
    expect(r.raison).toBeNull();
  });

  it("lit les jetons, cache compris", () => {
    expect(jetonsDeLaReponse({ usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 3, cache_read_input_tokens: 2 } })).toEqual({ entree: 15, sortie: 5 });
    expect(jetonsDeLaReponse({ usage: { input_tokens: 10, output_tokens: 5 } })).toEqual({ entree: 10, sortie: 5 });
    expect(jetonsDeLaReponse({})).toBeNull();
    expect(jetonsDeLaReponse({ usage: { output_tokens: 5 } })).toBeNull();
  });

  it("ne garde que les phrases des étiquettes demandées, une fois chacune", () => {
    const etiquettes = new Set(["g1", "g2"]);
    const { phrases, raison } = phrasesDeLaReponse(reponseClaude(json([{ g: "g1", texte: "A" }, { g: "g1", texte: "B" }, { g: "g9", texte: "C" }, { g: "g2" }, "rien"])), etiquettes);
    expect(raison).toBeNull();
    expect([...phrases]).toEqual([["g1", "A"], ["g2", undefined]]);
  });

  it("ne tire rien d'un refus, d'une réponse coupée ou d'un JSON mal formé", () => {
    const etiquettes = new Set(["g1"]);
    expect(phrasesDeLaReponse(reponseClaude("", { stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" } }), etiquettes)).toMatchObject({ raison: "le modèle a refusé la demande" });
    expect(phrasesDeLaReponse(reponseClaude('{"repliques": [{"g": "g1", "te', { stop_reason: "max_tokens" }), etiquettes)).toMatchObject({ raison: "réponse coupée" });
    expect(phrasesDeLaReponse(reponseClaude("Voici les bulles !"), etiquettes)).toMatchObject({ raison: "JSON illisible" });
    expect(phrasesDeLaReponse(reponseClaude('{"bulles": []}'), etiquettes)).toMatchObject({ raison: "JSON hors de la forme demandée" });
    expect(phrasesDeLaReponse("rien", etiquettes)).toMatchObject({ raison: "réponse illisible" });
  });

  it("dit pourquoi l'API refuse, sans compter de jetons, et compte au plus haut une réponse perdue", async () => {
    const refus = async (status: number, body: unknown) => demanderLesBulles("claude-haiku-5-5", LOT, "cle", fauxFetch(() => ({ status, body })).send);
    expect(await refus(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })).toMatchObject({ jetons: null, avertir: true, raison: expect.stringContaining("ANTHROPIC_API_KEY") });
    expect(await refus(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } })).toMatchObject({ jetons: null, avertir: false, raison: expect.stringContaining("429") });
    expect(await refus(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } })).toMatchObject({ jetons: null, avertir: false, raison: expect.stringContaining("overloaded_error") });
    expect(await refus(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } })).toMatchObject({ jetons: null, avertir: true, raison: expect.stringContaining("credit balance") });
    const perdue = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", fauxFetch(() => "panne").send);
    expect(perdue.jetons?.sortie).toBe(MAX_TOKENS);
    expect(perdue.jetons!.entree).toBeGreaterThan(1000);
    const sansCompte = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", fauxFetch(() => ({ status: 200, body: { content: [] } })).send);
    expect(sansCompte.jetons?.sortie).toBe(MAX_TOKENS);
  });
});

/* ---------- Le contrôle d'une phrase ---------- */

describe("le contrôle d'une bulle", () => {
  const ok = (texte: unknown, faits = FAITS) => controlerReplique(texte, faits);

  it("accepte une phrase sage, et la nettoie", () => {
    expect(ok("Une pause à la taverne, ça se mérite !")).toEqual({ ok: true, texte: "Une pause à la taverne, ça se mérite !" });
    expect(ok("  « Mon casque d'or brille encore à 21 h 05 ! »  ")).toEqual({ ok: true, texte: "« Mon casque d'or brille encore à 21 h 05 ! »" });
    expect(ok("\"J'ai rapporté 1,65 point au clan, et toc !\"")).toEqual({ ok: true, texte: "J'ai rapporté 1,65 point au clan, et toc !" });
    expect(ok("Déjà 21 h… L’heure d’une chope !")).toEqual({ ok: true, texte: "Déjà 21 h… L’heure d’une chope !" });
    expect(ok("Œuf, pâté, bière : le soir est doux.")).toMatchObject({ ok: true });
  });

  it("refuse une phrase trop longue, vide ou qui n'en est pas une", () => {
    expect(ok("a".repeat(90))).toMatchObject({ ok: true });
    expect(ok("a".repeat(91))).toEqual({ ok: false, raison: "trop longue" });
    expect(ok("   ")).toEqual({ ok: false, raison: "vide" });
    expect(ok(42)).toEqual({ ok: false, raison: "pas une phrase" });
    expect(ok(null)).toEqual({ ok: false, raison: "pas une phrase" });
  });

  it("refuse liens, mentions, balises, émojis et majuscules d'affilée", () => {
    for (const texte of ["Venez sur https://exemple.test", "Salut @everyone !", "Allez #general", "<b>Bonsoir</b>", "Bonsoir 🍺", "Rendez-vous sur exemple.com ce soir", "Vive GAL !", "OUI !", "C'est 50% de bonheur", "a/b", "Prix : 3 $"]) {
      expect(ok(texte).ok, texte).toBe(false);
    }
  });

  it("refuse un chiffre absent des faits, accepte l'heure et les points", () => {
    expect(ok("Déjà 21 h, à la taverne !")).toMatchObject({ ok: true });
    expect(ok("Il est 21 h 5, santé !")).toMatchObject({ ok: true });
    expect(ok("J'ai rapporté 1.65 point !")).toMatchObject({ ok: true });
    expect(ok("J'ai rapporté 2 points !")).toEqual({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("Mes 3 chopes m'attendent.")).toEqual({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("J'ai rapporté 1,65 point !", { ...FAITS, points: null })).toEqual({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("1488")).toEqual({ ok: false, raison: "chiffre absent des faits" });
  });

  it("refuse les mots interdits, Astérix compris", () => {
    for (const texte of ["Une potion et ça repart !", "Ces Romains me fatiguent.", "Ils sont fous, ces voisins !", "Quelle victoire ce soir !", "J'ai gagné ma soirée.", "Par Toutatis !", "Je vais au menhir.", "Quelle merde ce temps.", "Le druide dort.", "Viens sur Discord !"]) {
      expect(ok(texte), texte).toEqual({ ok: false, raison: "mot interdit" });
    }
  });
});

/* ---------- Un passage complet ---------- */

interface FauxServeur {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  appels: { fn: string; args: Record<string, unknown> }[];
}

function fauxServeur(reponses: Record<string, RpcResult[] | ((args: Record<string, unknown>) => RpcResult)>): FauxServeur {
  const appels: FauxServeur["appels"] = [];
  const files = new Map(Object.entries(reponses));
  return {
    appels,
    rpc: async (fn, args) => {
      appels.push({ fn, args });
      const r = files.get(fn);
      if (typeof r === "function") return r(args);
      if (!r || r.length === 0) throw new Error(`appel inattendu : ${fn}`);
      return r.length > 1 ? r.shift()! : r[0]!;
    },
  };
}

const NOTE_OK = (): RpcResult => ({ ok: true, vocaux: 0, repliques: 0, ignores: 0 });

describe("un passage de la vie du village", () => {
  const lignes = [gaulois(1), gaulois(2, { partie_le: "2026-11-14T19:30:00+00:00", points: 1.65 }), gaulois(3, { besoin: false })];

  function monde(claude: (lot: number) => Route | "panne") {
    return fauxFetch((url, init) => {
      if (url.startsWith("https://discord.com/")) return Number(url.slice(-2)) === 1 ? { status: 200, body: { channel_id: "1350905494600099999" } } : { status: 404, body: { code: 10065 } };
      const corps = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      return claude((corps.messages[0]!.content.match(/"g":"g\d+"/g) ?? []).length);
    });
  }

  it("relève les vocaux, relit la liste, demande les bulles, note la dépense puis les bulles", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send, appels } = monde(() => ({ status: 200, body: reponseClaude(json([{ g: "g1", texte: "Le soir tombe, je flâne sur la place." }, { g: "g2", texte: "Une potion !" }])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: { token: "Mzk.jeton-robot-essai.Xyz", guildId: GUILDE }, cleClaude: "cle-secrete", log: (l) => journal.push(l) });
    expect(bilan).toEqual({ vocaux: 3, enVocal: 1, appels: 1, envoyees: 1, ecartees: 1, erreurs: 0 });
    expect(serveur.appels.map((a) => a.fn)).toEqual(["vie_du_village_travail", "noter_vie_du_village", "vie_du_village_travail", "noter_vie_du_village", "noter_vie_du_village"]);
    expect(serveur.appels[1]?.args).toEqual({ p_releve: { vocaux: [{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }, { n: numeroDe(3), vocal: false }] } });
    expect(serveur.appels[3]?.args).toEqual({ p_releve: { depense: { appels: 1, entree: 812, sortie: 240, ecartees: 1 } } });
    const envoi = serveur.appels[4]?.args["p_releve"] as { repliques: { n: string; texte: string; faits: FaitsDuGaulois }[]; sans_bulle: string[] };
    expect(envoi.repliques).toEqual([{ n: numeroDe(1), texte: "Le soir tombe, je flâne sur la place.", faits: { heure: "21 h 05", moment: "soir", lieu: "place", points: null, objets: ["Tunique bleue", "Braies à carreaux", "Bottes de cuir", "Gourdin"] } }]);
    // La phrase écartée : le Gaulois est noté comme demandé, sans bulle, pour ne pas redemander Claude à chaque passage.
    expect(envoi.sans_bulle).toEqual([numeroDe(2)]);
    expect(appels.filter((a) => a.url === ANTHROPIC_URL)).toHaveLength(1);
    // Le journal de l'Action est public : ni identifiant Discord, ni numéro, ni clé, ni jeton.
    const tout = journal.join("\n");
    for (const secret of [discordDe(1), discordDe(2), numeroDe(1), "cle-secrete", "jeton-robot-essai"]) expect(tout).not.toContain(secret);
  });

  it("garde la dépense quand le serveur refuse les bulles", async () => {
    const serveur = fauxServeur({
      vie_du_village_travail: [travail(lignes)],
      noter_vie_du_village: (args) => ("repliques" in (args["p_releve"] as object) ? { ok: false, error: "invalid_releve" } : NOTE_OK()),
    });
    const { send } = monde(() => ({ status: 200, body: reponseClaude(json([{ g: "g1", texte: "Bonsoir la place !" }])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ appels: 1, envoyees: 0, erreurs: 1 });
    expect(serveur.appels.map((a) => Object.keys((a.args["p_releve"] as object | undefined) ?? {})[0] ?? a.fn)).toEqual(["vie_du_village_travail", "depense", "repliques"]);
    expect(journal.some((l) => l.startsWith("::warning::") && l.includes("invalid_releve"))).toBe(true);
  });

  it("fait chaque partie sans l'autre : sans jeton pas de vocal, sans clé pas de bulles", async () => {
    const sansJeton = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const claude = monde(() => ({ status: 200, body: reponseClaude(json([])) }));
    const journal: string[] = [];
    await vieDuVillage({ rpc: sansJeton.rpc, fetch: claude.send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(claude.appels.every((a) => a.url === ANTHROPIC_URL)).toBe(true);
    // La liste n'est pas relue sans relevé vocal.
    expect(sansJeton.appels.filter((a) => a.fn === "vie_du_village_travail")).toHaveLength(1);
    expect(journal.some((l) => l.includes("DISCORD_BOT_TOKEN"))).toBe(true);

    const sansCle = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const discord = monde(() => ({ status: 500 }));
    const bilan = await vieDuVillage({ rpc: sansCle.rpc, fetch: discord.send, sleep: sansPause, discord: { token: "jeton", guildId: GUILDE }, cleClaude: null, log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ vocaux: 3, appels: 0 });
    expect(discord.appels.every((a) => a.url.startsWith("https://discord.com/"))).toBe(true);
    expect(journal.some((l) => l.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("n'appelle pas Claude quand le serveur coupe les bulles ou n'en demande aucune", async () => {
    for (const reponse of [travail(lignes, { bulles: false }), travail(lignes.map((l) => ({ ...l, besoin: false }))), travail(lignes, { modele: null })]) {
      const serveur = fauxServeur({ vie_du_village_travail: [reponse], noter_vie_du_village: NOTE_OK });
      const { send, appels } = monde(() => ({ status: 200, body: reponseClaude(json([])) }));
      const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
      expect(appels).toHaveLength(0);
      expect(bilan.appels).toBe(0);
      expect(serveur.appels.map((a) => a.fn)).toEqual(["vie_du_village_travail"]);
    }
  });

  it("note quand même la dépense d'une réponse refusée ou mal formée, et ses Gaulois comme demandés sans bulle", async () => {
    for (const reponse of [reponseClaude("", { stop_reason: "refusal" }), reponseClaude("pas du JSON"), reponseClaude(json([{ g: "g1", texte: "J'ai rapporté 99 points !" }]))]) {
      const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
      const { send } = monde(() => ({ status: 200, body: reponse }));
      const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
      expect(bilan.envoyees).toBe(0);
      expect(serveur.appels.map((a) => Object.keys((a.args["p_releve"] as object | undefined) ?? {})[0] ?? a.fn)).toEqual(["vie_du_village_travail", "depense", "repliques"]);
      expect(serveur.appels[2]?.args).toEqual({ p_releve: { repliques: [], sans_bulle: [numeroDe(1), numeroDe(2)] } });
    }
  });

  it("ne note aucune dépense quand l'API refuse avant tout calcul", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send } = monde(() => ({ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle-refusee", log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ appels: 1, envoyees: 0, erreurs: 1 });
    expect(serveur.appels.map((a) => a.fn)).toEqual(["vie_du_village_travail"]);
    expect(journal.join("\n")).not.toContain("cle-refusee");
  });

  it("signale un jeton Discord refusé, et continue avec les bulles", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send, appels } = fauxFetch((url) => (url.startsWith("https://discord.com/") ? { status: 401, body: { code: 0 } } : { status: 200, body: reponseClaude(json([])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: { token: "jeton", guildId: GUILDE }, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ vocaux: 0, erreurs: 1, appels: 1 });
    expect(appels.filter((a) => a.url.startsWith("https://discord.com/"))).toHaveLength(1);
    expect(journal.some((l) => l.startsWith("::warning::") && l.includes("401"))).toBe(true);
  });

  it("s'arrête si la liste de travail ne se lit pas", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [{ ok: false, error: "forbidden" }] });
    await expect(vieDuVillage({ rpc: serveur.rpc, fetch: fauxFetch(() => "panne").send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} })).rejects.toThrow("forbidden");
  });
});

/* ---------- La lecture de l'encadrement ---------- */

describe("la lecture de l'encadrement", () => {
  const depense = { mois: "2026-11-01", cout: 0.0123, appels: 12, entree: 24000, sortie: 18000, repliques: 200, ecartees: 3 };
  const reponse = {
    ok: true,
    bulles: true,
    plafond: 10,
    plafond_atteint: false,
    modele: "claude-haiku-5-5",
    prix: { entree: 0.1, sortie: 0.5 },
    mois: "2026-11-01",
    depense,
    historique: [{ ...depense, mois: "2026-10-01" }],
    bulles_affichees: 40,
    dernier_vocal: "2026-11-14T13:55:00+00:00",
    derniere_bulle: null,
  };

  it("lit la réponse du serveur", () => {
    expect(lireVieDuVillage(reponse)).toEqual(reponse);
  });

  it("refuse une réponse hors de la forme attendue", () => {
    expect(lireVieDuVillage({ ok: false, error: "forbidden" })).toBeNull();
    expect(lireVieDuVillage(null)).toBeNull();
    expect(lireVieDuVillage({ ...reponse, plafond: "10" })).toBeNull();
    expect(lireVieDuVillage({ ...reponse, depense: { ...depense, cout: -1 } })).toBeNull();
    expect(lireVieDuVillage({ ...reponse, historique: [{ mois: "2026-10-01" }] })).toBeNull();
    expect(lireVieDuVillage({ ...reponse, prix: null })).toBeNull();
  });

  it("n'accepte un plafond que de 0 à 100 dollars, au centime", () => {
    expect(lirePlafond("10")).toBe(10);
    expect(lirePlafond(" 12,50 ")).toBe(12.5);
    expect(lirePlafond("0")).toBe(0);
    expect(lirePlafond("100")).toBe(100);
    for (const faux of ["", "-1", "100.01", "101", "1.234", "dix", "1e2", "NaN"]) expect(lirePlafond(faux)).toBeNull();
  });
});
