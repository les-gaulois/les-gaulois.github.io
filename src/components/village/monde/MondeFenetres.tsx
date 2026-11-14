import { SEUILS_DU_FEU, type NiveauDuFeu } from "../../../lib/village/chantier-liste";
import { avancementDuBatiment, batimentEnCours, pointsAffiches } from "../../../lib/village/chantier";
import type { Village } from "../../../lib/village/contrat";
import { sonGauloisManque } from "../../../lib/village/ecran-place";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { SANS_DONNEES, etatDuBatimentEnMots, jourDeParis, nombre, nomDuFeu, nomDuNiveau, phraseDuChantier, posesDuBatiment, suiteDuChantier, suiteDuFeu } from "../../../lib/village/monde/textes";
import { type Habitant, LIEUX, type Lieu, compteDuLieu, phraseDuReleve } from "../../../lib/village/vie";
import { BoutonDuToucher, type Parole, phraseDite } from "../PlaceToucher";
import AtelierDeLaForge from "./FenetreForge";
import { PlaquesDuGaulois } from "./MondePlaques";

/**
 * Le contenu des fenêtres propres au monde : « Le chantier », « Le grand feu », « Qui est où » et « La forge ». Elles
 * disent en texte tout ce que le dessin montre. Les chiffres sont ceux de l'état du monde (`monde-etat.ts`) : les points
 * rapportés au clan, au dernier relevé des sessions, dont l'heure est écrite. Sans données, c'est dit : jamais de zéro.
 */

/** Pas de données : la phrase, et l'heure du dernier relevé si on la connaît. */
function SansDonnees({ releve, testid }: { releve: string | null; testid: string }) {
  const phrase = phraseDuReleve(releve);
  return (
    <div class="monde-chantier" data-testid={testid}>
      <p class="monde-en-cours-phrase">{SANS_DONNEES}</p>
      {phrase && <p class="info-discrete">{phrase}</p>}
    </div>
  );
}

/**
 * « Le chantier » : le bâtiment en cours et ce qui lui manque, puis chaque bâtiment dans l'ordre : fini (et quand), en
 * chantier (ce qui est posé), ou à venir (ce qu'il demandera). `voir` mène la caméra à un bâtiment.
 */
export function FenetreChantier({ etat, voir }: { etat: EtatDuMonde; voir: (id: string) => void }) {
  const chantier = etat.chantier;
  if (!chantier) return <SansDonnees releve={etat.releve} testid="monde-chantier-sans-donnees" />;
  const enCours = batimentEnCours(chantier);
  const depuis = jourDeParis(chantier.depuis);
  const releve = phraseDuReleve(etat.releve);
  return (
    <div class="monde-chantier" data-testid="monde-chantier">
      <p class="monde-chiffre">
        <strong class="tnum">{nombre(pointsAffiches(chantier.points))}</strong> {suiteDuChantier(chantier.points)}
        {depuis && ` depuis le ${depuis}`}
      </p>
      {enCours ? (
        <div class="monde-en-cours">
          <p class="monde-en-cours-phrase">{phraseDuChantier(enCours)}.</p>
          <span class="monde-jauge" aria-hidden="true">
            <i style={{ width: `${Math.max(1, avancementDuBatiment(enCours) * 100)}%` }} />
          </span>
          <p class="info-discrete tnum">{posesDuBatiment(enCours)}</p>
        </div>
      ) : (
        <p class="monde-en-cours-phrase">Tout le village est bâti.</p>
      )}
      <ol class="monde-batiments">
        {chantier.batiments.map((b) => {
          const sonTour = b.id === chantier.en_cours;
          return (
            <li key={b.id} data-etat={b.fini_le !== null ? "fini" : sonTour ? "chantier" : "attente"}>
              <span class="monde-batiment-marque" aria-hidden="true" />
              <span class="monde-batiment-nom">{b.titre}</span>
              <span class="monde-batiment-etat tnum">{etatDuBatimentEnMots(b, sonTour)}</span>
              <button type="button" class="monde-voir" aria-label={`Voir ${b.nom} dans le village`} onClick={() => voir(b.id)}>
                Voir
              </button>
            </li>
          );
        })}
      </ol>
      <p class="info-discrete">Chaque point rapporté au clan pose une pierre, par tous les joueurs du clan.{releve && ` ${releve}.`}</p>
    </div>
  );
}

/** Ce qu'il faut de points sur 7 jours pour chaque feu, en mots. */
function seuilDuFeu(niveau: NiveauDuFeu): string {
  if (niveau === 0) return `moins de ${SEUILS_DU_FEU[0]} points`;
  return `à partir de ${SEUILS_DU_FEU[niveau - 1]} points`;
}

