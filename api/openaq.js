export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.openaq.org/v3/locations?limit=200",
      {
        headers: {
          "X-API-Key": process.env.OPENAQ_API_KEY,
        },
      },
    );

    const data = await response.json();

    // lọc Hà Nội
    const hanoiStations = (data.results || []).filter((s) => {
      const country = s.country?.code === "VN";

      const city =
        s.locality?.toLowerCase().includes("hanoi") ||
        s.name?.toLowerCase().includes("hanoi") ||
        s.name?.toLowerCase().includes("ha noi") ||
        s.name?.toLowerCase().includes("hà nội");

      return country && city;
    });

    res.status(200).json(hanoiStations);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
}
