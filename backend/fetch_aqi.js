import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// DANH SÁCH TRẠM AQI Ở HÀ NỘI
const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    uid: "6748",
    lat: 21.00748,
    lon: 105.80554,
  },
  {
    name: "Chi cục BVMT (Cầu Giấy)",
    uid: "11161",
    lat: 21.03583,
    lon: 105.79861,
  },
  { name: "Hàng Đậu", uid: "9509", lat: 21.04172, lon: 105.84917 },
  { name: "Hoàn Kiếm", uid: "11158", lat: 21.02888, lon: 105.85223 },
  { name: "Tây Mỗ", uid: "11159", lat: 21.00503, lon: 105.71204 },
  { name: "Thành Công", uid: "11160", lat: 21.01952, lon: 105.81351 },
  {
    name: "Minh Khai (Bắc Từ Liêm)",
    uid: "9510",
    lat: 21.05362,
    lon: 105.73548,
  },
];

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(`\nBắt đầu cập nhật ${STATIONS.length} trạm AQI Hà Nội...`);
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    const url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;

    try {
      const res = await fetch(url, { timeout: 15000 });
      const json = await res.json();

      if (json.status !== "ok" || !json.data) {
        console.warn(
          `Trạm ${station.name} → ${json.status || "không có dữ liệu"}`
        );
        await saveStation(station, null, now);
        await saveHistory(station.name, null, now);
        continue;
      }

      const d = json.data;
      const aqi = d.aqi && !isNaN(d.aqi) ? parseInt(d.aqi, 10) : null;
      const pm25 = d.iaqi?.pm25?.v ?? null;
      const pm10 = d.iaqi?.pm10?.v ?? null;
      const o3 = d.iaqi?.o3?.v ?? null;
      const no2 = d.iaqi?.no2?.v ?? null;
      const so2 = d.iaqi?.so2?.v ?? null;
      const co = d.iaqi?.co?.v ?? null;

      await saveStation(station, { aqi, pm25, pm10, o3, no2, so2, co }, now);
      await saveHistory(
        station.name,
        { aqi, pm25, pm10, o3, no2, so2, co },
        now
      );

      console.log(
        aqi !== null
          ? `ĐÃ CẬP NHẬT ${station.name} → AQI ${aqi} (PM2.5: ${pm25 ?? "N/A"})`
          : `Đã lưu ${station.name} → đang chờ AQI...`
      );
      if (aqi !== null) success++;
    } catch (err) {
      console.error(`Lỗi kết nối ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1400)); // An toàn tuyệt đối
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${STATIONS.length} trạm có AQI hợp lệ.\n`
  );
}

// LƯU STATIONS – ĐÚNG CẤU TRÚC BẢNG CỦA BẠN
async function saveStation(station, data, now) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};

  await pool.query(
    `INSERT INTO stations (name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update, uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (name) DO UPDATE SET
       uid = EXCLUDED.uid,
       pm25 = EXCLUDED.pm25,
       pm10 = EXCLUDED.pm10,
       o3 = EXCLUDED.o3,
       no2 = EXCLUDED.no2,
       so2 = EXCLUDED.so2,
       co = EXCLUDED.co,
       lat = EXCLUDED.lat,
       lon = EXCLUDED.lon,
       last_update = EXCLUDED.last_update,
       aqi = EXCLUDED.aqi`,

    [
      station.name, // ← đúng cột uid
      aqi,
      pm25,
      pm10,
      o3,
      no2,
      so2,
      co,
      station.lat,
      station.lon,
      now,
      station.uid,
    ]
  );
}

// LƯU HISTORY – ĐÚNG CẤU TRÚC BẢNG CỦA BẠN
async function saveHistory(name, data, now) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};

  // Lấy uid từ bảng stations
  const { rows } = await pool.query(
    `SELECT uid FROM stations WHERE name = $1`,
    [name]
  );

  const station_uid = rows[0]?.uid || null;

  await pool.query(
    `INSERT INTO station_history 
     (station_name, aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station_uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [name, aqi, pm25, pm10, o3, no2, so2, co, now, station_uid]
  );
}
// fetch_aqi.js – CHẠY render
