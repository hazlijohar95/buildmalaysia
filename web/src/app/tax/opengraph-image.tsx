import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";

export const alt = "Where your income tax goes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ kicker: "Your taxes", title: "Where your income tax goes" });
}
