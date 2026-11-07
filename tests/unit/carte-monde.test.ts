import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD_LAND_TILES, worldTerritory } from "../../src/lib/carte-monde";

const AT = "2026-11-07T17:00:01.344Z";

describe("worldTerritory", () => {
  it("donne la même part des terres sur la carte World", () => {
    const out = worldTerritory({ land: 2_335_403, fetchedAt: AT, galSummary: { pixels: 121_976 } });
    expect(out?.pixels).toBe(121_976);
    expect(out?.share).toBeCloseTo(5.223, 3);
    expect(out?.tiles).toBe(8256);
    expect(out?.at).toBe(AT);
  });
  it("ne donne rien sans film ni pixel : pas de données n'est pas un territoire nul", () => {
    expect(worldTerritory(null)).toBeNull();
    expect(worldTerritory({ land: 100, fetchedAt: AT })).toBeNull();
    expect(worldTerritory({ land: 100, fetchedAt: AT, galSummary: null })).toBeNull();
    expect(worldTerritory({ land: 100, fetchedAt: AT, galSummary: { pixels: 0 } })).toBeNull();
    expect(worldTerritory({ land: 0, fetchedAt: AT, galSummary: { pixels: 5 } })).toBeNull();
  });
  it("garde la surface de terre du manifeste copié dans la page", () => {
    const manifest = JSON.parse(readFileSync("public/carte-monde/manifest.json", "utf8"));
    expect(manifest.map4x.num_land_tiles).toBe(WORLD_LAND_TILES);
  });
});
