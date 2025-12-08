// fetch_aqi.js – KẾT HỢP AQICN + OPENAQ ĐỂ LẤY DỮ LIỆU AQI CHO HÀ NỘI

import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// Hàm tính AQI từ PM2.5 (EPA) – dùng cho OpenAQ
function calculateAQI(pm25) {
  if (pm25 <= 12) return Math.round((50 / 12) * pm25);
  if (pm25 <= 35.4) return Math.round(50 + (pm25 - 12) * (50 / 23.4));
  if (pm25 <= 55.4) return Math.round(100 + (pm25 - 35.5) * (50 / 19.9));
  if (pm25 <= 150.4) return Math.round(150 + (pm25 - 55.5) * (50 / 94.9));
  if (pm25 <= 250.4) return Math.round(200 + (pm25 - 150.5) * (100 / 99.9));
  return Math.round(300 + (pm25 - 250.5) * (200 / 249.5));
}

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(
    `\nBắt đầu cập nhật AQICN + OpenAQ – ${new Date().toLocaleString(
      "vi-VN"
    )}\n`
  );
  const now = new Date();
  let success = 0;

  // === 1. LẤY 2 TRẠM TỪ AQICN (UNIS & Hanoi CEM) ===
  const aqicnStations = [
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
  ];

  for (const station of aqicnStations) {
    try {
      let url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;
      let res = await fetch(url, { timeout: 12000 });
      let json = await res.json();

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`AQICN ${station.name} → fallback geo`);
        url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
        res = await fetch(url, { timeout: 12000 });
        json = await res.json();
      }

      if (json.status !== "ok" || !json.data || json.data.aqi == null) continue;

      const d = json.data;
      const city = (d.city?.name || "").toLowerCase();
      if (!city.includes("hanoi") && !city.includes("vietnam")) continue;

      const aqi = parseInt(d.aqi, 10);
      const pm25 = d.iaqi?.pm25?.v ?? null;

      await pool.query(
        `INSERT INTO stations (name, lat, lon, area) VALUES ($1,$2,$3,$4)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.lat, station.lon, station.area]
      );

      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, recorded_at)
         SELECT id, $1, $2, $3 FROM stations WHERE name = $4
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(20)} → AQI ${aqi} │ PM2.5 ${
          pm25 ?? "-"
        } | Nguồn: AQICN`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi AQICN ${station.name}:`, err.message);
    }
  }

  // === 2. LẤY 4 TRẠM TỪ OPENAQ (CEM realtime) ===
  try {
    const openaqUrl =
      "https://api.openaq.org/v2/latest?city=Hanoi&parameter=pm25&limit=20";
    const res = await fetch(openaqUrl);
    const json = await res.json();

    if (json.results && json.results.length > 0) {
      let count = 0;
      for (const result of json.results) {
        if (count >= 4) break; // Chỉ lấy 4 trạm đầu

        const measurement = result.measurements.find(
          (m) => m.parameter === "pm25"
        );
        if (!measurement || measurement.value == null) continue;

        const pm25 = measurement.value;
        const aqi = calculateAQI(pm25);
        const name = result.location || `Trạm OpenAQ ${count + 1}`;
        const lat = result.coordinates?.latitude;
        const lon = result.coordinates?.longitude;

        if (!lat || !lon) continue;

        await pool.query(
          `INSERT INTO stations (name, lat, lon, area) VALUES ($1,$2,$3,$4)
           ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
          [name, lat, lon, "Hà Nội"]
        );

        await pool.query(
          `INSERT INTO station_history (station_id, aqi, pm25, recorded_at)
           SELECT id, $1, $2, $3 FROM stations WHERE name = $4
           ON CONFLICT (station_id, recorded_at) DO NOTHING`,
          [aqi, pm25, now, name]
        );

        console.log(
          `ĐÃ CẬP NHẬT ${name.padEnd(20)} → AQI ${aqi} │ PM2.5 ${pm25.toFixed(
            1
          )} | Nguồn: OpenAQ`
        );
        success++;
        count++;
      }
    }
  } catch (err) {
    console.error("Lỗi OpenAQ:", err.message);
  }

  console.log(
    `\nHOÀN TẤT! ${success} trạm cập nhật thành công (AQICN + OpenAQ)\n`
  );
}
