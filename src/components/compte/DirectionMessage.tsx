import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call, MESSAGE_DRAFT_KEY, uploadDiscordImage } from "../../lib/compte/api";
import { isWebhookLink } from "../../lib/compte/discord-appels";
import {
  blockedSentence,
  botName,
  checkSentence,
  COLOR_PRESETS,
  DEFAULT_COLOR,
  draftFiles,
  draftHasContent,
  draftOfMessage,
  draftProblems,
  embedsLength,
  emptyDraft,
  fieldId,
  galleryLength,
  IMAGE_TYPES,
  isHttpsLink,
  isMessageWaiting,
  LIMITS,
  messageBody,
  messageSummary,
  newEmbed,
  newField,
  newGalleryItem,
  nextKey,
  NOTIFY_LABELS,
  outcomeSentence,
  parseMessages,
  removeSentence,
  salonLabel,
  type DraftMode,
  type EmbedDraft,
  type FieldDraft,
  type GalleryItemDraft,
  type ImageSlot,
  type MessageDraft,
  type MessagesState,
  type Notify,
  type SentMessage,
} from "../../lib/compte/discord-message";
import { errorMessage } from "../../lib/compte/errors";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { Loading, Problem, Success, messageOf, useNow } from "./common";
import DiscordApercu from "./DiscordApercu";
import { useInventaire } from "./inventaire";
import { Compteur, ImageChoix, TexteMisEnForme } from "./MessageChamps";

/** Les relectures qui suivent un envoi, le temps que Discord réponde : pg_net envoie d'ordinaire en moins d'une seconde. */
const FOLLOW_UP_MS = [1_500, 4_000, 10_000, 30_000];
/** Le brouillon reste dans ce navigateur jusqu'à la déconnexion : un rechargement ne le perd pas, les fichiers pas encore envoyés si. */
const DRAFT_KEY = MESSAGE_DRAFT_KEY;

function readSavedDraft(): MessageDraft | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return null;
    const saved = raw as { salon?: unknown; message?: unknown; mode?: unknown; gallery?: unknown };
    const salon = typeof saved.salon === "string" ? saved.salon : "";
    const draft = draftOfMessage(saved.message, salon);
    const mode: DraftMode = saved.mode === "images" ? "images" : "embeds";
    const gallery = draftOfMessage({ gallery: saved.gallery }, salon).gallery;
    return { ...draft, mode, gallery: mode === "images" && gallery.length === 0 ? [newGalleryItem()] : gallery };
  } catch {
    return null;
  }
}

function saveDraft(draft: MessageDraft, uploaded: Map<string, string>) {
  try {
    if (!draftHasContent(draft)) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    // Les embeds et les images en grand sont gardés tous les deux : passer de l'un à l'autre ne perd rien, même au rechargement.
    const message = messageBody({ ...draft, mode: "embeds" }, (id) => uploaded.get(id) ?? null);
    // Chaque image en grand garde sa description et son spoiler, même sans adresse : la place d'un fichier pas encore
    // déposé reste, vide, à remplir de nouveau.
    const gallery = draft.gallery.map((g) => ({
      url: g.image.kind === "link" ? g.image.url : g.image.kind === "file" ? (uploaded.get(g.image.id) ?? "") : "",
      description: g.description,
      spoiler: g.spoiler,
    }));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ salon: draft.salon, mode: draft.mode, message, gallery }));
  } catch {
    // Stockage refusé (navigation privée) : le brouillon vit seulement dans la page.
  }
}

/** Mène au champ à corriger, en ouvrant le repli qui le cache. */
function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open) parent.open = true;
  }
  el.focus();
}

/** Un repli du formulaire, ouvert d'emblée s'il contient déjà quelque chose. */
function Repli({ title, startOpen, children }: { title: string; startOpen: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (startOpen && ref.current) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} class="fold">
      <summary class="font-semibold">{title}</summary>
      <div class="mt-3 grid gap-4">{children}</div>
    </details>
  );
}

/** Une action qui efface, au second clic seulement, avec ce qui sera perdu écrit dessous. Le bouton ne bouge pas. */
export function SecondClic({ id, label, confirm, warning, busy, onConfirm }: { id: string; label: string; confirm: string; warning: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div class="grid gap-2">
      <div>
        <button
          type="button"
          class="btn btn-ghost"
          disabled={busy}
          aria-describedby={armed ? `${id}-note` : undefined}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            onConfirm();
          }}
          onBlur={() => setArmed(false)}
          data-testid={id}
        >
          {armed ? confirm : label}
        </button>
      </div>
      {armed && (
        <p id={`${id}-note`} class="text-sm text-warn">
          {warning}
        </p>
      )}
    </div>
  );
}

