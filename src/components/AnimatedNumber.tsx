import { useLayoutEffect, useRef } from "preact/hooks";
import { motionAllowed } from "../lib/fx/motion";

interface Props {
  value: number | null;
  format: (n: number | null) => string;
  testId?: string;
}

/**
 * Un chiffre qui change avec la période (page Progression) : la nouvelle valeur s'écrit tout de suite, puis se lève
 * doucement (`.fx-count-in`, global.css), comme les chiffres clés de l'accueil. Jusqu'au 14 novembre 2026, il défilait
 * d'une valeur à l'autre et montrait des chiffres faux en chemin : une animation ne change jamais une valeur. Le texte est
 * toujours le vrai chiffre, pour les yeux, les lecteurs d'écran et le copier-coller. La pause de l'en-tête et « réduire
 * les animations » coupent l'entrée.
 */
export default function AnimatedNumber({ value, format, testId }: Props) {
  const el = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  // Avant que la page se redessine : le nouveau chiffre ne paraît pas une image en entier avant de se lever.
  useLayoutEffect(() => {
    // Le premier chiffre entre avec son bloc : seul un changement de valeur se lève.
    if (first.current) {
      first.current = false;
      return;
    }
    const span = el.current;
    if (!span || !motionAllowed()) return;
    // Relancer l'entrée : sans la classe, le navigateur recalcule le style, puis la classe revient.
    span.classList.remove("fx-count-in");
    void span.offsetWidth;
    span.classList.add("fx-count-in");
  }, [value]);

  return (
    <span
      ref={el}
      class="inline-block"
      data-testid={testId}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove("fx-count-in");
      }}
    >
      {format(value)}
    </span>
  );
}
