const XML_FEED_URL = "https://www.flatoutmotorcycles.com/unitinventory_univ.xml";
const PORTAL_API_BASE = "https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/";

let vehiclePreviewTimeout = null;

/**
 * Collect DOM references for the launcher UI.
 * @returns {object} Launcher DOM references.
 */
function getLauncherDom() {
  return {
    stockInput: document.getElementById("stockInput"),
    stockInputHelp: document.getElementById("stockInputHelp"),
    layoutOptions: Array.from(document.querySelectorAll("input[name='layoutOption']")),
    imageUrlInput: document.getElementById("imageUrlInput"),
    customTextInput: document.getElementById("customTextInput"),
    colorPickerInput: document.getElementById("colorPickerInput"),
    accentColorOneInput: document.getElementById("accentColorOneInput"),
    accentColorTwoInput: document.getElementById("accentColorTwoInput"),
    slideStartInput: document.getElementById("slideStartInput"),
    slideEndInput: document.getElementById("slideEndInput"),
    urlOutput: document.getElementById("urlOutput"),
    imageResults: document.getElementById("imageResults"),
    imagesPanel: document.getElementById("tvImagesPanel"),
    loadImagesBtn: document.getElementById("loadImagesBtn"),
    clearImagesBtn: document.getElementById("clearImagesBtn"),
    buildUrlBtn: document.getElementById("buildUrlBtn"),
    copyUrlBtn: document.getElementById("copyUrlBtn"),
    toggleThemeButton: document.getElementById("toggleThemeButton"),
    themeIcon: document.getElementById("theme-icon"),
    previewDisplayModal: document.getElementById("previewDisplayModal"),
    previewDisplayFrameLandscape: document.getElementById("previewDisplayFrameLandscape"),
    previewZoomable: document.getElementById("tvPreviewZoomable"),
    previewZoomOutBtn: document.getElementById("previewZoomOutBtn"),
    previewZoomResetBtn: document.getElementById("previewZoomResetBtn"),
    previewZoomInBtn: document.getElementById("previewZoomInBtn"),
    previewOpenBtn: document.getElementById("previewOpenBtn"),
    vehiclePreview: document.getElementById("vehiclePreview"),
    vehiclePreviewImg: document.getElementById("vehiclePreviewImg"),
    vehiclePreviewTitle: document.getElementById("vehiclePreviewTitle"),
    vehiclePreviewStock: document.getElementById("vehiclePreviewStock"),
  };
}

const DOM = getLauncherDom();

/**
 * Refresh DOM references after the page is ready.
 */
function refreshLauncherDom() {
  Object.assign(DOM, getLauncherDom());
}

let cachedXmlText = "";
let cachedSelectedImages = null;
let selectedSlideUrls = new Set();
let selectedHeroUrl = "";
let previewZoomLevel = 1;
let previewModalInstance = null;

/**
 * Build the base URL for the display page.
 * @returns {string} Absolute URL to /tv/display/
 */
function getDisplayBaseUrl() {
  const displayUrl = new URL("display/", window.location.href);
  return displayUrl.toString();
}

/**
 * Normalize a stock number for comparisons.
 * @param {string} value Raw stock number string.
 * @returns {string} Normalized value.
 */
function normalizeStockNumber(value) {
  return (value || "").trim().toUpperCase();
}

/**
 * Read the launcher stock number from URL params.
 * @returns {string} Stock number from the query string.
 */
function getLauncherStockFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeStockNumber(params.get("stockInput") || params.get("s") || "");
}

/**
 * Read a number param from the launcher URL.
 * @param {string} key Query param key.
 * @param {number} fallback Default value.
 * @returns {number} Parsed number.
 */
