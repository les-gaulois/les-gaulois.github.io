import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLE_MODELE, TEINTE_CHEVEUX, TENUE_DE_DEPART, changerModele, changerObjet, type Tenue } from "../../src/lib/gaulois";
import { modeleParId } from "../../src/lib/village/modeles";
import { lireVitrine, rareteDuCadre } from "../../src/lib/village/vitrine";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
/** Le corps d'une fonction d'une migration, de son `create` au `$$;` qui la ferme. */
const fonction = (texte: string, nom: string) => {
  const debut = texte.indexOf(`create or replace function ${nom}(`);
  expect(debut, nom).toBeGreaterThanOrEqual(0);
  return texte.slice(debut, texte.indexOf("$$;\n", debut) + 4);
};

const gaulois = (champs: Record<string, unknown> = {}) => ({ nom: "Brennos", tenue: TENUE_DE_DEPART, moi: false, gravures: [], ...champs });

describe("lireVitrine", () => {
  it("garde l'ordre du serveur, le nom, la tenue, le familier et la bannière", () => {
    const lus = lireVitrine({
      ok: true,
      gaulois: [gaulois({ nom: "  Brennos ", familier: "agneau-laineux", banniere: "abysses-lumineuses" }), gaulois({ nom: "Ambiorix", moi: true })],
    });
    expect(lus?.map((g) => g.nom)).toEqual(["Brennos", "Ambiorix"]);
    expect(lus?.[0]).toMatchObject({ familier: "agneau-laineux", banniere: "abysses-lumineuses", moi: false });
    expect(lus?.[1]).toMatchObject({ familier: null, banniere: null, moi: true });
    expect(lus?.[0]?.tenue).toEqual(TENUE_DE_DEPART);
  });

  it("lit un serveur d'avant la vitrine : ni familier ni bannière", () => {
    const lus = lireVitrine({ ok: true, gaulois: [{ nom: "Brennos", tenue: TENUE_DE_DEPART, moi: false }] });
    expect(lus).toEqual([{ nom: "Brennos", tenue: TENUE_DE_DEPART, moi: false, familier: null, banniere: null, carte: null }]);
  });

  it("lit la finition de carte de chacun, et ignore ce qui n'est pas un identifiant", () => {
    const lus = lireVitrine({
      ok: true,
      gaulois: [
        { nom: "Brennos", tenue: TENUE_DE_DEPART, moi: false, carte: "prisme" },
        { nom: "Ambiorix", tenue: TENUE_DE_DEPART, moi: false, carte: 12 },
        { nom: "Dumnorix", tenue: TENUE_DE_DEPART, moi: false, carte: null },
      ],
    });
    expect(lus?.map((g) => g.carte)).toEqual(["prisme", null, null]);
  });

  it("laisse de côté un Gaulois sans nom ou sans tenue, sans cacher les autres", () => {
    const lus = lireVitrine({ ok: true, gaulois: [gaulois({ nom: "" }), gaulois({ tenue: "rien" }), null, gaulois({ nom: "Ambiorix" })] });
    expect(lus?.map((g) => g.nom)).toEqual(["Ambiorix"]);
  });

  it("garde un membre dont la tenue a un objet que le site ne connaît pas encore", () => {
    const couronne = changerObjet(TENUE_DE_DEPART, "tete", "couronne");
    const lus = lireVitrine({ ok: true, gaulois: [gaulois({ tenue: { ...couronne, haut: "objet-de-demain", teinte_cheveux: "couleur-de-demain", modele: "modele-de-demain" } })] });
    expect(lus?.[0]?.nom).toBe("Brennos");
    expect(lus?.[0]?.tenue.tete).toBe("couronne");
    expect(lus?.[0]?.tenue.haut).toBe(TENUE_DE_DEPART.haut);
    expect(lus?.[0]?.tenue[TEINTE_CHEVEUX]).toBe(TENUE_DE_DEPART[TEINTE_CHEVEUX]);
    expect(lus?.[0]?.tenue[CLE_MODELE]).toBeUndefined();
  });

  it("écarte un identifiant de familier ou de bannière qui n'en a pas la forme", () => {
    const lus = lireVitrine({ ok: true, gaulois: [gaulois({ familier: "<script>", banniere: 42 })] });
    expect(lus?.[0]).toMatchObject({ familier: null, banniere: null });
  });

  it("refuse une réponse illisible ou un refus du serveur", () => {
    expect(lireVitrine(null)).toBeNull();
    expect(lireVitrine({ ok: false, error: "not_validated" })).toBeNull();
    expect(lireVitrine({ ok: true })).toBeNull();
    expect(lireVitrine({ ok: true, gaulois: [] })).toEqual([]);
  });
});

describe("rareteDuCadre", () => {
  it("prend la rareté la plus haute des objets portés, jamais un total", () => {
    expect(rareteDuCadre(TENUE_DE_DEPART)).toBe("commun");
    const couronne: Tenue = changerObjet(TENUE_DE_DEPART, "tete", "couronne");
    expect(rareteDuCadre(couronne)).toBe("legendaire");
  });

  it("compte le Gaulois unique qu'il porte, comme un objet", () => {
    const dragon = changerModele(TENUE_DE_DEPART, "dragon");
    expect(dragon[CLE_MODELE]).toBe("dragon");
    expect(rareteDuCadre(dragon)).toBe(modeleParId("dragon")?.rarete);
  });
});

describe("la migration de la vitrine", () => {
  const NOM = "20261116000200_vitrine_des_gaulois";
  const VITRINE = lire(NOM);
  const AVANT = fonction(lire("20261114001000_village_forge"), "public.get_village");
  const APRES = fonction(VITRINE, "public.get_village");

  it("remplace get_village ligne pour ligne, avec le familier et la bannière en plus", () => {
    const ajout = "          'gravures', case when g.user_id = v_uid or internal.member_pseudo(g.user_id) is not null\n            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end";
    expect(AVANT).toContain(`${ajout})`);
    expect(APRES).toContain(`${ajout},`);
    expect(APRES).toContain("'familier', g.familier,\n          'banniere', g.banniere)");
    const sansAjout = APRES.replace(/,\n {10}-- Ajout de 20261116000200[^\n]*\n {10}'familier', g\.familier,\n {10}'banniere', g\.banniere\)/, ")");
    expect(sansAjout).toBe(AVANT);
  });

  it("reste fermée aux visiteurs et ne touche aucune donnée", () => {
    expect(VITRINE).toContain("revoke all on function public.get_village() from public, anon, authenticated;");
    expect(VITRINE).toContain("grant execute on function public.get_village() to authenticated;");
    expect(VITRINE).not.toMatch(/\b(drop|truncate|delete|update|insert|alter)\b/i);
  });

  it("ne donne jamais un solde", () => {
    expect(APRES).not.toContain("solde");
  });
});
