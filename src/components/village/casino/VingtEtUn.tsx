import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, casino as appels } from "../../../lib/compte/api";
import { medaillon } from "../../../lib/jeu/casino-dessins";
import { rond as rondDeLaMise, druide, iconesDesGestes, GESTES_DU_VINGT_ET_UN } from "../../../lib/jeu/casino-vingt-et-un";
import { SONS_DU_VINGT_ET_UN } from "../../../lib/jeu/casino-vingt-et-un-sons";
import { versLaToile, type Toile } from "../../../lib/jeu/casino-toile";
import { conseil } from "../../../lib/village/casino/vingt-et-un";
import type { CoupDuVingtEtUn, ReponseDuVingtEtUn, TableDuVingtEtUn } from "../../../lib/village/contrat-casino";
import { motsDuRefus, refusDesMemesMises } from "../../../lib/village/ecran-casino";
import { MOTS_DU_DRUIDE, NOMS_DES_GESTES, REPOS_DU_VINGT_ET_UN, cartesDites, coupDuVingtEtUn, finDeLaMain, gestesPermis, motsDeLaSuite, motsDuRefusEnMain, nomDuGeste, type GestesPermis } from "../../../lib/village/ecran-vingt-et-un";
import { montrer, useJour, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { Bouton, Mots, Peinture, Pic } from "./Pieces";
import { Pupitre, usePupitre } from "./Pupitre";
import { SceneDuVingtEtUn } from "./scene-vingt-et-un";

/**
 * Le vingt-et-un (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée telle
 * quelle, le pourpre devenu bordeaux) : le jeu de cartes gaulois, le donneur et ses visages, la donne, la carte cachée qu'il
 * soulève, tirer, rester, doubler, séparer, « Rejouer », le conseil du druide, la fête douce du 21 d'entrée.
 *
 * Le serveur tire chaque carte au moment de la donner et garde la carte cachée (`distribuer_vingt_et_un`,
 * `jouer_vingt_et_un`) ; l'écran ne montre que ses faits, dans l'ordre (`SceneDuVingtEtUn`). Une main laissée ouverte (jeu
 * quitté, page rechargée) se reprend là où elle était (`lire_vingt_et_un`) : elle ne se perd jamais. Le druide conseille
 * d'après ce qu'on voit, par les règles de `src/lib/village/casino/vingt-et-un.ts`.
 */

type Phase = "lecture" | "mise" | "anime" | "joueur" | "fini";

/** Une toile en image CSS (`url(data:…)`), pour une variable de la racine du jeu. */
function enImage(t: Toile): string {
  const c = document.createElement("canvas");
  versLaToile(c, t);
  return `url("${c.toDataURL()}")`;
}

export default function LeVingtEtUn() {
  const casino = useCasino();
  const crou = useCroupier("donneur");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const jour = useJour();
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const tableEl = useRef<HTMLElement>(null);
  const couche = useRef<HTMLDivElement>(null);
  const ronds = useRef<HTMLDivElement>(null);
  const rond0 = useRef<HTMLButtonElement>(null);
  const decorEl = useRef<HTMLCanvasElement>(null);
  const lueurEl = useRef<HTMLCanvasElement>(null);
  const direEl = useRef<HTMLParagraphElement>(null);
  const W = useLargeurDuJeu(racine);

  // La phase se lit dans les promesses : elle vit dans une référence, l'écran suit son double.
  const [phase, setPhaseVue] = useState<Phase>("mise");
  const phaseRef = useRef<Phase>("mise");
  const setPhase = (p: Phase): void => {
    phaseRef.current = p;
    setPhaseVue(p);
  };
  const [table, setTableVue] = useState<TableDuVingtEtUn | null>(null);
  const tableRef = useRef<TableDuVingtEtUn | null>(null);
  const setTable = (t: TableDuVingtEtUn | null): void => {
    tableRef.current = t;
    setTableVue(t);
  };
  // Ce qu'il reste à miser aujourd'hui, d'après la dernière réponse du serveur.
  const [reste, setReste] = useState<number | null>(casino.etat.reste_du_jour);
  const [debut, setDebut] = useState(true);
  const [conseille, setConseille] = useState<CoupDuVingtEtUn | null>(null);
  const [druideMot, setDruideMot] = useState("");
  const [druideVu, setDruideVu] = useState(false);

  // Le dernier casino : le nettoyage de fin le lit encore après un nouveau rendu.
  const casinoRef = useRef(casino);
  casinoRef.current = casino;
  const arret = useRef({ monte: true, aFinir: null as ReponseDuVingtEtUn | null });
  // Une donne part au serveur : une main relue entre-temps ne la remplace pas.
  const envoi = useRef(false);

  /* --- La scène : la couche des cartes, tenue hors de Preact --- */
  const scene = useRef<SceneDuVingtEtUn | null>(null);
  useLayoutEffect(() => {
    const t = tableEl.current;
    if (!t || !couche.current || !ronds.current || !rond0.current || !decorEl.current || !lueurEl.current) return;
    const s = new SceneDuVingtEtUn({ table: t, couche: couche.current, ronds: ronds.current, rond0: rond0.current, decor: decorEl.current, lueur: lueurEl.current }, { dit: (a, b) => crou.dit(a, b), visage: (v) => crou.visage(v) });
    scene.current = s;
    s.mesurer(t.clientWidth);
    let largeur = t.clientWidth;
    const obs = new ResizeObserver(() => {
      if (t.clientWidth === largeur) return;
      largeur = t.clientWidth;
      s.mesurer(largeur);
    });
    obs.observe(t);
    return () => obs.disconnect();
  }, []);

  // Les images du jeu, faites une fois : les icônes des gestes, le rond de la mise, la tête du druide.
  const images = useMemo(() => {
    const ic = iconesDesGestes();
    return GESTES_DU_VINGT_ET_UN.map((k) => `--cas-pic-vu-${k}:${enImage(ic[k])}`).join(";") + `;--vu-s-rond:${enImage(rondDeLaMise())}`;
  }, []);
  const tete = useMemo(() => druide(), []);
  // Sur un téléphone, le panneau du croupier est sous le pupitre : son médaillon est aussi sur la table, et il y réagit.
  const mini = useMemo(() => medaillon("donneur", 17, jour, crou.etat.visage), [jour, crou.etat.visage]);

  /** Lu aux lecteurs d'écran (le conseil du druide, ce que la main a rendu), même quand la phrase se répète. */
  const dire = (t: string): void => {
    const el = direEl.current;
    if (!el) return;
    el.textContent = "";
    el.textContent = t;
  };

  /* --- Les gestes permis : les règles du serveur, puis la bourse et le reste du jour pour doubler et séparer --- */
  const limites = { bourse: casino.bourse, reste, god: casino.etat.god };
  const permis: GestesPermis = phase === "joueur" ? gestesPermis(table, limites) : gestesPermis(null, limites);
  // Une vraie main ne se continue pas pendant un essai du mode GOD : elle attend la fin de l'essai.
  const attendLEssai = phase === "joueur" && !!table && casino.etat.god && !table.god;
  const gestes = attendLEssai ? gestesPermis(null, limites) : permis;

  const cacherConseil = (): void => {
    setConseille(null);
    setDruideVu(false);
  };

  /** Efface la main d'avant : cartes, jetons, lueur, plaque du croupier. */
  const nettoyer = (): void => {
    scene.current?.nettoyer();
    setTable(null);
    cacherConseil();
    crou.efface();
  };

  /* --- Le pupitre : toucher un jeton le pose aussitôt sur la mise (le geste de la maquette), toucher le rond aussi --- */
  const totalAvant = useRef(0);
  useEffect(() => {
    const avant = totalAvant.current;
    totalAvant.current = pup.total;
    const ph = phaseRef.current;
    if (ph === "fini" && pup.total > 0) {
      // Un jeton posé après une main : la table se vide, une autre mise commence.
      nettoyer();
      setPhase("mise");
    } else if (ph !== "mise") return;
    scene.current?.montreMise(pup.total, pup.total > avant);
    if (pup.total) crou.dit(REPOS_DU_VINGT_ET_UN[0], REPOS_DU_VINGT_ET_UN[1]);
  }, [pup.total]);
  const surPupitre = (ev: MouseEvent): void => {
    const cible = ev.target as Element | null;
    const ph = phaseRef.current;
    // Le jeton vient d'être choisi : il se pose une fois le pupitre redessiné avec lui.
    if (cible?.closest(".cas-jeton") && (ph === "mise" || ph === "fini")) setTimeout(() => pup.poser("mise"), 0);
  };
  const surRond = (): void => {
    const ph = phaseRef.current;
    if (ph === "mise" || ph === "fini") pup.poser("mise");
  };

  /* --- Une main --- */

  /** Le serveur a répondu : la barre montre la bourse sans la mise, et ce que la main rend attend la fin des cartes. */
  const recu = (rep: ReponseDuVingtEtUn): void => {
    casino.prendreLaMise(coupDuVingtEtUn(rep));
    setTable(rep.table);
    setReste(rep.reste_du_jour);
    arret.current.aFinir = rep.table.phase === "fini" ? rep : null;
  };
  /** Le jeu a été quitté pendant que le serveur répondait : la bourse reçoit ses nombres, sans un son ni un mouvement. */
  const quitte = (rep: ReponseDuVingtEtUn): void => {
    const c = casinoRef.current;
    c.prendreLaMise(coupDuVingtEtUn(rep));
    if (rep.table.phase === "fini") c.finDeTour({ coup: coupDuVingtEtUn(rep), muet: true });
  };

  async function lancer(): Promise<void> {
    if (phaseRef.current !== "mise") return;
    envoi.current = true;
    const pris = await pup.engager((_m, total) => appels.distribuer(total)).finally(() => (envoi.current = false));
    if (!pris.ok) {
      // Une main attend déjà (laissée ouverte ailleurs) : on la reprend.
      if (pris.code === "main_en_cours" && arret.current.monte) void reprendre();
      return;
    }
    const rep = pris.valeur;
    if (!arret.current.monte) return quitte(rep);
    recu(rep);
    setPhase("anime");
    setDebut(false);
    cacherConseil();
    scene.current?.debut(rep.table.mise);
    crou.dit("Rien ne va plus", "Les cartes sortent");
    crou.visage("");
    if (W < 760) montrer(salle.current);
    await scene.current?.montrer(rep.table.faits);
    if (arret.current.monte) suite(rep.table, rep);
  }

  async function jouerLeCoup(coup: CoupDuVingtEtUn): Promise<void> {
    const t = tableRef.current;
    if (phaseRef.current !== "joueur" || !t || !gestes[coup]) return;
    cacherConseil();
    setPhase("anime");
    let rep: ReponseDuVingtEtUn;
    try {
      rep = await appels.jouer(t.partie, t.tour, coup);
    } catch (err) {
      if (!arret.current.monte) return;
      const code = err instanceof ServerError ? err.code : "network";
      // La main a changé ailleurs (un double clic, un autre onglet) : on la relit.
      if (code === "main_changee" || code === "pas_de_main") return void reprendre();
      setPhase("joueur");
      crou.refus(...motsDuRefusEnMain(code, reste ?? undefined));
      return;
    }
    if (!arret.current.monte) return quitte(rep);
    recu(rep);
    await scene.current?.montrer(rep.table.faits);
    if (arret.current.monte) suite(rep.table, rep);
  }

  /** Après les cartes : la main suivante à jouer, ou la fin. */
  function suite(t: TableDuVingtEtUn, rep: ReponseDuVingtEtUn | null): void {
    if (t.phase !== "joueur") {
      if (rep) fin(rep);
      return;
    }
    setPhase("joueur");
    scene.current?.attenuer(t.mains.length > 1 ? t.courante : -1);
    if (casinoRef.current.etat.god && !t.god) crou.dit(...motsDuRefus("mode_god"));
    else {
      crou.dit(...motsDeLaSuite(t));
      dire(cartesDites(t));
    }
  }

  /** La fin de la main : l'annonce du croupier, la plaque, et le casino qui rend le gain, une seule fois. */
  function fin(rep: ReponseDuVingtEtUn): void {
    arret.current.aFinir = null;
    const t = rep.table;
    const f = finDeLaMain(t);
    crou.dit(f.titre, f.sous);
    dire(f.dire);
    crou.resultat({ signe: f.signe, ton: f.ton, rendu: t.rendu, mise: t.misee });
    // La pluie lente : le 21 d'entrée seulement ; ni fête ni reproche quand on ne gagne rien.
    casino.finDeTour({ coup: coupDuVingtEtUn(rep), grand: f.fete, croupier: crou, scene: tableEl.current });
    setPhase("fini");
    pup.finir();
  }

  /**
   * Reprend la main laissée ouverte : `depart` si on l'a déjà, sinon relue au serveur. Les cartes se posent d'un coup, la main
   * continue où elle était. Sans main ouverte, la table attend une mise.
   */
  async function reprendre(depart?: TableDuVingtEtUn | null): Promise<void> {
    setPhase("lecture");
    pup.verrou(true);
    let t = depart;
    if (t === undefined) {
      try {
        t = (await appels.lire()).table;
      } catch {
        t = null;
      }
    }
    if (!arret.current.monte) return;
    nettoyer();
    if (!t || t.phase !== "joueur") {
      // Plus de main ouverte (finie ailleurs) : le pupitre se vide, et la barre relit la bourse au serveur (get_casino).
      pup.finir();
      if (depart === undefined) void appels.etat().catch(() => undefined);
      setPhase("mise");
      crou.dit(...REPOS_DU_VINGT_ET_UN);
      return;
    }
    setTable(t);
    setDebut(false);
    scene.current?.debut(t.mise);
    scene.current?.montreMise(t.mise, false);
    await scene.current?.montrer(t.faits, true);
    if (arret.current.monte) suite(t, null);
  }

  /** Rejouer la même mise, d'un seul geste : le pupitre la repose, puis on distribue. */
  function rejouer(): void {
    if (phaseRef.current !== "fini" || !pup.dernieres) return;
    // Plus assez dans la bourse ou le reste du jour : le pupitre le dit, rien ne part.
    if (refusDesMemesMises(pup.dernieres, casino.limites)) return pup.memes();
    nettoyer();
    setPhase("mise");
    pup.memes();
    void lancer();
  }

  /** Le conseil du druide : le coup qui vaut le plus parmi ceux qui sont permis, d'après les cartes qu'on voit. */
  function demanderConseil(): void {
    const t = tableRef.current;
    if (phaseRef.current !== "joueur" || !t) return;
    const m = t.mains[t.courante];
    const visible = t.tavernier[0];
    if (!m || !visible) return;
    const { coup } = conseil(m.cartes, visible, gestes);
    if (!coup) return;
    setConseille(coup);
    setDruideMot(MOTS_DU_DRUIDE[coup][0]);
    setDruideVu(true);
    SONS_DU_VINGT_ET_UN.druide();
    dire(`Le druide conseille de ${MOTS_DU_DRUIDE[coup][1]}.`);
  }

  /* --- Le départ : une main laissée ouverte se reprend --- */
  useEffect(() => {
    crou.dit(...REPOS_DU_VINGT_ET_UN);
    if (casino.etat.main) void reprendre();
    else
      // Une main ouverte ailleurs depuis la lecture du casino : on la reprend si personne n'a encore misé.
      appels
        .lire()
        .then((r) => {
          if (r.table && arret.current.monte && phaseRef.current === "mise" && !envoi.current) void reprendre(r.table);
        })
        .catch(() => undefined);
    return () => {
      // On quitte la table en pleine animation de la dernière main : elle se finit sans mouvement (la bourse reçoit son
      // solde, la partie s'inscrit). Une main encore ouverte attend au serveur.
      arret.current.monte = false;
      if (scene.current) scene.current.vivante = false;
      const r = arret.current.aFinir;
      if (r) casinoRef.current.finDeTour({ coup: coupDuVingtEtUn(r), muet: true });
    };
  }, []);

  /* --- Le clavier : un bouton qui s'éteint le temps d'une animation perd le focus, on le lui rend --- */
  const foyer = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const ailleurs = (ev: PointerEvent): void => {
      if (!(ev.target as Element | null)?.closest?.(".vu-salle button")) foyer.current = null;
    };
    document.addEventListener("pointerdown", ailleurs);
    return () => document.removeEventListener("pointerdown", ailleurs);
  }, []);
  useEffect(() => {
    if (phase !== "joueur" && phase !== "fini") return;
    const s = salle.current;
    const utilisable = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.isConnected && !(el as HTMLButtonElement).disabled && !el.closest("[hidden]");
    const a = document.activeElement as HTMLElement | null;
    const vers = s?.querySelector<HTMLElement>(phase === "joueur" ? '.vu-geste[data-geste="tirer"]' : ".vu-rejouer");
    // Le pupitre, rouvert, vient de rendre le focus à « mêmes mises » : ici, la suite d'une main est « Rejouer ».
    if (phase === "fini" && a && s?.querySelector(".vu-pupitre")?.contains(a) && utilisable(vers)) return void vers.focus({ preventScroll: true });
    if (!foyer.current || (a && a !== document.body && utilisable(a))) return;
    const but = utilisable(foyer.current) ? foyer.current : vers;
    if (utilisable(but)) but.focus({ preventScroll: true });
  }, [phase]);

  const d = pup.dernieres ? Object.values(pup.dernieres).reduce((a, b) => a + b, 0) : 0;
  const montreRejouer = d > 0 && phase === "fini";

  return (
    <div class="cas-jeu vu-jeu" ref={racine} style={images}>
      <div class={`vu-salle ${debut ? "vu-debut" : ""}`} ref={salle} onFocusIn={(ev) => (foyer.current = ev.target as HTMLElement)}>
        <section class="cas-tapis vu-table" aria-label="La table" ref={tableEl}>
          <canvas class="vu-decor" ref={decorEl} aria-hidden="true" />
          <canvas class="vu-lueur" ref={lueurEl} aria-hidden="true" />
          <Peinture toile={mini} classe="vu-mini" />
          <button class="vu-rond" type="button" ref={rond0} aria-label="Poser le jeton choisi sur la mise" disabled={phase !== "mise" && phase !== "fini"} onClick={surRond} />
          <div class="vu-ronds" ref={ronds} aria-hidden="true" />
          <div class="vu-couche" ref={couche} aria-hidden="true" />
        </section>
        <PanneauDuCroupier croupier={crou} classe="vu-croupier" />
        <div class="vu-gestes cas-panneau jeu-n9">
          <div class="vu-coups" role="group" aria-label="Vos gestes">
            {GESTES_DU_VINGT_ET_UN.map((k) => (
              <Bouton
                key={k}
                ton="bordeaux"
                icone={`vu-${k}`}
                mot={NOMS_DES_GESTES[k][0]}
                nom={nomDuGeste(k, gestes, phase === "joueur" ? (table?.permis ?? null) : null)}
                classe={`vu-geste cas-halo ${conseille === k ? "cas-sorti" : ""}`}
                disabled={!gestes[k]}
                data-geste={k}
                onClick={() => void jouerLeCoup(k)}
              />
            ))}
          </div>
          <div class="vu-suite">
            <button type="button" class="jeu-btn jeu-n9 jeu-btn-bleu jeu-btn-ic vu-druide" aria-label="Le conseil du druide : le meilleur coup" title="Le conseil du druide : le meilleur coup" disabled={phase !== "joueur" || attendLEssai} onClick={demanderConseil}>
              <Peinture toile={tete} />
            </button>
            <span class={`vu-druide-dit ${druideVu ? "vu-vu" : ""}`} aria-hidden="true">
              {druideMot && <Mots t={druideMot} couleur="or" muet />}
            </span>
            {montreRejouer && <Bouton ton="or" mot={`Rejouer ${d}`} nom={`Rejouer la même mise : ${d} statères`} classe="vu-rejouer" data-jeu-son="" onClick={rejouer} />}
          </div>
          <p class="sr-only" aria-live="polite" ref={direEl} />
        </div>
        <div class="vu-pupitre" onClick={surPupitre}>
          <Pupitre pupitre={pup} action="Distribuer" nomAction="Distribuer les cartes" surAction={() => void lancer()} />
        </div>
      </div>
      <details class="cas-pli cas-panneau jeu-n9 vu-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Approchez 21 sans le dépasser, et faites mieux que le croupier.</li>
          <li>Les cartes de 2 à 10 valent leur chiffre. Le valet, la dame et le roi valent 10. L'as vaut 1 ou 11.</li>
          <li>Le paquet est sans fin : chaque carte est tirée au hasard parmi les 52, puis remise. Le serveur la tire avant qu'elle sorte du sabot.</li>
          <li>Le croupier montre une carte et en cache une. Il tire jusqu'à 16 et s'arrête dès 17, même avec un as compté 11.</li>
          <li>21 d'entrée (un as et une carte qui vaut 10) : payé 3 pour 2. Pour 10 statères misés, on en reçoit 25, mise comprise. Si le croupier a lui aussi 21 d'entrée, la mise est rendue.</li>
          <li>Si le croupier a 21 d'entrée, la main s'arrête aussitôt : on ne perd que sa mise.</li>
          <li>Main gagnée : on reçoit 2 fois la mise. Égalité : la mise est rendue. Plus de 21 : perdu.</li>
          <li>Doubler : sur ses deux premières cartes, la mise est doublée et on reçoit une seule carte de plus. Permis aussi après avoir séparé.</li>
          <li>Séparer : deux cartes de même valeur font deux mains, une seule fois. Des as séparés reçoivent une seule carte chacun. Un 21 après avoir séparé n'est pas un 21 d'entrée.</li>
          <li>Ni assurance, ni abandon.</li>
          <li>200 statères au plus pour la mise de départ. Doubler et séparer restent permis tant que la bourse et le plafond du jour suffisent. Jetons de 10, 20, 50, 100 et 200.</li>
          <li>Une main laissée en cours vous attend : elle reprend où elle était.</li>
          <li>Joué au mieux, le jeu rend en moyenne 99,4 % de la mise, jamais plus.</li>
          <li>Le druide montre le meilleur coup parmi ceux qui sont permis.</li>
        </ul>
      </details>
    </div>
  );
}
