const PORTAL_API_BASE = "https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/";

const ROOT = document.getElementById("displayRoot");
let previewZoomScale = 1;

/**
 * Read config from window.CONFIG or fall back to URL query parameters.
 * @returns {object} Configuration object.
 */
function getQueryParams() {
  const config = window.CONFIG || {};
  const params = new URLSearchParams(window.location.search);
  const slidesParam = config.slides || params.get("slides") || "";
  const slideUrls = Array.isArray(slidesParam)
    ? slidesParam
    : slidesParam
        .split("|")
        .map((entry) => decodeURIComponent(entry))
        .filter(Boolean);
  // Parse stock numbers - single or comma-separated for grid
  const stockParam = (config.stockNumber || params.get("s") || params.get("search") || "").trim();
  const stockNumbers = stockParam.includes(",") 
    ? stockParam.split(",").map(s => s.trim()).filter(Boolean)
    : [stockParam].filter(Boolean);
  
  return {
    layout: config.layout || params.get("layout") || "portrait",
    stockNumber: stockNumbers[0] || "",
    stockNumbers: stockNumbers,
    imageUrl: (config.imageUrl || params.get("img") || "").trim(),
    note: (config.note || params.get("note") || "").trim(),
    swatch: (config.swatch || params.get("swatch") || "").trim(),
    accent1: (config.accent1 || params.get("accent1") || "").trim(),
    accent2: (config.accent2 || params.get("accent2") || "").trim(),
    slides: slideUrls,
    theme: (config.theme || params.get("theme") || localStorage.getItem("theme") || "dark").trim(),
    slideStart: Number.parseInt(config.slideStart || params.get("slideStart") || "1", 10),
    slideEnd: Number.parseInt(config.slideEnd || params.get("slideEnd") || "6", 10),
    preview: config.preview || ["1", "true", "yes"].includes(
      (params.get("preview") || "").toLowerCase()
    ),
  };
}

/**
 * Normalize stock numbers for consistent comparisons.
 * @param {string} value Raw stock number.
 * @returns {string} Normalized string.
 */
function normalizeStockNumber(value) {
  return (value || "").trim().toUpperCase();
}

/**
 * Apply preview zoom to fit 1080x1920 or 1920x1080 layouts.
 * Uses transform scale for consistent cross-browser behavior.
 * @param {string} layout Layout string.
 */
