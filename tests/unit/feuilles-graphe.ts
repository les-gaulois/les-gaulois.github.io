// Outils du contrôle des feuilles de style (tests/unit/feuilles.test.ts) : ce qu'une page peut afficher, et ce que chaque
// règle demande pour toucher un élément. Tout est volontairement large : dans le doute, une règle « peut toucher » la page,
// et son morceau doit y être chargé. Voir docs/DESIGN.md, « Les feuilles de style, en morceaux ».
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { FEUILLES } from "../../src/lib/feuilles";

// ---------- Les morceaux ----------

export const DOSSIER_FEUILLES = "src/styles/feuilles";
/** L'en-tête d'un morceau qui n'est pas le socle (fins de ligne ramenées à « \n ») : un commentaire, puis la référence au socle. */
export const ENTETE_MORCEAU = /^\/\*[^\n]*\*\/\n@reference "\.\/01-socle\.css";\n/;
export const feuilleSansEntete = (t: string) => t.replace(ENTETE_MORCEAU, "");

/**
 * La feuille du site entière : ses morceaux bout à bout, dans l'ordre de la cascade, sans leurs en-têtes, fins de ligne en
 * « \n ». C'est, règle pour règle, l'ancienne feuille unique : les tests qui la lisaient (thème clair, lettrine, statère)
 * gardent leurs exigences.
 */
export function feuilleEntiere(): string {
  return FEUILLES.map((f) => feuilleSansEntete(readFileSync(join(DOSSIER_FEUILLES, f.fichier), "utf8").replace(/\r\n/g, "\n"))).join("");
}

// ---------- La feuille : ses règles, une par une ----------

export interface RegleStyle {
  genre: "style";
  selecteurs: string[];
  corps: string;
  ligne: number;
  contexte: string[];
}
export interface RegleBloc {
  genre: "keyframes" | "property" | "font-face" | "autre";
  nom: string;
  corps: string;
  ligne: number;
  contexte: string[];
}
export type Regle = RegleStyle | RegleBloc;

const CONTENEURS = new Set(["@media", "@supports", "@container", "@layer", "@scope", "@starting-style", "@document"]);

/** Saute une chaîne ouverte en s[i] (guillemet simple ou double) : l'indice qui suit sa fermeture. */
function apresChaine(s: string, i: number): number {
  const q = s[i];
  i++;
  while (i < s.length && s[i] !== q) i += s[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** Le premier caractère de `arrets` au niveau 0 (hors chaînes, commentaires, parenthèses et crochets), ou -1. */
function chercher(s: string, i: number, arrets: string, fin = s.length): number {
  let prof = 0;
  while (i < fin) {
    const c = s[i]!;
    if (c === '"' || c === "'") {
      i = apresChaine(s, i);
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const f = s.indexOf("*/", i + 2);
      i = f < 0 ? s.length : f + 2;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (prof === 0 && arrets.includes(c)) return i;
    if (c === "(" || c === "[") prof++;
    else if (c === ")" || c === "]") prof--;
    i++;
  }
  return -1;
}

function finDeBloc(s: string, i: number): number {
  let prof = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'") {
      i = apresChaine(s, i);
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const f = s.indexOf("*/", i + 2);
      i = f < 0 ? s.length : f + 2;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "{") prof++;
    else if (c === "}" && --prof === 0) return i;
    i++;
  }
  throw new Error("bloc non fermé");
}

/** Découpe au niveau 0 (hors chaînes et parenthèses) : les sélecteurs d'une liste, les déclarations d'un bloc. */
export function decouper(s: string, sep: string): string[] {
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const j = chercher(s, i, sep);
    if (j < 0) {
      parts.push(s.slice(i));
      return parts;
    }
    parts.push(s.slice(i, j));
    i = j + 1;
  }
}

/** Un texte de feuille sans ses commentaires, chaque caractère d'un commentaire remplacé par une espace (les lignes restent). */
export const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
const net = (t: string) => sansCommentaires(t).replace(/\s+/g, " ").trim();

/** Les règles d'une feuille source, dans l'ordre, avec leur ligne. */
export function regles(css: string): Regle[] {
  const sortie: Regle[] = [];
  const debutsLignes = [0];
  for (let k = 0; k < css.length; k++) if (css[k] === "\n") debutsLignes.push(k + 1);
  const ligneDe = (i: number) => {
    let a = 0;
    let b = debutsLignes.length - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (debutsLignes[m]! <= i) a = m;
      else b = m - 1;
    }
    return a + 1;
  };
  function parcourir(debut: number, fin: number, contexte: string[]) {
    let i = debut;
    for (;;) {
      for (;;) {
        while (i < fin && /\s/.test(css[i]!)) i++;
        if (css.startsWith("/*", i)) i = css.indexOf("*/", i + 2) + 2;
        else break;
      }
      if (i >= fin) return;
      const j = chercher(css, i, "{;}", fin);
      if (j < 0) throw new Error(`fin inattendue, ligne ${ligneDe(i)}`);
      const prelude = net(css.slice(i, j));
      if (css[j] === ";") {
        sortie.push({ genre: "autre", nom: prelude, corps: "", ligne: ligneDe(i), contexte });
        i = j + 1;
        continue;
      }
      if (css[j] === "}") throw new Error(`« } » inattendue, ligne ${ligneDe(j)}`);
      const f = finDeBloc(css, j);
      if (prelude.startsWith("@")) {
        const nom = prelude.match(/^@[\w-]+/)![0].toLowerCase();
        const reste = prelude.slice(nom.length).trim();
        if (CONTENEURS.has(nom)) parcourir(j + 1, f, [...contexte, prelude]);
        else {
          const genre = nom === "@keyframes" ? "keyframes" : nom === "@property" ? "property" : nom === "@font-face" ? "font-face" : "autre";
          sortie.push({ genre, nom: genre === "autre" ? prelude : reste, corps: css.slice(j + 1, f), ligne: ligneDe(i), contexte });
        }
      } else {
        sortie.push({ genre: "style", selecteurs: decouper(prelude, ",").map((s) => s.trim()), corps: css.slice(j + 1, f), ligne: ligneDe(i), contexte });
      }
      i = f + 1;
    }
  }
  parcourir(0, css.length, []);
  return sortie;
}

