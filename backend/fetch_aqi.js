import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 8 TRẠM TỐI ƯU NHẤT HÀ NỘI 2025 – ĐÃ TEST KHÔNG TRÙNG NHAU
const STATIONS = [
  { name: "Đại sứ quán Mỹ", uid: "6748", lat: 21.00748, lon: 105.80554 },
  { name: "Hoàn Kiếm", uid: "11158", lat: 21.02888, lon: 105.85223 },
  { name: "Hàng Đậu", uid: "9509", lat: 21.04172, lon: 105.84917 },
  { name: "Thành Công", uid: "11160", lat: 21.01952, lon: 105.81351 },
  {
    name: "Chi cục BVMT (Cầu Giấy)",
    uid: "11161",
    lat: 21.03583,
    lon: 105.79861,
  },
  { name: "Tây Mỗ", uid: "11159", lat: 21.00503, lon: 105.71204 },
  {
    name: "Minh Khai (Bắc Từ Liêm)",
    uid: "9510",
    lat: 21.05362,
    lon: 105.73548,
  },
  { name: "UNIS Hà Đông", uid: "8688", lat: 20.97444, lon: 105.78972 }, // trạm cộng đồng mạnh nhất
];

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(
    `\nBắt đầu cập nhật ${
      STATIONS.length
    } trạm AQI Hà Nội – ${new Date().toLocaleString("vi-VN")}\n`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    // Ưu tiên dùng UID
    let url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;
    let usedGeoFallback = false;

    try {
      let res = await fetch(url, { timeout: 12000 });
      let json = await res.json();

      // Nếu UID không có data → tự động fallback sang geo (rất hiếm, nhưng an toàn tuyệt đối)
      if (json.status !== "ok" || !json.data || !json.data.aqi) {
        console.warn(
          `UID ${station.uid} (${station.name}) không có data → chuyển sang geo`
        );
        url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
        res = await fetch(url, { timeout: 12000 });
        json = await res.json();
        usedGeoFallback = true;
      }

      if (json.status !== "ok" || !json.data) {
        console.warn(`Không có dữ liệu → ${station.name}`);
        await saveStation(station, null, now);
        await saveHistory(station.name, null, now);
        continue;
      }

      const d = json.data;
      const aqi = d.aqi && !isNaN(d.aqi) ? parseInt(d.aqi, 10) : null;
      const pm25 = d.iaqi?.pm25?.v ?? null;
      const pm10 = d.iaqi?.pm10?.v ?? null;

      await saveStation(station, { aqi, pm25, pm10 }, now);
      await saveHistory(station.name, { aqi, pm25, pm10 }, now);

      const source = usedGeoFallback
        ? "Geo-fallback"
        : d.city?.name?.split(",")[0] || "AQICN";
      console.log(
        aqi !== null
          ? `ĐÃ CẬP NHẬT ${station.name.padEnd(28)} → AQI ${String(
              aqi
            ).padStart(3)} │ PM2.5 ${String(pm25 ?? "-").padStart(
              4
            )} │ ${source}`
          : `Đã lưu ${station.name.padEnd(28)} → đang chờ AQI...`
      );

      if (aqi !== null) success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1350)); // ~8 request/phút → an toàn với free token
  }

  console.log(`\nHOÀN TẤT! ${success}/${STATIONS.length} trạm có AQI hợp lệ\n`);
}

// Lưu bảng stations (hiện tại)
async function saveStation(station, data, now) {
  const { aqi, pm25, pm10 } = data || {};
  await pool.query(
    `INSERT INTO stations (name, aqi, pm25, pm10, lat, lon, last_update)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (name) DO UPDATE SET
       aqi = EXCLUDED.aqi,
       pm25 = EXCLUDED.pm25,
       pm10 = EXCLUDED.pm10,
       last_update = EXCLUDED.last_update`,
    [station.name, aqi, pm25, pm10, station.lat, station.lon, now]
  );
}

// Lưu lịch sử
async function saveHistory(name, data, now) {
  const { aqi, pm25, pm10 } = data || {};
  await pool.query(
    `INSERT INTO station_history (station_name, aqi, pm25, pm10, recorded_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [name, aqi, pm25, pm10, now]
  );
}
