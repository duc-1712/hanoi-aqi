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
// File: backend/db.js
// import { Pool } from "pg";

// let pool;

// // KIỂM TRA MÔI TRƯỜNG CHẠY
// if (process.env.DATABASE_URL) {
//   // 1. GitHub Actions
//   pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: { rejectUnauthorized: false }, // Bắt buộc cho Supabase
//   });
//   console.log("☁️ Đang cấu hình kết nối Database trên Cloud (Supabase)...");
// } else {
//   // 2.(Localhost)
//   pool = new Pool({
//     user: "postgres",
//     host: "localhost",
//     database: "hanoi_aqi_project",
//     password: "123456",
//     port: 5432,
//   });
//   console.log("💻 Đang cấu hình kết nối Database trên máy cá nhân (Local)...");
// }
// // Log thông báo trạng thái
// pool.on("connect", () => console.log("✅ Kết nối PostgreSQL thành công!"));
// pool.on("error", (err) => console.error("❌ Lỗi DB:", err.message));

// export { pool };
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

// Ưu tiên dùng biến môi trường để bảo mật
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "❌ CẢNH BÁO: Chưa cấu hình DATABASE_URL trong .env hoặc GitHub Secrets!",
  );
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    // Bắt buộc phải có rejectUnauthorized: false để làm việc với Supabase/Render
    rejectUnauthorized: false,
  },
  // Thêm giới hạn để tránh bị Supabase ngắt kết nối khi quá tải
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("connect", () => {
  console.log("🚀 Kết nối DB Cloud (Supabase) thành công!");
});

pool.on("error", (err) => {
  console.error("❌ Lỗi Pool Database:", err.message);
});

export { pool };
