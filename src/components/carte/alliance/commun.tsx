/** Ce que partagent les parties de la fenêtre « Alliance » de la carte, et ce qu'elle écrit sur la carte elle-même. */
import { createContext } from "preact";
import { useContext, useLayoutEffect, useRef } from "preact/hooks";
import type { BilanZone, TotalAlliance } from "../../../lib/alliance/bilan";
import { cssDe } from "../../../lib/alliance/couleurs";
import { LANGUES, type Langue } from "../../../lib/alliance/langue";
import { FR, type Textes } from "../../../lib/alliance/textes";
import type { AccesCarte, CarteAlliance, ZoneLigne } from "../../../lib/alliance/types";
import type { EtatCarte } from "../../../lib/clanmap/etat";
import type { StoredClanMapFilm } from "../../../lib/schemas";
import type { Survol } from "../../../scripts/alliance-ecran";

/** La carte se colore par nos clans, chacun dans sa couleur, ou par alliance. */
export type ModeCouleurs = "clans" | "alliances";

/** Tout ce que lit une partie de la fenêtre : le serveur, la carte publiée, et qui regarde. */
export interface Contexte {
  donnees: CarteAlliance & { access: AccesCarte };
  film: StoredClanMapFilm;
  /** `null` : l'état pixel par pixel n'est pas publié pour ce relevé ; les zones ne se comptent ni ne se dessinent. */
  etat: EtatCarte | null;
  /** L'encadrement de GAL, hors vue joueur : il range les clans, dessine les zones et invite. */
  staff: boolean;
  totaux: TotalAlliance[];
  /** Les tags de notre alliance, celle où est rangé GAL. */
  notres: Set<string>;
  /** La couleur de chacun de nos clans, choisie par le site (`couleursDesClans`) : sur la carte, dans les listes et les zones. */
  couleursClans: Map<string, number>;
  /** Le bilan de chaque zone au dernier relevé, par son numéro ; vide sans l'état pixel par pixel. */
  bilans: Map<number, BilanZone>;
  relire: () => Promise<void>;
}

/** Les textes de la fenêtre, dans la langue choisie. */
export const TextesContexte = createContext<Textes>(FR);
export const useTextes = (): Textes => useContext(TextesContexte);

/** La pastille d'une couleur, à côté d'un nom. Décorative : le nom est écrit. */
export function Pastille({ couleur }: { couleur: number }) {
  return <i class="carte-pastille" style={{ background: cssDe(couleur) }} aria-hidden="true"></i>;
}

/** Le nom lisible d'un clan : son tag, ou « Clan supprimé ». */
export const nomDuClan = (tag: string | null, t: Textes = FR): string => tag ?? t.clanSupprime;

/** La part d'une zone déjà tenue, en barre pleine de la couleur de son clan. */
export function Barre({ part, couleur }: { part: number; couleur: number }) {
  return (
    <span class="alliance-barre" aria-hidden="true">
      <i style={{ width: `${Math.round(part * 1000) / 10}%`, background: cssDe(couleur) }}></i>
    </span>
  );
}

/**
 * Le contenu d'une zone au dernier relevé, en tableau : ce qui est déjà à nous, la terre neutre et les pixels des autres
 * clans, avec les troupes à prévoir selon les règles du jeu (`src/lib/clanmap/economy.ts`). Les troupes des autres clans
 * ne sont pas connues : leur coût est un minimum, dit en mots. Une ligne vide (ni terre neutre, ni autre clan, ni mer)
 * n'est pas écrite ; « Déjà à nous » l'est toujours.
 */
