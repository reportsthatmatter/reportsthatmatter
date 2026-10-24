// The newsletter signup, answered in place (decision 0033). Without this script the form still works: it posts
// to /api/subscribe and the reader lands on /newsletter with the answer. With it, the reader stays where they are.
for (const form of document.querySelectorAll("form[data-signup]")) {
  const status = form.parentElement?.querySelector(".signup-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button) button.disabled = true;
    let message = "Sorry, we could not save that just now. Please try again in a few minutes.";
    let ok = false;
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
      });
      const answer = await response.json().catch(() => ({}));
      ok = response.ok;
      if (answer && typeof answer.message === "string") message = answer.message;
    } catch {
      // Offline or blocked: keep the generic message.
    }
    if (status) {
      status.textContent = message;
      status.classList.toggle("signup-status-error", !ok);
    }
    if (ok) form.reset();
    if (button) button.disabled = false;
  });
}
