import type { JSX } from "preact";
import { useMemo, useState } from "preact/hooks";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois } from "../../../lib/gaulois";
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { Planche, R, cerne, grille } from "../../../lib/jeu/planche";
import { Etiquette, Px } from "../../jeu/Pixels";
import { iconeBoss, iconeDefi } from "./dessins-ecran";
import { CLE_DES_DEFIS, DEFIS, tenueDuBoss, type Boss, type Defi } from "./partie-du-boss";
import { urlDePetiteIcone } from "./petites-icones";
import { SON } from "./sons-du-duel";

export * from "./partie-du-boss";

/**
 * Le boss du jour et les défis d'entraînement du duel (chantiers 4 et 6 du 22 novembre 2026), sur le contenu de la session
 * « Duel : boss, défis et niveaux » (`supabase/functions/code-discord/duel/contenu/`) et les écrans dessinés par Claude
 * Fable 5.2.
 *
 * - **Le boss du jour** : un des Gaulois uniques, le même pour tous ce jour-là, avec son pouvoir, sa main et sa bannière.
 *   Contre le serveur quand il a le duel (`commencer_duel` « boss », puis une manche à la fois, `jouer_manche_duel`) ; tant
 *   qu'il ne l'a pas, la machine du navigateur le joue, pour l'essai, sans rien gagner.
 * - **Les défis** : de petites énigmes, chacune une consigne courte. Joués dans la page ; ceux qu'on a réussis sont
 *   retenus sur l'appareil (`gal-duel-defis`).
 */

export const ICONE_DU_BOSS = (): string => urlDeLaPlanche("duel-ic-boss", iconeBoss);
export const ICONE_DES_DEFIS = (): string => urlDeLaPlanche("duel-ic-defi", iconeDefi);

/** L'icône du pouvoir d'un boss, cernée d'encre (11 cases). */
export const iconeDuPouvoir = (boss: Boss): string => urlDeLaPlanche(`duel-pouvoir|${boss.id}`, () => cerne(grille(boss.pouvoir.icone.rangees, boss.pouvoir.icone.teintes)));

/* ---------- Le boss du jour, sur l'accueil ---------- */

/**
 * La scène du boss : sa bannière, et lui debout dessus, les pieds sur la rangée des pieds, comme dans l'arène. Une planche
 * de 124 sur 80 cases, peinte une fois par boss.
 */
function SceneDuBoss({ boss, lib }: { boss: Boss; lib: { dessinDeLaBanniere: (id: string) => { cases: readonly (string | null)[] } | null } | null }) {
  const decor = useMemo(() => lib?.dessinDeLaBanniere(boss.lieu.banniere) ?? null, [lib, boss]);
  const url = useMemo(() => {
    return urlDeLaPlanche(`duel-scene-boss|${boss.id}|${decor ? "b" : "-"}`, () => {
      const p = new Planche(124, 80);
      if (decor) decor.cases.forEach((c, i) => c && R(p, i % 124, Math.floor(i / 124), 1, 1, c));
      else {
        R(p, 0, 0, 124, 80, "#cfe2ff");
        R(p, 0, 52, 124, 28, "#7fcf6a");
      }
      casesDuGaulois(tenueDuBoss(boss)).forEach((c, i) => c && R(p, 14 + (i % GAULOIS_LARGEUR), 72 - GAULOIS_HAUTEUR + Math.floor(i / GAULOIS_LARGEUR), 1, 1, c));
      return p;
    });
  }, [decor, boss]);
  return <i class="dl-boss-image" style={{ backgroundImage: url }} role="img" aria-label={decor ? `${boss.titre}, devant sa bannière` : boss.titre} />;
}

