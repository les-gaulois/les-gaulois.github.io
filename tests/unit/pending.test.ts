import { describe, expect, it } from "vitest";
import { pendingWords } from "../../src/lib/compte/pending";

describe("la pastille des demandes", () => {
  it("complète le nombre pour les lecteurs d'écran, accordé", () => {
    expect(pendingWords(1)).toBe("demande à traiter");
    expect(pendingWords(3)).toBe("demandes à traiter");
  });

  it("disparaît sans demande, ou quand le serveur n'a pas répondu", () => {
    expect(pendingWords(0)).toBeNull();
    expect(pendingWords(null)).toBeNull();
  });
});
