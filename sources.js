// Fetches everything the dashboard shows on a schedule and saves it to files.
// Runs on the Mac, because the Kindle browser (WebKit 531) has no fetch/Promise
// and outdated TLS.
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var execFile = require("child_process").execFile;
var holidays = require("./holidays");

var CITY = "Ho Chi Minh City";
var STOCKS = ["POW", "HSG", "BSR"];
var CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), ".local/bin/claude");

var MINUTE = 60 * 1000;

function get(url) {
  return fetch(url, { signal: AbortSignal.timeout(15000) }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  });
}

function getJson(url) {
  return get(url).then(function (res) {
    return res.json();
  });
}

function number(v) {
  var n = v === null || v === undefined || v === "" ? NaN : Number(v);
  if (!isFinite(n)) throw new Error("not a number: " + v);
  return n;
}

// ---- weather (Open-Meteo) --------------------------------------------------

var place = null;

function findPlace() {
  if (place) return Promise.resolve(place);
  return getJson(
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + encodeURIComponent(CITY)
  ).then(function (geo) {
    if (!geo.results || !geo.results.length) throw new Error("city not found");
    place = geo.results[0];
    return place;
  });
}

// WMO weather codes
function weatherText(c) {
  if (c === 0) return "Clear";
  if (c === 1) return "Mainly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if (c === 45 || c === 48) return "Fog";
  if (c >= 51 && c <= 55) return "Drizzle";
  if (c === 56 || c === 57) return "Freezing drizzle";
  if (c >= 61 && c <= 65) return "Rain";
  if (c === 66 || c === 67) return "Freezing rain";
  if (c >= 71 && c <= 77) return "Snow";
  if (c >= 80 && c <= 82) return "Rain showers";
  if (c === 85 || c === 86) return "Snow showers";
  if (c === 95) return "Thunderstorm";
  if (c === 96 || c === 99) return "Thunderstorm, hail";
  return "";
}

function loadWeather() {
  return findPlace()
    .then(function (p) {
      return getJson(
        "https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&timezone=auto&latitude=" +
          p.latitude + "&longitude=" + p.longitude
      );
    })
    .then(function (wx) {
      return {
        temp: Math.round(number(wx.current.temperature_2m)),
        text: weatherText(wx.current.weather_code),
        place: place.name
      };
    });
}

// ---- stocks (Stockbiz, price in thousand VND) --------------------------------

function parseStock(html, code) {
  function quote(field) {
    var m = html.match(new RegExp("<span quote='" + field + "' symbol='" + code + "'>([^<]*)</span>"));
    return m ? m[1].trim() : "";
  }
  var price = quote("L");
  if (!/^[\d.,]+$/.test(price)) throw new Error(code + " price not found");
  var change = quote("CAP").split("/"); // "-0.05/-0.24%"
  return { code: code, price: price, change: change.length === 2 ? change[1] : "" };
}

function loadStock(code) {
  return get("http://en.stockbiz.vn/Stocks/" + code + "/LookupQuote.aspx")
    .then(function (res) {
      return res.text();
    })
    .then(function (html) {
      return parseStock(html, code);
    });
}

// ---- market ------------------------------------------------------------------

function loadGold() {
  return getJson("https://www.vang.today/api/prices?type=SJL1L10").then(function (d) {
    if (d.success !== true) throw new Error("no data");
    return { buy: number(d.buy), sell: number(d.sell) };
  });
}

function loadUsd() {
  return getJson("https://cdn.moneyconvert.net/api/latest.json").then(function (d) {
    return number(d.rates.VND);
  });
}

// ---- Claude usage ---------------------------------------------------------------
// `claude -p /usage` is a local command: it uses the CLI's own login and
// spends no tokens. Only the percentages below reach the page.

// "Nov 23 at 7:40pm (Asia/Saigon)" -> "7:40pm" if that is today, else "Nov 23 7:40pm"
function shortReset(text, now) {
  if (!text) return "";
  var s = text.replace(/\s*\([^)]*\)\s*$/, "").replace(" at ", " ");
  var today = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return s.indexOf(today + " ") === 0 ? s.slice(today.length + 1) : s;
}

function parseUsage(text, now) {
  function find(label) {
    var m = text.match(new RegExp("^" + label + ": (\\d+(?:\\.\\d+)?)% used(?: · resets (.+))?$", "m"));
    return m ? { percent: Number(m[1]), resets: shortReset(m[2], now) } : null;
  }
  var usage = { session: find("Current session"), week: find("Current week \\(all models\\)") };
  if (!usage.session && !usage.week) throw new Error("unrecognised /usage output: " + text.slice(0, 200));
  return usage;
}

function loadClaude() {
  return new Promise(function (resolve, reject) {
    var args = ["-p", "/usage", "--output-format", "json", "--safe-mode", "--strict-mcp-config", "--no-session-persistence"];
    var child = execFile(CLAUDE_BIN, args, { cwd: os.tmpdir(), timeout: 30000 }, function (err, stdout) {
      if (err) return reject(err);
      try {
        resolve(parseUsage(String(JSON.parse(stdout).result || ""), new Date()));
      } catch (e) {
        reject(e);
      }
    });
    if (child.stdin) child.stdin.end();
  });
}


// ---- collector ---------------------------------------------------------------------
// Every minute the server requests every source (holidays excepted, see below), then:
// - overwrites data/latest.log with the last successful value of each source
//   (never an error). Page loads only read this file.
// - appends one line to data/logs/YYYY-MM-DD.log with this minute's results,
//   errors included. A new file starts each day.

