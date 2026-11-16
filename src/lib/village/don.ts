/**
 * Le don de statères : le panneau d'un seul compte (migration `20261117000200_don_de_stateres.sql`, docs/DIRECTION.md,
 * « Le don de statères »). Le serveur décide qui y a droit : pour tout autre compte il répond `permis: false`, et l'onglet
 * Village de la Direction ne montre rien.
 */
/** `numero` : le numéro de Gaulois du compte, qui distingue deux membres au même nom. */
export type MembreDuDon = { id: string; nom: string; numero: number };
export type DonFait = { le: string; nom: string; montant: number; motif: string | null };
export type PanneauDuDon = { permis: false } | { permis: true; plafond: number; membres: MembreDuDon[]; dons: DonFait[] };

/** Le nom d'un membre dans la liste et dans la confirmation : jamais sans son numéro. */
export const nomDuMembre = (m: MembreDuDon): string => `${m.nom} (Gaulois n° ${m.numero})`;

/** Le plus long motif que le serveur accepte. */
export const MOTIF_MAX = 80;

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estEntierPositif = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La réponse de `get_stateres_don` ou de `donner_stateres`. `null` : illisible. */
export function lirePanneauDuDon(raw: unknown): PanneauDuDon | null {
  if (!estObjet(raw) || raw["ok"] !== true || typeof raw["permis"] !== "boolean") return null;
  if (!raw["permis"]) return { permis: false };
  const { plafond, membres, dons } = raw;
  if (!estEntierPositif(plafond) || !Array.isArray(membres) || !Array.isArray(dons)) return null;
  const lusMembres: MembreDuDon[] = [];
  for (const m of membres) {
    if (!estObjet(m) || typeof m["id"] !== "string" || !UUID.test(m["id"]) || typeof m["nom"] !== "string" || m["nom"].trim() === "" || !estEntierPositif(m["numero"])) return null;
    lusMembres.push({ id: m["id"], nom: m["nom"], numero: m["numero"] });
  }
  const lusDons: DonFait[] = [];
  for (const d of dons) {
    if (!estObjet(d) || typeof d["le"] !== "string" || Number.isNaN(Date.parse(d["le"])) || typeof d["nom"] !== "string" || !estEntierPositif(d["montant"])) return null;
    const motif = d["motif"];
    if (motif !== null && motif !== undefined && typeof motif !== "string") return null;
    lusDons.push({ le: d["le"], nom: d["nom"], montant: d["montant"], motif: typeof motif === "string" && motif !== "" ? motif : null });
  }
  return { permis: true, plafond, membres: lusMembres, dons: lusDons };
}

/**
 * Le montant tapé : un nombre entier de 1 au plafond, écrit en chiffres, avec ou sans espaces entre les milliers.
 * `null` : pas un montant que le serveur accepterait.
 */
export function lireMontantDuDon(tape: string, plafond: number): number | null {
  const net = tape.replace(/[\s  ]/g, "");
  if (!/^[0-9]{1,7}$/.test(net)) return null;
  const n = Number(net);
  return n >= 1 && n <= plafond ? n : null;
}
