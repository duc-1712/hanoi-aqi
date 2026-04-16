import { pool } from "../backend/db.js";

export default async function handler(req, res) {
  // Vercel tự động xử lý CORS nên ông không cần app.use(cors()) ở đây
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
        h.recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh' AS last_update
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
    res.status(200).json(rows);
  } catch (err) {
    console.error("Lỗi /api/stations:", err.message);
    res.status(500).json({ error: "DB error" });
  }
}
