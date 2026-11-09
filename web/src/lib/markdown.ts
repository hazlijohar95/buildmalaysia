// Turns a rendered page into Markdown, so every page has a Markdown form with no per-page template to keep in step.
//
// It reads the page's <main> the way a screen reader on a phone would: what is aria-hidden or hidden at phone width
// is left out (the short "RM 336.07 bn" is aria-hidden; its exact screen-reader twin is kept), while content a
// reader can reveal (a <details> body, a column behind a toggle) is kept. Navigation, forms, scripts and charts are
// dropped. Links keep their text and absolute URL, so a citation reads "[JANM 2025, p. 197](…pdf#page=211)".

interface Element {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
type Node = Element | string;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "wbr",
]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

const DROPPED_TAGS = new Set([
  "audio",
  "button",
  "canvas",
  "dialog",
  "form",
  "iframe",
  "label",
  "nav",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
  "video",
]);

const TEXT_INPUTS = new Set(["text", "number", "search", "email", "tel", "url"]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** The page as Markdown: a front matter block with its title, description and address, then its main content. */
export function htmlToMarkdown(html: string, pageUrl: URL): string {
  const root = parseHtml(html);
  const title = findFirst(root, "title");
  const description = findAll(root, "meta").find((m) => m.attrs.name === "description")?.attrs.content;
  const main = findFirst(root, "main") ?? findFirst(root, "body") ?? root;

  const front = [
    "---",
    title ? `title: ${JSON.stringify(collapse(textContent(title)))}` : null,
    description ? `description: ${JSON.stringify(description)}` : null,
    `url: ${JSON.stringify(pageUrl.href)}`,
    "---",
  ].filter((line) => line !== null);
  const body = renderBlocks(main, { base: pageUrl }).join("\n\n");
  return `${front.join("\n")}\n\n${body}\n`;
}

const TAG_OPEN = /<([a-zA-Z][a-zA-Z0-9:-]*)/y;
const ATTRIBUTE = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
const TAG_END = /\s*\/?>/y;

/** Parses the HTML the site renders (well-formed React and Astro output) into a tree; not a general HTML5 parser. */
function parseHtml(html: string): Element {
  const root: Element = { tag: "#root", attrs: {}, children: [] };
  const stack: Element[] = [root];
  const top = () => stack[stack.length - 1];
  const lower = html.toLowerCase();
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    const textEnd = lt === -1 ? html.length : lt;
    if (textEnd > i) top().children.push(decodeEntities(html.slice(i, textEnd)));
    if (lt === -1) break;

    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const close = html.indexOf(">", lt);
      i = close === -1 ? html.length : close + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      const close = html.indexOf(">", lt);
      const tag = html
        .slice(lt + 2, close === -1 ? html.length : close)
        .trim()
        .toLowerCase();
      const open = stack.findLastIndex((el) => el.tag === tag);
      if (open > 0) stack.length = open;
      i = close === -1 ? html.length : close + 1;
      continue;
    }

    TAG_OPEN.lastIndex = lt;
    const name = TAG_OPEN.exec(html);
    if (!name) {
      top().children.push("<");
      i = lt + 1;
      continue;
    }
    const element: Element = { tag: name[1].toLowerCase(), attrs: {}, children: [] };
    let at = TAG_OPEN.lastIndex;
    while (at < html.length) {
      TAG_END.lastIndex = at;
      if (TAG_END.exec(html)) {
        at = TAG_END.lastIndex;
        break;
      }
      ATTRIBUTE.lastIndex = at;
      const attribute = ATTRIBUTE.exec(html);
      if (!attribute) {
        at += 1;
        continue;
      }
      element.attrs[attribute[1].toLowerCase()] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
      at = ATTRIBUTE.lastIndex;
    }
    top().children.push(element);
    i = at;

    if (RAW_TEXT_TAGS.has(element.tag)) {
      const close = lower.indexOf(`</${element.tag}`, i);
      const end = close === -1 ? html.length : close;
      element.children.push(decodeEntities(html.slice(i, end)));
      const closeEnd = html.indexOf(">", end);
      i = closeEnd === -1 ? html.length : closeEnd + 1;
    } else if (!VOID_TAGS.has(element.tag)) {
      stack.push(element);
    }
  }
  return root;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function findAll(root: Element, tag: string): Element[] {
  const found: Element[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (typeof child === "string") continue;
      if (child.tag === tag) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

function findFirst(root: Element, tag: string): Element | undefined {
  return findAll(root, tag)[0];
}

function textContent(node: Node): string {
  return typeof node === "string" ? node : node.children.map(textContent).join("");
}

function classes(el: Element): string[] {
  return el.attrs.class ? el.attrs.class.split(/\s+/) : [];
}

// Tailwind display utilities that apply at the narrowest width: unprefixed, or under a max-* breakpoint.
function phoneDisplay(el: Element, values: ReadonlySet<string>): boolean {
  return classes(el).some((c) => values.has(c.startsWith("max-") ? c.slice(c.indexOf(":") + 1) : c));
}

const BLOCK_DISPLAY = new Set(["block", "flex", "grid", "table", "flow-root", "list-item"]);
const CHILDREN_APART = new Set(["flex", "grid", "inline-flex", "inline-grid"]);
const SHOWN =
  /^(?!(?:sm|md|lg|xl|2xl):)[^\s]+:(?:block|inline|inline-block|flex|inline-flex|grid|table|table-cell|table-row|contents)$/;

function isHidden(el: Element): boolean {
  if (DROPPED_TAGS.has(el.tag) || "hidden" in el.attrs || el.attrs["aria-hidden"] === "true") return true;
  const list = classes(el);
  if (list.some((c) => /^max-[^:]+:hidden$/.test(c))) return true;
  // `hidden` alone is hidden on a phone, unless a state (not a wider breakpoint) can show it.
  return list.includes("hidden") && !list.some((c) => SHOWN.test(c));
}

function displaysAsBlock(el: Element): boolean {
  return BLOCK_TAGS.has(el.tag) || phoneDisplay(el, BLOCK_DISPLAY);
}

// Flex and grid items are laid out apart, so text in adjacent items must not run together.
function setsChildrenApart(el: Element): boolean {
  return phoneDisplay(el, CHILDREN_APART);
}

// A horizontal margin is a visible gap: "RM 57.87 bn" and "B.63" side by side, with no space in the markup.
function hasSideMargin(el: Element): boolean {
  return classes(el).some((c) => /^(?:max-[^:]+:)?m[lrxse]-(?!0$)/.test(c));
}

const holdsBlocks = new WeakMap<Element, boolean>();

// An inline wrapper (a span, an island) around blocks is laid out as blocks; a link never is, it reads as one line.
function rendersAsBlocks(el: Element): boolean {
  if (el.tag === "a") return false;
  if (BLOCK_TAGS.has(el.tag)) return true;
  let known = holdsBlocks.get(el);
  if (known === undefined) {
    known = el.children.some((c) => typeof c !== "string" && !isHidden(c) && rendersAsBlocks(c));
    holdsBlocks.set(el, known);
  }
  return known;
}

interface Context {
  base: URL;
}

function renderBlocks(parent: Element, ctx: Context): string[] {
  const out: string[] = [];
  const gap = setsChildrenApart(parent) ? " " : "";
  let run = "";
  const flush = () => {
    const paragraph = escapeLineStart(collapse(run));
    if (paragraph) out.push(paragraph);
    run = "";
  };
  for (const node of parent.children) {
    if (typeof node === "string") {
      run += escapeText(node);
    } else if (isHidden(node)) {
      continue;
    } else if (rendersAsBlocks(node)) {
      flush();
      out.push(...renderBlock(node, ctx));
    } else {
      run += gap + renderInline(node, ctx);
    }
  }
  flush();
  return out;
}

function renderBlock(el: Element, ctx: Context): string[] {
  const heading = /^h([1-6])$/.exec(el.tag);
  if (heading) {
    const text = collapse(renderInlineChildren(el, ctx));
    return text ? [`${"#".repeat(Number(heading[1]))} ${text}`] : [];
  }
  switch (el.tag) {
    case "p":
    case "dt":
    case "summary":
    case "caption": {
      const text = collapse(renderInlineChildren(el, ctx));
      if (!text) return [];
      return [el.tag === "dt" ? `**${text}**` : escapeLineStart(text)];
    }
    case "ul":
    case "ol":
      return renderList(el, ctx);
    case "table":
      return renderTable(el, ctx);
    case "pre":
      return [`\`\`\`\n${textContent(el).replace(/\n$/, "")}\n\`\`\``];
    case "blockquote":
      return [prefixLines(renderBlocks(el, ctx).join("\n\n"), "> ", "> ")];
    case "hr":
      return ["---"];
    default:
      return renderBlocks(el, ctx);
  }
}

function renderList(list: Element, ctx: Context): string[] {
  const items = list.children.filter((c): c is Element => typeof c !== "string" && c.tag === "li" && !isHidden(c));
  const lines = items.map((item, n) => {
    const marker = list.tag === "ol" ? `${n + 1}. ` : "- ";
    const content = renderBlocks(item, ctx).join("\n\n");
    return prefixLines(content, marker, " ".repeat(marker.length));
  });
  return lines.length > 0 ? [lines.join("\n")] : [];
}

function renderTable(table: Element, ctx: Context): string[] {
  const rows: Element[] = [];
  const collectRows = (el: Element) => {
    for (const child of el.children) {
      if (typeof child === "string" || isHidden(child)) continue;
      if (child.tag === "tr") rows.push(child);
      else if (child.tag === "thead" || child.tag === "tbody" || child.tag === "tfoot") collectRows(child);
    }
  };
  collectRows(table);

  const cells = rows.map((row) =>
    row.children
      .filter((c): c is Element => typeof c !== "string" && (c.tag === "td" || c.tag === "th") && !isHidden(c))
      .flatMap((cell) => {
        const text = collapse(renderBlocks(cell, ctx).join(" ")).replace(/\|/g, "\\|");
        const span = Math.max(1, Number(cell.attrs.colspan) || 1);
        return [text, ...Array<string>(span - 1).fill("")];
      }),
  );
  const width = Math.max(0, ...cells.map((r) => r.length));
  if (width === 0) return [];

  const line = (r: string[]) => `| ${[...r, ...Array<string>(width - r.length).fill("")].join(" | ")} |`;
  const [header, ...body] = cells;
  const caption = table.children.find((c): c is Element => typeof c !== "string" && c.tag === "caption");
  const out = caption ? renderBlock(caption, ctx) : [];
  out.push([line(header), line(Array<string>(width).fill("---")), ...body.map(line)].join("\n"));
  return out;
}

function renderInlineChildren(el: Element, ctx: Context): string {
  const parts = el.children.map((child) => renderInline(child, ctx));
  return parts.join(setsChildrenApart(el) ? " " : "");
}

function renderInline(node: Node, ctx: Context): string {
  if (typeof node === "string") return escapeText(node);
  if (isHidden(node)) return "";
  switch (node.tag) {
    case "br":
      return " ";
    case "wbr":
      return "";
    case "a":
      return renderLink(node, ctx);
    case "strong":
    case "b":
      return wrap(renderInlineChildren(node, ctx), "**");
    case "em":
    case "i":
      return wrap(renderInlineChildren(node, ctx), "_");
    case "code":
      return wrap(textContent(node), "`");
    case "input":
      // A filled-in field reads as its value ("I earn RM 60,000 a year"); checkboxes, sliders and buttons say nothing.
      return TEXT_INPUTS.has(node.attrs.type ?? "text") ? escapeText(node.attrs.value ?? "") : "";
    case "img":
      return node.attrs.alt ? `![${escapeText(node.attrs.alt)}](${absolute(node.attrs.src ?? "", ctx)})` : "";
  }
  const inner = rendersAsBlocks(node) ? renderBlocks(node, ctx).join(" ") : renderInlineChildren(node, ctx);
  return displaysAsBlock(node) || hasSideMargin(node) ? ` ${inner} ` : inner;
}

function renderLink(a: Element, ctx: Context): string {
  const text = collapse(rendersAsBlocks(a) ? renderBlocks(a, ctx).join(" ") : renderInlineChildren(a, ctx));
  const href = a.attrs.href;
  if (!text) return "";
  if (href === undefined || href.startsWith("javascript:")) return text;
  return `[${text}](${absolute(href, ctx)})`;
}

function absolute(href: string, ctx: Context): string {
  try {
    return new URL(href, ctx.base).href.replace(/[()\s]/g, encodeURIComponent);
  } catch {
    return href;
  }
}

// Whitespace from the markup collapses as a browser would; a no-break space is content and stays.
function collapse(text: string): string {
  return text.replace(/[ \t\n\r\f]+/g, " ").trim();
}

function escapeText(text: string): string {
  return text.replace(/[\\*_`[\]]/g, "\\$&");
}

// A paragraph that starts like a heading, quote or list item would be read as one. A digit cannot be escaped, so a
// numbered item's marker is broken by escaping its "." or ")" instead: "2018\. Printed".
function escapeLineStart(text: string): string {
  if (/^\d+[.)] /.test(text)) return text.replace(/^(\d+)/, "$1\\");
  return /^(#|>|[-+*] )/.test(text) ? `\\${text}` : text;
}

// Emphasis markers must touch the text they wrap, so surrounding spaces move outside them.
function wrap(text: string, marker: string): string {
  const match = /^([ \t\n\r\f]*)([\s\S]*?)([ \t\n\r\f]*)$/.exec(text);
  if (!match || !match[2]) return text;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, n) => (n === 0 ? first : line ? rest : rest.trimEnd()) + line)
    .join("\n");
}
