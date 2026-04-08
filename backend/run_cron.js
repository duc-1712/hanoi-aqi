// File: backend/run_cron.js
import { updateAQIData } from "./fetch_aqi.js";
import { pool } from "./db.js";

async function run() {
  console.log("GitHub Actions đang khởi động tiến trình cào dữ liệu...");
  try {
    await updateAQIData();
    console.log("Tiến trình hoàn tất!");
  } catch (err) {
    console.error("Có lỗi xảy ra:", err);
  } finally {
    await pool.end(); // Bắt buộc đóng kết nối để GitHub tự tắt máy
    process.exit(0);
  }
}

run();
