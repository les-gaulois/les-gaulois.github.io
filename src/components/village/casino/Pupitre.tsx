import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError } from "../../../lib/compte/api";
import { SONS } from "../../../lib/jeu/casino-sons";
import { JETONS, jeton, type ValeurDeJeton } from "../../../lib/jeu/casino-toile";
import { motsDuRefus, refusDesMemesMises, refusDuJeton } from "../../../lib/village/ecran-casino";
import { useCasino } from "./contexte";
import { Bouton, Mots, Peinture } from "./Pieces";

/**
 * Le pupitre de mise du casino (maquette « Le Palais d'or ») : les jetons de 10 à 200, « Sur la table n sur 200 », reprendre
 * le dernier jeton, tout reprendre, « mêmes mises » et le bouton d'or du jeu. `usePupitre()` tient les mises ;
 * `<Pupitre pupitre={…} />` le montre. Il prévient avant d'envoyer une mise que le serveur refuserait (table, bourse, reste du
 * jour) ; le serveur revérifie tout.
 */

export type Mises = Readonly<Record<string, number>>;
/** La réponse d'un engagement : la valeur du serveur, ou le code de son refus (le pupitre a déjà fait le bruit et prévenu). */
export type Engagement<T> = { ok: true; valeur: T; mises: Mises; total: number } | { ok: false; code: string };

export interface PupitreDuJeu {
  readonly mises: Mises;
  readonly total: number;
  readonly jeton: ValeurDeJeton;
  /** Les mises du dernier tour engagé (ce que repose « mêmes mises »), ou `null`. */
  readonly dernieres: Mises | null;
  readonly ferme: boolean;
  /** Le dernier pari où un jeton est tombé, et combien de fois (pour que son jeton retombe). */
  readonly dernier: { id: string; fois: number } | null;
  /** Pose le jeton choisi sur le pari `id` ; refuse au-delà de la table, de la bourse ou du reste du jour. Rend vrai ou faux. */
  poser(id: string): boolean;
  choisir(v: ValeurDeJeton): void;
  annuler(): void;
  vider(): void;
  memes(): void;
  verrou(v: boolean): void;
  /**
   * Engage les mises : le pupitre se ferme, `envoyer` part au serveur. Refusé, il se rouvre avec les mises, fait le bruit du
   * refus et prévient `surRefus`. Accepté, il garde les mises pour « mêmes mises » et reste fermé jusqu'à `finir()`.
   */
  engager<T>(envoyer: (mises: Mises, total: number) => Promise<T>): Promise<Engagement<T>>;
  /** Fin du tour : vide la table, garde « mêmes mises », rouvre le pupitre. */
  finir(): void;
}

export function usePupitre({ surRefus }: { surRefus?: (titre: string, sous: string) => void } = {}): PupitreDuJeu {
  const casino = useCasino();
  const [mises, setMises] = useState<Record<string, number>>({});
  const [piles, setPiles] = useState<[string, number][]>([]);
  const [jetonChoisi, setJeton] = useState<ValeurDeJeton>(10);
  const [dernieres, setDernieres] = useState<Mises | null>(null);
  const [ferme, setFerme] = useState(false);
  const [dernier, setDernier] = useState<{ id: string; fois: number } | null>(null);
  const total = Object.values(mises).reduce((a, b) => a + b, 0);
  // Les gestes lisent l'état du moment, même appelés d'une promesse ou d'un écouteur posé plus tôt.
  const etat = useRef({ mises, piles, total, jeton: jetonChoisi, dernieres, ferme, limites: casino.limites, surRefus });
  etat.current = { mises, piles, total, jeton: jetonChoisi, dernieres, ferme, limites: casino.limites, surRefus };

  const actions = useMemo(() => {
    const refus = (code: string): false => {
      SONS.refus();
      const l = etat.current.limites;
      const [titre, sous] = motsDuRefus(code, l.reste ?? undefined);
      etat.current.surRefus?.(titre, sous);
      return false;
    };
    const a = {
      poser(id: string): boolean {
        const e = etat.current;
        if (e.ferme) return false;
        const r = refusDuJeton(e.total, e.jeton, e.limites);
        if (r) return refus(r);
        const v = e.jeton;
        e.mises = { ...e.mises, [id]: (e.mises[id] ?? 0) + v };
        e.piles = [...e.piles, [id, v]];
        e.total += v;
        setMises(e.mises);
        setPiles(e.piles);
        setDernier((d) => ({ id, fois: d && d.id === id ? d.fois + 1 : 1 }));
        SONS.jeton(JETONS.indexOf(v));
        return true;
      },
      choisir(v: ValeurDeJeton): void {
        setJeton(v);
        SONS.jeton(JETONS.indexOf(v));
      },
      annuler(): void {
        const e = etat.current;
        const haut = e.piles[e.piles.length - 1];
        if (e.ferme || !haut) return;
        const [id, v] = haut;
        const m = { ...e.mises, [id]: (e.mises[id] ?? 0) - v };
        if (!m[id]) delete m[id];
        e.mises = m;
        e.piles = e.piles.slice(0, -1);
        e.total -= v;
        setMises(m);
        setPiles(e.piles);
        SONS.ramasse();
      },
      vider(): void {
        etat.current.mises = {};
        etat.current.piles = [];
        etat.current.total = 0;
        setMises({});
        setPiles([]);
      },
      memes(): void {
        const e = etat.current;
        if (e.ferme || !e.dernieres) return;
        const r = refusDesMemesMises(e.dernieres, e.limites);
        if (r) return void refus(r);
        e.mises = { ...e.dernieres };
        e.piles = Object.entries(e.dernieres);
        e.total = Object.values(e.dernieres).reduce((x, y) => x + y, 0);
        setMises(e.mises);
        setPiles(e.piles);
        setDernier(null);
        SONS.jeton(2);
      },
      verrou(v: boolean): void {
        etat.current.ferme = v;
        setFerme(v);
      },
      async engager<T>(envoyer: (mises: Mises, total: number) => Promise<T>): Promise<Engagement<T>> {
        const e = etat.current;
        if (e.ferme || !e.total) {
          refus("rien");
          return { ok: false, code: "rien" };
        }
        const m = { ...e.mises };
        const t = e.total;
        a.verrou(true);
        try {
          const valeur = await envoyer(m, t);
          setDernieres(m);
          etat.current.dernieres = m;
          return { ok: true, valeur, mises: m, total: t };
        } catch (err) {
          a.verrou(false);
          const code = err instanceof ServerError ? err.code : "network";
          refus(code);
          return { ok: false, code };
        }
      },
      finir(): void {
        a.vider();
        setDernier(null);
        a.verrou(false);
      },
    };
    return a;
  }, []);

  return { mises, total, jeton: jetonChoisi, dernieres, ferme, dernier, ...actions };
}

