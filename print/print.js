const PORTAL_API_BASE = "https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/";

const ROOT = document.getElementById("printRoot");

/**
 * Read query parameters for the print page.
 * @returns {{stockNumber: string, imageUrl: string}}
 */
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    stockNumber: (params.get("s") || params.get("search") || "").trim(),
    imageUrl: (params.get("img") || "").trim(),
  };
}

/**
 * Format a number into US currency.
 * @param {number|string} value Price value.
 * @returns {string} Formatted price string.
 */
function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
}

/**
 * Fetch portal API data for a stock number.
 * @param {string} stockNumber Stock number to query.
 * @returns {Promise<object|null>} API response or null on failure.
 */
async function fetchPortalData(stockNumber) {
  if (!stockNumber) return null;
  try {
    const timestamp = Date.now();
    const response = await fetch(`${PORTAL_API_BASE}${encodeURIComponent(stockNumber)}?_t=${timestamp}`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Portal API error:", error);
    return null;
  }
}

/**
 * Build display data from API response.
 * @param {object} apiData Portal API response.
 * @returns {object} Normalized data object.
 */
function buildDisplayData(apiData) {
  // Debug: log first image object to see its structure
  if (apiData?.Images && apiData.Images.length > 0) {
    console.log("First image object structure:", apiData.Images[0]);
    console.log("All image keys:", Object.keys(apiData.Images[0]));
  }
  
  // Try multiple possible property names for image URL
  const images = (apiData?.Images || []).map((img) => {
    return img.ImgURL || img.ImageURL || img.Url || img.url || img.src || img.URL;
  }).filter(Boolean);
  const uniqueImages = [...new Set(images)];
  
  // Debug logging
  console.log("API Images array length:", apiData?.Images?.length);
  console.log("API ImageUrl (single):", apiData?.ImageUrl);
  console.log("Extracted image URLs:", uniqueImages);
  
  // Fallback to single ImageUrl if Images array is empty
  if (uniqueImages.length === 0) {
    const singleImage = apiData?.ImageUrl || apiData?.ImageURL || apiData?.imageUrl;
    if (singleImage) {
      uniqueImages.push(singleImage);
      console.log("Using single image fallback:", singleImage);
    }
  }

  return {
    title: [apiData?.ModelYear, apiData?.Manufacturer, apiData?.ModelName].filter(Boolean).join(" "),
    webURL: apiData?.DetailUrl || "",
    stockNumber: apiData?.StockNumber || "",
    vin: apiData?.VIN || "",
    price: apiData?.Price || apiData?.SalePrice || apiData?.QuotePrice || "",
    msrp: apiData?.MSRPUnit || apiData?.MSRP || "",
    manufacturer: apiData?.Manufacturer || "",
    year: apiData?.ModelYear || "",
    modelName: apiData?.ModelName || "",
    modelType: apiData?.ModelType || "",
    usage: apiData?.Usage || "",
    description: apiData?.B50Desc || "",
    standardFeatures: apiData?.StandardFeatures || "",
    images: uniqueImages,
    phone: apiData?.Phone || "",
  };
}

/**
 * Strip HTML tags and normalize line breaks.
 * @param {string} html HTML string.
 * @returns {string} Plain text string.
 */
function stripHtml(html) {
  if (!html) return "";
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped.replace(/\n{2,}/g, "\n").trim();
}

/**
 * Render a QR code for a target URL.
 * @param {string} url Target URL for QR code.
 */
function renderQrCode(url) {
  if (!window.QRCode || !url) return;
  const qrContainer = document.getElementById("printQrCode");
  if (!qrContainer) return;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, {
    text: url,
    width: 110,
    height: 110,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/**
 * Render feature cards from API items.
 * @param {object[]} items Feature items list.
 * @returns {string} Feature card markup.
 */
function renderFeatureCards(items) {
  const cards = (items || [])
    .filter((item) => item && item.Included === true)
    .filter((item) => item.Description)
    .slice(0, 3)
    .map(
      (item) => `
        <div class="col-4">
          <div class="print-card h-100">
            ${item.ImgURL ? `<img src="${item.ImgURL}" alt="${item.Description}" />` : ""}
            <div class="print-card-body">
              <div class="print-card-title">${item.Description}</div>
              ${item.ImageDescription ? `<div class="print-card-sub">${item.ImageDescription}</div>` : ""}
            </div>
          </div>
        </div>
      `
    )
    .join("");

  if (!cards) return "";
  return `<div class="row g-3">${cards}</div>`;
}

/**
 * Render line items list for fees/taxes.
 * @param {object[]} items Items list.
 * @param {boolean} isCredit If true, show amounts as negative (for rebates/discounts).
 * @returns {string} List markup.
 */
function renderLineItems(items, isCredit = false) {
  const rows = (items || [])
    .filter((item) => item && item.Description)
    .map((item) => {
      const amount = Number(item.Amount) || 0;
      const displayAmount = isCredit ? -Math.abs(amount) : amount;
      return `
        <div class="d-flex justify-content-between ${isCredit ? 'text-success fw-semibold' : ''}">
          <span>${item.Description}</span>
          <span>${formatPrice(displayAmount)}</span>
        </div>
      `;
    })
    .join("");
  return rows ? `<div class="print-list">${rows}</div>` : "";
}

/**
 * Render the print layout.
 * @param {object} data Normalized display data.
 * @param {object} apiData Raw API data.
 * @param {string} overrideImage Optional override image.
 * @param {string} xmlDescription Optional XML description for dealer notes.
 */
function renderPrint(data, apiData, overrideImage, xmlDescription = "") {
  const salePrice = apiData?.QuotePrice || apiData?.SalePrice || apiData?.Price || data.price;
  const msrpValue = apiData?.MSRPUnit || apiData?.MSRP || data.msrp;
  const paymentValue = apiData?.Payment || apiData?.PaymentAmount;
  const totalValue = apiData?.OTDPrice;
  const heroImage = overrideImage || data.images[0] || "../img/noimage.png";
  console.log("Hero image URL:", heroImage);
  console.log("All data.images:", data.images);
  const thumbnails = data.images.slice(0, 12);
  // Use XML description if available, otherwise fall back to API description
  const dealerNotesText = stripHtml(xmlDescription) || stripHtml(data.description);
  const standardFeaturesText = stripHtml(data.standardFeatures);
  const featureMarkup = renderFeatureCards(apiData?.AccessoryItems || apiData?.MUItems);
  const feesMarkup = renderLineItems(apiData?.OTDItems || []);
  const rebatesMarkup = renderLineItems(apiData?.MfgRebatesFrontEnd || [], true);
  const discountsMarkup = renderLineItems(apiData?.DiscountItems || [], true);

  // Pricing logic: if new and MSRP > price, show both
  const isNew = (data.usage || "").toLowerCase() === "new";
  const hasDiscount = msrpValue && salePrice && Number(msrpValue) > Number(salePrice);
  const showBothPrices = isNew && hasDiscount;

  ROOT.innerHTML = `
    <div class="print-header">
      <img src="../img/fom-logo.png" alt="Flatout Motorsports" />
      <div class="print-header-right">
        <div class="print-title">${data.title || "Vehicle"}</div>
        <div class="print-meta-row">
          <span><strong>Stock:</strong> ${data.stockNumber || "N/A"}</span>
          <span><strong>VIN:</strong> ${data.vin || "N/A"}</span>
          <span><strong>Condition:</strong> ${data.usage || "N/A"}</span>
        </div>
      </div>
    </div>

    <div class="row g-3 mt-3">
      <div class="col-6">
        ${heroImage ? `<img class="print-hero" src="${heroImage}" alt="Vehicle image" onerror="this.onerror=null;this.src='../img/noimage.png';" />` : ""}
        ${standardFeaturesText ? `
          <div class="print-panel mt-2">
            <div class="print-panel-title">Standard Features</div>
            <div class="print-features">${standardFeaturesText.replace(/\n/g, "<br />")}</div>
          </div>
        ` : ""}
      </div>
      <div class="col-6">
        <div class="print-panel">
          ${showBothPrices 
            ? `<div class="print-price-row">
                 <span class="print-label">MSRP</span>
                 <span class="print-msrp">${formatPrice(msrpValue)}</span>
               </div>
               <div class="print-price-row">
                 <span class="print-label">Sale Price</span>
                 <span class="print-price">${formatPrice(salePrice)}</span>
               </div>`
            : `<div class="print-price">${formatPrice(salePrice || msrpValue)}</div>`
          }
          ${rebatesMarkup ? `<div class="mt-2">${rebatesMarkup}</div>` : ""}
          ${discountsMarkup ? `<div class="mt-1">${discountsMarkup}</div>` : ""}
          ${paymentValue ? `<div class="print-sub mt-2">Payment ${formatPrice(paymentValue)}/mo</div>` : ""}
        </div>
        <div class="print-panel mt-3">
          <div class="print-panel-title">Fees & Taxes</div>
          ${feesMarkup || '<div class="print-list"><span class="text-secondary">No fees data available</span></div>'}
          ${totalValue ? `<div class="print-total">Total ${formatPrice(totalValue)}</div>` : ""}
        </div>
      </div>
    </div>

    ${featureMarkup ? `<div class="mt-3">${featureMarkup}</div>` : ""}

    <div class="row g-3 mt-3">
      <div class="col-9">
        <div class="print-panel">
          <div class="print-panel-title">Dealer Notes</div>
          <textarea class="print-notes-textarea" rows="4" placeholder="Add dealer notes here...">${dealerNotesText || ""}</textarea>
        </div>
      </div>
      <div class="col-3">
        <div class="print-panel h-100 d-flex flex-column align-items-center justify-content-center">
          <div id="printQrCode"></div>
          ${data.phone ? `<div class="print-phone mt-2">${data.phone}</div>` : ""}
        </div>
      </div>
    </div>

    ${
      thumbnails.length
        ? `
          <div class="print-thumbs mt-3">
            ${thumbnails.map((url) => `<img src="${url}" alt="Thumbnail" onerror="this.onerror=null;this.src='../img/noimage.png';" />`).join("")}
          </div>
        `
        : ""
    }
  `;

  renderQrCode(data.webURL);
}

/**
 * Get all CSS rules as inline styles for PDF generation.
 * @returns {string} Combined CSS text.
 */
function getAllStyles() {
  let styles = "";
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        styles += rule.cssText + "\n";
      }
    } catch (e) {
      // Skip cross-origin stylesheets
    }
  }
  return styles;
}

