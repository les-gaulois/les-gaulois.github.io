import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bilanZone, lireTroupes, totauxAlliances, troupesDeLAlliance } from "../../src/lib/alliance/bilan";
import { COULEURS_ALLIANCE, couleurLibre, cssDe, nomDeCouleur, rgbDe } from "../../src/lib/alliance/couleurs";
import { dernierNumero, nonLus } from "../../src/lib/alliance/discussion";
import { EN, FR } from "../../src/lib/alliance/textes";
import { invitationDeLAncre, jetonValable, lienInvitation } from "../../src/lib/alliance/invitation";
import {
  CADRE_MAX,
  annuler,
  cadreDuCalque,
  dansLeMasque,
  decoderBits,
  encoderBits,
  masqueDeLaZone,
  masqueDuCalque,
  occupation,
  pixelsDuMasque,
  poserMasque,
  rectangle,
  retirerOccupes,
  tamponner,
  trait,
  type Pinceau,
  type Retouche,
} from "../../src/lib/alliance/masque";
import type { MessageAlliance } from "../../src/lib/alliance/types";
import { ETAT_MER, ETAT_NEUTRE } from "../../src/lib/clanmap/etat";

const W = 10;
const H = 6;
const partout: Pinceau = { width: W, height: H, taille: 1, valeur: 1, permis: () => true };

describe("le masque d'une zone", () => {
  it("garde le cadre et un bit par pixel, comme le serveur l'attend", () => {
    const calque = new Uint8Array(W * H);
    // Trois pixels : (2, 1), (4, 1) et (3, 3). Le cadre va de x 2 à 4 et de y 1 à 3 : 3 × 3.
    calque[1 * W + 2] = 1;
    calque[1 * W + 4] = 1;
    calque[3 * W + 3] = 1;
    const m = masqueDuCalque(calque, W)!;
    expect(m).toMatchObject({ x: 2, y: 1, w: 3, h: 3 });
    // Bits 0 et 2 de la première ligne, bit 7 (ligne 3, colonne 2) : 0b10000101 ; le bit 8 reste vide.
    expect([...m.bits]).toEqual([0b10000101, 0]);
    expect(pixelsDuMasque(m)).toBe(3);
    expect(dansLeMasque(m, 3, 3)).toBe(true);
    expect(dansLeMasque(m, 3, 1)).toBe(false);
    expect(dansLeMasque(m, 9, 9)).toBe(false);
    const autre = new Uint8Array(W * H);
    poserMasque(autre, W, m);
    expect([...autre]).toEqual([...calque]);
  });

  it("est vide sans pixel", () => {
    expect(masqueDuCalque(new Uint8Array(W * H), W)).toBeNull();
    expect(cadreDuCalque(new Uint8Array(W * H), W)).toBeNull();
  });

  it("passe en base 64 et revient à l'identique, même long", () => {
    const bits = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 37) & 0xff);
    expect([...decoderBits(encoderBits(bits))]).toEqual([...bits]);
    const zone = { x: 1, y: 1, w: 3, h: 3, mask: encoderBits(Uint8Array.from([5, 0])) };
    expect(masqueDeLaZone(zone)?.bits.length).toBe(2);
    expect(masqueDeLaZone({ ...zone, w: 30 })).toBeNull();
    expect(masqueDeLaZone({ ...zone, mask: "@@" })).toBeNull();
  });

  it("annonce la même limite de cadre que le serveur", () => {
    const sql = readFileSync("supabase/migrations/20261113000400_alliances_sur_la_carte.sql", "utf8");
    expect(sql).toContain(`p_w::bigint * p_h > ${CADRE_MAX}`);
  });
});

