import { describe, expect, it } from "vitest";
import type { DiscordCalls, LastSend, SendOutcome } from "../../src/lib/compte/discord-appels";
import { etatDesAppels, etatDuPing, etatDuSalon, etatDuSalonAjoute, etatDuVocal, etatsDesImages, tonLePlusGrave } from "../../src/lib/compte/discord-etat";
import type { SavedImage } from "../../src/lib/compte/discord-images";
import type { MessageSalon } from "../../src/lib/compte/discord-message";
import type { RobotCheck, RobotSalon } from "../../src/lib/compte/discord-salons";

const AT = "2026-11-14T10:00:00.000Z";
const last = (outcome: SendOutcome): LastSend => ({ kind: "test", at: AT, outcome });
const check = (source: RobotCheck["source"], status: number | null): RobotCheck => ({ at: AT, source, status, name: null });
const salon = (change: Partial<RobotSalon>): RobotSalon => ({ id: "nouvelles", set: false, updatedAt: null, updatedBy: null, last: null, check: null, ...change });
const calls = (change: Partial<DiscordCalls>): DiscordCalls => ({ set: true, role: null, updatedAt: null, updatedBy: null, last: null, ...change });

describe("l'état d'un salon du robot", () => {
  it("est « Pas réglé » sans lien ici ni contrôle du secret", () => {
    expect(etatDuSalon(salon({}))).toEqual({ ton: "warn", mot: "Pas réglé" });
    expect(etatDuSalon(salon({ check: check("none", null) }))).toEqual({ ton: "warn", mot: "Pas réglé" });
  });

  it("dit que le robot poste par le secret GitHub quand son contrôle répond", () => {
    expect(etatDuSalon(salon({ check: check("secret", 200) }))).toEqual({ ton: "ally", mot: "Par le secret GitHub" });
    expect(etatDuSalon(salon({ check: check("secret", 404) }))).toEqual({ ton: "danger", mot: "Secret GitHub refusé" });
    expect(etatDuSalon(salon({ check: check("secret", 0) })).ton).toBe("warn");
  });

  it("est « Branché » avec un lien, sauf si Discord le refuse ou refuse le dernier essai", () => {
    expect(etatDuSalon(salon({ set: true }))).toEqual({ ton: "ok", mot: "Branché" });
    expect(etatDuSalon(salon({ set: true, last: last({ state: "accepted" }), check: check("direction", 200) })).ton).toBe("ok");
    expect(etatDuSalon(salon({ set: true, check: check("direction", 404) }))).toEqual({ ton: "danger", mot: "Lien refusé" });
    expect(etatDuSalon(salon({ set: true, last: last({ state: "refused", status: 400 }) }))).toEqual({ ton: "danger", mot: "Dernier envoi refusé" });
    expect(etatDuSalon(salon({ set: true, last: last({ state: "waiting" }) })).ton).toBe("ally");
    expect(etatDuSalon(salon({ set: true, last: last({ state: "silent" }) })).ton).toBe("warn");
  });

  it("ne tient pas compte d'un ancien contrôle du secret une fois le lien réglé ici", () => {
    expect(etatDuSalon(salon({ set: true, check: check("secret", 404) })).ton).toBe("ok");
  });
});

describe("l'état des appels, du vocal et des images", () => {
  it("suit le dernier envoi des appels", () => {
    expect(etatDesAppels(calls({ set: false }))).toEqual({ ton: "warn", mot: "Pas réglé" });
    expect(etatDesAppels(calls({}))).toEqual({ ton: "ok", mot: "Branché" });
    expect(etatDesAppels(calls({ last: last({ state: "unsent", detail: null }) })).ton).toBe("danger");
  });

  it("ne parle du ping que si un salon est branché", () => {
    expect(etatDuPing(calls({ set: false }))).toBeNull();
    expect(etatDuPing(calls({}))?.mot).toBe("Sans ping");
    expect(etatDuPing(calls({ role: "123456789012345678" }))?.mot).toBe("Ping possible");
  });

  it("dit si le vocal est réglé", () => {
    expect(etatDuVocal(null).ton).toBe("warn");
    expect(etatDuVocal("https://discord.com/channels/123456789012345678/223456789012345678").ton).toBe("ok");
  });

  it("compte les images et celles dont le fichier manque, sans rien dire d'un inventaire vide", () => {
    const image = (id: number, missing: boolean): SavedImage => ({ id, name: `Image ${id}`, path: "", url: "", size: null, missing, savedAt: null, savedBy: null });
    expect(etatsDesImages([])).toEqual([]);
    expect(etatsDesImages([image(1, false)])).toEqual([{ ton: "muted", mot: "1 image" }]);
    expect(etatsDesImages([image(1, false), image(2, true), image(3, true)])).toEqual([
      { ton: "muted", mot: "3 images" },
      { ton: "warn", mot: "2 fichiers manquants" },
    ]);
  });
});

describe("l'état d'un salon ajouté pour les messages", () => {
  const added = (change: Partial<MessageSalon>): MessageSalon => ({ key: "message:1", kind: "message", robot: null, id: 1, name: "Annonces", webhookName: null, checkStatus: null, checking: false, createdAt: null, createdBy: null, ...change });
  it("lit la réponse de Discord à la vérification du lien", () => {
    expect(etatDuSalonAjoute(added({})).ton).toBe("muted");
    expect(etatDuSalonAjoute(added({ checking: true })).ton).toBe("ally");
    expect(etatDuSalonAjoute(added({ checkStatus: 200 })).ton).toBe("ok");
    expect(etatDuSalonAjoute(added({ checkStatus: 0 })).ton).toBe("warn");
    expect(etatDuSalonAjoute(added({ checkStatus: 404 })).ton).toBe("danger");
  });
});

describe("le trait d'un ensemble d'états", () => {
  it("prend le plus grave", () => {
    expect(tonLePlusGrave([])).toBe("muted");
    expect(tonLePlusGrave([{ ton: "ok", mot: "" }, { ton: "ally", mot: "" }])).toBe("ally");
    expect(tonLePlusGrave([{ ton: "ok", mot: "" }, { ton: "warn", mot: "" }, { ton: "danger", mot: "" }])).toBe("danger");
  });
});
