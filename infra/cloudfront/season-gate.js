// CloudFront Function (cloudfront-js-2.0): serve /off-season.html outside the Halloween window.
// Season (America/Chicago): Oct 24 00:00 → Nov 1 12:00.
// Keep in sync with shared/season.ts

function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  var count = 0;
  for (var day = 1; day <= 31; day++) {
    var dt = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
    if (dt.getUTCMonth() !== monthIndex) break;
    if (dt.getUTCDay() === weekday) {
      count += 1;
      if (count === n) return day;
    }
  }
  return 1;
}

// US DST (2007+): 2nd Sunday March → 1st Sunday November (02:00 local).
function isCentralDaylightTime(year, month /*1-12*/, day, hour) {
  var startDay = nthWeekdayOfMonth(year, 2, 0, 2);
  var endDay = nthWeekdayOfMonth(year, 10, 0, 1);
  if (month > 3 && month < 11) return true;
  if (month < 3 || month > 11) return false;
  if (month === 3) {
    if (day > startDay) return true;
    if (day < startDay) return false;
    return hour >= 2;
  }
  // month === 11
  if (day < endDay) return true;
  if (day > endDay) return false;
  return hour < 2;
}

function centralOffsetHours(year, month, day, hour) {
  return isCentralDaylightTime(year, month, day, hour) ? 5 : 6;
}

function centralToUtcMillis(year, month, day, hour, minute) {
  var offset = centralOffsetHours(year, month, day, hour);
  return Date.UTC(year, month - 1, day, hour + offset, minute, 0);
}

function seasonBoundsForYear(year) {
  return {
    openAt: centralToUtcMillis(year, 10, 24, 0, 0),
    closeAt: centralToUtcMillis(year, 11, 1, 12, 0),
  };
}

function isSeasonOpen(now) {
  var year = now.getUTCFullYear();
  // Check adjacent years near boundaries
  for (var y = year - 1; y <= year + 1; y++) {
    var b = seasonBoundsForYear(y);
    if (now.getTime() >= b.openAt && now.getTime() < b.closeAt) return true;
  }
  return false;
}

function isStaticAsset(uri) {
  if (uri === "/off-season.html") return true;
  if (uri.indexOf("/assets/") === 0) return true;
  return /\.[A-Za-z0-9]+$/.test(uri);
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (isStaticAsset(uri)) {
    return request;
  }

  if (!isSeasonOpen(new Date())) {
    request.uri = "/off-season.html";
  }

  return request;
}
