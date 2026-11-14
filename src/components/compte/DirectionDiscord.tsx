import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { parseDiscordCalls, type DiscordCalls } from "../../lib/compte/discord-appels";
import { etatsDuMenuAppels, etatsDuMenuImages, etatsDuMenuSalons, etatsDuMenuVocal, traitDuMenu, type EtatDuMenu, type Lu } from "../../lib/compte/discord-etat";
import { parseDiscordSalons, type RobotSalon } from "../../lib/compte/discord-salons";
import DirectionAppels from "./DirectionAppels";
import DirectionImages from "./DirectionImages";
import DirectionMessage from "./DirectionMessage";
import DirectionSalons from "./DirectionSalons";
import DirectionVocal from "./DirectionVocal";
import { Pastille } from "./direction-kit";
import { InventaireProvider, useInventaire } from "./inventaire";

/** Les rubriques de l'onglet Discord, dans l'ordre du menu. */
const RUBRIQUES = [
  { id: "message", title: "Message Discord", hint: "Un message avec embeds et images, dans le salon choisi." },
  { id: "images", title: "Inventaire d'images", hint: "Les images gardées pour les messages, comme le logo du clan." },
  // Le 12 novembre 2026, le pilote cherchait ici le salon des demandes d'adhésion sans le trouver : l'aide les nomme.
  { id: "salons", title: "Salons du robot", hint: "Où le robot annonce les demandes d'adhésion, les nouvelles et les victoires." },
  { id: "appels", title: "Appels sur Discord", hint: "Chaque appel lancé au QG part dans un salon, avec un ping du rôle au choix." },
  { id: "vocal", title: "Salon vocal", hint: "Le bouton « Rejoindre le vocal » de l'onglet Salons du QG." },
] as const;

type RubriqueId = (typeof RUBRIQUES)[number]["id"];

/** Lit un réglage sans rien afficher d'autre que son état : une panne ou une réponse illisible donne `null`. */
async function lire<T>(name: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  try {
    return parse(await call<unknown>(name));
  } catch {
    return null;
  }
}

/** Les lectures faites par le menu à l'ouverture de l'onglet, que chaque rubrique reprend au lieu de relire le serveur. */
interface Premieres {
  salons: Promise<RobotSalon[] | null>;
  calls: Promise<DiscordCalls | null>;
}

/**
 * L'onglet Discord de la Direction, pour les admins et le fondateur (11 novembre 2026, demande du pilote : « quand on
 * clique sur discord ça fait dérouler un menu de haut en bas et y a message discord »). Un menu dont chaque rubrique se
 * déroule sous son titre, au clic ou au clavier (`<details>`). Une rubrique fermée reste dans la page une fois ouverte :
 * un message en cours d'écriture ne se perd pas. L'inventaire d'images est partagé par les rubriques : une image gardée
 * dans l'une se choisit aussitôt dans l'autre.
 *
 * Depuis le 14 novembre 2026 (« comme pour la section compte »), chaque ligne du menu dit l'état de ses réglages d'un coup
 * d'œil, en pastilles : une couleur et son mot (`discord-etat.ts`), et un trait de la couleur la plus grave au bord de la
 * ligne. L'onglet lit pour cela, dès son ouverture, les salons du robot, les appels et l'inventaire : trois fonctions qui ne
 * font que lire (`get_discord_salons`, `get_discord_calls`, `get_discord_images`), une fois chacune. Une rubrique ouverte
 * reprend cette lecture (`premiere`), la relit si elle a échoué (« État non lu »), puis donne ses lectures suivantes au menu
 * (`onRead`), qui suit ainsi chaque changement. Le salon vocal n'a d'état qu'une fois sa rubrique ouverte : sa lecture,
 * `get_qg_tools`, fait aussi le ménage des outils du QG, et ne part donc pas du menu. Le lien d'un webhook n'est jamais lu
 * ni montré.
 */
export default function DirectionDiscord() {
  return (
    <InventaireProvider>
      <Menu />
    </InventaireProvider>
  );
}

function Menu() {
  const [opened, setOpened] = useState<ReadonlySet<RubriqueId>>(new Set());
  const [salons, setSalons] = useState<Lu<RobotSalon[]>>(undefined);
  const [calls, setCalls] = useState<Lu<DiscordCalls>>(undefined);
  // Le lien du vocal, donné par sa rubrique : `false` quand il n'y en a pas.
  const [voice, setVoice] = useState<Lu<string | false>>(undefined);
  const premieres = useRef<Premieres | null>(null);
  const inventaire = useInventaire();

  useEffect(() => {
    let alive = true;
    const lues: Premieres = { salons: lire("get_discord_salons", parseDiscordSalons), calls: lire("get_discord_calls", parseDiscordCalls) };
    premieres.current = lues;
    // Une rubrique ouverte entre-temps a pu donner une lecture plus récente : elle est gardée.
    void lues.salons.then((next) => alive && setSalons((now) => now ?? next));
    void lues.calls.then((next) => alive && setCalls((now) => now ?? next));
    inventaire?.ensure();
    return () => {
      alive = false;
    };
  }, []);

  const etats = (id: RubriqueId): EtatDuMenu[] => {
    switch (id) {
      case "message":
        return [];
      case "images":
        return inventaire ? etatsDuMenuImages(inventaire.images, inventaire.problem) : [];
      case "salons":
        return etatsDuMenuSalons(salons);
      case "appels":
        return etatsDuMenuAppels(calls);
      case "vocal":
        return etatsDuMenuVocal(voice);
    }
  };

  const contenu = (id: RubriqueId): ComponentChildren => {
    switch (id) {
      case "message":
        return <DirectionMessage />;
      case "images":
        return <DirectionImages />;
      case "salons":
        return <DirectionSalons level={3} premiere={premieres.current?.salons} onRead={setSalons} />;
      case "appels":
        return <DirectionAppels premiere={premieres.current?.calls} onRead={setCalls} />;
      case "vocal":
        return <DirectionVocal bare onRead={(link) => setVoice(link ?? false)} />;
    }
  };

  return (
    <div class="dir-discord menu-deroulant" data-testid="direction-discord-menu">
      {RUBRIQUES.map((rubrique) => {
        const liste = etats(rubrique.id);
        return (
          <details
            key={rubrique.id}
            id={`discord-${rubrique.id}`}
            class="deroule card"
            data-dir-ton={traitDuMenu(liste)}
            data-testid={`direction-discord-${rubrique.id}`}
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) setOpened((s) => (s.has(rubrique.id) ? s : new Set([...s, rubrique.id])));
            }}
          >
            <summary>
              <h2 class="deroule-titre">{rubrique.title}</h2>
              <span class="deroule-aide">{rubrique.hint}</span>
              {liste.length > 0 && (
                <span class="dir-discord-etats" data-testid={`direction-discord-${rubrique.id}-etats`}>
                  {liste.map((etat) => (
                    <span key={`${etat.nom ?? ""}-${etat.mot}`} class="dir-discord-etat">
                      {etat.nom && <span class="dir-discord-etat-nom">{etat.nom}</span>}
                      <Pastille ton={etat.ton} plain={etat.plain}>
                        {etat.mot}
                      </Pastille>
                    </span>
                  ))}
                </span>
              )}
            </summary>
            <div class="deroule-contenu">{opened.has(rubrique.id) && contenu(rubrique.id)}</div>
          </details>
        );
      })}
    </div>
  );
}
