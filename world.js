import {
	CHUNK_SIZE,
	GRAVITY_RANGE_MULT,
	STAR_FIELD,
	CLOUD_FIELD,
	CLOUD_COUNT,
	CLOUD_HUES,
	INTERSTELLAR_CHUNK_SIZE, INTERSTELLAR_STAR_DENSITY,
	SYSTEM_RADIUS, SYSTEM_MAX_COMPANION_STARS,
	SYSTEM_COMPANION_MIN_DIST, SYSTEM_COMPANION_MAX_DIST,
} from './constants.js';
import { universe, zoom } from './state.js';
import { generateAsteroid } from './objects/asteroid.js';
import { generatePlanet } from './objects/planet.js';
import { generateStation } from './objects/station.js';
import { generateDebris } from './objects/debris.js';
import { generateStarship } from './objects/starship.js';
import {
	loadPresetMap, getPresetChunkObjects, getPresetVisibleObjects,
	presetSpawn, activePreset, presetName, addPresetObject, getAllPresetStations,
} from './preset-map.js';

// Seeded RNG for deterministic procedural generation
export function mulberry32(seed) {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// World mode: 'procedural' or 'preset'
export let worldMode = 'procedural';

// World seed from URL parameter, default to random
const urlParams = new URLSearchParams(window.location.search);
export let WORLD_SEED = urlParams.has('seed')
	? parseInt(urlParams.get('seed'), 10) || 0
	: Math.floor(Math.random() * 2147483647);

// Check for ?map= parameter — will be loaded async in game.js init
export const initialMap = urlParams.get('map') || null;

// Update URL to show current seed without reloading (only if no map param)
if (!initialMap && !urlParams.has('seed')) {
	history.replaceState(null, '', `?seed=${WORLD_SEED}`);
}

// Stars in multiple parallax layers
export const starLayers = [
	{ parallax: 0.05, count: 3000, maxSize: 0.8, maxBright: 0.3 },
	{ parallax: 0.15, count: 2500, maxSize: 1.0, maxBright: 0.5 },
	{ parallax: 0.3, count: 2000, maxSize: 1.5, maxBright: 0.7 },
	{ parallax: 0.5, count: 1000, maxSize: 2.0, maxBright: 0.9 },
	{ parallax: 0.7, count: 400, maxSize: 2.5, maxBright: 1.0 },
];
for (const layer of starLayers) {
	layer.stars = [];
	for (let i = 0; i < layer.count; i++) {
		layer.stars.push({
			x: Math.random() * STAR_FIELD - STAR_FIELD / 2,
			y: Math.random() * STAR_FIELD - STAR_FIELD / 2,
			size: Math.random() * layer.maxSize + 0.3,
			brightness: Math.random() * layer.maxBright + 0.1,
		});
	}
}

// Space clouds — dim nebula blobs at the deepest parallax layer
export const clouds = [];
{
	const cloudRng = mulberry32(WORLD_SEED ^ 0xdeadbeef);
	for (let i = 0; i < CLOUD_COUNT; i++) {
		const h = CLOUD_HUES[Math.floor(cloudRng() * CLOUD_HUES.length)];
		clouds.push({
			x: cloudRng() * CLOUD_FIELD - CLOUD_FIELD / 2,
			y: cloudRng() * CLOUD_FIELD - CLOUD_FIELD / 2,
			radius: 300 + cloudRng() * 400,
			color: h,
			alpha: 1,
			blobs: Array.from({ length: 3 + Math.floor(cloudRng() * 4) }, () => ({
				ox: (cloudRng() - 0.5) * 250,
				oy: (cloudRng() - 0.5) * 250,
				r: 100 + cloudRng() * 200,
			})),
		});
	}
}

function regenerateClouds() {
	clouds.length = 0;
	const cloudRng = mulberry32(WORLD_SEED ^ 0xdeadbeef);
	for (let i = 0; i < CLOUD_COUNT; i++) {
		const h = CLOUD_HUES[Math.floor(cloudRng() * CLOUD_HUES.length)];
		clouds.push({
			x: cloudRng() * CLOUD_FIELD - CLOUD_FIELD / 2,
			y: cloudRng() * CLOUD_FIELD - CLOUD_FIELD / 2,
			radius: 300 + cloudRng() * 400,
			color: h,
			alpha: 1,
			blobs: Array.from({ length: 3 + Math.floor(cloudRng() * 4) }, () => ({
				ox: (cloudRng() - 0.5) * 250,
				oy: (cloudRng() - 0.5) * 250,
				r: 100 + cloudRng() * 200,
			})),
		});
	}
}

function regenerateStars() {
	for (const layer of starLayers) {
		layer.stars = [];
		for (let i = 0; i < layer.count; i++) {
			layer.stars.push({
				x: Math.random() * STAR_FIELD - STAR_FIELD / 2,
				y: Math.random() * STAR_FIELD - STAR_FIELD / 2,
				size: Math.random() * layer.maxSize + 0.3,
				brightness: Math.random() * layer.maxBright + 0.1,
			});
		}
	}
}

export function resetWorld(seed) {
	worldMode = 'procedural';
	WORLD_SEED = seed;
	history.replaceState(null, '', `?seed=${WORLD_SEED}`);
	// Clear chunk cache and system layout
	for (const key in chunkCache) delete chunkCache[key];
	systemLayout = null;
	systemLayoutSeed = null;
	regenerateClouds();
	regenerateStars();
}

export async function resetWorldPreset(mapName) {
	await loadPresetMap(mapName);
	worldMode = 'preset';
	history.replaceState(null, '', `?map=${mapName}`);
	regenerateClouds();
	regenerateStars();
}

export { presetSpawn, activePreset, presetName };

// Generate a chunk of space objects for a given grid cell
const chunkCache = {};

function chunkKey(cx, cy) {
	return cx + ',' + cy;
}

// ── Star System Layout ─────────────────────────────────────
// Generated once per seed — describes star positions for the current system.
let systemLayout = null;
let systemLayoutSeed = null;

function getSystemLayout() {
	if (systemLayoutSeed === WORLD_SEED && systemLayout) return systemLayout;
	const rng = mulberry32(WORLD_SEED ^ 0xABCD1234);

	const stars = [{ x: 0, y: 0, radius: 100 + rng() * 60 }]; // primary star at origin

	// Companion stars
	const companionCount = Math.floor(rng() * (SYSTEM_MAX_COMPANION_STARS + 1));
	for (let i = 0; i < companionCount; i++) {
		const dist = SYSTEM_COMPANION_MIN_DIST + rng() * (SYSTEM_COMPANION_MAX_DIST - SYSTEM_COMPANION_MIN_DIST);
		const angle = rng() * Math.PI * 2;
		stars.push({
			x: Math.cos(angle) * dist,
			y: Math.sin(angle) * dist,
			radius: 40 + rng() * 40,
		});
	}

	systemLayout = { stars, radius: SYSTEM_RADIUS };
	systemLayoutSeed = WORLD_SEED;
	return systemLayout;
}

/** Return the first planet or star whose gravity field contains (x, y), or null. */
function gravityFieldAt(x, y) {
	const maxGravRange = 180 * GRAVITY_RANGE_MULT;
	const minCX = Math.floor((x - maxGravRange) / CHUNK_SIZE);
	const maxCX = Math.floor((x + maxGravRange) / CHUNK_SIZE);
	const minCY = Math.floor((y - maxGravRange) / CHUNK_SIZE);
	const maxCY = Math.floor((y + maxGravRange) / CHUNK_SIZE);
	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			for (const obj of generateChunk(cx, cy)) {
				if (obj.type !== 'planet') continue;
				const range = obj.radius * GRAVITY_RANGE_MULT;
				if (Math.hypot(obj.x - x, obj.y - y) <= range) return { x: obj.x, y: obj.y, range };
			}
		}
	}
	return null;
}

