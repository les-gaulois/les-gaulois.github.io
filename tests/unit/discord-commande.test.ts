import { describe, expect, it } from "vitest";
import {
  APPLICATION_ID,
  CARTE_COMMAND,
  CLAN_COMMAND,
  CODE_COMMAND,
  COMMANDS,
  FICHE_COMMAND,
  GUIDE_COMMAND,
  GUILD_ID,
  MANAGE_ROLES,
  MOI_COMMAND,
  RECORDS_COMMAND,
  RIVAL_COMMAND,
  ROLES_COMMAND,
  commandUrl,
  explainRefusal,
  installUrl,
  isSnowflake,
  looksLikeBotToken,
  retryAfterMs,
} from "../../src/lib/discord-commande";
import * as fonction from "../../supabase/functions/code-discord/index";
import { COMMAND_NAME, FICHE_COMMAND_NAME, FICHE_OPTION, GAL_GUILD_ID } from "../../supabase/functions/code-discord/index";

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

describe("la commande /fiche", () => {
  const [option] = FICHE_COMMAND.options;

  it("porte les noms qu'attend la fonction serveur", () => {
    expect(FICHE_COMMAND.name).toBe(FICHE_COMMAND_NAME);
    expect(option.name).toBe(FICHE_OPTION);
  });

  it("demande un pseudo, avec des propositions pendant la saisie", () => {
    expect(FICHE_COMMAND.type).toBe(1);
    expect(FICHE_COMMAND.options).toHaveLength(1);
    // 3 : du texte. Les propositions viennent de la fonction serveur, qui lit les fiches du site.
    expect(option).toMatchObject({ type: 3, required: true, autocomplete: true });
  });

  it("tient dans les limites de Discord", () => {
    for (const name of [FICHE_COMMAND.name, option.name]) expect(name).toMatch(/^[a-z0-9_-]{1,32}$/);
    for (const description of [FICHE_COMMAND.description, option.description]) {
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(100);
    }
    expect(option.max_length).toBeLessThanOrEqual(100);
  });

  it("part avec /code et les commandes du robot, chacune à part, sans doublon", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(names).toEqual([CODE_COMMAND.name, FICHE_COMMAND.name, "clan", "records", "carte", "guide", "rival", "moi", "roles"]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("la commande /roles", () => {
  it("porte le nom qu'attend la fonction serveur", () => {
    expect(ROLES_COMMAND.name).toBe(fonction.ROLES_COMMAND);
  });

  it("n'est proposée qu'à qui peut gérer les rôles : le même droit que la fonction vérifie", () => {
    expect(ROLES_COMMAND.default_member_permissions).toBe(MANAGE_ROLES);
    expect(BigInt(MANAGE_ROLES)).toBe(1n << 28n);
    // Seule commande réservée : les autres restent ouvertes à tous les membres.
    expect(COMMANDS.filter((c) => "default_member_permissions" in c).map((c) => c.name)).toEqual(["roles"]);
  });
});

describe("les commandes du robot", () => {
  it("portent les noms et les options qu'attend la fonction serveur", () => {
    expect(CLAN_COMMAND.name).toBe(fonction.CLAN_COMMAND);
    expect(RECORDS_COMMAND.name).toBe(fonction.RECORDS_COMMAND);
    expect(CARTE_COMMAND.name).toBe(fonction.CARTE_COMMAND);
    expect(GUIDE_COMMAND.name).toBe(fonction.GUIDE_COMMAND);
    expect(GUIDE_COMMAND.options[0].name).toBe(fonction.GUIDE_OPTION);
    expect(RIVAL_COMMAND.name).toBe(fonction.RIVAL_COMMAND);
    expect(RIVAL_COMMAND.options[0].name).toBe(fonction.RIVAL_OPTION);
    expect(MOI_COMMAND.name).toBe(fonction.MOI_COMMAND);
  });

  it("tiennent dans les limites de Discord, et chaque option propose pendant la saisie", () => {
    for (const command of COMMANDS) {
      expect(command.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(command.type).toBe(1);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
      for (const option of "options" in command ? command.options : []) {
        expect(option.name).toMatch(/^[a-z0-9_-]{1,32}$/);
        expect(option.description.length).toBeLessThanOrEqual(100);
        expect(option).toMatchObject({ type: 3, required: true, autocomplete: true });
      }
    }
  });
});

describe("Discord qui demande d'attendre", () => {
  it("le script attend ce que dit Discord, sans dépasser trente secondes, et seulement pour une réponse 429", () => {
    expect(retryAfterMs(429, '{"message": "You are being rate limited.", "retry_after": 1.25, "global": false}')).toBe(1250);
    expect(retryAfterMs(429, '{"retry_after": 600}')).toBe(30_000);
    expect(retryAfterMs(429, "illisible")).toBeNull();
    expect(retryAfterMs(429, '{"retry_after": -1}')).toBeNull();
    expect(retryAfterMs(403, '{"retry_after": 1}')).toBeNull();
  });
});

describe("le jeton copié dans le presse-papiers", () => {
  // Des valeurs inventées : le premier morceau d'un jeton est le numéro du robot en base64, les deux autres sont faux.
  const head = (id: string) => btoa(id).replace(/=+$/, "");
  const fake = (id: string) => `${head(id)}.${"G".repeat(6)}.${"c".repeat(38)}`;

  it("est reconnu à son premier morceau, le numéro de l'application, espaces autour compris", () => {
    expect(head(APPLICATION_ID)).toBe("MTQ3MzA1OTA0ODU0NjEwNzQzNA");
    expect(looksLikeBotToken(fake(APPLICATION_ID), APPLICATION_ID)).toBe(true);
    expect(looksLikeBotToken(`  ${fake(APPLICATION_ID)}\r\n`, APPLICATION_ID)).toBe(true);
  });

  it("n'est pas confondu avec le jeton d'une autre application, ni avec une clé d'un autre service", () => {
    expect(looksLikeBotToken(fake(APP), APPLICATION_ID)).toBe(false);
    // La forme d'une ancienne clé de Supabase (un JWT) : trois morceaux aussi, mais pas ce numéro.
    const jwt = `${btoa('{"alg":"HS256","typ":"JWT"}').replace(/=+$/, "")}.${btoa('{"role":"service_role"}').replace(/=+$/, "")}.${"s".repeat(43)}`;
    expect(looksLikeBotToken(jwt, APPLICATION_ID)).toBe(false);
    for (const text of ["", "pas un jeton", "https://discord.com/developers/applications", `${head(APPLICATION_ID)}.${"c".repeat(38)}`, `${fake(APPLICATION_ID)} ${fake(APPLICATION_ID)}`, `${head(APPLICATION_ID)}.GG.${"c".repeat(38)}`, `${"A".repeat(26)}.${"b".repeat(6)}.${"c".repeat(38)}`]) {
      expect(looksLikeBotToken(text, APPLICATION_ID), text).toBe(false);
    }
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
