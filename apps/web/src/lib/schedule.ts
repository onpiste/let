// Turning the settings form's local times into the UTC schedules the server
// runs, and showing run times back in local time.

export type Repeat = "once" | "daily" | "weekdays" | "weekly" | "cron";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/**
 * A UTC cron expression for a local time of day ("HH:MM") on the given
 * local weekdays (0 = Sunday), or every day. Uses today's UTC offset, so a
 * daylight-saving change moves the run by an hour.
 */
export function localCron(time: string, days: number[] | null) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  // Converting to UTC can move the time into the day before or after.
  const shift = (at.getUTCDay() - at.getDay() + 7) % 7;
  const delta = shift === 6 ? -1 : shift;
  // Cron accepts the days in any order.
  const dow = days ? days.map((d) => (d + delta + 7) % 7).join(",") : "*";
  return `${at.getUTCMinutes()} ${at.getUTCHours()} * * ${dow}`;
}

/** A run time in the viewer's locale and time zone. */
export function formatRun(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
