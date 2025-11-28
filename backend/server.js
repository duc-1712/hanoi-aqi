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

// API stations
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon, last_update
      FROM stations WHERE lat IS NOT NULL ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// API history – hiển thị giờ Việt Nam chuẩn
app.get("/api/history", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    const { rows } = await pool.query(
      `
      SELECT 
        recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh' AS local_time,
        aqi, pm25, pm10, o3, no2, so2, co
      FROM station_history 
      WHERE station_name = $1 
      ORDER BY recorded_at DESC 
      LIMIT 48
    `,
      [name]
    );

    if (!rows.length) {
      return res.json({
        times: [],
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
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const hour = String(d.getHours()).padStart(2, "0");
      const minute = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month} ${hour}:${minute}`;
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
  console.log(
    `\nSERVER CHẠY TẠI https://hanoi-aqi.onrender.com (cổng ${PORT})\n`
  );

  try {
    await pool.query("SELECT 1");
    console.log("Kết nối PostgreSQL thành công!");
  } catch (err) {
    console.error("KHÔNG THỂ KẾT NỐI DB:", err.message);
    process.exit(1);
  }

  // TẠO BẢNG ĐÚNG CÁCH – DÙNG TIMESTAMPTZ + CURRENT_TIMESTAMP
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

      CREATE TABLE IF NOT EXISTS station_history (
        id SERIAL PRIMARY KEY,
        station_name VARCHAR(255) NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(
      "Bảng đã sẵn sàng – dùng TIMESTAMPTZ (giờ tự động theo múi giờ server + chuyển về VN khi hiển thị)"
    );
  } catch (err) {
    console.error("Lỗi tạo bảng:", err.message);
    process.exit(1);
  }

  // Lấy dữ liệu lần đầu nếu trống
  const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
  if (parseInt(rows[0].count) === 0) {
    console.log("Bảng trống → Lấy dữ liệu lần đầu...");
    await updateAQIData();
  }

  // Cron mỗi 30 phút
  cron.schedule("0,30 * * * *", async () => {
    const nowVN = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    console.log(`\n[AUTO] Cập nhật AQI – ${nowVN}`);
    await updateAQIData();

    // Dọn dẹp dữ liệu cũ hơn 10 ngày
    try {
      const { rowCount } = await pool.query(`
        DELETE FROM station_history 
        WHERE recorded_at < NOW() - INTERVAL '10 days'
      `);
      if (rowCount > 0) console.log(`Đã xóa ${rowCount} bản ghi cũ`);
    } catch (err) {
      console.error("Lỗi dọn dẹp:", err.message);
    }
  });

  // Anti-sleep
  setInterval(() => {
    fetch("https://hanoi-aqi.onrender.com/api/stations").catch(() => {});
  }, 10 * 60 * 1000);

  console.log("\nHỆ THỐNG AQI HÀ NỘI HOẠT ĐỘNG");
  console.log("Link: https://hanoi-aqi.onrender.com\n");
});
