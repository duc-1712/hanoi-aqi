const API_URL = "/api/stations";
const HISTORY_API_URL = "/api/history";
const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const TREND_API_URL = "/api/trend";

let allStations = [];
let stationMarkers = new Map();
let chartInstances = {};
let currentStationName = "";
let searchMarker = null;
let userMarker = null;
let searchTimeout = null;
let gadmLoaded = false;
let layerControl = null;

let markersLayer = L.layerGroup();
let heatmapLayer = L.layerGroup();
let gadm1_Layer = L.geoJson(null);
let gadm2_Layer = L.geoJson(null);
let gadm3_Layer = L.geoJson(null);

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
}).setView([21.0285, 105.8542], 12);

function createMapPanes() {
  map.createPane("heatmapPane");
  map.getPane("heatmapPane").style.zIndex = 300;
  map.getPane("heatmapPane").style.pointerEvents = "none";

  map.createPane("boundaryPane");
  map.getPane("boundaryPane").style.zIndex = 400;
  map.getPane("boundaryPane").style.pointerEvents = "none";

  map.createPane("searchPane");
  map.getPane("searchPane").style.zIndex = 620;

  map.createPane("markerPane");
  map.getPane("markerPane").style.zIndex = 650;
}
createMapPanes();

const osmTile = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  },
).addTo(map);

const geoserverLayer = L.tileLayer.wms(
  "http://localhost:8080/geoserver/hanoi_aqi/wms",
  {
    layers: "hanoi_aqi:hanoi_aqi_force",
    styles: "style_layer_hanoi_aqi",
    format: "image/png",
    transparent: true,
    version: "1.1.0",
    t: new Date().getTime(),
    pane: "heatmapPane",
  },
);

markersLayer.addTo(map);
gadm1_Layer.addTo(map);

function initLayerControl() {
  const baseMaps = {
    "Bản đồ nền": osmTile,
  };

  const overlayMaps = {
    "Trạm quan trắc AQI": markersLayer,
    "Bản đồ nhiệt AQI": heatmapLayer,
    "Cấp 1: Thành phố": gadm1_Layer,
    "Cấp 2: Quận/Huyện": gadm2_Layer,
    "Cấp 3: Phường/Xã": gadm3_Layer,
    // "GeoServer AQI": geoserverLayer,
  };

  if (layerControl) map.removeControl(layerControl);
  layerControl = L.control
    .layers(baseMaps, overlayMaps, {
      collapsed: false,
      position: "topright",
    })
    .addTo(map);
}
initLayerControl();

const aqiLegend = L.control({ position: "topleft" });

