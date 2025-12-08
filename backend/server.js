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

// =============================
// API STATIONS – ĐÃ SỬA ĐÚNG DB MỚI
// =============================
app.get("/api/stations", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        s.name,
        h.aqi,
        h.pm25,
        h.pm10,
        h.o3,
        h.no2,
        h.so2,
        h.co,
        s.lat,
        s.lon,
        h.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS last_update
      FROM stations s
      LEFT JOIN LATERAL (
        SELECT aqi, pm25, pm10, o3, no2, so2, co, recorded_at
        FROM station_history
        WHERE station_id = s.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) h ON true
      WHERE s.is_active = true
        AND s.lat IS NOT NULL
        AND h.aqi IS NOT NULL
        AND h.aqi >= 5
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// =============================
// API HISTORY – ĐÃ SỬA ĐÚNG DB MỚI (dùng station_id)
// =============================
app.get("/api/history", async (req, res) => {
  const { name, mode } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    // Lấy station_id từ tên trạm
    const stationResult = await pool.query(
      `SELECT id FROM stations WHERE name = $1 AND is_active = true`,
      [name]
    );
    if (stationResult.rows.length === 0) {
      return res.status(404).json({ error: "Trạm không tồn tại" });
    }
    const stationId = stationResult.rows[0].id;

    // DAILY MODE – 7 ngày gần nhất
    if (mode === "daily") {
      const { rows } = await pool.query(
        `
        SELECT 
          DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS date,
          COALESCE(ROUND(AVG(aqi)::numeric), 0)::INTEGER AS aqi,
          ROUND(AVG(pm25)::numeric, 1) AS pm25,
          ROUND(AVG(pm10)::numeric, 1) AS pm10,
          ROUND(AVG(o3)::numeric, 1) AS o3,
          ROUND(AVG(no2)::numeric, 1) AS no2,
          ROUND(AVG(so2)::numeric, 1) AS so2,
          ROUND(AVG(co)::numeric, 1) AS co
        FROM station_history
        WHERE station_id = $1
          AND recorded_at >= NOW() - INTERVAL '10 days'
          AND aqi IS NOT NULL
        GROUP BY DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        ORDER BY date DESC
        LIMIT 7
        `,
        [stationId]
      );

      const reversed = rows.reverse();
      const dates = reversed.map((r) => {
        const d = new Date(r.date);
        return `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
      });

      res.json({
        dates,
        aqi: reversed.map((r) => r.aqi ?? 0),
        pm25: reversed.map((r) => r.pm25 ?? null),
        pm10: reversed.map((r) => r.pm10 ?? null),
        o3: reversed.map((r) => r.o3 ?? null),
        no2: reversed.map((r) => r.no2 ?? null),
        so2: reversed.map((r) => r.so2 ?? null),
        co: reversed.map((r) => r.co ?? null),
      });
    }

    // HOURLY MODE – 72 giờ gần nhất
    else {
      const { rows } = await pool.query(
        `
        SELECT 
          recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS local_time,
          aqi, pm25, pm10, o3, no2, so2, co
        FROM station_history
        WHERE station_id = $1
          AND recorded_at >= NOW() - INTERVAL '3 days'
          AND aqi IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 72
        `,
        [stationId]
      );

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
        times: times.length ? times : Array(24).fill("09/12 00:00"),
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
    res.status(500).json({
      dates: mode === "daily" ? Array(7).fill("09/12") : [],
      times: mode !== "daily" ? Array(72).fill("09/12 00:00") : [],
      aqi: [],
      pm25: [],
      pm10: [],
      o3: [],
      no2: [],
      so2: [],
      co: [],
    });
  }
});

// =============================
// CATCH-ALL: Frontend
// =============================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// =============================
// KHỞI ĐỘNG SERVER
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`\nSERVER CHẠY THÀNH CÔNG TẠI https://hanoi-aqi.onrender.com\n`);

  try {
    await pool.query("SELECT 1");
    console.log("DB kết nối OK");
  } catch (err) {
    console.error("DB lỗi:", err.message);
    process.exit(1);
  }

  // Cron: Cập nhật mỗi 30 phút + dọn lịch sử cũ

  // =============================
  // KHỞI ĐỘNG SERVER & CRON JOB
  // =============================
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, async () => {
    console.log(
      `\nSERVER CHẠY THÀNH CÔNG TẠI https://hanoi-aqi.onrender.com\n`
    );

    // 1. Kiểm tra kết nối DB
    try {
      await pool.query("SELECT 1");
      console.log("DB kết nối OK");
    } catch (err) {
      console.error("DB lỗi:", err.message);
      process.exit(1);
    }

    // 2. Định nghĩa hàm cập nhật (để dùng lại)
    const performUpdate = async (isManual = false) => {
      const nowVN = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
      console.log(
        `\n[${
          isManual ? "KHỞI ĐỘNG" : "CRON JOB"
        }] Bắt đầu cập nhật AQI - ${nowVN}`
      );

      try {
        await updateAQIData();
        // Xóa dữ liệu cũ hơn 12 ngày để nhẹ DB
        await pool.query(
          `DELETE FROM station_history WHERE recorded_at < NOW() - INTERVAL '12 days'`
        );
        console.log(`-> Cập nhật thành công lúc ${nowVN}`);
      } catch (err) {
        console.error("-> Lỗi cập nhật:", err.message);
      }
    };

    // 3. Thiết lập Cron Job (Chạy vào phút 00 và 30 mỗi giờ)
    // Lưu ý: Cron sẽ tự tính toán thời gian tiếp theo, không cần setTimeout thủ công
    cron.schedule(
      "0,30 * * * *",
      () => performUpdate(false), // false = chạy tự động
      {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh",
      }
    );

    // 4. QUAN TRỌNG: Chạy cập nhật NGAY LẬP TỨC khi server vừa bật
    // Không chờ đến phút 00 hay 30, lấy dữ liệu ngay để web có cái hiển thị luôn
    console.log("Đang lấy dữ liệu lần đầu tiên ngay lập tức...");
    await performUpdate(true); // true = chạy thủ công lúc boot

    console.log(
      "\nHỆ THỐNG ĐÃ SẴN SÀNG! Dữ liệu đã được cập nhật và lịch trình Cron đã được thiết lập.\n"
    );

    // Keep-alive (để Render không ngủ nếu dùng gói free, ping mỗi 10p)
    setInterval(
      () =>
        fetch("https://hanoi-aqi.onrender.com/api/stations").catch(() => {}),
      600000
    );
  });

  console.log("HỆ THỐNG AQI HOẠT ĐỘNG HOÀN HẢO 100%!\n");
});
