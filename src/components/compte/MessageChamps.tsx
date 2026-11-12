import { useRef, useState } from "preact/hooks";
import { applyEditTo, codeBlockEdit, formatDiscordTime, insertEdit, linesEdit, linkEdit, mentionCode, timeCode, TIME_STYLES, wrapEdit, type Edit, type MentionKind, type Selection, type TimeStyle } from "../../lib/compte/discord-markdown";
import { imageFileProblem, textLength, type ImageSlot } from "../../lib/compte/discord-message";
import { fmtInt } from "../../lib/format";
import { frNumber } from "../../lib/nombre";

/**
 * Les champs du formulaire des messages Discord : un texte avec sa barre de mise en forme, le choix d'une image, et le
 * compte des caractères. La barre écrit la mise en forme de Discord dans le texte, là où est le curseur ; l'aperçu la
 * montre aussitôt.
 */

/** « 12 / 256 », en jaune au-delà de la limite. */
export function Compteur({ id, text, max }: { id: string; text: string; max: number }) {
  const n = textLength(text);
  return (
    <span id={id} class={`tnum text-sm ${n > max ? "font-semibold text-warn" : "text-muted"}`}>
      {fmtInt(n)} / {fmtInt(max)}
      {n > max && <span class="sr-only"> : trop long</span>}
    </span>
  );
}

/** Applique un changement au champ, en gardant l'annulation du navigateur (Ctrl+Z) quand il sait le faire. */
function applyEdit(el: HTMLTextAreaElement, edit: Edit, setValue: (value: string) => void) {
  const expected = applyEditTo(el.value, edit);
  el.focus();
  el.setSelectionRange(edit.from, edit.to);
  let inserted = false;
  try {
    // Seul moyen de garder Ctrl+Z après une insertion : la page reçoit l'événement `input` comme pour une frappe.
    inserted = document.execCommand("insertText", false, edit.text);
  } catch {
    inserted = false;
  }
  if (!inserted || el.value !== expected) {
    // Le champ a déjà sa valeur quand la page se redessine : elle n'y touche plus, et la sélection reste.
    el.value = expected;
    setValue(expected);
  }
  // Tout de suite, pas une image plus tard : un geste rapide qui suit ne doit pas être écrasé.
  el.setSelectionRange(edit.selStart, edit.selEnd);
}

type Outil = { id: string; label: string; aria: string; edit: (sel: Selection) => Edit; mark?: "b" | "i" | "u" | "s" };

