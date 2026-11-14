import { describe, expect, it } from "vitest";
import {
  EMPLACEMENTS,
  EMPLACEMENTS_CORPS,
  EMPLACEMENTS_OBJETS,
  EMPLACEMENTS_VISAGE,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  OBJETS,
  ORDRE_RARETES,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  type Catalogue,
  type Objet,
  type Rarete,
} from "../../src/lib/gaulois";
import {
  NOMS_RAYONS,
  RAYONS,
  RAYON_CORPS,
  TOUT,
  cadreDuVisage,
  choisirFiltre,
  compterParRarete,
  echelleEntiere,
  filtreEffectif,
  filtrerParRarete,
  grosPlan,
  rangerLeRayon,
  rayonDe,
  visageNu,
  type Entree,
} from "../../src/lib/village/vestiaire-rayons";

const objet = (nom: string, rarete: Rarete | null, gratuit: boolean, lignes: readonly string[] | null = null, y = 0): Objet => ({ nom, dessin: lignes ? { y, lignes } : null, couleurs: {}, rarete, gratuit });

/** Un petit rayon d'essai, dans l'ordre du catalogue : les gratuits, puis de la rareté la plus courante à la plus rare. */
const RAYON: Readonly<Record<string, Objet>> = {
  rien: objet("Rien", null, true),
  offert: objet("Offert", "commun", true),
  simple: objet("Simple", "commun", false),
  autre: objet("Autre", "commun", false),
  beau: objet("Beau", "epique", false),
  rare: objet("Rare", "legendaire", false),
};
const ids = (liste: readonly Entree[]): string[] => liste.map(([id]) => id);

describe("les rayons du vestiaire", () => {
  it("sont le corps, puis un rayon par emplacement d'objets, chacun avec son nom", () => {
    expect(RAYONS).toEqual([RAYON_CORPS, ...EMPLACEMENTS_OBJETS]);
    for (const rayon of RAYONS) expect(NOMS_RAYONS[rayon]).toMatch(/^[A-ZÀ-Ý]/);
  });

  it("rangent chaque emplacement : un objet dans son rayon, tout le reste au corps", () => {
    for (const emplacement of EMPLACEMENTS_OBJETS) expect(rayonDe(emplacement)).toBe(emplacement);
    for (const emplacement of EMPLACEMENTS_CORPS) expect(rayonDe(emplacement)).toBe(RAYON_CORPS);
    // Aucun emplacement n'est oublié : chacun a son rayon dans la barre.
    for (const emplacement of EMPLACEMENTS) expect(RAYONS).toContain(rayonDe(emplacement));
  });
});

describe("le rangement d'un rayon", () => {
  it("met à part ce qui se porte (gratuit ou possédé) et ce qui reste à la boutique, sans changer l'ordre", () => {
    const rangement = rangerLeRayon(RAYON, (id) => (id === "beau" ? 2 : 0));
    expect(ids(rangement.aMoi)).toEqual(["rien", "offert", "beau"]);
    expect(ids(rangement.boutique)).toEqual(["simple", "autre", "rare"]);
  });

  it("sans inventaire, ne donne au membre que les gratuits", () => {
    const rangement = rangerLeRayon(RAYON, () => 0);
    expect(ids(rangement.aMoi)).toEqual(["rien", "offert"]);
    expect(ids(rangement.boutique)).toEqual(["simple", "autre", "beau", "rare"]);
  });

  it("ne perd ni ne double aucun objet du vrai catalogue", () => {
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      const rangement = rangerLeRayon(OBJETS[emplacement], () => 0);
      expect([...ids(rangement.aMoi), ...ids(rangement.boutique)].sort()).toEqual(Object.keys(OBJETS[emplacement]).sort());
      expect(rangement.aMoi.every(([, o]) => o.gratuit)).toBe(true);
      expect(rangement.boutique.every(([, o]) => !o.gratuit && o.rarete !== null)).toBe(true);
    }
  });
});

