import { describe, expect, it } from "vitest";
import { hasardDe } from "../../src/lib/village/mouvement";
import { AGACES, AIMABLES, EXCEDES, FAMILLES, FURIEUX, LE_SIEN, LE_SIEN_AGACE, MOTS_INTERDITS, SALUTS, SOMMEIL, SOMMEIL_AGACE } from "../../src/lib/village/repliques-toucher";
import {
  CARNET_JOUR_MS,
  CARNET_MAX,
  type Carnet,
  HEURE_MS,
  MEMOIRE_DES_PHRASES,
  carnetVide,
  cleDuGaulois,
  compterLeToucher,
  dureeDeLaBulle,
  ecrireCarnet,
  lireCarnet,
  listeDuToucher,
  palierDuToucher,
  phraseDuToucher,
  ponctuer,
  sursaute,
  toucherLeGaulois,
} from "../../src/lib/village/toucher";
import { LIEUX, REPLIQUE_MAX } from "../../src/lib/village/vie";

const TOUTES = Object.values(FAMILLES).flat();
const T0 = Date.UTC(2026, 10, 14, 15, 0);
const brennos: { nom: string; moi: boolean; replique: string | null } = { nom: "Brennos", moi: false, replique: null };

/** `n` touchers du même Gaulois, une minute après l'autre ; rend les réponses dans l'ordre. */
function insister(n: number, gaulois = brennos, lieu: (typeof LIEUX)[number] = "place", graine = 7) {
  const hasard = hasardDe(graine);
  let carnet: Carnet = carnetVide();
  const reponses = [];
  for (let i = 0; i < n; i++) {
    const reponse = toucherLeGaulois(carnet, gaulois, lieu, T0 + i * 60_000, hasard);
    carnet = reponse.carnet;
    reponses.push(reponse);
  }
  return { reponses, carnet };
}

