// The brand sheet's interactions. Each control is server-rendered and hidden until this runs, and every value it
// copies or file it downloads is also reachable without it.
import { aspectKey, makeCaption, makeName, makeUrl, parseMakeQuery, type MakeSpec } from "@/brand/make-spec";
import { SECTIONS } from "./sections";

const status = document.querySelector<HTMLElement>("[data-brand-status]");
const flashTimers = new WeakMap<Element, number>();

/** Shows `bubble` over `el` for a moment, and says `spoken` to screen readers. */
function flash(el: HTMLElement, bubble: string, spoken = bubble) {
  if (el.dataset.bubble !== bubble) {
    el.dataset.bubble = bubble;
    // A bubble drawn for the first time has no hidden style to fade from until one has been computed.
    void getComputedStyle(el, "::after").opacity;
  }
  el.toggleAttribute("data-copied", true);
  window.clearTimeout(flashTimers.get(el));
  flashTimers.set(
    el,
    window.setTimeout(() => el.removeAttribute("data-copied"), 1400),
  );
  if (!status) return;
  // Emptied first, so the same message twice in a row is still announced.
  status.textContent = "";
  requestAnimationFrame(() => (status.textContent = spoken));
}

/** False when the browser refuses; the caller then selects the value so it can be copied by hand. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function setUpCopy() {
  document.addEventListener("click", async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const value = target?.closest<HTMLElement>("[data-copy]");
    const link = target?.closest<HTMLAnchorElement>("[data-copy-link]");
    if (value) {
      const text = value.dataset.copy ?? "";
      if (await copyText(text)) return flash(value, "Copied", `Copied ${text}`);
      window.getSelection()?.selectAllChildren(value);
      flash(value, "Selected", `Couldn't copy ${text}; it is selected`);
    } else if (link && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      // A plain click copies the link; a modified one keeps its usual meaning, such as a new tab.
      e.preventDefault();
      const url = new URL(link.hash, window.location.href).href;
      history.replaceState(null, "", link.hash);
      const name = link.getAttribute("aria-label") ?? "Link";
      flash(link, (await copyText(url)) ? "Link copied" : "Couldn't copy", `${name} copied`);
    }
  });
}

/** Lazy images below the fold would print blank, so load and decode them all first. */
function loadAllImages(): Promise<unknown> {
  const lazy = [...document.querySelectorAll<HTMLImageElement>("img[loading=lazy]")];
  for (const img of lazy) img.loading = "eager";
  return Promise.allSettled(lazy.map((img) => img.decode()));
}

function setUpPrint() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-print]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      await loadAllImages();
      window.print();
    });
  }
  // Printing from the browser's own menu gets no wait, but starts the loads in case they finish in time.
  window.addEventListener("beforeprint", () => void loadAllImages());
}

function setUpClearSpace() {
  const button = document.querySelector<HTMLButtonElement>("[data-clearspace-toggle]");
  const grid = document.getElementById(button?.getAttribute("aria-controls") ?? "");
  if (!button || !grid) return;
  button.hidden = false;
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    grid.toggleAttribute("data-clearspace", on);
  });
}

const STEP_MS = 900;

function setUpMotion() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-motion]")) {
    const tile = button.closest<HTMLElement>("[data-motion-tile]");
    const logo = tile?.querySelector<SVGElement>(".carta");
    if (!tile || !logo) continue;
    button.hidden = false;
    let timer = 0;
    button.addEventListener("click", () => {
      if (button.dataset.motion === "step") {
        // The hover state, held for a beat and released, as a pointer passing over it would.
        tile.setAttribute("data-carta-active", "");
        window.clearTimeout(timer);
        timer = window.setTimeout(() => tile.removeAttribute("data-carta-active"), STEP_MS);
      } else {
        // Reading layout between removing and re-adding the attribute restarts the intro's animations.
        logo.removeAttribute("data-replay");
        logo.getBoundingClientRect();
        logo.setAttribute("data-replay", "");
      }
    });
  }
}

function setUpSectionBar() {
  const bar = document.querySelector<HTMLElement>("[data-brand-bar]");
  const contents = document.querySelector("[data-brand-contents]");
  const number = bar?.querySelector("[data-brand-bar-number]");
  const label = bar?.querySelector("[data-brand-bar-label]");
  if (!bar || !contents || !number || !label) return;
  bar.hidden = false;

  // Shown once the contents grid has scrolled up out of view, counting the part under the sticky header as out of
  // view; it would only repeat the grid while the grid can be seen.
  const header = document.querySelector("[data-site-header]")?.getBoundingClientRect().bottom ?? 0;
  new IntersectionObserver(
    ([entry]) => {
      bar.toggleAttribute("data-shown", !entry.isIntersecting && entry.boundingClientRect.top < header);
    },
    { rootMargin: `-${Math.round(header)}px 0px 0px 0px` },
  ).observe(contents);

  // The section in view is the one crossing a line a third of the way down the screen.
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = SECTIONS.findIndex((s) => s.id === entry.target.id);
        if (i < 0) continue;
        number.textContent = String(i + 1).padStart(2, "0");
        label.textContent = SECTIONS[i].label;
      }
    },
    { rootMargin: "-33% 0px -66% 0px" },
  );
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id);
    if (el) spy.observe(el);
  }

  // A section picked from the sheet closes it, so the page can scroll there.
  document.getElementById("brand-contents")?.addEventListener("click", (e) => {
    const sheet = e.currentTarget;
    if (e.target instanceof Element && e.target.closest("a[href^='#']") && sheet instanceof HTMLDialogElement) {
      sheet.close();
    }
  });
}

function setUpBuilder() {
  const form = document.querySelector<HTMLFormElement>("[data-builder]");
  const stage = form?.querySelector<HTMLElement>("[data-builder-stage]");
  const preview = form?.querySelector<HTMLImageElement>("[data-builder-preview]");
  const name = form?.querySelector<HTMLOutputElement>("[data-builder-name]");
  const widths = form?.querySelector<HTMLFieldSetElement>("#builder-width");
  if (!form || !stage || !preview || !name || !widths) return;
  const aspects: Record<string, number> = JSON.parse(form.dataset.aspects ?? "{}");

  // A disabled fieldset leaves its fields out of the form data, so the width is enabled or not from the format
  // before the spec is read; read the other way round, PNG after SVG would arrive with no width.
  const current = (): MakeSpec | null => {
    const format = form.querySelector<HTMLInputElement>("input[name=format]:checked")?.value;
    widths.disabled = format === "svg";
    const q = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string") q.set(key, value);
    return parseMakeQuery(q);
  };

  const update = () => {
    const spec = current();
    if (!spec) return;
    stage.dataset.ground = spec.ground;
    preview.src = makeUrl({ lockup: spec.lockup, ground: spec.ground, format: "svg" });
    name.textContent = makeCaption(spec, aspects[aspectKey(spec)] ?? 1);
  };

  form.addEventListener("change", update);
  form.addEventListener("submit", (e) => {
    const spec = current();
    if (!spec) return;
    e.preventDefault();
    const a = document.createElement("a");
    a.href = makeUrl(spec);
    a.download = makeName(spec);
    a.click();
  });
  update();
}

setUpCopy();
setUpPrint();
setUpClearSpace();
setUpMotion();
setUpSectionBar();
setUpBuilder();
