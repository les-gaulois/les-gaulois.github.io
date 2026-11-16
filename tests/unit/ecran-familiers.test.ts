import { describe, expect, it } from "vitest";
import { GAULOIS_LARGEUR, ORDRE_RARETES, TENUE_DE_DEPART, decrireGaulois } from "../../src/lib/gaulois";
import { CHANCES_POCHETTE_FAMILIERS, PRIX_POCHETTE_FAMILIERS, type MesFamiliers } from "../../src/lib/village/contrat";
import {
  ANCRE_FAMILIERS,
  APERCU_LARGE,
  COULEUR_SILHOUETTE,
  apresLaPochette,
  decrireLApercu,
  demandeLesFamiliers,
  echelleDuDessin,
  familierMontre,
  familiersPossedes,
  idsPossedes,
  largeurDeLApercu,
  lignesDesChances,
  messageDuRefusDesFamiliers,
  raisonPochetteFermee,
  silhouetteDuFamilier,
  surCombien,
  tailleDeLApercu,
  vignetteDuFamilier,
} from "../../src/lib/village/ecran-familiers";
import { FAMILIERS, apercuAvecFamilier, tailleDuFamilier } from "../../src/lib/village/familiers";

// Les écrans des familiers (15 novembre 2026) : ce qu'ils déduisent de ce que le serveur a donné. Les familiers nommés ici
// sont ceux des dessins (`supabase/functions/code-discord/familiers/`), pris dans la liste : aucun n'est écrit en dur.

const NBSP = String.fromCharCode(0xa0);
const deRarete = (rarete: string) => FAMILIERS.filter((familier) => familier.rarete === rarete);
const communs = deRarete("commun");
const petit = FAMILIERS.find((familier) => tailleDuFamilier(familier).largeur <= 20)!;
const geant = FAMILIERS.find((familier) => tailleDuFamilier(familier).largeur >= 56)!;

const mes = (plus: Partial<MesFamiliers> = {}): MesFamiliers => ({
  ok: true,
  solde: 5000,
  peut_ouvrir: true,
  pochette: { prix: PRIX_POCHETTE_FAMILIERS, chances: { ...CHANCES_POCHETTE_FAMILIERS } },
  familiers: [],
  porte: null,
  ...plus,
});
const lignes = (ids: readonly string[]) => ids.map((familier) => ({ familier, acquis_le: "2026-11-15T10:00:00Z" }));

describe("l'adresse de la pochette des familiers", () => {
  it("ne répond qu'à son ancre", () => {
    expect(demandeLesFamiliers(`#${ANCRE_FAMILIERS}`)).toBe(true);
    expect(demandeLesFamiliers("#marche")).toBe(false);
    expect(demandeLesFamiliers("")).toBe(false);
  });
});

describe("les familiers du compte", () => {
  it("garde l'ordre du serveur et écarte un familier inconnu", () => {
    const compte = mes({ familiers: lignes([geant.id, "pas-un-familier", petit.id]) });
    expect(familiersPossedes(compte).map((familier) => familier.id)).toEqual([geant.id, petit.id]);
    expect([...idsPossedes(compte)]).toEqual([geant.id, "pas-un-familier", petit.id]);
    expect(familiersPossedes(null)).toEqual([]);
    expect(idsPossedes(null).size).toBe(0);
  });

  it("dit le familier montré, ou aucun", () => {
    expect(familierMontre(mes({ porte: petit.id }))?.id).toBe(petit.id);
    expect(familierMontre(mes())).toBeNull();
    expect(familierMontre(mes({ porte: "pas-un-familier" }))).toBeNull();
    expect(familierMontre(null)).toBeNull();
  });

  it("met le familier reçu en tête, avec le solde du serveur", () => {
    const avant = mes({ familiers: lignes([petit.id]) });
    const apres = apresLaPochette(avant, { ok: true, solde: 3000, familier: { familier: geant.id, rarete: geant.rarete }, reste: 98 }, "2026-11-15T12:00:00Z");
    expect(apres.solde).toBe(3000);
    expect(apres.familiers.map((ligne) => ligne.familier)).toEqual([geant.id, petit.id]);
    expect(apres.familiers[0]?.acquis_le).toBe("2026-11-15T12:00:00Z");
    expect(avant.familiers).toHaveLength(1);
  });

  it("écrit le compte en mots", () => {
    expect(surCombien(12, 100)).toBe("12 sur 100");
  });
});

describe("les chances de la pochette des familiers", () => {
  it("sont celles du serveur pour un compte sans familier", () => {
    const chances = lignesDesChances(CHANCES_POCHETTE_FAMILIERS, new Set())!;
    expect(chances.map((ligne) => ligne.rarete)).toEqual([...ORDRE_RARETES]);
    for (const ligne of chances) {
      expect(ligne.chance).toBeCloseTo(CHANCES_POCHETTE_FAMILIERS[ligne.rarete]);
      expect(ligne.reste).toBe(ligne.total);
    }
  });

  it("sautent une rareté où le compte a tout, les autres se partageant ses chances", () => {
    const chances = lignesDesChances(CHANCES_POCHETTE_FAMILIERS, new Set(communs.map((f) => f.id)))!;
    const commun = chances.find((ligne) => ligne.rarete === "commun")!;
    expect(commun.chance).toBe(0);
    expect(commun.reste).toBe(0);
    expect(commun.total).toBe(communs.length);
    expect(chances.reduce((somme, ligne) => somme + ligne.chance, 0)).toBeCloseTo(100);
  });

  it("n'existent plus quand il n'y a plus rien à recevoir", () => {
    expect(lignesDesChances(CHANCES_POCHETTE_FAMILIERS, new Set(FAMILIERS.map((f) => f.id)))).toBeNull();
  });
});

