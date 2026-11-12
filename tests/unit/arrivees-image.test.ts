import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DECORS, drawnName, PHRASES, phraseParts, type Decor, type Phrase } from "../../src/lib/arrivees";
import { arc, decorParts, FRAME, HEIGHT, PALETTES, WIDTH } from "../../src/lib/arrivees-decors";
import { arrivalAlt, arrivalLayout, arrivalSvg, avatarDataUri, fitName, renderArrival, WarriorAssets, WELCOME_LINE, wrapped, type ArrivalImage } from "../../src/lib/arrivees-image";
import { GazetteFonts, type CardText, type Measure } from "../../src/lib/gazette-image";

const SITE = "https://les-gaulois.github.io";
const NBSP = String.fromCodePoint(0xa0);
/** Une largeur approchée, pour tester la mise en page sans police : la chasse fixe fait 0,6 fois sa taille. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "mono" || font === "monoStrong" ? 0.6 : 0.62);
/** Des noms inventés, du plus court au plus long qu'accepte Discord, avec espaces, signes, chiffres et capitales larges. */
const NAMES = ["nx", "Brennos", "[GAL] Taranis", "lug_du_nord.6301", "Epona la Rapide", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "Un nom très long pour bien voir", "sansespacemaisvraimenttreslong32"];

/** Des tracés factices : le dessin se teste sans police ni fichier. */
const fakeFonts = { width: measure, paths: (item: CardText) => `<g fill="${item.color}" data-text="${item.text.length}"/>` };
const noAssets = { warriorMask: null, avatar: null };
const fakeAssets = { warriorMask: "data:image/png;base64,AAAA", avatar: "data:image/png;base64,AAAA" };

const image = (decor: Decor, name: string, phrase: Phrase = PHRASES[2]!): ArrivalImage => ({ decor, phrase, name });
const HEX = /^#[0-9A-F]{6}$/;

describe("wrapped", () => {
  it("coupe entre deux mots, jamais à une espace insécable", () => {
    expect(wrapped("VIENT DE FRANCHIR LA PALISSADE.", "title", 40, 400, measure)).toEqual(["VIENT DE", "FRANCHIR LA", "PALISSADE."]);
    expect(wrapped(`SONNEZ LE CARNYX${NBSP}:`, "title", 40, 420, measure)).toEqual(["SONNEZ LE", `CARNYX${NBSP}:`]);
    expect(wrapped("", "title", 40, 400, measure)).toEqual([]);
    expect(wrapped("UN", "title", 40, 400, measure)).toEqual(["UN"]);
  });
});

describe("fitName", () => {
  it("écrit un nom court sur une ligne, à la plus grande taille", () => {
    expect(fitName("nx", "name", 700, measure)).toEqual({ lines: ["nx"], size: 132 });
  });
  it("réduit un nom plus long pour qu'il tienne sur une ligne", () => {
    const fit = fitName("Epona la Rapide", "name", 700, measure);
    expect(fit.lines).toEqual(["Epona la Rapide"]);
    expect(fit.size).toBeLessThan(132);
    expect(measure("Epona la Rapide", "name", fit.size)).toBeLessThanOrEqual(700);
  });
  it("passe sur deux lignes, coupé au plus près du milieu, quand une ligne serait trop petite", () => {
    const fit = fitName("Un nom très long pour bien voir", "name", 700, measure);
    expect(fit.lines).toEqual(["Un nom très long", "pour bien voir"]);
    for (const line of fit.lines) expect(measure(line, "name", fit.size)).toBeLessThanOrEqual(700);
  });
  it("coupe après un signe quand le nom n'a pas d'espace", () => {
    const fit = fitName("lechevalier_de_la_table_ronde.99", "name", 520, measure);
    expect(fit.lines).toHaveLength(2);
    expect(fit.lines.join("")).toBe("lechevalier_de_la_table_ronde.99");
    expect(fit.lines[0]).toMatch(/[._]$/);
  });
  it("en dernier recours, coupe où la ligne s'arrête et termine par des points de suspension", () => {
    const fit = fitName("W".repeat(32), "name", 300, measure);
    expect(fit.lines).toHaveLength(2);
    expect(fit.lines[1]?.endsWith("…")).toBe(true);
    for (const line of fit.lines) expect(measure(line, "name", fit.size)).toBeLessThanOrEqual(300);
  });
});