aqiLegend.onAdd = function () {
  const div = L.DomUtil.create("div", "aqi-map-legend");
  div.innerHTML = `
    <div class="aqi-legend-title">AQI - Chỉ số chất lượng không khí</div>
    <div class="aqi-legend-bar">
      <div style="background:#00e400">0-50<br><span>Tốt</span></div>
      <div style="background:#ffff00;color:#111">51-100<br><span>Trung bình</span></div>
      <div style="background:#ff7e00">101-150<br><span>Kém</span></div>
      <div style="background:#ff0000">151-200<br><span>Xấu</span></div>
      <div style="background:#8f3f97">201-300<br><span>Rất xấu</span></div>
      <div style="background:#7e0023">300+<br><span>Nguy hại</span></div>
    </div>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
aqiLegend.addTo(map);

L.control
  .scale({
    imperial: false,
    position: "bottomleft",
  })
  .addTo(map);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value, suffix = "") {
  const n = toNumber(value);
  if (n === null) return "--";
  return `${Number.isInteger(n) ? n : n.toFixed(2)}${suffix}`;
}

function getStationTime(st) {
  return (
    st.time ||
    st.updated_at ||
    st.updatedAt ||
    st.created_at ||
    st.createdAt ||
    st.date ||
    "--"
  );
}

function getAQIColor(aqi) {
  const v = toNumber(aqi);
  if (v === null || v < 5) return "#94a3b8";
  if (v <= 50) return "#00e400";
  if (v <= 100) return "#ffff00";
  if (v <= 150) return "#ff7e00";
  if (v <= 200) return "#ff0000";
  if (v <= 300) return "#8f3f97";
  return "#7e0023";
}

function getAQITextColor(aqi) {
  const v = toNumber(aqi);
  if (v !== null && v <= 100) return "#111827";
  return "#ffffff";
}

function getAQIClass(aqi) {
  const v = toNumber(aqi);
  if (v === null || v < 5) return "";
  if (v <= 50) return "aqi-good";
  if (v <= 100) return "aqi-moderate";
  if (v <= 150) return "aqi-unhealthy";
  if (v <= 200) return "aqi-bad";
  if (v <= 300) return "aqi-verybad";
  return "aqi-hazardous";
}

function getAQIInfo(aqi) {
  const v = toNumber(aqi);
  if (v === null || v < 5)
    return { level: "Không xác định", advice: "Chưa có dữ liệu đánh giá." };
  if (v <= 50)
    return {
      level: "Tốt",
      advice: "Không khí trong lành. Có thể hoạt động ngoài trời bình thường.",
    };
  if (v <= 100)
    return {
      level: "Trung bình",
      advice:
        "Chất lượng chấp nhận được. Nhóm nhạy cảm nên giảm vận động mạnh ngoài trời.",
    };
  if (v <= 150)
    return {
      level: "Kém",
      advice:
        "Nhóm nhạy cảm nên hạn chế ra ngoài. Người bình thường nên giảm vận động mạnh.",
    };
  if (v <= 200)
    return {
      level: "Xấu",
      advice:
        "Có hại cho sức khỏe. Nên hạn chế hoạt động ngoài trời và đeo khẩu trang chống bụi mịn.",
    };
  if (v <= 300)
    return {
      level: "Rất xấu",
      advice:
        "Cảnh báo sức khỏe. Nên ở trong nhà, đóng cửa sổ và hạn chế ra ngoài.",
    };
  return {
    level: "Nguy hại",
    advice: "Báo động đỏ. Tránh ra ngoài nếu không thật sự cần thiết.",
  };
}
function getFeatureName(feature) {
  const p = feature.properties || {};
  return (
    p.NAME_3 ||
    p.NAME_2 ||
    p.NAME_1 ||
    p.name ||
    p.NAME ||
    "Khu vực không xác định"
  );
}

function calculateIDWAQI(lat, lon) {
  const validStations = allStations.filter((st) => {
    return (
      st.aqi &&
      Number.isFinite(parseFloat(st.lat)) &&
      Number.isFinite(parseFloat(st.lon))
    );
  });

  if (validStations.length === 0) return null;

  let numerator = 0;
  let denominator = 0;
  let nearestStation = null;
  let nearestDistance = Infinity;

  validStations.forEach((st) => {
    const stLat = parseFloat(st.lat);
    const stLon = parseFloat(st.lon);
    const aqi = parseFloat(st.aqi);

    let distance = calculateDistance(lat, lon, stLat, stLon);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStation = st;
    }

    // Nếu tâm vùng gần sát trạm thì lấy luôn AQI trạm đó
    if (distance < 0.1) distance = 0.1;

    const weight = 1 / Math.pow(distance, 2);

    numerator += aqi * weight;
    denominator += weight;
  });

  const estimatedAQI = Math.round(numerator / denominator);

  return {
    aqi: estimatedAQI,
    nearestStation,
    nearestDistance,
  };
}

function getFeatureCenter(feature) {
  try {
    const center = turf.center(feature);
    return {
      lat: center.geometry.coordinates[1],
      lon: center.geometry.coordinates[0],
    };
  } catch (err) {
    const bounds = L.geoJSON(feature).getBounds();
    const center = bounds.getCenter();
    return {
      lat: center.lat,
      lon: center.lng,
    };
  }
}

function styleGADMByAQI(feature, level = 2) {
  const center = getFeatureCenter(feature);
  const result = calculateIDWAQI(center.lat, center.lon);

  const aqi = result?.aqi ?? null;
  const color = getAQIColor(aqi);

  feature.properties.estimated_aqi = aqi;
  feature.properties.nearest_station = result?.nearestStation?.name || "--";
  feature.properties.nearest_distance = result?.nearestDistance || null;

  return {
    pane: "boundaryPane",
    color: level === 1 ? "#1e3a8a" : level === 2 ? "#334155" : "#64748b",
    weight: level === 1 ? 2.5 : level === 2 ? 1.4 : 0.8,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: level === 1 ? 0.08 : level === 2 ? 0.18 : 0.12,
    interactive: true,
  };
}

function onEachGADMFeature(feature, layer) {
  const name = getFeatureName(feature);
  const aqi = feature.properties.estimated_aqi;
  const info = getAQIInfo(aqi);
  const color = getAQIColor(aqi);
  const nearest = feature.properties.nearest_station;
  const distance = feature.properties.nearest_distance;

  layer.bindPopup(`
    <div style="font-family:Inter,system-ui;min-width:260px;">
      <div style="font-size:17px;font-weight:900;text-align:center;margin-bottom:8px;">
        ${name}
      </div>

      <div style="text-align:center;margin-bottom:10px;">
        <div style="font-size:30px;font-weight:900;color:${color};">
          AQI ${aqi ?? "--"}
        </div>
        <div style="
          display:inline-block;
          background:${color};
          color:${aqi <= 100 ? "#111" : "#fff"};
          padding:4px 10px;
          border-radius:999px;
          font-weight:800;
          font-size:12px;
        ">
          ${info.level}
        </div>
      </div>

      <div style="background:#f8fafc;border-radius:10px;padding:10px;margin-bottom:8px;">
        <b>Phương pháp:</b> IDW - nội suy khoảng cách nghịch đảo<br>
        <b>Dữ liệu:</b> AQI hiện tại từ các trạm quan trắc
      </div>

      <div style="font-size:13px;color:#334155;line-height:1.5;">
        <b>Trạm gần nhất:</b> ${nearest}<br>
        <b>Khoảng cách:</b> ${distance ? distance.toFixed(2) + " km" : "--"}<br>
        <b>Ghi chú:</b> Giá trị AQI là ước lượng không gian, không phải số đo trực tiếp tại toàn bộ khu vực.
      </div>
    </div>
  `);

  layer.on({
    mouseover: function () {
      layer.setStyle({
        weight: 3,
        color: "#2563eb",
        fillOpacity: 0.48,
      });
      layer.bringToFront();
    },
    mouseout: function () {
      const parentLayer = gadm3_Layer.hasLayer(layer)
        ? gadm3_Layer
        : gadm2_Layer.hasLayer(layer)
          ? gadm2_Layer
          : gadm1_Layer;

      parentLayer.resetStyle(layer);
    },
    click: function () {
      layer.openPopup();
    },
  });
  addGADMLabel(feature, layer);
}
function addGADMLabel(feature, parentLayer) {
  const aqi = feature.properties.estimated_aqi;

  if (!aqi) return;

  const center = getFeatureCenter(feature);

  const color = getAQIColor(aqi);
  const textColor = getAQITextColor(aqi);

  const label = L.marker([center.lat, center.lon], {
    interactive: false,
    zIndexOffset: 9999,

    icon: L.divIcon({
      className: "gadm-aqi-label",
      html: `
        <div style="
          background:${color};
          color:${textColor};
          border:2px solid white;
          border-radius:999px;
          padding:4px 10px;
          font-size:13px;
          font-weight:900;
          box-shadow:0 2px 8px rgba(0,0,0,.25);
          white-space:nowrap;
        ">
          ${aqi}
        </div>
      `,
      iconSize: [60, 28],
      iconAnchor: [30, 14],
    }),
  });

  parentLayer._aqiLabel = label;

  if (map.hasLayer(gadm2_Layer) || map.hasLayer(gadm3_Layer)) {
    label.addTo(map);
  }
}
function injectImprovedCSS() {
  const style = document.createElement("style");
  style.textContent = `
    .aqi-map-legend {
      background: rgba(255,255,255,.94);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,.22);
      padding: 8px;
      min-width: 450px;
      font-family: Inter, system-ui, sans-serif;
      border: 1px solid rgba(15,23,42,.08);
    }
    .aqi-legend-title {
      font-weight: 800;
      font-size: 12px;
      color: #111827;
      margin-bottom: 5px;
    }
    .aqi-legend-bar {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      overflow: hidden;
      border-radius: 4px;
      border: 1px solid rgba(0,0,0,.12);
    }
    .aqi-legend-bar div {
      text-align: center;
      color: #fff;
      font-weight: 900;
      font-size: 12px;
      line-height: 1.15;
      padding: 4px 6px;
      text-shadow: 0 1px 1px rgba(0,0,0,.35);
    }
    .aqi-legend-bar div span {
      display: block;
      font-size: 10px;
      font-weight: 700;
      margin-top: 2px;
      text-shadow: none;
    }
    .aqi-marker-wrap {
      background: transparent;
      border: none;
    }
    .aqi-marker {
      min-width: 42px;
      height: 36px;
      padding: 0 6px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid #fff;
      box-shadow: 0 6px 16px rgba(0,0,0,.35);
      font-weight: 900;
      font-size: 15px;
      position: relative;
      transform: translateY(-5px);
    }
    .aqi-marker:after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -10px;
      transform: translateX(-50%);
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 10px solid currentColor;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,.25));
    }
    .aqi-marker.active {
      transform: translateY(-5px) scale(1.18);
      box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 0 0 5px rgba(37,99,235,.20);
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px;
    }
    .station-popup {
      min-width: 250px;
      font-family: Inter, system-ui, sans-serif;
    }
    .station-popup-title {
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      color: #111827;
      margin-bottom: 8px;
    }
    .station-popup-aqi {
      text-align: center;
      font-size: 32px;
      font-weight: 900;
      margin: 4px 0;
    }
    .station-popup-level {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 12px;
      margin: 0 auto 10px;
    }
    .station-popup-center {
      text-align: center;
    }
    .station-popup-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin: 10px 0;
    }
    .station-popup-grid div {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 9px;
      padding: 7px;
      text-align: center;
    }
    .station-popup-grid span {
      display: block;
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
    }
    .station-popup-grid strong {
      display: block;
      font-size: 15px;
      color: #1e40af;
      margin-top: 2px;
    }
    .station-popup-advice {
      margin-top: 8px;
      color: #374151;
      font-size: 12px;
      line-height: 1.4;
      font-style: italic;
    }
    .station-popup-time {
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }
    .nearest-box {
      margin-top: 10px;
      padding: 10px;
      border-radius: 10px;
      background: #eff6ff;
      border-left: 5px solid #2563eb;
      color: #1e3a8a;
      font-size: 13px;
      line-height: 1.4;
    }
    .station-card.active {
      outline: 3px solid rgba(37,99,235,.25);
      transform: translateX(3px);
    }
    @media (max-width: 760px) {
      .aqi-map-legend { min-width: 310px; }
      .aqi-legend-bar div { font-size: 10px; padding: 3px 2px; }
      .aqi-legend-bar div span { font-size: 8px; }
    }
  `;
  document.head.appendChild(style);
}
injectImprovedCSS();

function getPollutantLimit(title) {
  const key = String(title).toLowerCase();
  if (key.includes("pm2.5")) return 50;
  if (key.includes("pm10")) return 100;
  if (key.includes("no")) return 200;
  if (key.includes("o₃") || key.includes("o3")) return 200;
  if (key.includes("so")) return 350;
  if (key.includes("co")) return 30000;
  return null;
}

function renderLineChart(domId, title, color, labels, values) {
  const dom = document.getElementById(domId);
  if (!dom) return;

  if (chartInstances[domId]) chartInstances[domId].dispose();

  const chart = echarts.init(dom);
  chartInstances[domId] = chart;

  const cleanValues = (values || []).map((v) => {
    const n = toNumber(v);
    return n === null ? null : n;
  });

  const limit = getPollutantLimit(title);
  const startValue = Math.max(
    0,
    100 -
      Math.min(
        100,
        ((labels || []).length ? 35 / (labels || []).length : 1) * 100,
      ),
  );

  chart.setOption({
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15,23,42,.92)",
      borderWidth: 0,
      textStyle: { color: "#fff" },
      formatter(params) {
        const p = params?.[0];
        if (!p) return "";
        return `<b>${p.axisValue}</b><br/>${title}: <b>${p.data ?? "--"}</b> µg/m³`;
      },
    },
    toolbox: {
      right: 12,
      top: 0,
      feature: {
        dataZoom: {
          yAxisIndex: "none",
          title: { zoom: "Phóng to", back: "Hoàn tác" },
        },
        restore: { title: "Khôi phục" },
        saveAsImage: { title: "Lưu ảnh" },
      },
    },
    grid: { top: 44, bottom: 70, left: 58, right: 28 },
    xAxis: {
      type: "category",
      data: labels || [],
      boundaryGap: false,
      axisLabel: { rotate: 25, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: `Nồng độ ${title} (µg/m³)`,
      nameLocation: "middle",
      nameGap: 42,
      splitLine: { lineStyle: { color: "#e5e7eb" } },
    },
    dataZoom: [
      {
        type: "inside",
        start: startValue,
        end: 100,
      },
      {
        type: "slider",
        height: 24,
        bottom: 18,
        start: startValue,
        end: 100,
        borderColor: "#e5e7eb",
        fillerColor: "rgba(37,99,235,.18)",
        handleSize: "90%",
      },
    ],
    series: [
      {
        name: title,
        type: "line",
        smooth: true,
        symbol: "none",
        sampling: "lttb",
        data: cleanValues,
        itemStyle: { color },
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.16 },
        markLine: limit
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { type: "dashed", width: 2, color: "#ef4444" },
              label: { formatter: `QCVN ${limit}`, color: "#ef4444" },
              data: [{ yAxis: limit }],
            }
          : undefined,
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

  const startValue = Math.max(
    0,
    100 - Math.min(100, (7 / Math.max(labels.length, 1)) * 100),
  );

  chart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: "<b>AQI {c}</b><br/>{b}",
    },
    grid: { top: 50, bottom: 76, left: 60, right: 30 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        fontSize: 12,
        interval: 0,
        rotate: labels.length > 5 ? 25 : 0,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 500,
      splitNumber: 10,
      name: "AQI",
      nameLocation: "middle",
      nameGap: 42,
    },
    dataZoom: [
      { type: "inside", start: startValue, end: 100 },
      {
        type: "slider",
        height: 24,
        bottom: 18,
        start: startValue,
        end: 100,
      },
    ],
    series: [
      {
        type: "bar",
        barWidth: "65%",
        data: values.map((v) => ({
          value: v || 0,
          itemStyle: { color: getAQIColor(v) },
        })),
        label: {
          show: true,
          position: "top",
          fontSize: 14,
          fontWeight: "bold",
          formatter: "{c}",
        },
      },
    ],
  });

  window.addEventListener("resize", () => chart.resize());
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function searchLocations(query) {
  const resultsDiv = document.getElementById("search-results");
  if (!query || query.trim().length < 2 || !resultsDiv) {
    resultsDiv?.classList.add("hidden");
    return;
  }

  resultsDiv.classList.remove("hidden");
  resultsDiv.innerHTML = '<div class="search-loading">Đang tìm kiếm...</div>';

  try {
    const response = await fetch(
      `${NOMINATIM_API}?format=json&q=${encodeURIComponent(query)}&viewbox=105.5,20.8,106.2,21.4&bounded=1&limit=8&accept-language=vi`,
    );
    const results = await response.json();

    if (!results || results.length === 0) {
      resultsDiv.innerHTML =
        '<div class="search-no-results">Không tìm thấy kết quả</div>';
      return;
    }

    resultsDiv.innerHTML = results
      .map((result, index) => {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        const name = escapeHtml(result.display_name);
        return `
          <div class="search-result-item" data-index="${index}" data-lat="${lat}" data-lon="${lon}" data-name="${name}">
            <div class="result-name">${name}</div>
            <div class="result-coords">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
          </div>
        `;
      })
      .join("");

    resultsDiv.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", () => {
        selectSearchLocation(
          parseFloat(item.dataset.lat),
          parseFloat(item.dataset.lon),
          item.dataset.name,
        );
      });
    });
  } catch (error) {
    console.error("Lỗi tìm kiếm:", error);
    resultsDiv.innerHTML =
      '<div class="search-no-results">Lỗi tìm kiếm, vui lòng thử lại</div>';
  }
}

function selectSearchLocation(lat, lon, displayName) {
  if (searchMarker) map.removeLayer(searchMarker);

  searchMarker = L.circleMarker([lat, lon], {
    pane: "searchPane",
    radius: 12,
    weight: 3,
    opacity: 1,
    fillOpacity: 0.92,
    color: "#ffffff",
    fillColor: "#a855f7",
  }).addTo(map);

  const nearest = getNearestStation(lat, lon);
  const nearestHtml = nearest
    ? `<div class="nearest-box">
        <b>Trạm gần nhất:</b> ${escapeHtml(nearest.station.name)}<br>
        <b>Khoảng cách:</b> ${nearest.distance.toFixed(2)} km<br>
        <b>AQI:</b> ${nearest.station.aqi} - ${getAQIInfo(nearest.station.aqi).level}
      </div>`
    : "";

  searchMarker
    .bindPopup(
      `<div style="font-family:Inter,system-ui;min-width:240px;">
      <b style="font-size:15px;">${escapeHtml(displayName)}</b>
      <div style="margin-top:5px;font-size:12px;color:#64748b;">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
      ${nearestHtml}
    </div>`,
    )
    .openPopup();

  map.flyTo([lat, lon], 15, { duration: 1.2 });

  if (nearest) {
    selectStation(nearest.station, { fly: false, openPopup: false });
  }

  document.getElementById("search-results")?.classList.add("hidden");
  const input = document.getElementById("location-search");
  if (input) input.value = displayName;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestStation(lat, lon) {
  if (!allStations || allStations.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;

  allStations.forEach((station) => {
    const stLat = parseFloat(station.lat);
    const stLon = parseFloat(station.lon);
    if (!Number.isFinite(stLat) || !Number.isFinite(stLon)) return;

    const distance = calculateDistance(lat, lon, stLat, stLon);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  });

  return nearest ? { station: nearest, distance: minDistance } : null;
}

function findNearestToLocation(lat, lon) {
  const nearest = getNearestStation(lat, lon);
  if (!nearest) return;

  selectStation(nearest.station);

  const marker = stationMarkers.get(nearest.station.name);
  if (marker) {
    marker.openPopup();
  }
}

function findNearest() {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ định vị.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      if (userMarker) map.removeLayer(userMarker);

      userMarker = L.circleMarker([lat, lon], {
        pane: "searchPane",
        radius: 12,
        weight: 3,
        color: "#ffffff",
        fillColor: "#2563eb",
        fillOpacity: 0.95,
      }).addTo(map);

      const nearest = getNearestStation(lat, lon);
      const nearestHtml = nearest
        ? `<div class="nearest-box">
            <b>Trạm gần nhất:</b> ${escapeHtml(nearest.station.name)}<br>
            <b>Khoảng cách:</b> ${nearest.distance.toFixed(2)} km<br>
            <b>AQI:</b> ${nearest.station.aqi} - ${getAQIInfo(nearest.station.aqi).level}
          </div>`
        : "";

      userMarker
        .bindPopup(
          `<div style="font-family:Inter,system-ui;min-width:220px;">
          <b>📍 Vị trí của tôi</b>
          ${nearestHtml}
        </div>`,
        )
        .openPopup();

      map.flyTo([lat, lon], 14, { duration: 1.2 });

      if (nearest) selectStation(nearest.station, { fly: false });
    },
    () => {
      alert("Không lấy được vị trí. Hãy cấp quyền Location cho trình duyệt.");
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

function buildStationPopup(st) {
  const color = getAQIColor(st.aqi);
  const textColor = getAQITextColor(st.aqi);
  const info = getAQIInfo(st.aqi);

  return `
    <div class="station-popup">
      <div class="station-popup-title">${escapeHtml(st.name)}</div>

      <div class="station-popup-center">
        <div class="station-popup-aqi" style="color:${color};">AQI ${formatValue(st.aqi)}</div>
        <div class="station-popup-level" style="background:${color};color:${textColor};">${info.level}</div>
      </div>

      <div class="station-popup-grid">
        <div><span>PM2.5</span><strong>${formatValue(st.pm25, " µg/m³")}</strong></div>
        <div><span>PM10</span><strong>${formatValue(st.pm10, " µg/m³")}</strong></div>
        <div><span>NO₂</span><strong>${formatValue(st.no2, " µg/m³")}</strong></div>
        <div><span>SO₂</span><strong>${formatValue(st.so2, " µg/m³")}</strong></div>
        <div><span>O₃</span><strong>${formatValue(st.o3, " µg/m³")}</strong></div>
        <div><span>CO</span><strong>${formatValue(st.co, " µg/m³")}</strong></div>
      </div>

      <div class="station-popup-advice">"${info.advice}"</div>
      <div class="station-popup-time">Cập nhật: ${escapeHtml(getStationTime(st))}</div>
    </div>
  `;
}

function createAQIMarker(st) {
  const color = getAQIColor(st.aqi);
  const textColor = getAQITextColor(st.aqi);
  const info = getAQIInfo(st.aqi);

  const icon = L.divIcon({
    className: "aqi-marker-wrap",
    html: `
      <div class="aqi-marker" style="background:${color};color:${color};">
        <span style="color:${textColor};">
          ${formatValue(st.aqi)}
        </span>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 42],
    popupAnchor: [0, -38],
  });

  const marker = L.marker([parseFloat(st.lat), parseFloat(st.lon)], {
    pane: "markerPane",
    icon,
    riseOnHover: true,
    zIndexOffset: 1000,
  }).addTo(markersLayer);

  marker.bindPopup(
    `
    <div style="
      font-family:Inter;
      min-width:250px;
    ">

      <div style="
        font-size:18px;
        font-weight:900;
        margin-bottom:8px;
        text-align:center;
      ">
        ${st.name}
      </div>

      <div style="
        text-align:center;
        margin-bottom:10px;
      ">
        <span style="
          font-size:36px;
          font-weight:900;
          color:${color};
        ">
          AQI ${st.aqi}
        </span>
      </div>

      <div style="
        background:${color};
        color:${st.aqi <= 100 ? "#111" : "#fff"};
        padding:6px 12px;
        border-radius:999px;
        text-align:center;
        font-weight:800;
        margin-bottom:12px;
      ">
        ${info.level}
      </div>

      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        margin-bottom:10px;
      ">

        <div style="
          background:#f8fafc;
          padding:8px;
          border-radius:8px;
          text-align:center;
        ">
          <div style="
            font-size:12px;
            color:#64748b;
          ">
            PM2.5
          </div>

          <div style="font-weight:800">
            ${st.pm25 ?? "--"} µg/m³
          </div>
        </div>

        <div style="
          background:#f8fafc;
          padding:8px;
          border-radius:8px;
          text-align:center;
        ">
          <div style="
            font-size:12px;
            color:#64748b;
          ">
            PM10
          </div>

          <div style="font-weight:800">
            ${st.pm10 ?? "--"} µg/m³
          </div>
        </div>

        <div style="
          background:#f8fafc;
          padding:8px;
          border-radius:8px;
          text-align:center;
        ">
          <div style="
            font-size:12px;
            color:#64748b;
          ">
            NO₂
          </div>

          <div style="font-weight:800">
            ${st.no2 ?? "--"} µg/m³
          </div>
        </div>

        <div style="
          background:#f8fafc;
          padding:8px;
          border-radius:8px;
          text-align:center;
        ">
          <div style="
            font-size:12px;
            color:#64748b;
          ">
            SO₂
          </div>

          <div style="font-weight:800">
            ${st.so2 ?? "--"} µg/m³
          </div>
        </div>

      </div>

      <div style="
        font-size:13px;
        color:#374151;
        line-height:1.5;
        font-style:italic;
      ">
        "${info.advice}"
      </div>

      <div style="
        margin-top:10px;
        font-size:11px;
        color:#64748b;
        text-align:center;
      ">
        Cập nhật: ${getStationTime(st)}
      </div>

    </div>
  `,
    {
      maxWidth: 320,
      closeButton: true,
    },
  );

  marker.on("click", () => {
    selectStation(st, {
      fly: false,
      openPopup: false,
    });
  });

  marker.on("mouseover", () => {
    marker.setZIndexOffset(2000);
  });

  marker.on("mouseout", () => {
    marker.setZIndexOffset(1000);
  });

  return marker;
}

