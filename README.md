# Kindle Dashboard

Lightweight web dashboard designed for the Experimental Browser of an e-ink device such as the Amazon Kindle Paperwhite. It follows the design described in `BUILD_PLAN.md` with simple widgets for time, weather, stocks, calendar, and system status.

## Running locally

This project is **static-only** (no backend). Run any simple static file server.

### Option A: Python

From the project directory:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a browser. For Kindle, open `http://<your-pc-ip>:8000`.

## Public APIs used

- **Weather**: Open-Meteo (geocoding + current weather)
- **Stocks**: Stooq CSV endpoint (may fail if CORS blocked)
- **Events**: Nager.Date Public Holidays (used as “today’s events”)

## URL parameters

- `?city=Ho%20Chi%20Minh%20City` (weather location)
- `?stocks=AAPL.US,NVDA.US,TSLA.US` (stock symbols)
- `?country=VN` (holiday country code for events)

