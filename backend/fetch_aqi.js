import fetch from "node-fetch";
import { pool } from "./db.js";

const AQICN_TOKEN = process.env.AQICN_TOKEN;
const IQAIR_KEY = process.env.IQAIR_API_KEY;

const STATIONS = [
  {
    name: "Trường Quốc tế LHQ (UNIS)",
    uid: "8688",
    lat: 21.081121,
    lon: 105.818031,
    area: "Quận Tây Hồ/Bắc Từ Liêm",
  },
  {
    name: "Hà Nội (Trạm chung)",
    uid: "1583",
    lat: 21.0491,
    lon: 105.8831,
    area: "Trung tâm",
  },
  {
    name: "Chi cục BVMT Hà Nội",
    uid: "13026",
    lat: 21.01525,
    lon: 105.80013,
    area: "Ba Đình",
  },
  {
    name: "UBND P. Minh Khai",
    uid: "13251",
    lat: 21.04975,
    lon: 105.74187,
    area: "Bắc Từ Liêm",
  },
];

const IQAIR_STATIONS = [
  {
    name: "Ba Đình US Embassy (IQAir)",
    area: "Ba Đình",
    lat: 21.03333,
    lon: 105.81722,
  },
];

export async function updateAQIData() {
  const timeStr = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  if (!AQICN_TOKEN && !IQAIR_KEY) {
    console.error(`[${timeStr}] Thiếu Token trong Secret!`);
    return;
  }

  console.log(`\n=== BẮT ĐẦU CẬP NHẬT: ${timeStr} ===\n`);

  let success = 0;
  const allStations = [...STATIONS];
  if (IQAIR_KEY) allStations.push(...IQAIR_STATIONS);

  for (const station of allStations) {
    const recorded_at = new Date();
    let aqi = null,
      pm25 = null,
      pm10 = null,
      o3 = null,
      no2 = null,
      so2 = null,
      co = null;
    let sourceLog = "WAQI";

    try {
      // 1. XỬ LÝ IQAIR
      if (
        IQAIR_KEY &&
        (!station.uid || String(station.uid).startsWith("iqair_"))
      ) {
        sourceLog = "IQAir";
        const cityMap = { "Ba Đình": "Ba Dinh", "Trung tâm": "Hanoi" };
        const city = cityMap[station.area] || "Hanoi";

        const res = await fetch(
          `https://api.airvisual.com/v2/city?city=${encodeURIComponent(city)}&state=Hanoi&country=Vietnam&key=${IQAIR_KEY}`,
        );
        const json = await res.json();

        if (json.status === "success") {
          const d = json.data.current.pollution;
          aqi = Number(d.aqius);
          pm25 = d.pm25 ?? null;
          pm10 = d.pm10 ?? null;
        }
      }
      // 2. XỬ LÝ WAQI
      else if (station.uid && !isNaN(station.uid) && AQICN_TOKEN) {
        sourceLog = "WAQI";
        const res = await fetch(
          `https://api.waqi.info/feed/@${station.uid}/?token=${AQICN_TOKEN}`,
        );
        const json = await res.json();

        if (json.status === "ok") {
          const d = json.data;
          aqi = parseInt(d.aqi, 10);
          pm25 = d.iaqi?.pm25?.v ?? null;
          pm10 = d.iaqi?.pm10?.v ?? null;
          o3 = d.iaqi?.o3?.v ?? null;
          no2 = d.iaqi?.no2?.v ?? null;
          so2 = d.iaqi?.so2?.v ?? null;
          co = d.iaqi?.co?.v ?? null;
        }
      }

      // GHI VÀO DATABASE
      if (aqi !== null && !isNaN(aqi)) {
        // Cập nhật tọa độ/vùng trạm
        await pool.query(
          `INSERT INTO stations (name, lat, lon, area) VALUES ($1,$2,$3,$4)
           ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
          [station.name, station.lat, station.lon, station.area || "Hà Nội"],
        );

        // Lưu lịch sử
        await pool.query(
          `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
           SELECT id, $1,$2,$3,$4,$5,$6,$7,$8 FROM stations WHERE name = $9
           ON CONFLICT (station_id, recorded_at) DO NOTHING`,
          [aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station.name],
        );

        success++;
        console.log(
          `${sourceLog.padEnd(6)} | ${station.name.padEnd(28)} | AQI: ${String(aqi).padStart(3)} | OK`,
        );
      } else {
        console.log(
          `${sourceLog.padEnd(6)} | ${station.name.padEnd(28)} | Không có dữ liệu`,
        );
      }
    } catch (err) {
      console.error(`[LỖI] ${station.name}: ${err.message}`);
    }
  }

  console.log(
    `\n=== HOÀN TẤT: Thành công ${success}/${allStations.length} trạm ===\n`,
  );
}
