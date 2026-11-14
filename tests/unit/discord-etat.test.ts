import { describe, expect, it } from "vitest";
import type { DiscordCalls, LastSend, SendOutcome } from "../../src/lib/compte/discord-appels";
import {
  clicSurBoutonArme,
  desarmerALaPerte,
  ETAT_NON_LU,
  etatDesAppels,
  etatDuMessage,
  etatDuPing,
  etatDuSalon,
  etatDuSalonAjoute,
  etatDuVocal,
  etatsDesImages,
  etatsDuMenuAppels,
  etatsDuMenuImages,
  etatsDuMenuSalons,
  etatsDuMenuVocal,
  tonLePlusGrave,
  TONS_DU_PLUS_GRAVE,
  traitDuMenu,
  type Etat,
  type EtatTon,
} from "../../src/lib/compte/discord-etat";
import type { SavedImage } from "../../src/lib/compte/discord-images";
import type { MessageSalon, RemoveOutcome, SentMessage, SentOutcome } from "../../src/lib/compte/discord-message";
import { parseDiscordSalons, type RobotCheck, type RobotSalon } from "../../src/lib/compte/discord-salons";

/** Trois moments, du plus ancien au plus récent. */
const AVANT = "2026-11-14T08:00:00.000Z";
const AT = "2026-11-14T10:00:00.000Z";
const APRES = "2026-11-14T12:00:00.000Z";

const last = (outcome: SendOutcome, at = AT): LastSend => ({ kind: "test", at, outcome });
const check = (source: RobotCheck["source"], status: number | null, at = AT): RobotCheck => ({ at, source, status, name: null });
const salon = (change: Partial<RobotSalon>): RobotSalon => ({ id: "nouvelles", set: false, updatedAt: null, updatedBy: null, last: null, check: null, ...change });
const calls = (change: Partial<DiscordCalls>): DiscordCalls => ({ set: true, role: null, updatedAt: null, updatedBy: null, last: null, ...change });
const image = (id: number, missing = false): SavedImage => ({ id, name: `Image ${id}`, path: "", url: "", size: null, missing, savedAt: null, savedBy: null });

const BRANCHE: Etat = { ton: "ok", mot: "Branché" };
const PAS_REGLE: Etat = { ton: "warn", mot: "Pas réglé" };
const SANS_REPONSE: Etat = { ton: "warn", mot: "Discord sans réponse" };
const EN_ERREUR: Etat = { ton: "warn", mot: "Discord en erreur" };
const LIEN_REFUSE: Etat = { ton: "danger", mot: "Lien refusé" };
const ESSAI_EN_COURS: Etat = { ton: "ally", mot: "Essai en cours" };
const DERNIER_REFUSE: Etat = { ton: "danger", mot: "Dernier envoi refusé" };
const DERNIER_NON_PARTI: Etat = { ton: "danger", mot: "Dernier envoi non parti" };

describe("un salon du robot qui n'est pas branché ici", () => {
  it("est « Pas réglé » sans contrôle du secret GitHub", () => {
    expect(etatDuSalon(salon({}))).toEqual(PAS_REGLE);
    expect(etatDuSalon(salon({ check: check("none", null) }))).toEqual(PAS_REGLE);
    // Un contrôle d'un lien réglé ici, resté après le débranchement : il ne parle plus de rien.
    expect(etatDuSalon(salon({ check: check("direction", 200) }))).toEqual(PAS_REGLE);
    expect(etatDuSalon(salon({ id: "alliance", check: check("none", null) }))).toEqual(PAS_REGLE);
  });

  it("dit que le robot poste par le secret GitHub quand son contrôle réussit", () => {
    expect(etatDuSalon(salon({ check: check("secret", 200) }))).toEqual({ ton: "ally", mot: "Par le secret GitHub" });
    expect(etatDuSalon(salon({ check: check("secret", 204) }))).toEqual({ ton: "ally", mot: "Par le secret GitHub" });
  });

  it("dit que le secret est refusé quand Discord ne connaît pas son lien, ou qu'il n'a pas la forme d'un webhook", () => {
    for (const status of [400, 401, 403, 404, null]) expect(etatDuSalon(salon({ check: check("secret", status) }))).toEqual({ ton: "danger", mot: "Secret GitHub refusé" });
  });

  it("distingue un contrôle sans réponse (statut 0) d'une autre erreur de Discord", () => {
    expect(etatDuSalon(salon({ check: check("secret", 0) }))).toEqual(SANS_REPONSE);
    expect(etatDuSalon(salon({ check: check("secret", 429) }))).toEqual(EN_ERREUR);
    expect(etatDuSalon(salon({ check: check("secret", 503) }))).toEqual(EN_ERREUR);
  });
});

