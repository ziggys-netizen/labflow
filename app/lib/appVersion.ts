import packageJson from "../../package.json";

/** Package version at build time — do not hand-maintain a second copy. */
export const APP_VERSION: string = packageJson.version;

export function formatAppVersion(version: string = APP_VERSION): string {
  return version.startsWith("v") ? version : `v${version}`;
}

export function formatFooterBuildLine(
  version: string = APP_VERSION,
  clinicName?: string | null
): string {
  const label = formatAppVersion(version);
  const clinic = clinicName?.trim();
  return clinic ? `${label} · ${clinic}` : label;
}
