// const API_URL = "http://localhost:5000/api/stations";
// const HISTORY_API_URL = "http://localhost:5000/api/history";

const API_URL = "https://hanoi-aqi.onrender.com/api/stations";
const HISTORY_API_URL = "https://hanoi-aqi.onrender.com/api/history";

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

// Hàm vẽ biểu đồ ECharts – ĐÃ HIỂN THỊ NGÀY THÁNG THÔNG MINH
function renderChart(domId, name, color, times, values, fullTimestamps = []) {
  const dom = document.getElementById(domId);
  if (!dom) return;

  if (chartInstances[domId]) {
    chartInstances[domId].dispose();
  }

  const myChart = echarts.init(dom);
  chartInstances[domId] = myChart;

  let xAxisData = times;
  let needShowDate = false;

  if (fullTimestamps && fullTimestamps.length > 0) {
    const firstDate = new Date(fullTimestamps[0]);
    const lastDate = new Date(fullTimestamps[fullTimestamps.length - 1]);
    const hoursDiff = (lastDate - firstDate) / (1000 * 60 * 60);
    const differentDay = firstDate.getDate() !== lastDate.getDate();

    if (hoursDiff > 20 || differentDay) {
      needShowDate = true;
      xAxisData = fullTimestamps.map((ts) => {
        const d = new Date(ts);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}/${month} ${hours}:${minutes}`;
      });
    }
  }

  const option = {
    tooltip: {
      trigger: "axis",
      formatter: function (params) {
        const p = params[0];
        let label = p.name;
        if (needShowDate && fullTimestamps[p.dataIndex]) {
          label = new Date(fullTimestamps[p.dataIndex]).toLocaleString(
            "vi-VN",
            {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          );
        }
        const value =
          p.value !== null && p.value !== undefined ? p.value : "N/A";
        return `<strong>${name}</strong><br/>${label}<br/><b>${value}</b> µg/m³`;
      },
    },
    grid: { left: "10%", right: "5%", top: "15%", bottom: "15%" },
    xAxis: {
      type: "category",
      data: xAxisData,
      boundaryGap: false,
      axisLabel: {
        fontSize: 11,
        color: "#555",
        interval: "auto",
        rotate: needShowDate ? 45 : 0,
        formatter: function (value) {
          return needShowDate ? value : value; // có thể rút gọn thêm nếu cần
        },
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { type: "dashed" } },
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        name: name,
        type: "line",
        data: values,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: color },
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + "cc" },
            { offset: 1, color: color + "11" },
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

      // Danh sách trạm
      const card = document.createElement("li");
      card.className = "station-card";
      card.innerHTML = `
        <span class="st-name">${st.name}</span>
        <span class="st-aqi" style="background-color: ${color}">${st.aqi}</span>
      `;
      card.onclick = () => selectStation(st);
      list.appendChild(card);

      // Marker trên bản đồ
      const marker = L.circleMarker([st.lat, st.lon], {
        color: "white",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
        radius: 11,
      });

      marker.bindPopup(`
        <div style="text-align:center; font-family:system-ui; min-width:120px">
          <b style="font-size:15px">${st.name}</b><br>
          <span style="font-size:26px; font-weight:bold; color:${color}">AQI ${
        st.aqi
      }</span>
          ${st.pm25 ? `<br><small>PM2.5: ${st.pm25} µg/m³</small>` : ""}
        </div>
      `);

      marker.on("click", () => selectStation(st));
      markersLayer.addLayer(marker);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML =
      "<li class='loading' style='color:red'>Lỗi kết nối server</li>";
  }
}

// --- SELECT STATION & LOAD HISTORY ---
async function selectStation(st) {
  document.getElementById("chart-instruction").classList.add("hidden");
  document.getElementById("charts-wrapper").classList.remove("hidden");
  document.getElementById("selected-station-name").innerText = st.name;
  document.getElementById("current-stats").classList.remove("hidden");

  document.getElementById("val-aqi").innerText = st.aqi || "--";
  document.getElementById("val-aqi").style.color = getAQIColor(st.aqi);
  document.getElementById("val-pm25").innerText = st.pm25 ?? "--";
  document.getElementById("val-pm10").innerText = st.pm10 ?? "--";
  document.getElementById("val-no2").innerText = st.no2 ?? "--";
  document.getElementById("val-co").innerText = st.co ?? "--";
  document.getElementById("val-so2").innerText = st.so2 ?? "--";

  map.flyTo([st.lat, st.lon], 14);

  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(st.name)}`
    );
    const data = await res.json();

    if (!data.times || data.times.length === 0) return;

    const fullTimestamps = data.recorded_at || [];

    renderChart(
      "chart-pm25",
      "PM2.5 (Bụi mịn)",
      "#3b82f6",
      data.times,
      data.pm25,
      fullTimestamps
    );
    renderChart(
      "chart-pm10",
      "PM10 (Bụi)",
      "#10b981",
      data.times,
      data.pm10,
      fullTimestamps
    );
    renderChart(
      "chart-no2",
      "NO₂",
      "#f59e0b",
      data.times,
      data.no2,
      fullTimestamps
    );
    renderChart(
      "chart-co",
      "CO",
      "#ef4444",
      data.times,
      data.co,
      fullTimestamps
    );
    renderChart(
      "chart-o3",
      "O₃",
      "#8b5cf6",
      data.times,
      data.o3,
      fullTimestamps
    );
    renderChart(
      "chart-so2",
      "SO₂",
      "#6366f1",
      data.times,
      data.so2,
      fullTimestamps
    );
  } catch (err) {
    console.error("Lỗi tải lịch sử:", err);
  }
}

// Khởi động
loadStations();
setInterval(loadStations, 5 * 60 * 1000);

// Toggle Sidebar
document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});