describe("un salon du robot branché ici", () => {
  it("est « Branché » sans rien qui dise le contraire", () => {
    expect(etatDuSalon(salon({ set: true }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "forgotten" }) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, AVANT), check: check("direction", 200, APRES) }))).toEqual(BRANCHE);
  });

  it("dit « Lien refusé » quand le contrôle du robot, plus récent que l'essai, est refusé", () => {
    expect(etatDuSalon(salon({ set: true, check: check("direction", 404) }))).toEqual(LIEN_REFUSE);
    expect(etatDuSalon(salon({ set: true, check: check("direction", 403) }))).toEqual(LIEN_REFUSE);
    expect(etatDuSalon(salon({ set: true, check: check("direction", null) }))).toEqual(LIEN_REFUSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, AVANT), check: check("direction", 404, APRES) }))).toEqual(LIEN_REFUSE);
  });

  it("suit un essai envoyé après le contrôle du robot, sauf si sa réponse n'est plus gardée", () => {
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, APRES), check: check("direction", 404, AVANT) }))).toEqual(BRANCHE);
    // À la même heure, l'essai l'emporte.
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, AT), check: check("direction", 404, AT) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "waiting" }, APRES), check: check("direction", 404, AVANT) }))).toEqual(ESSAI_EN_COURS);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "forgotten" }, APRES), check: check("direction", 404, AVANT) }))).toEqual(LIEN_REFUSE);
  });

  it("met à regarder un contrôle sans réponse ou en erreur, s'il est le plus récent", () => {
    expect(etatDuSalon(salon({ set: true, check: check("direction", 0) }))).toEqual(SANS_REPONSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, AVANT), check: check("direction", 0, APRES) }))).toEqual(SANS_REPONSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }, APRES), check: check("direction", 0, AVANT) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, check: check("direction", 502) }))).toEqual(EN_ERREUR);
  });

  it("ne tient pas compte d'un ancien contrôle du secret ou d'un contrôle sans lien, une fois le lien réglé ici", () => {
    expect(etatDuSalon(salon({ set: true, check: check("secret", 404, APRES) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, check: check("secret", 0, APRES) }))).toEqual(BRANCHE);
    expect(etatDuSalon(salon({ set: true, check: check("none", null, APRES) }))).toEqual(BRANCHE);
  });

  it("dit l'essai en cours, puis un essai refusé, non parti ou sans réponse", () => {
    expect(etatDuSalon(salon({ set: true, last: last({ state: "waiting" }) }))).toEqual(ESSAI_EN_COURS);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "refused", status: 400 }) }))).toEqual(DERNIER_REFUSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "unsent", detail: null }) }))).toEqual(DERNIER_NON_PARTI);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "timeout" }) }))).toEqual(SANS_REPONSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "silent" }) }))).toEqual(SANS_REPONSE);
  });

  it("garde un essai refusé même si le contrôle du robot, qui ne poste rien, réussit après lui", () => {
    expect(etatDuSalon(salon({ set: true, last: last({ state: "refused", status: 400 }, AVANT), check: check("direction", 200, APRES) }))).toEqual(DERNIER_REFUSE);
  });

  it("prend le plus grave de l'essai et du contrôle", () => {
    expect(etatDuSalon(salon({ set: true, last: last({ state: "silent" }, AVANT), check: check("direction", 404, APRES) }))).toEqual(LIEN_REFUSE);
    expect(etatDuSalon(salon({ set: true, last: last({ state: "refused", status: 400 }, AVANT), check: check("direction", 0, APRES) }))).toEqual(DERNIER_REFUSE);
  });

  it("lit l'âge d'un essai à l'heure du serveur, depuis sa réponse", () => {
    const now = Date.parse(AT);
    const raw = (secondesAvant: number) => ({
      now: AT,
      salons: [{ salon: "nouvelles", set: true, updated_at: AVANT, last: { kind: "test", at: new Date(now - secondesAvant * 1000).toISOString(), answered: false }, check: null }, ...["encadrement"].map((s) => ({ salon: s, set: false }))],
    });
    const premier = (secondes: number) => etatDuSalon(parseDiscordSalons(raw(secondes))![0]!);
    expect(premier(10)).toEqual(ESSAI_EN_COURS);
    expect(premier(2 * 3600)).toEqual(SANS_REPONSE);
    expect(premier(7 * 3600)).toEqual(BRANCHE);
  });
});

