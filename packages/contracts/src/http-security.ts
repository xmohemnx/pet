/** Reject hidden files even when a proxy passes encoded path segments through. */
export function sensitivePath(pathname: string): boolean {
  let path = pathname;
  try {
    for (let n = 0; n < 3; n++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    return true;
  }
  return path
    .replaceAll('\\', '/')
    .split('/')
    .some(
      (part) =>
        part.startsWith('.') ||
        /^(?:node_modules|__tests__|package\.json|pnpm-lock\.yaml)$/i.test(
          part,
        ) ||
        /\.(?:pem|key|sql|dump|bak|backup|sqlite|log)$/i.test(part),
    );
}