function setActiveStation(name) {
  document.querySelectorAll(".station-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.stationName === name);
  });

  stationMarkers.forEach((marker, markerName) => {
    const el = marker.getElement();
    const inner = el?.querySelector(".aqi-marker");
    if (inner) inner.classList.toggle("active", markerName === name);
  });
}

async function loadStations() {
  const list = document.getElementById("station-list");

  try {
    const res = await fetch(API_URL);
    const stations = await res.json();

    allStations = Array.isArray(stations)
      ? stations.filter((st) => {
          const aqi = toNumber(st.aqi);

          // Không có AQI
          if (aqi === null) return false;

          // API trả "-"
          if (st.aqi === "-" || st.aqi === "--") return false;

          // AQI bất thường
          if (aqi > 500) return false;

          // AQI quá thấp bất thường
          if (aqi < 5) return false;

          // Lấy thời gian cập nhật
          const timeRaw =
            st.time?.s ||
            st.time ||
            st.updated_at ||
            st.updatedAt ||
            st.created_at ||
            st.createdAt ||
            st.date ||
            null;

          // Nếu có thời gian thì kiểm tra
          if (timeRaw) {
            const lastTime = new Date(timeRaw);

            if (!Number.isNaN(lastTime.getTime())) {
              const now = new Date();

              const diffHours = (now - lastTime) / (1000 * 60 * 60);

              // Dữ liệu cũ quá 24h → ẩn
              if (diffHours > 24) {
                return false;
              }
            }
          }

          return true;
        })
      : [];

    list.innerHTML = "";
    markersLayer.clearLayers();
    stationMarkers.clear();

    allStations.forEach((st) => {
      const color = getAQIColor(st.aqi);
      const aqiClass = getAQIClass(st.aqi);
      const info = getAQIInfo(st.aqi);

      const li = document.createElement("li");
      li.className = `station-card ${aqiClass}`;
      li.dataset.stationName = st.name;
      li.innerHTML = `
        <div class="st-name">
          ${escapeHtml(st.name)}
          <small style="display:block;color:#64748b;font-weight:600;margin-top:4px;">
            ${info.level} • ${escapeHtml(getStationTime(st))}
          </small>
        </div>
        <div class="st-aqi" style="background:${color};color:${getAQITextColor(st.aqi)}">${formatValue(st.aqi)}</div>
      `;

      li.addEventListener("click", () => {
        selectStation(st);
        const marker = stationMarkers.get(st.name);
        if (marker) marker.openPopup();
      });

      li.addEventListener("mouseenter", () => {
        const marker = stationMarkers.get(st.name);
        if (marker) marker.setZIndexOffset(2500);
      });

      li.addEventListener("mouseleave", () => {
        const marker = stationMarkers.get(st.name);
        if (marker) marker.setZIndexOffset(1000);
      });

      list.appendChild(li);

      const marker = createAQIMarker(st);
      stationMarkers.set(st.name, marker);
    });

    if (!gadmLoaded) {
      loadGADMData();
      gadmLoaded = true;
    } else {
      drawHeatmap();
    }

    if (currentStationName) setActiveStation(currentStationName);
  } catch (err) {
    console.error("Lỗi tải trạm:", err);
    if (list)
      list.innerHTML =
        "<li style='color:red;padding:20px'>Lỗi tải dữ liệu trạm</li>";
  }
}

