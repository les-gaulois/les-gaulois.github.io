import { describe, expect, it } from "vitest";
import {
  DARK_SEA,
  RELIEF_CLARTE_BAS,
  RELIEF_CLARTE_HAUT,
  RELIEF_NIVEAUX,
  blendOwners,
  niveauDeRelief,
  reliefDuFond,
  reliefDuNiveau,
  teinteAuRelief,
  type Rgb,
} from "../../src/lib/clanmap/terrain";

/** Un pixel gris du fond assombri, de cette clarté. */
const gris = (clarte: number): number[] => [clarte, clarte, clarte];
const ecart = (rgb: Rgb) => Math.max(...rgb) - Math.min(...rgb);

describe("le relief sous les couleurs des clans", () => {
  it("se lit dans la clarté de la terre du fond, de la plus basse à la plus haute", () => {
    const fond = Uint8Array.from([...DARK_SEA, ...gris(RELIEF_CLARTE_BAS), ...gris(59), ...gris(RELIEF_CLARTE_HAUT), ...gris(120)]);
    const [mer, bas, milieu, haut, plusHaut] = reliefDuFond(fond);
    expect([mer, bas, haut, plusHaut]).toEqual([0, 0, 255, 255]);
    // À mi-chemin des deux clartés, le relief du milieu : 127 ou 128, selon l'arrondi.
    expect(Math.abs(milieu! - 127.5)).toBeLessThanOrEqual(0.5);
  });

  it("monte avec la clarté, sans jamais redescendre", () => {
    const fond = Uint8Array.from(Array.from({ length: 256 }, (_, c) => gris(c)).flat());
    const relief = reliefDuFond(fond);
    for (let c = 1; c < 256; c++) expect(relief[c]).toBeGreaterThanOrEqual(relief[c - 1]!);
  });

  it("garde la couleur du clan au milieu, l'assombrit dans les plaines et l'éclaircit vers les sommets", () => {
    const rouge: Rgb = [220, 40, 60];
    const milieu = teinteAuRelief(rouge, 127.5);
    expect(milieu).toEqual(rouge);
    // Les plus basses plaines : 70 % de la clarté.
    expect(teinteAuRelief(rouge, 0)).toEqual([154, 28, 42]);
    // Les plus hauts sommets : 30 % vers le blanc.
    expect(teinteAuRelief(rouge, 255)).toEqual([231, 105, 119]);
    let avant = teinteAuRelief(rouge, 0);
    for (let r = 1; r <= 255; r++) {
      const t = teinteAuRelief(rouge, r);
      for (let k = 0; k < 3; k++) expect(t[k]).toBeGreaterThanOrEqual(avant[k]!);
      avant = t;
    }
  });

  it("reste vive : la couleur ne change pas de teinte et garde au moins 70 % de son éclat", () => {
    const couleurs: Rgb[] = [
      [255, 0, 0],
      [40, 200, 90],
      [90, 60, 230],
      [250, 210, 30],
    ];
    for (const c of couleurs) {
      for (const r of [0, 64, 128, 192, 255]) {
        const t = teinteAuRelief(c, r);
        const ordre = (rgb: Rgb) => [0, 1, 2].sort((a, b) => rgb[b]! - rgb[a]! || a - b).join();
        expect(ordre(t)).toBe(ordre(c));
        expect(ecart(t)).toBeGreaterThanOrEqual(Math.floor(ecart(c) * 0.7));
      }
    }
  });

  it("range le relief en niveaux pour le film, chacun pris en son milieu", () => {
    expect(niveauDeRelief(0)).toBe(0);
    expect(niveauDeRelief(255)).toBe(RELIEF_NIVEAUX - 1);
    for (let n = 0; n < RELIEF_NIVEAUX; n++) expect(niveauDeRelief(reliefDuNiveau(n))).toBe(n);
  });

  it("donne à la carte finale les couleurs du film, la terre libre et la mer intactes", () => {
    const fond = Uint8Array.from([10, 20, 30, 40, 40, 40, 70, 70, 70]);
    const relief = Uint8Array.from([0, 20, 250]);
    const vert: Rgb = [40, 200, 90];
    const out = blendOwners(fond, Uint16Array.from([0, 1, 1]), [null, vert], relief);
    expect([...out.slice(0, 3)]).toEqual([10, 20, 30]);
    expect([...out.slice(3, 6)]).toEqual(teinteAuRelief(vert, reliefDuNiveau(niveauDeRelief(20))));
    expect([...out.slice(6, 9)]).toEqual(teinteAuRelief(vert, reliefDuNiveau(niveauDeRelief(250))));
    // Une couleur pleine : le fond sombre ne la ternit plus.
    expect(out[7]).toBeGreaterThan(vert[1]);
  });
});
