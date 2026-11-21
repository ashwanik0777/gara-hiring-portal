/**
 * A full page load to `path`, replacing the current history entry. Used after signing out:
 * a client-side navigation would keep the pages already visited in memory (Next.js keeps them
 * mounted but hidden, with their state), so the sign-in screen could reopen at its old code step
 * and pressing Back could show a signed-in page. A full load starts from nothing.
 */
export function hardNavigate(path: string): void {
  window.location.replace(path);
}
