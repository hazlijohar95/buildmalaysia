import { CONTACT_EMAIL } from "@/lib/contact";

export type SubscribeStatus =
  | "sent"
  | "confirmed"
  | "unavailable"
  | "invalid"
  | "busy"
  | "retry"
  | "token-invalid"
  | "token-expired";

export const STATUS_COPY: Record<SubscribeStatus, string> = {
  sent: "Check your inbox for a confirmation link. It expires in 7 days.",
  confirmed: "You are subscribed. We will email you when new figures are loaded.",
  unavailable: `Email alerts are switched off right now. Check back later, or write to ${CONTACT_EMAIL}.`,
  invalid: "Enter an email address such as you@example.com.",
  busy: "Too many sign-ups from this network. Wait a minute, then try again.",
  retry: "Your sign-up didn't go through. Enter your email again, or reopen the link in your confirmation email.",
  "token-invalid": "That confirmation link is not valid. Open it again from your email, or get a new link.",
  "token-expired": "That confirmation link has expired. Links last 7 days.",
};
