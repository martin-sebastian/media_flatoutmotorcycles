/**
 * Fetches vehicle inventory from Supabase unit_inventory.
 * Also fetches tag_presets and vehicle_tags for the tagging system.
 */
import { supabase, isSupabaseConfigured } from './supabase.js';

/** Maps a Supabase row to the app item shape (matches processXMLData output). */
function mapRowToAppItem(row) {
	const images = Array.isArray(row.images) ? row.images : [];
	const imageUrl = images[0] || 'N/A';
	const price = row.price != null ? String(row.price) : 'N/A';
	const year = row.year != null ? String(row.year) : 'N/A';
	const updated = row.updated
		? new Date(row.updated).toISOString().replace('T', ' ').slice(0, 19)
		: 'N/A';

	const stockedDate = row.stocked_date || null;
	const daysInStock = stockedDate
		? Math.max(0, Math.floor((Date.now() - new Date(stockedDate).getTime()) / 86400000))
		: null;

	return {
		imageUrl,
		title: row.title || 'N/A',
		webURL: row.link || 'N/A',
		stockNumber: row.stocknumber || 'N/A',
		vin: row.vin || 'N/A',
		price,
		webPrice: typeof numeral !== 'undefined' ? numeral(price).format('$0,0.00') : price,
		manufacturer: row.manufacturer || 'N/A',
		year,
		modelName: row.model_name || 'N/A',
		modelType: row.model_type || 'N/A',
		modelCode: 'N/A',
		color: row.color || 'N/A',
		usage: row.usage || 'N/A',
		updated,
		imageElements: images.length,
		tags: [],
		stockedDate,
		daysInStock,
		metricType: row.metric_type || null,
		metricValue: row.metric_value != null ? Number(row.metric_value) : null,
	};
}

/** Fetches tag presets (predefined tag options with colors). */
export async function fetchTagPresets() {
	if (!isSupabaseConfigured()) return [];
	try {
		const { data, error } = await supabase
			.from('tag_presets')
			.select('*')
			.order('sort_order', { ascending: true });
		if (error) { console.error('Tag presets fetch error:', error); return []; }
		return data || [];
	} catch (err) {
		console.error('Tag presets fetch exception:', err);
		return [];
	}
}

/** Fetches all vehicle_tags rows and returns a Map<stocknumber, string[]>. */
export async function fetchVehicleTags() {
	if (!isSupabaseConfigured()) return new Map();
	try {
		const { data, error } = await supabase
			.from('vehicle_tags')
			.select('stocknumber, tag');
		if (error) { console.error('Vehicle tags fetch error:', error); return new Map(); }
		const map = new Map();
		for (const row of data || []) {
			if (!map.has(row.stocknumber)) map.set(row.stocknumber, []);
			map.get(row.stocknumber).push(row.tag);
		}
		return map;
	} catch (err) {
		console.error('Vehicle tags fetch exception:', err);
		return new Map();
	}
}

/** Adds a tag to a vehicle. Returns true on success. */
export async function addVehicleTag(stocknumber, tag) {
	if (!isSupabaseConfigured()) return false;
	const { error } = await supabase
		.from('vehicle_tags')
		.upsert({ stocknumber, tag }, { onConflict: 'stocknumber,tag' });
	if (error) console.error('Add tag error:', error);
	return !error;
}

/** Removes a tag from a vehicle. Returns true on success. */
export async function removeVehicleTag(stocknumber, tag) {
	if (!isSupabaseConfigured()) return false;
	const { error } = await supabase
		.from('vehicle_tags')
		.delete()
		.eq('stocknumber', stocknumber)
		.eq('tag', tag);
	if (error) console.error('Remove tag error:', error);
	return !error;
}

/**
 * Fetches vehicles from Supabase unit_inventory, merges tags.
 * @returns {Promise<Array|null>} Mapped items or null if Supabase not configured/fails.
 */
export async function fetchVehiclesFromSupabase() {
	if (!isSupabaseConfigured()) return null;

	const table = import.meta.env?.VITE_SUPABASE_INVENTORY_TABLE || 'unit_inventory';
	try {
		const [vehicleResult, tagsMap] = await Promise.all([
			supabase.from(table).select('*').order('updated', { ascending: false }).order('stocknumber', { ascending: true }),
			fetchVehicleTags(),
		]);

		if (vehicleResult.error) {
			console.error('Supabase fetch error:', vehicleResult.error);
			return null;
		}

		return (vehicleResult.data || []).map(row => {
			const item = mapRowToAppItem(row);
			item.tags = tagsMap.get(item.stockNumber) || [];
			return item;
		});
	} catch (err) {
		console.error('Supabase fetch exception:', err);
		return null;
	}
}
