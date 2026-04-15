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

dotenv.config(); // Nạp các biến môi trường từ file .env

// Ưu tiên lấy Connection String từ biến môi trường (Render/GitHub Actions)
// Nếu không có, hãy dán trực tiếp link Supabase của bạn vào đây để test local
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:[Xuan_duc1234]@db.ebygymgnekmbizraindp.supabase.co:5432/postgres";

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false, // Bắt buộc phải có để kết nối Supabase thành công
  },
});

// Log kiểm tra trạng thái kết nối
pool.on("connect", () => {
  console.log("🚀 Đã kết nối thành công tới Database Cloud (Supabase)!");
});

pool.on("error", (err) => {
  console.error("❌ Lỗi kết nối Database:", err.message);
});

export { pool };
