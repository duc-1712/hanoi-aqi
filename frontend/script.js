const API_URL = "https://hanoi-aqi.onrender.com/api/stations";
const HISTORY_API_URL = "https://hanoi-aqi.onrender.com/api/history";

const map = L.map("map").setView([21.0285, 105.8542], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
let chartInstances = {};
let currentStationName = "";

// --- MÀU AQI CHUẨN ---
function getAQIColor(aqi) {
  if (!aqi || aqi < 5) return "#94a3b8";
  if (aqi <= 50) return "#00e400";
  if (aqi <= 100) return "#ffff00";
  if (aqi <= 150) return "#ff7e00";
  if (aqi <= 200) return "#ff0000";
  if (aqi <= 300) return "#8f3f97";
  return "#7e0023";
}

function getAQIClass(aqi) {
  if (!aqi || aqi < 5) return "";
  if (aqi <= 50) return "aqi-good";
  if (aqi <= 100) return "aqi-moderate";
  if (aqi <= 150) return "aqi-unhealthy";
  if (aqi <= 200) return "aqi-bad";
  if (aqi <= 300) return "aqi-verybad";
  return "aqi-hazardous";
}

// --- VẼ BIỂU ĐỒ LINE (HOURLY) ---
function renderLineChart(domId, title, color, labels, values) {
  const dom = document.getElementById(domId);
  if (!dom) return;
  if (chartInstances[domId]) chartInstances[domId].dispose();

  const chart = echarts.init(dom);
  chartInstances[domId] = chart;

  chart.setOption({
    tooltip: { trigger: "axis" },
    grid: { top: 30, bottom: 60, left: 50, right: 20 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { rotate: 45, fontSize: 11 },
    },
    yAxis: { type: "value" },
    series: [
      {
        name: title,
        type: "line",
        smooth: true,
        data: values,
        itemStyle: { color },
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.15 },
      },
    ],
  });

  const resizeHandler = () => chart.resize();
  window.removeEventListener("resize", resizeHandler);
  window.addEventListener("resize", resizeHandler);
}

// --- VẼ BIỂU ĐỒ CỘT AQI THEO NGÀY ---
function renderDailyAQIChart(labels = [], values = []) {
  const dom = document.getElementById("chart-daily-aqi");
  if (!dom) return;

  if (chartInstances["daily-aqi"]) chartInstances["daily-aqi"].dispose();

  const chart = echarts.init(dom);
  chartInstances["daily-aqi"] = chart;

  // Nếu không có dữ liệu → để trống
  if (!labels.length || !values.length) {
    chart.clear();
    return;
  }

  chart.setOption({
    tooltip: { trigger: "axis", formatter: "<b>AQI {c}</b><br/>{b}" },
    grid: { top: 60, bottom: 80, left: 60, right: 60 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#333",
        interval: 0,
        rotate: labels.length > 5 ? 25 : 0,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 500,
      splitNumber: 10,
      axisLabel: { fontSize: 12 },
      splitLine: { lineStyle: { color: "#eee" } },
    },
    series: [
      {
        type: "bar",
        barWidth: "70%",
        data: values.map((v) => ({
          value: v || 0,
          itemStyle: { color: getAQIColor(v) },
        })),
        label: {
          show: true,
          position: "top",
          fontSize: 18,
          fontWeight: "bold",
          color: "#222",
          formatter: "{c}",
        },
        emphasis: {
          itemStyle: { shadowBlur: 15, shadowColor: "rgba(0,0,0,0.3)" },
        },
      },
    ],
  });

  const resizeHandler = () => chart.resize();
  window.removeEventListener("resize", resizeHandler);
  window.addEventListener("resize", resizeHandler);
}

