const API_URL = "http://localhost:5000/api/stations";
const HISTORY_API_URL = "http://localhost:5000/api/history";

// MAP SETUP
const map = L.map("map").setView([21.0285, 105.8542], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);
const markersLayer = L.layerGroup().addTo(map);

let chartInstances = {};

// --- HELPER FUNCTIONS ---
function getAQIColor(aqi) {
  if (aqi <= 50) return "#00e400";
  if (aqi <= 100) return "#ffff00";
  if (aqi <= 150) return "#ff7e00";
  if (aqi <= 200) return "#ff0000";
  if (aqi <= 300) return "#8f3f97";
  return "#7e0023";
}

// Hàm vẽ biểu đồ ECharts
function renderChart(domId, name, color, times, values) {
  const dom = document.getElementById(domId);
  if (!dom) return;

  if (chartInstances[domId]) {
    chartInstances[domId].dispose();
  }

  const myChart = echarts.init(dom);
  chartInstances[domId] = myChart;

  const option = {
    tooltip: { trigger: "axis" },
    grid: { left: "10%", right: "5%", top: "10%", bottom: "15%" },
    xAxis: { type: "category", data: times, boundaryGap: false },
    yAxis: { type: "value", splitLine: { lineStyle: { type: "dashed" } } },
    series: [
      {
        name: name,
        type: "line",
        data: values,
        smooth: true,
        itemStyle: { color: color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color },
            { offset: 1, color: "#fff" },
          ]),
        },
      },
    ],
  };
  myChart.setOption(option);
  window.addEventListener("resize", () => myChart.resize());
}

// --- LOAD STATION DATA ---
async function loadStations() {
  const list = document.getElementById("station-list");
  try {
    const res = await fetch(API_URL);
    const stations = await res.json();

    list.innerHTML = "";
    markersLayer.clearLayers();

    if (stations.length === 0) {
      list.innerHTML = "<li class='loading'>Không có dữ liệu trạm.</li>";
      return;
    }

    stations.forEach((st) => {
      const color = getAQIColor(st.aqi);

      // 1. Tạo thẻ trong danh sách
      const card = document.createElement("li");
      card.className = "station-card";
      card.innerHTML = `
                <span class="st-name">${st.name}</span>
                <span class="st-aqi" style="background-color: ${color}">${st.aqi}</span>
            `;
      card.onclick = () => selectStation(st);
      list.appendChild(card);

      // 2. Tạo Marker trên bản đồ
      const marker = L.circleMarker([st.lat, st.lon], {
        color: "white",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.8,
        radius: 10,
      });

      // Popup đơn giản
      marker.bindPopup(`
  <div style="text-align:center; font-family: system-ui">
    <b style="font-size:15px">${st.name}</b><br>
    <span style="font-size:24px; font-weight:bold; color:${color}">
      AQI ${st.aqi}
    </span>
    ${st.pm25 ? `<br>PM2.5: ${st.pm25} µg/m³` : ""}
  </div>
`);
      marker.on("click", () => selectStation(st));
      markersLayer.addLayer(marker);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML =
      "<li class='loading' style='color:red'>Lỗi kết nối Server</li>";
  }
}

// --- SELECT STATION & LOAD HISTORY ---
async function selectStation(st) {
  // UI Updates
  document.getElementById("chart-instruction").classList.add("hidden");
  document.getElementById("charts-wrapper").classList.remove("hidden");
  document.getElementById("selected-station-name").innerText = st.name;
  document.getElementById("current-stats").classList.remove("hidden");

  // Update Current Stats Panel
  document.getElementById("val-aqi").innerText = st.aqi;
  document.getElementById("val-aqi").style.color = getAQIColor(st.aqi);
  document.getElementById("val-pm25").innerText = st.pm25 ?? "--";
  document.getElementById("val-pm10").innerText = st.pm10 ?? "--";
  document.getElementById("val-no2").innerText = st.no2 ?? "--";
  document.getElementById("val-co").innerText = st.co ?? "--";
  document.getElementById("val-so2").innerText = st.so2 ?? "--";

  // Zoom map
  map.flyTo([st.lat, st.lon], 14);

  // Load History Data
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(st.name)}`
    );
    const data = await res.json();

    if (data.times && data.times.length > 0) {
      // Vẽ các biểu đồ con
      renderChart("chart-pm25", "PM2.5", "#3b82f6", data.times, data.pm25);
      renderChart("chart-pm10", "PM10", "#10b981", data.times, data.pm10); // Dùng data.pm10 nếu backend trả về, tạm thời fetch_aqi chưa có pm10 lịch sử thì nó sẽ rỗng
      renderChart("chart-no2", "NO2", "#f59e0b", data.times, data.no2);
      renderChart("chart-co", "CO", "#ef4444", data.times, data.co);
      renderChart("chart-o3", "O3", "#8b5cf6", data.times, data.o3);
      renderChart("chart-so2", "SO2", "#6366f1", data.times, data.so2);
    }
  } catch (err) {
    console.error("Lỗi tải lịch sử:", err);
  }
}

// Init
loadStations();
setInterval(loadStations, 5 * 60 * 1000);

// Toggle Sidebar
const toggleBtn = document.getElementById("toggle-sidebar");
const sidebar = document.getElementById("sidebar");
toggleBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});
