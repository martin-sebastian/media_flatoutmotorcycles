/* global moment */
import * as bootstrap from 'bootstrap';
window.bootstrap = bootstrap;
import { fetchVehiclesFromSupabase, fetchTagPresets, fetchVehicleTags, addVehicleTag, removeVehicleTag } from './vehicleData.js';

// Near the top of the file, add a cache object
const DOM = {
	table: null,
	tableBody: null,
	filters: {},
	pagination: {
		pageSizeSelect: null,
		prevPageBtn: null,
		nextPageBtn: null,
		pageInfo: null,
	},
	// Refresh filter references based on active group.
	refreshFilters() {
		this.filters = {
			search: getActiveFilterElement("search"),
			year: getActiveFilterElement("year"),
			manufacturer: getActiveFilterElement("manufacturer"),
			model: getActiveFilterElement("model"),
			type: getActiveFilterElement("type"),
			usage: getActiveFilterElement("usage"),
			updated: getActiveFilterElement("updated"),
			updatedEnd: getActiveFilterElement("updatedEnd"),
			photos: getActiveFilterElement("photos"),
			// tags handled via checkbox dropdowns, not a data-filter element
		};
	},
	init() {
		this.table = document.getElementById("vehiclesTable");
		this.tableBody = this.table?.getElementsByTagName("tbody")[0];
		this.refreshFilters();
		this.pagination = {
			pageSizeSelect: document.getElementById("pageSizeSelect"),
			prevPageBtn: document.getElementById("prevPage"),
			nextPageBtn: document.getElementById("nextPage"),
			pageInfo: document.getElementById("pageInfo"),
		};
	},
};

/** Set to true to enable home search filter suggestions (currently disabled - not working as intended). */
const SEARCH_SUGGESTIONS_ENABLED = false;

// Near the top of the file, add a global storage fallback
let memoryStorage = {
	vehiclesCache: null,
	vehiclesCacheTimestamp: null,
	vehiclesCacheSupabase: null,
	vehiclesCacheSupabaseTimestamp: null,
	tablePagination: null,
};

// Global state for table data and pagination
const State = {
	allItems: [],
	filteredItems: [],
	currentItems: [],
	tagPresets: [],
	pagination: {
		currentPage: 1,
		pageSize: 25,
		totalPages: 1,
	},
	sort: {
		column: null,
		direction: "asc",
	},
	savedFilters: {},
	/** Current key tag data for Print/Zebra/Labelary (set when rendering). */
	currentKeyTagData: null,
	saveState() {
		const filters = {};
		["search", "year", "manufacturer", "model", "type", "usage", "photos", "updated", "updatedEnd"].forEach((name) => {
			const el = getActiveFilterElement(name);
			if (el) filters[name] = el.value || "";
		});
		filters.tags = getSelectedTagFilters();
		const stateToSave = {
			currentPage: this.pagination.currentPage,
			pageSize: this.pagination.pageSize,
			filters,
		};
		try {
			if (checkLocalStorageAvailability().available) {
				localStorage.setItem("tablePagination", JSON.stringify(stateToSave));
			} else {
				memoryStorage.tablePagination = stateToSave;
			}
		} catch (e) {
			memoryStorage.tablePagination = stateToSave;
		}
	},
	loadState() {
		try {
			let parsedState;
			if (checkLocalStorageAvailability().available) {
				const savedState = localStorage.getItem("tablePagination");
				if (savedState) {
					parsedState = JSON.parse(savedState);
				}
			} else if (memoryStorage.tablePagination) {
				parsedState = memoryStorage.tablePagination;
			}
			if (parsedState) {
				this.pagination.currentPage = parsedState.currentPage || 1;
				this.pagination.pageSize = parsedState.pageSize || 25;
				this.savedFilters = parsedState.filters || {};
			}
		} catch (e) {
			console.error("Error loading saved state:", e);
		}
	},
};

/** Populate key tag search datalist from inventory. */
/** Populate key tag search datalist; limited to first 10 for performance. */
function populateKeytagStockList(items) {
	const list = document.getElementById("keytagStockList");
	if (!list) return;
	const stocks = [...new Set((items || []).map((i) => i.stockNumber).filter(Boolean))].sort().slice(0, 10);
	list.innerHTML = stocks.map((s) => `<option value="${s}">`).join("");
}

/** Apply saved filter values to all filter inputs (desktop + mobile). */
function applySavedFiltersToDom() {
	const f = State.savedFilters;
	if (!f || Object.keys(f).length === 0) return;
	// Set year and manufacturer first so model dropdown options update
	["year", "manufacturer"].forEach((name) => {
		const val = f[name];
		if (val == null) return;
		getFilterElementsByName(name).forEach((el) => {
			if (Array.from(el.options).some((o) => o.value === val)) el.value = val;
		});
	});
	updateModelDropdownOptions();
	// Set remaining filters
	["search", "model", "type", "usage", "photos", "updated", "updatedEnd"].forEach((name) => {
		const val = f[name];
		if (val == null) return;
		getFilterElementsByName(name).forEach((el) => {
			if (el.tagName === "SELECT" && !Array.from(el.options).some((o) => o.value === val)) return;
			el.value = val;
		});
	});
	// Restore tag checkboxes
	const savedTags = f.tags;
	if (Array.isArray(savedTags) && savedTags.length) {
		document.querySelectorAll('.tags-filter-check').forEach(c => {
			c.checked = savedTags.includes(c.value);
		});
		updateTagsFilterLabel();
	}
}

/** Clear all filter inputs and re-apply (shows full list). */
function clearAllFilters() {
	["search", "year", "manufacturer", "model", "type", "usage", "photos", "updated", "updatedEnd"].forEach((name) => {
		getFilterElementsByName(name).forEach((el) => { el.value = ""; });
	});
	document.querySelectorAll('.tags-filter-check').forEach(c => { c.checked = false; });
	updateTagsFilterLabel();
	updateModelDropdownOptions();
	clearSearchSuggestions();
	filterTable();
}

// Return the active filter group based on Bootstrap lg breakpoint.
function getActiveFilterGroupName() {
	return window.matchMedia("(min-width: 992px)").matches ? "desktop" : "mobile";
}

// Return all filter elements for a given filter name.
function getFilterElementsByName(name) {
	return Array.from(document.querySelectorAll(`[data-filter="${name}"]`));
}

// Return the active filter element for a given filter name.
function getActiveFilterElement(name) {
	const group = getActiveFilterGroupName();
	return document.querySelector(
		`[data-filter-group="${group}"] [data-filter="${name}"]`,
	);
}

/**
 * Read hidden column preferences from localStorage.
 * @returns {Set<string>} Hidden column keys.
 */
function getHiddenColumns() {
	const stored = localStorage.getItem("hiddenColumns");
	if (!stored) return new Set();
	try {
		const parsed = JSON.parse(stored);
		return new Set(Array.isArray(parsed) ? parsed : []);
	} catch (error) {
		console.warn("Invalid hiddenColumns storage:", error);
		return new Set();
	}
}

/**
 * Persist hidden column preferences to localStorage.
 * @param {Set<string>} hiddenColumns Hidden column keys.
 */
function saveHiddenColumns(hiddenColumns) {
	localStorage.setItem("hiddenColumns", JSON.stringify([...hiddenColumns]));
}

/**
 * Sync column toggle inputs with stored preferences.
 * @param {Set<string>} hiddenColumns Hidden column keys.
 */
function syncColumnToggleInputs(hiddenColumns) {
	document.querySelectorAll(".column-toggle").forEach((input) => {
		input.checked = !hiddenColumns.has(input.value);
	});
}

/**
 * Apply column visibility based on stored preferences.
 */
function applyColumnVisibility() {
	const hiddenColumns = getHiddenColumns();
	document.querySelectorAll("[data-column]").forEach((element) => {
		const key = element.dataset.column;
		element.classList.toggle("column-hidden", hiddenColumns.has(key));
	});
	syncColumnToggleInputs(hiddenColumns);
}

/**
 * Initialize column visibility toggle handlers.
 */
function initializeColumnToggles() {
	document.querySelectorAll(".column-toggle").forEach((input) => {
		input.addEventListener("change", () => {
			const hiddenColumns = getHiddenColumns();
			if (input.checked) {
				hiddenColumns.delete(input.value);
			} else {
				hiddenColumns.add(input.value);
			}
			saveHiddenColumns(hiddenColumns);
			applyColumnVisibility();
		});
	});
	applyColumnVisibility();
}

// Update model dropdown options with all known models.
function updateModelDropdownOptions() {
	const modelFilters = getFilterElementsByName("model");
	if (!modelFilters.length) return;

	const models = new Set();

	State.allItems.forEach((item) => {
		if (item.modelName && item.modelName !== "N/A") {
			models.add(item.modelName);
		}
	});

	const sortedModels = [...models].sort();

	modelFilters.forEach((modelFilter) => {
		const currentValue = modelFilter.value;

		while (modelFilter.options.length > 2) {
			modelFilter.remove(2);
		}

		sortedModels.forEach((modelName) => {
			const option = document.createElement("option");
			option.value = modelName;
			option.textContent = modelName;
			modelFilter.appendChild(option);
		});

		modelFilter.value = sortedModels.includes(currentValue) ? currentValue : "";
	});
}

// Enable active filter group and disable the inactive group.
function setFilterGroupState() {
	const activeGroup = getActiveFilterGroupName();
	const inactiveGroup = activeGroup === "desktop" ? "mobile" : "desktop";

	document
		.querySelectorAll(`[data-filter-group="${activeGroup}"] [data-filter]`)
		.forEach((element) => {
			element.disabled = false;
		});

	document
		.querySelectorAll(`[data-filter-group="${inactiveGroup}"] [data-filter]`)
		.forEach((element) => {
			element.disabled = true;
		});
}

/** Map manufacturer name → icon filename (without extension) */
const MAKE_ICONS = {
	'bmw': 'bmw', 'can-am': 'can-am', 'harley-davidson®': 'harley-davidson',
	'honda': 'honda', 'indian motorcycle': 'indian', 'kawasaki': 'kawasaki',
	'ktm': 'ktm', 'polaris': 'polaris', 'qjmotor': 'qjmotor', 'sea-doo': 'sea-doo',
	'slingshot': 'slingshot', 'south bay': 'southbay', 'ssr motorsports': 'ssr',
	'suzuki': 'suzuki', 'suzuki marine': 'suzuki', 'triumph': 'triumph',
	'vanderhall': 'vanderhall', 'yacht club': 'yacht-club', 'yamaha': 'yamaha',
	'ski-doo': 'can-am', 'benelli': 'benelli',
};
function getMakeIconFile(make) {
	return MAKE_ICONS[(make || '').toLowerCase()] || null;
}

/* ── Tag Editor ─────────────────────────────────────── */

let tagEditorModal = null;
let tagEditorStock = '';

/** Opens the tag editor modal for a given stock number. */
function openTagEditor(stockNumber) {
	tagEditorStock = stockNumber;
	const item = State.allItems.find(i => i.stockNumber === stockNumber);
	if (!item) return;

	document.getElementById('tagEditorStock').textContent = stockNumber;
	document.getElementById('tagEditorVehicleName').textContent = item.title || '';

	renderTagEditorPresets(item.tags || []);
	document.getElementById('tagEditorCustomInput').value = '';

	if (!tagEditorModal) {
		tagEditorModal = new bootstrap.Modal(document.getElementById('tagEditorModal'));
	}
	tagEditorModal.show();
}

/** Renders the preset toggle buttons and current custom tags inside the modal. */
function renderTagEditorPresets(activeTags) {
	const container = document.getElementById('tagEditorPresets');
	const presets = State.tagPresets || [];
	const activeSet = new Set(activeTags);

	let html = '';
	// Render preset tag buttons
	for (const p of presets) {
		const active = activeSet.has(p.name);
		html += `<button type="button" class="btn btn-sm tag-preset-btn ${active ? `btn-${p.color}` : `btn-outline-${p.color}`}"
			data-tag="${p.name}" data-active="${active}">${p.name}</button>`;
	}
	// Render custom tags (tags not in presets)
	const presetNames = new Set(presets.map(p => p.name));
	for (const t of activeTags) {
		if (presetNames.has(t)) continue;
		html += `<span class="badge text-bg-secondary d-flex align-items-center gap-1 tag-custom-badge" style="font-size:.8rem">
			${t} <i class="bi bi-x-circle tag-remove-custom" role="button" data-tag="${t}" style="cursor:pointer"></i>
		</span>`;
	}
	container.innerHTML = html;
}

/** Refreshes the tag badges in the table row after a change. */
function refreshRowTags(stockNumber) {
	const item = State.allItems.find(i => i.stockNumber === stockNumber);
	if (!item) return;
	const cell = document.querySelector(`.tag-badges[data-stock="${stockNumber}"]`);
	if (!cell) return;
	cell.innerHTML = (item.tags || []).map(t => {
		const preset = State.tagPresets.find(p => p.name === t);
		const color = preset ? preset.color : 'secondary';
		return `<span class="badge text-bg-${color} tag-badge" style="font-size:.65rem;cursor:pointer" title="Edit tags">${t}</span>`;
	}).join('') + `<button type="button" class="btn btn-outline-secondary btn-sm tag-edit-btn border-0 p-0 px-1" title="Edit tags" data-stock="${stockNumber}">
		<i class="bi bi-plus-circle" style="font-size:.75rem"></i>
	</button>`;
}

