import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WELCOME_MAX,
  WELCOME_NEAR,
  WELCOME_TALL_CHARS,
  WELCOME_TALL_LINES,
  welcomeCount,
  welcomeCountLabel,
  welcomeIsTall,
  welcomePreview,
  welcomeSavedMessage,
  welcomeShown,
  welcomeState,
  welcomeStored,
} from "../../src/lib/compte/direction-accueil";
import { parseQg } from "../../src/lib/compte/qg";

/** La dernière version de `save_welcome` dans les migrations : celle que le serveur applique. */
function saveWelcomeSql(): string {
  const files = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let found = "";
  for (const name of files) {
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8").replace(/\r\n/g, "\n");
    const start = sql.indexOf("function public.save_welcome(");
    if (start >= 0) found = sql.slice(start, sql.indexOf("end $$;", start));
  }
  return found;
}

/** Ce que le QG affiche d'un mot enregistré, lu par sa propre fonction (`parseQg`). */
const qgShows = (stored: string | null) =>
  parseQg({ me: { visible: true, avatar: null }, members: 1, polls: [], events: [], ideas: [], wall: [], welcome: stored === null ? null : { body: stored, updated_at: null } })?.welcome?.body ?? null;

/** Le séparateur des milliers du site (`frNumber`) : l'espace insécable. */
const NB = " ";

describe("les bornes de l'onglet", () => {
  it("suit le serveur : 2 000 caractères au plus, espaces retirés autour par btrim", () => {
    const sql = saveWelcomeSql();
    expect(sql).toContain("btrim(coalesce(p_body, ''))");
    expect(sql).toContain(`char_length(v_body) > ${WELCOME_MAX}`);
    expect(WELCOME_MAX).toBe(2000);
  });

  it("garde les seuils de l'écran : jaune à 100 caractères du bout, cadre qui défile après 600 caractères ou 10 lignes", () => {
    expect(WELCOME_NEAR).toBe(100);
    expect(WELCOME_TALL_CHARS).toBe(600);
    expect(WELCOME_TALL_LINES).toBe(10);
  });
});

describe("ce que le serveur garde du champ", () => {
  it("retire seulement les espaces du début et de la fin, comme btrim", () => {
    expect(welcomeStored("  Bonjour à tous  ")).toBe("Bonjour à tous");
    expect(welcomeStored("Bonjour   à tous")).toBe("Bonjour   à tous");
    expect(welcomeStored("   ")).toBe("");
    expect(welcomeStored("")).toBe("");
    expect(welcomeStored(null)).toBe("");
  });

  it("garde les retours à la ligne, tabulations et espaces insécables autour", () => {
    expect(welcomeStored("\nBonjour\n")).toBe("\nBonjour\n");
    expect(welcomeStored("  \n Bonjour \n  ")).toBe("\n Bonjour \n");
    expect(welcomeStored("\tBonjour")).toBe("\tBonjour");
    expect(welcomeStored(" Bonjour")).toBe(" Bonjour");
  });
});

describe("ce que le QG montre", () => {
  it("rien pour un mot vide ou fait de blancs, sinon le texte tel quel", () => {
    expect(welcomeShown(null)).toBeNull();
    expect(welcomeShown("")).toBeNull();
    expect(welcomeShown("\n\t\n")).toBeNull();
    expect(welcomeShown("\nBonjour")).toBe("\nBonjour");
  });

  it("dit la même chose que la lecture du QG (parseQg), pour chaque champ", () => {
    const champs = ["", "   ", "\n\n", "Bonjour", "  Bonjour  ", "\nBonjour\n", "Ligne 1\n\nLigne 3", " ", "Écrit avec des accents : « déjà »"];
    for (const champ of champs) expect(welcomeShown(welcomeStored(champ)), JSON.stringify(champ)).toBe(qgShows(welcomeStored(champ)));
  });
});

