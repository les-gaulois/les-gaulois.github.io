import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cacheDesCadres, cadresDuCache, lireCadresDesJoueurs } from "../../src/lib/cadres-joueurs";
import { CADRES_ANIMES, CARTE_H, CARTE_L, HAUTEUR_DU_CADRE, LARGEUR_DU_CADRE, MARGE_DU_CADRE, cadreAnime, epaisseurDuCadre, peindreLeCadre } from "../../src/lib/fx/cadres-carte";
import { empreinte } from "../../src/lib/gaulois-joueurs";
import { CADRES, cadreParId, lireMesCadres, refusDeCadre } from "../../src/lib/village/cadres";
import { RAYONS_BOUTIQUE, RAYON_CADRES } from "../../src/lib/village/boutique-rayons";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIGRATION = readFileSync("supabase/migrations/20261117001600_cadres_des_cartes.sql", "utf8").replace(/\r\n/g, "\n");
const peint = (id: (typeof CADRES_ANIMES)[number], t: number): Uint8ClampedArray => {
  const tampon = new Uint8ClampedArray(LARGEUR_DU_CADRE * HAUTEUR_DU_CADRE * 4);
  peindreLeCadre(id, t, tampon);
  return tampon;
};
const opacite = (tampon: Uint8ClampedArray, x: number, y: number): number => tampon[((y + MARGE_DU_CADRE) * LARGEUR_DU_CADRE + x + MARGE_DU_CADRE) * 4 + 3]!;

describe("le rayon des cadres", () => {
  it("vend vingt-six cadres, chacun dessiné, nommé et décrit, du plus commun au plus rare", () => {
    expect(CADRES).toHaveLength(26);
    expect(CADRES.map((c) => c.id)).toEqual([...CADRES_ANIMES]);
    for (const c of CADRES) {
      expect(c.nom.length).toBeGreaterThan(2);
      expect(c.description.endsWith(".")).toBe(true);
      expect(cadreAnime(c.id)).toBe(c.id);
    }
    const rangs = ["commun", "peu-commun", "epique", "mystique", "legendaire"];
    const ordre = CADRES.map((c) => rangs.indexOf(c.rarete));
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b));
    expect(cadreParId("nexiste-pas")).toBeNull();
    expect(cadreAnime("nexiste-pas")).toBeNull();
  });

  it("détaille selon la rareté : sept cases pour les communs et peu communs, dix au-delà", () => {
    for (const c of CADRES) expect(epaisseurDuCadre(c.id)).toBe(c.rarete === "commun" || c.rarete === "peu-commun" ? 7 : 10);
  });

  it("garde au serveur la même liste et les mêmes raretés", () => {
    const bloc = MIGRATION.slice(MIGRATION.indexOf("-- <cadres>"), MIGRATION.indexOf("-- </cadres>"));
    const lus = [...bloc.matchAll(/\('([a-z-]+)', '([a-z-]+)'\)/g)].map((m) => [m[1], m[2]]);
    expect(lus).toEqual(CADRES.map((c) => [c.id, c.rarete]));
  });

  it("est le neuvième onglet de la boutique, à la suite des cartes", () => {
    expect(RAYONS_BOUTIQUE.at(-1)).toBe(RAYON_CADRES);
    expect(RAYONS_BOUTIQUE.at(-2)).toBe("cartes");
  });
});

describe("le dessin des cadres", () => {
  it("peint chaque cadre autour de la carte, laisse son milieu libre, et redonne la même image au même instant", () => {
    for (const id of CADRES_ANIMES) {
      const a = peint(id, 2.4);
      // Le bord de la carte est peint sur les quatre côtés ; le milieu de l'image reste transparent.
      expect(opacite(a, CARTE_L / 2, 2), id).toBe(255);
      expect(opacite(a, 2, CARTE_H / 2), id).toBe(255);
      expect(opacite(a, CARTE_L - 3, CARTE_H / 2), id).toBe(255);
      expect(opacite(a, CARTE_L / 2, CARTE_H - 3), id).toBe(255);
      expect(opacite(a, CARTE_L / 2, CARTE_H / 2), id).toBe(0);
      expect(Array.from(peint(id, 2.4))).toEqual(Array.from(a));
    }
  });

  it("anime chaque cadre : deux instants ne donnent pas la même image", () => {
    for (const id of CADRES_ANIMES) expect(Array.from(peint(id, 1)), id).not.toEqual(Array.from(peint(id, 1.35)));
  });

  it("ne peint jamais hors de sa toile, même avec un tampon trop court", () => {
    const tampon = new Uint8ClampedArray(LARGEUR_DU_CADRE * HAUTEUR_DU_CADRE * 4);
    for (const id of CADRES_ANIMES) expect(() => peindreLeCadre(id, 7.7, tampon)).not.toThrow();
  });
});

