import { describe, expect, it } from "vitest";
import { FENETRES, fenetreApresClic, fenetreApresEcran, fenetreDeLAncre, fenetreExiste, fenetreInitiale, fenetreParDefaut, type EcranConsole } from "../../src/lib/carte-console";
import { ICONES_PARTIES } from "../../src/lib/icones-parties";

/** Un téléphone : tout s'empile, les réglages ont leur fenêtre. */
const telephone: EcranConsole = { empile: true, large: false, reglagesPoses: false };
/** Une tablette couchée ou une petite fenêtre : la carte prend tout, mais la place manque à côté de la frise. */
const moyen: EcranConsole = { empile: false, large: false, reglagesPoses: false };
/** Un ordinateur de 1 280 px : les réglages sont posés, l'objectif ne s'ouvre pas seul. */
const bureau: EcranConsole = { empile: false, large: false, reglagesPoses: true };
/** Un grand écran. */
const grand: EcranConsole = { empile: false, large: true, reglagesPoses: true };

describe("les fenêtres de la console de la carte", () => {
  it("chaque fenêtre a une ancre unique, un nom court et une icône dessinée", () => {
    const ids = FENETRES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fenetre of FENETRES) {
      expect(fenetre.id, fenetre.id).toMatch(/^[a-z-]+$/);
      // Huit lettres au plus : cinq entrées par ligne tiennent sur un téléphone de 360 px.
      expect(fenetre.label.length, fenetre.label).toBeLessThanOrEqual(8);
      expect(ICONES_PARTIES[fenetre.icon], fenetre.icon).toBeDefined();
    }
    // Deux fenêtres ne partagent pas la même icône.
    expect(new Set(FENETRES.map((f) => f.icon)).size).toBe(FENETRES.length);
    // Neuf entrées avec l'alliance, huit sans la connexion du site : deux lignes de cinq au plus sur téléphone. « Légende » et
    // « À propos », retirées le 13 novembre 2026 à la demande du pilote, ne reviennent pas.
    expect(FENETRES).toHaveLength(9);
    expect(FENETRES.map((f) => f.id)).not.toContain("legende");
    expect(FENETRES.map((f) => f.id)).not.toContain("a-propos");
  });

  it("le lien d'invitation d'un joueur allié ouvre la fenêtre de l'alliance", () => {
    expect(fenetreDeLAncre("#invitation=0123456789abcdef0123456789abcdef")).toBe("alliance");
    expect(fenetreDeLAncre("#alliance")).toBe("alliance");
    expect(fenetreInitiale("#invitation=0123456789abcdef0123456789abcdef", bureau)).toBe("alliance");
  });

  it("une ancre de l'adresse ouvre sa fenêtre, une ancienne ancre aussi, une inconnue rien", () => {
    expect(fenetreDeLAncre("#objectif")).toBe("objectif");
    expect(fenetreDeLAncre("#chiffres")).toBe("chiffres");
    // Une fenêtre retirée n'ouvre plus rien : l'écran garde sa fenêtre par défaut.
    expect(fenetreDeLAncre("#legende")).toBeNull();
    expect(fenetreDeLAncre("#a-propos")).toBeNull();
    expect(fenetreDeLAncre("clans")).toBe("clans");
    // La page d'avant : « Revoir l'histoire » et « Les détails ».
    expect(fenetreDeLAncre("#histoire")).toBe("moments");
    expect(fenetreDeLAncre("#details")).toBe("journees");
    expect(fenetreDeLAncre("")).toBeNull();
    expect(fenetreDeLAncre("#")).toBeNull();
    expect(fenetreDeLAncre("#inconnue")).toBeNull();
    // Une ancre mal écrite ne casse rien.
    expect(fenetreDeLAncre("#%E0%A4%A")).toBeNull();
  });

  it("les réglages n'ont une fenêtre que là où ils ne tiennent pas à côté de la frise", () => {
    expect(fenetreExiste("reglages", telephone)).toBe(true);
    expect(fenetreExiste("reglages", moyen)).toBe(true);
    expect(fenetreExiste("reglages", bureau)).toBe(false);
    expect(fenetreExiste("objectif", bureau)).toBe(true);
  });

  it("sans demande : les clans sous la carte, l'objectif sur un grand écran, rien entre les deux", () => {
    expect(fenetreParDefaut(telephone)).toBe("clans");
    expect(fenetreParDefaut(moyen)).toBeNull();
    expect(fenetreParDefaut(bureau)).toBeNull();
    expect(fenetreParDefaut(grand)).toBe("objectif");
  });

  it("à l'arrivée, l'adresse l'emporte si sa fenêtre existe sur cet écran", () => {
    expect(fenetreInitiale("#fronts", telephone)).toBe("fronts");
    expect(fenetreInitiale("#fronts", bureau)).toBe("fronts");
    expect(fenetreInitiale("", grand)).toBe("objectif");
    expect(fenetreInitiale("#inconnue", telephone)).toBe("clans");
    // Les réglages sont déjà à côté de la frise : l'écran garde sa fenêtre par défaut.
    expect(fenetreInitiale("#reglages", grand)).toBe("objectif");
    expect(fenetreInitiale("#reglages", bureau)).toBeNull();
    expect(fenetreInitiale("#reglages", telephone)).toBe("reglages");
  });

  it("recliquer l'entrée ouverte la referme sur la carte, jamais quand tout s'empile", () => {
    expect(fenetreApresClic(null, "moments", bureau)).toBe("moments");
    expect(fenetreApresClic("moments", "zones", bureau)).toBe("zones");
    expect(fenetreApresClic("zones", "zones", bureau)).toBeNull();
    expect(fenetreApresClic("clans", "clans", telephone)).toBe("clans");
    expect(fenetreApresClic("clans", "objectif", telephone)).toBe("objectif");
    // Une entrée sans fenêtre sur cet écran ne change rien.
    expect(fenetreApresClic("objectif", "reglages", grand)).toBe("objectif");
  });

  it("un écran qui change garde la fenêtre ouverte, sauf si elle n'y existe plus", () => {
    expect(fenetreApresEcran("fronts", telephone)).toBe("fronts");
    expect(fenetreApresEcran("fronts", grand)).toBe("fronts");
    // Le téléphone tourné en paysage large : les réglages passent à côté de la frise.
    expect(fenetreApresEcran("reglages", bureau)).toBeNull();
    // Retour debout sans fenêtre : les clans reviennent sous la carte.
    expect(fenetreApresEcran(null, telephone)).toBe("clans");
    // Sur la carte, rien ne s'ouvre tout seul après coup.
    expect(fenetreApresEcran(null, grand)).toBeNull();
  });
});
