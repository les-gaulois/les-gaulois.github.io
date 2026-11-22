import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS, vignetteDeLObjet } from "../../src/lib/gaulois";
import { CARTE_HAUTEUR, CARTE_LARGEUR, FENETRE_DU_FOND, TONS, faceDeCarte } from "../../src/lib/jeu/boosters";
import { vignetteDuFamilier } from "../../src/lib/village/ecran-familiers";
import { FAMILIERS } from "../../src/lib/village/familiers";
import { MODELES, modeleNu } from "../../src/lib/village/modeles";
import { ACCENTS, ATTRIBUTION } from "../../src/lib/village/fonds-objets/attribution";
import {
  CATALOGUE_DES_SCENES,
  IDS_DES_SCENES,
  SCENES,
  accentDuDessin,
  cleDeLObjet,
  cleDuFamilier,
  cleDuModele,
  fondSeul,
  imageSurFond,
  rangDeLaRarete,
  sceneDe,
  tailleBornee,
  tailleDuFond,
} from "../../src/lib/village/fonds-objets";
import { LUMINANCE_MIN, TAILLE_MAX, TAILLE_MIN, graineDe, luminanceMoyenne } from "../../src/lib/village/fonds-objets/socle";

const HEX = /^#[0-9a-f]{6}$/i;

/** Toutes les choses qui ont un fond : les objets à rareté, les familiers, les Gaulois uniques. */
const CLES = [
  ...EMPLACEMENTS_OBJETS.flatMap((emplacement) =>
    Object.entries(OBJETS[emplacement])
      .filter(([, objet]) => objet.dessin && objet.rarete)
      .map(([id]) => cleDeLObjet(emplacement, id)),
  ),
  ...FAMILIERS.map((f) => cleDuFamilier(f.id)),
  ...MODELES.map((m) => cleDuModele(m.id)),
];

/** Les tailles où les écrans montrent un fond : la plus petite, les cases du vestiaire à 3, 2 et 1, la face d'un booster, la plus grande. */
const TAILLES = [
  [TAILLE_MIN.largeur, TAILLE_MIN.hauteur],
  [37, 25],
  [56, 38],
  [FENETRE_DU_FOND.largeur, FENETRE_DU_FOND.hauteur],
  [44, 44],
  [112, 76],
  [TAILLE_MAX.largeur, TAILLE_MAX.hauteur],
] as const;

describe("les scènes des fonds d'objets", () => {
  it("sont toutes dessinées, chacune une fois, dans le lot du catalogue", () => {
    expect([...SCENES.keys()].sort()).toEqual([...IDS_DES_SCENES].sort());
    for (const [id, scene] of SCENES) expect(scene.id).toBe(id);
  });

  it.each(IDS_DES_SCENES.map((id) => [id]))("%s remplit chaque case, d'une couleur, toujours la même, et reste claire", (id) => {
    for (const [largeur, hauteur] of TAILLES) {
      for (const rarete of ["commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"]) {
        const options = { largeur, hauteur, rarete, accent: "#c0392b", scene: id } as const;
        const fond = fondSeul(`essai/${id}/${largeur}`, options);
        expect(fond.largeur).toBe(largeur);
        expect(fond.hauteur).toBe(hauteur);
        expect(fond.cases).toHaveLength(largeur * hauteur);
        for (const c of fond.cases) expect(c).toMatch(HEX);
        expect(luminanceMoyenne(fond.cases)).toBeGreaterThanOrEqual(LUMINANCE_MIN);
      }
    }
    const a = fondSeul("essai/meme", { largeur: 56, hauteur: 38, scene: id });
    const b = fondSeul("essai/meme", { largeur: 56, hauteur: 38, scene: id });
    expect(a.cases).toEqual(b.cases);
  });

  it("varient d'une chose à l'autre sur la même scène", () => {
    for (const id of SCENES.keys()) {
      const a = fondSeul("essai/une", { largeur: 56, hauteur: 38, scene: id, accent: "#2f8cff" });
      const b = fondSeul("essai/autre", { largeur: 56, hauteur: 38, scene: id, accent: "#d9203a" });
      expect(a.cases).not.toEqual(b.cases);
    }
  });
});

/** Une chose de la table, avec son dessin et sa pose, comme les écrans la montrent. */
interface Chose {
  cle: string;
  rarete: string;
  dessin: { largeur: number; hauteur: number; cases: readonly (string | null)[] };
  pose: "centre" | "sol";
}
const CHOSES: Chose[] = [
  ...EMPLACEMENTS_OBJETS.flatMap((emplacement) =>
    Object.entries(OBJETS[emplacement]).flatMap(([id, objet]): Chose[] => {
      const dessin = objet.rarete ? vignetteDeLObjet(emplacement, id) : null;
      return dessin && objet.rarete ? [{ cle: cleDeLObjet(emplacement, id), rarete: objet.rarete, dessin, pose: "centre" }] : [];
    }),
  ),
  ...FAMILIERS.flatMap((f): Chose[] => {
    const dessin = vignetteDuFamilier(f);
    return dessin ? [{ cle: cleDuFamilier(f.id), rarete: f.rarete, dessin, pose: "sol" }] : [];
  }),
  ...MODELES.flatMap((m): Chose[] => {
    const dessin = modeleNu(m.id);
    return dessin ? [{ cle: cleDuModele(m.id), rarete: m.rarete, dessin, pose: "sol" }] : [];
  }),
];

