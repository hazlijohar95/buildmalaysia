// Areas that scroll sideways (wide tables, the bar chart, the phone carousel) take keyboard focus while they overflow
// and hold nothing focusable of their own, so the arrow keys can scroll them. Elsewhere they stay out of the tab order.

const SELECTOR = ".table-scroll, [data-carousel-track], [data-scroll-x]";
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** A name for the area: the one it was given, its table's caption, its chart's label, or the heading it sits under. */
function label(area: HTMLElement): string {
  if (area.dataset.scrollLabel) return area.dataset.scrollLabel;
  const own =
    area.querySelector("caption")?.textContent ?? area.querySelector("svg[aria-label]")?.getAttribute("aria-label");
  if (own?.trim()) return own.trim();
  for (let node: Element | null = area; node && node !== document.body; node = node.parentElement) {
    for (let before = node.previousElementSibling; before; before = before.previousElementSibling) {
      const heading = before.matches("h2, h3") ? before : before.querySelector("h2, h3");
      if (heading?.textContent?.trim()) return heading.textContent.trim();
    }
  }
  return "Scrollable content";
}

function update() {
  for (const area of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const needsFocus = area.scrollWidth > area.clientWidth + 1 && !area.querySelector(FOCUSABLE);
    if (needsFocus === area.hasAttribute("data-scroll-focus")) continue;
    // A figure keeps its own role; anything else becomes a named region.
    const role = area.tagName === "FIGURE" ? null : "region";
    if (needsFocus) {
      area.dataset.scrollFocus = "";
      area.tabIndex = 0;
      if (role) area.setAttribute("role", role);
      area.setAttribute("aria-label", label(area));
    } else {
      delete area.dataset.scrollFocus;
      area.removeAttribute("tabindex");
      if (role) area.removeAttribute("role");
      area.removeAttribute("aria-label");
    }
  }
}

let frame = 0;
const schedule = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(update);
};
// After load: mobile.ts reshapes some tables for phones first.
addEventListener("load", schedule);
addEventListener("resize", schedule);