/**
 * Save the page as PDF using Adobe PDF Services API.
 * @param {string} filename Filename for the PDF.
 */
async function savePdf(filename) {
  const btn = document.getElementById("savePdfBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Generating...';
  }

  try {
    // Get the print area HTML
    const printRoot = document.getElementById("printRoot");
    const printContent = printRoot ? printRoot.innerHTML : "";
    
    // Build full HTML document with inlined styles
    const styles = getAllStyles();
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>${styles}</style>
        <style>
          @page { size: letter; margin: 0.5in; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        </style>
      </head>
      <body class="print-body">
        <main class="print-page">${printContent}</main>
      </body>
      </html>
    `;

    const response = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || "PDF generation failed");
    }

    // Get the PDF blob and trigger download
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-file-earmark-pdf me-2"></i>Save PDF';
    }
  } catch (error) {
    console.error("PDF save error:", error);
    alert(`PDF generation failed: ${error.message}\n\nTry using the Print button instead.`);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-file-earmark-pdf me-2"></i>Save PDF';
    }
  }
}

/**
 * Initialize the print page.
 */
async function initPrint() {
  const { stockNumber, imageUrl } = getQueryParams();
  if (!stockNumber) {
    ROOT.innerHTML = `<div class="text-center text-secondary py-5">Provide a stock number via <code>?s=STOCKNUMBER</code></div>`;
    return;
  }

  try {
    // Fetch both API and XML data in parallel
    const [apiData, xmlData] = await Promise.all([
      fetchPortalData(stockNumber),
      window.getCachedXmlVehicle ? window.getCachedXmlVehicle(stockNumber) : null
    ]);
    
    if (!apiData) {
      ROOT.innerHTML = `<div class="text-center text-secondary py-5">Stock number "${stockNumber}" not found.</div>`;
      return;
    }

    const data = buildDisplayData(apiData);
    
    // Use XML description for dealer notes if available
    const xmlDescription = xmlData?.Description || "";
    console.log("XML Description:", xmlDescription);
    
    renderPrint(data, apiData, imageUrl, xmlDescription);

    // Wire up save PDF button
    const savePdfBtn = document.getElementById("savePdfBtn");
    if (savePdfBtn) {
      const nameParts = [data.stockNumber, data.year, data.manufacturer, data.modelName].filter(Boolean);
      const filename = `${nameParts.join("-").replace(/\s+/g, "-")}.pdf`;
      savePdfBtn.addEventListener("click", () => savePdf(filename));
    }
  } catch (error) {
    console.error("Print error:", error);
    ROOT.innerHTML = `<div class="text-center text-secondary py-5">Failed to load print data.</div>`;
  }
}

initPrint();