// ---------- Ce qu'un sélecteur demande ----------

/**
 * Une exigence d'un sélecteur : une classe, un identifiant, un attribut data-*, la valeur d'un attribut data-*, ou l'une
 * des branches d'un `:is()`, d'un `:where()` ou d'un `:has()` (chaque branche : toutes ses exigences à la fois).
 */
export type Exigence =
  | { genre: "classe" | "id" | "attribut"; nom: string }
  | { genre: "valeur"; nom: string; valeur: string }
  | { genre: "ou"; branches: Exigence[][] };

// Un identifiant CSS : lettres, chiffres, « - », « _ », caractères hors ASCII et caractères échappés.
const IDENT = /^-?-?(?:[A-Za-z_]|(?!\s)[^ -~]|\\.)(?:[\w-]|(?!\s)[^ -~]|\\.)*/;
const lireIdent = (s: string, i: number) => IDENT.exec(s.slice(i))?.[0] ?? "";
const sansEchappement = (t: string) => t.replace(/\\(.)/g, "$1");

/**
 * Les exigences d'un sélecteur complet : tout ce qui doit être dans la page pour qu'il touche un élément. Volontairement
 * moins qu'il ne faut, jamais plus : `:not()` et les attributs du navigateur (`[open]`, `[aria-…]`, `[type]`) ne demandent
 * rien ; `:is()`, `:where()` et `:has()` demandent l'une de leurs branches.
 */
const cacheExigences = new Map<string, Exigence[]>();
export function exigences(selecteur: string): Exigence[] {
  let e = cacheExigences.get(selecteur);
  if (!e) cacheExigences.set(selecteur, (e = exigencesDe(selecteur)));
  return e;
}
function exigencesDe(selecteur: string): Exigence[] {
  const sortie: Exigence[] = [];
  let i = 0;
  const s = selecteur;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'") {
      i = apresChaine(s, i);
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "." || c === "#") {
      const nom = lireIdent(s, i + 1);
      if (nom) sortie.push({ genre: c === "." ? "classe" : "id", nom: sansEchappement(nom) });
      i += 1 + nom.length;
      continue;
    }
    if (c === "[") {
      const f = chercher(s, i + 1, "]");
      const dedans = s.slice(i + 1, f < 0 ? s.length : f).trim();
      const m = /^([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*[is]?$/i.exec(dedans);
      if (m && m[1]!.toLowerCase().startsWith("data-")) {
        const nom = m[1]!.toLowerCase();
        sortie.push({ genre: "attribut", nom });
        const valeur = m[3] ?? m[4] ?? m[5];
        if ((m[2] === "=" || m[2] === "~=") && valeur !== undefined && /^[\w-]+$/.test(valeur)) sortie.push({ genre: "valeur", nom, valeur });
      }
      i = f < 0 ? s.length : f + 1;
      continue;
    }
    if (c === ":") {
      const double = s[i + 1] === ":";
      const nom = lireIdent(s, i + (double ? 2 : 1)).toLowerCase();
      i += (double ? 2 : 1) + nom.length;
      if (s[i] === "(") {
        const f = chercher(s, i + 1, ")");
        const dedans = s.slice(i + 1, f < 0 ? s.length : f);
        if (!double && ["is", "where", "matches", "-webkit-any", "-moz-any", "has"].includes(nom)) {
          // L'une des branches. Une branche sans exigence peut toujours toucher : le tout ne demande alors rien.
          const branches = decouper(dedans, ",").map((b) => exigences(b.trim().replace(/^[>+~]\s*/, "")));
          if (branches.every((b) => b.length > 0)) sortie.push({ genre: "ou", branches });
        }
        i = f < 0 ? s.length : f + 1;
      }
      continue;
    }
    i++;
  }
  return sortie;
}

// ---------- Ce qu'une page peut afficher ----------

