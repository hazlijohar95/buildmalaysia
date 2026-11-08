// Filter forms (a <form data-filters>): a changed menu applies at once, and empty fields stay out of the URL, so
// each list keeps the one address worker.ts caches. Without this script the form still submits with its button.

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.form?.hasAttribute("data-filters")) target.form.requestSubmit();
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-filters")) return;
  for (const field of form.elements) {
    if (
      (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
      field.name &&
      !field.value.trim()
    ) {
      field.disabled = true;
    }
  }
  // A page restored from the back/forward cache must show its fields usable again.
  addEventListener(
    "pageshow",
    () => {
      for (const field of form.elements) if ("disabled" in field) (field as HTMLInputElement).disabled = false;
    },
    { once: true },
  );
});
