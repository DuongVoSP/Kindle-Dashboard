# Kindle Dashboard

Lightweight web dashboard designed for the Experimental Browser of an e-ink device such as the Amazon Kindle Paperwhite. It follows the design described in `BUILD_PLAN.md` with simple widgets for time, weather, stocks, calendar, and system status.

## Running locally

1. Install Node.js (v18+ recommended).
2. From the project directory:

```bash
npm install
npm start
```

3. Open `http://localhost:3000` in a browser. For Kindle, use the Experimental Browser pointing to the same URL on your network.

The page auto-refreshes every 60 seconds using an HTML meta refresh tag and loads data from simple JSON endpoints:

- `/api/weather`
- `/api/stocks`
- `/api/calendar`
- `/api/system`

