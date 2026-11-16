import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index.ts";
import { octetsDeLaCouleur, pngDeLaBanniere } from "../../src/lib/banniere-image";
import {
  AUCUNE_BANNIERE,
  BANNIERES_MEMBRES_FILE,
  bannieresDuCache,
  cacheDesBannieres,
  fondsDesLignes,
  journalDesBannieres,
  lireBannieresDesJoueurs,
  type BannieresCall,
} from "../../src/lib/bannieres-joueurs";
import { empreinte, GAULOIS_LOT } from "../../src/lib/gaulois-joueurs";

// Des valeurs d'essai, qui ne désignent personne.
const URL_ESSAI = "https://projet-essai.supabase.co";
const CLE = "sb_secret_essai";
const A = "EssaiAaa1";
const B = "EssaiBbb2";
const C = "EssaiCcc3";
const UNE = BANNIERES[0]!;
const AUTRE = BANNIERES.at(-1)!;

/** Un serveur qui rend la bannière des empreintes connues, et note ce qu'on lui envoie. */
function serveur(parId: Record<string, unknown>) {
  const envois: string[][] = [];
  const call: BannieresCall = async (url, key, empreintes) => {
    expect(url).toBe(URL_ESSAI);
    expect(key).toBe(CLE);
    envois.push([...empreintes]);
    const bannieres: Record<string, unknown> = {};
    for (const [id, banniere] of Object.entries(parId)) if (empreintes.includes(empreinte(id))) bannieres[empreinte(id)] = banniere;
    return { ok: true, bannieres };
  };
  return { call, envois };
}

describe("les bannières des membres, lues au serveur", () => {
  it("rend la bannière et sa rareté sous l'identifiant demandé, en n'envoyant que des empreintes", async () => {
    const { call, envois } = serveur({ [A]: UNE.id, [C]: AUTRE.id });
    const lecture = await lireBannieresDesJoueurs([A, B, C, A, null, ""], URL_ESSAI, CLE, call);
    expect(lecture.etat).toBe("lu");
    expect(lecture.warning).toBeNull();
    expect([...lecture.bannieres]).toEqual([
      [A, { id: UNE.id, rarete: UNE.rarete }],
      [C, { id: AUTRE.id, rarete: AUTRE.rarete }],
    ]);
    expect(envois).toEqual([[empreinte(A), empreinte(B), empreinte(C)]]);
    expect(JSON.stringify(envois)).not.toContain(A);
  });

  it("ignore une bannière que le catalogue ne connaît pas, ou une valeur qui n'est pas un texte", async () => {
    const { call } = serveur({ [A]: "banniere-inconnue", [B]: 12, [C]: UNE.id });
    const lecture = await lireBannieresDesJoueurs([A, B, C], URL_ESSAI, CLE, call);
    expect([...lecture.bannieres.keys()]).toEqual([C]);
  });

  it("ne demande rien sans réglage, ni pour une liste vide", async () => {
    const { call, envois } = serveur({});
    expect(await lireBannieresDesJoueurs([A], undefined, CLE, call)).toMatchObject({ etat: "sans-reglage", bannieres: AUCUNE_BANNIERE });
    expect(await lireBannieresDesJoueurs([A], URL_ESSAI, "", call)).toMatchObject({ etat: "sans-reglage" });
    expect(await lireBannieresDesJoueurs([], URL_ESSAI, CLE, call)).toEqual({ bannieres: AUCUNE_BANNIERE, warning: null, etat: "lu" });
    expect(envois).toEqual([]);
  });

  it("dit que la migration manque, par une simple note", async () => {
    const call: BannieresCall = async () => {
      throw Object.assign(new Error("Could not find the function"), { code: "PGRST202" });
    };
    const lecture = await lireBannieresDesJoueurs([A], URL_ESSAI, CLE, call);
    expect(lecture.etat).toBe("fonction-absente");
    expect(lecture.bannieres).toBe(AUCUNE_BANNIERE);
    expect(journalDesBannieres(lecture)).toMatch(/^::notice::Bannières de la liste : .*20261116000400/);
  });

  it("en cas de panne, de refus ou de réponse mal formée : aucune bannière, et un avertissement sans le message du serveur", async () => {
    const secret = `${URL_ESSAI}/rest/v1 ${CLE} ${empreinte(A)}`;
    const panne = await lireBannieresDesJoueurs([A], URL_ESSAI, CLE, async () => {
      throw new Error(secret);
    });
    expect(panne).toMatchObject({ etat: "panne", bannieres: AUCUNE_BANNIERE });
    const ligne = journalDesBannieres(panne)!;
    expect(ligne).toMatch(/^::warning::/);
    for (const mot of [URL_ESSAI, CLE, empreinte(A), A]) expect(ligne).not.toContain(mot);
    for (const reponse of [null, "non", { ok: false, error: "invalid_request" }, { ok: true }, { ok: true, bannieres: [] }]) {
      expect((await lireBannieresDesJoueurs([A], URL_ESSAI, CLE, async () => reponse)).etat).toBe("panne");
    }
  });

  it("découpe une longue liste en lots de la taille que le serveur accepte", async () => {
    const { call, envois } = serveur({});
    const ids = Array.from({ length: GAULOIS_LOT + 3 }, (_, i) => `Essai${i}`);
    await lireBannieresDesJoueurs(ids, URL_ESSAI, CLE, call);
    expect(envois.map((lot) => lot.length)).toEqual([GAULOIS_LOT, 3]);
  });
});

