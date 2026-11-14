import { describe, expect, it } from "vitest";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, OBJETS, TENUE_DE_DEPART, casesDuGaulois, lireTenue } from "../../src/lib/gaulois";
import { DECOR_LARGEUR_MIN, FEU_HAUTEUR, FEU_LARGEUR, Planche, feuDuDecor, flammesDuFeu, placesDuDecor, poserFeu } from "../../src/lib/village/decor";
import { BOITES, HAUT_DU_LIEU, composerLieu } from "../../src/lib/village/lieux";
import { ICONES_DES_LIEUX } from "../../src/lib/village/lieux-icones";
import { NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage } from "../../src/lib/village/lumiere";
import { ADVERSAIRES, ATTABLE_COUPE, ATTABLE_HAUTEUR, LIT_HAUTEUR, LIT_LARGEUR, casesDeLAdversaire, casesEndormies, miroir, poseAttable, poseCouche, poseDeMarche, sansArme } from "../../src/lib/village/poses";
import { LIEUX } from "../../src/lib/village/vie";

const COULEUR = /^#[0-9a-f]{6}$/;
const LUMIERES = [NUIT_PLEINE, PLEIN_JOUR, lumiereDuVillage(new Date("2026-11-13T07:50:00+01:00")), lumiereDuVillage(new Date("2026-11-13T17:14:00+01:00"))];

describe("les cinq lieux", () => {
  it("se composent pour toute largeur, tout nombre et toute lumière, sans case vide ni couleur mal écrite", () => {
    for (const lieu of LIEUX) {
      for (const largeur of [DECOR_LARGEUR_MIN, 164, 392]) {
        for (const nombre of [0, 1, 30]) {
          const scene = composerLieu(lieu, largeur, nombre, LUMIERES[(largeur + nombre) % LUMIERES.length]!);
          expect(scene.decor.largeur).toBe(largeur);
          expect(scene.decor.cases).toHaveLength(largeur * scene.decor.hauteur);
          expect([...new Set(scene.decor.cases)].every((couleur) => typeof couleur === "string" && COULEUR.test(couleur))).toBe(true);
          expect(scene.decor.hauteur).toBeGreaterThanOrEqual(HAUT_DU_LIEU[lieu]);
        }
      }
    }
  });

  it("ne descendent pas sous la plus petite largeur", () => {
    expect(composerLieu("place", 10, 3, NUIT_PLEINE).decor.largeur).toBe(DECOR_LARGEUR_MIN);
    expect(composerLieu("taverne", 163.6, 3, NUIT_PLEINE).decor.largeur).toBe(163);
  });

  it("donnent toujours le même dessin pour la même demande", () => {
    for (const lieu of LIEUX) expect(composerLieu(lieu, 300, 7, PLEIN_JOUR)).toEqual(composerLieu(lieu, 300, 7, PLEIN_JOUR));
  });

  it("changent de couleurs avec la lumière, dehors comme dedans", () => {
    for (const lieu of LIEUX) expect(composerLieu(lieu, 200, 4, NUIT_PLEINE).decor.cases).not.toEqual(composerLieu(lieu, 200, 4, PLEIN_JOUR).decor.cases);
  });

  it("donnent un poste à chacun, tout entier dans la scène, sans deux Gaulois au même endroit", { timeout: 30_000 }, () => {
    for (const lieu of LIEUX) {
      const boite = BOITES[lieu];
      for (const largeur of [DECOR_LARGEUR_MIN, 164, 392, 640]) {
        for (const nombre of [1, 12, 80]) {
          const scene = composerLieu(lieu, largeur, nombre, PLEIN_JOUR);
          if (lieu === "place") expect(scene.postes.length).toBeGreaterThanOrEqual(nombre + 2);
          else expect(scene.postes).toHaveLength(nombre);
          expect(new Set(scene.postes.map((p) => `${p.x}:${p.y}`)).size).toBe(scene.postes.length);
          for (const poste of scene.postes) {
            expect(poste.x).toBeGreaterThanOrEqual(-8);
            expect(poste.x + boite.largeur).toBeLessThanOrEqual(largeur + 8);
            expect(poste.y).toBeGreaterThanOrEqual(0);
            // Le nom, sous la boîte, tient encore dans la scène.
            expect(poste.y + boite.nom + 4).toBeLessThanOrEqual(scene.decor.hauteur);
          }
        }
      }
    }
  });

  it("s'allongent vers le bas avec la foule", () => {
    for (const lieu of LIEUX) expect(composerLieu(lieu, 164, 80, PLEIN_JOUR).decor.hauteur).toBeGreaterThan(composerLieu(lieu, 164, 1, PLEIN_JOUR).decor.hauteur);
  });

  it("mettent des guerriers en face au champ de bataille seulement, à droite des Gaulois, jamais sans Gaulois", () => {
    for (const lieu of LIEUX) if (lieu !== "bataille") expect(composerLieu(lieu, 300, 9, PLEIN_JOUR).adversaires).toEqual([]);
    expect(composerLieu("bataille", 300, 0, PLEIN_JOUR).adversaires).toEqual([]);
    for (const largeur of [164, 392]) {
      const scene = composerLieu("bataille", largeur, 9, PLEIN_JOUR);
      expect(scene.adversaires.length).toBeGreaterThan(0);
      expect(scene.adversaires.length).toBeLessThanOrEqual(9);
      const front = Math.max(...scene.postes.map((p) => p.x));
      for (const adversaire of scene.adversaires) expect(adversaire.x).toBeGreaterThan(front + 40);
    }
  });

  it("allument un feu sur la place et dans les maisons, la fumée dehors seulement", () => {
    expect(composerLieu("place", 164, 3, NUIT_PLEINE)).toMatchObject({ feu: feuDuDecor(164), fumee: true });
    expect(composerLieu("maisons", 164, 3, NUIT_PLEINE).fumee).toBe(false);
    expect(composerLieu("maisons", 164, 3, NUIT_PLEINE).feu).not.toBeNull();
    expect(composerLieu("taverne", 164, 3, NUIT_PLEINE).feu).toBeNull();
  });

  it("rangent des huttes des deux côtés du feu dès la largeur d'un téléphone, sans rien couper au bord", () => {
    expect(placesDuDecor(164).filter((p) => p.type === "hutte")).toHaveLength(2);
    for (const largeur of [164, 400, 586]) {
      const places = placesDuDecor(largeur);
      expect(places.length % 2).toBe(0);
      for (const place of places) {
        expect(place.x - 25).toBeGreaterThanOrEqual(0);
        expect(place.x + 25).toBeLessThanOrEqual(largeur);
      }
    }
  });

  it("ont chacun leur petite image", () => {
    for (const lieu of LIEUX) {
      const icone = ICONES_DES_LIEUX[lieu];
      expect([icone.largeur, icone.hauteur]).toEqual([11, 11]);
      expect(icone.cases).toHaveLength(121);
      expect(icone.cases.filter((c) => c !== null).length).toBeGreaterThan(30);
    }
  });
});

