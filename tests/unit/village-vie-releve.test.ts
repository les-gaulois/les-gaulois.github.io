import { describe, expect, it } from "vitest";
import type { RpcResult } from "../../src/lib/compte/roster";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { CONSIGNE, CONSIGNE_DE_REPRISE, MAX_REPLIQUES_PAR_PASSAGE, MOTS_INTERDITS } from "../../src/lib/village/consigne-repliques";
import {
  ADMINISTRATEUR,
  ANTHROPIC_BASE_URL,
  ESSAIS_PAR_PASSAGE,
  FIN_DES_APPELS_MS,
  GAULOIS_PAR_APPEL,
  LIEUX_DES_BULLES,
  MAX_TOKENS,
  POINTS_DANS_LES_BULLES_MS,
  SE_CONNECTER,
  VOIR_LE_SALON,
  choisirLeLot,
  choisirPhrase,
  controlerReplique,
  corpsDeLaDemande,
  demanderLesBulles,
  ecartEcrit,
  ecartsDeLaPhrase,
  faitsDuGaulois,
  faitsEcrits,
  jetonsDeLaReponse,
  lieuDUneBulle,
  lirePlafond,
  lireTravail,
  lireVieDuVillage,
  momentDeLaJournee,
  nettoyage,
  nettoyerPhrase,
  nombreExact,
  normaliserPourLesMots,
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

  it("choisissent au plus 12 Gaulois qui ont besoin d'une bulle, ceux qui n'en ont jamais eu d'abord", () => {
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
    // Trois phrases chacun : un appel de 12 tient dans MAX_TOKENS avec de la marge ; les autres passent 5 minutes plus tard.
    expect(GAULOIS_PAR_APPEL).toBe(12);
    expect(lot).toHaveLength(12);
    expect(lot.map((g) => g.g)).toEqual(Array.from({ length: 12 }, (_, i) => `g${i + 1}`));
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
/** Les trois phrases d'un Gaulois dans la réponse, comme le schéma les impose ; une phrase absente reste absente. */
const trois = (g: string, ...textes: string[]) => Object.fromEntries([["g", g], ...textes.map((t, i) => [`texte_${i + 1}`, t])]);

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
    // Les objets sans leur majuscule, que Claude recopiait au milieu d'une phrase.
    expect(message).toContain('"porte":["casque d\'or","gourdin"]');
    expect(message).not.toContain("Casque");
    // Sans points, pas de champ des points.
    expect(message.split('"g":"g2"')[1]).not.toContain("points");
    expect(message.startsWith("Les faits de chaque Gaulois")).toBe(true);
  });

  // Une bulle reste à l'écran des heures après avoir été écrite : « il est 21 h 05 » y deviendrait faux. Recopiée ou
  // arrondie, l'heure faisait aussi écarter la phrase.
  it("ne donne plus l'heure à Claude, mais la garde dans les faits de la bulle pour le serveur", () => {
    const message = corpsDeLaDemande("claude-haiku-5-5", LOT).messages[0]!.content as string;
    expect(message).not.toContain("heure");
    expect(message).not.toMatch(/21|05/);
    expect(faitsEcrits(LOT[0]!)).toEqual({ g: "g1", moment: "le soir", ou: "à la taverne, au retour de sa dernière partie", points_rapportes_au_clan_par_sa_derniere_partie: "1,65", porte: ["casque d'or", "gourdin"] });
    expect(LOT[0]!.faits.heure).toBe("21 h 05");
  });

  it("redit à Claude, à la reprise, pourquoi les phrases de chaque Gaulois ont été écartées", () => {
    const ecarts = new Map([["g1", ["trop longue : 97 signes sur 90", "mot interdit"]]]);
    const message = corpsDeLaDemande("claude-haiku-5-5", LOT, ecarts).messages[0]!.content as string;
    expect(message.startsWith(CONSIGNE_DE_REPRISE)).toBe(true);
    expect(message).toContain('"phrases_ecartees_parce_que":["trop longue : 97 signes sur 90","mot interdit"]');
    // Un Gaulois sans raison (il n'avait pas de phrase) n'a pas le champ.
    expect(message.split('"g":"g2"')[1]).not.toContain("phrases_ecartees_parce_que");
  });

  it("part par le SDK, une seule fois, à l'adresse de l'API, avec la clé et la version que le SDK pose", async () => {
    const { send, appels } = fauxFetch(() => ({ status: 200, body: reponseClaude(json([trois("g1", "Une pause à la taverne, ça se mérite !", "b", "c")])) }));
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
    expect(r.phrases.get("g1")).toEqual(["Une pause à la taverne, ça se mérite !", "b", "c"]);
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

  it("donne au SDK le délai plus court d'une reprise, et compte au plus haut un appel qui n'a pas répondu à temps", async () => {
    // Une API qui ne répond jamais : seul le délai du SDK arrête l'appel.
    const muette = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("abandon")));
      })) as typeof fetch;
    const debut = Date.now();
    const r = await demanderLesBulles("claude-haiku-5-5", LOT, "cle", muette, { delaiMs: 50 });
    expect(Date.now() - debut).toBeLessThan(5_000);
    expect(r).toMatchObject({ raison: "Claude ne répond pas", avertir: false, jetons: { sortie: MAX_TOKENS } });
  });

  it("lit les jetons, cache compris", () => {
    expect(jetonsDeLaReponse({ usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 3, cache_read_input_tokens: 2 } })).toEqual({ entree: 15, sortie: 5 });
    expect(jetonsDeLaReponse({ usage: { input_tokens: 10, output_tokens: 5 } })).toEqual({ entree: 10, sortie: 5 });
    expect(jetonsDeLaReponse({})).toBeNull();
    expect(jetonsDeLaReponse({ usage: { output_tokens: 5 } })).toBeNull();
  });

  it("ne garde que les phrases des étiquettes demandées, une fois chacune, dans l'ordre des trois champs", () => {
    const etiquettes = new Set(["g1", "g2"]);
    const { phrases, raison } = phrasesDeLaReponse(reponseClaude(json([trois("g1", "A1", "A2", "A3"), trois("g1", "B"), trois("g9", "C"), { g: "g2", texte_2: "D2" }, "rien"])), etiquettes);
    expect(raison).toBeNull();
    expect([...phrases]).toEqual([["g1", ["A1", "A2", "A3"]], ["g2", [undefined, "D2", undefined]]]);
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
    expect(ok("Une pause à la taverne, ça se mérite !")).toEqual({ ok: true, texte: "Une pause à la taverne, ça se mérite !", retouches: [] });
    expect(ok("  « Mon casque d'or brille encore ce soir ! »  ")).toMatchObject({ ok: true, texte: "« Mon casque d'or brille encore ce soir ! »" });
    expect(ok("\"J'ai rapporté 1,65 point au clan, et toc !\"")).toMatchObject({ ok: true, texte: "J'ai rapporté 1,65 point au clan, et toc !" });
    expect(ok("Déjà le soir… L’heure d’une chope !")).toMatchObject({ ok: true, texte: "Déjà le soir… L’heure d’une chope !" });
    expect(ok("Œuf, pâté, bière : le soir est doux.")).toMatchObject({ ok: true });
  });

  it("refuse une phrase trop longue, vide ou qui n'en est pas une", () => {
    expect(ok("a".repeat(90))).toMatchObject({ ok: true });
    expect(ok("a".repeat(91))).toMatchObject({ ok: false, raison: "trop longue", ecarts: [{ raison: "trop longue", detail: "91 signes sur 90" }] });
    expect(ok("   ")).toMatchObject({ ok: false, raison: "vide" });
    // Rien qu'un émoji : vide, une fois l'émoji retiré.
    expect(ok("🍺 🍺")).toMatchObject({ ok: false, raison: "vide" });
    expect(ok(42)).toMatchObject({ ok: false, raison: "pas une phrase" });
    expect(ok(null)).toMatchObject({ ok: false, raison: "pas une phrase" });
  });

  it("refuse liens, mentions, balises, signes hors de la liste et majuscules d'affilée", () => {
    for (const texte of ["Venez sur https://exemple.test", "Salut @everyone !", "Allez #general", "<b>Bonsoir</b>", "Rendez-vous sur exemple.com ce soir", "Vive GAL !", "OUI !", "C'est 50% de bonheur", "a/b", "Prix : 3 $", "Mon gourdin + moi", "Je suis au top ! *rire*", "Bière & chope"]) {
      expect(ok(texte).ok, texte).toBe(false);
    }
  });

  it("refuse un chiffre absent des points, l'heure comprise : Claude ne la reçoit plus", () => {
    expect(ok("J'ai rapporté 1.65 point !")).toMatchObject({ ok: true });
    expect(ok("J'ai rapporté 1,65 point, et toc !")).toMatchObject({ ok: true });
    expect(ok("J'ai rapporté 2 points !")).toMatchObject({ ok: false, raison: "chiffre absent des faits", ecarts: [{ detail: "« 2 »" }] });
    expect(ok("Mes 3 chopes m'attendent.")).toMatchObject({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("J'ai rapporté 1,65 point !", { ...FAITS, points: null })).toMatchObject({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("1488")).toMatchObject({ ok: false, raison: "chiffre absent des faits" });
    // L'heure des faits (21 h 05) : le serveur la permettrait, le robot non. Elle serait inventée, ou périmée à l'écran.
    expect(ok("Déjà 21 h, à la taverne !")).toMatchObject({ ok: false, raison: "chiffre absent des faits", ecarts: [{ detail: "« 21 »" }] });
    expect(ok("Il est 21 h 05, santé !")).toMatchObject({ ok: false, ecarts: [{ raison: "chiffre absent des faits", detail: "« 21 », « 05 »" }] });
    // Des chiffres en lettres ne sont pas des chiffres.
    expect(ok("Neuf chopes et pas une de plus !")).toMatchObject({ ok: true });
  });

  it("refuse les mots interdits, Astérix compris", () => {
    for (const texte of ["Une potion et ça repart !", "Ces Romains me fatiguent.", "Ils sont fous, ces voisins !", "Quelle victoire ce soir !", "J'ai gagné ma soirée.", "Par Toutatis !", "Je vais au menhir.", "Quelle merde ce temps.", "Le druide dort.", "Viens sur Discord !"]) {
      expect(ok(texte), texte).toMatchObject({ ok: false, raison: "mot interdit" });
    }
  });

  // Revue de sécurité du 14 novembre 2026 : la moquerie, les noms propres, et un nombre que JavaScript arrondit.
  it("refuse la moquerie, en mots entiers pour « nul », sans arrêter « annuler » ni « granule »", () => {
    for (const texte of ["Les voisins sont des nuls, je vais les écraser !", "Mon voisin est un abruti.", "Quelle idiote, cette chèvre.", "Un vrai tocard, ce soir.", "Ce crétin a pris ma chope.", "C'est débile !", "Quel imbécile !", "Tu es nul."]) {
      expect(ok(texte), texte).toMatchObject({ ok: false, raison: "mot interdit" });
    }
    for (const texte of ["J'annule ma sieste, place à la fête.", "Une granule de sel dans ma chope ?"]) expect(ok(texte), texte).toMatchObject({ ok: true });
  });

  it("refuse une majuscule hors du début d'une phrase, sauf les mots permis et les mots des faits", () => {
    for (const texte of ["Je trinque à la santé de Macron sur la place !", "Bonsoir à toi, Paris.", "Ce soir, j'invite Jean à la taverne.", "Je bois une Kronenbourg.", "Je flâne : Mon gourdin me suit.", "« Bonjour ! » Je salue la place."]) {
      expect(ok(texte), texte).toMatchObject({ ok: false, raison: "majuscule hors d'un début de phrase" });
    }
    for (const texte of ["Les Gaulois de la place trinquent. Santé !", "Une Gauloise passe, et deux Gauloises la suivent.", "Quelle soirée ! Je rentre.", "« Bonsoir » dit le forgeron… Puis il chante."]) {
      expect(ok(texte), texte).toMatchObject({ ok: true });
    }
    // Un objet ou un lieu des faits, recopié avec sa majuscule : la majuscule tombe, la phrase passe.
    expect(ok("Mon Casque d'Or brille à la Taverne !")).toMatchObject({ ok: true, texte: "Mon casque d'or brille à la taverne !", retouches: ["majuscule d'un mot des faits"] });
    expect(ok("Mon Gourdin et moi, au Clan pour toujours !")).toMatchObject({ ok: true, texte: "Mon gourdin et moi, au clan pour toujours !" });
  });

  it("compare les nombres par leur écriture décimale exacte, comme le serveur", () => {
    expect(nombreExact("21")).toBe("21");
    expect(nombreExact("05")).toBe("5");
    expect(nombreExact("1,50")).toBe("1.5");
    expect(nombreExact("21.0")).toBe("21");
    expect(nombreExact("0")).toBe("0");
    expect(nombreExact("21.0000000000000001")).toBe("21.0000000000000001");
    // Le piège de la revue : 1.6500000000000001 vaut 1,65 en nombre à virgule flottante, pas pour le serveur.
    expect(ok("J'ai rapporté 1.6500000000000001 point !")).toMatchObject({ ok: false, raison: "chiffre absent des faits" });
    expect(ok("J'ai rapporté 1,650 point !")).toMatchObject({ ok: true });
  });
});