describe("arrivalLayout", () => {
  it("écrit l'invite, la phrase en capitales autour du nom, puis la réponse de la machine et l'adresse du site", () => {
    const layout = arrivalLayout(image("etendard", "Brennos", PHRASES[0]), SITE, measure);
    const words = layout.texts.map((t) => t.text);
    expect(words.slice(0, 5).join("")).toBe("gal@clan:~$ ./accueillir");
    expect(words).toContain("UN");
    expect(words).toContain("SAUVAGE SURGIT DE LA FORÊT.");
    expect(layout.name.map((t) => t.text)).toEqual(["Brennos"]);
    expect(words.join("")).toContain(`[ OK ] ${WELCOME_LINE} · les-gaulois.github.io`);
  });
  it("place tout au même endroit dans les six couleurs : seul le clair de la couleur change", () => {
    const where = (decor: Decor) => arrivalLayout(image(decor, "Brennos"), SITE, measure);
    const reference = where("etendard");
    for (const decor of DECORS) {
      const layout = where(decor);
      expect(layout.texts.map((t) => [t.text, t.x, t.y, t.size, t.font]), decor).toEqual(reference.texts.map((t) => [t.text, t.x, t.y, t.size, t.font]));
      expect(layout.name, decor).toEqual(reference.name);
      // Le dossier de l'invite et l'adresse du site prennent le clair de la couleur.
      expect(layout.texts.filter((t) => t.text === "~" || t.text === "les-gaulois.github.io").map((t) => t.color), decor).toEqual([PALETTES[decor].clair, PALETTES[decor].clair]);
    }
  });
  it("tient dans la colonne du texte, pour chaque phrase et chaque nom", () => {
    const { x, width, top, bottom } = FRAME.text;
    for (const phrase of PHRASES) {
      for (const name of NAMES) {
        const where = `${phrase.texte} · ${name}`;
        const layout = arrivalLayout(image("etendard", name, phrase), SITE, measure);
        expect(layout.name.length, where).toBeGreaterThanOrEqual(1);
        expect(layout.name.length, where).toBeLessThanOrEqual(2);
        for (const t of [...layout.texts, ...layout.name]) {
          expect(t.x, where).toBeGreaterThanOrEqual(x);
          expect(t.x + measure(t.text, t.font, t.size), `${where} · « ${t.text} »`).toBeLessThanOrEqual(x + width + 0.5);
          expect(Number.isFinite(t.y) && Number.isFinite(t.size), where).toBe(true);
        }
        // Le bloc reste entre les bords de la colonne, et dans l'image.
        expect(layout.top, where).toBeGreaterThanOrEqual(top);
        expect(layout.bottom, where).toBeLessThanOrEqual(bottom + 0.5);
        expect(layout.bottom, where).toBeLessThanOrEqual(HEIGHT);
        // Les lignes ne se recouvrent pas : chacune commence sous la ligne de base de la précédente.
        const lines = [...layout.texts, ...layout.name].sort((a, b) => a.y - b.y);
        lines.forEach((line, i) => {
          const previous = lines[i - 1];
          if (previous && previous.y !== line.y) expect(line.y - line.size * 0.74, `${where} · « ${line.text} » sous « ${previous.text} »`).toBeGreaterThanOrEqual(previous.y);
        });
        // Le nom est ce qui s'écrit le plus grand.
        expect(layout.name[0]!.size, where).toBeGreaterThan(Math.max(...layout.texts.map((t) => t.size)));
      }
    }
  });
  it("écrit tout le nom, ou le termine par des points de suspension", () => {
    for (const name of NAMES) {
      const joined = arrivalLayout(image("etendard", name), SITE, measure)
        .name.map((t) => t.text)
        .join(" ");
      if (!joined.endsWith("…")) expect(joined.replace(/ /g, ""), name).toBe(name.replace(/ /g, ""));
    }
  });
});