/** Get a safe spawn position: the first point on the +X axis outside every gravity field. */
export function getSystemSpawn() {
	if (worldMode === 'preset') return { x: 0, y: 0, angle: -Math.PI / 2 };
	let spawnX = 0;
	let field;
	while ((field = gravityFieldAt(spawnX, 0))) {
		// Jump to where this field's edge crosses the X axis on the far side. Fields can
		// overlap, so the new point is checked again; the +1 steps just past the edge.
		spawnX = field.x + Math.sqrt(field.range * field.range - field.y * field.y) + 1;
	}
	return { x: spawnX, y: 0, angle: -Math.PI / 2 };
}

/** Get the system layout (exported for rendering the boundary). */
export function getCurrentSystemLayout() {
	if (worldMode === 'preset') return null;
	return getSystemLayout();
}

export function generateChunk(cx, cy) {
	if (worldMode === 'preset') {
		return getPresetChunkObjects(cx, cy);
	}

	const key = chunkKey(cx, cy);
	if (chunkCache[key]) return chunkCache[key];

	const rng = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ WORLD_SEED);
	const objects = [];
	const layout = getSystemLayout();

	// Chunk center
	const chunkCenterX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
	const chunkCenterY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;

	// Distance from chunk center to nearest star
	let nearestStarDist = Infinity;
	for (const star of layout.stars) {
		const dx = chunkCenterX - star.x;
		const dy = chunkCenterY - star.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < nearestStarDist) nearestStarDist = dist;
	}

	// Outside system boundary — no objects
	if (nearestStarDist > layout.radius) {
		chunkCache[key] = objects;
		return objects;
	}

	// Density falls off with distance from nearest star
	// density: 1.0 at star surface, ~0.1 at system edge
	const densityFactor = Math.max(0.05, 1 - (nearestStarDist / layout.radius) * 0.9);
	const maxObjects = Math.floor(rng() * 4 * densityFactor) + (densityFactor > 0.3 ? 1 : 0);

	// Generate system stars in this chunk (if they fall here)
	for (const star of layout.stars) {
		const scx = Math.floor(star.x / CHUNK_SIZE);
		const scy = Math.floor(star.y / CHUNK_SIZE);
		if (scx === cx && scy === cy) {
			// Generate the star as a large hot planet (rendered distinctively)
			const starR = star.radius;
			const brightness = 0.8 + rng() * 0.2;
			objects.push({
				type: 'planet',
				x: star.x,
				y: star.y,
				radius: starR,
				color1: `rgb(255,${200 + Math.floor(rng() * 55)},${80 + Math.floor(rng() * 80)})`,
				color2: `rgb(${200 + Math.floor(rng() * 55)},${140 + Math.floor(rng() * 60)},${20 + Math.floor(rng() * 40)})`,
				rings: false,
				angle: 0,
				name: star === layout.stars[0] ? 'Primary' : `Companion ${layout.stars.indexOf(star)}`,
				isStar: true,
			});
		}
	}

	for (let i = 0; i < maxObjects; i++) {
		const type = rng();
		const wx = cx * CHUNK_SIZE + rng() * CHUNK_SIZE;
		const wy = cy * CHUNK_SIZE + rng() * CHUNK_SIZE;
		const angle = rng() * Math.PI * 2;

		// Don't place objects on top of system stars
		let tooCloseToStar = false;
		for (const star of layout.stars) {
			const dx = wx - star.x;
			const dy = wy - star.y;
			if (Math.sqrt(dx * dx + dy * dy) < star.radius * 2) {
				tooCloseToStar = true;
				break;
			}
		}
		if (tooCloseToStar) continue;

		if (type < 0.5) {
			objects.push(generateAsteroid(rng, wx, wy, angle));
		} else if (type < 0.7) {
			objects.push(generatePlanet(rng, wx, wy, angle));
		} else if (type < 0.85) {
			if (!universe.homeSystemSeed || WORLD_SEED === universe.homeSystemSeed) {
				objects.push(generateStation(rng, wx, wy, angle));
			} else {
				objects.push(generateAsteroid(rng, wx, wy, angle));
			}
		} else {
			objects.push(generateDebris(rng, wx, wy));
		}
	}

	chunkCache[key] = objects;
	return objects;
}

