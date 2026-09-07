/** Header identity line. Uses existing displayName / username / role label only. */

export function formatHeaderName(
  displayName: string | null | undefined,
  username?: string | null
): string {
  const name = (displayName ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.toUpperCase();
    const initial = parts[0]![0]!;
    const last = parts[parts.length - 1]!;
    return `${initial}. ${last}`.toUpperCase();
  }
  const user = (username ?? "").trim();
  if (user) return user.toUpperCase();
  return "SET USERNAME";
}

export function formatHeaderIdentity(
  displayName: string | null | undefined,
  username: string | null | undefined,
  roleText: string | null | undefined
): string {
  const name = formatHeaderName(displayName, username);
  const role = (roleText ?? "").trim();
  if (!role || role === "—") return name;
  return `${name} · ${role.toUpperCase()}`;
}

/** Patients vs recycle bin must not light up together. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/patients") {
    return (
      pathname === "/patients" ||
      (pathname.startsWith("/patients/") && !pathname.startsWith("/patients/deleted"))
    );
  }
  if (href === "/patients/deleted") {
    return pathname === "/patients/deleted" || pathname.startsWith("/patients/deleted/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
