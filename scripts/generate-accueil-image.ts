/**
 * Dessine l'image d'aperçu de l'accueil dans public/generated/accueil.png : c'est elle que Discord montre quand on colle le
 * lien du site. Le rang du clan au classement officiel et le podium de la dernière gazette, comme sur la page, redessinés à
 * chaque construction, donc à chaque collecte. Sans classement ni gazette, rien n'est dessiné et l'accueil garde l'image du
 * site. Un pseudo que les polices ne savent pas écrire n'arrête jamais la construction : l'accueil garde alors l'image du site.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { clan } from "../config/clan";
import { ACCUEIL_IMAGE, accueilCard, accueilFacts, accueilRanking } from "../src/lib/accueil-image";
import { loadHistory, loadLeaderboard, loadMembers, loadMemberWeeks, loadMeta, loadSessions, loadTerritoryReadings } from "../src/lib/data";
import { gazetteEditions } from "../src/lib/gazette";
import { GazetteFonts, renderGazetteCard } from "../src/lib/gazette-image";

const out = join("public", ACCUEIL_IMAGE);
rmSync(out, { force: true });

// La même gazette que l'accueil et la page Gazette.
const meta = loadMeta();
const edition =
  gazetteEditions({
    sessions: loadSessions(),
    history: loadHistory(),
    territory: loadTerritoryReadings(),
    weekTops: loadMemberWeeks().tops,
    members: loadMembers(),
    archiveStart: clan.archiveStart,
    completeThrough: meta.sessions.completeThrough,
  })[0] ?? null;
const facts = accueilFacts(accueilRanking(loadLeaderboard(), clan.tag), edition);

if (!facts) {
  console.log("Accueil : ni classement ni gazette collectés, pas d'image d'aperçu.");
} else {
  try {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const png = await renderGazetteCard(accueilCard(facts, clan.tag, clan.name, clan.tagline, clan.links.site, fonts.width), fonts, root);
    mkdirSync(dirname(out), { recursive: true });
    // Des aplats et du texte : une palette suffit, et divise le poids par deux.
    writeFileSync(out, await sharp(png).png({ palette: true, compressionLevel: 9 }).toBuffer());
    console.log("Accueil : image d'aperçu dessinée.");
  } catch (e) {
    // Les pseudos ne sont pas écrits dans le journal : ils peuvent contenir n'importe quoi.
    console.log(`Accueil : image d'aperçu sautée (${e instanceof Error ? e.message : "erreur inconnue"}), l'accueil garde l'image du site.`);
  }
}