/** Le texte d'un champ simple, avec son nom et son compte. */
function Ligne({ id, label, value, onChange, max, placeholder, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; max?: number; placeholder?: string; type?: "text" | "url" }) {
  return (
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-x-4">
        <label for={id} class="text-sm font-semibold">
          {label}
        </label>
        {max !== undefined && <Compteur id={`${id}-compte`} text={value} max={max} />}
      </div>
      <input
        id={id}
        class="field mt-1"
        inputMode={type === "url" ? "url" : undefined}
        autoComplete="off"
        spellcheck={type !== "url"}
        placeholder={placeholder}
        aria-describedby={max !== undefined ? `${id}-compte` : undefined}
        value={value}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
    </div>
  );
}

type Images = { addFile: (file: File) => ImageSlot | string; preview: (slot: ImageSlot) => string | null };

function Champs({ embedIndex, fields, onChange }: { embedIndex: number; fields: FieldDraft[]; onChange: (fields: FieldDraft[]) => void }) {
  const set = (i: number, patch: Partial<FieldDraft>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, to: number) => {
    const next = [...fields];
    const [moved] = next.splice(i, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  };
  return (
    <>
      {fields.map((field, i) => (
        <fieldset key={field.key} class="champ-embed">
          <legend class="nom-champ font-semibold">Champ {i + 1}</legend>
          <div class="grid gap-3">
            <Ligne id={fieldId.fieldName(embedIndex, i)} label="Nom" value={field.name} onChange={(name) => set(i, { name })} max={LIMITS.fieldName} />
            <TexteMisEnForme id={fieldId.fieldValue(embedIndex, i)} label="Valeur" value={field.value} onChange={(value) => set(i, { value })} max={LIMITS.fieldValue} rows={3} tools="field" />
            <label class="flex min-h-11 items-center gap-3 font-semibold">
              <input type="checkbox" class="size-5" checked={field.inline} onChange={(e) => set(i, { inline: e.currentTarget.checked })} />
              Sur la même ligne que ses voisins (trois au plus)
            </label>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Monter le champ ${i + 1}`}>
                Monter
              </button>
              <button type="button" class="btn btn-ghost" disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} aria-label={`Descendre le champ ${i + 1}`}>
                Descendre
              </button>
              <button type="button" class="btn btn-ghost" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Retirer le champ ${i + 1}`}>
                Retirer le champ
              </button>
            </div>
          </div>
        </fieldset>
      ))}
      <div>
        <button type="button" class="btn btn-ghost" disabled={fields.length >= LIMITS.fields} onClick={() => onChange([...fields, newField()])}>
          Ajouter un champ
        </button>
      </div>
    </>
  );
}

