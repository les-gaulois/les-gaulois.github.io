import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHEMIN_DU_CATALOGUE, fabriquerLeCatalogue, texteDuCatalogue } from "../../scripts/fabriquer-effets-duel";
import { FAMILLES_DES_BANNIERES } from "../../supabase/functions/code-discord/bannieres/commun";
import { CATALOGUE_DU_DUEL, COMPAGNONS, EMPLACEMENTS_DU_DUEL, LIEUX, MOTS, MOTS_ORDINAIRES, MOTS_UNIQUES, P, PANOPLIES, PIECES_DES_PANOPLIES, carte, panopliesDe, prix } from "../../supabase/functions/code-discord/duel/index";
import type { Carte, EmplacementDuDuel, IdDePanoplie } from "../../supabase/functions/code-discord/duel/index";
import { FAMILLES } from "../../supabase/functions/code-discord/familiers/index";
import { OBJETS } from "../../supabase/functions/code-discord/gaulois";

const prixDe = (id: string): number => prix(CATALOGUE_DU_DUEL[id]!.r);

/** La main la moins chère qui réunit la panoplie : sa pièce la moins chère sur assez d'emplacements, des cartes de base ailleurs. */
function mainDeLaPanoplie(k: IdDePanoplie): Carte[] | null {
  const parE = new Map<EmplacementDuDuel, string>();
  for (const id of [...PIECES_DES_PANOPLIES[k]].sort((x, y) => prixDe(x) - prixDe(y))) {
    const e = CATALOGUE_DU_DUEL[id]!.e;
    if (!parE.has(e)) parE.set(e, id);
  }
  const choisis = [...parE.entries()].sort((x, y) => prixDe(x[1]) - prixDe(y[1])).slice(0, PANOPLIES[k].pieces);
  if (choisis.length < PANOPLIES[k].pieces) return null;
  const base = (e: EmplacementDuDuel): string => Object.entries(CATALOGUE_DU_DUEL).find(([, f]) => f.e === e && f.r === "base")![0];
  return EMPLACEMENTS_DU_DUEL.map((e) => carte(choisis.find(([x]) => x === e)?.[1] ?? base(e)));
}

describe("le catalogue des cartes du duel", () => {
  it("est à jour : relancer scripts/fabriquer-effets-duel.ts après un changement de la garde-robe", () => {
    const ecrit = readFileSync(CHEMIN_DU_CATALOGUE, "utf8").replace(/\r\n/g, "\n");
    expect(ecrit).toBe(texteDuCatalogue(fabriquerLeCatalogue()));
  });

  it("a une carte pour chaque objet dessiné des cinq emplacements, et rien d'autre", () => {
    const attendus = EMPLACEMENTS_DU_DUEL.flatMap((e) => Object.entries(OBJETS[e]).filter(([, o]) => o.dessin).map(([id]) => `${e}/${id}`));
    const cartes = Object.entries(CATALOGUE_DU_DUEL).map(([id, f]) => `${f.e}/${id}`);
    expect(cartes.sort()).toEqual(attendus.sort());
  });

  it("garde la rareté de l'objet, « base » pour les gratuits", () => {
    for (const [id, f] of Object.entries(CATALOGUE_DU_DUEL)) {
      const o = OBJETS[f.e][id]!;
      expect(f.r, id).toBe(o.gratuit ? "base" : o.rarete);
    }
  });

  it("donne un effet unique à chaque légendaire, divin et objet de saison, et à eux seuls", () => {
    for (const [id, f] of Object.entries(CATALOGUE_DU_DUEL)) {
      const haut = f.r === "legendaire" || f.r === "divin" || f.r === "saison";
      expect(Boolean(f.u), id).toBe(haut);
      if (!haut) for (const [m] of f.m ?? []) expect(MOTS_UNIQUES as readonly string[], `${id} : ${m}`).not.toContain(m);
    }
    expect(CATALOGUE_DU_DUEL["couronne-solstice"]).toEqual({ e: "tete", r: "saison", u: "Solstice", m: [["gel", 1], ["brule", 1]] });
  });

  it("laisse les cartes de base sans mot-clé, et met au moins un mot-clé sur toutes les autres", () => {
    for (const [id, f] of Object.entries(CATALOGUE_DU_DUEL)) {
      if (f.r === "base") expect(f.m, id).toBeUndefined();
      else expect(f.m?.length, id).toBeGreaterThan(0);
    }
  });

  it("ne met un mot-clé de coup que sur une arme ou une tête", () => {
    for (const [id, f] of Object.entries(CATALOGUE_DU_DUEL)) for (const [m] of f.m ?? []) if (MOTS[m].coup) expect(["arme", "tete"], `${id} : ${m}`).toContain(f.e);
  });

  it("emploie les treize mots-clés ordinaires et les dix effets uniques", () => {
    const vus = new Set(Object.values(CATALOGUE_DU_DUEL).flatMap((f) => (f.m ?? []).map(([m]) => m)));
    for (const m of [...MOTS_ORDINAIRES, ...MOTS_UNIQUES]) expect(vus.has(m), m).toBe(true);
    expect(MOTS_ORDINAIRES.length).toBe(13);
    expect(MOTS_UNIQUES.length).toBe(10);
  });

  it("a seize panoplies, chacune avec assez de pièces, et deux pièces divines au plus d'une même tenue tiennent dans la bourse", () => {
    expect(Object.keys(PANOPLIES).length).toBe(16);
    for (const [k, p] of Object.entries(PANOPLIES)) {
      const pieces = PIECES_DES_PANOPLIES[k as keyof typeof PANOPLIES];
      expect(pieces.length, k).toBeGreaterThanOrEqual(p.pieces);
      for (const id of pieces) expect(CATALOGUE_DU_DUEL[id]?.p, id).toBe(k);
      if (p.divin) {
        expect(p.pieces).toBe(2);
        expect(pieces.every((id) => CATALOGUE_DU_DUEL[id]?.r === "divin")).toBe(true);
      }
    }
    expect(carte("ogive").c + carte("fuselage").c).toBe(12);
  });

  it("se réunit chacune dans une main légale : une carte par emplacement, dans la bourse", () => {
    for (const k of Object.keys(PANOPLIES) as IdDePanoplie[]) {
      const main = mainDeLaPanoplie(k);
      expect(main, k).not.toBeNull();
      expect(main!.reduce((s, c) => s + c.c, 0), k).toBeLessThanOrEqual(P.BOURSE);
      expect(panopliesDe(main!), k).toContain(k);
    }
  });

  it("donne un lieu à chaque famille de bannières et un compagnon à chaque famille de familiers", () => {
    expect(Object.keys(LIEUX).sort()).toEqual(Object.keys(FAMILLES_DES_BANNIERES).sort());
    expect(Object.keys(COMPAGNONS).sort()).toEqual([...FAMILLES].sort());
  });
});