/** Get all stations from the current world. Used for save game. */
export function getAllCachedStations() {
	if (worldMode === 'preset') {
		return getAllPresetStations();
	}
	const stations = [];
	for (const key in chunkCache) {
		for (const obj of chunkCache[key]) {
			if (obj.type === 'station') stations.push(obj);
		}
	}
	return stations;
}

// ── Interstellar ───────────────────────────────────────────

const interstellarChunkCache = {};

const STAR_PREFIXES = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Theta','Kappa','Lambda','Sigma','Tau','Omega','Proxima','Barnard','Luyten','Kapteyn','Lacaille','Groombridge','Kruger','Ross','Wolf','Lalande','Gliese','Kepler','Trappist','Vega','Altair','Fomalhaut','Pollux','Arcturus','Deneb','Rigel','Spica','Antares','Aldebaran','Regulus','Canopus','Achernar','Betelgeuse','Sirius'];
const STAR_SUFFIXES = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','Prime','Minor','Major'];
const SPECTRAL_COLORS = [
	{ color1: 'rgb(255,220,180)', color2: 'rgb(255,180,100)' }, // G (yellow)
	{ color1: 'rgb(255,200,150)', color2: 'rgb(255,150,80)' },  // K (orange)
	{ color1: 'rgb(255,140,100)', color2: 'rgb(200,80,40)' },   // M (red)
	{ color1: 'rgb(200,220,255)', color2: 'rgb(150,180,255)' }, // A (white-blue)
	{ color1: 'rgb(180,200,255)', color2: 'rgb(120,150,255)' }, // B (blue)
	{ color1: 'rgb(255,255,230)', color2: 'rgb(255,240,180)' }, // F (yellow-white)
];

