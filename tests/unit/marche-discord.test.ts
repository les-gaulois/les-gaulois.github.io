import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { drawnWidth, GazetteFonts, type CardText } from "../../src/lib/gazette-image";
import {
  annonceDuMarcheEnMots,
  boutiqueEnMots,
  cleDAnnonce,
  IMAGES_PAR_PASSAGE,
  imagesDuMarche,
  lireLeMarche,
  lireReponseDuMarche,
  ligneEnMots,
  marchePass,
  marchePayload,
  mergeMarcheStates,
  parseMarcheState,
  titreDuMarche,
  type AnnonceDuMarche,
  type ImageDuMarche,
  type LectureDuMarche,
  type MarcheSendState,
} from "../../src/lib/marche-discord";
import { accrocheDuMarche, boutiqueEnCourt, marcheCard, marcheImageAlt, periodeDuMarche, renderMarcheCard } from "../../src/lib/marche-image";

const SITE = "https://x.test/";
const NOW = new Date("2026-11-19T20:30:00.000Z");
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

const ligne = (id: number, emplacement: string, objet: string, prix: number, extra: Record<string, unknown> = {}) => ({
  id,
  emplacement,
  objet,
  prix,
  prix_boutique: 2500,
  en_rayon: true,
  compte: 7,
  nom: "Brennos",
  discord: "brennos",
  le: "2026-11-19T20:20:00+00:00",
  ...extra,
});

const annonce = (sorte: "offre" | "demande", id: number, extra: Partial<AnnonceDuMarche> = {}): AnnonceDuMarche => ({
  sorte,
  id,
  emplacement: "tete",
  objet: "casque-or",
  nomObjet: "Casque d'or",
  rarete: "legendaire",
  prix: 1800,
  prixBoutique: 2500,
  enRayon: true,
  compte: 7,
  nom: "Brennos",
  discord: "brennos",
  le: "2026-11-19T20:20:00.000Z",
  ...extra,
});

describe("la lecture des offres et demandes", () => {
  it("garde les lignes lisibles d'un objet payant, et compte les autres", () => {
    const lu = lireReponseDuMarche({
      ok: true,
      offres_jusqu_a: 12,
      demandes_jusqu_a: 5,
      offres: [ligne(11, "tete", "casque-or", 1800), ligne(12, "tete", "bonnet", 10), { id: 3 }],
      demandes: [ligne(5, "arme", "hache", 140, { en_rayon: false, discord: null, nom: "Gaulois n° 9" }), ligne(4, "ailleurs", "x", 10)],
    })!;
    expect(lu.offresJusquA).toBe(12);
    expect(lu.demandesJusquA).toBe(5);
    expect(lu.annonces.map(cleDAnnonce)).toEqual(["o11", "d5"]);
    expect(lu.inconnus).toBe(3);
    expect(lu.annonces[1]).toMatchObject({ sorte: "demande", nomObjet: "Hache", enRayon: false, discord: null, nom: "Gaulois n° 9" });
    expect(lireReponseDuMarche({ ok: false })).toBeNull();
  });

  it("ne lit rien sans réglage, signale une fonction absente sans fuite de clé", async () => {
    expect((await lireLeMarche(null, null, {})).etat).toBe("sans-reglage");
    const absente = await lireLeMarche(1, 1, { SUPABASE_URL: "https://p.test", SUPABASE_SECRET_KEY: "sb_secret_abcdef" }, async () => {
      throw Object.assign(new Error("Could not find the function public.annonces_du_marche"), { code: "PGRST202" });
    });
    expect(absente.etat).toBe("fonction-absente");
    const panne = await lireLeMarche(1, 1, { SUPABASE_URL: "https://p.test", SUPABASE_SECRET_KEY: "sb_secret_abcdef" }, async () => {
      throw new Error("refus pour https://p.test avec sb_secret_abcdef");
    });
    expect(panne.etat === "panne" && !panne.warning.includes("sb_secret_abcdef") && !panne.warning.includes("https://p.test")).toBe(true);
  });

  it("réunit les deux copies de l'état", () => {
    const a: MarcheSendState = { depuis: "2026-11-19T10:00:00.000Z", offres_jusqu_a: 10, demandes_jusqu_a: 3, envoyees: ["o12", "d4"], dernier_envoi: "2026-11-19T11:00:00.000Z" };
    const b: MarcheSendState = { depuis: "2026-11-19T09:00:00.000Z", offres_jusqu_a: 12, demandes_jusqu_a: 2, envoyees: ["o13"], dernier_envoi: null };
    expect(mergeMarcheStates(a, b)).toEqual({ depuis: "2026-11-19T09:00:00.000Z", offres_jusqu_a: 12, demandes_jusqu_a: 3, envoyees: ["d4", "o13"], dernier_envoi: "2026-11-19T11:00:00.000Z" });
    expect(mergeMarcheStates(null, null)).toBeNull();
    expect(parseMarcheState("pas du json").state).toBeNull();
    expect(parseMarcheState(JSON.stringify(a)).state).toEqual(a);
  });
});

