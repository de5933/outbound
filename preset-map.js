import { CHUNK_SIZE } from './constants.js';
import { mulberry32 } from './world.js';
import { registerStationName } from './objects/station.js';
import { zoom } from './state.js';

// Loaded preset state
let presetObjects = [];
let presetChunkCache = {};
export let presetSpawn = { x: 0, y: 0, angle: -Math.PI / 2 };
export let activePreset = null;
export let presetName = '';

// Load and hydrate a preset map from JSON
export async function loadPresetMap(name) {
	const resp = await fetch(`maps/${name}.json`);
	const data = await resp.json();

	presetObjects = data.objects.map(hydrate);
	presetSpawn = data.spawn || { x: 0, y: 0, angle: -Math.PI / 2 };
	presetName = data.name || name;
	activePreset = name;

	// Bucket objects into chunks for generateChunk compatibility
	presetChunkCache = {};
	for (const obj of presetObjects) {
		const cx = Math.floor(obj.x / CHUNK_SIZE);
		const cy = Math.floor(obj.y / CHUNK_SIZE);
		const key = cx + ',' + cy;
		if (!presetChunkCache[key]) presetChunkCache[key] = [];
		presetChunkCache[key].push(obj);
	}
}

// Return preset objects in a given chunk (matches generateChunk signature)
export function getPresetChunkObjects(cx, cy) {
	const key = cx + ',' + cy;
	if (!presetChunkCache[key]) presetChunkCache[key] = [];
	return presetChunkCache[key];
}

// Add a dynamic object to the preset world
export function addPresetObject(obj) {
	presetObjects.push(obj);
	const cx = Math.floor(obj.x / CHUNK_SIZE);
	const cy = Math.floor(obj.y / CHUNK_SIZE);
	const key = cx + ',' + cy;
	if (!presetChunkCache[key]) presetChunkCache[key] = [];
	presetChunkCache[key].push(obj);
}

// Get all preset stations (for save game)
export function getAllPresetStations() {
	return presetObjects.filter(obj => obj.type === 'station');
}

// Filter all preset objects to those visible on screen
export function getPresetVisibleObjects(canvas, ship) {
	const z = Math.max(0.15, zoom || 1);
	const halfW = canvas.width / 2 / z + 200;
	const halfH = canvas.height / 2 / z + 200;
	const visible = [];
	for (const obj of presetObjects) {
		const sx = obj.x - ship.x;
		const sy = obj.y - ship.y;
		const r = obj.radius || obj.size || 60;
		if (Math.abs(sx) < halfW + r && Math.abs(sy) < halfH + r) {
			visible.push(obj);
		}
	}
	return visible;
}

// Hydrate a JSON object into the render-ready shape expected by the game
function hydrate(raw) {
	switch (raw.type) {
		case 'planet':
			return hydratePlanet(raw);
		case 'station':
			return hydrateStation(raw);
		case 'asteroid':
			return hydrateAsteroid(raw);
		case 'debris':
			return hydrateDebris(raw);
		default:
			return raw;
	}
}

function hydratePlanet(raw) {
	return {
		type: 'planet',
		x: raw.x,
		y: raw.y,
		radius: raw.radius,
		color1: raw.color1,
		color2: raw.color2,
		rings: raw.rings || false,
		ringColor: raw.ringColor || 'rgba(180,170,150,0.3)',
		ringTilt: raw.ringTilt || 0.3,
		angle: raw.angle || 0,
		name: raw.name || '',
	};
}

function hydrateStation(raw) {
	const baseSize = raw.size || 25;
	const baseArms = raw.arms || 3;
	const name = raw.name || 'Station';
	// Extract prefix from name (everything before last space)
	const lastSpace = name.lastIndexOf(' ');
	const basePrefix = lastSpace > 0 ? name.substring(0, lastSpace) : name;
	// Parse base color from color string or use defaults
	const colorMatch = (raw.color || '').match(/(\d+),(\d+),(\d+)/);
	const baseColor = colorMatch
		? [parseInt(colorMatch[1]), parseInt(colorMatch[2]), parseInt(colorMatch[3])]
		: [160, 160, 180];
	const station = {
		type: 'station',
		id: `st_${Math.round(raw.x)}_${Math.round(raw.y)}`,
		x: raw.x,
		y: raw.y,
		baseSize,
		size: baseSize,
		baseArms,
		arms: baseArms,
		angle: raw.angle || 0,
		spin: raw.spin || 0.05,
		baseColor,
		color: raw.color || 'rgb(160,160,180)',
		basePrefix,
		name,
		level: raw.level || 1,
		storedScience: raw.storedScience || 0,
		storedMinerals: raw.storedMinerals || 0,
		coresAvailable: raw.coresAvailable || 0,
		totalDocks: 0,
		lastVisitTime: -9999,
		science: {},
		availableCargo: [],
		lastCargoGenTime: -9999,
	};
	registerStationName(station);
	return station;
}

function hydrateAsteroid(raw) {
	const radius = raw.radius || 20;
	// Generate verts deterministically from position if not provided
	const verts = raw.verts || generateVerts(raw.x, raw.y, radius);
	const shade = 60;
	return {
		type: 'asteroid',
		x: raw.x,
		y: raw.y,
		radius,
		verts,
		angle: raw.angle || 0,
		spin: raw.spin || 0,
		color: raw.color || `rgb(${shade + 20},${shade + 10},${shade})`,
	};
}

function hydrateDebris(raw) {
	return {
		type: 'debris',
		x: raw.x,
		y: raw.y,
		pieces: raw.pieces || [],
	};
}

function generateVerts(x, y, radius) {
	const rng = mulberry32(Math.floor(x * 73856093) ^ Math.floor(y * 19349663));
	const verts = [];
	const n = 7 + Math.floor(rng() * 5);
	for (let j = 0; j < n; j++) {
		const a = (j / n) * Math.PI * 2;
		const r = radius * (0.7 + rng() * 0.5);
		verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
	}
	return verts;
}
