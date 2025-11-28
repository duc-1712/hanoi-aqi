// server.js (HOÀN CHỈNH – CHẠY NGON 100%)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { updateAQIData } from "./fetch_aqi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// TỰ ĐỘNG TẠO ĐẦY ĐỦ BẢNG KHI KHỞI ĐỘNG (CHỈ CHẠY 1 LẦN)
async function initDB() {
  try {
    console.log("Đang tạo/cập nhật cấu trúc database...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        station_api_id INT,
        city VARCHAR(100),
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        aqi INTEGER,
        pm25 REAL,
        pm10 REAL,
        o3 REAL,
        no2 REAL,
        so2 REAL,
        co REAL,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
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
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hanoi_archive (
        id SERIAL PRIMARY KEY,
        record_date DATE UNIQUE NOT NULL,
        pm25 REAL,
        pm10 REAL,
        o3 REAL,
        no2 REAL,
        so2 REAL,
        co REAL
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_history ON station_history(station_name, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_archive ON hanoi_archive(record_date);
    `);

    console.log("Database sẵn sàng!");
  } catch (err) {
    console.error("LỖI TẠO BẢNG:", err.message);
    process.exit(1); // Dừng luôn để Render báo lỗi rõ ràng
  }
}

// API
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon 
      FROM stations 
      WHERE lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

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
        aqi: [],
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
      recorded_at: reversed.map((r) => r.recorded_at), // cho frontend hiển thị ngày
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// fallback SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// KHỞI ĐỘNG
app.listen(PORT, async () => {
  console.log(`Server chạy trên cổng ${PORT}`);

  await initDB(); // chắc chắn tạo bảng trước

  // Lấy dữ liệu lần đầu
  const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
  if (parseInt(rows[0].count) === 0) {
    console.log("Lần đầu chạy → lấy dữ liệu AQI...");
    await updateAQIData();
  }

  // Cập nhật mỗi giờ (đủ realtime mà không bị rate-limit)
  cron.schedule("0 * * * *", () => {
    console.log("Cập nhật định kỳ mỗi giờ...");
    updateAQIData();
  });

  console.log("Hệ thống Hà Nội AQI đã HOÀN TOÀN sẵn sàng!");
});