describe("le feu", () => {
  it("se pose avec ou sans sa flamme, et la flamme a trois images de la même taille", () => {
    const avec = new Planche(FEU_LARGEUR, FEU_HAUTEUR);
    const sans = new Planche(FEU_LARGEUR, FEU_HAUTEUR);
    poserFeu(avec, 7, 0);
    poserFeu(sans, 7, 0, false);
    expect(avec.lire(7, 9)).toBe("#fff1a8");
    expect(sans.lire(7, 9)).toBeNull();
    expect(sans.lire(7, 12)).toBe(avec.lire(7, 12));
    const flammes = flammesDuFeu();
    expect(flammes).toHaveLength(3);
    for (const flamme of flammes) {
      expect([flamme.largeur, flamme.hauteur]).toEqual([FEU_LARGEUR + 2, 12]);
      expect(flamme.cases.filter((c) => c !== null).length).toBeGreaterThan(60);
    }
    // La première image est la flamme du dessin, décalée d'une case de marge.
    expect(flammes[0]!.cases[9 * (FEU_LARGEUR + 2) + 8]).toBe("#fff1a8");
    expect(flammes[1]!.cases).not.toEqual(flammes[0]!.cases);
    expect(flammes[2]!.cases).not.toEqual(flammes[1]!.cases);
  });
});

