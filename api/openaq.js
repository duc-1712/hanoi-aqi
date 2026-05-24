export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.openaq.org/v3/locations?country_id=VN&city=Hanoi&limit=50",
      {
        headers: {
          "X-API-Key": process.env.OPENAQ_API_KEY,
        },
      },
    );

    const data = await response.json();

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
}