describe("le filtre de la boutique", () => {
  const boutique = rangerLeRayon(RAYON, () => 0).boutique;

  it("compte les objets de chaque rareté, zéro compris", () => {
    expect(compterParRarete(boutique)).toEqual({ commun: 2, "peu-commun": 0, epique: 1, mystique: 0, legendaire: 1 });
    expect(compterParRarete([])).toEqual({ commun: 0, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 0 });
  });

  it("donne des comptes dont la somme est le nombre d'objets de la boutique, pour chaque rayon du catalogue", () => {
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      const liste = rangerLeRayon(OBJETS[emplacement], () => 0).boutique;
      const comptes = compterParRarete(liste);
      expect(ORDRE_RARETES.reduce((somme, rarete) => somme + comptes[rarete], 0)).toBe(liste.length);
    }
  });

  it("réduit la liste à une rareté sans changer l'ordre, et la rend entière avec « tout »", () => {
    expect(ids(filtrerParRarete(boutique, "commun"))).toEqual(["simple", "autre"]);
    expect(ids(filtrerParRarete(boutique, "legendaire"))).toEqual(["rare"]);
    expect(ids(filtrerParRarete(boutique, "mystique"))).toEqual([]);
    expect(ids(filtrerParRarete(boutique, TOUT))).toEqual(ids(boutique));
  });

  it("revient à « tout » quand la rareté retenue n'a plus d'objet, ou sans choix", () => {
    const comptes = compterParRarete(boutique);
    expect(filtreEffectif("epique", comptes)).toBe("epique");
    expect(filtreEffectif("mystique", comptes)).toBe(TOUT);
    expect(filtreEffectif(TOUT, comptes)).toBe(TOUT);
    expect(filtreEffectif(undefined, comptes)).toBe(TOUT);
  });

  it("garde un filtre par rayon, et relâche la rareté choisie une seconde fois", () => {
    const apres = choisirFiltre({}, "tete", "epique");
    expect(apres).toEqual({ tete: "epique" });
    const deux = choisirFiltre(apres, "arme", "commun");
    expect(deux).toEqual({ tete: "epique", arme: "commun" });
    expect(choisirFiltre(deux, "tete", "epique")).toEqual({ tete: TOUT, arme: "commun" });
    expect(choisirFiltre(deux, "tete", TOUT)).toEqual({ tete: TOUT, arme: "commun" });
    // L'état d'avant n'est pas modifié.
    expect(apres).toEqual({ tete: "epique" });
  });
});

