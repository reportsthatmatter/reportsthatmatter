/**
 * The name of a quote card: one per (paragraph, words), so a shared `?h=` link
 * previews with a card showing exactly the words it names (reportsthatmatter-f2e).
 *
 * The key is computed from what the Worker sees in the link: the `?h=` exact,
 * which a long selection carries abbreviated ("opening⋯closing"), with
 * whitespace and typographic variants folded the way `locate` folds them. The
 * build (`pnpm cards`, from the editor's highlights) and the route compute it
 * the same way, so a link that names the same words finds the same card. A
 * synchronous hash, because `shareImage` runs inside a synchronous render.
 */
import { decodeAnchor, encodeAnchor, foldText, normalise } from "../../assets/anchor.js";

/** FNV-1a, 32-bit, as 8 hex digits. Collisions only cost a wrong-but-real card at this scale; none today. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** `exact` as a `?h=` link carries it: abbreviated past MAX_EXACT, exactly as share.js and citationHref do. */
export function linkExact(exact: string): string {
  return decodeAnchor(encodeAnchor({ prefix: "", exact, suffix: "" }))?.exact ?? exact;
}

/** The card id for these words in this paragraph: `q-<8 hex>`, the file name under assets/cards/<report>/. */
export function quoteCardId(paragraph: string, exact: string): string {
  return `q-${fnv1a(`${paragraph}\n${foldText(normalise(linkExact(exact)))}`)}`;
}