/** Toggles a tag on/off for the current vehicle and updates UI. */
async function toggleTag(tag, addIt) {
	const item = State.allItems.find(i => i.stockNumber === tagEditorStock);
	if (!item) return;

	if (addIt) {
		const ok = await addVehicleTag(tagEditorStock, tag);
		if (ok && !item.tags.includes(tag)) item.tags.push(tag);
	} else {
		const ok = await removeVehicleTag(tagEditorStock, tag);
		if (ok) item.tags = item.tags.filter(t => t !== tag);
	}

	renderTagEditorPresets(item.tags);
	refreshRowTags(tagEditorStock);
}

/** Wires up click handlers for the tag editor modal (delegated). */
function initTagEditor() {
	const presetsEl = document.getElementById('tagEditorPresets');
	if (!presetsEl) return;

	// Preset toggle buttons
	presetsEl.addEventListener('click', (e) => {
		const btn = e.target.closest('.tag-preset-btn');
		if (btn) {
			const tag = btn.dataset.tag;
			const isActive = btn.dataset.active === 'true';
			toggleTag(tag, !isActive);
			return;
		}
		// Custom tag remove
		const removeIcon = e.target.closest('.tag-remove-custom');
		if (removeIcon) {
			toggleTag(removeIcon.dataset.tag, false);
		}
	});

	// Custom tag add
	const addBtn = document.getElementById('tagEditorAddBtn');
	const input = document.getElementById('tagEditorCustomInput');
	const addCustom = () => {
		const val = input.value.trim();
		if (!val) return;
		toggleTag(val, true);
		input.value = '';
	};
	addBtn?.addEventListener('click', addCustom);
	input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });

	// Delegate click on table tag edit buttons and existing tag badges
	document.getElementById('vehiclesTable')?.addEventListener('click', (e) => {
		const btn = e.target.closest('.tag-edit-btn');
		if (btn) { openTagEditor(btn.dataset.stock); return; }
		const badge = e.target.closest('.tag-badge');
		if (badge) {
			const stock = badge.closest('.tag-badges')?.dataset.stock;
			if (stock) openTagEditor(stock);
		}
	});
}

function normalizeDate(dateString) {
	if (!dateString || dateString === "N/A") return null;

	const parsedDate = moment(dateString);
	if (!parsedDate.isValid()) return null;

	// If the date is in the future (likely due to timezone issues), adjust it
	if (parsedDate.isAfter(moment())) {
		return moment();
	}

	return parsedDate;
}

// Add near the top with other utility functions
function populateManufacturerDropdown(manufacturers) {
	const manufacturerFilters = getFilterElementsByName("manufacturer");
	if (!manufacturerFilters.length) return;

	// Sort manufacturers alphabetically
	manufacturers.sort();

	manufacturerFilters.forEach((manufacturerFilter) => {
		// Clear existing options except the first two (default options)
		while (manufacturerFilter.options.length > 2) {
			manufacturerFilter.remove(2);
		}

		// Add manufacturers to dropdown
		manufacturers.forEach((manufacturer) => {
			const option = document.createElement("option");
			option.value = manufacturer;
			option.textContent = manufacturer;
			manufacturerFilter.appendChild(option);
		});
	});
}

// Add near the populateManufacturerDropdown function
function populateYearDropdown(years) {
	const yearFilters = getFilterElementsByName("year");
	if (!yearFilters.length) return;

	// Sort years in descending order (newest first)
	years.sort((a, b) => b - a);

	yearFilters.forEach((yearFilter) => {
		// Clear existing options except the first two (default options)
		while (yearFilter.options.length > 2) {
			yearFilter.remove(2);
		}

		// Add years to dropdown
		years.forEach((year) => {
			const option = document.createElement("option");
			option.value = year;
			option.textContent = year;
			yearFilter.appendChild(option);
		});
	});
}

// Add near the populateManufacturerDropdown function
function populateTypeDropdown(types) {
	const typeFilters = getFilterElementsByName("type");
	if (!typeFilters.length) return;

	// Sort types alphabetically
	types.sort();

	typeFilters.forEach((typeFilter) => {
		// Clear existing options except the first two (default options)
		while (typeFilter.options.length > 2) {
			typeFilter.remove(2);
		}

		// Add types to dropdown
		types.forEach((type) => {
			const option = document.createElement("option");
			option.value = type;
			option.textContent = type;
			typeFilter.appendChild(option);
		});
	});
}

/** Populates the Tags filter checkbox dropdowns from presets + custom tags. */
function populateTagsDropdown() {
	const presetNames = (State.tagPresets || []).map(p => p.name);
	const customTags = new Set();
	for (const item of State.allItems) {
		for (const t of item.tags || []) {
			if (!presetNames.includes(t)) customTags.add(t);
		}
	}
	const allTags = [...presetNames, ...[...customTags].sort()];
	const containers = [
		document.getElementById('tagsFilterDropdown'),
		document.getElementById('tagsFilterDropdownMobile'),
	].filter(Boolean);
	containers.forEach(container => {
		container.innerHTML = allTags.map((tag, i) => {
			const id = `tagCheck_${container.id}_${i}`;
			return `<div class="form-check">
				<input class="form-check-input tags-filter-check" type="checkbox" value="${tag}" id="${id}">
				<label class="form-check-label small" for="${id}">${tag}</label>
			</div>`;
		}).join('');
	});
}

/** Returns array of currently checked tag filter values. */
function getSelectedTagFilters() {
	const checks = document.querySelectorAll('.tags-filter-check:checked');
	return Array.from(checks).map(c => c.value);
}

/** Updates the Tags dropdown button label to reflect selection count. */
function updateTagsFilterLabel() {
	const selected = getSelectedTagFilters();
	const label = selected.length ? `Tags (${selected.length})` : 'Tags';
	document.getElementById('tagsFilterBtn')?.textContent && (document.getElementById('tagsFilterBtn').textContent = label);
	document.getElementById('tagsFilterBtnMobile')?.textContent && (document.getElementById('tagsFilterBtnMobile').textContent = label);
}

// Add near the other dropdown population functions
function populateSearchSuggestions(itemsArray) {
	if (!SEARCH_SUGGESTIONS_ENABLED) return;
	// This function is called when data is loaded, but suggestions
	// will only show when user types 1-2 characters

	// Store all possible suggestions in a global object for later filtering
	// We'll use this when the user starts typing
	window.searchSuggestions = {
		stockNumbers: [],
		vins: [],
		makeModels: [],
		yearMakeModels: [],
		types: [],
	};

	// Extract all searchable values from the data (supports app item shape or XML nodes)
	const getVal = (item, key, xmlTag) =>
		item[key] ?? item.getElementsByTagName?.(xmlTag)?.[0]?.textContent ?? "";

	itemsArray.forEach((item) => {
		const stockNumber = getVal(item, "stockNumber", "stocknumber");
		const vin = getVal(item, "vin", "vin");
		const manufacturer = getVal(item, "manufacturer", "manufacturer");
		const modelName = getVal(item, "modelName", "model_name");
		const modelType = getVal(item, "modelType", "model_type");
		const year = getVal(item, "year", "year");

		// Store in our global object
		if (stockNumber) window.searchSuggestions.stockNumbers.push(stockNumber);
		if (vin) window.searchSuggestions.vins.push(vin);
		if (manufacturer && modelName)
			window.searchSuggestions.makeModels.push(`${manufacturer} ${modelName}`);
		if (year && manufacturer && modelName)
			window.searchSuggestions.yearMakeModels.push(
				`${year} ${manufacturer} ${modelName}`,
			);
		if (modelType && modelType !== "N/A" && modelType !== manufacturer)
			window.searchSuggestions.types.push(modelType);
	});

	// Remove duplicates and sort
	Object.keys(window.searchSuggestions).forEach((key) => {
		window.searchSuggestions[key] = [
			...new Set(window.searchSuggestions[key]),
		].sort();
	});
}

