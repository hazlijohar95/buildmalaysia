const PLANS: Record<string, string> = {
  "RMKe-11": "Eleventh Malaysia Plan (RMKe-11, 2016–2020)",
  "RMKe-12": "Twelfth Malaysia Plan (RMKe-12, 2021–2025)",
};

/** "RMKe-12" as a reader-facing name; an unknown plan is shown as printed. */
export function planName(plan: string): string {
  return PLANS[plan] ?? plan;
}
