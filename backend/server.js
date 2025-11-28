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

// API STATIONS
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon 
      FROM stations 
      WHERE lat IS NOT NULL 
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// API HISTORY
app.get("/api/history", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    const { rows } = await pool.query(
      `
      SELECT recorded_at, aqi, pm25, pm10, o3, no2, so2, co
      FROM station_history 
      WHERE station_name = $1 
      ORDER BY recorded_at DESC 
      LIMIT 48
    `,
      [name]
    );

    if (rows.length === 0) {
      return res.json({
        times: [],
        pm25: [],
        pm10: [],
        o3: [],
        no2: [],
        so2: [],
        co: [],
        recorded_at: [],
      });
    }

    const reversed = rows.reverse();
    const times = reversed.map((r) => {
      const d = new Date(r.recorded_at);
      return `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    });

    res.json({
      times,
      aqi: reversed.map((r) => r.aqi),
      pm25: reversed.map((r) => r.pm25),
      pm10: reversed.map((r) => r.pm10),
      o3: reversed.map((r) => r.o3),
      no2: reversed.map((r) => r.no2),
      so2: reversed.map((r) => r.so2),
      co: reversed.map((r) => r.co),
      recorded_at: reversed.map((r) => r.recorded_at),
    });
  } catch (err) {
    console.error("Lỗi /api/history:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Server chạy trên cổng ${PORT}`);

  try {
    // TẠO BẢNG – CHỈ CHẠY 1 LẦN DUY NHẤT
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS station_history (
        id SERIAL PRIMARY KEY,
        station_name VARCHAR(255) NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Bảng đã sẵn sàng!");
  } catch (err) {
    console.error("LỖI TẠO BẢNG:", err.message);
    process.exit(1);
  }

  // LẤY DỮ LIỆU LẦN ĐẦU
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
    if (parseInt(rows[0].count) === 0) {
      console.log("Bảng trống → lấy dữ liệu AQI...");
      await updateAQIData();
    }
  } catch (err) {
    console.log("Lỗi kiểm tra bảng, nhưng vẫn tiếp tục...");
  }

  // CẬP NHẬT MỖI GIỜ
  cron.schedule("0 * * * *", () => {
    console.log("Cập nhật AQI định kỳ...");
    updateAQIData().catch(() => {});
  });

  console.log("HỆ THỐNG ĐÃ HOÀN TẤT ");
});
