import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 8 TRẠM SIÊU ỔN ĐỊNH & CHÍNH XÁC NHẤT HÀ NỘI (đã loại bỏ hoàn toàn UID CEM cũ)
const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    uid: "6748",
    lat: 21.00748,
    lon: 105.80554,
  },
  { name: "UNIS Hà Đông", uid: "8688", lat: 20.97444, lon: 105.78972 },
  { name: "Mỗ Lao - Hà Đông", uid: "100013", lat: 20.97889, lon: 105.77806 },
  { name: "Phạm Văn Đồng", uid: "100014", lat: 21.06611, lon: 105.78944 },
  {
    name: "Hoàn Kiếm (AirVisual)",
    uid: "32391",
    lat: 21.02888,
    lon: 105.85223,
  },
  { name: "Cầu Giấy (AirNet)", uid: "100015", lat: 21.03583, lon: 105.79861 },
  { name: "Long Biên", uid: "100016", lat: 21.03889, lon: 105.86667 },
  { name: "Hà Đông Nam", uid: "100017", lat: 20.96222, lon: 105.76944 },
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
    const url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;

    try {
      const res = await fetch(url, { timeout: 12000 });
      const json = await res.json();

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(
          `Trạm ${station.name} (UID ${station.uid}) → không có dữ liệu`
        );
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

      // 1. Đảm bảo trạm tồn tại
      await pool.query(
        `INSERT INTO stations (name, uid, lat, lon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [station.name, station.uid, station.lat, station.lon]
      );

      // 2. Cập nhật area tự động
      await pool.query(
        `UPDATE stations 
         SET area = CASE
           WHEN name LIKE '%Đại sứ quán Mỹ%' THEN 'Ba Đình - Đống Đa'
           WHEN name LIKE '%UNIS%' OR name LIKE '%Mỗ Lao%' OR name LIKE '%Hà Đông%' THEN 'Hà Đông'
           WHEN name LIKE '%Phạm Văn Đồng%' THEN 'Bắc Từ Liêm'
           WHEN name LIKE '%Hoàn Kiếm%' THEN 'Trung tâm'
           WHEN name LIKE '%Cầu Giấy%' THEN 'Cầu Giấy'
           WHEN name LIKE '%Long Biên%' THEN 'Long Biên'
           ELSE 'Khác'
         END,
         updated_at = NOW()
         WHERE name = $1`,
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

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(30)} → AQI ${String(aqi).padStart(
          3
        )} │ PM2.5 ${String(pm25 ?? "-").padStart(4)}`
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
