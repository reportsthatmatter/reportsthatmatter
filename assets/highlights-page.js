/* The /highlights/yours page (bght.10.4; /highlights itself is the readers' page).
 *
 * Everything on it comes out of the reader's own browser. The export is the
 * part that matters: quote, source, printed page, permalink — a citation that
 * can be pasted into a draft, which is what these documents are for.
 */
// @ts-check
import { countingOff, createStore, setCounting, toJSON, toMarkdown } from "./highlights-store.js";

const container = document.getElementById("highlights");
const actions = document.getElementById("highlights-actions");
const store = createStore(window.localStorage);

if (container && actions) render();

// Counting on or off (decision 0023 Q4): a checkbox only a script can honour, so it is shown only by one.
const counting = /** @type {HTMLInputElement | null} */ (document.getElementById("count-marks"));
const countingLabel = document.getElementById("count-marks-label");
if (counting && countingLabel) {
  counting.checked = !countingOff(window.localStorage);
  countingLabel.hidden = false;
  counting.addEventListener("change", () => setCounting(window.localStorage, counting.checked));
}

function render() {
  const groups = store.byReport();
  if (!groups.length) return;

  container.innerHTML = "";
  actions.hidden = false;

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "highlight-group";

    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = `/reports/${group.report}`;
    link.textContent = group.title;
    heading.appendChild(link);
    section.appendChild(heading);

    for (const held of group.highlights) section.appendChild(entry(held));
    container.appendChild(section);
  }
}

/**
 * @param {any} held
 * @returns {HTMLElement}
 */
function entry(held) {
  const article = document.createElement("article");
  article.className = "highlight-entry";

  const quote = document.createElement("blockquote");
  quote.textContent = held.quote;
  article.appendChild(quote);

  const meta = document.createElement("p");
  meta.className = "highlight-meta mono";

  const where = [held.sectionTitle, held.page ? `at ${held.page}` : null]
    .filter(Boolean)
    .join(" · ");
  if (where) meta.appendChild(document.createTextNode(`${where} · `));

  const permalink = document.createElement("a");
  permalink.href = held.url;
  permalink.textContent = "Read in place";
  meta.appendChild(permalink);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "highlight-remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    store.remove(held.id);
    article.remove();
    if (!store.all().length) window.location.reload();
  });
  meta.appendChild(document.createTextNode(" · "));
  meta.appendChild(remove);

  article.appendChild(meta);
  return article;
}

actions?.addEventListener("click", (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest("button");
  if (!button) return;

  const format = button.getAttribute("data-export");
  const records = store.all();
  const text = format === "json" ? toJSON(records) : toMarkdown(records);

  const done = () => {
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, done);
  } else {
    done();
  }
});
