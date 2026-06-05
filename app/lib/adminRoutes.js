export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_SETUP_PATH = "/admin/setup";

export function normalizeAdminNextPath(value) {
  if (
    !value ||
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "";
  }

  return value;
}

export function safeAdminNextPath(value) {
  return normalizeAdminNextPath(value) || ADMIN_HOME_PATH;
}

export function getAdminNextParam(searchParams) {
  if (!searchParams) return "";

  if (typeof searchParams.get === "function") {
    return searchParams.get("next") || "";
  }

  const value = searchParams.next;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function withAdminNext(path, next) {
  const safeNext = normalizeAdminNextPath(next);
  return safeNext ? `${path}?next=${encodeURIComponent(safeNext)}` : path;
}

export function adminHomePath(next) {
  return withAdminNext(ADMIN_HOME_PATH, next);
}

export function adminSetupPath(next) {
  return withAdminNext(ADMIN_SETUP_PATH, next);
}
