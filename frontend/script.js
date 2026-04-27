// --- 1. CONFIG API ---
const API_URL = "/api/stations";
const HISTORY_API_URL = "/api/history";

// --- 2. BIẾN TOÀN CỤC (GIỮ NGUYÊN 100%) ---
let allStations = [];
let chartInstances = {};
let currentStationName = "";

// Các lớp chứa dữ liệu
let markersLayer = L.layerGroup(); // Sẽ dùng lớp này để vẽ 6 trạm chuẩn API
let heatmapLayer = L.layerGroup();
let gadm1_Layer = L.geoJson(null);
let gadm2_Layer = L.geoJson(null);
let gadm3_Layer = L.geoJson(null);

// --- 3. KHỞI TẠO BẢN ĐỒ & TÁCH PANE ---
const map = L.map("map").setView([21.0285, 105.8542], 12);

map.createPane("heatmapPane");
map.getPane("heatmapPane").style.zIndex = 350;
map.getPane("heatmapPane").style.pointerEvents = "none";
map.getPane("heatmapPane").style.filter = "blur(18px)";

const osmTile = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { attribution: "&copy; OpenStreetMap" },
).addTo(map);

// Lớp WMS từ GeoServer (Để ông demo GIS)
const geoserverLayer = L.tileLayer.wms(
  "http://localhost:8080/geoserver/hanoi_aqi/wms",
  {
    layers: "hanoi_aqi:hanoi_aqi_force",
    styles: "style_layer_hanoi_aqi",
    format: "image/png",
    transparent: true,
    version: "1.1.0",
    t: new Date().getTime(),
  },
);

// --- QUAN TRỌNG: CHO HIỆN CẢ 2 LỚP ---
markersLayer.addTo(map); // Hiện marker từ API (Đảm bảo thấy đủ 6 trạm)
gadm1_Layer.addTo(map); // Hiện ranh giới
// geoserverLayer.addTo(map); // Nếu GeoServer localhost bị chặn Mixed Content thì tạm tắt ở đây hoặc bật ở Control Layers

// --- 4. LAYER CONTROL ---
const baseMaps = { "Bản đồ nền": osmTile };
const overlayMaps = {
  "<span style='color: #ef4444'>●</span> Trạm quan trắc (API)": markersLayer,
  "<span style='color: #f59e0b'>✦</span> Bản đồ nhiệt (Heatmap)": heatmapLayer,
  "Cấp 1: Thành phố": gadm1_Layer,
  "Cấp 2: Quận/Huyện": gadm2_Layer,
  "Cấp 3: Phường/Xã": gadm3_Layer,
  "GeoServer WMS (Localhost)": geoserverLayer,
};
L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

// --- 5. HÀM HỖ TRỢ (MÀU SẮC, LỜI KHUYÊN - GIỮ NGUYÊN) ---
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

function getAQIInfo(aqi) {
  if (!aqi || aqi < 5)
    return { level: "Không xác định", advice: "Chưa có dữ liệu đánh giá." };
  if (aqi <= 50)
    return {
      level: "Tốt",
      advice:
        "Không khí trong lành. Bạn có thể hoạt động ngoài trời bình thường.",
    };
  if (aqi <= 100)
    return {
      level: "Trung bình",
      advice:
        "Chất lượng chấp nhận được. Nhóm nhạy cảm nên cân nhắc giảm vận động mạnh ngoài trời.",
    };
  if (aqi <= 150)
    return {
      level: "Kém",
      advice:
        "Nhóm nhạy cảm cần hạn chế ra ngoài. Mọi người nên giảm vận động mạnh khi ở ngoài trời.",
    };
  if (aqi <= 200)
    return {
      level: "Xấu",
      advice:
        "Có hại cho sức khỏe. Bắt buộc đeo khẩu trang chống bụi mịn khi ra đường.",
    };
  if (aqi <= 300)
    return {
      level: "Rất xấu",
      advice: "Cảnh báo khẩn cấp! Người dân nên ở trong nhà, đóng cửa sổ.",
    };
  return {
    level: "Nguy hại",
    advice: "Báo động đỏ! Tuyệt đối không ra ngoài.",
  };
}