async function selectStation(st, options = {}) {
  const { fly = true, openPopup = false } = options;

  currentStationName = st.name;
  setActiveStation(st.name);

  document.getElementById("chart-instruction")?.classList.add("hidden");
  document.getElementById("charts-wrapper")?.classList.remove("hidden");

  const selectedNameEl = document.getElementById("selected-station-name");
  if (selectedNameEl) selectedNameEl.textContent = st.name;

  document.getElementById("current-stats")?.classList.remove("hidden");

  const info = getAQIInfo(st.aqi);
  const color = getAQIColor(st.aqi);

  const adviceBox = document.getElementById("aqi-advice-text");
  if (adviceBox) {
    adviceBox.innerHTML = `
      <div style="padding:15px;border-radius:12px;background:${color}22;border-left:6px solid ${color};margin-bottom:15px;">
        <h4 style="margin:0;color:${color};font-weight:900">${info.level}</h4>
        <p style="margin:5px 0 0;color:#374151;">${info.advice}</p>
      </div>
    `;
  }

  ["aqi", "pm25", "pm10", "no2", "co", "so2", "o3"].forEach((k) => {
    const el = document.getElementById(`val-${k}`);
    if (!el) return;
    el.textContent = formatValue(st[k]);
    if (k === "aqi") el.style.color = getAQIColor(st[k]);
  });

  const lat = parseFloat(st.lat);
  const lon = parseFloat(st.lon);

  if (fly && Number.isFinite(lat) && Number.isFinite(lon)) {
    map.flyTo([lat, lon], 15, { duration: 1.1 });
  }

  const marker = stationMarkers.get(st.name);
  if (openPopup && marker) marker.openPopup();

  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";
  isDaily ? loadDailyHistory(st.name) : loadHourlyHistory(st.name);
}

