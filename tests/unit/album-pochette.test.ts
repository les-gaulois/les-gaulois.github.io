import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, ORDRE_RARETES_DES_OBJETS as ORDRE_RARETES, type RareteDObjet as Rarete } from "../../src/lib/gaulois";
import { ALBUM_ETROIT, TOUS, albumDeLaMenagerie, albumDeLaPochetteSurprise, casesDuGroupe, nombreDansLaPochetteSurprise, decrireLaCase, groupesDeLAlbum, placerLAlbum, premiereALaLoupe, rognerLeDessin, rognerLesRangees, type ElementDeLAlbum } from "../../src/lib/village/album-pochette";
import { chanceDeLObjet, objetsDeLaPochette } from "../../src/lib/village/boutique";
import { CHANCES_DU_TIRAGE as CHANCES_POCHETTE, CHANCES_POCHETTE_FAMILIERS, PRIX_POCHETTE_FAMILIERS, type MesFamiliers, type ObjetPossede } from "../../src/lib/village/contrat";
import { COULEUR_SILHOUETTE } from "../../src/lib/village/ecran-familiers";
import { FAMILIERS, FAMILLES, chanceDuFamilier } from "../../src/lib/village/familiers";

// L'album d'une pochette (16 novembre 2026) : ce que la pochette peut donner, pour ce compte. Les objets et les familiers
// nommés ici sont pris dans le catalogue et la liste des dessins : aucun n'est écrit en dur.

const NBSP = String.fromCharCode(0xa0);
const somme = (elements: readonly ElementDeLAlbum[]): number => elements.reduce((s, e) => s + e.chance, 0);

const mes = (ids: readonly string[] = [], porte: string | null = null): Pick<MesFamiliers, "familiers" | "porte" | "pochette"> => ({
  familiers: ids.map((familier) => ({ familier, acquis_le: "2026-11-15T20:00:00Z" })),
  porte,
  pochette: { prix: PRIX_POCHETTE_FAMILIERS, chances: { ...CHANCES_POCHETTE_FAMILIERS } },
});