/**
 * Le pupitre : `action` (le mot du bouton d'or), `nomAction` (son nom entier), `surAction` (le tour). Il se resserre tout
 * seul dans une place étroite (jetons plus petits sous 330 pixels, gestes qui passent à la ligne).
 */
export function Pupitre({ pupitre, action, nomAction, surAction, classe = "" }: { pupitre: PupitreDuJeu; action: string; nomAction?: string; surAction: () => void; classe?: string }) {
  const { limites } = useCasino();
  const ref = useRef<HTMLDivElement>(null);
  const [rayon, setRayon] = useState(13);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setRayon(!el.clientWidth || el.clientWidth >= 330 ? 13 : 11));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const jetons = useMemo(() => JETONS.map((v) => jeton(v, rayon)), [rayon]);
  const { total, ferme, dernieres } = pupitre;
  // Le bouton d'or se ferme pendant le tour : qui l'a pris au clavier retrouve le focus à la fin, sur « mêmes mises » (le
  // bouton d'or, table vide, reste fermé), sinon sur le jeton choisi.
  const focusAuLancer = useRef(false);
  useEffect(() => {
    if (ferme || !focusAuLancer.current) return;
    focusAuLancer.current = false;
    const el = ref.current;
    const cible = el?.querySelector<HTMLButtonElement>(".cas-memes:not(:disabled)") ?? el?.querySelector<HTMLButtonElement>('.cas-jeton[aria-pressed="true"]');
    cible?.focus({ preventScroll: true });
  }, [ferme]);
  const vide = ferme || !total;
  return (
    <div class={`cas-pupitre cas-panneau jeu-n9 ${rayon === 11 ? "cas-pupitre-etroit" : ""} ${classe}`} ref={ref}>
      <div class="cas-jetons" role="group" aria-label="Choisir un jeton">
        {JETONS.map((v, i) => (
          <button key={v} class="cas-jeton" type="button" aria-pressed={pupitre.jeton === v} aria-label={`Jeton de ${v} statères`} title={`Jeton de ${v}`} onClick={() => pupitre.choisir(v)}>
            <Peinture toile={jetons[i]!} />
          </button>
        ))}
      </div>
      <div class="cas-compte">
        <Mots t="Sur la table" couleur="doux" />
        <span class="cas-total">
          <Mots t={`${total} sur ${limites.plafond}`} couleur="or" p={3} dit={`${total} statères sur ${limites.plafond}`} />
        </span>
      </div>
      <div class="cas-gestes">
        <Bouton icone="annuler" nom="Reprendre le dernier jeton" classe="cas-annuler" disabled={vide} onClick={() => pupitre.annuler()} />
        <Bouton
          icone="effacer"
          nom="Tout reprendre"
          classe="cas-effacer"
          disabled={vide}
          onClick={() => {
            if (pupitre.ferme || !pupitre.total) return;
            pupitre.vider();
            SONS.ramasse();
          }}
        />
        <Bouton icone="rejouer" nom="Reposer les mêmes mises" classe="cas-memes" disabled={ferme || !dernieres} onClick={() => pupitre.memes()} />
        <Bouton
          ton="or"
          mot={action}
          nom={nomAction ?? action}
          classe="cas-action"
          disabled={vide}
          onClick={(e) => {
            focusAuLancer.current = document.activeElement === e.currentTarget;
            surAction();
          }}
        />
      </div>
    </div>
  );
}
