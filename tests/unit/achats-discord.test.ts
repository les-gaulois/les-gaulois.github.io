import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  achatsPass,
  achatsPayload,
  annonceEnMots,
  annoncesDesAchats,
  IMAGES_PAR_PASSAGE,
  lireAchats,
  lireReponseDesAchats,
  mergeAchatsStates,
  NATURES,
  nomAffiche,
  OBJETS_PAR_IMAGE,
  objetDe,
  objetEnMots,
  parseAchatsState,
  sendAchats,
  type AchatDuVillage,
  type AchatsPassDeps,
  type AchatsSendDeps,
  type AchatsSendState,
  type AnnonceDesAchats,
  type EmplacementDObjet,
  type LectureDesAchats,
} from "../../src/lib/achats-discord";
import { achatsCard, achatsImageAlt, COULEURS_RARETE, nomSurLImage, periodeDesAchats, placeDansLaVitrine, renderAchatsCard, RANGEE, SEULE } from "../../src/lib/achats-image";
import { EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, RARETES, vignetteDeLObjet, type Rarete } from "../../src/lib/gaulois";
import { drawnWidth, GazetteFonts, type CardText } from "../../src/lib/gazette-image";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const URL_ESSAI = "https://projet-essai.supabase.co";
const CLE = "sb_secret_essai_0123456789abcdef";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const NOW = new Date("2026-11-14T22:30:00.000Z");

/** Les objets payants du catalogue, avec leur dessin. */
const PAYANTS = EMPLACEMENTS_OBJETS.flatMap((emplacement) =>
  Object.entries(OBJETS[emplacement])
    .filter(([, o]) => !o.gratuit && o.rarete)
    .map(([objet, o]) => ({ emplacement: emplacement as EmplacementDObjet, objet, nom: o.nom, rarete: o.rarete as Rarete, vignette: vignetteDeLObjet(emplacement, objet)! })),
);
const PLUS_HAUT = PAYANTS.reduce((a, b) => (b.vignette.hauteur > a.vignette.hauteur ? b : a));
const PLUS_LARGE = PAYANTS.reduce((a, b) => (b.vignette.largeur > a.vignette.largeur ? b : a));
const PLUS_LONG = PAYANTS.reduce((a, b) => (b.nom.length > a.nom.length ? b : a));
const PLUS_PETIT = PAYANTS.reduce((a, b) => (b.vignette.largeur * b.vignette.hauteur < a.vignette.largeur * a.vignette.hauteur ? b : a));
const PAR_RARETE = ORDRE_RARETES.map((r) => PAYANTS.find((p) => p.rarete === r)!);
const GRATUIT = EMPLACEMENTS_OBJETS.flatMap((e) => Object.entries(OBJETS[e]).filter(([, o]) => o.gratuit).map(([objet]) => ({ emplacement: e, objet })))[0]!;

let numero = 100;
/** Un achat : `minutes` avant maintenant. */
function achat(p: { emplacement: EmplacementDObjet; objet: string }, o: { compte?: number; nom?: string; discord?: string | null; nature?: AchatDuVillage["nature"]; minutes?: number; id?: number } = {}): AchatDuVillage {
  return { id: o.id ?? ++numero, nature: o.nature ?? "achat", emplacement: p.emplacement, objet: p.objet, compte: o.compte ?? 7, nom: o.nom ?? "Brennos", discord: o.discord ?? null, le: new Date(NOW.getTime() - (o.minutes ?? 30) * 60_000).toISOString() };
}
/** Une réponse du serveur, telle que la fonction la rend. */
const ligne = (a: AchatDuVillage) => ({ ...a, le: a.le.replace("Z", "+00:00") });

describe("l'état noté des envois", () => {
  it("se relit, et un état illisible repart comme au premier passage, avec un avertissement", () => {
    const state: AchatsSendState = { depuis: NOW.toISOString(), jusqu_a: 12, envoyes: [14], dernier_envoi: null };
    expect(parseAchatsState(JSON.stringify(state))).toEqual({ state, warning: null });
    expect(parseAchatsState(null)).toEqual({ state: null, warning: null });
    for (const bad of ["{", JSON.stringify({ ...state, jusqu_a: -1 }), JSON.stringify({ ...state, envoyes: ["a"] }), JSON.stringify({ depuis: NOW.toISOString() })]) {
      const read = parseAchatsState(bad);
      expect(read.state).toBeNull();
      expect(read.warning).toContain("rien n'est envoyé pour eux");
    }
  });
});

