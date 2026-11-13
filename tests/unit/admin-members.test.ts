import { describe, expect, it } from "vitest";
import { ROLE_RANK, ROSTER_CELL_LABELS, ROSTER_CELL_WARN, allyStatus, canRedoRequest, notFoundHelp, openRequests, redoRequestDone, redoRequestQuestion, rosterCell } from "../../src/lib/compte/admin-members";
import { REQUESTS_LIMIT } from "../../src/lib/compte/requests";

type Member = Parameters<typeof rosterCell>[0];

const validated = (over: Partial<Member>): Member => ({ number: 3, status: "validated", linked: true, in_roster: true, openfront_username: "Flooo", ...over });
const waiting = (number: number): Member => ({ number, status: "pending", linked: false, in_roster: false, openfront_username: null });

describe("la colonne Liste d'un compte validé", () => {
  it("dit Oui quand son profil lié est dans la liste du jour, avec ou sans pseudo public", () => {
    expect(rosterCell(validated({}), null)).toBe("in");
    expect(rosterCell(validated({ openfront_username: null }), null)).toBe("in");
  });

  it("ne dit « Plus dans la liste » que s'il y figurait sous un pseudo le jour de sa demande", () => {
    expect(rosterCell(validated({ in_roster: false }), null)).toBe("left");
    expect(ROSTER_CELL_LABELS.left).toBe("Plus dans la liste");
  });

  it("dit seulement « Pas trouvé dans la liste » d'un compte validé hors de la liste : ni « plus », ni « absent », invérifiables", () => {
    expect(rosterCell(validated({ in_roster: false, openfront_username: null }), null)).toBe("not_found");
    expect(ROSTER_CELL_LABELS.not_found).toBe("Pas trouvé dans la liste");
    expect(ROSTER_CELL_LABELS.not_found).not.toMatch(/plus|absent/i);
  });

  it("ne dépend pas des demandes ouvertes", () => {
    const requests = openRequests([{ number: 3 }]);
    expect(rosterCell(validated({}), requests)).toBe("in");
    expect(rosterCell(validated({ in_roster: false, openfront_username: null }), requests)).toBe("not_found");
  });

  it("dit « Pas trouvé dans la liste » d'un compte validé sans aucun lien, comme après une restauration", () => {
    expect(rosterCell(validated({ linked: false, in_roster: false, openfront_username: null }), null)).toBe("not_found");
  });
});

describe("la colonne Liste d'un compte en attente", () => {
  it("dit qu'une demande attend l'encadrement", () => {
    expect(rosterCell(waiting(8), openRequests([{ number: 5 }, { number: 8 }]))).toBe("request");
    expect(ROSTER_CELL_LABELS.request).toBe("Demande à traiter");
  });

  it("dit qu'aucune demande n'est en cours quand la liste complète des demandes ne le contient pas", () => {
    expect(rosterCell(waiting(8), openRequests([]))).toBe("no_request");
    expect(rosterCell(waiting(8), openRequests([{ number: 5 }]))).toBe("no_request");
    expect(ROSTER_CELL_LABELS.no_request).toBe("Aucune demande en cours");
  });

  it("ne devine rien tant que les demandes ne sont pas lues, ou si la lecture a échoué", () => {
    expect(openRequests(null)).toBeNull();
    expect(rosterCell(waiting(8), null)).toBe("unknown");
    expect(ROSTER_CELL_LABELS.unknown).toBe("—");
  });

  it("ne dit pas « aucune demande » quand le serveur a coupé la liste des demandes", () => {
    const full = openRequests(Array.from({ length: REQUESTS_LIMIT }, (_, i) => ({ number: 100 + i })));
    expect(full?.complete).toBe(false);
    expect(rosterCell(waiting(8), full)).toBe("unknown");
    expect(rosterCell(waiting(100), full)).toBe("request");
    expect(openRequests(Array.from({ length: REQUESTS_LIMIT - 1 }, (_, i) => ({ number: 100 + i })))?.complete).toBe(true);
  });
});

describe("la colonne Liste d'un compte suspendu sans profil lié", () => {
  it("reste « — » : il ne peut pas faire de demande", () => {
    const suspended: Member = { number: 4, status: "suspended", linked: false, in_roster: false, openfront_username: null };
    expect(rosterCell(suspended, openRequests([{ number: 4 }]))).toBe("unknown");
    expect(rosterCell(suspended, openRequests([]))).toBe("unknown");
  });
});

