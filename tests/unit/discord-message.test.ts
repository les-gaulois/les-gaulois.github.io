import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { uploadErrorCode } from "../../src/lib/compte/api";
import {
  blockedSentence,
  botName,
  checkSentence,
  cleanText,
  colorHex,
  colorNumber,
  dateIso,
  discordErrorText,
  draftFiles,
  draftHasContent,
  draftOfMessage,
  draftProblems,
  embedLength,
  emptyDraft,
  fieldId,
  imageFileProblem,
  IMAGE_MAX_BYTES,
  isHttpsLink,
  isMessageWaiting,
  LIMITS,
  messageBody,
  messageSummary,
  newEmbed,
  newField,
  outcomeSentence,
  parseMessages,
  partName,
  removeSentence,
  salonLabel,
  textLength,
  type EmbedDraft,
  type MessageDraft,
  type MessageSalon,
} from "../../src/lib/compte/discord-message";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";

/** L'espace insécable des nombres du site (frNumber). */
const NBSP = String.fromCharCode(0xa0);
const SQL = readFileSync("supabase/migrations/20261111000600_messages_discord.sql", "utf8");
const NOW = "2026-11-11T21:00:00.000Z";
const when = (iso: string) => `[${iso}]`;
const SALONS = ["robot:nouvelles", "appels", "message:3"];

const draft = (over: Partial<MessageDraft> = {}, embed: Partial<EmbedDraft> | null = {}): MessageDraft => ({
  ...emptyDraft("message:3"),
  embeds: embed === null ? [] : [{ ...newEmbed(), ...embed }],
  ...over,
});

describe("les limites", () => {
  it("sont celles que la migration applique, champ par champ", () => {
    expect(SQL).toContain(`internal.discord_message_text(p_message -> 'content', ${LIMITS.content}, 'message_too_long')`);
    expect(SQL).toContain(`internal.discord_message_text(p_message -> 'username', ${LIMITS.username}, 'invalid_username')`);
    expect(SQL).toContain(`internal.discord_message_text(p_message -> 'thread_name', ${LIMITS.thread}, 'invalid_thread')`);
    expect(SQL).toContain(`jsonb_array_length(p_message -> 'embeds') > ${LIMITS.embeds}`);
    expect(SQL).toContain(`internal.discord_message_text(p_embed -> 'title', ${LIMITS.title}, 'embed_too_long')`);
    expect(SQL).toContain(`internal.discord_message_text(p_embed -> 'description', ${LIMITS.description}, 'embed_too_long')`);
    expect(SQL).toContain(`jsonb_array_length(p_embed -> 'fields') > ${LIMITS.fields}`);
    expect(SQL).toContain(`internal.discord_message_text(v_field -> 'name', ${LIMITS.fieldName}, 'embed_too_long')`);
    expect(SQL).toContain(`internal.discord_message_text(v_field -> 'value', ${LIMITS.fieldValue}, 'embed_too_long')`);
    expect(SQL).toContain(`internal.discord_message_text(v_part -> 'text', ${LIMITS.footer}, 'embed_too_long')`);
    expect(SQL).toContain(`internal.discord_message_text(v_part -> 'name', ${LIMITS.author}, 'embed_too_long')`);
    expect(SQL).toContain(`if v_total > ${LIMITS.total} then`);
    expect(SQL).toContain(`internal.discord_message_text(p_value, ${LIMITS.link}, 'invalid_url')`);
    expect(SQL).toContain(`char_length(v_name) > ${LIMITS.salonName}`);
    expect(SQL).toContain(`>= ${LIMITS.salons} then perform internal.fail('too_many_salons')`);
    expect(SQL).toContain(`values ('discord-images', 'discord-images', true, ${IMAGE_MAX_BYTES}, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])`);
  });

  it("comptent comme Discord : blancs des bords ôtés, emoji pour un caractère, contrôles retirés", () => {
    expect(textLength("  abc \n")).toBe(3);
    expect(textLength("👍👍")).toBe(2);
    expect(cleanText("a\r\nb\rc\u0007d")).toBe("a\nb\ncd");
    expect(textLength("\t\n ")).toBe(0);
  });
});

