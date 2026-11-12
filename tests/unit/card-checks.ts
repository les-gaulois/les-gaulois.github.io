/**
 * Ce que partagent les tests des images du robot : une largeur approchée, pour tester une mise en page sans police, et le
 * contrôle qu'une image ne laisse rien déborder ni se chevaucher.
 */
import { expect } from "vitest";
import type { CardText, GazetteCard, Measure } from "../../src/lib/gazette-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
export const approx: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

/** Les espaces insécables des nombres français, construites par leur code : tapées, elles ne se verraient pas. */
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
export const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

/** Tous les textes de l'image, espaces insécables remplacées. */
export const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. `width` : la mesure de contrôle. */
export function expectClean(card: GazetteCard, width: Measure = approx): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - width(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - width(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + width(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
    expect(t.size, t.text).toBeGreaterThan(0);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      expect(rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a), `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of card.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
}
