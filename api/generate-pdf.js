/**
 * Vercel serverless function to generate PDF using headless Chrome.
 * Uses @sparticuz/chromium on Vercel, regular puppeteer locally.
 */
module.exports = async (req, res) => {
  const { s: stockNumber } = req.query;

  if (!stockNumber) {
    return res.status(400).json({ error: "Missing stock number parameter (s)" });
  }

  const isVercel = !!process.env.VERCEL;
  const baseUrl = "https://media-flatoutmoto.vercel.app";
  const printUrl = `${baseUrl}/print/?s=${encodeURIComponent(stockNumber)}`;

  let browser = null;

  try {
    console.log("Starting browser... (isVercel:", isVercel, ")");

    if (isVercel) {
      // Production: use @sparticuz/chromium
      const chromium = require("@sparticuz/chromium");
      const puppeteer = require("puppeteer-core");
      
      chromium.setHeadlessMode = true;
      chromium.setGraphicsMode = false;

      browser = await puppeteer.launch({
        args: [...chromium.args, "--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 816, height: 1056 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      // Local: use regular puppeteer with bundled Chromium
      const puppeteer = require("puppeteer");
      
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 816, height: 1056 },
      });
    }

    console.log("Browser started, creating page...");
    const page = await browser.newPage();

    console.log("Navigating to:", printUrl);
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Wait for JS to execute
    await new Promise((r) => setTimeout(r, 5000));

    // Debug: check page content
    const content = await page.content();
    console.log("Page content length:", content.length);

    if (content.includes("Loading print layout")) {
      console.log("Still loading, waiting more...");
      await new Promise((r) => setTimeout(r, 5000));
    }

    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in" },
    });

    console.log("PDF generated, size:", pdfBuffer.length);

    const filename = `${stockNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    res.end(pdfBuffer);
    return;
  } catch (error) {
    console.error("PDF generation error:", error.message);
    return res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
