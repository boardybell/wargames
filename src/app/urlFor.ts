/** Joins a project-relative asset path onto import.meta.env.BASE_URL.
 *  The ONLY sanctioned way to reference anything under public/. Handles
 *  leading-slash and no-slash inputs; never emits a double slash; pure
 *  string function with no DOM access. The no-raw-paths scanner is the
 *  mechanical teeth that keeps every asset URL flowing through here, so a
 *  subpath deployment (/wargames/) cannot silently break. Assumes Vite's
 *  guarantee that import.meta.env.BASE_URL always ends in a slash. */
export function urlFor(path: string): string {
  const base = import.meta.env.BASE_URL
  const baseNoTrailing = base.endsWith('/') ? base.slice(0, -1) : base
  const rel = path.startsWith('/') ? path.slice(1) : path
  return `${baseNoTrailing}/${rel}`
}