export function PanneauDuBoss({ boss, battu, lib, onAffronter }: { boss: Boss; battu: boolean; lib: { dessinDeLaBanniere: (id: string) => { cases: readonly (string | null)[] } | null } | null; onAffronter: () => void }) {
  return (
    <div class="jeu-panneau jeu-n9 dl-p dl-p-boss" data-testid="duel-boss">
      <div class="dl-boss-scene">
        <SceneDuBoss boss={boss} lib={lib} />
        <span class="jeu-ruban jeu-n9 dl-boss-nom">
          <Px t={boss.titre} couleur="creme" relief="ombre" />
        </span>
      </div>
      <div class="dl-boss-bas">
        <i class="jeu-ic dl-boss-icone" style={{ "--i": ICONE_DU_BOSS() } as JSX.CSSProperties} aria-hidden="true" />
        <div class="dl-boss-texte">
          <h3 class="dl-p-tete">
            <Px t="Boss du jour" couleur="texte" />
            {battu && <Etiquette t="Battu" ton="or" dit=", déjà battu aujourd'hui" />}
          </h3>
          <p class="dl-p-mot">
            <i class="dl-pouvoir" style={{ backgroundImage: iconeDuPouvoir(boss) }} aria-hidden="true" />
            <b>{boss.pouvoir.nom}.</b> {boss.pouvoir.phrase}
          </p>
        </div>
        <button
          type="button"
          class="jeu-btn jeu-n9 jeu-btn-ic dl-btn dl-affronter"
          aria-label={`Affronter le boss du jour : ${boss.titre}`}
          data-mot="Affronter le boss du jour"
          data-testid="duel-affronter-boss"
          onClick={() => {
            SON.clic();
            onAffronter();
          }}
        >
          <i class="jeu-pic" style={{ "--i": urlDePetiteIcone("epees", true) } as JSX.CSSProperties} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Les défis réussis sur cet appareil. */
export function useDefisReussis(): [ReadonlySet<string>, (id: string) => void] {
  const [reussis, setReussis] = useState<ReadonlySet<string>>(() => {
    try {
      const brut = localStorage.getItem(CLE_DES_DEFIS);
      const liste = brut ? (JSON.parse(brut) as unknown) : [];
      return new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  });
  const noter = (id: string): void =>
    setReussis((avant) => {
      const apres = new Set(avant).add(id);
      try {
        localStorage.setItem(CLE_DES_DEFIS, JSON.stringify([...apres]));
      } catch {
        // Sans stockage, la réussite vaut pour cette visite.
      }
      return apres;
    });
  return [reussis, noter];
}

/** Le panneau des défis sur l'accueil : combien sont réussis, et les prochains à faire. */
export function PanneauDesDefis({ reussis, onOuvrir }: { reussis: ReadonlySet<string>; onOuvrir: () => void }) {
  const faits = DEFIS.filter((d) => reussis.has(d.id)).length;
  const prochains = DEFIS.filter((d) => !reussis.has(d.id)).slice(0, 3);
  return (
    <button type="button" class="jeu-panneau jeu-n9 dl-p dl-p-lien dl-p-defis" data-testid="duel-ouvrir-defis" onClick={onOuvrir}>
      <span class="dl-p-tete">
        <i class="jeu-ic" style={{ "--i": ICONE_DES_DEFIS() } as JSX.CSSProperties} aria-hidden="true" />
        <Px t="Défis" couleur="texte" />
        <Px t={`${faits} SUR ${DEFIS.length}`} couleur="or" classe="dl-p-droite" dit={`${faits} défis réussis sur ${DEFIS.length}`} />
      </span>
      <span class="jeu-tube jeu-n9 dl-tube dl-defis-tube" aria-hidden="true">
        <span class="jeu-plein jeu-n9 jeu-plein-vert" style={`--part:${(faits / Math.max(1, DEFIS.length)).toFixed(3)}`} />
      </span>
      <span class="dl-defis-prochains">
        {prochains.map((d) => (
          <span key={d.id} class="dl-defi-puce">
            {d.titre} : {d.consigne}
          </span>
        ))}
      </span>
      <span class="sr-only">Ouvrir les défis</span>
    </button>
  );
}

/** La liste des défis : les défis à faire d'abord, les réussis à la fin. */
export function ListeDesDefis({ reussis, onJouer }: { reussis: ReadonlySet<string>; onJouer: (d: Defi) => void }) {
  const ranges = [...DEFIS.filter((d) => !reussis.has(d.id)), ...DEFIS.filter((d) => reussis.has(d.id))];
  return (
    <ul class="jeu-ecran jeu-n9 dl-defis" data-testid="duel-defis">
      {ranges.map((d) => {
        const fait = reussis.has(d.id);
        return (
          <li key={d.id} class={`dl-defi ${fait ? "dl-defi-fait" : ""}`}>
            <button
              type="button"
              class={`jeu-btn jeu-n9 jeu-btn-ic dl-btn ${fait ? "jeu-btn-bleu" : ""}`}
              aria-label={`${fait ? "Rejouer" : "Jouer"} le défi « ${d.titre} »`}
              data-mot={fait ? "Rejouer" : "Jouer"}
              data-testid={`duel-defi-${d.id}`}
              onClick={() => {
                SON.clic();
                onJouer(d);
              }}
            >
              <i class="jeu-pic" style={{ "--i": urlDePetiteIcone(fait ? "coche" : "epees", !fait) } as JSX.CSSProperties} aria-hidden="true" />
            </button>
            <span class="dl-defi-texte">
              <b>{d.titre}.</b> {d.consigne}
              {fait && <span class="sr-only"> Réussi.</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
