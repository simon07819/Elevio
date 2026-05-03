/** Single source of truth for app version. Read from package.json at build time. */
export const version: string = process.env.npm_package_version ?? "0.1.0";
