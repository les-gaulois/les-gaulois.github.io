import { afterEach, describe, expect, it, vi } from "vitest";

// Toute lecture du disque est notée : construire la consigne ne doit en faire aucune (ni `data/`, ni rien d'autre).
const lectures: string[] = [];
const espion = (nom: string) => (...args: unknown[]) => {
  lectures.push(`${nom} ${String(args[0])}`);
  throw new Error(`lecture interdite : ${String(args[0])}`);
};
vi.mock("node:fs", async (original) => {
  const vrai = await original<typeof import("node:fs")>();
  return { ...vrai, default: { ...vrai, readFileSync: espion("readFileSync"), readdirSync: espion("readdirSync"), existsSync: espion("existsSync") }, readFileSync: espion("readFileSync"), readdirSync: espion("readdirSync"), existsSync: espion("existsSync") };
});
vi.mock("node:fs/promises", async (original) => {
  const vrai = await original<typeof import("node:fs/promises")>();
  return { ...vrai, default: { ...vrai, readFile: espion("readFile"), readdir: espion("readdir") }, readFile: espion("readFile"), readdir: espion("readdir") };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la consigne de l'API qui écrit l'almanach", () => {
  it("se construit sans rien lire du disque ni du réseau : ni data/, ni le serveur", async () => {
    const reseau = vi.fn(() => Promise.reject(new Error("réseau interdit")));
    vi.stubGlobal("fetch", reseau);
    const e = await import("../../src/lib/village/monde/almanach/ecriture");
    const catalogue = e.catalogueUtilisable();
    const systeme = e.consigne(catalogue);
    const format = e.formatDeLaReponse(catalogue);
    const corps = Array.from({ length: 65 }, (_v, k) => e.corpsDeLaRequete(systeme, format, e.graine(k, catalogue.ancres)));
    expect(corps).toHaveLength(65);
    expect(reseau).not.toHaveBeenCalled();
    expect(lectures).toEqual([]);
  });

  it("ne contient que le catalogue des figurants, les lieux, les règles et des exemples", async () => {
    const e = await import("../../src/lib/village/monde/almanach/ecriture");
    const { FIGURANTS } = await import("../../src/lib/village/monde/almanach/figurants");
    const { ANCRES } = await import("../../src/lib/village/monde/almanach/ancres");
    const catalogue = e.catalogueUtilisable();
    const systeme = e.consigne(catalogue);
    for (const f of FIGURANTS) expect(systeme).toContain(`"id":"${f.id}"`);
    for (const a of ANCRES) expect(systeme).toContain(`"id":"${a.id}"`);
    // Les réglages du dessinateur y sont dits.
    expect(systeme).toContain("ligne d'eau");
    expect(systeme).toContain("vers la droite");
    // Ni membre, ni pseudo, ni chiffre du clan : aucun nom de données du site.
    for (const mot of ["publicId", "username", "data/", "supabase", "statère", "points rapportés", "victoire", "GAL"]) expect(systeme).not.toContain(mot);
    // La demande d'une requête ne dit que sa graine, et les titres déjà écrits.
    const g = e.graine(7, catalogue.ancres);
    const demande = e.demande(g, ["Un vol d'oies au crépuscule"]);
    expect(demande).toContain(g.ancres[0]!);
    expect(demande).toContain("Un vol d'oies au crépuscule");
  });

  it("n'est importée que de ce qui ne lit rien : ses modules ne chargent ni le disque, ni data, ni le serveur", async () => {
    const { readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const dossier = "src/lib/village/monde/almanach/";
    const fichiers = ["ecriture.ts", "moment.ts", "ancres.ts", "jeu.ts", "reglages-figurants.ts", "figurants.ts", "type.ts"];
    for (const f of fichiers) {
      const source = readFileSync(dossier + f, "utf8");
      for (const interdit of [/from "node:fs/, /from "fs"/, /\/data["/]/, /compte\//, /supabase/i, /from "\.\.\/\.\.\/\.\.\/data"/]) expect(source, `${f} : ${interdit}`).not.toMatch(interdit);
    }
  });
});
