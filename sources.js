// Fetches and caches everything the dashboard shows. Runs on the Mac, because
// the Kindle browser (WebKit 531) has no fetch/Promise and outdated TLS.
"use strict";

var os = require("os");
var path = require("path");
var execFile = require("child_process").execFile;
var holidays = require("./holidays");

var CITY = "Ho Chi Minh City";
var STOCKS = ["HPG", "HSG", "BSR"];
var CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), ".local/bin/claude");

var MINUTE = 60 * 1000;
var RETRY_MS = MINUTE; // wait after a failure
var WAIT_MS = 3000; // longest a page load waits for missing or old data

// ---- cache ---------------------------------------------------------------

// Keeps the last good value, refreshing in the background once `ttl` passes.
function cached(name, ttl, keep, load) {
  var value = null;
  var at = 0;
  var nextTry = 0;
  var pending = null;

  function refresh() {
    if (pending) return pending;
    pending = load()
      .then(function (v) {
        value = v;
        at = Date.now();
        nextTry = at + ttl;
      })
      .catch(function (e) {
        console.error(new Date().toISOString() + " " + name + " failed: " + (e && e.message));
        nextTry = Date.now() + RETRY_MS;
      })
      .then(function () {
        pending = null;
      });
    return pending;
  }

  function isOld() {
    return Date.now() - at > 2 * ttl;
  }

  return function get() {
    var refreshing = Date.now() >= nextTry ? refresh() : pending;
    var ready = Promise.resolve();
    if (refreshing && isOld()) {
      var timer;
      var timeout = new Promise(function (r) {
        timer = setTimeout(r, WAIT_MS);
      });
      ready = Promise.race([refreshing, timeout]).then(function () {
        clearTimeout(timer);
      });
    }
    return ready.then(function () {
      var usable = at && Date.now() - at <= keep;
      return { value: usable ? value : null, at: usable ? at : null, old: !!usable && isOld() };
    });
  };
}

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

// ---- public ------------------------------------------------------------------------

var DAY = 24 * 60 * MINUTE;
var sources = {
  Weather: cached("Weather", 15 * MINUTE, 3 * 60 * MINUTE, loadWeather),
  Gold: cached("Gold", 10 * MINUTE, DAY, loadGold),
  USD: cached("USD", 60 * MINUTE, DAY, loadUsd),
  Holidays: cached("Holidays", 12 * 60 * MINUTE, 7 * DAY, holidays.load),
  Claude: cached("Claude", 5 * MINUTE, 60 * MINUTE, loadClaude)
};
STOCKS.forEach(function (code) {
  sources[code] = cached(code, 5 * MINUTE, DAY, function () {
    return loadStock(code);
  });
});

function getAll() {
  var names = Object.keys(sources);
  return Promise.all(
    names.map(function (n) {
      return sources[n]();
    })
  ).then(function (results) {
    var all = {};
    names.forEach(function (n, i) {
      all[n] = results[i];
    });
    return all;
  });
}

module.exports = { getAll: getAll, STOCKS: STOCKS, parseUsage: parseUsage, parseStock: parseStock };
