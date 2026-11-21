import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS, TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { LIGNES_DU_LIVRE, lignesDeLaCollection, partPossedee, totalDeLaCollection } from "../../src/lib/village/collection";
import type { ObjetPossede } from "../../src/lib/village/contrat";
import { TROP_DE_NOUVEAUX, cleDeLObjet, cleDesObjetsVus, ecrireLesVus, faireLePoint, lireLesVus, nouveauxDuRayon } from "../../src/lib/village/nouveaux-objets";
import { demanderLeRayon, rayonDemandeUneFois } from "../../src/lib/village/boutique-rayons";
import { chercherDansLaVitrine, lignesPortees, provenanceDeLObjet } from "../../src/lib/village/vitrine";

// La pastille « Nouveau » du vestiaire, le livre de la collection et la carte de la vitrine ouverte en grand.

const payant = (emplacement: (typeof EMPLACEMENTS_OBJETS)[number], rang = 0): string => {
  const trouve = Object.entries(OBJETS[emplacement]).filter(([, o]) => !o.gratuit && o.rarete)[rang];
  if (!trouve) throw new Error(`pas d'objet payant de rang ${rang} dans ${emplacement}`);
  return trouve[0];
};
const possede = (emplacement: (typeof EMPLACEMENTS_OBJETS)[number], objet: string): ObjetPossede => ({ emplacement, objet, quantite: 1, origine: "achat", acquis_le: "2026-11-17T10:00:00Z" });

describe("la pastille « Nouveau »", () => {
  it("ne marque rien à la première visite sur un appareil : tout l'inventaire est déjà vu", () => {
    expect(faireLePoint(null, ["tete/a", "haut/b"])).toEqual({ vus: new Set(["tete/a", "haut/b"]), nouveaux: new Set() });
  });

  it("marque ce qui est arrivé depuis, et oublie ce qu'on n'a plus", () => {
    const point = faireLePoint(new Set(["tete/a", "haut/vendu"]), ["tete/a", "arme/c"]);
    expect(point.nouveaux).toEqual(new Set(["arme/c"]));
    // L'objet nouveau n'entre pas dans les vus : il garde sa pastille jusqu'à son essai.
    expect(point.vus).toEqual(new Set(["tete/a"]));
  });

  it("ne marque rien quand tout un inventaire arrive d'un coup, et repart de là", () => {
    const beaucoup = Array.from({ length: TROP_DE_NOUVEAUX + 1 }, (_, i) => `tete/objet-${i}`);
    const point = faireLePoint(new Set(["tete/a"]), ["tete/a", ...beaucoup]);
    expect(point.nouveaux.size).toBe(0);
    expect(point.vus.size).toBe(TROP_DE_NOUVEAUX + 2);
    expect(faireLePoint(new Set(["tete/a"]), ["tete/a", ...beaucoup.slice(1)]).nouveaux.size).toBe(TROP_DE_NOUVEAUX);
    // L'inventaire prêté reparti, puis un objet reçu : il est marqué, la pastille n'est pas éteinte pour de bon.
    expect(faireLePoint(point.vus, ["tete/a", "arme/c"])).toEqual({ vus: new Set(["tete/a"]), nouveaux: new Set(["arme/c"]) });
  });

  it("relit ce qu'il a écrit, et refuse ce qu'il ne sait pas lire", () => {
    const vus = new Set(["tete/b", "tete/a"]);
    expect(ecrireLesVus(vus)).toBe('["tete/a","tete/b"]');
    expect(lireLesVus(ecrireLesVus(vus))).toEqual(vus);
    expect(lireLesVus(null)).toBeNull();
    expect(lireLesVus("{")).toBeNull();
    expect(lireLesVus('{"a":1}')).toBeNull();
    expect(lireLesVus("[1,2]")).toBeNull();
  });

  it("garde une liste par compte, et compte les nouveaux d'un rayon", () => {
    expect(cleDesObjetsVus(12)).not.toBe(cleDesObjetsVus(13));
    expect(cleDeLObjet({ emplacement: "tete", objet: "casque" })).toBe("tete/casque");
    const nouveaux = new Set(["tete/a", "tete/b", "haut/c"]);
    expect(nouveauxDuRayon(nouveaux, "tete")).toBe(2);
    expect(nouveauxDuRayon(nouveaux, "bas")).toBe(0);
  });
});

