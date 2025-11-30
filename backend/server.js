import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { updateAQIData } from "./fetch_aqi.js";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// API DANH SÁCH TRẠM AQI HIỆN TẠI
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update
      FROM stations 
      WHERE lat IS NOT NULL AND aqi IS NOT NULL AND aqi >= 5
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// API LỊCH SỬ – HOURLY + DAILY (7 ngày gần nhất)
app.get("/api/history", async (req, res) => {
  const { name, mode } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    // DAILY MODE – 7 ngày gần nhất
    if (mode === "daily") {
      const { rows } = await pool.query(
        `
        SELECT 
          DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS date,
          COALESCE(AVG(aqi), 0)::INTEGER AS aqi,
          ROUND(AVG(pm25), 1) AS pm25,
          ROUND(AVG(pm10), 1) AS pm10,
          ROUND(AVG(o3), 1) AS o3,
          ROUND(AVG(no2), 1) AS no2,
          ROUND(AVG(so2), 1) AS so2,
          ROUND(AVG(co), 1) AS co
        FROM station_history
        WHERE station_name = $1
          AND recorded_at >= NOW() - INTERVAL '10 days'
        GROUP BY DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        ORDER BY date DESC
        LIMIT 7
      `,
        [name]
      );

      if (rows.length === 0) {
        return res.json({
          dates: [],
          aqi: [],
          pm25: [],
          pm10: [],
          o3: [],
          no2: [],
          so2: [],
          co: [],
        });
      }

      const reversed = rows.reverse();
      const dates = reversed.map((r) => {
        const d = new Date(r.date);
        return `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
      });

      res.json({
        dates,
        aqi: reversed.map((r) => r.aqi ?? null),
        pm25: reversed.map((r) => r.pm25 ?? null),
        pm10: reversed.map((r) => r.pm10 ?? null),
        o3: reversed.map((r) => r.o3 ?? null),
        no2: reversed.map((r) => r.no2 ?? null),
        so2: reversed.map((r) => r.so2 ?? null),
        co: reversed.map((r) => r.co ?? null),
      });
    }
    // HOURLY MODE (mặc định)
    else {
      const { rows } = await pool.query(
        `
        SELECT 
          recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh' AS local_time,
          aqi, pm25, pm10, o3, no2, so2, co
        FROM station_history 
        WHERE station_name = $1 
        ORDER BY recorded_at DESC 
        LIMIT 72
      `,
        [name]
      );

      if (rows.length === 0) {
        return res.json({
          times: [],
          aqi: [],
          pm25: [],
          pm10: [],
          o3: [],
          no2: [],
          so2: [],
          co: [],
        });
      }

      const reversed = rows.reverse();
      const times = reversed.map((r) => {
        const d = new Date(r.local_time);
        return `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      });

      res.json({
        times,
        aqi: reversed.map((r) => r.aqi ?? null),
        pm25: reversed.map((r) => r.pm25 ?? null),
        pm10: reversed.map((r) => r.pm10 ?? null),
        o3: reversed.map((r) => r.o3 ?? null),
        no2: reversed.map((r) => r.no2 ?? null),
        so2: reversed.map((r) => r.so2 ?? null),
        co: reversed.map((r) => r.co ?? null),
      });
    }
  } catch (err) {
    console.error("Lỗi /api/history:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// PHỤC VỤ FRONTEND
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log(`\nSERVER CHẠY TẠI https://hanoi-aqi.onrender.com:${PORT}\n`);

  try {
    await pool.query("SELECT 1");
    console.log("Kết nối PostgreSQL thành công!");
  } catch (err) {
    console.error("LỖI KẾT NỐI DB:", err.message);
    process.exit(1);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        last_update TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- ĐÚNG KIỂU DỮ LIỆU CỦA BẠN: timestamp WITHOUT time zone
      CREATE TABLE IF NOT EXISTS station_history (
        id SERIAL PRIMARY KEY,
        station_name VARCHAR(255) NOT NULL,
        aqi INTEGER,
        pm25 REAL,
        pm10 REAL,
        o3 REAL,
        no2 REAL,
        so2 REAL,
        co REAL,
        recorded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')
      );
    `);
    console.log(
      "Bảng đã sẵn sàng (không thay đổi cấu trúc → dữ liệu an toàn 100%)"
    );
  } catch (err) {
    console.log("Bảng đã tồn tại → bỏ qua tạo mới");
  }

  // Nếu bảng trống → lấy dữ liệu lần đầu
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
    if (parseInt(rows[0].count) === 0) {
      console.log("Bảng stations trống → lấy dữ liệu lần đầu...");
      await updateAQIData();
    }
  } catch (err) {
    console.error("Lỗi kiểm tra bảng:", err.message);
  }

  // Cron cập nhật mỗi 30 phút + dọn rác
  cron.schedule("0,30 * * * *", async () => {
    const now = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    console.log(`\n[Cron] Cập nhật AQI - ${now}`);
    await updateAQIData();

    const { rowCount } = await pool.query(`
      DELETE FROM station_history 
      WHERE recorded_at < NOW() - INTERVAL '12 days'
    `);
    if (rowCount > 0) console.log(`Đã xóa ${rowCount} bản ghi cũ`);
  });

  // Anti sleep Render
  setInterval(() => {
    fetch("https://hanoi-aqi.onrender.com/api/stations").catch(() => {});
  }, 10 * 60 * 1000);

  console.log("\nHỆ THỐNG AQI HOẠT ĐỘNG AN TOÀN!");
  console.log("Link: https://hanoi-aqi.onrender.com\n");
});
