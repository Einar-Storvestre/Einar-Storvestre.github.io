exports.handler = async () => {
  try {
    // Step 1: Get Yahoo Finance session cookies
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
      redirect: "follow",
    });
    const rawCookies = cookieRes.headers.get("set-cookie") || "";
    const cookies = rawCookies.split(",").map((c) => c.split(";")[0].trim()).join("; ");

    // Step 2: Get crumb (Yahoo Finance requires this for API calls)
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Cookie": cookies,
      },
    });
    const crumb = await crumbRes.text();

    // Step 3: Fetch stock data with crumb
    const dataRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/PROT.OL?interval=1d&range=2d&crumb=${encodeURIComponent(crumb)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Cookie": cookies,
        },
      }
    );
    const data = await dataRes.json();

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
