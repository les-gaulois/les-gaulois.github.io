import { describe, expect, it } from "vitest";
import { PRIX_GRAVURE, type ObjetGravable, type PartieGravable, type Plaque } from "../../src/lib/village/contrat";
import {
  PARTIES_MONTREES,
  cleDeLObjet,
  etatDuBouton,
  heureDeLaPartie,
  lignesDeLaPlaque,
  memesFaits,
  motsDeLaPlaque,
  nomDeLObjet,
  objetChoisi,
  partieChoisie,
  phraseDesPlaquesVues,
  rangerLesObjets,
} from "../../src/lib/village/ecran-forge";
import { texteDeLaPlaque } from "../../src/lib/village/forge";

const NBSP = String.fromCharCode(0xa0);
const sansInsecable = (s: string): string => s.split(NBSP).join(" ");

const plaque = (jour: string, gaulois: number, points: number): Plaque => ({ jour, gaulois, points, texte: texteDeLaPlaque({ jour, gaulois, points })!, grave_le: "2026-11-13T10:00:00.000Z" });
const objet = (emplacement: ObjetGravable["emplacement"], id: string, porte = false, gravure: Plaque | null = null): ObjetGravable => ({ emplacement, objet: id, porte, gravure });
const partie = (id: string, jour: string, gaulois: number, points: number, debut = `${jour}T20:14:00.000Z`): PartieGravable => ({ partie: id, debut, jour, gaulois, points, texte: texteDeLaPlaque({ jour, gaulois, points })! });

describe("les objets de la forge", () => {
  it("met d'abord ceux qui sont portés, puis ceux qui ont une plaque, sans changer l'ordre du serveur", () => {
    const objets = [objet("tete", "bandeau"), objet("arme", "hache", false, plaque("2026-11-03", 2, 3)), objet("arme", "epee", true), objet("haut", "tunique", true), objet("arme", "gourdin")];
    expect(rangerLesObjets(objets).map(cleDeLObjet)).toEqual(["arme/epee", "haut/tunique", "arme/hache", "tete/bandeau", "arme/gourdin"]);
    // La liste reçue n'est pas touchée.
    expect(objets.map(cleDeLObjet)).toEqual(["tete/bandeau", "arme/hache", "arme/epee", "haut/tunique", "arme/gourdin"]);
  });

  it("nomme un objet par le catalogue, et par son emplacement s'il n'y est pas", () => {
    expect(nomDeLObjet({ emplacement: "arme", objet: "epee" })).toBe("Épée de fer");
    expect(nomDeLObjet({ emplacement: "arme", objet: "toString" })).toBe("Arme");
    expect(nomDeLObjet({ emplacement: "arme", objet: "inconnu" })).toBe("Arme");
  });

  it("retrouve l'objet et la partie choisis dans la forge à jour, ou rien", () => {
    const forge = { objets: [objet("arme", "epee")], parties: [partie("aB3dE6gH", "2026-11-12", 4, 2.33)] };
    expect(objetChoisi(forge, "arme/epee")?.objet).toBe("epee");
    expect(objetChoisi(forge, "arme/hache")).toBeNull();
    expect(objetChoisi(forge, null)).toBeNull();
    expect(partieChoisie(forge, "aB3dE6gH")?.points).toBe(2.33);
    expect(partieChoisie(forge, "autre")).toBeNull();
    expect(partieChoisie(forge, null)).toBeNull();
  });
});

describe("le texte sur la grande plaque", () => {
  it("s'écrit une ligne par fait, sans couper la virgule d'un nombre", () => {
    expect(lignesDeLaPlaque("12 novembre, à quatre, 2,33 points rapportés")).toEqual(["12 novembre,", "à quatre,", "2,33 points rapportés"]);
    expect(lignesDeLaPlaque("1er novembre, seul, moins de 0,01 point rapporté")).toEqual(["1er novembre,", "seul,", "moins de 0,01 point rapporté"]);
  });

  it("tient en trois lignes pour toute plaque que la règle peut écrire", () => {
    for (const gaulois of [1, 2, 17, 20, 23, 200]) {
      for (const points of [0.004, 0.01, 1, 1.5, 2, 2.33, 999.99]) {
        const lignes = lignesDeLaPlaque(texteDeLaPlaque({ jour: "2026-09-30", gaulois, points })!);
        expect(lignes).toHaveLength(3);
        // La plus longue ligne possible : « moins de 0,01 point rapporté ».
        for (const ligne of lignes) expect(ligne.length).toBeLessThanOrEqual(28);
        expect(lignes.join(" ")).toBe(texteDeLaPlaque({ jour: "2026-09-30", gaulois, points }));
      }
    }
  });

  it("garde un texte sans virgule en une ligne, et ignore un texte vide", () => {
    expect(lignesDeLaPlaque("Une plaque")).toEqual(["Une plaque"]);
    expect(lignesDeLaPlaque("")).toEqual([]);
  });

  it("dit la plaque d'une case en mots", () => {
    expect(motsDeLaPlaque("12 novembre, à quatre, 2,33 points rapportés")).toBe("Gravé : 12 novembre, à quatre, 2,33 points rapportés");
  });
});

