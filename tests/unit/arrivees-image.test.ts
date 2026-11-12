import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DECORS, drawnName, PHRASES, phraseParts, type Decor, type Phrase } from "../../src/lib/arrivees";
import { arc, decorParts, HEIGHT, shieldPath, WIDTH, type DecorAssets } from "../../src/lib/arrivees-decors";
import { arrivalAlt, arrivalLayout, arrivalSvg, avatarDataUri, fitName, renderArrival, WarriorAssets, WELCOME_LINE, wrapped, type ArrivalImage } from "../../src/lib/arrivees-image";
import { GazetteFonts, type CardText, type Measure } from "../../src/lib/gazette-image";
import { logoMatrice } from "../../src/lib/logo-matrice";

const SITE = "https://les-gaulois.github.io";
const NBSP = String.fromCodePoint(0xa0);
/** Une largeur approchée, pour tester la mise en page sans police : la chasse fixe fait 0,6 fois sa taille. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "mono" || font === "monoStrong" ? 0.6 : 0.62);
/** Des noms inventés, du plus court au plus long qu'accepte Discord, avec espaces, signes, chiffres et capitales larges. */
const NAMES = ["nx", "Brennos", "[GAL] Taranis", "lug_du_nord.6301", "Epona la Rapide", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "Un nom très long pour bien voir", "sansespacemaisvraimenttreslong32"];

/** Des tracés factices : le dessin se teste sans police ni fichier. */
const fakeFonts = { width: measure, paths: (item: CardText) => `<g fill="${item.color}" data-text="${item.text.length}"/>` };
const noAssets = { warriorMask: null, warriorColor: null, matrix: null, matrixSmall: null, avatar: null };
/** Un petit logo de quatre cases, pour les décors qui dessinent le guerrier en caractères. */
const tinyMatrix = logoMatrice(Uint8Array.from([255, 255, 255, 20, 60, 255, 255, 30, 40, 5, 5, 20]), 2, 2, 3);
const fakeAssets = { warriorMask: "data:image/png;base64,AAAA", warriorColor: "data:image/png;base64,AAAA", matrix: tinyMatrix, matrixSmall: tinyMatrix, avatar: "data:image/png;base64,AAAA" };
const decorAssets = (assets: typeof noAssets | typeof fakeAssets): DecorAssets => ({ ...assets, text: fakeFonts.paths });

const phraseOf = (decor: Decor, index = 0): Phrase => PHRASES.filter((p) => p.decors.includes(decor))[index] ?? PHRASES[0]!;
const image = (decor: Decor, name: string, phrase: Phrase = phraseOf(decor), seed = 7): ArrivalImage => ({ decor, seed, phrase, name });

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
  it("écrit l'invite, la phrase en capitales autour du nom, puis la réponse de la machine", () => {
    const decor = decorParts("foret", 7, decorAssets(noAssets));
    const layout = arrivalLayout(image("foret", "Brennos", PHRASES[0]), decor.frame, SITE, measure);
    const words = layout.texts.map((t) => t.text);
    expect(words.slice(0, 5).join("")).toBe("gal@clan:~/village$ ./ouvrir-la-porte");
    expect(words).toContain("UN");
    expect(words).toContain("SAUVAGE SURGIT DE LA FORÊT.");
    expect(layout.name.map((t) => t.text)).toEqual(["Brennos"]);
    expect(words.join("")).toContain(`[ OK ] ${WELCOME_LINE}`);
    expect(layout.cursor).toBeNull();
  });
  it("écrit l'adresse du site au bout de la dernière ligne, sauf quand la colonne est trop étroite pour elle", () => {
    const wide = decorParts("etendard", 7, decorAssets(noAssets));
    expect(arrivalLayout(image("etendard", "Brennos"), wide.frame, SITE, measure).texts.map((t) => t.text).join("")).toContain(`[ OK ] ${WELCOME_LINE} · les-gaulois.github.io`);
    const narrow = decorParts("matrice", 7, decorAssets(noAssets));
    const words = arrivalLayout(image("matrice", "Brennos"), narrow.frame, SITE, measure).texts.map((t) => t.text).join("");
    expect(words).toContain(`[ OK ] ${WELCOME_LINE}`);
    expect(words).not.toContain("github.io");
  });
  it("dans la console, écrit le nom après un « > », suivi d'un curseur", () => {
    const decor = decorParts("terminal", 7, decorAssets(noAssets));
    const layout = arrivalLayout(image("terminal", "Brennos"), decor.frame, SITE, measure);
    expect(layout.texts.some((t) => t.text === ">" && t.font === "monoStrong")).toBe(true);
    expect(layout.name[0]?.font).toBe("monoStrong");
    expect(layout.cursor).not.toBeNull();
    const last = layout.name.at(-1)!;
    expect(layout.cursor!.x).toBeGreaterThan(last.x + measure(last.text, last.font, last.size));
    expect(layout.cursor!.x + layout.cursor!.width).toBeLessThanOrEqual(WIDTH);
  });
  it("tient dans la colonne du décor, pour chaque décor, chaque phrase et chaque nom", () => {
    for (const decor of DECORS) {
      const { frame } = decorParts(decor, 3, decorAssets(noAssets));
      const { x, width, top, bottom } = frame.text;
      for (const phrase of PHRASES.filter((p) => p.decors.includes(decor))) {
        for (const name of NAMES) {
          const where = `${decor} · ${phrase.texte} · ${name}`;
          const layout = arrivalLayout(image(decor, name, phrase), frame, SITE, measure);
          expect(layout.name.length, where).toBeGreaterThanOrEqual(1);
          expect(layout.name.length, where).toBeLessThanOrEqual(2);
          for (const t of [...layout.texts, ...layout.name]) {
            expect(t.x, where).toBeGreaterThanOrEqual(x);
            expect(t.x + measure(t.text, t.font, t.size), `${where} · « ${t.text} »`).toBeLessThanOrEqual(x + width + 0.5);
            expect(Number.isFinite(t.y) && Number.isFinite(t.size), where).toBe(true);
          }
          // Le bloc reste entre les bords que le décor lui laisse, et dans l'image.
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
          const biggest = Math.max(...layout.texts.filter((t) => t.text !== ">").map((t) => t.size));
          expect(layout.name[0]!.size, where).toBeGreaterThan(biggest);
        }
      }
    }
  });
  it("écrit tout le nom, ou le termine par des points de suspension", () => {
    for (const decor of DECORS) {
      const { frame } = decorParts(decor, 3, decorAssets(noAssets));
      for (const name of NAMES) {
        const written = arrivalLayout(image(decor, name), frame, SITE, measure).name.map((t) => t.text);
        const joined = written.join(" ");
        if (!joined.endsWith("…")) expect(joined.replace(/ /g, ""), `${decor} · ${name}`).toBe(name.replace(/ /g, ""));
      }
    }
  });
});

