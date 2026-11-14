import { describe, expect, it } from "vitest";
import type { EtatDuBatiment, EtatDuFeu } from "../../src/lib/village/monde-etat";
import { SANS_DONNEES, etatDuBatimentEnMots, fenetreDeLAncre, jourDeParis, nomDuFeu, phraseDuChantier, pointsDuFeu, posesDuBatiment, suiteDuChantier } from "../../src/lib/village/monde/textes";

const pont = (poses: number, fini_le: string | null = null): EtatDuBatiment => ({ id: "pont", nom: "le pont", titre: "Le pont", cout: 450, poses, fini_le });

describe("les mots du chantier", () => {
  it("écrit ce qui reste arrondi vers le haut, ce qui est posé arrondi vers le bas : les deux font le coût", () => {
    expect(phraseDuChantier(pont(13.91))).toBe("Encore 437 points pour finir le pont");
    expect(posesDuBatiment(pont(13.91))).toBe("13 points posés sur 450");
    // Jamais « encore 0 » tant qu'il n'est pas fini, et le singulier sous 2.
    expect(phraseDuChantier(pont(449.99))).toBe("Encore 1 point pour finir le pont");
    expect(posesDuBatiment(pont(1.5))).toBe("1 point posé sur 450");
    expect(posesDuBatiment(pont(0))).toBe("0 point posé sur 450");
  });

  it("dit l'état de chaque bâtiment : fini (et le jour à Paris), en chantier, à venir", () => {
    expect(etatDuBatimentEnMots(pont(450, "2026-11-13T23:30:00Z"), false)).toBe("Fini le 14 novembre");
    expect(etatDuBatimentEnMots(pont(450, "illisible"), false)).toBe("Fini");
    expect(etatDuBatimentEnMots(pont(13.91), true)).toBe("En chantier : encore 437 points");
    expect(etatDuBatimentEnMots(pont(0), false)).toBe("À venir : 450 points");
    expect(suiteDuChantier(1063.91)).toBe("points rapportés au clan");
    expect(suiteDuChantier(1.2)).toBe("point rapporté au clan");
  });

  it("écrit le jour à Paris, le 1er en toutes lettres, rien pour une date illisible", () => {
    expect(jourDeParis("2026-10-31T23:00:00.000Z")).toBe("1er novembre");
    expect(jourDeParis(null)).toBeNull();
    expect(jourDeParis("demain")).toBeNull();
  });
});

describe("les mots du grand feu", () => {
  it("donne son nom et ses points rapportés en 7 jours, arrondis vers le bas", () => {
    const feu: EtatDuFeu = { niveau: 4, points: 617.25, jours: 7 };
    expect(nomDuFeu(feu)).toBe("Un feu de joie");
    expect(pointsDuFeu(feu)).toBe("617 points rapportés au clan en 7 jours");
    expect(pointsDuFeu({ niveau: 0, points: 1.99, jours: 7 })).toBe("1 point rapporté au clan en 7 jours");
    expect(nomDuFeu({ niveau: 0, points: 0, jours: 7 })).toBe("Des braises");
  });

  it("dit l'absence de données sans écrire zéro", () => {
    expect(SANS_DONNEES).toMatch(/^Pas de données/);
    expect(SANS_DONNEES).not.toMatch(/\d/);
  });
});

describe("les adresses des fenêtres", () => {
  it("ouvrent leur fenêtre, et toute autre ancre laisse le monde seul", () => {
    expect(fenetreDeLAncre("#gaulois")).toBe("gaulois");
    expect(fenetreDeLAncre("#marche")).toBe("marche");
    expect(fenetreDeLAncre("#chantier")).toBe("chantier");
    expect(fenetreDeLAncre("feu")).toBe("feu");
    expect(fenetreDeLAncre("#place")).toBeNull();
    expect(fenetreDeLAncre("")).toBeNull();
  });
});