function EmbedEditeur({
  embed,
  index,
  count,
  images,
  onChange,
  onMove,
  onCopy,
  onRemove,
}: {
  embed: EmbedDraft;
  index: number;
  count: number;
  images: Images;
  onChange: (patch: Partial<EmbedDraft>) => void;
  onMove: (to: number) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const titleId = `dm-e${index}-legende`;
  const custom = embed.color !== null && !COLOR_PRESETS.some((c) => c.hex === embed.color);
  return (
    <div role="group" class="embed-editeur" aria-labelledby={titleId} style={embed.color ? { "--embed-couleur": embed.color } : undefined} data-testid="direction-message-embed">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} class="text-xl">
          Embed{count > 1 ? ` ${n}` : ""}
        </h3>
        <div class="flex flex-wrap gap-2">
          {count > 1 && (
            <>
              <button type="button" class="btn btn-ghost" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Monter l'embed ${n}`}>
                Monter
              </button>
              <button type="button" class="btn btn-ghost" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Descendre l'embed ${n}`}>
                Descendre
              </button>
            </>
          )}
          <button type="button" class="btn btn-ghost" disabled={count >= LIMITS.embeds} onClick={onCopy} aria-label={`Copier l'embed ${n} en dessous`}>
            Copier
          </button>
        </div>
      </div>

      <div class="grid gap-2">
        <p id={`dm-e${index}-couleur`} class="nom-champ text-sm font-semibold">
          Couleur de la barre
        </p>
        <div class="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`dm-e${index}-couleur`}>
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.hex}
              type="button"
              class="pastille-couleur"
              style={{ "--pastille": c.hex }}
              aria-label={c.label}
              aria-pressed={embed.color === c.hex}
              title={c.label}
              onClick={() => onChange({ color: c.hex })}
            />
          ))}
          <label class="pastille-autre">
            <input type="color" value={embed.color ?? DEFAULT_COLOR} aria-label="Autre couleur" onInput={(e) => onChange({ color: e.currentTarget.value })} />
            <span aria-hidden="true">{custom ? embed.color : "Autre"}</span>
          </label>
          <button type="button" class="outil" aria-pressed={embed.color === null} onClick={() => onChange({ color: null })}>
            Sans couleur
          </button>
        </div>
      </div>

      <Ligne id={fieldId.title(index)} label="Titre" value={embed.title} onChange={(title) => onChange({ title })} max={LIMITS.title} />
      <Ligne id={fieldId.url(index)} label="Lien du titre" value={embed.url} onChange={(url) => onChange({ url })} placeholder="https://…" type="url" />
      <TexteMisEnForme id={fieldId.description(index)} label="Description" value={embed.description} onChange={(description) => onChange({ description })} max={LIMITS.description} rows={7} />
      <ImageChoix id={fieldId.image(index)} label="Grande image" slot={embed.image} onChange={(image) => onChange({ image })} {...images} />

      <div class="fold-list">
        <Repli title={`Champs${embed.fields.length ? ` (${embed.fields.length})` : ""}`} startOpen={embed.fields.length > 0}>
          <Champs embedIndex={index} fields={embed.fields} onChange={(fields) => onChange({ fields })} />
        </Repli>
        <Repli title="Miniature, en haut à droite" startOpen={embed.thumbnail.kind !== "none"}>
          <ImageChoix id={fieldId.thumbnail(index)} label="Miniature" slot={embed.thumbnail} onChange={(thumbnail) => onChange({ thumbnail })} {...images} />
        </Repli>
        <Repli title="Auteur, au-dessus du titre" startOpen={embed.authorName.trim() !== "" || embed.authorIcon.kind !== "none"}>
          <Ligne id={fieldId.authorName(index)} label="Nom de l'auteur" value={embed.authorName} onChange={(authorName) => onChange({ authorName })} max={LIMITS.author} />
          <Ligne id={fieldId.authorUrl(index)} label="Lien de l'auteur" value={embed.authorUrl} onChange={(authorUrl) => onChange({ authorUrl })} placeholder="https://…" type="url" />
          <ImageChoix id={fieldId.authorIcon(index)} label="Icône de l'auteur" slot={embed.authorIcon} onChange={(authorIcon) => onChange({ authorIcon })} {...images} />
        </Repli>
        <Repli title="Pied de page et date" startOpen={embed.footerText.trim() !== "" || embed.footerIcon.kind !== "none" || embed.time !== "none"}>
          <Ligne id={fieldId.footerText(index)} label="Pied de page" value={embed.footerText} onChange={(footerText) => onChange({ footerText })} max={LIMITS.footer} />
          <ImageChoix id={fieldId.footerIcon(index)} label="Icône du pied de page" slot={embed.footerIcon} onChange={(footerIcon) => onChange({ footerIcon })} {...images} />
          <fieldset>
            <legend class="nom-champ text-sm font-semibold">Date dans le pied de page</legend>
            <div class="mt-1 flex flex-wrap gap-x-6">
              {(
                [
                  ["none", "Aucune"],
                  ["now", "L'heure de l'envoi"],
                  ["date", "Une date choisie"],
                ] as const
              ).map(([value, text]) => (
                <label key={value} class="flex min-h-11 items-center gap-3">
                  <input type="radio" class="size-5" name={`dm-e${embed.key}-date`} checked={embed.time === value} onChange={() => onChange({ time: value })} />
                  {text}
                </label>
              ))}
            </div>
            {embed.time === "date" && (
              <div class="mt-2">
                <label for={fieldId.date(index)} class="text-sm font-semibold">
                  Date et heure
                </label>
                <input id={fieldId.date(index)} type="datetime-local" class="field mt-1" value={embed.date} onInput={(e) => onChange({ date: e.currentTarget.value })} />
              </div>
            )}
          </fieldset>
        </Repli>
      </div>
      {/* Retirer l'embed perd tout ce qu'il contient : à part, sous un filet, au second clic. */}
      <div class="border-t border-line pt-4">
        <SecondClic
          id={`direction-message-embed-retirer-${embed.key}`}
          label={count > 1 ? `Retirer l'embed ${n}` : "Retirer l'embed"}
          confirm="Confirmer : retirer l'embed"
          warning="Son titre, sa description, ses champs et ses images seront retirés du message."
          busy={false}
          onConfirm={onRemove}
        />
      </div>
    </div>
  );
}