describe("l'état des appels, du ping et du vocal", () => {
  it("suit le dernier envoi des appels, appel ou essai", () => {
    expect(etatDesAppels(calls({ set: false }))).toEqual(PAS_REGLE);
    expect(etatDesAppels(calls({}))).toEqual(BRANCHE);
    expect(etatDesAppels(calls({ last: { kind: "call", at: AT, outcome: { state: "accepted" } } }))).toEqual(BRANCHE);
    expect(etatDesAppels(calls({ last: last({ state: "forgotten" }) }))).toEqual(BRANCHE);
    expect(etatDesAppels(calls({ last: last({ state: "waiting" }) }))).toEqual(ESSAI_EN_COURS);
    expect(etatDesAppels(calls({ last: last({ state: "refused", status: 404 }) }))).toEqual(DERNIER_REFUSE);
    expect(etatDesAppels(calls({ last: { kind: "call", at: AT, outcome: { state: "unsent", detail: "pg_net" } } }))).toEqual(DERNIER_NON_PARTI);
    expect(etatDesAppels(calls({ last: last({ state: "timeout" }) }))).toEqual(SANS_REPONSE);
    expect(etatDesAppels(calls({ last: last({ state: "silent" }) }))).toEqual(SANS_REPONSE);
  });

  it("ne parle du ping que si un salon est branché", () => {
    expect(etatDuPing(calls({ set: false }))).toBeNull();
    expect(etatDuPing(calls({}))).toEqual({ ton: "muted", mot: "Sans ping" });
    expect(etatDuPing(calls({ role: "123456789012345678" }))).toEqual({ ton: "ally", mot: "Ping possible" });
  });

  it("dit si le vocal est réglé", () => {
    expect(etatDuVocal(null)).toEqual(PAS_REGLE);
    expect(etatDuVocal("https://discord.com/channels/123456789012345678/223456789012345678")).toEqual({ ton: "ok", mot: "Réglé" });
  });
});

describe("l'inventaire d'images", () => {
  it("compte les images et celles dont le fichier manque, au singulier et au pluriel, sans rien dire d'un inventaire vide", () => {
    expect(etatsDesImages([])).toEqual([]);
    expect(etatsDesImages([image(1)])).toEqual([{ ton: "muted", mot: "1 image" }]);
    expect(etatsDesImages([image(1, true)])).toEqual([
      { ton: "muted", mot: "1 image" },
      { ton: "warn", mot: "1 fichier manquant" },
    ]);
    expect(etatsDesImages([image(1), image(2, true), image(3, true)])).toEqual([
      { ton: "muted", mot: "3 images" },
      { ton: "warn", mot: "2 fichiers manquants" },
    ]);
    expect(etatsDesImages(Array.from({ length: 200 }, (_, i) => image(i + 1)))).toEqual([{ ton: "muted", mot: "200 images" }]);
  });
});

describe("un salon ajouté pour les messages", () => {
  const added = (change: Partial<MessageSalon>): MessageSalon => ({ key: "message:1", kind: "message", robot: null, id: 1, name: "Annonces", webhookName: null, checkStatus: null, checking: false, createdAt: null, createdBy: null, ...change });

  it("lit la réponse de Discord à la vérification du lien", () => {
    expect(etatDuSalonAjoute(added({}))).toEqual({ ton: "muted", mot: "Pas vérifié" });
    expect(etatDuSalonAjoute(added({ checking: true }))).toEqual({ ton: "ally", mot: "Vérification" });
    expect(etatDuSalonAjoute(added({ checkStatus: 200 }))).toEqual({ ton: "ok", mot: "Lien vérifié" });
    expect(etatDuSalonAjoute(added({ checkStatus: 0 }))).toEqual(SANS_REPONSE);
    for (const status of [400, 401, 403, 404]) expect(etatDuSalonAjoute(added({ checkStatus: status }))).toEqual(LIEN_REFUSE);
    expect(etatDuSalonAjoute(added({ checkStatus: 429 }))).toEqual(EN_ERREUR);
    expect(etatDuSalonAjoute(added({ checkStatus: 500 }))).toEqual(EN_ERREUR);
  });
});