describe("l'étendard et ses couleurs", () => {
  it("laisse le médaillon et la colonne du texte dans l'image, sans qu'ils se touchent", () => {
    const { cx, cy, r } = FRAME.avatar;
    expect(cx - r).toBeGreaterThan(0);
    expect(cy - r).toBeGreaterThan(0);
    expect(cy + r).toBeLessThan(HEIGHT);
    expect(FRAME.text.x).toBeGreaterThan(cx + r + 20);
    expect(FRAME.text.x + FRAME.text.width).toBeLessThanOrEqual(WIDTH - 24);
    expect(FRAME.text.top).toBeGreaterThanOrEqual(0);
    expect(FRAME.text.bottom).toBeLessThanOrEqual(HEIGHT);
  });
  it("a six couleurs complètes, toutes différentes, l'étendard du pilote en premier", () => {
    expect(Object.keys(PALETTES)).toEqual([...DECORS]);
    expect(PALETTES.etendard.fond).toEqual(["#11286A", "#081338", "#020614"]);
    for (const decor of DECORS) {
      const p = PALETTES[decor];
      for (const color of [...p.fond, p.lueur, p.reflet, ...p.guerrier, p.clair, p.halo, p.voile, p.socle, p.plaque]) expect(color, decor).toMatch(HEX);
      for (const force of [p.lueurForce, p.refletForce, p.guerrierForce]) {
        expect(force, decor).toBeGreaterThan(0);
        expect(force, decor).toBeLessThanOrEqual(1);
      }
    }
    expect(new Set(DECORS.map((d) => PALETTES[d].fond.join())).size).toBe(DECORS.length);
  });
  it("garde les mêmes formes dans toutes les couleurs : seules les couleurs changent", () => {
    const shapes = (decor: Decor) => {
      const parts = decorParts(decor, fakeAssets);
      return (parts.defs + parts.under + parts.over).replace(/#[0-9A-Fa-f]{6}/g, "#").replace(/(stop-opacity|opacity)="[0-9.]+"/g, '$1=""');
    };
    for (const decor of DECORS) expect(shapes(decor), decor).toBe(shapes("etendard"));
  });
  it("garde l'écharpe tricolore du drapeau dans toutes les couleurs", () => {
    for (const decor of DECORS) {
      const { under } = decorParts(decor, fakeAssets);
      // Chaque bande deux fois : une fois floue, une fois nette.
      for (const flag of ["#0B5FFF", "#FFFFFF", "#FF1A2E"]) expect(under.match(new RegExp(`<ellipse [^>]*stroke="${flag}"`, "g"))?.length, `${decor} · ${flag}`).toBe(2);
    }
  });
  it("n'écrit ni nombre impossible ni valeur oubliée, avec ou sans le logo du guerrier", () => {
    for (const decor of DECORS) {
      for (const assets of [noAssets, fakeAssets]) {
        const parts = decorParts(decor, assets);
        expect(parts.defs + parts.under + parts.over, decor).not.toMatch(/NaN|undefined|Infinity|\[object/);
      }
      expect(decorParts(decor, noAssets).under, decor).not.toContain('mask="url(#e-mask)"');
    }
  });
  it("dessine un arc", () => {
    expect(arc(100, 100, 50, 0, 90)).toBe("M150 100A50 50 0 0 1 100 150");
    expect(arc(100, 100, 50, 0, 270)).toContain("A50 50 0 1 1");
  });
});

describe("arrivalSvg", () => {
  it("assemble l'étendard, le médaillon, le texte et le nom en trois couleurs, dans chaque couleur", () => {
    for (const decor of DECORS) {
      const svg = arrivalSvg(image(decor, "Brennos"), SITE, fakeFonts, fakeAssets);
      expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"`), decor).toBe(true);
      expect(svg.endsWith("</svg>"), decor).toBe(true);
      expect(svg, decor).not.toMatch(/NaN|undefined|Infinity|\[object/);
      expect(svg.match(/href="#nm"/g), decor).toHaveLength(4);
      // La photo de profil, découpée dans son rond.
      expect(svg, decor).toContain('clip-path="url(#av-clip)"');
      // Le halo du nom et le voile prennent la couleur.
      expect(svg, decor).toContain(`<use href="#nm" color="${PALETTES[decor].clair}"`);
      expect(svg, decor).toContain(`stop-color="${PALETTES[decor].voile}"`);
    }
  });
  it("sans photo, écrit l'initiale du nom ; sans logo, se dessine quand même", () => {
    const svg = arrivalSvg(image("etendard", "brennos"), SITE, fakeFonts, noAssets);
    expect(svg).not.toContain("<image");
    expect(svg).not.toMatch(/NaN|undefined/);
    const withPhoto = arrivalSvg(image("etendard", "brennos"), SITE, fakeFonts, { ...noAssets, avatar: "data:image/png;base64,AAAA" });
    expect(withPhoto.match(/<image/g)).toHaveLength(1);
  });
  it("garde un médaillon uni si l'initiale ne s'écrit pas", () => {
    const fragile = {
      width: measure,
      paths: (item: CardText) => {
        if (item.font === "name" && item.anchor === "middle") throw new Error("un caractère ne peut pas être dessiné");
        return fakeFonts.paths(item);
      },
    };
    expect(() => arrivalSvg(image("vin", "Brennos"), SITE, fragile, noAssets)).not.toThrow();
  });
});

describe("arrivalAlt", () => {
  it("dit la phrase entière, avec le nom entier", () => {
    expect(arrivalAlt(PHRASES[0]!, "Brennos", "GAL")).toBe(`Image de bienvenue du clan [GAL]. Un Brennos sauvage surgit de la forêt. ${WELCOME_LINE}.`);
    expect(arrivalAlt(PHRASES[0]!, "x".repeat(2000), "GAL").length).toBeLessThanOrEqual(1024);
  });
  it("garde tel quel un nom avec « $ »", () => {
    expect(arrivalAlt(PHRASES[0]!, "Ca$$h", "GAL")).toBe(`Image de bienvenue du clan [GAL]. Un Ca$$h sauvage surgit de la forêt. ${WELCOME_LINE}.`);
  });
});

describe("le dessin avec les vraies polices", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const warrior = new WarriorAssets(root);
  const draws = (char: string) => fonts.draws(char, "name");

  it("sait écrire chaque phrase en capitales dans la police des titres", () => {
    for (const phrase of PHRASES) {
      const { avant, apres } = phraseParts(phrase);
      for (const part of [avant, apres]) {
        // Un caractère que la police ne connaît pas ferait lever une erreur ; un texte écrit a une largeur.
        const width = fonts.width(part.toLocaleUpperCase("fr"), "title", 30);
        if (part) expect(width, phrase.texte).toBeGreaterThan(30);
        else expect(width).toBe(0);
      }
    }
  });
  it("tient dans la colonne du texte avec la vraie police, pour chaque phrase et des noms extrêmes", () => {
    const { x, width } = FRAME.text;
    for (const phrase of PHRASES) {
      for (const name of ["nx", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "Un nom très long pour bien voir"]) {
        const layout = arrivalLayout(image("etendard", name, phrase), SITE, fonts.width);
        for (const t of [...layout.texts, ...layout.name]) expect(t.x + fonts.width(t.text, t.font, t.size), `${phrase.texte} · ${name} · « ${t.text} »`).toBeLessThanOrEqual(x + width + 0.5);
      }
    }
  });
  it("garde les petites lignes vertes et grises lisibles sur chaque couleur : 4,5:1 au moins", async () => {
    // Le contraste WCAG, contre le plus clair des 5 % de pixels du fond rendu sans texte, sous chaque ligne.
    const linear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const ofHex = (hex: string) => luminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const assets = { ...(await warrior.load()), avatar: null };
    for (const decor of DECORS) {
      for (const [phrase, name] of [
        [PHRASES[2]!, "Brennos"],
        [PHRASES[13]!, "Un nom très long pour bien voir"],
      ] as const) {
        const shown: ArrivalImage = { decor, phrase, name };
        const layout = arrivalLayout(shown, SITE, fonts.width);
        const svg = arrivalSvg(shown, SITE, { width: fonts.width, paths: () => "" }, assets);
        const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        // L'adresse du site, au bout de la dernière ligne, n'est pas comptée : voir le commentaire de PALETTES.
        for (const t of layout.texts.filter((line) => (line.color === "#4ADE80" || line.color === "#C0C9E2") && line.text.trim() !== "" && line.text !== "les-gaulois.github.io")) {
          const levels: number[] = [];
          for (let y = Math.round(t.y - t.size * 0.8); y <= Math.round(t.y + t.size * 0.1); y++) {
            for (let x = Math.round(t.x); x <= Math.round(t.x + fonts.width(t.text, t.font, t.size)); x++) {
              const p = (y * info.width + x) * 3;
              levels.push(luminance(data[p]!, data[p + 1]!, data[p + 2]!));
            }
          }
          levels.sort((a, b) => a - b);
          const brightest = levels[Math.floor(levels.length * 0.95)] ?? 1;
          expect(contrast(ofHex(t.color), brightest), `${decor} · « ${t.text} »`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }, 60_000);
  it("écrit en chasse fixe sans ligature : « -- », « :: » et « != » ne font pas échouer l'image", () => {
    for (const text of ["./accueillir --nouveau", "a::b", "x!=y", "-->", "<=", "www"]) {
      expect(fonts.width(text, "mono", 20), text).toBeCloseTo(text.length * 12, 5);
      expect(fonts.paths({ text, x: 0, y: 0, size: 20, font: "mono", color: "#fff" }), text).toContain("<path");
    }
  });
  it("sait quels caractères il dessine", () => {
    for (const char of ["a", "É", "[", "_", "°", "я", "λ", NBSP]) expect(draws(char), char).toBe(true);
    for (const cp of [0x1f409, 0x5c71, 0x300e, 0x0627]) expect(draws(String.fromCodePoint(cp)), cp.toString(16)).toBe(false);
  });
  it("rend un PNG de 1 200 × 480 dans chaque couleur, avec ou sans photo de profil", async () => {
    const photo = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 0.5 } } }).png().toBuffer();
    for (const [i, decor] of DECORS.entries()) {
      const name = drawnName(NAMES[i % NAMES.length]!, "gaulois", draws);
      const png = await renderArrival(image(decor, name, PHRASES[i]!), SITE, fonts, warrior, i % 2 === 0 ? photo : null);
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height], decor).toEqual(["png", WIDTH, HEIGHT]);
      // Discord accepte dix mégaoctets : l'image en reste loin.
      expect(png.length, decor).toBeLessThan(1_500_000);
      expect(png.length, decor).toBeGreaterThan(20_000);
    }
  }, 60_000);
  it("dessine un nom que seule une partie des polices connaît", async () => {
    for (const raw of ["Иван Петрович", "Ωmega::--!=", `[GAL]${String.fromCodePoint(0x300e)}Luern${String.fromCodePoint(0x1f409)}`]) {
      const name = drawnName(raw, "gaulois", draws);
      const png = await renderArrival(image("nuit", name), SITE, fonts, warrior, null);
      expect((await sharp(png).metadata()).width, raw).toBe(WIDTH);
    }
  }, 60_000);
  it("remplace une photo illisible par l'initiale, sans échouer", async () => {
    const png = await renderArrival(image("acier", "Brennos"), SITE, fonts, warrior, Buffer.from("ceci n'est pas une image"));
    expect((await sharp(png).metadata()).height).toBe(HEIGHT);
    await expect(avatarDataUri(Buffer.alloc(0))).rejects.toThrow("taille inattendue");
  }, 60_000);
});
