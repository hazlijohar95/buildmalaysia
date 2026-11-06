const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2020-03-10" -> "10 Mar 2020". */
export function formatDate(iso: string): string {
  return DAY_MONTH_YEAR.format(new Date(`${iso}T00:00:00Z`));
}