/** Des noms qu'une page peut écrire : tels quels, ou construits. */
export interface Mots {
  mots: Set<string>;
  /** Le début d'un nom construit (`"rarete-" + r`) : tout nom qui commence ainsi est possible. */
  debuts: Set<string>;
  /** La fin d'un nom construit (`x + "-actif"`). */
  fins: Set<string>;
  /** Un gabarit (`dir-${ton}`, `dm-e${e}-date`) : tout nom de cette forme est possible. */
  motifs: Set<string>;
}
/**
 * Ce qu'une page peut écrire dans son balisage. Ce que le code écrit hors d'un attribut peut être n'importe quoi :
 * classe, identifiant, attribut data-* ou valeur. Ce qui n'est écrit que dans un attribut `id` n'est qu'un identifiant,
 * et ce qui n'est écrit que comme valeur d'un attribut data-* (`data-testid={`${x}-texte`}`) n'est qu'une valeur.
 */
export interface Jetons extends Mots {
  ids: Mots;
  valeurs: Mots;
}
const motsVides = (): Mots => ({ mots: new Set(), debuts: new Set(), fins: new Set(), motifs: new Set() });
export const jetonsVides = (): Jetons => ({ ...motsVides(), ids: motsVides(), valeurs: motsVides() });
function verser(a: Mots, b: Mots) {
  for (const k of ["mots", "debuts", "fins", "motifs"] as const) for (const m of b[k]) a[k].add(m);
}
function fusionner(a: Jetons, b: Jetons) {
  verser(a, b);
  verser(a.ids, b.ids);
  verser(a.valeurs, b.valeurs);
}

/** Où vont les mots d'un texte : un ou plusieurs seaux ; `tiret` : ce seau ne prend que les noms à trait d'union. */
type Destination = { m: Mots; tiret?: boolean }[];
const versDestination = (d: Mots | Destination): Destination => ("mots" in d ? [{ m: d }] : d);

const MOT = /[\w-]+/g;
/**
 * Les mots d'un texte, coupés à tout ce qui n'est ni lettre, ni chiffre, ni « - », ni « _ » (`"06-carte.css"` donne
 * « 06-carte » et « css »). Un mot qui finit par un trait d'union (`"rarete-"`, dans `"rarete-" + r`) est un début de nom
 * construit ; un mot qui commence par un seul (`"-actif"`), une fin.
 */
function motsDe(texte: string, d: Mots | Destination) {
  const dest = versDestination(d);
  for (const m of texte.matchAll(MOT)) {
    const mot = m[0];
    if (/^-*$/.test(mot)) continue;
    for (const { m: j, tiret } of dest) {
      if (tiret && !mot.includes("-")) continue;
      if (mot.endsWith("-") && /[A-Za-z]{2}/.test(mot)) j.debuts.add(mot);
      if (/^-[A-Za-z]/.test(mot) && /[A-Za-z]{2}/.test(mot)) j.fins.add(mot);
      j.mots.add(mot);
    }
  }
}

/**
 * Une phrase à lire, pas une liste de classes : plusieurs mots, et une majuscule en tête de mot, une lettre accentuée, une
 * apostrophe ou une ponctuation de fin. Les classes du site sont en minuscules ASCII, sans apostrophe : une phrase ne
 * sert jamais d'attribut `class`. Un mot seul, lui, compte toujours (« forêt » peut être une valeur de `data-lieu`).
 */
