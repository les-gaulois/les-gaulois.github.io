import { describe, expect, it } from "vitest";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE } from "../../src/lib/village/contrat";
import {
  MESSAGES_BOURSE,
  RAISON_EN_VENTE,
  avecUnExemplaire,
  chancesDeLaPochette,
  estEnVente,
  etatDeLaBourse,
  instant,
  jour,
  lireAchat,
  lireBoutique,
  lirePochette,
  lireStateres,
  manque,
  messageDuRefus,
  nombre,
  objetPayant,
  objetsEnVente,
  objetsNonPossedes,
  points,
  pourcent,
  prixDeLObjet,
  quantitePossedee,
  raisonBoutiqueFermee,
  soldeAMontrer,
  stateres,
} from "../../src/lib/village/ecran-boutique";

const NBSP = String.fromCharCode(0xa0);
const FINE = String.fromCharCode(0x202f);

const boutique = (plus: Record<string, unknown> = {}) => ({
  ok: true,
  solde: 640,
  peut_acheter: true,
  prix: { ...PRIX_PAR_RARETE },
  pochette: { prix: PRIX_POCHETTE, chances: { ...CHANCES_POCHETTE } },
  inventaire: [{ emplacement: "tete", objet: "casque-or", quantite: 2, origine: "pochette", acquis_le: "2026-11-13T20:00:00Z" }],
  ...plus,
});

const bourse = (plus: Record<string, unknown> = {}) => ({
  ok: true,
  valide: true,
  lie: true,
  gaulois: true,
  depart: "2026-10-31T23:00:00Z",
  solde: 34,
  credits: [{ partie: "abc", debut: "2026-11-13T20:05:00Z", points: 1.67, gaulois: 3, stateres: 17, regle: "entier" }],
  releve: "2026-11-13T20:30:00Z",
  regle: "entier",
  ...plus,
});

describe("la lecture de la boutique", () => {
  it("lit une réponse complète", () => {
    const lue = lireBoutique(boutique());
    expect(lue?.solde).toBe(640);
    expect(lue?.prix.legendaire).toBe(2500);
    expect(lue?.pochette).toEqual({ prix: 200, chances: CHANCES_POCHETTE });
    expect(lue?.inventaire).toEqual([{ emplacement: "tete", objet: "casque-or", quantite: 2, origine: "pochette", acquis_le: "2026-11-13T20:00:00Z" }]);
  });

  it("refuse une réponse sans solde, sans prix ou sans chances, plutôt que d'écrire zéro", () => {
    expect(lireBoutique(null)).toBeNull();
    expect(lireBoutique({ ok: true })).toBeNull();
    expect(lireBoutique(boutique({ ok: false }))).toBeNull();
    expect(lireBoutique(boutique({ solde: "640" }))).toBeNull();
    expect(lireBoutique(boutique({ solde: -1 }))).toBeNull();
    expect(lireBoutique(boutique({ prix: { ...PRIX_PAR_RARETE, epique: undefined } }))).toBeNull();
    expect(lireBoutique(boutique({ prix: { ...PRIX_PAR_RARETE, commun: 0 } }))).toBeNull();
    expect(lireBoutique(boutique({ pochette: { prix: 200 } }))).toBeNull();
    expect(lireBoutique(boutique({ pochette: { prix: 0, chances: CHANCES_POCHETTE } }))).toBeNull();
    expect(lireBoutique(boutique({ pochette: { prix: 200, chances: { ...CHANCES_POCHETTE, commun: 120 } } }))).toBeNull();
  });

  it("ignore une ligne d'inventaire hors du catalogue, gratuite ou sans quantité", () => {
    const lue = lireBoutique(
      boutique({
        inventaire: [
          { emplacement: "tete", objet: "bonnet", quantite: 1 },
          { emplacement: "tete", objet: "inconnu", quantite: 1 },
          { emplacement: "peau", objet: "claire", quantite: 1 },
          { emplacement: "tete", objet: "couronne", quantite: 0 },
          { emplacement: "tete", objet: "toString", quantite: 1 },
          "n'importe quoi",
          { emplacement: "arme", objet: "hache", quantite: 1 },
        ],
      }),
    );
    expect(lue?.inventaire.map((l) => l.objet)).toEqual(["hache"]);
    expect(lue?.inventaire[0]?.origine).toBe("achat");
    expect(lireBoutique(boutique({ inventaire: undefined }))?.inventaire).toEqual([]);
  });

  it("ne tient un compte pour acheteur que si le serveur le dit", () => {
    expect(lireBoutique(boutique({ peut_acheter: "oui" }))?.peut_acheter).toBe(false);
  });
});

