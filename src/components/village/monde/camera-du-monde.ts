import { bornerLaHauteur, bornerLaVue, douceur, dureeDuGlissement } from "../../../lib/village/monde/camera";

/**
 * La caméra du monde du village, dans le navigateur : elle garde le coin haut gauche de la vue (en cases, avec ses
 * décimales : le monde glisse au pixel) et prévient ceux qui l'écoutent (le monde, les lointains, la petite carte).
 * Trois façons de bouger, toutes douces : `aller` glisse lentement vers un point, `pousser` suit la molette et les
 * flèches en rattrapant sa cible sans à-coup, `tirer` suit le doigt et `lacher` laisse courir l'élan, qui s'éteint seul.
 * `fige` (bouton pause, « réduire les animations ») : plus aucun mouvement, la caméra saute là où on l'envoie.
 * Rien ne tourne quand elle est arrivée ni quand la page est cachée (le navigateur suspend les images).
 */
export class CameraDuMonde {
  x = 0;
  y = 0;
  /** La largeur et la hauteur de la vue, en cases. */
  vue = 1;
  vueH = 1;
  largeur = 100_000;
  hauteur = 100_000;
  fige = false;
  private ecoutes = new Set<() => void>();
  private demande = 0;
  private dernier = 0;
  private glisse: { de: [number, number]; a: [number, number]; debut: number; duree: number } | null = null;
  private cible: [number, number] | null = null;
  private elan: [number, number] = [0, 0];

  /** S'abonner aux déplacements ; rend de quoi se désabonner. */
  ecouter(ecoute: () => void): () => void {
    this.ecoutes.add(ecoute);
    return () => this.ecoutes.delete(ecoute);
  }

  /** La vue change de taille, ou le monde : ce qui était au milieu de l'écran y reste, dans les bornes du monde. */
  regler(vue: number, vueH: number, largeur: number, hauteur: number): void {
    const milieu = this.milieu;
    const milieuY = this.milieuY;
    this.vue = vue;
    this.vueH = vueH;
    this.largeur = largeur;
    this.hauteur = hauteur;
    this.x = bornerLaVue(milieu - vue / 2, vue, largeur);
    this.y = bornerLaHauteur(milieuY - vueH / 2, vueH, hauteur);
    for (const ecoute of this.ecoutes) ecoute();
  }

  /** Le milieu de la vue : sa colonne et sa rangée. */
  get milieu(): number {
    return this.x + this.vue / 2;
  }
  get milieuY(): number {
    return this.y + this.vueH / 2;
  }

  /** Le milieu qu'aurait la vue si on l'envoyait vers ce point : le point lui-même, ou le plus proche que le monde permet. */
  ouIrait(milieu: number, milieuY: number): [number, number] {
    const [x, y] = this.borner(milieu - this.vue / 2, milieuY - this.vueH / 2);
    return [x + this.vue / 2, y + this.vueH / 2];
  }

  private borner(x: number, y: number): [number, number] {
    return [bornerLaVue(x, this.vue, this.largeur), bornerLaHauteur(y, this.vueH, this.hauteur)];
  }

  private poser(x: number, y: number): boolean {
    const [bx, by] = this.borner(x, y);
    const change = bx !== this.x || by !== this.y;
    this.x = bx;
    this.y = by;
    if (change) for (const ecoute of this.ecoutes) ecoute();
    return change;
  }

  private arreter(): void {
    this.glisse = null;
    this.cible = null;
    this.elan = [0, 0];
  }

  /**
   * Met ce point du monde au milieu de l'écran (sans `milieuY` : la rangée ne change pas) : en glissant lentement, ou
   * d'un coup si `direct` ou si tout est figé.
   */
  aller(milieu: number, milieuY: number | null = null, direct = false): void {
    const a = this.borner(milieu - this.vue / 2, milieuY === null ? this.y : milieuY - this.vueH / 2);
    this.arreter();
    const ecart = Math.hypot(a[0] - this.x, a[1] - this.y);
    if (direct || this.fige || ecart < 1) {
      this.poser(a[0], a[1]);
      return;
    }
    this.glisse = { de: [this.x, this.y], a, debut: performance.now(), duree: dureeDuGlissement(ecart) };
    this.tourner();
  }

  /** La molette et les flèches : la cible s'éloigne de tant de cases, la caméra la rattrape en douceur. */
  pousser(dx: number, dy = 0): void {
    const depuis = this.cible ?? this.glisse?.a ?? [this.x, this.y];
    this.arreter();
    this.cible = this.borner(depuis[0] + dx, depuis[1] + dy);
    if (this.fige) {
      this.poser(this.cible[0], this.cible[1]);
      this.cible = null;
      return;
    }
    this.tourner();
  }

  /** Le doigt ou la souris tire le monde : la caméra suit, sans retard. */
  tirer(dx: number, dy = 0): void {
    this.arreter();
    this.poser(this.x + dx, this.y + dy);
  }

  /** Le doigt lâche le monde : l'élan (en cases par seconde) continue un peu, puis s'éteint. */
  lacher(vx: number, vy = 0): void {
    if (this.fige || Math.hypot(vx, vy) < 20) return;
    const borne = (v: number) => Math.max(-900, Math.min(900, v));
    this.elan = [borne(vx), borne(vy)];
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
        const d = douceur(part);
        this.poser(this.glisse.de[0] + (this.glisse.a[0] - this.glisse.de[0]) * d, this.glisse.de[1] + (this.glisse.a[1] - this.glisse.de[1]) * d);
        if (part >= 1) this.glisse = null;
        else encore = true;
      } else if (this.cible !== null) {
        const rx = this.cible[0] - this.x;
        const ry = this.cible[1] - this.y;
        if (Math.abs(rx) < 0.2 && Math.abs(ry) < 0.2) {
          this.poser(this.cible[0], this.cible[1]);
          this.cible = null;
        } else {
          const part = 1 - Math.exp(-dt / 190);
          this.poser(this.x + rx * part, this.y + ry * part);
          encore = true;
        }
      } else if (this.elan[0] !== 0 || this.elan[1] !== 0) {
        const bouge = this.poser(this.x + (this.elan[0] * dt) / 1000, this.y + (this.elan[1] * dt) / 1000);
        const frein = Math.exp(-dt / 420);
        this.elan = [this.elan[0] * frein, this.elan[1] * frein];
        if (Math.hypot(this.elan[0], this.elan[1]) < 6 || !bouge) this.elan = [0, 0];
        else encore = true;
      }
      this.demande = encore ? requestAnimationFrame(image) : 0;
    };
    this.demande = requestAnimationFrame(image);
  }
}