export function estPhrase(t: string): boolean {
  if (!/\S\s+\S/.test(t)) return false;
  return (
    /(^|[\s(«"])[A-Z][a-z]/.test(t) ||
    /[À-ÖØ-öø-ÿŒœ’«»…]/.test(t) ||
    /[A-Za-z]'[A-Za-z]/.test(t) ||
    /[a-z][.;!?](\s|$)/.test(t) ||
    t.split(/\s+/).some((m) => MOTS_OUTILS.has(m))
  );
}
/**
 * Des mots qui ne servent qu'à faire des phrases : une chaîne de plusieurs mots qui en contient un est un texte à lire
 * (« de la carte des clans »). Aucun n'est une classe ni une valeur lue par la feuille (feuilles.test.ts le vérifie).
 */
export const MOTS_OUTILS = new Set(["de", "la", "le", "les", "des", "du", "un", "une", "et", "au", "aux", "sur", "par", "pour", "avec", "dans", "est", "sont", "qui", "que", "il", "elle", "nous", "vous", "ou", "ce", "cette", "ces", "son", "sa", "ses", "leur", "leurs"]);
/**
 * Une adresse, un chemin ou une ancre (`/carte`, `../lib/x`, `https://…`, `#comptes`) : ses mots ne sont pas des classes.
 * Une ancre seule désigne un identifiant écrit ailleurs, dans un attribut `id`, qui compte là.
 */
const estChemin = (t: string) => /^(\/|\.{1,2}\/|[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|data:)/i.test(t.trim()) || /^#[\w-]+$/.test(t.trim());

/** Les mots d'une chaîne du code ou d'une valeur d'attribut : rien pour une phrase ou un chemin. */
function motsDeChaine(texte: string, j: Mots | Destination) {
  if (estPhrase(texte) || estChemin(texte)) return;
  motsDe(texte, j);
}

/** Le repère d'une expression dans un gabarit, le temps d'en lire les mots. */
const TROU = "§";
const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Les mots d'un gabarit `…${x}…` : ceux qui ne touchent pas une expression comptent tels quels ; ceux qui en touchent une
 * donnent un motif (`dir-${ton}` : tout nom qui commence par « dir- » ; `dm-e${e}-date` : « dm-e…-date »). Un motif qui
 * n'écrit pas deux lettres à lui, ou pas trois sans trait d'union à la jointure (`${n}e`, `${h}h`, `${a}-${b}`), est une
 * date, une clé ou un nombre, pas une classe : il est ignoré (le test le dit dans docs/DESIGN.md).
 */
function motsDuGabarit(morceaux: string[], d: Mots | Destination) {
  if (estPhrase(morceaux.join(" ")) || estChemin(morceaux[0] ?? "")) return;
  const texte = morceaux.join(TROU);
  for (const m of texte.matchAll(/[\w§-]+/g)) {
    const mot = m[0];
    if (!mot.includes(TROU)) {
      motsDe(mot, d);
      continue;
    }
    const parts = mot.split(TROU);
    const lettres = parts.join("").replace(/[^A-Za-z]/g, "").length;
    const jointure = parts.some((p, k) => (k < parts.length - 1 && /[-_]$/.test(p)) || (k > 0 && /^[-_]/.test(p)));
    if (lettres < 2 || (lettres < 3 && !jointure)) continue;
    for (const { m: j, tiret } of versDestination(d)) if (!tiret || mot.includes("-")) j.motifs.add(`^${parts.map(echapper).join(".*")}$`);
  }
}

const kebab = (nom: string) => nom.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

/** Les attributs dont la valeur est un identifiant : ce qu'ils écrivent n'est ni une classe ni une valeur data-*. */
const ATTRIBUTS_ID = new Set(["id"]);
/**
 * Les attributs dont la valeur n'est jamais une classe, un identifiant ou une valeur data-* lue par la feuille : un texte
 * à lire, une adresse, un renvoi vers un identifiant écrit ailleurs, un dessin, un style en ligne.
 */
const ATTRIBUTS_SANS_NOMS = new Set([
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-owns",
  "aria-activedescendant",
  "aria-details",
  "aria-errormessage",
  "aria-valuetext",
  "aria-roledescription",
  "alt",
  "title",
  "placeholder",
  "href",
  "src",
  "srcset",
  "for",
  "htmlFor",
  "key",
  "style",
  "d",
  "points",
  "viewBox",
  "transform",
  "datetime",
  "dateTime",
]);
type Cible = "partout" | "id" | "valeur" | "classe";
const cibleDeLAttribut = (nom: string): Cible | null =>
  ATTRIBUTS_SANS_NOMS.has(nom) ? null : ATTRIBUTS_ID.has(nom) ? "id" : /^data-/.test(nom) ? "valeur" : /^(class|className|class:list)$/.test(nom) ? "classe" : "partout";
/**
 * Le seau d'un mot. Dans un fichier de calcul (un .ts qui ne touche pas à la page), un mot sans trait d'union (« carte »,
 * « pixels ») est une donnée : il peut devenir la valeur d'un attribut data-* ou un identifiant, pas une classe. Les classes
 * du site qui viennent d'un calcul ont un trait d'union (`rarete-epique`, `dir-ok`).
 */
const seau = (j: Jetons, c: Cible, calcul: boolean): Destination =>
  c === "id" ? [{ m: j.ids }] : c === "valeur" ? [{ m: j.valeurs }] : calcul ? [{ m: j.valeurs }, { m: j.ids }, { m: j, tiret: true }] : [{ m: j }];

/**
 * Un fichier .ts qui touche à la page (document, classes, attributs, balisage écrit dans une chaîne) ; sinon, c'est un
 * fichier de calcul. Dans le doute (le mot « document » dans un commentaire), il touche à la page : ses mots comptent tous.
 */
export const toucheLaPage = (code: string) =>
  /\b(document|window|globalThis|HTMLElement|Element)\b|classList|className|\bdataset\b|setAttribute|toggleAttribute|innerHTML|outerHTML|insertAdjacentHTML|createElement|querySelector|getElementById|getElementsBy|\.closest\(|\.matches\(|\bclass\s*=|\bid\s*=\s*["'`]|\bdata-[\w-]+\s*=/.test(code);

/** Le chemin d'un import (`import x from "…"`, `import("…")`, `import.meta.glob("…")`) n'est pas du balisage. */
function estSpecifiant(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isCallExpression(p) && (p.expression.kind === ts.SyntaxKind.ImportKeyword || /^(require|import\.meta\.glob)$/.test(p.expression.getText()))) return true;
  if (ts.isArrayLiteralExpression(p) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression.getText() === "import.meta.glob") return true;
  return false;
}

/**
 * Les jetons d'un code TypeScript ou TSX : chaînes, gabarits, noms d'attributs JSX, clés d'objets données dans un attribut
 * de classe (`class:list={{ actif: x }}`), propriétés de `dataset`. Le texte d'un élément JSX n'est pas lu, ni les clés
 * d'un objet ordinaire (des noms de champs, pas des classes).
 */
function jetonsDuCode(code: string, nomFichier: string, j: Jetons, cibleDepart: Cible = "partout", calcul = false) {
  const source = ts.createSourceFile(nomFichier, code, ts.ScriptTarget.Latest, true, /\.(tsx|jsx)$/.test(nomFichier) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visiter = (n: ts.Node, cible: Cible): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!estSpecifiant(n)) motsDeChaine(n.text, seau(j, cible, calcul));
      return;
    }
    if (ts.isTemplateExpression(n)) {
      motsDuGabarit([n.head.text, ...n.templateSpans.map((s) => s.literal.text)], seau(j, cible, calcul));
      for (const s of n.templateSpans) visiter(s.expression, cible);
      return;
    }
    if (ts.isJsxAttribute(n)) {
      const nom = n.name.getText(source);
      // L'attribut d'un composant (`<MondeCarte comptes={…}>`) n'est pas un attribut de la page : son nom ne compte pas (sauf
      // un data-*, qu'il peut reposer tel quel sur un élément), et sa valeur peut devenir n'importe quoi plus loin, sauf un
      // texte à lire ou une adresse.
      const balise = n.parent.parent;
      const composant = (ts.isJsxOpeningElement(balise) || ts.isJsxSelfClosingElement(balise)) && /^[A-Z]|\./.test(balise.tagName.getText(source));
      if (!composant || nom.startsWith("data-")) motsDe(nom, j);
      const c = cibleDeLAttribut(nom);
      if (n.initializer && c) visiter(n.initializer, composant && c !== "classe" ? "partout" : c);
      return;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "getElementById" && n.arguments[0]) {
      visiter(n.expression, cible);
      visiter(n.arguments[0], "id");
      return;
    }
    if (ts.isJsxText(n)) return;
    // Ce que le code écrit dans un attribut : `el.dataset.pose = "marche"` est une valeur, `el.id = …` un identifiant,
    // `setAttribute("aria-label", …)` rien qui compte.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left)) {
      const gauche = n.left;
      const c = /(^|\.)dataset$/.test(gauche.expression.getText(source)) ? "valeur" : gauche.name.text === "id" ? "id" : null;
      if (c) {
        visiter(gauche, cible);
        visiter(n.right, c);
        return;
      }
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "setAttribute" && n.arguments.length === 2 && ts.isStringLiteral(n.arguments[0]!)) {
      const nom = n.arguments[0].text;
      motsDe(nom, j);
      const c = cibleDeLAttribut(nom);
      visiter(n.expression, cible);
      if (c) visiter(n.arguments[1]!, c);
      return;
    }
    if (cible === "classe" && (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && ts.isIdentifier(n.name)) motsDe(n.name.text, j);
    if (ts.isPropertyAccessExpression(n) && /(^|\.)dataset$/.test(n.expression.getText(source))) motsDe(`data-${kebab(n.name.text)}`, j);
    ts.forEachChild(n, (e) => visiter(e, cible));
  };
  visiter(source, cibleDepart);
}

/** L'indice qui suit l'accolade fermante de l'expression ouverte en s[i] === "{", chaînes et gabarits compris. */
function finExpression(s: string, i: number): number {
  let prof = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'") {
      i = apresChaine(s, i);
      continue;
    }
    if (c === "`") {
      i++;
      while (i < s.length && s[i] !== "`") {
        if (s[i] === "\\") i += 2;
        else if (s[i] === "$" && s[i + 1] === "{") i = finExpression(s, i + 1);
        else i++;
      }
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const f = s.indexOf("*/", i + 2);
      i = f < 0 ? s.length : f + 2;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      const f = s.indexOf("\n", i);
      i = f < 0 ? s.length : f;
      continue;
    }
    if (c === "{") prof++;
    else if (c === "}" && --prof === 0) return i + 1;
    i++;
  }
  return s.length;
}

/**
 * Le gabarit d'un composant .astro : les balises (noms d'attributs, valeurs, expressions) et les expressions {…} comptent ;
 * le texte affiché entre les balises, non.
 */
function jetonsGabarit(g: string, nomFichier: string, j: Jetons) {
  let i = 0;
  while (i < g.length) {
    const c = g[i]!;
    if (c === "{") {
      const f = finExpression(g, i);
      jetonsDuCode(`(${g.slice(i + 1, f - 1)}\n)`, nomFichier, j);
      i = f;
      continue;
    }
    if (c === "<" && /[A-Za-z]/.test(g[i + 1] ?? "")) {
      // Une balise ouvrante : son nom, puis ses attributs jusqu'au « > » qui la ferme.
      const balise = /^[\w:.-]+/.exec(g.slice(i + 1))?.[0] ?? "";
      // Un composant (`<Fenetre id=…>`) : ses attributs ne sont pas ceux de la page, comme dans le code TSX.
      const composant = /^[A-Z]|\./.test(balise);
      let k = i + 1 + balise.length;
      while (k < g.length && g[k] !== ">") {
        const d = g[k]!;
        if (/\s|\//.test(d)) {
          k++;
          continue;
        }
        if (d === "{") {
          // `{...props}` ou `{prop}` : une expression.
          const f = finExpression(g, k);
          jetonsDuCode(`(${g.slice(k + 1, f - 1)}\n)`, nomFichier, j);
          k = f;
          continue;
        }
        const nom = /^[^\s=>/"'{}]+/.exec(g.slice(k))?.[0] ?? g[k]!;
        k += nom.length;
        if (!composant || nom.startsWith("data-")) motsDe(nom, j);
        let m = k;
        while (/\s/.test(g[m] ?? "")) m++;
        if (g[m] !== "=") continue;
        m++;
        while (/\s/.test(g[m] ?? "")) m++;
        const brute = cibleDeLAttribut(nom);
        const cible = composant && brute && brute !== "classe" ? "partout" : brute;
        const v = g[m];
        if (v === '"' || v === "'") {
          const f = apresChaine(g, m);
          if (cible) motsDeChaine(g.slice(m + 1, f - 1), seau(j, cible, false));
          k = f;
        } else if (v === "{") {
          const f = finExpression(g, m);
          if (cible) jetonsDuCode(`(${g.slice(m + 1, f - 1)}\n)`, nomFichier, j, cible);
          k = f;
        } else {
          const brut = /^[^\s>]+/.exec(g.slice(m))?.[0] ?? "";
          if (cible) motsDeChaine(brut, seau(j, cible, false));
          k = m + brut.length;
        }
      }
      i = k + 1;
      continue;
    }
    i++;
  }
}

/** Les jetons d'un composant .astro : son en-tête et ses scripts comme du code, son gabarit sans le texte affiché. */
function jetonsAstro(texte: string, nomFichier: string, j: Jetons) {
  let gabarit = texte;
  const entete = /^\s*---\r?\n([\s\S]*?)\r?\n---/.exec(texte);
  if (entete) {
    jetonsDuCode(entete[1]!, nomFichier.replace(/\.astro$/, ".ts"), j);
    gabarit = texte.slice(entete[0].length);
  }
  gabarit = gabarit.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_t, attributs: string, code: string) => {
    jetonsGabarit(`<script${attributs}>`, nomFichier.replace(/\.astro$/, ".tsx"), j);
    jetonsDuCode(code, nomFichier.replace(/\.astro$/, ".ts"), j);
    return " ";
  });
  gabarit = gabarit.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!doctype[^>]*>/i, " ");
  jetonsGabarit(gabarit, nomFichier.replace(/\.astro$/, ".tsx"), j);
}

