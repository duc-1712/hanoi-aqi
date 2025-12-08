import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 6 TRẠM GEO
const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Ba Đình)",
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
  {
    name: "Phạm Văn Đồng (Bắc Liêm)",
    lat: 21.06611,
    lon: 105.78944,
    area: "Bắc Từ Liêm",
  },
  { name: "Mỗ Lao (Hà Đông)", lat: 20.97889, lon: 105.77806, area: "Hà Đông" },
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

      const cityName = (d.city?.name || "").toLowerCase();
      if (
        !cityName.includes("hanoi") &&
        !cityName.includes("vietnam") &&
        !cityName.includes("ha noi")
      ) {
        console.warn(
          `Trạm ${station.name} → nguồn sai (${
            d.city?.name || "unknown"
          }), bỏ qua`
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
        `INSERT INTO stations (name, lat, lon, area)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.lat, station.lon, station.area]
      );

      // Lưu ĐẦY ĐỦ tất cả chỉ số vào lịch sử
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
          `│ PM2.5 ${String(pm25 ?? "-").padStart(4)} ` +
          `│ PM10 ${String(pm10 ?? "-").padStart(4)} ` +
          `│ O₃ ${String(o3 ?? "-").padStart(4)} ` +
          `│ NO₂ ${String(no2 ?? "-").padStart(4)} ` +
          `│ SO₂ ${String(so2 ?? "-").padStart(4)} ` +
          `│ CO ${String(co ?? "-").padStart(5)}`
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
