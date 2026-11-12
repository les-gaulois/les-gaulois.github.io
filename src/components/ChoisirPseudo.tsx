import { CHOOSE_NAME_URL } from "../lib/pseudo-openfront";

/** Où un membre sans pseudo public choisit le sien, et ce qu'il doit savoir, en une phrase (src/lib/pseudo-openfront.ts). */
export function ChoisirPseudo() {
  return (
    <>
      <a href={CHOOSE_NAME_URL} rel="noopener" data-testid="choose-name">
        Choisir son pseudo dans OpenFront
      </a>
      , avec le compte qui est dans le clan : il paraît ici à la relecture suivante de la liste, une fois par jour.
    </>
  );
}