describe("les bannières gardées pour la construction du site", () => {
  const dossiers: string[] = [];
  const fichier = (contenu: string): string => {
    const dossier = mkdtempSync(join(tmpdir(), "bannieres-"));
    dossiers.push(dossier);
    const chemin = join(dossier, "bannieres.json");
    writeFileSync(chemin, contenu);
    return chemin;
  };
  afterEach(() => {
    for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
  });

  it("range par empreinte, jamais par identifiant, et se relit pour les identifiants demandés", () => {
    const carte = new Map([[A, { id: UNE.id, rarete: UNE.rarete }]]);
    const cache = cacheDesBannieres(carte, new Date("2026-11-16T10:00:00Z"));
    expect(cache).toEqual({ version: 1, luLe: "2026-11-16T10:00:00.000Z", bannieres: { [empreinte(A)]: UNE.id } });
    const chemin = fichier(JSON.stringify(cache));
    expect(readFileSync(chemin, "utf8")).not.toContain(A);
    expect([...bannieresDuCache(chemin, [A, B, null])]).toEqual([[A, { id: UNE.id, rarete: UNE.rarete }]]);
    expect(bannieresDuCache(chemin, [B])).toBe(AUCUNE_BANNIERE);
  });

  it("fichier absent, illisible, d'une autre version ou à la bannière inconnue : aucune bannière", () => {
    expect(bannieresDuCache(join(tmpdir(), "bannieres-absent.json"), [A])).toBe(AUCUNE_BANNIERE);
    expect(bannieresDuCache(fichier("{"), [A])).toBe(AUCUNE_BANNIERE);
    expect(bannieresDuCache(fichier(JSON.stringify({ version: 2, luLe: "2026-11-16T10:00:00Z", bannieres: { [empreinte(A)]: UNE.id } })), [A])).toBe(AUCUNE_BANNIERE);
    expect(bannieresDuCache(fichier(JSON.stringify({ version: 1, luLe: "2026-11-16T10:00:00Z", bannieres: { [empreinte(A)]: "banniere-inconnue" } })), [A])).toBe(AUCUNE_BANNIERE);
  });

  it("le fichier est dans .cache/, que Git ignore", () => {
    expect(BANNIERES_MEMBRES_FILE.startsWith(".cache/")).toBe(true);
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.cache\/$/m);
  });
});

describe("l'image d'une bannière", () => {
  it("lit une couleur en trois ou six chiffres, et refuse le reste", () => {
    expect(octetsDeLaCouleur("#0a1230")).toEqual([10, 18, 48]);
    expect(octetsDeLaCouleur("#FA0")).toEqual([255, 170, 0]);
    expect(() => octetsDeLaCouleur("rouge")).toThrow();
  });

  it("rend un PNG de 124 × 80 points pour une bannière du catalogue, rien pour une inconnue", async () => {
    const png = (await pngDeLaBanniere(UNE.id))!;
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([124, 80]);
    expect(await pngDeLaBanniere("banniere-inconnue")).toBeNull();
  });
});

describe("ce que la liste des membres reçoit", () => {
  it("le chemin de l'image et la rareté, par identifiant public", () => {
    expect(fondsDesLignes(new Map([[A, { id: UNE.id, rarete: UNE.rarete }]]))).toEqual({ [A]: { image: `/bannieres/${UNE.id}.png`, rarete: UNE.rarete } });
    expect(fondsDesLignes(AUCUNE_BANNIERE)).toEqual({});
  });
});
