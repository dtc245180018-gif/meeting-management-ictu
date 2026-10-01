export const ICTU_TIME_ZONE = "Asia/Ho_Chi_Minh";

const ICTU_OFFSET = "+07:00";

export function ictuInputToIso(value: string): string {
  if (!value) return "";
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return new Date(`${withSeconds}${ICTU_OFFSET}`).toISOString();
}

function ictuParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ICTU_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function toIctuDateTimeInput(value: string): string {
  const parts = ictuParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatIctuDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: ICTU_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

export function formatIctuTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: ICTU_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatIctuDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: ICTU_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
