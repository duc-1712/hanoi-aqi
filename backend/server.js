// server.js – PHIÊN BẢN CUỐI CÙNG, CHẠY 100% TRÊN RENDER
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
app
  .use(cors())
  .use(express.json())
  .use(express.static(path.join(__dirname, "../frontend")));

app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT name, aqi, pm25, pm10, o3, no2, so2, co, lat, lon FROM stations WHERE lat IS NOT NULL ORDER BY name"
    );
    res.json(rows);
  } catch (err) {
    console.error("Lỗi API stations:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/history", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    const { rows } = await pool.query(
      `
      SELECT recorded_at, aqi, pm25, pm10, o3, no2, so2, co
      FROM station_history WHERE station_name = $1
      ORDER BY recorded_at DESC LIMIT 48
    `,
      [name]
    );

    if (!rows.length)
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

    const rev = rows.reverse();
    const times = rev.map((r) => {
      const d = new Date(r.recorded_at);
      return `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    });

    res.json({
      times,
      aqi: rev.map((r) => r.aqi),
      pm25: rev.map((r) => r.pm25),
      pm10: rev.map((r) => r.pm10),
      o3: rev.map((r) => r.o3),
      no2: rev.map((r) => r.no2),
      so2: rev.map((r) => r.so2),
      co: rev.map((r) => r.co),
      recorded_at: rev.map((r) => r.recorded_at),
    });
  } catch (err) {
    console.error("Lỗi API history:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 10000;

// KHỞI ĐỘNG + ĐẢM BẢO KẾT NỐI DB TRƯỚC KHI TẠO BẢNG
app.listen(PORT, async () => {
  console.log(`Server khởi động trên cổng ${PORT}`);

  // ĐẶT TEST KẾT NỐI TRƯỚC KHI LÀM GÌ CẢ
  try {
    await pool.query("SELECT 1"); // Test kết nối
    console.log("Kết nối PostgreSQL thành công!");
  } catch (err) {
    console.error("KHÔNG THỂ KẾT NỐI DATABASE:", err.message);
    process.exit(1);
  }

  // TẠO BẢNG AN TOÀN – TỪNG CÁI MỘT
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Bảng stations sẵn sàng");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS station_history (
        id SERIAL PRIMARY KEY,
        station_name VARCHAR(255) NOT NULL,
        aqi INTEGER,
        pm25 REAL, pm10 REAL, o3 REAL, no2 REAL, so2 REAL, co REAL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Bảng station_history sẵn sàng");
  } catch (err) {
    console.error("LỖI TẠO BẢNG:", err.message);
    process.exit(1);
  }

  // LẤY DỮ LIỆU LẦN ĐẦU
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
    if (parseInt(rows[0].count) === 0) {
      console.log("Bảng trống → đang lấy dữ liệu từ AQICN...");
      await updateAQIData();
    } else {
      console.log(`Đã có ${rows[0].count} trạm trong database`);
    }
  } catch (err) {
    console.error("Lỗi kiểm tra dữ liệu:", err.message);
  }

  // CẬP NHẬT MỖI GIỜ
  cron.schedule("0 * * * *", () => {
    console.log("Bắt đầu cập nhật AQI định kỳ...");
    updateAQIData().catch(() => {});
  });

  console.log("HỆ THỐNG AQI HÀ NỘI ĐÃ HOẠT ĐỘNG ");
});