function applyPreviewZoom(layout) {
  if (!ROOT) return;
  const isPortrait = layout !== "landscape" && layout !== "grid";
  const targetWidth = isPortrait ? 1080 : 1920;
  const targetHeight = isPortrait ? 1920 : 1080;
  
  // Calculate scale to fit viewport with padding
  const padding = 20;
  const availableWidth = window.innerWidth - padding * 2;
  const availableHeight = window.innerHeight - padding * 2;
  const scale = Math.min(availableWidth / targetWidth, availableHeight / targetHeight);
  previewZoomScale = Number.isFinite(scale) ? Math.max(0.05, Math.min(1, scale)) : 1;

  // Reset any previous styles
  document.body.style.cssText = "";
  ROOT.style.cssText = "";
  
  // Apply fixed dimensions to body and root
  document.body.style.width = `${targetWidth}px`;
  document.body.style.height = `${targetHeight}px`;
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.background = "#000";
  
  ROOT.style.width = `${targetWidth}px`;
  ROOT.style.height = `${targetHeight}px`;
  ROOT.style.minHeight = `${targetHeight}px`;
  ROOT.style.maxHeight = `${targetHeight}px`;
  ROOT.style.overflow = "hidden";
  ROOT.style.position = "fixed";
  ROOT.style.top = "0";
  ROOT.style.left = "0";
  ROOT.style.transformOrigin = "top left";
  ROOT.style.transform = `scale(${previewZoomScale})`;
  
  // Center the scaled content
  const scaledWidth = targetWidth * previewZoomScale;
  const scaledHeight = targetHeight * previewZoomScale;
  const offsetX = Math.max(0, (window.innerWidth - scaledWidth) / 2);
  const offsetY = Math.max(0, (window.innerHeight - scaledHeight) / 2);
  ROOT.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${previewZoomScale})`;
}

/**
 * Apply fixed TV mode styling for actual display on TV screens.
 * @param {string} layout Layout string (portrait or landscape).
 */
function applyTvMode(layout) {
  if (!ROOT) return;
  const isPortrait = layout !== "landscape" && layout !== "grid";
  const targetWidth = isPortrait ? 1080 : 1920;
  const targetHeight = isPortrait ? 1920 : 1080;
  
  document.body.style.width = `${targetWidth}px`;
  document.body.style.height = `${targetHeight}px`;
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.background = "#0f1115";
  
  ROOT.style.width = `${targetWidth}px`;
  ROOT.style.height = `${targetHeight}px`;
  ROOT.style.minHeight = `${targetHeight}px`;
  ROOT.style.overflow = "hidden";
  ROOT.style.background = "#0f1115";
}

/**
 * Render markup into the display root.
 * @param {string} markup HTML markup to render.
 */
function setDisplayContent(markup) {
  ROOT.innerHTML = markup;
}

/**
 * Fetch selected image overrides from JSON.
 * @returns {Promise<object>} Selected images map.
 */
async function fetchSelectedImages() {
  try {
    const response = await fetch("../selected-images.json", { cache: "no-cache" });
    if (!response.ok) return {};
    return response.json();
  } catch (error) {
    console.error("Selected images load failed:", error);
    return {};
  }
}

/**
 * Get saved picks for a stock number.
 * @param {object} map Selected images map.
 * @param {string} stockNumber Stock number key.
 * @returns {{images: string[], text: string}} Saved picks.
 */
function getSavedPicks(map, stockNumber) {
  if (!map || !stockNumber) return { images: [], text: "" };
  const direct = map[stockNumber];
  const upper = map[stockNumber.toUpperCase()];
  const lower = map[stockNumber.toLowerCase()];
  const entry = direct || upper || lower || {};
  return {
    images: Array.isArray(entry.images) ? entry.images.filter(Boolean) : [],
    text: typeof entry.text === "string" ? entry.text : "",
  };
}


/**
 * Format price as currency.
 * @param {string} value Raw price value.
 * @returns {string} Formatted price.
 */
function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
}

/**
 * Calculate monthly payment for a fixed-rate loan.
 * @param {number} principal Amount financed.
 * @param {number} apr Annual percentage rate (e.g. 8.99).
 * @param {number} months Term length in months.
 * @returns {number} Monthly payment.
 */
function calculateMonthlyPayment(principal, apr, months) {
  const amount = Number(principal);
  const term = Number(months);
  const rate = Number(apr) / 100 / 12;
  if (!Number.isFinite(amount) || !Number.isFinite(term) || term <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return amount / term;
  return (amount * rate) / (1 - Math.pow(1 + rate, -term));
}

/**
 * Safely trim a string value.
 * @param {string} value Input value.
 * @returns {string} Trimmed string.
 */
function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Return logo path based on the active Bootstrap theme.
 * @returns {string} Theme-aware logo path.
 */
function getThemeLogoPath() {
  const theme = (document.body.getAttribute("data-bs-theme") || "dark").toLowerCase();
  return theme === "light"
    ? "../../img/fom-app-logo-02.svg"
    : "../../img/fom-app-logo-01.svg";
}

/**
 * Normalize image URL for deduplication (strip query params, trailing slashes).
 * @param {string} url Image URL.
 * @returns {string} Normalized URL for comparison.
 */
function normalizeImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.split("?")[0].replace(/\/$/, "").toLowerCase();
  }
}

/**
 * Deduplicate image URLs while preserving order.
 * @param {string[]} urls Array of image URLs.
 * @returns {string[]} Deduplicated URLs.
 */
function deduplicateImages(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const normalized = normalizeImageUrl(url);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Build a list of media entries for the carousel.
 * @param {object[]} apiImages API image objects.
 * @param {string[]} preferredImages Preferred image URLs.
 * @returns {{type: string, src: string, caption: string}[]} Media entries.
 */
function buildMediaList(apiImages, preferredImages) {
  const preferred = (preferredImages || []).filter(Boolean);
  const imageUrls = (apiImages || [])
    .sort((a, b) => (a.Order || 0) - (b.Order || 0))
    .map((img) => safeText(img.ImgURL))
    .filter(Boolean);
  
  // Use preferred images if available, otherwise use API images
  const allImages = preferred.length ? preferred : deduplicateImages(imageUrls);

  return allImages.map((url) => ({
    type: "image",
    src: url,
    caption: "",
  }));
}

/**
 * Render a video slot from API videos array (Platform 0 = YouTube).
 * @param {object[]} videos API videos array.
 * @returns {string} Video markup or fallback image.
 */
function renderVideoSlot(videos) {
  const youtube = (videos || []).find((v) => Number(v.Platform) === 0);
  const videoId = youtube?.URL || "";
  if (!videoId || videoId.includes("/") || videoId.includes(".")) {
    return `<div class="tv-video-frame"><img src="../../img/fallback.jpg" alt="Flatout Motorsports" class="object-fit-cover w-100 h-100" /></div>`;
  }
  return `<div class="tv-video-frame"><iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&mute=1" allowfullscreen></iframe></div>`;
}

/**
 * Build markup for a Bootstrap carousel of media.
 * @param {string} id Carousel DOM id.
 * @param {{type: string, src: string, caption: string}[]} media Media entries.
 * @param {number} startIndex One-based start index.
 * @param {number} endIndex One-based end index.
 * @returns {string} Carousel markup.
 */
