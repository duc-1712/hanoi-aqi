// db.js – CHẠY render

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true, // Force SSL
    rejectUnauthorized: false, // Ignore cert errors (Render self-signed)
  },
});

// Log chi tiết để debug
pool.on("connect", () => console.log("✅ Kết nối PostgreSQL thành công!"));
pool.on("error", (err) => console.error("❌ Lỗi DB:", err.message));

export { pool };
