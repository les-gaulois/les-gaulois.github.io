import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import DirectionAppels from "./DirectionAppels";
import DirectionImages from "./DirectionImages";
import DirectionMessage from "./DirectionMessage";
import DirectionSalons from "./DirectionSalons";
import DirectionVocal from "./DirectionVocal";
import { InventaireProvider } from "./inventaire";

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

function contenu(id: RubriqueId): ComponentChildren {
  switch (id) {
    case "message":
      return <DirectionMessage />;
    case "images":
      return <DirectionImages />;
    case "salons":
      return (
        <div class="grid gap-12">
          <DirectionSalons level={3} />
        </div>
      );
    case "appels":
      return <DirectionAppels />;
    case "vocal":
      return <DirectionVocal bare />;
  }
}

/**
 * L'onglet Discord de la Direction, pour les admins et le fondateur (11 novembre 2026, demande du pilote : « quand on
 * clique sur discord ça fait dérouler un menu de haut en bas et y a message discord »). Un menu dont chaque rubrique se
 * déroule sous son titre, au clic ou au clavier (`<details>`). Une rubrique ne lit le serveur qu'à sa première ouverture,
 * puis reste dans la page, fermée ou non : un message en cours d'écriture ne se perd pas. L'inventaire d'images est
 * partagé par les rubriques : une image gardée dans l'une se choisit aussitôt dans l'autre.
 */
export default function DirectionDiscord() {
  const [opened, setOpened] = useState<ReadonlySet<RubriqueId>>(new Set());
  return (
    <InventaireProvider>
      <div class="menu-deroulant" data-testid="direction-discord-menu">
        {RUBRIQUES.map((rubrique) => (
          <details
            key={rubrique.id}
            id={`discord-${rubrique.id}`}
            class="deroule card"
            data-testid={`direction-discord-${rubrique.id}`}
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) setOpened((s) => (s.has(rubrique.id) ? s : new Set([...s, rubrique.id])));
            }}
          >
            <summary>
              <h2 class="deroule-titre">{rubrique.title}</h2>
              <span class="deroule-aide">{rubrique.hint}</span>
            </summary>
            <div class="deroule-contenu">{opened.has(rubrique.id) && contenu(rubrique.id)}</div>
          </details>
        ))}
      </div>
    </InventaireProvider>
  );
}