// This function will be called when the user types in the search box
function updateSearchSuggestions(query) {
	if (!SEARCH_SUGGESTIONS_ENABLED) {
		clearSearchSuggestions();
		return;
	}
	if (!query || query.length < 1) {
		// Clear suggestions if query is empty or too short
		clearSearchSuggestions();
		return;
	}

	// Find or create the custom dropdown
	let suggestionsDropdown = document.getElementById("custom-suggestions");
	const searchInput = getActiveFilterElement("search");
	if (!searchInput) return;

	// Create a container for the search input and dropdown if it doesn't exist
	let searchContainer = searchInput.closest(".search-container");
	if (!searchContainer) {
		// Wrap the search input in a container with relative positioning
		searchContainer = document.createElement("div");
		searchContainer.className = "search-container";
		searchInput.parentNode.insertBefore(searchContainer, searchInput);
		searchContainer.appendChild(searchInput);
	}

	if (!suggestionsDropdown) {
		suggestionsDropdown = document.createElement("div");
		suggestionsDropdown.id = "custom-suggestions";
		suggestionsDropdown.className = "search-suggestions-dropdown";

		// Append the dropdown to our container
		searchContainer.appendChild(suggestionsDropdown);
	}

	// Clear existing options
	suggestionsDropdown.innerHTML = "";

	if (!window.searchSuggestions) return;

	// Convert query to uppercase for case-insensitive matching
	const upperQuery = query.trim().toUpperCase();

	// Maximum suggestions to show
	const MAX_SUGGESTIONS = 20;
	let suggestionsCount = 0;

	// Prioritize suggestions in this order
	const suggestionTypes = [
		{ key: "stockNumbers", weight: 10 }, // Stock numbers are highest priority
		{ key: "yearMakeModels", weight: 5 }, // Year+Make+Model combinations next
		{ key: "makeModels", weight: 3 }, // Make+Model combinations
		{ key: "vins", weight: 2 }, // VINs
		{ key: "types", weight: 1 }, // Model types lowest priority
	];

	// Filter and score matched suggestions from all categories
	const matchedSuggestions = [];

	suggestionTypes.forEach(({ key, weight }) => {
		window.searchSuggestions[key].forEach((suggestion) => {
			const upperSuggestion = suggestion.toUpperCase();

			// Check if suggestion matches query
			if (upperSuggestion.includes(upperQuery)) {
				// Calculate score - exact matches score higher
				let score = weight;

				// Bonus for matches at start of string or word
				if (upperSuggestion.startsWith(upperQuery)) {
					score += 5; // Big bonus for starts with
				} else if (upperSuggestion.includes(" " + upperQuery)) {
					score += 3; // Smaller bonus for start of word
				}

				// Bonus for shorter matches (more precise)
				score += (20 - Math.min(20, suggestion.length)) / 10;

				matchedSuggestions.push({ suggestion, score });
			}
		});
	});

	// Sort by score (highest first) and limit
	matchedSuggestions
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_SUGGESTIONS)
		.forEach(({ suggestion }) => {
			const item = document.createElement("div");
			item.className = "suggestion-item";
			item.textContent = suggestion;

			// Add data type for styling
			// Determine the type by checking all categories
			if (window.searchSuggestions.stockNumbers.includes(suggestion)) {
				item.setAttribute("data-type", "stockNumbers");
			} else if (window.searchSuggestions.vins.includes(suggestion)) {
				item.setAttribute("data-type", "vins");
			} else if (window.searchSuggestions.yearMakeModels.includes(suggestion)) {
				item.setAttribute("data-type", "yearMakeModels");
			} else if (window.searchSuggestions.makeModels.includes(suggestion)) {
				item.setAttribute("data-type", "makeModels");
			} else if (window.searchSuggestions.types.includes(suggestion)) {
				item.setAttribute("data-type", "types");
			}

			// Add event to select the suggestion when clicked
			item.addEventListener("click", () => {
				// If it's a stock number, navigate to details page
				if (window.searchSuggestions.stockNumbers.includes(suggestion)) {
					window.location.href = `./details/?search=${encodeURIComponent(suggestion)}`;
					return;
				}
				// Otherwise, filter the table
				const searchInput = getActiveFilterElement("search");
				if (searchInput) {
					searchInput.value = suggestion;
					searchInput.focus();
					filterTable();
					clearSearchSuggestions();
				}
			});

			suggestionsDropdown.appendChild(item);
			suggestionsCount++;
		});

	// Show or hide the dropdown based on matches
	if (suggestionsCount > 0) {
		suggestionsDropdown.style.display = "block";

		// Ensure the dropdown is visible by scrolling to it if needed
		if (searchInput) {
			// If the search input is not in view, scroll to it
			const inputRect = searchInput.getBoundingClientRect();
			if (inputRect.bottom > window.innerHeight) {
				searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	} else {
		suggestionsDropdown.style.display = "none";
	}

	console.log(`Showing ${suggestionsCount} search suggestions for "${query}"`);
}

function clearSearchSuggestions() {
	const suggestionsDropdown = document.getElementById("custom-suggestions");
	if (suggestionsDropdown) {
		suggestionsDropdown.style.display = "none";
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	// Customize Moment.js relative time strings
	moment.updateLocale("en", {
		relativeTime: {
			future: "in %s",
			past: "%s ago",
			s: "%d sec.",
			ss: "%d sec.",
			m: "1 min.",
			mm: "%d min.",
			h: "1 hr.",
			hh: "%d hrs.",
			d: "1 day",
			dd: "%d days",
			M: "1 month",
			MM: "%d months",
			y: "1 year",
			yy: "%d years",
		},
	});

	DOM.init();
	setFilterGroupState();
	initializeColumnToggles();
	initTagEditor();

	// Setup diagnostic monitoring
	const networkStatus = setupNetworkMonitoring();

	// Check for localStorage availability and display browser info
	const storageStatus = checkLocalStorageAvailability();
	console.log(`Browser info: ${navigator.userAgent}`);
	console.log(`Storage status: ${JSON.stringify(storageStatus)}`);
	console.log(`Network status: ${JSON.stringify(networkStatus)}`);

	// Theme handling - using existing theme functions instead of applyTheme
	const savedTheme = localStorage.getItem("theme");
	if (savedTheme) {
		document.body.setAttribute("data-bs-theme", savedTheme);
		updateThemeIcon(savedTheme);
	}

	// Add vertical key tag switch state handling
	const verticalKeyTagSwitch = document.getElementById("verticalKeyTagSwitch");
	const savedVerticalKeyTagState = localStorage.getItem("verticalKeyTagState");
	if (savedVerticalKeyTagState && verticalKeyTagSwitch) {
		verticalKeyTagSwitch.checked = savedVerticalKeyTagState === "true";
		// Trigger the toggle function to update the UI
		toggleVerticalKeyTag({ target: verticalKeyTagSwitch });
	}

	// Make sure search inputs are wrapped for dropdown positioning
	getFilterElementsByName("search").forEach((searchInput) => {
		if (searchInput && !searchInput.closest(".search-container")) {
			const searchContainer = document.createElement("div");
			searchContainer.className = "search-container";
			searchInput.parentNode.insertBefore(searchContainer, searchInput);
			searchContainer.appendChild(searchInput);
		}
	});

	// Add event listeners using delegation where possible
	document.addEventListener("click", handleGlobalClicks);

	// Add filter listeners with debounce
	const searchInputs = getFilterElementsByName("search");
	const handleSearchInputDebounced = debounce((value) => {
		handleSearchInput(value);
	}, 250);

	searchInputs.forEach((searchInput) => {
		// Add a class for custom styling
		searchInput.classList.add("search-with-suggestions");

		searchInput.addEventListener("input", (e) => {
			handleSearchInputDebounced(e.target.value);
		});

		// Handle paste - close dropdown and filter immediately
		searchInput.addEventListener("paste", () => {
			setTimeout(() => {
				clearSearchSuggestions();
				filterTable();
			}, 0);
		});

		// Handle keyboard navigation inside the dropdown
		searchInput.addEventListener("keydown", (e) => {
			const dropdown = document.getElementById("custom-suggestions");
			
			// Handle Tab - close dropdown and let default behavior happen
			if (e.key === "Tab") {
				clearSearchSuggestions();
				filterTable();
				return;
			}

			// Handle Enter - close dropdown and filter (even without highlighted item)
			if (e.key === "Enter") {
				e.preventDefault();
				const highlighted = dropdown?.querySelector(".suggestion-item.highlighted");
				if (highlighted) {
					searchInput.value = highlighted.textContent;
				}
				clearSearchSuggestions();
				filterTable();
				return;
			}

			// Handle Escape - just close dropdown
			if (e.key === "Escape") {
				clearSearchSuggestions();
				return;
			}

			// Below only applies if dropdown is visible with items
			if (!dropdown || dropdown.style.display === "none") return;
			const items = dropdown.querySelectorAll(".suggestion-item");
			if (items.length === 0) return;

			// Find currently highlighted item
			const highlighted = dropdown.querySelector(
				".suggestion-item.highlighted",
			);
			let index = -1;

			if (highlighted) {
				index = Array.from(items).indexOf(highlighted);
			}

			// Handle arrow keys
			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (index < items.length - 1) {
					if (highlighted) highlighted.classList.remove("highlighted");
					items[index + 1].classList.add("highlighted");
					items[index + 1].scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (index > 0) {
					if (highlighted) highlighted.classList.remove("highlighted");
					items[index - 1].classList.add("highlighted");
					items[index - 1].scrollIntoView({ block: "nearest" });
				}
			}
		});
	});

	// Handle document clicks to close the dropdown when clicking outside
	document.addEventListener("click", (e) => {
		if (
			!e.target.closest('[data-filter="search"]') &&
			!e.target.closest("#custom-suggestions")
		) {
			clearSearchSuggestions();
		}
	});

	// Add other filter change listeners
	document.querySelectorAll("[data-filter]").forEach((filter) => {
		if (filter.dataset.filter !== "search") {
			filter.addEventListener("change", () => {
				if (
					filter.dataset.filter === "year" ||
					filter.dataset.filter === "manufacturer"
				) {
					updateModelDropdownOptions();
				}
				filterTable();
			});
		}
	});

	// Tag filter checkbox listeners (delegated)
	document.getElementById('tagsFilterDropdown')?.addEventListener('change', () => { updateTagsFilterLabel(); filterTable(); });
	document.getElementById('tagsFilterDropdownMobile')?.addEventListener('change', () => { updateTagsFilterLabel(); filterTable(); });

	// Clear filters button (desktop + mobile)
	document.getElementById("clearFiltersBtn")?.addEventListener("click", clearAllFilters);
	document.getElementById("clearFiltersBtnMobile")?.addEventListener("click", clearAllFilters);

	// Load user preferences before fetching data
	State.loadState();

	// Fetch and process data
	await fetchData();

	// Initialize the table features (e.g., sorting)
	initializeTableFeatures();

	// Handle window resize to ensure dropdown stays with the search input
	window.addEventListener(
		"resize",
		debounce(() => {
			setFilterGroupState();
			updateModelDropdownOptions();
			const dropdown = document.getElementById("custom-suggestions");
			if (dropdown && dropdown.style.display !== "none") {
				// If dropdown is visible, update its position
				const searchInput = getActiveFilterElement("search");
				if (searchInput) {
					// Force a small delay to allow for DOM updates
					setTimeout(() => {
						// Simply hiding and showing refreshes the position
						dropdown.style.display = "none";
						setTimeout(() => {
							dropdown.style.display = "block";
						}, 10);
					}, 150);
				}
			}
		}, 250),
	);
});

function handleGlobalClicks(event) {
	const target = event.target;

	// Handle key tag button clicks
	if (target.closest("#keytagModalButton")) {
		const stockNumber =
			target.closest("#keytagModalButton").dataset.bsStocknumber;
		if (stockNumber) {
			document.getElementById("keytagModalLabel").innerHTML = stockNumber;
			keyTag(stockNumber);
		}
	}

	// Handle print button clicks
	if (target.closest("#printTag")) {
		window.print();
	}

	// Handle theme toggle
	if (target.closest("#toggleThemeButton")) {
		toggleTheme();
	}

	// Handle force refresh button
	if (target.closest("#forceRefreshBtn")) {
		forceRefresh();
	}
}

function handleSearchInput(value) {
	// Apply search filter with debounce
	filterTable();

	// Update search suggestions based on current input
	updateSearchSuggestions(value);
}

function showPlaceholder(rowCount = 10) {
	if (!DOM.tableBody) return;

	// Clear existing content first
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create a document fragment for better performance
	const fragment = document.createDocumentFragment();

	for (let i = 0; i < rowCount; i++) {
		const row1 = document.createElement("tr");
		const row2 = document.createElement("tr");

		row1.className = "placeholder-wave";
		row2.className = "placeholder-wave";

		// Set innerHTML once per row
		row1.innerHTML = `
    <td class="placeholder-wave"><span class="placeholder col-6 ms-2"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-6"></span></td>
    <td class="placeholder-wave">
		<span class="placeholder col-1"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
	</td>
    `; // Your placeholder cells
		row2.innerHTML = `
    <td class="placeholder-wave"><span class="placeholder col-8 ms-2"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-7"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-9"></span></td>
    <td class="placeholder-wave">
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
		<span class="placeholder col-2"></span>
	</td>
    `; // Your placeholder cells

		fragment.appendChild(row1);
		fragment.appendChild(row2);
	}

	DOM.tableBody.appendChild(fragment);
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

/**
 * Build a cache-busted XML request URL.
 * @param {string} baseUrl Base XML URL.
 * @returns {string} URL with cache-busting query.
 */
function buildXmlRequestUrl(baseUrl) {
	const url = new URL(baseUrl);
	url.searchParams.set("t", Date.now().toString());
	return url.toString();
}

/**
 * Force a fresh API call by clearing cache first.
 */
async function forceRefresh() {
	console.log("Force refresh - clearing cache...");
	
	// Show loading state on button
	const btn = document.getElementById("forceRefreshBtn");
	const originalContent = btn?.innerHTML;
	if (btn) {
		btn.disabled = true;
		btn.innerHTML = '<i class="bi bi-arrow-clockwise h6 my-1 spin"></i> <span class="mx-1 pe-2 fw-normal">Loading...</span>';
	}
	
	// Clear cache from both localStorage and memory (XML + Supabase)
	try {
		localStorage.removeItem("vehiclesCache");
		localStorage.removeItem("vehiclesCacheTimestamp");
		localStorage.removeItem("vehiclesCacheSupabase");
		localStorage.removeItem("vehiclesCacheSupabaseTimestamp");
	} catch (e) {
		console.log("Could not clear localStorage cache");
	}
	memoryStorage.vehiclesCache = null;
	memoryStorage.vehiclesCacheTimestamp = null;
	memoryStorage.vehiclesCacheSupabase = null;
	memoryStorage.vehiclesCacheSupabaseTimestamp = null;
	
	// Fetch fresh data
	await fetchData();
	
	// Restore button state
	if (btn) {
		btn.disabled = false;
		btn.innerHTML = originalContent;
	}
}

async function fetchData() {
	const isMobile =
		/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	console.log(`Device info - Mobile: ${isMobile}, UserAgent: ${navigator.userAgent}`);

	const storageStatus = checkLocalStorageAvailability();
	const useMemoryFallback = !storageStatus.available || storageStatus.quotaExceeded;
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (matches cron sync interval)

	// Try Supabase first (when configured)
	const supabaseCache = useMemoryFallback
		? memoryStorage.vehiclesCacheSupabase
		: JSON.parse(localStorage.getItem("vehiclesCacheSupabase") || "null");
	const supabaseCacheTs = useMemoryFallback
		? memoryStorage.vehiclesCacheSupabaseTimestamp
		: parseInt(localStorage.getItem("vehiclesCacheSupabaseTimestamp") || "0", 10);

	if (supabaseCache && supabaseCacheTs && Date.now() - supabaseCacheTs < CACHE_DURATION) {
		console.log("Using cached Supabase data...");
		// Always load fresh tag presets and vehicle tags (tiny payloads)
		const [presets, tagsMap] = await Promise.all([fetchTagPresets(), fetchVehicleTags()]);
		State.tagPresets = presets;
		for (const item of supabaseCache) {
			item.tags = tagsMap.get(item.stockNumber) || [];
		}
		await processVehicleData(supabaseCache);
		return;
	}

	showPlaceholder();
	State.tagPresets = await fetchTagPresets();
	const items = await fetchVehiclesFromSupabase();
	if (items && items.length > 0) {
		console.log(`Loaded ${items.length} vehicles from Supabase`);
		try {
			const toStore = JSON.stringify(items);
			if (useMemoryFallback || toStore.length > 2 * 1024 * 1024) {
				memoryStorage.vehiclesCacheSupabase = items;
				memoryStorage.vehiclesCacheSupabaseTimestamp = Date.now();
			} else {
				localStorage.setItem("vehiclesCacheSupabase", toStore);
				localStorage.setItem("vehiclesCacheSupabaseTimestamp", String(Date.now()));
			}
		} catch (e) {
			memoryStorage.vehiclesCacheSupabase = items;
			memoryStorage.vehiclesCacheSupabaseTimestamp = Date.now();
		}
		await processVehicleData(items);
		return;
	}

	// Fallback to XML
	await fetchDataFromXml(useMemoryFallback, CACHE_DURATION, isMobile);
}

/** XML fallback when Supabase is not configured or fails. */
async function fetchDataFromXml(useMemoryFallback, CACHE_DURATION, isMobile) {
	try {
		let cache = useMemoryFallback ? memoryStorage.vehiclesCache : localStorage.getItem("vehiclesCache");
		const cacheTimestamp = useMemoryFallback
			? memoryStorage.vehiclesCacheTimestamp
			: parseInt(localStorage.getItem("vehiclesCacheTimestamp") || "0", 10);

		if (cache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
			console.log("Using cached XML data...");
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(cache, "text/xml");
			if (!xmlDoc.querySelector("parsererror")) {
				await processXMLData(xmlDoc);
				return;
			}
		}

		console.log("Fetching fresh XML data...");
		const timeoutDuration = isMobile ? 60000 : 30000;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

		const xmlUrl = buildXmlRequestUrl("https://www.flatoutmotorcycles.com/unitinventory_univ.xml");
		const response = await fetch(xmlUrl, {
			signal: controller.signal,
			mode: "cors",
			headers: { Accept: "application/xml, text/xml" },
			cache: "no-store",
		});
		clearTimeout(timeoutId);

		if (!response.ok) throw new Error(`Network response error: ${response.status}`);
		const data = await response.text();
		if (data.length < 100) throw new Error("Response too short");

		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(data, "text/xml");
		if (xmlDoc.querySelector("parsererror")) throw new Error("XML parsing failed");

		const useMemoryForLargeData = useMemoryFallback || data.length > 2 * 1024 * 1024;
		try {
			if (useMemoryForLargeData) {
				memoryStorage.vehiclesCache = data;
				memoryStorage.vehiclesCacheTimestamp = Date.now();
			} else {
				localStorage.setItem("vehiclesCache", data);
				localStorage.setItem("vehiclesCacheTimestamp", String(Date.now()));
			}
		} catch (e) {
			memoryStorage.vehiclesCache = data;
			memoryStorage.vehiclesCacheTimestamp = Date.now();
		}

		await processXMLData(xmlDoc);
	} catch (error) {
		console.error("Error fetching XML:", error);
		const cache = useMemoryFallback ? memoryStorage.vehiclesCache : localStorage.getItem("vehiclesCache");
		if (cache) {
			try {
				const xmlDoc = new DOMParser().parseFromString(cache, "text/xml");
				if (!xmlDoc.querySelector("parsererror")) {
					await processXMLData(xmlDoc);
					return;
				}
			} catch (e) {
				/* ignore */
			}
		}
		showDataLoadError("Could not load vehicle data. Please try again later.");
	}
}

// Add a function to show error message to the user
function showDataLoadError(message) {
	if (!DOM.tableBody) return;

	// Clear existing content
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create error message row
	const row = document.createElement("tr");
	row.innerHTML = `
    <td colspan="13" class="text-center p-5">
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>
        ${message}
      </div>
      <button class="btn btn-outline-primary mt-3" onclick="location.reload()">
        <i class="bi bi-arrow-clockwise me-2"></i>Refresh
      </button>
    </td>
  `;

	DOM.tableBody.appendChild(row);
}

/** Applies items (app shape) to State, dropdowns, and table. Shared by XML and Supabase. */
async function processVehicleData(items) {
	if (!DOM.tableBody) return;

	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	State.allItems = items;
	State.filteredItems = [...State.allItems];

	const manufacturers = new Set();
	const years = new Set();
	const types = new Set();
	items.forEach((item) => {
		if (item.manufacturer && item.manufacturer !== "N/A") manufacturers.add(item.manufacturer);
		if (item.year && item.year !== "N/A") years.add(item.year);
		if (item.modelType && item.modelType !== "N/A") types.add(item.modelType);
	});

	populateManufacturerDropdown([...manufacturers]);
	populateYearDropdown([...years]);
	populateTypeDropdown([...types]);
	populateTagsDropdown();
	updateModelDropdownOptions();
	populateSearchSuggestions(items);
	populateKeytagStockList(items);

	State.loadState();
	applySavedFiltersToDom();
	initializePagination();
	filterTable();

	document.querySelectorAll(".placeholder-wave").forEach((el) => {
		el.classList.remove("placeholder-wave");
	});
}

// Separate function to process the XML data
async function processXMLData(xmlDoc) {
	const items = xmlDoc.getElementsByTagName("item");
	if (!DOM.tableBody) return;

	const itemsArray = Array.from(items);
	itemsArray.sort((a, b) => {
		const dateAStr = a.getElementsByTagName("updated")[0]?.textContent || "";
		const dateBStr = b.getElementsByTagName("updated")[0]?.textContent || "";
		const dateA = normalizeDate(dateAStr);
		const dateB = normalizeDate(dateBStr);
		return dateB - dateA;
	});

	const manufacturers = new Set();
	const years = new Set();
	const types = new Set();

	// Process all items and store in State.allItems
	State.allItems = itemsArray.map((item) => {
		// Extract all data values once
		const imageUrl =
			item
				.getElementsByTagName("images")[0]
				?.getElementsByTagName("imageurl")[0]?.textContent || "N/A";
		const title = item.getElementsByTagName("title")[0]?.textContent || "N/A";
		const webURL = item.getElementsByTagName("link")[0]?.textContent || "N/A";
		const stockNumber =
			item.getElementsByTagName("stocknumber")[0]?.textContent || "N/A";
		const vin = item.getElementsByTagName("vin")[0]?.textContent || "N/A";
		const price = item.getElementsByTagName("price")[0]?.textContent || "N/A";
		const webPrice = numeral(price).format("$0,0.00");
		const manufacturer =
			item.getElementsByTagName("manufacturer")[0]?.textContent || "N/A";
		const year = item.getElementsByTagName("year")[0]?.textContent || "N/A";
		const modelName =
			item.getElementsByTagName("model_name")[0]?.textContent || "N/A";
		const modelType =
			item.getElementsByTagName("model_type")[0]?.textContent || "N/A";
		const modelCode =
			item.getElementsByTagName("model_code")[0]?.textContent || "N/A";
		const color = item.getElementsByTagName("color")[0]?.textContent || "N/A";
		const usage = item.getElementsByTagName("usage")[0]?.textContent || "N/A";
		const updated =
			item.getElementsByTagName("updated")[0]?.textContent || "N/A";

		// Count image elements
		const imageElements = item.getElementsByTagName("imageurl").length;

		// Add values to filter dropdown sets
		if (manufacturer && manufacturer !== "N/A") {
			manufacturers.add(manufacturer);
		}
		if (year && year !== "N/A") {
			years.add(year);
		}
		if (modelType && modelType !== "N/A") {
			types.add(modelType);
		}

		// Return a processed item object
		return {
			imageUrl,
			title,
			webURL,
			stockNumber,
			vin,
			price,
			webPrice,
			manufacturer,
			year,
			modelName,
			modelType,
			modelCode,
			color,
			usage,
			updated,
			imageElements,
		};
	});

	await processVehicleData(State.allItems);
}

// Helper function to initialize table features
function initializeTableFeatures() {
	// Add event listeners for sorting
	const headers = document.querySelectorAll("#vehiclesTable th");
	headers.forEach((header) => {
		header.addEventListener("click", () => sortTableByColumn(header));

		// Set default sort indicator on the updated column (assuming it's the 10th column, index 9)
		if (header.textContent.trim().toLowerCase().includes("updated")) {
			header.classList.add("sort-desc");
		}
	});

	// Initialize tooltips for date badges
	const dateBadges = document.querySelectorAll(
		".badge[data-bs-toggle='tooltip']",
	);
	dateBadges.forEach((badge) => {
		new bootstrap.Tooltip(badge);
	});

	// Count rows after data is loaded
	filterTable();

	// Apply default sort by updated (most recent first)
	State.sort = { column: "updated", direction: "desc" };
	sortFilteredItems();
	applyPagination();
}

function filterTable() {
	// Get the filter input values
	const searchInput =
		getActiveFilterElement("search")?.value.toUpperCase() || "";
	const yearFilter = getActiveFilterElement("year")?.value.toUpperCase() || "";
	const manufacturerFilter =
		getActiveFilterElement("manufacturer")?.value.toUpperCase() || "";
	const modelFilter =
		getActiveFilterElement("model")?.value.toUpperCase() || "";
	const typeFilter = getActiveFilterElement("type")?.value.toUpperCase() || "";
	const usageFilter =
		getActiveFilterElement("usage")?.value.toUpperCase() || "";
	const photosFilter =
		getActiveFilterElement("photos")?.value.toUpperCase() || "";
	const tagsFilterValues = getSelectedTagFilters();
	const updatedFilter = getActiveFilterElement("updated")?.value || "";
	const updatedEndFilter = getActiveFilterElement("updatedEnd")?.value || "";

	// Split search input into individual terms
	const searchTerms = searchInput
		.split(/\s+/)
		.filter((term) => term.length > 0);

	// Define filter conditions
	const filters = {
		manufacturer: manufacturerFilter,
		model: modelFilter,
		type: typeFilter,
		usage: usageFilter,
		year: yearFilter,
		photos: photosFilter,
		tags: tagsFilterValues,
		updated: updatedFilter,
		updatedEnd: updatedEndFilter,
	};

	// Apply filters to allItems
	State.filteredItems = State.allItems.filter((item) => {
		// Create a combined string of all searchable fields
		const searchText =
			`${item.stockNumber} ${item.vin} ${item.usage} ${item.year} ${item.manufacturer} ${item.modelName} ${item.modelType} ${item.color}`.toUpperCase();

		// Check if all search terms match
		const searchMatch =
			searchTerms.length === 0 ||
			searchTerms.every((term) => searchText.includes(term));

		// Check other filters
		const filterMatch = Object.entries(filters).every(([key, value]) => {
			// Special handling for date range - don't skip if the other date field has a value
			if (!value && key !== "updated") return true; // Skip empty filters
			if (!value && key === "updated" && !filters.updatedEnd) return true;

			let textToCompare = "";
			switch (key) {
				case "manufacturer":
					textToCompare = item.manufacturer || "";
					break;
				case "year":
					textToCompare = item.year || "";
					break;
				case "type":
					textToCompare = item.modelType || "";
					break;
				case "usage":
					textToCompare = item.usage || "";
					break;
				case "model":
					textToCompare = item.modelName || "";
					break;
				case "photos": {
					const hasInHousePhotos = Number(item.imageElements) > 10;
					if (value === "INHOUSE") return hasInHousePhotos;
					if (value === "STOCK") return !hasInHousePhotos;
					return true;
				}
				case "tags": {
					if (!value || !value.length) return true;
					const itemTags = item.tags || [];
					return value.every(t => itemTags.includes(t));
				}
				case "updated": {
					// Handle date range filtering; validate moments before comparing
					const itemDate = moment(item.updated).startOf("day");
					const startDate = value ? moment(value).startOf("day") : null;
					const endDate = filters.updatedEnd ? moment(filters.updatedEnd).startOf("day") : null;
					const startValid = startDate?.isValid();
					const endValid = endDate?.isValid();
					// Exclude items with invalid/missing dates when any date filter is active
					if (!itemDate.isValid()) return !startValid && !endValid;
					if (!startValid && !endValid) return true;
					// Both dates provided, check range (inclusive)
					if (startValid && endValid) {
						return itemDate.isBetween(startDate, endDate, "day", "[]");
					}
					// Only start date: items on or after
					if (startValid) return itemDate.isSameOrAfter(startDate, "day");
					// Only end date: items on or before
					if (endValid) return itemDate.isSameOrBefore(endDate, "day");
					return true;
				}
				case "updatedEnd": {
					// Skip - handled in "updated" case
					return true;
				}
				default:
					textToCompare = "";
			}

			return textToCompare.toUpperCase().includes(value);
		});

		return searchMatch && filterMatch;
	});

	// Clear sort when filters change (user can re-sort if needed)
	if (State.sort.column) {
		State.sort.column = null;
		State.sort.direction = "asc";
		// Remove sort indicators from headers
		document.querySelectorAll("#vehiclesTable th").forEach(th => {
			th.classList.remove("sort-asc", "sort-desc");
		});
	}

	// Reset to first page when filters change
	State.pagination.currentPage = 1;

	// Apply pagination with the filtered items
	applyPagination();

	State.saveState();
}

function toggleTheme() {
	const body = document.body;
	const currentTheme = body.getAttribute("data-bs-theme");
	const newTheme = currentTheme === "dark" ? "light" : "dark";
	console.log(`Current theme: ${currentTheme}, New theme: ${newTheme}`);
	body.setAttribute("data-bs-theme", newTheme);

	const logo = document.getElementById("logo");
	if (logo) {
		logo.src =
			newTheme === "dark" ?
				"./img/fom-app-logo-01.svg"
			:	"./img/fom-app-logo-02.svg";
	}

	updateThemeIcon(newTheme);

	// Save the new theme to localStorage instead of sessionStorage
	localStorage.setItem("theme", newTheme);
}

function updateThemeIcon(theme) {
	const toggleThemeButton = document
		.getElementById("toggleThemeButton")
		?.querySelector("i");
	if (!toggleThemeButton) return;

	console.log(`Updating theme icon for theme: ${theme}`);
	if (theme === "dark") {
		toggleThemeButton.classList.remove("bi-brightness-high");
		toggleThemeButton.classList.add("bi-moon-stars");
	} else {
		toggleThemeButton.classList.remove("bi-moon-stars");
		toggleThemeButton.classList.add("bi-brightness-high");
	}
}

// Function to update row count (initial and filtered)
function updateRowCount() {
	// Guard against being called before data is loaded
	if (!State.allItems || !State.allItems.length) return;
	// Update rowCountDisplay with both visible rows and total rows
	const rowCountElement = document.getElementById("rowCountDisplay");
	if (rowCountElement) {
		const totalItems = State.allItems.length;
		const filteredItems = State.filteredItems.length;
		const visibleItems = State.currentItems.length;

		if (filteredItems === totalItems) {
			// No filtering applied, just show visible of total
			rowCountElement.innerHTML = `${visibleItems} of ${totalItems}`;
		} else {
			// Filtering is applied, show more detailed counts
			rowCountElement.innerHTML = `${visibleItems} of ${filteredItems} filtered (${totalItems} total)`;
		}
	}
}

document.addEventListener("DOMContentLoaded", () => {
	// Listen for clicks on elements that might trigger the modal
	document.addEventListener("click", function (event) {
		// Handle keytagModalButton click - set label only; keyTag runs on shown.bs.modal
		if (event.target.closest("#keytagModalButton")) {
			const keytagButton = event.target.closest("#keytagModalButton");
			const stockNumber = keytagButton.getAttribute("data-bs-stocknumber");

			if (stockNumber) {
				const modalTitle = document.getElementById("keytagModalLabel");
				if (modalTitle) modalTitle.textContent = stockNumber;

				// Load saved vertical toggle state
				const verticalToggle = document.getElementById("verticalKeyTagSwitch");
				const savedState = localStorage.getItem("verticalKeyTagState");
				if (verticalToggle) {
					verticalToggle.checked = savedState === "true";
					toggleVerticalKeyTag();
				}

				// Restore saved Zebra printer IP
				const zebraIpInput = document.getElementById("zebraPrinterIp");
				if (zebraIpInput) zebraIpInput.value = localStorage.getItem(ZEBRA_IP_KEY) || "192.168.1.74";
				const zebraEndpointInput = document.getElementById("zebraEndpoint");
				if (zebraEndpointInput) zebraEndpointInput.value = localStorage.getItem(ZEBRA_ENDPOINT_KEY) || "";
			} else {
				console.error("Stock number not found!");
			}
		}

		// Handle printKeyTagBtn button click
		if (event.target.closest("#printKeyTagBtn")) {
			printKeyTags();
		}

		// Handle Print to Zebra button: send ZPL to printer via IP
		if (event.target.closest("#printZebraKeyTagBtn")) {
			printKeyTagToZebra();
		}

		// Handle Preview in Labelary: open Labelary API render in new tab
		if (event.target.closest("#previewZebraLabelaryBtn")) {
			previewKeyTagInLabelary();
		}

		// Handle printTag button click (legacy)
		if (event.target.closest("#printTag")) {
			window.print();
		}
	});

	// Handle vertical key tag toggle switch
	const verticalToggle = document.getElementById("verticalKeyTagSwitch");
	if (verticalToggle) {
		verticalToggle.addEventListener("change", toggleVerticalKeyTag);
	}

	// Render key tag only after modal is fully shown (fixes zoom/layout when modal was hidden)
	const keytagModalEl = document.getElementById("keytagModal");
	if (keytagModalEl) {
		keytagModalEl.addEventListener("shown.bs.modal", () => {
			const stock = document.getElementById("keytagModalLabel")?.textContent?.trim();
			// Skip placeholders; "Custom Tag" = user-created tag, don't overwrite with failed lookup
			if (stock && stock !== "Stock Number" && stock !== "Custom Tag") keyTag(stock);
		});
	}

	// Direct print collapse: flip chevron when Zebra section is shown/hidden
	const zebraCollapse = document.getElementById("zebraPrintCollapse");
	const zebraToggleIcon = document.getElementById("zebraToggleIcon");
	if (zebraCollapse && zebraToggleIcon) {
		zebraCollapse.addEventListener("show.bs.collapse", () => {
			zebraToggleIcon.classList.remove("bi-chevron-down");
			zebraToggleIcon.classList.add("bi-chevron-up");
		});
		zebraCollapse.addEventListener("hide.bs.collapse", () => {
			zebraToggleIcon.classList.remove("bi-chevron-up");
			zebraToggleIcon.classList.add("bi-chevron-down");
		});
	}

	// Key tag search: Load from inventory
	document.getElementById("keytagSearchBtn")?.addEventListener("click", () => {
		const v = document.getElementById("keytagSearchInput")?.value?.trim();
		if (v) keyTag(v);
	});
	document.getElementById("keytagSearchInput")?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const v = document.getElementById("keytagSearchInput")?.value?.trim();
			if (v) keyTag(v);
		}
	});

	// Key tag Create Custom: live update tag as user types
	const customFormIds = ["keytagUsage", "keytagStock", "keytagYear", "keytagManufacturer", "keytagModel", "keytagCode", "keytagColor", "keytagVin"];
	const getCustomFormData = () => ({
		Usage: document.getElementById("keytagUsage")?.value || "",
		StockNumber: document.getElementById("keytagStock")?.value?.trim() || "",
		ModelYear: document.getElementById("keytagYear")?.value?.trim() || "",
		Manufacturer: document.getElementById("keytagManufacturer")?.value?.trim() || "",
		ModelName: document.getElementById("keytagModel")?.value?.trim() || "",
		ModelCode: document.getElementById("keytagCode")?.value?.trim() || "",
		Color: document.getElementById("keytagColor")?.value?.trim() || "",
		VIN: document.getElementById("keytagVin")?.value?.trim() || "",
	});
	const updateTagFromCustomForm = () => keyTagFromData(getCustomFormData());
	customFormIds.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.addEventListener("input", updateTagFromCustomForm);
		if (el) el.addEventListener("change", updateTagFromCustomForm);
	});

	// Create Custom: when expanded, clear form and show empty template
	document.getElementById("keytagCustomForm")?.addEventListener("show.bs.collapse", () => {
		customFormIds.forEach((id) => {
			const el = document.getElementById(id);
			if (el) el.value = "";
		});
		keyTagFromData({});
	});

	// Clear custom form button
	document.getElementById("keytagApplyCustomBtn")?.addEventListener("click", () => {
		customFormIds.forEach((id) => {
			const el = document.getElementById(id);
			if (el) el.value = "";
		});
		keyTagFromData({});
	});
});