// --- 6. VẼ BIỂU ĐỒ (GIỮ NGUYÊN) ---
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
        areaStyle: { opacity: 0.15 },
      },
    ],
  });
  window.addEventListener("resize", () => chart.resize());
}

function renderDailyAQIChart(labels = [], values = []) {
  const dom = document.getElementById("chart-daily-aqi");
  if (!dom) return;
  if (chartInstances["daily-aqi"]) chartInstances["daily-aqi"].dispose();
  const chart = echarts.init(dom);
  chartInstances["daily-aqi"] = chart;
  chart.setOption({
    tooltip: { trigger: "axis", formatter: "<b>AQI {c}</b><br/>{b}" },
    grid: { top: 60, bottom: 80, left: 60, right: 60 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        fontSize: 14,
        fontWeight: "bold",
        interval: 0,
        rotate: labels.length > 5 ? 25 : 0,
      },
    },
    yAxis: { type: "value", min: 0, max: 500, splitNumber: 10 },
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
          formatter: "{c}",
        },
      },
    ],
  });
  window.addEventListener("resize", () => chart.resize());
}

// --- 7. LOAD TRẠM (CHỈNH SỬA: LÀM HIỆN MARKER RÕ NÉT) ---
async function loadStations() {
  const list = document.getElementById("station-list");
  try {
    const res = await fetch(API_URL);
    const stations = await res.json();
    allStations = stations;

    list.innerHTML = "";
    markersLayer.clearLayers();

    stations.forEach((st) => {
      if (!st.aqi || st.aqi < 5) return;
      const color = getAQIColor(st.aqi);
      const aqiClass = getAQIClass(st.aqi);

      // Card bên sidebar
      const li = document.createElement("li");
      li.className = `station-card ${aqiClass}`;
      li.innerHTML = `<div class="st-name">${st.name}</div><div class="st-aqi">${st.aqi}</div>`;
      li.onclick = () => selectStation(st);
      list.appendChild(li);

      // --- SỬA TẠI ĐÂY: Hiện Marker rõ nét thay vì tàng hình ---
      const marker = L.circleMarker([st.lat, st.lon], {
        radius: 12, // Kích thước marker
        weight: 2, // Độ dày viền
        opacity: 1, // Hiện viền
        fillOpacity: 0.8, // Hiện màu ruột rõ ràng
        color: "#ffffff", // Viền trắng cho nổi
        fillColor: color,
      }).addTo(markersLayer);

      const info = getAQIInfo(st.aqi);
      marker.bindPopup(`<div style="text-align:center;font-family:system-ui; min-width: 200px;">
          <b style="font-size: 16px;">${st.name}</b><br>
          <div style="margin: 5px 0;"><span style="font-size:28px;font-weight:900;color:${color}">AQI ${st.aqi}</span></div>
          <div style="background-color: ${color}; color: #fff; padding: 2px 8px; border-radius: 4px; display: inline-block; font-weight: bold;">${info.level}</div>
          <div style="margin-top: 8px; font-size: 13px; color: #333; font-style: italic;">"${info.advice}"</div>
        </div>`);
      marker.on("click", () => selectStation(st));
    });

    loadGADMData(); // Tải ranh giới sau khi trạm xong
  } catch (err) {
    list.innerHTML =
      "<li style='color:red;padding:20px'>Lỗi tải dữ liệu trạm</li>";
  }
}

