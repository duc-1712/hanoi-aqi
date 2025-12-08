import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 6 TRẠM ĐÚNG THEO ẢNH BẠN CHỤP – TỌA ĐỘ + TÊN CHUẨN 100%
const STATIONS = [
  { name: "UNIS Hà Đông", lat: 20.97444, lon: 105.78972, area: "Hà Đông" }, // AQI 229 – khớp ảnh
  { name: "Mỗ Lao - Hà Đông", lat: 20.97889, lon: 105.77806, area: "Hà Đông" }, // AQI 246 – khớp ảnh
  {
    name: "Phùng Hưng (Hoàn Kiếm)",
    lat: 21.033,
    lon: 105.846,
    area: "Hoàn Kiếm",
  }, // AQI 172 – khớp ảnh
  {
    name: "Hàng Đậu (Long Biên)",
    lat: 21.04172,
    lon: 105.84917,
    area: "Long Biên",
  }, // AQI 191 – khớp ảnh
  { name: "Cầu Giấy", lat: 21.03583, lon: 105.79861, area: "Cầu Giấy" }, // AQI 154 – khớp ảnh
  { name: "Công viên Nhân Chính", lat: 21.008, lon: 105.8, area: "Thanh Xuân" }, // AQI 155 – khớp ảnh Duy Tiến
];

export async function updateAQIData() {
  if (!TOKEN) return console.error("Thiếu AQICN_TOKEN");

  console.log(
    `\nBắt đầu cập nhật 6 trạm AQICN chuẩn như ảnh – ${new Date().toLocaleString(
      "vi-VN"
    )}\n`
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

      // Lưu DB
      await pool.query(
        `INSERT INTO stations (name, lat, lon, area)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.lat, station.lon, station.area]
      );

      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1, $2, $3, $4, $5, $6, $7, $8 FROM stations WHERE name = $9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(28)} → AQI ${String(aqi).padStart(
          3
        )} │ PM2.5 ${String(pm25 ?? "-").padStart(4)}`
      );
      success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nHOÀN TẤT! ${success}/6 trạm cập nhật thành công\n`);
}
