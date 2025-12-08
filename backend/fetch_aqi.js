// fetch_aqi.js – KẾT HỢP AQICN + OPENAQ → 6 TRẠM ĐẦY ĐỦ 6 CHỈ SỐ (PM2.5, PM10, O₃, NO₂, SO₂, CO)
import fetch from "node-fetch";
import { pool } from "./db.js";

const AQICN_TOKEN = process.env.AQICN_TOKEN;

const STATIONS = [
  {
    name: "Nguyễn Duy Trinh",
    uid: "44334",
    lat: 20.9625,
    lon: 105.7694,
    area: "Hà Đông",
  },
  {
    name: "UNIS Hà Nội",
    uid: "8688",
    lat: 20.97444,
    lon: 105.78972,
    area: "Hà Đông",
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
    area: "Long Biên",
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

export async function updateAQIData() {
  if (!AQICN_TOKEN) return console.error("Thiếu AQICN_TOKEN");

  console.log(
    `\nBắt đầu cập nhật 6 trạm AQICN + OpenAQ – ${new Date().toLocaleString(
      "vi-VN"
    )}\n`
  );
  const now = new Date();
  let success = 0;

  // 1. Lấy dữ liệu từ AQICN (AQI + PM2.5)
  const aqicnData = {};
  for (const station of STATIONS) {
    try {
      const url = `https://api.waqi.info/feed/@${station.uid}/?token=${AQICN_TOKEN}`;
      const res = await fetch(url, { timeout: 12000 });
      const json = await res.json();

      if (json.status === "ok" && json.data?.aqi != null) {
        const d = json.data;
        aqicnData[station.name] = {
          aqi: parseInt(d.aqi, 10),
          pm25: d.iaqi?.pm25?.v ?? null,
          pm10: d.iaqi?.pm10?.v ?? null,
          o3: d.iaqi?.o3?.v ?? null,
          no2: d.iaqi?.no2?.v ?? null,
          so2: d.iaqi?.so2?.v ?? null,
          co: d.iaqi?.co?.v ?? null,
        };
      }
    } catch (err) {
      console.error(`Lỗi AQICN ${station.name}:`, err.message);
    }
  }

  // 2. Lấy dữ liệu từ OpenAQ (bổ sung PM10, O3, NO2, SO2, CO)
  try {
    const openaqUrl =
      "https://api.openaq.org/v2/latest?city=Hanoi&parameter=pm25,pm10,o3,no2,so2,co&limit=50";
    const res = await fetch(openaqUrl);
    const json = await res.json();

    if (json.results) {
      const openaqMap = {};
      json.results.forEach((r) => {
        if (r.coordinates) {
          const key = `${r.coordinates.latitude.toFixed(
            5
          )},${r.coordinates.longitude.toFixed(5)}`;
          openaqMap[key] = r.measurements.reduce((acc, m) => {
            acc[m.parameter] = m.value;
            return acc;
          }, {});
        }
      });

      // Gán dữ liệu OpenAQ vào trạm gần nhất
      for (const station of STATIONS) {
        const key = `${station.lat.toFixed(5)},${station.lon.toFixed(5)}`;
        const nearest = Object.keys(openaqMap).find((k) => {
          const [lat, lon] = k.split(",").map(Number);
          return (
            Math.abs(lat - station.lat) < 0.01 &&
            Math.abs(lon - station.lon) < 0.01
          );
        });

        if (nearest && openaqMap[nearest]) {
          const data = openaqMap[nearest];
          aqicnData[station.name] = {
            ...aqicnData[station.name],
            pm10: data.pm10 ?? aqicnData[station.name]?.pm10,
            o3: data.o3 ?? aqicnData[station.name]?.o3,
            no2: data.no2 ?? aqicnData[station.name]?.no2,
            so2: data.so2 ?? aqicnData[station.name]?.so2,
            co: data.co ?? aqicnData[station.name]?.co,
          };
        }
      }
    }
  } catch (err) {
    console.error("Lỗi OpenAQ:", err.message);
  }

  // 3. Lưu vào DB
  for (const station of STATIONS) {
    const data = aqicnData[station.name] || {};
    const {
      aqi = null,
      pm25 = null,
      pm10 = null,
      o3 = null,
      no2 = null,
      so2 = null,
      co = null,
    } = data;

    await pool.query(
      `INSERT INTO stations (name, lat, lon, area) VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
      [station.name, station.lat, station.lon, station.area]
    );

    await pool.query(
      `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
       SELECT id, $1,$2,$3,$4,$5,$6,$7,$8 FROM stations WHERE name = $9
       ON CONFLICT (station_id, recorded_at) DO NOTHING`,
      [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
    );

    console.log(
      `ĐÃ CẬP NHẬT ${station.name.padEnd(28)} → AQI ${String(
        aqi ?? "-"
      ).padStart(3)} ` +
        `│ PM2.5 ${String(pm25 ?? "-").padStart(4)} │ PM10 ${String(
          pm10 ?? "-"
        ).padStart(4)} ` +
        `│ O₃ ${String(o3 ?? "-").padStart(4)} │ NO₂ ${String(
          no2 ?? "-"
        ).padStart(4)} ` +
        `│ SO₂ ${String(so2 ?? "-").padStart(4)} │ CO ${String(
          co ?? "-"
        ).padStart(5)}`
    );
    if (aqi) success++;
  }

  console.log(
    `\nHOÀN TẤT! ${success}/6 trạm cập nhật thành công (đầy đủ chỉ số)\n`
  );
}