describe("la raison d'une pochette fermée", () => {
  it("est nulle pour un compte qui peut ouvrir", () => {
    expect(raisonPochetteFermee(mes(), 2000)).toBeNull();
  });

  it("dit d'abord le compte à valider, puis la collection complète, puis ce qui manque", () => {
    const tout = lignes(FAMILIERS.map((f) => f.id));
    expect(raisonPochetteFermee(mes({ peut_ouvrir: false, familiers: tout }), 0)).toMatch(/officier/);
    expect(raisonPochetteFermee(mes({ familiers: tout }), 0)).toMatch(/tous les familiers/);
    expect(raisonPochetteFermee(mes(), 1250)).toBe(`Il vous manque 750${NBSP}statères.`);
  });

  it("suit le prix du serveur", () => {
    expect(raisonPochetteFermee(mes({ pochette: { prix: 2500, chances: { ...CHANCES_POCHETTE_FAMILIERS } } }), 2400)).toBe(`Il vous manque 100${NBSP}statères.`);
  });
});

describe("les mots d'un refus", () => {
  it("disent ce qui manque quand l'écran le sait", () => {
    expect(messageDuRefusDesFamiliers("solde_insuffisant", { manque: 300 })).toBe(`Il vous manque 300${NBSP}statères.`);
    expect(messageDuRefusDesFamiliers("solde_insuffisant")).toMatch(/assez de statères/);
  });

  it("ont les mots des familiers pour le reste", () => {
    expect(messageDuRefusDesFamiliers("tout_possede")).toMatch(/tous les familiers/);
    expect(messageDuRefusDesFamiliers("prix_change")).toMatch(/prix/);
    expect(messageDuRefusDesFamiliers("pas_possede")).toMatch(/pochette des familiers/);
    expect(messageDuRefusDesFamiliers("not_validated")).toMatch(/officier/);
  });
});

describe("le dessin d'un familier", () => {
  it("est rogné à son cadre, et sa silhouette a la même forme, d'une seule couleur", () => {
    for (const familier of [petit, geant]) {
      const vignette = vignetteDuFamilier(familier)!;
      const silhouette = silhouetteDuFamilier(familier)!;
      const taille = tailleDuFamilier(familier);
      expect([vignette.largeur, vignette.hauteur]).toEqual([taille.largeur, taille.hauteur]);
      expect(vignette.cases).toHaveLength(vignette.largeur * vignette.hauteur);
      expect(silhouette.cases.map((couleur) => couleur !== null)).toEqual(vignette.cases.map((couleur) => couleur !== null));
      expect(new Set(silhouette.cases.filter(Boolean))).toEqual(new Set([COULEUR_SILHOUETTE]));
      expect(vignetteDuFamilier(familier)).toBe(vignette);
    }
  });

  it("s'agrandit d'un nombre entier de fois, sans dépasser sa place", () => {
    for (const familier of FAMILIERS) {
      const vignette = vignetteDuFamilier(familier)!;
      for (const [place, maximum] of [
        [80, 3],
        [256, 8],
      ] as const) {
        const echelle = echelleDuDessin(vignette, place, maximum);
        expect(Number.isInteger(echelle)).toBe(true);
        expect(echelle).toBeGreaterThanOrEqual(1);
        expect(echelle).toBeLessThanOrEqual(maximum);
        expect(Math.max(vignette.largeur, vignette.hauteur) * echelle).toBeLessThanOrEqual(place);
      }
    }
  });
});

describe("l'aperçu du Gaulois avec son familier", () => {
  it("a la largeur de la grille dessinée, pour chaque familier", () => {
    expect(largeurDeLApercu(null)).toBe(GAULOIS_LARGEUR);
    for (const familier of FAMILIERS) expect(largeurDeLApercu(familier)).toBe(apercuAvecFamilier(TENUE_DE_DEPART, familier).largeur);
  });

  it("est « petit » ou « large » selon le familier, et rien sans lui", () => {
    expect(tailleDeLApercu(null)).toBeNull();
    expect(tailleDeLApercu(petit)).toBe("petit");
    expect(tailleDeLApercu(geant)).toBe("large");
    for (const familier of FAMILIERS) expect(tailleDeLApercu(familier)).toBe(largeurDeLApercu(familier) > APERCU_LARGE ? "large" : "petit");
  });

  // La feuille de style compte sur ces largeurs : 3 pixels par case pour un « petit » et 2 pour un « large » tiennent
  // dans 240 pixels, à côté des rayons ; 2 pixels par case tiennent toujours dans un téléphone de 360 pixels.
  it("tient dans la place que la feuille de style lui donne", () => {
    for (const familier of FAMILIERS) {
      const largeur = largeurDeLApercu(familier);
      expect(largeur * (tailleDeLApercu(familier) === "large" ? 2 : 3)).toBeLessThanOrEqual(240);
      expect(largeur * 2).toBeLessThanOrEqual(360 - 32 - 10);
    }
  });

  it("se décrit avec le nom du familier", () => {
    expect(decrireLApercu(TENUE_DE_DEPART, null)).toBe(decrireGaulois(TENUE_DE_DEPART));
    expect(decrireLApercu(TENUE_DE_DEPART, petit)).toBe(`${decrireGaulois(TENUE_DE_DEPART)} À côté de lui, son familier${NBSP}: ${petit.nom}.`);
  });
});
