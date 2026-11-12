import { useEffect, useMemo, useState } from "preact/hooks";
import { formatDiscordTime, parseBlocks, parseInline, READ_CONTENT, READ_DESCRIPTION, READ_FIELD_VALUE, READ_TITLE, type Block, type Inline, type ReadOptions } from "../../lib/compte/discord-markdown";
import { cleanText, dateIso, galleryShown, isHttpsLink, mosaicRows, type EmbedDraft, type GalleryItemDraft, type ImageSlot, type MessageDraft } from "../../lib/compte/discord-message";

/**
 * L'aperçu d'un message Discord de l'espace Direction : le texte, puis les embeds ou les images en grand, tels que Discord
 * les montrera, à peu près.
 * Il ne montre que ce qu'on a écrit ou choisi, rien d'autre. Les couleurs sont celles du site, pas celles de Discord :
 * l'aperçu montre la mise en page et la mise en forme, il n'imite pas l'application.
 */

/** L'adresse à montrer pour une image : celle collée, ou celle du fichier choisi, lue dans le navigateur. */
export type PreviewUrl = (slot: ImageSlot) => string | null;

function Inlines({ nodes, now }: { nodes: Inline[]; now: number }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.t) {
          case "text":
            return node.v;
          case "br":
            return <br key={i} />;
          case "b":
            return (
              <strong key={i}>
                <Inlines nodes={node.c} now={now} />
              </strong>
            );
          case "i":
            return (
              <em key={i}>
                <Inlines nodes={node.c} now={now} />
              </em>
            );
          case "u":
            return (
              <u key={i}>
                <Inlines nodes={node.c} now={now} />
              </u>
            );
          case "s":
            return (
              <s key={i}>
                <Inlines nodes={node.c} now={now} />
              </s>
            );
          case "spoiler":
            return (
              <span key={i} class="md-spoiler" title="Caché sur Discord jusqu'au clic">
                <Inlines nodes={node.c} now={now} />
              </span>
            );
          case "code":
            return (
              <code key={i} class="md-code">
                {node.v}
              </code>
            );
          case "link":
            // Le lien de l'aperçu s'ouvre à part, comme sur Discord : on ne quitte pas le formulaire.
            return (
              <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
                <Inlines nodes={node.c} now={now} />
              </a>
            );
          case "mention":
            return (
              <span key={i} class="md-mention" title={`Identifiant ${node.id}`}>
                {node.kind === "role" ? "@rôle" : node.kind === "user" ? "@membre" : "#salon"}
              </span>
            );
          case "everyone":
            return (
              <span key={i} class="md-mention">
                @everyone
              </span>
            );
          case "here":
            return (
              <span key={i} class="md-mention">
                @here
              </span>
            );
          case "time":
            return (
              <span key={i} class="md-time">
                {formatDiscordTime(node.unix, node.style, now)}
              </span>
            );
          case "emoji":
            return `:${node.name}:`;
        }
      })}
    </>
  );
}

function Blocks({ blocks, now }: { blocks: Block[]; now: number }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.t) {
          case "p":
            return (
              <p key={i} class="md-p">
                <Inlines nodes={block.c} now={now} />
              </p>
            );
          case "h":
            // Pas de vrai titre de page : ce n'en est pas un ici, et les titres du site sont en capitales.
            return (
              <p key={i} class={`md-h md-h${block.level}`}>
                <Inlines nodes={block.c} now={now} />
              </p>
            );
          case "sub":
            return (
              <p key={i} class="md-sub">
                <Inlines nodes={block.c} now={now} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={i} class="md-quote">
                <Blocks blocks={block.c} now={now} />
              </blockquote>
            );
          case "pre":
            return (
              <pre key={i} class="md-pre">
                <code>{block.v}</code>
              </pre>
            );
          case "list": {
            const items = block.items.map((item, j) => (
              <li key={j} style={item.depth > 0 ? { marginLeft: `${item.depth * 1.25}rem` } : undefined}>
                <Inlines nodes={item.c} now={now} />
              </li>
            ));
            return block.ordered ? (
              <ol key={i} class="md-list md-list-ol" start={block.start}>
                {items}
              </ol>
            ) : (
              <ul key={i} class="md-list">
                {items}
              </ul>
            );
          }
        }
      })}
    </>
  );
}

