/** Halloween season: open Oct 24 00:00 America/Chicago through Nov 1 12:00 America/Chicago. */

export const SEASON_TIMEZONE = "America/Chicago";

export type SeasonBounds = {
  /** Calendar year of this Halloween season (year of Oct 31). */
  year: number;
  openAt: Date;
  closeAt: Date;
};

/**
 * Convert a civil datetime in `timeZone` to a UTC Date.
 */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = SEASON_TIMEZONE,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = formatter.formatToParts(new Date(utcMillis));
    const get = (type: Intl.DateTimeFormatPartTypes): number => {
      const value = parts.find((p) => p.type === type)?.value;
      return value ? Number(value) : 0;
    };
    const asIfUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMillis += desired - asIfUtc;
  }
  return new Date(utcMillis);
}

export function seasonBoundsForYear(year: number): SeasonBounds {
  return {
    year,
    // Halloween − 7 days
    openAt: zonedLocalToUtc(year, 10, 24, 0, 0),
    // Day after Halloween + 12 hours → Nov 1 at noon
    closeAt: zonedLocalToUtc(year, 11, 1, 12, 0),
  };
}

/** Relevant season for `now`: current open season, or the next upcoming one. */
export function getSeasonBounds(now: Date = new Date()): SeasonBounds {
  const year = now.getFullYear();
  const thisYear = seasonBoundsForYear(year);
  if (now < thisYear.closeAt) {
    return thisYear;
  }
  return seasonBoundsForYear(year + 1);
}

export function isSeasonOpen(now: Date = new Date()): boolean {
  const year = now.getFullYear();
  const { openAt, closeAt } = seasonBoundsForYear(year);
  return now >= openAt && now < closeAt;
}

export function seasonStatus(now: Date = new Date()): {
  open: boolean;
  bounds: SeasonBounds;
} {
  const bounds = getSeasonBounds(now);
  return { open: isSeasonOpen(now), bounds };
}
