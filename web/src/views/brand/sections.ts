// The sheet's sections, in page order. The contents grid, the section bar and its script all read this list.
export const SECTIONS = [
  { id: "construction", label: "Construction" },
  { id: "lockups", label: "Lockups" },
  { id: "misuse", label: "Misuse" },
  { id: "motion", label: "Motion" },
  { id: "colour", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "numbers", label: "Numbers" },
  { id: "charts", label: "Charts" },
  { id: "voice", label: "Name and voice" },
  { id: "previews", label: "Link previews" },
  { id: "files", label: "Files" },
  { id: "use", label: "Using the logo" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export const sectionNumber = (id: SectionId) => String(SECTIONS.findIndex((s) => s.id === id) + 1).padStart(2, "0");