// --- 8. CHỌN TRẠM & LỜI KHUYÊN (GIỮ NGUYÊN) ---
async function selectStation(st) {
  currentStationName = st.name;
  document.getElementById("chart-instruction").classList.add("hidden");
  document.getElementById("charts-wrapper").classList.remove("hidden");
  document.getElementById("selected-station-name").textContent = st.name;
  document.getElementById("current-stats").classList.remove("hidden");

  const info = getAQIInfo(st.aqi);
  const adviceBox = document.getElementById("aqi-advice-text");
  if (adviceBox) {
    adviceBox.innerHTML = `<div style="padding:15px; border-radius:10px; background:${getAQIColor(st.aqi)}22; border-left:6px solid ${getAQIColor(st.aqi)}; margin-bottom:15px;">
        <h4 style="margin:0; color:${getAQIColor(st.aqi)}">${info.level}</h4>
        <p style="margin:5px 0 0; color:#374151;">${info.advice}</p>
    </div>`;
  }

  ["aqi", "pm25", "pm10", "no2", "co", "so2", "o3"].forEach((k) => {
    const el = document.getElementById(`val-${k}`);
    if (el) {
      el.textContent = st[k] !== null && st[k] !== undefined ? st[k] : "--";
      if (k === "aqi") el.style.color = getAQIColor(st[k]);
    }
  });

  map.flyTo([st.lat, st.lon], 16, { duration: 1.5 });

  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";
  isDaily ? loadDailyHistory(st.name) : loadHourlyHistory(st.name);
}

// --- 9. FETCH LỊCH SỬ (GIỮ NGUYÊN) ---
async function loadHourlyHistory(name) {
  try {
    const res = await fetch(
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}`,
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
      `${HISTORY_API_URL}?name=${encodeURIComponent(name)}&mode=daily`,
    );
    if (!res.ok) {
      renderDailyAQIChart([], []);
      return;
    }
    const d = await res.json();
    renderDailyAQIChart(d.dates || [], d.aqi || []);
  } catch (err) {
    renderDailyAQIChart([], []);
  }
}

// --- 10. GIS - GADM & HEATMAP (GIỮ NGUYÊN) ---
async function loadGADMData() {
  try {
    const [res1, res2, res3] = await Promise.all([
      fetch("geodata/Hanoi_gadm_1.geojson"),
      fetch("geodata/Hanoi_gadm_2.geojson"),
      fetch("geodata/Hanoi_gadm_3.geojson"),
    ]);
    const g1 = await res1.json();
    const g2 = await res2.json();
    const g3 = await res3.json();

    gadm1_Layer
      .setStyle({
        color: "#000",
        weight: 3,
        fillOpacity: 0,
        interactive: false,
      })
      .clearLayers()
      .addData(g1)
      .addTo(map);
    gadm2_Layer
      .setStyle({
        color: "#334155",
        weight: 1.5,
        fillOpacity: 0,
        interactive: false,
      })
      .clearLayers()
      .addData(g2);
    gadm3_Layer
      .setStyle({
        color: "#94a3b8",
        weight: 0.8,
        fillOpacity: 0,
        interactive: false,
      })
      .clearLayers()
      .addData(g3);

    drawHeatmap(g1);
  } catch (err) {
    console.error("Lỗi load GADM:", err);
  }
}

async function drawHeatmap(boundaryData) {
  if (!allStations || allStations.length < 2) return;
  heatmapLayer.clearLayers();
  try {
    const points = turf.featureCollection(
      allStations.map((st) =>
        turf.point([parseFloat(st.lon), parseFloat(st.lat)], {
          aqi: parseFloat(st.aqi),
        }),
      ),
    );
    const grid = turf.interpolate(points, 2, {
      gridType: "points",
      property: "aqi",
      units: "kilometers",
    });
    const clipped = turf.pointsWithinPolygon(grid, boundaryData);

    L.geoJson(clipped, {
      pane: "heatmapPane",
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 35,
          fillColor: getAQIColor(feature.properties.aqi),
          color: "none",
          fillOpacity: 0.2,
        }),
    }).addTo(heatmapLayer);
  } catch (err) {
    console.error("Lỗi vẽ heatmap:", err);
  }
}

// --- 11. KHỞI ĐỘNG & SỰ KIỆN ---
loadStations();
setInterval(loadStations, 5 * 60 * 1000);

document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});

// Chuyển Tab (Giữ nguyên)
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

// Auto select (Giữ nguyên)
setTimeout(() => {
  const firstStation = document.querySelector(".station-card");
  if (firstStation) firstStation.click();
}, 2000);