describe("la lecture de la bourse", () => {
  it("lit le solde, les crédits et la relecture", () => {
    const lue = lireStateres(bourse());
    expect(lue?.solde).toBe(34);
    expect(lue?.credits).toHaveLength(1);
    expect(lue?.releve).toBe("2026-11-13T20:30:00Z");
  });

  it("garde une relecture absente à null et ignore un crédit illisible", () => {
    const lue = lireStateres(bourse({ releve: null, depart: "pas une date", credits: [{ debut: "x", points: 1, stateres: 10 }, null, { debut: "2026-11-01T10:00:00Z", points: 2, stateres: 20 }] }));
    expect(lue?.releve).toBeNull();
    expect(lue?.depart).toBeNull();
    expect(lue?.credits.map((c) => c.stateres)).toEqual([20]);
    expect(lireStateres({ ok: true })).toBeNull();
    expect(lireStateres(undefined)).toBeNull();
  });
});

describe("la lecture d'un achat et d'une pochette", () => {
  it("lit l'achat d'un objet du catalogue", () => {
    expect(lireAchat({ ok: true, solde: 140, objet: { emplacement: "arme", objet: "hache" } })).toEqual({ ok: true, solde: 140, objet: { emplacement: "arme", objet: "hache" } });
    expect(lireAchat({ ok: true, solde: 140, objet: { emplacement: "arme", objet: "gourdin" } })).toBeNull();
    expect(lireAchat({ ok: true, objet: { emplacement: "arme", objet: "hache" } })).toBeNull();
  });

  it("montre la rareté du catalogue et le double dit par le serveur", () => {
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "tete", objet: "couronne", rarete: "commun", double: true } })?.objet).toEqual({ emplacement: "tete", objet: "couronne", rarete: "legendaire", double: true });
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "tete", objet: "couronne" } })?.objet.double).toBe(false);
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "tete", objet: "aucun" } })).toBeNull();
  });
});

describe("ce qu'on possède et ce qui manque", () => {
  const inventaire = lireBoutique(boutique())?.inventaire ?? [];

  it("compte les exemplaires", () => {
    expect(quantitePossedee(inventaire, "tete", "casque-or")).toBe(2);
    expect(quantitePossedee(inventaire, "tete", "couronne")).toBe(0);
  });

  it("ajoute un exemplaire après un achat ou une pochette", () => {
    const apres = avecUnExemplaire(inventaire, { emplacement: "tete", objet: "casque-or" }, "pochette", "2026-11-13T21:00:00Z");
    expect(quantitePossedee(apres, "tete", "casque-or")).toBe(3);
    const neuf = avecUnExemplaire(inventaire, { emplacement: "arme", objet: "hache" }, "achat", "2026-11-13T21:00:00Z");
    expect(quantitePossedee(neuf, "arme", "hache")).toBe(1);
    expect(inventaire).toHaveLength(1);
  });

  it("donne le prix d'après les prix reçus, jamais d'un chiffre de l'écran", () => {
    expect(prixDeLObjet({ ...PRIX_PAR_RARETE, legendaire: 3000 }, "tete", "couronne")).toBe(3000);
    expect(prixDeLObjet(PRIX_PAR_RARETE, "tete", "bonnet")).toBeNull();
    expect(prixDeLObjet(PRIX_PAR_RARETE, "tete", "aucun")).toBeNull();
    expect(prixDeLObjet(null, "tete", "couronne")).toBeNull();
    expect(objetPayant("tete", "constructor")).toBeNull();
  });

  it("dit ce qui manque pour payer", () => {
    expect(manque(640, 2500)).toBe(1860);
    expect(manque(640, 640)).toBe(0);
    expect(manque(640, 100)).toBe(0);
  });

  it("repère dans une tenue les objets qui ne sont ni gratuits ni possédés", () => {
    expect(objetsNonPossedes(TENUE_DE_DEPART, [])).toEqual([]);
    const tenue = { ...TENUE_DE_DEPART, tete: "casque-or", arme: "hache" };
    expect(objetsNonPossedes(tenue, inventaire)).toEqual([{ emplacement: "arme", objet: "hache" }]);
  });
});