describe("les mots de l'annonce", () => {
  it("dit l'objet, le prix et la boutique, en mots", () => {
    const image: ImageDuMarche = { sorte: "offre", nom: "Brennos", discord: "brennos", annonces: [annonce("offre", 1)] };
    expect(titreDuMarche(image, "@brennos")).toBe("@brennos vend au marché");
    expect(titreDuMarche({ ...image, sorte: "demande", annonces: [annonce("demande", 1), annonce("demande", 2)] }, "X")).toBe("X cherche 2 objets au marché");
    expect(plain(ligneEnMots(annonce("offre", 1)))).toBe("Casque d'or (tête, rareté légendaire) : 1 800 statères, 2 500 statères à la boutique");
    expect(plain(ligneEnMots(annonce("demande", 1, { enRayon: false })))).toBe("Casque d'or (tête, rareté légendaire) : cherché au marché, pas en rayon à la boutique cette semaine");
    // Le prix d'une demande ne part pas sur Discord : il dirait un minimum du solde de son auteur.
    const demande: ImageDuMarche = { sorte: "demande", nom: "Brennos", discord: null, annonces: [annonce("demande", 2, { prix: 1234 })] };
    expect(plain(annonceDuMarcheEnMots(demande).join(" "))).not.toContain("1 234");
    expect(plain(JSON.stringify(marchePayload(demande, SITE, null)))).not.toContain("1 234");
    expect(boutiqueEnMots({ prixBoutique: null, enRayon: true })).toBe("aussi à la boutique");
    const mots = annonceDuMarcheEnMots(image).join(" ");
    expect(mots).toContain("@brennos vend au marché.");
    expect(mots).not.toMatch(/[=÷>]/);
  });

  it("part en image avec un bouton vers le marché, ou en texte", () => {
    const image: ImageDuMarche = { sorte: "demande", nom: "Brennos", discord: null, annonces: [annonce("demande", 3)] };
    const avecImage = marchePayload(image, SITE, { alt: "x", filename: "marche-d3.png" }) as { components: { components: { url: string; label: string }[] }[] };
    expect(avecImage.components[0]!.components[0]).toMatchObject({ label: "Voir le marché", url: "https://x.test/village#marche" });
    const texte = marchePayload(image, SITE, null) as { content: string };
    expect(plain(texte.content)).toContain("**Brennos** cherche un objet au marché");
    expect(texte.content).toContain("https://x.test/village#marche");
  });
});