/* ---------- Le nettoyage d'une phrase ---------- */

describe("le nettoyage d'une phrase, typographie seulement", () => {
  const c = (...codes: number[]) => String.fromCodePoint(...codes);
  const net = (texte: string) => nettoyage(texte, FAITS);

  it("change les tirets longs et moyens d'une incise en virgule, et garde un trait d'union", () => {
    expect(net(`Ce soir ${c(0x2014)} gourdin en main ${c(0x2014)} je trinque.`).texte).toBe("Ce soir, gourdin en main, je trinque.");
    expect(net(`Ce soir${c(0x2014)}je trinque.`).texte).toBe("Ce soir, je trinque.");
    expect(net(`${c(0x2014)} Santé, la taverne !`).texte).toBe("Santé, la taverne !");
    expect(net(`Santé ${c(0x2013)} !`).texte).toBe("Santé !");
    expect(net(`Un rendez${c(0x2013)}vous à la taverne.`).texte).toBe("Un rendez-vous à la taverne.");
    expect(net(`Moi${c(0x2011)}même, je trinque${c(0x2014)}.`).texte).toBe("Moi-même, je trinque.");
    expect(net(`Ah. ${c(0x2014)} Je trinque.`).texte).toBe("Ah. Je trinque.");
    expect(net(`Ce soir ${c(0x2014)}`).retouches).toEqual(["tiret long"]);
  });

  it("change les guillemets droits ou anglais en guillemets français, par paires, et les retire autour", () => {
    expect(net(`Je dis ${c(0x201c)}santé${c(0x201d)} à la taverne.`).texte).toBe("Je dis « santé » à la taverne.");
    expect(net('Je dis "santé" à la taverne.').texte).toBe("Je dis « santé » à la taverne.");
    expect(net(`${c(0x201c)}Santé, la taverne !${c(0x201d)}`).texte).toBe("Santé, la taverne !");
    // Un guillemet seul : retiré.
    expect(net('Je dis "santé à la taverne.').texte).toBe("Je dis santé à la taverne.");
    expect(net("«Santé !» dit mon gourdin.").texte).toBe("« Santé ! » dit mon gourdin.");
    expect(net(`Il dit ${c(0x2039)}santé${c(0x203a)}.`).texte).toBe("Il dit « santé ».");
  });

  it("change les espaces insécables, fines et sans largeur, les apostrophes, les points de suspension", () => {
    expect(net(`Santé${c(0x202f)}! Une chope${c(0xa0)}?`).texte).toBe("Santé ! Une chope ?");
    expect(net(`Je${c(0x200b)} trinque.`).texte).toBe("Je trinque.");
    expect(net(`L${c(0x2018)}heure d${c(0x60)}une chope.`).texte).toBe(`L${c(0x2019)}heure d${c(0x2019)}une chope.`);
    expect(net("Bon... Je trinque. . .").texte).toBe("Bon… Je trinque…");
    expect(net("Bonsoir , la taverne .").texte).toBe("Bonsoir, la taverne.");
    expect(net(`Caf${c(0x65, 0x301)} !`).texte).toBe(`Caf${c(0xe9)} !`);
  });

  it("retire les émojis, leurs teintes, drapeaux et sélecteurs", () => {
    for (const emoji of [c(0x1f37a), c(0x2600, 0xfe0f), c(0x1f44d, 0x1f3fd), c(0x1f1eb, 0x1f1f7), c(0x1f468, 0x200d, 0x1f33e), c(0x2694, 0xfe0f)]) {
      const r = net(`Santé ${emoji} la taverne !`);
      expect(r.texte, JSON.stringify(emoji)).toBe("Santé la taverne !");
      expect(r.retouches).toContain("émoji");
    }
  });

  it("ne retire la majuscule que d'un mot des faits, au milieu d'une phrase", () => {
    // Le mot des faits en début de phrase garde sa majuscule ; un nom inventé la garde aussi, et la phrase est écartée.
    expect(net("Gourdin en main, je trinque. Gourdin levé !").texte).toBe("Gourdin en main, je trinque. Gourdin levé !");
    expect(net("Mon Gourdin salue Macron.").texte).toBe("Mon gourdin salue Macron.");
    expect(nettoyage("Mon Gourdin salue Macron.").texte).toBe("Mon Gourdin salue Macron.");
    // Un mot en capitales n'est pas touché : la règle des majuscules d'affilée l'écarte.
    expect(net("Mon GOURDIN est là.").texte).toBe("Mon GOURDIN est là.");
  });

  it("ne change jamais un mot, un nombre ou un signe hors de la liste", () => {
    for (const texte of ["J'ai 3 chopes / 2 gourdins.", "Vive Toutatis !", "Mon gourdin + moi = 100%", "Rendez-vous sur exemple.com", "Je bois une Kronenbourg."]) {
      const sans = (t: string) => t.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9/+=%.@#]/g, "");
      expect(sans(net(texte).texte), texte).toBe(sans(texte));
      expect(controlerReplique(texte, FAITS).ok, texte).toBe(false);
    }
  });

  it("donne le même texte une seconde fois, et c'est ce texte que le robot envoie", () => {
    const textes = [`« Ma Tunique ${c(0x2014)} et mon Gourdin » ${c(0x1f37a)}...`, `"Bonsoir"${c(0x202f)}! ${c(0x2013)} Santé`, "Bon... Je trinque. . ."];
    for (const texte of textes) {
      const une = nettoyerPhrase(texte, FAITS);
      expect(nettoyerPhrase(une, FAITS), texte).toBe(une);
    }
  });
});