describe("l'état du mot d'accueil (pastille)", () => {
  it("« Pas lu » en rouge tant que le mot enregistré n'est pas connu, brouillon gardé ou non", () => {
    expect(welcomeState(null, null)).toEqual({ kind: "unread", tone: "danger", label: "Pas lu" });
    expect(welcomeState(null, "un brouillon gardé")).toMatchObject({ kind: "unread", tone: "danger" });
  });

  it("« En ligne » en vert pour un mot enregistré, « Pas de mot » en gris sans mot", () => {
    expect(welcomeState("Bonjour", "Bonjour")).toEqual({ kind: "online", tone: "ok", label: "En ligne" });
    expect(welcomeState("Bonjour", null)).toMatchObject({ kind: "online" });
    expect(welcomeState("", "")).toEqual({ kind: "none", tone: "muted", label: "Pas de mot" });
    expect(welcomeState("", null)).toMatchObject({ kind: "none" });
    // Un mot de blancs seulement : le QG n'affiche rien.
    expect(welcomeState("\n\n", "\n\n")).toMatchObject({ kind: "none" });
  });

  it("« Modifié, pas enregistré » en jaune dès que le serveur garderait un autre texte", () => {
    expect(welcomeState("Bonjour", "Bonjour à tous")).toEqual({ kind: "changed", tone: "warn", label: "Modifié, pas enregistré" });
    expect(welcomeState("Bonjour", "")).toMatchObject({ kind: "changed" });
    expect(welcomeState("", "Bonjour")).toMatchObject({ kind: "changed" });
    expect(welcomeState("Bonjour", "bonjour")).toMatchObject({ kind: "changed" });
  });

  it("ignore les espaces autour, que le serveur retire, mais pas un retour à la ligne, qu'il garde", () => {
    expect(welcomeState("Bonjour", "  Bonjour  ")).toMatchObject({ kind: "online" });
    expect(welcomeState("", "   ")).toMatchObject({ kind: "none" });
    expect(welcomeState("Bonjour", "Bonjour\n")).toMatchObject({ kind: "changed" });
  });

  it("après « Réessayer », un brouillon gardé reste comparé au mot relu", () => {
    expect(welcomeState("Mot en ligne", "Mon brouillon")).toMatchObject({ kind: "changed" });
    expect(welcomeState("Mot en ligne", "Mot en ligne")).toMatchObject({ kind: "online" });
    expect(welcomeState("", "Mon brouillon")).toMatchObject({ kind: "changed" });
  });
});

describe("l'aperçu du QG", () => {
  it("montre le mot en ligne, daté, quand le champ n'a pas changé", () => {
    expect(welcomePreview("Bonjour\nÀ ce soir", "Bonjour\nÀ ce soir")).toEqual({ title: "Au QG, en ce moment", body: "Bonjour\nÀ ce soir", empty: null, dated: true });
  });

  it("montre le texte que le serveur gardera, sans date, quand le champ a changé", () => {
    expect(welcomePreview("Bonjour", "  Nouveau mot\n")).toEqual({ title: "Au QG, après l'enregistrement", body: "Nouveau mot\n", empty: null, dated: false });
    expect(welcomePreview("Bonjour", "\nNouveau mot")).toMatchObject({ body: "\nNouveau mot" });
  });

  it("dit que le QG n'affiche rien, au présent ou au futur, avec ou sans mot avant", () => {
    expect(welcomePreview("", "")).toEqual({ title: "Au QG, en ce moment", body: null, empty: "Pas de mot : le QG n'affiche rien à cette place.", dated: false });
    expect(welcomePreview("Bonjour", "")).toMatchObject({ title: "Au QG, après l'enregistrement", body: null, empty: "Plus de mot : le QG n'affichera rien à cette place." });
    expect(welcomePreview("Bonjour", "\n \n")).toMatchObject({ body: null, empty: "Plus de mot : le QG n'affichera rien à cette place." });
    expect(welcomePreview("", "\n")).toMatchObject({ body: null, empty: "Pas de mot : le QG n'affichera rien à cette place." });
  });

  it("sans le mot enregistré, parle au futur du brouillon gardé", () => {
    expect(welcomePreview(null, "Mon brouillon")).toEqual({ title: "Au QG, après l'enregistrement", body: "Mon brouillon", empty: null, dated: false });
    expect(welcomePreview(null, "")).toMatchObject({ body: null, empty: "Pas de mot : le QG n'affichera rien à cette place." });
  });
});