document.addEventListener("DOMContentLoaded", () => {
	initializeModalFocusGuards();
});

/**
 * Render key tag using cached XML data (no API call).
 * Uses KeyTagComponent from key-tag.js.
 * @param {string} stockNumber - Stock number to look up.
 */
function keyTag(stockNumber) {
	const messageEl = document.getElementById("keytagMessage");
	const horizontalContainer = document.getElementById("keytagHorizontal");
	const verticalContainer = document.getElementById("keytagVertical");

	// Clear previous message
	if (messageEl) messageEl.innerHTML = "";

	// Find vehicle in cached data
	const vehicle = State.allItems.find(
		(item) => (item.stockNumber || "").toUpperCase() === stockNumber.toUpperCase()
	);

	if (!vehicle) {
		State.currentKeyTagData = null;
		if (window.KeyTagComponent) {
			window.KeyTagComponent.clear(horizontalContainer, "horizontal");
			window.KeyTagComponent.clear(verticalContainer, "vertical");
		}
		if (messageEl) {
			messageEl.innerHTML = `<div class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Stock number not found in inventory.</div>`;
		}
		return;
	}

	// Normalize data for the component
	const data = {
		StockNumber: vehicle.stockNumber || "",
		Usage: vehicle.usage || "",
		ModelYear: vehicle.year || "",
		Manufacturer: vehicle.manufacturer || "",
		ModelName: vehicle.modelName || "",
		ModelCode: vehicle.modelCode || "",
		Color: vehicle.color || "",
		VIN: vehicle.vin || "",
	};
	keyTagFromData(data);
}

