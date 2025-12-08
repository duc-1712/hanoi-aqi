// fetch_aqi.js – ĐÃ SỬA LỖI "inconsistent types" – CHẠY NGON 100% TRÊN RENDER
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
  { name: "UNIS Hà Đông", uid: "8688", lat: 20.97444, lon: 105.78972 },
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
    let url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;

    try {
      let res = await fetch(url, { timeout: 12000 });
      let json = await res.json();

      // Fallback geo nếu UID không có data
      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(
          `UID ${station.uid} (${station.name}) → dùng geo fallback`
        );
        url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
        res = await fetch(url, { timeout: 12000 });
        json = await res.json();
      }

      if (json.status !== "ok" || !json.data) {
        console.warn(`Không có dữ liệu → ${station.name}`);
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

      // BƯỚC 1: Đảm bảo trạm tồn tại trong bảng stations (chỉ lưu thông tin cố định)
      await pool.query(
        `INSERT INTO stations (name, uid, lat, lon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [station.name, station.uid, station.lat, station.lon]
      );

      // BƯỚC 2: Cập nhật area tự động (chạy riêng để tránh lỗi type)
      await pool.query(
        `UPDATE stations 
         SET area = CASE
           WHEN name LIKE '%Hoàn Kiếm%' THEN 'Trung tâm'
           WHEN name LIKE '%Hàng Đậu%' THEN 'Phía Bắc'
           WHEN name LIKE '%Đại sứ quán Mỹ%' THEN 'Ba Đình - Đống Đa'
           WHEN name LIKE '%Thành Công%' THEN 'Ba Đình'
           WHEN name LIKE '%Cầu Giấy%' THEN 'Cầu Giấy'
           WHEN name LIKE '%Tây Mỗ%' THEN 'Nam Từ Liêm'
           WHEN name LIKE '%Minh Khai%' THEN 'Bắc Từ Liêm'
           WHEN name LIKE '%UNIS%' THEN 'Hà Đông'
           ELSE 'Khác'
         END,
         updated_at = NOW()
         WHERE name = $1`,
        [station.name]
      );

      // BƯỚC 3: Lưu dữ liệu AQI vào lịch sử
      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1, $2, $3, $4, $5, $6, $7, $8
         FROM stations WHERE name = $9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      console.log(
        aqi !== null
          ? `ĐÃ CẬP NHẬT ${station.name.padEnd(28)} → AQI ${String(
              aqi
            ).padStart(3)} │ PM2.5 ${String(pm25 ?? "-").padStart(4)}`
          : `Đã lưu ${station.name.padEnd(28)} → đang chờ AQI...`
      );
      if (aqi !== null) success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1400));
  }

  console.log(`\nHOÀN TẤT! ${success}/${STATIONS.length} trạm có AQI hợp lệ\n`);
}
