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

  // Hàm tính delay đến lần 00 hoặc 30 gần nhất (theo giờ Việt Nam)
  function getDelayToNextHalfHourVN() {
    const now = new Date();
    const vnOffset = 7 * 60 * 60 * 1000; // UTC+7
    const nowVN = new Date(now.getTime() + vnOffset);

    const currentHours = nowVN.getHours();
    const currentMinutes = nowVN.getMinutes();

    let targetHours = currentHours;
    let targetMinutes = 30;

    if (currentMinutes >= 30) {
      targetMinutes = 0;
      targetHours += 1;
      if (targetHours >= 24) {
        targetHours = 0;
      }
    }

    // Tạo thời điểm mục tiêu theo giờ Việt Nam
    const targetVN = new Date(nowVN);
    targetVN.setHours(targetHours, targetMinutes, 0, 0);

    // Chuyển về thời gian thực của server (UTC) để tính delay
    const targetUTC = new Date(targetVN.getTime() - vnOffset);

    const delay = targetUTC.getTime() - now.getTime();
    return delay > 0 ? delay : 10000; // nếu đã qua thì chạy luôn sau 10 giây
  }

  // =============== CHẠY LẦN ĐẦU TIÊN ĐÚNG 3H30 HOẶC GẦN NHẤT (GIỜ VN) ===============
  const initialDelay = getDelayToNextHalfHourVN();
  const nextRunTime = new Date(Date.now() + initialDelay);

  console.log(`\nServer khởi động lúc: ${new Date().toLocaleString("vi-VN")}`);
  console.log(
    `Lần cập nhật AQI kế tiếp: ${nextRunTime.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    })} (giờ Việt Nam)`
  );
  console.log(
    `Còn khoảng ${Math.round(initialDelay / 60000)} phút nữa sẽ chạy...\n`
  );

  setTimeout(async () => {
    const nowVN = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    console.log(`\n[CẬP NHẬT ĐẦU TIÊN] Bắt đầu lấy dữ liệu AQI - ${nowVN}`);

    try {
      await updateAQIData();
      await pool.query(
        `DELETE FROM station_history WHERE recorded_at < NOW() - INTERVAL '12 days'`
      );
      console.log("Cập nhật AQI lần đầu thành công!");
    } catch (err) {
      console.error("Lỗi khi cập nhật AQI lần đầu:", err.message);
    }

    // =============== SAU LẦN ĐẦU → CHẠY ĐỊNH KỲ MÃI MÃI THEO GIỜ VIỆT NAM ===============
    cron.schedule(
      "0,30 * * * *",
      async () => {
        const nowVN = new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });
        console.log(`\n[Cron định kỳ] Cập nhật AQI - ${nowVN}`);

        try {
          await updateAQIData();
          await pool.query(
            `DELETE FROM station_history WHERE recorded_at < NOW() - INTERVAL '12 days'`
          );
          console.log("Cập nhật định kỳ thành công!");
        } catch (err) {
          console.error("Lỗi cron định kỳ:", err.message);
        }
      },
      {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh", // Quan trọng: ép cron chạy theo giờ Việt Nam
      }
    );

    console.log(
      "ĐÃ ĐỒNG BỘ HOÀN TOÀN! Từ giờ trở đi sẽ cập nhật đúng phút 00 và 30 mỗi giờ (giờ Việt Nam).\n"
    );
  }, initialDelay);

  setInterval(
    () => fetch("https://hanoi-aqi.onrender.com/api/stations").catch(() => {}),
    600000
  );

  console.log("HỆ THỐNG AQI HOẠT ĐỘNG HOÀN HẢO 100%!\n");
});