export function TableauZone({ bilan, t }: { bilan: BilanZone; t: Textes }) {
  const autres = bilan.autres
    .slice(0, 3)
    .map((a) => `${nomDuClan(a.tag, t)} ${t.nombre(a.pixels)}`)
    .join(" · ");
  const plus = bilan.autres.length > 3 ? ` ${t.autresEtPlus(bilan.autres.length - 3)}` : "";
  const total = bilan.coutNeutres + bilan.coutEnnemisMinimum;
  return (
    <table class="alliance-bilan tnum">
      <thead>
        <tr>
          <td></td>
          <th scope="col">{t.pixels}</th>
          <th scope="col">{t.aPrevoir}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{t.dejaANous}</th>
          <td>{t.nombre(bilan.alliance)}</td>
          <td></td>
        </tr>
        {bilan.neutres > 0 && (
          <tr>
            <th scope="row">{t.terreNeutre}</th>
            <td>{t.nombre(bilan.neutres)}</td>
            <td>{t.nombre(bilan.coutNeutres)}</td>
          </tr>
        )}
        {bilan.ennemis > 0 && (
          <tr>
            <th scope="row">
              {t.autresClans}{" "}
              <span class="alliance-bilan-detail">
                {autres}
                {plus}
              </span>
            </th>
            <td>{t.nombre(bilan.ennemis)}</td>
            <td>{t.auMoins(t.nombre(bilan.coutEnnemisMinimum))}</td>
          </tr>
        )}
        {bilan.mer > 0 && (
          <tr>
            <th scope="row">{t.mer}</th>
            <td>{t.nombre(bilan.mer)}</td>
            <td></td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{t.total}</th>
          <td>{t.nombre(bilan.pixels)}</td>
          <td>{bilan.ennemis > 0 ? t.auMoins(t.nombre(total)) : t.nombre(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Le choix de la langue de la fenêtre : deux boutons, le choisi en vidéo inversée. Chaque langue se nomme dans la sienne, en toutes lettres. */
export function ChoixLangue({ langue, choisir, t }: { langue: Langue; choisir: (l: Langue) => void; t: Textes }) {
  return (
    <div class="alliance-langues" role="group" aria-label={t.choixLangue} data-testid="alliance-langue">
      {LANGUES.map((l) => (
        <button type="button" lang={l.id} aria-pressed={langue === l.id} onClick={() => choisir(l.id)}>
          {l.nom}
        </button>
      ))}
    </div>
  );
}

/** Une ligne de la légende de la carte : sa couleur et ce qu'elle désigne. */
export interface EntreeLegende {
  couleur: number;
  nom: string;
}

export interface Calque {
  t: Textes;
  legende: EntreeLegende[];
  survol: Survol | null;
  /** Ce que couvre la fenêtre ouverte : la bulle reste dans la partie libre de la carte. */
  libre: { largeur: number; hauteur: number };
  zone: ZoneLigne | null;
  bilan: BilanZone | null;
  couleurZone: number;
  /** L'alliance du clan sous la souris. */
  alliance: string | null;
}

/**
 * La bulle du survol : tout ce qu'on sait de la zone sous la souris (son clan, sa part déjà prise, son contenu et les troupes
 * à prévoir, sa date), et ce qu'il y a au pixel près. Sans zone, une ligne : le clan et son alliance, ou la terre neutre.
 * Elle se pose à côté de la souris, du côté où elle tient dans la partie libre de la carte.
 */
function Bulle({ c }: { c: Calque & { survol: Survol } }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, survol, zone, bilan } = c;
  const { info } = survol;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ecart = 16;
    const { offsetWidth: w, offsetHeight: h } = el;
    let x = survol.x + ecart;
    if (x + w > c.libre.largeur - 4) x = survol.x - ecart - w;
    let y = survol.y + ecart;
    if (y + h > c.libre.hauteur - 4) y = survol.y - ecart - h;
    el.style.transform = `translate(${Math.round(Math.max(4, x))}px, ${Math.round(Math.max(4, y))}px)`;
  });
  const ici = info.sorte === "mer" ? t.merCourt : info.sorte === "neutre" ? t.terreNeutre : `${nomDuClan(info.tag, t)} · ${c.alliance ?? t.sansAlliance}`;
  if (!zone)
    return (
      <div ref={ref} class="alliance-bulle alliance-bulle-ici">
        {ici}
      </div>
    );
  return (
    <div ref={ref} class="alliance-bulle" data-testid="alliance-bulle">
      <p class="alliance-bulle-clan">
        <Pastille couleur={c.couleurZone} />
        {zone.tag ?? t.touteLAlliance}
      </p>
      <p class="alliance-bulle-titre">{zone.title}</p>
      {bilan && (
        <>
          <p class="alliance-bulle-part">
            <span class="alliance-bulle-chiffre tnum">{t.pct(bilan.part)}</span> {t.prise}
          </p>
          <Barre part={bilan.part} couleur={c.couleurZone} />
          <TableauZone bilan={bilan} t={t} />
        </>
      )}
      <p class="alliance-bulle-pied">
        {t.ici} {ici}
      </p>
      <p class="alliance-bulle-pied">{t.misAJour(t.dateHeure(zone.updated_at))}</p>
    </div>
  );
}

/**
 * Ce que la fenêtre écrit sur la carte : la légende des couleurs, en bas à gauche, et la bulle du survol. Rendu à part
 * (`render` de Preact) dans le calque de la carte, à chaque mouvement de la souris, sans redessiner la fenêtre. Caché aux
 * lecteurs d'écran : les mêmes noms et les mêmes chiffres sont dans la fenêtre.
 */
export function CalqueCarte({ c }: { c: Calque }) {
  const survol = c.survol;
  return (
    <>
      {c.legende.length > 0 && (
        <ul class="alliance-legende" data-testid="alliance-legende">
          {c.legende.map((e) => (
            <li>
              <Pastille couleur={e.couleur} />
              {e.nom}
            </li>
          ))}
        </ul>
      )}
      {survol && !survol.toucher && <Bulle c={{ ...c, survol }} />}
    </>
  );
}
