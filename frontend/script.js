const API_URL = "http://localhost:5000/api/stations";

// Khởi tạo bản đồ
const map = L.map("map").setView([21.0285, 105.8542], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Hàm lấy màu theo AQI
function getAQIColor(aqi) {
  if (aqi <= 50) return "#00e400";
  if (aqi <= 100) return "#ffff00";
  if (aqi <= 150) return "#ff7e00";
  if (aqi <= 200) return "#ff0000";
  if (aqi <= 300) return "#8f3f97";
  return "#7e0023";
}

const AQI_ADVICE = [
  {
    max: 50,
    advice: "Không khí trong lành, bạn có thể thoải mái hoạt động ngoài trời.",
  },
  {
    max: 100,
    advice:
      "Chất lượng không khí chấp nhận được, nhưng có thể ảnh hưởng đến nhóm nhạy cảm.",
  },
  {
    max: 150,
    advice: "Hạn chế các hoạt động ngoài trời, đặc biệt với nhóm nhạy cảm.",
  },
  {
    max: 200,
    advice: "Không khí xấu, nên tránh các hoạt động ngoài trời.",
  },
  { max: 300, advice: "Không khí rất xấu, mọi người nên ở trong nhà." },
  {
    max: Infinity,
    advice:
      "Không khí nguy hại, nên tránh ra ngoài và sử dụng thiết bị lọc không khí.",
  },
];

function getAQIAdvice(aqi) {
  const adviceObj = AQI_ADVICE.find((a) => aqi <= a.max);
  return adviceObj ? adviceObj.advice : "Không có dữ liệu lời khuyên.";
}

// Tải dữ liệu trạm
async function loadStations() {
  console.log("Đang gọi API tại:", API_URL);
  const list = document.getElementById("station-list");
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const stations = await res.json();
    list.innerHTML = "";
    if (stations.length === 0) {
      list.innerHTML = "<li>Không tìm thấy trạm nào.</li>";
      return;
    }
    stations.forEach((st) => {
      const color = getAQIColor(st.aqi);
      const advice = getAQIAdvice(st.aqi); // Lấy lời khuyên dựa trên AQI
      // Sidebar
      const li = document.createElement("li");
      li.innerHTML = `<b>${st.name}</b><br><span style="color:${color}; font-weight: bold;">AQI: ${st.aqi}</span><br>
            <small><b>Lời khuyên:</b> ${advice}</small>`;
      li.onclick = () => map.setView([st.lat, st.lon], 14);
      list.appendChild(li);
      // Marker
      L.circleMarker([st.lat, st.lon], {
        color: "black",
        weight: 1,
        fillColor: color,
        radius: 10,
        fillOpacity: 0.8,
      })
        .addTo(map)
        .bindPopup(
          `<h3>${st.name}</h3>
             AQI: <b style="color:${color}; font-size: 1.2em;">${
            st.aqi
          }</b><br><hr>
             PM2.5: ${st.pm25 ?? "N/A"} µg/m³<br>
             O₃: ${st.o3 ?? "N/A"}<br>
             CO: ${st.co ?? "N/A"}<br>
             advice: ${advice}<br>
             <small>Cập nhật: ${new Date(st.last_update).toLocaleString(
               "vi-VN"
             )}</small>`
        );
    });
  } catch (error) {
    console.error("LỖI KHI TẢI TRẠM:", error);
    list.innerHTML = "<li>Lỗi khi tải dữ liệu. Vui lòng kiểm tra backend.</li>";
  }
}

loadStations();
setInterval(loadStations, 5 * 60 * 1000);

// Toggle sidebar
const toggleBtn = document.getElementById("toggle-sidebar");
const sidebar = document.getElementById("sidebar");
const container = document.getElementById("container");

toggleBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
  container.classList.toggle("fullscreen");
  map.invalidateSize();
});
