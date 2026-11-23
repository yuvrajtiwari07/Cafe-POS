/**
 * Local calendar & business-day date utilities (YYYY-MM-DD in device local timezone).
 * Supports per-cafe operating hours including overnight shifts (e.g. 4:00 PM – 6:00 AM next day),
 * grouping all transactions within a shift onto the opening calendar date.
 */

export const DEFAULT_OPENING_TIME = '00:00';
export const DEFAULT_CLOSING_TIME = '23:59';

export function getLocalDateStr(input?: Date | string): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToLocalDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return getLocalDateStr();
  const date = new Date(y, m - 1, d + deltaDays);
  return getLocalDateStr(date);
}

export function formatHumanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortHumanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

export function parseTimeToMinutes(timeStr?: string, fallbackMinutes = 0): number {
  if (!timeStr || typeof timeStr !== 'string') return fallbackMinutes;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return fallbackMinutes;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return fallbackMinutes;
  }
  return hh * 60 + mm;
}

/**
 * Returns true if the cafe's operating hours cross midnight (e.g. 16:00 -> 06:00)
 * or represent a 24h cycle rolling over at a non-midnight hour (e.g. 06:00 -> 06:00).
 * Special case: closing at 00:00 when opening > 00:00 means closing at midnight end-of-day (24:00), not overnight.
 */
export function isOvernightShift(openingTime?: string, closingTime?: string): boolean {
  const openMin = parseTimeToMinutes(openingTime, 0);
  const rawCloseMin = parseTimeToMinutes(closingTime, 1439);

  if (openMin === 0 && rawCloseMin >= 1439) return false;
  if (openMin === 0 && rawCloseMin === 0) return false;

  // Closing at 00:00 with daytime/evening opening means end-of-day midnight (24:00)
  const effectiveCloseMin = rawCloseMin === 0 && openMin > 0 ? 1440 : rawCloseMin;
  return openMin >= effectiveCloseMin;
}

/**
 * Maps a timestamp to its cafe Business Date (YYYY-MM-DD).
 * For overnight shifts (e.g. 16:00 open, 06:00 close), timestamps between 00:00 and 05:59 AM
 * belong to the previous calendar day's business shift.
 */
export function getBusinessDateStr(
  input?: Date | string,
  openingTime?: string,
  closingTime?: string
): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (isNaN(d.getTime())) {
    return getBusinessDateStr(new Date(), openingTime, closingTime);
  }

  const calDate = getLocalDateStr(d);
  if (!isOvernightShift(openingTime, closingTime)) {
    return calDate;
  }

  const closeMin = parseTimeToMinutes(closingTime, 1439);
  const currentMin = d.getHours() * 60 + d.getMinutes();

  if (currentMin < closeMin) {
    return addDaysToLocalDateStr(calDate, -1);
  }
  return calDate;
}

export function getCurrentBusinessDateStr(openingTime?: string, closingTime?: string): string {
  return getBusinessDateStr(new Date(), openingTime, closingTime);
}

export function formatTime12h(timeStr?: string, fallback = '12:00 AM'): string {
  if (!timeStr) return fallback;
  const mins = parseTimeToMinutes(timeStr, -1);
  if (mins < 0) return fallback;
  const hh24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const period = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(mm).padStart(2, '0')} ${period}`;
}

export function formatBusinessDayRange(
  businessDateStr: string,
  openingTime?: string,
  closingTime?: string
): string {
  const open = openingTime || DEFAULT_OPENING_TIME;
  const close = closingTime || DEFAULT_CLOSING_TIME;
  const overnight = isOvernightShift(open, close);
  const openLabel = formatTime12h(open, '12:00 AM');
  const closeLabel = formatTime12h(close, '11:59 PM');

  if (overnight) {
    const nextDate = addDaysToLocalDateStr(businessDateStr, 1);
    return `${formatShortHumanDate(businessDateStr)}, ${openLabel} – ${formatShortHumanDate(nextDate)}, ${closeLabel}`;
  }

  if (close === '00:00' && parseTimeToMinutes(open, 0) > 0) {
    return `${formatShortHumanDate(businessDateStr)}, ${openLabel} – Midnight`;
  }

  return `${formatShortHumanDate(businessDateStr)}, ${openLabel} – ${closeLabel}`;
}
