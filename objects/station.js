import {
	STATION_LEVEL_REQS, STATION_VOLUNTEER_AMOUNT, STATION_CORE_MIN_LEVEL, TEXT_COLOR,
	FUEL_MAX, LIFE_SUPPORT_MAX,
	CARGO_CAPACITY, CARGO_BASE_PER_DEST, CARGO_LEVEL_MULT,
	CARGO_MAX_DESTS_BASE, CARGO_MAX_DESTS_PER_LV,
	CARGO_DELIVERY_DIST_SCALE, CARGO_DELIVERY_BASE_SCI, CARGO_DELIVERY_BASE_MIN,
	STATION_HULL_REPAIR_LV, STATION_REMOTE_REFUEL_LV, STATION_REMOTE_O2_LV,
	STATION_MINERAL_CAP_BASE, STATION_MINERAL_CAP_PER_LV,
	SHIP_UPGRADES,
	STARSHIP_COMPONENT_MIN_LEVEL, STARSHIP_COMPONENT_TYPES,
	STARSHIP_COMPONENT_COST_SCI, STARSHIP_COMPONENT_COST_MIN,
} from '../constants.js';

let STATION_PREFIXES = [];
fetch('station-prefixes.json').then(r => r.json()).then(data => { STATION_PREFIXES = data; });

const SUFFIX_TIERS = {
	low:  ['Outpost', 'Beacon', 'Relay', 'Array', 'Platform'],   // Lv 1-2
	mid:  ['Depot', 'Port', 'Dock', 'Terminal', 'Post'],          // Lv 3-4
	high: ['Hub', 'Stronghold', 'Haven', 'Anchorage', 'Spire'],   // Lv 5+
};
const STATION_SUFFIXES = SUFFIX_TIERS.low;

// Greek letters used as designators to guarantee uniqueness
const DESIGNATORS = [
	'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
	'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Omega', 'Rho', 'Phi',
];

/** Get the science and minerals required to reach the next level. Returns [science, minerals] or null if max. */
export function levelReqs(level) {
	const idx = level - 1; // level 1 needs index 0 to reach level 2
	if (idx < 0 || idx >= STATION_LEVEL_REQS.length) return null;
	return STATION_LEVEL_REQS[idx];
}

/** Check if a station can level up, and if so, do it. Returns true if level changed. */
export function tryLevelUp(station) {
	const reqs = levelReqs(station.level);
	if (!reqs) return false;
	const [sciNeeded, minNeeded] = reqs;
	if (station.storedScience >= sciNeeded && station.storedMinerals >= minNeeded) {
		station.storedScience -= sciNeeded;
		station.storedMinerals -= minNeeded;
		station.level++;
		// Award a station core on each level-up at or above the core threshold
		if (station.level >= STATION_CORE_MIN_LEVEL) {
			station.coresAvailable = (station.coresAvailable || 0) + 1;
		}
		// Check for further level-ups with remaining resources
		tryLevelUp(station);
		return true;
	}
	return false;
}

/** Update the display name based on current level, preserving the designator. */
function updateStationName(station) {
	let tier;
	if (station.level >= 5) tier = SUFFIX_TIERS.high;
	else if (station.level >= 3) tier = SUFFIX_TIERS.mid;
	else tier = SUFFIX_TIERS.low;
	const hash = simpleHash(station.basePrefix);
	const suffix = tier[hash % tier.length];
	// Extract designator from the current name (last word)
	const parts = station.name.split(' ');
	const designator = parts.length >= 3 ? parts[parts.length - 1] : '';
	station.name = designator
		? `${station.basePrefix} ${suffix} ${designator}`
		: `${station.basePrefix} ${suffix}`;
	registerStationName(station);
}

// ── Station name registry ──────────────────────────────────
// Maps station IDs to their current display name. Updated whenever a station
// is generated, renamed, or leveled up. Used to resolve cargo destination names.
const stationNameRegistry = {};

/** Register or update a station's name in the registry. */
export function registerStationName(station) {
	const sid = station.id || stationId(station.x, station.y);
	stationNameRegistry[sid] = station.name;
}

/** Look up a station's current name by ID. Falls back to the provided default. */
export function lookupStationName(id, fallback) {
	return stationNameRegistry[id] || fallback || id;
}

/** Generate a unique station ID from its position. */
function stationId(x, y) {
	return `st_${Math.round(x)}_${Math.round(y)}`;
}