describe("les phrases du toucher", () => {
  it("sont nombreuses : au moins 150, dont 90 d'agacement", () => {
    expect(TOUTES.length).toBeGreaterThanOrEqual(150);
    expect(AGACES.length + EXCEDES.length + FURIEUX.length).toBeGreaterThanOrEqual(90);
  });

  it("chaque palier et chaque lieu est assez fourni", () => {
    expect(SALUTS.length).toBeGreaterThanOrEqual(20);
    for (const lieu of ["place", "taverne", "reunion", "bataille"] as const) expect(AIMABLES[lieu].length, lieu).toBeGreaterThanOrEqual(10);
    for (const liste of [AGACES, EXCEDES, FURIEUX]) expect(liste.length).toBeGreaterThanOrEqual(30);
    for (const liste of [SOMMEIL, SOMMEIL_AGACE]) expect(liste.length).toBeGreaterThanOrEqual(10);
    expect(LE_SIEN.length).toBeGreaterThanOrEqual(8);
    expect(LE_SIEN_AGACE.length).toBeGreaterThanOrEqual(6);
    // Assez pour ne jamais retomber sur une phrase déjà gardée en mémoire.
    for (const [nom, liste] of Object.entries(FAMILLES)) expect(liste.length, nom).toBeGreaterThan(MEMOIRE_DES_PHRASES);
  });

  it("tiennent dans la bulle, sans chiffre, sans retour à la ligne, sans espace en trop", () => {
    for (const phrase of TOUTES) {
      expect(Array.from(phrase).length, phrase).toBeLessThanOrEqual(REPLIQUE_MAX);
      expect(phrase.length, phrase).toBeGreaterThan(3);
      expect(phrase, phrase).not.toMatch(/\d/);
      expect(phrase, phrase).not.toMatch(/\s{2}|\n|^\s|\s$/);
      // Pas d'émoji, pas de signe qui ne serait pas du français écrit.
      expect(phrase, phrase).toMatch(/^[\p{L} ,.!?'’…-]+$/u);
    }
  });

  it("ne se répètent nulle part", () => {
    const vues = new Set(TOUTES.map((phrase) => phrase.toLowerCase()));
    expect(vues.size).toBe(TOUTES.length);
  });

  it("ne contiennent aucun mot interdit", () => {
    for (const phrase of TOUTES) {
      const texte = phrase.toLowerCase();
      for (const mot of MOTS_INTERDITS) {
        const entier = new RegExp(`(?<!\\p{L})${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "u");
        expect(entier.test(texte), `« ${phrase} » contient « ${mot} »`).toBe(false);
      }
    }
  });

  it("le contrôle des mots interdits voit un mot accentué et laisse passer un mot qui en contient un autre", () => {
    const voit = (mot: string, texte: string) => new RegExp(`(?<!\\p{L})${mot}(?!\\p{L})`, "u").test(texte);
    expect(voit("étranger", "sale étranger !")).toBe(true);
    expect(voit("con", "tu es content ?")).toBe(false);
    expect(voit("sang", "sangsue !")).toBe(false);
    expect(voit("bête", "va les embêter")).toBe(false);
  });

  it("gardent les trois exemples du pilote", () => {
    expect(AGACES).toContain("Arrête de me tripoter !");
    expect(AGACES).toContain("Laisse-moi respirer.");
    expect(EXCEDES).toContain("Tu me soûles !");
  });

  it("sont au tutoiement : jamais « vous »", () => {
    for (const phrase of TOUTES) expect(phrase.toLowerCase(), phrase).not.toMatch(/(?<!\p{L})(vous|votre|vos)(?!\p{L})/u);
  });
});

describe("les paliers", () => {
  it("premier, aimable deux fois, agacé trois fois, excédé quatre fois, puis furieux", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 40].map(palierDuToucher)).toEqual([
      "premier",
      "aimable",
      "aimable",
      "agace",
      "agace",
      "agace",
      "excede",
      "excede",
      "excede",
      "excede",
      "furieux",
      "furieux",
      "furieux",
    ]);
  });

  it("il sursaute quand il s'agace, jamais dans son lit", () => {
    expect(sursaute("premier", "place")).toBe(false);
    expect(sursaute("aimable", "taverne")).toBe(false);
    expect(sursaute("agace", "place")).toBe(true);
    expect(sursaute("furieux", "bataille")).toBe(true);
    expect(sursaute("furieux", "maisons")).toBe(false);
  });
});

describe("le compte d'un Gaulois", () => {
  it("part de un, puis avance", () => {
    const un = compterLeToucher(undefined, T0);
    expect(un).toEqual({ debut: T0, fois: 1, dites: [] });
    expect(compterLeToucher(un, T0 + 5_000)).toEqual({ debut: T0, fois: 2, dites: [] });
  });

  it("repart une heure après le premier toucher, pas après le dernier", () => {
    const compte = { debut: T0, fois: 12, dites: ["Ouste !"] };
    expect(compterLeToucher(compte, T0 + HEURE_MS - 1).fois).toBe(13);
    expect(compterLeToucher(compte, T0 + HEURE_MS)).toEqual({ debut: T0 + HEURE_MS, fois: 1, dites: ["Ouste !"] });
  });

  it("repart si l'horloge est revenue en arrière", () => {
    expect(compterLeToucher({ debut: T0, fois: 5, dites: [] }, T0 - 1_000).fois).toBe(1);
  });
});

describe("la liste où se tire la phrase", () => {
  const base = { fois: 1, lieu: "place" as const, moi: false, replique: null };

  it("la 1re fois : sa bulle du serveur, sinon un salut", () => {
    expect(listeDuToucher({ ...base, replique: "Le feu est bon ce soir." })).toEqual(["Le feu est bon ce soir."]);
    expect(listeDuToucher(base)).toBe(SALUTS);
  });

  it("les 2e et 3e fois : aimable, selon le lieu, même avec une bulle du serveur", () => {
    for (const lieu of ["place", "taverne", "reunion", "bataille"] as const) {
      expect(listeDuToucher({ ...base, fois: 2, lieu })).toBe(AIMABLES[lieu]);
      expect(listeDuToucher({ ...base, fois: 3, lieu, replique: "Bonjour." })).toBe(AIMABLES[lieu]);
    }
  });

  it("puis agacé, excédé, furieux, quel que soit le lieu", () => {
    for (const lieu of ["place", "taverne", "reunion", "bataille"] as const) {
      for (const fois of [4, 5, 6]) expect(listeDuToucher({ ...base, fois, lieu })).toBe(AGACES);
      for (const fois of [7, 8, 9, 10]) expect(listeDuToucher({ ...base, fois, lieu })).toBe(EXCEDES);
      for (const fois of [11, 25, 300]) expect(listeDuToucher({ ...base, fois, lieu })).toBe(FURIEUX);
    }
  });

  it("dans les maisons : il dort, bulle du serveur ou non, le sien ou non", () => {
    for (const moi of [false, true]) {
      for (const fois of [1, 2, 3]) expect(listeDuToucher({ fois, lieu: "maisons", moi, replique: "Bonjour." })).toBe(SOMMEIL);
      for (const fois of [4, 7, 11, 50]) expect(listeDuToucher({ fois, lieu: "maisons", moi, replique: null })).toBe(SOMMEIL_AGACE);
    }
  });

  it("le sien : ses phrases à lui, puis celles du palier avec les siennes en plus", () => {
    expect(listeDuToucher({ ...base, moi: true })).toBe(LE_SIEN);
    expect(listeDuToucher({ ...base, moi: true, replique: "Bonjour." })).toEqual(["Bonjour."]);
    expect(listeDuToucher({ ...base, moi: true, fois: 3, lieu: "taverne" })).toBe(LE_SIEN);
    expect(listeDuToucher({ ...base, moi: true, fois: 4 })).toEqual([...AGACES, ...LE_SIEN_AGACE]);
    expect(listeDuToucher({ ...base, moi: true, fois: 8 })).toEqual([...EXCEDES, ...LE_SIEN_AGACE]);
    expect(listeDuToucher({ ...base, moi: true, fois: 11 })).toEqual([...FURIEUX, ...LE_SIEN_AGACE]);
  });

  it("chaque lieu de l'écran a ses phrases", () => {
    for (const lieu of LIEUX) for (const fois of [1, 2, 4, 7, 11]) expect(listeDuToucher({ ...base, fois, lieu }).length, `${lieu} ${fois}`).toBeGreaterThan(0);
  });
});

describe("le tirage", () => {
  const base = { fois: 4, lieu: "place" as const, moi: false, replique: null };

  it("suit le hasard qu'on lui donne", () => {
    expect(phraseDuToucher(base, [], () => 0)).toBe(AGACES[0]);
    expect(phraseDuToucher(base, [], () => 0.999999)).toBe(AGACES[AGACES.length - 1]);
    expect(phraseDuToucher(base, [], () => 1)).toBe(AGACES[AGACES.length - 1]);
    expect(phraseDuToucher(base, [], hasardDe(3))).toBe(phraseDuToucher(base, [], hasardDe(3)));
  });

  it("évite ses dernières phrases", () => {
    expect(phraseDuToucher(base, [AGACES[0]!], () => 0)).toBe(AGACES[1]);
    expect(phraseDuToucher(base, [AGACES[1]!, AGACES[0]!], () => 0)).toBe(AGACES[2]);
  });

  it("sa bulle du serveur ne se dit pas deux fois de suite : un salut prend sa place", () => {
    const touche = { fois: 1, lieu: "place" as const, moi: false, replique: "Le feu est bon ce soir." };
    expect(phraseDuToucher(touche, [], () => 0)).toBe("Le feu est bon ce soir.");
    expect(phraseDuToucher(touche, ["Ouste !"], () => 0)).toBe("Le feu est bon ce soir.");
    expect(phraseDuToucher(touche, ["Le feu est bon ce soir."], () => 0)).toBe(SALUTS[0]);
    expect(phraseDuToucher({ ...touche, moi: true }, ["Le feu est bon ce soir."], () => 0)).toBe(LE_SIEN[0]);
  });

  it("jamais deux fois la même de suite, sur 400 touchers et plusieurs hasards", () => {
    for (const graine of [1, 2, 3, 4, 5]) {
      for (const lieu of LIEUX) {
        const { reponses } = insister(80, { nom: "Brennos", moi: graine % 2 === 0, replique: graine === 3 ? "Le feu est bon ce soir." : null }, lieu, graine);
        for (let i = 1; i < reponses.length; i++) expect(reponses[i]!.phrase, `${lieu} ${graine} ${i}`).not.toBe(reponses[i - 1]!.phrase);
        // Mieux : aucune des six dernières.
        for (let i = MEMOIRE_DES_PHRASES; i < reponses.length; i++) {
          const avant = reponses.slice(i - MEMOIRE_DES_PHRASES, i).map((r) => r.phrase);
          expect(avant, `${lieu} ${graine} ${i}`).not.toContain(reponses[i]!.phrase);
        }
      }
    }
  });
});

describe("un toucher", () => {
  it("la suite d'une heure : salut, aimable, agacé, excédé, furieux, sans jamais redevenir aimable", () => {
    const { reponses } = insister(40);
    expect(reponses.map((r) => r.fois)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(SALUTS).toContain(reponses[0]!.phrase);
    for (const i of [1, 2]) expect(AIMABLES.place).toContain(reponses[i]!.phrase);
    for (const i of [3, 4, 5]) expect(AGACES).toContain(reponses[i]!.phrase);
    for (const i of [6, 7, 8, 9]) expect(EXCEDES).toContain(reponses[i]!.phrase);
    for (let i = 10; i < 40; i++) {
      expect(FURIEUX).toContain(reponses[i]!.phrase);
      expect(reponses[i]!.palier).toBe("furieux");
    }
  });

  it("la bulle du serveur d'abord, quand il en a une", () => {
    const { reponses } = insister(2, { nom: "Brennos", moi: false, replique: "Le feu est bon ce soir." });
    expect(reponses[0]!.phrase).toBe("Le feu est bon ce soir.");
    expect(AIMABLES.place).toContain(reponses[1]!.phrase);
  });

  it("une heure après le premier toucher, il redevient aimable", () => {
    const { carnet } = insister(15);
    const avant = toucherLeGaulois(carnet, brennos, "place", T0 + HEURE_MS - 1, () => 0);
    expect(avant.palier).toBe("furieux");
    const apres = toucherLeGaulois(carnet, brennos, "place", T0 + HEURE_MS, () => 0);
    expect(apres.fois).toBe(1);
    expect(apres.palier).toBe("premier");
    expect(SALUTS).toContain(apres.phrase);
  });

  it("chaque Gaulois a son compte", () => {
    const { carnet } = insister(8);
    const autre = toucherLeGaulois(carnet, { nom: "Catumaros", moi: false, replique: null }, "taverne", T0 + 600_000, () => 0);
    expect(autre.fois).toBe(1);
    expect(autre.carnet.comptes[cleDuGaulois("Brennos")]!.fois).toBe(8);
    expect(toucherLeGaulois(autre.carnet, brennos, "place", T0 + 601_000, () => 0).fois).toBe(9);
  });

  it("ne modifie pas le carnet reçu, et note que le visiteur a touché", () => {
    const carnet = carnetVide();
    const reponse = toucherLeGaulois(carnet, brennos, "place", T0, () => 0);
    expect(carnet).toEqual({ vu: false, comptes: {} });
    expect(reponse.carnet.vu).toBe(true);
    expect(reponse.carnet.comptes[cleDuGaulois("Brennos")]).toEqual({ debut: T0, fois: 1, dites: [SALUTS[0]] });
  });

  it("garde six phrases au plus en mémoire", () => {
    const { carnet } = insister(30);
    expect(carnet.comptes[cleDuGaulois("Brennos")]!.dites).toHaveLength(MEMOIRE_DES_PHRASES);
  });

  it("un nom qui est une clé spéciale d'objet se compte comme un autre", () => {
    const { reponses, carnet } = insister(3, { nom: "__proto__", moi: false, replique: null });
    expect(reponses.map((r) => r.fois)).toEqual([1, 2, 3]);
    expect(lireCarnet(ecrireCarnet(carnet, T0), T0).comptes[cleDuGaulois("__proto__")]!.fois).toBe(3);
  });
});

describe("le carnet gardé dans le navigateur", () => {
  it("se relit comme il a été écrit", () => {
    const { carnet } = insister(5);
    expect(lireCarnet(ecrireCarnet(carnet, T0 + 300_000), T0 + 300_000)).toEqual(carnet);
  });

  it("absent, vide ou abîmé : un carnet vide, sans erreur", () => {
    for (const texte of [null, undefined, "", "pas du JSON", "null", "[]", "12", '"texte"', "{}", '{"comptes":[]}', '{"comptes":"x"}']) expect(lireCarnet(texte, T0)).toEqual(carnetVide());
  });

  it("laisse de côté un compte abîmé et garde les autres", () => {
    const texte = JSON.stringify({
      vu: true,
      comptes: {
        "g:Bon": { debut: T0, fois: 2, dites: ["Ouste !", 4, null] },
        "g:SansDebut": { fois: 2 },
        "g:FoisNulle": { debut: T0, fois: 0 },
        "g:FoisTexte": { debut: T0, fois: "3" },
        "g:Demi": { debut: T0, fois: 1.5 },
        "g:Nul": null,
        autre: { debut: T0, fois: 2 },
      },
    });
    expect(lireCarnet(texte, T0)).toEqual({ vu: true, comptes: { "g:Bon": { debut: T0, fois: 2, dites: ["Ouste !"] } } });
  });

  it("oublie un Gaulois touché il y a plus d'un jour, à la lecture comme à l'écriture", () => {
    const carnet: Carnet = { vu: true, comptes: { "g:Hier": { debut: T0 - CARNET_JOUR_MS, fois: 3, dites: [] }, "g:Ce matin": { debut: T0 - CARNET_JOUR_MS + 1, fois: 3, dites: [] } } };
    expect(Object.keys(lireCarnet(JSON.stringify(carnet), T0).comptes)).toEqual(["g:Ce matin"]);
    expect(Object.keys((JSON.parse(ecrireCarnet(carnet, T0)) as Carnet).comptes)).toEqual(["g:Ce matin"]);
  });

  it("ne grossit pas sans fin : les plus récents seulement", () => {
    const comptes: Carnet["comptes"] = {};
    for (let i = 0; i < CARNET_MAX + 50; i++) comptes[`g:N${i}`] = { debut: T0 - i * 1_000, fois: 1, dites: [] };
    const lu = lireCarnet(ecrireCarnet({ vu: true, comptes }, T0), T0);
    expect(Object.keys(lu.comptes)).toHaveLength(CARNET_MAX);
    expect(lu.comptes["g:N0"]).toBeDefined();
    expect(lu.comptes[`g:N${CARNET_MAX}`]).toBeUndefined();
  });
});

describe("la bulle", () => {
  it("reste de 4 à 9 secondes, plus longtemps pour une phrase longue", () => {
    expect(dureeDeLaBulle("Ouste !")).toBe(4_000);
    expect(dureeDeLaBulle("x".repeat(50))).toBe(6_000);
    expect(dureeDeLaBulle("x".repeat(90))).toBe(8_800);
    expect(dureeDeLaBulle("x".repeat(400))).toBe(9_000);
    // Une phrase longue reste plus longtemps qu'une bulle automatique (7 secondes).
    expect(dureeDeLaBulle("x".repeat(80))).toBeGreaterThan(7_000);
  });

  it("ne laisse pas un point d'exclamation seul à la ligne", () => {
    const insecable = String.fromCharCode(160);
    expect(ponctuer("Ouste !")).toBe(`Ouste${insecable}!`);
    expect(ponctuer("Encore ? Tu n'as rien d'autre à faire ?")).toBe(`Encore${insecable}? Tu n'as rien d'autre à faire${insecable}?`);
    expect(ponctuer("Laisse-moi respirer.")).toBe("Laisse-moi respirer.");
  });
});