describe("un message envoyé", () => {
  const sent = (outcome: SentOutcome, remove: RemoveOutcome = { state: "none" }): SentMessage => ({
    id: 1,
    salon: "message:1",
    salonName: null,
    at: AT,
    by: null,
    message: {},
    outcome,
    removable: false,
    blocked: null,
    removedAt: remove.state === "none" ? null : AT,
    removedBy: null,
    remove,
  });

  it("dit ce que Discord a répondu à l'envoi", () => {
    expect(etatDuMessage(sent({ state: "accepted" }))).toEqual({ ton: "ok", mot: "Accepté" });
    expect(etatDuMessage(sent({ state: "refused", status: 400, detail: null }))).toEqual({ ton: "danger", mot: "Refusé" });
    expect(etatDuMessage(sent({ state: "unsent", detail: null }))).toEqual({ ton: "danger", mot: "Non parti" });
    expect(etatDuMessage(sent({ state: "unreached", detail: null }))).toEqual({ ton: "danger", mot: "Non parti" });
    expect(etatDuMessage(sent({ state: "timeout" }))).toEqual({ ton: "warn", mot: "Sans réponse" });
    expect(etatDuMessage(sent({ state: "silent" }))).toEqual({ ton: "warn", mot: "Sans réponse" });
    expect(etatDuMessage(sent({ state: "waiting" }))).toEqual({ ton: "ally", mot: "En attente" });
    expect(etatDuMessage(sent({ state: "forgotten" }))).toEqual({ ton: "muted", mot: "Envoyé" });
  });

  it("dit « Retiré » une fois le retrait accepté par Discord, et seulement alors", () => {
    expect(etatDuMessage(sent({ state: "accepted" }, { state: "done" }))).toEqual({ ton: "muted", mot: "Retiré" });
    expect(etatDuMessage(sent({ state: "accepted" }, { state: "waiting" }))).toEqual({ ton: "ok", mot: "Accepté" });
    expect(etatDuMessage(sent({ state: "accepted" }, { state: "refused", status: 404 }))).toEqual({ ton: "ok", mot: "Accepté" });
    expect(etatDuMessage(sent({ state: "accepted" }, { state: "silent" }))).toEqual({ ton: "ok", mot: "Accepté" });
  });
});

describe("l'ordre des couleurs", () => {
  it("va du rouge au gris : rouge, jaune, bleu, vert, gris", () => {
    expect(TONS_DU_PLUS_GRAVE).toEqual(["danger", "warn", "ally", "ok", "muted"]);
  });

  it("prend toujours la plus grave, dans n'importe quel ordre", () => {
    const etat = (ton: EtatTon): Etat => ({ ton, mot: ton });
    for (const [i, grave] of TONS_DU_PLUS_GRAVE.entries()) {
      for (const moins of TONS_DU_PLUS_GRAVE.slice(i + 1)) {
        expect(tonLePlusGrave([etat(grave), etat(moins)])).toBe(grave);
        expect(tonLePlusGrave([etat(moins), etat(grave)])).toBe(grave);
      }
      expect(tonLePlusGrave([etat(grave)])).toBe(grave);
    }
    expect(tonLePlusGrave([etat("ok"), etat("muted"), etat("ally"), etat("warn"), etat("danger")])).toBe("danger");
  });

  it("est gris sans aucun état", () => {
    expect(tonLePlusGrave([])).toBe("muted");
  });
});

