import { describe, expect, it } from "vitest";
import { adresseDeLaCarte, BOUCLE_ORDINAIRE_MS, cartesAFilmer, DOSSIER_DES_CARTES, dureeDeLaBoucle, fichierDuGif, imagesDeLaBoucle, INDEX_DES_CARTES, insignesDuFilm, lireIndexDesCartes, listeDeLaSorte, pasDuFilm, versionDeLaCarte } from "../../src/lib/cartes-gif";
import { FINITIONS_ANIMEES } from "../../src/lib/fx/finitions-carte";
import { MACARTE_COMMAND as MACARTE_DEFINITION } from "../../supabase/functions/code-discord/definitions";
import { parseFiches } from "../../supabase/functions/code-discord/index";
import { CARTES_PATH, carteGifUrl, MACARTE_COMMAND, parseCartes } from "../../supabase/functions/code-discord/macarte";

const SITE = "https://les-gaulois.github.io";

describe("les cartes des membres en GIF", () => {
  it("la boucle dure un nombre entier d'images, et celle d'une finition à durée propre un nombre entier de ses tours", () => {
    for (const finition of [null, "reflet-inconnu", ...FINITIONS_ANIMEES]) {
      // Un GIF compte en centièmes de seconde.
      expect(pasDuFilm(finition) % 10).toBe(0);
      expect(Number.isInteger(imagesDeLaBoucle(finition))).toBe(true);
      expect(imagesDeLaBoucle(finition) * pasDuFilm(finition)).toBe(dureeDeLaBoucle(finition));
    }
    expect(dureeDeLaBoucle(null)).toBe(BOUCLE_ORDINAIRE_MS);
    expect(dureeDeLaBoucle("confettis")).toBe(BOUCLE_ORDINAIRE_MS);
    // Le champignon atomique recommence toutes les neuf secondes, l'explosion toutes les quatre.
    expect(dureeDeLaBoucle("champignon-atomique") % 9000).toBe(0);
    expect(dureeDeLaBoucle("explosion") % 4000).toBe(0);
  });

  it("la version d'une carte change avec son dessin ou une de ses images, et avec rien d'autre", () => {
    const image = new Uint8Array([1, 2, 3]);
    const v = versionDeLaCarte("<a>Brennos</a>", [image]);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(versionDeLaCarte("<a>Brennos</a>", [new Uint8Array([1, 2, 3])])).toBe(v);
    expect(versionDeLaCarte("<a>Brennos.1</a>", [image])).not.toBe(v);
    expect(versionDeLaCarte("<a>Brennos</a>", [new Uint8Array([1, 2, 4])])).not.toBe(v);
    expect(versionDeLaCarte("<a>Brennos</a>", [])).not.toBe(v);
  });

  it("ne filme que les cartes nouvelles ou changées, quelques-unes par passage", () => {
    const voulues = [
      { id: "Aa", v: "000000000001" },
      { id: "Bb", v: "000000000002" },
      { id: "Cc", v: "000000000003" },
      { id: "Dd", v: "000000000004" },
    ];
    const gardees = [
      { id: "Aa", v: "000000000001" },
      { id: "Bb", v: "00000000000f" },
    ];
    expect(cartesAFilmer(voulues, gardees, 8).map((c) => c.id)).toEqual(["Bb", "Cc", "Dd"]);
    expect(cartesAFilmer(voulues, gardees, 2).map((c) => c.id)).toEqual(["Bb", "Cc"]);
    expect(cartesAFilmer(voulues, voulues, 8)).toEqual([]);
    expect(cartesAFilmer(voulues, [], 0)).toEqual([]);
  });

  it("relit sa liste sans lui faire confiance : un fichier illisible vaut une liste vide, une entrée mal formée est écartée", () => {
    const vide = { cartes: [], paysages: [] };
    for (const faux of [null, "pas du JSON", "null", '{"cartes":4}']) expect(lireIndexDesCartes(faux)).toEqual(vide);
    const carte = { id: "Ab12Cd34", v: "0123456789ab" };
    const lu = lireIndexDesCartes(JSON.stringify({ cartes: [carte, { id: "../x", v: "0123456789ab" }, { id: "Ef56Gh78", v: "trop-court" }, null, "rien"], paysages: [{ id: "Ij90Kl12", v: "ba9876543210" }, { id: "Mn34Op56" }] }));
    expect(lu).toEqual({ cartes: [carte], paysages: [{ id: "Ij90Kl12", v: "ba9876543210" }] });
    expect(listeDeLaSorte(lu, "carte")).toBe(lu.cartes);
    expect(listeDeLaSorte(lu, "paysage")).toBe(lu.paysages);
    // Une liste d'avant les paysages se lit encore.
    expect(lireIndexDesCartes(JSON.stringify({ cartes: [carte] }))).toEqual({ cartes: [carte], paysages: [] });
  });

  it("le robot lit la liste que le site écrit, et donne à Discord l'adresse que le site publie", () => {
    const carte = { id: "Ab12Cd34", v: "0123456789ab" };
    const paysage = { id: "Ij90Kl12", v: "ba9876543210" };
    const publie = JSON.parse(JSON.stringify({ cartes: [carte, { id: "../x", v: carte.v }, { id: "Ef56Gh78", v: 12 }], paysages: [paysage, "rien"] })) as unknown;
    const lues = parseCartes(publie);
    expect([...(lues?.cartes ?? [])]).toEqual([[carte.id, carte.v]]);
    expect([...(lues?.paysages ?? [])]).toEqual([[paysage.id, paysage.v]]);
    expect(carteGifUrl(SITE, carte.id, carte.v)).toBe(`${SITE}${adresseDeLaCarte(carte)}`);
    expect(carteGifUrl(SITE, paysage.id, paysage.v, true)).toBe(`${SITE}${adresseDeLaCarte(paysage, "paysage")}`);
    expect(fichierDuGif("Ab12Cd34", "carte")).toBe("Ab12Cd34.gif");
    expect(fichierDuGif("Ab12Cd34", "paysage")).toBe("Ab12Cd34-paysage.gif");
    // Une liste d'avant les paysages : les cartes se lisent, sans paysage.
    expect(parseCartes({ cartes: [carte] })?.paysages.size).toBe(0);
    expect(CARTES_PATH).toBe(`/${DOSSIER_DES_CARTES}/${INDEX_DES_CARTES}`);
    for (const faux of [null, [], "cartes", { cartes: null }, {}]) expect(parseCartes(faux)).toBeNull();
    expect(parseCartes({ cartes: [] })?.cartes.size).toBe(0);
  });

  it("le paysage ne montre un insigne que si le robot le lit aussi dans la même fiche : il écrit dessous sa date ou sa mention", () => {
    const niveau = { level: 63, prestige: 2, legend: false };
    const flamme = { victoires: 7, auMoins: false, dates: "du 12 au 14 nov. 2026", doree: true, releve: "2026-11-14T12:53:28.840Z" };
    const fiches = [
      { niveau, flamme },
      { niveau: null, flamme: null },
      {},
      { niveau: { level: 63 }, flamme: { victoires: 7, doree: true } },
      { niveau: { ...niveau, level: 0 }, flamme: { ...flamme, victoires: 4 } },
      { niveau: { ...niveau, legend: "oui" }, flamme: { ...flamme, releve: "hier" } },
      { niveau: "63", flamme: { ...flamme, dates: "  " } },
      { niveau: { ...niveau, legend: true }, flamme: { ...flamme, auMoins: true, doree: false } },
    ];
    for (const fiche of fiches) {
      const lue = parseFiches({ listedAt: "2026-11-12T10:53:37.089Z", fiches: [{ id: "Ab12Cd34", pseudo: "Brennos", ...fiche }] })!.fiches[0]!;
      const film = insignesDuFilm(fiche);
      expect(film.niveau, JSON.stringify(fiche)).toBe(lue.niveau !== null);
      expect(film.flamme, JSON.stringify(fiche)).toEqual(lue.flamme ? { victoires: lue.flamme.victoires, doree: lue.flamme.doree } : null);
    }
    expect(insignesDuFilm(fiches[0]!)).toEqual({ niveau: true, flamme: { victoires: 7, doree: true } });
    expect(insignesDuFilm(fiches[3]!)).toEqual({ niveau: false, flamme: null });
  });

  it("la commande porte le nom qu'attend la fonction, et tient dans les limites de Discord", () => {
    expect(MACARTE_DEFINITION.name).toBe(MACARTE_COMMAND);
    expect(MACARTE_DEFINITION.description.length).toBeLessThanOrEqual(100);
  });
});
