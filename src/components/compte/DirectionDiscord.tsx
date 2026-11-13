import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { parseDiscordCalls, type DiscordCalls } from "../../lib/compte/discord-appels";
import { etatDesAppels, etatDuPing, etatDuSalon, etatDuVocal, etatsDesImages, tonLePlusGrave, type Etat } from "../../lib/compte/discord-etat";
import { parseDiscordSalons, type RobotSalon, type RobotSalonId } from "../../lib/compte/discord-salons";
import { parseQgTools } from "../../lib/compte/outils";
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

/** Le nom court d'un salon du robot, devant son état sur la ligne du menu. */
const NOMS_COURTS: Record<RobotSalonId, string> = { nouvelles: "Nouvelles", encadrement: "Encadrement", victoires: "Victoires", alliance: "Alliance" };

/** Un état du menu : son mot, précédé au besoin du nom de ce qu'il décrit. `plain` : le point et le mot seuls. */
interface EtatDuMenu extends Etat {
  nom?: string;
  plain?: boolean;
}

/** Une lecture du serveur : `undefined` pas encore faite, `null` impossible ou illisible. */
type Lu<T> = T | null | undefined;

const ILLISIBLE: EtatDuMenu[] = [{ ton: "muted", mot: "État non lu" }];

/** Lit un réglage sans rien afficher d'autre que son état : une panne ou une réponse illisible donne `null`. */
async function lire<T>(name: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  try {
    return parse(await call<unknown>(name));
  } catch {
    return null;
  }
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
 * ligne. L'onglet lit pour cela les réglages dès son ouverture, sans rien écrire ; une rubrique ouverte les relit et donne
 * ses lectures au menu (`onRead`), qui suit ainsi chaque changement. Le lien d'un webhook n'est jamais lu ni montré.
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
  // Le lien du vocal : `false` quand il n'y en a pas, pour le distinguer d'une lecture impossible (`null`).
  const [voice, setVoice] = useState<Lu<string | false>>(undefined);
  const inventaire = useInventaire();

  useEffect(() => {
    let alive = true;
    void lire("get_discord_salons", parseDiscordSalons).then((next) => alive && setSalons((now) => now ?? next));
    void lire("get_discord_calls", parseDiscordCalls).then((next) => alive && setCalls((now) => now ?? next));
    void lire("get_qg_tools", parseQgTools).then((tools) => alive && setVoice((now) => now ?? (tools === null ? null : (tools.voice ?? false))));
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
        return inventaire?.images ? etatsDesImages(inventaire.images).map((etat) => ({ ...etat, plain: etat.ton === "muted" })) : inventaire?.problem ? ILLISIBLE : [];
      case "salons":
        return salons === undefined ? [] : salons === null ? ILLISIBLE : salons.map((salon) => ({ ...etatDuSalon(salon), nom: NOMS_COURTS[salon.id] }));
      case "appels": {
        if (calls === undefined) return [];
        if (calls === null) return ILLISIBLE;
        const ping = etatDuPing(calls);
        return ping ? [etatDesAppels(calls), { ...ping, plain: true }] : [etatDesAppels(calls)];
      }
      case "vocal":
        return voice === undefined ? [] : voice === null ? ILLISIBLE : [etatDuVocal(voice === false ? null : voice)];
    }
  };

  const contenu = (id: RubriqueId): ComponentChildren => {
    switch (id) {
      case "message":
        return <DirectionMessage />;
      case "images":
        return <DirectionImages />;
      case "salons":
        return <DirectionSalons level={3} onRead={setSalons} />;
      case "appels":
        return <DirectionAppels onRead={setCalls} />;
      case "vocal":
        return <DirectionVocal bare onRead={(link) => setVoice(link ?? false)} />;
    }
  };

  return (
    <div class="dir-discord menu-deroulant" data-testid="direction-discord-menu">
      {RUBRIQUES.map((rubrique) => {
        const liste = etats(rubrique.id);
        // Le trait au bord de la ligne : seulement pour ce qui se règle. Le nombre d'images n'est pas un état.
        const reglages = liste.filter((etat) => !etat.plain);
        return (
          <details
            key={rubrique.id}
            id={`discord-${rubrique.id}`}
            class="deroule card"
            data-dir-ton={reglages.length > 0 ? tonLePlusGrave(reglages) : undefined}
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