describe("le gros plan du visage", () => {
  const VIDE = ".".repeat(GAULOIS_LARGEUR);
  const ligne = (...colonnes: number[]): string => [...VIDE].map((c, x) => (colonnes.includes(x) ? "k" : c)).join("");
  const catalogue = (visage: Partial<Record<"yeux" | "bouche" | "cicatrice", Record<string, Objet>>>): Catalogue => ({ ...OBJETS, yeux: {}, bouche: {}, cicatrice: {}, ...visage });

  it("cadre tous les dessins des yeux, des bouches et des cicatrices du catalogue, dans un carré qui tient dans la grille", () => {
    const cadre = cadreDuVisage();
    expect(cadre.gauche).toBeGreaterThanOrEqual(0);
    expect(cadre.haut).toBeGreaterThanOrEqual(0);
    expect(cadre.gauche + cadre.cote).toBeLessThanOrEqual(GAULOIS_LARGEUR);
    expect(cadre.haut + cadre.cote).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
    for (const emplacement of EMPLACEMENTS_VISAGE) {
      for (const [id, o] of Object.entries(OBJETS[emplacement])) {
        o.dessin?.lignes.forEach((l, dy) => {
          [...l].forEach((lettre, x) => {
            if (lettre === ".") return;
            const y = o.dessin!.y + dy;
            expect(x >= cadre.gauche && x < cadre.gauche + cadre.cote && y >= cadre.haut && y < cadre.haut + cadre.cote, `${emplacement}/${id} en ${x},${y}`).toBe(true);
          });
        });
      }
    }
  });

  it("reste assez serré pour qu'un œil se lise dans une case : quatre pixels par case du dessin au moins dans 88 pixels", () => {
    expect(echelleEntiere(cadreDuVisage().cote, cadreDuVisage().cote, 88, 4)).toBe(4);
  });

  it("ne descend jamais sous vingt cases de côté, et se centre sur les dessins", () => {
    const cadre = cadreDuVisage(catalogue({ yeux: { a: objet("Yeux", null, true, [ligne(22, 25)], 20) } }));
    expect(cadre).toEqual({ gauche: 14, haut: 10, cote: 20 });
  });

  it("s'élargit quand un dessin va plus loin, des deux côtés à la fois", () => {
    const cadre = cadreDuVisage(catalogue({ cicatrice: { a: objet("Marque", null, true, [ligne(8), VIDE, ligne(37)], 18) } }));
    expect(cadre.cote).toBe(30);
    expect(cadre.gauche).toBe(8);
    expect(cadre.haut).toBe(4);
  });

  it("ne sort pas de la grille pour un dessin au bord", () => {
    const cadre = cadreDuVisage(catalogue({ bouche: { a: objet("Bouche", null, true, [ligne(0, 3)], 62) } }));
    expect(cadre).toEqual({ gauche: 0, haut: GAULOIS_HAUTEUR - 20, cote: 20 });
  });

  it("donne le milieu de la tête à un catalogue sans visage", () => {
    expect(cadreDuVisage(catalogue({}))).toEqual({ gauche: 14, haut: 13, cote: 20 });
  });

  it("rogne le Gaulois au cadre, case pour case", () => {
    const cases = casesDuGaulois(TENUE_DE_DEPART);
    const cadre = { gauche: 13, haut: 13, cote: 21 };
    const plan = grosPlan(cases, cadre);
    expect(plan.largeur).toBe(21);
    expect(plan.hauteur).toBe(21);
    expect(plan.cases).toHaveLength(21 * 21);
    expect(plan.cases[0]).toBe(cases[13 * GAULOIS_LARGEUR + 13]);
    expect(plan.cases[21 * 21 - 1]).toBe(cases[33 * GAULOIS_LARGEUR + 33]);
    // Le visage remplit le cadre : aucune case vide au milieu.
    expect(plan.cases[10 * 21 + 10]).not.toBeNull();
  });

  it("montre chaque modèle : deux modèles d'une même partie ne donnent jamais le même gros plan", () => {
    const cadre = cadreDuVisage();
    const nu = visageNu(TENUE_DE_DEPART);
    for (const emplacement of EMPLACEMENTS_VISAGE) {
      const plans = Object.keys(OBJETS[emplacement]).map((id) => grosPlan(casesDuGaulois(changerObjet(nu, emplacement, id)), cadre).cases.join(","));
      expect(new Set(plans).size, emplacement).toBe(plans.length);
    }
  });

  it("dessine le visage sans coiffe, sans arme et sans barbe, sans toucher au reste de la tenue", () => {
    const tenue = { ...TENUE_DE_DEPART, tete: "bonnet", barbe: "grande", arme: "gourdin" };
    const nu = visageNu(tenue);
    expect(nu).toEqual({ ...tenue, tete: "aucun", barbe: "aucune", arme: "aucune" });
    for (const [emplacement, id] of [
      ["tete", nu["tete"]],
      ["barbe", nu["barbe"]],
      ["arme", nu["arme"]],
    ] as const) {
      expect(OBJETS[emplacement][id ?? ""]?.dessin, emplacement).toBeNull();
    }
    expect(tenue.tete).toBe("bonnet");
  });
});

describe("l'agrandissement d'un dessin", () => {
  it("est un nombre entier de fois, le plus grand qui tient dans la place", () => {
    expect(echelleEntiere(20, 12, 80, 3)).toBe(3);
    expect(echelleEntiere(30, 12, 80, 3)).toBe(2);
    expect(echelleEntiere(48, 30, 80, 3)).toBe(1);
    expect(echelleEntiere(21, 21, 88, 4)).toBe(4);
    expect(echelleEntiere(23, 23, 88, 4)).toBe(3);
  });

  it("ne descend jamais sous 1, même pour un dessin plus grand que la place ou vide", () => {
    expect(echelleEntiere(48, 64, 44, 2)).toBe(1);
    expect(echelleEntiere(0, 0, 44, 2)).toBe(2);
  });
});
