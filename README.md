# Kindle Dashboard

Lightweight web dashboard designed for the Experimental Browser of an e-ink device such as the Amazon Kindle Paperwhite. It follows the design described in `BUILD_PLAN.md` with simple widgets for time, weather, stocks, calendar, and system status.

## Running

A plain Node server (no dependencies) on port **7972**. The Mac fetches all data and sends finished
HTML, because the Kindle browser (WebKit 531, 758x1024) has no `fetch`, `Promise` or flexbox.

- `sources.js`: fetches and caches the data. City and stock symbols are constants at the top.
- `page.js`: renders the page with HTML4 tables and CSS2 only, no scripts.
- `server.js`: HTTP server, only serves `/`.

Run it automatically at login (macOS launchd, restarted if it crashes):

```bash
./service.sh install     # also: uninstall | restart | status
```

Or run it once by hand: `npm start`.

Open `http://<mac-name>.local:7972` or `http://<mac-ip>:7972` from any device on the local network.
Some Kindle browsers do not resolve `.local` names; use the IP there.

After editing any `.js` file, run `./service.sh restart`.
Log: `~/Library/Logs/kindle-dashboard.log`.

## Orientation

The Rotate button in the footer switches between `/` (portrait) and `/?view=landscape`. Landscape is drawn
sideways with CSS, so turn the Kindle a quarter turn to the left (right edge up). Bookmark either address.

## Holidays

`holidays.js` downloads the calendar once a year, from 1 November (after next year's schedule is announced),
into `data/holidays.json`, and reads that file the rest of the time. Fixed-date holidays set by law are in the
`FIXED` table and are added even if the calendar lacks them. To correct a date, edit `data/holidays.json` and
run `./service.sh restart`; to download again, delete the file first.

## Claude usage

The server runs `claude -p /usage` (a local command, no tokens spent) at most every 5 minutes, using the
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