describe("une boîte pas encore mesurée", () => {
  it("donne la plus petite taille, jamais une planche impossible (la vraie carte d'un booster, dessinée avant d'être posée)", () => {
    expect(tailleBornee(Number.NaN, Number.NaN)).toEqual({ largeur: TAILLE_MIN.largeur, hauteur: TAILLE_MIN.hauteur });
    expect(tailleDuFond(Number.NaN, 40, 2, null)).toEqual({ largeur: TAILLE_MIN.largeur, hauteur: TAILLE_MIN.hauteur });
    expect(imageSurFond(cleDuFamilier("chat-tigre"), null, { largeur: Number.NaN, hauteur: Number.NaN }).cases).toHaveLength(TAILLE_MIN.largeur * TAILLE_MIN.hauteur);
  });
});

describe("les fonds des vraies choses", () => {
  it("donnent à chaque chose d'une même scène un fond à elle, aux tailles des cases", () => {
    expect(CHOSES).toHaveLength(CLES.length);
    for (const [largeur, hauteur] of [[56, 38], [37, 25]] as const) {
      const vus = new Map<string, string>();
      for (const c of CHOSES) {
        const fond = fondSeul(c.cle, { largeur, hauteur, rarete: c.rarete, accent: accentDuDessin(c.dessin) });
        const empreinte = `${sceneDe(c.cle)}|${fond.cases.join("")}`;
        expect(vus.get(empreinte), `${c.cle} a le même fond que ${vus.get(empreinte)} en ${largeur} × ${hauteur}`).toBeUndefined();
        vus.set(empreinte, c.cle);
      }
    }
  });

  it("montrent la chose entière dans les cases des écrans, la tête d'un familier jamais coupée", () => {
    // Les boîtes d'image des écrans, en pixels : vestiaire du jeu, ancienne case, pass, vitrine, case étroite d'un téléphone.
    for (const [boiteL, boiteH, place] of [[112, 76, 80], [104, 88, 80], [104, 92, 64], [104, 80, 80], [92, 76, 80]] as const) {
      for (const c of CHOSES) {
        const e = Math.max(1, Math.min(3, Math.floor(place / Math.max(c.dessin.largeur, c.dessin.hauteur))));
        const taille = tailleDuFond(boiteL, boiteH, e, c.dessin);
        const image = imageSurFond(c.cle, c.dessin, { ...taille, rarete: c.rarete, pose: c.pose });
        const pleines = c.dessin.cases.filter((x) => x !== null).length;
        // La chose est posée d'un bloc, centrée en largeur : à l'une des hauteurs possibles, on retrouve toutes ses cases
        // pleines si rien n'est rogné.
        const x0 = Math.floor((image.largeur - c.dessin.largeur) / 2);
        let retrouvees = 0;
        for (let y0 = 0; y0 <= image.hauteur - c.dessin.hauteur; y0++) {
          let ici = 0;
          for (let j = 0; j < c.dessin.hauteur; j++) {
            for (let i = 0; i < c.dessin.largeur; i++) {
              const v = c.dessin.cases[j * c.dessin.largeur + i];
              if (v && image.cases[(y0 + j) * image.largeur + x0 + i] === v) ici++;
            }
          }
          retrouvees = Math.max(retrouvees, ici);
        }
        expect(retrouvees, `${c.cle} dans une boîte de ${boiteL} × ${boiteH}`).toBe(pleines);
      }
    }
  });
});

describe("la face d'une carte de booster avec son fond", () => {
  const image = { largeur: 10, hauteur: 20, cases: Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? "#aa3322" : null)) };
  const sans = faceDeCarte({ nom: "Épée de fer", image, tons: TONS.epique, rang: 3, mot: "Épique" });
  const avec = faceDeCarte({ nom: "Épée de fer", image, tons: TONS.epique, rang: 3, mot: "Épique", fond: { cle: "objet/arme/epee", rarete: "epique" } });

  it("ne change rien sous la fenêtre : le nom, l'icône et le mot restent à leur place", () => {
    for (let y = FENETRE_DU_FOND.y + FENETRE_DU_FOND.hauteur + 1; y < CARTE_HAUTEUR; y++) {
      for (let x = 0; x < CARTE_LARGEUR; x++) expect(avec.couleur(x, y), `(${x}, ${y})`).toEqual(sans.couleur(x, y));
    }
  });

  it("encadre la fenêtre du bord de la rareté et y peint le fond, l'image par-dessus", () => {
    const bord = sans.couleur(34, 0);
    expect(avec.couleur(FENETRE_DU_FOND.x - 1, FENETRE_DU_FOND.y + 5)).toEqual(bord);
    expect(avec.couleur(FENETRE_DU_FOND.x + FENETRE_DU_FOND.largeur, FENETRE_DU_FOND.y + 5)).toEqual(bord);
    expect(avec.couleur(FENETRE_DU_FOND.x + 2, FENETRE_DU_FOND.y + 2)).not.toEqual(sans.couleur(FENETRE_DU_FOND.x + 2, FENETRE_DU_FOND.y + 2));
    // Le centre de l'image : la case pleine de la chose, la même avec ou sans fond.
    const xi = Math.round(CARTE_LARGEUR / 2 - 5);
    const yi = Math.round(21 - 10);
    expect(avec.couleur(xi, yi)).toEqual(sans.couleur(xi, yi));
  });
});