describe("les deux copies de l'état", () => {
  const A: AchatsSendState = { depuis: "2026-11-15T00:10:00.000Z", jusqu_a: 476, envoyes: [], dernier_envoi: null };
  it("réunies : le numéro le plus avancé, les annonces au-delà, le premier départ, le dernier envoi", () => {
    const enCache: AchatsSendState = { depuis: "2026-11-15T00:10:00.000Z", jusqu_a: 476, envoyes: [480, 478], dernier_envoi: "2026-11-15T01:00:00.000Z" };
    expect(mergeAchatsStates(A, enCache)).toEqual({ ...A, envoyes: [478, 480], dernier_envoi: "2026-11-15T01:00:00.000Z" });
    const plusLoin: AchatsSendState = { depuis: "2026-11-15T02:00:00.000Z", jusqu_a: 479, envoyes: [481], dernier_envoi: "2026-11-15T00:50:00.000Z" };
    expect(mergeAchatsStates(enCache, plusLoin)).toEqual({ depuis: "2026-11-15T00:10:00.000Z", jusqu_a: 479, envoyes: [480, 481], dernier_envoi: "2026-11-15T01:00:00.000Z" });
  });
  it("une seule copie : elle-même ; aucune : null", () => {
    expect(mergeAchatsStates(null, A)).toEqual(A);
    expect(mergeAchatsStates(A, null)).toEqual(A);
    expect(mergeAchatsStates(null, null)).toBeNull();
  });
});

describe("la réponse du serveur", () => {
  it("garde les achats d'objets payants, dans l'ordre, l'heure en ISO, le nom propre", () => {
    const a = achat(PAR_RARETE[0]!, { id: 5 });
    const b = achat(PAR_RARETE[4]!, { id: 4, nature: "pochette", nom: `  Gaulois\nn° 3${String.fromCharCode(0x200b)} ` });
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 9, achats: [ligne(a), ligne(b)] });
    expect(lu).toEqual({ etat: "lu", jusqu_a: 9, inconnus: 0, achats: [{ ...b, nom: "Gaulois n° 3" }, a] });
  });

  it("saute et compte un objet inconnu, gratuit, une place sans objet payant, une ligne mal formée", () => {
    const bon = achat(PAR_RARETE[1]!);
    const mauvais = [
      { ...ligne(bon), objet: "objet-qui-n-existe-pas" },
      { ...ligne(bon), ...GRATUIT },
      { ...ligne(bon), emplacement: "yeux", objet: "vifs" },
      { ...ligne(bon), nature: "gravure" },
      { ...ligne(bon), nom: " \n " },
      { ...ligne(bon), le: "hier" },
      { ...ligne(bon), id: 0 },
      "n'importe quoi",
    ];
    expect(lireReponseDesAchats({ ok: true, jusqu_a: 300, achats: [ligne(bon), ...mauvais] })).toEqual({ etat: "lu", jusqu_a: 300, inconnus: mauvais.length, achats: [bon] });
  });

  it("le nom Discord : remis d'aplomb, sans « @ » ; absent (ancienne fonction), vide, sans lettre ou comme une adresse : null", () => {
    const bon = achat(PAR_RARETE[1]!, { id: 8 });
    const lire = (discord: unknown) => lireReponseDesAchats({ ok: true, jusqu_a: 8, achats: [{ ...ligne(bon), discord }] })!.achats[0]!.discord;
    expect(lire("  Sanglier   Rieur ")).toBe("Sanglier Rieur");
    expect(lire(`Sanglier${String.fromCharCode(0x200b)}Rieur`)).toBe("SanglierRieur");
    expect(lire(String.fromCodePoint(0x1d40f, 0x1d41a, 0x1d42e))).toBe("Pau");
    expect(lire("x".repeat(40))).toBe("x".repeat(32));
    for (const rien of [undefined, null, "", "   ", "!!!", "discord.gg/cadeau", "www.exemple.com", "super-promo.xyz"]) expect(lire(rien)).toBeNull();
    const ancienne = { ...ligne(bon) } as Record<string, unknown>;
    delete ancienne["discord"];
    expect(lireReponseDesAchats({ ok: true, jusqu_a: 8, achats: [ancienne] })!.achats[0]).toEqual({ ...bon, discord: null });
  });

  it("une réponse illisible ou un refus : null", () => {
    for (const bad of [null, "texte", { ok: false, error: "invalid_request" }, { ok: true, achats: [] }, { ok: true, jusqu_a: -2, achats: [] }]) expect(lireReponseDesAchats(bad)).toBeNull();
  });
});

