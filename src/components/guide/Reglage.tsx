import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface Props {
  id: string;
  /** Ce que règle le curseur : « Vos troupes ». */
  nom: string;
  valeur: number;
  min: number;
  max: number;
  pas: number;
  /** La valeur telle qu'on la lit : « 50 000 », « 42 % ». */
  texte: string;
  /** Ce qu'entendent les lecteurs d'écran, quand la valeur seule ne suffit pas : « 42 % de la capacité ». */
  lu?: string;
  onChange: (valeur: number) => void;
  /** Le curseur se cale sur un dessin au-dessus de lui : sa marge de chaque côté, en part de la largeur (0,025 pour 2,5 %). */
  retrait?: number;
}

/**
 * Un curseur des essais du guide du clan : son nom à gauche, sa valeur à droite, puis le curseur du navigateur, qui se règle
 * au doigt, à la souris et au clavier. La partie déjà parcourue est plus claire (`--p`).
 */
export default function Reglage({ id, nom, valeur, min, max, pas, texte, lu, onChange, retrait }: Props) {
  const champ = useRef<HTMLInputElement>(null);
  // Le visiteur a pu déplacer le curseur avant que la page devienne interactive : l'essai reprend où il l'a laissé.
  useEffect(() => {
    const deja = Number(champ.current?.value);
    if (Number.isFinite(deja) && deja !== valeur) onChange(deja);
  }, []);

  const part = max > min ? ((valeur - min) / (max - min)) * 100 : 0;
  // Le milieu du pouce va d'un bord à l'autre du dessin : le curseur déborde donc d'un demi-pouce de chaque côté.
  const style: JSX.CSSProperties = { "--p": `${part}%` };
  if (retrait !== undefined) {
    style.width = `calc(${100 - retrait * 200}% + var(--pouce))`;
    style.marginInline = `calc(${retrait * 100}% - var(--pouce) / 2)`;
  }
  return (
    <div class="guide-reglage">
      <div class="guide-reglage-tete">
        <label for={id} class="guide-etiquette">
          {nom}
        </label>
        <span class="guide-reglage-valeur tnum" aria-hidden="true">
          {texte}
        </span>
      </div>
      <input
        ref={champ}
        id={id}
        class="guide-curseur"
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        aria-valuetext={lu ?? texte}
        style={style}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}