/** « Le grand feu » : son nom, les points rapportés au clan sur 7 jours, l'heure du relevé, puis l'échelle des cinq feux. */
export function FenetreFeu({ etat, voir }: { etat: EtatDuMonde; voir: () => void }) {
  const feu = etat.feu;
  if (!feu) return <SansDonnees releve={etat.releve} testid="monde-feu-sans-donnees" />;
  const releve = phraseDuReleve(etat.releve);
  return (
    <div class="monde-feu" data-testid="monde-feu">
      <p class="monde-feu-nom">{nomDuFeu(feu)}</p>
      <p class="monde-chiffre">
        <strong class="tnum">{nombre(pointsAffiches(feu.points))}</strong> {suiteDuFeu(feu)}
      </p>
      {releve && <p class="info-discrete">{releve}</p>}
      <ol class="monde-feux">
        {([0, 1, 2, 3, 4] as const).map((niveau) => (
          <li key={niveau} aria-current={niveau === feu.niveau ? "true" : undefined}>
            <span class="monde-feu-barre" aria-hidden="true" style={{ "--monde-niveau": String(niveau) }} />
            <span class="monde-feux-nom">{nomDuNiveau(niveau)}</span>
            <span class="monde-feux-seuil tnum">{seuilDuFeu(niveau)}</span>
            {niveau === feu.niveau && <span class="sr-only"> (au dernier relevé)</span>}
          </li>
        ))}
      </ol>
      <p class="info-discrete">Sa hauteur suit les points rapportés au clan sur les {feu.jours} derniers jours.</p>
      <button type="button" class="btn btn-ghost monde-bouton" onClick={voir}>
        Voir le grand feu
      </button>
    </div>
  );
}

/** Ce qui amène dans chaque lieu, en une ligne. La place n'en a pas besoin : on s'y promène. */
const REGLES: Readonly<Record<Lieu, string | null>> = {
  place: null,
  taverne: "Après une partie, pendant 3 heures.",
  reunion: "En vocal sur Discord au dernier relevé.",
  bataille: "Une partie commencée il y a moins de 45 minutes, rejouée.",
  maisons: "De 23 h à 7 h, heure de Paris.",
};

/**
 * « Qui est où » : le monde en texte, lieu par lieu, pour le clavier et les lecteurs d'écran comme pour qui cherche un
 * nom. Chaque nom est un bouton : il fait parler le Gaulois, et la caméra va à lui.
 */
export function FenetreQui({ village, lieux, message, dit, onParler, onGaulois, voirLieu }: { village: Village | null; lieux: Record<Lieu, Habitant[]>; message: string | null; dit: Parole | null; onParler: (habitant: Habitant) => void; onGaulois: () => void; voirLieu: (lieu: Lieu) => void }) {
  if (message) return <p class="place-mot place-mot-fort">{message}</p>;
  if (!village) return <p class="info-discrete">Lecture du village…</p>;
  const releve = phraseDuReleve(village.releve);
  return (
    <div class="monde-qui" data-testid="monde-qui">
      {village.gaulois.length === 0 && <p class="place-mot">Le village est vide.</p>}
      {LIEUX.filter((lieu) => lieux[lieu].length > 0).map((lieu) => (
        <section key={lieu} class="vie-liste">
          <h3 class="vie-liste-titre">
            {compteDuLieu(lieu, lieux[lieu].length)}
            <button type="button" class="monde-voir" aria-label={`Voir le lieu : ${compteDuLieu(lieu, lieux[lieu].length)}`} onClick={() => voirLieu(lieu)}>
              Voir
            </button>
          </h3>
          {REGLES[lieu] && <p class="info-discrete">{REGLES[lieu]}</p>}
          <ul>
            {lieux[lieu].map((habitant) => {
              const phrase = phraseDite(dit, habitant);
              return (
                <li key={habitant.rang}>
                  <span class="vie-liste-nom">
                    <BoutonDuToucher habitant={habitant} onToucher={onParler} />
                    {habitant.gaulois.moi && " (vous)"}
                  </span>
                  <span class="vie-liste-raison">{habitant.presence.raison}</span>
                  <PlaquesDuGaulois gaulois={habitant.gaulois} class="vie-liste-plaques" />
                  {(phrase ?? habitant.gaulois.replique) && (
                    <span class={phrase ? "vie-liste-replique toucher-dit" : "vie-liste-replique"} data-testid={phrase ? "toucher-dit" : undefined}>
                      « {phrase ?? habitant.gaulois.replique} »
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {releve && (
        <p class="info-discrete" data-testid="monde-releve">
          {releve}
        </p>
      )}
      {sonGauloisManque(village) && (
        <p class="place-mot" data-testid="monde-sans-gaulois">
          <button type="button" class="monde-lien" onClick={onGaulois}>
            Créez votre Gaulois
          </button>{" "}
          pour y paraître.
        </p>
      )}
    </div>
  );
}

/** « La forge » : sa fenêtre est prête, son atelier ouvre plus tard (la forge aux souvenirs). */
export function FenetreForge({ voir }: { voir: () => void }) {
  return (
    <div class="monde-forge" data-testid="monde-forge">
      <AtelierDeLaForge />
      <button type="button" class="btn btn-ghost monde-bouton" onClick={voir}>
        Voir la forge
      </button>
    </div>
  );
}
