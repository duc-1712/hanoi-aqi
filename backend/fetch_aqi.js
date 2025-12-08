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
    name: "Đại sứ quán Mỹ",
    uid: "6748",
    lat: 21.00748,
    lon: 105.80554,
    area: "Ba Đình",
  },
  {
    name: "UNIS Hà Đông",
    uid: "8688",
    lat: 20.97444,
    lon: 105.78972,
    area: "Hà Đông",
  },
  {
    name: "Mỗ Lao (AirNet)",
    uid: "100013",
    lat: 20.97889,
    lon: 105.77806,
    area: "Hà Đông",
  }, // UID này đang hoạt động lại!
  {
    name: "Phạm Văn Đồng",
    uid: "32392",
    lat: 21.06611,
    lon: 105.78944,
    area: "Bắc Từ Liêm",
  }, // UID PurpleAir chính xác
  {
    name: "Hoàn Kiếm (CEM)",
    uid: "11158",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  }, // UID CEM này vẫn còn data (hiện 189)
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
      const aqi = parseInt(d.aqi, 10);
      const pm25 = d.iaqi?.pm25?.v ?? null;

      // 1. Đảm bảo trạm tồn tại
      await pool.query(
        `INSERT INTO stations (name, uid, lat, lon, area)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET area = EXCLUDED.area`,
        [station.name, station.uid, station.lat, station.lon, station.area]
      );

      // 2. Lưu lịch sử
      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, recorded_at)
         SELECT id, $1, $2, $3 FROM stations WHERE name = $4
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(25)} → AQI ${String(aqi).padStart(
          3
        )} │ PM2.5 ${String(pm25 ?? "-").padStart(4)}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1400));
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${STATIONS.length} trạm cập nhật thành công\n`
  );
}
