# Kindle Dashboard

Lightweight web dashboard designed for the Experimental Browser of an e-ink device such as the Amazon Kindle Paperwhite. It follows the design described in `BUILD_PLAN.md` with simple widgets for time, weather, stocks, calendar, and system status.

## Running

A plain Node server (no dependencies) on port **7972**. The Mac fetches all data and sends finished
HTML, because the Kindle browser (WebKit 531, 758x1024) has no `fetch`, `Promise` or flexbox.

- `sources.js`: fetches the data and writes the data files. City and stock symbols are constants at the top.
- `page.js`: renders the page with HTML4 tables and CSS2 only, no scripts.
- `server.js`: HTTP server, only serves `/`.

## Data files

Every minute (at second 20, so it is done before the page reloads at :01) the server requests every source,
then writes two files. Holidays are not part of this, see [Holidays](#holidays).

- `data/latest.log`: overwritten each minute. It holds the last *successful* value of each source with the
  time it was fetched, never an error: when a request fails, the previous value stays. A page load only
  reads this file; it never goes to the internet. "Updated" in the footer is the time of the last write.
- `data/logs/YYYY-MM-DD.log`: one file per day. Each minute one line is added at the end with the result
  of every request, errors included, for example
  `{"time":"...","results":{"Gold":{"ok":true,"value":{...},"at":"..."},"POW":{"ok":false,"error":"fetch failed","at":"..."}}}`.
  Files older than 30 days are deleted.

## Orientation

The Rotate button in the footer switches between `/` (portrait) and `/?view=landscape`. Landscape is drawn
sideways with CSS, so turn the Kindle a quarter turn to the left (right edge up). Bookmark either address.

## Holidays

Holidays are not requested every minute and are not in the data files above. The page reads them from
`data/holidays.json`. `holidays.js` downloads the calendar once a year, from 1 November (after next year's schedule is announced),
into `data/holidays.json`, and reads that file the rest of the time. Fixed-date holidays set by law are in the
`FIXED` table and are added even if the calendar lacks them. To correct a date, edit `data/holidays.json`
(the next page load shows it); to download again, delete the file and run `./service.sh restart`.

## Claude usage

The server runs `claude -p /usage` (a local command, no tokens spent) every minute, using the
Claude Code login on this Mac, and shows only the session and weekly percentages and reset times.
Anyone on the local network can see them.

## Data sources

- **Weather**: Open-Meteo
- **Stocks**: Stockbiz
- **Gold**: vang.today
- **USD**: moneyconvert.net
- **Holidays**: Google's public Vietnam holiday calendar, see below

Values that could not be refreshed stay on screen for a while and are listed under "Old data" in the
footer with the time they were fetched. After that they show `--`.
