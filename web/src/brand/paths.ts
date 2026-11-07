// Where the brand downloads live. Kept apart from files.ts, which renders every file when it loads, so the layout
// can link the icons without building them.
export const brandFileUrl = (name: string) => `/brand/files/${name}`;

/** Every brand file in one folder, with a README of the colours, type and terms. */
export const BRAND_ZIP = "build-malaysia-brand.zip";