describe("le livre de la collection", () => {
  const inventaire = [possede("tete", payant("tete")), possede("tete", payant("tete", 1)), possede("arme", payant("arme"))];
  const complet = { inventaire, familiers: { possedes: 3, existants: 100 }, bannieres: { possedes: 1, existants: 60 }, modeles: { possedes: 0, existants: 11 } };

  it("donne une ligne par rayon, puis les familiers, les bannières et les Gaulois uniques", () => {
    const lignes = lignesDeLaCollection(complet);
    expect(lignes.map((l) => l.id)).toEqual([...EMPLACEMENTS_OBJETS, "familiers", "bannieres", "modeles"]);
    expect(lignes).toHaveLength(LIGNES_DU_LIVRE);
    expect(lignes.find((l) => l.id === "tete")?.possedes).toBe(2);
    expect(lignes.find((l) => l.id === "arme")?.possedes).toBe(1);
    expect(lignes.find((l) => l.id === "bas")?.possedes).toBe(0);
    expect(lignes.find((l) => l.id === "tete")?.rayon).toBe("tete");
    expect(lignes.find((l) => l.id === "modeles")?.ancre).toBe("gaulois-uniques");
  });

  it("additionne le tout quand rien ne manque", () => {
    const lignes = lignesDeLaCollection(complet);
    const objets = lignes.filter((l) => l.rayon).reduce((somme, l) => somme + l.existants, 0);
    expect(totalDeLaCollection(lignes)).toEqual({ possedes: 3 + 3 + 1 + 0, existants: objets + 100 + 60 + 11 });
  });

  it("ne dit ni ligne ni total pour une partie pas encore lue", () => {
    const lignes = lignesDeLaCollection({ ...complet, bannieres: null });
    expect(lignes.some((l) => l.id === "bannieres")).toBe(false);
    expect(totalDeLaCollection(lignes)).toBeNull();
    expect(lignesDeLaCollection({ inventaire: null, familiers: null, bannieres: null, modeles: null })).toEqual([]);
  });

  it("dessine une barre qui ne ment pas aux deux bouts", () => {
    expect(partPossedee({ possedes: 0, existants: 62 })).toBe(0);
    expect(partPossedee({ possedes: 1, existants: 400 })).toBe(1);
    expect(partPossedee({ possedes: 31, existants: 62 })).toBe(50);
    expect(partPossedee({ possedes: 399, existants: 400 })).toBe(99);
    expect(partPossedee({ possedes: 62, existants: 62 })).toBe(100);
  });
});

describe("ce que porte un Gaulois regardé en grand", () => {
  it("nomme ses objets dans l'ordre du vestiaire, avec leur rareté", () => {
    const tete = payant("tete");
    const arme = payant("arme");
    const lignes = lignesPortees({ ...TENUE_DE_DEPART, tete, arme });
    expect(lignes.find((l) => l.nom === OBJETS.tete[tete]?.nom)?.rarete).toBe(OBJETS.tete[tete]?.rarete);
    expect(lignes.at(-1)?.nom).toBe(OBJETS.arme[arme]?.nom);
    expect(lignes.map((l) => l.partie)).toEqual([...new Set(lignes.map((l) => l.partie))]);
  });

  it("ne dit rien d'une case vide", () => {
    const vides = lignesPortees({ ...TENUE_DE_DEPART, tete: "aucun", arme: "aucune" });
    expect(vides.some((l) => l.partie === "Tête" || l.partie === "Arme")).toBe(false);
  });
});

describe("où trouver un objet vu dans la vitrine", () => {
  const de = (emplacement: (typeof EMPLACEMENTS_OBJETS)[number], filtre: (o: { gratuit: boolean; rarete: string | null }) => boolean): string => {
    const trouve = Object.entries(OBJETS[emplacement]).find(([, o]) => filtre(o));
    if (!trouve) throw new Error("pas d'objet de ce genre");
    return trouve[0];
  };

  it("dit gratuit, à vous, à la boutique ou dans la pochette surprise", () => {
    const gratuit = de("haut", (o) => o.gratuit);
    const payant = de("haut", (o) => !o.gratuit && o.rarete !== null && o.rarete !== "divin");
    expect(provenanceDeLObjet("haut", gratuit, false)).toEqual({ kind: "gratuit" });
    expect(provenanceDeLObjet("haut", payant, true)).toEqual({ kind: "a-moi" });
    expect(provenanceDeLObjet("haut", payant, false)).toEqual({ kind: "lien", mots: "À la boutique", ancre: "boutique", rayon: "haut" });
    expect(provenanceDeLObjet("haut", "objet-inconnu", false)).toBeNull();
  });

  it("n'envoie jamais à la boutique pour un objet divin, que seule la pochette surprise donne", () => {
    const divins = EMPLACEMENTS_OBJETS.flatMap((emplacement) => Object.entries(OBJETS[emplacement]).filter(([, o]) => o.rarete === "divin").map(([id]) => [emplacement, id] as const));
    expect(divins.length).toBeGreaterThan(0);
    for (const [emplacement, id] of divins) expect(provenanceDeLObjet(emplacement, id, false)).toEqual({ kind: "lien", mots: "Booster surprise", ancre: "pochettes", pochette: "surprise" });
  });

  it("note le rayon demandé, et ne le rend qu'une fois", () => {
    expect(rayonDemandeUneFois()).toBeNull();
    demanderLeRayon("arme");
    expect(rayonDemandeUneFois()).toBe("arme");
    expect(rayonDemandeUneFois()).toBeNull();
  });
});

describe("la recherche de la vitrine", () => {
  const gaulois = [{ nom: "Éloïse" }, { nom: "Jod" }, { nom: "le Grand ELOI" }];

  it("trouve sans tenir compte des accents ni des majuscules, dans l'ordre reçu", () => {
    expect(chercherDansLaVitrine(gaulois, "elo").map((g) => g.nom)).toEqual(["Éloïse", "le Grand ELOI"]);
    expect(chercherDansLaVitrine(gaulois, "  JOD ").map((g) => g.nom)).toEqual(["Jod"]);
  });

  it("rend tout le monde sans rien de tapé, et personne pour un nom inconnu", () => {
    expect(chercherDansLaVitrine(gaulois, "")).toEqual(gaulois);
    expect(chercherDansLaVitrine(gaulois, "   ")).toEqual(gaulois);
    expect(chercherDansLaVitrine(gaulois, "zzz")).toEqual([]);
  });
});