function renderMediaCarousel(id, media, startIndex, endIndex) {
  if (!media.length) {
    return `<div class="tv-carousel"><img src="../../img/fallback.jpg" class="d-block w-100 tv-hero object-fit-cover" alt="Flatout Motorsports" /></div>`;
  }

  const safeStart = Number.isFinite(startIndex) ? startIndex : 2;
  const safeEnd = Number.isFinite(endIndex) ? endIndex : 6;
  const start = Math.max(1, safeStart);
  const end = Math.max(start, safeEnd);
  const visibleMedia = media.slice(start - 1, end);
  const indicators = visibleMedia
    .map(
      (_, index) => `
        <button type="button" data-bs-target="#${id}" data-bs-slide-to="${index}" ${
        index === 0 ? 'class="active" aria-current="true"' : ""
      } aria-label="Slide ${index + 1}"></button>
      `
    )
    .join("");

  const slides = visibleMedia
    .map(
      (item, index) => `
        <div class="carousel-item ${index === 0 ? "active" : ""}">
          <img src="${item.src}" class="d-block w-100 tv-hero" alt="Vehicle image" />
        </div>
      `
    )
    .join("");

  return `
    <div id="${id}" class="carousel slide carousel-fade tv-carousel" data-bs-ride="carousel" data-bs-interval="7000" data-bs-pause="false" data-bs-wrap="true">
      <div class="carousel-indicators">
        ${indicators}
      </div>
      <div class="carousel-inner">
        ${slides}
      </div>
      <button class="carousel-control-prev" type="button" data-bs-target="#${id}" data-bs-slide="prev">
        <span class="carousel-control-prev-icon" aria-hidden="true"></span>
        <span class="visually-hidden">Previous</span>
      </button>
      <button class="carousel-control-next" type="button" data-bs-target="#${id}" data-bs-slide="next">
        <span class="carousel-control-next-icon" aria-hidden="true"></span>
        <span class="visually-hidden">Next</span>
      </button>
    </div>
  `;
}

/**
 * Initialize Bootstrap carousels after render.
 */
function initCarousels() {
  if (!window.bootstrap || !window.bootstrap.Carousel) return;
  document.querySelectorAll(".tv-carousel").forEach((element) => {
    new bootstrap.Carousel(element, {
      interval: 7000,
      pause: false,
      ride: "carousel",
      wrap: true,
    });
  });
}

/**
 * Check if a description relates to color.
 * @param {string} desc Description text.
 * @returns {boolean} True if color-related.
 */
function isColorFeature(desc) {
  const lower = (desc || "").toLowerCase();
  return lower.includes("color") || lower.includes("mint") || lower.includes("paint");
}

/**
 * Build feature cards from API AccessoryItems.
 * @param {object[]} items Feature items list.
 * @param {string} swatchColor Main color swatch.
 * @param {string} accentOne First accent color.
 * @param {string} accentTwo Second accent color.
 * @returns {string} Feature card markup.
 */