describe("l'heure d'une partie", () => {
  it("se dit à Paris, en heures et minutes", () => {
    expect(sansInsecable(heureDeLaPartie("2026-11-12T20:14:00.000Z")!)).toBe("21 h 14");
    expect(sansInsecable(heureDeLaPartie("2026-07-01T07:05:00.000Z")!)).toBe("9 h 05");
    expect(sansInsecable(heureDeLaPartie("2026-11-12T23:00:00.000Z")!)).toBe("0 h 00");
  });

  it("ne dit rien d'une date illisible", () => {
    expect(heureDeLaPartie("hier")).toBeNull();
  });
});

describe("le bouton « Graver »", () => {
  const forge = { prix: PRIX_GRAVURE, solde: 1240 };
  const epee = objet("arme", "epee", true);
  const choisie = partie("aB3dE6gH", "2026-11-12", 4, 2.33);

  it("grave quand tout y est, et dit le prix du serveur en mots", () => {
    const etat = etatDuBouton(forge, epee, choisie);
    expect(sansInsecable(etat.libelle)).toBe("Graver pour 150 statères");
    expect(etat.raison).toBeNull();
    expect(sansInsecable(etatDuBouton({ prix: 1, solde: 5 }, epee, choisie).libelle)).toBe("Graver pour 1 statère");
  });

  it("dit « Regraver » pour un objet qui a déjà une plaque", () => {
    const gravee = objet("arme", "epee", true, plaque("2026-11-03", 2, 3));
    const etat = etatDuBouton(forge, gravee, choisie);
    expect(sansInsecable(etat.libelle)).toBe("Regraver pour 150 statères");
    expect(etat.raison).toBeNull();
  });

  it("s'éteint sans partie choisie", () => {
    expect(etatDuBouton(forge, epee, null).raison).toBe("Choisissez une partie.");
  });

  it("s'éteint quand l'objet porte déjà cette plaque", () => {
    const gravee = objet("arme", "epee", true, plaque("2026-11-12", 4, 2.33));
    expect(etatDuBouton(forge, gravee, choisie).raison).toBe("Cet objet porte déjà cette plaque.");
    expect(memesFaits(gravee.gravure!, choisie)).toBe(true);
    expect(memesFaits(gravee.gravure!, partie("x1y2z3w4", "2026-11-12", 4, 2.34))).toBe(false);
  });

  it("dit ce qui manque quand la bourse est trop légère, avant tout le reste", () => {
    expect(sansInsecable(etatDuBouton({ prix: 150, solde: 90 }, epee, null).raison!)).toBe("Il vous manque 60 statères.");
    expect(sansInsecable(etatDuBouton({ prix: 150, solde: 149 }, epee, choisie).raison!)).toBe("Il vous manque 1 statère.");
    expect(etatDuBouton({ prix: 150, solde: 150 }, epee, choisie).raison).toBeNull();
  });
});

describe("ce que la forge dit en plus", () => {
  it("dit qui voit les plaques", () => {
    expect(phraseDesPlaquesVues(true)).toBe("Votre pseudo est public : les autres membres validés peuvent lire les plaques des objets que vous portez.");
    expect(phraseDesPlaquesVues(true)).not.toMatch(/place/);
    expect(phraseDesPlaquesVues(false)).toBe("Votre pseudo n'est pas public : vous seul voyez vos plaques.");
  });

  it("montre d'abord quelques parties", () => {
    expect(PARTIES_MONTREES).toBeGreaterThanOrEqual(4);
    expect(PARTIES_MONTREES).toBeLessThanOrEqual(10);
  });
});
