import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fmtCount, fmtInt, fmtScore } from "../../src/lib/format";
import { frNumber } from "../../src/lib/nombre";

describe("frNumber", () => {
  it("sépare les milliers par l'espace insécable, que nos polices contiennent", () => {
    expect(frNumber().format(121976)).toBe("121\u00a0976");
    expect(frNumber().format(1234567)).toBe("1\u00a0234\u00a0567");
    expect(frNumber({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(2184.5)).toBe("2\u00a0184,50");
  });
  it("laisse les petits nombres intacts", () => {
    expect(frNumber().format(999)).toBe("999");
    expect(frNumber({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(42.2)).toBe("42,2");
  });
  it("sert aux formats du site", () => {
    expect(fmtInt(1284)).toBe("1\u00a0284");
    expect(fmtScore(8581.37)).toBe("8\u00a0581,37");
    expect(fmtCount(1284, "partie")).toBe("1\u00a0284 parties");
  });
  it("reste le seul à formater des nombres dans le site", () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((file) => /\.(ts|tsx|astro)$/.test(file));
    const others = files.filter((file) => !file.endsWith("nombre.ts") && /Intl\.NumberFormat|toLocaleString/.test(readFileSync(join("src", file), "utf8")));
    expect(others).toEqual([]);
  });
});