// --- LOAD TRẠM ---
async function loadStations() {
  const list = document.getElementById("station-list");
  try {
    const res = await fetch(API_URL);
    const stations = await res.json();

    list.innerHTML = "";
    markersLayer.clearLayers();

    stations.forEach((st) => {
      if (!st.aqi || st.aqi < 5) return;

      const color = getAQIColor(st.aqi);
      const aqiClass = getAQIClass(st.aqi);

      const li = document.createElement("li");
      li.className = `station-card ${aqiClass}`;
      li.innerHTML = `<div class="st-name">${st.name}</div><div class="st-aqi">${st.aqi}</div>`;
      li.onclick = () => selectStation(st);
      list.appendChild(li);

      const marker = L.circleMarker([st.lat, st.lon], {
        radius: 13,
        weight: 3,
        color: "#fff",
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(markersLayer);

      marker.bindPopup(
        `<div style="text-align:center;font-family:system-ui">
          <b>${st.name}</b><br>
          <span style="font-size:28px;font-weight:900;color:${color}">AQI ${st.aqi}</span>
        </div>`
      );
      marker.on("click", () => selectStation(st));
    });
  } catch (err) {
    list.innerHTML =
      "<li style='color:red;padding:20px'>Lỗi tải dữ liệu trạm</li>";
  }
}

// --- CHỌN TRẠM ---
async function selectStation(st) {
  currentStationName = st.name;

  document.getElementById("chart-instruction").classList.add("hidden");
  document.getElementById("charts-wrapper").classList.remove("hidden");
  document.getElementById("selected-station-name").textContent = st.name;
  document.getElementById("current-stats").classList.remove("hidden");

  ["aqi", "pm25", "pm10", "no2", "co", "so2", "o3"].forEach((k) => {
    const el = document.getElementById(`val-${k}`);
    el.textContent = st[k] ?? "--";
    if (k === "aqi") el.style.color = getAQIColor(st[k]);
  });

  map.flyTo([st.lat, st.lon], 16, { duration: 1.5 });

  // Hiệu ứng marker nhảy
  setTimeout(() => {
    const marker = markersLayer
      .getLayers()
      .find(
        (m) => m.getLatLng().lat === st.lat && m.getLatLng().lng === st.lon
      );
    if (marker) {
      marker.setRadius(20);
      setTimeout(() => marker.setRadius(13), 300);
    }
  }, 600);

  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";
  isDaily ? loadDailyHistory(st.name) : loadHourlyHistory(st.name);
}

// --- LOAD DỮ LIỆU – ĐÃ SỬA: KHÔNG CẮT DỮ LIỆU NỮA ---
async function loadHourlyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}`
    );
    const d = await res.json();
    if (!d.times?.length) return;

    renderLineChart("chart-pm25", "PM2.5", "#3b82f6", d.times, d.pm25);
    renderLineChart("chart-pm10", "PM10", "#10b981", d.times, d.pm10);
    renderLineChart("chart-no2", "NO₂", "#f59e0b", d.times, d.no2);
    renderLineChart("chart-co", "CO", "#ef4444", d.times, d.co);
    renderLineChart("chart-o3", "O₃", "#8b5cf6", d.times, d.o3);
    renderLineChart("chart-so2", "SO₂", "#6366f1", d.times, d.so2);
  } catch (err) {
    console.error("Lỗi hourly:", err);
  }
}

async function loadDailyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}&mode=daily`
    );
    const d = await res.json();

    // KHÔNG CẮT DỮ LIỆU NỮA → ĐỂ HÀM VẼ TỰ XỬ LÝ
    renderDailyAQIChart(d.dates || [], d.aqi || []);
  } catch (err) {
    console.error("Lỗi daily:", err);
    renderDailyAQIChart([], []);
  }
}

// --- CHUYỂN TAB ---
document.addEventListener("click", (e) => {
  if (!e.target.matches(".tab-btn")) return;
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  const tab = e.target.dataset.tab;
  document.getElementById(`tab-${tab}`).classList.add("active");
  if (currentStationName) {
    tab === "daily"
      ? loadDailyHistory(currentStationName)
      : loadHourlyHistory(currentStationName);
  }
});

// --- DỌN DẸP ---
window.addEventListener("beforeunload", () => {
  Object.values(chartInstances).forEach((c) => c?.dispose());
  chartInstances = {};
});

// --- KHỞI ĐỘNG ---
loadStations();
setInterval(loadStations, 5 * 60 * 1000);

document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});
// --- AUTO SELECT FIRST STATION AFTER LOAD ---
setTimeout(() => {
  const firstStation = document.querySelector(".station-card");
  if (firstStation) firstStation.click();
}, 2000);
