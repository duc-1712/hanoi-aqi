import { pool } from "../backend/db.js";

export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({
      error: "Thiếu tên trạm",
    });
  }

  try {
    // lấy station id
    const stationResult = await pool.query(
      `
      SELECT id
      FROM stations
      WHERE name = $1
      `,
      [name],
    );

    if (stationResult.rows.length === 0) {
      return res.status(404).json({
        error: "Không tìm thấy trạm",
      });
    }

    const stationId = stationResult.rows[0].id;

    // AQI hiện tại
    const currentResult = await pool.query(
      `
      SELECT aqi
      FROM station_history
      WHERE station_id = $1
        AND aqi IS NOT NULL
      ORDER BY recorded_at DESC
      LIMIT 1
      `,
      [stationId],
    );

    // AQI trung bình 24h trước
    const avg24hResult = await pool.query(
      `
      SELECT ROUND(AVG(aqi)::numeric, 1) AS avg_aqi
      FROM station_history
      WHERE station_id = $1
        AND aqi IS NOT NULL
        AND recorded_at >= NOW() - INTERVAL '24 hours'
      `,
      [stationId],
    );

    const currentAQI = currentResult.rows[0]?.aqi ?? null;
    const avg24h = avg24hResult.rows[0]?.avg_aqi ?? null;

    if (!currentAQI || !avg24h) {
      return res.status(200).json({
        currentAQI,
        avg24h,
        trend: "Không đủ dữ liệu",
        percent: 0,
      });
    }

    const diff = currentAQI - avg24h;

    const percent = avg24h > 0 ? Number(((diff / avg24h) * 100).toFixed(1)) : 0;

    let trend = "Ổn định";
    let icon = "→";

    if (percent > 15) {
      trend = "Tăng";
      icon = "↑";
    } else if (percent < -15) {
      trend = "Giảm";
      icon = "↓";
    }

    return res.status(200).json({
      currentAQI,
      avg24h,
      trend,
      percent,
      icon,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