/** Render key tag from data object; stores for Print/Zebra/Labelary. Empty data shows placeholders. */
function keyTagFromData(data) {
	const normalized = {
		StockNumber: data?.StockNumber || "",
		Usage: data?.Usage || "",
		ModelYear: data?.ModelYear || "",
		Manufacturer: data?.Manufacturer || "",
		ModelName: data?.ModelName || "",
		ModelCode: data?.ModelCode || "",
		Color: data?.Color || "",
		VIN: data?.VIN || "",
	};
	const isEmpty = Object.values(normalized).every((v) => !v);
	State.currentKeyTagData = isEmpty ? null : normalized;
	const labelEl = document.getElementById("keytagModalLabel");
	if (labelEl) labelEl.textContent = normalized.StockNumber || "Custom Tag";
	const hEl = document.getElementById("keytagHorizontal");
	const vEl = document.getElementById("keytagVertical");
	if (window.KeyTagComponent) {
		if (isEmpty) {
			window.KeyTagComponent.clear(hEl, "horizontal");
			window.KeyTagComponent.clear(vEl, "vertical");
		} else {
			window.KeyTagComponent.render(normalized, hEl);
			window.KeyTagComponent.renderVertical(normalized, vEl);
		}
	}
	const msgEl = document.getElementById("keytagMessage");
	if (msgEl) msgEl.innerHTML = "";
}

/**
 * Toggle vertical key tag visibility.
 */
function toggleVerticalKeyTag() {
	const verticalContainer = document.getElementById("keytagVertical");
	const toggle = document.getElementById("verticalKeyTagSwitch");

	if (!verticalContainer || !toggle) return;

	// Save state to localStorage
	localStorage.setItem("verticalKeyTagState", toggle.checked);

	if (toggle.checked) {
		verticalContainer.classList.remove("d-none");
	} else {
		verticalContainer.classList.add("d-none");
	}
}

/**
 * Print key tags using the component.
 */
function printKeyTags() {
	const includeVertical = document.getElementById("verticalKeyTagSwitch")?.checked || false;
	if (window.KeyTagComponent) {
		window.KeyTagComponent.print("#keytagHorizontal", "#keytagVertical", includeVertical);
	}
}

/** Zebra printer IP localStorage key. */
const ZEBRA_IP_KEY = "zebraPrinterIp";
/** Zebra relay endpoint localStorage key (optional; when set, POST goes here instead of /api/zebra-print). */
const ZEBRA_ENDPOINT_KEY = "zebraEndpoint";

/**
 * Send current key tag as ZPL to Zebra printer at configured IP (port 9100).
 * Uses /api/zebra-print, or relay URL if zebraEndpoint is set (hidden input).
 */
async function printKeyTagToZebra() {
	const ipInput = document.getElementById("zebraPrinterIp");
	const msgEl = document.getElementById("keytagMessage");
	const labelEl = document.getElementById("keytagModalLabel");
	if (!ipInput || !labelEl) return;
	const printerIp = ipInput.value.trim();
	if (!printerIp) {
		if (msgEl) msgEl.innerHTML = `<div class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Enter Zebra printer IP address.</div>`;
		return;
	}
	const data = State.currentKeyTagData;
	if (!data || !window.KeyTagComponent) {
		if (msgEl) msgEl.innerHTML = `<div class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Load a key tag first (search or create custom).</div>`;
		return;
	}
	const zpl = window.KeyTagComponent.toZpl(data);
	const endpointInput = document.getElementById("zebraEndpoint");
	const endpoint = endpointInput?.value?.trim() || "";
	const url = endpoint || "/api/zebra-print";
	try {
		if (msgEl) msgEl.innerHTML = `<div class="text-secondary"><i class="bi bi-hourglass me-2"></i>Sending to printer…</div>`;
		localStorage.setItem(ZEBRA_IP_KEY, printerIp);
		if (endpoint) localStorage.setItem(ZEBRA_ENDPOINT_KEY, endpoint);
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ printerIp, port: 9100, zpl }),
		});
		const result = await res.json().catch(() => ({}));
		if (res.ok && result.ok) {
			if (msgEl) msgEl.innerHTML = `<div class="text-success"><i class="bi bi-check-circle me-2"></i>Sent to Zebra.</div>`;
		} else {
			const errMsg = result.error || (res.status === 502 ? "Printer unreachable. Check IP and that this computer is on the same network (192.168.1.x)." : res.statusText) || "Print failed";
			if (msgEl) msgEl.innerHTML = `<div class="text-danger"><i class="bi bi-x-circle me-2"></i>${errMsg}.</div>`;
		}
	} catch (err) {
		if (msgEl) msgEl.innerHTML = `<div class="text-danger"><i class="bi bi-x-circle me-2"></i>${err.message || "Network error"}.</div>`;
	}
}

/** Labelary API: 8 dpmm = 203 DPI; label 1.5" x 2" (portrait) matches our ZPL template. */
const LABELARY_API = "https://api.labelary.com/v1/printers/8dpmm/labels/1.5x2/0/";

/**
 * Open current key tag ZPL rendered as PNG in Labelary (new tab). Use for testing Zebra labels.
 */
function previewKeyTagInLabelary() {
	const msgEl = document.getElementById("keytagMessage");
	const data = State.currentKeyTagData;
	if (!data || !window.KeyTagComponent) {
		if (msgEl) msgEl.innerHTML = `<div class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Load a key tag first (search or create custom).</div>`;
		return;
	}
	const zpl = window.KeyTagComponent.toZpl(data);
	window.open(LABELARY_API + encodeURIComponent(zpl), "_blank", "noopener");
}

let keyTagsModalLastFocus = null;

/**
 * Store the focused element before opening the key tags modal.
 */
function storeKeyTagsModalFocus() {
	keyTagsModalLastFocus =
		document.activeElement instanceof HTMLElement ?
			document.activeElement
		:	null;
}

/**
 * Restore focus after the key tags modal closes.
 */
function restoreKeyTagsModalFocus() {
	if (keyTagsModalLastFocus?.focus) {
		keyTagsModalLastFocus.focus();
	}
}