/** Du balisage dans un texte (Markdown, SVG, fichier lu tel quel) : les attributs class, id et data-* de ses balises. */
function jetonsBalisage(texte: string, j: Jetons) {
  for (const balise of texte.matchAll(/<[A-Za-z][^>]*>/g)) {
    for (const a of balise[0].matchAll(/\s(class|className|id|data-[\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      motsDe(a[1]!, j);
      motsDeChaine(a[2] ?? a[3] ?? "", seau(j, cibleDeLAttribut(a[1]!) ?? "partout", false));
    }
    for (const a of balise[0].matchAll(/\s(data-[\w-]+)/g)) motsDe(a[1]!, j);
  }
}

/** Un fichier JSON : des données, comme un fichier de calcul ; ses clés et ses valeurs, une par une, et le balisage écrit dedans. */
function jetonsJson(texte: string, j: Jetons) {
  const donnee = seau(j, "partout", true);
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch {
    motsDe(texte, j);
    return;
  }
  const visiter = (v: unknown) => {
    if (typeof v === "string") {
      motsDeChaine(v, donnee);
      jetonsBalisage(v, j);
    } else if (Array.isArray(v)) v.forEach(visiter);
    else if (v && typeof v === "object")
      for (const [k, w] of Object.entries(v)) {
        motsDeChaine(k, donnee);
        visiter(w);
      }
  };
  visiter(valeur);
}

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".astro", ".json", "/index.ts", "/index.tsx"];
const TEXTES = /\.(ts|tsx|js|mjs|astro|json|md|svg|txt|html)$/;
const CODE = /\.(ts|tsx|js|mjs|astro)$/;

function resoudre(depuis: string, specifiant: string): string | null {
  if (!specifiant.startsWith(".") && !specifiant.startsWith("/")) return null;
  const nu = specifiant.replace(/\?.*$/, "");
  const base = resolve(dirname(depuis), nu);
  for (const ext of EXTENSIONS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Les fichiers d'un motif simple d'import.meta.glob (`*`, `**`, `{a,b}`), à partir d'un dossier. */
function deplierMotif(depuis: string, motif: string): string[] {
  const variantes = (m: string): string[] => {
    const a = /\{([^{}]*)\}/.exec(m);
    return a ? a[1]!.split(",").flatMap((v) => variantes(m.slice(0, a.index) + v + m.slice(a.index + a[0].length))) : [m];
  };
  const sortie: string[] = [];
  for (const v of variantes(motif)) {
    const morceaux = resolve(dirname(depuis), v.replace(/\?.*$/, "")).split(/[\\/]/);
    const racine = morceaux.findIndex((p) => p.includes("*"));
    if (racine < 0) {
      const p = morceaux.join("/");
      if (existsSync(p)) sortie.push(resolve(p));
      continue;
    }
    const dossier = morceaux.slice(0, racine).join("/");
    const motifRe = morceaux
      .slice(racine)
      .join("/")
      .replace(/[.+^$()|[\]]/g, "\\$&")
      .replace(/\*\*\//g, "(?:.*/)?")
      .replace(/\*/g, "[^/]*");
    const re = new RegExp(`^${motifRe}$`);
    const parcourir = (d: string) => {
      if (!existsSync(d)) return;
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (re.test(relative(dossier, p).replace(/\\/g, "/"))) sortie.push(resolve(p));
      }
    };
    parcourir(dossier);
  }
  return sortie;
}

/** Un import : le fichier, et s'il est lu tel quel (`?raw`) plutôt qu'exécuté. */
export interface Import {
  fichier: string;
  brut: boolean;
}

/** Les imports d'un fichier : statiques, dynamiques, `export … from`, et les motifs d'import.meta.glob. */
export function importsDe(fichier: string, texte: string): Import[] {
  const specs = new Set<string>();
  for (const m of texte.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g)) specs.add(m[1]!);
  for (const m of texte.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]!);
  const sortie: Import[] = [];
  for (const s of specs) {
    const p = resoudre(fichier, s);
    if (p) sortie.push({ fichier: p, brut: /[?&]raw\b/.test(s) });
  }
  for (const m of texte.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*(\[[\s\S]*?\]|["'][^"']+["'])([^)]*)\)/g)) {
    const brut = /query:\s*["']\?raw["']/.test(m[2]!);
    for (const motif of m[1]!.matchAll(/["']([^"']+)["']/g)) for (const p of deplierMotif(fichier, motif[1]!)) sortie.push({ fichier: p, brut });
  }
  return sortie;
}