describe("le dessin", () => {
  it("peint un carré centré, sans sortir de la carte", () => {
    const calque = new Uint8Array(W * H);
    const r: Retouche = new Map();
    expect(tamponner(calque, { ...partout, taille: 3 }, 0, 0, r)).toBe(4);
    expect(calque[0]).toBe(1);
    expect(calque[1 * W + 1]).toBe(1);
    expect(calque[2 * W + 2]).toBe(0);
  });

  it("ne peint jamais la mer, mais la gomme efface partout", () => {
    const calque = new Uint8Array(W * H);
    const terre = (p: number) => p % W < 5;
    expect(rectangle(calque, { ...partout, permis: terre }, 0, 0, 9, 0, new Map())).toBe(5);
    calque[9] = 1;
    expect(rectangle(calque, { ...partout, valeur: 0, permis: () => false }, 0, 0, 9, 0, new Map())).toBe(6);
    expect(calque.every((v) => v === 0)).toBe(true);
  });

  it("trace un trait sans trou entre deux points éloignés", () => {
    const calque = new Uint8Array(W * H);
    trait(calque, partout, 0, 0, 9, 5, new Map());
    const m = masqueDuCalque(calque, W)!;
    expect(m).toMatchObject({ x: 0, y: 0, w: 10, h: 6 });
    // Chaque colonne a au moins un pixel : le trait est continu.
    for (let x = 0; x < W; x++) expect([0, 1, 2, 3, 4, 5].some((y) => calque[y * W + x] === 1)).toBe(true);
  });

  it("annule un geste, et seulement lui", () => {
    const calque = new Uint8Array(W * H);
    const premier: Retouche = new Map();
    rectangle(calque, partout, 0, 0, 1, 1, premier);
    const second: Retouche = new Map();
    const peints = rectangle(calque, partout, 1, 1, 2, 2, second);
    expect(peints).toBe(3);
    expect(annuler(calque, second)).toBe(-3);
    expect(masqueDuCalque(calque, W)).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    expect(annuler(calque, premier)).toBe(-4);
    expect(calque.every((v) => v === 0)).toBe(true);
  });
});

describe("une zone ne passe jamais sur une autre", () => {
  // Deux zones déjà enregistrées : un carré de 2 × 2 en haut à gauche, et un pixel seul en (7, 4).
  const carre = masqueDuCalque(Uint8Array.from({ length: W * H }, (_, p) => (p % W < 2 && p < 2 * W ? 1 : 0)), W)!;
  const seul = { x: 7, y: 4, w: 1, h: 1, bits: Uint8Array.from([1]) };

  it("relève les pixels pris par les autres zones, sans sortir de la carte", () => {
    const debord = { x: 9, y: 5, w: 3, h: 2, bits: Uint8Array.from([0b111111]) };
    const occupe = occupation([carre, seul, debord], W, H);
    expect([...occupe].reduce((n, v) => n + v, 0)).toBe(6);
    expect(occupe[0]).toBe(1);
    expect(occupe[1 * W + 1]).toBe(1);
    expect(occupe[4 * W + 7]).toBe(1);
    expect(occupe[5 * W + 9]).toBe(1);
    expect(occupe[2 * W + 2]).toBe(0);
    expect(occupation([], W, H).every((v) => v === 0)).toBe(true);
  });

  it("ne peint ni au pinceau ni au rectangle sur une autre zone, mais la gomme efface partout", () => {
    const occupe = occupation([carre, seul], W, H);
    const libre: Pinceau = { ...partout, permis: (p) => occupe[p] === 0 };
    const calque = new Uint8Array(W * H);
    // Toute la carte au rectangle : 60 pixels, moins les 5 des deux zones.
    expect(rectangle(calque, libre, 0, 0, W - 1, H - 1, new Map())).toBe(55);
    expect([...calque].every((v, p) => v === 0 || occupe[p] === 0)).toBe(true);
    const autre = new Uint8Array(W * H);
    expect(tamponner(autre, { ...libre, taille: 3 }, 1, 1, new Map())).toBe(5);
    expect(autre[0]).toBe(0);
    expect(autre[2 * W + 2]).toBe(1);
    expect(rectangle(calque, { ...libre, valeur: 0 }, 0, 0, W - 1, H - 1, new Map())).toBe(55);
  });

  it("retire d'une zone reprise les pixels qu'elle partageait avec une autre, d'avant la règle", () => {
    const occupe = occupation([carre], W, H);
    const calque = new Uint8Array(W * H);
    // La zone reprise couvre les trois premières colonnes des trois premières lignes : 4 de ses 9 pixels sont au carré.
    rectangle(calque, partout, 0, 0, 2, 2, new Map());
    expect(retirerOccupes(calque, occupe)).toBe(4);
    expect([...calque].reduce((n, v) => n + v, 0)).toBe(5);
    expect([...calque].every((v, p) => v === 0 || occupe[p] === 0)).toBe(true);
    expect(retirerOccupes(calque, occupe)).toBe(0);
  });

  it("à l'annulation d'un geste, ne rend pas un pixel pris entre-temps par une autre zone", () => {
    const calque = new Uint8Array(W * H);
    rectangle(calque, partout, 0, 0, 3, 0, new Map());
    // La gomme efface la ligne, puis une autre zone prend les deux premiers pixels avant qu'on annule la gomme.
    const gomme: Retouche = new Map();
    rectangle(calque, { ...partout, valeur: 0 }, 0, 0, 3, 0, gomme);
    const occupe = occupation([{ x: 0, y: 0, w: 2, h: 1, bits: Uint8Array.from([0b11]) }], W, H);
    expect(annuler(calque, gomme)).toBe(4);
    // Seuls les pixels du geste annulé se relisent : un pixel pris hors du geste n'est pas touché.
    calque[5 * W + 9] = 1;
    occupe[5 * W + 9] = 1;
    expect(retirerOccupes(calque, occupe, gomme.keys())).toBe(2);
    expect([...calque.subarray(0, 4)]).toEqual([0, 0, 1, 1]);
    expect(calque[5 * W + 9]).toBe(1);
  });

  it("est vérifiée aussi par le serveur, à chaque enregistrement", () => {
    const sql = readFileSync("supabase/migrations/20261113000600_zones_sans_chevauchement.sql", "utf8");
    expect(sql).toContain("perform internal.fail('zone_overlap')");
  });
});