describe("les contrôles avant l'envoi", () => {
  it("laissent partir un message simple", () => {
    expect(draftProblems(draft({ content: "Bonjour" }, null), SALONS)).toEqual([]);
    expect(draftProblems(draft({}, { title: "Titre" }), SALONS)).toEqual([]);
  });

  it("disent ce qui manque, et où", () => {
    expect(draftProblems(draft({ salon: "message:9", content: "x" }, null), SALONS)).toEqual([{ at: fieldId.salon, message: "Choisissez le salon où envoyer le message." }]);
    expect(draftProblems(draft({}, null), SALONS)).toEqual([{ at: fieldId.content, message: "Écrivez un texte ou ajoutez un embed." }]);
    const empty = draftProblems(draft({}, { color: "#ffffff", time: "now" }), SALONS);
    expect(empty.map((p) => p.at)).toEqual([fieldId.title(0)]);
    expect(empty[0]?.message).toContain("il est vide");
  });

  it("suivent les limites de Discord", () => {
    expect(draftProblems(draft({ content: "x".repeat(2001) }, null), SALONS)[0]?.message).toBe(`Le texte du message dépasse 2${NBSP}000 caractères.`);
    expect(draftProblems(draft({ content: "x".repeat(2000) }, null), SALONS)).toEqual([]);
    expect(draftProblems(draft({}, { title: "t".repeat(257) }), SALONS)[0]?.at).toBe(fieldId.title(0));
    const big = draft({}, { description: "d".repeat(4096) });
    big.embeds.push({ ...newEmbed(), description: "d".repeat(1905) });
    expect(draftProblems(big, SALONS).at(-1)?.message).toBe(`L'ensemble des embeds dépasse 6${NBSP}000 caractères (6${NBSP}001).`);
    const many = draft({}, { title: "x" });
    many.embeds = Array.from({ length: 11 }, () => ({ ...newEmbed(), title: "x" }));
    expect(draftProblems(many, SALONS).some((p) => p.message === "10 embeds au plus par message.")).toBe(true);
  });

  it("refusent un nom de robot que Discord refuse, et des liens qui ne sont pas en https", () => {
    expect(draftProblems(draft({ username: "Mon Discord", content: "x" }, null), SALONS)[0]?.at).toBe(fieldId.username);
    expect(draftProblems(draft({ username: "clyde", content: "x" }, null), SALONS)[0]?.at).toBe(fieldId.username);
    expect(draftProblems(draft({ username: "Le Gaulois", content: "x" }, null), SALONS)).toEqual([]);
    expect(draftProblems(draft({}, { title: "x", url: "http://exemple.fr" }), SALONS)[0]?.at).toBe(fieldId.url(0));
    expect(draftProblems(draft({}, { title: "x", image: { kind: "link", url: "https://exemple.fr/a b.png" } }), SALONS)[0]?.at).toBe(fieldId.image(0));
    expect(draftProblems(draft({ content: "x", avatar: { kind: "link", url: "ftp://a" } }, null), SALONS)[0]?.at).toBe(fieldId.avatar);
  });

  it("demandent un nom d'auteur, un texte de pied de page, un champ complet et une date", () => {
    expect(draftProblems(draft({}, { title: "x", authorUrl: "https://a.fr" }), SALONS)[0]?.at).toBe(fieldId.authorName(0));
    expect(draftProblems(draft({}, { title: "x", footerIcon: { kind: "link", url: "https://a.fr/i.png" } }), SALONS)[0]?.at).toBe(fieldId.footerText(0));
    expect(draftProblems(draft({}, { fields: [{ ...newField(), name: "Nom", value: " " }] }), SALONS)[0]?.at).toBe(fieldId.fieldValue(0, 0));
    expect(draftProblems(draft({}, { fields: [{ ...newField(), name: "", value: "v" }] }), SALONS)[0]?.at).toBe(fieldId.fieldName(0, 0));
    expect(draftProblems(draft({}, { title: "x", time: "date", date: "" }), SALONS)[0]?.at).toBe(fieldId.date(0));
  });
});