/** Open key tag modal; uses first selected row stock if none passed. Search + Create Custom use inventory data. */
function openKeyTagModal(stockNumber) {
	storeKeyTagsModalFocus();
	const stock = (typeof stockNumber === "string" && stockNumber && !stockNumber.startsWith("${"))
		? stockNumber
		: (getSelectedTvGridItems()[0] || "");
	const labelEl = document.getElementById("keytagModalLabel");
	if (labelEl) labelEl.textContent = stock || "Stock Number";
	const modalEl = document.getElementById("keytagModal");
	if (modalEl) new bootstrap.Modal(modalEl).show();
}
window.openKeyTagModal = openKeyTagModal;

function openHangTagsModal(stockNumber) {
	const iframe = document.getElementById("hangTagsIframe");
	if (iframe) iframe.src = `./hang-tags/?search=${encodeURIComponent(stockNumber || "")}`;
	const modalEl = document.getElementById("hangTagsModal");
	if (modalEl) new bootstrap.Modal(modalEl).show();
}
window.openHangTagsModal = openHangTagsModal;

function openOverlayModal(stockNumber) {
	const modalIframe = document.getElementById("overlayIframe");
	modalIframe.src = `./quote/?search=${stockNumber}`;
	const overlayModal = new bootstrap.Modal(
		document.getElementById("overlayModal"),
	);
	overlayModal.show();
}


function openServiceCalendarModal() {
	const modalIframe = document.getElementById("serviceCalendarIframe");
	modalIframe.src = `./calendar/index.html`;
	const serviceCalendarModal = new bootstrap.Modal(
		document.getElementById("serviceCalendarModal"),
	);
	serviceCalendarModal.show();
}

function printIframeContent() {
	const iframe = document.getElementById("hangTagsIframe");
	if (iframe?.contentWindow) {
		iframe.contentWindow.focus();
		iframe.contentWindow.print();
	}
}


/**
 * Sort the table by clicking a column header.
 * Sorts the underlying data array and re-renders.
 */
function sortTableByColumn(header) {
	// Check if column has data-no-sort attribute
	if (header.hasAttribute("data-no-sort")) return;
	
	const columnIndex = Array.from(header.parentElement.children).indexOf(header);
	
	// Map column index to data property
	const columnMap = {
		2: "stockNumber",   // Stock #
		3: "usage",         // Usage
		4: "year",          // Year
		5: "manufacturer",  // Make
		6: "modelName",     // Model
		7: "modelType",     // Type
		8: "color",         // Color
		9: "webPrice",      // Web Price
		10: "imageElements", // Photos (numeric count)
		11: "updated",      // Updated
	};
	
	const sortKey = columnMap[columnIndex];
	if (!sortKey) return; // Column not in map = not sortable
	
	// Toggle sort direction
	const isSameColumn = State.sort.column === sortKey;
	const newDirection = isSameColumn && State.sort.direction === "asc" ? "desc" : "asc";
	
	// Update state
	State.sort.column = sortKey;
	State.sort.direction = newDirection;
	
	// Update header classes
	header.parentElement.querySelectorAll("th").forEach((th) => {
		th.classList.remove("sort-asc", "sort-desc");
	});
	header.classList.add(newDirection === "asc" ? "sort-asc" : "sort-desc");
	
	// Sort the filtered items
	sortFilteredItems();
	
	// Reset to first page and re-render
	State.pagination.currentPage = 1;
	applyPagination();
}

/**
 * Sort State.filteredItems based on current sort state.
 * Pre-computes sort keys for performance.
 */
function sortFilteredItems() {
	const { column, direction } = State.sort;
	if (!column) return;
	
	const isAsc = direction === "asc";
	const multiplier = isAsc ? 1 : -1;
	
	// Numeric columns
	const numericColumns = ["year", "webPrice", "imageElements"];
	const isNumeric = numericColumns.includes(column);
	const isDate = column === "updated";
	
	// Pre-compute sort keys for performance
	const items = State.filteredItems.map((item) => {
		let sortKey;
		const val = item[column] ?? "";
		
		if (isNumeric) {
			sortKey = parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0;
		} else if (isDate) {
			// Convert to unix timestamp; use 0 for invalid to avoid NaN breaking sort
			const momentDate = normalizeDate(val);
			const ts = momentDate && momentDate.isValid() ? momentDate.valueOf() : 0;
			sortKey = Number.isFinite(ts) ? ts : 0;
		} else {
			sortKey = String(val).toLowerCase();
		}
		
		return { sortKey, item };
	});
	
	// Sort by pre-computed keys
	items.sort((a, b) => {
		if (typeof a.sortKey === "number" && typeof b.sortKey === "number") {
			return (a.sortKey - b.sortKey) * multiplier;
		}
		return String(a.sortKey).localeCompare(String(b.sortKey)) * multiplier;
	});
	
	// Update filtered items with sorted order
	State.filteredItems = items.map(x => x.item);
}

/**
 * Generate a thumbnail URL using the CDN thumb generator.
 * @param {string} imageUrl - Original image URL
 * @param {number} maxWidth - Max thumbnail width
 * @param {number} maxHeight - Max thumbnail height
 * @returns {string} Thumbnail URL
 */
function getThumbUrl(imageUrl, maxWidth = 100, maxHeight = 66) {
	if (!imageUrl || imageUrl === "N/A") return imageUrl;
	const thumbBase = "https://cdnmedia.endeavorsuite.com/images/ThumbGenerator/Thumb.aspx";
	return `${thumbBase}?img=${encodeURIComponent(imageUrl)}&mw=${maxWidth}&mh=${maxHeight}&f=1`;
}

function initializeClipboardTooltips() {
	const clipboardButtons = document.querySelectorAll(
		".btn-icon[data-bs-toggle='tooltip']",
	);
	clipboardButtons.forEach((button) => {
		const tooltip = new bootstrap.Tooltip(button, {
			trigger: "hover focus",
			placement: "top",
			customClass: "clipboard-tooltip",
			popperConfig(defaultBsPopperConfig) {
				return {
					...defaultBsPopperConfig,
					modifiers: [
						...defaultBsPopperConfig.modifiers,
						{
							name: "offset",
							options: {
								offset: [0, 8],
							},
						},
					],
				};
			},
		});

		button.addEventListener("click", () => {
			tooltip.setContent({ ".tooltip-inner": "Copied!" });
			setTimeout(() => {
				tooltip.setContent({ ".tooltip-inner": "Copy to clipboard" });
			}, 2000);
		});
	});
}

/**
 * Ensure focus is cleared when modals close.
 */
function initializeModalFocusGuards() {
	const modalIds = [
		"keytagModal",
		"hangTagsModal",
		"overlayModal",
		"serviceCalendarModal",
		"roTagModal",
		"textMessageModal",
	];

	modalIds.forEach((id) => {
		const modal = document.getElementById(id);
		if (!modal) return;
		modal.addEventListener("hidden.bs.modal", () => {
			if (document.activeElement && typeof document.activeElement.blur === "function") {
				document.activeElement.blur();
			}
		});
	});
}

/**
 * Initialize tooltips for truncated text cells.
 */
function initializeTextTooltips() {
	const tooltipElements = document.querySelectorAll(
		".text-tooltip[data-bs-toggle='tooltip']",
	);
	tooltipElements.forEach((element) => {
		const existingTooltip = bootstrap.Tooltip.getInstance(element);
		if (existingTooltip) {
			existingTooltip.dispose();
		}
		new bootstrap.Tooltip(element);
	});
}

// Pagination functions
function initializePagination() {
	// Set the page size select to the saved value
	if (DOM.pagination.pageSizeSelect) {
		const pageSizeValue =
			State.pagination.pageSize === Infinity ?
				"all"
			:	State.pagination.pageSize.toString();
		const option = Array.from(DOM.pagination.pageSizeSelect.options).find(
			(opt) => opt.value === pageSizeValue,
		);
		if (option) {
			option.selected = true;
		}

		// Add event listener for page size changes
		DOM.pagination.pageSizeSelect.addEventListener("change", function () {
			const newSize =
				this.value === "all" ? Infinity : parseInt(this.value, 10);
			State.pagination.pageSize = newSize;
			State.pagination.currentPage = 1; // Reset to first page on size change
			State.saveState();
			applyPagination();
		});
	}

	// Add event listeners for pagination buttons
	if (DOM.pagination.prevPageBtn) {
		DOM.pagination.prevPageBtn.addEventListener("click", function () {
			if (State.pagination.currentPage > 1) {
				State.pagination.currentPage--;
				State.saveState();
				applyPagination();
			}
		});
	}

	if (DOM.pagination.nextPageBtn) {
		DOM.pagination.nextPageBtn.addEventListener("click", function () {
			if (State.pagination.currentPage < State.pagination.totalPages) {
				State.pagination.currentPage++;
				State.saveState();
				applyPagination();
			}
		});
	}
}

function applyPagination() {
	const { currentPage, pageSize } = State.pagination;

	// Calculate total pages
	State.pagination.totalPages =
		pageSize === Infinity ? 1 : (
			Math.ceil(State.filteredItems.length / pageSize)
		);

	// Make sure current page is valid
	if (currentPage > State.pagination.totalPages) {
		State.pagination.currentPage = State.pagination.totalPages || 1;
	}

	// Calculate start and end indices
	const startIndex =
		pageSize === Infinity ? 0 : (State.pagination.currentPage - 1) * pageSize;
	const endIndex =
		pageSize === Infinity ? State.filteredItems.length : startIndex + pageSize;

	// Get items for current page
	State.currentItems = State.filteredItems.slice(startIndex, endIndex);

	// Update UI
	updateTable();
	updatePaginationUI();
}

function updatePaginationUI() {
	if (DOM.pagination.pageInfo) {
		DOM.pagination.pageInfo.textContent = `Page ${State.pagination.currentPage} of ${State.pagination.totalPages}`;
	}

	// Disable/enable prev/next buttons
	if (DOM.pagination.prevPageBtn) {
		DOM.pagination.prevPageBtn.disabled = State.pagination.currentPage <= 1;
		DOM.pagination.prevPageBtn.classList.toggle(
			"disabled",
			State.pagination.currentPage <= 1,
		);
	}

	if (DOM.pagination.nextPageBtn) {
		DOM.pagination.nextPageBtn.disabled =
			State.pagination.currentPage >= State.pagination.totalPages;
		DOM.pagination.nextPageBtn.classList.toggle(
			"disabled",
			State.pagination.currentPage >= State.pagination.totalPages,
		);
	}
}

