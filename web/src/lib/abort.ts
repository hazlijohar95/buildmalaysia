// A page loading its data can end the request early; src/middleware.ts turns these into the response.

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

export class PermanentRedirect extends Error {
  constructor(readonly location: string) {
    super(`Moved to ${location}`);
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

export function permanentRedirect(location: string): never {
  throw new PermanentRedirect(location);
}