describe("lireAchats", () => {
  const env = { SUPABASE_URL: URL_ESSAI, SUPABASE_SECRET_KEY: CLE };
  const avecCode = (message: string, code: string) => Object.assign(new Error(message), { code });

  it("appelle le serveur avec le numéro demandé", async () => {
    const call = vi.fn(async () => ({ ok: true, jusqu_a: 3, achats: [] }));
    expect(await lireAchats(2, env, call)).toEqual({ etat: "lu", jusqu_a: 3, achats: [], inconnus: 0 });
    expect(call).toHaveBeenCalledWith(URL_ESSAI, CLE, 2);
    await lireAchats(null, env, call);
    expect(call).toHaveBeenLastCalledWith(URL_ESSAI, CLE, null);
  });

  it("sans réglage, ne demande rien", async () => {
    const call = vi.fn();
    expect((await lireAchats(1, {}, call)).etat).toBe("sans-reglage");
    expect(call).not.toHaveBeenCalled();
  });

  it("migration pas encore collée : une note qui la nomme", async () => {
    for (const erreur of [
      avecCode("Could not find the function public.achats_du_village(p_apres) in the schema cache", "PGRST202"),
      avecCode("function public.achats_du_village(bigint) does not exist", "42883"),
      new Error("Could not find the function public.achats_du_village(p_apres) in the schema cache"),
    ]) {
      const lu = await lireAchats(1, env, async () => Promise.reject(erreur));
      expect(lu).toMatchObject({ etat: "fonction-absente" });
      expect(lu.etat !== "lu" && lu.warning).toMatch(/20261114001700/);
    }
  });

  it("une panne ne dit ni la clé ni l'adresse, même si l'erreur les contient ; une réponse illisible est une panne", async () => {
    const lu = await lireAchats(1, env, async () => Promise.reject(avecCode(`refus pour ${CLE} sur ${URL_ESSAI}/rest/v1/rpc (Bearer eyJhbGciOiJIUzI1NiJ9.abc.def)`, "42501")));
    expect(lu.etat).toBe("panne");
    const warning = lu.etat === "lu" ? "" : lu.warning;
    for (const secret of [CLE, URL_ESSAI, "eyJ", "projet-essai"]) expect(warning).not.toContain(secret);
    expect(await lireAchats(1, env, async () => ({ ok: true }))).toMatchObject({ etat: "panne" });
  });
});

describe("le rangement en images", () => {
  it("les achats d'un même Gaulois sur la même image, quatre au plus, dans l'ordre de son premier achat, à son dernier nom", () => {
    const p = PAR_RARETE[0]!;
    const achats = [
      achat(p, { id: 1, compte: 1, nom: "Ancien nom" }),
      achat(p, { id: 2, compte: 2, nom: "Epona" }),
      ...[3, 4, 5, 6, 7].map((id) => achat(p, { id, compte: 1, nom: id === 7 ? "Nouveau nom" : "Ancien nom", discord: id === 7 ? "Nouveau Discord" : "Ancien Discord" })),
    ];
    const annonces = annoncesDesAchats([...achats].reverse());
    expect(annonces.map((a) => [a.nom, a.discord, a.achats.map((x) => x.id)])).toEqual([
      ["Nouveau nom", "Nouveau Discord", [1, 3, 4, 5]],
      ["Nouveau nom", "Nouveau Discord", [6, 7]],
      ["Epona", null, [2]],
    ]);
    expect(annonces.every((a) => a.achats.length <= OBJETS_PAR_IMAGE)).toBe(true);
  });
});