function getLauncherNumberParam(key, fallback) {
  const params = new URLSearchParams(window.location.search);
  const value = Number.parseInt(params.get(key), 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Read text param from the launcher URL.
 * @param {string} key Query param key.
 * @returns {string} Param value.
 */
function getLauncherTextParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || "";
}

/**
 * Parse a slides param into a URL list.
 * @param {string} value Slides param string.
 * @returns {string[]} Slide URLs.
 */
function parseSlidesParam(value) {
  if (!value) return [];
  return value
    .split("|")
    .map((entry) => decodeURIComponent(entry))
    .filter(Boolean);
}

/**
 * Fetch selected-images JSON for curated picks.
 * @returns {Promise<object>} Selected images map.
 */
async function fetchSelectedImages() {
  if (cachedSelectedImages) return cachedSelectedImages;
  try {
    const response = await fetch("./selected-images.json", { cache: "no-cache" });
    if (!response.ok) {
      cachedSelectedImages = {};
      return cachedSelectedImages;
    }
    cachedSelectedImages = await response.json();
    return cachedSelectedImages;
  } catch (error) {
    console.error("Selected images load failed:", error);
    cachedSelectedImages = {};
    return cachedSelectedImages;
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
 * Read the selected layout option from the launcher.
 * @returns {string} Selected layout value.
 */
function getSelectedLayout() {
  const selected = DOM.layoutOptions.find((option) => option.checked);
  return selected ? selected.value : "portrait";
}

/**
 * Fetch the XML feed text, with simple in-memory caching.
 * @returns {Promise<string>} XML feed text.
 */
async function fetchXmlText() {
  if (cachedXmlText) return cachedXmlText;
  const response = await fetch(XML_FEED_URL);
  if (!response.ok) {
    throw new Error(`XML fetch failed: ${response.status}`);
  }
  cachedXmlText = await response.text();
  return cachedXmlText;
}

/**
 * Parse XML and return item nodes.
 * @param {string} xmlText XML string.
 * @returns {Element[]} Array of item nodes.
 */
function parseItems(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  return Array.from(xmlDoc.getElementsByTagName("item"));
}

/**
 * Extract text content from an XML item tag.
 * @param {Element} item XML item element.
 * @param {string} tagName Tag to read.
 * @returns {string} Tag text or empty string.
 */
function getItemText(item, tagName) {
  return item.getElementsByTagName(tagName)[0]?.textContent?.trim() || "";
}

/**
 * Return image URLs from an XML item.
 * @param {Element} item XML item element.
 * @returns {string[]} Array of image URLs.
 */
function getItemImages(item) {
  return Array.from(item.getElementsByTagName("imageurl"))
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);
}

/**
 * Render image choices in the UI.
 * @param {string[]} urls Image URLs to display.
 */
function renderImageChoices(urls) {
  DOM.imageResults.innerHTML = "";
  DOM.imagesPanel?.classList.remove("has-images");

  if (!urls.length) {
    DOM.imageResults.innerHTML = `<div class="col-12"><div class="alert alert-secondary">No images found.</div></div>`;
    return;
  }

  DOM.imagesPanel?.classList.add("has-images");
  DOM.imageResults.innerHTML = urls
    .map(
      (url, index) => `
        <div class="col-6 col-md-4">
          <div class="tv-panel p-2">
            <img class="tv-thumb mb-2" src="${url}" alt="Vehicle image" />
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                name="heroImage"
                id="heroSelect-${index}"
                data-hero-url="${url}"
                ${selectedHeroUrl === url ? "checked" : ""}
              />
              <label class="form-check-label" for="heroSelect-${index}">
                Set as hero image
              </label>
            </div>
            <div class="form-check mt-2">
              <input
                class="form-check-input"
                type="checkbox"
                id="slideSelect-${index}"
                data-slide-url="${url}"
                ${selectedSlideUrls.has(url) ? "checked" : ""}
              />
              <label class="form-check-label" for="slideSelect-${index}">
                Include in slideshow
              </label>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

/**
 * Build the display URL from current form values.
 * @returns {string} URL string.
 */
function buildDisplayUrl() {
  const layout = getSelectedLayout();
  const stockInput = DOM.stockInput.value.trim();
  const imageUrl = selectedHeroUrl || DOM.imageUrlInput.value.trim();
  const customText = DOM.customTextInput.value.trim();
  const swatchColor = DOM.colorPickerInput?.value?.trim();
  const accentOne = DOM.accentColorOneInput?.value?.trim();
  const accentTwo = DOM.accentColorTwoInput?.value?.trim();
  const slideStart = Number.parseInt(DOM.slideStartInput?.value, 10);
  const slideEnd = Number.parseInt(DOM.slideEndInput?.value, 10);
  const theme = document.body.getAttribute("data-bs-theme") || "dark";
  const slideList = Array.from(selectedSlideUrls);

  const url = new URL(getDisplayBaseUrl());
  url.searchParams.set("layout", layout);

  // For grid, pass comma-separated stock numbers; otherwise normalize single stock
  if (layout === "grid") {
    const stocks = stockInput.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).join(",");
    if (stocks) url.searchParams.set("s", stocks);
  } else {
    const stockNumber = normalizeStockNumber(stockInput);
    if (stockNumber) url.searchParams.set("s", stockNumber);
    if (imageUrl) url.searchParams.set("img", imageUrl);
    if (customText) url.searchParams.set("note", customText);
    if (swatchColor) url.searchParams.set("swatch", swatchColor);
    if (accentOne) url.searchParams.set("accent1", accentOne);
    if (accentTwo) url.searchParams.set("accent2", accentTwo);
    if (Number.isFinite(slideStart)) url.searchParams.set("slideStart", slideStart);
    if (Number.isFinite(slideEnd)) url.searchParams.set("slideEnd", slideEnd);
    if (slideList.length) {
      url.searchParams.set(
        "slides",
        slideList.map((u) => encodeURIComponent(u)).join("|")
      );
    }
  }
  
  if (theme) url.searchParams.set("theme", theme);

  return url.toString();
}

/**
 * Build the preview URL with relaxed orientation checks.
 * @param {string} [layoutOverride] Layout override value.
 * @returns {string} Preview URL string.
 */
function buildPreviewUrl(layoutOverride) {
  const url = new URL(buildDisplayUrl());
  url.searchParams.set("preview", "1");
  if (layoutOverride) {
    url.searchParams.set("layout", layoutOverride);
  }
  return url.toString();
}

/**
 * Copy the output URL to the clipboard if possible.
 */
async function copyUrlToClipboard() {
  const url = DOM.urlOutput.value.trim();
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    DOM.copyUrlBtn.innerHTML = `<i class="bi bi-clipboard-check me-2"></i>Copied`;
    setTimeout(() => {
      DOM.copyUrlBtn.innerHTML = `<i class="bi bi-clipboard-check me-2"></i>Copy URL`;
    }, 1200);
  } catch (error) {
    console.error("Clipboard copy failed:", error);
  }
}

/**
 * Load images for a given stock number from the XML feed.
 */
async function handleLoadImages() {
  const stockNumber = normalizeStockNumber(DOM.stockInput.value);
  if (!stockNumber) {
    DOM.imageResults.innerHTML = `<div class="col-12"><div class="alert alert-warning">Enter a stock number first.</div></div>`;
    return;
  }

  try {
    const [xmlText, selectedMap] = await Promise.all([fetchXmlText(), fetchSelectedImages()]);
    const items = parseItems(xmlText);
    const match = items.find((item) => normalizeStockNumber(getItemText(item, "stocknumber")) === stockNumber);
    if (!match) {
      DOM.imageResults.innerHTML = `<div class="col-12"><div class="alert alert-danger">Stock number not found in XML.</div></div>`;
      return;
    }
    const saved = getSavedPicks(selectedMap, stockNumber);
    if (saved.text) {
      DOM.customTextInput.value = saved.text;
    }
    if (!selectedHeroUrl && saved.images.length) {
      selectedHeroUrl = saved.images[0];
      DOM.imageUrlInput.value = selectedHeroUrl;
    }
    if (!selectedSlideUrls.size && saved.images.length) {
      selectedSlideUrls = new Set(saved.images);
    }
    const mergedImages = [...saved.images, ...getItemImages(match).filter((url) => !saved.images.includes(url))];
    renderImageChoices(mergedImages);
    // Show clear button
    if (DOM.clearImagesBtn) {
      DOM.clearImagesBtn.classList.remove("d-none");
    }
  } catch (error) {
    console.error("Image load error:", error);
    DOM.imageResults.innerHTML = `<div class="col-12"><div class="alert alert-danger">Failed to load images.</div></div>`;
  }
}

/**
 * Clear image selection and hide images.
 */
function clearImageSelection() {
  DOM.imageResults.innerHTML = "";
  DOM.imagesPanel?.classList.remove("has-images");
  selectedHeroUrl = "";
  selectedSlideUrls.clear();
  if (DOM.imageUrlInput) {
    DOM.imageUrlInput.value = "";
  }
  if (DOM.clearImagesBtn) {
    DOM.clearImagesBtn.classList.add("d-none");
  }
}

/**
 * Handle clicks on image selection buttons.
 * @param {MouseEvent} event Click event.
 */
function handleImageSelection(event) {
  const radio = event.target.closest("[data-hero-url]");
  if (!radio) return;
  const url = radio.getAttribute("data-hero-url");
  if (!url) return;
  selectedHeroUrl = url;
  DOM.imageUrlInput.value = url;
}

/**
 * Handle slide selection checkbox toggles.
 * @param {Event} event Change event.
 */
function handleSlideSelection(event) {
  const checkbox = event.target.closest("[data-slide-url]");
  if (!checkbox) return;
  const url = checkbox.getAttribute("data-slide-url");
  if (!url) return;
  if (checkbox.checked) {
    selectedSlideUrls.add(url);
  } else {
    selectedSlideUrls.delete(url);
  }
}

/**
 * Initialize launcher event listeners.
 */
/**
 * Update the theme icon for the current theme.
 * @param {string} theme Theme name.
 */
function updateThemeIcon(theme) {
  if (!DOM.themeIcon) return;
  if (theme === "dark") {
    DOM.themeIcon.classList.remove("bi-brightness-high");
    DOM.themeIcon.classList.add("bi-moon-stars");
  } else {
    DOM.themeIcon.classList.remove("bi-moon-stars");
    DOM.themeIcon.classList.add("bi-brightness-high");
  }
}

/**
 * Toggle between light and dark themes.
 */
function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-bs-theme") || "dark";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.body.setAttribute("data-bs-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

/**
 * Return a Bootstrap modal instance for preview.
 * @returns {bootstrap.Modal|null} Modal instance.
 */
function getPreviewModalInstance() {
  if (!DOM.previewDisplayModal || !window.bootstrap?.Modal) return null;
  if (!previewModalInstance) {
    previewModalInstance = new bootstrap.Modal(DOM.previewDisplayModal);
  }
  return previewModalInstance;
}

/**
 * Apply zoom to the preview zoomable container (like hang tags).
 * @param {number} scale Zoom scale value.
 */
function applyPreviewZoom(scale) {
  previewZoomLevel = Math.min(1.5, Math.max(0.15, scale));
  const el = DOM.previewZoomable;
  if (!el) return;
  if (window.CSS?.supports?.("zoom: 1")) {
    el.style.zoom = previewZoomLevel;
    el.style.transform = "";
  } else {
    el.style.zoom = "";
    el.style.transform = `scale(${previewZoomLevel})`;
  }
}

/**
 * Calculate fit-to-screen zoom for the preview.
 * @returns {number} Zoom scale.
 */
function getPreviewFitZoom() {
  const el = DOM.previewZoomable;
  if (!el) return 1;
  const padding = 48;
  const availableW = window.innerWidth - padding;
  const availableH = window.innerHeight - 220;
  const isPortrait = el.classList.contains("tv-preview-portrait");
  const baseW = isPortrait ? 1080 : 1920;
  const baseH = isPortrait ? 1920 : 1080;
  const scale = Math.min(availableW / baseW, availableH / baseH);
  return Math.max(0.15, Math.min(1.2, scale));
}

/**
 * Update preview zoom by a delta.
 * @param {number} delta Zoom increment.
 */
function updatePreviewZoom(delta) {
  applyPreviewZoom(previewZoomLevel + delta);
}

/**
 * Open the preview modal with the current display URL.
 */
function openPreviewModal() {
  const layout = getSelectedLayout();
  const previewUrl = buildPreviewUrl(layout);
  if (!previewUrl) return;
  DOM.urlOutput.value = buildDisplayUrl();
  if (DOM.previewDisplayFrameLandscape) {
    DOM.previewDisplayFrameLandscape.src = previewUrl;
  }
  if (DOM.previewZoomable) {
    DOM.previewZoomable.classList.toggle("tv-preview-portrait", layout === "portrait");
  }
  applyPreviewZoom(getPreviewFitZoom());
  const modal = getPreviewModalInstance();
  if (modal) modal.show();
}

/**
 * Open the preview URL in a new tab.
 */
function openPreviewInNewTab() {
  const url = DOM.previewDisplayFrameLandscape?.src || buildDisplayUrl();
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Initialize preview modal controls.
 */
function initializePreviewControls() {
  if (DOM.previewZoomInBtn) {
    DOM.previewZoomInBtn.addEventListener("click", () => updatePreviewZoom(0.1));
  }
  if (DOM.previewZoomOutBtn) {
    DOM.previewZoomOutBtn.addEventListener("click", () => updatePreviewZoom(-0.1));
  }
  if (DOM.previewZoomResetBtn) {
    DOM.previewZoomResetBtn.addEventListener("click", () => applyPreviewZoom(getPreviewFitZoom()));
  }
  if (DOM.previewOpenBtn) {
    DOM.previewOpenBtn.addEventListener("click", openPreviewInNewTab);
  }
  if (DOM.previewDisplayModal) {
    DOM.previewDisplayModal.addEventListener("hidden.bs.modal", () => {
      if (DOM.previewDisplayFrameLandscape) {
        DOM.previewDisplayFrameLandscape.src = "";
      }
    });
  }
}

/**
 * Fetch and display vehicle preview from Portal API.
 * @param {string} stockNumber Stock number to look up.
 */
async function fetchVehiclePreview(stockNumber) {
  if (!stockNumber || stockNumber.includes(",")) {
    // Hide preview for empty or multiple stock numbers
    if (DOM.vehiclePreview) {
      DOM.vehiclePreview.classList.add("d-none");
    }
    return;
  }
  
  try {
    const response = await fetch(`${PORTAL_API_BASE}${encodeURIComponent(stockNumber)}`);
    if (!response.ok) {
      DOM.vehiclePreview?.classList.add("d-none");
      return;
    }
    
    const data = await response.json();
    if (!data) {
      DOM.vehiclePreview?.classList.add("d-none");
      return;
    }
    
    // Build title from year, manufacturer, model
    const title = [data.ModelYear, data.Manufacturer, data.ModelName].filter(Boolean).join(" ");
    const firstImage = data.Images?.[0]?.ImgURL || "";
    
    if (DOM.vehiclePreviewTitle) {
      DOM.vehiclePreviewTitle.textContent = title || "Unknown Vehicle";
    }
    if (DOM.vehiclePreviewStock) {
      DOM.vehiclePreviewStock.textContent = `Stock: ${data.StockNumber || stockNumber}`;
    }
    if (DOM.vehiclePreviewImg) {
      DOM.vehiclePreviewImg.src = firstImage || "../img/fallback.jpg";
    }
    if (DOM.vehiclePreview) {
      DOM.vehiclePreview.classList.remove("d-none");
    }
  } catch (error) {
    console.error("Vehicle preview error:", error);
    DOM.vehiclePreview?.classList.add("d-none");
  }
}

/**
 * Handle stock input changes with debounce.
 */
function handleStockInputChange() {
  clearTimeout(vehiclePreviewTimeout);
  const stockNumber = normalizeStockNumber(DOM.stockInput?.value || "");
  
  // Debounce: wait 500ms after typing stops
  vehiclePreviewTimeout = setTimeout(() => {
    fetchVehiclePreview(stockNumber);
  }, 500);
}

/**
 * Update UI based on selected layout.
 */
function updateLayoutUI() {
  const layout = getSelectedLayout();
  const isGrid = layout === "grid";
  
  // Update stock input placeholder
  if (DOM.stockInput) {
    DOM.stockInput.placeholder = isGrid 
      ? "STOCK1, STOCK2, STOCK3, ... (up to 10)" 
      : "SD21374";
  }
  
  // Update help text
  if (DOM.stockInputHelp) {
    DOM.stockInputHelp.textContent = isGrid
      ? "Enter up to 10 stock numbers, separated by commas."
      : "Enter a single stock number.";
  }
  
  // Hide/show single vehicle options (images, colors, custom text)
  const singleVehicleOptions = document.getElementById("singleVehicleOptions");
  if (singleVehicleOptions) {
    singleVehicleOptions.style.display = isGrid ? "none" : "block";
  }
  
  // Hide vehicle preview for grid layout
  if (DOM.vehiclePreview && isGrid) {
    DOM.vehiclePreview.classList.add("d-none");
  }
}

function initLauncher() {
  refreshLauncherDom();
  if (!DOM.stockInput) return;
  
  // Check for layout parameter in URL
  const urlLayout = getLauncherTextParam("layout");
  if (urlLayout) {
    const layoutRadio = document.querySelector(`input[name="layoutOption"][value="${urlLayout}"]`);
    if (layoutRadio) {
      layoutRadio.checked = true;
    }
  }
  
  // Listen for stock input changes to show vehicle preview
  DOM.stockInput.addEventListener("input", handleStockInputChange);
  
  const initialStock = getLauncherStockFromUrl();
  if (initialStock) {
    DOM.stockInput.value = initialStock;
    // Trigger preview fetch for initial stock
    fetchVehiclePreview(normalizeStockNumber(initialStock));
  }
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.body.setAttribute("data-bs-theme", savedTheme);
  updateThemeIcon(savedTheme);
  if (DOM.slideStartInput) {
    DOM.slideStartInput.value = getLauncherNumberParam("slideStart", 2);
  }
  if (DOM.slideEndInput) {
    DOM.slideEndInput.value = getLauncherNumberParam("slideEnd", 6);
  }
  if (DOM.customTextInput) {
    DOM.customTextInput.value = getLauncherTextParam("note");
  }
  selectedHeroUrl = getLauncherTextParam("img");
  if (selectedHeroUrl && DOM.imageUrlInput) {
    DOM.imageUrlInput.value = selectedHeroUrl;
  }
  if (DOM.colorPickerInput) {
    DOM.colorPickerInput.value = getLauncherTextParam("swatch") || "#4bd2b1";
  }
  if (DOM.accentColorOneInput) {
    DOM.accentColorOneInput.value = getLauncherTextParam("accent1") || "#1f6feb";
  }
  if (DOM.accentColorTwoInput) {
    DOM.accentColorTwoInput.value = getLauncherTextParam("accent2") || "#f97316";
  }
  const slidesParam = getLauncherTextParam("slides");
  if (slidesParam) {
    selectedSlideUrls = new Set(parseSlidesParam(slidesParam));
  }
  if (DOM.toggleThemeButton) {
    DOM.toggleThemeButton.addEventListener("click", toggleTheme);
  }
  DOM.loadImagesBtn.addEventListener("click", handleLoadImages);
  if (DOM.clearImagesBtn) {
    DOM.clearImagesBtn.addEventListener("click", clearImageSelection);
  }
  DOM.buildUrlBtn.addEventListener("click", () => {
    DOM.urlOutput.value = buildDisplayUrl();
    openPreviewModal();
  });
  DOM.copyUrlBtn.addEventListener("click", copyUrlToClipboard);
  DOM.imageResults.addEventListener("change", handleImageSelection);
  DOM.imageResults.addEventListener("change", handleSlideSelection);
  DOM.layoutOptions.forEach((option) => {
    option.addEventListener("change", updateLayoutUI);
  });
  updateLayoutUI();
  initializePreviewControls();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLauncher);
} else {
  initLauncher();
}
