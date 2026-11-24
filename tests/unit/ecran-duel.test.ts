import { describe, expect, it } from "vitest";
import { TENUE_DE_DEPART, OBJETS, POILS } from "../../src/lib/gaulois";
import { BANNIERES } from "../../src/lib/village/bannieres";
import { FAMILIERS } from "../../src/lib/village/familiers";
import { MOTEUR } from "../../src/components/village/duel/moteur-du-site";
import {
  ADVERSAIRES_D_ENTRAINEMENT,
  EMPLACEMENTS_DE_LA_MAIN,
  NIVEAUX_D_ENTRAINEMENT,
  cartesAMoi,
  cartesDeLEmplacement,
  choisirLaMainDeJeu,
  compteDeLaCollection,
  lireLEtatDuServeur,
  mainParDefaut,
  marqueDeLaMain,
  ouTrouver,
  refusDeLaMain,
  resteDeLaBourse,
  type Catalogue,
} from "../../src/lib/village/ecran-duel";
import type { ObjetPossede } from "../../src/lib/village/contrat";

// Un petit catalogue d'essai, à la forme de celui du moteur : les cartes de base de chaque emplacement et quelques objets.
const CATALOGUE: Catalogue = {
  gourdin: { e: "arme", r: "base" },
  bonnet: { e: "tete", r: "base" },
  tunique: { e: "haut", r: "base" },
  bottes: { e: "pieds", r: "base" },
  braies: { e: "bas", r: "base" },
  "marteau-forgeron": { e: "arme", r: "epique", p: "forge", m: [["brule", 1]] },
  "lance-ceremonie": { e: "arme", r: "legendaire" },
  "lunettes-forgeron": { e: "tete", r: "peu-commun" },
  "tablier-forgeron": { e: "haut", r: "peu-commun" },
  "bottes-neige": { e: "pieds", r: "peu-commun" },
  "braies-retroussees": { e: "bas", r: "commun" },
};
const PRIX: Record<string, number> = { base: 0, commun: 1, "peu-commun": 2, epique: 3, mystique: 4, legendaire: 5, saison: 5, divin: 6 };
const prix = (id: string): number => PRIX[CATALOGUE[id]!.r]!;
const ligne = (emplacement: ObjetPossede["emplacement"], objet: string, quantite = 1): ObjetPossede => ({ emplacement, objet, quantite, origine: "achat", acquis_le: "2026-11-22T10:00:00Z" });

describe("la collection du duel", () => {
  it("donne toutes les cartes de base, et celles dont on possède l'objet au bon emplacement", () => {
    const a = cartesAMoi(CATALOGUE, [ligne("arme", "marteau-forgeron"), ligne("tete", "tablier-forgeron"), ligne("pieds", "bottes-neige", 0)]);
    expect([...a].sort()).toEqual(["bonnet", "bottes", "braies", "gourdin", "marteau-forgeron", "tunique"]);
  });

  it("sans inventaire lu, ne promet que les cartes de base", () => {
    expect(cartesAMoi(CATALOGUE, null).size).toBe(5);
  });

  it("range un emplacement de la plus courante à la plus rare, et filtre une rareté", () => {
    expect(cartesDeLEmplacement(CATALOGUE, "arme")).toEqual(["gourdin", "marteau-forgeron", "lance-ceremonie"]);
    expect(cartesDeLEmplacement(CATALOGUE, "arme", "epique")).toEqual(["marteau-forgeron"]);
  });

  it("compte les cartes à moi, en tout et par emplacement", () => {
    const a = cartesAMoi(CATALOGUE, [ligne("arme", "marteau-forgeron")]);
    expect(compteDeLaCollection(CATALOGUE, a)).toEqual({ a: 6, total: 11 });
    expect(compteDeLaCollection(CATALOGUE, a, "arme")).toEqual({ a: 2, total: 3 });
  });

  it("dit où trouver une carte selon sa rareté", () => {
    expect(ouTrouver("base")).toEqual([]);
    expect(ouTrouver("divin")).toEqual(["booster"]);
    expect(ouTrouver("saison")).toEqual(["pass"]);
    expect(ouTrouver("epique")).toEqual(["boutique", "booster", "pass"]);
  });
});

