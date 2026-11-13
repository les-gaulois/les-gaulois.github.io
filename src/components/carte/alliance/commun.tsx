/** Ce que partagent les parties de la fenêtre « Alliance » de la carte, et ce qu'elle écrit sur la carte elle-même. */
import { createContext } from "preact";
import { useContext, useLayoutEffect, useRef } from "preact/hooks";
import { troupesEnCapsules, type BilanZone, type TotalAlliance } from "../../../lib/alliance/bilan";
import { cssDe } from "../../../lib/alliance/couleurs";
import type { Mouvement } from "../../../lib/alliance/evolution";
import type { Voisin } from "../../../lib/alliance/voisins";
import { LANGUES, type Langue } from "../../../lib/alliance/langue";
import { FR, type Textes } from "../../../lib/alliance/textes";
import type { AccesCarte, CarteAlliance, ZoneLigne } from "../../../lib/alliance/types";
import type { EtatCarte, ReleveCarte } from "../../../lib/clanmap/etat";
import type { Survol } from "../../../scripts/alliance-ecran";

/**
 * La carte se colore par nos clans, chacun dans sa couleur, par alliance, « tout » (chaque clan de la carte dans sa couleur
 * du jeu, les clans neutres, hors de toute alliance, compris), ou « en 24 heures » : nos clans d'une teinte pâle, et ce que
 * notre alliance a pris et perdu depuis la veille.
 */
export type ModeCouleurs = "clans" | "alliances" | "tout" | "evolution";

/** Ce qui a bougé en 24 heures, au dernier relevé (`src/lib/alliance/evolution.ts`). */
export interface Evolution {
  /** Le moment comparé : 24 heures avant le relevé. */
  depuis: string;
  alliance: Mouvement;
  parClan: Map<string, Mouvement>;
  /** Chaque zone, par son numéro. */
  zones: Map<number, Mouvement>;
}

/** Tout ce que lit une partie de la fenêtre : le serveur, la carte publiée, et qui regarde. */
export interface Contexte {
  donnees: CarteAlliance & { access: AccesCarte };
  /** Le relevé de la carte de l'alliance : celui de l'état, plus récent que le film, ou celui du film. */
  releve: ReleveCarte;
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
  /** `null` : pas de comparaison publiée avec la carte de la veille. */
  evolution: Evolution | null;
  /** Les clans qui touchent notre alliance, du plus long contact au plus court ; vide sans l'état pixel par pixel. */
  voisins: Voisin[];
  /** Cadre la carte sur un morceau de la carte complète. */
  viser: (cadre: { x: number; y: number; w: number; h: number }) => void;
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
        {total > 0 && (
          <tr>
            <th scope="row">{t.enCapsules}</th>
            <td></td>
            <td data-testid="zone-capsules">{bilan.ennemis > 0 ? t.auMoins(t.nombre(troupesEnCapsules(total))) : t.nombre(troupesEnCapsules(total))}</td>
          </tr>
        )}
      </tfoot>
    </table>
  );
}

/**
 * Le drapeau d'une langue, en SVG dans la page (aucun fichier chargé d'ailleurs) : le tricolore pour le français, aux
 * couleurs du filet du site, l'Union Jack pour l'anglais. Le tracé de l'Union Jack (découpe des diagonales, traits de 6, 4,
 * 10 et 6) reprend le fichier « Flag of the United Kingdom.svg » de Wikimedia Commons, dans le domaine public (ligne dans
 * NOTICE.md). Les deux à la même taille, en 3 sur 2 : l'Union Jack est rogné sur ses côtés, comme sur les sélecteurs de
 * langue courants. Les couleurs sont dans global.css (`.drapeau-*`).
 */
function Drapeau({ langue }: { langue: Langue }) {
  if (langue === "fr")
    return (
      <svg class="alliance-drapeau" viewBox="0 0 3 2" aria-hidden="true">
        <rect class="drapeau-bleu" width="1" height="2" />
        <rect class="drapeau-blanc" x="1" width="1" height="2" />
        <rect class="drapeau-rouge" x="2" width="1" height="2" />
      </svg>
    );
  return (
    <svg class="alliance-drapeau" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <clipPath id="drapeau-uk-diagonales">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <rect class="drapeau-uk-fond" width="60" height="30" />
      <path class="drapeau-uk-blanc" d="M0 0l60 30m0-30L0 30" stroke-width="6" />
      <path class="drapeau-uk-rouge" d="M0 0l60 30m0-30L0 30" stroke-width="4" clip-path="url(#drapeau-uk-diagonales)" />
      <path class="drapeau-uk-blanc" d="M30 0v30M0 15h60" stroke-width="10" />
      <path class="drapeau-uk-rouge" d="M30 0v30M0 15h60" stroke-width="6" />
    </svg>
  );
}

/**
 * Le choix de la langue de la fenêtre : deux drapeaux (demande du pilote, 13 novembre 2026), le choisi entouré et en
 * pleine couleur. Chaque bouton porte le nom de sa langue dans la sienne, en toutes lettres, pour les lecteurs d'écran et
 * dans la bulle de la souris.
 */
export function ChoixLangue({ langue, choisir, t }: { langue: Langue; choisir: (l: Langue) => void; t: Textes }) {
  return (
    <div class="alliance-langues" role="group" aria-label={t.choixLangue} data-testid="alliance-langue">
      {LANGUES.map((l) => (
        <button type="button" lang={l.id} aria-pressed={langue === l.id} title={l.nom} onClick={() => choisir(l.id)}>
          <Drapeau langue={l.id} />
          <span class="sr-only">{l.nom}</span>
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
  /** Ce que notre alliance a pris et perdu dans la zone en 24 heures. */
  mouvement: Mouvement | null;
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
  const lieu = info.sorte === "mer" ? t.merCourt : info.sorte === "neutre" ? t.terreNeutre : `${nomDuClan(info.tag, t)} · ${c.alliance ?? t.sansAlliance}`;
  const ici = info.bouge === "pris" ? `${lieu} · ${t.pixelPris}` : info.bouge === "perdu" ? `${lieu} · ${t.pixelPerdu}` : lieu;
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
      {zone.pending ? <p class="alliance-bulle-pied">{t.enAttenteAccord}</p> : zone.state && <p class="alliance-bulle-pied">{t.etatLigne(t.etats[zone.state])}</p>}
      {c.mouvement && <p class="alliance-bulle-pied">{t.zone24h(c.mouvement.pris, c.mouvement.perdus, t.nombre)}</p>}
      <p class="alliance-bulle-pied">
        {t.ici} {ici}
      </p>
      <p class="alliance-bulle-pied">{t.misAJour(t.dateHeure(zone.updated_at), zone.by)}</p>
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
