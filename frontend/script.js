const API_URL = "https://hanoi-aqi.onrender.com/api/stations";
const HISTORY_API_URL = "https://hanoi-aqi.onrender.com/api/history";

const map = L.map("map").setView([21.0285, 105.8542], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
let chartInstances = {};
let currentStationName = "";

// --- MÀU AQI ---
function getAQIColor(aqi) {
  if (!aqi || aqi < 5) return "#94a3b8";
  if (aqi <= 50) return "#00e400";
  if (aqi <= 100) return "#ffff00";
  if (aqi <= 150) return "#ff7e00";
  if (aqi <= 200) return "#ff0000";
  if (aqi <= 300) return "#8f3f97";
  return "#7e0023";
}

// --- BIỂU ĐỒ LINE (chỉ dùng cho hourly) ---
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
  window.addEventListener("resize", () => chart.resize());
}

// --- BIỂU ĐỒ CỘT AQI THEO NGÀY – ĐẸP Y HỆT AQICN.ORG ---
function renderDailyAQIChart(labels, values) {
  const dom = document.getElementById("chart-daily-aqi");
  if (!dom) return;
  if (chartInstances["daily-aqi"]) chartInstances["daily-aqi"].dispose();

  const chart = echarts.init(dom);
  chartInstances["daily-aqi"] = chart;

  chart.setOption({
    tooltip: { trigger: "axis", formatter: "<b>AQI {c}</b>" },
    grid: { top: 50, bottom: 80, left: 60, right: 70 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { fontSize: 13, fontWeight: "600", color: "#444" },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 500,
      splitNumber: 10,
      axisLabel: { fontSize: 12 },
      splitLine: { lineStyle: { color: "#eee" } },
    },
    visualMap: {
      show: false,
      pieces: [
        { min: 0, max: 50, color: "#00e400" },
        { min: 51, max: 100, color: "#ffff00" },
        { min: 101, max: 150, color: "#ff7e00" },
        { min: 151, max: 200, color: "#ff0000" },
        { min: 201, max: 300, color: "#8f3f97" },
        { min: 301, max: 999, color: "#7e0023" },
      ],
    },
    series: [
      {
        type: "bar",
        barWidth: "60%",
        data: values.map((v) => ({
          value: v,
          itemStyle: { color: getAQIColor(v) },
        })),
        label: {
          show: true,
          position: "top",
          fontSize: 16,
          fontWeight: "bold",
          color: "#333",
        },
      },
    ],
  });

  window.addEventListener("resize", () => chart.resize());
}

// --- LOAD TRẠM, CHỌN TRẠM, TAB... (giữ nguyên như cũ) ---
async function loadStations() {
  /* giữ nguyên */
}
async function selectStation(st) {
  /* giữ nguyên */
}

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
    console.error(err);
  }
}

async function loadDailyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}&mode=daily`
    );
    const d = await res.json();
    if (!d.dates?.length) return;
    renderDailyAQIChart(d.dates, d.aqi); // CHỈ VẼ 1 BIỂU ĐỒ NÀY
  } catch (err) {
    console.error(err);
  }
}

// Chuyển tab
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

// Khởi động
loadStations();
setInterval(loadStations, 5 * 60 * 1000);
document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});
