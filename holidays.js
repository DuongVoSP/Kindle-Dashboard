// Vietnamese public holidays, downloaded once a year into data/holidays.json and
// read from that file the rest of the time.
"use strict";

var fs = require("fs");
var path = require("path");

var FILE = path.join(__dirname, "data", "holidays.json");
var ICS_URL = "https://calendar.google.com/calendar/ical/vi.vietnamese%23holiday%40group.v.calendar.google.com/public/basic.ics";

// The government publishes next year's days off in the autumn, so each year's
// download happens from 1 November and covers the following year too.
var DOWNLOAD_MONTH = 11;

// Paid holidays with a fixed date, so that the law applies even when the calendar
// lags behind it. Labour Code 2019 art. 112; 24/11 by Resolution 28/2026/QH16;
// 27/7 by the Labour Code amendment passed 21/11/2026 (in force 1/3/2027).
var FIXED = [
  { day: "01-01", name: "New Year", since: 0 },
  { day: "04-30", name: "Reunification Day", since: 0 },
  { day: "05-01", name: "Labour Day", since: 0 },
  { day: "07-27", name: "Martyrs' Day", since: 2027 },
  { day: "09-02", name: "National Day", since: 0 },
  { day: "11-24", name: "Culture Day", since: 2026 }
];

// Calendar titles -> short ASCII names (old Kindle fonts may lack Vietnamese letters).
var NAMES = [
  [/tết dương lịch/i, "New Year"],
  [/tết/i, "Lunar New Year"],
  [/giỗ tổ/i, "Hung Kings Day"],
  [/giải phóng/i, "Reunification Day"],
  [/quốc tế lao động/i, "Labour Day"],
  [/thương binh|tri ân/i, "Martyrs' Day"],
  [/quốc khánh/i, "National Day"],
  [/ngày văn h/i, "Culture Day"]
];

// Must all be found in a year before the download is trusted.
var REQUIRED = ["New Year", "Lunar New Year", "Hung Kings Day", "Reunification Day", "Labour Day", "National Day"];

function shortName(title) {
  for (var i = 0; i < NAMES.length; i++) if (NAMES[i][0].test(title)) return NAMES[i][1];
  // A holiday added by a later law: keep it, without diacritics.
  return title.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/[^\x20-\x7e]/g, "");
}

function field(event, name) {
  var m = event.match(new RegExp("^" + name + "(?:;[^:\\n]*)?:(.*)$", "m"));
  return m ? m[1].trim() : "";
}

// "20270204" -> "2027-02-04"
function isoDate(s) {
  return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
}

function addDays(iso, n) {
  var d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso) {
  var day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

// Days off of one year as [{ date, name }], sorted.
function parseYear(ics, year) {
  var byDate = {};
  ics
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("BEGIN:VEVENT")
    .slice(1)
    .forEach(function (event) {
      var start = field(event, "DTSTART");
      if (!/^\d{8}$/.test(start) || Number(start.slice(0, 4)) !== year) return;
      // Days off say "Ngày lễ"; observances and make-up work days say "Ngày lễ kỷ niệm".
      if (field(event, "DESCRIPTION") !== "Ngày lễ") return;
      var date = isoDate(start);
      var name = shortName(field(event, "SUMMARY"));
      if (name && !byDate[date]) byDate[date] = name;
    });
  FIXED.forEach(function (h) {
    if (year >= h.since) byDate[year + "-" + h.day] = h.name;
  });

  var days = Object.keys(byDate)
    .sort()
    .map(function (d) {
      return { date: d, name: byDate[d] };
    });
  REQUIRED.forEach(function (name) {
    var found = days.some(function (d) {
      return d.name === name;
    });
    if (!found) throw new Error(name + " " + year + " missing from holiday calendar");
  });
  return days;
}

// Joins days of one holiday into { start, end, name }; weekends in between count.
function group(days) {
  var out = [];
  days.forEach(function (d) {
    var last = null;
    for (var i = out.length - 1; i >= 0 && !last; i--) if (out[i].name === d.name) last = out[i];
    if (last) {
      var next = addDays(last.end, 1);
      while (next < d.date && isWeekend(next)) next = addDays(next, 1);
      if (next === d.date) {
        last.end = d.date;
        return;
      }
    }
    out.push({ start: d.date, end: d.date, name: d.name });
  });
  return out;
}

// Year of the latest download date that has passed.
function season(now) {
  return now.getMonth() + 1 >= DOWNLOAD_MONTH ? now.getFullYear() : now.getFullYear() - 1;
}

function readFile() {
  try {
    var saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(saved.holidays) ? saved : null;
  } catch (e) {
    if (e.code !== "ENOENT") console.error(new Date().toISOString() + " " + FILE + ": " + e.message);
    return null;
  }
}

function download(now) {
  return fetch(ICS_URL, { signal: AbortSignal.timeout(15000) })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function (ics) {
      var first = season(now);
      var days = parseYear(ics, first).concat(parseYear(ics, first + 1));
      // One year further, for the end of the list before the next download.
      try {
        days = days.concat(parseYear(ics, first + 2));
      } catch (e) {
        // not published yet
      }
      var saved = { season: first, downloaded: now.toISOString(), source: ICS_URL, holidays: group(days) };
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE + ".tmp", JSON.stringify(saved, null, 2) + "\n");
      fs.renameSync(FILE + ".tmp", FILE);
      console.log(now.toISOString() + " holidays downloaded for " + first + "-" + (first + 1));
      return saved;
    });
}

function load() {
  var now = new Date();
  var saved = readFile();
  if (saved && saved.season === season(now)) return Promise.resolve(saved.holidays);
  return download(now)
    .catch(function (e) {
      if (!saved) throw e;
      console.error(now.toISOString() + " holiday download failed, using saved file: " + e.message);
      return saved;
    })
    .then(function (s) {
      return s.holidays;
    });
}

// The saved list only, never downloads (used on each page load).
function read() {
  var saved = readFile();
  return saved ? saved.holidays : [];
}

module.exports = { load: load, read: read, parseYear: parseYear, group: group, season: season };
