-- Bắt đầu Transaction
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