describe("les décors", () => {
  it("laissent le médaillon et la colonne du texte dans l'image, sans qu'ils se touchent", () => {
    for (const decor of DECORS) {
      const { frame } = decorParts(decor, 5, decorAssets(fakeAssets));
      const { cx, cy, r } = frame.avatar;
      expect(cx - r, decor).toBeGreaterThan(0);
      expect(cy - r, decor).toBeGreaterThan(0);
      expect(cy + r, decor).toBeLessThan(HEIGHT);
      expect(frame.text.x, decor).toBeGreaterThan(cx + r + 20);
      expect(frame.text.x + frame.text.width, decor).toBeLessThanOrEqual(WIDTH - 24);
      expect(frame.text.top, decor).toBeGreaterThanOrEqual(0);
      expect(frame.text.bottom, decor).toBeLessThanOrEqual(HEIGHT);
      expect(frame.prompt.command, decor).toMatch(/^\.\/[a-z-]+( --[a-z]+)?$/);
    }
  });
  it("redonnent le même dessin pour le même tirage, et un autre pour un autre tirage", () => {
    for (const decor of DECORS) {
      const draw = (seed: number) => {
        const parts = decorParts(decor, seed, decorAssets(fakeAssets));
        return parts.defs + parts.under + parts.over;
      };
      expect(draw(11), decor).toBe(draw(11));
      // L'étendard et le bouclier n'ont pas de hasard : ils ne changent pas.
      if (decor !== "etendard" && decor !== "bouclier") expect(draw(11), decor).not.toBe(draw(12));
    }
  });
  it("n'écrivent ni nombre impossible ni valeur oubliée, avec ou sans le logo du guerrier", () => {
    for (const decor of DECORS) {
      for (const assets of [noAssets, fakeAssets]) {
        const parts = decorParts(decor, 9, decorAssets(assets));
        expect(parts.defs + parts.under + parts.over, decor).not.toMatch(/NaN|undefined|Infinity|\[object/);
      }
    }
  });
  it("dessinent un arc et un bouclier fermés", () => {
    expect(arc(100, 100, 50, 0, 90)).toBe("M150 100A50 50 0 0 1 100 150");
    expect(arc(100, 100, 50, 0, 270)).toContain("A50 50 0 1 1");
    const shield = shieldPath(200, 240, 130, 210);
    expect(shield.startsWith("M")).toBe(true);
    expect(shield.endsWith("Z")).toBe(true);
    expect(shield.match(/Q/g)).toHaveLength(6);
  });
});

describe("arrivalSvg", () => {
  it("assemble le décor, le médaillon, le texte et le nom en trois couleurs", () => {
    for (const decor of DECORS) {
      const svg = arrivalSvg(image(decor, "Brennos"), SITE, fakeFonts, fakeAssets);
      expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"`), decor).toBe(true);
      expect(svg.endsWith("</svg>"), decor).toBe(true);
      expect(svg, decor).not.toMatch(/NaN|undefined|Infinity|\[object/);
      expect(svg.match(/href="#nm"/g), decor).toHaveLength(4);
      // La photo de profil, découpée dans son cadre.
      expect(svg, decor).toContain('clip-path="url(#av-clip)"');
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
    const fragile = { width: measure, paths: (item: CardText) => (item.font === "name" && item.anchor === "middle" ? (() => { throw new Error("un caractère ne peut pas être dessiné"); })() : fakeFonts.paths(item)) };
    expect(() => arrivalSvg(image("carte", "Brennos"), SITE, fragile, noAssets)).not.toThrow();
  });
});

describe("arrivalAlt", () => {
  it("dit la phrase entière, avec le nom entier", () => {
    expect(arrivalAlt(PHRASES[0]!, "Brennos", "GAL")).toBe(`Image de bienvenue du clan [GAL]. Un Brennos sauvage surgit de la forêt. ${WELCOME_LINE}.`);
    expect(arrivalAlt(PHRASES[0]!, "x".repeat(2000), "GAL").length).toBeLessThanOrEqual(1024);
  });
});

describe("le dessin avec les vraies polices", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const warrior = new WarriorAssets(root);
  const draws = (char: string) => fonts.draws(char, "name") && fonts.draws(char, "monoStrong");

  it("sait écrire chaque phrase, en capitales, dans la police des titres et dans la chasse fixe", () => {
    for (const phrase of PHRASES) {
      const { avant, apres } = phraseParts(phrase);
      for (const part of [avant, apres]) {
        // Un caractère que la police ne connaît pas ferait lever une erreur ; un texte écrit a une largeur.
        for (const font of ["title", "monoStrong"] as const) {
          const width = fonts.width(part.toLocaleUpperCase("fr"), font, 30);
          if (part) expect(width, `${phrase.texte} · ${font}`).toBeGreaterThan(30);
          else expect(width).toBe(0);
        }
      }
    }
  });
  it("écrit en chasse fixe sans ligature : « -- », « :: » et « != » ne font pas échouer l'image", () => {
    for (const text of ["./accueillir --nouveau", "a::b", "x!=y", "-->", "<=", "www"]) {
      expect(fonts.width(text, "mono", 20), text).toBeCloseTo(text.length * 12, 5);
      expect(fonts.paths({ text, x: 0, y: 0, size: 20, font: "monoStrong", color: "#fff" }), text).toContain("<path");
    }
  });
  it("sait quels caractères il dessine", () => {
    for (const char of ["a", "É", "[", "_", "°", "я", "λ", NBSP]) expect(draws(char), char).toBe(true);
    for (const cp of [0x1f409, 0x5c71, 0x300e, 0x0627]) expect(draws(String.fromCodePoint(cp)), cp.toString(16)).toBe(false);
  });
  it("rend un PNG de 1 200 × 480 pour chaque décor, avec ou sans photo de profil", async () => {
    const photo = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 0.5 } } }).png().toBuffer();
    for (const [i, decor] of DECORS.entries()) {
      const name = drawnName(NAMES[i % NAMES.length]!, "gaulois", draws);
      const png = await renderArrival(image(decor, name, phraseOf(decor, i % 2), 40 + i), SITE, fonts, warrior, i % 2 === 0 ? photo : null);
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height], decor).toEqual(["png", WIDTH, HEIGHT]);
      // Discord accepte dix mégaoctets : l'image en reste loin.
      expect(png.length, decor).toBeLessThan(1_500_000);
      expect(png.length, decor).toBeGreaterThan(20_000);
    }
  }, 60_000);
  it("dessine un nom que seule une partie des polices connaît, et un nom qui ferait des ligatures", async () => {
    for (const raw of ["Иван Петрович", "Ωmega::--!=", `[GAL]${String.fromCodePoint(0x300e)}Luern${String.fromCodePoint(0x1f409)}`]) {
      const name = drawnName(raw, "gaulois", draws);
      const png = await renderArrival(image("terminal", name), SITE, fonts, warrior, null);
      expect((await sharp(png).metadata()).width, raw).toBe(WIDTH);
    }
  }, 60_000);
  it("remplace une photo illisible par l'initiale, sans échouer", async () => {
    const png = await renderArrival(image("carte", "Brennos"), SITE, fonts, warrior, Buffer.from("ceci n'est pas une image"));
    expect((await sharp(png).metadata()).height).toBe(HEIGHT);
    await expect(avatarDataUri(Buffer.alloc(0))).rejects.toThrow("taille inattendue");
  }, 60_000);
});

describe("la description d'un nom avec « $ »", () => {
  it("garde le nom tel quel", () => {
    expect(arrivalAlt(PHRASES[0]!, "Ca$$h", "GAL")).toBe(`Image de bienvenue du clan [GAL]. Un Ca$$h sauvage surgit de la forêt. ${WELCOME_LINE}.`);
  });
});