describe("achatsPass", () => {
  const STORED: AchatsSendState = { depuis: "2026-11-14T20:00:00.000Z", jusqu_a: 100, envoyes: [], dernier_envoi: null };
  const setup = (stored: AchatsSendState | null, lecture: LectureDesAchats, answers: boolean[] = []) => {
    const logs: string[] = [];
    const lire = vi.fn(async () => lecture);
    const send = vi.fn<(annonce: AnnonceDesAchats) => Promise<boolean>>(async () => answers.shift() ?? true);
    const deps: AchatsPassDeps = { stored, lire, now: NOW, send, log: (line) => logs.push(line) };
    return { deps, lire, send, logs };
  };
  const lu = (achats: AchatDuVillage[], jusqu_a = Math.max(100, ...achats.map((a) => a.id)), inconnus = 0): LectureDesAchats => ({ etat: "lu", jusqu_a, achats, inconnus });

  it("au premier passage, note le dernier numéro sans rien envoyer", async () => {
    const { deps, lire, send, logs } = setup(null, lu([], 57));
    expect(await achatsPass(deps)).toEqual({ state: { depuis: NOW.toISOString(), jusqu_a: 57, envoyes: [], dernier_envoi: null }, failed: false });
    expect(lire).toHaveBeenCalledWith(null);
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("premier passage");
  });

  it("annonce les nouveaux achats, une image par Gaulois, puis avance jusqu'au dernier numéro lu", async () => {
    const a = achat(PAR_RARETE[0]!, { id: 101, compte: 1, nom: "Brennos" });
    const b = achat(PAR_RARETE[2]!, { id: 103, compte: 2, nom: "Epona", nature: "marche_achat" });
    const c = achat(PAR_RARETE[4]!, { id: 104, compte: 1, nom: "Brennos", nature: "pochette" });
    const { deps, lire, send } = setup(STORED, lu([a, b, c], 106));
    const result = await achatsPass(deps);
    expect(lire).toHaveBeenCalledWith(100);
    expect(send.mock.calls.map((call) => call[0].achats.map((x) => x.id))).toEqual([[101, 104], [103]]);
    expect(result).toEqual({ state: { ...STORED, jusqu_a: 106, envoyes: [], dernier_envoi: NOW.toISOString() }, failed: false });
  });

  it("rien de nouveau : rien à écrire ; des numéros lus sans achat à annoncer : le numéro avance", async () => {
    expect(await achatsPass(setup(STORED, lu([], 100)).deps)).toEqual({ state: null, failed: false });
    expect(await achatsPass(setup(STORED, lu([], 130)).deps)).toEqual({ state: { ...STORED, jusqu_a: 130 }, failed: false });
  });

  it("un envoi refusé arrête le passage : ce qui est parti reste noté, et ne repart pas au suivant", async () => {
    const a = achat(PAR_RARETE[0]!, { id: 101, compte: 1 });
    const b = achat(PAR_RARETE[1]!, { id: 102, compte: 2 });
    const c = achat(PAR_RARETE[2]!, { id: 103, compte: 3 });
    const first = setup(STORED, lu([a, b, c], 103), [true, false]);
    const notes: AchatsSendState[] = [];
    const result = await achatsPass({ ...first.deps, note: (s) => notes.push(s) });
    // Noté aussitôt après l'annonce acceptée : un passage coupé en route garde ce qui est parti.
    expect(notes).toEqual([{ ...STORED, envoyes: [101], dernier_envoi: NOW.toISOString() }]);
    expect(result).toEqual({ state: { ...STORED, jusqu_a: 100, envoyes: [101], dernier_envoi: NOW.toISOString() }, failed: true });
    const next = setup(result.state, lu([a, b, c], 103));
    const after = await achatsPass(next.deps);
    expect(next.send.mock.calls.map((call) => call[0].achats[0]!.id)).toEqual([102, 103]);
    expect(after.state).toEqual({ ...STORED, jusqu_a: 103, envoyes: [], dernier_envoi: NOW.toISOString() });
    // Refusé dès le premier : rien n'a changé, rien à écrire.
    expect(await achatsPass(setup(STORED, lu([a], 101), [false]).deps)).toEqual({ state: null, failed: true });
  });

  it(`${IMAGES_PAR_PASSAGE} images au plus par passage : le reste part au suivant, sans doublon`, async () => {
    const achats = Array.from({ length: IMAGES_PAR_PASSAGE + 2 }, (_, i) => achat(PAR_RARETE[i % 5]!, { id: 101 + i, compte: i }));
    const first = setup(STORED, lu(achats));
    const result = await achatsPass(first.deps);
    expect(first.send).toHaveBeenCalledTimes(IMAGES_PAR_PASSAGE);
    expect(result.state).toMatchObject({ jusqu_a: 100, envoyes: achats.slice(0, IMAGES_PAR_PASSAGE).map((a) => a.id) });
    expect(first.logs.join(" ")).toContain("2 images partiront au prochain passage");
    const next = setup(result.state, lu(achats));
    const after = await achatsPass(next.deps);
    expect(next.send.mock.calls.map((call) => call[0].achats[0]!.id)).toEqual(achats.slice(IMAGES_PAR_PASSAGE).map((a) => a.id));
    expect(after.state).toMatchObject({ jusqu_a: achats.at(-1)!.id, envoyes: [] });
  });

  it("un achat de plus de 48 heures n'est plus annoncé, mais le numéro avance", async () => {
    const vieux = achat(PAR_RARETE[0]!, { id: 101, minutes: 49 * 60 });
    const { deps, send, logs } = setup(STORED, lu([vieux]));
    expect(await achatsPass(deps)).toEqual({ state: { ...STORED, jusqu_a: 101 }, failed: false });
    expect(send).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("1 achat de plus de 48 heures, non annoncé");
  });

  it("un objet que ce code ne sait pas dessiner : un avertissement, et le numéro avance", async () => {
    const { deps, logs } = setup(STORED, lu([], 104, 2));
    expect(await achatsPass(deps)).toEqual({ state: { ...STORED, jusqu_a: 104 }, failed: false });
    expect(logs.join(" ")).toContain("::warning::Achats du village : 2 achats d'objets que ce code ne sait pas dessiner");
  });

  it("sans réglage ou sans migration : une note, rien d'écrit ; une panne : un avertissement, à retenter", async () => {
    for (const etat of ["sans-reglage", "fonction-absente"] as const) {
      const { deps, send, logs } = setup(STORED, { etat, warning: "raison" });
      expect(await achatsPass(deps)).toEqual({ state: null, failed: false });
      expect(send).not.toHaveBeenCalled();
      expect(logs).toEqual(["::notice::Achats du village : raison."]);
    }
    const panne = setup(null, { etat: "panne", warning: "raison" });
    expect(await achatsPass(panne.deps)).toEqual({ state: null, failed: true });
    expect(panne.logs).toEqual(["::warning::Achats du village : raison."]);
  });
});

