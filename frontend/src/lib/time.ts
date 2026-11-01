/** 'YYYY-MM-DDTHH:mm' in the device's local time, for <input type="datetime-local">. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A habit's `days` ('0'–'6', Sunday first) as words: "Every day", "Weekdays", "Mon, Wed, Fri". */
export function daysLabel(days: string) {
  if (days.length === 7) return 'Every day';
  if (days === '12345') return 'Weekdays';
  if (days === '06') return 'Weekends';
  // Listed Monday first, the way a week reads.
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(String(d))).map((d) => DAY_NAMES[d]).join(', ');
}