describe("la pochette surprise dans l'album", () => {
  const album = albumDeLaPochetteSurprise(CHANCES_POCHETTE, []);
  const payants = ORDRE_RARETES.flatMap((rarete) => objetsDeLaPochette(rarete));

  it("montre chaque objet payant une fois, et rien d'autre", () => {
    expect(album.elements).toHaveLength(payants.length);
    expect(new Set(album.elements.map((e) => e.id))).toEqual(new Set(payants.map((ref) => `${ref.emplacement}/${ref.objet}`)));
    expect(album.sous).toBe(`${payants.length} objets`);
    expect(album.libelleDesGroupes).toBe("Montrer un rayon");
    expect(nombreDansLaPochetteSurprise(CHANCES_POCHETTE)).toBe(payants.length);
    // Un serveur d'avant le divin ne lui donne aucune chance : ses objets ne sont pas dans l'album.
    const sansDivin = { ...CHANCES_POCHETTE, commun: CHANCES_POCHETTE.commun + CHANCES_POCHETTE.divin, divin: 0 };
    expect(albumDeLaPochetteSurprise(sansDivin, []).elements.some((e) => e.rarete === "divin")).toBe(false);
    expect(nombreDansLaPochetteSurprise(sansDivin)).toBe(payants.length - objetsDeLaPochette("divin").length);
  });

  it("range les objets rayon par rayon, du plus courant au plus rare dans chaque rayon", () => {
    const rayons = [...new Set(album.elements.map((e) => e.groupe))];
    expect(rayons).toEqual(EMPLACEMENTS_OBJETS.map((emplacement) => NOMS_EMPLACEMENTS[emplacement]));
    for (const rayon of rayons) {
      const rangs = casesDuGroupe(album.elements, rayon).map((e) => ORDRE_RARETES.indexOf(e.rarete));
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    }
  });

  it("range « Tout » par rareté, tous rayons mêlés, les rayons dans leur ordre dans chaque rareté", () => {
    const cases = casesDuGroupe(album.elements, TOUS);
    expect(cases).toHaveLength(album.elements.length);
    const rangs = cases.map((e) => ORDRE_RARETES.indexOf(e.rarete));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(cases.filter((e) => e.rarete === "commun").map((e) => e.groupe)).size).toBeGreaterThan(1);
    for (const rarete of ORDRE_RARETES) {
      expect(cases.filter((e) => e.rarete === rarete).map((e) => e.id)).toEqual(album.elements.filter((e) => e.rarete === rarete).map((e) => e.id));
    }
  });

  it("donne à chaque objet la chance du tirage, et la somme fait 100 %", () => {
    for (const element of album.elements) {
      const [emplacement, objet] = element.id.split("/") as [(typeof EMPLACEMENTS_OBJETS)[number], string];
      expect(element.chance).toBeCloseTo(chanceDeLObjet(emplacement, objet, CHANCES_POCHETTE), 10);
    }
    expect(somme(album.elements)).toBeCloseTo(100, 8);
  });

  it("suit les chances que le serveur envoie, pas celles de départ", () => {
    const reglees: Record<Rarete, number> = { commun: 39.5, "peu-commun": 30, epique: 15, mystique: 10, legendaire: 5, divin: 0.5 };
    const autre = albumDeLaPochetteSurprise(reglees, []);
    const legendaires = autre.elements.filter((e) => e.rarete === "legendaire");
    expect(somme(legendaires)).toBeCloseTo(5, 8);
    expect(somme(autre.elements.filter((e) => e.rarete === "divin"))).toBeCloseTo(0.5, 8);
  });

  it("montre les objets divins, dix fois plus rares ensemble que les légendaires", () => {
    const divins = album.elements.filter((e) => e.rarete === "divin");
    expect(divins).toHaveLength(objetsDeLaPochette("divin").length);
    expect(divins.length).toBeGreaterThan(0);
    expect(somme(divins)).toBeCloseTo(CHANCES_POCHETTE.legendaire / 10, 8);
    expect(new Set(divins.map((e) => e.groupe)).size).toBe(EMPLACEMENTS_OBJETS.length);
  });

  it("garde un objet déjà possédé, avec sa chance : il peut ressortir en double", () => {
    const premier = album.elements[0]!;
    const [emplacement, objet] = premier.id.split("/") as [ObjetPossede["emplacement"], string];
    const inventaire: ObjetPossede[] = [{ emplacement, objet, quantite: 2, origine: "pochette", acquis_le: "2026-11-15T20:00:00Z" }];
    const avec = albumDeLaPochetteSurprise(CHANCES_POCHETTE, inventaire);
    const meme = avec.elements.find((e) => e.id === premier.id)!;
    expect(meme.possede).toBe(true);
    expect(meme.chance).toBe(premier.chance);
    expect(avec.elements.filter((e) => e.possede)).toHaveLength(1);
  });

  it("montre les objets en couleur, rognés à leur dessin", () => {
    for (const element of album.elements) {
      expect(element.silhouette).toBe(false);
      expect(element.dessin).not.toBeNull();
      const { largeur, hauteur, cases } = element.dessin!;
      expect(cases).toHaveLength(largeur * hauteur);
      expect(cases.slice(0, largeur).some((c) => c !== null)).toBe(true);
      expect(cases.slice((hauteur - 1) * largeur).some((c) => c !== null)).toBe(true);
    }
  });
});

describe("la ménagerie dans l'album", () => {
  it("montre les cent familiers famille par famille, en silhouette pour un compte qui n'en a aucun", () => {
    const album = albumDeLaMenagerie(mes());
    expect(album.elements.map((e) => e.id)).toEqual(FAMILIERS.map((f) => f.id));
    expect([...new Set(album.elements.map((e) => e.groupe))]).toEqual([...FAMILLES]);
    expect(album.elements.every((e) => e.silhouette && !e.possede)).toBe(true);
    expect(album.elements.every((e) => e.dessin?.cases.every((c) => c === null || c === COULEUR_SILHOUETTE))).toBe(true);
    expect(album.sous).toBe(`0 sur ${FAMILIERS.length} à vous`);
    expect(album.libelleDesGroupes).toBe("Montrer une famille");
    expect(somme(album.elements)).toBeCloseTo(100, 8);
  });

  it("montre en couleur ceux du compte, sans chance, et redonne leur part aux autres", () => {
    const deux = [FAMILIERS[0]!.id, FAMILIERS[5]!.id];
    const album = albumDeLaMenagerie(mes(deux, deux[1]));
    const possedes = new Set(deux);
    for (const element of album.elements) {
      expect(element.possede).toBe(possedes.has(element.id));
      expect(element.silhouette).toBe(!possedes.has(element.id));
      expect(element.chance).toBeCloseTo(chanceDuFamilier(element.id, CHANCES_POCHETTE_FAMILIERS, possedes), 10);
    }
    expect(album.elements.find((e) => e.id === deux[1])!.montre).toBe(true);
    expect(album.elements.find((e) => e.id === deux[0])!.montre).toBe(false);
    expect(album.sous).toBe(`2 sur ${FAMILIERS.length} à vous`);
    expect(somme(album.elements)).toBeCloseTo(100, 8);
  });

  it("écrit la famille et la taille sous la rareté", () => {
    const album = albumDeLaMenagerie(mes());
    expect(album.elements.every((e) => e.detail.startsWith(e.groupe))).toBe(true);
    expect(album.elements.some((e) => e.detail.includes(" · "))).toBe(true);
  });
});

