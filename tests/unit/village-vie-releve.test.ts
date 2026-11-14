import { describe, expect, it } from "vitest";
import type { RpcResult } from "../../src/lib/compte/roster";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { CONSIGNE } from "../../src/lib/village/consigne-repliques";
import {
  ADMINISTRATEUR,
  ANTHROPIC_BASE_URL,
  LIEUX_DES_BULLES,
  MAX_TOKENS,
  POINTS_DANS_LES_BULLES_MS,
  SE_CONNECTER,
  VOIR_LE_SALON,
  choisirLeLot,
  controlerReplique,
  corpsDeLaDemande,
  demanderLesBulles,
  faitsDuGaulois,
  jetonsDeLaReponse,
  lieuDUneBulle,
  lirePlafond,
  lireTravail,
  lireVieDuVillage,
  momentDeLaJournee,
  nombreExact,
  objetsPortes,
  permissionsDeTous,
  permissionsDeTousDansLeSalon,
  phrasesDeLaReponse,
  pointsEcrits,
  releverLesVocaux,
  salonsVocauxPublics,
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
    // Comme Discord et l'API de Claude : un corps JSON dit son type, que le SDK lit pour décoder la réponse.
    const type: Record<string, string> = r.body === undefined ? {} : { "content-type": "application/json" };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: { ...type, ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return { send, appels };
}

const sansPause = async () => {};

/** L'adresse où le SDK envoie la demande à Claude. */
const URL_CLAUDE = `${ANTHROPIC_BASE_URL}/v1/messages`;
/** Le rôle @everyone du serveur d'essai, et ses permissions au niveau du serveur : voir les salons et s'y connecter. */
const URL_ROLE = `https://discord.com/api/v10/guilds/${GUILDE}/roles/${GUILDE}`;
const roleDeTous = (permissions: bigint) => ({ id: GUILDE, name: "@everyone", permissions: String(permissions) });
const TOUS_ENTRENT = VOIR_LE_SALON | SE_CONNECTER | (1n << 11n);

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
  /** Les salons du serveur d'essai : un vocal public, un vocal privé (refusé à @everyone), une scène publique, un salon écrit. */
  const PUBLIC = "1350905494600099999";
  const PRIVE = "1350905494600088888";
  const SCENE = "1350905494600077777";
  const SALONS = [
    { id: PUBLIC, type: 2, permission_overwrites: [] },
    { id: PRIVE, type: 2, permission_overwrites: [{ id: GUILDE, type: 0, allow: "0", deny: String(1n << 10n) }] },
    { id: SCENE, type: 13, permission_overwrites: [{ id: "999", type: 0, allow: "0", deny: String(1n << 10n) }] },
    { id: "1350905494600066666", type: 0, permission_overwrites: [] },
  ];
  const URL_SALONS = `https://discord.com/api/v10/guilds/${GUILDE}/channels`;
  const estListe = (url: string) => url === URL_SALONS || url === URL_ROLE;
  /** Le faux Discord : le rôle @everyone (`role`) et la liste des salons (`salons`), puis les états vocaux selon `voix`. */
  const fauxDiscord = (voix: (url: string) => Route | "panne", salons: unknown = SALONS, role: unknown = roleDeTous(TOUS_ENTRENT)) =>
    fauxFetch((url) => (url === URL_ROLE ? { status: 200, body: role } : url === URL_SALONS ? { status: 200, body: salons } : voix(url)));
  /** Les appels des états vocaux, sans ceux du rôle et de la liste des salons. */
  const vocaux = (appels: { url: string }[]) => appels.filter((a) => !estListe(a.url));

  it("lit d'abord le rôle @everyone et les salons, une fois, puis l'état vocal de chaque membre lié, un par un, avec le jeton du robot", async () => {
    const { send, appels } = fauxDiscord((url) => {
      const i = membre(url);
      if (i === 1) return { status: 200, body: { channel_id: PUBLIC, user_id: discordDe(1), guild_id: GUILDE } };
      if (i === 2) return { status: 200, body: { channel_id: null, user_id: discordDe(2) } };
      return { status: 404, body: { message: "Unknown Voice State", code: 10065 } };
    });
    const t = lu(travail([gaulois(1), gaulois(2), gaulois(3, { discord: null }), gaulois(4)]));
    const { releves, arret } = await releverLesVocaux(t.gaulois, deps(send));
    expect(arret).toBeNull();
    expect(releves).toEqual([{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }, { n: numeroDe(4), vocal: false }]);
    expect(appels.map((a) => a.url)).toEqual([URL_ROLE, URL_SALONS, ...[1, 2, 4].map((i) => `https://discord.com/api/v10/guilds/${GUILDE}/voice-states/${discordDe(i)}`)]);
    for (const appel of appels) {
      const entetes = new Headers(appel.init?.headers);
      expect(entetes.get("authorization")).toBe("Bot jeton.du.robot");
      expect(entetes.get("user-agent")).toMatch(/^DiscordBot \(/);
      expect(appel.init?.method).toBe("GET");
    }
  });

  it("ne compte « en vocal » qu'un salon vocal public : un salon privé ou inconnu compte comme hors du vocal", async () => {
    const salonDe: Record<number, string> = { 1: PRIVE, 2: SCENE, 3: "1350905494600055555", 4: PUBLIC };
    const { send } = fauxDiscord((url) => ({ status: 200, body: { channel_id: salonDe[membre(url)], user_id: "x" } }));
    const t = lu(travail([gaulois(1), gaulois(2), gaulois(3), gaulois(4)]));
    expect((await releverLesVocaux(t.gaulois, deps(send))).releves).toEqual([
      { n: numeroDe(1), vocal: false },
      { n: numeroDe(2), vocal: true },
      { n: numeroDe(3), vocal: false },
      { n: numeroDe(4), vocal: true },
    ]);
  });

  it("lit, par Discord, les droits de @everyone au niveau du serveur avant de dire qu'un salon est public", async () => {
    const salonDe: Record<number, string> = { 1: PUBLIC, 2: SCENE };
    const voix = (url: string): Route => ({ status: 200, body: { channel_id: salonDe[membre(url)] } });
    const t = lu(travail([gaulois(1), gaulois(2)])).gaulois;
    // @everyone ne voit pas les salons, ou ne s'y connecte pas, au niveau du serveur : aucun salon sans réglage n'est public.
    for (const base of [SE_CONNECTER, VOIR_LE_SALON, 0n]) {
      const { send } = fauxDiscord(voix, SALONS, roleDeTous(base));
      expect((await releverLesVocaux(t, deps(send))).releves, String(base)).toEqual([{ n: numeroDe(1), vocal: false }, { n: numeroDe(2), vocal: false }]);
    }
    // Le salon rend à @everyone ce que le serveur lui refuse : public.
    const rendu = [{ id: PUBLIC, type: 2, permission_overwrites: [{ id: GUILDE, type: 0, allow: String(VOIR_LE_SALON), deny: "0" }] }];
    expect((await releverLesVocaux(t, deps(fauxDiscord(voix, rendu, roleDeTous(SE_CONNECTER)).send))).releves).toEqual([{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }]);
    // Une catégorie cachée à @everyone : son salon ne compte pas.
    const range = [{ id: "1350905494600011111", type: 4, permission_overwrites: [{ id: GUILDE, type: 0, allow: "0", deny: String(VOIR_LE_SALON) }] }, { id: PUBLIC, type: 2, parent_id: "1350905494600011111", permission_overwrites: [] }];
    expect((await releverLesVocaux(t, deps(fauxDiscord(voix, range).send))).releves).toEqual([{ n: numeroDe(1), vocal: false }, { n: numeroDe(2), vocal: false }]);
    // ADMINISTRATOR pour @everyone : tout salon vocal est ouvert à tous, même avec un refus.
    expect((await releverLesVocaux(t, deps(fauxDiscord(voix, SALONS, roleDeTous(ADMINISTRATEUR)).send))).releves).toEqual([{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: true }]);
  });

  it("ne relève rien si la liste des salons ou les droits de @everyone ne se lisent pas, et ne demande alors aucun état vocal", async () => {
    for (const reponse of [{ status: 500, body: null }, { status: 200, body: { salons: [] } }, { status: 403, body: { code: 50013 } }]) {
      // La liste des salons illisible, puis le rôle @everyone illisible.
      for (const casse of [URL_SALONS, URL_ROLE]) {
        const { send, appels } = fauxFetch((url) => (url === casse ? reponse : url === URL_ROLE ? { status: 200, body: roleDeTous(TOUS_ENTRENT) } : url === URL_SALONS ? { status: 200, body: SALONS } : { status: 200, body: { channel_id: PUBLIC } }));
        expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(send))).toEqual({ releves: [], arret: "salons" });
        expect(vocaux(appels)).toHaveLength(0);
      }
    }
    // Un rôle qui n'est pas @everyone, ou des permissions qui ne sont pas un nombre : aucun relevé.
    for (const role of [{ id: "42", permissions: String(TOUS_ENTRENT) }, { id: GUILDE, permissions: "beaucoup" }, { id: GUILDE, permissions: Number(TOUS_ENTRENT) }, { id: GUILDE }, null]) {
      const { send, appels } = fauxDiscord(() => ({ status: 200, body: { channel_id: PUBLIC } }), SALONS, role);
      expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(send))).toEqual({ releves: [], arret: "salons" });
      expect(vocaux(appels)).toHaveLength(0);
    }
    const jeton = fauxFetch(() => ({ status: 401, body: { code: 0 } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(jeton.send))).toEqual({ releves: [], arret: "jeton" });
    const serveur = fauxFetch(() => ({ status: 404, body: { code: 10004 } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(serveur.send))).toEqual({ releves: [], arret: "serveur" });
    const reseau = fauxFetch(() => "panne");
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(reseau.send))).toEqual({ releves: [], arret: "reseau" });
    // Personne à relever : pas même la liste des salons.
    const personne = fauxDiscord(() => ({ status: 404, body: { code: 10065 } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1, { discord: null })])).gaulois, deps(personne.send))).toEqual({ releves: [], arret: null });
    expect(personne.appels).toHaveLength(0);
  });

  it("lit les salons publics : vocal ou scène, sans refus de voir ni de se connecter pour @everyone", () => {
    const voir = String(1n << 10n);
    const connecter = String(1n << 20n);
    const salon = (id: string, type: number, deny: string | null, autre = false) => ({ id, type, permission_overwrites: deny === null ? [] : [{ id: autre ? "42" : GUILDE, type: 0, allow: "0", deny }] });
    const publics = salonsVocauxPublics(
      [salon("a", 2, null), salon("b", 2, voir), salon("c", 2, connecter), salon("d", 13, "0"), salon("e", 2, voir, true), salon("f", 0, null), salon("g", 2, "pas un nombre"), "rien", { id: 5, type: 2 }],
      GUILDE,
      TOUS_ENTRENT,
    );
    expect([...(publics ?? [])].sort()).toEqual(["a", "d", "e"]);
    expect(salonsVocauxPublics({ id: "a" }, GUILDE, TOUS_ENTRENT)).toBeNull();
    expect(salonsVocauxPublics(null, GUILDE, TOUS_ENTRENT)).toBeNull();
    // Sans les permissions de @everyone au niveau du serveur : rien ne se lit.
    expect(salonsVocauxPublics([salon("a", 2, null)], GUILDE, null)).toBeNull();
  });

  // Relecture du 14 novembre 2026 : un salon sans refus pour @everyone n'est pas public si @everyone ne peut, au niveau du
  // serveur, ni voir les salons ni s'y connecter. L'ordre de Discord : le serveur, puis le refus et l'accord du salon.
  describe("les droits de @everyone, dans l'ordre de calcul de Discord", () => {
    const voir = VOIR_LE_SALON;
    const connecter = SE_CONNECTER;
    type Reglage = { id: string; type: number; allow?: string; deny?: string };
    const pourTous = (allow: bigint, deny: bigint): Reglage => ({ id: GUILDE, type: 0, allow: String(allow), deny: String(deny) });
    const salon = (id: string, reglages: Reglage[] = [], plus: Record<string, unknown> = {}) => ({ id, type: 2, permission_overwrites: reglages, ...plus });
    const publics = (salons: unknown[], base: bigint) => [...(salonsVocauxPublics(salons, GUILDE, base) ?? [])].sort();

    it("lit les permissions du rôle @everyone, et rien d'autre", () => {
      expect(permissionsDeTous(roleDeTous(TOUS_ENTRENT), GUILDE)).toBe(TOUS_ENTRENT);
      expect(permissionsDeTous({ id: GUILDE, permissions: "0" }, GUILDE)).toBe(0n);
      for (const role of [{ id: "42", permissions: "1024" }, { id: GUILDE, permissions: "-1" }, { id: GUILDE, permissions: "1e3" }, { id: GUILDE, permissions: 1024 }, { id: GUILDE }, "rien", null]) {
        expect(permissionsDeTous(role, GUILDE), JSON.stringify(role)).toBeNull();
      }
    });

    it("ne compte pas un salon sans refus quand @everyone ne voit pas les salons, ou ne s'y connecte pas, au niveau du serveur", () => {
      expect(publics([salon("a")], voir | connecter)).toEqual(["a"]);
      expect(publics([salon("a")], connecter)).toEqual([]);
      expect(publics([salon("a")], voir)).toEqual([]);
      expect(publics([salon("a")], 0n)).toEqual([]);
    });

    it("applique le refus puis l'accord du salon pour @everyone, et ignore les réglages des autres rôles et des membres", () => {
      // Le serveur refuse de voir, le salon l'accorde : public.
      expect(publics([salon("a", [pourTous(voir, 0n)])], connecter)).toEqual(["a"]);
      expect(publics([salon("a", [pourTous(voir | connecter, 0n)])], 0n)).toEqual(["a"]);
      // Le serveur l'accorde, le salon le refuse : pas public. Refus et accord du même bit : l'accord passe après.
      expect(publics([salon("a", [pourTous(0n, connecter)])], voir | connecter)).toEqual([]);
      expect(publics([salon("a", [pourTous(voir, voir)])], connecter)).toEqual(["a"]);
      // Un rôle ou un membre qui reçoit le droit ne rend pas le salon public.
      expect(publics([salon("a", [{ id: "42", type: 0, allow: String(voir | connecter), deny: "0" }, { id: "43", type: 1, allow: String(voir | connecter), deny: "0" }])], 0n)).toEqual([]);
      // Un réglage sans « allow » ou sans « deny » compte pour zéro ; illisible ou en double, le salon ne compte pas.
      expect(publics([salon("a", [{ id: GUILDE, type: 0, deny: "0" }])], voir | connecter)).toEqual(["a"]);
      expect(publics([salon("a", [{ id: GUILDE, type: 0, allow: "beaucoup", deny: "0" }])], voir | connecter)).toEqual([]);
      expect(publics([salon("a", [pourTous(0n, 0n), pourTous(0n, 0n)])], voir | connecter)).toEqual([]);
      expect(publics([salon("a", "rien" as unknown as Reglage[])], voir | connecter)).toEqual([]);
      expect(permissionsDeTousDansLeSalon(voir | connecter, salon("a", [pourTous(1n << 3n, voir)]), GUILDE)).toBe(connecter | (1n << 3n));
    });

    it("laisse ADMINISTRATOR passer outre tout réglage, comme Discord", () => {
      expect(publics([salon("a", [pourTous(0n, voir | connecter)])], ADMINISTRATEUR)).toEqual(["a"]);
    });

    it("ne compte pas un salon rangé dans une catégorie fermée à @everyone, absente ou qui n'en est pas une", () => {
      const categorie = (id: string, reglages: Reglage[] = []) => ({ id, type: 4, permission_overwrites: reglages });
      const salons = [
        categorie("c-ouverte"),
        categorie("c-cachee", [pourTous(0n, voir)]),
        categorie("c-sans-connexion", [pourTous(0n, connecter)]),
        { id: "t-ecrit", type: 0, permission_overwrites: [] },
        salon("a", [], { parent_id: "c-ouverte" }),
        salon("b", [], { parent_id: "c-cachee" }),
        salon("c", [], { parent_id: "c-sans-connexion" }),
        salon("d", [], { parent_id: "c-absente" }),
        salon("e", [], { parent_id: "t-ecrit" }),
        salon("f", [], { parent_id: null }),
        salon("g", [pourTous(voir | connecter, 0n)], { parent_id: "c-cachee" }),
      ];
      expect(publics(salons, voir | connecter)).toEqual(["a", "f"]);
    });
  });

  it("compte un membre inconnu du serveur comme hors du vocal, mais s'arrête si le serveur est inconnu", async () => {
    const inconnu = fauxDiscord(() => ({ status: 404, body: { message: "Unknown Member", code: 10007 } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(inconnu.send))).releves).toEqual([{ n: numeroDe(1), vocal: false }]);
    const serveur = fauxDiscord(() => ({ status: 404, body: { message: "Unknown Guild", code: 10004 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(serveur.send));
    expect(r).toEqual({ releves: [], arret: "serveur" });
    expect(vocaux(serveur.appels)).toHaveLength(1);
  });

  it("s'arrête net au premier 401, sans rien noter", async () => {
    const { send, appels } = fauxDiscord((url) => (membre(url) === 1 ? { status: 404, body: { code: 10065 } } : { status: 401, body: { message: "401: Unauthorized", code: 0 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2), gaulois(3)])).gaulois, deps(send));
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: "jeton" });
    expect(vocaux(appels)).toHaveLength(2);
  });

  it("s'arrête net au premier 403, en notant ce membre illisible", async () => {
    const { send, appels } = fauxDiscord((url) => (membre(url) === 2 ? { status: 403, body: { message: "Missing Permissions", code: 50013 } } : { status: 404, body: { code: 10065 } }));
    const r = await releverLesVocaux(lu(travail([gaulois(1), gaulois(2), gaulois(3)])).gaulois, deps(send));
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }, { n: numeroDe(2), vocal: null }], arret: "droits" });
    expect(vocaux(appels)).toHaveLength(2);
  });

  it("attend ce que demande un 429 court, une fois, et s'arrête sur un 429 long ou global", async () => {
    let premier = true;
    const court = fauxDiscord(() => {
      if (premier) {
        premier = false;
        return { status: 429, body: { message: "You are being rate limited.", retry_after: 0.4, global: false } };
      }
      return { status: 404, body: { code: 10065 } };
    });
    const pauses: number[] = [];
    const r = await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, { ...deps(court.send), sleep: async (ms) => void pauses.push(ms) });
    expect(r).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: null });
    expect(vocaux(court.appels)).toHaveLength(2);
    expect(pauses).toEqual([500]);

    const long = fauxDiscord(() => ({ status: 429, body: { retry_after: 64.57, global: false } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(long.send))).toEqual({ releves: [], arret: "limite" });
    expect(vocaux(long.appels)).toHaveLength(1);

    const global = fauxDiscord(() => ({ status: 429, body: { retry_after: 0.1, global: true } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(global.send))).arret).toBe("limite");
    expect(vocaux(global.appels)).toHaveLength(1);

    const deuxFois = fauxDiscord(() => ({ status: 429, body: { retry_after: 0.1, global: false } }));
    expect((await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(deuxFois.send))).arret).toBe("limite");
    expect(vocaux(deuxFois.appels)).toHaveLength(2);

    // La liste des salons refusée pour trop d'appels : aucun relevé, la suite au passage suivant.
    const listeLimitee = fauxFetch(() => ({ status: 429, body: { retry_after: 3, global: false } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(listeLimitee.send))).toEqual({ releves: [], arret: "limite" });
  });

  it("attend quand le seau de Discord est vide, et s'arrête s'il faut attendre trop longtemps", async () => {
    const vide = fauxDiscord(() => ({ status: 404, body: { code: 10065 }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "1.2" } }));
    const pauses: number[] = [];
    await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, { ...deps(vide.send), sleep: async (ms) => void pauses.push(ms) });
    expect(pauses).toEqual([1200]);
    const tropLong = fauxDiscord(() => ({ status: 404, body: { code: 10065 }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "30" } }));
    expect(await releverLesVocaux(lu(travail([gaulois(1), gaulois(2)])).gaulois, deps(tropLong.send))).toEqual({ releves: [{ n: numeroDe(1), vocal: false }], arret: "limite" });
  });

  it("s'arrête sur une panne de Discord ou du réseau", async () => {
    const panne = fauxDiscord(() => ({ status: 502, body: null }));
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(panne.send))).toEqual({ releves: [], arret: "discord" });
    const reseau = fauxDiscord(() => "panne");
    expect(await releverLesVocaux(lu(travail([gaulois(1)])).gaulois, deps(reseau.send))).toEqual({ releves: [], arret: "reseau" });
  });

  it("borne le nombre d'appels et le temps du passage, une pause entre deux appels", async () => {
    const { send, appels } = fauxDiscord(() => ({ status: 404, body: { code: 10065 } }));
    const pauses: number[] = [];
    const dix = lu(travail(Array.from({ length: 10 }, (_, i) => gaulois(i + 1)))).gaulois;
    const r = await releverLesVocaux(dix, { ...deps(send), sleep: async (ms) => void pauses.push(ms) }, { max: 4, pauseMs: 250, dureeMs: 60_000 });
    expect(r.arret).toBe("nombre");
    expect(r.releves).toHaveLength(4);
    expect(vocaux(appels)).toHaveLength(4);
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

describe("le lieu des faits, celui de l'écran sans l'état vocal", () => {
  const nuit = "2026-11-14T23:30:00.000Z"; // 0 h 30 à Paris.

  it("suit la règle de vie.ts comme si le vocal n'était pas relevé : la partie, puis le sommeil, rien du futur", () => {
    const lieu = (plus: Partial<Record<string, unknown>>, quand = MAINTENANT) => faitsDuGaulois(lu(travail([gaulois(1, plus)], { maintenant: quand })).gaulois[0]!, new Date(quand))?.lieu;
    expect(lieu({ partie_le: "2026-11-14T19:30:00Z", vocal: true })).toBe("bataille");
    expect(lieu({ partie_le: "2026-11-14T18:30:00Z", vocal: true })).toBe("taverne");
    // Relecture du 14 novembre 2026 : une bulle reste 12 heures, l'état vocal 15 minutes. En vocal, le lieu d'une bulle
    // est celui qu'il aurait sans le vocal.
    expect(lieu({ partie_le: "2026-11-14T16:00:00Z", vocal: true })).toBe("place");
    expect(lieu({ vocal: true })).toBe("place");
    expect(lieu({ vocal: true }, nuit)).toBe("maisons");
    expect(lieu({}, nuit)).toBe("maisons");
    expect(lieu({})).toBe("place");
    expect(lieu({ partie_le: "2026-11-14T21:00:00Z" })).toBe("place");
  });

  it("ne donne jamais la salle de réunion, ni rien qui dise le vocal, à aucune heure", () => {
    expect(LIEUX_DES_BULLES).toEqual(["place", "taverne", "bataille", "maisons"]);
    for (let quart = 0; quart < 96; quart++) {
      const quand = new Date(Date.parse("2026-11-14T00:00:00Z") + quart * 15 * 60_000);
      for (const partie of [null, new Date(quand.getTime() - 20 * 60_000).toISOString(), new Date(quand.getTime() - 2 * 3_600_000).toISOString(), new Date(quand.getTime() - 5 * 3_600_000).toISOString()]) {
        for (const vocal of [true, false, null]) {
          const g = lu(travail([gaulois(1, { vocal, partie_le: partie, points: partie ? 1.5 : null })], { maintenant: quand.toISOString() })).gaulois[0]!;
          const avec = faitsDuGaulois(g, quand)!;
          expect(LIEUX_DES_BULLES).toContain(avec.lieu);
          // Le même Gaulois hors du vocal a exactement les mêmes faits.
          expect(avec).toEqual(faitsDuGaulois({ ...g, vocal: null }, quand));
          expect(lieuDUneBulle(g, quand)).toBe(avec.lieu);
        }
      }
    }
  });

  it("ne donne les points que d'une partie de moins de 12 heures", () => {
    const faits = (heures: number) => faitsDuGaulois(lu(travail([gaulois(1, { partie_le: new Date(Date.parse(MAINTENANT) - heures * 3_600_000).toISOString(), points: 1.65 })])).gaulois[0]!, new Date(MAINTENANT))!;
    expect(POINTS_DANS_LES_BULLES_MS).toBe(12 * 3_600_000);
    expect(faits(0.5).points).toBe("1,65");
    expect(faits(11.9).points).toBe("1,65");
    expect(faits(12).points).toBeNull();
    expect(faits(20).points).toBeNull();
    // Une partie du futur, ou sans date, ne donne rien.
    expect(faits(-1).points).toBeNull();
  });

  it("n'écrit pas de bulle pour qui dort : l'écran ne la montrerait pas", () => {
    const t = lu(travail([gaulois(1), gaulois(2, { vocal: true }), gaulois(3, { partie_le: "2026-11-14T23:00:00Z", points: 2 })], { maintenant: nuit }));
    const lot = choisirLeLot(t.gaulois, t.maintenant);
    // En vocal la nuit, il dort pour les bulles : aucune bulle ne le dit éveillé dans un salon.
    expect(lot.map((g) => [g.n, g.faits.lieu])).toEqual([[numeroDe(3), "bataille"]]);
    expect(lot[0]?.faits.heure).toBe("0 h 30");
  });
});

/* ---------- L'appel à Claude ---------- */

const FAITS: FaitsDuGaulois = { heure: "21 h 05", moment: "soir", lieu: "taverne", points: "1,65", objets: ["Casque d'or", "Gourdin"] };
const LOT = [
  { g: "g1", n: numeroDe(1), faits: FAITS },
  { g: "g2", n: numeroDe(2), faits: { ...FAITS, lieu: "place" as const, points: null } },
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
    const message = corps.messages[0]!.content as string;
    for (const interdit of ['"n"', '"nom"', "pseudo", "discord", "Discord", "vocal", "réunion"]) expect(message).not.toContain(interdit);
    expect(message).toContain('"g":"g1"');
    expect(message).toContain("à la taverne");
    expect(message).toContain('"points_rapportes_au_clan_par_sa_derniere_partie":"1,65"');
    expect(message).toContain("Casque d'or");
    // Sans points, pas de champ des points.
    expect(message.split('"g":"g2"')[1]).not.toContain("points");
  });

  it("part par le SDK, une seule fois, à l'adresse de l'API, avec la clé et la version que le SDK pose", async () => {
    const { send, appels } = fauxFetch(() => ({ status: 200, body: reponseClaude(json([{ g: "g1", texte: "Une pause à la taverne, ça se mérite !" }])) }));
    const r = await demanderLesBulles("claude-haiku-5-5", LOT, "cle-essai", send);
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe(URL_CLAUDE);
    expect(appels[0]?.init?.method).toBe("POST");
    const entetes = new Headers(appels[0]?.init?.headers);
    // Le SDK envoie la clé (en-tête Authorization depuis sa version 1.0) et la version de l'API qu'il connaît.
    expect(`${entetes.get("authorization") ?? ""} ${entetes.get("x-api-key") ?? ""}`).toContain("cle-essai");
    expect(entetes.get("anthropic-version")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entetes.get("content-type")).toBe("application/json");
    // Le corps est celui de corpsDeLaDemande, sans rien ajouter.
    expect(JSON.parse(String(appels[0]?.init?.body))).toEqual(JSON.parse(JSON.stringify(corpsDeLaDemande("claude-haiku-5-5", LOT))));
    expect(r.jetons).toEqual({ entree: 812, sortie: 240 });
    expect(r.phrases.get("g1")).toBe("Une pause à la taverne, ça se mérite !");
    expect(r.raison).toBeNull();
  });

  it("n'envoie la clé qu'à l'API de Claude, même si l'environnement donne une autre adresse", async () => {
    const avant = process.env["ANTHROPIC_BASE_URL"];
    process.env["ANTHROPIC_BASE_URL"] = "https://ailleurs.example.test";
    try {
      const { send, appels } = fauxFetch(() => ({ status: 200, body: reponseClaude(json([])) }));
      await demanderLesBulles("claude-haiku-5-5", LOT, "cle-essai", send);
      expect(appels.map((a) => a.url)).toEqual([URL_CLAUDE]);
    } finally {
      if (avant === undefined) delete process.env["ANTHROPIC_BASE_URL"];
      else process.env["ANTHROPIC_BASE_URL"] = avant;
    }
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
    expect(phrasesDeLaReponse(reponseClaude(json([{ g: "g1", texte: "A" }]), { stop_reason: "max_tokens" }), etiquettes)).toMatchObject({ raison: "réponse coupée" });
    expect(phrasesDeLaReponse(reponseClaude("Voici les bulles !"), etiquettes)).toMatchObject({ raison: "JSON illisible" });
    expect(phrasesDeLaReponse(reponseClaude('{"bulles": []}'), etiquettes)).toMatchObject({ raison: "JSON hors de la forme demandée" });
    expect(phrasesDeLaReponse("rien", etiquettes)).toMatchObject({ raison: "réponse illisible" });
  });

  it("dit pourquoi l'API refuse, sans compter de jetons, sans jamais réessayer, et compte au plus haut une réponse perdue", async () => {
    const refus = async (status: number, body: unknown) => {
      const faux = fauxFetch(() => ({ status, body }));
      const r = await demanderLesBulles("claude-haiku-5-5", LOT, "cle-secrete", faux.send);
      // Aucune reprise du SDK : un seul appel, quel que soit le refus.
      expect(faux.appels, String(status)).toHaveLength(1);
      expect(r.raison ?? "", String(status)).not.toContain("cle-secrete");
      return r;
    };
    const erreur = (type: string, message: string) => ({ type: "error", error: { type, message } });
    expect(await refus(401, erreur("authentication_error", "invalid x-api-key"))).toMatchObject({ jetons: null, avertir: true, raison: expect.stringContaining("ANTHROPIC_API_KEY") });
    expect(await refus(403, erreur("permission_error", "not allowed"))).toMatchObject({ jetons: null, avertir: true, raison: expect.stringContaining("403") });
    expect(await refus(429, erreur("rate_limit_error", "slow down"))).toMatchObject({ jetons: null, avertir: false, raison: expect.stringContaining("429") });
    expect(await refus(500, erreur("api_error", "Internal server error"))).toMatchObject({ jetons: null, avertir: false, raison: expect.stringContaining("500") });
    expect(await refus(529, erreur("overloaded_error", "Overloaded"))).toMatchObject({ jetons: null, avertir: false, raison: expect.stringContaining("overloaded_error") });
    expect(await refus(400, erreur("invalid_request_error", "Your credit balance is too low"))).toMatchObject({ jetons: null, avertir: true, raison: expect.stringContaining("credit balance") });
    const panne = fauxFetch(() => "panne");
    const perdue = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", panne.send);
    expect(panne.appels).toHaveLength(1);
    expect(perdue).toMatchObject({ raison: "Claude ne répond pas", avertir: false });
    expect(perdue.jetons?.sortie).toBe(MAX_TOKENS);
    expect(perdue.jetons!.entree).toBeGreaterThan(1000);
    const sansCompte = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", fauxFetch(() => ({ status: 200, body: { content: [] } })).send);
    expect(sansCompte.jetons?.sortie).toBe(MAX_TOKENS);
  });

  it("lit la raison de l'arrêt avant le contenu, et compte les jetons d'une réponse refusée ou coupée", async () => {
    const valable = json([{ g: "g1", texte: "Une pause à la taverne, ça se mérite !" }]);
    for (const [arret, raison] of [["refusal", "le modèle a refusé la demande"], ["max_tokens", "réponse coupée"], ["pause_turn", "réponse arrêtée autrement que prévu"]] as const) {
      // Même un texte qui se lirait ne donne aucune phrase.
      const corps = reponseClaude(valable, { stop_reason: arret, usage: { input_tokens: 900, output_tokens: MAX_TOKENS, cache_creation_input_tokens: null, cache_read_input_tokens: null } });
      const r = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", fauxFetch(() => ({ status: 200, body: corps })).send);
      expect(r, arret).toMatchObject({ jetons: { entree: 900, sortie: MAX_TOKENS }, raison, avertir: false });
      expect(r.phrases.size, arret).toBe(0);
    }
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

  // Revue de sécurité du 14 novembre 2026 : la moquerie, les noms propres, et un nombre que JavaScript arrondit.
  it("refuse la moquerie, en mots entiers pour « nul », sans arrêter « annuler » ni « granule »", () => {
    for (const texte of ["Les voisins sont des nuls, je vais les écraser !", "Mon voisin est un abruti.", "Quelle idiote, cette chèvre.", "Un vrai tocard, ce soir.", "Ce crétin a pris ma chope.", "C'est débile !", "Quel imbécile !", "Tu es nul."]) {
      expect(ok(texte), texte).toEqual({ ok: false, raison: "mot interdit" });
    }
    for (const texte of ["J'annule ma sieste, place à la fête.", "Une granule de sel dans ma chope ?"]) expect(ok(texte), texte).toMatchObject({ ok: true });
  });

  it("refuse une majuscule hors du début d'une phrase, sauf les mots permis", () => {
    for (const texte of ["Je trinque à la santé de Macron sur la place !", "Bonsoir à toi, Paris.", "Ce soir, j'invite Jean à la taverne.", "Je bois une Kronenbourg."]) {
      expect(ok(texte), texte).toEqual({ ok: false, raison: "majuscule hors d'un début de phrase" });
    }
    for (const texte of ["Les Gaulois de la place trinquent. Santé !", "Une Gauloise passe, et deux Gauloises la suivent.", "Quelle soirée ! Je rentre.", "« Bonsoir » dit le forgeron… Puis il chante."]) {
      expect(ok(texte), texte).toMatchObject({ ok: true });
    }
  });

  it("compare les nombres par leur écriture décimale exacte, comme le serveur", () => {
    expect(nombreExact("21")).toBe("21");
    expect(nombreExact("05")).toBe("5");
    expect(nombreExact("1,50")).toBe("1.5");
    expect(nombreExact("21.0")).toBe("21");
    expect(nombreExact("0")).toBe("0");
    expect(nombreExact("21.0000000000000001")).toBe("21.0000000000000001");
    // Le piège de la revue : 21.0000000000000001 vaut 21 en nombre à virgule flottante, pas pour le serveur.
    expect(ok("Il est 21.0000000000000001 h, je trinque !")).toEqual({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("Il est 21,0 h, je trinque !")).toMatchObject({ ok: true });
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
      // Le rôle @everyone et les salons du serveur : un salon vocal public, celui où est le membre 1.
      if (url === URL_ROLE) return { status: 200, body: roleDeTous(TOUS_ENTRENT) };
      if (url.endsWith("/channels")) return { status: 200, body: [{ id: "1350905494600099999", type: 2, permission_overwrites: [] }] };
      if (url.startsWith("https://discord.com/")) return Number(url.slice(-2)) === 1 ? { status: 200, body: { channel_id: "1350905494600099999" } } : { status: 404, body: { code: 10065 } };
      const corps = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      return claude((corps.messages[0]!.content.match(/"g":"g\d+"/g) ?? []).length);
    });
  }

  it("relève les vocaux, demande les bulles sans relire la liste, note la dépense puis les bulles", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send, appels } = monde(() => ({ status: 200, body: reponseClaude(json([{ g: "g1", texte: "Le soir tombe, je flâne sur la place." }, { g: "g2", texte: "Une potion !" }])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: { token: "Mzk.jeton-robot-essai.Xyz", guildId: GUILDE }, cleClaude: "cle-secrete", log: (l) => journal.push(l) });
    expect(bilan).toEqual({ vocaux: 3, enVocal: 1, appels: 1, envoyees: 1, ecartees: 1, erreurs: 0 });
    // L'état vocal ne change pas les faits d'une bulle : la liste de travail n'est lue qu'une fois.
    expect(serveur.appels.map((a) => a.fn)).toEqual(["vie_du_village_travail", "noter_vie_du_village", "noter_vie_du_village", "noter_vie_du_village"]);
    expect(serveur.appels[1]?.args).toEqual({ p_releve: { vocaux: [{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }, { n: numeroDe(3), vocal: false }] } });
    expect(serveur.appels[2]?.args).toEqual({ p_releve: { depense: { appels: 1, entree: 812, sortie: 240, ecartees: 1 } } });
    const envoi = serveur.appels[3]?.args["p_releve"] as { repliques: { n: string; texte: string; faits: FaitsDuGaulois }[]; sans_bulle: string[] };
    // Le membre 1 est en vocal : sa bulle le dit sur la place, pas en salle de réunion.
    expect(envoi.repliques).toEqual([{ n: numeroDe(1), texte: "Le soir tombe, je flâne sur la place.", faits: { heure: "21 h 05", moment: "soir", lieu: "place", points: null, objets: ["Tunique bleue", "Braies à carreaux", "Bottes de cuir", "Gourdin"] } }]);
    // La phrase écartée : le Gaulois est noté comme demandé, sans bulle, pour ne pas redemander Claude à chaque passage.
    expect(envoi.sans_bulle).toEqual([numeroDe(2)]);
    expect(appels.filter((a) => a.url === URL_CLAUDE)).toHaveLength(1);
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
    // Refusé en entier : tout le lot est noté comme demandé sans bulle, pour ne pas redemander Claude au passage suivant.
    expect(serveur.appels.map((a) => Object.keys((a.args["p_releve"] as object | undefined) ?? {})[0] ?? a.fn)).toEqual(["vie_du_village_travail", "depense", "repliques", "sans_bulle"]);
    expect(serveur.appels[3]?.args).toEqual({ p_releve: { sans_bulle: [numeroDe(1), numeroDe(2)] } });
    expect(journal.some((l) => l.startsWith("::warning::") && l.includes("invalid_releve"))).toBe(true);
  });

  it("fait chaque partie sans l'autre : sans jeton pas de vocal, sans clé pas de bulles", async () => {
    const sansJeton = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const claude = monde(() => ({ status: 200, body: reponseClaude(json([])) }));
    const journal: string[] = [];
    await vieDuVillage({ rpc: sansJeton.rpc, fetch: claude.send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(claude.appels.every((a) => a.url === URL_CLAUDE)).toBe(true);
    // La liste n'est lue qu'une fois.
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

  it("note quand même la dépense d'une réponse refusée, coupée ou mal formée, et ses Gaulois comme demandés sans bulle, sans erreur", async () => {
    const coupee = reponseClaude(json([{ g: "g1", texte: "Bonsoir la place !" }]), { stop_reason: "max_tokens" });
    for (const reponse of [reponseClaude("", { stop_reason: "refusal" }), coupee, reponseClaude("pas du JSON"), reponseClaude(json([{ g: "g1", texte: "J'ai rapporté 99 points !" }]))]) {
      const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
      const { send } = monde(() => ({ status: 200, body: reponse }));
      const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
      expect(bilan.envoyees).toBe(0);
      expect(bilan.erreurs).toBe(0);
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
    expect(journal.some((l) => l.startsWith("::warning::") && l.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("abandonne le passage sans erreur ni dépense quand l'API demande de ralentir ou tombe en panne : le suivant réessaie", async () => {
    for (const [status, type] of [[429, "rate_limit_error"], [500, "api_error"], [529, "overloaded_error"]] as const) {
      const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
      const { send, appels } = monde(() => ({ status, body: { type: "error", error: { type, message: "plus tard" } } }));
      const journal: string[] = [];
      const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
      expect(bilan, String(status)).toMatchObject({ appels: 1, envoyees: 0, erreurs: 0 });
      expect(appels.filter((a) => a.url === URL_CLAUDE)).toHaveLength(1);
      // Rien de noté : ni dépense, ni Gaulois demandés sans bulle.
      expect(serveur.appels.map((a) => a.fn)).toEqual(["vie_du_village_travail"]);
      expect(journal.some((l) => l.startsWith("::warning::"))).toBe(false);
    }
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
