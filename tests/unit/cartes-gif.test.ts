import { describe, expect, it } from "vitest";
import { adresseDeLaCarte, BOUCLE_ORDINAIRE_MS, cartesAFilmer, DOSSIER_DES_CARTES, dureeDeLaBoucle, imagesDeLaBoucle, INDEX_DES_CARTES, lireIndexDesCartes, pasDuFilm, versionDeLaCarte } from "../../src/lib/cartes-gif";
import { FINITIONS_ANIMEES } from "../../src/lib/fx/finitions-carte";
import { MACARTE_COMMAND as MACARTE_DEFINITION } from "../../supabase/functions/code-discord/definitions";
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
    expect(lireIndexDesCartes(null)).toEqual({ cartes: [] });
    expect(lireIndexDesCartes("pas du JSON")).toEqual({ cartes: [] });
    expect(lireIndexDesCartes('{"cartes":4}')).toEqual({ cartes: [] });
    expect(lireIndexDesCartes(JSON.stringify({ cartes: [{ id: "Ab12Cd34", v: "0123456789ab" }, { id: "../x", v: "0123456789ab" }, { id: "Ef56Gh78", v: "trop-court" }, null, "rien"] }))).toEqual({ cartes: [{ id: "Ab12Cd34", v: "0123456789ab" }] });
  });

  it("le robot lit la liste que le site écrit, et donne à Discord l'adresse que le site publie", () => {
    const carte = { id: "Ab12Cd34", v: "0123456789ab" };
    const publie = JSON.parse(JSON.stringify({ cartes: [carte, { id: "../x", v: carte.v }, { id: "Ef56Gh78", v: 12 }] })) as unknown;
    const lues = parseCartes(publie);
    expect([...(lues ?? [])]).toEqual([[carte.id, carte.v]]);
    expect(carteGifUrl(SITE, carte.id, carte.v)).toBe(`${SITE}${adresseDeLaCarte(carte)}`);
    expect(CARTES_PATH).toBe(`/${DOSSIER_DES_CARTES}/${INDEX_DES_CARTES}`);
    for (const faux of [null, [], "cartes", { cartes: null }, {}]) expect(parseCartes(faux)).toBeNull();
    expect(parseCartes({ cartes: [] })?.size).toBe(0);
  });

  it("la commande porte le nom qu'attend la fonction, et tient dans les limites de Discord", () => {
    expect(MACARTE_DEFINITION.name).toBe(MACARTE_COMMAND);
    expect(MACARTE_DEFINITION.description.length).toBeLessThanOrEqual(100);
  });
});
