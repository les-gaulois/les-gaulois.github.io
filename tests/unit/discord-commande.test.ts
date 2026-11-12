import { describe, expect, it } from "vitest";
import { APPLICATION_ID, CODE_COMMAND, GUILD_ID, commandUrl, explainRefusal, installUrl, isSnowflake } from "../../src/lib/discord-commande";
import { COMMAND_NAME, GAL_GUILD_ID } from "../../supabase/functions/code-discord/index";

const APP = "123456789012345678";
const GUILD = "987654321098765432";

describe("la commande /code", () => {
  it("porte le nom qu'attend la fonction serveur", () => {
    expect(CODE_COMMAND.name).toBe(COMMAND_NAME);
  });

  it("se crée sur le serveur même que la fonction attend", () => {
    expect(GUILD_ID).toBe(GAL_GUILD_ID);
    expect(isSnowflake(APPLICATION_ID)).toBe(true);
    expect(commandUrl(APPLICATION_ID, GUILD_ID)).toContain(`/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/`);
  });

  it("tient dans les limites de Discord", () => {
    expect(CODE_COMMAND.name).toMatch(/^[a-z0-9_-]{1,32}$/);
    expect(CODE_COMMAND.description.length).toBeGreaterThan(0);
    expect(CODE_COMMAND.description.length).toBeLessThanOrEqual(100);
    expect(CODE_COMMAND.type).toBe(1);
  });

  it("ne se crée que sur le serveur du clan", () => {
    expect(commandUrl(APP, GUILD)).toBe(`https://discord.com/api/v10/applications/${APP}/guilds/${GUILD}/commands`);
  });

  it("refuse un numéro qui n'en est pas un", () => {
    expect(isSnowflake("12345")).toBe(false);
    expect(isSnowflake("12345678901234567a")).toBe(false);
    expect(() => commandUrl("abc", GUILD)).toThrow(/application/);
    expect(() => commandUrl(APP, "")).toThrow(/serveur/);
  });

  it("s'ajoute au serveur sans robot ni droit", () => {
    const url = new URL(installUrl(APP));
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe(APP);
    expect(url.searchParams.get("scope")).toBe("applications.commands");
    expect(url.searchParams.has("permissions")).toBe(false);
  });
});

describe("les refus de Discord, dits au pilote", () => {
  it("un jeton faux", () => {
    expect(explainRefusal(401, '{"message": "401: Unauthorized", "code": 0}', APP)).toContain("Reset Token");
  });

  it("une application pas encore sur le serveur, avec le lien pour l'ajouter", () => {
    const text = explainRefusal(403, '{"message": "Missing Access", "code": 50001}', APP);
    expect(text).toContain(installUrl(APP));
  });

  it("un numéro inconnu, et tout autre refus", () => {
    expect(explainRefusal(404, '{"message": "Unknown Guild", "code": 10004}', APP)).toContain("numéro");
    expect(explainRefusal(500, "illisible", APP)).toBe("Discord a refusé (500).");
  });
});
