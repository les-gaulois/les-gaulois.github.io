import { describe, expect, it } from "vitest";
import { FENETRES, dansLeRail, fenetreApresClic, fenetreApresFermeture, fenetreDeLAncre, fenetreInitiale, fenetreParDefaut, type FenetreId } from "../../src/lib/carte-console";
import { ICONES_PARTIES } from "../../src/lib/icones-parties";

/** Une page complète : GAL est sur la carte, toutes les fenêtres existent. */
const toutes = (id: FenetreId) => FENETRES.some((f) => f.id === id);
/** Une page sans GAL sur la carte : ni objectif, ni chiffres. */
const sansGal = (id: FenetreId) => id !== "objectif" && id !== "chiffres";

describe("les fenêtres de la page Carte", () => {
  it("chaque fenêtre a une ancre unique, un nom court et une icône dessinée", () => {
    const ids = FENETRES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fenetre of FENETRES) {
      expect(fenetre.id, fenetre.id).toMatch(/^[a-z-]+$/);
      // Huit lettres au plus : trois entrées par ligne, l’icône à côté du nom, tiennent sur un téléphone de 360 px.
      expect(fenetre.label.length, fenetre.label).toBeLessThanOrEqual(8);
      expect(ICONES_PARTIES[fenetre.icon], fenetre.icon).toBeDefined();
    }
    // Deux fenêtres ne partagent pas la même icône.
    expect(new Set(FENETRES.map((f) => f.icon)).size).toBe(FENETRES.length);
    // Six entrées dans le rail avec l'alliance, cinq sans la connexion du site : deux lignes de trois au plus sur téléphone.
    // Les réglages n'ont pas d'entrée : la roue de la pastille du film les ouvre. « Légende », « À propos » et « Zones »,
    // retirées le 13 novembre 2026 à la demande du pilote, ne reviennent pas ; « Fronts » se lit dans « Chiffres ».
    expect(FENETRES).toHaveLength(7);
    expect(FENETRES.filter(dansLeRail).map((f) => f.id)).toEqual(["objectif", "clans", "alliance", "moments", "journees", "chiffres"]);
    for (const retiree of ["legende", "a-propos", "zones", "fronts"]) expect(FENETRES.map((f) => f.id as string)).not.toContain(retiree);
  });

  it("le lien d'invitation d'un joueur allié ouvre la fenêtre de l'alliance", () => {
    expect(fenetreDeLAncre("#invitation=0123456789abcdef0123456789abcdef")).toBe("alliance");
    expect(fenetreDeLAncre("#alliance")).toBe("alliance");
    expect(fenetreInitiale("#invitation=0123456789abcdef0123456789abcdef", toutes)).toBe("alliance");
  });

  it("une ancre de l'adresse ouvre sa fenêtre, une ancienne ancre aussi, une inconnue rien", () => {
    expect(fenetreDeLAncre("#objectif")).toBe("objectif");
    expect(fenetreDeLAncre("#chiffres")).toBe("chiffres");
    expect(fenetreDeLAncre("#reglages")).toBe("reglages");
    // Une fenêtre retirée n'ouvre plus rien : la page garde sa fenêtre par défaut.
    expect(fenetreDeLAncre("#legende")).toBeNull();
    expect(fenetreDeLAncre("#a-propos")).toBeNull();
    expect(fenetreDeLAncre("clans")).toBe("clans");
    // La page d'avant : « Revoir l'histoire » et « Les détails ». « Fronts », fusionnée dans « Chiffres » ; « Zones »,
    // retirée, n'ouvre plus rien.
    expect(fenetreDeLAncre("#histoire")).toBe("moments");
    expect(fenetreDeLAncre("#details")).toBe("journees");
    expect(fenetreDeLAncre("#fronts")).toBe("chiffres");
    expect(fenetreDeLAncre("#zones")).toBeNull();
    expect(fenetreDeLAncre("")).toBeNull();
    expect(fenetreDeLAncre("#")).toBeNull();
    expect(fenetreDeLAncre("#inconnue")).toBeNull();
    // Une ancre mal écrite ne casse rien.
    expect(fenetreDeLAncre("#%E0%A4%A")).toBeNull();
  });

  it("sans demande, l'objectif, en haut de la colonne ; les clans quand GAL n'est pas sur la carte", () => {
    expect(fenetreParDefaut(toutes)).toBe("objectif");
    expect(fenetreParDefaut(sansGal)).toBe("clans");
  });

  it("à l'arrivée, l'adresse l'emporte si la page contient sa fenêtre", () => {
    expect(fenetreInitiale("#journees", toutes)).toBe("journees");
    expect(fenetreInitiale("#fronts", toutes)).toBe("chiffres");
    expect(fenetreInitiale("#reglages", toutes)).toBe("reglages");
    expect(fenetreInitiale("", toutes)).toBe("objectif");
    expect(fenetreInitiale("#inconnue", toutes)).toBe("objectif");
    expect(fenetreInitiale("#objectif", sansGal)).toBe("clans");
  });

  it("une fenêtre reste toujours ouverte : recliquer son entrée ne la referme pas", () => {
    expect(fenetreApresClic("objectif", "moments", toutes)).toBe("moments");
    expect(fenetreApresClic("moments", "chiffres", toutes)).toBe("chiffres");
    expect(fenetreApresClic("chiffres", "chiffres", toutes)).toBe("chiffres");
    // Une entrée sans fenêtre dans la page ne change rien.
    expect(fenetreApresClic("clans", "objectif", sansGal)).toBe("clans");
  });

  it("fermer la carte de l'alliance ramène l'objectif ; la fenêtre par défaut ne se ferme pas", () => {
    expect(fenetreApresFermeture("alliance", toutes)).toBe("objectif");
    expect(fenetreApresFermeture("chiffres", toutes)).toBe("objectif");
    expect(fenetreApresFermeture("objectif", toutes)).toBeNull();
    expect(fenetreApresFermeture("alliance", sansGal)).toBe("clans");
  });
});