// New function to update the table with the current items
function updateTable() {
	if (!DOM.tableBody) return;

	// Clear the table body
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create a document fragment for better performance
	const fragment = document.createDocumentFragment();

	// Add rows for the current page
	State.currentItems.forEach((item) => {
		// Extract values once to avoid repeated DOM access
		const imageUrl = item.imageUrl;
		const title = item.title;
		const webURL = item.webURL;
		const stockNumber = item.stockNumber;
		const vin = item.vin;
		const webPrice = item.webPrice;
		const manufacturer = item.manufacturer;
		const year = item.year;
		const modelName = item.modelName;
		const modelType = item.modelType;
		const color = item.color;
		const usage = item.usage;
		const updated = item.updated;
		const updatedDate = normalizeDate(updated);
		const imageElements = item.imageElements;

		const row = document.createElement("tr");
		row.innerHTML = `
      <td data-column="select" class="text-center" nowrap>
        <input type="checkbox" class="form-check-input fs-6 tv-grid-select" data-stock="${stockNumber}" title="Select for TV Grid">
      </td>
      <td data-column="image" class="text-center" nowrap>
        <a href="${webURL}" target="_blank">
          ${imageUrl !== "N/A" ? `<img src="${getThumbUrl(imageUrl, 60, 40)}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='./img/noimage.png';" />` : `<img src="./img/noimage.png" alt="No image" />`}
        </a>
      </td>
	  <td nowrap>
		<div class="flex-nowrap d-inline-flex flex-row align-items-center justify-contend-between">
		  <input type="text" class="form-control" name="stockNumber" value="${stockNumber}" placeholder="Stock Number" title="${stockNumber}" aria-label="stock number"disabled aria-describedby="btnGroupAddon" disabled>
		  <div class="" id="btnCopyToClipboard">
			<button type="button" 
			  class="btn-icon" 
			  style="margin-left: -25px;"
			  data-bs-toggle="tooltip"
			  data-bs-placement="top"
			  data-bs-title="Copy to clipboard"
			  onclick="navigator.clipboard.writeText('${stockNumber}')">
			  <i class="bi bi-clipboard text-secondary"></i>
			</button>
		  </div>
		</div>
	  </td>
      <td class="text-center" data-column="usage" nowrap><span class="badge ${usage === "New" ? "text-bg-success" : "text-bg-secondary"}">${usage}</span></td>
      <td class="text-center" nowrap>
        <span class="badge text-bg-dark border">${year}</span>
      </td>
      <td class="logo text-center" nowrap>
		<img 
			src="./icons/${getMakeIconFile(manufacturer) || 'fallback'}.png" 
			onerror="this.onerror=null; this.src='./icons/fallback.png';" 
			style="width: 28px; height: 24px; object-fit: contain;"
			alt="${manufacturer}"
		>
	</td>
      <td class="align-middle" nowrap>
        <span class="model-text text-tooltip" title="${title}">${title}</span>
        <p class="small text-muted fw-normal text-truncate overflow-hidden">
         ${modelType} • ${color}
        </p>
        <span class="visually-hidden">
        ${stockNumber} ${vin} ${usage} ${year} ${manufacturer} ${modelName} ${modelType} ${color} ${updatedDate?.format("YYYY-MM-DD") ?? ""}
        </span>
      </td>

      <td data-column="price" class="text-center" nowrap>
        <span class="badge text-bg-success fs-6 small fw-bold price-badge"><small>${webPrice}<small></span>
      </td>
      
      <td class="text-center p-4" data-column="photos" nowrap>
		${
			parseInt(imageElements) > 10 ?
				`<span class="photos-status text-tooltip" title="In-House Photos Done" data-bs-toggle="tooltip" data-bs-placement="top"><i class="bi bi-camera2 text-warning"></i><span class="visually-hidden" style="font-size: 10px;">FOM PHOTOS</span></span>`
			:	`<span class="photos-status text-tooltip" title="Awaiting Photo Shoot" data-bs-toggle="tooltip" data-bs-placement="top"><i class="bi bi-camera2 text-secondary"></i><span class="visually-hidden" style="font-size: 10px;">STOCK PHOTOS</span></span>`
		}
      </td>

	  <td data-column="updated" class="text-start p-4" nowrap>
        	<span class="badge text-secondary fw-semibold border updated-badge"
              title="${updatedDate?.format("MM-DD-YYYY") ?? "N/A"}"
              data-bs-toggle="tooltip"
              data-bs-placement="top">
            	${updatedDate?.fromNow() ?? "N/A"}
            </span>
        <span class="visually-hidden">${updatedDate?.format("YYYY-MM-DD") ?? "N/A"}</span>
      </td>

      <td data-column="tags" class="text-start tag-cell p-2" nowrap>
        <div class="d-flex flex-wrap gap-1 justify-content-start align-items-center tag-badges" data-stock="${stockNumber}">
          ${(item.tags || []).map(t => {
            const preset = State.tagPresets.find(p => p.name === t);
            const color = preset ? preset.color : 'secondary';
            return `<span class="badge text-bg-${color} tag-badge" style="font-size:.65rem;cursor:pointer" title="Edit tags">${t}</span>`;
          }).join('')}
          <button type="button" class="btn btn-outline-secondary btn-sm tag-edit-btn border-0 p-0 px-1" title="Edit tags" data-stock="${stockNumber}">
            <i class="bi bi-plus-circle" style="font-size:.75rem !important"></i>
          </button>
        </div>
      </td>

      <td class="text-center action-cell" nowrap>
		<div class="action-button-group btn-group btn-group-sm rounded-5" role="group" aria-label="Button group with nested dropdown">
			<button type="button" id="keytagModalButton" class="btn btn-danger" title="Key Tag" data-bs-toggle="modal" data-bs-target="#keytagModal" data-bs-stocknumber="${stockNumber}">
				<i class="bi bi-phone rotated-label mx-1"></i>
				<span class="action-button-label visually-hidden">KEY TAG</span>
			</button>
			<button type="button" id="hangTagModalButton" class="btn btn-danger px-2" onclick="openHangTagsModal('${stockNumber}')">
				<i class="bi bi-tags mx-1"></i>
				<span class="action-button-label visually-hidden">Hang TAG</span>
			</button>
			<button type="button" id="quotePageButtom" class="btn btn-danger" title="Create Quote Image for texting" onclick="window.location.href = 'quote/?search=${stockNumber}'">
				<i class="bi bi-card-heading mx-1"></i>
				<span class="action-button-label visually-hidden">Quote</span>
			</button>
			<button 
				type="button"
				class="btn btn-danger"
				title="Goto TV Display Launcher"
				onclick="openTvWorkspaceModal('${stockNumber}')">
				<i class="bi bi-tv dropdown-icon mx-1"></i>
				<span class="action-button-label px-2 visually-hidden">TV Display</span>
			</button>

			<div class="btn-group rounded-start" role="group">
				<button type="button" class="btn btn-danger rounded-end" data-bs-toggle="dropdown" data-bs-boundary="viewport" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false">
					<i class="bi bi-chevron-expand"></i>
				</button>
				<ul class="dropdown-menu small text-capitalize text-start overflow-hidden dropdown-menu-end">
					<li class="small">
						<a href="javascript:void(0);" type="button" id="keytagModalButton" class="dropdown-item pe-5" title="Print Key Tags" data-bs-toggle="modal" data-bs-target="#keytagModal" data-bs-stocknumber="${stockNumber}">
							<i class="bi bi-tag dropdown-icon small me-2"></i>
							Print Key Tags
						</a>
					</li>
					<li class="small">
						<a href="javascript:void(0);" class="dropdown-item pe-5" title="Print Hang Tags" onclick="openHangTagsModal('${stockNumber}')">
							<i class="bi bi-tags dropdown-icon small me-2"></i>
							Print Hang Tags
						</a>
					</li>
					<li><hr class="dropdown-divider m-1"></li>
					<li class="small">
						<a href="javascript:void(0);" class="dropdown-item pe-5" title="Create Quote Image for texting" onclick="window.location.href = 'quote/?search=${stockNumber}'">
							<i class="bi bi-card-image dropdown-icon small me-2"></i>
							Create Quote for SMS
						</a>
					</li>
					<li class="small">
						<a class="dropdown-item pe-5" href="javascript:void(0);" onclick="window.location.href = 'print/?s=${stockNumber}'">
						<i class="bi bi-card-heading dropdown-icon small me-2"></i>
						Generate PDF Brochure</a>
					</li>
					<li><hr class="dropdown-divider m-1"></li>
					<li class="small">
						<a class="dropdown-item pe-5" href="javascript:void(0);" title="Vehicle Details" onclick="window.location.href = 'details/?s=${stockNumber}'">
						<i class="bi bi-card-heading dropdown-icon small me-2"></i>
						Vehicle Details</a>
					</li>
					<li><hr class="dropdown-divider m-1"></li>
					<li class="small">
						<a 
						href="javascript:void(0);" 
						type="button"
						class="dropdown-item pe-5"
						title="Goto TV Display Launcher"
						onclick="openTvWorkspaceModal('${stockNumber}')">
						<i class="bi bi-tv dropdown-icon small me-2"></i>TV Display</a>
					</li>
				</ul>
			</div>    
      </td>`;

		fragment.appendChild(row);
	});

	// Append the fragment to the table body
	DOM.tableBody.appendChild(fragment);
	applyColumnVisibility();

	// Initialize tooltips for the new rows
	initializeClipboardTooltips();
	initializeTextTooltips();

	// Initialize tooltips for date badges
	const dateBadges = document.querySelectorAll(
		".badge[data-bs-toggle='tooltip']",
	);
	dateBadges.forEach((badge) => {
		new bootstrap.Tooltip(badge);
	});

	// Update row count after rendering
	updateRowCount();
}

// Add this function near the top with other utility functions
function checkLocalStorageAvailability() {
	try {
		// Test localStorage availability
		const testKey = "__storage_test__";
		localStorage.setItem(testKey, testKey);
		localStorage.removeItem(testKey);

		// Try estimating available space
		let totalBytes = 0;

		// Keep adding data until we hit a quota error
		try {
			// Get existing storage use
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				const value = localStorage.getItem(key);
				totalBytes += key.length + value.length;
			}

			// Test for additional space
			const oneKB = "a".repeat(1024); // 1KB of data
			let testCounter = 0;
			const testPrefix = "__space_test__";

			// Try to add up to 5MB more to see if we hit limits
			while (testCounter < 5) {
				localStorage.setItem(`${testPrefix}${testCounter}`, oneKB);
				testCounter++;
			}

			// Clean up test items
			for (let i = 0; i < testCounter; i++) {
				localStorage.removeItem(`${testPrefix}${i}`);
			}

			console.log(
				`LocalStorage: Approximately ${Math.round(totalBytes / 1024)}KB in use`,
			);
			return { available: true, quotaExceeded: false };
		} catch (e) {
			// Caught a quota error
			console.warn(
				"LocalStorage quota may be limited - will use memory fallbacks if needed",
			);
			return { available: true, quotaExceeded: true };
		}
	} catch (e) {
		console.error("LocalStorage not available", e);
		return { available: false, quotaExceeded: false };
	}
}

// Add near the top with other utility functions
function setupNetworkMonitoring() {
	const reportNetworkStatus = () => {
		const connection =
			navigator.connection ||
			navigator.mozConnection ||
			navigator.webkitConnection;

		const status = {
			online: navigator.onLine,
		};

		// Add connection info if available (mostly mobile browsers)
		if (connection) {
			status.type = connection.type;
			status.effectiveType = connection.effectiveType;
			status.downlinkMax = connection.downlinkMax;
			status.downlink = connection.downlink;
			status.rtt = connection.rtt;
			status.saveData = connection.saveData;
		}

		console.log("Network status:", status);
		return status;
	};

	// Report current status
	const initialStatus = reportNetworkStatus();

	// Add event listeners for network changes
	window.addEventListener("online", () => {
		console.log("Network came online");
		reportNetworkStatus();
	});

	window.addEventListener("offline", () => {
		console.log("Network went offline");
		reportNetworkStatus();
	});

	// Add connection change listener if available
	if (navigator.connection && navigator.connection.addEventListener) {
		navigator.connection.addEventListener("change", reportNetworkStatus);
	}

	return initialStatus;
}

// =============================================
// TV Workspace Functions
// =============================================

let tvWorkspaceModalInstance = null;
let tvWorkspaceZoomLevel = 1;

/**
 * Return TV workspace DOM references.
 * @returns {object} DOM refs for TV workspace modal.
 */
function getTvWorkspaceDom() {
	return {
		modal: document.getElementById("tvWorkspaceModal"),
		layoutOptions: Array.from(
			document.querySelectorAll("input[name='tvLayoutOption']"),
		),
		stockInput: document.getElementById("tvWorkspaceStockInput"),
		stockHelp: document.getElementById("tvWorkspaceStockHelp"),
		useSelectedBtn: document.getElementById("tvUseSelectedBtn"),
		singleOptions: document.getElementById("tvWorkspaceSingleOptions"),
		themeSelect: document.getElementById("tvWorkspaceThemeSelect"),
		noteInput: document.getElementById("tvWorkspaceNoteInput"),
		swatchInput: document.getElementById("tvWorkspaceSwatchInput"),
		accent1Input: document.getElementById("tvWorkspaceAccent1Input"),
		accent2Input: document.getElementById("tvWorkspaceAccent2Input"),
		slideStartInput: document.getElementById("tvWorkspaceSlideStartInput"),
		slideEndInput: document.getElementById("tvWorkspaceSlideEndInput"),
		urlOutput: document.getElementById("tvWorkspaceUrlOutput"),
		previewShell: document.getElementById("tvWorkspacePreviewShell"),
		previewZoomable: document.getElementById("tvWorkspacePreviewZoomable"),
		previewFrame: document.getElementById("tvWorkspacePreviewFrame"),
		previewLoading: document.getElementById("tvWorkspacePreviewLoading"),
		previewBtn: document.getElementById("tvWorkspacePreviewBtn"),
		zoomOutBtn: document.getElementById("tvWorkspaceZoomOutBtn"),
		zoomFitBtn: document.getElementById("tvWorkspaceZoomFitBtn"),
		zoomInBtn: document.getElementById("tvWorkspaceZoomInBtn"),
		copyBtn: document.getElementById("tvWorkspaceCopyUrlBtn"),
		copyFooterBtn: document.getElementById("tvWorkspaceCopyUrlFooterBtn"),
		openBtn: document.getElementById("tvWorkspaceOpenLinkBtn"),
	};
}

/**
 * Get base preview dimensions from selected layout.
 * @returns {{width: number, height: number, portrait: boolean}} Base dimensions.
 */
function getTvWorkspaceBaseDimensions() {
	const layout = getTvWorkspaceLayout();
	const portrait = layout === "portrait";
	return {
		width: portrait ? 1080 : 1920,
		height: portrait ? 1920 : 1080,
		portrait,
	};
}

/**
 * Sync preview orientation class with current layout.
 */
function syncTvWorkspacePreviewOrientation() {
	const tvDom = getTvWorkspaceDom();
	if (!tvDom.previewZoomable) return;
	const { portrait } = getTvWorkspaceBaseDimensions();
	tvDom.previewZoomable.classList.toggle("tv-workspace-preview-portrait", portrait);
}

/**
 * Apply zoom to the TV preview panel.
 * @param {number} zoom Zoom value.
 */
function applyTvWorkspaceZoom(zoom) {
	const tvDom = getTvWorkspaceDom();
	if (!tvDom.previewZoomable) return;
	const { width, height } = getTvWorkspaceBaseDimensions();
	const clamped = Math.max(0.15, Math.min(1.75, zoom));
	tvWorkspaceZoomLevel = clamped;

	tvDom.previewZoomable.style.width = `${width}px`;
	tvDom.previewZoomable.style.height = `${height}px`;
	if (window.CSS?.supports?.("zoom: 1")) {
		tvDom.previewZoomable.style.zoom = clamped;
		tvDom.previewZoomable.style.transform = "";
	} else {
		tvDom.previewZoomable.style.zoom = "";
		tvDom.previewZoomable.style.transform = `scale(${clamped})`;
	}
}

