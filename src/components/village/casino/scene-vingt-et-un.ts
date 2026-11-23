import { h, render } from "preact";
import type { Visage } from "../../../lib/jeu/casino-dessins";
import { SONS } from "../../../lib/jeu/casino-sons";
import { jetonDeMise, pair, poseToile, versLaToile } from "../../../lib/jeu/casino-toile";
import { SONS_DU_VINGT_ET_UN, type SonDuVingtEtUn } from "../../../lib/jeu/casino-vingt-et-un-sons";
import { decor, dos, face, lueurDuVingtEtUn, miseEnPage, placesDesCartes, HC, type MiseEnPageDuVingtEtUn } from "../../../lib/jeu/casino-vingt-et-un";
import { total } from "../../../lib/village/casino/vingt-et-un";
import type { CarteDuVingtEtUn, FaitDuVingtEtUn } from "../../../lib/village/contrat-casino";
import { pastille, rubanDuBilan } from "../../../lib/village/ecran-vingt-et-un";
import { Etiquette } from "../../jeu/Pixels";
import { attendre, sansMouvement } from "./commun";
import { Mots } from "./Pieces";

/**
 * La table du vingt-et-un (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * mouvement pour mouvement) : les cartes qui sortent du sabot, glissent sur le feutre en tournant un peu et se retournent en
 * arrivant ; le croupier qui soulève le coin de sa carte cachée ; les pastilles des totaux ; les étiquettes des bilans ; les
 * jetons qui arrivent sur le rond de la mise et en partent. Tout bouge par `transform`, en pixels pairs.
 *
 * La scène ne fait que montrer, dans l'ordre, les faits que le serveur a déjà décidés (`montrer`) : une animation ne change
 * jamais un résultat. Elle tient le DOM de la couche des cartes ; le composant `VingtEtUn.tsx` tient le reste.
 */

/** Ce que la scène demande au croupier. */
export interface VoixDeLaScene {
  dit(titre: string, sous?: string): void;
  visage(v: Visage): void;
}
/** Les éléments de la table, posés par le composant. */
export interface ElementsDeLaTable {
  table: HTMLElement;
  couche: HTMLElement;
  ronds: HTMLElement;
  rond0: HTMLElement;
  decor: HTMLCanvasElement;
  lueur: HTMLCanvasElement;
}

interface CarteSurLaTable {
  carte: CarteDuVingtEtUn | null;
  el: HTMLDivElement;
  cv: HTMLCanvasElement;
  visible: boolean;
  /** Le penché d'une carte n'est qu'un décor. */
  penche: number;
  x: number;
  y: number;
  r: number;
  s: number;
}
interface MainSurLaTable {
  qui: "joueur" | "croupier";
  cx: number;
  y: number;
  cartes: CarteSurLaTable[];
  badge: HTMLSpanElement;
  ouverte: boolean;
  rond: HTMLElement | null;
  ruban: HTMLSpanElement | null;
}

