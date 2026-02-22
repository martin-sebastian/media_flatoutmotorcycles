/**
 * Hang Tag Component
 * Modular template system for rendering vehicle hang tags.
 * @module hang-tag
 */

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Format a number as currency.
 * @param {number|string} value - Value to format.
 * @returns {string} Formatted currency string.
 */
function formatCurrency(value) {
  if (typeof numeral !== "undefined") {
    return numeral(value).format("$0,0.00");
  }
  const num = parseFloat(value) || 0;
  return "$" + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,");
}

/**
 * Format a date string.
 * @param {string} dateStr - Date string to format.
 * @returns {string} Formatted date.
 */
function formatDate(dateStr) {
  if (typeof moment !== "undefined") {
    return moment(dateStr).format("MM/DD/YYYY");
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

/**
 * Clean description text - strip disclaimer and highlights, keep only specs.
 * Looks for first spec starting with "Engine" (Engine Type, Engine HP, etc.)
 * @param {string} description - Raw description text.
 * @returns {string} Cleaned description starting from first Engine spec.
 */
function cleanDescription(description) {
  if (!description) return "";
  
  // Look for "Engine" followed by a word and colon (Engine Type:, Engine HP:, Engine:, etc.)
  const engineMatch = description.match(/Engine\s*\w*\s*:/i);
  if (engineMatch) {
    const startIndex = description.indexOf(engineMatch[0]);
    return description.substring(startIndex).trim();
  }
  
  // Fallback: look for common spec patterns (Word: Value)
  const specMatch = description.match(/\b(Displacement|Cylinders|Horsepower|HP|Deck|Weight|Capacity|Fuel)\s*:/i);
  if (specMatch) {
    const startIndex = description.indexOf(specMatch[0]);
    return description.substring(startIndex).trim();
  }
  
  return description;
}

/**
 * Generate list items HTML from an array.
 * @param {Array} items - Array of items with Description and Amount.
 * @param {number} maxItems - Maximum items to show.
 * @returns {string} HTML string.
 */
function generateListItems(items, maxItems = 10) {
  if (!items || !items.length) return "";
  return items
    .slice(0, maxItems)
    .map((item) => `<li class="ht-list-item">${item.Description} <span class="ht-amount">${formatCurrency(item.Amount)}</span></li>`)
    .join("");
}

// ===========================================
// SHARED TEMPLATE PARTIALS
// ===========================================

const HangTagPartials = {
  /**
   * Render the hang hole punch circle.
   */
  hole: () => `<div class="ht-hole"></div>`,

  /**
   * Render the logo container.
   */
  logo: () => `
    <div class="ht-logo-container">
      <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
    </div>
  `,

  /**
   * Render badges row.
   * @param {object} options - Badge options.
   */
  badges: ({ stockNumber, year, usage, metricValue, metricType }) => {
    const stockBadge = stockNumber ? `<span class="ht-badge ht-badge-stock">${stockNumber}</span>` : "";
    const yearBadge = year ? `<span class="ht-badge ht-badge-year">${year}</span>` : "";
    const usageBadge = usage ? `<span class="ht-badge ht-badge-${usage.toLowerCase()}">${usage}</span>` : "";
    let metricBadge = "";
    if (metricValue && parseFloat(metricValue) > 0) {
      const label = metricType || "Miles";
      metricBadge = `<span class="ht-badge ht-badge-metric">${Number(metricValue).toLocaleString()} ${label}</span>`;
    }
    return `<div class="ht-badges">${stockBadge}${yearBadge}${usageBadge}${metricBadge}</div>`;
  },

  /**
   * Render title and stock badge.
   * @param {string} title - Vehicle title.
   * @param {string} stockNumber - Stock number.
   */
  titleBlock: (title) => `
    <h2 class="ht-title">${title}</h2>
  `,

  /**
   * Render yellow tag image if applicable.
   * @param {boolean} hasYellowTag - Whether to show yellow tag.
   */
  yellowTag: (hasYellowTag) => hasYellowTag 
    ? `<img src="https://newportal.flatoutmotorcycles.com/Portal/content/icons/ylwtag.png" class="ht-yellow-tag">` 
    : "",

  /**
   * Render image container.
   * @param {string} imageUrl - Image URL.
   * @param {string} alt - Alt text.
   */
  image: (imageUrl, alt) => imageUrl 
    ? `<div class="ht-image-container" id="photoLine"><img src="${imageUrl}" alt="${alt}" class="ht-image"></div>` 
    : "",

  /**
   * Render QR code container.
   */
  qrCode: () => `<div class="ht-qr-container" id="qrcode"></div>`,

  /**
   * Render barcode container.
   * @param {string} id - Unique ID for barcode SVG.
   */
  barcode: (id = "barcode") => `
    <div class="ht-barcode-container">
      <svg id="${id}" class="ht-barcode"></svg>
    </div>
  `,

  /**
   * Render description section.
   * @param {string} description - Description text.
   * @param {string} title - Section title.
   * @param {boolean} clean - Whether to clean the description.
   */
  description: (description, title = "Specifications", clean = true) => {
    const content = clean ? cleanDescription(description) : description;
    if (!content) return "";
    return `
      <div class="ht-description" id="descriptionLine">
        <h5 class="ht-section-title">${title}</h5>
        <div class="ht-description-content">${content}</div>
      </div>
    `;
  },

  /**
   * Render accessories section.
   * @param {Array} items - Accessory items.
   */
  accessories: (items) => {
    if (!items || !items.length) return "";
    return `
      <div class="ht-accessories">
        <h5 class="ht-section-title">Added Accessories</h5>
        <ul class="ht-list">${generateListItems(items, 30)}</ul>
      </div>
    `;
  },

  /**
   * Render standard footer with price.
   * @param {object} options - Footer options.
   */
  footer: ({ price, expireDate, yellowTag, id = "footerLine" }) => `
    <div class="ht-footer" id="${id}">
      <div class="ht-footer-price">${HangTagPartials.yellowTag(yellowTag)} ${formatCurrency(price)}</div>
      <div class="ht-footer-expires">Sale Program Ends: ${expireDate}</div>
    </div>
  `,

  /**
   * Render sold footer with strikethrough price.
   * @param {string} price - Original price (formatted).
   */
  footerSold: (price) => price 
    ? `
      <div class="ht-footer ht-footer-sold">
        <div class="ht-footer-sold-label">price</div>
        <div class="ht-footer-price ht-price-strikethrough">${price}</div>
      </div>
    ` 
    : `
      <div class="ht-footer ht-footer-sold">
        <div class="ht-footer-price">SOLD</div>
      </div>
    `,

  /**
   * Render SOLD banner.
   */
  soldBanner: () => `<div class="ht-sold-banner">SOLD</div>`,
};

// ===========================================
// DATA NORMALIZATION
// ===========================================

/**
 * Build unified hang tag data from Supabase baseline, optionally enriched with portal API data.
 * @param {object} supabaseData - Baseline vehicle data from Supabase (getCachedXmlVehicle shape).
 * @param {object} [portalData] - Optional portal API response for pricing detail.
 * @returns {object} Unified hang tag data.
 */
function normalizeHangTagData(supabaseData, portalData) {
  const sb = supabaseData || {};
  const basePrice = parseFloat(sb.Price || sb.MSRP) || 0;

  const base = {
    stockNumber: sb.StockNumber || "",
    vin: sb.VIN || "",
    modelYear: sb.ModelYear || "",
    manufacturer: sb.Manufacturer || "",
    modelName: sb.ModelName || "",
    modelCode: sb.ModelCode || "",
    color: sb.Color || "",
    usage: sb.Usage || "",
    metricType: sb.B50MetricType || sb.MetricType || "",
    metricValue: sb.B50MetricValue || sb.MetricValue || "",
    imageUrl: sb.ImageUrl || "",
    description: sb.Description || sb.B50Desc || "",
    detailUrl: "",
    standardFeatures: "",
    disclaimer: "",
    ourPrice: basePrice,
    msrp: basePrice,
    msrpUnit: basePrice,
    msrpTitle: "MSRP",
    msrpPlusAccessories: basePrice,
    savings: 0,
    quotePrice: 0,
    salePrice: basePrice,
    otdPrice: 0,
    salePriceExpireDate: "",
    floorExpireDate: "",
    estimatedArrival: "",
    expirationDate: "",
    lot: "",
    unitStatus: "",
    quoteLevel: "",
    yellowTag: false,
    accessoryItems: [],
    matItems: [],
    discountItems: [],
    tradeInItems: [],
    otdItems: [],
  };

  if (!portalData || !portalData.StockNumber) return base;

  const p = portalData;
  const msrp = p.MSRPUnit || p.MSRP || base.msrp;
  const accessoryTotal = p.AccessoryItemsTotal || 0;
  const matTotal = p.MatItemsTotal || 0;
  const discountTotal = p.DiscountItemsTotal || 0;
  const tradeInTotal = p.TradeInItemsTotal || 0;

  return {
    ...base,
    modelName: p.B50ModelName || p.ModelName || base.modelName,
    modelCode: p.ModelCode || base.modelCode,
    metricType: p.B50MetricType || base.metricType,
    metricValue: p.B50MetricValue || base.metricValue,
    imageUrl: p.ImageUrl || base.imageUrl,
    description: p.B50Desc || base.description,
    detailUrl: p.DetailUrl || "",
    standardFeatures: p.StandardFeatures || "",
    disclaimer: p.Disclaimer || "",
    msrp,
    msrpUnit: p.MSRPUnit || msrp,
    msrpTitle: p.MSRPTitle || "MSRP",
    msrpPlusAccessories: msrp + accessoryTotal,
    ourPrice: msrp + accessoryTotal + matTotal + discountTotal + tradeInTotal,
    savings: (discountTotal + matTotal + tradeInTotal) * -1,
    quotePrice: p.QuotePrice || 0,
    salePrice: p.Price || base.salePrice,
    otdPrice: p.OTDPrice || 0,
    salePriceExpireDate: p.SalePriceExpireDate || "",
    floorExpireDate: p.FloorExpireDate || "",
    estimatedArrival: p.EstimatedArrival || "",
    expirationDate: p.ExpirationDate || "",
    lot: p.Lot || "",
    unitStatus: p.UnitStatus || "",
    quoteLevel: p.QuoteLevel || "",
    yellowTag: p.YellowTag || false,
    accessoryItems: p.AccessoryItems || [],
    matItems: p.MatItems || [],
    discountItems: p.DiscountItems || [],
    tradeInItems: p.TradeInItems || [],
    otdItems: p.OTDItems || [],
  };
}

// ===========================================
// TEMPLATE REGISTRY
// ===========================================

/**
 * Template registry - add new templates here.
 * Each template has: name, description, renderLeft, renderRight
 */
const HangTagTemplates = {
  /**
   * Default template - pricing on left, image/specs on right.
   */
  default: {
    name: "Default",
    description: "Pricing details on left, image and specifications on right",
    
    renderLeft: (data, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const expireDate = formatDate(data.salePriceExpireDate);
      const hasDiscount = data.msrpPlusAccessories > data.ourPrice && data.savings > 0;

      // MSRP - only show if there's a discount (crossed out)
      const msrpHtml = hasDiscount 
        ? `<p class="text-center text-secondary fw-bold mb-0" id="msrpLine">MSRP: <span class="text-decoration-line-through">${formatCurrency(data.msrpPlusAccessories)}</span></p>`
        : "";

      // Our Price - large font with yellow tag
      const priceHtml = `
        <h1 class="ht-our-price text-center text-black h1 fw-900 mb-1">
          ${HangTagPartials.yellowTag(data.yellowTag)}
          ${formatCurrency(data.ourPrice)}
        </h1>
      `;

      // Savings badge - only show if there's savings
      const savingsHtml = hasDiscount 
        ? `<h2 class="text-center h1 mb-1" id="savingsLine">
        <span class="badge bg-warning p-3">
            <span class="badge bg-dark me-2">Savings</span>
            <span class="text-black fw-bold"></span>
            <span class="text-dark fw-bold fs-5">${formatCurrency(data.savings)}</span>
        </span>
          </h2>` 
        : "";

      // Expiration line - only show when we have a date from portal
      const expiresHtml = data.salePriceExpireDate
        ? `<p class="text-center text-muted small mb-2">Sale Program Ends: ${expireDate}</p>`
        : "";

      // Build combined line items list (only when portal data provides breakdowns)
      let lineItems = [];
      const hasPortalPricing = data.discountItems.length || data.matItems.length
        || data.accessoryItems.length || data.otdItems.length;

      if (hasPortalPricing) {
        lineItems.push({ Description: "Unit Price", Amount: data.msrpUnit });
        lineItems = lineItems.concat(data.discountItems, data.matItems, data.accessoryItems, data.otdItems);
      }

      const lineItemsHtml = lineItems.length > 0
        ? `<ul class="list-group list-group-flush small">
            ${lineItems.map(item => `
              <li class="list-group-item d-flex justify-content-between align-items-center px-2 py-1">
                <span>${item.Description}</span>
                <span class="fw-semibold">${formatCurrency(item.Amount)}</span>
              </li>
            `).join("")}
          </ul>`
        : "";

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body ht-body-pricing">
            <div class="text-center py-2 border-bottom">
              ${msrpHtml}
              ${priceHtml}
              ${savingsHtml}
              ${expiresHtml}
            </div>
            ${lineItemsHtml}
            ${HangTagPartials.qrCode()}
          </div>
          
          <div class="ht-footer-outline">
          ${data.salePriceExpireDate
            ? HangTagPartials.footer({ price: data.ourPrice, expireDate, yellowTag: data.yellowTag, id: "footerLineLeft" })
            : `<div class="ht-footer" id="footerLineLeft"><div class="ht-footer-price">${data.ourPrice ? formatCurrency(data.ourPrice) : ""}</div></div>`
          }
          </div>
        </div>
      `;
    },

    renderRight: (data, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const expireDate = formatDate(data.salePriceExpireDate);

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.accessories(data.accessoryItems)}
            ${HangTagPartials.description(data.description)}
            ${HangTagPartials.barcode()}
          </div>
          
          <div class="ht-footer-outline">
          ${data.salePriceExpireDate
            ? HangTagPartials.footer({ price: data.ourPrice, expireDate, yellowTag: data.yellowTag, id: "footerLineRight" })
            : `<div class="ht-footer" id="footerLineRight"><div class="ht-footer-price">${data.ourPrice ? formatCurrency(data.ourPrice) : ""}</div></div>`
          }
          </div>
        </div>
      `;
    },
  },

  /**
   * Sold template - for units sold but awaiting pickup.
   */
  sold: {
    name: "Sold",
    description: "SOLD banner with strikethrough price for units awaiting pickup",
    
    renderLeft: (data, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const priceDisplay = data.ourPrice ? formatCurrency(data.ourPrice) : "";
      const barcodeId = `barcode-left-${(data.stockNumber || "").replace(/[^a-zA-Z0-9]/g, '')}`;

      el.innerHTML = `
        <div class="ht-print-tag ht-sold">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.soldBanner()}
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.description(data.description, "Description")}
            ${HangTagPartials.barcode(barcodeId)}
          </div>
          
          <div class="ht-footer-outline">
            ${HangTagPartials.footerSold(priceDisplay)}
          </div>
        </div>
      `;

      if (data.vin && typeof JsBarcode !== "undefined") {
        try { JsBarcode(`#${barcodeId}`, data.vin, { height: 40 }); }
        catch (e) { console.warn("Barcode init failed:", e); }
      }
    },

    renderRight: (data, container) => {
      HangTagTemplates.sold.renderLeft(data, container);
    },
  },

  /**
   * Baseline/loading template - placeholder while data loads.
   */
  baseline: {
    name: "Baseline",
    description: "Loading placeholder with basic info from XML cache",
    
    renderLeft: (xmlData, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${xmlData.Manufacturer || ""} ${xmlData.ModelName || ""}`.trim();
      const year = xmlData.ModelYear || "";
      const stockNumber = xmlData.StockNumber || "";
      const imageUrl = xmlData.ImageUrl || "";
      const price = xmlData.Price || "";
      const priceDisplay = price ? formatCurrency(parseFloat(price) || 0) : "Loading...";

      el.innerHTML = `
        <div class="ht-print-tag ht-baseline">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber, year })}
            ${HangTagPartials.titleBlock(title || "Loading...")}
          </div>
          
          <div class="ht-body">
            ${imageUrl ? HangTagPartials.image(imageUrl, title) : '<div class="ht-image-placeholder">Loading image...</div>'}
            <div class="ht-loading-indicator">
              <div class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span class="ms-2 text-muted">Loading full details...</span>
            </div>
          </div>
          
          <div class="ht-footer-outline">
            <div class="ht-footer">
              <div class="ht-footer-price">${priceDisplay}</div>
            </div>
          </div>
        </div>
      `;
    },

    renderRight: (xmlData, container) => {
      HangTagTemplates.baseline.renderLeft(xmlData, container);
    },
  },

  /**
   * Error template - displays error message.
   */
  error: {
    name: "Error",
    description: "Error state with retry button",
    
    renderLeft: (message, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      el.innerHTML = `
        <div class="ht-print-tag ht-error">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          <div class="ht-header">
            <h1 class="ht-title text-danger">Error Loading Data</h1>
          </div>
          <div class="ht-body text-center p-4">
            <i class="bi bi-exclamation-triangle text-warning" style="font-size: 48px;"></i>
            <p class="mt-3">${message}</p>
            <button class="btn btn-outline-secondary btn-sm mt-2" onclick="location.reload()">
              <i class="bi bi-arrow-clockwise me-1"></i>Retry
            </button>
          </div>
        </div>
      `;
    },

    renderRight: (message, container) => {
      HangTagTemplates.error.renderLeft(message, container);
    },
  },
};

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Clear hang tag container.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function clearHangTag(container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (el) el.innerHTML = "";
}

/**
 * Initialize QR code in container.
 * @param {string} url - URL to encode.
 */
function initHangTagQR(url) {
  const qrContainer = document.getElementById("qrcode");
  if (qrContainer && url && typeof QRCode !== "undefined") {
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
      text: url,
      width: 100,
      height: 100,
    });
  }
}

/**
 * Initialize barcode in container.
 * @param {string} vin - VIN to encode.
 * @param {string} selector - Barcode element selector.
 */
function initHangTagBarcode(vin, selector = "#barcode") {
  if (vin && typeof JsBarcode !== "undefined") {
    try {
      JsBarcode(selector, vin, { height: 40 });
    } catch (e) {
      console.warn("Barcode init failed:", e);
    }
  }
}

/**
 * Fetch raw portal API data for a stock number.
 * @param {string} stockNumber - Stock number to fetch.
 * @returns {Promise<object|null>} Raw portal response, or null.
 */
async function fetchPortalData(stockNumber) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/${encodeURIComponent(stockNumber)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();
    return (data && data.StockNumber) ? data : null;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn("Portal API timed out for:", stockNumber);
    }
    return null;
  }
}

/**
 * Render hang tags using specified template.
 * @param {string} templateName - Template name from registry.
 * @param {object} data - Data to render.
 * @param {string} leftContainer - Left container selector.
 * @param {string} rightContainer - Right container selector.
 */
function renderHangTags(templateName, data, leftContainer = ".tag-left", rightContainer = ".tag-right") {
  const template = HangTagTemplates[templateName];
  if (!template) {
    console.error(`Template "${templateName}" not found`);
    return;
  }
  try {
    console.log(`Rendering template: ${templateName}`);
    template.renderLeft(data, leftContainer);
    template.renderRight(data, rightContainer);
    console.log(`Template ${templateName} rendered successfully`);
    window.dispatchEvent(new CustomEvent("hangTagsRendered"));
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
  }
}

/**
 * Load and render hang tags for a stock number.
 * Supabase provides the reliable baseline; portal API enriches with pricing detail.
 * @param {string} stockNumber - Stock number to load.
 */
async function loadHangTags(stockNumber) {
  if (!stockNumber || !stockNumber.trim()) {
    clearHangTag(".tag-left");
    clearHangTag(".tag-right");
    return;
  }

  let supabaseData = null;

  // 1. Fetch baseline from Supabase (reliable, fast)
  try {
    if (typeof window.getCachedXmlVehicle === "function") {
      supabaseData = await window.getCachedXmlVehicle(stockNumber);
    }
  } catch (error) {
    console.error("Supabase fetch failed:", error);
  }

  if (!supabaseData) {
    const message = `Stock number "${stockNumber}" not found.<br><small class="text-muted">Unit may not be in inventory.</small>`;
    renderHangTags("error", message);
    return;
  }

  // 2. Normalize baseline and render immediately
  let tagData = normalizeHangTagData(supabaseData);
  renderHangTags("default", tagData);

  if (tagData.vin) {
    initHangTagBarcode(tagData.vin, "#barcode");
  }

  // 3. Fetch portal API to enrich with pricing detail
  const portalData = await fetchPortalData(stockNumber);
  if (portalData) {
    tagData = normalizeHangTagData(supabaseData, portalData);
    renderHangTags("default", tagData);
    initHangTagQR(tagData.detailUrl);
    initHangTagBarcode(tagData.vin);
  }
}

/**
 * Get list of available templates.
 * @returns {Array} Array of template info objects.
 */
function getAvailableTemplates() {
  return Object.entries(HangTagTemplates).map(([key, template]) => ({
    id: key,
    name: template.name,
    description: template.description,
  }));
}

// Export for use in other modules
window.HangTagTemplates = HangTagTemplates;
window.HangTagPartials = HangTagPartials;
window.loadHangTags = loadHangTags;
window.renderHangTags = renderHangTags;
window.getAvailableTemplates = getAvailableTemplates;

// Backward compatible API
window.HangTagComponent = {
  load: loadHangTags,
  clear: clearHangTag,
  render: renderHangTags,
  templates: HangTagTemplates,
  partials: HangTagPartials,
};