/** Un texte lu comme Discord le lit à cet endroit du message. */
export function Markdown({ text, read, now, inline = false }: { text: string; read: ReadOptions; now: number; inline?: boolean }) {
  const clean = cleanText(text);
  const blocks = useMemo(() => (inline ? null : parseBlocks(clean, read)), [clean, read, inline]);
  const nodes = useMemo(() => (inline ? parseInline(clean, read) : null), [clean, read, inline]);
  if (clean === "") return null;
  return nodes ? <Inlines nodes={nodes} now={now} /> : <Blocks blocks={blocks ?? []} now={now} />;
}

/** Une image de l'aperçu ; si elle ne se charge pas, une ligne le dit à sa place. */
function PreviewImage({ src, alt, class: className }: { src: string; alt: string; class: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return <span class={`${className} apercu-image-absente`}>Image illisible à cette adresse</span>;
  return <img src={src} alt={alt} class={className} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setBroken(true)} />;
}

function EmbedPreview({ embed, url, now }: { embed: EmbedDraft; url: PreviewUrl; now: number }) {
  const thumbnail = url(embed.thumbnail);
  const image = url(embed.image);
  const authorIcon = url(embed.authorIcon);
  const footerIcon = url(embed.footerIcon);
  const title = cleanText(embed.title);
  // Un lien n'est cliquable dans l'aperçu que s'il est en https, comme le serveur l'exige.
  const titleUrl = isHttpsLink(embed.url) ? cleanText(embed.url) : "";
  const author = cleanText(embed.authorName);
  const authorUrl = isHttpsLink(embed.authorUrl) ? cleanText(embed.authorUrl) : "";
  const footer = cleanText(embed.footerText);
  const iso = embed.time === "now" ? new Date(now).toISOString() : embed.time === "date" ? dateIso(embed.date) : null;
  const time = iso ? formatDiscordTime(Math.floor(Date.parse(iso) / 1000), "f", now) : null;
  // La couleur choisie est une donnée du message, comme la couleur d'un clan sur la carte.
  const style = embed.color ? { "--embed-couleur": embed.color } : undefined;
  return (
    <div class={`embed ${thumbnail ? "embed-avec-miniature" : ""}`} style={style}>
      <div class="embed-corps">
        {author && (
          <p class="embed-auteur">
            {authorIcon && <PreviewImage src={authorIcon} alt="" class="embed-auteur-icone" />}
            {authorUrl ? (
              <a href={authorUrl} target="_blank" rel="noopener noreferrer">
                {author}
              </a>
            ) : (
              <span>{author}</span>
            )}
          </p>
        )}
        {title && (
          <p class="embed-titre">
            {titleUrl ? (
              <a href={titleUrl} target="_blank" rel="noopener noreferrer">
                <Markdown text={title} read={READ_TITLE} now={now} inline />
              </a>
            ) : (
              <Markdown text={title} read={READ_TITLE} now={now} inline />
            )}
          </p>
        )}
        {cleanText(embed.description) && (
          <div class="embed-description">
            <Markdown text={embed.description} read={READ_DESCRIPTION} now={now} />
          </div>
        )}
        {embed.fields.length > 0 && (
          <div class="embed-champs">
            {embed.fields.map((field) => (
              <div key={field.key} class={field.inline ? "embed-champ embed-champ-ligne" : "embed-champ"}>
                <p class="embed-champ-nom">
                  <Markdown text={field.name} read={READ_TITLE} now={now} inline />
                </p>
                <div class="embed-champ-valeur">
                  <Markdown text={field.value} read={READ_FIELD_VALUE} now={now} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {thumbnail && <PreviewImage src={thumbnail} alt="Miniature de l'embed" class="embed-miniature" />}
      {image && <PreviewImage src={image} alt="Image de l'embed" class="embed-image" />}
      {(footer || time) && (
        <p class="embed-pied">
          {footer && footerIcon && <PreviewImage src={footerIcon} alt="" class="embed-pied-icone" />}
          {footer && <span>{footer}</span>}
          {footer && time && <span aria-hidden="true">•</span>}
          {time && <span>{time}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Les images en grand : comme les images d'un membre, sur toute la largeur du message ; à plusieurs, en rangées, chacune
 * rognée à sa case. La description sert de texte de remplacement, comme sur Discord.
 */
function Galerie({ items, url }: { items: GalleryItemDraft[]; url: PreviewUrl }) {
  const shown = items.flatMap((item) => {
    const src = url(item.image);
    return src ? [{ item, src }] : [];
  });
  if (shown.length === 0) return null;
  // Six colonnes : une image seule les prend toutes, deux en prennent trois chacune, trois en prennent deux.
  const spans = mosaicRows(shown.length).flatMap((row) => Array.from({ length: row }, () => 6 / row));
  return (
    <div class={`apercu-galerie ${shown.length === 1 ? "apercu-galerie-seule" : ""}`} data-testid="direction-message-apercu-galerie">
      {shown.map(({ item, src }, i) => (
        <div key={item.key} class={`apercu-galerie-case ${item.spoiler ? "apercu-spoiler" : ""}`} style={{ gridColumn: `span ${spans[i] ?? 6}` }}>
          <PreviewImage src={src} alt={cleanText(item.description) || (shown.length > 1 ? `Image en grand ${i + 1}` : "Image en grand")} class="apercu-galerie-image" />
          {item.spoiler && <span class="apercu-spoiler-mot">Spoiler</span>}
        </div>
      ))}
    </div>
  );
}

/** L'aperçu entier : le robot, son nom, le texte puis les embeds, ou les images en grand. */
export default function DiscordApercu({ draft, name, url, now }: { draft: MessageDraft; name: string; url: PreviewUrl; now: number }) {
  const avatar = url(draft.avatar);
  const content = cleanText(draft.content);
  const images = draft.mode === "images";
  const shown = images ? [] : draft.embeds.filter((e) => cleanText(e.title) || cleanText(e.description) || e.fields.length || e.image.kind !== "none" || e.thumbnail.kind !== "none" || cleanText(e.authorName) || cleanText(e.footerText));
  const gallery = images ? galleryShown(draft) : [];
  const empty = content === "" && shown.length === 0 && gallery.length === 0;
  const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now);
  return (
    <div class="apercu" data-testid="direction-message-apercu">
      <div class="apercu-avatar" aria-hidden="true">
        {avatar ? <PreviewImage src={avatar} alt="" class="apercu-avatar-image" /> : <span>{(Array.from(name)[0] ?? "?").toUpperCase()}</span>}
      </div>
      <div class="min-w-0">
        <p class="apercu-tete">
          <span class="apercu-nom">{name}</span>
          <span class="apercu-badge">Robot</span>
          <span class="apercu-heure tnum">Aujourd'hui à {clock}</span>
        </p>
        {draft.thread.trim() && <p class="apercu-fil">Nouveau fil : {cleanText(draft.thread)}</p>}
        {!empty && (
          <div class="apercu-corps">
            {content && (
              <div class="apercu-texte">
                <Markdown text={content} read={READ_CONTENT} now={now} />
              </div>
            )}
            {shown.map((embed) => (
              <EmbedPreview key={embed.key} embed={embed} url={url} now={now} />
            ))}
            {images && <Galerie items={gallery} url={url} />}
          </div>
        )}
      </div>
    </div>
  );
}