const poser = (o: CarteSurLaTable): void => {
  o.el.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.r}deg) scale(${o.s})`;
};
const ecris = (el: HTMLElement, t: string): void => render(h(Mots, { t, couleur: "creme", muet: true }), el);

export class SceneDuVingtEtUn {
  G: MiseEnPageDuVingtEtUn | null = null;
  private mainT: MainSurLaTable | null = null;
  private mainsJ: MainSurLaTable[] = [];
  /** La mise de chaque main, suivie fait après fait (doublée, séparée). */
  private mises: number[] = [];
  /** Faux quand le jeu est quitté : plus un son, plus un mouvement. */
  vivante = true;
  /** Vrai pendant qu'une main reprise se pose d'un coup : ni mouvement, ni son, ni annonce. */
  private vite = false;

  constructor(
    private readonly el: ElementsDeLaTable,
    private readonly voix: VoixDeLaScene,
  ) {}

  private immobile(): boolean {
    return this.vite || sansMouvement();
  }
  /** Attend `ms`, ou rien quand rien ne bouge. */
  private pause(ms: number): Promise<void> {
    return this.immobile() || !this.vivante ? Promise.resolve() : attendre(ms);
  }
  private son(s: SonDuVingtEtUn): void {
    if (this.vivante && !this.vite) SONS_DU_VINGT_ET_UN[s]();
  }

  /* ----- La mise en page : tout en pixels pairs, à partir de la largeur ----- */

  mesurer(largeur: number): void {
    if (largeur < 120) return;
    const G = miseEnPage(largeur);
    this.G = G;
    const { table, lueur } = this.el;
    table.style.setProperty("--vu-h", G.H + "px");
    table.classList.toggle("vu-etroit", G.etroit);
    poseToile(this.el.decor, decor(G));
    poseToile(lueur, lueurDuVingtEtUn(Math.min(170, (G.W >> 1) - 8), 112));
    lueur.style.left = pair(G.cx - lueur.width) + "px";
    lueur.style.top = G.yJ + HC / 2 - lueur.height + "px";
    this.replacer();
  }
  /** Après un changement de taille : tout retrouve sa place, sans mouvement. */
  private replacer(): void {
    const G = this.G;
    if (!G) return;
    const { table } = this.el;
    table.classList.add("vu-fige");
    if (this.mainT) {
      this.mainT.cx = G.cxT;
      this.mainT.y = G.yT;
      this.ranger(this.mainT);
    }
    this.mainsJ.forEach((m, i) => {
      m.cx = this.mainsJ.length > 1 ? G.cx + (i ? G.sep : -G.sep) : G.cx;
      m.y = G.yJ;
      this.ranger(m);
    });
    if (!this.mainsJ.length) this.placerRond(this.el.rond0, G.cx);
    void table.offsetWidth;
    table.classList.remove("vu-fige");
  }
  private placerRond(el: HTMLElement, cx: number): void {
    if (!this.G) return;
    el.style.left = cx - 32 + "px";
    el.style.top = this.G.yM + "px";
  }

  /* ----- Les cartes ----- */

  private va(o: CarteSurLaTable, vers: Partial<Pick<CarteSurLaTable, "x" | "y" | "r" | "s">>, ms: number): void {
    Object.assign(o, vers);
    o.el.style.transitionDuration = (this.immobile() ? 0 : ms) + "ms";
    poser(o);
  }
  private nouvelleMain(qui: MainSurLaTable["qui"], cx: number, y: number): MainSurLaTable {
    const badge = document.createElement("span");
    badge.className = "vu-total cas-gemme cas-feutre jeu-n9";
    badge.hidden = true;
    this.el.couche.append(badge);
    return { qui, cx, y, cartes: [], badge, ouverte: true, rond: null, ruban: null };
  }
  private ranger(m: MainSurLaTable, ms = 240): void {
    const G = this.G;
    if (!G) return;
    const pl = placesDesCartes(G, m.cartes.length, m.cx, m.y, this.mainsJ.length > 1 && m.qui === "joueur");
    m.cartes.forEach((c, i) => this.va(c, { x: pl[i]!.x, y: pl[i]!.y, r: c.penche, s: 1 }, ms));
    m.badge.style.left = m.cx + "px";
    m.badge.style.top = m.y - 26 + "px";
    if (m.ruban) {
      m.ruban.style.left = m.cx + "px";
      m.ruban.style.top = m.y + 50 + "px";
    }
    if (m.rond) this.placerRond(m.rond, m.cx);
  }
  /** Ce que vaut ce qu'on voit de la main, sur sa pastille. */
  private majTotal(m: MainSurLaTable): void {
    const vues = m.cartes.filter((c) => c.visible && c.carte).map((c) => c.carte!);
    const p = pastille(vues, m.qui === "joueur" && m.ouverte);
    if (!p) {
      m.badge.hidden = true;
      return;
    }
    ecris(m.badge, p.texte);
    m.badge.className = `vu-total cas-gemme jeu-n9 ${p.rouge ? "cas-rouge" : "cas-feutre"}`;
    m.badge.hidden = false;
  }
  /** Une carte sort du sabot, glisse sur le feutre en tournant un peu, et se retourne en arrivant. */
  private async donner(m: MainSurLaTable, carte: CarteDuVingtEtUn | null, visible: boolean): Promise<void> {
    const G = this.G!;
    const el = document.createElement("div");
    const cv = poseToile(document.createElement("canvas"), dos());
    el.className = "vu-carte";
    el.append(cv);
    const o: CarteSurLaTable = { carte, el, cv, visible: false, penche: (Math.random() - 0.5) * 3.2, x: G.sabot.x - 9, y: G.sabot.y - 30, r: -24, s: 0.6 };
    el.style.transitionDuration = "0ms";
    poser(o);
    this.el.couche.append(el);
    void el.offsetWidth;
    m.cartes.push(o);
    this.son("carte");
    this.ranger(m, 300);
    await this.pause(290);
    if (visible && carte) await this.retourner(o);
    if (m.qui === "joueur") el.classList.add("vu-vive");
    this.majTotal(m);
  }
  private async retourner(o: CarteSurLaTable): Promise<void> {
    if (!o.carte) return;
    this.son("retourne");
    const vite = this.immobile();
    o.cv.style.transition = vite ? "none" : "transform .1s ease-in";
    o.cv.style.transform = "scaleX(.04)";
    await this.pause(105);
    o.visible = true;
    versLaToile(o.cv, face(o.carte));
    // La carte montrée, lisible par les essais (toujours celle que le serveur a tirée).
    o.el.dataset["vuCarte"] = `${o.carte.r}-${o.carte.e}`;
    o.cv.style.transition = vite ? "none" : "transform .17s cubic-bezier(.3,1.5,.5,1)";
    o.cv.style.transform = "";
    await this.pause(175);
    o.cv.style.transition = "";
  }
  /** L'étiquette posée sur une main : gagné, perdu, égalité… */
  private ruban(m: MainSurLaTable, mot: string, ton: "rouge" | "bleu" | "or"): void {
    const r = document.createElement("span");
    r.className = "vu-ruban";
    render(h(Etiquette, { t: mot, ton }), r);
    this.el.couche.append(r);
    m.ruban = r;
    r.style.left = m.cx + "px";
    r.style.top = m.y + 50 + "px";
    void r.offsetWidth;
    r.classList.add("vu-vu");
  }
  /** Assombrit les cartes des mains qui ne se jouent pas (-1 : aucune). */
  attenuer(courante: number): void {
    this.mainsJ.forEach((m, i) => m.cartes.forEach((c) => c.el.classList.toggle("vu-attend", courante >= 0 && i !== courante)));
  }

  /* ----- Les jetons sur le rond de la mise ----- */

  private jetonEl(montant: number, classe = ""): HTMLCanvasElement {
    const c = poseToile(document.createElement("canvas"), jetonDeMise(montant, 13));
    c.className = "vu-jeton " + classe;
    c.setAttribute("aria-hidden", "true");
    return c;
  }
  /** Pendant qu'on mise : le rond du milieu montre ce que le pupitre compte. */
  montreMise(somme: number, retombe: boolean): void {
    const rond0 = this.el.rond0;
    let c = rond0.querySelector<HTMLCanvasElement>(".vu-jeton");
    if (!somme) {
      c?.remove();
      return;
    }
    if (c && Number(c.dataset["v"]) === somme) return;
    c?.remove();
    c = this.jetonEl(somme);
    c.dataset["v"] = String(somme);
    if (retombe && !sansMouvement()) c.style.animation = "cas-pose .22s cubic-bezier(.3,1.5,.5,1) 1";
    rond0.append(c);
  }
  /** Un jeton de plus arrive sur le rond (le double, le paiement du croupier). */
  private async ajouterJeton(el: HTMLElement | null, montant: number, classe: string): Promise<void> {
    if (!el || montant <= 0) return;
    const c = this.jetonEl(montant, classe + " vu-arrive");
    el.append(c);
    void c.offsetWidth;
    c.classList.remove("vu-arrive");
    if (this.vivante && !this.vite) SONS.jeton(1);
    await this.pause(420);
  }
  /** Les jetons quittent le rond : vers le joueur (`vu-rentre`) ou vers la caisse (`vu-perd`). */
  private async partir(el: HTMLElement | null, classe: "vu-rentre" | "vu-perd"): Promise<void> {
    if (!el) return;
    for (const c of el.querySelectorAll(".vu-jeton")) c.classList.add(classe);
    if (classe === "vu-rentre" && this.vivante && !this.vite) SONS.ramasse();
    await this.pause(460);
    for (const c of el.querySelectorAll(".vu-jeton")) c.remove();
  }

  /* ----- Une main ----- */

  /** Efface la main d'avant : cartes, pastilles, étiquettes, jetons, lueur. */
  nettoyer(): void {
    const { couche, ronds, rond0, lueur } = this.el;
    couche.replaceChildren();
    ronds.replaceChildren();
    for (const c of rond0.querySelectorAll(".vu-jeton")) c.remove();
    lueur.classList.remove("vu-vue");
    this.mainT = null;
    this.mainsJ = [];
    this.mises = [];
    if (this.G) this.placerRond(rond0, this.G.cx);
  }
  /** Une donne commence : la main du croupier, celle du joueur sur le rond du milieu. */
  debut(mise: number): void {
    const G = this.G;
    if (!G) return;
    this.mainT = this.nouvelleMain("croupier", G.cxT, G.yT);
    this.mainT.ouverte = false;
    const j = this.nouvelleMain("joueur", G.cx, G.yJ);
    j.rond = this.el.rond0;
    this.mainsJ = [j];
    this.mises = [mise];
  }

  /**
   * Montre, dans l'ordre, ce que le serveur a déjà décidé. `vite` : une main reprise, posée d'un coup (ni mouvement, ni son).
   * S'arrête si le jeu est quitté.
   */
  async montrer(faits: readonly FaitDuVingtEtUn[], vite = false): Promise<void> {
    if (!this.G || !this.mainT) return;
    this.vite = vite;
    if (vite) this.el.table.classList.add("vu-fige");
    try {
      let apresRetourne = false;
      for (const f of faits) {
        if (!this.vivante) return;
        if (f.t === "carte") {
          if (f.a === "joueur") {
            const m = this.mainsJ[f.main];
            if (!m) continue;
            await this.donner(m, f.carte, true);
            if (total(m.cartes.flatMap((c) => (c.carte ? [c.carte] : []))).t >= 21) {
              m.ouverte = false;
              this.majTotal(m);
            }
          } else {
            if (apresRetourne && !vite) {
              this.voix.dit("Le croupier tire", "Il s'arrête dès 17");
              await this.pause(340);
            }
            await this.donner(this.mainT, f.carte, !f.cachee);
          }
        } else if (f.t === "regarde") {
          // il soulève le coin de sa carte cachée
          const c = this.mainT.cartes[1];
          if (!c || vite) continue;
          this.voix.visage("Lance");
          this.son("regarde");
          this.va(c, { y: this.mainT.y - 12, r: c.penche - 7, s: 1.06 }, 240);
          await this.pause(620);
          this.va(c, { y: this.mainT.y, r: c.penche, s: 1 }, 220);
          await this.pause(340);
          if (this.vivante) this.voix.visage("");
        } else if (f.t === "retourne") {
          this.mainsJ.forEach((m) => {
            m.ouverte = false;
            this.majTotal(m);
          });
          this.attenuer(-1);
          const c = this.mainT.cartes[1];
          if (c && !c.visible) {
            c.carte = f.carte;
            await this.pause(180);
            await this.retourner(c);
            this.majTotal(this.mainT);
            await this.pause(260);
          }
          apresRetourne = true;
        } else if (f.t === "double") {
          const avant = this.mises[f.main] ?? 0;
          this.mises[f.main] = avant * 2;
          await this.ajouterJeton(this.mainsJ[f.main]?.rond ?? null, avant, "vu-double");
        } else if (f.t === "separe") await this.separerLesMains();
        else if (f.t === "main") {
          const m = this.mainsJ[f.main - 1];
          if (m) {
            m.ouverte = false;
            this.majTotal(m);
          }
          this.attenuer(f.main);
          await this.pause(220);
        } else if (f.t === "bilan") await this.bilan(f);
      }
    } finally {
      if (vite) {
        void this.el.table.offsetWidth;
        this.el.table.classList.remove("vu-fige");
      }
      this.vite = false;
    }
  }

  private async separerLesMains(): Promise<void> {
    const G = this.G!;
    const a = this.mainsJ[0];
    if (!a) return;
    const mise = this.mises[0] ?? 0;
    this.mises = [mise, mise];
    const b = this.nouvelleMain("joueur", G.cx + G.sep, G.yJ);
    const deuxieme = a.cartes.pop();
    if (deuxieme) b.cartes.push(deuxieme);
    this.mainsJ.push(b);
    a.cx = G.cx - G.sep;
    b.rond = document.createElement("div");
    b.rond.className = "vu-rond";
    this.placerRond(b.rond, G.cx);
    this.el.ronds.append(b.rond);
    void b.rond.offsetWidth;
    this.son("glisse");
    this.ranger(a, 320);
    this.ranger(b, 320);
    this.majTotal(a);
    this.majTotal(b);
    this.attenuer(0);
    await this.pause(330);
    await this.ajouterJeton(b.rond, mise, "");
    await this.pause(120);
  }

  private async bilan(f: Extract<FaitDuVingtEtUn, { t: "bilan" }>): Promise<void> {
    const m = this.mainsJ[f.main];
    if (!m) return;
    const mise = this.mises[f.main] ?? 0;
    m.ouverte = false;
    this.majTotal(m);
    const r = rubanDuBilan(f);
    this.ruban(m, r.mot, r.ton);
    if (f.issue === "perdu") {
      if (f.saute) this.son("saute");
      await this.pause(300);
      await this.partir(m.rond, "vu-perd");
    } else if (f.issue === "egal") {
      await this.pause(420);
      await this.partir(m.rond, "vu-rentre");
    } else {
      if (r.fete) {
        this.el.lueur.classList.add("vu-vue");
        if (!this.vite) this.voix.visage("Bee");
      }
      await this.pause(r.fete ? 520 : 260);
      await this.ajouterJeton(m.rond, f.recu - mise, "vu-gain"); // le croupier paie
      await this.pause(r.fete ? 620 : 340);
      await this.partir(m.rond, "vu-rentre");
    }
    await this.pause(140);
  }
}
