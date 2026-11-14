import { bornerLaVue, douceur, dureeDuGlissement } from "../../../lib/village/monde/camera";

/**
 * La caméra du monde du village, dans le navigateur : elle garde la colonne de gauche de la vue (en cases, avec ses
 * décimales : le monde glisse au pixel) et prévient ceux qui l'écoutent (le monde, les lointains, la petite carte).
 * Trois façons de bouger, toutes douces : `aller` glisse lentement vers une colonne, `pousser` suit la molette et les
 * flèches en rattrapant sa cible sans à-coup, `tirer` suit le doigt et `lacher` laisse courir l'élan, qui s'éteint seul.
 * `fige` (bouton pause, « réduire les animations ») : plus aucun mouvement, la caméra saute là où on l'envoie.
 * Rien ne tourne quand elle est arrivée ni quand la page est cachée (le navigateur suspend les images).
 */
export class CameraDuMonde {
  x = 0;
  vue = 1;
  largeur = 100_000;
  fige = false;
  private ecoutes = new Set<() => void>();
  private demande = 0;
  private dernier = 0;
  private glisse: { de: number; a: number; debut: number; duree: number } | null = null;
  private cible: number | null = null;
  private elan = 0;

  /** S'abonner aux déplacements ; rend de quoi se désabonner. */
  ecouter(ecoute: () => void): () => void {
    this.ecoutes.add(ecoute);
    return () => this.ecoutes.delete(ecoute);
  }

  /** La vue change de taille, ou le monde : ce qui était au milieu de l'écran y reste, dans les bornes du monde. */
  regler(vue: number, largeur: number): void {
    const milieu = this.milieu;
    this.vue = vue;
    this.largeur = largeur;
    const borne = bornerLaVue(milieu - vue / 2, vue, largeur);
    this.x = borne;
    for (const ecoute of this.ecoutes) ecoute();
  }

  /** La colonne du milieu de la vue. */
  get milieu(): number {
    return this.x + this.vue / 2;
  }

  private poser(x: number): void {
    const borne = bornerLaVue(x, this.vue, this.largeur);
    const change = borne !== this.x;
    this.x = borne;
    if (change) for (const ecoute of this.ecoutes) ecoute();
  }

  private arreter(): void {
    this.glisse = null;
    this.cible = null;
    this.elan = 0;
  }

  /** Met la colonne `milieu` au milieu de l'écran : en glissant lentement, ou d'un coup si `direct` ou si tout est figé. */
  aller(milieu: number, direct = false): void {
    const a = bornerLaVue(milieu - this.vue / 2, this.vue, this.largeur);
    this.arreter();
    if (direct || this.fige || Math.abs(a - this.x) < 1) {
      this.poser(a);
      return;
    }
    this.glisse = { de: this.x, a, debut: performance.now(), duree: dureeDuGlissement(a - this.x) };
    this.tourner();
  }

  /** La molette et les flèches : la cible s'éloigne de `cases`, la caméra la rattrape en douceur. */
  pousser(cases: number): void {
    const depuis = this.cible ?? this.glisse?.a ?? this.x;
    this.arreter();
    this.cible = bornerLaVue(depuis + cases, this.vue, this.largeur);
    if (this.fige) {
      this.poser(this.cible);
      this.cible = null;
      return;
    }
    this.tourner();
  }

  /** Le doigt ou la souris tire le monde : la caméra suit, sans retard. */
  tirer(cases: number): void {
    this.arreter();
    this.poser(this.x + cases);
  }

  /** Le doigt lâche le monde : l'élan (en cases par seconde) continue un peu, puis s'éteint. */
  lacher(vitesse: number): void {
    if (this.fige || Math.abs(vitesse) < 20) return;
    this.elan = Math.max(-900, Math.min(900, vitesse));
    this.tourner();
  }

  /** Tout s'arrête (la page se démonte). */
  fermer(): void {
    cancelAnimationFrame(this.demande);
    this.demande = 0;
    this.ecoutes.clear();
  }

  private tourner(): void {
    if (this.demande) return;
    this.dernier = performance.now();
    const image = (maintenant: number) => {
      const dt = Math.min(64, maintenant - this.dernier);
      this.dernier = maintenant;
      let encore = false;
      if (this.glisse) {
        const part = (maintenant - this.glisse.debut) / this.glisse.duree;
        this.poser(this.glisse.de + (this.glisse.a - this.glisse.de) * douceur(part));
        if (part >= 1) this.glisse = null;
        else encore = true;
      } else if (this.cible !== null) {
        const reste = this.cible - this.x;
        if (Math.abs(reste) < 0.2) {
          this.poser(this.cible);
          this.cible = null;
        } else {
          this.poser(this.x + reste * (1 - Math.exp(-dt / 190)));
          encore = true;
        }
      } else if (this.elan !== 0) {
        const avant = this.x;
        this.poser(this.x + (this.elan * dt) / 1000);
        this.elan *= Math.exp(-dt / 420);
        if (Math.abs(this.elan) < 6 || this.x === avant) this.elan = 0;
        else encore = true;
      }
      this.demande = encore ? requestAnimationFrame(image) : 0;
    };
    this.demande = requestAnimationFrame(image);
  }
}