const ANNONCE: AnnonceDesAchats = {
  nom: "Brennos",
  discord: null,
  achats: [
    { id: 201, nature: "achat", emplacement: PAR_RARETE[4]!.emplacement, objet: PAR_RARETE[4]!.objet, compte: 7, nom: "Brennos", discord: null, le: "2026-11-14T21:15:00.000Z" },
    { id: 202, nature: "pochette", emplacement: PAR_RARETE[0]!.emplacement, objet: PAR_RARETE[0]!.objet, compte: 7, nom: "Brennos", discord: null, le: "2026-11-14T22:02:00.000Z" },
  ],
};

describe("le message", () => {
  it("dit le Gaulois, chaque objet, sa rareté, d'où il vient et son heure, et ce qui l'a payé ; jamais un montant", () => {
    const [legendaire, commun] = [PAR_RARETE[4]!, PAR_RARETE[0]!];
    const mots = annonceEnMots(ANNONCE).map(plain);
    expect(mots[0]).toBe("Brennos habille son Gaulois : 2 nouveaux objets.");
    expect(mots[1]).toBe(`${legendaire.nom} (${OBJETS_LABEL(legendaire.emplacement)}, rareté légendaire) : à la boutique, le 14 novembre 2026 à 22 h 15.`);
    expect(mots[2]).toBe(`${commun.nom} (${OBJETS_LABEL(commun.emplacement)}, rareté commune) : dans une pochette surprise, le 14 novembre 2026 à 23 h 02.`);
    expect(mots[3]).toBe("Payé en statères, qui viennent des points rapportés au clan.");
    expect(annonceEnMots({ nom: "B", discord: null, achats: [{ ...ANNONCE.achats[0]!, nature: "marche_achat" }] }).map(plain)).toEqual([
      "B habille son Gaulois : 1 nouvel objet.",
      expect.stringContaining(" : au marché, le 14 novembre 2026"),
      "Payé en statères, qui viennent des points rapportés au clan.",
    ]);
    expect(mots.join(" ")).not.toMatch(/\d+ statères/);
  });

  it("avec un nom Discord : « @ » et ce nom, à la place du nom de secours", () => {
    const avecDiscord = { ...ANNONCE, discord: "Sanglier Rieur" };
    expect(nomAffiche(avecDiscord)).toBe("@Sanglier Rieur");
    expect(nomAffiche(ANNONCE)).toBe("Brennos");
    expect(annonceEnMots(avecDiscord)[0]).toBe("@Sanglier Rieur habille son Gaulois : 2 nouveaux objets.");
    expect(plain(String(achatsPayload(avecDiscord, SITE, null)["content"])).split("\n")[0]).toBe("**\\@Sanglier Rieur** habille son Gaulois : 2 nouveaux objets");
  });

  it("avec l'image : l'image et un bouton vers « Mon Gaulois », sans texte", () => {
    expect(achatsPayload(ANNONCE, SITE, { alt: "Description.", filename: "achats-201.png" })).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "achats-201.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Habiller mon Gaulois", url: "https://x.test/village" }] }],
    });
  });

  it("en secours, un texte qui ne mentionne personne et n'interprète pas le nom", () => {
    const payload = achatsPayload({ ...ANNONCE, nom: "@everyone **gras**" }, SITE, null);
    const lignes = plain(String(payload["content"])).split("\n");
    expect(lignes[0]).toBe("**\\@everyone \\*\\*gras\\*\\*** habille son Gaulois : 2 nouveaux objets");
    expect(lignes).toHaveLength(5);
    expect(lignes[3]).toBe("[Habiller son Gaulois sur le site](<https://x.test/village>)");
    expect(lignes[4]).toBe("-# Payé en statères, qui viennent des points rapportés au clan.");
    expect(payload).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(payload).not.toHaveProperty("components");
  });

  it("part en un seul envoi avec l'image ; en texte si l'image ne se dessine pas ; le lien n'est écrit nulle part", async () => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const deps: AchatsSendDeps = { link: WEBHOOK, annonce: ANNONCE, renderImage: async () => ({ png: Uint8Array.of(137, 80, 78, 71), alt: "Description." }), siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (line) => logs.push(line) };
    expect(await sendAchats(deps)).toBe(true);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(init.redirect).toBe("error");
    const sent = JSON.parse(String((init.body as FormData).get("payload_json")));
    expect(sent).toMatchObject({ attachments: [{ filename: "achats-201.png" }] });
    expect(sent).not.toHaveProperty("content");

    const text = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await sendAchats({ ...deps, fetch: text as unknown as typeof fetch, renderImage: async () => Promise.reject(new Error("dessin impossible")) })).toBe(true);
    expect((text.mock.calls[0] as unknown as [string])[0]).toBe(WEBHOOK);
    expect(logs.join(" ")).toContain("Achats du village : image impossible à dessiner");

    const down = vi.fn(async () => new Response("panne", { status: 503 }));
    expect(await sendAchats({ ...deps, fetch: down as unknown as typeof fetch })).toBe(false);
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

