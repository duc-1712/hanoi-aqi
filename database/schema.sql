BEGIN;
-- Xóa bảng cũ nếu tồn tại (để tránh lỗi khi chạy lại)
DROP TABLE IF EXISTS "station_history";
DROP TABLE IF EXISTS "stations";
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
-- 2. Cấu trúc bảng cho bảng 'stations'
CREATE TABLE "stations" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL UNIQUE,
    "uid" VARCHAR(20) DEFAULT NULL,
    "lat" DECIMAL(10, 6) NOT NULL,
    "lon" DECIMAL(10, 6) NOT NULL,
    "area" VARCHAR(50) DEFAULT NULL,
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Tạo Trigger để cập nhật cột updated_at khi có thay đổi dữ liệu
CREATE TRIGGER update_stations_modtime BEFORE
UPDATE ON "stations" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 3. Cấu trúc bảng cho bảng 'station_history'
CREATE TABLE "station_history" (
    "id" BIGSERIAL PRIMARY KEY,
    "station_id" INT NOT NULL,
    "aqi" INT DEFAULT NULL,
    "pm25" DECIMAL(8, 2) DEFAULT NULL,
    "pm10" DECIMAL(8, 2) DEFAULT NULL,
    "o3" DECIMAL(8, 2) DEFAULT NULL,
    "no2" DECIMAL(8, 2) DEFAULT NULL,
    "so2" DECIMAL(8, 2) DEFAULT NULL,
    "co" DECIMAL(8, 2) DEFAULT NULL,
    "temperature" DECIMAL(5, 2) DEFAULT NULL,
    "humidity" DECIMAL(5, 2) DEFAULT NULL,
    "recorded_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Các ràng buộc (Constraints)
    CONSTRAINT fk_station FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT unique_station_time UNIQUE ("station_id", "recorded_at")
);
-- Tạo Index (Chỉ mục) bổ sung
CREATE INDEX idx_history_recorded_at ON "station_history" ("recorded_at");
CREATE INDEX idx_history_station_id ON "station_history" ("station_id");
-- -- --------------------------------------------------------
-- -- 4. Đổ dữ liệu cho bảng 'stations'
-- -- --------------------------------------------------------
-- INSERT INTO "stations" (
--         "id",
--         "name",
--         "uid",
--         "lat",
--         "lon",
--         "area",
--         "is_active",
--         "created_at",
--         "updated_at"
--     )
-- VALUES 
--     (
--         2,
--         'UNIS Hà Nội',
--         NULL,
--         20.974440,
--         105.789720,
--         'Hà Đông',
--         TRUE,
--         '2025-12-09 02:28:44',
--         '2025-12-09 02:28:44'
--     ),
--     (
--       
--     (
--         4,
--         'Hoàn Kiếm',
--         NULL,
--         21.028880,
--         105.852230,
--         'Hoàn Kiếm',
--         TRUE,
--         '2025-12-09 02:28:44',
--         '2025-12-09 02:28:44'
--     ),
--   
--     (
--         6,
--         'Cầu Giấy',
--         NULL,
--         21.035830,
--         105.798610,
--         'Cầu Giấy',
--         TRUE,
--         '2025-12-09 02:28:44',
--         '2025-12-09 02:28:44'
--     );
-- -- Cập nhật lại giá trị của sequence để tránh lỗi khi chèn dữ liệu mới   
-- SELECT setval(
--         'stations_id_seq',
--         (
--             SELECT MAX(id)
--             FROM "stations"
--         )
--     );
-- -- Kết thúc Transaction
-- COMMIT;
-- 1. BẢNG TRẠM (Dữ liệu tĩnh)
-- Tích hợp thêm trường 'geom' để QGIS và GeoServer có thể đọc được tọa độ
-- CREATE TABLE stations (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(100),
--     uid VARCHAR(20),       -- Dùng để lưu ID trạm trên hệ thống của AQICN (nếu cần)
--     lat NUMERIC(10,6),
--     lon NUMERIC(10,6),
--     geom GEOMETRY(Point, 4326), -- Cột không gian bắt buộc (Hệ WGS 84)
--     area VARCHAR(50),
--     is_active BOOLEAN DEFAULT TRUE,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- -- Tạo chỉ mục không gian giúp tải bản đồ trên Web nhanh hơn
-- CREATE INDEX sidx_stations_geom ON stations USING GIST (geom);
-- -- 2. BẢNG LỊCH SỬ (Dữ liệu động)
-- -- Giữ nguyên các trường chỉ số ô nhiễm chi tiết của bạn
-- CREATE TABLE station_history (
--     id BIGSERIAL PRIMARY KEY,
--     station_id INTEGER REFERENCES stations(id) ON DELETE CASCADE,
--     aqi INTEGER,
--     pm25 NUMERIC(8,2),
--     pm10 NUMERIC(8,2),
--     o3 NUMERIC(8,2),
--     no2 NUMERIC(8,2),
--     so2 NUMERIC(8,2),
--     co NUMERIC(8,2),
--     temperature NUMERIC(5,2),
--     humidity NUMERIC(5,2),
--     recorded_at TIMESTAMP
-- );
-- -- 3. TẠO VIEW (Lớp trung gian cho GeoServer)
-- -- GeoServer không thể tự join 2 bảng để vẽ bản đồ. Nó cần một bảng phẳng chứa cả tọa độ (geom) và chỉ số AQI mới nhất.
-- CREATE OR REPLACE VIEW vw_latest_station_aqi AS
-- SELECT 
--     s.id AS station_id, 
--     s.name, 
--     s.geom, 
--     h.aqi, 
--     h.pm25, 
--     h.pm10,
--     h.o3,
--     h.no2,
--     h.so2,
--     h.co,
--     h.temperature,
--     h.humidity,
--     h.recorded_at
-- FROM stations s
-- JOIN station_history h ON s.id = h.station_id
-- WHERE h.recorded_at = (
--     -- Lệnh này đảm bảo bản đồ luôn chỉ lấy dòng dữ liệu có thời gian mới nhất của mỗi trạm
--     SELECT MAX(recorded_at) 
--     FROM station_history 
--     WHERE station_id = s.id
-- );
-- //////////////////////////////////////////////////////////////////////////////////////////////
-- // update schema.sql for PostGIS and GeoServer integration 
-- //////////////////////////////////////////////////////////////////////////////////////////////
-- -- 1. Tạo bảng stations
-- CREATE TABLE stations (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) UNIQUE NOT NULL,
--     uid VARCHAR(50),
--     lat NUMERIC(10, 6),
--     lon NUMERIC(10, 6),
--     area VARCHAR(100),
--     is_active BOOLEAN DEFAULT true,
--     geom GEOMETRY(Point, 4326),
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- -- 2. Tạo bảng station_history
-- CREATE TABLE station_history (
--     id SERIAL PRIMARY KEY,
--     station_id INTEGER REFERENCES stations(id),
--     aqi INTEGER,
--     pm25 NUMERIC(10, 2),
--     pm10 NUMERIC(10, 2),
--     o3 NUMERIC(10, 2),
--     no2 NUMERIC(10, 2),
--     so2 NUMERIC(10, 2),
--     co NUMERIC(10, 2),
--     recorded_at TIMESTAMPTZ DEFAULT NOW(),
--     UNIQUE(station_id, recorded_at)
-- );
-- -- 3. Tạo View cho GeoServer
-- CREATE OR REPLACE VIEW vw_latest_station_aqi AS
-- SELECT
--     s.id,
--     s.name,
--     s.uid,
--     s.area,
--     s.geom,
--     h.aqi,
--     h.pm25,
--     h.pm10,
--     h.recorded_at
-- FROM stations s
-- LEFT JOIN LATERAL (
--     SELECT aqi, pm25, pm10, recorded_at
--     FROM station_history
--     WHERE station_id = s.id
--     ORDER BY recorded_at DESC
--     LIMIT 1
-- ) h ON true
-- WHERE s.is_active = true AND s.geom IS NOT NULL;