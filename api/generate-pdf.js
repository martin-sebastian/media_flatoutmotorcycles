/**
 * Vercel serverless function to generate a quote PDF using headless Chrome.
 * Renders the /quote/ page with full state params and prints to PDF.
 */
module.exports = async (req, res) => {
  const {
    s: stockNumber,
    name,
    info,
    hide,
    acc,
    img,
  } = req.query;

  if (!stockNumber) {
    return res.status(400).json({ error: "Missing stock number parameter (s)" });
  }

  const isVercel = !!process.env.VERCEL;
  const baseUrl = isVercel ? "https://media-flatoutmoto.vercel.app" : "http://localhost:3001";

  const quoteParams = new URLSearchParams();
  quoteParams.set("search", stockNumber);
  if (name) quoteParams.set("name", name);
  if (info) quoteParams.set("info", info);
  if (hide) quoteParams.set("hide", hide);
  if (acc) quoteParams.set("acc", acc);
  if (img) quoteParams.set("img", img);

  const quoteUrl = `${baseUrl}/quote/?${quoteParams.toString()}`;

  let browser = null;

  try {
    console.log("Starting browser for PDF... (isVercel:", isVercel, ")");

    if (isVercel) {
      const chromium = require("@sparticuz/chromium");
      const puppeteer = require("puppeteer-core");
      chromium.setHeadlessMode = true;
      chromium.setGraphicsMode = false;
      browser = await puppeteer.launch({
        args: [...chromium.args, "--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 650, height: 1056 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      const puppeteer = require("puppeteer");
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: 650, height: 1056 },
      });
    }

    const page = await browser.newPage();

    console.log("Navigating to:", quoteUrl);
    await page.goto(quoteUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await new Promise((r) => setTimeout(r, 4000));

    // Hide floating UI elements before printing
    await page.evaluate(() => {
      ["#topBar", "#floatingZoomControls", "#saveQuoteDropdown", "#saveQuoteBtn", "#sidebarOffcanvas"]
        .forEach(sel => {
          const el = document.querySelector(sel);
          if (el) el.style.setProperty("display", "none", "important");
        });
    });

    await new Promise((r) => setTimeout(r, 300));

    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in" },
    });

    console.log("PDF generated, size:", pdfBuffer.length);

    const decodedName = name ? name.replace(/\+/g, " ") : "";
    const sanitizedName = decodedName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-");
    const filename = sanitizedName
      ? `${sanitizedName}-${stockNumber}.pdf`
      : `${stockNumber}-quote.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
    return;
  } catch (error) {
    console.error("PDF generation error:", error.message);
    return res.status(500).json({ error: "Failed to generate PDF", details: error.message });
  } finally {
    if (browser) await browser.close();
  }
};