function generateInterstellarChunk(cx, cy) {
	const key = cx + ',' + cy;
	if (interstellarChunkCache[key]) return interstellarChunkCache[key];

	const rng = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ (universe.interstellarSeed || 42));
	const objects = [];

	const count = rng() < INTERSTELLAR_STAR_DENSITY ? 1 : 0;
	for (let i = 0; i < count; i++) {
		const wx = cx * INTERSTELLAR_CHUNK_SIZE + rng() * INTERSTELLAR_CHUNK_SIZE;
		const wy = cy * INTERSTELLAR_CHUNK_SIZE + rng() * INTERSTELLAR_CHUNK_SIZE;
		const radius = 5 + rng() * 10;
		const spectral = SPECTRAL_COLORS[Math.floor(rng() * SPECTRAL_COLORS.length)];
		const prefix = STAR_PREFIXES[Math.floor(rng() * STAR_PREFIXES.length)];
		const suffix = STAR_SUFFIXES[Math.floor(rng() * STAR_SUFFIXES.length)];
		const name = suffix ? `${prefix} ${suffix}` : prefix;
		// Deterministic system seed from position
		const systemSeed = ((Math.round(wx) * 73856) ^ (Math.round(wy) * 19349)) >>> 0;

		objects.push({
			type: 'interstellar-star',
			x: wx, y: wy,
			radius,
			color1: spectral.color1,
			color2: spectral.color2,
			brightness: 0.6 + rng() * 0.4,
			name,
			systemSeed,
		});
	}

	interstellarChunkCache[key] = objects;
	return objects;
}

// Home star — always at interstellar origin
const HOME_STAR = {
	type: 'interstellar-star',
	x: 0, y: 0,
	radius: 12,
	color1: 'rgb(255,230,100)',
	color2: 'rgb(255,200,50)',
	brightness: 1.0,
	name: 'Home',
	systemSeed: 0, // will be set to homeSystemSeed on init
	isHome: true,
};