/**
 * Calculate fit-to-panel zoom.
 * @returns {number} Zoom scale.
 */
function getTvWorkspaceFitZoom() {
	const tvDom = getTvWorkspaceDom();
	if (!tvDom.previewShell) return 1;
	const { width, height } = getTvWorkspaceBaseDimensions();
	const availableWidth = Math.max(200, tvDom.previewShell.clientWidth - 24);
	const availableHeight = Math.max(200, tvDom.previewShell.clientHeight - 24);
	const scale = Math.min(availableWidth / width, availableHeight / height);
	return Math.max(0.15, Math.min(1.75, scale));
}

/**
 * Get selected TV layout from modal controls.
 * @returns {string} Layout value.
 */
function getTvWorkspaceLayout() {
	const selected = document.querySelector(
		"input[name='tvLayoutOption']:checked",
	);
	return selected?.value || "portrait";
}

/**
 * Set current layout option in TV workspace.
 * @param {string} layout Layout value.
 */
function setTvWorkspaceLayout(layout) {
	const option = document.querySelector(
		`input[name='tvLayoutOption'][value='${layout}']`,
	);
	if (option) option.checked = true;
}

/**
 * Build a TV display URL from modal values.
 * @param {boolean} preview Include preview mode flag.
 * @returns {string} TV display URL.
 */
function buildTvWorkspaceUrl(preview = false) {
	const tvDom = getTvWorkspaceDom();
	const url = new URL("tv/display/", window.location.href);
	const layout = getTvWorkspaceLayout();
	const rawStock = (tvDom.stockInput?.value || "").trim();
	const theme = tvDom.themeSelect?.value || "dark";

	url.searchParams.set("layout", layout);
	url.searchParams.set("theme", theme);

	if (layout === "grid") {
		const stocks = rawStock
			.split(",")
			.map((s) => s.trim().toUpperCase())
			.filter(Boolean)
			.slice(0, 10);
		if (stocks.length) {
			url.searchParams.set("s", stocks.join(","));
		}
	} else {
		const stock = rawStock.split(",")[0]?.trim().toUpperCase() || "";
		if (stock) {
			url.searchParams.set("s", stock);
		}
		const note = (tvDom.noteInput?.value || "").trim();
		const swatch = (tvDom.swatchInput?.value || "").trim();
		const accent1 = (tvDom.accent1Input?.value || "").trim();
		const accent2 = (tvDom.accent2Input?.value || "").trim();
		const slideStart = Number.parseInt(tvDom.slideStartInput?.value, 10);
		const slideEnd = Number.parseInt(tvDom.slideEndInput?.value, 10);

		if (note) url.searchParams.set("note", note);
		if (swatch) url.searchParams.set("swatch", swatch);
		if (accent1) url.searchParams.set("accent1", accent1);
		if (accent2) url.searchParams.set("accent2", accent2);
		if (Number.isFinite(slideStart)) url.searchParams.set("slideStart", slideStart);
		if (Number.isFinite(slideEnd)) url.searchParams.set("slideEnd", slideEnd);
	}

	if (preview) {
		url.searchParams.set("preview", "1");
	}

	return url.toString();
}

/**
 * Keep the TV workspace controls in sync with layout mode.
 */
function updateTvWorkspaceLayoutUi() {
	const tvDom = getTvWorkspaceDom();
	const layout = getTvWorkspaceLayout();
	const isGrid = layout === "grid";
	if (tvDom.singleOptions) {
		tvDom.singleOptions.style.display = isGrid ? "none" : "";
	}
	if (tvDom.stockHelp) {
		tvDom.stockHelp.textContent = isGrid
			? "Enter up to 10 stock numbers, comma-separated."
			: "Single stock number for portrait/landscape.";
	}
	if (tvDom.stockInput) {
		tvDom.stockInput.placeholder = isGrid
			? "STOCK1, STOCK2, STOCK3 ..."
			: "Enter stock number...";
	}
	syncTvWorkspacePreviewOrientation();
}

/**
 * Update the URL output and optionally refresh preview frame.
 * @param {boolean} refreshPreview Whether to reload preview iframe.
 */
function updateTvWorkspaceUrl(refreshPreview = false) {
	const tvDom = getTvWorkspaceDom();
	const normalUrl = buildTvWorkspaceUrl(false);
	if (tvDom.urlOutput) {
		tvDom.urlOutput.value = normalUrl;
	}
	if (refreshPreview && tvDom.previewFrame) {
		if (tvDom.previewLoading) {
			tvDom.previewLoading.classList.remove("hidden");
		}
		tvDom.previewFrame.src = buildTvWorkspaceUrl(true);
	}
}

/**
 * Copy TV display URL from workspace.
 */
async function copyTvWorkspaceUrl() {
	const tvDom = getTvWorkspaceDom();
	const url = tvDom.urlOutput?.value?.trim();
	if (!url) return;
	try {
		await navigator.clipboard.writeText(url);
	} catch (error) {
		console.error("Failed to copy TV URL:", error);
	}
}

/**
 * Open TV display URL in a new tab.
 */
function openTvWorkspaceLink() {
	const tvDom = getTvWorkspaceDom();
	const url = tvDom.urlOutput?.value?.trim() || buildTvWorkspaceUrl(false);
	if (!url) return;
	window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Apply selected row stock numbers into TV workspace input.
 * @returns {string[]} Selected stock numbers.
 */
function useSelectedStocksInTvWorkspace() {
	const tvDom = getTvWorkspaceDom();
	const selected = getSelectedTvGridItems().slice(0, 10);
	if (!selected.length) return [];
	if (tvDom.stockInput) {
		tvDom.stockInput.value = selected.join(",");
	}
	if (selected.length > 1) {
		setTvWorkspaceLayout("grid");
	}
	updateTvWorkspaceLayoutUi();
	updateTvWorkspaceUrl(true);
	return selected;
}

/**
 * Open TV workspace modal with optional initial stock(s).
 * @param {string|string[]} [stockInput] Single stock or stock list.
 */
function openTvWorkspaceModal(stockInput) {
	const tvDom = getTvWorkspaceDom();
	if (!tvDom.modal || !window.bootstrap?.Modal) return;
	if (!tvWorkspaceModalInstance) {
		tvWorkspaceModalInstance = new bootstrap.Modal(tvDom.modal);
	}

	const theme = document.body.getAttribute("data-bs-theme") || "dark";
	if (tvDom.themeSelect) {
		tvDom.themeSelect.value = theme === "light" ? "light" : "dark";
	}

	if (Array.isArray(stockInput)) {
		if (tvDom.stockInput) {
			tvDom.stockInput.value = stockInput.slice(0, 10).join(",");
		}
		setTvWorkspaceLayout(stockInput.length > 1 ? "grid" : "portrait");
	} else if (typeof stockInput === "string" && stockInput.trim()) {
		if (tvDom.stockInput) {
			tvDom.stockInput.value = stockInput.trim().toUpperCase();
		}
		setTvWorkspaceLayout("portrait");
	} else if (!tvDom.stockInput?.value) {
		const selected = getSelectedTvGridItems();
		if (selected.length) {
			tvDom.stockInput.value = selected.slice(0, 10).join(",");
			setTvWorkspaceLayout(selected.length > 1 ? "grid" : "portrait");
		}
	}

	updateTvWorkspaceLayoutUi();
	updateTvWorkspaceUrl(true);
	applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
	tvWorkspaceModalInstance.show();
}

window.openTvWorkspaceModal = openTvWorkspaceModal;

/**
 * Get all selected stock numbers for TV Grid.
 * @returns {string[]} Array of selected stock numbers.
 */
function getSelectedTvGridItems() {
	const checkboxes = document.querySelectorAll(".tv-grid-select:checked");
	return Array.from(checkboxes).map(cb => cb.dataset.stock).filter(Boolean);
}

/**
 * Update the TV Grid button state and count.
 */
function updateTvGridButton() {
	const selected = getSelectedTvGridItems();
	const btn = document.getElementById("sendToTvGridBtn");
	const countSpan = document.getElementById("selectedCount");
	
	if (btn) {
		btn.disabled = selected.length === 0;
	}
	if (countSpan) {
		countSpan.textContent = selected.length;
	}
}

/**
 * Send selected items to TV Grid launcher.
 */
function sendToTvGrid() {
	const selected = getSelectedTvGridItems();
	if (selected.length === 0) return;
	openTvWorkspaceModal(selected.slice(0, 10));
}

/**
 * Initialize TV Grid selection handlers.
 */
function initTvGridSelection() {
	const tvDom = getTvWorkspaceDom();

	if (tvDom.layoutOptions.length) {
		tvDom.layoutOptions.forEach((option) => {
			option.addEventListener("change", () => {
				updateTvWorkspaceLayoutUi();
				updateTvWorkspaceUrl(true);
				applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
			});
		});
	}

	if (tvDom.modal) {
		tvDom.modal.addEventListener("shown.bs.modal", () => {
			updateTvWorkspaceLayoutUi();
			updateTvWorkspaceUrl(true);
			applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
		});
		tvDom.modal.addEventListener("hidden.bs.modal", () => {
			if (tvDom.previewFrame) {
				tvDom.previewFrame.src = "";
			}
			if (tvDom.previewLoading) {
				tvDom.previewLoading.classList.add("hidden");
			}
		});
	}

	if (tvDom.previewFrame) {
		tvDom.previewFrame.addEventListener("load", () => {
			const currentDom = getTvWorkspaceDom();
			if (currentDom.previewLoading) {
				currentDom.previewLoading.classList.add("hidden");
			}
		});
	}

	if (tvDom.stockInput) {
		tvDom.stockInput.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.noteInput) {
		tvDom.noteInput.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.swatchInput) {
		tvDom.swatchInput.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.accent1Input) {
		tvDom.accent1Input.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.accent2Input) {
		tvDom.accent2Input.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.slideStartInput) {
		tvDom.slideStartInput.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.slideEndInput) {
		tvDom.slideEndInput.addEventListener("input", () => updateTvWorkspaceUrl(false));
	}
	if (tvDom.themeSelect) {
		tvDom.themeSelect.addEventListener("change", () => updateTvWorkspaceUrl(true));
	}
	if (tvDom.previewBtn) {
		tvDom.previewBtn.addEventListener("click", () => {
			updateTvWorkspaceUrl(true);
			applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
		});
	}
	if (tvDom.zoomInBtn) {
		tvDom.zoomInBtn.addEventListener("click", () =>
			applyTvWorkspaceZoom(tvWorkspaceZoomLevel + 0.1),
		);
	}
	if (tvDom.zoomOutBtn) {
		tvDom.zoomOutBtn.addEventListener("click", () =>
			applyTvWorkspaceZoom(tvWorkspaceZoomLevel - 0.1),
		);
	}
	if (tvDom.zoomFitBtn) {
		tvDom.zoomFitBtn.addEventListener("click", () =>
			applyTvWorkspaceZoom(getTvWorkspaceFitZoom()),
		);
	}
	if (tvDom.copyBtn) {
		tvDom.copyBtn.addEventListener("click", copyTvWorkspaceUrl);
	}
	if (tvDom.copyFooterBtn) {
		tvDom.copyFooterBtn.addEventListener("click", copyTvWorkspaceUrl);
	}
	if (tvDom.openBtn) {
		tvDom.openBtn.addEventListener("click", openTvWorkspaceLink);
	}
	if (tvDom.useSelectedBtn) {
		tvDom.useSelectedBtn.addEventListener("click", useSelectedStocksInTvWorkspace);
	}

	window.addEventListener("resize", () => {
		if (!tvDom.modal?.classList.contains("show")) return;
		applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
	});

	// Select all checkbox
	const selectAllCheckbox = document.getElementById("selectAllCheckbox");
	if (selectAllCheckbox) {
		selectAllCheckbox.addEventListener("change", (e) => {
			const checkboxes = document.querySelectorAll(".tv-grid-select");
			checkboxes.forEach(cb => cb.checked = e.target.checked);
			updateTvGridButton();
		});
	}
	
	// Individual checkbox changes (delegated)
	document.addEventListener("change", (e) => {
		if (e.target.classList.contains("tv-grid-select")) {
			updateTvGridButton();
			// Update select all checkbox state
			const allCheckboxes = document.querySelectorAll(".tv-grid-select");
			const checkedCheckboxes = document.querySelectorAll(".tv-grid-select:checked");
			if (selectAllCheckbox) {
				selectAllCheckbox.checked = allCheckboxes.length === checkedCheckboxes.length;
				selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
			}
		}
	});
	
	// Send to TV Grid button
	const sendBtn = document.getElementById("sendToTvGridBtn");
	if (sendBtn) {
		sendBtn.addEventListener("click", sendToTvGrid);
	}

	updateTvWorkspaceLayoutUi();
	updateTvWorkspaceUrl(false);
	applyTvWorkspaceZoom(getTvWorkspaceFitZoom());
}

// Initialize TV Grid selection when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initTvGridSelection);
} else {
	initTvGridSelection();
}
