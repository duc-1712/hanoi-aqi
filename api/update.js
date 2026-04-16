// File: api/update.js
import { updateAQIData } from "../backend/fetch_aqi.js";

export default async function handler(req, res) {
  // Đây là cái token để bảo mật, tránh người lạ vào phá
  const { token } = req.query;

  if (token !== "duc_1712") {
    return res.status(401).send("!!!!!");
  }

  try {
    console.log("Bắt đầu cào AQI ");
    await updateAQIData();
    res.status(200).json({
      success: true,
      message: "Dữ liệu đã về Supabase!",
    });
  } catch (err) {
    console.error("Lỗi rồi ông giáo ạ:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
