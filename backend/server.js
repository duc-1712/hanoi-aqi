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
app.use(
  cors({
    origin: "*", // hoặc cụ thể: "http://localhost:3000"
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ==================== API ROUTES ====================

// API 1: Lấy danh sách tất cả trạm (dùng cho bản đồ)
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        name, aqi, pm25, pm10, o3, no2, so2, co, 
        lat, lon, last_update 
      FROM stations 
      WHERE aqi IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY name
    `);

    // Nếu chưa có dữ liệu → trả mảng rỗng (không lỗi đỏ)
    res.json(rows.length > 0 ? rows : []);
  } catch (err) {
    console.error("Lỗi lấy danh sách trạm:", err.message);
    res.status(500).json({ error: "Lỗi máy chủ nội bộ" });
  }
});

// API 2: Lịch sử 24h gần nhất của 1 trạm (dùng cho biểu đồ chi tiết)
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
    });
  } catch (err) {
    console.error("Lỗi lấy lịch sử:", err.message);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// API 3: Dữ liệu lưu trữ dài hạn Hà Nội (biểu đồ năm)
app.get("/api/hanoi-archive", async (req, res) => {
  try {
    const archive = await pool.query(`
      SELECT record_date, pm25 FROM hanoi_archive ORDER BY record_date ASC
    `);

    const todayAvg = await pool.query(`
      SELECT AVG(pm25)::INTEGER as avg_pm25 
      FROM stations 
      WHERE pm25 IS NOT NULL
    `);

    const data = archive.rows.map((row) => ({
      date: new Date(row.record_date).toLocaleDateString("vi-VN"),
      pm25: row.pm25 ? Math.round(row.pm25) : null,
    }));

    if (todayAvg.rows[0].avg_pm25) {
      data.push({
        date: "Hôm nay",
        pm25: Math.round(todayAvg.rows[0].avg_pm25),
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Lỗi lấy dữ liệu archive:", err.message);
    res.status(500).json({ error: "Lỗi lấy dữ liệu lưu trữ" });
  }
});

// Fallback: phục vụ index.html cho mọi route (SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ==================== SERVER START ====================
app.listen(PORT, async () => {
  console.log(`\nServer đang chạy tại http://localhost:${PORT}`);

  try {
    // Kiểm tra có dữ liệu chưa
    const { rows } = await pool.query("SELECT COUNT(*) FROM stations");
    const count = parseInt(rows[0].count);

    if (count === 0) {
      console.log("Bảng stations trống → Lấy dữ liệu lần đầu...");
      await updateAQIData();
    } else {
      const recent = await pool.query(`
        SELECT last_update FROM stations ORDER BY last_update DESC LIMIT 1
      `);
      const lastUpdate = recent.rows[0]?.last_update;
      const minutesAgo = lastUpdate
        ? Math.floor((Date.now() - new Date(lastUpdate)) / 60000)
        : 999;

      console.log(
        `Đã có ${count} trạm, cập nhật lần cuối: ${minutesAgo} phút trước`
      );

      if (minutesAgo > 30) {
        console.log("Dữ liệu hơi cũ → Cập nhật ngay...");
        updateAQIData();
      }
    }
  } catch (err) {
    console.error("Lỗi khởi động:", err.message);
    console.log("Vẫn cố cập nhật dữ liệu...");
    updateAQIData();
  }

  // Cập nhật tự động mỗi 15 phút
  cron.schedule("*/15 * * * *", () => {
    console.log("⏰ Đang cập nhật dữ liệu AQI (15 phút/lần)...");
    updateAQIData();
  });

  console.log("Hệ thống giám sát không khí Hà Nội đã sẵn sàng!\n");
});
