// The parameters of the public API and its MCP tools, declared once: the REST routes read them from the URL, the MCP
// tools from a call's arguments, and /developers and tools/list print them. Anything not declared is refused, so a
// misspelt parameter is an error rather than a filter silently left off.

export type ParamSpec =
  | { type: "integer"; description: string; min: number; max: number; required?: boolean; path?: boolean }
  | { type: "string"; description: string; maxLength: number; pattern?: RegExp; required?: boolean; path?: boolean }
  | { type: "enum"; description: string; values: readonly string[]; required?: boolean; path?: boolean };

export type Params = Record<string, string | number | undefined>;

export type Validated = { ok: true; params: Params } | { ok: false; parameter: string; message: string };

const CONTROL = /[\u0000-\u001f\u007f]/;

function one(name: string, spec: ParamSpec, raw: unknown): { value?: string | number; message?: string } {
  if (spec.type === "integer") {
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^-?\d{1,16}$/.test(raw.trim())
          ? Number(raw.trim())
          : NaN;
    if (!Number.isSafeInteger(n)) return { message: `${name} must be a whole number.` };
    if (n < spec.min || n > spec.max) return { message: `${name} must be between ${spec.min} and ${spec.max}.` };
    return { value: n };
  }
  if (typeof raw !== "string") return { message: `${name} must be a string.` };
  const text = raw.trim();
  if (spec.type === "enum") {
    if (!spec.values.includes(text)) return { message: `${name} must be one of: ${spec.values.join(", ")}.` };
    return { value: text };
  }
  if (CONTROL.test(text)) return { message: `${name} must not contain control characters.` };
  if (text.length > spec.maxLength) return { message: `${name} must be at most ${spec.maxLength} characters.` };
  if (spec.pattern && !spec.pattern.test(text)) return { message: `${name} is not in the expected form.` };
  return { value: text };
}

/** Checks `raw` against `specs`: every key declared, every required one present, every value in range. */
export function validate(specs: Record<string, ParamSpec>, raw: Record<string, unknown>): Validated {
  for (const key of Object.keys(raw)) {
    if (!(key in specs)) {
      const allowed = Object.keys(specs).filter((k) => !specs[k].path);
      return {
        ok: false,
        parameter: key,
        message: `Unknown parameter ${key}. ${allowed.length ? `Allowed: ${allowed.join(", ")}.` : "This takes none."}`,
      };
    }
  }
  const params: Params = {};
  for (const [name, spec] of Object.entries(specs)) {
    const value = raw[name];
    if (value === undefined || value === null || value === "") {
      if (spec.required) return { ok: false, parameter: name, message: `${name} is required.` };
      continue;
    }
    const checked = one(name, spec, value);
    if (checked.message) return { ok: false, parameter: name, message: checked.message };
    params[name] = checked.value;
  }
  return { ok: true, params };
}

/** A query string as a plain object; a parameter given twice is refused rather than one copy picked. */
export function fromQuery(search: URLSearchParams): Record<string, unknown> | { duplicate: string } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of search) {
    if (key in out) return { duplicate: key };
    out[key] = value;
  }
  return out;
}

/** The JSON Schema an MCP client is given for a tool's arguments. */
export function jsonSchema(specs: Record<string, ParamSpec>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    properties[name] =
      spec.type === "integer"
        ? { type: "integer", description: spec.description, minimum: spec.min, maximum: spec.max }
        : spec.type === "enum"
          ? { type: "string", description: spec.description, enum: [...spec.values] }
          : {
              type: "string",
              description: spec.description,
              maxLength: spec.maxLength,
              ...(spec.pattern ? { pattern: spec.pattern.source } : {}),
            };
  }
  const required = Object.entries(specs)
    .filter(([, s]) => s.required)
    .map(([n]) => n);
  return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}
