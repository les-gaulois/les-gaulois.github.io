import { describe, expect, it } from "vitest";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import { FEU_COMMAND as FEU_DEFINITION } from "../../supabase/functions/code-discord/definitions";
import {
  echelleDuFeu,
  FEU_COMMAND,
  FEU_FILE,
  IMAGE_DU_FEU,
  imageDuFeu,
  MONDE_PATH,
  NOMS_DU_FEU,
  parseMonde,
  phraseDuFeu,
  PLACE_DU_LOGO,
  RELEVE_DU_FEU_MAX_MS,
  reponseDuFeu,
  sansFeu,
  type MondeLu,
} from "../../supabase/functions/code-discord/feu";
import { GRAND_FEU_HAUTEUR, GRAND_FEU_LARGEUR, imageDuGrandFeu } from "../../supabase/functions/code-discord/grand-feu";
import { momentDeParis } from "../../supabase/functions/code-discord/scene";
import { RELEVE_DU_FEU_MAX_MS as RELEVE_DU_SITE, etatDuMonde } from "../../src/lib/village/chantier";
import { NOMS_DU_FEU as NOMS_DU_SITE } from "../../src/lib/village/chantier-liste";

const SITE = "https://les-gaulois.github.io";
const DOWN = "Le site ne répond pas pour l'instant. Réessayez dans un moment.";
const RELEVE = "2026-11-14T12:53:28.840Z";
const MAINTENANT = new Date("2026-11-14T13:20:00.000Z");
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const MONDE: MondeLu = { releve: RELEVE, feu: { niveau: 2, points: 210.57, jours: 7 } };

describe("ce que /feu reprend du site", () => {
  it("les noms du feu et l'âge du relevé sont ceux du site", () => {
    expect(NOMS_DU_FEU).toEqual(NOMS_DU_SITE);
    expect(RELEVE_DU_FEU_MAX_MS).toBe(RELEVE_DU_SITE);
  });

  it("la commande porte le nom qu'attend la fonction, et tient dans les limites de Discord", () => {
    expect(FEU_DEFINITION.name).toBe(FEU_COMMAND);
    expect(FEU_DEFINITION.description.length).toBeLessThanOrEqual(100);
    expect(MONDE_PATH).toBe("/village/monde.json");
  });

  it("relit l'état du monde que publie le site : ce que calcule le site se relit tel quel", () => {
    const sessions = [{ gameId: "a", gameStart: "2026-11-13T20:00:00.000Z", score: 180.25 }];
    const site = etatDuMonde({ sessions, releve: RELEVE, moisIllisibles: [], maintenant: MAINTENANT });
    expect(parseMonde(JSON.parse(JSON.stringify(site)))).toEqual({ releve: RELEVE, feu: { niveau: 2, points: 180.25, jours: 7 } });
    expect(parseMonde(JSON.parse(JSON.stringify(etatDuMonde({ sessions, releve: null, moisIllisibles: [], maintenant: MAINTENANT }))))).toEqual({ releve: null, feu: null });
  });

  it("ne fait pas confiance au fichier : une forme inattendue ne se lit pas", () => {
    for (const bad of [null, [], "x", { releve: 3, feu: null }, { releve: "pas une date", feu: null }, { releve: RELEVE, feu: { niveau: 5, points: 1, jours: 7 } }, { releve: RELEVE, feu: { niveau: 1, points: -1, jours: 7 } }, { releve: RELEVE, feu: { niveau: 1, points: 1 } }, { releve: RELEVE, feu: "grand" }]) {
      expect(parseMonde(bad), JSON.stringify(bad)).toBeNull();
    }
    // Un feu sans relevé ne se date pas : il n'est pas montré.
    expect(parseMonde({ releve: null, feu: { niveau: 1, points: 120, jours: 7 } })).toEqual({ releve: null, feu: null });
  });
});

describe("la phrase du feu", () => {
  it("dit le feu, les points arrondis vers le bas, les jours et l'heure du relevé à Paris", () => {
    expect(plain(phraseDuFeu({ niveau: 2, points: 210.57, jours: 7 }, RELEVE))).toBe("Un beau feu : 210 points rapportés au clan sur les 7 derniers jours, au relevé du 14 novembre à 13 h 53.");
    expect(plain(phraseDuFeu({ niveau: 4, points: 1523.9, jours: 7 }, "2026-11-01T08:03:00.000Z"))).toBe("Un feu de joie : 1 523 points rapportés au clan sur les 7 derniers jours, au relevé du 1er novembre à 9 h 03.");
    expect(phraseDuFeu({ niveau: 0, points: 1.5, jours: 7 }, RELEVE)).toMatch(/^Des braises : 1 point rapporté au clan /);
    expect(phraseDuFeu({ niveau: 0, points: 0, jours: 7 }, RELEVE)).toMatch(/^Des braises : 0 point rapporté au clan /);
  });
});