/** Get interstellar objects visible on screen. */
export function getInterstellarVisibleObjects(canvas, ship) {
	const z = Math.max(0.15, zoom || 1);
	const scanRange = Math.max(canvas.width / 2 / z + 200, canvas.height / 2 / z + 200, INTERSTELLAR_CHUNK_SIZE * 1.5);
	const minCX = Math.floor((ship.x - scanRange) / INTERSTELLAR_CHUNK_SIZE);
	const maxCX = Math.floor((ship.x + scanRange) / INTERSTELLAR_CHUNK_SIZE);
	const minCY = Math.floor((ship.y - scanRange) / INTERSTELLAR_CHUNK_SIZE);
	const maxCY = Math.floor((ship.y + scanRange) / INTERSTELLAR_CHUNK_SIZE);
	const halfW = canvas.width / 2 / z + 200;
	const halfH = canvas.height / 2 / z + 200;

	const visible = [];
	// Always include home star
	HOME_STAR.systemSeed = universe.homeSystemSeed || 0;
	const hsx = HOME_STAR.x - ship.x;
	const hsy = HOME_STAR.y - ship.y;
	if (Math.abs(hsx) < halfW + HOME_STAR.radius && Math.abs(hsy) < halfH + HOME_STAR.radius) {
		visible.push(HOME_STAR);
	}

	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			const objs = generateInterstellarChunk(cx, cy);
			for (const obj of objs) {
				const sx = obj.x - ship.x;
				const sy = obj.y - ship.y;
				if (Math.abs(sx) < halfW + obj.radius && Math.abs(sy) < halfH + obj.radius) {
					visible.push(obj);
				}
			}
		}
	}
	return visible;
}

/** Generate interstellar chunk for a given cell (used by update for proximity checks). */
export function generateInterstellarChunkAt(cx, cy) {
	return generateInterstellarChunk(cx, cy);
}

/** Get the home star object (for proximity checks that include it). */
export function getHomeStar() {
	HOME_STAR.systemSeed = universe.homeSystemSeed || 0;
	return HOME_STAR;
}

/** Save current system state and switch to a new system. */
/** Save the current system's state to visitedSystems. */
function saveCurrentSystem() {
	if (universe.currentSystemSeed == null) return;
	universe.visitedSystems[universe.currentSystemSeed] = {
		stations: getAllCachedStations().map(s => ({
			id: s.id, x: s.x, y: s.y, name: s.name, basePrefix: s.basePrefix,
			level: s.level, storedScience: s.storedScience, storedMinerals: s.storedMinerals,
			coresAvailable: s.coresAvailable || 0, componentSold: s.componentSold || false,
			totalDocks: s.totalDocks, lastVisitTime: s.lastVisitTime,
			availableCargo: s.availableCargo || [],
			lastCargoGenTime: s.lastCargoGenTime || -9999,
			science: s.science || {},
			isDynamic: s.isDynamic || false,
			onAsteroid: s.onAsteroid || null,
			minedMinerals: s.minedMinerals || 0,
			baseSize: s.baseSize, baseArms: s.baseArms, baseColor: s.baseColor,
			angle: s.angle, spin: s.spin, color: s.color,
		})),
		starshipX: universe.starshipX,
		starshipY: universe.starshipY,
		starshipAngle: universe.starshipAngle,
		starshipPlaced: universe.starshipPlaced,
	};
}