describe("la main du duel", () => {
  const tout = new Set(Object.keys(CATALOGUE));
  it("prend ce que porte le Gaulois, et la carte de base là où il ne porte pas une carte à lui", () => {
    const tenue = { ...TENUE_DE_DEPART, arme: "marteau-forgeron", tete: "lunettes-forgeron" };
    expect(mainParDefaut(CATALOGUE, tenue, new Set([...cartesAMoi(CATALOGUE, null), "marteau-forgeron"]), prix, 12)).toEqual(["marteau-forgeron", "bonnet", "tunique", "bottes", "braies"]);
  });

  it("ramène la main sous la bourse en remplaçant la plus chère par la carte de base", () => {
    const tenue = { ...TENUE_DE_DEPART, arme: "lance-ceremonie", tete: "lunettes-forgeron", haut: "tablier-forgeron", pieds: "bottes-neige", bas: "braies-retroussees" };
    const main = mainParDefaut(CATALOGUE, tenue, tout, prix, 8);
    expect(main).toEqual(["gourdin", "lunettes-forgeron", "tablier-forgeron", "bottes-neige", "braies-retroussees"]);
    expect(main.reduce((s, id) => s + prix(id), 0)).toBeLessThanOrEqual(8);
  });

  it("refuse une main mal rangée, avec une carte qu'on n'a pas, ou trop chère", () => {
    expect(refusDeLaMain(["gourdin", "bonnet", "tunique", "bottes", "braies"], CATALOGUE, tout, prix, 12)).toBeNull();
    expect(refusDeLaMain(["bonnet", "gourdin", "tunique", "bottes", "braies"], CATALOGUE, tout, prix, 12)).toBe("emplacement");
    expect(refusDeLaMain(["lance-ceremonie", "bonnet", "tunique", "bottes", "braies"], CATALOGUE, cartesAMoi(CATALOGUE, null), prix, 12)).toBe("pas-a-moi");
    expect(refusDeLaMain(["lance-ceremonie", "lunettes-forgeron", "tablier-forgeron", "bottes-neige", "braies-retroussees"], CATALOGUE, tout, prix, 10)).toBe("bourse");
  });

  it("dit ce que la bourse laisse pour un emplacement", () => {
    expect(resteDeLaBourse(["marteau-forgeron", "lunettes-forgeron", "tunique", "bottes", "braies"], 0, prix, 12)).toBe(10);
  });
});

describe("les adversaires d'entraînement", () => {
  it("ont une main d'objets de la garde-robe, un par emplacement dans l'ordre, une allure, une bannière et un familier qui existent", () => {
    for (const n of NIVEAUX_D_ENTRAINEMENT) {
      const adv = ADVERSAIRES_D_ENTRAINEMENT[n];
      expect(adv.main).toHaveLength(EMPLACEMENTS_DE_LA_MAIN.length);
      adv.main.forEach((id, i) => expect(OBJETS[EMPLACEMENTS_DE_LA_MAIN[i]!][id], `${n} : ${id}`).toBeDefined());
      for (const [cle, valeur] of Object.entries(adv.allure)) {
        if (cle === "teinte_cheveux") expect(Object.keys(POILS), `${n} : ${cle}`).toContain(valeur);
        else if (cle === "peau") expect(["claire", "mate"], `${n} : peau`).toContain(valeur);
        else expect(OBJETS[cle as "cheveux"]?.[valeur], `${n} : ${cle}`).toBeDefined();
      }
      expect(BANNIERES.some((b) => b.id === adv.banniere), `${n} : ${adv.banniere}`).toBe(true);
      expect(FAMILIERS.some((f) => f.id === adv.familier), `${n} : ${adv.familier}`).toBe(true);
    }
  });
});

describe("ce que le serveur du duel dit de moi", () => {
  const MAIN = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
  it("lit la défense, sa validité, la collection, l'historique et le bilan", () => {
    const e = lireLEtatDuServeur({
      ok: true,
      defense: MAIN,
      defense_valide: false,
      collection: { arme: ["gourdin", "epee"], tete: ["bonnet"], haut: [], pieds: [], bas: [] },
      boss: { boss: "loup", battu: true },
      defenses: [
        { le: "2026-11-22T10:00:00Z", nom: "Ambre", issue: "repousse", manches: 6 },
        { le: "2026-11-22T11:00:00Z", nom: "Boris", issue: "inconnue", manches: 3 },
        { le: "2026-11-22T12:00:00Z", nom: null, issue: "battu", manches: 4 },
      ],
      bilan: { repousses: 12, battus: 4 },
    });
    expect(e).not.toBeNull();
    expect(e!.defense).toEqual(["gourdin", "bonnet", "tunique", "bottes", "braies"]);
    expect(e!.defenseValide).toBe(false);
    expect([...e!.collection!].sort()).toEqual(["bonnet", "epee", "gourdin"]);
    expect(e!.boss).toBe("loup");
    expect(e!.bossBattu).toBe(true);
    expect(e!.defenses).toHaveLength(2);
    expect(e!.defenses[1]!.nom).toBeNull();
    expect([e!.repousses, e!.battus]).toEqual([12, 4]);
  });

  it("ne recompte jamais les totaux d'après la liste, et ne montre pas une défense incomplète", () => {
    const e = lireLEtatDuServeur({ ok: true, defense: { arme: "gourdin" }, defenses: [{ le: "2026-11-22T10:00:00Z", nom: "Ambre", issue: "repousse", manches: 6 }] });
    expect(e!.defense).toBeNull();
    expect(e!.defenseValide).toBe(false);
    expect([e!.repousses, e!.battus]).toEqual([null, null]);
    expect(e!.collection).toBeNull();
  });

  it("lit la partie en cours à reprendre, et ignore une partie finie", () => {
    const partie = { partie: 42, contre: "boss", boss: "loup", fini: false, compte: true, mains: { a: MAIN, b: MAIN }, coups: [[0, 1], [2, 0]] };
    expect(lireLEtatDuServeur({ ok: true, partie })!.partie).toEqual({ id: 42, contre: "boss", boss: "loup", main: ["gourdin", "bonnet", "tunique", "bottes", "braies"], coups: [[0, 1], [2, 0]], compte: true });
    expect(lireLEtatDuServeur({ ok: true, partie: { ...partie, fini: true } })!.partie).toBeNull();
    expect(lireLEtatDuServeur({ ok: true, partie: { ...partie, coups: [[0, "x"]] } })!.partie).toBeNull();
  });

  it("refuse une réponse illisible ou un refus", () => {
    expect(lireLEtatDuServeur(null)).toBeNull();
    expect(lireLEtatDuServeur({ ok: false, error: "duel_ferme" })).toBeNull();
  });
});

