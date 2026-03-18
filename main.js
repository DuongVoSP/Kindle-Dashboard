// Minimal vanilla JS for browsers with limited capabilities.
// All features should fail gracefully if fetch or modern APIs are unavailable.

(function () {
  function safeFetch(url) {
    if (typeof fetch !== "function") {
      return Promise.reject(new Error("fetch not supported"));
    }
    return fetch(url, { cache: "no-store" });
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

  function loadWeather() {
    safeFetch("/api/weather")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        hide("weather-error");
        if (data && typeof data.temp !== "undefined") {
          setText("weather-temp", "Temp: " + data.temp + "°");
        }
        if (data && data.condition) {
          setText("weather-condition", "Condition: " + data.condition);
        }
        if (data && data.location) {
          setText("weather-location", "Location: " + data.location);
        }
      })
      .catch(function () {
        show("weather-error");
      });
  }

  function loadStocks() {
    var container = document.getElementById("stocks-list");
    if (!container) return;
    safeFetch("/api/stocks")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        hide("stocks-error");
        container.innerHTML = "";
        if (!data || !data.items || !data.items.length) {
          container.textContent = "No data";
          return;
        }
        data.items.forEach(function (item) {
          var line = document.createElement("div");
          line.className = "stock-line";
          var symbol = document.createElement("span");
          symbol.className = "stock-symbol";
          symbol.textContent = item.symbol || "";
          var price = document.createElement("span");
          price.className = "stock-price";
          price.textContent = item.price != null ? String(item.price) : "--";
          var change = document.createElement("span");
          change.className = "stock-change";
          change.textContent = item.change || "";
          line.appendChild(symbol);
          line.appendChild(price);
          line.appendChild(change);
          container.appendChild(line);
        });
      })
      .catch(function () {
        show("stocks-error");
      });
  }

  function loadCalendar() {
    var container = document.getElementById("calendar-list");
    if (!container) return;
    safeFetch("/api/calendar")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        hide("calendar-error");
        container.innerHTML = "";
        if (!data || !data.events || !data.events.length) {
          container.textContent = "No events";
          return;
        }
        data.events.forEach(function (ev) {
          var line = document.createElement("div");
          line.className = "calendar-line";
          var time = document.createElement("span");
          time.className = "calendar-time";
          time.textContent = ev.time || "";
          var title = document.createElement("span");
          title.className = "calendar-title";
          title.textContent = ev.title || "";
          line.appendChild(time);
          line.appendChild(title);
          container.appendChild(line);
        });
      })
      .catch(function () {
        show("calendar-error");
      });
  }

  function loadSystem() {
    var container = document.getElementById("system-status");
    if (!container) return;
    safeFetch("/api/system")
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        hide("system-error");
        container.innerHTML = "";
        if (!data) {
          container.textContent = "No status";
          return;
        }

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

        if (data.generatedAt) {
          addLine("Updated", data.generatedAt);
        }
        if (data.serverName) {
          addLine("Server", data.serverName);
        }
        if (data.note) {
          addLine("Note", data.note);
        }
      })
      .catch(function () {
        show("system-error");
      });
  }

  function init() {
    initClock();
    loadWeather();
    loadStocks();
    loadCalendar();
    loadSystem();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();

