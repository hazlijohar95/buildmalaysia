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
  unavailable: "Sign-up is not available yet. Try again soon.",
  invalid: "That does not look like a valid email address. Please try again.",
  busy: "Too many requests. Please wait a moment and try again.",
  retry: "Something went wrong on our end. Please try again.",
  "token-invalid": "That confirmation link is not valid.",
  "token-expired": "That confirmation link has expired. Submit your email again for a fresh one.",
};
