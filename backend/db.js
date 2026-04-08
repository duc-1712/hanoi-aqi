// // db.js – CHẠY render

// import { Pool } from "pg";

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     require: true, // Force SSL
//     rejectUnauthorized: false, // Ignore cert errors (Render self-signed)
//   },
// });

// // Log chi tiết để debug
// pool.on("connect", () => console.log("✅ Kết nối PostgreSQL thành công!"));
// pool.on("error", (err) => console.error("❌ Lỗi DB:", err.message));
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Bắt buộc để kết nối với Supabase
  },
});

pool.on("connect", () => console.log("✅ Kết nối Supabase thành công!"));
pool.on("error", (err) => console.error("❌ Lỗi DB:", err.message));

export { pool };
// export { pool };
import { Pool } from "pg";

// ==========================================
// CẤU HÌNH CHO LOCALHOST (CHẠY TRÊN MÁY BẠN)
// ==========================================
// const pool = new Pool({
//   user: "postgres",
//   host: "localhost",
//   database: "hanoi_aqi_project",
//   password: "123456",
//   port: 5432,
// });

// ==========================================
// CẤU HÌNH CHO RENDER (Tạm thời vô hiệu hóa)
// Khi nào nộp bài hoặc đẩy lên mạn web thật thì mở lại phần này
// ==========================================
/*
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true, 
    rejectUnauthorized: false, 
  },
});
*/

// // Log chi tiết để debug
// pool.on("connect", () => console.log("✅ Kết nối PostgreSQL thành công!"));
// pool.on("error", (err) => console.error("❌ Lỗi DB:", err.message));

// export { pool };
