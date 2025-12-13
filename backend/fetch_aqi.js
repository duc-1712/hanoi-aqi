import fetch from "node-fetch";
import { pool } from "./db.js";

const AQICN_TOKEN = process.env.AQICN_TOKEN;
const IQAIR_KEY = process.env.IQAIR_API_KEY;
const STATIONS = [
  {
    name: "Nguyễn Duy Trinh",
    uid: "44334",
    lat: 20.9625,
    lon: 105.7694,
    area: "Hoàn Kiếm",
  },
  {
    name: "UNIS Hà Nội",
    uid: "8688",
    lat: 21.0811211,
    lon: 105.8180306,
    area: "Quận Tây Hồ/Bắc Từ Liêm",
  },
  {
    name: "Hoàn Kiếm",
    uid: "11158",
    lat: 21.02888,
    lon: 105.85223,
    area: "Hoàn Kiếm",
  },
  {
    name: "Hàng Đậu",
    uid: "9509",
    lat: 21.04172,
    lon: 105.84917,
    area: "Ba Đình",
  },
  {
    name: "Cầu Giấy",
    uid: "11161",
    lat: 21.03583,
    lon: 105.79861,
    area: "Cầu Giấy",
  },
  {
    name: "Thanh Xuân",
    uid: "11162",
    lat: 20.998,
    lon: 105.81,
    area: "Thanh Xuân",
  },
];
// IQAir Stations in Hanoi
const IQAIR_STATIONS = [
  {
    name: "Hà Nội Tổng hợp (IQAir)",
    area: "Hanoi",
    lat: 21.02851,
    lon: 105.85417,
  },
  {
    name: "Hoàn Kiếm (IQAir)",
    area: "Hoan Kiem",
    lat: 21.02888,
    lon: 105.85223,
  },
  { name: "Cầu Giấy (IQAir)", area: "Cau Giay", lat: 21.03583, lon: 105.79861 },
  { name: "Thanh Xuân (IQAir)", area: "Thanh Xuan", lat: 20.998, lon: 105.81 },
  {
    name: "Ba Đình US Embassy (IQAir)",
    area: "Ba Dinh",
    lat: 21.03333,
    lon: 105.81722,
  },
  { name: "Hà Đông (IQAir)", area: "Ha Dong", lat: 20.9625, lon: 105.7694 },
];
export async function updateAQIData() {
  if (!AQICN_TOKEN && !IQAIR_KEY) {
    console.error(
      "Thiếu AQICN_TOKEN hoặc IQAIR_API_KEY trong biến môi trường!"
    );
    return;
  }

  console.log(
    `\nBẮT ĐẦU CẬP NHẬT AQI - ${new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    })}\n`
  );

  let success = 0;

  const allStations = [...STATIONS];
  if (IQAIR_KEY) {
    allStations.push(...IQAIR_STATIONS);
  }

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
      // ====== TRẠM IQAIR  ======
      if (IQAIR_KEY && !station.uid && station.area) {
        const res = await fetch(
          `https://api.airvisual.com/v2/city?city=${encodeURIComponent(
            station.area
          )}&state=Hanoi&country=Vietnam&key=${IQAIR_KEY}`
        );
        const json = await res.json();

        if (
          json.status === "success" &&
          json.data?.current?.pollution?.aqius != null
        ) {
          const d = json.data.current.pollution;
          aqi = Number(d.aqius); // ép số, tránh NaN
          pm25 = d.pm25 ?? null;
          pm10 = d.pm10 ?? null;
          sourceLog = "IQAir";
          success++;
        } else {
          console.log(
            `IQAir không có dữ liệu cho ${station.name}:`,
            json.message || json.status
          );
        }
      }
      // ====== TRẠM AQICN ======
      else if (station.uid && AQICN_TOKEN) {
        const res = await fetch(
          `https://api.waqi.info/feed/@${station.uid}/?token=${AQICN_TOKEN}`,
          { timeout: 15000 }
        );
        const json = await res.json();

        if (json.status === "ok" && json.data?.aqi != null) {
          const d = json.data;
          aqi = parseInt(d.aqi, 10);
          pm25 = d.iaqi?.pm25?.v ?? null;
          pm10 = d.iaqi?.pm10?.v ?? null;
          o3 = d.iaqi?.o3?.v ?? null;
          no2 = d.iaqi?.no2?.v ?? null;
          so2 = d.iaqi?.so2?.v ?? null;
          co = d.iaqi?.co?.v ?? null;
          sourceLog = "WAQI";
          success++;
        }
      }
    } catch (err) {
      console.error(`Lỗi ${sourceLog} ${station.name}:`, err.message);
    }

    // Cập nhật bảng stations
    await pool.query(
      `INSERT INTO stations (name, lat, lon, area) VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
      [station.name, station.lat, station.lon, station.area]
    );
    // Cập nhật bảng station_history
    await pool.query(
      `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
       SELECT id, $1,$2,$3,$4,$5,$6,$7,$8 FROM stations WHERE name = $9
       ON CONFLICT (station_id, recorded_at) DO NOTHING`,
      [aqi, pm25, pm10, o3, no2, so2, co, recorded_at, station.name]
    );

    console.log(
      `${sourceLog.padEnd(6)} ${station.name.padEnd(28)} → AQI ${String(
        aqi ?? "-"
      ).padStart(3)} | ${recorded_at
        .toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
        .slice(-8)}`
    );
  }

  // Log thời gian mới nhất trong DB
  const latest = await pool.query(
    `SELECT recorded_at FROM station_history ORDER BY recorded_at DESC LIMIT 1`
  );
  const timeStr = latest.rows[0]
    ? new Date(latest.rows[0].recorded_at).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "Chưa có";

  console.log(
    `\nHOÀN TẤT! ${success}/${allStations.length} trạm có AQI | Dữ liệu mới nhất: ${timeStr}\n`
  );
}
