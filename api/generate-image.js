/**
 * Vercel serverless function to generate quote image using headless Chrome.
 * Uses @sparticuz/chromium on Vercel, regular puppeteer locally.
 */
module.exports = async (req, res) => {
  const { 
    s: stockNumber, 
    format = "jpeg", 
    quality = "90", 
    width = "650",
    name,     // Customer name
    info,     // Additional info (phone, email, notes)
    hide,     // Comma-separated toggle IDs to hide
    acc,      // Custom accessories (name:price,name:price)
    img,      // First image URL (from XML merge on client)
  } = req.query;

  if (!stockNumber) {
    return res.status(400).json({ error: "Missing stock number parameter (s)" });
  }

  const isVercel = !!process.env.VERCEL;
  const baseUrl = isVercel ? "https://media-flatoutmoto.vercel.app" : "http://localhost:3001";
  
  // Build quote URL with all state params
  const quoteParams = new URLSearchParams();
  quoteParams.set("search", stockNumber);
  if (name) quoteParams.set("name", name);
  if (info) quoteParams.set("info", info);
  if (hide) quoteParams.set("hide", hide);
  if (acc) quoteParams.set("acc", acc);
  if (img) quoteParams.set("img", img);
  
  const quoteUrl = `${baseUrl}/quote/?${quoteParams.toString()}`;

  // Parse options
  const imageFormat = format === "png" ? "png" : "jpeg";
  const imageQuality = Math.min(100, Math.max(1, parseInt(quality) || 90));
  const viewportWidth = Math.min(1200, Math.max(400, parseInt(width) || 650));

  let browser = null;

  try {
    console.log("Starting browser for image generation... (isVercel:", isVercel, ")");

    if (isVercel) {
      // Production: use @sparticuz/chromium
      const chromium = require("@sparticuz/chromium");
      const puppeteer = require("puppeteer-core");
      
      chromium.setHeadlessMode = true;
      chromium.setGraphicsMode = false;

      browser = await puppeteer.launch({
        args: [...chromium.args, "--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: viewportWidth, height: 800, deviceScaleFactor: 2 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      // Local: use regular puppeteer with bundled Chromium
      const puppeteer = require("puppeteer");
      
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-gpu"],
        defaultViewport: { width: viewportWidth, height: 800, deviceScaleFactor: 2 },
      });
    }

    console.log("Browser started, creating page...");
    const page = await browser.newPage();

    console.log("Navigating to:", quoteUrl);
    await page.goto(quoteUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Wait for content to load (extra time for URL params to apply customer info)
    await new Promise((r) => setTimeout(r, 4000));

    // Hide floating/fixed UI elements that overlap the capture area
    await page.evaluate(() => {
      const elementsToHide = [
        "#topBar",              // Fixed header with logo and buttons
        "#floatingZoomControls", // Zoom controls bottom-right
        "#saveQuoteDropdown",    // Save dropdown
        "#saveQuoteBtn",         // Save button
        "#sidebarOffcanvas",     // Sidebar if open
      ];
      elementsToHide.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
          el.style.setProperty("display", "none", "important");
        }
      });
    });

    // Wait for hide to apply
    await new Promise((r) => setTimeout(r, 300));

    // Wait for capture container to be visible
    console.log("Waiting for capture container...");
    await page.waitForSelector(".capture-container", { visible: true, timeout: 10000 });

    // Get element dimensions using JavaScript (works even if element extends beyond viewport)
    const dimensions = await page.evaluate(() => {
      const el = document.querySelector(".capture-container");
      if (!el) return null;
      return {
        width: el.scrollWidth || el.offsetWidth,
        height: el.scrollHeight || el.offsetHeight,
      };
    });

    console.log("Element dimensions:", dimensions);

    if (!dimensions || !dimensions.height) {
      throw new Error("Could not get capture container dimensions");
    }

    // Resize viewport to fit the FULL content height (plus padding)
    const fullHeight = Math.ceil(dimensions.height) + 50;
    console.log("Resizing viewport to height:", fullHeight);
    
    await page.setViewport({
      width: viewportWidth,
      height: fullHeight,
      deviceScaleFactor: 2,
    });

    // Wait for resize and re-layout
    await new Promise((r) => setTimeout(r, 1000));

    // Now find the element for screenshot
    const captureContainer = await page.$(".capture-container");
    if (!captureContainer) {
      throw new Error("Quote capture container not found after resize");
    }

    // Screenshot options - capture the element directly
    const screenshotOptions = {
      type: imageFormat,
    };

    if (imageFormat === "jpeg") {
      screenshotOptions.quality = imageQuality;
    }

    console.log("Taking element screenshot...");
    // Use element.screenshot() - captures just that element, no clipping needed
    const imageBuffer = await captureContainer.screenshot(screenshotOptions);

    console.log("Image generated, size:", imageBuffer.length);

    const extension = imageFormat === "png" ? "png" : "jpg";
    // Build filename: use customer name if provided, otherwise stock number
    // Decode + to space, sanitize, then replace spaces with dashes for cleaner filenames
    const decodedName = name ? name.replace(/\+/g, " ") : "";
    const sanitizedName = decodedName
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const filename = sanitizedName 
      ? `${sanitizedName}-${stockNumber}.${extension}`
      : `${stockNumber}-quote.${extension}`;
    const contentType = imageFormat === "png" ? "image/png" : "image/jpeg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", imageBuffer.length);

    res.end(imageBuffer);
    return;
  } catch (error) {
    console.error("Image generation error:", error.message);
    return res.status(500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
