const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.static(path.join(__dirname)));

app.get("/api/weather", (req, res) => {
  res.json({
    temp: 27,
    condition: "Cloudy",
    location: "Home"
  });
});

app.get("/api/stocks", (req, res) => {
  res.json({
    items: [
      { symbol: "AAPL", price: 214, change: "▲" },
      { symbol: "NVDA", price: 120, change: "▲" },
      { symbol: "TSLA", price: 195, change: "▼" }
    ]
  });
});

app.get("/api/calendar", (req, res) => {
  res.json({
    events: [
      { time: "10:00", title: "Sprint Meeting" },
      { time: "14:00", title: "Client Review" },
      { time: "16:30", title: "Planning" }
    ]
  });
});

app.get("/api/system", (req, res) => {
  res.json({
    generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    serverName: "Kindle Dashboard",
    note: "All systems nominal"
  });
});

app.listen(port, () => {
  console.log(`Kindle dashboard running at http://localhost:${port}`);
});

