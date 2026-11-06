// Phone-sized behaviour for the patterns in global.css's "Mobile" section. Every pattern is server-rendered in full
// and only rearranged here, so a page without this script still shows all of its content.

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Sheets: modal <dialog>s that slide up from the bottom (MobileNav.tsx). ----

const DISMISS_DISTANCE = 120; // px of downward drag that closes a sheet
const DISMISS_VELOCITY = 0.6; // px/ms of a flick that closes it however short
const FLICK_MIN = 24; // px a flick must travel, so a jittery tap on the grip never closes the sheet

function openSheet(sheet: HTMLDialogElement) {
  if (sheet.open) return;
  sheet.showModal();
  sheet.querySelectorAll<HTMLElement>(".year-strip").forEach(centreCurrent);
}

function setUpSheets() {
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const opener = target?.closest<HTMLElement>("[data-sheet-open]");
    if (opener) {
      const sheet = document.getElementById(opener.dataset.sheetOpen ?? "");
      if (sheet instanceof HTMLDialogElement) openSheet(sheet);
      return;
    }
    const closer = target?.closest("[data-sheet-close]")?.closest("dialog");
    if (closer) return closer.close();
    // A click on the dialog itself, not its body, landed on the backdrop.
    if (target instanceof HTMLDialogElement && target.matches("[data-sheet]")) target.close();
  });

  for (const sheet of document.querySelectorAll<HTMLDialogElement>("dialog[data-sheet]")) {
    const grip = sheet.querySelector<HTMLElement>("[data-sheet-grip]");
    if (!grip) continue;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest("button"))) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      grip.setPointerCapture(e.pointerId);
      sheet.style.transition = "none";
    });
    grip.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      // Dragging up past the rest position resists, as a native sheet does.
      sheet.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`;
      velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = e.clientY;
      lastT = e.timeStamp;
    });
    const release = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const dy = e.clientY - startY;
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (dy > DISMISS_DISTANCE || (velocity > DISMISS_VELOCITY && dy > FLICK_MIN)) sheet.close();
    };
    grip.addEventListener("pointerup", release);
    grip.addEventListener("pointercancel", release);
  }
}

// ---- Year strips: a row of year tabs that scrolls sideways, opened on the current year. ----

function centreCurrent(strip: HTMLElement) {
  const current = strip.querySelector<HTMLElement>("[aria-current]");
  if (!current || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollLeft = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
}

// ---- Long lists: the first rows, then "Show all". ----

function setUpCollapsibles() {
  document.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("[data-collapse-toggle]") : null;
    if (!button) return;
    const list = document.getElementById(button.getAttribute("aria-controls") ?? "");
    if (!list) return;
    const expand = button.getAttribute("aria-expanded") !== "true";
    list.toggleAttribute("data-expanded", expand);
    button.setAttribute("aria-expanded", String(expand));
    button.textContent = expand ? (button.dataset.labelOpen ?? "Show fewer") : (button.dataset.label ?? "Show all");
    // Collapsing from far down the list would leave the reader in whatever follows it.
    if (!expand && list.getBoundingClientRect().top < 0) {
      list.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    }
  });
}

// ---- Carousels: a sideways swipe through cards, with a position readout. ----

function setUpCarousels() {
  for (const carousel of document.querySelectorAll<HTMLElement>("[data-carousel]")) {
    const track = carousel.querySelector<HTMLElement>("[data-carousel-track]");
    const count = carousel.querySelector<HTMLElement>("[data-carousel-count]");
    const dots = [...carousel.querySelectorAll<HTMLButtonElement>("[data-carousel-dot]")];
    if (!track) continue;
    const slides = [...track.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    const show = (i: number) => {
      if (count) count.textContent = `${i + 1} / ${slides.length}`;
      dots.forEach((d, j) => d.setAttribute("aria-current", String(i === j)));
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) show(slides.indexOf(entry.target as HTMLElement));
      },
      { root: track, threshold: 0.6 },
    );
    slides.forEach((s) => observer.observe(s));
    dots.forEach((dot, i) =>
      dot.addEventListener("click", () =>
        track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: reduceMotion() ? "auto" : "smooth" }),
      ),
    );
    show(0);
  }
}

// ---- Segments: sibling sections behind a segmented control, one at a time below lg. ----

const belowLg = window.matchMedia("(max-width: 1023.98px)");

function setUpSegments() {
  const groups = [...document.querySelectorAll<HTMLElement>("[data-segments]")];
  const panelsOf = (group: HTMLElement) =>
    [...group.querySelectorAll<HTMLElement>("[data-segment-panel]")].filter(
      (p) => p.closest("[data-segments]") === group,
    );
  const select = (group: HTMLElement, id: string, focus = false) => {
    const tabs = [...group.querySelectorAll<HTMLButtonElement>("[data-segment-tab]")];
    const index = tabs.findIndex((t) => t.dataset.segmentTab === id);
    if (index < 0) return;
    group.style.setProperty("--seg-i", String(index));
    tabs.forEach((t, i) => {
      t.setAttribute("aria-selected", String(i === index));
      t.tabIndex = i === index ? 0 : -1;
    });
    panelsOf(group).forEach((panel) => panel.toggleAttribute("data-current", panel.dataset.segmentPanel === id));
    if (focus) tabs[index].focus();
  };
  // The panels are tab panels only while the control shows; from lg they are ordinary sections.
  const applyRoles = () => {
    for (const group of groups) {
      for (const panel of panelsOf(group)) {
        if (belowLg.matches) {
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", `segment-${panel.dataset.segmentPanel}`);
        } else {
          panel.removeAttribute("role");
          panel.removeAttribute("aria-labelledby");
        }
      }
    }
  };
  for (const group of groups) {
    const tabs = [...group.querySelectorAll<HTMLButtonElement>("[data-segment-tab]")];
    const control = group.querySelector<HTMLElement>("[data-segment-control]");
    group.style.setProperty("--seg-n", String(tabs.length));
    const initial = tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0];
    select(group, initial?.dataset.segmentTab ?? "");
    group.addEventListener("click", (e) => {
      const tab = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("[data-segment-tab]") : null;
      if (!tab || !group.contains(tab) || !control) return;
      select(group, tab.dataset.segmentTab ?? "");
      // A reader deep in one section starts the next at its top, not at the same depth.
      const stuckAt = parseFloat(getComputedStyle(control).top) || 0;
      const top = group.getBoundingClientRect().top;
      if (top < stuckAt) window.scrollTo({ top: window.scrollY + top - stuckAt });
    });
    group.addEventListener("keydown", (e) => {
      const tab = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("[data-segment-tab]") : null;
      if (!tab || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      const i = tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1);
      select(group, tabs[(i + tabs.length) % tabs.length].dataset.segmentTab ?? "", true);
    });
  }
  applyRoles();
  belowLg.addEventListener("change", applyRoles);
  // A link to an anchor inside a hidden segment opens that segment first.
  const followHash = () => {
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (target?.matches("[data-accordion] > div")) setOpenItem(target, true);
    const panel = target?.closest<HTMLElement>("[data-segment-panel]");
    const group = panel?.closest<HTMLElement>("[data-segments]");
    if (!panel || !group) return;
    select(group, panel.dataset.segmentPanel ?? "");
    target?.scrollIntoView();
  };
  followHash();
  window.addEventListener("hashchange", followHash);
}

// ---- Accordions: a definition list whose answers open one tap at a time below lg. ----

function setOpenItem(item: HTMLElement, open: boolean) {
  item.toggleAttribute("data-open", open);
  item.querySelector("dt > button")?.setAttribute("aria-expanded", String(open));
}

function setUpAccordions() {
  const terms = [...document.querySelectorAll<HTMLElement>("[data-accordion] > div > dt")];
  // Below lg each term's text moves into a button that opens its answer; from lg the term is plain text again.
  const apply = () => {
    for (const dt of terms) {
      const button = dt.querySelector<HTMLButtonElement>(":scope > button");
      if (belowLg.matches && !button) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "accordion-toggle";
        b.setAttribute("aria-expanded", String(dt.parentElement!.hasAttribute("data-open")));
        while (dt.firstChild) b.appendChild(dt.firstChild);
        dt.appendChild(b);
      } else if (!belowLg.matches && button) {
        while (button.firstChild) dt.insertBefore(button.firstChild, button);
        button.remove();
      }
    }
  };
  document.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest<HTMLElement>(".accordion-toggle") : null;
    const item = button?.closest<HTMLElement>("[data-accordion] > div");
    if (item) setOpenItem(item, !item.hasAttribute("data-open"));
  });
  apply();
  belowLg.addEventListener("change", apply);
}

// ---- Tables with several amount columns: one amount at a time, the full row in a sheet. ----

const MAX_METRICS = 8; // global.css has a rule per column index up to this
const PREFERRED_AMOUNT = /\b(actual|spent|sebenar)\b/i; // what a reader most often wants first

// A row's name as printed, Bahasa Malaysia included, without the screen-reader copies of its figures.
const rowText = (cell: Element) => {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};
// A column heading reads in English; its Bahasa Malaysia gloss sits under it in the table.
const headerLabel = (cell: Element) => {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll("[lang=ms], .sr-only").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};

function setUpMetricTables() {
  const sheet = document.getElementById("row-sheet");
  for (const table of document.querySelectorAll<HTMLTableElement>(".table-scroll > table")) {
    // React owns the markup inside an island; changing it would break hydration.
    if (table.closest("astro-island")) continue;
    const head = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!head || table.tHead!.rows.length > 1) continue;
    const width = head.cells.length;
    const body = [...table.tBodies].flatMap((b) => [...b.rows]);
    const foot = table.tFoot ? [...table.tFoot.rows] : [];
    const full = (r: HTMLTableRowElement) => r.cells.length === width;
    const first = body.find(full);
    if (!first) continue;
    const numeric = [...first.cells].flatMap((c, i) => (c.classList.contains("num") ? [i] : []));
    if (numeric.length < 2 || numeric.length > MAX_METRICS) continue;
    const textCols = [...first.cells].flatMap((c, i) => (c.classList.contains("num") ? [] : [i]));
    // A phone keeps the name (the text column with the most to say) and any bar chart; codes and sources move to
    // the row's sheet.
    const sample = body.filter(full).slice(0, 12);
    const textLength = (i: number) => sample.reduce((n, r) => n + (r.cells[i].textContent ?? "").trim().length, 0);
    const name = textCols.reduce((best, i) => (textLength(i) > textLength(best) ? i : best), textCols[0]);
    const keep = new Set(textCols.filter((i) => i === name || textLength(i) === 0));
    const labels = [...head.cells].map(headerLabel);
    const emphasised = numeric.findIndex((i) => /\bfont-(semibold|medium|bold)\b/.test(first.cells[i].className));
    const preferred = numeric.findIndex((i) => PREFERRED_AMOUNT.test(labels[i]));
    const initial = emphasised >= 0 ? emphasised : Math.max(preferred, 0);

    for (const row of [head, ...body, ...foot]) {
      if (!full(row)) continue;
      [...row.cells].forEach((cell, i) => {
        const m = numeric.indexOf(i);
        if (m >= 0) cell.dataset.m = String(m);
        else if (!keep.has(i)) cell.dataset.mHide = "";
      });
    }
    // A heading row spanning the table spans only what a phone shows.
    for (const row of [...body, ...foot]) {
      const cell = row.cells[0];
      if (row.cells.length !== 1 || cell.colSpan <= 1) continue;
      cell.dataset.spanWide = String(cell.colSpan); // as printed from md
      cell.dataset.spanNarrow = String(keep.size + 2); // the kept text, one amount and the details column
    }
    table.classList.add("metric-table");
    table.dataset.show = String(initial);
    collapseLongTable(table, body.filter(full).length);

    const control = document.createElement("div");
    control.className = "metric-switch";
    control.setAttribute("role", "group");
    control.setAttribute("aria-label", "Amount shown");
    numeric.forEach((col, m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tap";
      b.textContent = labels[col] || `Column ${col + 1}`;
      b.setAttribute("aria-pressed", String(m === initial));
      b.addEventListener("click", () => {
        table.dataset.show = String(m);
        control.querySelectorAll("button").forEach((x, j) => x.setAttribute("aria-pressed", String(j === m)));
      });
      control.appendChild(b);
    });
    const wrapper = table.parentElement!;
    wrapper.parentNode?.insertBefore(control, wrapper);

    if (!(sheet instanceof HTMLDialogElement)) continue;
    const infoHead = document.createElement("th");
    infoHead.className = "metric-info";
    infoHead.innerHTML = '<span class="sr-only">Details</span>';
    head.appendChild(infoHead);
    for (const row of [...body, ...foot]) {
      const named = full(row) && row.parentElement !== table.tFoot;
      const cell = document.createElement("td");
      cell.className = "metric-info";
      row.appendChild(cell);
      if (!named) continue;
      const rowName = rowText(row.cells[name] ?? row.cells[0]);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tap";
      button.setAttribute("aria-label", `Every figure for ${rowName}`);
      button.innerHTML = '<span aria-hidden="true">›</span>';
      button.addEventListener("click", () => showRow(sheet, rowName, labels, row));
      cell.appendChild(button);
    }
  }
}

const belowMd = window.matchMedia("(max-width: 767.98px)");
const applySpans = () =>
  document.querySelectorAll<HTMLTableCellElement>("[data-span-wide]").forEach((cell) => {
    cell.colSpan = Number(belowMd.matches ? cell.dataset.spanNarrow : cell.dataset.spanWide);
  });

const LONG_TABLE = 12; // rows past which a phone shows the first eight and a "Show all" button

let tableCount = 0;
function collapseLongTable(table: HTMLTableElement, rows: number) {
  const body = table.tBodies[0];
  if (table.tBodies.length !== 1 || rows <= LONG_TABLE) return;
  body.id ||= `long-table-${++tableCount}`;
  body.dataset.collapse = "";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tap collapse-toggle";
  button.dataset.collapseToggle = "";
  button.dataset.label = `Show all ${rows}`;
  button.setAttribute("aria-controls", body.id);
  button.setAttribute("aria-expanded", "false");
  button.textContent = button.dataset.label;
  const wrapper = table.parentElement!;
  wrapper.parentNode?.insertBefore(button, wrapper.nextSibling);
}

function showRow(sheet: HTMLDialogElement, name: string, labels: string[], row: HTMLTableRowElement) {
  const title = sheet.querySelector("h2");
  const scroll = sheet.querySelector(".sheet-scroll");
  if (!title || !scroll) return;
  title.textContent = name;
  const list = document.createElement("dl");
  list.className = "row-facts";
  [...row.cells].forEach((cell, i) => {
    if (cell.classList.contains("metric-info") || !labels[i]) return;
    const dt = document.createElement("dt");
    dt.textContent = labels[i];
    const dd = document.createElement("dd");
    dd.innerHTML = cell.innerHTML;
    if (cell.classList.contains("num")) dd.className = "num";
    list.appendChild(dt);
    list.appendChild(dd);
  });
  scroll.replaceChildren(list);
  openSheet(sheet);
}

setUpSheets();
setUpCollapsibles();
setUpCarousels();
setUpAccordions();
setUpSegments();
setUpMetricTables();
applySpans();
belowMd.addEventListener("change", applySpans);
document.querySelectorAll<HTMLElement>("main .year-nav").forEach(centreCurrent);
// Back restores a page from the back/forward cache with any sheet still open.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) document.querySelectorAll<HTMLDialogElement>("dialog[data-sheet][open]").forEach((d) => d.close());
});
// The head script hid the long tails assuming this script would run; this says it did.
document.documentElement.dataset.mobile = "ready";
