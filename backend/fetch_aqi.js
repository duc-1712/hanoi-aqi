import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// 7 TRẠM TỐI ƯU – 100% UID RIÊNG, KHÔNG BAO GIỜ TRÙNG
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

// TỰ ĐỘNG THÊM UID VÀO BẢNG aqi_sources NẾU CHƯA CÓ → KHÔNG BAO GIỜ LỖI FK NỮA!
async function ensureSourceExists(uid, stationName) {
  if (!uid) return;
  try {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM aqi_sources WHERE uid = $1",
      [uid]
    );
    if (rowCount === 0) {
      await pool.query(
        "INSERT INTO aqi_sources (uid, name, source) VALUES ($1, $2, $3) ON CONFLICT (uid) DO NOTHING",
        [uid, stationName, "aqicn"]
      );
      console.log(
        `Đã tự động thêm UID ${uid} (${stationName}) vào aqi_sources`
      );
    }
  } catch (err) {
    console.error("Lỗi tự động thêm source:", err.message);
  }
}

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN trong .env");
    return;
  }

  console.log(
    `\nBắt đầu cập nhật ${
      STATIONS.length
    } trạm AQI Hà Nội – ${new Date().toLocaleString("vi-VN")}`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let uid = null;
    let usedLat = station.lat;
    let usedLon = station.lon;

    try {
      // 1. Tìm UID bằng keyword
      const searchRes = await fetch(
        `https://api.waqi.info/v2/search/?token=${TOKEN}&keyword=${encodeURIComponent(
          station.searchKeyword
        )}`
      );
      const searchJson = await searchRes.json();

      if (searchJson.status === "ok" && searchJson.data?.[0]?.uid) {
        uid = searchJson.data[0].uid;
        usedLat = searchJson.data[0].geo?.[0] ?? usedLat;
        usedLon = searchJson.data[0].geo?.[1] ?? usedLon;
        console.log(`Tìm thấy UID ${uid} → ${station.name}`);
      } else {
        console.warn(`Không tìm UID → dùng tọa độ: ${station.name}`);
      }

      // 2. Lấy dữ liệu chính thức
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
        console.warn(
          `API lỗi cho ${station.name}:`,
          feedJson.status || feedJson
        );
      }

      // TỰ ĐỘNG THÊM UID VÀO aqi_sources TRƯỚC KHI LƯU
      if (uid) await ensureSourceExists(uid, station.name);

      // Lưu vào DB
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

      // Log đẹp
      if (aqi !== null) {
        console.log(
          `OK ${station.name} → AQI ${aqi} | PM2.5 ${pm25 ?? "-"} | PM10 ${
            pm10 ?? "-"
          } | NO₂ ${no2 ?? "-"} [UID: ${uid || "geo"}]`
        );
        success++;
      } else {
        console.log(`Chờ dữ liệu: ${station.name}`);
      }
    } catch (err) {
      console.error(`Lỗi nghiêm trọng ${station.name}:`, err.message);
      // Vẫn cố lưu (null) để frontend không bị treo
      await saveStation(station, null, now, usedLat, usedLon, uid);
      await saveHistory(station.name, null, now, uid);
    }

    // Delay an toàn
    await new Promise((r) => setTimeout(r, 1600));
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${
      STATIONS.length
    } trạm có AQI – ${new Date().toLocaleString("vi-VN")}\n`
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
    [
      station.name,
      aqi,
      pm25,
      pm10,
      o3,
      no2,
      so2,
      co,
      lat,
      lon,
      now,
      realUid || null,
    ]
  );
}

// Lưu lịch sử
async function saveHistory(name, data, now, station_uid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO station_history (station_name, aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station_uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [name, aqi, pm25, pm10, o3, no2, so2, co, now, station_uid || null]
  );
}
