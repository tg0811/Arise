/** 'YYYY-MM-DDTHH:mm' in the device's local time, for <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar day 'YYYY-MM-DD' stays that day; anything else is a timestamp, shown in local time. */
const toDate = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d));

/** Dates are always dd-mm-yyyy (owner's rule), e.g. 01-11-2026. */
export function formatDate(d: string | Date) {
  const x = toDate(d);
  return `${pad(x.getDate())}-${pad(x.getMonth() + 1)}-${x.getFullYear()}`;
}

export const weekdayName = (d: string | Date, style: 'long' | 'short' | 'narrow' = 'short') =>
  toDate(d).toLocaleDateString(undefined, { weekday: style });

/** "Sun 01-11-2026" (or "Sunday, 01-11-2026" with the long weekday). */
export const formatDay = (d: string | Date, style: 'long' | 'short' = 'short') =>
  `${weekdayName(d, style)}${style === 'long' ? ',' : ''} ${formatDate(d)}`;

/** "Mon 02-11-2026, 21:30": a moment, with the time in the device's usual format. */
export const formatDateTime = (d: string | Date) =>
  `${formatDay(d)}, ${toDate(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A habit's `days` ('0'–'6', Sunday first) as words: "Every day", "Weekdays", "Mon, Wed, Fri". */
export function daysLabel(days: string) {
  if (days.length === 7) return 'Every day';
  if (days === '12345') return 'Weekdays';
  if (days === '06') return 'Weekends';
  // Listed Monday first, the way a week reads.
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(String(d))).map((d) => DAY_NAMES[d]).join(', ');
}
