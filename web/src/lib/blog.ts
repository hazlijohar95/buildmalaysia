const WORDS_PER_MINUTE = 230;

interface Block {
  _type: string;
  children?: { text?: string }[];
}

/** Minutes to read a post's Portable Text body, at least one. Images and other blocks count for nothing. */
export function readingMinutes(content: readonly Block[] | undefined): number {
  const words = (content ?? [])
    .flatMap((block) => (block._type === "block" ? (block.children ?? []) : []))
    .map((span) => span.text ?? "")
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

interface CoverImage {
  src?: string;
  provider?: string;
  meta?: Record<string, unknown>;
}

/** The address of a post's cover, for link previews. EmDash stores a stored file's key, not its URL. */
export function coverUrl(cover: CoverImage | undefined): string | undefined {
  if (!cover) return undefined;
  if (cover.src) return cover.src;
  const key = cover.meta?.storageKey;
  if ((cover.provider ?? "local") === "local" && typeof key === "string") return `/_emdash/api/media/file/${key}`;
  return undefined;
}
