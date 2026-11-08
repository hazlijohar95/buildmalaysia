// Filter forms (a <form data-filters>): a changed menu applies at once, and empty fields are left out of the
// submitted query, so each list keeps the one address worker.ts caches. The form still submits with its button
// when scripting is off; it just carries the empty fields then.

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.form?.hasAttribute("data-filters")) target.form.requestSubmit();
});

// Fires as the query is built for submission; dropping empty entries here keeps them out of the URL.
document.addEventListener("formdata", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-filters")) return;
  for (const [name, value] of [...event.formData]) {
    if (typeof value === "string" && !value.trim()) event.formData.delete(name);
  }
});
