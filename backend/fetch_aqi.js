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
    name: "Đại sứ quán Mỹ (Láng Hạ)",
    uid: 8641,
    lat: 21.00748,
    lon: 105.80554,
  },
  { name: "Chi cục BVMT (Cầu Giấy)", uid: 3523, lat: 21.03583, lon: 105.79861 },
  { name: "Hàng Đậu", uid: 3524, lat: 21.04172, lon: 105.84917 },
  { name: "Hoàn Kiếm", uid: 3525, lat: 21.02888, lon: 105.85223 },
  { name: "Tây Mỗ", uid: 3526, lat: 21.00503, lon: 105.71204 },
  { name: "Minh Khai - Bắc Từ Liêm", uid: 3527, lat: 21.05362, lon: 105.73548 },
  { name: "Mỗ Lao (Hà Đông)", uid: 3528, lat: 20.97889, lon: 105.77806 },
];

// TỰ ĐỘNG THÊM UID VÀO aqi_sources NẾU THIẾU
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
      console.log(`Thêm UID ${uid} (${stationName}) vào sources`);
    }
  } catch (err) {
    console.error("Lỗi thêm source:", err.message);
  }
}

export async function updateAQIData() {
  if (!TOKEN) {
    console.error("Thiếu AQICN_TOKEN!");
    return;
  }

  console.log(
    `\n🔄 CẬP NHẬT AQI HÀ NỘI – ${new Date().toLocaleString("vi-VN")} (7 trạm)`
  );
  const now = new Date();
  let success = 0;

  for (const station of STATIONS) {
    const { name, uid, lat, lon } = station;
    try {
      // Đảm bảo source tồn tại
      await ensureSourceExists(uid, name);

      // Lấy data trực tiếp bằng UID cứng (siêu nhanh, không fail!)
      const feedUrl = `https://api.waqi.info/feed/@${uid}/?token=${TOKEN}`;
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
        console.warn(`⚠️ API lỗi ${name}: ${feedJson.status || "No data"}`);
      }

      // Lưu DB (luôn ghi, dù null)
      await saveStation(
        station,
        { aqi, pm25, pm10, o3, no2, so2, co },
        now,
        lat,
        lon,
        uid
      );
      await saveHistory(name, { aqi, pm25, pm10, o3, no2, so2, co }, now, uid);

      // Log chi tiết
      if (aqi !== null) {
        const level =
          aqi < 50
            ? "🟢 Tốt"
            : aqi < 100
            ? "🟡 Trung bình"
            : aqi < 150
            ? "🟠 Không lành mạnh"
            : "🔴 Xấu";
        console.log(
          `✅ ${name} → AQI ${aqi} ${level} | PM2.5: ${
            pm25 ?? "-"
          } | UID: ${uid}`
        );
        success++;
      } else {
        console.log(`⏳ Chờ data: ${name}`);
      }
    } catch (err) {
      console.error(`❌ Lỗi ${name}:`, err.message);
      await saveStation(station, null, now, lat, lon, uid);
      await saveHistory(name, null, now, uid);
    }

    // Delay 1.6s an toàn
    await new Promise((r) => setTimeout(r, 1600));
  }

  console.log(
    `\n🎉 HOÀN THÀNH! ${success}/7 trạm OK – Thời gian: ${new Date().toLocaleString(
      "vi-VN"
    )}\n`
  );
}

// saveStation (giữ nguyên, nhưng thêm null check cho uid)
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

// saveHistory (giữ nguyên)
async function saveHistory(name, data, now, station_uid) {
  const { aqi, pm25, pm10, o3, no2, so2, co } = data || {};
  await pool.query(
    `INSERT INTO station_history (station_name, aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station_uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [name, aqi, pm25, pm10, o3, no2, so2, co, now, station_uid]
  );
}