let currentHistoryRange = "30d";

function buildHistoryUrl(name, mode = "") {
  const from = document.getElementById("history-from")?.value;
  const to = document.getElementById("history-to")?.value;

  let url = `${HISTORY_API_URL}?name=${encodeURIComponent(name)}`;

  if (mode) url += `&mode=${mode}`;

  if (from && to) {
    url += `&from=${from}&to=${to}`;
  } else {
    url += `&range=${currentHistoryRange}`;
  }

  return url;
}

async function loadHourlyHistory(name) {
  try {
    const res = await fetch(buildHistoryUrl(name));
    const d = await res.json();

    renderLineChart(
      "chart-pm25",
      "PM2.5",
      "#3b82f6",
      d.times || [],
      d.pm25 || [],
    );
    renderLineChart(
      "chart-pm10",
      "PM10",
      "#10b981",
      d.times || [],
      d.pm10 || [],
    );
    renderLineChart("chart-no2", "NO₂", "#f59e0b", d.times || [], d.no2 || []);
    renderLineChart("chart-co", "CO", "#ef4444", d.times || [], d.co || []);
    renderLineChart("chart-o3", "O₃", "#8b5cf6", d.times || [], d.o3 || []);
    renderLineChart("chart-so2", "SO₂", "#6366f1", d.times || [], d.so2 || []);
  } catch (err) {
    console.error("Lỗi hourly:", err);
  }
}