describe("les poses", () => {
  const debout = casesDuGaulois(TENUE_DE_DEPART);
  const pleines = (cases: readonly (string | null)[]) => cases.filter((c) => c !== null).length;

  it("lève un pied sans toucher au reste du corps", () => {
    for (const pied of ["gauche", "droite"] as const) {
      const pose = poseDeMarche(debout, pied);
      expect(pose).toHaveLength(debout.length);
      expect(pose.slice(0, 51 * GAULOIS_LARGEUR)).toEqual(debout.slice(0, 51 * GAULOIS_LARGEUR));
      expect(pose).not.toEqual(debout);
      expect(pleines(pose)).toBeLessThan(pleines(debout));
      expect(pleines(pose)).toBeGreaterThan(pleines(debout) - 80);
    }
    expect(poseDeMarche(debout, "gauche")).not.toEqual(poseDeMarche(debout, "droite"));
  });

  it("retourne un dessin de gauche à droite, et le retrouve en le retournant encore", () => {
    const retourne = miroir(debout);
    expect(retourne).not.toEqual(debout);
    expect(miroir(retourne)).toEqual(debout);
    expect(retourne[20 * GAULOIS_LARGEUR + (GAULOIS_LARGEUR - 1 - 18)]).toBe(debout[20 * GAULOIS_LARGEUR + 18]);
  });

  it("ferme les yeux sans changer le reste, quels que soient les yeux choisis", () => {
    const endormi = casesEndormies(TENUE_DE_DEPART);
    const eveille = casesDuGaulois(sansArme(TENUE_DE_DEPART));
    expect(eveille[20 * GAULOIS_LARGEUR + 18]).toBe("#eef2f7");
    expect(endormi.includes("#eef2f7")).toBe(false);
    expect(endormi.filter((c, i) => c !== eveille[i]).length).toBeLessThanOrEqual(14);
    for (const yeux of Object.keys(OBJETS.yeux)) expect(casesEndormies({ ...TENUE_DE_DEPART, yeux })).toEqual(endormi);
  });

  it("attable le Gaulois : coupé à la taille, la chope posée ou levée", () => {
    const sans = poseAttable(debout, null);
    expect([sans.largeur, sans.hauteur]).toEqual([GAULOIS_LARGEUR, ATTABLE_HAUTEUR]);
    expect(sans.cases.slice(0, ATTABLE_COUPE * GAULOIS_LARGEUR)).toEqual(debout.slice(0, ATTABLE_COUPE * GAULOIS_LARGEUR));
    expect(pleines(sans.cases.slice(ATTABLE_COUPE * GAULOIS_LARGEUR))).toBe(0);
    const posee = poseAttable(debout, "posee");
    const levee = poseAttable(debout, "levee");
    expect(pleines(posee.cases.slice(ATTABLE_COUPE * GAULOIS_LARGEUR))).toBeGreaterThan(10);
    expect(levee.cases).not.toEqual(posee.cases);
    expect(pleines(levee.cases.slice(ATTABLE_COUPE * GAULOIS_LARGEUR))).toBe(0);
  });

  it("couche le Gaulois dans son lit, et la couverture se soulève d'une case", () => {
    const repos = poseCouche(TENUE_DE_DEPART, 0, 3);
    const souffle = poseCouche(TENUE_DE_DEPART, 1, 3);
    expect([repos.largeur, repos.hauteur]).toEqual([LIT_LARGEUR, LIT_HAUTEUR]);
    expect(repos.cases).toHaveLength(LIT_LARGEUR * LIT_HAUTEUR);
    expect(repos.cases).not.toEqual(souffle.cases);
    expect(repos.cases.filter((c, i) => c !== souffle.cases[i]).length).toBeLessThan(260);
    expect(repos.cases.includes("#eef2f7")).toBe(false);
    expect(poseCouche(TENUE_DE_DEPART, 0, 0).cases).not.toEqual(poseCouche(TENUE_DE_DEPART, 0, 1).cases);
  });

  it("pose l'arme pour s'attabler et pour dormir", () => {
    expect(sansArme(TENUE_DE_DEPART)["arme"]).toBe("aucune");
    expect(lireTenue(sansArme(TENUE_DE_DEPART))).not.toBeNull();
    expect(OBJETS.arme["aucune"]).toBeDefined();
  });

  it("dessine les guerriers d'en face : entiers, en prune, sans une couleur de vêtement des Gaulois", () => {
    for (let variante = 0; variante < ADVERSAIRES; variante++) {
      const cases = casesDeLAdversaire(variante);
      expect(cases).toHaveLength(GAULOIS_LARGEUR * GAULOIS_HAUTEUR);
      expect(pleines(cases)).toBeGreaterThan(900);
      expect(cases.every((c) => c === null || COULEUR.test(c))).toBe(true);
      expect(cases.includes("#e9e4f2")).toBe(true);
      expect(cases.includes("#5a4070")).toBe(true);
    }
    expect(casesDeLAdversaire(0)).not.toEqual(casesDeLAdversaire(1));
    expect(casesDeLAdversaire(ADVERSAIRES)).toEqual(casesDeLAdversaire(0));
    // Le bleu des braies et le vert des carreaux de la tenue de départ n'y sont jamais.
    for (const couleur of ["#2f5fa8", "#4f7d3a", "#c4561f"]) expect(casesDeLAdversaire(0).includes(couleur)).toBe(false);
  });
});