describe("le bouton « Refaire la demande »", () => {
  const notFound = (over: Partial<Parameters<typeof canRedoRequest>[0]> = {}) => ({ ...validated({ in_roster: false, openfront_username: null }), role: "member" as const, ...over });

  it("suit les rangs du serveur", () => {
    expect(ROLE_RANK).toEqual({ member: 1, officer: 2, admin: 3, founder: 4 });
  });

  it("s'offre à un admin et au fondateur pour un compte validé que la liste ne trouve pas", () => {
    expect(canRedoRequest(notFound(), 3)).toBe(true);
    expect(canRedoRequest(notFound(), 4)).toBe(true);
    expect(canRedoRequest(notFound({ linked: false }), 3)).toBe(true);
    expect(canRedoRequest(notFound({ role: "officer" }), 3)).toBe(true);
  });

  it("ne s'offre ni à un officier ni à un membre : le serveur le leur refuse", () => {
    expect(canRedoRequest(notFound(), 2)).toBe(false);
    expect(canRedoRequest(notFound(), 1)).toBe(false);
  });

  it("ne touche pas à un rang égal ou supérieur : un admin, pour un admin ; le fondateur, jamais", () => {
    expect(canRedoRequest(notFound({ role: "admin" }), 3)).toBe(false);
    expect(canRedoRequest(notFound({ role: "admin" }), 4)).toBe(true);
    expect(canRedoRequest(notFound({ role: "founder" }), 4)).toBe(false);
  });

  it("ne s'offre que là où la liste ne trouve pas le compte", () => {
    expect(canRedoRequest(notFound({ in_roster: true }), 4)).toBe(false);
    expect(canRedoRequest(notFound({ openfront_username: "EssaiParti" }), 4)).toBe(false);
    expect(canRedoRequest(notFound({ status: "pending", linked: false }), 4)).toBe(false);
    expect(canRedoRequest(notFound({ status: "suspended" }), 4)).toBe(false);
  });

  it("dit avant d'agir ce qui change et ce que la personne devra faire, anonymes compris", () => {
    expect(redoRequestQuestion("Gaulois n° 9", "member")).toBe(
      "Remettre le compte Gaulois n° 9 en attente ?\n\nLe QG lui restera fermé jusqu'à sa nouvelle validation. La personne devra refaire sa demande dans « Mon compte », avec son pseudo OpenFront exact, ou son identifiant public si elle est anonyme dans la liste, puis un officier la validera.",
    );
  });

  it("prévient qu'un rôle de l'encadrement est retiré, comme le fait le serveur", () => {
    expect(redoRequestQuestion("Gaulois n° 12", "officer")).toContain(" Son rôle d'encadrement (Officier) lui sera retiré : il pourra lui être redonné après sa validation. ");
    expect(redoRequestQuestion("Gaulois n° 13", "admin")).toContain("(Admin) lui sera retiré");
    expect(redoRequestQuestion("Gaulois n° 9", "member")).not.toContain("retiré");
  });

  it("dit après coup qui prévenir sur Discord, et où arrivera la nouvelle demande", () => {
    expect(redoRequestDone("Gaulois n° 9", "essai_9")).toBe(
      "Le compte Gaulois n° 9 est remis en attente. Prévenez essai_9 sur Discord : sa demande est à refaire dans « Mon compte », avec son pseudo OpenFront exact, ou son identifiant public si elle est anonyme dans la liste. Sa nouvelle demande arrivera ensuite dans l'onglet Demandes.",
    );
    expect(redoRequestDone("Gaulois n° 9", null)).toContain("Prévenez la personne sur Discord");
  });

  it("explique la case sous le tableau, et ne parle du bouton que s'il est à l'écran", () => {
    expect(notFoundHelp(true)).toBe(
      "« Pas trouvé dans la liste » : un tel compte n'est relié à aucun membre de la liste officielle. « Refaire la demande » le remet en attente, pour que la personne indique son pseudo OpenFront exact, ou son identifiant public si elle est anonyme dans la liste.",
    );
    expect(notFoundHelp(false)).toContain("Un admin peut le remettre en attente, ou le fondateur s'il s'agit d'un admin");
    expect(notFoundHelp(false)).not.toContain("« Refaire la demande »");
  });

  it("n'écrit jamais « il » ou « elle » pour une personne sans nom de référence : « il » ne renvoie qu'au compte ou au rôle", () => {
    for (const text of [redoRequestQuestion("X", "officer"), redoRequestDone("X", "y"), notFoundHelp(true), notFoundHelp(false)]) {
      expect(text).not.toMatch(/\b(Il|il) (n'entrera|devra|doit)\b/);
    }
  });
});

describe("les couleurs de la colonne", () => {
  it("met en jaune ce qui demande un coup d'œil de l'encadrement, et seulement cela", () => {
    expect([...ROSTER_CELL_WARN].sort()).toEqual(["left", "not_found", "request"]);
  });
});

describe("un joueur allié dans la liste des comptes", () => {
  const ally = { number: 7, tag: "LUX", alias: "Kraken", approved: true, active: true };

  it("se distingue d'un nouveau Gaulois en attente", () => {
    expect(allyStatus(ally)).toBe("Allié · [LUX] Kraken");
    expect(allyStatus({ ...ally, approved: false, active: false })).toBe("Allié en attente de votre accord · [LUX] Kraken");
    expect(allyStatus({ ...ally, active: false })).toBe("Allié sans accès, son clan n'est plus dans notre alliance · [LUX] Kraken");
  });
});