describe("les mots de l'écran", () => {
  it("écrit les nombres à la française", () => {
    expect(nombre(2500)).toBe(`2${FINE}500`);
    expect(nombre(100)).toBe("100");
    expect(stateres(1)).toBe(`1${NBSP}statère`);
    expect(stateres(1860)).toBe(`1${FINE}860${NBSP}statères`);
    expect(points(1.67)).toBe("1,67");
    expect(pourcent(50)).toBe(`50${NBSP}%`);
    expect(pourcent(0.5)).toBe(`0,5${NBSP}%`);
  });

  it("écrit les dates à l'heure de Paris", () => {
    expect(jour("2026-10-31T23:00:00Z")).toBe("1er novembre");
    expect(instant("2026-11-13T20:05:00Z")).toBe(`13 novembre à 21${NBSP}h${NBSP}05`);
    expect(instant("2026-07-01T07:30:00Z")).toBe(`1er juillet à 9${NBSP}h${NBSP}30`);
  });

  it("range les chances de la plus courante à la plus rare, telles que reçues", () => {
    const chances = chancesDeLaPochette({ ...CHANCES_POCHETTE, legendaire: 2 });
    expect(chances.map((c) => c.nom)).toEqual(["Commun", "Peu commun", "Épique", "Mystique", "Légendaire"]);
    expect(chances.map((c) => c.rang)).toEqual([1, 2, 3, 4, 5]);
    expect(chances[4]?.chance).toBe(2);
  });

  it("a un message pour chaque refus de la boutique", () => {
    const codes = ["not_validated", "no_gaulois", "unknown_objet", "objet_gratuit", "deja_possede", "solde_insuffisant", "prix_change"];
    const messages = codes.map((code) => messageDuRefus(code));
    expect(new Set(messages).size).toBe(codes.length);
    for (const message of messages) expect(message).not.toBe("Une erreur inattendue est survenue.");
    expect(messageDuRefus("solde_insuffisant", { manque: 1860 })).toBe(`Il vous manque 1${FINE}860${NBSP}statères.`);
    expect(messageDuRefus("solde_insuffisant", { manque: null })).toBe("Vous n'avez pas assez de statères.");
    expect(messageDuRefus("rate_limited")).toContain("patientez");
    // Le prix a changé entre l'affichage et le clic : une phrase, la boutique est relue derrière.
    expect(messageDuRefus("prix_change")).toBe("Le prix vient de changer : regardez le nouveau avant d'acheter.");
    expect(raisonBoutiqueFermee(false)).toBe(messageDuRefus("no_gaulois"));
    expect(raisonBoutiqueFermee(true)).toBe(messageDuRefus("not_validated"));
  });

  it("ne dit jamais que les statères viennent des victoires", () => {
    for (const message of Object.values(MESSAGES_BOURSE)) expect(message ?? "").not.toMatch(/victoire|gagn/i);
  });
});

describe("l'état de la bourse", () => {
  const prete = { valide: true, lie: true, gaulois: true, releve: "2026-11-13T20:30:00Z", solde: 0 };

  it("dit d'abord ce que le membre peut faire lui-même", () => {
    expect(etatDeLaBourse({ ...prete, gaulois: false, valide: false, lie: false })).toBe("sans-gaulois");
    expect(etatDeLaBourse({ ...prete, valide: false, lie: false })).toBe("pas-valide");
    expect(etatDeLaBourse({ ...prete, lie: false })).toBe("pas-lie");
    expect(etatDeLaBourse({ ...prete, releve: null })).toBe("jamais-relu");
    expect(etatDeLaBourse(prete)).toBe("prete");
    expect(MESSAGES_BOURSE.prete).toBeNull();
  });

  it("n'écrit zéro que si les parties ont été relues pour un compte qui reçoit des statères", () => {
    expect(soldeAMontrer(prete)).toBe(0);
    expect(soldeAMontrer({ ...prete, releve: null })).toBeNull();
    expect(soldeAMontrer({ ...prete, valide: false })).toBeNull();
    expect(soldeAMontrer({ ...prete, lie: false })).toBeNull();
    expect(soldeAMontrer({ ...prete, gaulois: false })).toBeNull();
    expect(soldeAMontrer({ ...prete, valide: false, solde: 120 })).toBe(120);
  });
});

describe("les objets que le membre a en vente", () => {
  const offre = (emplacement: string, objet: string, aMoi: boolean) => ({ id: 1, emplacement, objet, prix: 10, vendeur: "Vendeur", a_moi: aMoi, expire_le: "2026-11-27T12:00:00.000Z" });

  it("se lisent dans le marché : ses offres seulement, des objets payants du catalogue, chacun une fois", () => {
    const marche = { ok: true, solde: 0, offres_max: 5, offres: [offre("tete", "bandeau", true), offre("arme", "hache", false), offre("tete", "bandeau", true), offre("tete", "bonnet", true), offre("tete", "inconnu", true), null] };
    expect(objetsEnVente(marche)).toEqual([{ emplacement: "tete", objet: "bandeau" }]);
  });

  it("ne donnent rien d'une réponse illisible : l'écran ne devine pas", () => {
    expect(objetsEnVente(null)).toEqual([]);
    expect(objetsEnVente({ ok: false, error: "not_validated" })).toEqual([]);
    expect(objetsEnVente({ ok: true, offres: "non" })).toEqual([]);
  });

  it("ne s'achètent pas à la boutique, et l'essayage dit pourquoi", () => {
    const enVente = [{ emplacement: "tete" as const, objet: "bandeau" }];
    expect(estEnVente(enVente, "tete", "bandeau")).toBe(true);
    expect(estEnVente(enVente, "tete", "beret")).toBe(false);
    expect(estEnVente([], "tete", "bandeau")).toBe(false);
    expect(RAISON_EN_VENTE).toContain("marché");
  });
});