function simpleHash(str) {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/** Population scales with level — gives the station personality. */
export function stationPopulation(station) {
	const base = simpleHash(station.basePrefix) % 40 + 10;
	return Math.floor(base * Math.pow(1.8, station.level - 1));
}

/** Maximum approach speed allowed to dock at this station. Scales as level^2.5. */
export function stationMaxDockSpeed(station) {
	const level = station.level || 1;
	return Math.pow(level, 2.5);
}

// ── Cargo ──────────────────────────────────────────────────

/** Total cargo hold usage (minerals + cargo items). */
export function shipCargoUsed(ship) {
	let total = Math.floor(ship.minerals);
	for (const c of ship.cargo) total += Math.floor(c.amount);
	return total;
}

/** Effective fuel max including upgrades. */
export function shipFuelMax(ship) {
	return FUEL_MAX + upgradeTotalEffect(SHIP_UPGRADES.find(u => u.id === 'fuel'), (ship.upgrades && ship.upgrades.fuel) || 0);
}

/** Effective O2 max including upgrades. */
export function shipO2Max(ship) {
	return LIFE_SUPPORT_MAX + upgradeTotalEffect(SHIP_UPGRADES.find(u => u.id === 'o2'), (ship.upgrades && ship.upgrades.o2) || 0);
}

/** Effective cargo capacity including upgrades. */
export function shipCargoCapacity(ship) {
	return Math.floor(CARGO_CAPACITY + upgradeTotalEffect(
		SHIP_UPGRADES.find(u => u.id === 'cargo'),
		(ship.upgrades && ship.upgrades.cargo) || 0
	));
}

/** Remaining cargo capacity. */
export function shipCargoFree(ship) {
	return Math.max(0, shipCargoCapacity(ship) - shipCargoUsed(ship));
}

/** Generate cargo for a station based on nearby stations. Called from update.js. */
export function generateStationCargo(station, nearbyStations, gameTime) {
	if (!station.availableCargo) station.availableCargo = [];
	station.lastCargoGenTime = gameTime;

	const level = station.level || 1;
	const maxDests = CARGO_MAX_DESTS_BASE + (level - 1) * CARGO_MAX_DESTS_PER_LV;

	// Filter out self, sort by distance for variety
	const sid = station.id || stationId(station.x, station.y);
	const candidates = nearbyStations
		.filter(s => (s.id || stationId(s.x, s.y)) !== sid)
		.sort((a, b) => {
			const da = (a.x - station.x) ** 2 + (a.y - station.y) ** 2;
			const db = (b.x - station.x) ** 2 + (b.y - station.y) ** 2;
			return da - db;
		});

	if (!candidates.length) return;

	// Pick destinations — mix of near and far
	const dests = candidates.slice(0, Math.min(maxDests, candidates.length));

	for (const dest of dests) {
		// Skip if cargo for this destination already exists
		const did = dest.id || stationId(dest.x, dest.y);
		if (station.availableCargo.some(c => c.destId === did)) continue;
		const amount = CARGO_BASE_PER_DEST + level * CARGO_LEVEL_MULT;
		station.availableCargo.push({
			destId: did,
			destName: dest.name,
			destX: dest.x,
			destY: dest.y,
			amount,
		});
	}
}

/** How much cargo on the ship is destined for this station. */
function deliverableAmount(ship, station) {
	const sid = station.id || stationId(station.x, station.y);
	let total = 0;
	for (const c of ship.cargo) {
		if (c.destId === sid) total += c.amount;
	}
	return total;
}

/** Deliver all cargo destined for this station. Returns { science, minerals } awarded. */
export function deliverCargo(ship, station) {
	const sid = station.id || stationId(station.x, station.y);
	let totalSci = 0;
	let totalMin = 0;
	const remaining = [];
	for (const c of ship.cargo) {
		if (c.destId === sid) {
			// Distance is from origin station to destination
			const dist = Math.sqrt((c.originX - station.x) ** 2 + (c.originY - station.y) ** 2);
			const distMult = 1 + dist / CARGO_DELIVERY_DIST_SCALE;
			const sci = Math.floor(CARGO_DELIVERY_BASE_SCI * c.amount * distMult * (0.8 + Math.random() * 0.4));
			const min = Math.floor(CARGO_DELIVERY_BASE_MIN * c.amount * distMult * (0.8 + Math.random() * 0.4));
			totalSci += sci;
			totalMin += min;
		} else {
			remaining.push(c);
		}
	}
	ship.cargo = remaining;
	station.storedScience += totalSci;
	station.storedMinerals += totalMin;
	tryLevelUp(station);
	return { science: totalSci, minerals: totalMin };
}

/** Pick up a single cargo item by index, or all if index is 'all'. Returns amount picked up. */
export function pickUpCargoItem(ship, station, index) {
	if (!station.availableCargo || !station.availableCargo.length) return 0;
	const free = shipCargoFree(ship);
	if (free <= 0) return 0;

	if (index === 'all') {
		return pickUpCargo(ship, station);
	}

	if (index < 0 || index >= station.availableCargo.length) return 0;
	const c = station.availableCargo[index];
	const take = Math.min(c.amount, free);
	ship.cargo.push({
		destId: c.destId,
		destName: c.destName,
		destX: c.destX,
		destY: c.destY,
		originId: station.id || stationId(station.x, station.y),
		originName: station.name,
		originX: station.x,
		originY: station.y,
		amount: take,
	});
	if (take >= c.amount) {
		station.availableCargo.splice(index, 1);
	} else {
		c.amount -= take;
	}
	return take;
}

/** Pick up all cargo from a station into the ship, up to capacity. Returns amount picked up. */
export function pickUpCargo(ship, station) {
	if (!station.availableCargo) return 0;
	let free = shipCargoFree(ship);
	let picked = 0;
	const remaining = [];
	for (const c of station.availableCargo) {
		if (free <= 0) { remaining.push(c); continue; }
		const take = Math.min(c.amount, free);
		ship.cargo.push({
			destId: c.destId,
			destName: c.destName,
			destX: c.destX,
			destY: c.destY,
			originId: station.id || stationId(station.x, station.y),
			originName: station.name,
			originX: station.x,
			originY: station.y,
			amount: take,
		});
		free -= take;
		picked += take;
		if (take < c.amount) {
			remaining.push({ ...c, amount: c.amount - take });
		}
	}
	station.availableCargo = remaining;
	return picked;
}

// ── Ship Upgrades ──────────────────────────────────────────

/** Cost of the next install of an upgrade, given current install count. */
export function upgradeCost(upgDef, currentCount) {
	return Math.ceil(upgDef.baseCost * Math.pow(upgDef.costMult, currentCount));
}

/** Effect gained from the nth install (0-indexed). */
export function upgradeEffect(upgDef, installIndex) {
	return upgDef.baseEffect * Math.pow(upgDef.effectDecay, installIndex);
}

/** Total effect from all installs of an upgrade. */
export function upgradeTotalEffect(upgDef, count) {
	let total = 0;
	for (let i = 0; i < count; i++) total += upgradeEffect(upgDef, i);
	return total;
}

/** Max installs allowed at a given station level. */
function upgradeMaxInstalls(upgDef, stationLevel) {
	if (stationLevel < upgDef.minLevel) return 0;
	return Math.min(9, upgDef.maxPerLv * stationLevel);
}

/** Build upgrade sub-items for the station menu. */
function getUpgradeItems(station, ship) {
	const level = station.level || 1;
	if (!ship.upgrades) ship.upgrades = { hull: 0, cargo: 0, fuel: 0, o2: 0, engine: 0, rcs: 0 };
	return SHIP_UPGRADES.map(u => {
		const count = ship.upgrades[u.id] || 0;
		const max = upgradeMaxInstalls(u, level);
		const cost = upgradeCost(u, count);
		const canAfford = (station.storedMinerals || 0) >= cost;
		const canInstall = count < max && canAfford;
		const nextEffect = upgradeEffect(u, count);

		let status;
		if (level < u.minLevel) {
			status = `Lv ${u.minLevel}`;
		} else if (count >= max) {
			status = `${count}/${max} Max`;
		} else {
			status = `${count}/${max} \u00B7 ${cost}`;
		}

		return {
			id: `upgrade-${u.id}`,
			name: u.name,
			status,
			active: level >= u.minLevel,
			selectable: level >= u.minLevel && count < max && canAfford,
			upgDef: u,
		};
	});
}

/** Get the total bonus for a specific upgrade on the ship. */
export function getUpgradeBonus(ship, upgradeId) {
	const u = SHIP_UPGRADES.find(u => u.id === upgradeId);
	if (!u) return 0;
	return upgradeTotalEffect(u, (ship.upgrades && ship.upgrades[upgradeId]) || 0);
}

/** Install an upgrade on the ship. Returns true if successful. */
export function installUpgrade(upgradeId, station, ship) {
	const u = SHIP_UPGRADES.find(u => u.id === upgradeId);
	if (!u) return false;
	if (!ship.upgrades) ship.upgrades = { hull: 0, cargo: 0, fuel: 0, o2: 0, engine: 0, rcs: 0 };
	const count = ship.upgrades[u.id] || 0;
	const max = upgradeMaxInstalls(u, station.level || 1);
	const cost = upgradeCost(u, count);
	if (count >= max || (station.storedMinerals || 0) < cost) return false;
	station.storedMinerals -= cost;
	ship.upgrades[u.id] = count + 1;
	return true;
}

/**
 * Build the top-level menu for a docked station.
 * Each entry is either a category (has `items` array) or a direct action.
 * Categories open a sub-menu when activated; direct items execute immediately.
 */
export function getStationMenuItems(station, ship) {
	const level = station.level || 1;
	const items = [
		{ id: 'cat-services', name: 'Services', selectable: true, isCategory: true, items: [
			{ id: 'refuel', name: 'Refuel', status: 'Docked', active: true, selectable: false },
			{ id: 'o2', name: 'O\u2082 Resupply', status: 'Docked', active: true, selectable: false },
			{ id: 'hull-repair', name: 'Hull Repair',
				status: level >= STATION_HULL_REPAIR_LV
					? (ship.hp >= ship.maxHp ? 'Full' : `${Math.ceil(ship.hp)}/${ship.maxHp}`)
					: `Lv ${STATION_HULL_REPAIR_LV}`,
				active: level >= STATION_HULL_REPAIR_LV,
				selectable: level >= STATION_HULL_REPAIR_LV && ship.hp < ship.maxHp },
			{ id: 'remote-refuel', name: 'Remote Refuel', status: level >= STATION_REMOTE_REFUEL_LV ? 'Active' : `Lv ${STATION_REMOTE_REFUEL_LV}`, active: level >= STATION_REMOTE_REFUEL_LV, selectable: false },
			{ id: 'remote-o2', name: 'Remote O\u2082', status: level >= STATION_REMOTE_O2_LV ? 'Active' : `Lv ${STATION_REMOTE_O2_LV}`, active: level >= STATION_REMOTE_O2_LV, selectable: false },
		]},
		{ id: 'volunteer', name: 'Volunteer Work', status: `+${STATION_VOLUNTEER_AMOUNT} Sci/Min`, active: true, selectable: true },
		{ id: 'cat-science', name: 'Science', selectable: true, isCategory: true, items: [
			{ id: 'collect-science', name: 'Collect Science', status: stationScienceSummary(station), active: hasStationScience(station), selectable: hasStationScience(station) },
			{ id: 'give-science', name: 'Give Science', status: scienceSummary(ship, station), active: hasScienceToGive(ship, station), selectable: hasScienceToGive(ship, station) },
		]},
		{ id: 'cat-minerals', name: 'Minerals', selectable: true, isCategory: true, items: [
			{ id: 'collect-minerals', name: 'Collect Minerals', status: minedMineralsSummary(station), active: hasMinedMinerals(station), selectable: hasMinedMinerals(station) && shipCargoFree(ship) > 0 },
			{ id: 'give-minerals', name: 'Give Minerals', status: mineralsSummary(ship), active: ship.minerals > 0, selectable: ship.minerals > 0 },
		]},
		{ id: 'cat-cargo', name: 'Cargo', selectable: true, isCategory: true, items: [
			{ id: 'deliver-cargo', name: 'Deliver Cargo', status: deliverableAmount(ship, station) > 0 ? `${Math.floor(deliverableAmount(ship, station))} units` : 'None', active: deliverableAmount(ship, station) > 0, selectable: deliverableAmount(ship, station) > 0 },
			{ id: 'pick-up-cargo', name: 'Pick Up Cargo', status: cargoPickupStatus(station, ship), active: hasAvailableCargo(station) && shipCargoFree(ship) > 0, selectable: hasAvailableCargo(station) && shipCargoFree(ship) > 0 },
		]},
		{ id: 'cat-upgrades', name: 'Ship Upgrades', selectable: true, isCategory: true, items: getUpgradeItems(station, ship) },
		{
			id: 'get-core',
			name: 'Get Station Core',
			status: level < STATION_CORE_MIN_LEVEL
				? `Lv ${STATION_CORE_MIN_LEVEL}`
				: ship.hasStationCore ? 'Carried'
				: (station.coresAvailable || 0) > 0 ? 'Available'
				: 'Claimed',
			active: level >= STATION_CORE_MIN_LEVEL && (station.coresAvailable || 0) > 0,
			selectable: level >= STATION_CORE_MIN_LEVEL && !ship.hasStationCore && (station.coresAvailable || 0) > 0,
		},
	];
	// Starship component production — all 4 parts available, but once one is bought the station is spent
	if (!station.componentSold) station.componentSold = false;
	const comps = ship.starshipComponents || {};
	const compItems = STARSHIP_COMPONENT_TYPES.map(compType => {
		const carried = comps[compType];
		const costMet = station.storedScience >= STARSHIP_COMPONENT_COST_SCI && station.storedMinerals >= STARSHIP_COMPONENT_COST_MIN;
		let status, selectable;
		if (level < STARSHIP_COMPONENT_MIN_LEVEL) {
			status = `Lv ${STARSHIP_COMPONENT_MIN_LEVEL}`;
			selectable = false;
		} else if (station.componentSold) {
			status = 'Sold Out';
			selectable = false;
		} else if (carried) {
			status = 'Carried';
			selectable = false;
		} else {
			status = `${STARSHIP_COMPONENT_COST_SCI}  +  ${STARSHIP_COMPONENT_COST_MIN}`;
			selectable = costMet;
		}
		return {
			id: `build-component-${compType}`,
			name: compType,
			status,
			active: level >= STARSHIP_COMPONENT_MIN_LEVEL && !station.componentSold,
			selectable,
			showCostIcons: !carried && !station.componentSold && level >= STARSHIP_COMPONENT_MIN_LEVEL,
		};
	});
	items.push({
		id: 'cat-ramjet', name: 'Ramjet Parts',
		status: level < STARSHIP_COMPONENT_MIN_LEVEL ? `Lv ${STARSHIP_COMPONENT_MIN_LEVEL}` : '',
		active: level >= STARSHIP_COMPONENT_MIN_LEVEL,
		selectable: level >= STARSHIP_COMPONENT_MIN_LEVEL,
		isCategory: true, items: compItems,
	});
	if (station.isDynamic) {
		items.push({ id: 'rename', name: 'Rename Station', status: station.name, active: true, selectable: true });
	}
	return items;
}

/** Rename a station and update any cargo referencing it. */
export function renameStation(station, newName, allStations) {
	const oldName = station.name;
	station.name = newName;
	// Update cargo that references this station by name (display only — matching uses IDs)
	// No functional changes needed since matching is ID-based
}

/** Check if a station has accumulated any science from nearby planets. */
function hasStationScience(station) {
	if (!station.science) return false;
	for (const key in station.science) {
		if (station.science[key].amount > 0) return true;
	}
	return false;
}

/** Short summary of station's accumulated science (from nearby planets). */
function stationScienceSummary(station) {
	if (!station.science || !hasStationScience(station)) return 'None';
	let total = 0;
	for (const key in station.science) total += station.science[key].amount;
	return `${Math.floor(total)}`;
}

/** Get collectible science entries from a station. Returns [{ key, entry }]. */
export function getStationScienceEntries(station) {
	const entries = [];
	if (!station.science) return entries;
	for (const key in station.science) {
		const entry = station.science[key];
		if (entry.amount >= 1) {
			entries.push({ key, entry });
		}
	}
	entries.sort((a, b) => b.entry.amount - a.entry.amount);
	return entries;
}

/** Collect a single science entry (or all) from a station to the ship. */
export function collectStationScienceEntry(station, ship, key) {
	if (!station.science) return 0;
	if (key === 'all') return collectStationScience(station, ship);
	const entry = station.science[key];
	if (!entry || entry.amount < 1) return 0;
	const take = Math.floor(entry.amount);
	if (!ship.science[key]) {
		ship.science[key] = { amount: 0, planetName: entry.planetName, planetX: entry.planetX, planetY: entry.planetY, planetColor: entry.planetColor };
	}
	ship.science[key].amount += take;
	entry.amount -= take;
	return take;
}

/** Transfer all science from a station to the ship. */
export function collectStationScience(station, ship) {
	if (!station.science) return 0;
	let collected = 0;
	for (const key in station.science) {
		const entry = station.science[key];
		if (entry.amount > 0) {
			const take = Math.floor(entry.amount);
			if (take <= 0) continue;
			if (!ship.science[key]) {
				ship.science[key] = { amount: 0, planetName: entry.planetName, planetX: entry.planetX, planetY: entry.planetY, planetColor: entry.planetColor };
			}
			ship.science[key].amount += take;
			collected += take;
			entry.amount -= take;
		}
	}
	return collected;
}

/** Check if ship has any science to give to a specific station. */
function hasScienceToGive(ship, station) {
	for (const key in ship.science) {
		if (ship.science[key].amount > 0 && !stationCollectsScience(station, key)) return true;
	}
	return false;
}

/** Check if a station already collects science for a given planet key. */
function stationCollectsScience(station, key) {
	return station.science && key in station.science;
}

/** Short summary for the give-science menu item status. */
function scienceSummary(ship, station) {
	if (!hasScienceToGive(ship, station)) return 'None';
	let total = 0;
	for (const key in ship.science) {
		if (ship.science[key].amount > 0 && !stationCollectsScience(station, key)) {
			total += ship.science[key].amount;
		}
	}
	return `${Math.floor(total)} units`;
}

/** Check if an asteroid station has mined minerals available for pickup. */
function hasMinedMinerals(station) {
	return station.onAsteroid && (station.minedMinerals || 0) > 0;
}

/** Summary of mined minerals available at an asteroid station. */
function minedMineralsSummary(station) {
	if (!hasMinedMinerals(station)) return 'None';
	const cap = STATION_MINERAL_CAP_BASE + (station.level || 1) * STATION_MINERAL_CAP_PER_LV;
	return `${Math.floor(station.minedMinerals)}/${cap}`;
}

/** Transfer mined minerals from an asteroid station to the ship. */
export function collectStationMinerals(station, ship) {
	if (!station.minedMinerals || station.minedMinerals <= 0) return 0;
	const free = shipCargoFree(ship);
	const take = Math.floor(Math.min(station.minedMinerals, free));
	if (take <= 0) return 0;
	ship.minerals += take;
	station.minedMinerals -= take;
	return take;
}

/** Short summary for the give-minerals menu item status. */
function mineralsSummary(ship) {
	if (ship.minerals <= 0) return 'None';
	return `${Math.floor(ship.minerals)} units`;
}

function hasAvailableCargo(station) {
	return station.availableCargo && station.availableCargo.length > 0;
}

function cargoPickupStatus(station, ship) {
	if (!hasAvailableCargo(station)) return 'None';
	let total = 0;
	for (const c of station.availableCargo) total += c.amount;
	const free = shipCargoFree(ship);
	if (free <= 0) return 'Hold Full';
	return `${station.availableCargo.length} dest (${Math.floor(total)} units)`;
}

/** Get science entries for the sub-menu. Returns [{ key, entry }].
 *  Excludes science the station already collects from nearby planets. */
export function getScienceEntries(ship, station) {
	const entries = [];
	for (const key in ship.science) {
		const entry = ship.science[key];
		if (entry.amount > 0 && !stationCollectsScience(station, key)) {
			entries.push({ key, entry });
		}
	}
	entries.sort((a, b) => b.entry.amount - a.entry.amount);
	return entries;
}

/** Give science from a specific entry (or all) to a station.
 *  Skips science the station already collects from nearby planets. */
export function giveScience(ship, station, key) {
	let given = 0;
	if (key === 'all') {
		for (const k in ship.science) {
			const entry = ship.science[k];
			if (entry.amount > 0 && !stationCollectsScience(station, k)) {
				given += entry.amount;
				entry.amount = 0;
			}
		}
	} else {
		const entry = ship.science[key];
		if (!entry || entry.amount <= 0 || stationCollectsScience(station, key)) return 0;
		given = entry.amount;
		entry.amount = 0;
	}
	station.storedScience += Math.floor(given);
	tryLevelUp(station);
	return given;
}

/** Give all minerals from ship to station. */
export function giveMinerals(ship, station) {
	const amount = Math.floor(ship.minerals);
	if (amount <= 0) return 0;
	ship.minerals -= amount;
	station.storedMinerals += amount;
	tryLevelUp(station);
	return amount;
}

/** Execute a menu item action. Returns true if an action was performed. */
export function executeMenuItem(itemId, station, ship) {
	switch (itemId) {
		case 'hull-repair':
			if (station.level >= STATION_HULL_REPAIR_LV && ship.hp < ship.maxHp) {
				ship.hp = ship.maxHp;
				return true;
			}
			return false;
		case 'volunteer':
			station.storedScience += STATION_VOLUNTEER_AMOUNT;
			station.storedMinerals += STATION_VOLUNTEER_AMOUNT;
			tryLevelUp(station);
			return true;
		case 'collect-science':
			ship.collectScienceMenuOpen = true;
			ship.collectScienceMenuIndex = 0;
			return true;
		case 'collect-minerals':
			collectStationMinerals(station, ship);
			return true;
		case 'give-science':
			ship.scienceMenuOpen = true;
			ship.scienceMenuIndex = 0;
			return true;
		case 'give-minerals':
			giveMinerals(ship, station);
			return true;
		case 'deliver-cargo':
			deliverCargo(ship, station);
			return true;
		case 'pick-up-cargo':
			ship.cargoMenuOpen = true;
			ship.cargoMenuIndex = 0;
			return true;
		case 'get-core':
			if (station.level >= STATION_CORE_MIN_LEVEL && !ship.hasStationCore && (station.coresAvailable || 0) > 0) {
				ship.hasStationCore = true;
				station.coresAvailable--;
				return true;
			}
			return false;
		case 'rename':
			ship.renameStationPending = true;
			return true;
		default:
			// Handle build-component-{Type} items
			if (itemId.startsWith('build-component-')) {
				const compType = itemId.slice(16);
				if (!ship.starshipComponents) ship.starshipComponents = { Structure: false, Collector: false, Engine: false, Shielding: false };
				if (!ship.starshipComponents[compType]
					&& !station.componentSold
					&& station.storedScience >= STARSHIP_COMPONENT_COST_SCI
					&& station.storedMinerals >= STARSHIP_COMPONENT_COST_MIN) {
					station.storedScience -= STARSHIP_COMPONENT_COST_SCI;
					station.storedMinerals -= STARSHIP_COMPONENT_COST_MIN;
					ship.starshipComponents[compType] = true;
					station.componentSold = true;
					return true;
				}
				return false;
			}
			// Handle upgrade-* items
			if (itemId.startsWith('upgrade-')) {
				const upgradeId = itemId.slice(8);
				return installUpgrade(upgradeId, station, ship);
			}
			return false;
	}
}

// ── Rendering ──────────────────────────────────────────────

export function renderStation(ctx, sx, sy, obj, gameTime) {
	const level = obj.level || 1;
	const sizeGrowth = 1 + (level - 1) * 0.08;
	const effectiveSize = obj.baseSize * sizeGrowth;

	const brightnessBoost = Math.min(60, (level - 1) * 12);
	const r = Math.min(255, obj.baseColor[0] + brightnessBoost);
	const g = Math.min(255, obj.baseColor[1] + brightnessBoost);
	const b = Math.min(255, obj.baseColor[2] + brightnessBoost);
	const stationColor = `rgb(${r},${g},${b})`;
	const stationDark = `rgba(${Math.floor(r * 0.5)},${Math.floor(g * 0.5)},${Math.floor(b * 0.5)},1)`;
	const windowColor = 'rgba(180,220,255,0.85)';

	// Pod dimensions — 2:1 aspect ratio like an aluminum can.
	const podLen = effectiveSize * 0.55;
	const podWid = effectiveSize * 0.26;

	// Draw a single pod centered at (0,0), long axis along local Y.
	function drawPod() {
		const halfL = podLen / 2;
		const halfW = podWid / 2;
		// Cylindrical gradient across the width — dark-light-dark suggests curvature.
		const grad = ctx.createLinearGradient(-halfW, 0, halfW, 0);
		const litR = Math.min(255, Math.round(r * 1.3 + 30));
		const litG = Math.min(255, Math.round(g * 1.3 + 30));
		const litB = Math.min(255, Math.round(b * 1.3 + 30));
		const shadowR = Math.round(r * 0.35);
		const shadowG = Math.round(g * 0.35);
		const shadowB = Math.round(b * 0.35);
		grad.addColorStop(0, `rgb(${shadowR},${shadowG},${shadowB})`);
		grad.addColorStop(0.35, `rgb(${litR},${litG},${litB})`);
		grad.addColorStop(0.7, stationColor);
		grad.addColorStop(1, `rgb(${shadowR},${shadowG},${shadowB})`);
		// Body
		ctx.fillStyle = grad;
		ctx.strokeStyle = stationDark;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(-halfW, -halfL + halfW);
		ctx.lineTo(-halfW, halfL - halfW);
		ctx.arc(0, halfL - halfW, halfW, Math.PI, 0, true); // bottom cap
		ctx.lineTo(halfW, -halfL + halfW);
		ctx.arc(0, -halfL + halfW, halfW, 0, Math.PI, true); // top cap
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		// End rims
		ctx.beginPath();
		ctx.moveTo(-halfW, -halfL + halfW);
		ctx.lineTo(halfW, -halfL + halfW);
		ctx.moveTo(-halfW, halfL - halfW);
		ctx.lineTo(halfW, halfL - halfW);
		ctx.stroke();
		// Window
		ctx.fillStyle = windowColor;
		ctx.beginPath();
		ctx.arc(0, 0, halfW * 0.45, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = stationDark;
		ctx.beginPath();
		ctx.arc(0, 0, halfW * 0.45, 0, Math.PI * 2);
		ctx.stroke();
	}

	// Draw a solar panel array extending in +X from origin.
	function drawSolarPanel(length, width) {
		ctx.fillStyle = 'rgba(40,60,120,0.9)';
		ctx.strokeStyle = stationDark;
		ctx.lineWidth = 1;
		ctx.fillRect(0, -width / 2, length, width);
		ctx.strokeRect(0, -width / 2, length, width);
		// Cell grid
		ctx.strokeStyle = 'rgba(100,140,200,0.5)';
		const cells = 4;
		for (let i = 1; i < cells; i++) {
			const x = (length / cells) * i;
			ctx.beginPath();
			ctx.moveTo(x, -width / 2);
			ctx.lineTo(x, width / 2);
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(length, 0);
		ctx.stroke();
		// Boom connecting to station
		ctx.strokeStyle = stationDark;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(-podWid / 2, 0);
		ctx.lineTo(0, 0);
		ctx.stroke();
	}

	function drawSolarPanelsAround(cx, cy) {
		const panelLen = podLen * 1.1;
		const panelWid = podWid * 0.7;
		ctx.save();
		ctx.translate(cx, cy);
		// Right
		drawSolarPanel(panelLen, panelWid);
		// Left (mirror)
		ctx.save();
		ctx.scale(-1, 1);
		drawSolarPanel(panelLen, panelWid);
		ctx.restore();
		ctx.restore();
	}

	ctx.save();
	ctx.translate(sx, sy);
	// Lv 1-2 don't rotate; Lv 3+ rotate around the ring center.
	if (level >= 3) ctx.rotate(obj.angle + gameTime * obj.spin);
	else ctx.rotate(obj.angle);

	if (level === 1) {
		drawSolarPanelsAround(0, 0);
		drawPod();
	} else if (level === 2) {
		// Two pods stacked end-to-end along Y axis. Each pod gets its own panels.
		const offset = podLen / 2;
		drawSolarPanelsAround(0, -offset);
		drawSolarPanelsAround(0, offset);
		ctx.save(); ctx.translate(0, -offset); drawPod(); ctx.restore();
		ctx.save(); ctx.translate(0, offset); drawPod(); ctx.restore();
	} else {
		// Lv 3+: ring with `level` pods evenly spaced + central core.
		const ringR = effectiveSize * 0.75;
		// Ring
		ctx.strokeStyle = stationColor;
		ctx.lineWidth = Math.max(2, podWid * 0.35);
		ctx.beginPath();
		ctx.arc(0, 0, ringR, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = stationDark;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(0, 0, ringR, 0, Math.PI * 2);
		ctx.stroke();
		// Spokes from core to ring
		ctx.strokeStyle = stationColor;
		ctx.lineWidth = 1.5;
		const spokes = Math.min(level, 4);
		for (let s = 0; s < spokes; s++) {
			const sa = (s / spokes) * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(Math.cos(sa) * ringR, Math.sin(sa) * ringR);
			ctx.stroke();
		}
		// Central core
		ctx.fillStyle = stationColor;
		ctx.beginPath();
		ctx.arc(0, 0, effectiveSize * 0.22, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = stationDark;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(0, 0, effectiveSize * 0.22, 0, Math.PI * 2);
		ctx.stroke();
		// Core window
		ctx.fillStyle = windowColor;
		ctx.beginPath();
		ctx.arc(0, 0, effectiveSize * 0.08, 0, Math.PI * 2);
		ctx.fill();
		// Pods on the ring, oriented tangentially.
		for (let p = 0; p < level; p++) {
			const pa = (p / level) * Math.PI * 2;
			const px = Math.cos(pa) * ringR;
			const py = Math.sin(pa) * ringR;
			ctx.save();
			ctx.translate(px, py);
			ctx.rotate(pa + Math.PI / 2); // tangent to ring
			drawPod();
			ctx.restore();
		}
	}

	// Blinking lights — small navigation lights at the extents.
	const lightCount = Math.min(1 + Math.floor((level - 1) / 2), 4);
	for (let li = 0; li < lightCount; li++) {
		const phase = gameTime * 3 + obj.x + li * 2.1;
		if (Math.sin(phase) > 0.3) {
			let lx = 0, ly = 0;
			if (level >= 3) {
				const la = (li / lightCount) * Math.PI * 2;
				const lr = effectiveSize * 0.75;
				lx = Math.cos(la) * lr;
				ly = Math.sin(la) * lr;
			} else {
				ly = (li % 2 === 0 ? -1 : 1) * podLen * 0.5;
			}
			ctx.fillStyle = li % 2 === 0 ? '#f44' : '#4f4';
			ctx.beginPath();
			ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	ctx.restore();

	// Name label + level badge
	ctx.fillStyle = `rgba(${TEXT_COLOR[0]},${TEXT_COLOR[1]},${TEXT_COLOR[2]},0.7)`;
	ctx.font = '11px "Courier New", monospace';
	ctx.textAlign = 'center';
	const label = level > 1 ? `${obj.name} [Lv${level}]` : obj.name;
	ctx.fillText(label, sx, sy - effectiveSize - 10);

	// Level-up progress pips: science (blue) and minerals (orange)
	const reqs = levelReqs(level);
	if (reqs) {
		const [sciNeeded, minNeeded] = reqs;
		const sciProgress = Math.min(1, obj.storedScience / sciNeeded);
		const minProgress = Math.min(1, obj.storedMinerals / minNeeded);
		const pipCount = 5;
		const pipSpacing = 5;
		const totalW = (pipCount * 2 + 1) * pipSpacing;
		const startX = sx - totalW / 2;
		const pipY = sy - effectiveSize - 2;

		// Science pips (left group)
		for (let p = 0; p < pipCount; p++) {
			const filled = p / pipCount < sciProgress;
			ctx.fillStyle = filled ? 'rgba(100,180,255,0.8)' : 'rgba(80,100,120,0.4)';
			ctx.beginPath();
			ctx.arc(startX + p * pipSpacing, pipY, 1.5, 0, Math.PI * 2);
			ctx.fill();
		}
		// Minerals pips (right group)
		const oreStartX = startX + (pipCount + 1) * pipSpacing;
		for (let p = 0; p < pipCount; p++) {
			const filled = p / pipCount < minProgress;
			ctx.fillStyle = filled ? 'rgba(220,160,60,0.8)' : 'rgba(80,100,120,0.4)';
			ctx.beginPath();
			ctx.arc(oreStartX + p * pipSpacing, pipY, 1.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	ctx.textAlign = 'start';
	obj.size = effectiveSize;
}

// ── Generation ─────────────────────────────────────────────

export function generateStation(rng, wx, wy, angle) {
	const baseSize = 20 + rng() * 30;
	const baseArms = 2 + Math.floor(rng() * 3);

	// Position-based hash for deterministic unique naming
	const posHash = simpleHash(`${Math.round(wx)},${Math.round(wy)}`);
	const basePrefix = STATION_PREFIXES.length > 0
		? STATION_PREFIXES[posHash % STATION_PREFIXES.length]
		: 'Outpost';
	const suffix = STATION_SUFFIXES[(posHash >>> 8) % STATION_SUFFIXES.length];
	const designator = DESIGNATORS[(posHash >>> 16) % DESIGNATORS.length];

	const baseColorR = 120 + Math.floor(rng() * 60);
	const baseColorG = 120 + Math.floor(rng() * 60);
	const baseColorB = 130 + Math.floor(rng() * 60);

	const station = {
		type: 'station',
		id: stationId(wx, wy),
		x: wx,
		y: wy,
		baseSize,
		size: baseSize,
		baseArms,
		arms: baseArms,
		angle,
		spin: (rng() - 0.5) * 0.15,
		baseColor: [baseColorR, baseColorG, baseColorB],
		color: `rgb(${baseColorR},${baseColorG},${baseColorB})`,
		basePrefix,
		name: `${basePrefix} ${suffix} ${designator}`,
		// Leveling — resource-based
		level: 1,
		storedScience: 0,
		storedMinerals: 0,
		coresAvailable: 0,
		totalDocks: 0,
		lastVisitTime: -9999,
		// Science — accumulated from nearby planets
		science: {},
		// Cargo
		availableCargo: [],
		lastCargoGenTime: -9999,
	};
	registerStationName(station);
	return station;
}
