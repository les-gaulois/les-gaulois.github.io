import { describe, expect, it } from "vitest";
import { ROSTER_CELL_LABELS, ROSTER_CELL_WARN, openRequests, rosterCell } from "../../src/lib/compte/admin-members";
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

describe("les couleurs de la colonne", () => {
  it("met en jaune ce qui demande un coup d'œil de l'encadrement, et seulement cela", () => {
    expect([...ROSTER_CELL_WARN].sort()).toEqual(["left", "not_found", "request"]);
  });
});
