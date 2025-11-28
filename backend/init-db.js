// init-db.js
import { pool } from "./db.js";

export async function initializeDatabase() {
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
    console.log("Đang kiểm tra và tạo bảng nếu chưa tồn tại...");
    await pool.query(createStations);
    await pool.query(createHistory);
    await pool.query(createArchive);
    await pool.query(createIndexes);
    console.log("Tất cả bảng đã sẵn sàng!");
  } catch (err) {
    console.error("Lỗi khi tạo bảng:", err.message);
    throw err;
  }
}
