// Renders the whole dashboard as static HTML for the Kindle browser, whose visible
// area is 758x897. Landscape is the same page drawn sideways with -webkit-transform.
// Only HTML4 tables and CSS2: no scripts, flexbox, web fonts, images or colours.
"use strict";

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

var CSS = [
  "body{margin:0;background:#fff;color:#000;font-family:Helvetica,Arial,sans-serif}",
  ".page{padding:24px 36px}",
  "table{width:100%;table-layout:fixed;border-collapse:collapse;border-top:2px solid #000}",
  "table.first{border-top:0}",
  "td{vertical-align:top;padding:16px 8px 17px 18px;border-left:1px solid #888}",
  "td.c1{padding-left:0;border-left:0}",
  ".first td{padding-top:0}",
  ".l{font-size:18px;font-weight:bold;color:#333}",
  ".clock{font-size:104px;line-height:108px;font-weight:bold}",
  ".temp{font-size:72px;line-height:78px;font-weight:bold}",
  ".v{font-size:42px;line-height:52px;font-weight:bold;white-space:nowrap}",
  ".s{font-size:22px;line-height:31px}",
  ".bar{height:14px;margin:6px 10px 6px 0;border:1px solid #000}",
  ".bar div{height:14px;background:#000}",
  ".d{display:inline-block;min-width:130px;padding-right:8px;font-weight:bold}",
  ".foot td{padding:12px 0 0;border:0;vertical-align:middle;font-size:16px;color:#333}",
  ".foot .r{text-align:right}",
  ".foot a{display:inline-block;padding:9px 22px;border:2px solid #000;font-size:18px;font-weight:bold;color:#000;text-decoration:none}"
].join("\n");

// Page turned clockwise: hold the Kindle with its right edge up. The outer box
// clips, so the browser never sees the unrotated 890px width and scrolls.
var LANDSCAPE_CSS = [
  ".view{position:relative;width:758px;height:890px;overflow:hidden}",
  ".page{position:absolute;left:0;top:0;width:818px;height:710px;-webkit-transform-origin:0 0;transform-origin:0 0;" +
    "-webkit-transform:translate(758px,0) rotate(90deg);transform:translate(758px,0) rotate(90deg)}",
  ".v{font-size:48px;line-height:58px}",
  ".events .s{font-size:24px;line-height:37px;white-space:nowrap}",
  ".events .d{min-width:108px}"
].join("\n");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function two(n) {
  return (n < 10 ? "0" : "") + n;
}

function hhmm(d) {
  return two(d.getHours()) + ":" + two(d.getMinutes());
}

// 130000000 -> "130.000.000"
function vnd(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// One row of tiles. `widths` are column percentages.
function row(cells, widths, cls) {
  return (
    "<table" + (cls ? ' class="' + cls + '"' : "") + "><tr>" +
    cells
      .map(function (c, i) {
        return "<td" + (i === 0 ? ' class="c1"' : "") + ' width="' + widths[i] + '%">' + c + "</td>";
      })
      .join("") +
    "</tr></table>\n"
  );
}

function evenWidths(n) {
  var widths = [];
  for (var i = 0; i < n; i++) widths.push(Math.floor(100 / n));
  return widths;
}

function tile(label, value, sub) {
  return (
    '<div class="l">' + esc(label) + "</div>" +
    '<div class="v">' + esc(value) + "</div>" +
    (sub ? '<div class="s">' + esc(sub) + "</div>" : "")
  );
}

function usageTile(label, part) {
  if (!part) return tile(label, "--");
  var width = Math.max(0, Math.min(100, part.percent));
  return (
    '<div class="l">' + esc(label) + "</div>" +
    '<div class="v">' + esc(part.percent) + "%</div>" +
    '<div class="bar"><div style="width:' + width + '%"></div></div>' +
    (part.resets ? '<div class="s">Resets ' + esc(part.resets) + "</div>" : "")
  );
}

// "2027-02-04","2027-02-10" -> "4-10 Feb"
function dateRange(start, end) {
  var a = start.split("-");
  var b = end.split("-");
  var am = MONTHS[Number(a[1]) - 1];
  var bm = MONTHS[Number(b[1]) - 1];
  if (start === end) return Number(a[2]) + " " + am;
  if (am === bm) return Number(a[2]) + "-" + Number(b[2]) + " " + bm;
  return Number(a[2]) + " " + am + "-" + Number(b[2]) + " " + bm;
}

function eventsTile(holidays, now) {
  var today = now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate());
  var lines = (holidays || [])
    .filter(function (h) {
      return h.end >= today;
    })
    .slice(0, 3)
    .map(function (h) {
      var label = h.start <= today ? "Today" : dateRange(h.start, h.end);
      return '<div class="s"><span class="d">' + esc(label) + "</span>" + esc(h.name) + "</div>";
    });
  return '<div class="l">Upcoming holidays</div>' + (lines.join("") || '<div class="s">--</div>');
}

