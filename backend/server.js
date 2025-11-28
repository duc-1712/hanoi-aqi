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

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ==================== TỰ ĐỘNG TẠO BẢNG KHI KHỞI ĐỘNG ====================
async function initializeDatabase() {
  const createStations = `
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
  `;

  const createHistory = `
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
  `;

  const createArchive = `
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
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_history_name_time ON station_history(station_name, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_archive_date ON hanoi_archive(record_date);
  `;

  try {
    console.log("Đang kiểm tra và tạo các bảng...");
    await pool.query(createStations);
    await pool.query(createHistory);
    await pool.query(createIndexes);
    await pool.query(createArchive);
    console.log("Tất cả bảng đã sẵn sàng!");
  } catch (err) {
    console.error("Lỗi tạo bảng:", err.message);
    throw err;
  }
}

// ==================== API ROUTES ====================
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update 
      FROM stations 
      WHERE lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "Lỗi server" });
  }
});

app.get("/api/history", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    const { rows } = await pool.query(
      `SELECT recorded_at, aqi, pm25, pm10, o3, no2, so2, co
       FROM station_history
       WHERE station_name = $1
       ORDER BY recorded_at DESC
       LIMIT 48`,
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
      recorded_at: reversed.map((r) => r.recorded_at), // ← quan trọng cho frontend hiển thị ngày
    });
  } catch (err) {
    console.error("Lỗi /api/history:", err.message);
    res.status(500).json({ error: "Lỗi server" });
  }
});

app.get("/api/hanoi-archive", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT record_date, pm25 FROM hanoi_archive ORDER BY record_date ASC`
    );
    const { rows: today } = await pool.query(
      `SELECT AVG(pm25)::INTEGER as avg FROM stations WHERE pm25 IS NOT NULL`
    );

    const data = rows.map((r) => ({
      date: new Date(r.record_date).toLocaleDateString("vi-VN"),
      pm25: r.pm25 ? Math.round(r.pm25) : null,
    }));

    if (today[0]?.avg)
      data.push({ date: "Hôm nay", pm25: Math.round(today[0].avg) });

    res.json(data);
  } catch (err) {
    console.error("Lỗi archive:", err.message);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ==================== KHỞI ĐỘNG SERVER ====================
app.listen(PORT, async () => {
  console.log(`\nServer chạy tại http://localhost:${PORT}`);

  try {
    await initializeDatabase();

    const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
    const count = parseInt(rows[0].count, 10);

    if (count === 0) {
      console.log("Bảng trống → Lấy dữ liệu lần đầu...");
      await updateAQIData();
    } else {
      const { rows: last } = await pool.query(
        `SELECT last_update FROM stations ORDER BY last_update DESC LIMIT 1`
      );
      const minutesAgo = last[0]
        ? Math.floor((Date.now() - new Date(last[0].last_update)) / 60000)
        : 999;
      console.log(
        `Đã cóetted ${count} trạm, cập nhật ${minutesAgo} phút trước`
      );
      if (minutesAgo > 30) await updateAQIData();
    }
  } catch (err) {
    console.error("Khởi động lỗi:", err.message);
    updateAQIData().catch(() => {});
  }

  // Cập nhật mỗi 1 tiếng (vào phút 00)
  cron.schedule("0 * * * *", () => {
    console.log("Cập nhật định kỳ mỗi giờ...");
    updateAQIData();
  });

  console.log("Hệ thống giám sát không khí Hà Nội đã sẵn sàng 100%!\n");
});
