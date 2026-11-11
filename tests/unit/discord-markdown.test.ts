import { describe, expect, it } from "vitest";
import {
  applyEditTo,
  codeBlockEdit,
  formatDiscordTime,
  insertEdit,
  linesEdit,
  linkEdit,
  mentionCode,
  parseBlocks,
  parseInline,
  READ_CONTENT,
  READ_FIELD_VALUE,
  READ_TITLE,
  timeCode,
  wrapEdit,
  type Edit,
  type Selection,
} from "../../src/lib/compte/discord-markdown";

const sel = (value: string, start = value.length, end = start): Selection => ({ value, start, end });
const result = (s: Selection, edit: Edit) => ({ text: applyEditTo(s.value, edit), selected: applyEditTo(s.value, edit).slice(edit.selStart, edit.selEnd) });

describe("la lecture d'une ligne", () => {
  it("lit les styles de Discord, imbriqués", () => {
    expect(parseInline("**gras** *ita* __sou__ ~~bar~~ ||spo|| `code`", READ_CONTENT)).toEqual([
      { t: "b", c: [{ t: "text", v: "gras" }] },
      { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "ita" }] },
      { t: "text", v: " " },
      { t: "u", c: [{ t: "text", v: "sou" }] },
      { t: "text", v: " " },
      { t: "s", c: [{ t: "text", v: "bar" }] },
      { t: "text", v: " " },
      { t: "spoiler", c: [{ t: "text", v: "spo" }] },
      { t: "text", v: " " },
      { t: "code", v: "code" },
    ]);
    expect(parseInline("***les deux***", READ_CONTENT)).toEqual([{ t: "b", c: [{ t: "i", c: [{ t: "text", v: "les deux" }] }] }]);
    expect(parseInline("__*souligné italique*__", READ_CONTENT)).toEqual([{ t: "u", c: [{ t: "i", c: [{ t: "text", v: "souligné italique" }] }] }]);
  });

  it("laisse tel quel ce qui n'est pas de la mise en forme", () => {
    expect(parseInline("5 * 3 * 2", READ_CONTENT)).toEqual([{ t: "text", v: "5 * 3 * 2" }]);
    expect(parseInline("un_nom_de_fichier", READ_CONTENT)).toEqual([{ t: "text", v: "un_nom_de_fichier" }]);
    expect(parseInline("\\*pas d'italique\\*", READ_CONTENT)).toEqual([{ t: "text", v: "*pas d'italique*" }]);
    expect(parseInline("**pas fermé", READ_CONTENT)).toEqual([{ t: "text", v: "**pas fermé" }]);
    expect(parseInline("ligne 1\nligne 2", READ_CONTENT)).toEqual([{ t: "text", v: "ligne 1" }, { t: "br" }, { t: "text", v: "ligne 2" }]);
  });

  it("lit liens, mentions, heures et emojis là où Discord les lit", () => {
    expect(parseInline("[le site](https://les-gaulois.github.io/) <https://a.fr> https://b.fr/x.", READ_CONTENT)).toEqual([
      { t: "link", href: "https://les-gaulois.github.io/", c: [{ t: "text", v: "le site" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://a.fr", c: [{ t: "text", v: "https://a.fr" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://b.fr/x", c: [{ t: "text", v: "https://b.fr/x" }] },
      { t: "text", v: "." },
    ]);
    expect(parseInline("<@&123456789012345678> <@!223456789012345678> <#323456789012345678> @everyone @here", READ_CONTENT)).toEqual([
      { t: "mention", kind: "role", id: "123456789012345678" },
      { t: "text", v: " " },
      { t: "mention", kind: "user", id: "223456789012345678" },
      { t: "text", v: " " },
      { t: "mention", kind: "channel", id: "323456789012345678" },
      { t: "text", v: " " },
      { t: "everyone" },
      { t: "text", v: " " },
      { t: "here" },
    ]);
    expect(parseInline("<t:1700000000:R> <t:1700000000> <:gal:123456789012345678>", READ_CONTENT)).toEqual([
      { t: "time", unix: 1700000000, style: "R" },
      { t: "text", v: " " },
      { t: "time", unix: 1700000000, style: "f" },
      { t: "text", v: " " },
      { t: "emoji", name: "gal" },
    ]);
  });

  it("ne lit dans un titre que le style : ni lien, ni mention, ni heure", () => {
    expect(parseInline("**Titre** [lien](https://a.fr) <@&123456789012345678> <t:1:R>", READ_TITLE)).toEqual([
      { t: "b", c: [{ t: "text", v: "Titre" }] },
      { t: "text", v: " [lien](https://a.fr) <@&123456789012345678> <t:1:R>" },
    ]);
  });
});

describe("la lecture des blocs", () => {
  it("lit titres, sous-texte, citations, listes et blocs de code", () => {
    const blocks = parseBlocks("# Grand\n## Moyen\n### Petit\n-# discret\n> cité\n> encore\n- un\n- deux\n  - dedans\n3. trois\n4. quatre\n```js\nconst a = 1;\n```\nfin", READ_CONTENT);
    expect(blocks.map((b) => b.t)).toEqual(["h", "h", "h", "sub", "quote", "list", "list", "pre", "p"]);
    expect(blocks[0]).toEqual({ t: "h", level: 1, c: [{ t: "text", v: "Grand" }] });
    expect(blocks[4]).toEqual({ t: "quote", c: [{ t: "p", c: [{ t: "text", v: "cité" }, { t: "br" }, { t: "text", v: "encore" }] }] });
    expect(blocks[5]).toEqual({ t: "list", ordered: false, start: 1, items: [{ depth: 0, c: [{ t: "text", v: "un" }] }, { depth: 0, c: [{ t: "text", v: "deux" }] }, { depth: 1, c: [{ t: "text", v: "dedans" }] }] });
    expect(blocks[6]).toMatchObject({ t: "list", ordered: true, start: 3 });
    expect(blocks[7]).toEqual({ t: "pre", lang: "js", v: "const a = 1;" });
  });

  it("met tout le reste du texte en citation après >>>", () => {
    expect(parseBlocks("avant\n>>> un\ndeux", READ_CONTENT)).toEqual([
      { t: "p", c: [{ t: "text", v: "avant" }] },
      { t: "quote", c: [{ t: "p", c: [{ t: "text", v: "un" }, { t: "br" }, { t: "text", v: "deux" }] }] },
    ]);
  });

  it("ne fait pas de titre dans la valeur d'un champ, comme Discord", () => {
    expect(parseBlocks("# Pas un titre", READ_FIELD_VALUE)).toEqual([{ t: "p", c: [{ t: "text", v: "# Pas un titre" }] }]);
    expect(parseBlocks("#sans espace", READ_CONTENT)).toEqual([{ t: "p", c: [{ t: "text", v: "#sans espace" }] }]);
  });

  it("ne lit rien dans un bloc de code", () => {
    expect(parseBlocks("```\n**pas gras** <@&123456789012345678>\n```", READ_CONTENT)).toEqual([{ t: "pre", lang: "", v: "**pas gras** <@&123456789012345678>" }]);
  });
});

describe("les heures de Discord", () => {
  const unix = Date.UTC(2026, 10, 12, 20, 0) / 1000;
  const now = Date.UTC(2026, 10, 12, 18, 0);
  it("s'écrivent en français, à l'heure de chacun", () => {
    expect(formatDiscordTime(unix, "t", now, "Europe/Paris")).toBe("21:00");
    expect(formatDiscordTime(unix, "T", now, "Europe/Paris")).toBe("21:00:00");
    expect(formatDiscordTime(unix, "d", now, "Europe/Paris")).toBe("12/11/2026");
    expect(formatDiscordTime(unix, "D", now, "Europe/Paris")).toBe("12 novembre 2026");
    expect(formatDiscordTime(unix, "F", now, "Europe/Paris")).toContain("jeudi 12 novembre 2026");
    expect(formatDiscordTime(unix, "R", now)).toBe("dans 2 heures");
    expect(formatDiscordTime(unix - 3 * 86_400 - 7_200, "R", now)).toBe("il y a 3 jours");
  });
  it("se codent pour Discord", () => {
    expect(timeCode(new Date(unix * 1000), "R")).toBe(`<t:${unix}:R>`);
  });
});

describe("la barre de mise en forme", () => {
  it("entoure la sélection, ou la libère si elle est déjà entourée", () => {
    const s = sel("dit bonjour", 4, 11);
    const bold = wrapEdit(s, "**");
    expect(result(s, bold)).toEqual({ text: "dit **bonjour**", selected: "bonjour" });
    const again = sel(applyEditTo(s.value, bold), bold.selStart, bold.selEnd);
    expect(result(again, wrapEdit(again, "**"))).toEqual({ text: "dit bonjour", selected: "bonjour" });
    const inside = sel("**gras**", 0, 8);
    expect(result(inside, wrapEdit(inside, "**"))).toEqual({ text: "gras", selected: "gras" });
  });

  it("sans sélection, pose la marque autour d'un mot à remplacer", () => {
    const s = sel("Salut ");
    expect(result(s, wrapEdit(s, "||"))).toEqual({ text: "Salut ||texte||", selected: "texte" });
  });

  it("ne prend pas le gras pour de l'italique", () => {
    const s = sel("**gras**", 2, 6);
    expect(result(s, wrapEdit(s, "*"))).toEqual({ text: "***gras***", selected: "gras" });
  });

  it("met les lignes en citation ou en liste, et les en retire", () => {
    const s = sel("un\ndeux\ntrois", 0, 7);
    const quote = linesEdit(s, () => "> ", /^> /);
    expect(applyEditTo(s.value, quote)).toBe("> un\n> deux\ntrois");
    const back = sel("> un\n> deux", 0, 11);
    expect(applyEditTo(back.value, linesEdit(back, () => "> ", /^> /))).toBe("un\ndeux");
    const list = sel("a\nb", 0, 3);
    expect(applyEditTo(list.value, linesEdit(list, (i) => `${i + 1}. `, /^[0-9]{1,9}\. /))).toBe("1. a\n2. b");
    // Une autre marque de début de ligne est remplacée, pas empilée.
    const heading = sel("# titre", 3, 3);
    expect(applyEditTo(heading.value, linesEdit(heading, () => "> ", /^> /))).toBe("> titre");
  });

  it("ajoute un bloc de code sur ses propres lignes", () => {
    const s = sel("avant code après", 6, 10);
    expect(result(s, codeBlockEdit(s))).toEqual({ text: "avant \n```\ncode\n```\n après", selected: "code" });
  });

  it("fait un lien masqué, l'adresse à coller déjà choisie", () => {
    const s = sel("voir le site", 5, 12);
    expect(result(s, linkEdit(s))).toEqual({ text: "voir [le site](https://)", selected: "https://" });
    const url = sel("https://a.fr", 0, 12);
    expect(result(url, linkEdit(url))).toEqual({ text: "[texte du lien](https://a.fr)", selected: "texte du lien" });
  });

  it("insère une mention ou une heure à la place de la sélection", () => {
    const s = sel("Salut X !", 6, 7);
    expect(applyEditTo(s.value, insertEdit(s, "<@&123456789012345678>"))).toBe("Salut <@&123456789012345678> !");
    expect(mentionCode("role", " 123456789012345678 ")).toBe("<@&123456789012345678>");
    expect(mentionCode("user", "<@123456789012345678>")).toBe("<@123456789012345678>");
    expect(mentionCode("channel", "123456789012345678")).toBe("<#123456789012345678>");
    expect(mentionCode("everyone", "")).toBe("@everyone");
    expect(mentionCode("role", "Rassemblement")).toBeNull();
  });
});
