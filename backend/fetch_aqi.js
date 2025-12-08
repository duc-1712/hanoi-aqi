import fetch from "node-fetch";
import { pool } from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TOKEN = process.env.AQICN_TOKEN;

// DANH SÁCH TRẠM – CHỈ CẦN ĐÚNG TÊN + TỌA ĐỘ
const STATIONS = [
  {
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    searchKeyword: "hanoi us embassy",
    lat: 21.00748,
    lon: 105.80554,
  },
  {
    name: "Chi cục BVMT (Cầu Giấy)",
    searchKeyword: "hanoi chi cuc bvmt cau giay",
    lat: 21.03583,
    lon: 105.79861,
  },
  {
    name: "Hàng Đậu",
    searchKeyword: "hanoi hang dau",
    lat: 21.04172,
    lon: 105.84917,
  },
  {
    name: "Hoàn Kiếm",
    searchKeyword: "hanoi hoan kiem",
    lat: 21.02888,
    lon: 105.85223,
  },
  {
    name: "Tây Mỗ",
    searchKeyword: "hanoi tay mo",
    lat: 21.00503,
    lon: 105.71204,
  },
  {
    name: "Thành Công",
    searchKeyword: "hanoi thanh cong",
    lat: 21.01952,
    lon: 105.81351,
  },
  {
    name: "Minh Khai (Bắc Từ Liêm)",
    searchKeyword: "hanoi minh khai bac tu liem",
    lat: 21.05362,
    lon: 105.73548,
  },
  {
    name: "Mỗ Lao, Hà Đông",
    searchKeyword: "hanoi mo lao ha dong",
    lat: 20.97889,
    lon: 105.77806,
  },
  {
    name: "Phố Nguyễn Duy Trinh",
    searchKeyword: "hanoi nguyen duy trinh",
    lat: 21.01722,
    lon: 105.84722,
  },
  {
    name: "DHBK Parabola (Giải Phóng)",
    searchKeyword: "hanoi giai phong dhbk",
    lat: 21.00694,
    lon: 105.84306,
  },
];

export async function updateAQIData() {
  if (!TOKEN) return console.error("Thiếu AQICN_TOKEN");

  console.log(`\nBắt đầu cập nhật ${STATIONS.length} trạm AQI Hà Nội...`);
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    let uid = null;
    let lat = station.lat;
    let lon = station.lon;

    try {
      // 1. Tìm UID bằng tên
      const searchRes = await fetch(
        `https://api.waqi.info/v2/search/?token=${TOKEN}&keyword=${encodeURIComponent(
          station.searchKeyword
        )}&limit=1`
      );
      const searchJson = await searchRes.json();

      if (searchJson.status === "ok" && searchJson.data?.[0]) {
        uid = searchJson.data[0].uid;
        lat = searchJson.data[0].geo?.[0] || lat;
        lon = searchJson.data[0].geo?.[1] || lon;
      } else {
        // 2. Fallback: dùng tọa độ
        const geoRes = await fetch(
          `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${TOKEN}`
        );
        const geoJson = await geoRes.json();
        if (geoJson.status === "ok") uid = geoJson.data?.uid || null;
      }

      // 3. Lấy dữ liệu AQI
      const feedUrl = uid
        ? `https://api.waqi.info/feed/@${uid}/?token=${TOKEN}`
        : `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${TOKEN}`;
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
      }

      // LƯU VỚI UID THẬT
      await saveStation(
        station,
        { aqi, pm25, pm10, o3, no2, so2, co },
        now,
        lat,
        lon,
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
          ? `OK ${station.name} → AQI ${aqi} (PM2.5: ${pm25 ?? "N/A"}) [UID: ${
              uid || "geo"
            }]`
          : `Chờ ${station.name}...`
      );
      if (aqi) success++;
    } catch (err) {
      console.error(`Lỗi ${station.name}:`, err.message);
      await saveStation(station, null, now, lat, lon, null);
      await saveHistory(station.name, null, now, null);
    }

    await new Promise((r) => setTimeout(r, 1400)); // tránh vượt quota
  }

  console.log(`\nHOÀN TẤT! ${success}/${STATIONS.length} trạm có AQI.\n`);
}

// LƯU STATIONS – DÙNG UID THẬT (realUid)
async function saveStation(station, data, now, lat, lon, realUid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO stations (name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update, uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (name) DO UPDATE SET
       aqi=EXCLUDED.aqi, pm25=EXCLUDED.pm25, pm10=EXCLUDED.pm10,
       o3=EXCLUDED.o3, no2=EXCLUDED.no2, so2=EXCLUDED.so2, co=EXCLUDED.co,
       lat=EXCLUDED.lat, lon=EXCLUDED.lon, last_update=EXCLUDED.last_update,
       uid=EXCLUDED.uid`,
    [station.name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, now, realUid]
  );
}

// LƯU HISTORY
async function saveHistory(name, data, now, station_uid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO station_history (station_name, aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station_uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [name, aqi, pm25, pm10, o3, no2, so2, co, now, station_uid]
  );
}
