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
  section("Membres", { href: "/membres", label: "Membres" }),
  section("Carte", { href: "/carte", label: "Carte" }),
  section("Guides", { href: "/debuter", label: "Guides" }, { href: "/activite", label: "Quand jouer" }, { href: "/outils", label: "Calculateur et outils" }),
  section("Rejoindre", { href: "/rejoindre", label: "Rejoindre" }),
];

/** La rubrique d'une adresse, fiches des membres comprises. `null` : l'accueil et les pages personnelles. */
export function sectionOf(path: string): NavSection | null {
  const clean = path.replace(/\/$/, "") || "/";
  return SECTIONS.find((s) => s.pages.some((p) => clean === p.href || clean.startsWith(`${p.href}/`))) ?? null;
}