async function loadDailyHistory(name) {
  try {
    const res = await fetch(buildHistoryUrl(name, "daily"));
    const d = await res.json();

    renderDailyAQIChart(d.dates || [], d.aqi || []);
  } catch (err) {
    console.error("Lỗi daily:", err);
    renderDailyAQIChart([], []);
  }
}
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

    gadm1_Layer.clearLayers();
    gadm2_Layer.clearLayers();
    gadm3_Layer.clearLayers();

    gadm1_Layer = L.geoJson(g1, {
      pane: "boundaryPane",
      style: (feature) => styleGADMByAQI(feature, 1),
      onEachFeature: onEachGADMFeature,
    });

    gadm2_Layer = L.geoJson(g2, {
      pane: "boundaryPane",
      style: (feature) => styleGADMByAQI(feature, 2),
      onEachFeature: onEachGADMFeature,
    });

    gadm3_Layer = L.geoJson(g3, {
      pane: "boundaryPane",
      style: (feature) => styleGADMByAQI(feature, 3),
      onEachFeature: onEachGADMFeature,
    });

    // Mặc định chỉ bật cấp 2 cho dễ nhìn
    if (map.hasLayer(gadm1_Layer)) map.removeLayer(gadm1_Layer);
    if (map.hasLayer(gadm3_Layer)) map.removeLayer(gadm3_Layer);

    gadm2_Layer.addTo(map);
    gadm2_Layer.eachLayer((layer) => {
      if (layer._aqiLabel) layer._aqiLabel.addTo(map);
    });
    // Cập nhật lại layer control để nhận layer mới
    if (layerControl) {
      map.removeControl(layerControl);
    }

    const baseMaps = {
      "Bản đồ nền": osmTile,
    };

    const overlayMaps = {
      "Trạm quan trắc AQI": markersLayer,
      "Bản đồ nhiệt AQI": heatmapLayer,
      "Cấp 1: Thành phố": gadm1_Layer,
      "Cấp 2: Quận/Huyện - AQI ước lượng": gadm2_Layer,
      "Cấp 3: Phường/Xã - AQI ước lượng": gadm3_Layer,
      "GeoServer AQI": geoserverLayer,
    };

    layerControl = L.control
      .layers(baseMaps, overlayMaps, {
        collapsed: false,
        position: "topright",
      })
      .addTo(map);
    map.on("overlayadd", function (e) {
      if (
        e.layer === gadm1_Layer ||
        e.layer === gadm2_Layer ||
        e.layer === gadm3_Layer
      ) {
        e.layer.eachLayer((layer) => {
          if (layer._aqiLabel) {
            layer._aqiLabel.addTo(map);
          }
        });
      }
    });

    map.on("overlayremove", function (e) {
      if (
        e.layer === gadm1_Layer ||
        e.layer === gadm2_Layer ||
        e.layer === gadm3_Layer
      ) {
        e.layer.eachLayer((layer) => {
          if (layer._aqiLabel) {
            map.removeLayer(layer._aqiLabel);
          }
        });
      }
    });
    drawHeatmap();
  } catch (err) {
    console.error("Lỗi load GADM:", err);
  }
}
function drawHeatmap() {
  if (!allStations || allStations.length < 2) return;

  heatmapLayer.clearLayers();

  const validStations = allStations.filter((st) => {
    const aqi = toNumber(st.aqi);

    return (
      aqi !== null &&
      aqi >= 5 &&
      aqi <= 500 &&
      Number.isFinite(parseFloat(st.lat)) &&
      Number.isFinite(parseFloat(st.lon))
    );
  });

  if (validStations.length < 2) return;

  const heatPoints = validStations.map((st) => {
    const aqi = toNumber(st.aqi);

    let intensity = aqi / 200;

    if (intensity < 0.25) intensity = 0.25;
    if (intensity > 1) intensity = 1;

    return [parseFloat(st.lat), parseFloat(st.lon), intensity];
  });

  if (typeof L.heatLayer === "function") {
    const heat = L.heatLayer(heatPoints, {
      pane: "heatmapPane",
      radius: 70,
      blur: 28,
      maxZoom: 14,
      minOpacity: 0.45,
      gradient: {
        0.15: "#00e400",
        0.35: "#ffff00",
        0.55: "#ff7e00",
        0.75: "#ff0000",
        0.9: "#8f3f97",
        1.0: "#7e0023",
      },
    });

    heatmapLayer.addLayer(heat);
    return;
  }

  try {
    const points = turf.featureCollection(
      validStations.map((st) =>
        turf.point([parseFloat(st.lon), parseFloat(st.lat)], {
          aqi: toNumber(st.aqi),
        }),
      ),
    );

    const grid = turf.interpolate(points, 1.2, {
      gridType: "points",
      property: "aqi",
      units: "kilometers",
      weight: 3,
    });

    const heatFallback = L.geoJson(grid, {
      pane: "heatmapPane",
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          pane: "heatmapPane",
          radius: 55,
          fillColor: getAQIColor(feature.properties.aqi),
          color: "transparent",
          fillOpacity: 0.28,
          interactive: false,
        }),
    });

    heatmapLayer.addLayer(heatFallback);
  } catch (err) {
    console.error("Lỗi vẽ heatmap fallback:", err);
  }
}
const searchInput = document.getElementById("location-search");
const clearBtn = document.getElementById("clear-search");
const resultsDiv = document.getElementById("search-results");

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();

    if (clearBtn) clearBtn.style.display = query.length > 0 ? "flex" : "none";
    if (!query.length) resultsDiv?.classList.add("hidden");

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchLocations(query), 300);
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    resultsDiv?.classList.add("hidden");
    if (searchMarker) {
      map.removeLayer(searchMarker);
      searchMarker = null;
    }
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) {
    resultsDiv?.classList.add("hidden");
  }
});

