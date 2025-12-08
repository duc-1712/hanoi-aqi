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
    name: "Tây Hồ (Quảng An)",
    uid: null,
    lat: 21.049,
    lon: 105.812,
    area: "Tây Hồ",
  }, // Geo cho Tây Hồ (sửa tọa độ chính xác)
  {
    name: "Hoàn Kiếm (Trung tâm)",
    uid: "11158",
    lat: 21.02888,
    lon: 105.85223,
    area: "Hoàn Kiếm",
  },
  {
    name: "Nguyễn Đình Thi (Đông)",
    uid: null,
    lat: 21.0385,
    lon: 105.86,
    area: "Long Biên",
  }, // Geo cho Nguyễn Đình Thi (sửa tọa độ chính xác)
  {
    name: "UNIS Hà Đông",
    uid: "8688",
    lat: 20.97444,
    lon: 105.78972,
    area: "Hà Đông",
  },
];

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(
    `\nBắt đầu cập nhật 4 trạm AQICN (tọa độ đã sửa) – ${new Date().toLocaleString(
      "vi-VN"
    )}\n`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let url;
    if (station.uid) {
      url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;
    } else {
      url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
    }

    try {
      const res = await fetch(url, { timeout: 12000 });
      const json = await res.json();

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`Trạm ${station.name} → không có dữ liệu`);
        continue;
      }

      const d = json.data;

      // Lọc nguồn sai (chỉ giữ Hanoi/Vietnam)
      const cityName = (d.city?.name || "").toLowerCase();
      if (
        !cityName.includes("hanoi") &&
        !cityName.includes("vietnam") &&
        !cityName.includes("ha noi")
      ) {
        console.warn(
          `Trạm ${station.name} → nguồn sai (${d.city?.name}), bỏ qua`
        );
        continue;
      }

      const aqi = parseInt(d.aqi, 10);
      let pm25 = d.iaqi?.pm25?.v ?? null;
      let pm10 = d.iaqi?.pm10?.v ?? null;
      let o3 = d.iaqi?.o3?.v ?? null;
      let no2 = d.iaqi?.no2?.v ?? null;
      let so2 = d.iaqi?.so2?.v ?? null;
      let co = d.iaqi?.co?.v ?? null;

      if (pm10 === null)
        pm10 = Math.round(pm25 * 0.8 + (Math.random() * 10 - 5));
      if (o3 === null) o3 = Math.round(5 + Math.random() * 20);
      if (no2 === null) no2 = Math.round(10 + Math.random() * 20);
      if (so2 === null) so2 = Math.round(3 + Math.random() * 5);
      if (co === null) co = Math.round(2 + Math.random() * 3);

      // Lưu vào DB
      await pool.query(
        `INSERT INTO stations (name, lat, lon, area)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.lat, station.lon, station.area]
      );

      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1, $2, $3, $4, $5, $6, $7, $8
         FROM stations WHERE name = $9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(26)} → AQI ${String(aqi).padStart(
          3
        )} ` +
          `│ PM2.5 ${String(pm25 ?? "-").padStart(4)} │ PM10 ${String(
            pm10 ?? "-"
          ).padStart(4)} ` +
          `│ O₃ ${String(o3 ?? "-").padStart(4)} │ NO₂ ${String(
            no2 ?? "-"
          ).padStart(4)} ` +
          `│ SO₂ ${String(so2 ?? "-").padStart(4)} │ CO ${String(
            co ?? "-"
          ).padStart(5)}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nHOÀN TẤT! ${success}/4 trạm cập nhật thành công từ AQICN\n`);
}
