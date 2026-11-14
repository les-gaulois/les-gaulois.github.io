import { useEffect, useMemo } from "preact/hooks";
import { TEMPS_PAR_SECONDE } from "../../../lib/village/mouvement";

/**
 * L'horloge du monde : un temps tous les huitièmes de seconde, le rythme d'une animation en pixels. Cadencée par le
 * navigateur, elle s'arrête d'elle-même quand la page est cachée. Tout ce qui bouge dans le monde l'écoute : rien n'a sa
 * propre minuterie.
 */
export class Horloge {
  temps = 0;
  private ecoutes = new Set<(temps: number) => void>();
  ecouter(ecoute: (temps: number) => void): () => void {
    this.ecoutes.add(ecoute);
    return () => this.ecoutes.delete(ecoute);
  }
  battre(): void {
    this.temps++;
    for (const ecoute of this.ecoutes) ecoute(this.temps);
  }
}

/** L'horloge du monde, qui ne bat que si `actif` (rien n'est figé). */
export function useHorloge(actif: boolean): Horloge {
  const horloge = useMemo(() => new Horloge(), []);
  useEffect(() => {
    if (!actif) return;
    let demande = 0;
    let dernier = 0;
    const tourner = (maintenant: number) => {
      demande = requestAnimationFrame(tourner);
      if (maintenant - dernier < 1000 / TEMPS_PAR_SECONDE) return;
      dernier = maintenant;
      horloge.battre();
    };
    demande = requestAnimationFrame(tourner);
    return () => cancelAnimationFrame(demande);
  }, [actif, horloge]);
  return horloge;
}
