import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { paquet, type CarteDeScene, type SorteDeBooster } from "../../lib/jeu/boosters";
import type { Planche } from "../../lib/jeu/planche";
import { SON_CHANGE, basculerLeSon, sonVoulu } from "../../lib/jeu/sons";
import { sonRemis } from "../../lib/jeu/sons-des-boosters";
import { PetiteIcone, Px } from "../jeu/Pixels";
import { lancerLaScene, type Scene } from "./SceneDuBooster";

/** Le nom de chaque booster, pour le paquet et la scène. */
export const NOMS_DES_BOOSTERS: Readonly<Record<SorteDeBooster, string>> = {
  surprise: "Booster surprise",
  stateres: "Booster de statères",
  familiers: "Booster des familiers",
  bannieres: "Booster des bannières",
  modeles: "Booster des Gaulois uniques",
  loterie: "Booster de loterie",
};

/** Le son du jeu, coupé ou non, suivi d'un bouton à l'autre (barre du jeu, fenêtre). */
function useSon(): [boolean, () => void] {
  const [son, setSon] = useState(sonVoulu);
  useEffect(() => {
    const relire = (): void => setSon(sonVoulu());
    window.addEventListener(SON_CHANGE, relire);
    return () => window.removeEventListener(SON_CHANGE, relire);
  }, []);
  return [
    son,
    () => {
      const voulu = basculerLeSon();
      if (voulu) sonRemis();
      setSon(voulu);
    },
  ];
}

/**
 * L'ouverture d'un booster dans sa fenêtre (21 novembre 2026) : la scène validée par le pilote (`SceneDuBooster.ts`), où
 * le joueur ouvre lui-même le paquet et retourne la carte que le serveur a déjà tirée, et ses trois boutons : passer,
 * le son du jeu, la pause (la page derrière la fenêtre est inerte, sa pause ne s'atteint pas). Une fois la carte retournée,
 * `children` (le résultat écrit et ses actions) paraît dessous ; la scène reste, la carte flotte dans sa fête.
 */
export function OuvertureDuBooster({
  sorte,
  carte,
  revelee,
  onRevelee,
  autre,
  children,
}: {
  sorte: SorteDeBooster;
  carte: CarteDeScene;
  revelee: boolean;
  onRevelee: () => void;
  /** Un autre paquet que celui de `sorte`, de la même anatomie (60 × 88 cases), et son nom : le booster d'un palier du pass. */
  autre?: { paquet: Planche; nom: string };
  children: ComponentChildren;
}) {
  const nomDuPaquet = autre?.nom ?? NOMS_DES_BOOSTERS[sorte];
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const rappel = useRef(onRevelee);
  rappel.current = onRevelee;
  const [son, basculerSon] = useSon();
  const [pause, setPause] = useState(false);
  useEffect(() => {
    const el = racine.current;
    try {
      if (!el) throw new Error("scène absente");
      scene.current = lancerLaScene(el, { paquet: autre?.paquet ?? paquet(sorte), nomDuPaquet, carte, onRevelee: () => rappel.current() });
    } catch {
      // Sans scène, la fenêtre passe tout de suite au résultat : elle ne reste jamais bloquée.
      rappel.current();
    }
    return () => scene.current?.arreter();
    // La scène se lance une fois : la carte ne change pas pendant une ouverture.
  }, []);
  // La carte retournée : le résultat paraît sous la scène ; la fenêtre y descend, et le focus passe à sa première action
  // s'il était dans la scène (le paquet, la carte), comme dans la démonstration.
  const resultat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revelee) return;
    const id = requestAnimationFrame(() => {
      const el = resultat.current;
      if (!el) return;
      el.scrollIntoView({ block: "nearest", behavior: motionAllowed() ? "smooth" : "auto" });
      const actif = document.activeElement;
      if (!actif || actif === document.body || racine.current?.contains(actif) || actif.closest("dialog") === null) el.querySelector<HTMLElement>("button, a[href]")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [revelee]);
  const basculerPause = (): void => {
    const oui = !pause;
    scene.current?.mettreEnPause(oui);
    setPause(oui);
  };
  return (
    <div class="bst-ouverture" data-revelee={revelee ? "" : undefined}>
      <div class="bst-cadre">
        <div ref={racine} class="bst-scene" tabIndex={-1} role="group" aria-label={`Ouverture du ${nomDuPaquet.toLowerCase()}`} data-testid="booster-scene" data-rarete={carte.rarete} />
        <div class="bst-outils">
          {!revelee && (
            <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9 bst-passer" onClick={() => scene.current?.passer()} data-testid="booster-passer">
              <Px t="Passer" couleur="creme" relief="cerne" dit="Passer : montrer la carte tout de suite" />
            </button>
          )}
          <button type="button" class="jeu-btn jeu-btn-bleu jeu-btn-ic jeu-n9" aria-pressed={son} aria-label="Son" title={son ? "Couper le son" : "Remettre le son"} onClick={basculerSon} data-testid="booster-son">
            <PetiteIcone nom={son ? "son" : "muet"} />
          </button>
          <button type="button" class="jeu-btn jeu-btn-bleu jeu-btn-ic jeu-n9" aria-pressed={pause} aria-label="Pause de l'animation" title={pause ? "Relancer l'animation" : "Mettre l'animation en pause"} onClick={basculerPause} data-testid="booster-pause">
            <PetiteIcone nom={pause ? "jouer" : "pause"} />
          </button>
        </div>
      </div>
      {/* La carte retournée, dite aux lecteurs d'écran : la région est là dès le début de la scène, vide, puis remplie. */}
      <p class="sr-only" aria-live="polite" data-testid="booster-annonce">
        {revelee ? `${carte.nom}, ${carte.mot.toLowerCase()}.` : ""}
      </p>
      {revelee && (
        <div ref={resultat} class="bst-resultat">
          {children}
        </div>
      )}
    </div>
  );
}