/**
 * Les fichiers qu'une page assemble, de proche en proche : ceux qu'elle exécute (`code`), et ceux qu'elle lit tels quels
 * (`?raw`, `bruts`), dont on ne suit pas les imports et dont seul le balisage compte.
 */
export function graphe(entrees: string[]): { code: Set<string>; bruts: Set<string> } {
  const code = new Set<string>();
  const bruts = new Set<string>();
  const file: Import[] = entrees.map((e) => ({ fichier: resolve(e), brut: false }));
  while (file.length) {
    const { fichier, brut } = file.pop()!;
    if (brut) {
      if (!code.has(fichier)) bruts.add(fichier);
      continue;
    }
    if (code.has(fichier)) continue;
    code.add(fichier);
    bruts.delete(fichier);
    if (!CODE.test(fichier)) continue;
    for (const i of importsDe(fichier, readFileSync(fichier, "utf8"))) if (!code.has(i.fichier)) file.push(i);
  }
  return { code, bruts };
}

const cacheJetons = new Map<string, Jetons>();
/** Les jetons d'un fichier : tout son contenu s'il est exécuté, son seul balisage s'il est lu tel quel. */
export function jetonsDuFichier(f: string, brut = false): Jetons {
  const cle = `${brut ? "brut:" : ""}${f}`;
  const deja = cacheJetons.get(cle);
  if (deja) return deja;
  const j = jetonsVides();
  if (TEXTES.test(f)) {
    const texte = readFileSync(f, "utf8");
    if (brut || /\.(md|svg|html|txt)$/.test(f)) jetonsBalisage(texte, j);
    else if (f.endsWith(".astro")) jetonsAstro(texte, f, j);
    else if (f.endsWith(".json")) jetonsJson(texte, j);
    else jetonsDuCode(texte, f, j, "partout", /\.tsx$/.test(f) ? false : !toucheLaPage(texte));
  }
  cacheJetons.set(cle, j);
  return j;
}