describe("les lignes du menu de l'onglet", () => {
  it("ne montrent rien tant que la lecture n'est pas faite, et « État non lu » en gris si elle a échoué", () => {
    expect(etatsDuMenuSalons(undefined)).toEqual([]);
    expect(etatsDuMenuAppels(undefined)).toEqual([]);
    expect(etatsDuMenuVocal(undefined)).toEqual([]);
    expect(etatsDuMenuImages(null, null)).toEqual([]);
    for (const etats of [etatsDuMenuSalons(null), etatsDuMenuAppels(null), etatsDuMenuVocal(null), etatsDuMenuImages(null, "Panne")]) {
      expect(etats).toEqual([ETAT_NON_LU]);
      expect(traitDuMenu(etats)).toBe("muted");
    }
    expect(ETAT_NON_LU).toEqual({ ton: "muted", mot: "État non lu" });
  });

  it("nomment chaque salon du robot devant son état, et prennent le trait du plus grave", () => {
    const etats = etatsDuMenuSalons([
      salon({ id: "nouvelles", set: true }),
      salon({ id: "encadrement", set: true, check: check("direction", 404) }),
      salon({ id: "victoires", check: check("secret", 200) }),
      salon({ id: "alliance" }),
    ]);
    expect(etats).toEqual([
      { ...BRANCHE, nom: "Nouvelles" },
      { ...LIEN_REFUSE, nom: "Encadrement" },
      { ton: "ally", mot: "Par le secret GitHub", nom: "Victoires" },
      { ...PAS_REGLE, nom: "Alliance" },
    ]);
    expect(traitDuMenu(etats)).toBe("danger");
    expect(etatsDuMenuSalons([])).toEqual([]);
  });

  it("donnent le ping des appels en point seul, qui ne colore pas la ligne", () => {
    expect(etatsDuMenuAppels(calls({ set: false }))).toEqual([PAS_REGLE]);
    const etats = etatsDuMenuAppels(calls({ role: "123456789012345678" }));
    expect(etats).toEqual([BRANCHE, { ton: "ally", mot: "Ping possible", plain: true }]);
    expect(traitDuMenu(etats)).toBe("ok");
    expect(traitDuMenu(etatsDuMenuAppels(calls({})))).toBe("ok");
  });

  it("disent si le vocal est réglé, d'après la lecture de sa rubrique", () => {
    expect(etatsDuMenuVocal(false)).toEqual([PAS_REGLE]);
    expect(etatsDuMenuVocal("https://discord.com/channels/123456789012345678/223456789012345678")).toEqual([{ ton: "ok", mot: "Réglé" }]);
  });

  it("donnent le nombre d'images en point seul : seul un fichier manquant colore la ligne", () => {
    expect(etatsDuMenuImages([], null)).toEqual([]);
    expect(traitDuMenu(etatsDuMenuImages([], null))).toBeUndefined();
    const plein = etatsDuMenuImages([image(1), image(2)], null);
    expect(plein).toEqual([{ ton: "muted", mot: "2 images", plain: true }]);
    expect(traitDuMenu(plein)).toBeUndefined();
    const manquant = etatsDuMenuImages([image(1), image(2, true)], null);
    expect(manquant).toEqual([
      { ton: "muted", mot: "2 images", plain: true },
      { ton: "warn", mot: "1 fichier manquant" },
    ]);
    expect(traitDuMenu(manquant)).toBe("warn");
    // Une relecture ratée après une lecture réussie : l'inventaire déjà lu reste montré.
    expect(etatsDuMenuImages([image(1)], "Panne")).toEqual([{ ton: "muted", mot: "1 image", plain: true }]);
  });

  it("n'ont pas de trait sans état, ni avec des points seuls, même d'une couleur plus grave", () => {
    expect(traitDuMenu([])).toBeUndefined();
    expect(traitDuMenu([{ ton: "danger", mot: "x", plain: true }])).toBeUndefined();
    expect(traitDuMenu([{ ton: "ok", mot: "x" }, { ton: "danger", mot: "y", plain: true }])).toBe("ok");
  });
});

describe("un bouton qui efface au second clic", () => {
  it("s'arme au premier clic, et confirme au clic suivant, à la souris comme au clavier", () => {
    expect(clicSurBoutonArme(false, 1)).toBe("armer");
    expect(clicSurBoutonArme(false, 0)).toBe("armer");
    expect(clicSurBoutonArme(true, 1)).toBe("confirmer");
    expect(clicSurBoutonArme(true, 0)).toBe("confirmer");
  });

  it("ne confirme pas avec le second clic d'un double clic", () => {
    expect(clicSurBoutonArme(false, 2)).toBe("armer");
    expect(clicSurBoutonArme(true, 2)).toBe("rien");
    expect(clicSurBoutonArme(true, 3)).toBe("rien");
  });

  it("se désarme quand le focus va ailleurs dans la page, pas sur une perte sans destination", () => {
    expect(desarmerALaPerte(null)).toBe(false);
    expect(desarmerALaPerte(new EventTarget())).toBe(true);
  });
});
