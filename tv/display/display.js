const XML_FEED_URL = "https://www.flatoutmotorcycles.com/unitinventory_univ.xml";
const PORTAL_API_BASE = "https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/";

const ROOT = document.getElementById("displayRoot");

/**
 * Read query parameters for the display page.
 * @returns {{layout: string, stockNumber: string, category: string, imageUrl: string, note: string}}
 */
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const slidesParam = params.get("slides") || "";
  const slideUrls = slidesParam
    ? slidesParam
        .split("|")
        .map((entry) => decodeURIComponent(entry))
        .filter(Boolean)
    : [];
  return {
    layout: params.get("layout") || "portrait",
    stockNumber: (params.get("s") || params.get("search") || "").trim(),
    category: (params.get("category") || "").trim().toLowerCase(),
    imageUrl: (params.get("img") || "").trim(),
    note: (params.get("note") || "").trim(),
    swatch: (params.get("swatch") || "").trim(),
    accent1: (params.get("accent1") || "").trim(),
    accent2: (params.get("accent2") || "").trim(),
    slides: slideUrls,
    theme: (params.get("theme") || "dark").trim(),
    slideStart: Number.parseInt(params.get("slideStart") || "2", 10),
    slideEnd: Number.parseInt(params.get("slideEnd") || "6", 10),
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
 * Determine if the current screen is portrait.
 * @returns {boolean} True when portrait orientation.
 */
function isPortraitScreen() {
  return window.matchMedia("(orientation: portrait)").matches || window.innerHeight >= window.innerWidth;
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
 * Fetch XML feed text.
 * @returns {Promise<string>} XML text.
 */
async function fetchXmlText() {
  const response = await fetch(XML_FEED_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`XML fetch failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Parse XML text into item elements.
 * @param {string} xmlText XML feed text.
 * @returns {Element[]} Parsed item nodes.
 */
function parseItems(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  return Array.from(xmlDoc.getElementsByTagName("item"));
}

/**
 * Read text content for a tag name on an XML item.
 * @param {Element} item XML item element.
 * @param {string} tagName Tag name.
 * @returns {string} Text content.
 */
function getItemText(item, tagName) {
  return item.getElementsByTagName(tagName)[0]?.textContent?.trim() || "";
}

/**
 * Extract image URLs from an XML item.
 * @param {Element} item XML item element.
 * @returns {string[]} Image URLs.
 */
function getItemImages(item) {
  return Array.from(item.getElementsByTagName("imageurl"))
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);
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
 * Build a list of media entries for the carousel.
 * @param {object[]} apiImages API image objects.
 * @param {string[]} xmlImages XML image list.
 * @param {string[]} preferredImages Preferred image URLs.
 * @returns {{type: string, src: string, caption: string}[]} Media entries.
 */
function buildMediaList(apiImages, xmlImages, preferredImages) {
  const media = [];

  const preferred = (preferredImages || []).filter(Boolean);
  const imageUrls = (apiImages || []).map((img) => safeText(img.ImgURL)).filter(Boolean);
  const fallbackImages = (xmlImages || []).filter(Boolean);
  const allImages = preferred.length ? preferred : imageUrls.length ? imageUrls : fallbackImages;

  allImages.forEach((url) => {
    media.push({
      type: "image",
      src: url,
      caption: "",
    });
  });

  return media;
}

/**
 * Get the first YouTube embed URL from API videos.
 * @param {object[]} apiVideos API video objects.
 * @returns {string} Embed URL or empty string.
 */
function getYouTubeEmbedUrl(apiVideos) {
  const fallbackId = "pd5fKmJoKew";
  const video = (apiVideos || []).find((item) => item && Number(item.Platform) === 0 && safeText(item.URL));
  const id = video ? safeText(video.URL) : fallbackId;
  return `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&mute=1`;
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
    return `<div class="tv-panel p-5 text-center">Image not available</div>`;
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
 * Build feature cards from API items.
 * @param {object[]} items Feature items list.
 * @returns {string} Feature card markup.
 */
function renderFeatureCards(items, swatchColor, accentOne, accentTwo) {
  const cards = (items || [])
    .filter((item) => item && item.Included === true)
    .filter((item) => safeText(item.Description) || safeText(item.ImageDescription) || safeText(item.ImgURL))
    .slice(0, 3)
    .map((item, index) => {
      const title = safeText(item.Description) || "Feature Highlight";
      const detail = safeText(item.ImageDescription);
      const iconName = ["bi-1-circle", "bi-2-circle", "bi-3-circle"][index] || "bi-star";
      const swatch = swatchColor || "#4bd2b1";
      const accentPrimary = accentOne || "#1f6feb";
      const accentSecondary = accentTwo || "#f97316";
      const imageMarkup =
        index === 0
          ? `<div class="tv-feature-icon">
                <img src="../../tv/img/21.png" class="tv-feature-img" alt="Cruise 21 length" />
              </div>`
          : index === 1
            ? `<div class="tv-feature-icon">
                  <img src="../../img/rotax-engine.png" class="tv-feature-img" alt="Rotax engine" />
                </div>`
            : index === 2
              ? `<div class="tv-feature-icon d-flex flex-column align-items-center justify-content-center gap-2">
                    <i class="bi bi-palette2" style="color: ${swatch};"></i>
                    <span class="tv-color-swatch" style="background-color: ${swatch};"></span>
                    <div class="tv-color-dots">
                      <span class="tv-color-dot" style="background-color: ${swatch};"></span>
                      <span class="tv-color-dot" style="background-color: ${accentPrimary};"></span>
                      <span class="tv-color-dot" style="background-color: ${accentSecondary};"></span>
                    </div>
                  </div>`
              : `<div class="tv-feature-icon"><i class="bi ${iconName}"></i></div>`;
      return `
        <div class="tv-panel p-3 tv-feature-card">
            ${imageMarkup}
            <div class="mt-3 fw-semibold">${title}</div>
            ${detail ? `<div class="text-secondary small mt-1">${detail}</div>` : ""}
        </div>
      `;
    })
    .join("");

  if (!cards) return "";
  return `<div class="tv-feature-grid">${cards}</div>`;
}

/**
 * Build line items list for fees/taxes.
 * @param {object[]} items Items list.
 * @returns {string} List markup.
 */
function renderLineItems(items) {
  const rows = (items || [])
    .filter((item) => safeText(item.Description))
    .map(
      (item) => `
        <div class="d-flex justify-content-between small">
          <span>${safeText(item.Description)}</span>
          <span>${formatPrice(item.Amount)}</span>
        </div>
      `
    )
    .join("");

  if (!rows) return "";
  return `<div class="mt-2">${rows}</div>`;
}

/**
 * Build a normalized data object from XML item fields.
 * @param {Element} item XML item element.
 * @returns {object} Data object.
 */
function buildXmlData(item) {
  return {
    title: getItemText(item, "title"),
    webURL: getItemText(item, "link"),
    stockNumber: getItemText(item, "stocknumber"),
    vin: getItemText(item, "vin"),
    price: getItemText(item, "price"),
    manufacturer: getItemText(item, "manufacturer"),
    year: getItemText(item, "year"),
    modelName: getItemText(item, "model_name"),
    modelType: getItemText(item, "model_type"),
    usage: getItemText(item, "usage"),
    updated: getItemText(item, "updated"),
    images: getItemImages(item),
  };
}

/**
 * Filter items based on category heuristics.
 * @param {object} itemData Normalized item data.
 * @param {string} category Category from query params.
 * @returns {boolean} Match result.
 */
function matchesCategory(itemData, category) {
  if (!category) return true;
  const haystack = `${itemData.modelType} ${itemData.title} ${itemData.manufacturer}`.toLowerCase();
  if (category === "boats") {
    return haystack.includes("boat") || haystack.includes("pontoon") || haystack.includes("sea-doo");
  }
  if (category === "vehicles") {
    return !haystack.includes("boat") && !haystack.includes("pontoon");
  }
  return haystack.includes(category);
}

/**
 * Fetch portal API data for a stock number.
 * @param {string} stockNumber Stock number to query.
 * @returns {Promise<object|null>} API response or null on failure.
 */
async function fetchPortalData(stockNumber) {
  if (!stockNumber) return null;
  try {
    const response = await fetch(`${PORTAL_API_BASE}${encodeURIComponent(stockNumber)}`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Portal API error:", error);
    return null;
  }
}

/**
 * Merge XML and API data, preferring API fields where available.
 * @param {object} xmlData XML-derived data.
 * @param {object|null} apiData API-derived data.
 * @returns {object} Combined data object.
 */
function mergeData(xmlData, apiData) {
  if (!apiData) return xmlData;
  return {
    ...xmlData,
    manufacturer: apiData.Manufacturer || xmlData.manufacturer,
    year: apiData.ModelYear || xmlData.year,
    modelName: apiData.ModelName || xmlData.modelName,
    modelType: apiData.ModelType || xmlData.modelType,
    usage: apiData.Usage || xmlData.usage,
    vin: apiData.VIN || xmlData.vin,
  };
}

/**
 * Render a QR code for a target URL.
 * @param {string} url Target URL for QR code.
 */
function renderQrCode(url) {
  if (!window.QRCode || !url) return;
  const qrContainer = document.getElementById("qrCode");
  if (!qrContainer) return;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, {
    text: url,
    width: 120,
    height: 120,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/**
 * Render a single vehicle in portrait layout.
 * @param {object} data Vehicle data.
 * @param {string} imageUrl Preferred image URL.
 * @param {string} customText Custom text line.
 */
function renderPortrait(data, imageUrl, customText, apiData, preferredImages, slideStart, slideEnd, swatchColor, accentOne, accentTwo) {
  const media = buildMediaList(apiData?.Images, data.images, preferredImages);
  const carouselMarkup = renderMediaCarousel("tvCarouselPortrait", media, slideStart, slideEnd);
  const videoEmbedUrl = getYouTubeEmbedUrl(apiData?.Videos);
  const specialValue = apiData?.QuotePrice || apiData?.SalePrice || apiData?.MSRPUnit || apiData?.MSRP || data.price;
  const msrpValue = apiData?.Price || apiData?.MSRPUnit || apiData?.MSRP;
  const hasDiscount = Number.isFinite(Number(specialValue)) && Number.isFinite(Number(msrpValue)) && Number(specialValue) < Number(msrpValue);
  const paymentValue = apiData?.Payment || apiData?.PaymentAmount;
  const featureMarkup = renderFeatureCards(apiData?.AccessoryItems || apiData?.MUItems, swatchColor, accentOne, accentTwo);
  const feesMarkup = renderLineItems(apiData?.OTDItems || []);
  const rebatesMarkup = renderLineItems(apiData?.MfgRebatesFrontEnd || []);
  const totalValue = apiData?.OTDPrice;
  const financeApr = 8.99;
  const downPaymentRate = 0.1;
  const financeTermMonths = 144;
  const totalAmount = Number(totalValue) || Number(specialValue) || 0;
  const downPayment = totalAmount * downPaymentRate;
  const financedAmount = totalAmount - downPayment;
  const monthlyPayment = calculateMonthlyPayment(financedAmount, financeApr, financeTermMonths);
  const financeSummary = totalAmount
    ? `
      <div class="d-none">
        <div class="d-flex justify-content-between"><span>Price</span><span>${formatPrice(totalAmount)}</span></div>
        <div class="d-flex justify-content-between"><span>Down payment (10%)</span><span>${formatPrice(downPayment)}</span></div>
        <div class="d-flex justify-content-between fw-semibold"><span>Amount financed</span><span>${formatPrice(financedAmount)}</span></div>
        <div class="d-flex justify-content-between mt-2"><span>Term</span><span>${financeTermMonths} months</span></div>
        <div class="d-flex justify-content-between"><span>APR (700+)</span><span>${financeApr}%</span></div>
        <div class="d-flex justify-content-between mt-2 fw-semibold text-danger fs-5"><span>Est. payment</span><span>${formatPrice(monthlyPayment)}/mo</span></div>
      </div>
    `
    : `<div class="text-secondary mt-2">Pricing not available for financing.</div>`;
  const contactLine = apiData?.Phone ? `` : data.webURL ? "Visit flatoutmotorcycles.com" : "Visit Flat Out Motorsports";

  ROOT.innerHTML = `
    <div class="container">

      <div class="mt-3">
        ${carouselMarkup}
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="tv-panel my-3 p-4 h-100 w-100">
            <div class="text-uppercase text-danger h2 fw-bold mt-2">Show Special</div>
            <div class="badge h4 mb-4 bg-danger">${data.usage || "N/A"}</div>
            <div class="text-secondary text-uppercase fw-semibold">${data.title || ""}</div>
            <div class="mb-4">${data.stockNumber || "N/A"}</div>
            ${
              msrpValue
                ? `<div class="text-secondary h6 mb-0 ${hasDiscount ? "text-decoration-line-through" : ""}"><span class="text-decoration-none">MSRP<span> ${formatPrice(msrpValue)}</div>`
                : ""
            }
            <div class="h1 mb-0 fw-bold">${formatPrice(specialValue)}</div>
            <div class="d-flex justify-content-start mt-0 fw-semibold text-danger fs-5"><span class="me-2">Est. payment</span><span>${formatPrice(monthlyPayment)}/mo</span></div>
            
            
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <div class="tv-panel my-3 p-4 px-3 h-100 w-100">
            <div class="fw-semibold mt-2">Fees & Taxes</div>
            <div class="opacity-25">${rebatesMarkup}</div>
            <div class="opacity-25">${feesMarkup}</div>
            ${totalValue ? `<div class="mt-2 fw-semibold pt-1 border-top border-secondary fs-5 text-danger">Total <span class="float-end">${formatPrice(totalValue)}</span></div>` : ""}
          </div>
        </div>
      </div>

      ${featureMarkup ? `<div class="mt-4 pt-2">${featureMarkup}</div>` : ""}

      <div class="row g-3">
        <div class="col-12 col-lg-8">
          <div class="tv-panel my-3 p-4 h-100 w-100">
          <img id="logo" class="ms-1 me-1 pt-0 float-end" src="../../img/fom-app-logo-01.svg" alt="Logo" width="180" height="27" />
            <div class="fw-semibold mt-2">Welcome to the Boat, Sports & Travel Show 2026</div>
            ${financeSummary}
            ${customText ? `<div class="mt-3 text-secondary">${customText}</div>` : ""}
          </div>
        </div>
        <div class="col-12 col-lg-4">
          <div class="tv-panel my-3 p-4 h-100 w-100 d-flex align-items-center justify-content-center">
            <div id="qrCode" class="tv-qr"></div>
          </div>
        </div>
      </div>

      ${
        videoEmbedUrl
          ? `
          <div class="row mt-3">
            <div class="tv-video-frame mt-3">
              <iframe src="${videoEmbedUrl}" title="Overview Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>
        `
          : ""
      }
    </div>
  `;
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
  const media = buildMediaList(apiData?.Images, data.images, preferredImages);
  const carouselMarkup = renderMediaCarousel("tvCarouselLandscape", media, slideStart, slideEnd);
  const videoEmbedUrl = getYouTubeEmbedUrl(apiData?.Videos);
  const specialValue = apiData?.QuotePrice || apiData?.SalePrice || apiData?.MSRPUnit || apiData?.MSRP || data.price;
  const msrpValue = apiData?.Price || apiData?.MSRPUnit || apiData?.MSRP;
  const hasDiscount = Number.isFinite(Number(specialValue)) && Number.isFinite(Number(msrpValue)) && Number(specialValue) < Number(msrpValue);
  const paymentValue = apiData?.Payment || apiData?.PaymentAmount;
  const featureMarkup = renderFeatureCards(apiData?.AccessoryItems || apiData?.MUItems, swatchColor, accentOne, accentTwo);
  const feesMarkup = renderLineItems(apiData?.OTDItems || []);
  const totalValue = apiData?.OTDPrice;
  const financeApr = 8.99;
  const downPaymentRate = 0.1;
  const financeTermMonths = 144;
  const totalAmount = Number(totalValue) || Number(specialValue) || 0;
  const downPayment = totalAmount * downPaymentRate;
  const financedAmount = totalAmount - downPayment;
  const monthlyPayment = calculateMonthlyPayment(financedAmount, financeApr, financeTermMonths);

  ROOT.innerHTML = `
    <div class="container-fluid">
      <div class="row g-3 align-items-center">
        <div class="col-12 col-lg-7" style="outline: 2px dashed white">
          ${carouselMarkup}
          
          
        </div>
        <div class="col-12 col-lg-5" style="outline: 2px dashed white">
          <div class="tv-panel p-3 mb-3">
            <div class="h2 text-danger mb-4 fw-bold text-uppercase">Show Special</div>
            <div class="badge h4 bg-danger">${data.usage || "N/A"}</div>
            <div class="h6 text-secondary text-uppercase fw-semibold mb-0">${data.title || ""}</div>
            <div class="text-light mb-4">${data.stockNumber || ""}</div>
            ${
              msrpValue
                ? `<div class="text-secondary h6 mb-0 ${hasDiscount ? "text-decoration-line-through" : ""}">MSRP ${formatPrice(msrpValue)}</div>`
                : ""
            }
            <div class="display-6 fw-bold text-light mt-0">${formatPrice(specialValue)}</div>
            <div class="d-flex justify-content-start mt-0 fw-semibold text-danger fs-5"><span class="me-2">Est. payment</span><span>${formatPrice(monthlyPayment)}/mo</span></div>
          </div>
          <div class="tv-panel p-3">
            ${totalValue ? `<div class="mt-2 fw-semibold">Total ${formatPrice(totalValue)}</div>` : ""}
            ${feesMarkup}
          </div>
        </div>
        <!-- SECOND ROW -->
        <div class="row g-3">
          <div class="col-12 col-lg-7" style="outline: 2px dashed blue">
            ${customText ? `<div class="tv-panel p-3 fw-semibold">${customText}</div>` : ""}
            ${featureMarkup ? `<div class="mt-4">${featureMarkup}</div>` : ""}
          </div>

          <div class="col-12 col-lg-5" style="outline: 2px dashed green">
            ${
              videoEmbedUrl
                ? `
                <div class="mt-3">
                  <div class="tv-video-frame">
                    <iframe src="${videoEmbedUrl}" title="Overview Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                  </div>
                </div>
              `
                : ""
            }
          </div>
        </div>
      </div>


      
    </div>
  `;
  initCarousels();
}

/**
 * Render a grid of vehicles for landscape mode.
 * @param {object[]} items Vehicle data list.
 */
function renderLandscapeGrid(items) {
  const cards = items
    .slice(0, 6)
    .map(
      (item) => `
        <div class="col">
          <div class="tv-panel p-2 tv-grid-card h-100">
            ${
              item.images[0]
                ? `<img src="${item.images[0]}" alt="${item.title || "Vehicle"}" />`
                : `<div class="tv-panel p-4 text-center">Image not available</div>`
            }
            <div class="mt-2">
              <div class="fw-semibold">${item.year || ""} ${item.manufacturer || ""}</div>
              <div class="text-secondary small">${item.modelName || item.title || ""}</div>
              <div class="fw-bold text-danger">${formatPrice(item.price)}</div>
              <div class="small text-secondary">Stock: ${item.stockNumber || "N/A"}</div>
            </div>
          </div>
        </div>
      `
    )
    .join("");

  ROOT.innerHTML = `
    <div class="container">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <img src="../../img/fom-app-logo-01.svg" alt="Flatout Motorsports" width="180" height="27" />
        <span class="badge text-bg-danger">TV Display</span>
      </div>
      <div class="row row-cols-1 row-cols-md-3 g-3">
        ${cards}
      </div>
    </div>
  `;
}

/**
 * Render a fallback message.
 * @param {string} message Message to display.
 */
function renderMessage(message) {
  ROOT.innerHTML = `<div class="text-center text-secondary">${message}</div>`;
}

/**
 * Initialize the display with XML data and optional API enrichment.
 */
async function initDisplay() {
  const { layout, stockNumber, category, imageUrl, note, slideStart, slideEnd, swatch, accent1, accent2, theme, slides } = getQueryParams();
  document.body.setAttribute("data-bs-theme", theme || "dark");

  const wantsPortrait = layout !== "landscape";
  const screenIsPortrait = isPortraitScreen();
  if (wantsPortrait !== screenIsPortrait) {
    renderMessage(
      wantsPortrait
        ? "You can only display this on a portrait oriented screen."
        : "You can only display this on a landscape oriented screen."
    );
    return;
  }

  try {
    const [xmlText, selectedMap] = await Promise.all([fetchXmlText(), fetchSelectedImages()]);
    const items = parseItems(xmlText).map(buildXmlData).filter((item) => matchesCategory(item, category));

    if (!items.length) {
      renderMessage("No vehicles found for this filter.");
      return;
    }

    if (stockNumber) {
      const normalized = normalizeStockNumber(stockNumber);
      const match = items.find((item) => normalizeStockNumber(item.stockNumber) === normalized);
      if (!match) {
        renderMessage("Stock number not found in XML feed.");
        return;
      }

      const saved = getSavedPicks(selectedMap, normalized);
      const apiData = await fetchPortalData(normalized);
      const merged = mergeData(match, apiData);
      const slideImages = slides && slides.length ? slides : saved.images;
      const slideRangeStart = slideImages.length ? 1 : slideStart;
      const slideRangeEnd = slideImages.length ? slideImages.length : slideEnd;
      const preferredImage = imageUrl || slideImages[0] || merged.images[0] || "";
      const customText = note || saved.text || "";
      const swatchColor = swatch || "";
      const accentOne = accent1 || "";
      const accentTwo = accent2 || "";

      if (layout === "landscape") {
        renderLandscapeSingle(
          merged,
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
          merged,
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
      return;
    }

    if (layout === "landscape") {
      renderLandscapeGrid(items);
      return;
    }

    renderMessage("Provide a stock number for portrait display.");
  } catch (error) {
    console.error("Display error:", error);
    renderMessage("Failed to load display data.");
  }
}

initDisplay();