describe("le bilan d'une zone", () => {
  // La carte : une ligne de 10 pixels. Clans du film : 0 neutre, 1 GAL, 2 LUX, 3 UN. Valeur = index + 1.
  const clans = [{ tag: null }, { tag: "GAL" }, { tag: "LUX" }, { tag: "UN" }];
  const valeurs = Uint16Array.from([ETAT_NEUTRE, ETAT_NEUTRE, 2, 2, 3, 4, 4, 4, ETAT_MER, ETAT_NEUTRE]);
  const alliance = new Set(["GAL", "LUX"]);

  it("compte la terre neutre, l'alliance et les autres clans, et le coût selon la règle du jeu", () => {
    const calque = new Uint8Array(10);
    calque.fill(1, 0, 9);
    const b = bilanZone(masqueDuCalque(calque, 10)!, valeurs, 10, clans, alliance);
    expect(b).toMatchObject({ pixels: 9, neutres: 2, alliance: 3, ennemis: 3, mer: 1 });
    expect(b.autres).toEqual([{ tag: "UN", pixels: 3 }]);
    expect(b.part).toBeCloseTo(3 / 9);
    expect(b.coutNeutres).toBe(2_000);
    expect(b.coutEnnemisMinimum).toBe(6_000);
  });

  it("ne déborde pas sur la ligne suivante pour une zone posée hors de la carte", () => {
    // La carte fait 5 × 2 ; la zone, de x 3 à 6 sur la première ligne, sort de 2 pixels à droite.
    const petite = Uint16Array.from([ETAT_NEUTRE, ETAT_NEUTRE, ETAT_NEUTRE, ETAT_NEUTRE, ETAT_NEUTRE, 2, 2, 2, 2, 2]);
    const b = bilanZone({ x: 3, y: 0, w: 4, h: 1, bits: Uint8Array.from([0b1111]) }, petite, 5, clans, new Set<string>());
    expect(b).toMatchObject({ pixels: 4, neutres: 2, mer: 2, ennemis: 0 });
  });

  it("dit zéro pour une zone déjà tenue par l'alliance", () => {
    const calque = new Uint8Array(10);
    calque.fill(1, 2, 5);
    const b = bilanZone(masqueDuCalque(calque, 10)!, valeurs, 10, clans, alliance);
    expect(b).toMatchObject({ pixels: 3, alliance: 3, part: 1, coutNeutres: 0, coutEnnemisMinimum: 0 });
  });
});

