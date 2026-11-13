import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COULEURS_STATERE, TAILLES_STATERE, casesDuStatere, type TailleStatere } from "../../supabase/functions/code-discord/statere";

const CSS = readFileSync("src/styles/global.css", "utf8");
const rangees = (taille: TailleStatere): (string | null)[][] => {
  const cases = casesDuStatere(taille);
  return Array.from({ length: taille }, (_, y) => cases.slice(y * taille, (y + 1) * taille));
};
/** Le clair d'une couleur, de 0 à 255. */
const clair = (hex: string) => 0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16);

describe("le statère, la pièce du village", () => {
  it("se dessine en trois tailles : 12, 16 et 24 cases de côté", () => {
    expect([...TAILLES_STATERE]).toEqual([12, 16, 24]);
    for (const taille of TAILLES_STATERE) expect(casesDuStatere(taille)).toHaveLength(taille * taille);
  });

  it("n'a que des couleurs « #rrggbb » de sa palette, ou des cases vides", () => {
    const palette = new Set(Object.values(COULEURS_STATERE));
    for (const couleur of palette) expect(couleur).toMatch(/^#[0-9a-f]{6}$/);
    for (const taille of TAILLES_STATERE) {
      for (const couleur of casesDuStatere(taille)) if (couleur !== null) expect(palette.has(couleur), `${taille} : ${couleur}`).toBe(true);
    }
  });

  it("est dans l'or du légendaire : ses trois couleurs sont celles de la feuille de style", () => {
    // --rarete-legendaire, --rarete-legendaire-texte, et les deux bouts de --rarete-legendaire-degrade.
    for (const jeton of ["#f2b632", "#ffdd80", "#fff1a8", "#a86d0c"]) {
      expect(CSS).toContain(jeton);
      expect(Object.values(COULEURS_STATERE)).toContain(jeton);
    }
    // Chaque taille montre toutes les couleurs : l'éclat, la lumière, l'or, l'ombre et le creux de la frappe.
    for (const taille of TAILLES_STATERE) expect(new Set(casesDuStatere(taille).filter(Boolean)).size).toBe(Object.keys(COULEURS_STATERE).length);
  });

  it("est une pièce ronde et pleine : un contour symétrique, sans trou, qui touche les quatre bords", () => {
    for (const taille of TAILLES_STATERE) {
      const lignes = rangees(taille);
      const etendues = lignes.map((ligne) => {
        const debut = ligne.findIndex((c) => c !== null);
        const fin = ligne.findLastIndex((c) => c !== null);
        expect(debut, `${taille} : rangée vide`).toBeGreaterThanOrEqual(0);
        // Pleine : aucune case vide entre ses deux bords.
        expect(ligne.slice(debut, fin + 1).every((c) => c !== null)).toBe(true);
        // Symétrique de gauche à droite.
        expect(debut).toBe(taille - 1 - fin);
        return fin - debut + 1;
      });
      // Symétrique de haut en bas, la plus large au milieu, de toute la largeur de la grille.
      expect(etendues).toEqual([...etendues].reverse());
      expect(Math.max(...etendues)).toBe(taille);
      for (let y = 1; y < taille / 2; y++) expect(etendues[y] ?? 0).toBeGreaterThanOrEqual(etendues[y - 1] ?? 0);
      // Ronde, pas carrée comme un cadre de rareté : les coins sont vides, et elle couvre à peu près un disque.
      for (const [x, y] of [[0, 0], [taille - 1, 0], [0, taille - 1], [taille - 1, taille - 1]] as const) expect(lignes[y]?.[x]).toBeNull();
      const pleines = casesDuStatere(taille).filter(Boolean).length;
      expect(pleines / (taille * taille)).toBeGreaterThan(0.72);
      expect(pleines / (taille * taille)).toBeLessThan(0.86);
    }
  });

  it("est éclairée d'en haut à gauche et frappée d'un motif sombre au milieu", () => {
    for (const taille of TAILLES_STATERE) {
      const lignes = rangees(taille);
      const moyenne = (cases: (string | null)[]) => {
        const pleines = cases.filter((c): c is string => c !== null);
        return pleines.reduce((somme, c) => somme + clair(c), 0) / pleines.length;
      };
      const moitie = taille / 2;
      const hautGauche = lignes.slice(0, moitie).flatMap((ligne) => ligne.slice(0, moitie));
      const basDroite = lignes.slice(moitie).flatMap((ligne) => ligne.slice(moitie));
      expect(moyenne(hautGauche)).toBeGreaterThan(moyenne(basDroite));
      // Le creux de la frappe : au moins un dixième de la pièce, jamais sur le bord.
      const creux = COULEURS_STATERE.o;
      const frappe = casesDuStatere(taille).filter((c) => c === creux).length;
      expect(frappe).toBeGreaterThanOrEqual(Math.round(taille * taille * 0.1));
      lignes.forEach((ligne, y) =>
        ligne.forEach((c, x) => {
          if (c !== creux) return;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) expect(lignes[y + dy]?.[x + dx] ?? null, `${taille} : frappe au bord en ${x},${y}`).not.toBeNull();
        }),
      );
    }
  });

  it("se lit sur fond sombre : chaque couleur du bord et de l'or tranche sur le bleu nuit du site", () => {
    const fond = clair("#0a1230");
    for (const lettre of ["n", "y", "g", "G"]) expect(clair(COULEURS_STATERE[lettre] ?? "#000000") - fond).toBeGreaterThan(80);
  });

  it("n'est pas un agrandissement : les trois tailles ont chacune leur dessin", () => {
    const agrandie = (de: TailleStatere, vers: TailleStatere) => {
      const source = rangees(de);
      return Array.from({ length: vers * vers }, (_, i) => source[Math.floor((Math.floor(i / vers) * de) / vers)]?.[Math.floor(((i % vers) * de) / vers)] ?? null).join();
    };
    expect(agrandie(12, 24)).not.toBe(casesDuStatere(24).join());
    expect(agrandie(12, 16)).not.toBe(casesDuStatere(16).join());
    expect(agrandie(16, 24)).not.toBe(casesDuStatere(24).join());
  });
});
