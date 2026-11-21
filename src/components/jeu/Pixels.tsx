import type { JSX } from "preact";
import { compteurEnPixels, etiquetteEnPixels, texteEnPixels, type CouleurDEcriture, type ReliefDEcriture } from "../../lib/jeu/dans-la-page";
import type { NomDeGrandeIcone, NomDePetiteIcone } from "../../lib/jeu/icones";
import type { TonDEtiquette } from "../../lib/jeu/palette";
import { NOMS_DES_INSIGNES } from "../../lib/jeu/paliers-de-victoires";

/**
 * Les pièces du kit en pixels de « Mon Gaulois », en composants (voir « Le kit du jeu » dans docs/DESIGN.md). Leurs images
 * fixes (icônes, insignes, cadres, boutons) viennent de `/village/kit.css` ; les mots et nombres qui changent sont dessinés dans
 * la page (`dans-la-page.ts`). Tout ce qui s'y lit a son texte pour les lecteurs d'écran ; les dessins seuls sont cachés.
 */

/** Une première lettre en capitale, le reste en minuscules : le texte d'un mot en pixels pour les lecteurs d'écran. */
const enPhrase = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/**
 * Un texte écrit en pixels. `couleur` : `texte`, `doux` ou `or` suivent le thème ; les autres sont fixes (`creme` sur un
 * bouton bleu, `encre` sur un bouton d'or). `relief` : `ombre` (une case dessous) ou `cerne` (contour d'encre). `plie` : les
 * mots passent à la ligne. `dit` : ce qu'entend un lecteur d'écran (par défaut, le texte en phrase) ; `muet` : rien, quand
 * un parent porte déjà le nom.
 */
export function Px({ t, couleur = "texte", relief = "plat", plie = false, dit, muet = false, classe = "" }: { t: string; couleur?: CouleurDEcriture; relief?: ReliefDEcriture; plie?: boolean; dit?: string; muet?: boolean; classe?: string }) {
  const mots = texteEnPixels(t, couleur, relief, plie);
  return (
    <span class={`jeu-px ${plie ? "jeu-px-plie" : ""} ${classe}`} aria-hidden={muet ? "true" : undefined}>
      {mots.map((m, i) => (
        <i key={i} aria-hidden="true" style={`--i:${m.clair};--i-sombre:${m.sombre};--w:${m.largeur};--h:${m.hauteur}`} />
      ))}
      {!muet && <span class="sr-only">{dit ?? enPhrase(t)}</span>}
    </span>
  );
}

/** Une grande icône du kit, sur 24 cases ; décorative. */
export function Icone({ nom, classe = "", style }: { nom: NomDeGrandeIcone; classe?: string; style?: string }) {
  return <i class={`jeu-ic ${classe}`} style={`--i:var(--jeu-ic-${nom})${style ? `;${style}` : ""}`} aria-hidden="true" />;
}

/** Une petite icône blanche du kit, sur 16 cases ; décorative. */
export function PetiteIcone({ nom, classe = "" }: { nom: NomDePetiteIcone; classe?: string }) {
  return <i class={`jeu-pic ${classe}`} style={`--i:var(--jeu-pic-${nom})`} aria-hidden="true" />;
}

/**
 * L'insigne d'un palier de victoires (rang 0 à 13). `nom` : un texte pour les lecteurs d'écran (sinon décoratif). `eteint` :
 * le palier pas encore atteint, en ombre.
 */
export function Insigne({ rang, nom, eteint = false, classe = "" }: { rang: number; nom?: string; eteint?: boolean; classe?: string }) {
  const props: JSX.HTMLAttributes<HTMLElement> = nom ? { role: "img", "aria-label": nom } : { "aria-hidden": "true" };
  return <i class={`jeu-ic jeu-insigne ${eteint ? "jeu-insigne-eteint" : ""} ${classe}`} style={`--i:var(--jeu-insigne-${rang})`} title={NOMS_DES_INSIGNES[rang]} {...props} />;
}

/** Une étiquette : « NOUVEAU », un nombre, « +90 ». `dit` : son sens pour un lecteur d'écran (sinon décorative). */
export function Etiquette({ t, ton = "rouge", dit, classe = "" }: { t: string; ton?: TonDEtiquette; dit?: string; classe?: string }) {
  const e = etiquetteEnPixels(t, ton);
  return (
    <span class={`jeu-etq ${classe}`}>
      <i aria-hidden="true" style={`--i:${e.url};--w:${e.largeur};--h:${e.hauteur}`} />
      {dit && <span class="sr-only">{dit}</span>}
    </span>
  );
}

/** Le compteur des points, un rouleau par chiffre. `dit` : le nombre en toutes lettres pour un lecteur d'écran. */
export function Compteur({ n, dit }: { n: number; dit: string }) {
  const c = compteurEnPixels(n);
  return (
    <span class="jeu-compteur">
      <i aria-hidden="true" style={`--i:${c.url};--w:${c.largeur};--h:${c.hauteur}`} />
      <span class="sr-only">{dit}</span>
    </span>
  );
}