describe("les cartes que l'arène laisse poser", () => {
  it("suit la règle du moteur : celles qui ne se reposent pas, sinon celles qui reviennent le plus tôt", () => {
    const camp = (repos: number[]) => ({ repos }) as unknown as Parameters<typeof MOTEUR.libres>[0];
    expect(MOTEUR.libres(camp([0, 2, 0, 1, 3]))).toEqual([0, 2]);
    expect(MOTEUR.libres(camp([2, 1, 3, 1, 2]))).toEqual([1, 3]);
  });
});

describe("la main de jeu du duel", () => {
  const ANCIENNE = ["gourdin", "bonnet", "tunique", "bottes", "braies"];
  const NEUVE = ["marteau-forgeron", "bonnet", "tunique", "bottes", "braies"];
  const DEFAUT = ["defaut"];
  const base = { valable: (x: readonly string[]) => !x.includes("vendue"), parDefaut: () => [...DEFAUT] };

  it("prend une défense enregistrée depuis, même avec l'ancienne main gardée sur l'appareil (le combat du boss du 24 novembre)", () => {
    const vue = marqueDeLaMain(ANCIENNE);
    expect(choisirLaMainDeJeu({ ...base, actuelle: ANCIENNE, gardee: ANCIENNE, defense: NEUVE, defenseVue: vue })).toEqual({ main: NEUVE, adoptee: true });
    expect(choisirLaMainDeJeu({ ...base, actuelle: null, gardee: ANCIENNE, defense: NEUVE, defenseVue: vue })).toEqual({ main: NEUVE, adoptee: true });
    // Un appareil qui n'avait encore rien retenu prend la défense une fois.
    expect(choisirLaMainDeJeu({ ...base, actuelle: null, gardee: ANCIENNE, defense: NEUVE, defenseVue: null })).toEqual({ main: NEUVE, adoptee: true });
  });

  it("garde la main changée dans l'arène tant que la défense ne change pas", () => {
    const vue = marqueDeLaMain(NEUVE);
    expect(choisirLaMainDeJeu({ ...base, actuelle: ANCIENNE, gardee: ANCIENNE, defense: NEUVE, defenseVue: vue })).toBeNull();
    expect(choisirLaMainDeJeu({ ...base, actuelle: null, gardee: ANCIENNE, defense: NEUVE, defenseVue: vue })).toEqual({ main: ANCIENNE, adoptee: false });
  });

  it("ne prend pas une défense devenue injouable, et retombe sur la main gardée, la défense, puis celle par défaut", () => {
    const vendue = ["vendue", "bonnet", "tunique", "bottes", "braies"];
    expect(choisirLaMainDeJeu({ ...base, actuelle: ANCIENNE, gardee: ANCIENNE, defense: vendue, defenseVue: null })).toBeNull();
    expect(choisirLaMainDeJeu({ ...base, actuelle: null, gardee: vendue, defense: NEUVE, defenseVue: marqueDeLaMain(NEUVE) })).toEqual({ main: NEUVE, adoptee: false });
    expect(choisirLaMainDeJeu({ ...base, actuelle: null, gardee: null, defense: null, defenseVue: null })).toEqual({ main: DEFAUT, adoptee: false });
  });
});
