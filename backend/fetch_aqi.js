import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    lat: 21.00748,
    lon: 105.80554,
    area: "Ba Đình",
  },
  {
    name: "Hoàn Kiếm (Trung tâm)",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },
  {
    name: "Hàng Đậu (Phía Bắc)",
    lat: 21.04172,
    lon: 105.84917,
    area: "Long Biên",
  },
  {
    name: "Thành Công (Cầu Giấy)",
    lat: 21.01952,
    lon: 105.81351,
    area: "Cầu Giấy",
  },
  { name: "Mỗ Lao (Hà Đông)", lat: 20.97889, lon: 105.77806, area: "Hà Đông" },
  { name: "UNIS Hà Đông", lat: 20.97444, lon: 105.78972, area: "Hà Đông Nam" },
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
    const url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;

    try {
      const res = await fetch(url, { timeout: 12000 });
      const json = await res.json();

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`Trạm ${station.name} → không có dữ liệu`);
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

      // 1. Đảm bảo trạm tồn tại (với area sẵn)
      await pool.query(
        `INSERT INTO stations (name, lat, lon, area)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [station.name, station.lat, station.lon, station.area]
      );

      // 2. Cập nhật updated_at
      await pool.query(
        `UPDATE stations SET updated_at = NOW() WHERE name = $1`,
        [station.name]
      );

      // 3. Lưu vào lịch sử
      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1, $2, $3, $4, $5, $6, $7, $8
         FROM stations WHERE name = $9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      const source = d.city?.name || "AQICN Geo";
      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(25)} → AQI ${String(aqi).padStart(
          3
        )} │ PM2.5 ${String(pm25 ?? "-").padStart(4)} │ ${source}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1350));
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${STATIONS.length} trạm cập nhật thành công\n`
  );
}
