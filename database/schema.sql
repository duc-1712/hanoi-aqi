-- 1. Xóa bảng cũ để cập nhật cấu trúc mới
DROP TABLE IF EXISTS station_history;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS hanoi_archive;
-- 2. Tạo bảng Trạm (Thêm các cột chi tiết)
CREATE TABLE stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    station_api_id INT,
    city VARCHAR(100),
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    aqi INTEGER,
    -- Các chỉ số chi tiết
    pm25 REAL,
    pm10 REAL,
    o3 REAL,
    no2 REAL,
    so2 REAL,
    co REAL,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3. Tạo bảng Lịch sử Trạm (Thêm các cột chi tiết)
CREATE TABLE station_history (
    id SERIAL PRIMARY KEY,
    station_name VARCHAR(255) NOT NULL,
    aqi INTEGER,
    -- Các chỉ số chi tiết
    pm25 REAL,
    pm10 REAL,
    o3 REAL,
    no2 REAL,
    so2 REAL,
    co REAL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_history_name_time ON station_history(station_name, recorded_at);
-- 4. Tạo bảng Lưu trữ Lịch sử Hà Nội (Từ CSV)
CREATE TABLE hanoi_archive (
    id SERIAL PRIMARY KEY,
    record_date DATE UNIQUE NOT NULL,
    pm25 REAL,
    pm10 REAL,
    o3 REAL,
    no2 REAL,
    so2 REAL,
    co REAL
);
CREATE INDEX idx_archive_date ON hanoi_archive(record_date);