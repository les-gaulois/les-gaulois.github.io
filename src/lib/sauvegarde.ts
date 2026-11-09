/**
 * La sauvegarde chiffrée des données du serveur de connexion. Le dépôt est public, et les fichiers de ses Actions
 * aussi : n'importe quel compte GitHub peut télécharger une sauvegarde. Elle n'en sort donc que chiffrée, et ne
 * contient que le nécessaire (voir `export_site`).
 *
 * Format, version 1 : « GALSAUV1 », les réglages de scrypt (log2 N, r, p : un octet chacun), le sel (16 octets),
 * le vecteur d'initialisation (12), l'étiquette (16), puis le texte chiffré. Tout l'en-tête est authentifié avec
 * le contenu (AES-256-GCM, données associées) : modifier un seul octet rend le fichier illisible.
 * La clé vient de la phrase de passe de la direction par scrypt, réglé lent exprès (N = 2^18, environ une demi-seconde) :
 * deviner la phrase hors ligne coûte cher. Sans la phrase, personne ne peut lire une sauvegarde : la perdre, c'est les perdre.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("GALSAUV1", "ascii");
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + 3 + SALT + IV;

/** Une phrase plus courte, ou faite de peu de lettres différentes, se devine trop vite. */
export const MIN_PASSPHRASE = 20;
export const MIN_DISTINCT = 12;

/** Les réglages de scrypt écrits dans chaque fichier : un fichier se rouvre avec ceux qu'il porte. */
export interface ScryptSettings {
  logN: number;
  r: number;
  p: number;
}
export const SCRYPT: ScryptSettings = { logN: 18, r: 8, p: 1 };

export class BackupError extends Error {}

/** La phrase telle qu'elle compte : sans espace autour, en forme Unicode normale. Un retour à la ligne collé dans le secret ne change rien. */
export const cleanPassphrase = (passphrase: string) => passphrase.trim().normalize("NFC");

/** Ce qui rend une phrase trop faible pour chiffrer, dit en français. `null` : elle convient. */
export function passphraseProblem(passphrase: string): string | null {
  const clean = cleanPassphrase(passphrase);
  if (clean.length < MIN_PASSPHRASE) return `La phrase de passe doit faire au moins ${MIN_PASSPHRASE} caractères.`;
  if (new Set(clean.toLowerCase()).size < MIN_DISTINCT) return "La phrase de passe est trop simple : tirez-la au hasard, avec le générateur d'un gestionnaire de mots de passe.";
  return null;
}

function keyOf(passphrase: string, salt: Buffer, { logN, r, p }: ScryptSettings): Buffer {
  if (logN < 14 || logN > 22 || r < 1 || r > 32 || p < 1 || p > 4) throw new BackupError("Réglages de chiffrement inattendus : ce fichier n'est pas une sauvegarde du site.");
  const N = 2 ** logN;
  // scrypt demande 128 × N × r octets : on lui en laisse le double.
  return scryptSync(cleanPassphrase(passphrase), salt, 32, { N, r, p, maxmem: 256 * N * r });
}

/** Compresse puis chiffre. `random` et `settings` servent aux tests : par défaut, un hasard cryptographique et les réglages ci-dessus. */
export function seal(plain: Buffer, passphrase: string, random: (size: number) => Buffer = randomBytes, settings: ScryptSettings = SCRYPT): Buffer {
  const problem = passphraseProblem(passphrase);
  if (problem) throw new BackupError(problem);
  const salt = random(SALT);
  const iv = random(IV);
  const header = Buffer.concat([MAGIC, Buffer.from([settings.logN, settings.r, settings.p]), salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", keyOf(passphrase, salt, settings), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), body]);
}

/** Déchiffre puis décompresse. Une phrase fausse ou un fichier modifié lèvent une BackupError. */
export function open(sealed: Buffer, passphrase: string): Buffer {
  if (sealed.length < HEADER + TAG || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError("Ce fichier n'est pas une sauvegarde du site.");
  const header = sealed.subarray(0, HEADER);
  const [logN = 0, r = 0, p = 0] = header.subarray(MAGIC.length, MAGIC.length + 3);
  const salt = header.subarray(MAGIC.length + 3, MAGIC.length + 3 + SALT);
  const iv = header.subarray(MAGIC.length + 3 + SALT, HEADER);
  const tag = sealed.subarray(HEADER, HEADER + TAG);
  const decipher = createDecipheriv("aes-256-gcm", keyOf(passphrase, salt, { logN, r, p }), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(sealed.subarray(HEADER + TAG)), decipher.final()]));
  } catch {
    throw new BackupError("Phrase de passe fausse, ou fichier abîmé.");
  }
}

/** Le nom du fichier d'une sauvegarde : son jour, en temps universel. */
export const backupName = (now: Date) => `gal-sauvegarde-${now.toISOString().slice(0, 10)}.bin`;

/** Le nombre de lignes de chaque table d'une sauvegarde ouverte, sans aucune donnée : « profiles 12, polls 2 ». */
export function backupSummary(content: unknown): string {
  if (typeof content !== "object" || content === null || Array.isArray(content)) throw new BackupError("Le contenu de la sauvegarde est illisible.");
  return Object.entries(content)
    .filter(([, value]) => Array.isArray(value))
    .map(([table, value]) => `${table} ${(value as unknown[]).length}`)
    .join(", ");
}

/**
 * L'heure, en temps universel, où commence le lundi d'une semaine de sauvegarde : 7 h, soit 8 h ou 9 h à Paris.
 * Après les heures de silence : le compte rendu sur le salon de l'encadrement ne part jamais la nuit.
 */
export const BACKUP_WEEK_START_HOUR_UTC = 7;

/** Combien de jours GitHub garde une sauvegarde : `retention-days` de `.github/workflows/sauvegarde.yml`. */
export const BACKUP_RETENTION_DAYS = 90;

/** Le début de la semaine de sauvegarde en cours : le dernier lundi à 7 h UTC passé. */
export function backupWeekStart(now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), BACKUP_WEEK_START_HOUR_UTC));
  // Jours écoulés depuis lundi : lundi 0, dimanche 6.
  start.setUTCDate(start.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  if (start.getTime() > now.getTime()) start.setUTCDate(start.getUTCDate() - 7);
  return start;
}