describe("la réponse à /feu", () => {
  it("montre à tout le salon le feu en image jointe, la phrase sous l'image et un bouton vers le site du clan", async () => {
    const reponse = await reponseDuFeu(MONDE, MAINTENANT, SITE, DOWN);
    if (!reponse.image) throw new Error("une image était attendue");
    const message = reponse.message as { flags: number; components: { type: number; items?: { media: { url: string }; description: string }[]; content?: string; components?: { url: string; label: string; style: number }[] }[]; attachments: { filename: string; description: string }[]; allowed_mentions: unknown };
    const phrase = phraseDuFeu(MONDE.feu!, RELEVE);
    expect(message.flags).toBe(32768);
    expect(message.components[0]?.items?.[0]?.media.url).toBe(`attachment://${FEU_FILE}`);
    const description = message.components[0]?.items?.[0]?.description ?? "";
    expect(description.startsWith(phrase)).toBe(true);
    expect(description).toContain("au milieu de la place du village");
    expect(message.components[1]).toEqual({ type: 10, content: `-# ${phrase}` });
    expect(message.components[2]?.components?.[0]).toEqual({ type: 2, style: 5, label: "Le site du clan", url: SITE });
    expect(message.attachments).toEqual([{ id: 0, filename: FEU_FILE, description }]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(await lirePng(reponse.png)).toMatchObject({ largeur: IMAGE_DU_FEU.largeur, hauteur: IMAGE_DU_FEU.hauteur });
  });

  it("répond honnêtement, sans image : site muet, pas de feu, ou relevé de plus de 48 heures", async () => {
    expect(await reponseDuFeu(null, MAINTENANT, SITE, DOWN)).toEqual({ image: false, texte: DOWN });
    expect(await reponseDuFeu({ releve: RELEVE, feu: null }, MAINTENANT, SITE, DOWN)).toEqual({ image: false, texte: sansFeu(RELEVE, SITE) });
    expect(await reponseDuFeu({ releve: null, feu: null }, MAINTENANT, SITE, DOWN)).toEqual({ image: false, texte: sansFeu(null, SITE) });
    const vieux = new Date(Date.parse(RELEVE) + RELEVE_DU_FEU_MAX_MS + 1);
    expect(await reponseDuFeu(MONDE, vieux, SITE, DOWN)).toEqual({ image: false, texte: sansFeu(RELEVE, SITE) });
    expect((await reponseDuFeu(MONDE, new Date(Date.parse(RELEVE) + RELEVE_DU_FEU_MAX_MS), SITE, DOWN)).image).toBe(true);
    expect(sansFeu(RELEVE, SITE)).toContain("Dernier relevé : le 14 novembre à 13 h 53.");
    expect(sansFeu(RELEVE, SITE)).toContain(`Le site du clan : <${SITE}>`);
    expect(sansFeu(null, SITE)).not.toContain("Dernier relevé");
  });
});

describe("l'image du feu", () => {
  const SOL = (72 + 1) * IMAGE_DU_FEU.echelle;

  it("est celle de /gaulois : 496 × 320, au moins 1,55 fois plus large que haute", () => {
    expect(IMAGE_DU_FEU).toEqual({ largeur: 496, hauteur: 320, echelle: 4 });
    expect(IMAGE_DU_FEU.largeur / IMAGE_DU_FEU.hauteur).toBeGreaterThanOrEqual(1.55);
  });

  it("le feu entier tient entre le haut de l'image et le sol, à des cases entières", () => {
    const cote = echelleDuFeu(GRAND_FEU_LARGEUR, GRAND_FEU_HAUTEUR);
    expect(Number.isInteger(cote)).toBe(true);
    expect(GRAND_FEU_HAUTEUR * cote).toBeLessThanOrEqual(SOL);
    expect(GRAND_FEU_LARGEUR * cote).toBeLessThanOrEqual(IMAGE_DU_FEU.largeur);
    // Une case de plus ne tiendrait pas.
    expect(GRAND_FEU_HAUTEUR * (cote + 1) > SOL - 8 || cote === IMAGE_DU_FEU.echelle).toBe(true);
  });

  it("pose chaque case du feu, du plus petit au plus grand, au milieu, les pierres sur le sol", () => {
    const moment = momentDeParis(MAINTENANT);
    const cote = echelleDuFeu(GRAND_FEU_LARGEUR, GRAND_FEU_HAUTEUR);
    const gauche = Math.round((IMAGE_DU_FEU.largeur - GRAND_FEU_LARGEUR * cote) / 2);
    const haut = SOL - GRAND_FEU_HAUTEUR * cote;
    for (const niveau of [0, 1, 2, 3, 4] as const) {
      const image = imageDuFeu(niveau, moment);
      expect(image.rgba.length).toBe(IMAGE_DU_FEU.largeur * IMAGE_DU_FEU.hauteur * 4);
      const feu = imageDuGrandFeu(niveau, 0);
      let vues = 0;
      feu.cases.forEach((couleur, i) => {
        if (!couleur || vues > 40) return;
        const x = gauche + (i % feu.largeur) * cote;
        const y = haut + Math.floor(i / feu.largeur) * cote;
        const p = (y * IMAGE_DU_FEU.largeur + x) * 4;
        expect([image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]]).toEqual([1, 3, 5].map((k) => parseInt(couleur.slice(k, k + 2), 16)));
        vues++;
      });
      expect(vues).toBeGreaterThan(0);
      // La dernière rangée du feu, celle des pierres du foyer, repose sur le sol.
      const dernier = feu.cases.slice((feu.hauteur - 1) * feu.largeur).some((c) => c !== null);
      expect(dernier, `niveau ${niveau}`).toBe(true);
    }
  });

  it("porte le logo du clan en haut à gauche, et ne change pas d'une fois à l'autre", () => {
    const moment = momentDeParis(MAINTENANT);
    const a = imageDuFeu(3, moment);
    const b = imageDuFeu(3, moment);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
    expect(PLACE_DU_LOGO.x + PLACE_DU_LOGO.cote).toBeLessThan(Math.round((IMAGE_DU_FEU.largeur - GRAND_FEU_LARGEUR * echelleDuFeu(GRAND_FEU_LARGEUR, GRAND_FEU_HAUTEUR)) / 2));
  });
});