function clockTile(now) {
  return (
    '<div class="clock">' + hhmm(now) + "</div>" +
    '<div class="s">' + DAYS[now.getDay()] + ", " + now.getDate() + " " + MONTHS[now.getMonth()] + " " + now.getFullYear() + "</div>"
  );
}

function weatherTile(w) {
  return (
    '<div class="l">' + esc(w ? w.place : "Weather") + "</div>" +
    '<div class="temp">' + (w ? w.temp + "&deg;" : "--") + "</div>" +
    '<div class="s">' + esc(w ? w.text : "") + "</div>"
  );
}

function footer(data, now, landscape) {
  var old = Object.keys(data)
    .filter(function (n) {
      return data[n].old;
    })
    .map(function (n) {
      return n + " " + hhmm(new Date(data[n].at));
    });
  return (
    '<table class="foot"><tr><td width="75%">Updated ' + hhmm(now) +
    (old.length ? " | Old data: " + esc(old.join(", ")) : "") +
    '</td><td class="r" width="25%"><a href="' + (landscape ? "/" : "/?view=landscape") + '">Rotate</a></td></tr></table>\n'
  );
}

function render(data, stocks, now, landscape) {
  var gold = data.Gold.value;
  var usd = data.USD.value;
  var claude = data.Claude.value || {};

  // Reload just after the minute changes, so the clock stays right.
  // Without a URL the browser reloads the current one, keeping the orientation.
  var reload = 61 - now.getSeconds();
  if (reload < 15) reload += 60;

  var clock = clockTile(now);
  var weather = weatherTile(data.Weather.value);
  var events = eventsTile(data.Holidays.value, now);

  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>Dashboard</title>\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<meta http-equiv="refresh" content="' + reload + '">\n' +
    "<style>\n" + CSS + (landscape ? "\n" + LANDSCAPE_CSS : "") + "\n</style></head><body>\n" +
    '<div class="view"><div class="page">\n' +
    (landscape
      ? row([clock, weather, '<div class="events">' + events + "</div>"], [36, 22, 42], "first")
      : row([clock, weather], [58, 42], "first")) +
    row([usageTile("Claude 5 hours", claude.session), usageTile("Claude week", claude.week)], evenWidths(2)) +
    row(
      stocks.map(function (code) {
        var q = data[code].value;
        return tile(code, q ? q.price : "--", q ? q.change : "");
      }),
      evenWidths(stocks.length)
    ) +
    row(
      [
        tile("Gold buy", gold ? vnd(gold.buy / 1000) : "--", "thousand VND"),
        tile("Gold sell", gold ? vnd(gold.sell / 1000) : "--", "thousand VND"),
        tile("USD", usd ? vnd(usd) : "--", "VND")
      ],
      evenWidths(3)
    ) +
    (landscape ? "" : row([events], [100])) +
    footer(data, now, landscape) +
    "</div></div></body></html>\n"
  );
}

module.exports = { render: render };