function renderFeatureCards(items, swatchColor, accentOne, accentTwo) {
  const cards = (items || [])
    .filter((item) => item && item.Included === true)
    .filter((item) => safeText(item.Description) || safeText(item.ImageDescription) || safeText(item.ImgURL))
    .filter((item) => {
      // Skip color features - they're shown in the main box now
      const title = safeText(item.Description);
      const detail = safeText(item.ImageDescription);
      return !isColorFeature(title) && !isColorFeature(detail);
    })
    .slice(0, 3)
    .map((item) => {
      const title = safeText(item.Description) || "Feature";
      const detail = safeText(item.ImageDescription);
      const imgUrl = safeText(item.ImgURL);
      
      const imageMarkup = imgUrl
        ? `<img src="${imgUrl}" class="tv-feature-thumb" alt="${title}" />`
        : `<div class="tv-feature-thumb-icon"><i class="bi bi-check-circle"></i></div>`;
      
      return `
        <div class="tv-feature-row">
          ${imageMarkup}
          <div class="tv-feature-text">
            <div class="fw-semibold">${title}</div>
            ${detail ? `<div class="text-secondary small">${detail}</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  if (!cards) return "";
  return `<div class="tv-feature-list">${cards}</div>`;
}

/**
 * Build line items as list-group-item elements for fees/taxes.
 * @param {object[]} items Items list.
 * @param {boolean} bold Whether to use semibold font weight.
 * @returns {string} List item markup (li elements).
 */
function renderLineItems(items, bold = false) {
  const weightClass = bold ? "fw-semibold" : "";
  return (items || [])
    .filter((item) => safeText(item.Description))
    .map(
      (item) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 lh-sm ${weightClass}" style="font-size: 0.95rem;">
          <span>${safeText(item.Description)}</span>
          <span class="ms-2">${formatPrice(item.Amount)}</span>
        </li>`
    )
    .join("");
}


/**
 * Fetch portal API data for a stock number.
 * @param {string} stockNumber Stock number to query.
 * @returns {Promise<object|null>} API response or null on failure.
 */
async function fetchPortalData(stockNumber) {
  if (!stockNumber) return null;
  try {
    const cacheBust = `_t=${Date.now()}`;
    const url = `${PORTAL_API_BASE}${encodeURIComponent(stockNumber)}?${cacheBust}`;
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Portal API error:", error);
    return null;
  }
}

/**
 * Build vehicle data object from Portal API response only.
 * @param {object} apiData Portal API response.
 * @returns {object} Vehicle data object.
 */
function buildFromApiData(apiData) {
  if (!apiData) return null;
  const title = [
    apiData.ModelYear,
    apiData.Manufacturer,
    apiData.ModelName,
    apiData.ModelType,
  ].filter(Boolean).join(" ");
  
  const images = (apiData.Images || [])
    .sort((a, b) => (a.Order || 0) - (b.Order || 0))
    .map((img) => img.ImgURL)
    .filter(Boolean);
  
  return {
    stockNumber: apiData.StockNumber || "",
    title: title,
    year: apiData.ModelYear || "",
    manufacturer: apiData.Manufacturer || "",
    modelName: apiData.ModelName || "",
    modelType: apiData.ModelType || "",
    category: apiData.Category || apiData.ModelType || "",
    usage: apiData.Usage || "",
    price: apiData.SalePrice || apiData.MSRPUnit || apiData.MSRP || 0,
    images: images,
    webURL: apiData.WebURL || apiData.DetailUrl || "",
    vin: apiData.VIN || "",
  };
}

/**
 * Render a QR code for a target URL.
 * @param {string} url Target URL for QR code (vehicle detail or display URL).
 */
function renderQrCode(url) {
  if (!window.QRCode) return;
  const qrContainer = document.getElementById("qrCode");
  if (!qrContainer) return;
  const targetUrl = (url && url !== "N/A") ? url : window.location.href;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, {
    text: targetUrl,
    width: 120,
    height: 120,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/**
 * Map Portal API data to PriceCalculator input and run calculation.
 * @param {object} apiData Portal API response.
 * @param {number} fallbackMsrp Fallback MSRP if API has none.
 * @returns {object} PriceCalculator result or null if unavailable.
 */
function calculatePricesFromApi(apiData, fallbackMsrp = 0) {
  if (!window.PriceCalculator || !apiData) return null;
  const msrp = Number(apiData.MSRPUnit || apiData.MSRP || apiData.Price || fallbackMsrp) || 0;
  const accessories = (apiData.AccessoryItems || apiData.MUItems || []).map((a) => ({
    Description: a.Description,
    Amount: Number(a.Amount) || 0,
    Included: !!a.Included,
  }));
  const rebates = apiData.MfgRebatesFrontEnd || apiData.MatItems || [];
  const discounts = apiData.DiscountItems || [];
  const fees = apiData.OTDItems || [];
  return PriceCalculator.calculate({
    msrp,
    accessories,
    customAccessories: [],
    discounts,
    rebates,
    fees,
    tradeIn: 0,
  });
}

/**
 * Build common display data from API and XML sources.
 * @param {object} data Vehicle data.
 * @param {object} apiData API data.
 * @param {string} swatchColor Swatch color.
 * @param {string} accentOne Accent color 1.
 * @param {string} accentTwo Accent color 2.
 * @returns {object} Common display data.
 */
function buildDisplayData(data, apiData, swatchColor, accentOne, accentTwo) {
  const msrpValue = apiData?.Price || apiData?.MSRPUnit || apiData?.MSRP;
  const prices = calculatePricesFromApi(apiData, data?.price);
  const specialValue = prices
    ? prices.salesPrice
    : apiData?.QuotePrice || apiData?.SalePrice || apiData?.MSRPUnit || apiData?.MSRP || data.price;
  const totalValue = prices ? prices.totalPrice : apiData?.OTDPrice;
  const hasDiscount = Number.isFinite(Number(specialValue)) && Number.isFinite(Number(msrpValue)) && Number(specialValue) < Number(msrpValue);
  const accessoryTotal = apiData?.AccessoryItemsTotal || (prices?.allAccessoriesTotal ?? 0);
  const financeApr = 4.99;
  const downPaymentRate = 0.1;
  const financeTermMonths = 144;
  const totalAmount = Number(totalValue) || Number(specialValue) || 0;
  const downPayment = totalAmount * downPaymentRate;
  const financedAmount = totalAmount - downPayment;
  const monthlyPayment = window.PriceCalculator?.calculatePayment
    ? PriceCalculator.calculatePayment(totalAmount, downPaymentRate * 100, financeApr, financeTermMonths)
    : calculateMonthlyPayment(financedAmount, financeApr, financeTermMonths);

  // Build accessory line if total exists
  const accessoryLine = accessoryTotal > 0
    ? [{ Description: "Accessories", Amount: accessoryTotal }]
    : [];
  
  // Color info
  const colorName = apiData?.Color || "";
  const swatch = swatchColor || "#4bd2b1";
  const accent1 = accentOne || "#1f6feb";
  const accent2 = accentTwo || "#f97316";
  
  // Contact info
  const phone = apiData?.Phone || "";
  const standardFeatures = apiData?.StandardFeatures || apiData?.B50StandardFeatures || apiData?.standardFeatures || "";
  if (!standardFeatures && apiData) {
    console.debug("TV: No StandardFeatures in API. Keys:", Object.keys(apiData).filter((k) => /standard|feature|desc|b50/i.test(k)));
  }

  return {
    specialValue,
    msrpValue,
    hasDiscount,
    totalValue,
    monthlyPayment,
    colorName,
    swatch,
    accent1,
    accent2,
    phone,
    standardFeatures,
    featureMarkup: renderFeatureCards(apiData?.AccessoryItems || apiData?.MUItems, swatchColor, accentOne, accentTwo),
    feesMarkup: renderLineItems(apiData?.OTDItems || []),
    rebatesMarkup: renderLineItems(apiData?.MfgRebatesFrontEnd || [], true),
    discountMarkup: renderLineItems(apiData?.DiscountItems || [], true),
    accessoryMarkup: renderLineItems(accessoryLine),
  };
}

/**
 * Render middle content for portrait layout (2 columns: left + right).
 */
function renderMiddleDefault(data, displayData, customText) {
  const { specialValue, msrpValue, hasDiscount, totalValue, monthlyPayment, colorName, swatch, accent1, accent2, phone, standardFeatures, featureMarkup, feesMarkup, rebatesMarkup, discountMarkup, accessoryMarkup } = displayData;
  
  // Rule: show MSRP crossed out only if New AND MSRP > sale price
  const isNew = (data.usage || "").toLowerCase() === "new";
  const showMsrpCrossed = isNew && hasDiscount && msrpValue;
  const displayPrice = specialValue || msrpValue;
  
  // Left box: MSRP line (if applicable) + main price
  const leftPriceMarkup = showMsrpCrossed
    ? `<div class="text-secondary h6 small mb-0 text-decoration-line-through">MSRP ${formatPrice(msrpValue) || "Price"}</div>
       <div class="h2 mb-0 fw-black">${formatPrice(specialValue) || "N/A"}</div>`
    : `<div class="h2 mb-0 fw-bold">${formatPrice(displayPrice) || "N/A"}</div>`;
  
  // Right box: price rows as list items
  const priceListItems = showMsrpCrossed
    ? `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 text-secondary text-decoration-line-through" style="font-size: 0.95rem;"><span>MSRP</span><span class="ms-2">${formatPrice(msrpValue) || "N/A"}</span></li>
       <li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 fw-semibold" style="font-size: 0.95rem;"><span>Sale Price</span><span class="ms-2">${formatPrice(specialValue) || "N/A"}</span></li>`
    : `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 fw-semibold" style="font-size: 0.95rem;"><span>Price</span><span class="ms-2">${formatPrice(displayPrice) || "N/A"}</span></li>`;

  const lineItemsList = `
    <ul class="list-group list-group-flush tv-line-items-scroll">
      ${priceListItems}
      ${rebatesMarkup}
      ${discountMarkup}
      ${accessoryMarkup}
      ${feesMarkup}
      ${totalValue ? `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 fw-semibold fs-5 text-danger border-top"><span>Total</span><span class="ms-2">${formatPrice(totalValue)}</span></li>` : ""}
    </ul>`;

  return `
    <div class="tv-middle-grid">
      <!-- Left: Show Special + pricing + line items -->
      <div class="tv-box px-4 py-2 d-flex flex-column overflow-hidden">
        <div>
          <h2 class="text-uppercase text-danger mb-0 h2 fw-black">Boat Show Price</h2>
          <h5 class="text-secondary text-uppercase mb-0 fw-semibold"><span class="d-none badge bg-success p-1 me-2">${data.usage || "N/A"}</span>${data.title || ""}</h5>
          
          <div class="badge h5 bg-danger rounded-pill" style="position: absolute; top: 20px; left: 100px; z-index: 1;">${data.stockNumber || "N/A"}</div>
          <div class="badge h5 bg-primary rounded-pill" style="position: absolute; top: 20px; left: 25px; z-index: 1;">${data.usage || "N/A"}</div>
          <div class="badge fs-1 fw-black bg-warning text-dark rounded-pill" style="position: absolute; top: 20px; left: 695px; z-index: 1;">3 Year Warranty</div>
          <div id="qrCode" class="position-absolute" style="top: 580px; left: 25px; z-index: 1;"></div>

          ${colorName ? `
            <div class="d-none justify-content-between align-items-start gap-2 mt-2">
              <span class="text-secondary small">${colorName}</span>
              <div class="d-flex align-items-center gap-2">
                <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${swatch};"></span>
                <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${accent1};"></span>
                <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${accent2};"></span>
              </div>
            </div>
          ` : ""}
        </div>
        <div class="flex-grow-1"></div>
        <div class="d-flex flex-column align-items-start">
          ${leftPriceMarkup}
          <div class="d-flex align-items-baseline mt-0 mb-0 p-0 fw-semibold text-danger fs-6">
            <span class="me-2">Est. payment</span>
            <span class="tv-payment-amount fs-4">${formatPrice(monthlyPayment)}/mo</span>
          </div>
        </div>
        <hr class="my-2 opacity-25" />
        ${lineItemsList}
      </div>

      <!-- Right: Features + contact/QR -->
      <div class="tv-box p-3 d-flex flex-column">
        <div class="flex-grow-1 overflow-hidden">
          ${standardFeatures ? `<div class="tv-standard-features tv-line-items-scroll text-secondary mb-0">${standardFeatures}</div>` : ""}
          ${customText ? `<div class="text-secondary mt-2 mb-2">${customText}</div>` : ""}
          ${featureMarkup ? `<div class="mt-2">${featureMarkup}</div>` : ""}
        </div>
        <hr class="my-2 opacity-25" />
        <div class="d-flex align-items-center justify-content-around">
          
          <div class="d-flex flex-column justify-content-center align-items-center">
            <img src="${getThemeLogoPath()}" alt="Logo" width="260" height="60" />
            ${phone ? `<div class="d-none mt-3 h2 fw-semibold text-secondary text-center">${phone}</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render portrait layout (default 4 boxes).
 * @param {object} data Vehicle data.
 * @param {string} imageUrl Preferred image URL.
 * @param {string} customText Custom text overlay.
 * @param {object} apiData API response data.
 * @param {string[]} preferredImages Preferred image URLs.
 * @param {number} slideStart Carousel start index.
 * @param {number} slideEnd Carousel end index.
 * @param {string} swatchColor Swatch color.
 * @param {string} accentOne Accent color 1.
 * @param {string} accentTwo Accent color 2.
 */
function renderPortrait(data, imageUrl, customText, apiData, preferredImages, slideStart, slideEnd, swatchColor, accentOne, accentTwo) {
  const media = buildMediaList(apiData?.Images, preferredImages);
  const carouselMarkup = renderMediaCarousel("tvCarouselPortrait", media, slideStart, slideEnd);
  const videoMarkup = renderVideoSlot(apiData?.Videos);
  const displayData = buildDisplayData(data, apiData, swatchColor, accentOne, accentTwo);
  const middleContent = renderMiddleDefault(data, displayData, customText);

  setDisplayContent(`
    <div class="tv-layout-portrait mx-auto">
      <div class="tv-skeleton">
        <div class="tv-region-carousel">
          ${carouselMarkup}
        </div>
        <div class="tv-region-middle">
          ${middleContent}
        </div>
        <div class="tv-region-video">
          ${videoMarkup}
        </div>
      </div>
    </div>
  `);
  renderQrCode(data.webURL);
  initCarousels();
}

/**
 * Render a single vehicle in landscape layout.
 * @param {object} data Vehicle data.
 * @param {string} imageUrl Preferred image URL.
 * @param {string} customText Custom text line.
 */
function renderLandscapeSingle(data, imageUrl, customText, apiData, preferredImages, slideStart, slideEnd, swatchColor, accentOne, accentTwo) {
  const media = buildMediaList(apiData?.Images, preferredImages);
  const carouselMarkup = renderMediaCarousel("tvCarouselLandscape", media, slideStart, slideEnd);
  const videoMarkup = renderVideoSlot(apiData?.Videos);
  
  // Use buildDisplayData for consistent data handling
  const displayData = buildDisplayData(data, apiData, swatchColor, accentOne, accentTwo);
  const {
    specialValue,
    msrpValue,
    hasDiscount,
    totalValue,
    monthlyPayment,
    colorName,
    swatch,
    accent1,
    accent2,
    phone,
    standardFeatures,
    featureMarkup,
    feesMarkup,
    rebatesMarkup,
    discountMarkup,
    accessoryMarkup,
  } = displayData;

  // Determine if new and has discount for pricing display
  const isNew = (data.usage || "").toLowerCase() === "new";
  const showBothPrices = isNew && hasDiscount;

  // Fees box: list-group with price rows and line items
  const landscapePriceItems = showBothPrices
    ? `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 small text-secondary" style="font-size: 0.95rem;"><span>MSRP</span><span class="ms-2">${formatPrice(msrpValue)}</span></li>
       <li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 small" style="font-size: 0.95rem;"><span class="text-secondary">Sale Price</span><span class="ms-2 fw-semibold">${formatPrice(specialValue)}</span></li>`
    : `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 small" style="font-size: 0.95rem;"><span class="text-secondary">Price</span><span class="ms-2 fw-semibold">${formatPrice(specialValue || msrpValue)}</span></li>`;

  const landscapeLineItemsList = `
    <ul class="list-group list-group-flush tv-line-items-scroll">
      ${landscapePriceItems}
      ${rebatesMarkup}
      ${discountMarkup}
      ${accessoryMarkup}
      ${feesMarkup}
      ${totalValue ? `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 fw-bold border-top border-secondary border-opacity-25"><span>Total</span><span class="ms-2">${formatPrice(totalValue)}</span></li>` : ""}
    </ul>`;

  setDisplayContent(`
    <div class="tv-layout-landscape mx-auto">
      <div class="tv-landscape-skeleton">
        <!-- Top-left: Carousel -->
        <div class="tv-region-carousel">
          ${carouselMarkup}
        </div>
        
        <!-- Top-right: Combined pricing + line items -->
        <div class="tv-region-right-info">
          <div class="tv-box p-3 d-flex flex-column overflow-hidden">
            <div class="h2 text-danger fw-bolder text-uppercase mb-2">Boat Show Price</div>
            <div class="d-flex align-items-center gap-2 mb-1"> 
              <span class="badge bg-danger">${data.usage || "N/A"}</span>
              <span class="text-secondary text-uppercase fw-semibold small">${data.title || ""}</span>
            </div>
            <div class="text-secondary small">${data.stockNumber || ""}</div>
            ${colorName ? `
              <div class="d-flex align-items-center gap-2 mt-1">
                <span class="text-secondary small">${colorName}</span>
                <div class="d-flex align-items-center gap-2">
                  <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${swatch};"></span>
                  <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${accent1};"></span>
                  <span class="tv-color-dot tv-color-dot-lg" style="background-color: ${accent2};"></span>
                </div>
              </div>
            ` : ""}
            <div class="flex-grow-1"></div>
            <div class="d-flex flex-column align-items-end">
              ${showBothPrices
                ? `<div class="text-secondary small text-decoration-line-through">MSRP ${formatPrice(msrpValue)}</div>
                   <div class="display-6 fw-bold text-light">${formatPrice(specialValue)}</div>`
                : `<div class="text-secondary small">Price</div>
                   <div class="display-6 fw-bold text-light">${formatPrice(specialValue || msrpValue)}</div>`
              }
              <div class="d-flex align-items-baseline fw-semibold text-danger fs-5">
                <span class="me-2">Est. payment</span><span class="tv-payment-amount fs-3">${formatPrice(monthlyPayment)}/mo</span>
              </div>
            </div>
            <hr class="my-2 opacity-25" />
            ${landscapeLineItemsList}
          </div>
        </div>
        
        <!-- Bottom-left: Combined features + contact -->
        <div class="tv-region-left-info">
          <div class="tv-box p-3 d-flex flex-column">
            ${standardFeatures ? `<div class="tv-standard-features tv-line-items-scroll text-secondary small mb-2">${standardFeatures}</div>` : ""}
            ${customText ? `<div class="mb-2">${customText}</div>` : ""}
            ${featureMarkup ? `<div class="flex-grow-1 overflow-hidden">${featureMarkup}</div>` : ""}
            <div class="flex-grow-1"></div>
            <hr class="my-2 opacity-25" />
            <div class="d-flex align-items-center justify-content-around">
              <div id="qrCode" class="tv-qr"></div>
              <div class="d-flex flex-column justify-content-center align-items-center">
                <img src="${getThemeLogoPath()}" alt="Logo" width="180" height="27" />
                ${phone ? `<div class="mt-2 text-secondary small">${phone}</div>` : ""}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Bottom-right: Video -->
        <div class="tv-region-video">
          ${videoMarkup}
        </div>
      </div>
    </div>
  `);
  renderQrCode(data.webURL);
  initCarousels();
}

/**
 * Render a single grid card (mini portrait at 50% scale).
 * @param {object} data Vehicle data.
 * @param {object} apiData API response data.
 * @returns {string} Card markup.
 */
function renderGridCard(data, apiData) {
  const heroImage = data.images[0] || "../../img/fallback.jpg";
  const prices = calculatePricesFromApi(apiData, data?.price);
  const salePrice = prices
    ? prices.salesPrice
    : apiData?.QuotePrice || apiData?.SalePrice || apiData?.MSRPUnit || apiData?.MSRP || data.price;
  const msrpValue = apiData?.Price || apiData?.MSRPUnit || apiData?.MSRP;
  const hasDiscount = msrpValue && salePrice && Number(msrpValue) > Number(salePrice);
  const isNew = (data.usage || "").toLowerCase() === "new";
  const showBothPrices = isNew && hasDiscount;
  const rebatesSum = (apiData?.MfgRebatesFrontEnd || apiData?.MatItems || []).reduce((s, i) => s + (Number(i.Amount) || 0), 0);
  const discountsSum = (apiData?.DiscountItems || []).reduce((s, i) => s + (Number(i.Amount) || 0), 0);
  const totalSavings = prices ? prices.savings : Math.abs(rebatesSum + discountsSum);

  return `
    <div class="tv-grid-card">
      <div class="tv-grid-card-image">
        <img src="${heroImage}" alt="${data.title || 'Vehicle'}" />
      </div>
      <div class="tv-grid-card-info">
        <div class="tv-grid-card-title">${data.year || ""} ${data.manufacturer || ""}</div>
        <div class="tv-grid-card-model">${data.modelName || ""}</div>
        <div class="tv-grid-card-stock">${data.stockNumber || ""}</div>
        <div class="tv-grid-card-pricing">
          ${showBothPrices
            ? `<div class="tv-grid-card-row"><span>MSRP</span><span class="tv-grid-card-msrp">${formatPrice(msrpValue)}</span></div>
               <div class="tv-grid-card-row"><span>Sale</span><span class="tv-grid-card-price">${formatPrice(salePrice)}</span></div>`
            : `<div class="tv-grid-card-row"><span>Price</span><span class="tv-grid-card-price">${formatPrice(salePrice || msrpValue)}</span></div>`
          }
          ${totalSavings > 0 ? `<div class="tv-grid-card-row tv-grid-card-savings"><span>Savings</span><span>-${formatPrice(totalSavings)}</span></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a grid of 10 vehicles (5x2 layout).
 * @param {object[]} vehicles Array of {data, apiData} objects.
 */
function renderGrid(vehicles) {
  const cards = vehicles.map(({ data, apiData }) => renderGridCard(data, apiData)).join("");
  
  setDisplayContent(`
    <div class="tv-layout-grid">
      <div class="tv-grid-header">
        <img src="${getThemeLogoPath()}" alt="Flatout Motorsports" class="tv-grid-logo" />
      </div>
      <div class="tv-grid-container">
        ${cards}
      </div>
    </div>
  `);
}

/**
 * Render a fallback message.
 * @param {string} message Message to display.
 */
function renderMessage(message) {
  ROOT.innerHTML = `<div class="text-center text-secondary">${message}</div>`;
}

/**
 * Initialize the display with Portal API data.
 */
async function initDisplay() {
  const {
    layout,
    stockNumber,
    stockNumbers,
    imageUrl,
    note,
    slideStart,
    slideEnd,
    swatch,
    accent1,
    accent2,
    theme,
    slides,
    preview,
  } = getQueryParams();
  document.body.setAttribute("data-bs-theme", theme || "dark");

  if (preview) {
    applyPreviewZoom(layout);
    window.addEventListener("resize", () => applyPreviewZoom(layout));
  } else {
    applyTvMode(layout);
  }

  try {
    // Grid layout: fetch multiple stock numbers
    if (layout === "grid") {
      if (!stockNumbers.length) {
        renderMessage("Provide stock numbers for grid display (comma-separated).");
        return;
      }
      
      // Fetch all stock numbers in parallel
      const apiResults = await Promise.all(
        stockNumbers.slice(0, 10).map(s => fetchPortalData(normalizeStockNumber(s)))
      );
      
      // Build vehicle data for each
      const vehicles = apiResults
        .filter(apiData => apiData)
        .map(apiData => ({
          data: buildFromApiData(apiData),
          apiData: apiData,
        }));
      
      if (!vehicles.length) {
        renderMessage("No vehicles found. Check stock numbers.");
        return;
      }
      
      renderGrid(vehicles);
      return;
    }

    // Single vehicle: portrait or landscape
    if (!stockNumber) {
      renderMessage("Provide a stock number to display.");
      return;
    }

    const normalized = normalizeStockNumber(stockNumber);
    const [apiData, selectedMap] = await Promise.all([
      fetchPortalData(normalized),
      fetchSelectedImages(),
    ]);

    if (!apiData) {
      renderMessage("Vehicle not found. Check the stock number.");
      return;
    }

    const vehicleData = buildFromApiData(apiData);
    const saved = getSavedPicks(selectedMap, normalized);
    const slideImages = slides && slides.length ? slides : saved.images;
    const slideRangeStart = slideImages.length ? 1 : slideStart;
    const slideRangeEnd = slideImages.length ? slideImages.length : slideEnd;
    const preferredImage = imageUrl || slideImages[0] || vehicleData.images[0] || "";
    const customText = note || saved.text || "";
    const swatchColor = swatch || "";
    const accentOne = accent1 || "";
    const accentTwo = accent2 || "";

    if (layout === "landscape") {
      renderLandscapeSingle(
        vehicleData,
        preferredImage,
        customText,
        apiData,
        slideImages,
        slideRangeStart,
        slideRangeEnd,
        swatchColor,
        accentOne,
        accentTwo
      );
    } else {
      renderPortrait(
        vehicleData,
        preferredImage,
        customText,
        apiData,
        slideImages,
        slideRangeStart,
        slideRangeEnd,
        swatchColor,
        accentOne,
        accentTwo
      );
    }
  } catch (error) {
    console.error("Display error:", error);
    renderMessage("Failed to load display data.");
  }
}

initDisplay();
