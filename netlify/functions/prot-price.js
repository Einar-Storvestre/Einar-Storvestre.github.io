exports.handler = async () => {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/PROT.OL?interval=1d&range=2d",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await res.json();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
