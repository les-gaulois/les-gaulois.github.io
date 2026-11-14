import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ficheCard, ficheFacts } from "../../src/lib/fiche-image";
import { ficheImageFile, ficheImageVersion } from "../../src/lib/fiches-discord";
import { TENUE_DE_DEPART, type Tenue } from "../../src/lib/gaulois";
import { avecOuSansGaulois, gauloisDuPassage, idsAuPseudoPublic, lectureDuRobot, nommes, seulement, type LireGaulois } from "../../src/lib/gaulois-envois";
import { AUCUN_GAULOIS, empreinte, type GauloisCall, type GauloisParJoueur } from "../../src/lib/gaulois-joueurs";
import { GazetteFonts, renderGazetteCard } from "../../src/lib/gazette-image";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";
import type { Victory } from "../../src/lib/victoires";
import { renderVictoryCard, victoryCard } from "../../src/lib/victoires-image";

// Des valeurs d'essai, qui ne désignent personne.
const URL_ESSAI = "https://projet-essai.supabase.co";
const CLE = "sb_secret_essai";
const ENV = { SUPABASE_URL: URL_ESSAI, SUPABASE_SECRET_KEY: CLE };
const A = "EssaiAaa1";
const B = "EssaiBbb2";
const C = "EssaiCcc3";
const D = "EssaiDdd4";
const BLOND: Tenue = { ...TENUE_DE_DEPART, teinte_cheveux: "blond", cheveux: "longs" };
/** La tenue de départ : roux, moustachu. */
const ROUX: Tenue = TENUE_DE_DEPART;
const SITE = "https://les-gaulois.github.io";

/** Un serveur simulé : il rend la tenue des empreintes connues et note chaque appel. Aucun réseau. */
function serveur(tenues: Record<string, Tenue>) {
  const appels: string[][] = [];
  const call: GauloisCall = async (url, key, empreintes) => {
    expect([url, key]).toEqual([URL_ESSAI, CLE]);
    appels.push([...empreintes]);
    const gaulois: Record<string, Tenue> = {};
    for (const [id, tenue] of Object.entries(tenues)) if (empreintes.includes(empreinte(id))) gaulois[empreinte(id)] = tenue;
    return { ok: true, gaulois };
  };
  return { call, appels };
}

/** Une lecture qui note ce qu'on lui demande et rend la carte donnée. */
function lecture(carte: GauloisParJoueur) {
  const demandes: string[][] = [];
  const lire: LireGaulois = async (ids) => {
    demandes.push([...ids]);
    return carte;
  };
  return { lire, demandes };
}

const member = (publicId: string | null, username: string | null, wins = 10): StoredMember => ({ role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId, username, team: { wins, losses: 5 } });
const LISTE: StoredMembers = {
  fetchedAt: "2026-11-13T12:53:34.636Z",
  members: [member(A, "Alpha", 900), member(B, "Bravo", 500), member(C, null, 300), member(null, null, 100), member(D, "Delta", 50)],
} as StoredMembers;

describe("les identifiants d'une image", () => {
  it("garde chaque identifiant une fois, sans vide ni joueur sans fiche", () => {
    expect(nommes([A, null, B, undefined, "", A, C])).toEqual([A, B, C]);
    expect(nommes([])).toEqual([]);
  });

  it("ne garde de la liste que les membres au pseudo public, ceux qui ont une fiche : jamais un anonyme", () => {
    expect(idsAuPseudoPublic(LISTE)).toEqual([A, B, D]);
    expect(idsAuPseudoPublic(LISTE)).not.toContain(C);
    expect(idsAuPseudoPublic(null)).toEqual([]);
  });

  it("ne donne à une image que les Gaulois de ceux qu'elle nomme", () => {
    const carte = new Map([
      [A, BLOND],
      [B, ROUX],
    ]);
    expect([...seulement(carte, [A, C]).entries()]).toEqual([[A, BLOND]]);
    expect(seulement(carte, [C, null]).size).toBe(0);
    expect(seulement(AUCUN_GAULOIS, [A]).size).toBe(0);
  });
});