/**
 * Des mots qu'un fichier écrit sans jamais en faire une classe de la page, relus un par un (feuilles.test.ts) : le fichier
 * (chemin depuis la racine du dépôt), ses mots, et pourquoi. Ils restent possibles comme valeur ou comme identifiant.
 */
export interface PasUneClasse {
  fichier: string;
  mots: string[];
  raison: string;
}

/** Les jetons d'un fichier, moins les mots qu'une relecture a reconnus comme n'étant pas des classes. */
function jetonsRelus(f: string, brut: boolean, racine: string, relus: PasUneClasse[]): Jetons {
  const j = jetonsDuFichier(f, brut);
  const nom = relative(racine, f).replace(/\\/g, "/");
  const retires = relus.filter((r) => r.fichier === nom).flatMap((r) => r.mots);
  if (!retires.length) return j;
  const copie = jetonsVides();
  fusionner(copie, j);
  for (const m of retires) {
    copie.mots.delete(m);
    copie.valeurs.mots.add(m);
    copie.ids.mots.add(m);
  }
  return copie;
}

/** Les jetons d'une page : ceux de son graphe, plus ceux des fichiers donnés en plus (contenus, configuration). */
export function jetonsDuGraphe(g: { code: Set<string>; bruts: Set<string> }, autres: Iterable<string> = [], racine = ".", relus: PasUneClasse[] = []): Jetons {
  const j = jetonsVides();
  for (const f of g.code) fusionner(j, jetonsRelus(f, false, racine, relus));
  for (const f of g.bruts) fusionner(j, jetonsRelus(f, true, racine, relus));
  for (const f of autres) fusionner(j, jetonsRelus(f, false, racine, relus));
  return j;
}

