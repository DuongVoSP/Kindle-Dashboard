// Minimal vanilla JS for browsers with limited capabilities.
// All features should fail gracefully if fetch or modern APIs are unavailable.

(function () {
  function getQueryParam(name) {
    try {
      var qs = window.location.search || "";
      if (!qs) return null;
      var parts = qs.replace(/^\?/, "").split("&");
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split("=");
        if (decodeURIComponent(kv[0] || "") === name) {
          return decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function safeFetch(url) {
    if (typeof fetch !== "function") {
      return Promise.reject(new Error("fetch not supported"));
    }
    return fetch(url, { cache: "no-store" });
  }

  function safeFetchText(url) {
    return safeFetch(url).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      if (typeof res.text === "function") return res.text();
      throw new Error("text not supported");
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  }

  function show(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
  }

  function initClock() {
    function update() {
      var now = new Date();
      var hours = now.getHours();
      var minutes = now.getMinutes();
      var hh = (hours < 10 ? "0" : "") + hours;
      var mm = (minutes < 10 ? "0" : "") + minutes;
      setText("clock-time", hh + ":" + mm);

      var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      var months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
      ];
      var dateStr =
        days[now.getDay()] +
        " " +
        months[now.getMonth()] +
        " " +
        now.getDate() +
        ", " +
        now.getFullYear();
      setText("clock-date", dateStr);
    }

    update();
    // Optional JS update – page will also refresh via meta refresh.
    if (typeof setInterval === "function") {
      setInterval(update, 30 * 1000);
    }
  }

  function csvFirstLineToObject(csvText) {
    // Very small CSV parser for Stooq responses
    // Example:
    // Symbol,Date,Time,Open,High,Low,Close,Volume
    // aapl.us,2026-03-18,21:59:59,170.1,172.3,169.5,171.8,12345
    //
    // When fetched through a proxy, extra lines may be present.
    if (!csvText) return null;
    var lines = csvText.replace(/\r/g, "").split("\n");
    if (lines.length < 2) return null;

    var headerIdx = -1;
    for (var k = 0; k < lines.length; k++) {
      if (lines[k] && lines[k].indexOf("Symbol,") === 0) {
        headerIdx = k;
        break;
      }
    }
    if (headerIdx < 0 || headerIdx + 1 >= lines.length) return null;

    // Find the first non-empty data row after header
    var dataIdx = headerIdx + 1;
    while (dataIdx < lines.length && !String(lines[dataIdx] || "").trim()) dataIdx++;
    if (dataIdx >= lines.length) return null;

    var header = lines[headerIdx].split(",");
    var row = lines[dataIdx].split(",");
    if (!header.length || header.length !== row.length) return null;
    var obj = {};
    for (var i = 0; i < header.length; i++) {
      obj[String(header[i] || "").trim()] = String(row[i] || "").trim();
    }
    return obj;
  }

  function round1(n) {
    var x = Number(n);
    if (!isFinite(x)) return null;
    return Math.round(x * 10) / 10;
  }

  function formatVnNumber(n) {
    var x = Number(n);
    if (!isFinite(x)) return null;
    // thousands separator using dot
    var s = String(Math.round(x));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatMaybePrice(v) {
    var n = Number(v);
    if (isFinite(n)) return formatVnNumber(n);
    return v != null ? String(v) : null;
  }

  function loadWeather() {
    // Public API (no key): Open-Meteo geocoding + forecast
    var city = getQueryParam("city") || "Ho Chi Minh City";
    var geoUrl =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(city);

    safeFetch(geoUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (geo) {
        if (!geo || !geo.results || !geo.results.length) throw new Error("no results");
        var r = geo.results[0];
        var lat = r.latitude;
        var lon = r.longitude;
        var locName = r.name + (r.country ? ", " + r.country : "");
        setText("weather-location", "Location: " + locName);

        var wxUrl =
          "https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&timezone=auto&latitude=" +
          encodeURIComponent(lat) +
          "&longitude=" +
          encodeURIComponent(lon);
        return safeFetch(wxUrl).then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.json();
        });
      })
      .then(function (wx) {
        hide("weather-error");
        var temp = wx && wx.current ? wx.current.temperature_2m : null;
        var code = wx && wx.current ? wx.current.weather_code : null;
        var t = round1(temp);
        setText("weather-temp", "Temp: " + (t != null ? t : "--") + "°");
        var text = weatherCodeToText(code);
        setText("weather-condition", "Condition: " + text);
        setWeatherIcon(code, text);
      })
      .catch(function () {
        show("weather-error");
      });
  }

  function weatherCodeToText(code) {
    // Open-Meteo WMO weather codes (simplified text)
    var c = Number(code);
    if (!isFinite(c)) return "--";
    if (c === 0) return "Clear";
    if (c === 1) return "Mainly clear";
    if (c === 2) return "Partly cloudy";
    if (c === 3) return "Overcast";
    if (c === 45 || c === 48) return "Fog";
    if (c === 51 || c === 53 || c === 55) return "Drizzle";
    if (c === 56 || c === 57) return "Freezing drizzle";
    if (c === 61 || c === 63 || c === 65) return "Rain";
    if (c === 66 || c === 67) return "Freezing rain";
    if (c === 71 || c === 73 || c === 75) return "Snow";
    if (c === 77) return "Snow grains";
    if (c === 80 || c === 81 || c === 82) return "Rain showers";
    if (c === 85 || c === 86) return "Snow showers";
    if (c === 95) return "Thunderstorm";
    if (c === 96 || c === 99) return "Thunderstorm (hail)";
    return "Weather";
  }

  function setWeatherIcon(code, text) {
    var el = document.getElementById("weather-icon");
    if (!el) return;
    var base = "weather-icon";
    var c = Number(code);
    var glyph = "";
    if (!isFinite(c)) {
      // Fallback based on text if code missing
      var t = String(text || "").toLowerCase();
      if (t.indexOf("rain") >= 0) glyph = "☂";
      else if (t.indexOf("snow") >= 0) glyph = "✻";
      else if (t.indexOf("thunder") >= 0 || t.indexOf("storm") >= 0) glyph = "⚡";
      else if (t.indexOf("clear") >= 0) glyph = "☀";
      else glyph = "☁";
    } else if (c === 0 || c === 1) {
      glyph = "☀";
    } else if (c === 2 || c === 3 || c === 45 || c === 48) {
      glyph = "☁";
    } else if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82)) {
      glyph = "☂";
    } else if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) {
      glyph = "✻";
    } else if (c >= 95 && c <= 99) {
      glyph = "⚡";
    } else {
      glyph = "☁";
    }
    el.className = base;
    el.textContent = glyph;
  }

  function loadStocks() {
    var container = document.getElementById("stocks-list");
    if (!container) return;

    container.innerHTML = "";
    hide("stocks-error");

    var defs = [
      { label: "HPG", code: "HPG" },
      { label: "HSG", code: "HSG" },
      { label: "BSR", code: "BSR" }
    ];

    function renderLine(label, value, changeText) {
      var line = document.createElement("div");
      line.className = "stock-line";
      var symbol = document.createElement("span");
      symbol.className = "stock-symbol";
      symbol.textContent = label;
      var priceEl = document.createElement("span");
      priceEl.className = "stock-price";
      priceEl.textContent = value != null && value !== "" ? String(value) : "--";
      var change = document.createElement("span");
      change.className = "stock-change";
      change.textContent = changeText || "";
      line.appendChild(symbol);
      line.appendChild(priceEl);
      line.appendChild(change);
      container.appendChild(line);
    }

    function fetchFromStockbiz(code) {
      // Use a CORS-friendly proxy to fetch the Stockbiz HTML and parse the current quote.
      // Source page example: http://en.stockbiz.vn/Stocks/HPG/LookupQuote.aspx
      var url = "https://r.jina.ai/http://en.stockbiz.vn/Stocks/" + encodeURIComponent(code) + "/LookupQuote.aspx";
      return safeFetchText(url).then(function (txt) {
        // Find pattern after "(CODE : ...)" then a price and change line.
        // Example:
        // Hoa Phat ... (HPG : HOSE)
        //
        // 26.40 -0.40/-1.49%
        var re = new RegExp("\\\\(" + code + "\\\\s*:\\\\s*[^)]+\\\\)\\\\s*\\n\\s*\\n\\s*([0-9]+(?:\\\\.[0-9]+)?)\\\\s+([+-][0-9]+(?:\\\\.[0-9]+)?\\\\/[^\\n]+)", "i");
        var m = txt.match(re);
        if (m && m[1]) {
          return { price: m[1], change: m[2] };
        }
        // Fallback: first standalone price near top (best-effort)
        var m2 = txt.match(/^\s*([0-9]+\.[0-9]+)\s+[+-][0-9]+\.[0-9]+\/[-+0-9.]+%/m);
        if (m2 && m2[1]) return { price: m2[1], change: "" };
        throw new Error("parse failed");
      });
    }

    var i = 0;
    function next() {
      if (i >= defs.length) return;
      var d = defs[i++];
      fetchFromStockbiz(d.code)
        .then(function (q) {
          // Stockbiz prices are in thousands VND (e.g., 26.40 => 26,400 VND)
          renderLine(d.label, q.price, q.change);
          next();
        })
        .catch(function () {
          renderLine(d.label, "--", "");
          show("stocks-error");
          next();
        });
    }

    next();
  }

  function loadCalendar() {
    var container = document.getElementById("calendar-list");
    if (!container) return;
    // Public API: Nager.Date public holidays as "today's events"
    // Country can be overridden via ?country=VN (default VN)
    var country = (getQueryParam("country") || "VN").toUpperCase();
    var now = new Date();
    var year = now.getFullYear();
    var yyyy = String(year);
    var mm = (now.getMonth() + 1);
    var dd = now.getDate();
    var mm2 = (mm < 10 ? "0" : "") + mm;
    var dd2 = (dd < 10 ? "0" : "") + dd;
    var todayStr = yyyy + "-" + mm2 + "-" + dd2;

    var url = "https://date.nager.at/api/v3/PublicHolidays/" + encodeURIComponent(yyyy) + "/" + encodeURIComponent(country);

    safeFetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (items) {
        hide("calendar-error");
        container.innerHTML = "";
        if (!items || !items.length) {
          container.textContent = "No events";
          return;
        }
        // Most days are not holidays. Show next few events (today or upcoming).
        var upcoming = [];
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].date && items[i].date >= todayStr) {
            upcoming.push(items[i]);
          }
        }
        upcoming.sort(function (a, b) {
          var da = a && a.date ? a.date : "";
          var db = b && b.date ? b.date : "";
          if (da < db) return -1;
          if (da > db) return 1;
          return 0;
        });
        if (!upcoming.length) {
          container.textContent = "No upcoming events";
          return;
        }

        var limit = 3;
        for (var j = 0; j < upcoming.length && j < limit; j++) {
          var ev = upcoming[j];
          var line = document.createElement("div");
          line.className = "calendar-line";
          var time = document.createElement("span");
          time.className = "calendar-time";
          time.textContent = ev.date || "";
          var title = document.createElement("span");
          title.className = "calendar-title";
          title.textContent = ev.localName || ev.name || "Holiday";
          line.appendChild(time);
          line.appendChild(title);
          container.appendChild(line);
        }
      })
      .catch(function () {
        show("calendar-error");
      });
  }

  function loadSystem() {
    var container = document.getElementById("system-status");
    if (!container) return;
    // Static-only system info (no backend required)
    hide("system-error");
    container.innerHTML = "";

    function addLine(label, value) {
      var line = document.createElement("div");
      line.className = "system-line";
      var l = document.createElement("span");
      l.className = "system-label";
      l.textContent = label + ":";
      var v = document.createElement("span");
      v.className = "system-value";
      v.textContent = value;
      line.appendChild(l);
      line.appendChild(v);
      container.appendChild(line);
    }

    var now = new Date();
    addLine("Updated", now.toISOString().slice(0, 19).replace("T", " "));
    addLine("Mode", "Static (public APIs)");
    try {
      if (navigator && navigator.userAgent) {
        addLine("UA", String(navigator.userAgent).slice(0, 60));
      }
    } catch (e) {}

    // Optional: public IP (may fail on constrained browsers/CORS)
    safeFetch("https://api.ipify.org?format=json")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        if (data && data.ip) addLine("IP", data.ip);
      })
      .catch(function () {
        // ignore
      });
  }

  function loadMarket() {
    // Gold 9999 (SJC 9999): vang.today (CORS enabled)
    safeFetch("https://www.vang.today/api/prices?type=SJL1L10")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        // API returns a single object with buy/sell
        if (!data || data.success !== true) throw new Error("no data");
        var buy = data.buy != null ? data.buy : null;
        var sell = data.sell != null ? data.sell : null;
        setText("market-gold-buy", buy != null ? formatVnNumber(buy) : "--");
        setText("market-gold-sell", sell != null ? formatVnNumber(sell) : "--");
      })
      .catch(function () {
        setText("market-gold-buy", "--");
        setText("market-gold-sell", "--");
      });

    // USD/VND: moneyconvert CDN JSON (no key)
    safeFetch("https://cdn.moneyconvert.net/api/latest.json")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        var vnd = data && data.rates ? data.rates.VND : null;
        var txt = vnd != null ? formatMaybePrice(vnd) : "--";
        setText("market-usd", txt);
      })
      .catch(function () {
        setText("market-usd", "--");
      });

    function todayDdMmYyyy() {
      var now = new Date();
      var dd = (now.getDate() < 10 ? "0" : "") + now.getDate();
      var mm = (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1);
      var yyyy = now.getFullYear();
      return dd + "/" + mm + "/" + yyyy;
    }

    function setRon95(text) {
      setText("market-ron95", text);
    }

    // RON95: prefer a VN-specific dataset; if it isn't updated today, show the date.
    safeFetch("https://cdn.jsdelivr.net/gh/toanqng/fuel@main/fuel-vietnam.json")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (arr) {
        if (!arr || !arr.length) throw new Error("no data");
        var latest = arr[0];
        var list = latest && latest.list ? latest.list : [];
        var value = null;
        for (var i = 0; i < list.length; i++) {
          var name = String(list[i].name || "");
          if (name.indexOf("Xăng RON 95") === 0) {
            value = list[i].region1 || null; // region 1
            break;
          }
        }
        if (!value) throw new Error("not found");
        var d = latest && latest.date ? String(latest.date) : "";
        var suffix = d && d !== todayDdMmYyyy() ? " (as of " + d + ")" : "";
        setRon95(String(value) + " VND/l" + suffix);
      })
      .catch(function () {
        // Fallback: OpenVan weekly gasoline price (not specific to RON95)
        safeFetch("https://openvan.camp/api/fuel/prices")
          .then(function (res) {
            if (!res.ok) throw new Error("bad status");
            return res.json();
          })
          .then(function (data) {
            var vn = data && data.data ? data.data.VN : null;
            var p = null;
            if (vn) {
              if (vn.local_prices && vn.local_prices.gasoline !== undefined && vn.local_prices.gasoline !== null) {
                p = vn.local_prices.gasoline;
              } else if (vn.prices && vn.prices.gasoline !== undefined && vn.prices.gasoline !== null) {
                p = vn.prices.gasoline;
              }
            }
            if (p == null) throw new Error("no vn");
            var unit = vn && vn.local_currency ? vn.local_currency : (vn && vn.currency ? vn.currency : "");
            setRon95(String(p) + " " + unit + "/l (weekly)");
          })
          .catch(function () {
            setRon95("--");
          });
      });
  }

  function init() {
    initClock();
    loadWeather();
    loadStocks();
    loadMarket();
    loadCalendar();
    loadSystem();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();

