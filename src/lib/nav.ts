/**
 * Le plan du site : une seule source pour le menu, les onglets de chaque rubrique et le pied de page.
 * Une rubrique répond à une question de visiteur. Une page n'appartient qu'à une rubrique, et un contenu n'a qu'une page.
 */
export interface NavPage {
  href: string;
  label: string;
}

export interface NavSection {
  label: string;
  /** La page ouverte par le menu : la première de la rubrique. */
  href: string;
  pages: NavPage[];
}

const section = (label: string, first: NavPage, ...others: NavPage[]): NavSection => ({ label, href: first.href, pages: [first, ...others] });

export const SECTIONS: NavSection[] = [
  section("Actu", { href: "/gazette", label: "La gazette" }, { href: "/parties", label: "Dernières parties" }, { href: "/nouveautes", label: "Nouveautés du site" }),
  section(
    "Résultats",
    { href: "/classement", label: "Classement" },
    { href: "/rivaux", label: "Nos rivaux" },
    { href: "/progression", label: "Progression" },
    { href: "/records", label: "Records" },
  ),
  // La liste officielle a son onglet depuis le 12 novembre 2026, à la demande du pilote : la page Membres garde les paliers,
  // l'encadrement et le classé. Le QG : la face privée du site. Sa page ne montre que la porte tant que le serveur n'a pas
  // reconnu un membre validé.
  section("Membres", { href: "/membres", label: "Membres" }, { href: "/liste", label: "La liste" }, { href: "/qg", label: "Le QG" }),
  section("Carte", { href: "/carte", label: "Carte" }),
  section("Guides", { href: "/debuter", label: "Guides" }, { href: "/activite", label: "Quand jouer" }, { href: "/outils", label: "Calculateur et outils" }),
  section("Rejoindre", { href: "/rejoindre", label: "Rejoindre" }),
];

/** La rubrique d'une adresse, fiches des membres comprises. `null` : l'accueil et les pages personnelles. */
export function sectionOf(path: string): NavSection | null {
  const clean = path.replace(/\/$/, "") || "/";
  return SECTIONS.find((s) => s.pages.some((p) => clean === p.href || clean.startsWith(`${p.href}/`))) ?? null;
}

/** Un nom de dossier ou de commande : sans accent, en minuscules, un tiret entre les mots. */
const nomMachine = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * L'invite décorative au-dessus du titre d'une page, celle du poste de commandement (docs/DESIGN.md) :
 * `gal@clan:~/resultats$ ./classement`. Le dossier est la rubrique quand elle a plusieurs pages, sinon la racine ; la
 * commande est la page de l'adresse. Une fiche de membre s'écrit `./fiche` : l'identifiant du joueur n'y paraît jamais.
 */
export function invite(path: string): { dossier: string; commande: string } {
  const clean = path.replace(/\/$/, "") || "/";
  const section = sectionOf(clean);
  const morceaux = clean.split("/").filter(Boolean);
  return {
    dossier: section && section.pages.length > 1 ? `~/${nomMachine(section.label)}` : "~",
    commande: morceaux.length > 1 && morceaux[0] === "membres" ? "fiche" : nomMachine(morceaux[0] ?? "accueil"),
  };
}
