import { describe, expect, it } from "vitest";
import { BATIMENTS } from "../../src/lib/village/chantier-liste";
import { PLEIN_JOUR } from "../../src/lib/village/lumiere";
import type { EtatDuBatiment, EtatDuMonde } from "../../src/lib/village/monde-etat";
import { animesDuMonde, etatDuLot, lotEnCours, taillesDesDessins } from "../../src/lib/village/monde/composition";
import { planDuMonde } from "../../src/lib/village/monde/plan";

/**
 * Ce que le dessin du monde montre du chantier et du grand feu : sans données, rien n'est montré comme bâti et il n'y a
 * pas de feu (« pas de données » n'est pas zéro) ; un bâtiment n'est montré fini que s'il a sa date de fin (relecture du
 * 14 novembre 2026).
 */
const plan = planDuMonde(taillesDesDessins(), 15);

/** Un chantier où les `finis` premiers bâtiments ont leur date de fin et le suivant est en cours, à moitié posé. */
function chantier(finis: number): EtatDuMonde["chantier"] {
  const batiments: EtatDuBatiment[] = BATIMENTS.map((b, i) => ({
    ...b,
    poses: i < finis ? b.cout : i === finis ? b.cout / 2 : 0,
    fini_le: i < finis ? "2026-11-02T20:00:00.000Z" : null,
  }));
  return { depuis: "2026-10-31T23:00:00.000Z", points: 0, batiments, en_cours: BATIMENTS[finis]?.id ?? null };
}

const releve = "2026-11-14T12:53:00.000Z";
const avecTout: EtatDuMonde = { releve, chantier: chantier(5), feu: { niveau: 4, points: 617, jours: 7 } };
const sansDonnees: EtatDuMonde = { releve: null, chantier: null, feu: null };

describe("le chantier dans le dessin du monde", () => {
  it("sans données, aucun bâtiment n'est montré bâti ni en chantier", () => {
    for (const b of BATIMENTS) expect(etatDuLot(sansDonnees, b.id)).toEqual({ sorte: "attente" });
    expect(lotEnCours(plan, sansDonnees)).toBeNull();
  });

  it("montre finis ceux qui ont leur date de fin, en chantier celui en cours, en attente les autres", () => {
    BATIMENTS.forEach((b, i) => {
      const lot = etatDuLot(avecTout, b.id);
      if (i < 5) expect(lot).toEqual({ sorte: "fini" });
      else if (i === 5) expect(lot).toEqual({ sorte: "chantier", avancement: 0.5 });
      else expect(lot).toEqual({ sorte: "attente" });
    });
    expect(lotEnCours(plan, avecTout)).not.toBeNull();
  });

  it("ne montre jamais fini un bâtiment sans date de fin, même tous ses points posés", () => {
    const etat: EtatDuMonde = { ...avecTout, chantier: chantier(0) };
    const sansDate = { ...etat.chantier!, en_cours: null, batiments: etat.chantier!.batiments.map((b) => ({ ...b, poses: b.cout, fini_le: null })) };
    for (const b of BATIMENTS) expect(etatDuLot({ ...etat, chantier: sansDate }, b.id)).toEqual({ sorte: "attente" });
  });

  it("n'a plus de bâtiment en cours quand tout est bâti", () => {
    expect(lotEnCours(plan, { ...avecTout, chantier: chantier(BATIMENTS.length) })).toBeNull();
  });
});

describe("le grand feu dans le dessin du monde", () => {
  it("n'est dessiné que s'il y a des données", () => {
    const cles = (etat: EtatDuMonde) => animesDuMonde(plan, etat, PLEIN_JOUR).map((a) => a.cle);
    expect(cles(avecTout)).toContain("feu");
    expect(cles(sansDonnees)).not.toContain("feu");
    expect(cles({ ...avecTout, feu: null })).not.toContain("feu");
  });
});