describe("les puces et la loupe", () => {
  const album = albumDeLaMenagerie(mes());

  it("propose « Tout », puis chaque famille avec son nombre", () => {
    const groupes = groupesDeLAlbum(album.elements);
    expect(groupes[0]).toEqual({ groupe: TOUS, nom: "Tout", nombre: FAMILIERS.length });
    expect(groupes.slice(1).map((g) => g.nom)).toEqual([...FAMILLES]);
    expect(groupes.slice(1).reduce((s, g) => s + g.nombre, 0)).toBe(FAMILIERS.length);
  });

  it("réduit l'album à une famille, et montre tout pour « Tout » ou une famille inconnue", () => {
    const famille = FAMILLES[1]!;
    expect(casesDuGroupe(album.elements, famille).every((e) => e.groupe === famille)).toBe(true);
    expect(casesDuGroupe(album.elements, TOUS)).toHaveLength(FAMILIERS.length);
    expect(casesDuGroupe(album.elements, "inconnue")).toHaveLength(FAMILIERS.length);
  });

  it("range les cases par rareté, de la plus courante à la plus rare, en gardant l'ordre des familles dans une rareté", () => {
    const rang = (e: ElementDeLAlbum): number => ORDRE_RARETES.indexOf(e.rarete);
    for (const groupe of [TOUS, FAMILLES[1]!]) {
      const cases = casesDuGroupe(album.elements, groupe);
      expect(cases.map(rang)).toEqual([...cases.map(rang)].sort((a, b) => a - b));
      for (const rarete of ORDRE_RARETES) {
        const attendu = album.elements.filter((e) => e.rarete === rarete && (groupe === TOUS || e.groupe === groupe)).map((e) => e.id);
        expect(cases.filter((e) => e.rarete === rarete).map((e) => e.id)).toEqual(attendu);
      }
    }
    // Les puces gardent l'ordre des familles.
    expect(groupesDeLAlbum(album.elements).slice(1).map((g) => g.nom)).toEqual([...FAMILLES]);
  });

  it("met d'abord à la loupe le plus rare que la pochette peut encore donner", () => {
    expect(premiereALaLoupe(album.elements)?.id).toBe(FAMILIERS.find((f) => f.rarete === "legendaire")!.id);
    const legendaires = FAMILIERS.filter((f) => f.rarete === "legendaire").map((f) => f.id);
    const sansLegendaire = albumDeLaMenagerie(mes(legendaires));
    expect(premiereALaLoupe(sansLegendaire.elements)?.rarete).toBe("mystique");
    const toutPossede = albumDeLaMenagerie(mes(FAMILIERS.map((f) => f.id)));
    expect(premiereALaLoupe(toutPossede.elements)?.id).toBe(FAMILIERS[0]!.id);
    expect(premiereALaLoupe([])).toBeNull();
  });

  it("dit chaque case en mots, comme la loupe : nom, rareté, famille et taille ou rayon, puis à vous ou la chance", () => {
    const premier = album.elements[0]!;
    const [famille, taille] = premier.detail.split(" · ");
    expect(decrireLaCase(premier)).toBe(`${premier.nom}, Commun, ${famille}, ${taille}, ${String(Math.round(premier.chance * 100) / 100).replace(".", ",")}${NBSP}% de chance`);
    const montre = albumDeLaMenagerie(mes([premier.id], premier.id)).elements[0]!;
    expect(decrireLaCase(montre)).toBe(`${premier.nom}, Commun, ${famille}, ${taille}, montré à côté de votre Gaulois`);
    const objet = { ...albumDeLaPochetteSurprise(CHANCES_POCHETTE, []).elements[0]!, possede: true };
    expect(decrireLaCase(objet)).toMatch(new RegExp(`^${objet.nom}, ${objet.rarete === "commun" ? "Commun" : ".+"}, ${objet.groupe}, à vous, .+ de chance$`));
  });
});

