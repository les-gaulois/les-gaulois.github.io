import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COULEURS_ALLIANCE, COULEUR_HORS_ALLIANCE, COULEUR_TOUTE_L_ALLIANCE, PALETTE_CLANS, couleurDeZone, couleursDesClans, empreinteDuTag, rgbDe } from "../../src/lib/alliance/couleurs";
import { LANGUES, langueDeDepart, langueValable } from "../../src/lib/alliance/langue";
import { encoderBits, pointCentral, type Masque } from "../../src/lib/alliance/masque";
import { EN, FR, ordinalAnglais, ordinalFrancais, textesDe } from "../../src/lib/alliance/textes";
import { ERROR_MESSAGES, ERROR_MESSAGES_EN, errorMessageEn } from "../../src/lib/compte/errors";

/** La luminance relative WCAG d'une couleur 0xRRGGBB. */
function luminance(valeur: number): number {
  const [r, g, b] = rgbDe(valeur).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: number, b: number) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};
/** Une couleur dans l'espace CIELAB (illuminant D65), où l'écart entre deux couleurs suit à peu près ce que voit l'œil. */
function lab(valeur: number): [number, number, number] {
  const [r, g, b] = rgbDe(valeur).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const rad = (d: number) => (d * Math.PI) / 180;
/**
 * L'écart ΔE CIEDE2000 (Sharma, Wu et Dalal, 2005), la mesure la plus proche de l'œil : vers 1, à peine visible ; au-delà de
 * 20, deux couleurs qu'on ne confond pas d'un coup d'œil.
 */
function ecart(c1: number, c2: number): number {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + G) * a1, (1 + G) * a2];
  const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const teinte = (x: number, y: number) => {
    const h = (Math.atan2(y, x) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  };
  const [h1, h2] = [teinte(a1p, b1), teinte(a2p, b2)];
  let dh = h2 - h1;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  const hm = C1p * C2p === 0 ? h1 + h2 : Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cmp;
  const SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

describe("les couleurs des clans", () => {
  it("donnent à GAL la première, à chaque autre clan une couleur tirée de son tag, la même d'un jour à l'autre", () => {
    const couleurs = couleursDesClans(["ZED", "LUX", "GAL", "ABC", "LUX"]);
    expect([...couleurs.keys()]).toEqual(["GAL", "ABC", "LUX", "ZED"]);
    expect(couleurs.get("GAL")).toBe(PALETTE_CLANS[0]);
    expect(new Set(couleurs.values()).size).toBe(4);
    expect(couleursDesClans(["LUX", "ZED", "ABC", "GAL"])).toEqual(couleurs);
    expect(empreinteDuTag("LUX")).toBe(empreinteDuTag("LUX"));
    expect(empreinteDuTag("LUX")).not.toBe(empreinteDuTag("XUL"));
  });

  it("ne changent pas quand un clan rejoint l'alliance sur une couleur libre", () => {
    const avant = couleursDesClans(["GAL", "LUX", "UN", "JR"]);
    let essais = 0;
    for (const nouveau of ["AST", "ITA", "BGS", "LBU", "CZSK", "FR", "NU", "ART", "AB", "ZZ"]) {
      const apres = couleursDesClans([...avant.keys(), nouveau]);
      if ([...avant.values()].includes(apres.get(nouveau)!)) continue;
      essais++;
      for (const [tag, couleur] of avant) expect(apres.get(tag), `${nouveau} : ${tag}`).toBe(couleur);
    }
    expect(essais).toBeGreaterThan(3);
  });

  it("sont toutes différentes jusqu'à sept clans, GAL compris, puis reviennent", () => {
    const tags = ["GAL", ...Array.from({ length: 11 }, (_, i) => `C${String(i).padStart(2, "0")}`)];
    const couleurs = [...couleursDesClans(tags).values()];
    expect(new Set(couleurs.slice(0, PALETTE_CLANS.length)).size).toBe(PALETTE_CLANS.length);
    expect(new Set(couleurs).size).toBe(PALETTE_CLANS.length);
    expect(couleurs.filter((c) => c === PALETTE_CLANS[0])).toHaveLength(1);
  });

  it("se distinguent nettement les unes des autres, du gris des autres clans et du blanc de toute l'alliance", () => {
    for (let i = 0; i < PALETTE_CLANS.length; i++) {
      for (let j = i + 1; j < PALETTE_CLANS.length; j++) expect(ecart(PALETTE_CLANS[i]!, PALETTE_CLANS[j]!), `${i} et ${j}`).toBeGreaterThan(20);
      expect(ecart(PALETTE_CLANS[i]!, 0x4b5570), `${i} et le gris`).toBeGreaterThan(20);
      expect(ecart(PALETTE_CLANS[i]!, COULEUR_TOUTE_L_ALLIANCE), `${i} et le blanc`).toBeGreaterThan(20);
    }
  });

  it("portent le nom d'une zone écrit en bleu nuit, lisible (WCAG AA, 4,5 pour 1)", () => {
    for (const couleur of [...PALETTE_CLANS, COULEUR_TOUTE_L_ALLIANCE, COULEUR_HORS_ALLIANCE, ...COULEURS_ALLIANCE.map((c) => c.valeur)]) {
      expect(contraste(couleur, 0x0a1230), couleur.toString(16)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("colorent une zone de son clan, en blanc pour toute l'alliance, en gris pour un clan sorti de l'alliance", () => {
    const couleurs = couleursDesClans(["GAL", "LUX"]);
    expect(couleurDeZone("LUX", couleurs)).toBe(couleurs.get("LUX"));
    expect(couleurDeZone(null, couleurs)).toBe(COULEUR_TOUTE_L_ALLIANCE);
    expect(couleurDeZone("OLD", couleurs)).toBe(COULEUR_HORS_ALLIANCE);
  });
});

describe("la langue de la fenêtre", () => {
  it("n'a que le français et l'anglais", () => {
    expect(LANGUES.map((l) => l.id)).toEqual(["fr", "en"]);
    expect(langueValable("en")).toBe(true);
    expect(langueValable("de")).toBe(false);
  });

  it("garde le choix fait, sinon lit la langue du navigateur d'un allié, et le français pour un Gaulois", () => {
    expect(langueDeDepart("en", ["fr-FR"], false)).toBe("en");
    expect(langueDeDepart("fr", ["en-US"], true)).toBe("fr");
    expect(langueDeDepart(null, ["en-US", "fr"], true)).toBe("en");
    expect(langueDeDepart(null, ["de-DE"], true)).toBe("en");
    expect(langueDeDepart(null, ["fr-BE"], true)).toBe("fr");
    expect(langueDeDepart(null, ["en-US"], false)).toBe("fr");
    expect(langueDeDepart("de", [], true)).toBe("fr");
  });

  it("a chaque texte dans les deux langues, sans texte vide", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(FR).sort());
    for (const t of [FR, EN]) {
      for (const [cle, valeur] of Object.entries(t)) {
        if (typeof valeur === "string") expect(valeur.trim(), `${t.langue}.${cle}`).not.toBe("");
      }
      expect(t.tailles).toHaveLength(4);
    }
    expect(textesDe("en")).toBe(EN);
    expect(textesDe("fr")).toBe(FR);
  });

  it("écrit les nombres et les places à la façon de chaque langue", () => {
    expect(FR.nombre(1_500_000)).toBe(`1${String.fromCharCode(0xa0)}500${String.fromCharCode(0xa0)}000`);
    expect(EN.nombre(1_500_000)).toBe("1,500,000");
    expect(FR.pct(0.4237)).toBe(`42,4${String.fromCharCode(0xa0)}%`);
    expect(EN.pct(0.4237)).toBe("42.4%");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinalAnglais)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
    expect([1, 2, 10].map(ordinalFrancais)).toEqual(["1re", "2e", "10e"]);
    expect(FR.placeSur(1, 3)).toBe("1re sur 3");
    expect(EN.placeSur(2, 3)).toBe("2nd of 3");
  });

  it("écrit un jour et une heure à Paris", () => {
    expect(FR.dateHeure("2026-11-13T13:05:00Z")).toBe("13 nov., 14:05");
    expect(EN.dateHeure("2026-11-13T13:05:00Z")).toBe("13 Nov, 14:05");
  });

  it("dit les règles du jeu avec le jour où elles ont été lues", () => {
    expect(FR.jour("2026-11-13T12:00:00Z")).toBe("13 nov. 2026");
    expect(EN.jour("2026-11-13T12:00:00Z")).toBe("13 Nov 2026");
    expect(FR.regles("1 000", "2 000", "13 nov. 2026")).toBe("1 000 troupes par pixel neutre, au moins 2 000 par pixel d'un autre clan, selon les règles du jeu lues le 13 nov. 2026.");
    expect(EN.regles("1,000", "2,000", "13 Nov 2026")).toBe("1,000 troops per neutral pixel, at least 2,000 per pixel of another clan, per the game rules read on 13 Nov 2026.");
  });

  it("dit en mots, sans signe, ce que la zone coûte au moins", () => {
    expect(FR.auMoins("2 000")).toBe("au moins 2 000");
    expect(EN.auMoins("2,000")).toBe("at least 2,000");
  });
});

describe("les refus du serveur en anglais", () => {
  it("couvrent chaque refus de la carte de l'alliance et de la connexion par code", () => {
    const sql = ["20261113000400_alliances_sur_la_carte", "20261113000500_allies_acceptes_par_l_encadrement", "20261113000600_zones_sans_chevauchement"].map((n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8")).join("\n");
    const codes = new Set([...sql.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    for (const m of sql.matchAll(/internal\.clean_label\(p_\w+, \d+, \d+, '([a-z_]+)'\)/g)) codes.add(m[1]!);
    // Ceux de la connexion par code, renvoyés par la fonction code-discord.
    for (const code of ["code_format", "code_invalid", "code_busy", "code_unavailable", "code_replayed", "too_many_codes", "discord_taken"]) codes.add(code);
    expect(codes.size).toBeGreaterThan(15);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES_EN))).toEqual([]);
  });

  it("existent aussi en français, et restent lisibles pour un code inconnu", () => {
    expect(Object.keys(ERROR_MESSAGES_EN).filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
    expect(errorMessageEn("code_inconnu")).toBe("Something unexpected went wrong.");
  });
});

describe("le nom d'une zone sur la carte", () => {
  const masque = (lignes: string[], x = 10, y = 20): Masque => {
    const w = lignes[0]!.length;
    const h = lignes.length;
    const bits = new Uint8Array(Math.ceil((w * h) / 8));
    lignes.join("").split("").forEach((c, i) => {
      if (c === "#") bits[i >> 3]! |= 1 << (i & 7);
    });
    expect(encoderBits(bits)).not.toBe("");
    return { x, y, w, h, bits };
  };

  it("s'écrit au milieu d'une zone pleine", () => {
    expect(pointCentral(masque(["###", "###", "###"]))).toEqual([11, 21]);
  });

  it("s'écrit sur la zone elle-même quand le milieu de son cadre est vide", () => {
    // Un anneau : le centre du cadre (12, 22) est hors de la zone ; le point choisi est l'un de ses pixels.
    const anneau = masque(["#####", "#...#", "#...#", "#...#", "#####"]);
    const [x, y] = pointCentral(anneau);
    const i = (y - 20) * 5 + (x - 10);
    expect((anneau.bits[i >> 3]! >> (i & 7)) & 1).toBe(1);
    expect(Math.abs(x - 12) + Math.abs(y - 22)).toBe(2);
  });
});