describe("le territoire des alliances", () => {
  const standings = [
    { tag: "UN", pixels: 500 },
    { tag: "GAL", pixels: 160 },
    { tag: "LUX", pixels: 240 },
    { tag: "JR", pixels: 230 },
  ];
  const alliances = [
    { id: 1, name: "La nôtre", color: 0x38bdf8, clans: ["GAL", "LUX", "ABSENT"] },
    { id: 2, name: "Le Nord", color: 0xfb923c, clans: ["UN"] },
  ];

  it("additionne les pixels de ses clans et les classe", () => {
    const [notre, nord] = totauxAlliances(alliances, standings, 1_130);
    expect(notre).toMatchObject({ pixels: 400, rang: 2 });
    expect(notre!.clans).toEqual([
      { tag: "LUX", pixels: 240 },
      { tag: "GAL", pixels: 160 },
      { tag: "ABSENT", pixels: 0 },
    ]);
    expect(notre!.part).toBeCloseTo(400 / 1_130);
    expect(nord).toMatchObject({ pixels: 500, rang: 1 });
  });

  it("ne compte que les troupes déclarées, sans prendre un silence pour un zéro", () => {
    const t = troupesDeLAlliance(["GAL", "LUX", "ITA"], [
      { tag: "GAL", troops: 2_000_000, by: "[GAL] Chef", at: "2026-11-13T10:00:00Z" },
      { tag: "LUX", troops: 500_000, by: "[LUX] Kraken", at: "2026-11-12T08:00:00Z" },
      { tag: "UN", troops: 9, by: "[UN] X", at: "2026-11-01T08:00:00Z" },
    ]);
    expect(t).toEqual({ total: 2_500_000, declares: 2, clans: 3, plusAncienne: "2026-11-12T08:00:00Z" });
  });

  it("lit un nombre de troupes tapé avec ses espaces", () => {
    expect(lireTroupes("1 500 000")).toBe(1_500_000);
    expect(lireTroupes("2.000.000")).toBe(2_000_000);
    // En anglais, la virgule sépare les milliers : l'exemple affiché, « 1,500,000 », se lit.
    expect(lireTroupes("1,500,000", "en")).toBe(1_500_000);
    expect(lireTroupes("1 500 000", "en")).toBe(1_500_000);
    expect(lireTroupes("1,5", "fr")).toBeNull();
    expect(lireTroupes("1.5", "en")).toBeNull();
    expect(lireTroupes("12k")).toBeNull();
    expect(lireTroupes("-3")).toBeNull();
    expect(lireTroupes("")).toBeNull();
    expect(lireTroupes("9999999999999")).toBeNull();
  });
});

describe("la sauvegarde, version 4", () => {
  const between = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
  const v4 = between(readFileSync("supabase/migrations/20261113000400_alliances_sur_la_carte.sql", "utf8"), "create or replace function public.export_site()", "/* ---------- Règles d'accès");
  const v3 = between(readFileSync("supabase/migrations/20261109000200_gaulois_de_la_semaine.sql", "utf8"), "create or replace function public.export_site()", "/* ---------- Les visages");

  it("reprend chaque ligne de la version 3, sans rien perdre", () => {
    expect(v3).toContain("'version', 3");
    expect(v4).toContain("'version', 4");
    for (const line of v3.split("\n").filter((l) => l.trim().startsWith("'") && !l.includes("'version'"))) {
      expect(v4, line.trim()).toContain(line.trim().replace(/\)$/, ""));
    }
  });

  it("garde les alliances, leurs zones, les alliés et les troupes, jamais la discussion ni les invitations", () => {
    for (const table of ["alliances", "alliance_clans", "alliance_zones", "alliance_allies", "alliance_troops"]) expect(v4).toContain(`from internal.${table} t`);
    expect(v4).not.toContain("alliance_messages");
    expect(v4).not.toContain("alliance_invites");
  });
});

