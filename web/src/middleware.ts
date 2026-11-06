import { defineMiddleware } from "astro:middleware";
import { NotFoundError, PermanentRedirect } from "@/lib/abort";

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof NotFoundError) return context.rewrite("/404");
    if (error instanceof PermanentRedirect) return context.redirect(error.location, 308);
    throw error;
  }
});