describe("ce que le journal dit d'une phrase écartée", () => {
  it("dit chaque règle en cause et son fragment : le signe, le nombre, le mot à majuscule, la longueur", () => {
    const ecarts = ecartsDeLaPhrase(`Je bois une Kronenbourg à 22 h / ${"a".repeat(80)}`, FAITS).map(ecartEcrit);
    expect(ecarts).toEqual(["trop longue : 113 signes sur 90", "signe refusé : « / » (U+002F)", "chiffre absent des faits : « 22 »", "majuscule hors d'un début de phrase : « Kronenbourg »"]);
    expect(ecartsDeLaPhrase("Vive le CLAN !", FAITS).map(ecartEcrit)).toEqual(["majuscules : « CLAN »", "majuscule hors d'un début de phrase : « CLAN »"]);
    expect(ecartsDeLaPhrase("Va sur exemple.com", FAITS).map(ecartEcrit)).toEqual(["adresse : « e.c »"]);
    // Un signe invisible se dit par son code seulement.
    expect(ecartsDeLaPhrase(`Je${String.fromCodePoint(0x7)} trinque`, FAITS).map(ecartEcrit)).toEqual(["signe refusé : U+0007"]);
  });

  it("ne répète jamais un mot interdit, même à majuscule", () => {
    for (const texte of ["Par Toutatis, la belle place !", "Je bois avec Obélix.", "Quel TOCARD !", "Une Potion, vite."]) {
      const dit = ecartsDeLaPhrase(texte, FAITS).map(ecartEcrit).join(" ; ");
      expect(dit, texte).toContain("mot interdit");
      for (const mot of MOTS_INTERDITS) expect(normaliserPourLesMots(dit), `${texte} : ${mot}`).not.toContain(mot);
    }
  });

  it("choisit la première phrase qui passe, et ne lit pas les suivantes", () => {
    const choix = choisirPhrase(["J'ai rapporté 2 points !", `Ma Tunique ${String.fromCodePoint(0x2014)} quelle allure !`, "Par Toutatis !"], { ...FAITS, objets: ["Tunique bleue"] });
    expect(choix.texte).toBe("Ma tunique, quelle allure !");
    expect(choix.ecartees).toEqual([{ rang: 1, ecarts: [{ raison: "chiffre absent des faits", detail: "« 2 »" }] }]);
    expect(choix.retouches.sort()).toEqual(["majuscule d'un mot des faits", "tiret long"]);
    const aucune = choisirPhrase([undefined, "", "Par Toutatis !"], FAITS);
    expect(aucune.texte).toBeNull();
    expect(aucune.ecartees.map((e) => [e.rang, e.ecarts[0]?.raison])).toEqual([[1, "pas une phrase"], [2, "vide"], [3, "mot interdit"]]);
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

  /**
   * Le faux monde : Discord, puis Claude, qui reçoit le corps de chaque demande (`corps`), son rang (`essai`, 1 puis 2) et les
   * étiquettes demandées.
   */
  function monde(claude: (lot: number, essai: number, etiquettes: string[], corps: { messages: { content: string }[] }) => Route | "panne") {
    let essai = 0;
    return fauxFetch((url, init) => {
      // Le rôle @everyone et les salons du serveur : un salon vocal public, celui où est le membre 1.
      if (url === URL_ROLE) return { status: 200, body: roleDeTous(TOUS_ENTRENT) };
      if (url.endsWith("/channels")) return { status: 200, body: [{ id: "1350905494600099999", type: 2, permission_overwrites: [] }] };
      if (url.startsWith("https://discord.com/")) return Number(url.slice(-2)) === 1 ? { status: 200, body: { channel_id: "1350905494600099999" } } : { status: 404, body: { code: 10065 } };
      const corps = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const etiquettes = [...corps.messages[0]!.content.matchAll(/"g":"(g\d+)"/g)].map((m) => m[1]!);
      return claude(etiquettes.length, ++essai, etiquettes, corps);
    });
  }
  const envoiDe = (a: { args: Record<string, unknown> } | undefined) => a?.args["p_releve"] as Record<string, unknown>;
  const quoi = (serveur: FauxServeur) => serveur.appels.map((a) => Object.keys((a.args["p_releve"] as object | undefined) ?? {})[0] ?? a.fn);

  it("relève les vocaux, demande les bulles sans relire la liste, reprend le Gaulois écarté, note la dépense puis les bulles", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send, appels } = monde(() => ({ status: 200, body: reponseClaude(json([trois("g1", "Le soir tombe, je flâne sur la place.", "b", "c"), trois("g2", "Une potion !", "Par Toutatis !", "J'ai rapporté 3 points !")])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: { token: "Mzk.jeton-robot-essai.Xyz", guildId: GUILDE }, cleClaude: "cle-secrete", log: (l) => journal.push(l) });
    // g2 : trois phrases écartées, puis trois encore à la reprise (le faux Claude répond pareil) : un Gaulois écarté.
    expect(bilan).toEqual({ vocaux: 3, enVocal: 1, appels: 2, envoyees: 1, ecartees: 1, phrasesEcartees: 6, erreurs: 0 });
    // L'état vocal ne change pas les faits d'une bulle : la liste de travail n'est lue qu'une fois.
    expect(quoi(serveur)).toEqual(["vie_du_village_travail", "vocaux", "depense", "depense", "repliques"]);
    expect(serveur.appels[1]?.args).toEqual({ p_releve: { vocaux: [{ n: numeroDe(1), vocal: true }, { n: numeroDe(2), vocal: false }, { n: numeroDe(3), vocal: false }] } });
    // La dépense de chaque appel, notée aussitôt ; le Gaulois écarté compté une fois, avec la dernière.
    expect(envoiDe(serveur.appels[2])).toEqual({ depense: { appels: 1, entree: 812, sortie: 240, ecartees: 0 } });
    expect(envoiDe(serveur.appels[3])).toEqual({ depense: { appels: 1, entree: 812, sortie: 240, ecartees: 1 } });
    const envoi = envoiDe(serveur.appels[4]) as { repliques: { n: string; texte: string; faits: FaitsDuGaulois }[]; sans_bulle: string[] };
    // Le membre 1 est en vocal : sa bulle le dit sur la place, pas en salle de réunion.
    expect(envoi.repliques).toEqual([{ n: numeroDe(1), texte: "Le soir tombe, je flâne sur la place.", faits: { heure: "21 h 05", moment: "soir", lieu: "place", points: null, objets: ["Tunique bleue", "Braies à carreaux", "Bottes de cuir", "Gourdin"] } }]);
    // Les phrases écartées, reprise comprise : le Gaulois est noté comme demandé, sans bulle, pour 6 heures.
    expect(envoi.sans_bulle).toEqual([numeroDe(2)]);
    expect(appels.filter((a) => a.url === URL_CLAUDE)).toHaveLength(ESSAIS_PAR_PASSAGE);
    // La reprise ne demande que g2, avec les raisons de ses écarts.
    const reprise = String(appels.filter((a) => a.url === URL_CLAUDE)[1]?.init?.body);
    expect(reprise.match(/\\"g\\":\\"g\d+\\"/g)).toEqual(['\\"g\\":\\"g2\\"']);
    expect(reprise).toContain("phrases_ecartees_parce_que");
    expect(reprise).toContain("chiffre absent des faits : « 3 »");
    // Le journal de l'Action est public : ni identifiant Discord, ni numéro, ni clé, ni jeton, ni phrase entière, ni mot
    // interdit. Une ligne par phrase écartée, la règle et le fragment.
    const tout = journal.join("\n");
    for (const secret of [discordDe(1), discordDe(2), numeroDe(1), "cle-secrete", "jeton-robot-essai", "Une potion", "Toutatis", "J'ai rapporté 3 points"]) expect(tout).not.toContain(secret);
    expect(journal).toContain("Vie du village : g2, phrase 3 sur 3 écartée : chiffre absent des faits : « 3 ».");
    expect(journal).toContain("Vie du village : g2, phrase 1 sur 3 écartée à la reprise : mot interdit.");
    expect(journal.filter((l) => / écartée( à la reprise)? : /.test(l))).toHaveLength(6);
    expect(journal).toContain("Vie du village : 2 bulle(s) demandée(s), 1 envoyée(s), 1 Gaulois sans bulle après le contrôle (6 phrase(s) écartée(s)), 2 appel(s) à Claude, 1624 jetons d'entrée et 480 de sortie.");
  });

  it("garde la bulle trouvée à la reprise, et ne compte alors aucun Gaulois écarté", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send } = monde((_lot, essai) =>
      essai === 1
        ? { status: 200, body: reponseClaude(json([trois("g1", "Il est 21 h 05, santé !", "La GRANDE place !", "Vive Macron !"), trois("g2", `Une chope ${String.fromCodePoint(0x2014)} au Champ de bataille !`, "b", "c")])) }
        : { status: 200, body: reponseClaude(json([trois("g1", "Le soir, la place est à moi !", "b", "c")])) },
    );
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ appels: 2, envoyees: 2, ecartees: 0, phrasesEcartees: 3, erreurs: 0 });
    expect(quoi(serveur)).toEqual(["vie_du_village_travail", "depense", "depense", "repliques"]);
    expect(envoiDe(serveur.appels[2])).toEqual({ depense: { appels: 1, entree: 812, sortie: 240, ecartees: 0 } });
    const envoi = envoiDe(serveur.appels[3]) as { repliques: { n: string; texte: string }[]; sans_bulle: string[] };
    // La phrase de g2, nettoyée : le tiret long devient une virgule, la majuscule du lieu des faits tombe.
    expect(envoi.repliques.map((r) => [r.n, r.texte])).toEqual([[numeroDe(2), "Une chope, au champ de bataille !"], [numeroDe(1), "Le soir, la place est à moi !"]]);
    expect(envoi.sans_bulle).toEqual([]);
    expect(journal).toContain("Vie du village : g1, phrase 1 sur 3 écartée : chiffre absent des faits : « 21 », « 05 ».");
    expect(journal).toContain("Vie du village : g1, phrase 2 sur 3 écartée : majuscules : « GRANDE » ; majuscule hors d'un début de phrase : « GRANDE ».");
    expect(journal).toContain("Vie du village : g1, phrase 3 sur 3 écartée : majuscule hors d'un début de phrase : « Macron ».");
    expect(journal).toContain("Vie du village : retouches avant le contrôle : tiret long ×1, majuscule d'un mot des faits ×1.");
  });

  it("ne reprend pas quand le temps du passage manque : les Gaulois écartés sont comptés avec le premier appel", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send, appels } = monde(() => ({ status: 200, body: reponseClaude(json([trois("g1", "Une potion !", "Vive Macron !", "J'ai 3 chopes."), trois("g2", "Vive Macron !", "Une potion !", "J'ai 3 chopes.")])) }));
    // Le relevé vocal et l'appel ont pris presque tout le temps du passage.
    let t = 0;
    const horloge = () => (t += FIN_DES_APPELS_MS);
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l), horloge });
    expect(bilan).toMatchObject({ appels: 1, envoyees: 0, ecartees: 2 });
    expect(appels.filter((a) => a.url === URL_CLAUDE)).toHaveLength(1);
    expect(envoiDe(serveur.appels[1])).toEqual({ depense: { appels: 1, entree: 812, sortie: 240, ecartees: 2 } });
    expect(envoiDe(serveur.appels[2])).toEqual({ repliques: [], sans_bulle: [numeroDe(1), numeroDe(2)] });
    expect(journal).toContain("Vie du village : plus le temps d'une reprise dans ce passage.");
  });

  it("compte quand même les Gaulois écartés quand l'API refuse la reprise avant tout calcul, sans erreur", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send } = monde((_lot, essai) =>
      essai === 1 ? { status: 200, body: reponseClaude(json([trois("g1", "Vive Macron !", "Une potion !", "J'ai 3 chopes."), trois("g2", "Le soir, je trinque !", "b", "c")])) } : { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "plus tard" } } },
    );
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
    expect(bilan).toMatchObject({ appels: 2, envoyees: 1, ecartees: 1, erreurs: 0 });
    expect(quoi(serveur)).toEqual(["vie_du_village_travail", "depense", "depense", "repliques"]);
    expect(envoiDe(serveur.appels[1])).toEqual({ depense: { appels: 1, entree: 812, sortie: 240, ecartees: 0 } });
    // La reprise n'a rien coûté : zéro appel, zéro jeton, le Gaulois écarté seul.
    expect(envoiDe(serveur.appels[2])).toEqual({ depense: { appels: 0, entree: 0, sortie: 0, ecartees: 1 } });
    expect(envoiDe(serveur.appels[3])).toMatchObject({ sans_bulle: [numeroDe(1)] });
  });

  it("reprend un Gaulois oublié par Claude, sans le compter écarté au contrôle", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
    const { send } = monde((_lot, essai, etiquettes) => ({ status: 200, body: reponseClaude(json(essai === 1 ? [trois("g1", "Le soir tombe.", "b", "c")] : etiquettes.map((g) => trois(g, "Une chope à la taverne, enfin !", "b", "c")))) }));
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
    expect(bilan).toMatchObject({ appels: 2, envoyees: 2, ecartees: 0, phrasesEcartees: 0 });
  });

  it("garde la dépense quand le serveur refuse les bulles", async () => {
    const serveur = fauxServeur({
      vie_du_village_travail: [travail(lignes)],
      noter_vie_du_village: (args) => ("repliques" in (args["p_releve"] as object) ? { ok: false, error: "invalid_releve" } : NOTE_OK()),
    });
    const { send } = monde(() => ({ status: 200, body: reponseClaude(json([trois("g1", "Bonsoir la place !", "b", "c")])) }));
    const journal: string[] = [];
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: (l) => journal.push(l) });
    expect(bilan).toMatchObject({ appels: 2, envoyees: 0, erreurs: 1 });
    // Refusé en entier : tout le lot est noté comme demandé sans bulle, pour ne pas redemander Claude au passage suivant.
    expect(quoi(serveur)).toEqual(["vie_du_village_travail", "depense", "depense", "repliques", "sans_bulle"]);
    expect(serveur.appels[4]?.args).toEqual({ p_releve: { sans_bulle: [numeroDe(1), numeroDe(2)] } });
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

  it("note quand même la dépense d'une réponse refusée, coupée ou mal formée, et ses Gaulois comme demandés sans bulle, sans reprise ni erreur", async () => {
    const coupee = reponseClaude(json([trois("g1", "Bonsoir la place !", "b", "c")]), { stop_reason: "max_tokens" });
    for (const reponse of [reponseClaude("", { stop_reason: "refusal" }), coupee, reponseClaude("pas du JSON")]) {
      const serveur = fauxServeur({ vie_du_village_travail: [travail(lignes)], noter_vie_du_village: NOTE_OK });
      const { send, appels } = monde(() => ({ status: 200, body: reponse }));
      const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
      expect(bilan).toMatchObject({ appels: 1, envoyees: 0, ecartees: 0, erreurs: 0 });
      // La même demande donnerait la même chose : pas de reprise.
      expect(appels.filter((a) => a.url === URL_CLAUDE)).toHaveLength(1);
      expect(quoi(serveur)).toEqual(["vie_du_village_travail", "depense", "repliques"]);
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
    // Claude n'a donné aucune phrase : une reprise pour les deux Gaulois.
    expect(bilan).toMatchObject({ vocaux: 0, erreurs: 1, appels: 2 });
    expect(appels.filter((a) => a.url.startsWith("https://discord.com/"))).toHaveLength(1);
    expect(journal.some((l) => l.startsWith("::warning::") && l.includes("401"))).toBe(true);
  });

  it("s'arrête si la liste de travail ne se lit pas", async () => {
    const serveur = fauxServeur({ vie_du_village_travail: [{ ok: false, error: "forbidden" }] });
    await expect(vieDuVillage({ rpc: serveur.rpc, fetch: fauxFetch(() => "panne").send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} })).rejects.toThrow("forbidden");
  });

  it("demande au plus 12 Gaulois par appel, jamais plus que le serveur n'en accepte dans un envoi", async () => {
    expect(GAULOIS_PAR_APPEL).toBeLessThanOrEqual(MAX_REPLIQUES_PAR_PASSAGE);
    const nombreux = Array.from({ length: 30 }, (_, i) => gaulois(i + 1));
    const serveur = fauxServeur({ vie_du_village_travail: [travail(nombreux)], noter_vie_du_village: NOTE_OK });
    const { send } = monde((_lot, _essai, etiquettes) => ({ status: 200, body: reponseClaude(json(etiquettes.map((g) => trois(g, "Le soir tombe sur la place.", "b", "c")))) }));
    const bilan = await vieDuVillage({ rpc: serveur.rpc, fetch: send, sleep: sansPause, discord: null, cleClaude: "cle", log: () => {} });
    expect(bilan).toMatchObject({ appels: 1, envoyees: 12 });
    expect((envoiDe(serveur.appels.at(-1)) as { repliques: unknown[] }).repliques).toHaveLength(12);
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