describe("gauloisDuPassage", () => {
  it("ne lit rien tant qu'aucune image ne nomme un membre", async () => {
    const { lire, demandes } = lecture(new Map([[A, BLOND]]));
    const gauloisDe = gauloisDuPassage({ lire, log: () => {} });
    expect(demandes).toEqual([]);
    expect((await gauloisDe([null, undefined])).size).toBe(0);
    expect((await gauloisDe([])).size).toBe(0);
    expect(demandes).toEqual([]);
  });

  it("lit une seule fois par passage, pour tous ceux qu'une image peut nommer, et chaque image ne reçoit que les siens", async () => {
    const { lire, demandes } = lecture(
      new Map([
        [A, BLOND],
        [B, ROUX],
        [D, TENUE_DE_DEPART],
      ]),
    );
    const gauloisDe = gauloisDuPassage({ tous: () => idsAuPseudoPublic(LISTE), lire, log: () => {} });
    const premiere = await gauloisDe([A, null]);
    const seconde = await gauloisDe([B, D]);
    const troisieme = await gauloisDe([null]);
    expect(demandes).toEqual([[A, B, D]]);
    expect([...premiere.keys()]).toEqual([A]);
    expect([...seconde.keys()]).toEqual([B, D]);
    expect(troisieme.size).toBe(0);
  });

  it("sans liste de tous, lit les membres de la première image : un script qui ne poste qu'une image", async () => {
    const { lire, demandes } = lecture(new Map([[B, ROUX]]));
    const gauloisDe = gauloisDuPassage({ lire, log: () => {} });
    expect([...(await gauloisDe([A, B, A])).keys()]).toEqual([B]);
    expect(demandes).toEqual([[A, B]]);
  });

  it("deux images dessinées en même temps attendent la même lecture", async () => {
    const { lire, demandes } = lecture(new Map([[A, BLOND]]));
    const gauloisDe = gauloisDuPassage({ tous: () => [A, B], lire, log: () => {} });
    const [x, y] = await Promise.all([gauloisDe([A]), gauloisDe([B])]);
    expect(demandes).toHaveLength(1);
    expect([x.size, y.size]).toEqual([1, 0]);
  });

  it("une lecture qui échoue ne lève rien : les images partent sans Gaulois, et rien n'est relu au passage", async () => {
    const journal: string[] = [];
    let essais = 0;
    const gauloisDe = gauloisDuPassage({
      lire: async () => {
        essais++;
        throw new Error(`panne à ${URL_ESSAI} pour ${A}`);
      },
      log: (line) => journal.push(line),
    });
    expect((await gauloisDe([A])).size).toBe(0);
    expect((await gauloisDe([B])).size).toBe(0);
    expect(essais).toBe(1);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatch(/^::warning::Gaulois des images/);
    // Ni adresse ni identifiant au journal.
    expect(journal.join("\n")).not.toContain(URL_ESSAI);
    expect(journal.join("\n")).not.toContain(A);
  });

  it("une liste de tous qui échoue ne lève rien non plus", async () => {
    const gauloisDe = gauloisDuPassage({
      tous: () => {
        throw new Error("liste illisible");
      },
      lire: async () => new Map([[A, BLOND]]),
      log: () => {},
    });
    expect((await gauloisDe([A])).size).toBe(0);
  });
});

describe("lectureDuRobot, avec un serveur simulé", () => {
  it("envoie les empreintes des seuls membres demandés, jamais leurs identifiants, et rend leurs tenues", async () => {
    const { call, appels } = serveur({ [A]: BLOND, [C]: ROUX });
    const journal: string[] = [];
    const gauloisDe = gauloisDuPassage({ tous: () => idsAuPseudoPublic(LISTE), lire: lectureDuRobot(ENV, (l) => journal.push(l), call), log: (l) => journal.push(l) });
    const carte = await gauloisDe([A, B]);
    expect([...carte.entries()]).toEqual([[A, BLOND]]);
    expect(appels).toEqual([[A, B, D].map(empreinte)]);
    // L'anonyme C n'est jamais demandé, même si le serveur avait une tenue pour lui.
    expect(appels.flat()).not.toContain(empreinte(C));
    expect(JSON.stringify(appels)).not.toContain(A);
    expect(journal).toEqual([]);
  });

  it("sans réglage, ne demande rien et le dit d'une simple note", async () => {
    const { call, appels } = serveur({ [A]: BLOND });
    const journal: string[] = [];
    const gauloisDe = gauloisDuPassage({ lire: lectureDuRobot({}, (l) => journal.push(l), call) });
    expect((await gauloisDe([A])).size).toBe(0);
    expect(appels).toEqual([]);
    expect(journal).toEqual([expect.stringMatching(/^::notice::Gaulois des images : pas de SUPABASE_URL/)]);
  });

  it("une migration pas encore collée ou une panne donne des images sans Gaulois, sans lever d'erreur", async () => {
    for (const erreur of [Object.assign(new Error("Could not find the function public.gaulois_des_joueurs"), { code: "PGRST202" }), new Error("fetch failed")]) {
      const journal: string[] = [];
      const call: GauloisCall = async () => {
        throw erreur;
      };
      const gauloisDe = gauloisDuPassage({ lire: lectureDuRobot(ENV, (l) => journal.push(l), call), log: (l) => journal.push(l) });
      expect((await gauloisDe([A])).size).toBe(0);
      expect(journal).toHaveLength(1);
      expect(journal.join("\n")).not.toContain(CLE);
    }
  });
});

