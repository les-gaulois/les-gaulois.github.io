/**
 * Les effets d'un cosmétique, écrits sur sa carte (22 novembre 2026, demande du pilote : « voir aussi les effets dégagés par
 * le cosmétique, comme sur les cartes Pokémon »). Ce sont ceux du duel « Coup pour coup » : le moteur partagé les donne
 * (`moteur-du-site.ts`), l'écran ne recalcule rien. Chargé à la demande, seulement pour qui voit le duel
 * (`useEffetsDeLaChose` de `../effets-des-cartes.ts`) : tant que le duel est fermé, les autres membres n'en savent rien.
 */
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { familierDe } from "../../../lib/village/familiers";
import type { EffetsDeCarte, LigneDEffet } from "../effets-des-cartes";
import { ROLES, iconeDeMot, tuileDeRole } from "./dessins-des-cartes";
import { dessinDeLaCarte, ficheDe } from "./moteur";
import { MOTEUR } from "./moteur-du-site";

const urlDuRole = (role: keyof typeof ROLES): string => urlDeLaPlanche(`duel-role|${role}`, () => tuileDeRole(role));
const urlDuMot = (mot: string, unique: boolean): string => urlDeLaPlanche(`duel-mot|${mot}|${unique}`, () => iconeDeMot(mot, unique));

const DEJA = new Map<string, EffetsDeCarte | null>();

/**
 * Les effets de la chose d'une clé de fond (`objet/<emplacement>/<id>`, `familier/<id>`, voir `fonds-objets/index.ts`) :
 * la carte du duel d'un objet, le compagnon d'un familier ; `null` pour une chose sans effet (un Gaulois unique, un objet
 * hors du duel).
 */
export function lireEffets(cle: string): EffetsDeCarte | null {
  if (DEJA.has(cle)) return DEJA.get(cle) ?? null;
  const effets = calculer(cle);
  DEJA.set(cle, effets);
  return effets;
}

function calculer(cle: string): EffetsDeCarte | null {
  const [sorte, a, b] = cle.split("/");
  if (sorte === "objet" && a && b) {
    const fiche = MOTEUR.catalogue[b];
    if (!fiche || fiche.e !== a) return null;
    const carte = MOTEUR.carte(b);
    const dessin = dessinDeLaCarte(MOTEUR, carte);
    const lignes: LigneDEffet[] = ficheDe(MOTEUR, carte).lignes.map((l) => ({
      icone: !l.icone ? null : "role" in l.icone ? urlDuRole(l.icone.role) : urlDuMot(l.icone.mot, l.icone.unique),
      cases: l.icone && "role" in l.icone ? 15 : 11,
      gras: l.gras,
      texte: l.texte,
      ton: l.ton ?? null,
    }));
    return {
      duel: {
        role: carte.role,
        roleNom: ROLES[carte.role].nom,
        couleurDuRole: ROLES[carte.role].fonce,
        urlDuRole: urlDuRole(carte.role),
        force: carte.f,
        cout: carte.c,
        repos: carte.repos,
        icones: dessin.mots.slice(0, 3).map(({ mot, unique }) => ({ url: urlDuMot(mot, unique), nom: MOTEUR.mots[mot]?.nom ?? mot })),
        unique: carte.unique,
      },
      lignes,
    };
  }
  if (sorte === "familier" && a) {
    const familier = familierDe(a);
    const compagnon = familier ? MOTEUR.compagnons[familier.famille] : undefined;
    if (!familier || !compagnon) return null;
    return { duel: null, lignes: [{ icone: null, cases: 11, gras: "Compagnon de duel", texte: compagnon.phrase, ton: null }] };
  }
  return null;
}
