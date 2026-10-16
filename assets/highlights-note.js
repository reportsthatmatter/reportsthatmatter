/* /highlights: one line for a reader who has saved passages in this browser,
 * pointing at their own list on /highlights/yours (bght.10.4). The only script
 * on the readers' page; without it the page loses nothing but this line.
 */
// @ts-check
import { createStore } from "./highlights-store.js";

const note = document.getElementById("highlights-yours-note");
let count = 0;
try {
  count = createStore(window.localStorage).all().length;
} catch (err) {
  /* storage blocked: nothing saved here to point at */
}
if (note && count > 0) {
  note.textContent = `You have ${count} saved passage${count === 1 ? "" : "s"} · `;
  const link = document.createElement("a");
  link.href = "/highlights/yours";
  link.textContent = "Yours";
  note.appendChild(link);
  note.hidden = false;
}