describe("le message envoyé au serveur", () => {
  it("ne garde que ce qui est rempli, au format de Discord", () => {
    const body = messageBody(
      draft(
        { content: "  Salut  ", username: "", notify: "mentions", thread: " " },
        {
          color: "#0b5fff",
          title: "Titre",
          url: "",
          description: "**Gras**",
          fields: [{ ...newField(), name: "A", value: "1", inline: true }],
          image: { kind: "file", id: "f1", name: "a.png", size: 10, type: "image/png" },
          thumbnail: { kind: "link", url: " https://exemple.fr/m.png " },
          authorName: "GAL",
          authorIcon: { kind: "file", id: "f2", name: "b.png", size: 10, type: "image/png" },
          footerText: "Pied",
          time: "now",
        },
      ),
      (id) => (id === "f1" ? "https://x.supabase.co/storage/v1/object/public/discord-images/a.png" : null),
    );
    expect(body).toEqual({
      notify: "mentions",
      content: "Salut",
      embeds: [
        {
          title: "Titre",
          description: "**Gras**",
          color: 0x0b5fff,
          timestamp: "now",
          author: { name: "GAL" },
          footer: { text: "Pied" },
          image: { url: "https://x.supabase.co/storage/v1/object/public/discord-images/a.png" },
          thumbnail: { url: "https://exemple.fr/m.png" },
          fields: [{ name: "A", value: "1", inline: true }],
        },
      ],
    });
  });

  it("garde l'envoi silencieux, le fil, le robot et une date choisie en ISO", () => {
    const body = messageBody(draft({ content: "x", silent: true, thread: "Soirée", username: "Le Gaulois", avatar: { kind: "link", url: "https://a.fr/p.png" } }, { title: "t", time: "date", date: "2026-11-12T21:00", color: null }), () => null);
    expect(body.silent).toBe(true);
    expect(body.thread_name).toBe("Soirée");
    expect(body.username).toBe("Le Gaulois");
    expect(body.avatar_url).toBe("https://a.fr/p.png");
    expect(body.embeds?.[0]?.["timestamp"]).toBe(new Date("2026-11-12T21:00").toISOString());
    expect(body.embeds?.[0]).not.toHaveProperty("color");
  });

  it("dépose chaque fichier une fois, dans l'ordre du formulaire", () => {
    const file = (id: string) => ({ kind: "file" as const, id, name: `${id}.png`, size: 1, type: "image/png" as const });
    const d = draft({ avatar: file("a") }, { image: file("b"), thumbnail: file("a"), footerIcon: file("c") });
    expect(draftFiles(d).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("revient tel quel dans le formulaire (« Reprendre »)", () => {
    const sent = {
      content: "Salut",
      username: "Le Gaulois",
      avatar_url: "https://a.fr/p.png",
      notify: "everyone",
      silent: true,
      thread_name: "Fil",
      embeds: [
        { title: "T", url: "https://a.fr", description: "D", color: 255, timestamp: "now", author: { name: "GAL", url: "https://a.fr", icon_url: "https://a.fr/i.png" }, footer: { text: "P", icon_url: "https://a.fr/f.png" }, image: { url: "https://a.fr/g.png" }, thumbnail: { url: "https://a.fr/m.png" }, fields: [{ name: "A", value: "1", inline: true }] },
        { description: "Deux", timestamp: "2026-11-12T20:00:00Z" },
      ],
    };
    const back = draftOfMessage(sent, "appels");
    expect(back.salon).toBe("appels");
    expect(back.notify).toBe("everyone");
    expect(back.embeds[0]?.color).toBe("#0000ff");
    expect(back.embeds[0]?.time).toBe("now");
    expect(back.embeds[1]?.time).toBe("date");
    expect(messageBody(back, () => null)).toEqual({ ...sent, embeds: [sent.embeds[0], { description: "Deux", timestamp: "2026-11-12T20:00:00.000Z" }] });
  });

  it("ne reprend rien d'illisible", () => {
    const back = draftOfMessage({ content: 5, embeds: [null, { title: "ok", color: 99999999, fields: "x" }], notify: "tous" }, "appels");
    expect(back.content).toBe("");
    expect(back.notify).toBe("none");
    expect(back.embeds).toHaveLength(1);
    expect(back.embeds[0]?.color).toBeNull();
    expect(back.embeds[0]?.fields).toEqual([]);
    expect(draftOfMessage(null, "appels").embeds).toEqual([]);
  });

  it("dit si le brouillon contient quelque chose à ne pas écraser", () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent(draft({}, { color: "#ffffff" }))).toBe(false);
    expect(draftHasContent(draft({}, { title: "x" }))).toBe(true);
    expect(draftHasContent(draft({ content: "x" }, null))).toBe(true);
  });
});

describe("les petits outils", () => {
  it("lisent les couleurs et les dates", () => {
    expect(colorNumber("#0B5FFF")).toBe(0x0b5fff);
    expect(colorNumber("bleu")).toBeNull();
    expect(colorHex(0)).toBe("#000000");
    expect(colorHex(0xffffff)).toBe("#ffffff");
    expect(dateIso("2026-11-12T21:00")).toBe(new Date("2026-11-12T21:00").toISOString());
    expect(dateIso("demain")).toBeNull();
  });

  it("reconnaissent une adresse que le serveur acceptera", () => {
    expect(isHttpsLink("https://exemple.fr/a.png")).toBe(true);
    expect(isHttpsLink("http://exemple.fr/a.png")).toBe(false);
    expect(isHttpsLink("https://exemple.fr/a b.png")).toBe(false);
    expect(isHttpsLink(`https://exemple.fr/${"a".repeat(2000)}`)).toBe(false);
  });

  it("refusent un fichier qui n'est pas une image légère", () => {
    expect(imageFileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(imageFileProblem({ type: "image/svg+xml", size: 1000 })).toBe("Choisissez une image PNG, JPEG, GIF ou WebP.");
    expect(imageFileProblem({ type: "image/gif", size: IMAGE_MAX_BYTES + 1 })).toContain("8 Mo");
  });

  it("comptent les caractères d'un embed pour la limite commune", () => {
    expect(embedLength({ ...newEmbed(), title: "ab", description: "cd", authorName: "e", footerText: "f", fields: [{ ...newField(), name: "g", value: "hi" }] })).toBe(9);
  });

  it("résument un message envoyé pour la liste", () => {
    expect(messageSummary({ content: "Texte", embeds: [{ title: "Titre" }] })).toBe("Titre");
    expect(messageSummary({ content: "  Un\ntexte  " })).toBe("Un texte");
    expect(messageSummary({ embeds: [{ image: { url: "https://a.fr/i.png" } }] })).toBe("Embed sans texte");
    expect(messageSummary({ content: "x".repeat(120) })).toHaveLength(90);
  });
});

describe("la réponse du serveur", () => {
  const salonRaw = { key: "message:3", kind: "message", id: 3, name: "#annonces", webhook_name: "GAL", check_status: 200, checking: false, created_at: NOW, created_by: "Chef" };
  const sentRaw = (over: Record<string, unknown> = {}) => ({ id: 7, salon: "message:3", salon_name: "#annonces", at: "2026-11-11T20:59:30.000Z", by: "Chef", message: { content: "x" }, sent: true, send_error: null, status: null, timed_out: false, discord_error: null, removable: false, removed_at: null, removed_by: null, remove_status: null, ...over });
  const answer = (messages: unknown[], salons: unknown[] = [salonRaw]) => ({ ok: true, now: NOW, salons, messages });

  it("se lit telle que le serveur la donne", () => {
    const state = parseMessages(answer([sentRaw()], [{ key: "robot:nouvelles", kind: "robot", robot: "nouvelles", webhook_name: "Rapport des Gaulois" }, { key: "appels", kind: "appels" }, salonRaw]));
    expect(state?.salons.map((s) => s.key)).toEqual(["robot:nouvelles", "appels", "message:3"]);
    expect(state?.salons[0]).toMatchObject({ kind: "robot", robot: "nouvelles", webhookName: "Rapport des Gaulois", id: null, name: null });
    expect(state?.salons[2]).toMatchObject({ kind: "message", id: 3, name: "#annonces", checkStatus: 200, createdBy: "Chef" });
    expect(state?.messages[0]).toMatchObject({ id: 7, salonName: "#annonces", by: "Chef", outcome: { state: "waiting" }, remove: { state: "none" } });
    expect(isMessageWaiting(state)).toBe(true);
  });

  it("écarte ce qui est illisible plutôt que de le deviner", () => {
    expect(parseMessages(null)).toBeNull();
    expect(parseMessages({ ok: true, now: "hier", salons: [], messages: [] })).toBeNull();
    expect(parseMessages({ ok: true, now: NOW, salons: [] })).toBeNull();
    const state = parseMessages(answer([sentRaw({ salon: "ailleurs" }), sentRaw({ id: "8" }), "x"], [{ key: "message:4", kind: "message" }, { key: "robot:nouvelles", kind: "message", id: 1, name: "x" }, { key: "appels", kind: "inconnu" }]));
    expect(state?.salons).toEqual([]);
    expect(state?.messages).toEqual([]);
  });

  it("lit la réponse de Discord à chaque envoi, et l'oubli au bout de six heures", () => {
    const outcome = (over: Record<string, unknown>) => parseMessages(answer([sentRaw(over)]))?.messages[0]?.outcome;
    expect(outcome({ status: 200 })).toEqual({ state: "accepted" });
    expect(outcome({ status: 400, discord_error: '{"message":"Invalid Form Body"}' })).toEqual({ state: "refused", status: 400, detail: '{"message":"Invalid Form Body"}' });
    expect(outcome({ status: 0, timed_out: true })).toEqual({ state: "timeout" });
    expect(outcome({ status: 0, discord_error: "Couldn't resolve host" })).toEqual({ state: "unreached", detail: "Couldn't resolve host" });
    expect(outcome({ sent: false, send_error: "panne" })).toEqual({ state: "unsent", detail: "panne" });
    expect(outcome({ at: "2026-11-11T20:30:00.000Z" })).toEqual({ state: "silent" });
    expect(outcome({ at: "2026-11-11T12:00:00.000Z" })).toEqual({ state: "forgotten" });
  });

  it("lit le retrait d'un message, et ne propose pas de retirer un message déjà retiré", () => {
    const message = (over: Record<string, unknown>) => parseMessages(answer([sentRaw({ status: 200, removable: true, ...over })]))?.messages[0];
    expect(message({})).toMatchObject({ removable: true, remove: { state: "none" } });
    expect(message({ removed_at: "2026-11-11T20:59:50.000Z" })).toMatchObject({ removable: false, remove: { state: "waiting" } });
    expect(message({ removed_at: "2026-11-11T20:00:00.000Z", remove_status: 204, removed_by: "Chef" })).toMatchObject({ removable: false, remove: { state: "done" } });
    expect(message({ removed_at: "2026-11-11T20:00:00.000Z", remove_status: 404 })).toMatchObject({ removable: true, remove: { state: "refused", status: 404 } });
    // 0 : pg_net n'a pas eu de réponse. Ce n'est pas un refus de Discord, et l'on peut réessayer.
    expect(message({ removed_at: "2026-11-11T20:00:00.000Z", remove_status: 0 })).toMatchObject({ removable: true, remove: { state: "silent" } });
  });

  it("dit pourquoi un message posté ne se retire plus d'ici", () => {
    const message = (over: Record<string, unknown>) => parseMessages(answer([sentRaw({ status: 200, ...over })]))?.messages[0];
    const changed = message({ removable: false, webhook_changed: true });
    expect(changed?.blocked).toBe("webhook");
    expect(blockedSentence(changed!)).toBe("Ce salon a changé de webhook depuis l'envoi : ce message ne se retire plus que dans Discord.");
    expect(blockedSentence(message({ removable: false, salon_gone: true, webhook_changed: false })!)).toBe("Ce salon n'est plus branché ici : ce message ne se retire plus que dans Discord.");
    // Rien à dire d'un message retirable, déjà retiré, ou que Discord n'a pas accepté.
    expect(blockedSentence(message({ removable: true, webhook_changed: false })!)).toBeNull();
    expect(blockedSentence(message({ removable: false, salon_gone: true, removed_at: "2026-11-11T20:00:00.000Z", remove_status: 204 })!)).toBeNull();
    expect(blockedSentence(message({ status: 400, removable: false, salon_gone: true })!)).toBeNull();
  });
});

describe("les mots de la page", () => {
  const salons: MessageSalon[] = [
    { key: "robot:nouvelles", kind: "robot", robot: "nouvelles", id: null, name: null, webhookName: "Rapport des Gaulois", checkStatus: null, checking: false, createdAt: null, createdBy: null },
    { key: "message:3", kind: "message", robot: null, id: 3, name: "#annonces", webhookName: null, checkStatus: 404, checking: false, createdAt: NOW, createdBy: null },
  ];

  it("nomment les salons sans rien inventer", () => {
    expect(salonLabel("robot:nouvelles", salons)).toBe("Le salon des nouvelles");
    expect(salonLabel("robot:inconnu", salons)).toBe("Le salon « inconnu » du robot");
    expect(salonLabel("appels", salons)).toBe("Le salon des appels");
    expect(salonLabel("message:3", salons)).toBe("#annonces");
    expect(salonLabel("message:9", salons, "#ancien")).toBe("#ancien");
    expect(salonLabel("message:9", salons)).toBe("Un salon retiré");
  });

  it("donnent au robot le nom choisi, sinon celui du webhook", () => {
    expect(botName({ ...emptyDraft("robot:nouvelles"), username: " Le Gaulois " }, salons)).toBe("Le Gaulois");
    expect(botName(emptyDraft("robot:nouvelles"), salons)).toBe("Rapport des Gaulois");
    expect(botName(emptyDraft("message:3"), salons)).toBe("Robot du salon");
  });

  it("disent ce qu'a répondu Discord à la lecture d'un webhook ajouté", () => {
    expect(checkSentence(salons[1]!)).toContain("Discord ne connaît pas ce lien (erreur 404)");
    expect(checkSentence({ ...salons[1]!, checkStatus: 200, webhookName: "GAL" })).toBe("Lien vérifié : le webhook « GAL » répond.");
    expect(checkSentence({ ...salons[1]!, checking: true })).toBe("Vérification du lien auprès de Discord…");
    expect(checkSentence(salons[0]!)).toBeNull();
  });

  it("traduisent ce que Discord reproche, avec les mots du formulaire", () => {
    const refusal = JSON.stringify({ code: 50035, errors: { embeds: { 0: { image: { url: { _errors: [{ code: "URL_TYPE_INVALID_URL", message: "Not a well formed URL." }] } } }, 1: { fields: { 2: { value: { _errors: [{ message: "Must be 1024 or fewer in length." }] } } } } }, username: { _errors: [{ message: "Username cannot contain \"discord\"" }] } }, message: "Invalid Form Body" });
    expect(discordErrorText(refusal)).toBe("l'embed 1, l'image : « Not a well formed URL. » ; l'embed 2, champ 3 (valeur) : « Must be 1024 or fewer in length. » ; le nom du robot : « Username cannot contain \"discord\" »");
    expect(discordErrorText('{"message":"Cannot send an empty message","code":50006}')).toBe("« Cannot send an empty message »");
    expect(discordErrorText("<html>")).toBeNull();
    expect(discordErrorText(null)).toBeNull();
    expect(partName("embeds.0")).toBe("l'embed 1");
    expect(partName("embeds.3.author.icon_url")).toBe("l'embed 4, l'icône de l'auteur");
    expect(partName("inconnu")).toBe("inconnu");
  });

  it("disent ce qu'est devenu un message, sans dire plus que le serveur", () => {
    expect(outcomeSentence({ state: "accepted" })).toBe("Discord l'a accepté : il est dans le salon.");
    expect(outcomeSentence({ state: "refused", status: 404, detail: null })).toContain("le webhook a sans doute été supprimé");
    expect(outcomeSentence({ state: "refused", status: 400, detail: '{"message":"Invalid Form Body","errors":{"content":{"_errors":[{"message":"Must be 2000 or fewer in length."}]}}}' })).toBe(
      "Discord l'a refusé (erreur 400) : le texte du message : « Must be 2000 or fewer in length. »",
    );
    expect(outcomeSentence({ state: "refused", status: 400, detail: null })).toBe("Discord l'a refusé (erreur 400).");
    expect(outcomeSentence({ state: "forgotten" })).toBeNull();
    const sent = { id: 1, salon: "appels", salonName: null, at: NOW, by: null, message: {}, outcome: { state: "accepted" as const }, removable: false, blocked: null, removedAt: NOW, removedBy: "Chef", remove: { state: "done" as const } };
    expect(removeSentence(sent, when)).toBe(`Retiré du salon le [${NOW}] par Chef.`);
    expect(removeSentence({ ...sent, remove: { state: "refused", status: 404 } }, when)).toContain("déjà été effacé");
    expect(removeSentence({ ...sent, remove: { state: "none" } }, when)).toBeNull();
  });
});

describe("l'envoi des images", () => {
  it("ramène chaque refus du stockage à un message en français", () => {
    expect(uploadErrorCode({ status: 413, message: "Payload too large" })).toBe("image_too_large");
    expect(uploadErrorCode({ statusCode: "413", message: "The object exceeded the maximum allowed size" })).toBe("image_too_large");
    expect(uploadErrorCode({ status: 400, message: "mime type image/svg+xml is not supported" })).toBe("invalid_image");
    expect(uploadErrorCode({ status: 400, statusCode: "403", message: "new row violates row-level security policy" })).toBe("forbidden");
    expect(uploadErrorCode({ status: 401, message: "jwt expired" })).toBe("not_signed_in");
    expect(uploadErrorCode({ status: 500, message: "boom" })).toBe("image_upload_failed");
    for (const code of ["image_too_large", "invalid_image", "forbidden", "not_signed_in", "image_upload_failed"]) expect(ERROR_MESSAGES[code], code).toBeTruthy();
  });
});

describe("la migration", () => {
  const body = (name: string) => {
    const start = SQL.indexOf(`function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    const end = SQL.indexOf("$$;", start);
    expect(end, name).toBeGreaterThan(start);
    return SQL.slice(start, end);
  };

  it("ferme chaque délimiteur de fonction", () => {
    const opens = [...SQL.matchAll(/\bas \$\$/g)].length;
    const closes = [...SQL.matchAll(/^(?:end )?\$\$;$/gm)].length;
    expect(opens).toBe(14);
    expect(closes).toBe(opens);
    expect([...SQL.matchAll(/\$regles\$/g)]).toHaveLength(2);
  });

  it("ne retire aucune donnée existante", () => {
    expect(SQL).not.toMatch(/\bdrop\s+(table|column|function|policy)\b/i);
    expect(SQL).not.toMatch(/\btruncate\b/i);
    // Le seul effacement : un salon ajouté par ces fonctions, à la demande d'un admin.
    expect([...SQL.matchAll(/\bdelete from ([a-z_.]+)/gi)].map((m) => m[1])).toEqual(["internal.discord_message_salons"]);
  });

  it("n'ouvre les fonctions qu'aux comptes connectés, chaque fonction vérifiant le rang d'admin", () => {
    for (const [name, args] of [
      ["get_discord_messages", ""],
      ["send_discord_message", "text, jsonb"],
      ["remove_discord_message", "bigint"],
      ["add_discord_message_salon", "text, text"],
      ["remove_discord_message_salon", "bigint"],
    ] as const) {
      expect(SQL).toContain(`revoke all on function public.${name}(${args}) from public, anon, authenticated;`);
      expect(SQL).toContain(`grant execute on function public.${name}(${args}) to authenticated;`);
      expect(body(`public.${name}`)).toContain("internal.require_rank(3)");
    }
    expect([...SQL.matchAll(/^grant /gm)]).toHaveLength(5);
    for (const name of ["discord_message_hook", "discord_message_text", "discord_message_link", "discord_message_part", "discord_message_embed", "discord_message_clean", "discord_message_payload", "discord_message_note", "discord_message_salon_note"]) {
      expect(SQL).toMatch(new RegExp(`revoke all on function internal\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it("ne rend jamais un lien de webhook à la page", () => {
    const read = body("public.get_discord_messages");
    expect(read).not.toContain("'webhook_url'");
    expect(read).not.toMatch(/'(?:url|link|webhook)',\s*[a-z]\.webhook_url/);
  });

  it("ne poste que par un webhook réglé sur le serveur, jamais vers une adresse venue de la page", () => {
    const send = body("public.send_discord_message");
    expect(send).toContain("v_url := internal.discord_message_hook(p_salon);");
    expect(send).toContain("net.http_post(url := v_url || '?wait=true'");
    expect(body("public.remove_discord_message")).toContain("v_url := internal.discord_message_hook(v_row.salon);");
    // Seul le webhook qui a posté un message peut le retirer : le serveur garde son numéro, jamais son jeton.
    expect(send).toContain("split_part(v_url, '/', 6)");
    expect(body("public.remove_discord_message")).toContain("if split_part(v_url, '/', 6) is distinct from v_row.webhook_id then perform internal.fail('message_other_webhook'); end if;");
  });

  it("relit la réponse d'un retrait, même pour un message de la veille", () => {
    expect(body("public.get_discord_messages")).toContain("(d.remove_request is not null and d.remove_status is null and d.removed_at > now() - interval '7 hours')");
  });

  it("réserve le dépôt des images aux admins et au fondateur, sous un nom tiré au sort", () => {
    expect(SQL).toContain("with check (bucket_id = 'discord-images' and internal.current_rank() >= 3 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|gif|webp)$');");
    expect(SQL).not.toMatch(/on storage\.objects for (update|delete)/);
  });

  it("a un message en français pour chacun de ses refus", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect(codes.size).toBeGreaterThan(15);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });
});