loadStations();
setInterval(loadStations, 5 * 60 * 1000);

document.getElementById("toggle-sidebar")?.addEventListener("click", () => {
  document.getElementById("sidebar")?.classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 300);
});

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
  document.getElementById(`tab-${tab}`)?.classList.add("active");

  if (currentStationName) {
    if (tab === "daily") {
      currentHistoryRange = "30d";
    } else {
      currentHistoryRange = "7d";
    }

    document.querySelectorAll(".range-btn").forEach((btn) => {
      btn.classList.remove("active");
      if (btn.dataset.range === currentHistoryRange) {
        btn.classList.add("active");
      }
    });

    document.getElementById("history-from").value = "";
    document.getElementById("history-to").value = "";

    tab === "daily"
      ? loadDailyHistory(currentStationName)
      : loadHourlyHistory(currentStationName);
  }
});

setTimeout(() => {
  if (allStations.length > 0) {
    selectStation(allStations[0], { fly: false, openPopup: false });
  }
}, 1200);

document.addEventListener("click", (e) => {
  if (!e.target.matches(".range-btn")) return;

  currentHistoryRange = e.target.dataset.range;

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  e.target.classList.add("active");

  document.getElementById("history-from").value = "";
  document.getElementById("history-to").value = "";

  if (!currentStationName) return;

  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";

  isDaily
    ? loadDailyHistory(currentStationName)
    : loadHourlyHistory(currentStationName);
});

document.getElementById("btn-load-history")?.addEventListener("click", () => {
  if (!currentStationName) return;

  const isDaily =
    document.querySelector(".tab-btn.active")?.dataset.tab === "daily";

  isDaily
    ? loadDailyHistory(currentStationName)
    : loadHourlyHistory(currentStationName);
});
window.findNearest = function () {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ định vị.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      let nearest = null;
      let minDistance = Infinity;

      allStations.forEach((st) => {
        const distance = calculateDistance(
          lat,
          lon,
          parseFloat(st.lat),
          parseFloat(st.lon),
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearest = st;
        }
      });

      if (nearest) {
        selectStation(nearest);

        const marker = stationMarkers?.get(nearest.name);
        if (marker) marker.openPopup();

        alert(
          `Trạm gần nhất: ${nearest.name}\nKhoảng cách: ${minDistance.toFixed(
            2,
          )} km\nAQI: ${nearest.aqi}`,
        );
      }
    },
    () => {
      alert("Không lấy được vị trí. Hãy cấp quyền định vị cho trình duyệt.");
    },
  );
};
