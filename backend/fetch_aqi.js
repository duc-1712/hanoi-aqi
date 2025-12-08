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
    name: "Hà Nội (CEM)",
    uid: "H1583",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },
  {
    name: "Hoàn Kiếm",
    uid: "32391",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },
];

export async function updateAQIData() {
  if (!TOKEN) return console.error("Thiếu AQICN_TOKEN");

  console.log(
    `\nBắt đầu cập nhật 4 trạm AQICN – ${new Date().toLocaleString("vi-VN")}\n`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;

    try {
      let res = await fetch(url, { timeout: 12000 });
      let json = await res.json();

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`UID ${station.uid} → fallback geo`);
        url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
        res = await fetch(url, { timeout: 12000 });
        json = await res.json();
      }

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`Trạm ${station.name} → không có dữ liệu`);
        continue;
      }

      const d = json.data;
      const city = (d.city?.name || "").toLowerCase();
      if (!city.includes("hanoi") && !city.includes("vietnam")) {
        console.warn(
          `Trạm ${station.name} → nguồn sai (${d.city?.name}), bỏ qua`
        );
        continue;
      }

      const aqi = parseInt(d.aqi, 10);
      const pm25 = d.iaqi?.pm25?.v ?? null;
      const pm10 = d.iaqi?.pm10?.v ?? null;
      const o3 = d.iaqi?.o3?.v ?? null;
      const no2 = d.iaqi?.no2?.v ?? null;
      const so2 = d.iaqi?.so2?.v ?? null;
      const co = d.iaqi?.co?.v ?? null;

      await pool.query(
        `INSERT INTO stations (name, uid, lat, lon, area)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (name) DO UPDATE SET updated_at=NOW()`,
        [station.name, station.uid, station.lat, station.lon, station.area]
      );

      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1,$2,$3,$4,$5,$6,$7,$8 FROM stations WHERE name=$9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(20)} → AQI ${aqi} │ PM2.5 ${
          pm25 ?? "-"
        } | UID: ${station.uid}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nHOÀN TẤT! ${success}/4 trạm cập nhật thành công từ AQICN\n`);
}
