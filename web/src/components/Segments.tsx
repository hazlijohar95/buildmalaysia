import type { ReactNode } from "react";

export interface Segment {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Sibling sections that a phone shows one at a time behind a segmented control pinned under the header; from lg
 * they stack as before and the control is hidden. Every section is in the markup, so search engines and readers
 * without scripts get all of them (global.css and mobile.ts do the rest).
 */
export default function Segments({
  label,
  segments,
  initial = segments[0]?.id,
}: {
  label: string;
  segments: Segment[];
  /** The segment a phone opens on; the order of `segments` is the order on desktop. */
  initial?: string;
}) {
  return (
    <div data-segments>
      <div data-segment-control role="tablist" aria-label={label}>
        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`segment-${s.id}`}
            aria-controls={`segment-panel-${s.id}`}
            aria-selected={s.id === initial}
            data-segment-tab={s.id}
            className="tap"
          >
            {s.label}
          </button>
        ))}
      </div>
      {segments.map((s) => (
        <div
          key={s.id}
          id={`segment-panel-${s.id}`}
          data-segment-panel={s.id}
          data-current={s.id === initial ? "" : undefined}
        >
          {s.content}
        </div>
      ))}
    </div>
  );
}
