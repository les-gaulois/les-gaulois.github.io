import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_KEY, mayHaveSession, signOut, supabase } from "../../src/lib/compte/api";
import type { Me } from "../../src/lib/compte/types";
import { PLAYER_VIEW_KEY, canUsePlayerView, isPlayerViewOn, keepsPlayerView, onPlayerViewChange, readPlayerView, setPlayerView, takeOpenedHere, viewedAccount } from "../../src/lib/compte/vue-joueur";

// La connexion passe par Supabase : un faux client suffit, aucun réseau. On garde ses écoutes pour leur envoyer des événements.
const auth = vi.hoisted(() => ({ listeners: [] as ((event: string) => void)[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: (listener: (event: string) => void) => {
        auth.listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

const refused = () => {
  throw new Error("stockage refusé");
};
const brokenStorage = { getItem: refused, setItem: refused, removeItem: refused };

const account = (over: Partial<Me> = {}): Me => ({
  signed_in: true,
  number: 12,
  name: "Vercingétorix",
  role: "officer",
  status: "validated",
  status_reason: null,
  rank: 2,
  discord_name: "verci",
  openfront_username: "Verci",
  linked: true,
  request: null,
  ...over,
});

describe("canUsePlayerView", () => {
  it("est réservée à l'encadrement validé", () => {
    expect(canUsePlayerView(account({ role: "officer", rank: 2 }))).toBe(true);
    expect(canUsePlayerView(account({ role: "admin", rank: 3 }))).toBe(true);
    expect(canUsePlayerView(account({ role: "founder", rank: 4 }))).toBe(true);
  });
  it("n'a rien à masquer pour un membre, un compte en attente ou suspendu, ni sans compte", () => {
    expect(canUsePlayerView(account({ role: "member", rank: 1 }))).toBe(false);
    expect(canUsePlayerView(account({ role: "member", status: "pending", rank: 0 }))).toBe(false);
    // Le serveur donne le rang 0 à tout compte non validé, même s'il garde son rôle.
    expect(canUsePlayerView(account({ role: "officer", status: "suspended", rank: 0 }))).toBe(false);
    expect(canUsePlayerView({ signed_in: false })).toBe(false);
    expect(canUsePlayerView(null)).toBe(false);
    expect(canUsePlayerView(undefined)).toBe(false);
  });
});

describe("viewedAccount", () => {
  it("montre l'encadrement en membre sans grade, le reste du compte inchangé", () => {
    for (const [role, rank] of [
      ["officer", 2],
      ["admin", 3],
      ["founder", 4],
    ] as const) {
      const me = account({ role, rank });
      expect(viewedAccount(me, true)).toEqual({ ...me, role: "member", rank: 1 });
      expect(me.role).toBe(role);
      expect(me.rank).toBe(rank);
    }
  });
  it("laisse le compte tel quel hors de la vue joueur", () => {
    const me = account({ role: "founder", rank: 4 });
    expect(viewedAccount(me, false)).toBe(me);
  });
  it("ne change rien pour qui n'a pas de grade", () => {
    for (const me of [account({ role: "member", rank: 1 }), account({ role: "officer", status: "suspended", rank: 0 }), { signed_in: false }]) {
      expect(viewedAccount(me, true)).toBe(me);
    }
  });
});

describe("keepsPlayerView", () => {
  it("reste ouverte pour l'encadrement", () => {
    expect(keepsPlayerView(account({ role: "admin", rank: 3 }))).toBe(true);
  });
  it("se ferme pour un compte sans grade ou déconnecté", () => {
    expect(keepsPlayerView(account({ role: "member", rank: 1 }))).toBe(false);
    expect(keepsPlayerView({ signed_in: false })).toBe(false);
    // Session expirée ou révoquée : le serveur répond, en refusant l'appel.
    expect(keepsPlayerView({ error: "not_signed_in" })).toBe(false);
  });
  it("reste ouverte quand le serveur ne répond pas, pour pouvoir en sortir", () => {
    expect(keepsPlayerView({ error: "network" })).toBe(true);
  });
});

describe("isPlayerViewOn", () => {
  it("ne reconnaît que la valeur écrite par le site", () => {
    expect(isPlayerViewOn("on")).toBe(true);
    for (const raw of [null, "", "off", "true", "1", "ON"]) expect(isPlayerViewOn(raw)).toBe(false);
  });
});

describe("le choix gardé dans le navigateur", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", new EventTarget());
    setPlayerView(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("s'ouvre et se quitte", () => {
    expect(readPlayerView()).toBe(false);
    setPlayerView(true);
    expect(storage.getItem(PLAYER_VIEW_KEY)).toBe("on");
    expect(readPlayerView()).toBe(true);
    setPlayerView(false);
    expect(storage.getItem(PLAYER_VIEW_KEY)).toBeNull();
    expect(readPlayerView()).toBe(false);
  });

  it("prévient la page à chaque changement, jusqu'à la fin de l'écoute", () => {
    const listener = vi.fn();
    const stop = onPlayerViewChange(listener);
    setPlayerView(true);
    setPlayerView(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setPlayerView(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ne change pas sous les yeux une page ouverte dans un autre onglet", () => {
    const listener = vi.fn();
    const stop = onPlayerViewChange(listener);
    // Un formulaire en cours s'y fermerait : la page prend le choix à son prochain chargement.
    storage.setItem(PLAYER_VIEW_KEY, "on");
    window.dispatchEvent(Object.assign(new Event("storage"), { key: PLAYER_VIEW_KEY }));
    expect(listener).not.toHaveBeenCalled();
    expect(readPlayerView()).toBe(true);
    stop();
  });

  it("annonce une seule fois une ouverture faite sur cette page", () => {
    expect(takeOpenedHere()).toBe(false);
    setPlayerView(true);
    expect(takeOpenedHere()).toBe(true);
    expect(takeOpenedHere()).toBe(false);
    // Déjà ouverte : rien de neuf à annoncer.
    setPlayerView(true);
    expect(takeOpenedHere()).toBe(false);
    setPlayerView(false);
    expect(takeOpenedHere()).toBe(false);
  });

  it("compare à ce que montre la page, pas au stockage qu'un autre onglet a pu changer", () => {
    // Cette page montre la vue normale ; un autre onglet a ouvert la vue joueur depuis. Le bouton d'ici reste visible.
    storage.setItem(PLAYER_VIEW_KEY, "on");
    setPlayerView(true);
    expect(takeOpenedHere()).toBe(true);
  });

  it("n'annonce rien d'une ouverture refermée avant d'être montrée", () => {
    setPlayerView(true);
    setPlayerView(false);
    expect(takeOpenedHere()).toBe(false);
  });

  it("tient le temps de la page si le navigateur refuse d'écrire", () => {
    vi.stubGlobal("localStorage", brokenStorage);
    expect(readPlayerView()).toBe(false);
    setPlayerView(true);
    expect(readPlayerView()).toBe(true);
    setPlayerView(false);
    expect(readPlayerView()).toBe(false);
    // Le stockage revenu fait de nouveau foi.
    vi.stubGlobal("localStorage", storage);
    setPlayerView(true);
    storage.removeItem(PLAYER_VIEW_KEY);
    expect(readPlayerView()).toBe(false);
  });

  it("se quitte à la déconnexion", async () => {
    setPlayerView(true);
    await signOut();
    expect(readPlayerView()).toBe(false);
  });

  it("se quitte quand Supabase perd la session, et seulement alors", async () => {
    await supabase();
    expect(auth.listeners.length).toBe(1);
    setPlayerView(true);
    for (const listener of auth.listeners) listener("TOKEN_REFRESHED");
    expect(readPlayerView()).toBe(true);
    for (const listener of auth.listeners) listener("SIGNED_OUT");
    expect(readPlayerView()).toBe(false);
  });
});

describe("mayHaveSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dit oui seulement si une session est gardée ou revient de Discord", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("location", { search: "" });
    expect(mayHaveSession()).toBe(false);
    vi.stubGlobal("location", { search: "?code=abc" });
    expect(mayHaveSession()).toBe(true);
    vi.stubGlobal("location", { search: "" });
    storage.setItem(SESSION_KEY, "{}");
    expect(mayHaveSession()).toBe(true);
  });

  it("répond non si le navigateur refuse le stockage", () => {
    vi.stubGlobal("localStorage", brokenStorage);
    vi.stubGlobal("location", { search: "?code=abc" });
    expect(mayHaveSession()).toBe(false);
  });
});
