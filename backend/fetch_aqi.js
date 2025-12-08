import fetch from "node-fetch";
import { pool } from "./db.js";

const PAMAIR_STATIONS = [
  // 1. Trạm Đại sứ quán Mỹ – Láng Hạ (Ba Đình)
  // Link thực tế: https://pamair.org/station/118
  {
    id: 118,
    name: "Đại sứ quán Mỹ",
    lat: 21.00748,
    lon: 105.80554,
    area: "Ba Đình",
  },

  // 2. Trạm Hoàn Kiếm – Trung tâm Hà Nội
  // Link thực tế: https://pamair.org/station/102
  {
    id: 102,
    name: "Hoàn Kiếm",
    lat: 21.02888,
    lon: 105.85223,
    area: "Trung tâm",
  },

  // 3. Trạm Hàng Đậu – gần cầu Long Biên
  // Link thực tế: https://pamair.org/station/105
  {
    id: 105,
    name: "Hàng Đậu",
    lat: 21.04172,
    lon: 105.84917,
    area: "Phía Bắc",
  },

  // 4. Trạm Cầu Giấy – gần Chi cục BVMT
  // Link thực tế: https://pamair.org/station/108
  {
    id: 108,
    name: "Cầu Giấy",
    lat: 21.03583,
    lon: 105.79861,
    area: "Cầu Giấy",
  },

  // 5. Trạm Phạm Văn Đồng – Bắc Từ Liêm
  // Link thực tế: https://pamair.org/station/110
  {
    id: 110,
    name: "Phạm Văn Đồng",
    lat: 21.06611,
    lon: 105.78944,
    area: "Bắc Từ Liêm",
  },

  // 6. Trạm Mỗ Lao – Hà Đông (rất nổi tiếng)
  // Link thực tế: https://pamair.org/station/112
  {
    id: 112,
    name: "Mỗ Lao - Hà Đông",
    lat: 20.97889,
    lon: 105.77806,
    area: "Hà Đông",
  },

  // 7. Trạm UNIS Hà Đông – Trường Quốc tế Liên Hợp Quốc
  // Link thực tế: https://pamair.org/station/115 (cao nhất Hà Nội hiện tại)
  {
    id: 115,
    name: "UNIS Hà Đông",
    lat: 20.97444,
    lon: 105.78972,
    area: "Hà Đông",
  },
];

export async function updateAQIData() {
  console.log(
    `\nBắt đầu cập nhật ${
      PAMAIR_STATIONS.length
    } trạm từ PamAir – ${new Date().toLocaleString("vi-VN")}\n`
  );
  const now = new Date();
  let success = 0;

  try {
    const res = await fetch("https://api.pamair.org/v1/stations");
    const json = await res.json();

    if (!json.data || json.status !== "success") {
      throw new Error("PamAir API lỗi hoặc không trả dữ liệu");
    }

    // Tạo map { id: data } để tra cứu nhanh
    const pamairMap = {};
    json.data.forEach((st) => {
      pamairMap[st.id] = st;
    });

    for (const station of PAMAIR_STATIONS) {
      const data = pamairMap[station.id];

      if (!data || data.aqi === null || data.aqi === undefined) {
        console.warn(
          `Trạm ${station.name} (ID: ${station.id}) → không có dữ liệu`
        );
        continue;
      }

      const { aqi, pm25, pm10, o3, no2, so2, co } = data;

      // Đảm bảo trạm tồn tại trong DB
      await pool.query(
        `INSERT INTO stations (name, lat, lon, area)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()`,
        [station.name, station.lat, station.lon, station.area]
      );

      // Lưu đầy đủ chỉ số vào lịch sử
      await pool.query(
        `INSERT INTO station_history (station_id, aqi, pm25, pm10, o3, no2, so2, co, recorded_at)
         SELECT id, $1, $2, $3, $4, $5, $6, $7, $8
         FROM stations WHERE name = $9
         ON CONFLICT (station_id, recorded_at) DO NOTHING`,
        [aqi, pm25, pm10, o3, no2, so2, co, now, station.name]
      );

      console.log(
        `ĐÃ CẬP NHẬT ${station.name.padEnd(24)} → AQI ${String(aqi).padStart(
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
          `| PamAir ID: ${station.id}`
      );
      success++;
    }
  } catch (err) {
    console.error("Lỗi kết nối PamAir API:", err.message);
  }

  console.log(
    `\nHOÀN TẤT! ${success}/${PAMAIR_STATIONS.length} trạm cập nhật thành công từ PamAir\n`
  );
}
