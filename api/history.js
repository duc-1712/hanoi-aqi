import { pool } from "../backend/db.js";

function getRangeCondition(range, from, to) {
  if (from && to) {
    return {
      condition: `AND recorded_at >= $2::date 
                  AND recorded_at < ($3::date + INTERVAL '1 day')`,
      params: [from, to],
    };
  }

  if (range === "24h") {
    return {
      condition: `AND recorded_at >= NOW() - INTERVAL '24 hours'`,
      params: [],
    };
  }

  if (range === "7d") {
    return {
      condition: `AND recorded_at >= NOW() - INTERVAL '7 days'`,
      params: [],
    };
  }

  if (range === "30d") {
    return {
      condition: `AND recorded_at >= NOW() - INTERVAL '30 days'`,
      params: [],
    };
  }

  if (range === "all") {
    return {
      condition: ``,
      params: [],
    };
  }

  return {
    condition: `AND recorded_at >= NOW() - INTERVAL '3 days'`,
    params: [],
  };
}

export default async function handler(req, res) {
  const { name, mode, range = "3d", from, to } = req.query;

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
    const rangeData = getRangeCondition(range, from, to);

    if (mode === "daily") {
      const params = [stationId, ...rangeData.params];

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
          ${rangeData.condition}
          AND aqi IS NOT NULL
        GROUP BY sort_date, date_str
        ORDER BY sort_date ASC
        `,
        params,
      );

      return res.status(200).json({
        dates: rows.map((r) => r.date_str),
        aqi: rows.map((r) => r.aqi ?? 0),
        pm25: rows.map((r) => r.pm25 ?? null),
        pm10: rows.map((r) => r.pm10 ?? null),
      });
    }

    const params = [stationId, ...rangeData.params];

    const { rows } = await pool.query(
      `
      SELECT 
        to_char(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') AS time_str,
        recorded_at,
        aqi, pm25, pm10, o3, no2, so2, co
      FROM station_history
      WHERE station_id = $1
        ${rangeData.condition}
        AND aqi IS NOT NULL
      ORDER BY recorded_at ASC
      `,
      params,
    );

    return res.status(200).json({
      times: rows.map((r) => r.time_str),
      aqi: rows.map((r) => r.aqi ?? null),
      pm25: rows.map((r) => r.pm25 ?? null),
      pm10: rows.map((r) => r.pm10 ?? null),
      o3: rows.map((r) => r.o3 ?? null),
      no2: rows.map((r) => r.no2 ?? null),
      so2: rows.map((r) => r.so2 ?? null),
      co: rows.map((r) => r.co ?? null),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