describe("les couleurs des alliances", () => {
  it("sont huit, distinctes, et se lisent en clair", () => {
    expect(new Set(COULEURS_ALLIANCE.map((c) => c.valeur)).size).toBe(8);
    expect(cssDe(0x38bdf8)).toBe("#38bdf8");
    expect(cssDe(0x00000f)).toBe("#00000f");
    expect(rgbDe(0x38bdf8)).toEqual([0x38, 0xbd, 0xf8]);
    expect(nomDeCouleur(0xfacc15)).toBe("Or");
    expect(nomDeCouleur(0x123456)).toBe("#123456");
  });

  it("proposent la première couleur libre", () => {
    expect(couleurLibre([])).toBe(0x38bdf8);
    expect(couleurLibre([0x38bdf8, 0xfacc15])).toBe(0x4ade80);
    expect(couleurLibre(COULEURS_ALLIANCE.map((c) => c.valeur))).toBe(0x38bdf8);
  });
});

describe("le lien d'invitation", () => {
  const jeton = "0123456789abcdef0123456789abcdef";

  it("se lit dans l'ancre de l'adresse, et nulle part ailleurs", () => {
    expect(invitationDeLAncre(`#invitation=${jeton}`)).toBe(jeton);
    expect(invitationDeLAncre(`invitation=${jeton}`)).toBe(jeton);
    expect(invitationDeLAncre("#invitation=1234")).toBeNull();
    expect(invitationDeLAncre(`#invitation=${jeton.toUpperCase()}`)).toBeNull();
    expect(invitationDeLAncre(`#alliance`)).toBeNull();
    expect(jetonValable(jeton)).toBe(true);
    expect(jetonValable(`${jeton}0`)).toBe(false);
  });

  it("mène à la carte, avec le jeton dans l'ancre", () => {
    expect(lienInvitation("https://les-gaulois.github.io", "", jeton)).toBe(`https://les-gaulois.github.io/carte#invitation=${jeton}`);
  });

  it("a le format du jeton que crée le serveur", () => {
    const sql = readFileSync("supabase/migrations/20261113000400_alliances_sur_la_carte.sql", "utf8");
    expect(sql).toContain("replace(gen_random_uuid()::text, '-', '')");
    expect(sql).toContain("'^[0-9a-f]{32}$'");
  });
});

describe("la discussion", () => {
  const maintenant = new Date("2026-11-13T15:00:00Z");

  it("écrit l'heure de Paris, puis « hier », puis la date", () => {
    expect(FR.heureMessage("2026-11-13T13:05:00Z", maintenant)).toBe("14:05");
    expect(FR.heureMessage("2026-11-12T13:05:00Z", maintenant)).toBe("hier, 14:05");
    expect(FR.heureMessage("2026-11-10T13:05:00Z", maintenant)).toBe("10 nov., 14:05");
    // En anglais, la même heure de Paris.
    expect(EN.heureMessage("2026-11-13T13:05:00Z", maintenant)).toBe("14:05");
    expect(EN.heureMessage("2026-11-12T13:05:00Z", maintenant)).toBe("yesterday, 14:05");
    expect(EN.heureMessage("2026-11-10T13:05:00Z", maintenant)).toBe("10 Nov, 14:05");
  });

  it("compte les messages des autres arrivés depuis la dernière lecture", () => {
    const m = (id: number, mine = false): MessageAlliance => ({ id, at: "", tag: "GAL", name: "", staff: false, body: "", mine, can_delete: mine });
    const messages = [m(3), m(5, true), m(8), m(9)];
    expect(nonLus(messages, 3)).toBe(2);
    expect(nonLus(messages, null)).toBe(0);
    expect(nonLus(messages, 9)).toBe(0);
    expect(dernierNumero(messages)).toBe(9);
    expect(dernierNumero([])).toBeNull();
  });
});
