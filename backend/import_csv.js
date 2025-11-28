import fs from "fs";
import { pool } from "./db.js";
import csv from "csv-parser";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đổi tên file CSV cho khớp với file bạn tải lên
const csvFilePath = path.resolve(__dirname, "hanoi-air-quality - 2025.csv");

async function importCsvData() {
  console.log("🚀 Bắt đầu nhập dữ liệu từ CSV (Full cột)...");

  const client = await pool.connect();

  try {
    const results = [];

    // Đọc file CSV
    fs.createReadStream(csvFilePath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase(),
        })
      )
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        console.log(`📂 Đã đọc ${results.length} dòng. Đang ghi vào DB...`);

        await client.query("BEGIN");

        let count = 0;
        for (const row of results) {
          const parseVal = (val) =>
            val && val.trim() !== "" ? parseFloat(val) : null;

          // Ánh xạ đúng tên cột trong file CSV
          const recordDate = row.date;
          const pm25 = parseVal(row.pm25);
          const pm10 = parseVal(row.pm10);
          const o3 = parseVal(row.o3);
          const no2 = parseVal(row.no2);
          const so2 = parseVal(row.so2);
          const co = parseVal(row.co);

          if (!recordDate) continue;

          await client.query(
            `INSERT INTO hanoi_archive (record_date, pm25, pm10, o3, no2, so2, co)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (record_date) DO UPDATE SET
                    pm25 = EXCLUDED.pm25,
                    pm10 = EXCLUDED.pm10,
                    o3 = EXCLUDED.o3,
                    no2 = EXCLUDED.no2,
                    so2 = EXCLUDED.so2,
                    co = EXCLUDED.co`,
            [recordDate, pm25, pm10, o3, no2, so2, co]
          );
          count++;
        }

        await client.query("COMMIT");
        console.log(
          `✅ Đã nhập thành công ${count} bản ghi (đủ PM10, NO2, SO2, CO)!`
        );
        process.exit(0);
      });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Lỗi nhập liệu:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

importCsvData();