export async function switchToSystem(seed, label) {
	saveCurrentSystem();

	// Switch to new system — use preset loader if returning to a preset home
	if (seed === universe.homeSystemSeed && universe.homePresetMap) {
		await loadPresetMap(universe.homePresetMap);
		worldMode = 'preset';
		history.replaceState(null, '', `?map=${universe.homePresetMap}`);
		regenerateClouds();
		regenerateStars();
	} else {
		resetWorld(seed);
	}
	universe.currentSystemSeed = seed;
	universe.currentSystemLabel = label || (seed === universe.homeSystemSeed ? 'Home' : `System ${seed}`);
	universe.mode = 'local';

	// Restore saved state if previously visited
	const saved = universe.visitedSystems[seed];
	if (saved) {
		universe.starshipPlaced = saved.starshipPlaced || false;
		universe.starshipX = saved.starshipX || 0;
		universe.starshipY = saved.starshipY || 0;
		universe.starshipAngle = saved.starshipAngle || 0;
		// Restore station state
		for (const st of saved.stations || []) {
			if (st.isDynamic) {
				addObjectToWorld({
					type: 'station', id: st.id, x: st.x, y: st.y,
					baseSize: st.baseSize, size: st.baseSize,
					baseArms: st.baseArms, arms: st.baseArms,
					angle: st.angle, spin: st.spin,
					baseColor: st.baseColor, color: st.color,
					basePrefix: st.basePrefix, name: st.name,
					level: st.level, storedScience: st.storedScience,
					storedMinerals: st.storedMinerals,
					coresAvailable: st.coresAvailable || 0, componentSold: st.componentSold || false,
					totalDocks: st.totalDocks, lastVisitTime: st.lastVisitTime,
					science: st.science || {},
					availableCargo: st.availableCargo || [],
					lastCargoGenTime: st.lastCargoGenTime || -9999,
					isDynamic: true,
					onAsteroid: st.onAsteroid || null,
					minedMinerals: st.minedMinerals || 0,
				});
			} else {
				const ccx = Math.floor(st.x / CHUNK_SIZE);
				const ccy = Math.floor(st.y / CHUNK_SIZE);
				const objs = generateChunk(ccx, ccy);
				for (const obj of objs) {
					if (obj.type === 'station' && Math.abs(obj.x - st.x) < 1 && Math.abs(obj.y - st.y) < 1) {
						Object.assign(obj, {
							id: st.id, level: st.level, name: st.name,
							storedScience: st.storedScience, storedMinerals: st.storedMinerals,
							coresAvailable: st.coresAvailable || 0, componentSold: st.componentSold || false,
							totalDocks: st.totalDocks, lastVisitTime: st.lastVisitTime,
							science: st.science || {},
							availableCargo: st.availableCargo || [],
							lastCargoGenTime: st.lastCargoGenTime || -9999,
							onAsteroid: st.onAsteroid || null,
							minedMinerals: st.minedMinerals || 0,
						});
						break;
					}
				}
			}
		}
		// Re-create ramjet if it was placed in this system
		if (saved.starshipPlaced) {
			const ramjet = generateStarship(
				saved.starshipX || 0,
				saved.starshipY || 0,
				saved.starshipAngle || 0
			);
			addObjectToWorld(ramjet);
		}
	}
}

/** Switch to interstellar mode. */
export function switchToInterstellar() {
	// Save current system state (synchronous — no need to reload)
	saveCurrentSystem();
	universe.mode = 'interstellar';
	// Clear local chunk cache
	for (const key in chunkCache) delete chunkCache[key];
}

// Add a dynamically created object into the correct chunk
export function addObjectToWorld(obj) {
	if (worldMode === 'preset') {
		addPresetObject(obj);
	} else {
		const cx = Math.floor(obj.x / CHUNK_SIZE);
		const cy = Math.floor(obj.y / CHUNK_SIZE);
		const key = chunkKey(cx, cy);
		// Ensure the chunk is generated first so we append to the existing array
		generateChunk(cx, cy);
		chunkCache[key].push(obj);
	}
}

// Collect all visible space objects
export function getVisibleObjects(canvas, ship) {
	if (worldMode === 'preset') {
		return getPresetVisibleObjects(canvas, ship);
	}

	const z = Math.max(0.15, zoom || 1);
	const halfW = canvas.width / 2 / z + 200;
	const halfH = canvas.height / 2 / z + 200;
	const minCX = Math.floor((ship.x - halfW) / CHUNK_SIZE);
	const maxCX = Math.floor((ship.x + halfW) / CHUNK_SIZE);
	const minCY = Math.floor((ship.y - halfH) / CHUNK_SIZE);
	const maxCY = Math.floor((ship.y + halfH) / CHUNK_SIZE);

	const visible = [];
	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			const objs = generateChunk(cx, cy);
			for (const obj of objs) {
				const sx = obj.x - ship.x;
				const sy = obj.y - ship.y;
				const r = obj.radius || obj.size || 60;
				if (Math.abs(sx) < halfW + r && Math.abs(sy) < halfH + r) {
					visible.push(obj);
				}
			}
		}
	}
	return visible;
}
