import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, casino as appels } from "../../../lib/compte/api";
import { dos, face } from "../../../lib/jeu/casino-vingt-et-un";
import { SONS_DU_VINGT_ET_UN } from "../../../lib/jeu/casino-vingt-et-un-sons";
import { versLaToile } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { SORTES_DU_POKER, conseilDuBarde, type CarteDuPoker } from "../../../lib/village/casino/poker";
import type { CoupDuCasino, CoupDuPoker, DonneDuPoker } from "../../../lib/village/contrat-casino";
import { motsDuRefus } from "../../../lib/village/ecran-casino";
import { Etiquette } from "../../jeu/Pixels";
import { attendre, montrer, sansMouvement, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { Bouton, Mots, Pic } from "./Pieces";
import { Pupitre, usePupitre } from "./Pupitre";

/**
 * Le poker du barde (28 novembre 2026, maquette jouable validée par le pilote : « Oui, construis ») : cinq cartes du jeu
 * gaulois du vingt-et-un, on touche celles qu'on garde, « Tirer » remplace les autres une fois, puis la main paie selon la
 * table des gains. Le barde montre le meilleur choix (`conseilDuBarde`, calcul exact sur toutes les cartes qui peuvent venir).
 *
 * Le serveur tire la donne et le tirage (`distribuer_poker`, `jouer_poker`) ; l'écran ne fait que retourner les cartes qu'il a
 * reçues. Une animation ne change jamais un résultat. Une main laissée ouverte (jeu quitté, page rechargée) attend son
 * joueur : `get_casino` la rend (`poker`), et elle reprend là où elle était.
 */

type Phase = "mise" | "anime" | "choix" | "fini";

const NOMS_DES_RANGS = ["as", "2", "3", "4", "5", "6", "7", "8", "9", "10", "valet", "dame", "roi"];
const NOMS_DES_ENSEIGNES = ["torques", "flammes", "épées", "chênes"];
const nomDeLaCarte = (c: CarteDuPoker): string => `${NOMS_DES_RANGS[c.r]} de ${NOMS_DES_ENSEIGNES[c.e]}`;

const ARTICLE = (r: number): string => (r === 0 ? "l'" : r === 11 ? "la " : "le ");
const PLURIEL = (r: number): string => (r === 0 || (r >= 1 && r <= 9) ? NOMS_DES_RANGS[r]! : `${NOMS_DES_RANGS[r]}s`);
const NOMBRES = ["", "", "deux", "trois", "quatre"];

/** Ce que dit le barde de son choix, en mots courts : « Je garde les deux as », « Je garde le valet et la dame ». */
function motsDuBarde(main: readonly CarteDuPoker[], gardes: readonly boolean[]): string {
  const n = gardes.filter(Boolean).length;
  if (n === 0) return "Je jette tout";
  if (n === 5) return "Je garde tout";
  const parRang = new Map<number, number>();
  main.forEach((c, i) => gardes[i] && parRang.set(c.r, (parRang.get(c.r) ?? 0) + 1));
  const mots = [...parRang].map(([r, k]) => (k > 1 ? `les ${NOMBRES[k]} ${PLURIEL(r)}` : `${ARTICLE(r)}${NOMS_DES_RANGS[r]}`));
  return `Je garde ${mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots.at(-1)}` : mots[0]}`;
}

export default function LePoker() {
  const casino = useCasino();
  const crou = useCroupier("barde");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const tapis = useRef<HTMLElement>(null);
  const toiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const direEl = useRef<HTMLParagraphElement>(null);
  const W = useLargeurDuJeu(racine);

  const [phase, setPhaseVue] = useState<Phase>("mise");
  const phaseRef = useRef<Phase>("mise");
  const setPhase = (p: Phase): void => {
    phaseRef.current = p;
    setPhaseVue(p);
  };
  const [main, setMain] = useState<CarteDuPoker[] | null>(null);
  const [gardes, setGardes] = useState<boolean[]>([false, false, false, false, false]);
  const [partie, setPartie] = useState<number | null>(null);
  const [sorte, setSorte] = useState<number | null>(null);
  const [conseil, setConseil] = useState<boolean[] | null>(null);
  const [bardeMot, setBardeMot] = useState("");
  const [reflechit, setReflechit] = useState(false);
  const monte = useRef(true);
  useEffect(
    () => () => {
      monte.current = false;
    },
    [],
  );

  const dire = (t: string): void => {
    const el = direEl.current;
    if (!el) return;
    el.textContent = "";
    el.textContent = t;
  };

  // Le dos des cartes au départ. `versLaToile` seulement : la taille à l'écran vient de la feuille (les cartes rétrécissent
  // sur un téléphone), pas de la toile.
  useLayoutEffect(() => {
    for (const cv of toiles.current) if (cv) versLaToile(cv, dos());
  }, []);

  /** Retourne la carte `i` : elle se couche, change de face, se relève. */
  async function retourner(i: number, carte: CarteDuPoker | null): Promise<void> {
    const cv = toiles.current[i];
    if (!cv) return;
    const vite = sansMouvement();
    SONS_DU_VINGT_ET_UN.retourne();
    cv.style.transition = vite ? "none" : "transform .1s ease-in";
    cv.style.transform = "scaleX(.04)";
    if (!vite) await attendre(105);
    versLaToile(cv, carte ? face(carte) : dos());
    cv.style.transition = vite ? "none" : "transform .17s cubic-bezier(.3,1.5,.5,1)";
    cv.style.transform = "";
    if (!vite) await attendre(175);
    cv.style.transition = "";
  }

  /* --- Le pupitre : toucher un jeton le pose aussitôt sur la mise, comme au vingt-et-un --- */
  const surPupitre = (ev: MouseEvent): void => {
    const cible = ev.target as Element | null;
    const ph = phaseRef.current;
    if (cible?.closest(".cas-jeton") && (ph === "mise" || ph === "fini")) setTimeout(() => pup.poser("mise"), 0);
  };
  useEffect(() => {
    if (phaseRef.current === "fini" && pup.total > 0) {
      setPhase("mise");
      setSorte(null);
      setConseil(null);
      setBardeMot("");
    }
    if (phaseRef.current === "mise" && pup.total) crou.dit("Faites vos jeux", "Puis distribuez");
  }, [pup.total]);

  /** La table se range pour une autre mise : le pupitre se rouvre (il était fermé depuis la donne). */
  const ranger = (): void => {
    pup.finir();
    setPartie(null);
    setConseil(null);
    setBardeMot("");
    setPhase("mise");
  };

  /*
   * --- Une main laissée ouverte reprend ; une main finie ailleurs (ou par un appel resté sans réponse) se range ---
   * L'effet suit chaque lecture du serveur (`casino.etat` change à chaque `relire`), pas seulement la main ouverte : une
   * main distribuée ici n'y paraît pas tant que le casino n'a pas relu, et sa disparition doit quand même ranger la table.
   */
  const ouverte = casino.etat.poker ?? null;
  useEffect(() => {
    const ph = phaseRef.current;
    if (ouverte && (ph === "mise" || ph === "fini") && partie !== ouverte.partie) {
      setMain(ouverte.main);
      setPartie(ouverte.partie);
      setGardes([false, false, false, false, false]);
      setSorte(null);
      setConseil(null);
      setBardeMot("");
      for (let i = 0; i < 5; i++) {
        const cv = toiles.current[i];
        if (cv) versLaToile(cv, face(ouverte.main[i]!));
      }
      crou.dit("Votre main vous attend", "Gardez vos cartes, puis tirez");
      dire(`Votre main reprend : ${ouverte.main.map(nomDeLaCarte).join(", ")}.`);
      setPhase("choix");
    } else if (ph === "choix" && partie !== null && ouverte?.partie !== partie) {
      ranger();
      crou.dit("Cette main est finie", "Elle est dans vos dernières parties");
    }
  }, [casino.etat]);

  async function lancer(): Promise<void> {
    if (phaseRef.current !== "mise" && phaseRef.current !== "fini") return;
    const pris = await pup.engager((_m, total) => appels.distribuerPoker(total));
    // Une main attend déjà (laissée ouverte ailleurs) : le casino relit son état, et elle reprend.
    if (!pris.ok && pris.code === "main_en_cours") casino.relire();
    if (!pris.ok || !monte.current) return;
    const d: DonneDuPoker = pris.valeur;
    casino.prendreLaMise({ ok: true, partie: d.partie, jeu: "poker", mise: d.mise, rendu: 0, god: d.god, solde_apres: d.solde_apres, mise_du_jour: d.mise_du_jour, reste_du_jour: d.reste_du_jour } as CoupDuCasino);
    setPhase("anime");
    setSorte(null);
    setConseil(null);
    setBardeMot("");
    setGardes([false, false, false, false, false]);
    setPartie(d.partie);
    crou.efface();
    crou.dit("Cinq cartes", "Le barde distribue");
    crou.visage("Lance");
    if (W < 760) montrer(salle.current);
    // Les cartes d'avant se couchent, puis la donne se retourne une à une.
    if (main) await Promise.all([0, 1, 2, 3, 4].map((i) => retourner(i, null)));
    setMain(d.main);
    for (let i = 0; i < 5; i++) {
      SONS_DU_VINGT_ET_UN.carte();
      await retourner(i, d.main[i]!);
      if (!sansMouvement()) await attendre(60);
    }
    if (!monte.current) return;
    crou.visage("");
    crou.dit("Gardez vos cartes", "Touchez-les, puis tirez");
    dire(`Votre main : ${d.main.map(nomDeLaCarte).join(", ")}.`);
    setPhase("choix");
  }

  function basculer(i: number): void {
    if (phaseRef.current !== "choix") return;
    SONS_DU_VINGT_ET_UN.regarde();
    setGardes((g) => g.map((v, k) => (k === i ? !v : v)));
  }

  function demanderConseil(): void {
    if (phaseRef.current !== "choix" || !main) return;
    setReflechit(true);
    // Le calcul compte toutes les mains possibles (un quart de seconde) : le barde « réfléchit » le temps d'un rendu.
    setTimeout(() => {
      const c = conseilDuBarde(main);
      setReflechit(false);
      setConseil(c.gardes);
      const mot = motsDuBarde(main, c.gardes);
      setBardeMot(mot);
      SONS_DU_VINGT_ET_UN.saute();
      dire(`Le barde conseille : ${mot}.`);
    }, 30);
  }

  async function tirer(): Promise<void> {
    if (phaseRef.current !== "choix" || partie === null || !main) return;
    setPhase("anime");
    let coup: CoupDuPoker;
    try {
      coup = await appels.jouerPoker(partie, gardes);
    } catch (e) {
      const code = e instanceof ServerError ? e.code : "network";
      const [titre, sous] = motsDuRefus(code, {});
      crou.refus(titre, sous);
      if (code === "pas_de_main") {
        // La main est déjà finie (ailleurs, ou par un appel resté sans réponse) : la table se range, le casino relit.
        ranger();
        casino.relire();
        return;
      }
      setPhase("choix");
      // Resté sans réponse : il a pu partir. Le casino relit ; si la main n'est plus ouverte, la table se range.
      if (code === "delai" || code === "network") casino.relire();
      return;
    }
    if (!monte.current) return;
    setConseil(null);
    setBardeMot("");
    const jetees = [0, 1, 2, 3, 4].filter((i) => !gardes[i]);
    await Promise.all(jetees.map((i) => retourner(i, null)));
    setMain(coup.main);
    for (const i of jetees) {
      SONS_DU_VINGT_ET_UN.carte();
      await retourner(i, coup.main[i]!);
    }
    if (!monte.current) return;
    const s = SORTES_DU_POKER[coup.sorte]!;
    setSorte(coup.sorte);
    crou.dit(s.nom, s.fois ? `${s.fois} fois la mise` : "Rien cette fois");
    crou.resultat({ ton: s.fois >= 25 ? "or" : s.fois ? "verte" : "feutre", rendu: coup.rendu, mise: coup.mise });
    casino.finDeTour({ coup, croupier: crou, scene: tapis.current, grand: s.fois >= 25 });
    dire(`${s.nom}. ${coup.rendu ? `Rendu : ${nombreEcrit(coup.rendu)} statères.` : "Rien cette fois."}`);
    pup.finir();
    setPhase("fini");
  }

  function rejouer(): void {
    if (phaseRef.current !== "fini") return;
    pup.memes();
    void lancer();
  }

  const d = pup.dernieres ? Object.values(pup.dernieres).reduce((a, b) => a + b, 0) : 0;
  const lignes = useMemo(() => SORTES_DU_POKER.map((s, i) => ({ ...s, i })).filter((s) => s.fois > 0).reverse(), []);
  const etroit = W < 520;

  return (
    <div class="cas-jeu pk-jeu" ref={racine}>
      <div class="pk-salle" ref={salle}>
        <section class="cas-tapis pk-table" aria-label="La table" ref={tapis}>
          <div class="pk-main" role="group" aria-label="Vos cinq cartes">
            {[0, 1, 2, 3, 4].map((i) => {
              const c = main?.[i] ?? null;
              const garde = gardes[i]!;
              return (
                <button
                  key={i}
                  type="button"
                  class={`pk-carte ${garde ? "pk-gardee" : ""} ${conseil?.[i] ? "pk-conseil" : ""} ${conseil && !conseil[i] ? "pk-jetee" : ""}`}
                  aria-pressed={phase === "choix" ? garde : undefined}
                  aria-label={c ? `${nomDeLaCarte(c)}${phase === "choix" ? (garde ? ", gardée" : ", à jeter") : ""}` : "Carte retournée"}
                  disabled={phase !== "choix"}
                  onClick={() => basculer(i)}
                >
                  <canvas
                    ref={(el) => {
                      toiles.current[i] = el;
                    }}
                    aria-hidden="true"
                  />
                  <span class="pk-etiquette" aria-hidden="true">
                    <Etiquette t="Gardée" ton="or" />
                  </span>
                </button>
              );
            })}
          </div>
          <div class={`pk-sorte ${sorte !== null ? "pk-vue" : ""}`} aria-hidden="true">
            {sorte !== null && <Mots t={SORTES_DU_POKER[sorte]!.nom} couleur={SORTES_DU_POKER[sorte]!.fois ? "orvif" : "creme"} relief="cerne" p={etroit ? 2 : 3} muet />}
          </div>
        </section>
        <PanneauDuCroupier croupier={crou} classe="pk-croupier" />
        <div class="pk-gestes cas-panneau jeu-n9">
          <div class="pk-coups">
            <Bouton ton="or" mot="Tirer" nom="Tirer : les cartes non gardées sont remplacées" classe="pk-tirer cas-btn-large" disabled={phase !== "choix"} onClick={() => void tirer()} />
            <button type="button" class="jeu-btn jeu-n9 jeu-btn-bleu pk-barde" title="Le conseil du barde : le meilleur choix" disabled={phase !== "choix" || reflechit} onClick={demanderConseil}>
              <Pic nom="livre" />
              <Mots t={reflechit ? "Le barde compte…" : "Le conseil du barde"} couleur="creme" relief="cerne" muet />
              <span class="sr-only">Le conseil du barde : le meilleur choix</span>
            </button>
            {phase === "fini" && d > 0 && <Bouton ton="or" mot={`Rejouer ${d}`} nom={`Rejouer la même mise : ${d} statères`} classe="pk-rejouer" onClick={rejouer} />}
          </div>
          <span class={`pk-barde-dit ${bardeMot ? "pk-vu" : ""}`} aria-hidden="true">
            {bardeMot && <Mots t={bardeMot} couleur="or" plie muet />}
          </span>
          <p class="sr-only" aria-live="polite" ref={direEl} />
        </div>
        <div class="pk-pupitre" onClick={surPupitre}>
          <Pupitre pupitre={pup} action="Distribuer" nomAction="Distribuer les cartes" surAction={() => void lancer()} />
        </div>
        <div class="cas-tapis pk-gains" role="list" aria-label="La table des gains">
          {lignes.map((s) => (
            <div key={s.id} role="listitem" class={`pk-ligne jeu-n9 cas-halo ${sorte === null ? "" : sorte === s.i ? "cas-sorti" : "cas-eteint"}`} aria-label={`${s.nom} : ${s.fois} fois la mise. Une main sur ${nombreEcrit(s.uneSur)} environ, joué au mieux.`}>
              <Mots t={s.nom} couleur="creme" relief="ombre" muet />
              <Mots t={`${s.fois} fois`} couleur="creme" relief="ombre" muet />
              <Mots t={`1 sur ${nombreEcrit(s.uneSur)}`} couleur="orvif" muet />
            </div>
          ))}
        </div>
      </div>
      <details class="cas-pli cas-panneau jeu-n9 pk-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Cinq cartes d'un paquet de 52. Touchez celles que vous gardez, puis « Tirer » : les autres sont remplacées une seule fois, par des cartes du même paquet.</li>
          <li>La main finale paie selon la table, mise comprise : une paire de valets, de dames, de rois ou d'as rend la mise. Une paire plus petite ne rend rien.</li>
          <li>Le serveur tire la donne et le tirage. Les cartes jetées ne reviennent pas.</li>
          <li>Le barde montre le meilleur choix : il compte toutes les cartes qui peuvent venir.</li>
          <li>Joué au mieux, le jeu rend en moyenne 99,5 % de la mise, jamais plus. Les chances de la table sont celles du jeu joué au mieux.</li>
          <li>200 statères au plus par main. Jetons de 10, 20, 50, 100 et 200.</li>
        </ul>
      </details>
    </div>
  );
}
