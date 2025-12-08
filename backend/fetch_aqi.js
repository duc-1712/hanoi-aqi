import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 7 TRẠM TỐI ƯU – ĐÃ TEST 100% CÓ UID RIÊNG, KHÔNG TRÙNG
const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    searchKeyword: "Hanoi US Embassy",
    lat: 21.00748,
    lon: 105.80554,
  },
  {
    name: "Chi cục BVMT (Cầu Giấy)",
    searchKeyword: "Ha Noi/Chi Cuc Bvmt",
    lat: 21.03583,
    lon: 105.79861,
  },
  {
    name: "Hàng Đậu",
    searchKeyword: "Ha Noi/Hang Dau",
    lat: 21.04172,
    lon: 105.84917,
  },
  {
    name: "Hoàn Kiếm",
    searchKeyword: "Ha Noi/Hoan Kiem",
    lat: 21.02888,
    lon: 105.85223,
  },
  {
    name: "Tây Mỗ",
    searchKeyword: "Ha Noi/Tay Mo",
    lat: 21.00503,
    lon: 105.71204,
  },
  {
    name: "Minh Khai - Bắc Từ Liêm",
    searchKeyword: "Ha Noi/Minh Khai",
    lat: 21.05362,
    lon: 105.73548,
  },
  {
    name: "Mỗ Lao (Hà Đông)",
    searchKeyword: "Ha Noi/Mo Lao",
    lat: 20.97889,
    lon: 105.77806,
  },
];

export async function updateAQIData() {
  if (!TOKEN) return console.error("Thiếu AQICN_TOKEN trong .env");

  console.log(`\nBắt đầu cập nhật ${STATIONS.length} trạm AQI Hà Nội...`);
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let uid = null;
    let usedLat = station.lat;
    let usedLon = station.lon;

    try {
      // 1. Tìm UID chính xác bằng keyword (sẽ thành công 100% với 7 trạm này)
      const searchUrl = `https://api.waqi.info/v2/search/?token=${TOKEN}&keyword=${encodeURIComponent(
        station.searchKeyword
      )}`;
      const searchRes = await fetch(searchUrl);
      const searchJson = await searchRes.json();

      if (searchJson.status === "ok" && searchJson.data?.[0]?.uid) {
        const result = searchJson.data[0];
        uid = result.uid;
        usedLat = result.geo?.[0] ?? usedLat;
        usedLon = result.geo?.[1] ?? usedLon;
        console.log(`Tìm thấy UID ${uid} cho ${station.name}`);
      } else {
        console.warn(`Không tìm thấy UID cho ${station.name} → dùng tọa độ`);
      }

      // 2. Lấy dữ liệu chính thức bằng UID (ưu tiên) hoặc geo
      const feedUrl = uid
        ? `https://api.waqi.info/feed/@${uid}/?token=${TOKEN}`
        : `https://api.waqi.info/feed/geo:${usedLat};${usedLon}/?token=${TOKEN}`;

      const feedRes = await fetch(feedUrl);
      const feedJson = await feedRes.json();

      let aqi = null,
        pm25 = null,
        pm10 = null,
        o3 = null,
        no2 = null,
        so2 = null,
        co = null;

      if (feedJson.status === "ok" && feedJson.data) {
        const d = feedJson.data;
        aqi = d.aqi && !isNaN(d.aqi) ? parseInt(d.aqi, 10) : null;
        pm25 = d.iaqi?.pm25?.v ?? null;
        pm10 = d.iaqi?.pm10?.v ?? null;
        o3 = d.iaqi?.o3?.v ?? null;
        no2 = d.iaqi?.no2?.v ?? null;
        so2 = d.iaqi?.so2?.v ?? null;
        co = d.iaqi?.co?.v ?? null;
      } else {
        console.warn(`API trả lỗi cho ${station.name}:`, feedJson);
      }

      // Lưu DB
      await saveStation(
        station,
        { aqi, pm25, pm10, o3, no2, so2, co },
        now,
        usedLat,
        usedLon,
        uid
      );
      await saveHistory(
        station.name,
        { aqi, pm25, pm10, o3, no2, so2, co },
        now,
        uid
      );

      console.log(
        aqi
          ? `OK ${station.name} → AQI ${aqi} | PM2.5: ${pm25 ?? "-"} | PM10: ${
              pm10 ?? "-"
            } | NO₂: ${no2 ?? "-"} [UID: ${uid || "geo"}]`
          : `Chờ ${station.name} (không có dữ liệu)`
      );
      if (aqi) success++;
    } catch (err) {
      console.error(`Lỗi nghiêm trọng ${station.name}:`, err.message);
      await saveStation(station, null, now, usedLat, usedLon, uid);
      await saveHistory(station.name, null, now, uid);
    }

    // Delay nhẹ để không vượt rate limit (khoảng 40–50 request/phút là an toàn)
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${STATIONS.length} trạm có AQI thành công.\n`
  );
}

// Lưu bảng stations
async function saveStation(station, data, now, lat, lon, realUid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO stations (name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update, uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (name) DO UPDATE SET
       aqi=EXCLUDED.aqi, pm25=EXCLUDED.pm25, pm10=EXCLUDED.pm10,
       o3=EXCLUDED.o3, no2=EXCLUDED.no2, so2=EXCLUDED.so2, co=EXCLUDED.co,
       lat=EXCLUDED.lat, lon=EXCLUDED.lon, last_update=EXCLUDED.last_update, uid=EXCLUDED.uid`,
    [station.name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, now, realUid]
  );
}

// Lưu lịch sử
async function saveHistory(name, data, now, station_uid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO station_history (station_name, aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station_uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [name, aqi, pm25, pm10, o3, no2, so2, co, now, station_uid]
  );
}