describe("la table des fonds d'objets", () => {
  it("donne une scène du catalogue à chaque objet, familier et Gaulois unique, et à rien d'autre", () => {
    const manquantes = CLES.filter((cle) => !(cle in ATTRIBUTION));
    expect(manquantes).toEqual([]);
    const enTrop = Object.keys(ATTRIBUTION).filter((cle) => !CLES.includes(cle));
    expect(enTrop).toEqual([]);
    for (const cle of CLES) expect(Object.keys(CATALOGUE_DES_SCENES)).toContain(sceneDe(cle));
  });

  it("n'a que des couleurs « #rrggbb » pour les accents, et seulement pour des choses connues", () => {
    for (const [cle, accent] of Object.entries(ACCENTS)) {
      expect(CLES).toContain(cle);
      expect(accent).toMatch(HEX);
    }
  });
});

describe("la chose sur son fond", () => {
  const epee = { largeur: 3, hauteur: 5, cases: ["#111111", null, "#111111", null, "#aa3322", null, null, "#aa3322", null, null, "#aa3322", null, "#222222", "#222222", "#222222"] };

  it("pose chaque case pleine de la chose au milieu, et laisse le fond ailleurs", () => {
    const image = imageSurFond("objet/arme/essai", epee, { largeur: 30, hauteur: 21, rarete: "epique" });
    const fond = fondSeul("objet/arme/essai", { largeur: 30, hauteur: 21, rarete: "epique", accent: accentDuDessin(epee), zone: { x: 13, y: 8, largeur: 3, hauteur: 5 }, sol: 14 });
    expect(image.largeur).toBe(30);
    expect(image.hauteur).toBe(21);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 3; i++) {
        const c = epee.cases[j * 3 + i];
        const ici = (8 + j) * 30 + 13 + i;
        expect(image.cases[ici]).toBe(c ?? fond.cases[ici]);
      }
    }
    expect(image.cases[0]).toBe(fond.cases[0]);
    for (const c of image.cases) expect(c).toMatch(HEX);
  });

  it("pose un familier les pieds près du bas", () => {
    const image = imageSurFond("familier/essai", epee, { largeur: 30, hauteur: 21, pose: "sol" });
    const marge = Math.max(1, Math.round(21 * 0.08));
    expect(image.cases[(21 - marge - 1) * 30 + 13]).toBe("#222222");
  });

  it("borne la taille d'un fond entre la plus petite et la plus grande", () => {
    expect(fondSeul("essai/petit", { largeur: 3, hauteur: 2 }).largeur).toBe(TAILLE_MIN.largeur);
    expect(fondSeul("essai/grand", { largeur: 500, hauteur: 500 }).hauteur).toBe(TAILLE_MAX.hauteur);
  });

  it("choisit un fond au grain de l'image, jamais plus petit que la chose", () => {
    expect(tailleDuFond(112, 76, 2, { largeur: 10, hauteur: 20 })).toEqual({ largeur: 56, hauteur: 38 });
    expect(tailleDuFond(112, 76, 2, { largeur: 10, hauteur: 40 })).toEqual({ largeur: 56, hauteur: 40 });
    expect(tailleDuFond(60, 40, 3, null)).toEqual({ largeur: TAILLE_MIN.largeur, hauteur: TAILLE_MIN.hauteur });
  });

  it("tire la couleur propre d'une chose de sa couleur franche la plus présente", () => {
    expect(accentDuDessin(epee)).toBe("#aa3322");
    expect(accentDuDessin(null)).toMatch(HEX);
  });

  it("lit le rang de chaque rareté, le légendaire de saison comme un légendaire", () => {
    expect(["commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin", null].map(rangDeLaRarete)).toEqual([1, 2, 3, 4, 5, 5, 6, 1]);
  });

  it("tire une graine stable d'une clé", () => {
    expect(graineDe("objet/tete/casque")).toBe(graineDe("objet/tete/casque"));
    expect(graineDe("objet/tete/casque")).not.toBe(graineDe("objet/tete/couronne"));
  });
});
