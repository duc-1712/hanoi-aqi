// import pkg from "pg";
// import dotenv from "dotenv";
// import path from "path";
// import { fileURLToPath } from "url";

// // Fix cho __dirname trong ES Module
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Đọc tệp .env ở thư mục gốc (air_quality_monitor/.env)
// dotenv.config({ path: path.resolve(__dirname, "../.env") });

// const { Pool } = pkg;

// export const pool = new Pool({
//   user: process.env.PGUSER,
//   host: process.env.PGHOST,
//   database: process.env.PGDATABASE,
//   password: process.env.PGPASSWORD,
//   port: process.env.PGPORT,
// });

// db.js – CHẠY render
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // BẮT BUỘC với Render PostgreSQL
  },
});

export { pool };