/** Tous les fichiers texte d'un dossier : les contenus du clan et sa configuration, que les pages lisent à la construction. */
export function fichiersDuDossier(dossier: string): string[] {
  const sortie: string[] = [];
  const parcourir = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (TEXTES.test(p)) sortie.push(resolve(p));
    }
  };
  if (existsSync(dossier)) parcourir(dossier);
  return sortie;
}

// ---------- Une règle peut-elle toucher la page ? ----------

/** Les réponses déjà données pour un ensemble de mots : une page pose des milliers de fois les mêmes questions. */
const reponses = new WeakMap<Mots, Map<string, boolean>>();
const motifsCompiles = new WeakMap<Mots, RegExp[]>();
/** Le nom peut être écrit par la page : tel quel, ou par un début, une fin ou un gabarit de nom construit. */
export function present(nom: string, j: Mots): boolean {
  let deja = reponses.get(j);
  if (!deja) reponses.set(j, (deja = new Map()));
  const connu = deja.get(nom);
  if (connu !== undefined) return connu;
  let motifs = motifsCompiles.get(j);
  if (!motifs) motifsCompiles.set(j, (motifs = [...j.motifs].map((m) => new RegExp(m))));
  let oui = j.mots.has(nom);
  if (!oui) for (const d of j.debuts) if (nom.startsWith(d)) oui = true;
  if (!oui) for (const f of j.fins) if (nom.endsWith(f)) oui = true;
  if (!oui) for (const re of motifs) if (re.test(nom)) oui = true;
  deja.set(nom, oui);
  return oui;
}

/**
 * Les attributs que Base.astro pose sur <html> selon la page (`data-theme`, `data-ambiance`…) : leur valeur est connue
 * pour chaque page, au lieu de « tout ce que le code peut écrire ».
 */
export type AttributsHtml = Record<string, string | undefined>;

/**
 * Les attributs de <html> d'une page, d'après les propriétés écrites telles quelles sur sa balise <Base> et la règle de
 * Base.astro (voir le test qui la relit) : `theme` donne data-theme, `cadre` data-ecran, `ambiance` data-ambiance et, en console, data-console ;
 * data-lettres vaut « onciale » partout sauf au QG et à la Direction. Une propriété calculée (`theme={…}`) reste inconnue :
 * la page est alors jugée sur ses mots, comme pour tout autre attribut.
 */
export function attributsHtmlDe(route: string, page: string): AttributsHtml {
  const debut = page.indexOf("<Base");
  let fin = debut;
  if (debut >= 0) {
    fin = debut + 5;
    while (fin < page.length && page[fin] !== ">") {
      if (page[fin] === '"' || page[fin] === "'") fin = apresChaine(page, fin);
      else if (page[fin] === "{") fin = finExpression(page, fin);
      else fin++;
    }
  }
  const balise = debut >= 0 ? page.slice(debut, fin) : "";
  const html: AttributsHtml = {};
  const prop = (nom: string) => {
    if (new RegExp(`\\s${nom}=\\{`).test(balise)) return null;
    return new RegExp(`\\s${nom}="([^"]*)"`).exec(balise)?.[1];
  };
  const theme = prop("theme");
  const ambiance = prop("ambiance");
  // Le cadre de jeu (« Mon Gaulois », 21 novembre 2026) : `cadre` donne data-ecran.
  const cadre = prop("cadre");
  if (cadre !== null) html["data-ecran"] = cadre;
  if (theme !== null) html["data-theme"] = theme;
  if (ambiance !== null) {
    html["data-ambiance"] = ambiance;
    html["data-console"] = ambiance === "console" ? "terminal" : undefined;
  }
  html["data-lettres"] = ["/qg", "/direction"].includes(route) ? undefined : "onciale";
  return html;
}

/** Une exigence que la page peut remplir. */
export function remplie(e: Exigence, j: Jetons, html?: AttributsHtml): boolean {
  if (e.genre === "ou") return e.branches.some((b) => b.every((x) => remplie(x, j, html)));
  if (html && e.genre === "attribut" && Object.hasOwn(html, e.nom)) return html[e.nom] !== undefined;
  if (html && e.genre === "valeur" && Object.hasOwn(html, e.nom)) return html[e.nom] === e.valeur;
  if (e.genre === "id") return present(e.nom, j) || present(e.nom, j.ids);
  // Une valeur en chiffres (`[data-saut="0"]`) vient le plus souvent d'un nombre calculé, qu'aucune chaîne n'écrit : elle
  // est toujours possible.
  if (e.genre === "valeur") return /^\d+$/.test(e.valeur) || present(e.valeur, j) || present(e.valeur, j.valeurs);
  return present(e.nom, j);
}

/** Le sélecteur peut toucher un élément de la page : chacune de ses exigences est possible. */
export function peutToucher(selecteur: string, j: Jetons, html?: AttributsHtml): boolean {
  return exigences(selecteur).every((e) => remplie(e, j, html));
}