/** Une image en grand du message : l'image, sa description pour les lecteurs d'écran, le spoiler, sa place. */
function ImageEnGrand({
  item,
  index,
  count,
  images,
  onChange,
  onMove,
  onRemove,
}: {
  item: GalleryItemDraft;
  index: number;
  count: number;
  images: Images;
  onChange: (patch: Partial<GalleryItemDraft>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const id = fieldId.galleryImage(index);
  return (
    <div role="group" class="image-en-grand" aria-labelledby={`${id}-nom`} data-testid="direction-message-image">
      <ImageChoix id={id} label={count > 1 ? `Image ${n}` : "Image"} slot={item.image} onChange={(image) => onChange({ image })} change {...images} />
      <Ligne id={fieldId.galleryDescription(index)} label="Description, lue par les lecteurs d'écran (facultative)" value={item.description} onChange={(description) => onChange({ description })} max={LIMITS.imageDescription} />
      <label class="flex min-h-11 items-center gap-3 font-semibold">
        <input type="checkbox" class="size-5" checked={item.spoiler} onChange={(e) => onChange({ spoiler: e.currentTarget.checked })} />
        Cachée jusqu'au clic (spoiler)
      </label>
      <div class="flex flex-wrap gap-2">
        {count > 1 && (
          <>
            <button type="button" class="btn btn-ghost" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Monter l'image ${n}`}>
              Monter
            </button>
            <button type="button" class="btn btn-ghost" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Descendre l'image ${n}`}>
              Descendre
            </button>
          </>
        )}
        <button type="button" class="btn btn-ghost" onClick={onRemove} aria-label={count > 1 ? `Retirer l'image ${n}` : undefined}>
          Retirer l'image
        </button>
      </div>
    </div>
  );
}

/** Les salons ajoutés pour les messages : les voir, en ajouter, en retirer. Ceux du robot et des appels ont leur rubrique. */
function GererSalons({ state, reload, onAdded }: { state: MessagesState; reload: () => Promise<unknown>; onAdded: (key: string) => void }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const added = state.salons.filter((s) => s.kind === "message");

  const act = async (action: () => Promise<unknown>, success: string): Promise<unknown> => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      const result = await action();
      setDone(success);
      await reload();
      return result;
    } catch (e) {
      setProblem(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const label = name.trim();
    // Le serveur refait chaque contrôle : ceux-ci évitent seulement un aller-retour.
    if (label === "" || Array.from(label).length > LIMITS.salonName) return setProblem(errorMessage("invalid_salon_name"));
    if (!isWebhookLink(link)) return setProblem(errorMessage("invalid_webhook"));
    const result = (await act(() => call<{ key?: string }>("add_discord_message_salon", { p_name: label, p_webhook: link.trim() }), `Salon « ${label} » ajouté : le lien est vérifié auprès de Discord, sans rien poster.`)) as { key?: string } | null;
    if (result) {
      setName("");
      setLink("");
      if (typeof result.key === "string") onAdded(result.key);
    }
  };

  return (
    <div class="grid gap-5">
      {added.length > 0 && (
        <ul class="grid gap-3">
          {added.map((salon) => {
            const check = checkSentence(salon);
            const failing = salon.checkStatus !== null && salon.checkStatus !== 0 && (salon.checkStatus < 200 || salon.checkStatus >= 300);
            return (
              <li key={salon.key} class="card grid gap-2 p-4" data-testid="direction-message-salon">
                <p class="font-semibold [overflow-wrap:anywhere]">{salon.name}</p>
                {check && <p class={failing ? "font-semibold text-warn" : "text-sm text-muted"}>{check}</p>}
                {salon.createdAt && (
                  <p class="tnum text-sm text-muted">
                    Ajouté le {fmtDateTime(salon.createdAt)}
                    {salon.createdBy ? ` par ${salon.createdBy}` : ""}.
                  </p>
                )}
                <div class="border-t border-line pt-3">
                  <SecondClic
                    id={`direction-message-salon-retirer-${salon.id}`}
                    label="Retirer ce salon"
                    confirm="Confirmer : retirer le salon"
                    warning="Le lien de son webhook est effacé du site. Les messages déjà postés restent dans Discord, mais ne se retirent plus d'ici."
                    busy={busy}
                    onConfirm={() => void act(() => call("remove_discord_message_salon", { p_id: salon.id }), `Salon « ${salon.name ?? ""} » retiré.`)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        class="grid gap-4"
        data-testid="direction-message-salon-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void add();
        }}
      >
        <Ligne id="dm-salon-nom" label="Nom du salon, pour le reconnaître ici" value={name} onChange={setName} max={LIMITS.salonName} placeholder="#annonces" />
        <div>
          <label for="dm-salon-lien" class="text-sm font-semibold">
            Lien du webhook du salon
          </label>
          <input id="dm-salon-lien" class="field mt-1" inputMode="url" autoComplete="off" spellcheck={false} placeholder="https://discord.com/api/webhooks/…" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
        </div>
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy || added.length >= LIMITS.salons}>
            Ajouter le salon
          </button>
        </div>
        <details class="text-sm">
          <summary class="cursor-pointer font-semibold">Où trouver le lien ?</summary>
          <p class="mt-2 text-muted">
            Dans Discord : Modifier le salon → Intégrations → Webhooks → Nouveau webhook, puis Copier l'URL du webhook. Le nom et l'image du webhook sont ceux du robot dans le salon. Le lien permet d'écrire dans le salon : ne le montrez à personne.
          </p>
        </details>
        <Problem message={problem} />
        {done && <Success message={done} />}
      </form>
    </div>
  );
}

function Envoye({ message, salons, busy, written, reuse, remove }: { message: SentMessage; salons: MessagesState["salons"]; busy: boolean; written: boolean; reuse: () => void; remove: () => void }) {
  const outcome = outcomeSentence(message.outcome);
  const removal = removeSentence(message, fmtDateTime) ?? blockedSentence(message);
  const refused = message.outcome.state === "refused" || message.outcome.state === "unsent" || message.outcome.state === "unreached";
  return (
    <li class="card grid gap-2 p-5" data-testid="direction-message-envoye">
      <p class="font-semibold [overflow-wrap:anywhere]">{messageSummary(message.message)}</p>
      <p class="tnum text-sm text-muted">
        {salonLabel(message.salon, salons, message.salonName)} · {fmtDateTime(message.at)}
        {message.by ? ` · ${message.by}` : ""}
      </p>
      {outcome && (
        <p role="status" class={refused ? "font-semibold text-warn" : undefined}>
          {outcome}
        </p>
      )}
      {removal && <p class="text-sm text-muted">{removal}</p>}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <Reprendre busy={busy} written={written} onConfirm={reuse} />
        {message.removable && (
          <div class="border-l border-line pl-4">
            <SecondClic
              id={`direction-message-retirer-${message.id}`}
              label="Retirer du salon"
              confirm="Confirmer : retirer du salon"
              warning="Le message est effacé du salon Discord, pour tout le monde. Il reste dans cette liste."
              busy={busy}
              onConfirm={remove}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/** « Reprendre » remplace le brouillon : au second clic s'il y a déjà quelque chose d'écrit. */
function Reprendre({ busy, written, onConfirm }: { busy: boolean; written: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div class="grid gap-2">
      <div>
        <button
          type="button"
          class="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (written && !armed) return setArmed(true);
            setArmed(false);
            onConfirm();
          }}
          onBlur={() => setArmed(false)}
        >
          {armed ? "Confirmer : remplacer le brouillon" : "Reprendre dans le formulaire"}
        </button>
      </div>
      {armed && <p class="text-sm text-warn">Le message en cours d'écriture sera remplacé par celui-ci.</p>}
    </div>
  );
}

/**
 * « Message Discord » : un admin ou le fondateur écrit un message avec des embeds et des images, et l'envoie dans un salon
 * du clan. Le serveur vérifie et refait tout (`send_discord_message`), puis le poste par le webhook du salon ; la page relit
 * ensuite la réponse de Discord. Les images partent d'abord dans l'espace public du serveur, au moment de l'envoi.
 */
export default function DirectionMessage() {
  const [state, setState] = useState<MessagesState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MessageDraft>(() => readSavedDraft() ?? emptyDraft());
  const files = useRef(new Map<string, File>());
  const previews = useRef(new Map<string, string>());
  // Les fichiers déjà déposés, partagés avec l'inventaire d'images : un fichier gardé dans l'inventaire ne repart pas à
  // l'envoi, ni un fichier envoyé quand on le garde ensuite.
  const inventaire = useInventaire();
  const uploaded = useRef(inventaire?.uploads ?? new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  // Après un envoi arrêté, la liste de ce qui manque se met à jour à chaque correction, et part quand tout est bon.
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [historyProblem, setHistoryProblem] = useState<string | null>(null);
  const [historyDone, setHistoryDone] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const now = useNow(30_000).getTime();

  const load = async (): Promise<MessagesState | null> => {
    try {
      const next = parseMessages(await call<unknown>("get_discord_messages"));
      if (next === null) {
        setLoadError("La réponse du serveur est illisible.");
        return null;
      }
      setState(next);
      setLoadError(null);
      return next;
    } catch (e) {
      setLoadError(messageOf(e));
      return null;
    }
  };

  const stopFollowing = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  // Après un envoi : quelques relectures, jusqu'à la réponse de Discord.
  const reload = async () => {
    const next = await load();
    if (!isMessageWaiting(next)) return;
    stopFollowing();
    timers.current = FOLLOW_UP_MS.map((ms) =>
      window.setTimeout(() => {
        void load().then((later) => {
          if (later !== null && !isMessageWaiting(later)) stopFollowing();
        });
      }, ms),
    );
  };

  useEffect(() => {
    void reload();
    const shown = previews.current;
    return () => {
      stopFollowing();
      for (const url of shown.values()) URL.revokeObjectURL(url);
    };
  }, []);

  // Le premier salon réglé, tant qu'aucun n'est choisi ou que le choisi n'existe plus.
  useEffect(() => {
    if (state && !state.salons.some((s) => s.key === draft.salon)) setDraft((d) => ({ ...d, salon: state.salons[0]?.key ?? "" }));
  }, [state]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(draft, uploaded.current), 400);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const images: Images = {
    addFile: (file) => {
      const type = file.type as keyof typeof IMAGE_TYPES;
      const id = `fichier-${nextKey()}`;
      files.current.set(id, file);
      previews.current.set(id, URL.createObjectURL(file));
      return { kind: "file", id, name: file.name || "image collée", size: file.size, type };
    },
    preview: (slot) => (slot.kind === "file" ? (previews.current.get(slot.id) ?? null) : slot.kind === "link" && isHttpsLink(slot.url) ? slot.url.trim() : null),
  };

  const patch = (change: Partial<MessageDraft>) => setDraft((d) => ({ ...d, ...change }));
  const patchEmbed = (i: number, change: Partial<EmbedDraft>) => setDraft((d) => ({ ...d, embeds: d.embeds.map((e, j) => (j === i ? { ...e, ...change } : e)) }));
  const moveEmbed = (i: number, to: number) =>
    setDraft((d) => {
      const embeds = [...d.embeds];
      const [moved] = embeds.splice(i, 1);
      if (moved) embeds.splice(to, 0, moved);
      return { ...d, embeds };
    });
  const copyEmbed = (i: number) =>
    setDraft((d) => {
      const source = d.embeds[i];
      if (!source || d.embeds.length >= LIMITS.embeds) return d;
      const copy: EmbedDraft = { ...source, key: nextKey(), fields: source.fields.map((f) => ({ ...f, key: nextKey() })) };
      return { ...d, embeds: [...d.embeds.slice(0, i + 1), copy, ...d.embeds.slice(i + 1)] };
    });
  // Passer aux images en grand offre tout de suite une place pour la première ; les embeds restent, cachés, et reviennent.
  const setMode = (mode: DraftMode) => setDraft((d) => ({ ...d, mode, gallery: mode === "images" && d.gallery.length === 0 ? [newGalleryItem()] : d.gallery }));
  const patchImage = (i: number, change: Partial<GalleryItemDraft>) => setDraft((d) => ({ ...d, gallery: d.gallery.map((g, j) => (j === i ? { ...g, ...change } : g)) }));
  const moveImage = (i: number, to: number) =>
    setDraft((d) => {
      const gallery = [...d.gallery];
      const [moved] = gallery.splice(i, 1);
      if (moved) gallery.splice(to, 0, moved);
      return { ...d, gallery };
    });

  const salons = state?.salons ?? [];

  const send = async () => {
    if (busy) return;
    const found = draftProblems(draft, salons.map((s) => s.key));
    setChecked(found.length > 0);
    setProblem(null);
    setDone(null);
    if (found[0]) return focusField(found[0].at);
    setBusy(true);
    try {
      const pending = draftFiles(draft).filter((slot) => !uploaded.current.has(slot.id));
      for (const [i, slot] of pending.entries()) {
        setStep(pending.length > 1 ? `Envoi des images : ${i + 1} sur ${pending.length}…` : "Envoi de l'image…");
        const file = files.current.get(slot.id);
        if (!file) throw new Error("fichier perdu");
        uploaded.current.set(slot.id, await uploadDiscordImage(file, IMAGE_TYPES[slot.type]));
      }
      setStep("Envoi du message…");
      const result = await call<{ sent?: boolean }>("send_discord_message", { p_salon: draft.salon, p_message: messageBody(draft, (id) => uploaded.current.get(id) ?? null) });
      if (result.sent === false) {
        // Le serveur a noté le message, mais pg_net n'a pas pu l'envoyer : le brouillon reste, pour réessayer.
        setProblem("Le message n'a pas pu partir du serveur vers Discord : le détail est dans « Derniers messages ». Le brouillon est gardé.");
        await reload();
        return;
      }
      const where = salonLabel(draft.salon, salons);
      // Le message envoyé quitte le formulaire ; l'autre liste, laissée de côté, reste avec ses fichiers : une bannière
      // envoyée en images en grand laisse ses embeds prêts pour le message suivant.
      const next = emptyDraft(draft.salon, draft.mode);
      const kept: MessageDraft = draft.mode === "images" ? { ...next, embeds: draft.embeds } : { ...next, gallery: draft.gallery };
      const keptFiles = new Set(draftFiles({ ...kept, mode: draft.mode === "images" ? "embeds" : "images" }).map((f) => f.id));
      setDraft(kept);
      setChecked(false);
      for (const [id, url] of previews.current) {
        if (keptFiles.has(id)) continue;
        URL.revokeObjectURL(url);
        previews.current.delete(id);
      }
      for (const id of [...files.current.keys()]) if (!keptFiles.has(id)) files.current.delete(id);
      setDone(`Message parti vers ${where.charAt(0).toLowerCase()}${where.slice(1)}. La réponse de Discord s'affiche dans « Derniers messages ».`);
      await reload();
    } catch (e) {
      setProblem(e instanceof Error && e.message === "fichier perdu" ? "Une image choisie n'est plus lisible : choisissez-la de nouveau." : messageOf(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const reuse = (message: SentMessage) => {
    setDraft(draftOfMessage(message.message, salons.some((s) => s.key === message.salon) ? message.salon : draft.salon));
    setChecked(false);
    setDone(null);
    setHistoryProblem(null);
    setHistoryDone("Message repris dans le formulaire, au-dessus : modifiez-le, puis envoyez-le de nouveau.");
    window.requestAnimationFrame(() => document.getElementById(fieldId.salon)?.focus());
  };

  const remove = async (message: SentMessage) => {
    setBusy(true);
    setHistoryProblem(null);
    setHistoryDone(null);
    try {
      await call("remove_discord_message", { p_id: message.id });
      setHistoryDone("Retrait demandé à Discord.");
      await reload();
    } catch (e) {
      setHistoryProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return loadError ? <Problem message={loadError} onRetry={() => void load()} /> : <Loading />;
  }

  const total = embedsLength(draft);
  const textTotal = galleryLength(draft);
  const problems = checked ? draftProblems(draft, salons.map((s) => s.key)) : [];
  const name = botName(draft, salons);

  return (
    <div class="grid gap-8" data-testid="direction-message">
      {loadError && <Problem message={loadError} onRetry={() => void load()} />}
      {inventaire?.problem && <Problem message={`Inventaire d'images illisible : ${inventaire.problem.charAt(0).toLowerCase()}${inventaire.problem.slice(1)}`} onRetry={() => void inventaire.reload()} />}
      {salons.length === 0 ? (
        <section class="card grid gap-4 p-5" aria-labelledby="dm-premier-salon">
          <h3 id="dm-premier-salon" class="text-lg">
            Ajouter un salon
          </h3>
          <p class="text-muted">Aucun salon n'est branché : ajoutez-en un, ou branchez celui du robot ou des appels dans leur rubrique.</p>
          <GererSalons state={state} reload={reload} onAdded={(salon) => patch({ salon })} />
        </section>
      ) : (
        // Pas de <form> autour du message : la touche Entrée dans un champ n'envoie rien. Seul le bouton envoie.
        <div class="message-grille" role="group" aria-label="Le message à envoyer" data-testid="direction-message-form">
          <div class="grid min-w-0 gap-6">
            <div class="grid gap-3">
              <div>
                <label for={fieldId.salon} class="text-sm font-semibold">
                  Salon
                </label>
                <select id={fieldId.salon} class="field mt-1" value={draft.salon} onChange={(e) => patch({ salon: e.currentTarget.value })}>
                  {salons.map((s) => (
                    <option key={s.key} value={s.key}>
                      {salonLabel(s.key, salons)}
                    </option>
                  ))}
                </select>
              </div>
              <div class="fold-list">
                <Repli title="Ajouter ou retirer un salon" startOpen={false}>
                  <GererSalons state={state} reload={reload} onAdded={(salon) => patch({ salon })} />
                </Repli>
              </div>
            </div>

            <TexteMisEnForme id={fieldId.content} label={`Texte du message, au-dessus des ${draft.mode === "images" ? "images" : "embeds"}`} value={draft.content} onChange={(content) => patch({ content })} max={LIMITS.content} rows={4} />

            <fieldset aria-describedby="dm-forme-aide" data-testid="direction-message-forme">
              <legend class="nom-champ text-sm font-semibold">Sous le texte</legend>
              <div class="mt-1 flex flex-wrap gap-x-6">
                {(
                  [
                    ["embeds", "Des embeds"],
                    ["images", "Des images en grand"],
                  ] as const
                ).map(([value, text]) => (
                  <label key={value} class="flex min-h-11 items-center gap-3">
                    <input type="radio" class="size-5" name="dm-forme" value={value} checked={draft.mode === value} onChange={() => setMode(value)} />
                    {text}
                  </label>
                ))}
              </div>
              <p id="dm-forme-aide" class="mt-1 text-sm text-muted">
                Dans un embed, Discord montre une image en petit. Pas les deux dans un même message.
              </p>
            </fieldset>

            {draft.mode === "images" ? (
              <>
                {draft.gallery.map((item, i) => (
                  <ImageEnGrand
                    key={item.key}
                    item={item}
                    index={i}
                    count={draft.gallery.length}
                    images={images}
                    onChange={(change) => patchImage(i, change)}
                    onMove={(to) => moveImage(i, to)}
                    onRemove={() => setDraft((d) => ({ ...d, gallery: d.gallery.filter((_, j) => j !== i) }))}
                  />
                ))}
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" class="btn btn-ghost" disabled={draft.gallery.length >= LIMITS.gallery} onClick={() => patch({ gallery: [...draft.gallery, newGalleryItem()] })}>
                    Ajouter une image
                  </button>
                  {draft.gallery.some((g) => g.description.trim() !== "") && (
                    <p class={`tnum text-sm ${textTotal > LIMITS.galleryText ? "font-semibold text-warn" : "text-muted"}`}>
                      Texte et descriptions : {fmtInt(textTotal)} / {fmtInt(LIMITS.galleryText)} caractères
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {draft.embeds.map((embed, i) => (
                  <EmbedEditeur
                    key={embed.key}
                    embed={embed}
                    index={i}
                    count={draft.embeds.length}
                    images={images}
                    onChange={(change) => patchEmbed(i, change)}
                    onMove={(to) => moveEmbed(i, to)}
                    onCopy={() => copyEmbed(i)}
                    onRemove={() => setDraft((d) => ({ ...d, embeds: d.embeds.filter((_, j) => j !== i) }))}
                  />
                ))}
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" class="btn btn-ghost" disabled={draft.embeds.length >= LIMITS.embeds} onClick={() => patch({ embeds: [...draft.embeds, newEmbed()] })}>
                    Ajouter un embed
                  </button>
                  {draft.embeds.length > 0 && (
                    <p class={`tnum text-sm ${total > LIMITS.total ? "font-semibold text-warn" : "text-muted"}`}>
                      Embeds : {fmtInt(total)} / {fmtInt(LIMITS.total)} caractères
                    </p>
                  )}
                </div>
              </>
            )}

            <div class="fold-list">
              <Repli title="Le robot et l'envoi : nom, photo, notifications, fil" startOpen={draft.username.trim() !== "" || draft.avatar.kind !== "none" || draft.notify !== "none" || draft.silent || draft.thread.trim() !== ""}>
                <Ligne id={fieldId.username} label="Nom du robot pour ce message" value={draft.username} onChange={(username) => patch({ username })} max={LIMITS.username} placeholder={salons.find((s) => s.key === draft.salon)?.webhookName ?? "Le nom du webhook"} />
                <ImageChoix id={fieldId.avatar} label="Photo du robot pour ce message" slot={draft.avatar} onChange={(avatar) => patch({ avatar })} {...images} />
                <div>
                  <label for="dm-notify" class="text-sm font-semibold">
                    Qui le message notifie
                  </label>
                  <select id="dm-notify" class="field mt-1" value={draft.notify} aria-describedby="dm-notify-aide" onChange={(e) => patch({ notify: e.currentTarget.value as Notify })}>
                    {(Object.keys(NOTIFY_LABELS) as Notify[]).map((notify) => (
                      <option key={notify} value={notify}>
                        {NOTIFY_LABELS[notify]}
                      </option>
                    ))}
                  </select>
                  <p id="dm-notify-aide" class="mt-1 text-sm text-muted">
                    Seules les mentions du texte du message notifient : dans un embed, elles s'affichent sans sonner.
                  </p>
                </div>
                <label class="flex min-h-11 items-center gap-3 font-semibold">
                  <input type="checkbox" class="size-5" checked={draft.silent} onChange={(e) => patch({ silent: e.currentTarget.checked })} />
                  Message silencieux : ni son ni notification sur les téléphones
                </label>
                <Ligne id={fieldId.thread} label="Nom du fil, pour un salon forum seulement" value={draft.thread} onChange={(thread) => patch({ thread })} max={LIMITS.thread} />
              </Repli>
            </div>
          </div>

          {/* Sur grand écran, l'aperçu défile dans son cadre : il prend le focus pour défiler au clavier. */}
          <div class="message-apercu grid gap-3" role="region" aria-labelledby="dm-apercu" tabIndex={0}>
            <h3 id="dm-apercu" class="text-lg">
              Aperçu
            </h3>
            <DiscordApercu draft={draft} name={name} url={images.preview} now={now} />
          </div>

          <div class="grid min-w-0 gap-4">
            {problems.length > 0 && (
              <div class="form-problem" role="alert" data-testid="direction-message-problemes">
                <p>Avant l'envoi :</p>
                <ul class="mt-1 grid list-disc gap-1 pl-5">
                  {problems.map((p) => (
                    <li key={`${p.at}-${p.message}`}>
                      <button type="button" class="text-left underline" onClick={() => focusField(p.at)}>
                        {p.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="grid gap-2">
                <div>
                  <button type="button" class="btn btn-primary btn-lg" disabled={busy} onClick={() => void send()} data-testid="direction-message-envoyer">
                    Envoyer le message
                  </button>
                </div>
                {step && (
                  <p role="status" class="text-muted">
                    {step}
                  </p>
                )}
              </div>
              {draftHasContent(draft) && (
                <SecondClic
                  id="direction-message-effacer"
                  label="Tout effacer"
                  confirm="Confirmer : tout effacer"
                  warning="Le texte, les embeds et les images choisies seront retirés du formulaire. Rien n'est envoyé."
                  busy={busy}
                  onConfirm={() => {
                    setDraft(emptyDraft(draft.salon, draft.mode));
                    setChecked(false);
                  }}
                />
              )}
            </div>
            <Problem message={problem} />
            {done && <Success message={done} />}
          </div>
        </div>
      )}

      {state.messages.length > 0 && (
        <section aria-labelledby="dm-derniers" class="grid gap-3">
          <h3 id="dm-derniers" class="text-lg">
            Derniers messages
          </h3>
          <Problem message={historyProblem} />
          {historyDone && <Success message={historyDone} />}
          <ul class="grid gap-3">
            {state.messages.map((message) => (
              <Envoye key={message.id} message={message} salons={salons} busy={busy} written={draftHasContent(draft)} reuse={() => reuse(message)} remove={() => void remove(message)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

