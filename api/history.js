import { pool } from "../backend/db.js";

export default async function handler(req, res) {
  const { name, mode } = req.query;
  if (!name) return res.status(400).json({ error: "Thiếu tên trạm" });

  try {
    const stationResult = await pool.query(
      `SELECT id FROM stations WHERE name = $1 AND is_active = true`,
      [name],
    );
    if (stationResult.rows.length === 0) {
      return res.status(404).json({ error: "Trạm không tồn tại" });
    }
    const stationId = stationResult.rows[0].id;

    if (mode === "daily") {
      const { rows } = await pool.query(
        `
        SELECT 
          to_char(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS date_str,
          DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS sort_date,
          COALESCE(ROUND(AVG(aqi)::numeric), 0)::INTEGER AS aqi,
          ROUND(AVG(pm25)::numeric, 1) AS pm25,
          ROUND(AVG(pm10)::numeric, 1) AS pm10
        FROM station_history
        WHERE station_id = $1
          AND recorded_at >= NOW() - INTERVAL '10 days'
          AND aqi IS NOT NULL
        GROUP BY sort_date, date_str
        ORDER BY sort_date DESC
        LIMIT 10
      `,
        [stationId],
      );

      const reversed = rows.reverse();
      res.status(200).json({
        dates: reversed.map((r) => r.date_str),
        aqi: reversed.map((r) => r.aqi ?? 0),
        pm25: reversed.map((r) => r.pm25 ?? null),
        pm10: reversed.map((r) => r.pm10 ?? null),
      });
    } else {
      const { rows } = await pool.query(
        `
        SELECT 
          to_char(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') AS time_str,
          aqi, pm25, pm10, o3, no2, so2, co
        FROM station_history
        WHERE station_id = $1
          AND recorded_at >= NOW() - INTERVAL '3 days'
          AND aqi IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 72
      `,
        [stationId],
      );

      const reversed = rows.reverse();
      res.status(200).json({
        times: reversed.map((r) => r.time_str),
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
    res.status(500).json({ error: err.message });
  }
}
