/** A message suitable for showing the user, from anything thrown. */
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
