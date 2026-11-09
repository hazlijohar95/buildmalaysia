import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import type { Observation } from "@/lib/contract-commentary";

/** The commentary: each observation with its tone, the reading behind it, other explanations and its formula. */
export default function Observations({ items }: { items: Observation[] }) {
  if (items.length === 0) return null;
  const questions = items.filter((o) => o.tone === "question");
  const context = items.filter((o) => o.tone === "context");
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {questions.length > 0 && <Group title="Worth asking about" items={questions} />}
      {context.length > 0 && <Group title="In context" items={context} />}
    </div>
  );
}

function Group({ title, items }: { title: string; items: Observation[] }) {
  return (
    <section>
      <h3 className={cn(kicker, "m-0 text-charcoal-700")}>
        {title} · {items.length}
      </h3>
      <ul role="list" className="m-0 mt-4 grid list-none gap-4 p-0">
        {items.map((o) => (
          <li
            key={o.id}
            className={cn(
              "border-2 border-foreground p-5 md:p-6",
              o.tone === "question" ? "border-l-[10px] border-l-merah-600 bg-copper-100" : "bg-background",
            )}
          >
            <p className="m-0 font-display text-lg font-semibold leading-snug md:text-xl">{o.headline}</p>
            {o.detail && <p className="m-0 mt-2 text-charcoal-800">{o.detail}</p>}
            {o.otherwise && (
              <p className="m-0 mt-3 text-sm text-charcoal-700">
                <span className="font-semibold text-foreground">Other explanations. </span>
                {o.otherwise}
              </p>
            )}
            <a href={`/contracts/method#${o.method}`} className={cn(kicker, "mt-4 inline-block text-charcoal-700")}>
              How this is worked out →
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