/** Le nom d'une place, en minuscules, comme dans les phrases. */
function OBJETS_LABEL(emplacement: EmplacementDObjet): string {
  return ({ tete: "tête", haut: "haut", bas: "bas", pieds: "pieds", arme: "arme" } as const)[emplacement];
}

describe("l'image des achats", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const plainText = (t: CardText) => t.text.replace(NUMBER_SPACES, " ");
  const annonceDe = (objets: readonly { emplacement: EmplacementDObjet; objet: string }[], nom = "Brennos", jours = false, discord: string | null = null): AnnonceDesAchats => ({
    nom,
    discord,
    achats: objets.map((p, i) => ({ id: 300 + i, nature: NATURES[i % 3]!, emplacement: p.emplacement, objet: p.objet, compte: 7, nom, discord, le: new Date(Date.parse("2026-11-14T21:05:00.000Z") + i * (jours ? 86_400_000 : 600_000)).toISOString() })),
  });
  const cas: [string, AnnonceDesAchats][] = [
    ...[PLUS_HAUT, PLUS_LARGE, PLUS_LONG, PLUS_PETIT, ...PAR_RARETE].map((p): [string, AnnonceDesAchats] => [`seul : ${p.emplacement}/${p.objet}`, annonceDe([p])]),
    ["deux", annonceDe([PLUS_HAUT, PLUS_LARGE])],
    ["trois, sur trois jours", annonceDe([PLUS_LONG, PLUS_HAUT, PLUS_PETIT], "Gaulois n° 1234", true)],
    ["quatre", annonceDe([PLUS_LONG, PLUS_LARGE, PLUS_HAUT, PAR_RARETE[4]!])],
    ["quatre, nom très long", annonceDe(PAR_RARETE.slice(0, 4), "Un pseudo vraiment très très long pour voir")],
    ["seul, nom Discord le plus large", annonceDe([PLUS_LARGE], "Brennos", false, "W".repeat(32))],
    ["quatre, nom Discord le plus large", annonceDe(PAR_RARETE.slice(0, 4), "Brennos", false, "W".repeat(32))],
  ];
  const draws = (char: string) => fonts.draws(char, "strong");
  const cards = cas.map(([id, annonce]) => ({ id, annonce, card: achatsCard(annonce, annonce.achats.map((a) => vignetteDeLObjet(a.emplacement, a.objet)), SITE, fonts.width, draws) }));
  const bords = (t: CardText) => {
    const width = drawnWidth(t, fonts.width);
    const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
    return { left, right: left + width };
  };

  it("est assez large pour que Discord la montre en grand", () => {
    for (const { id, card } of cards) expect(card.width / card.height, id).toBeGreaterThanOrEqual(1.55);
  });

  it("aucun texte n'est coupé ni ne sort de l'image", () => {
    for (const { id, card } of cards) {
      for (const t of card.texts) {
        expect(plainText(t).endsWith("…"), `${id} : ${t.text}`).toBe(false);
        const { left, right } = bords(t);
        expect(left, `${id} : ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(right, `${id} : ${t.text}`).toBeLessThanOrEqual(card.width + 0.5);
        expect(t.y, `${id} : ${t.text}`).toBeLessThanOrEqual(card.height - 8);
      }
    }
  });

  it("chaque objet tient dans sa vitrine, à des cases entières d'au moins 3 pixels, sans toucher aucun texte", () => {
    for (const { id, card, annonce } of cards) {
      expect(card.dessins, id).toHaveLength(annonce.achats.length);
      const vitrines = card.rects.filter((r) => r.cut === 18);
      expect(vitrines, id).toHaveLength(annonce.achats.length);
      card.dessins.forEach((d, i) => {
        const v = vitrines[i]!;
        expect(Number.isInteger(d.echelle) && d.echelle >= 3, `${id} : ${d.echelle}`).toBe(true);
        expect(d.x, id).toBeGreaterThanOrEqual(v.x);
        expect(d.y, id).toBeGreaterThanOrEqual(v.y);
        expect(d.x + d.decor.largeur * d.echelle, id).toBeLessThanOrEqual(v.x + v.width);
        expect(d.y + d.decor.hauteur * d.echelle, id).toBeLessThanOrEqual(v.y + v.height);
        expect(v.stroke, id).toBe(COULEURS_RARETE[objetDe(annonce.achats[i]!)!.rarete].bord);
      });
      for (const v of vitrines) {
        for (const t of card.texts) {
          const { left, right } = bords(t);
          const dedans = t.y > v.y && t.y - t.size * 0.8 < v.y + v.height && right > v.x && left < v.x + v.width;
          expect(dedans, `${id} : ${t.text}`).toBe(false);
        }
      }
      // Les textes sous des vitrines côte à côte restent dans leur colonne.
      if (vitrines.length > 1) {
        for (const t of card.texts.filter((t) => t.y > vitrines[0]!.y + vitrines[0]!.height && t.y < card.height - 40)) {
          const v = vitrines.find((v) => t.x >= v.x && t.x < v.x + v.width)!;
          expect(v, `${id} : ${t.text}`).toBeDefined();
          expect(bords(t).right, `${id} : ${t.text}`).toBeLessThanOrEqual(v.x + v.width + 0.5);
        }
      }
    }
  });

  it("la rareté se lit aussi à la forme : autant de carrés pleins que son rang, sur cinq, dans le coin de chaque vitrine", () => {
    for (const { id, card, annonce } of cards) {
      const vitrines = card.rects.filter((r) => r.cut === 18);
      vitrines.forEach((v, i) => {
        const rarete = objetDe(annonce.achats[i]!)!.rarete;
        const coin = card.rects.filter((r) => r !== v && r.x >= v.x && r.x + r.width <= v.x + v.width / 2 && r.y >= v.y && r.y + r.height <= v.y + 24 && r.width === r.height);
        expect(coin, id).toHaveLength(5);
        expect(coin.filter((r) => !r.stroke && r.color === COULEURS_RARETE[rarete].bord), id).toHaveLength(RARETES[rarete].rang);
      });
    }
  });

  it("la vitrine d'un objet seul est à droite ; plusieurs vitrines sont côte à côte, de la même taille", () => {
    const seul = cards.find((c) => c.annonce.achats.length === 1)!.card;
    const [v] = seul.rects.filter((r) => r.cut === 18);
    expect(v!.width).toBe(SEULE.width);
    expect(v!.x + v!.width).toBe(seul.width - 36);
    const quatre = cards.find((c) => c.id === "quatre")!.card.rects.filter((r) => r.cut === 18);
    expect(new Set(quatre.map((r) => r.width)).size).toBe(1);
    expect(new Set(quatre.map((r) => r.y)).size).toBe(1);
    expect(quatre[0]!.height).toBe(RANGEE.height);
    expect(placeDansLaVitrine(null, { x: 0, y: 0, width: 100, height: 100 }, 8)).toBeNull();
  });

  it("dit le nom du Gaulois, l'objet, sa rareté en toutes lettres, d'où il vient et quand, sans montant", () => {
    const { card, annonce } = cards.find((c) => c.id === "quatre")!;
    const textes = card.texts.map(plainText);
    expect(textes).toContain("Brennos");
    expect(textes).toContain("4 nouveaux objets pour son Gaulois");
    expect(textes).toContain("Le 14 novembre 2026, de 22 h 05 à 22 h 35");
    for (const a of annonce.achats) expect(textes).toContain(objetDe(a)!.nom);
    expect(textes).toContain("Boutique, 22 h 05");
    expect(textes).toContain("Pochette surprise, 22 h 15");
    expect(textes).toContain("Marché, 22 h 25");
    expect(textes.some((t) => t.startsWith("Légendaire, "))).toBe(true);
    expect(textes).toContain("Payé en statères, qui viennent des points rapportés au clan.");
    expect(textes.join(" ")).not.toMatch(/\d+ statères/);
    const seul = cards.find((c) => c.annonce.achats.length === 1)!.card.texts.map(plainText);
    expect(seul).toContain("Nouvel objet pour son Gaulois");
    expect(seul).toContain("Boutique");
  });

  it("le titre : « @ » et le nom Discord, sans ce que la police ne dessine pas ; sinon le nom de secours", () => {
    const sanglier = String.fromCodePoint(0x1f417);
    expect(nomSurLImage({ nom: "Brennos", discord: `Sanglier ${sanglier} Rieur` }, draws)).toBe("@Sanglier Rieur");
    expect(nomSurLImage({ nom: "Brennos", discord: `${sanglier}${sanglier}` }, draws)).toBe("Brennos");
    expect(nomSurLImage({ nom: "Gaulois n° 12", discord: null }, draws)).toBe("Gaulois n° 12");
    const card = achatsCard(annonceDe([PAR_RARETE[0]!], "Brennos", false, "Sanglier Rieur"), [vignetteDeLObjet(PAR_RARETE[0]!.emplacement, PAR_RARETE[0]!.objet)], SITE, fonts.width, draws);
    expect(card.texts.map(plainText)).toContain("@Sanglier Rieur");
    expect(card.texts.map(plainText)).not.toContain("Brennos");
  });

  it("la période : une heure, deux heures du même jour, ou deux jours", () => {
    const a = (le: string) => ({ ...ANNONCE.achats[0]!, le });
    expect(plain(periodeDesAchats([a("2026-11-14T21:15:00.000Z")]))).toBe("Le 14 novembre 2026 à 22 h 15");
    expect(plain(periodeDesAchats([a("2026-11-14T21:15:00.000Z"), a("2026-11-14T21:15:30.000Z")]))).toBe("Le 14 novembre 2026 à 22 h 15");
    expect(plain(periodeDesAchats([a("2026-11-14T21:15:00.000Z"), a("2026-11-14T22:40:00.000Z")]))).toBe("Le 14 novembre 2026, de 22 h 15 à 23 h 40");
    expect(plain(periodeDesAchats([a("2026-11-14T22:50:00.000Z"), a("2026-11-14T23:10:00.000Z")]))).toBe("Du 14 novembre 2026, 23 h 50, au 15 novembre 2026, 0 h 10");
  });

  it("sa description dit tout ce que montre l'image", () => {
    const alt = plain(achatsImageAlt(ANNONCE));
    for (const words of ["Brennos habille son Gaulois : 2 nouveaux objets.", objetEnMots(ANNONCE.achats[0]!), "à la boutique", "dans une pochette surprise", "22 h 15", "23 h 02", "Payé en statères"]) expect(alt).toContain(plain(words));
  });

  it("se dessine, chaque objet posé sans lissage", async () => {
    const { card } = cards.find((c) => c.id === "deux")!;
    const png = await renderAchatsCard(card, fonts, root);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([card.width, card.height]);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    for (const d of card.dessins) {
      const index = d.decor.cases.findIndex((c) => c !== null);
      const cx = d.x + (index % d.decor.largeur) * d.echelle;
      const cy = d.y + Math.floor(index / d.decor.largeur) * d.echelle;
      const hex = d.decor.cases[index]!;
      const expected = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
      expect(pixel(cx, cy)).toEqual(expected);
      expect(pixel(cx + d.echelle - 1, cy + d.echelle - 1)).toEqual(expected);
    }
  });
});

describe("la migration", () => {
  const sql = readFileSync("supabase/migrations/20261114001700_village_achats_sur_discord.sql", "utf8");

  it("est réservée à la clé de service", () => {
    expect(sql).toContain("revoke all on function public.achats_du_village(bigint) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.achats_du_village(bigint) to service_role;");
    expect(sql).not.toMatch(/grant execute on function public\.achats_du_village\(bigint\) to (anon|authenticated)/);
  });

  it("lit les natures que le robot connaît, et seulement les comptes validés, sans montant", () => {
    const natures = [...sql.matchAll(/m\.nature in \(([^)]*)\)/g)].map((m) => m[1]);
    expect(natures.length).toBeGreaterThanOrEqual(2);
    for (const liste of natures) expect(liste).toBe(NATURES.map((n) => `'${n}'`).join(", "));
    expect(sql).toContain("p.status = 'validated'");
    expect(sql).not.toMatch(/'(montant|solde|prix)'/);
    expect(sql).not.toMatch(/\b(drop|truncate|delete|update|insert)\b/i);
  });
});

describe("la migration du nom Discord", () => {
  const sql = readFileSync("supabase/migrations/20261115000100_achats_nom_discord.sql", "utf8");
  const code = sql.replace(/^\s*--.*$/gm, "");

  it("garde les droits : la clé de service seulement", () => {
    expect(sql).toContain("revoke all on function public.achats_du_village(bigint) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.achats_du_village(bigint) to service_role;");
    expect(sql).not.toMatch(/grant execute on function public\.achats_du_village\(bigint\) to (anon|authenticated)/);
  });

  it("lit le nom Discord gardé par le serveur, jamais ce que le navigateur écrit ; ni identifiant, ni montant", () => {
    expect(code).toContain("'discord', nullif(btrim(pl.discord_name), '')");
    expect(code).not.toMatch(/raw_user_meta_data|discord_id|'(montant|solde|prix)'/);
    expect(code).toContain("p.status = 'validated'");
    for (const liste of [...code.matchAll(/m\.nature in \(([^)]*)\)/g)].map((m) => m[1])) expect(liste).toBe(NATURES.map((n) => `'${n}'`).join(", "));
    expect(code).not.toMatch(/\b(drop|truncate|delete|update|insert)\b/i);
  });
});
