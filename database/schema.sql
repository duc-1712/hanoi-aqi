-- 1. Xóa bảng cũ để cập nhật cấu trúc mới
DROP TABLE IF EXISTS station_history;
DROP TABLE IF EXISTS stations;
-- Bảng stations 
CREATE TABLE stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
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
-- Bảng station_history 
CREATE TABLE station_history (
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
CREATE INDEX idx_history_name_time ON station_history(station_name, recorded_at);
-- ALTER TABLE stations 
-- ADD COLUMN IF NOT EXISTS uid VARCHAR(10);
-- UPDATE stations 
-- SET uid = v.uid_val
-- FROM (VALUES
--   ('Đại sứ quán Mỹ (Láng Hạ)', '6748'),
--   ('Chi cục BVMT (Cầu Giấy)', '11161'),
--   ('Hàng Đậu', '9509'),
--   ('Hoàn Kiếm', '11158'),
--   ('Tây Mỗ', '11159'),
--   ('Thành Công', '11160'),
--   ('Minh Khai (Bắc Từ Liêm)', '9510')
-- ) AS v(name_val, uid_val)
-- WHERE stations.name = v.name_val
--   AND (uid IS NULL OR uid = '');
-- UPDATE stations 
-- SET uid = 'unknown_' || id 
-- WHERE uid IS NULL OR uid = '';
-- ALTER TABLE stations 
-- ALTER COLUMN uid SET NOT NULL;
-- ALTER TABLE stations 
-- ADD CONSTRAINT stations_uid_key UNIQUE (uid);
-- ALTER TABLE station_history 
-- ADD COLUMN IF NOT EXISTS station_uid VARCHAR(10);
-- UPDATE station_history h
-- SET station_uid = s.uid
-- FROM stations s
-- WHERE h.station_name = s.name
--   AND (h.station_uid IS NULL OR h.station_uid = '');
-- ALTER TABLE station_history 
-- ALTER COLUMN station_uid SET NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_station_uid ON station_history(station_uid);
-- ALTER TABLE station_history 
-- ADD CONSTRAINT fk_history_uid 
-- FOREIGN KEY (station_uid) REFERENCES stations(uid)
-- ON DELETE CASCADE ON UPDATE CASCADE;
-- ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_uid_key;
-- ALTER TABLE stations DROP CONSTRAINT IF EXISTS uid_unique;
-- ALTER TABLE station_history DROP CONSTRAINT IF EXISTS fk_station_uid;
-- ALTER TABLE station_history 
-- ADD CONSTRAINT fk_station_uid 
-- FOREIGN KEY (station_uid) REFERENCES stations(uid) 
-- ON UPDATE CASCADE ON DELETE SET NULL;
-- -- CẬP NHẬT UID (bây giờ không còn lỗi nữa)
-- UPDATE stations SET uid = 'H8641'   WHERE name = 'Đại sứ quán Mỹ (Láng Hạ)';
-- UPDATE stations SET uid = 'H1583'   WHERE name = 'Chi cục BVMT (Cầu Giấy)';
-- UPDATE stations SET uid = 'H8688'   WHERE name = 'Hàng Đậu';
-- UPDATE stations SET uid = 'H8688'   WHERE name = 'Hoàn Kiếm';
-- UPDATE stations SET uid = 'A230626' WHERE name = 'Tây Mỗ';
-- UPDATE stations SET uid = 'H1583'   WHERE name = 'Thành Công';
-- UPDATE stations SET uid = 'A77074'  WHERE name = 'Minh Khai (Bắc Từ Liêm)';
-- UPDATE stations SET uid = 'H77074'  WHERE name = 'Mỗ Lao, Hà Đông';
-- UPDATE stations SET uid = 'A230626' WHERE name = 'Phố Nguyễn Duy Trinh';
-- UPDATE stations SET uid = 'H8688'   WHERE name = 'DHBK Parabola (Giải Phóng)';
-- -- === HOÀN TẤT ===