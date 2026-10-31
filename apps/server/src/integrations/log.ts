/**
 * A step that went fine, for `wrangler tail` and Workers Logs. Pushes go out
 * from alarms with nobody watching, so a push that never arrives leaves no
 * other trace of how far it got.
 */
export function logInfo(message: string) {
  // oxlint-disable-next-line no-console -- the one sanctioned info log; see above
  console.log(message);
}
