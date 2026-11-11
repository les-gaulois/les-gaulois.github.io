import type { LogoMatriceData } from "../lib/logo-matrice";

/** La taille d'une case dans le dessin : dix unités, pour que le texte n'ait jamais une taille minuscule. */
const CASE = 10;

/**
 * Le logo du guerrier en mode Matrix (données : `src/lib/logo-matrice.ts`). À l'ouverture, les caractères tombent en
 * colonnes, en vert, puis le logo prend son bleu, son blanc et son rouge (voir « Logo Matrix » dans global.css). Rendu
 * au moment de la construction dans l'en-tête de la Direction, et par le navigateur dans le menu des parties.
 * `points` : en petit, des caractères ne se liraient pas ; chaque case devient un point lumineux, comme un écran à
 * matrice de points. Décoratif : masqué aux lecteurs d'écran. `id` : unique dans la page, il nomme le masque des colonnes.
 */
export default function LogoMatrice({ data, id, class: className = "", points = false }: { data: LogoMatriceData; id: string; class?: string; points?: boolean }) {
  const { colonnes, lignes, suites, delais } = data;
  return (
    <svg class={`console-logo ${className}`} viewBox={`0 0 ${colonnes * CASE} ${lignes * CASE}`} aria-hidden="true" focusable="false">
      <defs>
        <mask id={`${id}-pluie`} maskUnits="userSpaceOnUse" x="0" y="0" width={colonnes * CASE} height={lignes * CASE}>
          {delais.map((delai, x) => (
            <rect key={x} class="console-goutte" x={x * CASE} y="0" width={CASE} height={lignes * CASE} fill="#fff" style={`--goutte: ${delai}ms`} />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${id}-pluie)`}>
        {points
          ? suites.flatMap((suite) =>
              [...suite.texte].map((_, i) => (
                <rect key={`${suite.x + i}-${suite.y}`} class={`console-logo-${suite.teinte}`} x={(suite.x + i) * CASE + 1} y={suite.y * CASE + 1} width={CASE - 2} height={CASE - 2} rx="2" />
              )),
            )
          : suites.map((suite, i) => (
              <text key={i} class={`console-logo-${suite.teinte}`} x={suite.x * CASE} y={suite.y * CASE + 9.4} textLength={suite.texte.length * CASE} lengthAdjust="spacing">
                {suite.texte}
              </text>
            ))}
      </g>
    </svg>
  );
}