describe("rogner un dessin", () => {
  it("retire les rangées vides du haut et du bas, et rien d'autre", () => {
    const x = "#123456";
    const dessin = { largeur: 2, hauteur: 5, cases: [null, null, x, null, null, null, null, x, null, null] };
    expect(rognerLesRangees(dessin)).toEqual({ largeur: 2, hauteur: 3, cases: [x, null, null, null, null, x] });
    expect(rognerLesRangees({ largeur: 2, hauteur: 2, cases: [null, null, null, null] })).toBeNull();
  });

  it("retire aussi les colonnes vides de chaque côté", () => {
    const x = "#123456";
    const y = "#abcdef";
    const dessin = { largeur: 4, hauteur: 3, cases: [null, null, null, null, null, x, null, null, null, null, y, null] };
    expect(rognerLeDessin(dessin)).toEqual({ largeur: 2, hauteur: 2, cases: [x, null, null, y] });
    expect(rognerLeDessin({ largeur: 1, hauteur: 1, cases: [null] })).toBeNull();
  });
});

describe("la place de l'album", () => {
  const ecran = { largeur: 1440, hauteur: 900 };
  const dessin = { left: 200, top: 300, right: 300, bottom: 400 };

  it("s'ouvre à droite du dessin quand il y tient, la pointe vers son milieu", () => {
    const place = placerLAlbum(dessin, 780, 640, ecran);
    expect(place.cote).toBe("droite");
    expect(place.left).toBe(312);
    expect(place.top + place.pointe + 7).toBeCloseTo(350, 5);
    expect(place.top + 640).toBeLessThanOrEqual(ecran.hauteur - 16);
  });

  it("passe dessous quand la largeur manque, sans sortir de l'écran", () => {
    const place = placerLAlbum({ left: 700, top: 100, right: 800, bottom: 200 }, 780, 640, { largeur: 1100, hauteur: 900 });
    expect(place.cote).toBe("dessous");
    expect(place.top).toBe(212);
    expect(place.left + 780).toBeLessThanOrEqual(1100 - 16);
    expect(place.hauteurMax).toBe(640);
  });

  it("passe dessus quand il y a bien plus de place au-dessus", () => {
    const place = placerLAlbum({ left: 700, top: 700, right: 800, bottom: 800 }, 780, 640, { largeur: 1100, hauteur: 900 });
    expect(place.cote).toBe("dessus");
    expect(place.top + 640).toBe(700 - 12);
  });

  it("ne passe jamais sous la barre du site", () => {
    const dessus = placerLAlbum({ left: 700, top: 700, right: 800, bottom: 800 }, 780, 640, { largeur: 1100, hauteur: 900, haut: 64 });
    expect(dessus.cote).toBe("dessus");
    expect(dessus.top).toBeGreaterThanOrEqual(64 + 16);
    expect(dessus.top + dessus.hauteurMax).toBeLessThanOrEqual(700 - 12);
    const droite = placerLAlbum({ left: 200, top: 70, right: 300, bottom: 170 }, 780, 640, { largeur: 1440, hauteur: 900, haut: 64 });
    expect(droite.cote).toBe("droite");
    expect(droite.top).toBe(64 + 16);
    expect(droite.top + droite.hauteurMax).toBeLessThanOrEqual(900 - 16);
  });

  it("prend toute la hauteur sur un écran trop bas pour un album dessous ou dessus (téléphone couché)", () => {
    const place = placerLAlbum({ left: 300, top: 150, right: 408, bottom: 258 }, 780, 640, { largeur: 844, hauteur: 390, haut: 64 });
    expect(place.cote).toBeNull();
    expect(place.top).toBe(64 + 16);
    expect(place.hauteurMax).toBe(390 - 64 - 32);
  });

  it("ne dépasse jamais l'écran, même bas des deux côtés", () => {
    const place = placerLAlbum({ left: 700, top: 200, right: 800, bottom: 300 }, 780, 640, { largeur: 1000, hauteur: 500 });
    expect(place.top).toBeGreaterThanOrEqual(16);
    expect(place.top + Math.min(640, place.hauteurMax)).toBeLessThanOrEqual(500 - 16 + 1e-9);
    expect(ALBUM_ETROIT).toBe(640);
  });
});
