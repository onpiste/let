/** "10:36 PM" today, "Oct 29, 10:36 PM" this year, with the year before. */
function formatTime(at: number) {
  const date = new Date(at);
  const now = new Date();
  const time: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit"
  };
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, time);
  }
  return date.toLocaleString(undefined, {
    ...time,
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric"
  });
}

/** When the next message was sent, after a long gap in the conversation. */
export function TimeDivider({ at }: { at: number }) {
  return <div className="time-divider">{formatTime(at)}</div>;
}
