const API_URL = "https://hanoi-aqi.onrender.com/api/stations";
const HISTORY_API_URL = "https://hanoi-aqi.onrender.com/api/history";

const map = L.map("map").setView([21.0285, 105.8542], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
let chartInstances = {};
let currentStationName = "";

// --- MÀU AQI CHUẨN (dùng chung cho card + marker + biểu đồ cột) ---
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

// --- VẼ BIỂU ĐỒ LINE (dùng chung cho hourly và daily) ---
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
      axisLabel: { rotate: 45, fontSize: 11, color: "#555" },
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

// --- VẼ BIỂU ĐỒ CỘT AQI THEO NGÀY ---
function renderDailyAQIChart(labels, values) {
  const dom = document.getElementById("chart-daily-aqi");
  if (!dom) return;

  if (chartInstances["daily-aqi"]) chartInstances["daily-aqi"].dispose();

  const chart = echarts.init(dom);
  chartInstances["daily-aqi"] = chart;

  chart.setOption({
    tooltip: { trigger: "axis" },
    grid: { top: 40, bottom: 70, left: 50, right: 30 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { rotate: 45, fontSize: 11 },
    },
    yAxis: { type: "value", max: 500 },
    series: [
      {
        type: "bar",
        barWidth: "70%",
        data: values.map((v) => ({
          value: v,
          itemStyle: { color: getAQIColor(v) },
        })),
        label: {
          show: true,
          position: "top",
          fontWeight: "bold",
          fontSize: 13,
        },
      },
    ],
  });

  window.addEventListener("resize", () => chart.resize());
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
      if (!st.aqi || st.aqi < 5) return; // Ẩn trạm lỗi

      const color = getAQIColor(st.aqi);
      const aqiClass = getAQIClass(st.aqi);

      // Card trong sidebar
      const li = document.createElement("li");
      li.className = `station-card ${aqiClass}`;
      li.innerHTML = `
        <div class="st-name">${st.name}</div>
        <div class="st-aqi">${st.aqi}</div>
      `;
      li.onclick = () => selectStation(st);
      list.appendChild(li);

      // Marker trên bản đồ
      const marker = L.circleMarker([st.lat, st.lon], {
        radius: 13,
        weight: 3,
        color: "#fff",
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(markersLayer);

      marker.bindPopup(`
        <div style="text-align:center;font-family:system-ui">
          <b style="font-size:14px">${st.name}</b><br>
          <span style="font-size:28px;font-weight:900;color:${color}">AQI ${
        st.aqi
      }</span>
          ${st.pm25 ? `<br><small>PM2.5: ${st.pm25} µg/m³</small>` : ""}
        </div>
      `);

      marker.on("click", () => selectStation(st));
    });
  } catch (err) {
    list.innerHTML =
      "<li class='loading' style='color:red'>Lỗi tải dữ liệu</li>";
  }
}

// --- CHỌN TRẠM & TẢI LỊCH SỬ ---
async function selectStation(st) {
  currentStationName = st.name;

  document.getElementById("chart-instruction").classList.add("hidden");
  document.getElementById("charts-wrapper").classList.remove("hidden");
  document.getElementById("selected-station-name").textContent = st.name;
  document.getElementById("current-stats").classList.remove("hidden");

  // Cập nhật giá trị hiện tại
  ["aqi", "pm25", "pm10", "no2", "co", "so2", "o3"].forEach((k) => {
    const el = document.getElementById(`val-${k}`);
    el.textContent = st[k] ?? "--";
    if (k === "aqi") el.style.color = getAQIColor(st[k]);
  });

  map.flyTo([st.lat, st.lon], 15);

  // Xác định đang ở tab nào
  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";

  if (isDaily) {
    loadDailyHistory(st.name);
  } else {
    loadHourlyHistory(st.name);
  }
}

// --- TẢI DỮ LIỆU HẰNG GIỜ ---
async function loadHourlyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}`
    );
    const d = await res.json();

    if (!d.times || d.times.length === 0) return;

    renderLineChart("chart-pm25", "PM2.5", "#3b82f6", d.times, d.pm25);
    renderLineChart("chart-pm10", "PM10", "#10b981", d.times, d.pm10);
    renderLineChart("chart-no2", "NO₂", "#f59e0b", d.times, d.no2);
    renderLineChart("chart-co", "CO", "#ef4444", d.times, d.co);
    renderLineChart("chart-o3", "O₃", "#8b5cf6", d.times, d.o3);
    renderLineChart("chart-so2", "SO₂", "#6366f1", d.times, d.so2);
  } catch (err) {
    console.error("Lỗi tải hourly:", err);
  }
}

// --- TẢI DỮ LIỆU HẰNG NGÀY (7 ngày gần nhất) ---
async function loadDailyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}&mode=daily`
    );
    const d = await res.json();

    if (!d.dates || d.dates.length === 0) return;

    renderDailyAQIChart(d.dates, d.aqi);

    renderLineChart("daily-pm25", "PM2.5 (24h)", "#3b82f6", d.dates, d.pm25);
    renderLineChart("daily-pm10", "PM10 (24h)", "#10b981", d.dates, d.pm10);
    renderLineChart("daily-no2", "NO₂ (24h)", "#f59e0b", d.dates, d.no2);
    renderLineChart("daily-co", "CO (24h)", "#ef4444", d.dates, d.co);
    renderLineChart("daily-o3", "O₃ (24h)", "#8b5cf6", d.dates, d.o3);
    renderLineChart("daily-so2", "SO₂ (24h)", "#6366f1", d.dates, d.so2);
  } catch (err) {
    console.error("Lỗi tải daily:", err);
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

  if (tab === "daily" && currentStationName) {
    loadDailyHistory(currentStationName);
  } else if (tab === "hourly" && currentStationName) {
    loadHourlyHistory(currentStationName);
  }
});

// --- KHỞI ĐỘNG ---
loadStations();
setInterval(loadStations, 5 * 60 * 1000); // Cập nhật mỗi 5 phút

// Toggle sidebar
document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});