var DATA_DIR = path.join(__dirname, "data");
var LATEST_FILE = path.join(DATA_DIR, "latest.log");
var LOG_DIR = path.join(DATA_DIR, "logs");
var LOG_DAYS = 30; // daily log files kept
var CYCLE_SECOND = 20; // each cycle starts at this second, so it ends before the page reloads at :01

var DAY = 24 * 60 * MINUTE;
var OLD_MS = 3 * MINUTE; // a value this old (two missed minutes) is listed as old data

// keep: how long a value is still shown after its last success.
var SOURCES = {
  Weather: { keep: 3 * 60 * MINUTE, load: loadWeather },
  Gold: { keep: DAY, load: loadGold },
  USD: { keep: DAY, load: loadUsd },
  Claude: { keep: 60 * MINUTE, load: loadClaude }
};
STOCKS.forEach(function (code) {
  SOURCES[code] = {
    keep: DAY,
    load: function () {
      return loadStock(code);
    }
  };
});

function localDate(d) {
  function two(n) {
    return (n < 10 ? "0" : "") + n;
  }
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}

function readLatestSync() {
  try {
    return JSON.parse(fs.readFileSync(LATEST_FILE, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(new Date().toISOString() + " " + LATEST_FILE + ": " + e.message);
    return null;
  }
}

// Last success of each source: name -> { value, at (ISO) }. Seeded from the
// file so a restart keeps the last values.
var latest = {};
(function seed() {
  var saved = readLatestSync();
  Object.keys(SOURCES).forEach(function (n) {
    var s = saved && saved.sources && saved.sources[n];
    if (s && s.at) latest[n] = { value: s.value, at: s.at };
  });
})();

function writeAtomic(file, text) {
  fs.writeFileSync(file + ".tmp", text);
  fs.renameSync(file + ".tmp", file);
}

var prunedOn = "";
function pruneLogs(today) {
  if (prunedOn === today) return;
  prunedOn = today;
  var cutoff = localDate(new Date(Date.now() - LOG_DAYS * DAY));
  fs.readdirSync(LOG_DIR).forEach(function (f) {
    var m = f.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
    if (m && m[1] < cutoff) fs.unlinkSync(path.join(LOG_DIR, f));
  });
}

var running = false;

function collect() {
  if (running) return Promise.resolve();
  running = true;
  var names = Object.keys(SOURCES);
  // This minute's results, name -> { ok, value | error, at }
  var results = {};
  return Promise.all(
    names.map(function (n) {
      return Promise.resolve()
        .then(SOURCES[n].load)
        .then(function (v) {
          var at = new Date().toISOString();
          latest[n] = { value: v, at: at };
          results[n] = { ok: true, value: v, at: at };
        })
        .catch(function (e) {
          var msg = String((e && e.message) || e).slice(0, 200);
          results[n] = { ok: false, error: msg, at: new Date().toISOString() };
          console.error(results[n].at + " " + n + " failed: " + msg);
        });
    })
  )
    .then(function () {
      var now = new Date();
      fs.mkdirSync(LOG_DIR, { recursive: true });

      var snap = { updated: now.toISOString(), sources: {} };
      names.forEach(function (n) {
        if (latest[n]) snap.sources[n] = latest[n];
      });
      writeAtomic(LATEST_FILE, JSON.stringify(snap, null, 2) + "\n");

      var line = { time: now.toISOString(), results: {} };
      names.forEach(function (n) {
        line.results[n] = results[n];
      });
      var today = localDate(now);
      fs.appendFileSync(path.join(LOG_DIR, today + ".log"), JSON.stringify(line) + "\n");
      pruneLogs(today);
    })
    .catch(function (e) {
      console.error(new Date().toISOString() + " collect failed: " + (e && e.stack));
    })
    .then(function () {
      running = false;
    });
}

// Holidays are not part of the minute cycle: data/holidays.json is downloaded
// once a year (from 1 November) and only checked for that once a day.
function checkHolidays() {
  holidays.load().catch(function (e) {
    console.error(new Date().toISOString() + " holidays failed: " + (e && e.message));
  });
}

function start() {
  checkHolidays();
  setInterval(checkHolidays, DAY);
  collect();
  (function schedule() {
    var now = new Date();
    var wait = ((CYCLE_SECOND - now.getSeconds() + 60) % 60 || 60) * 1000 - now.getMilliseconds();
    setTimeout(function () {
      collect();
      schedule();
    }, wait);
  })();
}

// ---- reader --------------------------------------------------------------------------

// What the page shows: name -> { value, at, old }, read only from latest.log,
// plus Holidays from the yearly data/holidays.json.
// A value past its `keep` time becomes null; one older than OLD_MS is marked old.
function readLatest() {
  return fs.promises
    .readFile(LATEST_FILE, "utf8")
    .then(JSON.parse)
    .catch(function (e) {
      if (e.code !== "ENOENT") console.error(new Date().toISOString() + " " + LATEST_FILE + ": " + e.message);
      return null;
    })
    .then(function (saved) {
      var now = Date.now();
      var data = {};
      Object.keys(SOURCES).forEach(function (n) {
        var s = saved && saved.sources && saved.sources[n];
        var at = s && s.at ? Date.parse(s.at) : 0;
        var usable = at && now - at <= SOURCES[n].keep;
        data[n] = {
          value: usable ? s.value : null,
          at: usable ? at : null,
          old: !!usable && now - at > OLD_MS
        };
      });
      data.Holidays = { value: holidays.read(), at: null, old: false };
      return { data: data, updated: saved && saved.updated ? new Date(saved.updated) : null };
    });
}

module.exports = {
  start: start,
  collect: collect,
  readLatest: readLatest,
  STOCKS: STOCKS,
  parseUsage: parseUsage,
  parseStock: parseStock
};
