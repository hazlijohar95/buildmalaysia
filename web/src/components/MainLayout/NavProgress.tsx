"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A cached page arrives before this, so the bar only shows while an uncached page is being built. */
const SHOW_AFTER_MS = 150;
/** Long enough for the finish and fade in globals.css to play out. */
const FINISH_MS = 350;
/** Gives up on a navigation that never lands, such as one the browser cancelled. */
const GIVE_UP_MS = 15_000;

type State = "idle" | "pending" | "done";

/** Whether a click on this link will make the app router fetch another page. */
function startsNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (!link || link.hasAttribute("download")) return false;
  if (link.target && link.target !== "_self") return false;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname.endsWith(".csv")) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/**
 * The thin bar along the header's bottom rule while a clicked page loads. Pages that can 404 can't use a
 * loading.tsx (see PageLoading), so this watches link clicks and the URL instead of a loading boundary.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setRenderedState] = useState<State>("idle");
  const current = useRef<State>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setState = (next: State) => {
    current.current = next;
    setRenderedState(next);
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!startsNavigation(event)) return;
      clearTimers();
      setState("idle");
      timers.current.push(
        setTimeout(() => setState("pending"), SHOW_AFTER_MS),
        setTimeout(() => setState("idle"), GIVE_UP_MS),
      );
    };
    // Capture: next/link cancels the click's default (it routes on the client) before a bubbling listener runs.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    clearTimers();
    if (current.current !== "pending") {
      setState("idle");
      return;
    }
    setState("done");
    timers.current.push(setTimeout(() => setState("idle"), FINISH_MS));
  }, [pathname, searchParams]);

  return <div aria-hidden="true" className="nav-progress" data-state={state} />;
}
