/* Rescues an old link to a paragraph that now lives on a section page.
 *
 * A fragment never reaches the server, so a link shared before the report was
 * split — /reports/<id>#some-paragraph — lands on the contents page with no
 * such paragraph on it. The whole-report view has every paragraph, so send
 * them there and let the browser find it.
 *
 * Links carrying ?p= are routed server-side and never reach this.
 */
(function () {
  "use strict";

  var hash = window.location.hash.slice(1);
  if (!hash) return;
  if (document.getElementById(hash)) return;

  var path = window.location.pathname.replace(/\/$/, "");
  window.location.replace(path + "/full#" + hash);
})();