const HEADING = /^#{1,3} /;
/** Ne reconnaît aucune ligne : la marque est toujours posée, à la place d'une autre. */
const NEVER = /(?!)/;
const nextHeading = (sel: Selection): Edit => {
  // Un clic : grand titre ; puis moyen, petit, et retour au texte simple.
  const from = sel.value.lastIndexOf("\n", sel.start - 1) + 1;
  const level = /^(#{1,3}) /.exec(sel.value.slice(from))?.[1]?.length ?? 0;
  if (level === 3) return linesEdit(sel, () => "", HEADING);
  return linesEdit(sel, () => `${"#".repeat(level + 1)} `, NEVER);
};

const INLINE_TOOLS: Outil[] = [
  { id: "gras", label: "Gras", aria: "Gras (Ctrl+B)", mark: "b", edit: (s) => wrapEdit(s, "**") },
  { id: "italique", label: "Italique", aria: "Italique (Ctrl+I)", mark: "i", edit: (s) => wrapEdit(s, "*") },
  { id: "souligne", label: "Souligné", aria: "Souligné (Ctrl+U)", mark: "u", edit: (s) => wrapEdit(s, "__") },
  { id: "barre", label: "Barré", aria: "Barré", mark: "s", edit: (s) => wrapEdit(s, "~~") },
  { id: "spoiler", label: "Spoiler", aria: "Spoiler : caché jusqu'au clic", edit: (s) => wrapEdit(s, "||") },
  { id: "code", label: "Code", aria: "Code dans la ligne", edit: (s) => wrapEdit(s, "`", "`", "code") },
];
const BLOCK_TOOLS: Outil[] = [
  { id: "titre", label: "Titre", aria: "Titre : grand, puis moyen, petit, et retour au texte", edit: nextHeading },
  { id: "sous-texte", label: "Sous-texte", aria: "Sous-texte, petit et gris", edit: (s) => linesEdit(s, () => "-# ", /^-# /) },
  { id: "citation", label: "Citation", aria: "Citation", edit: (s) => linesEdit(s, () => "> ", /^> /) },
  { id: "liste", label: "Liste à puces", aria: "Liste à puces", edit: (s) => linesEdit(s, () => "- ", /^[-*] /) },
  { id: "liste-1", label: "Liste numérotée", aria: "Liste numérotée", edit: (s) => linesEdit(s, (i) => `${i + 1}. `, /^[0-9]{1,9}\. /) },
  { id: "bloc", label: "Bloc de code", aria: "Bloc de code", edit: codeBlockEdit },
];
const LINK_TOOL: Outil = { id: "lien", label: "Lien", aria: "Lien sur un texte", edit: linkEdit };

/** Les outils d'un champ : `full` partout où Discord lit tout ; `field` sans titres (valeur d'un champ d'embed). */
export type Tools = "full" | "field";

const MENTION_KINDS: readonly { kind: MentionKind; label: string }[] = [
  { kind: "role", label: "Un rôle" },
  { kind: "user", label: "Un membre" },
  { kind: "channel", label: "Un salon" },
  { kind: "everyone", label: "@everyone" },
  { kind: "here", label: "@here" },
];

/** L'heure dans une heure, à la minute ronde : un point de départ pour le champ de l'outil « Heure ». */
function soon(): string {
  const date = new Date(Date.now() + 3_600_000);
  date.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

/** Un texte long avec sa barre de mise en forme. `max` : la limite de Discord, comptée sous le champ. */
export function TexteMisEnForme({
  id,
  label,
  value,
  onChange,
  max,
  rows = 5,
  tools = "full",
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  tools?: Tools;
  hint?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<"heure" | "mention" | null>(null);
  const [when, setWhen] = useState(soon);
  const [style, setStyle] = useState<TimeStyle>("f");
  const [kind, setKind] = useState<MentionKind>("role");
  const [mentionId, setMentionId] = useState("");
  const [mentionProblem, setMentionProblem] = useState<string | null>(null);

  const run = (edit: (sel: Selection) => Edit) => {
    const el = area.current;
    if (!el) return;
    applyEdit(el, edit({ value: el.value, start: el.selectionStart, end: el.selectionEnd }), onChange);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const tool = { b: INLINE_TOOLS[0], i: INLINE_TOOLS[1], u: INLINE_TOOLS[2] }[e.key.toLowerCase() as "b" | "i" | "u"];
    if (!tool) return;
    e.preventDefault();
    run(tool.edit);
  };

  const date = new Date(when);
  const whenOk = Number.isFinite(date.getTime());
  const insertTime = () => {
    if (!whenOk) return;
    run((sel) => insertEdit(sel, timeCode(date, style)));
    setPanel(null);
  };
  const insertMention = () => {
    const code = mentionCode(kind, mentionId);
    if (code === null) return setMentionProblem("Collez l'identifiant : un nombre de 17 à 20 chiffres.");
    setMentionProblem(null);
    run((sel) => insertEdit(sel, code));
    setPanel(null);
  };
  // Entrée dans un champ d'un panneau insère, comme son bouton.
  const enter = (e: KeyboardEvent, action: () => void) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    action();
  };
  const counter = `${id}-compte`;
  const blockTools = tools === "full" ? BLOCK_TOOLS : BLOCK_TOOLS.filter((t) => t.id !== "titre");

  return (
    <div class="grid gap-2">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4">
        <label for={id} class="text-sm font-semibold">
          {label}
        </label>
        <Compteur id={counter} text={value} max={max} />
      </div>
      {/* La barre agit sur le champ juste dessous, là où est le curseur. */}
      <div class="outils" role="group" aria-label={`Mise en forme : ${label}`}>
        {[...INLINE_TOOLS, ...blockTools, LINK_TOOL].map((tool) => (
          <button
            key={tool.id}
            type="button"
            class={`outil ${tool.mark ? `outil-${tool.mark}` : ""}`}
            aria-label={tool.aria}
            title={tool.aria}
            // Le champ garde sa sélection : un clic sur l'outil ne la lui retire pas.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(tool.edit)}
          >
            {tool.label}
          </button>
        ))}
        <button type="button" class="outil" aria-expanded={panel === "heure"} aria-controls={`${id}-heure`} onClick={() => setPanel(panel === "heure" ? null : "heure")}>
          Heure
        </button>
        <button type="button" class="outil" aria-expanded={panel === "mention"} aria-controls={`${id}-mention`} onClick={() => setPanel(panel === "mention" ? null : "mention")}>
          Mention
        </button>
      </div>
      {panel === "heure" && (
        <div id={`${id}-heure`} class="outil-panneau">
          <div>
            <label for={`${id}-heure-date`} class="text-sm font-semibold">
              Date et heure
            </label>
            <input id={`${id}-heure-date`} type="datetime-local" class="field mt-1" value={when} onInput={(e) => setWhen(e.currentTarget.value)} onKeyDown={(e) => enter(e, insertTime)} />
          </div>
          <div>
            <label for={`${id}-heure-style`} class="text-sm font-semibold">
              Affichage
            </label>
            <select id={`${id}-heure-style`} class="field mt-1" value={style} onChange={(e) => setStyle(e.currentTarget.value as TimeStyle)}>
              {TIME_STYLES.map((s) => (
                <option key={s.style} value={s.style}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p class="text-sm text-muted sm:col-span-2">Chacun la lit à l'heure de son appareil{whenOk ? ` : ${formatDiscordTime(Math.floor(date.getTime() / 1000), style, Date.now())}` : ""}.</p>
          <div class="sm:col-span-2">
            <button
              type="button"
              class="btn btn-ghost"
              disabled={!whenOk}
              onClick={insertTime}
            >
              Insérer l'heure
            </button>
          </div>
        </div>
      )}
      {panel === "mention" && (
        <div id={`${id}-mention`} class="outil-panneau">
          <div>
            <label for={`${id}-mention-type`} class="text-sm font-semibold">
              Mentionner
            </label>
            <select id={`${id}-mention-type`} class="field mt-1" value={kind} onChange={(e) => setKind(e.currentTarget.value as MentionKind)}>
              {MENTION_KINDS.map((m) => (
                <option key={m.kind} value={m.kind}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {kind !== "everyone" && kind !== "here" && (
            <div>
              <label for={`${id}-mention-id`} class="text-sm font-semibold">
                Identifiant
              </label>
              <input
                id={`${id}-mention-id`}
                class="field tnum mt-1"
                inputMode="numeric"
                autoComplete="off"
                spellcheck={false}
                placeholder="17 à 20 chiffres"
                aria-describedby={`${id}-mention-aide`}
                value={mentionId}
                onInput={(e) => setMentionId(e.currentTarget.value)}
                onKeyDown={(e) => enter(e, insertMention)}
              />
            </div>
          )}
          {kind !== "everyone" && kind !== "here" && (
            <p id={`${id}-mention-aide`} class="text-sm text-muted sm:col-span-2">
              Dans Discord, mode développeur activé : clic droit sur le rôle, le membre ou le salon, puis Copier l'identifiant.
            </p>
          )}
          <div class="sm:col-span-2">
            <button
              type="button"
              class="btn btn-ghost"
              onClick={insertMention}
            >
              Insérer la mention
            </button>
            {mentionProblem && (
              <p class="form-problem" role="alert">
                {mentionProblem}
              </p>
            )}
          </div>
        </div>
      )}
      <textarea
        ref={area}
        id={id}
        class="field"
        rows={rows}
        spellcheck
        aria-describedby={hint ? `${counter} ${id}-aide` : counter}
        value={value}
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {hint && (
        <p id={`${id}-aide`} class="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** « 1,2 Mo », « 340 Ko ». */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${frNumber({ maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} Mo`;
  return `${fmtInt(Math.max(1, Math.round(bytes / 1024)))} Ko`;
}

/**
 * Une image du message : un fichier choisi (bouton, glisser-déposer ou coller), ou l'adresse d'une image déjà en ligne.
 * Le fichier reste dans le navigateur jusqu'à l'envoi. `addFile` le garde et rend son emplacement, ou dit pourquoi il
 * ne convient pas.
 */
export function ImageChoix({
  id,
  label,
  slot,
  onChange,
  addFile,
  preview,
  change = false,
}: {
  id: string;
  label: string;
  slot: ImageSlot;
  onChange: (slot: ImageSlot) => void;
  addFile: (file: File) => ImageSlot | string;
  preview: (slot: ImageSlot) => string | null;
  /**
   * Vrai là où un autre bouton retire l'image : le bouton d'un fichier choisi devient « Changer d'image » et ouvre le
   * choix d'un autre fichier ; si on n'en choisit pas, l'image reste.
   */
  change?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const take = (file: File | null | undefined) => {
    if (!file) return;
    const issue = imageFileProblem(file);
    if (issue) return setProblem(issue);
    const added = addFile(file);
    if (typeof added === "string") return setProblem(added);
    setProblem(null);
    onChange(added);
  };

  const src = preview(slot);
  return (
    <div
      class={`image-choix ${over ? "image-choix-survol" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        e.preventDefault();
        take(file);
      }}
    >
      <p id={`${id}-nom`} class="nom-champ text-sm font-semibold">
        {label}
      </p>
      {slot.kind === "file" ? (
        <div class="mt-2 flex flex-wrap items-center gap-3">
          {src && <img src={src} alt="" class="image-choix-vignette" />}
          <p class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
            {slot.name} <span class="tnum text-muted">· {fileSize(slot.size)}</span>
          </p>
          <button type="button" id={id} class="btn btn-ghost" aria-describedby={`${id}-nom`} onClick={() => (change ? input.current?.click() : onChange({ kind: "none" }))}>
            {change ? "Changer d'image" : "Retirer l'image"}
          </button>
        </div>
      ) : (
        <div class="mt-2 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div>
            <button type="button" class="btn btn-ghost" aria-describedby={`${id}-nom`} onClick={() => input.current?.click()}>
              Choisir une image
            </button>
          </div>
          <div class="flex items-center gap-3">
            {src && <img src={src} alt="" class="image-choix-vignette" />}
            <input
              id={id}
              class="field"
              inputMode="url"
              autoComplete="off"
              spellcheck={false}
              placeholder="ou l'adresse d'une image : https://…"
              aria-label={`${label} : adresse en ligne`}
              value={slot.kind === "link" ? slot.url : ""}
              onInput={(e) => {
                const url = e.currentTarget.value;
                onChange(url.trim() === "" ? { kind: "none" } : { kind: "link", url });
              }}
              onPaste={(e) => {
                // Une capture d'écran collée devient le fichier de l'image.
                const file = e.clipboardData?.files[0];
                if (!file) return;
                e.preventDefault();
                take(file);
              }}
            />
          </div>
        </div>
      )}
      {/* Le choix d'un fichier, pour « Choisir une image » comme pour « Changer d'image ». */}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          take(e.currentTarget.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {problem && (
        <p class="form-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
