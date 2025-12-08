// Nguồn: aqicn.org/data-platform/api (token của bạn đã sẵn)
// Trạm 1: US Embassy (UID 6748) – Luôn realtime, nguồn US EPA
// Trạm 2: UNIS Hanoi (UID 8688) – Trạm trường quốc tế, cao nhất Hà Nội
// Trạm 3: Hanoi aggregate (UID H1583) – Tổng hợp CEM chính thức
// Trạm 4: Hoan Kiem AirVisual (UID 32391) – Nguồn AirVisual, ổn định nội thành

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
    name: "Đại sứ quán Mỹ (Ba Đình)",
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
    name: "Hanoi Tổng hợp (CEM)",
    uid: "H1583",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },
  {
    name: "Hoàn Kiếm (AirVisual)",
    uid: "32391",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },
];

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(
    `\nBắt đầu cập nhật ${
      STATIONS.length
    } trạm từ AQICN – ${new Date().toLocaleString("vi-VN")}\n`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let url = `https://api.waqi.info/feed/@${station.uid}/?token=${TOKEN}`;

    try {
      let res = await fetch(url, { timeout: 12000 });
      let json = await res.json();

      // Fallback geo nếu UID offline (hiếm với 4 UID này)
      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`UID ${station.uid} (${station.name}) → fallback geo`);
        url = `https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${TOKEN}`;
        res = await fetch(url, { timeout: 12000 });
        json = await res.json();
      }

      if (json.status !== "ok" || !json.data || json.data.aqi == null) {
        console.warn(`Trạm ${station.name} → không có dữ liệu`);
        continue;
      }

      const d = json.data;

      // Lọc nguồn sai (bỏ Spain/Shanghai)
      const cityName = (d.city?.name || "").toLowerCase();
      if (!cityName.includes("hanoi") && !cityName.includes("vietnam")) {
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

      // Đảm bảo trạm tồn tại
      await pool.query(
        `INSERT INTO stations (name, uid, lat, lon, area)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.uid, station.lat, station.lon, station.area]
      );

      // Lưu đầy đủ chỉ số
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
          ).padStart(5)} ` +
          `| UID: ${station.uid}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${STATIONS.length} trạm cập nhật thành công từ AQICN\n`
  );
}