describe("le passage du robot", () => {
  const lu = (annonces: AnnonceDuMarche[], offres = 20, demandes = 10): (() => Promise<LectureDuMarche>) => async () => ({ etat: "lu", offresJusquA: offres, demandesJusquA: demandes, annonces, inconnus: 0 });
  const STORED: MarcheSendState = { depuis: "2026-11-19T10:00:00.000Z", offres_jusqu_a: 10, demandes_jusqu_a: 4, envoyees: [], dernier_envoi: null };

  it("au premier passage, note les numéros sans rien envoyer", async () => {
    const envois: ImageDuMarche[] = [];
    const r = await marchePass({ stored: null, lire: lu([annonce("offre", 11)]), now: NOW, send: async (i) => (envois.push(i), true), log: () => {} });
    expect(envois).toHaveLength(0);
    expect(r.state).toMatchObject({ offres_jusqu_a: 20, demandes_jusqu_a: 10, envoyees: [] });
  });

  it("envoie une image par membre et par sorte, puis avance", async () => {
    const envois: ImageDuMarche[] = [];
    const annonces = [annonce("offre", 11), annonce("offre", 12), annonce("demande", 5), annonce("offre", 13, { compte: 8, nom: "Cassivel", discord: null }), annonce("offre", 9)];
    const r = await marchePass({ stored: STORED, lire: lu(annonces), now: NOW, send: async (i) => (envois.push(i), true), log: () => {} });
    expect(envois.map((i) => `${i.sorte}:${i.nom}:${i.annonces.map((a) => a.id).join(",")}`)).toEqual(["demande:Brennos:5", "offre:Brennos:11,12", "offre:Cassivel:13"]);
    expect(r.state).toMatchObject({ offres_jusqu_a: 20, demandes_jusqu_a: 10, envoyees: [] });
    expect(r.failed).toBe(false);
  });

  it("garde ce qui est parti quand Discord refuse, et réessaie le reste", async () => {
    let n = 0;
    const r = await marchePass({ stored: STORED, lire: lu([annonce("offre", 11), annonce("demande", 5)]), now: NOW, send: async () => ++n === 1, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.state).toMatchObject({ offres_jusqu_a: 10, demandes_jusqu_a: 4, envoyees: ["d5"] });
  });

  it("n'annonce plus ce qui a plus de 48 heures, et pas plus de cinq images par passage", async () => {
    const envois: ImageDuMarche[] = [];
    const vieille = annonce("offre", 11, { le: "2026-11-17T10:00:00.000Z" });
    const beaucoup = Array.from({ length: 7 }, (_, i) => annonce("offre", 30 + i, { compte: 100 + i, nom: `G${i}` }));
    const r = await marchePass({ stored: STORED, lire: lu([vieille, ...beaucoup], 40), now: NOW, send: async (i) => (envois.push(i), true), log: () => {} });
    expect(envois).toHaveLength(IMAGES_PAR_PASSAGE);
    expect(envois.some((i) => i.annonces.some((a) => a.id === 11))).toBe(false);
    // Deux images attendent : les numéros n'avancent pas, ce qui est parti est noté.
    expect(r.state?.offres_jusqu_a).toBe(10);
    expect(r.state?.envoyees).toHaveLength(IMAGES_PAR_PASSAGE);
  });

  it("range quatre objets au plus par image", () => {
    const images = imagesDuMarche(Array.from({ length: 6 }, (_, i) => annonce("demande", i + 1)));
    expect(images.map((i) => i.annonces.length)).toEqual([4, 2]);
  });
});

describe("l'image d'une annonce du marché", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const draws = (char: string) => fonts.draws(char, "strong");
  const cas: [string, ImageDuMarche][] = [
    ["une offre", { sorte: "offre", nom: "Brennos", discord: "brennos", annonces: [annonce("offre", 1)] }],
    ["une demande hors du rayon", { sorte: "demande", nom: "Brennos", discord: null, annonces: [annonce("demande", 1, { enRayon: false })] }],
    [
      "quatre offres, nom Discord large",
      { sorte: "offre", nom: "Brennos", discord: "W".repeat(32), annonces: [annonce("offre", 1), annonce("offre", 2, { emplacement: "arme", objet: "hache", nomObjet: "Hache", rarete: "commun", prix: 90, prixBoutique: 100 }), annonce("offre", 3), annonce("offre", 4, { enRayon: false })] },
    ],
  ];
  const cards = cas.map(([id, image]) => ({ id, image, card: marcheCard(image, SITE, fonts.width, draws) }));

  it("est assez large pour Discord, et aucun texte ne sort de l'image ni n'est coupé", () => {
    for (const { id, card } of cards) {
      expect(card.width / card.height, id).toBeGreaterThanOrEqual(1.55);
      for (const t of card.texts as CardText[]) {
        const width = drawnWidth(t, fonts.width);
        const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
        expect(plain(t.text).endsWith("…"), `${id} : ${t.text}`).toBe(false);
        expect(left, `${id} : ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(left + width, `${id} : ${t.text}`).toBeLessThanOrEqual(card.width + 0.5);
      }
    }
  });

  it("n'écrit jamais le prix d'une demande", () => {
    const { card } = cards[1]!;
    expect(card.texts.some((t) => plain(t.text).includes("1 800"))).toBe(false);
    expect(card.texts.some((t) => t.text === "Pas en rayon")).toBe(true);
  });

  it("pose chaque objet dans sa vitrine", () => {
    for (const { id, card, image } of cards) {
      expect(card.dessins, id).toHaveLength(image.annonces.length);
      expect(card.rects.filter((r) => r.cut === 18), id).toHaveLength(image.annonces.length);
    }
  });

  it("dit la boutique en court, l'accroche et la période", () => {
    expect(plain(boutiqueEnCourt({ prixBoutique: 2500, enRayon: true }))).toBe("Boutique : 2 500");
    expect(boutiqueEnCourt({ prixBoutique: 2500, enRayon: false })).toBe("Pas en rayon cette semaine");
    expect(accrocheDuMarche(cas[2]![1])).toBe("Vend 4 objets au marché");
    expect(periodeDuMarche([{ le: "2026-11-19T20:20:00.000Z" }])).toBe("Le 19 novembre 2026 à 21 h 20");
    expect(marcheImageAlt(cas[0]![1])).toContain("vend au marché");
  });

  it("se dessine en PNG de 1 200 sur 660", async () => {
    const png = await renderMarcheCard(cards[2]!.card, fonts, root);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 660]);
  });
});