describe("avecOuSansGaulois", () => {
  const carte = new Map([[A, BLOND]]);
  it("dessine avec les Gaulois quand tout va bien", async () => {
    const vus: number[] = [];
    expect(await avecOuSansGaulois(carte, async (g) => (vus.push(g.size), "image"), () => {})).toBe("image");
    expect(vus).toEqual([1]);
  });

  it("refait le dessin sans eux s'il échoue avec eux : le message garde son image", async () => {
    const journal: string[] = [];
    const vus: number[] = [];
    const png = await avecOuSansGaulois(
      carte,
      async (g) => {
        vus.push(g.size);
        if (g.size > 0) throw new Error(`tenue de ${A} illisible`);
        return "image d'avant";
      },
      (l) => journal.push(l),
    );
    expect(png).toBe("image d'avant");
    expect(vus).toEqual([1, 0]);
    expect(journal).toEqual([expect.stringMatching(/^::warning::Gaulois des images/)]);
    expect(journal.join("\n")).not.toContain(A);
  });

  it("sans Gaulois, le dessin d'avant, et son erreur s'il échoue : le message part alors en texte, comme avant", async () => {
    let essais = 0;
    await expect(
      avecOuSansGaulois(AUCUN_GAULOIS, async () => {
        essais++;
        throw new Error("un caractère ne peut pas être dessiné");
      }),
    ).rejects.toThrow("un caractère");
    expect(essais).toBe(1);
  });
});

describe("de la lecture simulée à l'image, avec les vraies polices", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const dossier = mkdtempSync(join(tmpdir(), "gal-gaulois-envois-"));
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));

  // Une victoire d'exemple : deux membres au pseudo public, un membre confirmé sans fiche (identifiant nul).
  const VICTOIRE: Victory = {
    id: "essai",
    start: "2026-11-12T17:04:58.000Z",
    map: "Four Islands",
    seconds: 943,
    format: "4",
    gaulois: 3,
    players: 23,
    points: 1.81,
    crew: [
      { id: A, name: "Alpha" },
      { id: B, name: "Bravo" },
      { id: null, name: "Sans fiche" },
    ],
    unnamed: 0,
    outsiders: 0,
    rivals: [],
  };
  const dessinerVictoire = (g: GauloisParJoueur) => renderVictoryCard(victoryCard(VICTOIRE, "GAL", SITE, fonts.width, null, undefined, g), fonts, root, null);

  it("la victoire porte les Gaulois lus, et une lecture en panne rend exactement l'image d'avant", async () => {
    const avant = await dessinerVictoire(AUCUN_GAULOIS);
    const { call, appels } = serveur({ [A]: BLOND });
    const gauloisDe = gauloisDuPassage({ tous: () => idsAuPseudoPublic(LISTE), lire: lectureDuRobot(ENV, () => {}, call), log: () => {} });
    const gaulois = await gauloisDe(VICTOIRE.crew.map((p) => p.id));
    expect([...gaulois.keys()]).toEqual([A]);
    expect(victoryCard(VICTOIRE, "GAL", SITE, fonts.width, null, undefined, gaulois).gaulois).toHaveLength(1);
    const avec = await avecOuSansGaulois(gaulois, dessinerVictoire, () => {});
    expect(avec.equals(avant)).toBe(false);
    expect(appels).toHaveLength(1);

    const enPanne = gauloisDuPassage({
      lire: lectureDuRobot(ENV, () => {}, async () => {
        throw new Error("fetch failed");
      }),
      log: () => {},
    });
    const sans = await avecOuSansGaulois(await enPanne(VICTOIRE.crew.map((p) => p.id)), dessinerVictoire, () => {});
    expect(sans.equals(avant)).toBe(true);
  }, 60_000);

  it("l'adresse de l'image d'une fiche change quand le Gaulois paraît ou change, et revient sans lui", async () => {
    const facts = ficheFacts(LISTE.members, LISTE.members[0]!)!;
    expect(facts.id).toBe(A);
    const ecrire = async (g: GauloisParJoueur) => {
      const file = ficheImageFile(A, dossier);
      mkdirSync(join(dossier, "public", "generated", "fiches"), { recursive: true });
      writeFileSync(file, await avecOuSansGaulois(seulement(g, [A]), (carte) => renderGazetteCard(ficheCard(facts, "GAL", SITE, LISTE.fetchedAt, fonts.width, carte), fonts, root), () => {}));
      return ficheImageVersion(A, dossier);
    };
    const sans = await ecrire(AUCUN_GAULOIS);
    const blond = await ecrire(new Map([[A, BLOND]]));
    const roux = await ecrire(new Map([[A, ROUX]]));
    // Le Gaulois d'un autre membre ne touche pas cette fiche.
    const autre = await ecrire(new Map([[B, BLOND]]));
    expect(sans).toMatch(/^[0-9a-f]{12}$/);
    expect(new Set([sans, blond, roux]).size).toBe(3);
    expect(autre).toBe(sans);
  }, 60_000);
});
