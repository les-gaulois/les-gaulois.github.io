import { tabKeyTarget } from "../../lib/onglets";
import type { NomDeGrandeIcone } from "../../lib/jeu/icones";
import type { TabItem } from "../compte/Onglets";
import { Etiquette, Icone, Px } from "./Pixels";

/**
 * Le menu du jeu « Mon Gaulois » (21 novembre 2026, maquette validée par le pilote : « un menu comme la majorité des jeux ») :
 * les parties en grosses icônes dessinées, en colonne à gauche sur ordinateur, en rangée en bas de l'écran sur téléphone
 * (16-jeu.css). Ce sont de vrais onglets (`role="tab"`), avec les mêmes noms d'éléments que la barre d'onglets du site
 * (`<prefix>-onglet-<id>`, qui nomme chaque `Partie`) : flèches, Début et Fin au clavier, et l'adresse de la partie ouverte
 * (`#forge`, `#boutique`…) tenue par `useTabs`, comme avant.
 *
 * Ce qui attend derrière une partie (objets du pass à prendre, boosters gagnés, jours avant le tirage) se dit en étiquette
 * dessinée, et en toutes lettres aux lecteurs d'écran.
 */
export interface OngletDuJeu extends TabItem {
  /** Le dessin de la partie. */
  dessin: NomDeGrandeIcone;
  /** Le mot écrit sur son bouton, en capitales du kit. */
  mot: string;
}

export function MenuDuJeu({ prefix, onglets, active, onSelect }: { prefix: string; onglets: OngletDuJeu[]; active: string; onSelect: (id: string) => void }) {
  const auClavier = (e: KeyboardEvent, i: number): void => {
    // En colonne (ordinateur) comme en rangée (téléphone), les quatre flèches passent d'une partie à l'autre.
    const suivant = tabKeyTarget(e.key, i, onglets.length, true) ?? tabKeyTarget(e.key, i, onglets.length, false);
    if (suivant === null) return;
    e.preventDefault();
    const o = onglets[suivant];
    if (!o) return;
    onSelect(o.id);
    document.getElementById(`${prefix}-onglet-${o.id}`)?.focus();
  };
  return (
    <div class="jeu-menu" role="tablist" aria-label="Les parties du jeu" data-testid={`${prefix}-onglets`}>
      {onglets.map((o, i) => {
        const ouvert = o.id === active;
        const nombre = o.count && o.count.value > 0 ? o.count : null;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`${prefix}-onglet-${o.id}`}
            aria-selected={ouvert}
            aria-controls={`${prefix}-partie-${o.id}`}
            tabIndex={ouvert ? 0 : -1}
            class="jeu-onglet"
            data-testid={`onglet-${o.id}`}
            onClick={() => onSelect(o.id)}
            onKeyDown={(e) => auClavier(e, i)}
          >
            <Icone nom={o.dessin} />
            {/* Sur le bouton d'or de la partie ouverte, l'écriture passe à l'encre ; sur les bleus, crème cerné. */}
            <Px t={o.mot} couleur="creme" relief="cerne" muet classe="jeu-onglet-mot-ferme" />
            <Px t={o.mot} couleur="encre" muet classe="jeu-onglet-mot-ouvert" />
            <span class="sr-only">{o.label}</span>
            {nombre && <Etiquette t={nombre.text ?? String(nombre.value)} ton={nombre.tone === "vif" ? "rouge" : "or"} dit={`, ${nombre.words}`} classe={`jeu-onglet-nombre ${nombre.text ? "jeu-onglet-mots" : ""}`} />}
          </button>
        );
      })}
    </div>
  );
}
