import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, errorMessage } from "../../src/lib/compte/errors";

// Les migrations des comptes, des rôles et de la Direction : les seules fonctions que le site appelle encore.
const SQL = ["20261105000100_comptes_et_roles", "20261105000200_validation_des_membres", "20261105000900_direction", "20261106000100_roles_prevus", "20261108000100_pastille_direction", "20261108000200_vie_du_clan", "20261109000100_qg_des_membres", "20261109000200_gaulois_de_la_semaine", "20261109000300_appels_aux_salons", "20261109000400_refaire_la_demande", "20261110000100_appels_sans_format", "20261111000100_appels_sur_discord", "20261111000200_appels_discord_ping_au_choix", "20261111000300_salons_discord", "20261111000400_outils_du_qg", "20261111000600_messages_discord", "20261112000100_messages_discord_images_en_grand", "20261112000200_inventaire_images_discord", "20261112000300_inventaire_200_images", "20261112000500_connexion_par_code", "20261113000400_alliances_sur_la_carte", "20261113000500_allies_acceptes_par_l_encadrement", "20261113000600_zones_sans_chevauchement", "20261113000700_allies_dessinent_leurs_zones", "20261113001000_zones_etats_epingle_annonces", "20261113001100_zones_des_allies_acceptees", "20261113001700_village_des_gaulois_vestiaire", "20261113001800_village_stateres"]
  .map((name) => readFileSync(`supabase/migrations/${name}.sql`, "utf8"))
  .join("\n");

describe("les refus du serveur", () => {
  it("ont tous un message en français", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    // Les noms courts tapés par un joueur passent par internal.clean_label, qui reçoit son code de refus en dernier.
    for (const m of SQL.matchAll(/internal\.clean_label\(p_\w+, \d+, \d+, '([a-z_]+)'\)/g)) codes.add(m[1]!);
    expect(codes.size).toBeGreaterThan(20);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });

  it("restent lisibles pour un code inconnu", () => {
    expect(errorMessage("code_inconnu")).toBe("Une erreur inattendue est survenue.");
  });
});