describe("le message après un enregistrement", () => {
  it("dit « effacé » quand le QG n'aura plus rien à montrer", () => {
    expect(welcomeSavedMessage("")).toBe("Mot d'accueil effacé.");
    expect(welcomeSavedMessage("   ")).toBe("Mot d'accueil effacé.");
    expect(welcomeSavedMessage("\n\n")).toBe("Mot d'accueil effacé.");
  });

  it("dit « enregistré » pour un vrai texte", () => {
    expect(welcomeSavedMessage(" Bonjour ")).toBe("Mot d'accueil enregistré : les membres validés le voient au QG.");
  });
});

describe("le compteur du champ", () => {
  it("compte ce qui est écrit, blancs compris, et ce qui reste", () => {
    expect(welcomeCount("")).toEqual({ used: 0, left: WELCOME_MAX, near: false });
    expect(welcomeCount("abc")).toEqual({ used: 3, left: WELCOME_MAX - 3, near: false });
    expect(welcomeCount(" a\n")).toEqual({ used: 3, left: WELCOME_MAX - 3, near: false });
  });

  it("compte comme le champ (maxLength) : un émoji vaut deux", () => {
    expect(welcomeCount("🎉").used).toBe(2);
    expect(welcomeCount("é").used).toBe(1);
  });

  it("passe au jaune à 100 caractères du bout, pas avant", () => {
    expect(welcomeCount("a".repeat(WELCOME_MAX - WELCOME_NEAR - 1)).near).toBe(false);
    expect(welcomeCount("a".repeat(WELCOME_MAX - WELCOME_NEAR)).near).toBe(true);
    expect(welcomeCount("a".repeat(WELCOME_MAX))).toEqual({ used: WELCOME_MAX, left: 0, near: true });
  });

  it("ne descend pas sous zéro pour un mot plus long que le champ", () => {
    expect(welcomeCount("a".repeat(WELCOME_MAX + 5))).toEqual({ used: WELCOME_MAX + 5, left: 0, near: true });
  });

  it("écrit le compte en mots, accordé", () => {
    expect(welcomeCountLabel(welcomeCount(""))).toBe(`0 sur 2${NB}000 caractères`);
    expect(welcomeCountLabel(welcomeCount("a".repeat(126)))).toBe(`126 sur 2${NB}000 caractères`);
    expect(welcomeCountLabel(welcomeCount("a".repeat(1899)))).toBe(`1${NB}899 sur 2${NB}000 caractères`);
    expect(welcomeCountLabel(welcomeCount("a".repeat(1900)))).toBe("Il reste 100 caractères");
    expect(welcomeCountLabel(welcomeCount("a".repeat(1998)))).toBe("Il reste 2 caractères");
    expect(welcomeCountLabel(welcomeCount("a".repeat(1999)))).toBe("Il reste 1 caractère");
    expect(welcomeCountLabel(welcomeCount("a".repeat(2000)))).toBe(`Limite atteinte : 2${NB}000 caractères`);
  });
});

describe("l'aperçu d'un mot long", () => {
  it("ne défile qu'au-delà de 600 caractères", () => {
    expect(welcomeIsTall("Bonjour.\nÀ ce soir.")).toBe(false);
    expect(welcomeIsTall("a".repeat(WELCOME_TALL_CHARS))).toBe(false);
    expect(welcomeIsTall("a".repeat(WELCOME_TALL_CHARS + 1))).toBe(true);
  });

  it("ou au-delà de 10 lignes, lignes vides comprises", () => {
    expect(welcomeIsTall(Array.from({ length: WELCOME_TALL_LINES }, () => "a").join("\n"))).toBe(false);
    expect(welcomeIsTall(Array.from({ length: WELCOME_TALL_LINES + 1 }, () => "a").join("\n"))).toBe(true);
    expect(welcomeIsTall("\n".repeat(WELCOME_TALL_LINES))).toBe(true);
  });
});