describe("ce que le serveur répond", () => {
  it("lit les cadres du compte, ignore l'inconnu, et ne montre qu'un cadre possédé", () => {
    const mes = lireMesCadres({ ok: true, solde: 500, peut_acheter: true, prix: { commun: 300, legendaire: 9000, autre: 1 }, cadres: [{ cadre: "soleil" }, { cadre: "nexiste-pas" }, 4], porte: "soleil" });
    expect(mes).toEqual({ solde: 500, peutAcheter: true, prix: { commun: 300, legendaire: 9000 }, possedes: ["soleil"], porte: "soleil" });
    expect(lireMesCadres({ ok: true, solde: 0, peut_acheter: false, prix: {}, cadres: [], porte: "givre" })?.porte).toBeNull();
    expect(lireMesCadres({ ok: false })).toBeNull();
    expect(lireMesCadres({ ok: true, solde: -1, peut_acheter: true, prix: {}, cadres: [] })).toBeNull();
    expect(refusDeCadre("mode_god")).toContain("mode GOD");
    expect(refusDeCadre("inconnu")).toContain("réessayez");
  });

  it("reprend les règles des cartes : prix d'une bannière, verrou du compte, pas d'achat en mode GOD, journal « cadre/ »", () => {
    expect(MIGRATION).toContain("v_prix := internal.banniere_prix(v_rarete);");
    expect(MIGRATION).toContain("perform internal.village_verrou(v_uid);");
    expect(MIGRATION).toContain("perform internal.fail('mode_god');");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'achat', v_prix, 'cadre/' || p_cadre);");
    expect(MIGRATION).toContain("foreign key (user_id, cadre) references internal.gaulois_cadres (user_id, cadre);");
    expect(MIGRATION).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("n'ouvre la lecture des cadres des joueurs qu'à la clé de service, et les achats qu'aux comptes connectés", () => {
    expect(MIGRATION).toContain("revoke all on function public.cadres_des_joueurs(text[]) from public, anon, authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.cadres_des_joueurs(text[]) to service_role;");
    for (const f of ["get_mes_cadres()", "acheter_cadre(text, integer)", "choisir_cadre(text)"]) {
      expect(MIGRATION).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function public.${f} to authenticated;`);
    }
    expect(MIGRATION).toContain("revoke all on table internal.gaulois_cadres from public, anon, authenticated;");
  });

  it("garde dans la sauvegarde tout ce qu'elle gardait, et les cadres en plus", () => {
    const avant = readFileSync("supabase/migrations/20261117001200_cartes_du_gaulois.sql", "utf8").replace(/\r\n/g, "\n");
    const cles = (sql: string) => [...sql.slice(sql.indexOf("function public.export_site()")).matchAll(/^ {4}'([a-z_]+)',/gm)].map((m) => m[1]);
    expect(cles(MIGRATION)).toEqual([...cles(avant), "gaulois_cadres"]);
    expect(MIGRATION).toContain("'version', 11,");
  });
});

describe("les cadres des joueurs, pour les fiches", () => {
  it("lit par empreinte, ignore un cadre inconnu, et se relit depuis son fichier", async () => {
    const lecture = await lireCadresDesJoueurs(["a", "b", "c"], "https://exemple.test", "cle", (url, cle, empreintes) => {
      expect(empreintes).toEqual(["a", "b", "c"].map(empreinte));
      return Promise.resolve({ ok: true, cadres: { [empreinte("a")]: "soleil", [empreinte("b")]: "nexiste-pas" } });
    });
    expect(lecture.etat).toBe("lu");
    expect([...lecture.cadres]).toEqual([["a", "soleil"]]);
    const fichier = join(mkdtempSync(join(tmpdir(), "cadres-")), "cadres.json");
    writeFileSync(fichier, JSON.stringify(cacheDesCadres(lecture.cadres, new Date("2026-11-17T12:00:00Z"))));
    expect(readFileSync(fichier, "utf8")).not.toContain('"a"');
    expect([...cadresDuCache(fichier, ["a", "b"])]).toEqual([["a", "soleil"]]);
    expect(cadresDuCache(join(tmpdir(), "nexiste-pas.json"), ["a"]).size).toBe(0);
  });

  it("ne lève jamais : sans réglage, sans la migration ou en panne, aucun cadre et la raison en clair", async () => {
    expect((await lireCadresDesJoueurs(["a"], undefined, undefined)).etat).toBe("sans-reglage");
    const absente = await lireCadresDesJoueurs(["a"], "u", "k", () => Promise.reject(Object.assign(new Error("x"), { code: "PGRST202" })));
    expect(absente.etat).toBe("fonction-absente");
    expect(absente.warning).toContain("20261117001600");
    const panne = await lireCadresDesJoueurs(["a"], "u", "k", () => Promise.reject(new Error("secret du serveur")));
    expect(panne.etat).toBe("panne");
    expect(panne.warning).not.toContain("secret");
    expect(panne.cadres.size).toBe(0);
  });
});
