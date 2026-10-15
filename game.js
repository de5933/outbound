import { ship, thrusters, explosionParts, gameTime, menuOpen, setMenuOpen, godMode, setGodMode, idealRocketMode, setIdealRocketMode, resetShip, resetShipTo, resetGameTime, setGameTime, universe, resetUniverse, zoom, setZoom } from './state.js';
import { CHUNK_SIZE, INTERSTELLAR_CHUNK_SIZE } from './constants.js';
import {
	WORLD_SEED, starLayers, clouds, generateChunk, getVisibleObjects,
	resetWorld, resetWorldPreset, worldMode, initialMap, presetSpawn, presetName, activePreset,
	getAllCachedStations, addObjectToWorld, getInterstellarVisibleObjects, getCurrentSystemLayout,
	getSystemSpawn,
} from './world.js';
import { update, requestRespawn } from './update.js';
import { clearClickRegions } from './input.js';
import { registerStationName, lookupStationName, shipFuelMax, shipO2Max, getUpgradeBonus } from './objects/station.js';
import { generateStarship, renderStarship } from './objects/starship.js';
import { renderShip, renderTrajectory, renderOrbitalVector, renderDamageFlash, renderDamageTint, renderRefuelLines } from './render-ship.js';
import { renderNebulae, renderStars, renderSpaceObjects, renderExplosion } from './render-world.js';
import {
	renderMinimap, renderHealthBar, renderFuelBar, renderLifeSupportBar,
	renderGameOver, renderInteractPrompt, renderInteractMenu, renderScienceIndicator,
	renderScienceCounter, renderInventory, renderStationCoreHUD,
} from './render-hud.js';

// --- DOM ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const speedEl = document.getElementById('speed');
const seedEl = document.getElementById('seed');
const seedLabelEl = document.getElementById('seed-label');
const menuEl = document.getElementById('menu');
const seedInput = document.getElementById('seed-input');
const seedSection = document.getElementById('seed-section');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const randomSeedBtn = document.getElementById('random-seed-btn');
const godModeToggle = document.getElementById('god-mode-toggle');
const idealRocketToggle = document.getElementById('ideal-rocket-toggle');
const mapModeSelect = document.getElementById('map-mode');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsBackBtn = document.getElementById('settings-back-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsPanel = document.getElementById('controls-panel');
const loadBtn = document.getElementById('load-btn');
const saveList = document.getElementById('save-list');
const saveStatus = document.getElementById('save-status');
const renameOverlay = document.getElementById('rename-overlay');
const renameInput = document.getElementById('rename-input');
const renameCancelBtn = document.getElementById('rename-cancel-btn');
const renameConfirmBtn = document.getElementById('rename-confirm-btn');
const gameOverEl = document.getElementById('game-over');
const deathCauseEl = document.getElementById('death-cause');
const deathButtons = document.getElementById('death-buttons');
const deathRestartBtn = document.getElementById('death-restart-btn');
const deathLoadBtn = document.getElementById('death-load-btn');
const deathStatus = document.getElementById('death-status');

function updateHudLabel() {
	if (worldMode === 'preset') {
		seedLabelEl.textContent = 'Map';
		seedEl.textContent = presetName;
	} else {
		seedLabelEl.textContent = 'Seed';
		seedEl.textContent = WORLD_SEED;
	}
}

function updateSeedSectionVisibility() {
	seedSection.style.display = mapModeSelect.value === 'procedural' ? '' : 'none';
}

seedEl.textContent = WORLD_SEED;
seedInput.value = WORLD_SEED;

function resize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// --- Menu ---

function showMenu() {
	seedInput.value = WORLD_SEED;
	mapModeSelect.value = worldMode === 'preset' ? activePreset : 'procedural';
	updateSeedSectionVisibility();
	godModeToggle.checked = godMode;
	idealRocketToggle.checked = idealRocketMode;
	controlsPanel.classList.add('hidden');
	saveList.classList.add('hidden');
	saveStatus.textContent = '';
	// Always show main panel, hide settings
	document.getElementById('menu-panel').classList.remove('hidden');
	settingsPanel.classList.add('hidden');
	menuEl.classList.remove('hidden');
	if (mapModeSelect.value === 'procedural') {
		seedInput.focus();
		seedInput.select();
	}
}

function hideMenu() {
	menuEl.classList.add('hidden');
	canvas.focus();
}

async function restartGame() {
	const mode = mapModeSelect.value;

	if (mode === 'procedural') {
		const rawSeed = seedInput.value.trim();
		const newSeed = rawSeed === '' ? Math.floor(Math.random() * 2147483647) : (parseInt(rawSeed, 10) || 0);
		// Check for existing save for this seed
		const key = saveKeyFor('procedural', newSeed);
		if (localStorage.getItem(key)) {
			const loaded = await loadGame(true, key);
			if (loaded) { updateHudLabel(); setMenuOpen(false); hideMenu(); return; }
		}
		resetWorld(newSeed);
		resetShip();
		const spawn = getSystemSpawn();
		ship.x = spawn.x;
		ship.y = spawn.y;
		ship.angle = spawn.angle;
		resetGameTime();
		seedInput.value = newSeed;
	} else {
		// Check for existing save for this preset
		const key = saveKeyFor('preset', mode);
		if (localStorage.getItem(key)) {
			const loaded = await loadGame(true, key);
			if (loaded) { updateHudLabel(); setMenuOpen(false); hideMenu(); return; }
		}
		await resetWorldPreset(mode);
		resetShipTo(presetSpawn.x, presetSpawn.y, presetSpawn.angle);
		resetGameTime();
	}

	updateHudLabel();
	setMenuOpen(false);
	hideMenu();
}

restartBtn.addEventListener('click', restartGame);

resumeBtn.addEventListener('click', () => {
	setMenuOpen(false);
	hideMenu();
});

randomSeedBtn.addEventListener('click', () => {
	seedInput.value = Math.floor(Math.random() * 2147483647);
});

godModeToggle.addEventListener('change', () => {
	setGodMode(godModeToggle.checked);
});

idealRocketToggle.addEventListener('change', () => {
	setIdealRocketMode(idealRocketToggle.checked);
});

mapModeSelect.addEventListener('change', updateSeedSectionVisibility);
mapModeSelect.addEventListener('keydown', (e) => e.stopPropagation());

settingsBtn.addEventListener('click', () => {
	document.getElementById('menu-panel').classList.add('hidden');
	settingsPanel.classList.remove('hidden');
});

settingsBackBtn.addEventListener('click', () => {
	settingsPanel.classList.add('hidden');
	document.getElementById('menu-panel').classList.remove('hidden');
});

controlsBtn.addEventListener('click', () => {
	controlsPanel.classList.toggle('hidden');
});

// --- Save / Load ---

const SAVE_KEY_PREFIX = 'outbound-save';
const AUTOSAVE_INTERVAL = 30000; // auto-save every 30 seconds

/** Get the localStorage key for the current world. */
function currentSaveKey() {
	if (worldMode === 'preset') {
		return `${SAVE_KEY_PREFIX}-preset-${activePreset}`;
	}
	return `${SAVE_KEY_PREFIX}-seed-${WORLD_SEED}`;
}

/** Get the save key for a specific world config (used before world is loaded). */
function saveKeyFor(mode, seedOrMap) {
	if (mode === 'preset') {
		return `${SAVE_KEY_PREFIX}-preset-${seedOrMap}`;
	}
	return `${SAVE_KEY_PREFIX}-seed-${seedOrMap}`;
}

function saveGame(silent) {
	// Remember which world was last played for auto-load on next visit
	localStorage.setItem(`${SAVE_KEY_PREFIX}-last`, JSON.stringify({
		worldMode,
		worldSeed: WORLD_SEED,
		presetMap: activePreset,
	}));

	const stations = getAllCachedStations();
	// Save all generated stations so level, science, and minerals are preserved
	const modifiedStations = stations.map(s => ({
		id: s.id, x: s.x, y: s.y, name: s.name, basePrefix: s.basePrefix,
		level: s.level, storedScience: s.storedScience, storedMinerals: s.storedMinerals,
		coresAvailable: s.coresAvailable || 0,
		componentSold: s.componentSold || false,
		totalDocks: s.totalDocks, lastVisitTime: s.lastVisitTime,
		availableCargo: s.availableCargo || [],
		lastCargoGenTime: s.lastCargoGenTime || -9999,
		science: s.science || {},
		// Save full generation data for dynamically deployed stations
		baseSize: s.baseSize, baseArms: s.baseArms, baseColor: s.baseColor,
		angle: s.angle, spin: s.spin, color: s.color,
		isDynamic: s.isDynamic || false,
		onAsteroid: s.onAsteroid || null,
		minedMinerals: s.minedMinerals || 0,
	}));

	const save = {
		version: 2,
		worldMode,
		worldSeed: WORLD_SEED,
		presetMap: activePreset,
		gameTime,
		godMode,
		idealRocketMode,
		universe: {
			mode: universe.mode,
			homeSystemSeed: universe.homeSystemSeed,
			homePresetMap: universe.homePresetMap || null,
			currentSystemSeed: universe.currentSystemSeed,
			currentSystemLabel: universe.currentSystemLabel,
			interstellarSeed: universe.interstellarSeed,
			starshipPlaced: universe.starshipPlaced,
			starshipX: universe.starshipX, starshipY: universe.starshipY,
			starshipAngle: universe.starshipAngle,
			interstellarX: universe.interstellarX, interstellarY: universe.interstellarY,
			interstellarVx: universe.interstellarVx, interstellarVy: universe.interstellarVy,
			interstellarAngle: universe.interstellarAngle,
			visitedSystems: universe.visitedSystems,
		},
		ship: {
			x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy,
			angle: ship.angle, angularVel: ship.angularVel,
			hp: ship.hp, fuel: ship.fuel, lifeSupport: ship.lifeSupport,
			science: ship.science, minerals: ship.minerals, cargo: ship.cargo,
			upgrades: ship.upgrades,
			starshipComponents: ship.starshipComponents,
			dockedWithRamjet: ship.dockedWithRamjet,
			hasStationCore: ship.hasStationCore,
		},
		stations: modifiedStations,
	};

	try {
		localStorage.setItem(currentSaveKey(), JSON.stringify(save));
		if (!silent) {
			saveStatus.textContent = 'Game saved!';
			saveStatus.style.color = 'rgba(100,220,160,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 3000);
		}
	} catch (e) {
		if (!silent) {
			saveStatus.textContent = 'Save failed: ' + e.message;
			saveStatus.style.color = 'rgba(255,100,100,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 3000);
		}
	}
}

async function loadGame(silent, key) {
	const raw = localStorage.getItem(key || currentSaveKey());
	if (!raw) {
		if (!silent) {
			saveStatus.textContent = 'No save found.';
			saveStatus.style.color = 'rgba(255,200,80,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 3000);
		}
		return false;
	}

	try {
		const save = JSON.parse(raw);

		// Restore world
		if (save.worldMode === 'preset' && save.presetMap) {
			await resetWorldPreset(save.presetMap);
		} else {
			resetWorld(save.worldSeed || 0);
		}

		// Restore ship
		resetShip();
		const s = save.ship;
		ship.x = s.x; ship.y = s.y;
		ship.vx = s.vx; ship.vy = s.vy;
		ship.angle = s.angle; ship.angularVel = s.angularVel;
		ship.hp = s.hp; ship.fuel = s.fuel; ship.lifeSupport = s.lifeSupport;
		ship.starshipComponents = s.starshipComponents || { Structure: false, Collector: false, Engine: false, Shielding: false };
		ship.dockedWithRamjet = s.dockedWithRamjet || false;
		ship.science = s.science || {};
		ship.minerals = s.minerals || 0;
		ship.cargo = s.cargo || [];
		ship.upgrades = s.upgrades || { hull: 0, cargo: 0, fuel: 0, o2: 0, engine: 0, rcs: 0, autoflip: 0 };
		ship.hasStationCore = s.hasStationCore || false;

		// Restore game time
		setGameTime(save.gameTime || 0);
		setGodMode(save.godMode || false);
		setIdealRocketMode(save.idealRocketMode || false);

		// Restore station state — generate chunks around saved stations, then overlay data
		for (const saved of (save.stations || [])) {
			// Register name so cargo lookups work immediately
			const sid = saved.id || `st_${Math.round(saved.x)}_${Math.round(saved.y)}`;
			registerStationName({ id: sid, name: saved.name });
			if (saved.isDynamic) {
				// Re-create dynamically deployed stations
				addObjectToWorld({
					type: 'station',
					id: saved.id || `st_${Math.round(saved.x)}_${Math.round(saved.y)}`,
					x: saved.x, y: saved.y,
					baseSize: saved.baseSize, size: saved.baseSize,
					baseArms: saved.baseArms, arms: saved.baseArms,
					angle: saved.angle, spin: saved.spin,
					baseColor: saved.baseColor,
					color: saved.color,
					basePrefix: saved.basePrefix,
					name: saved.name,
					level: saved.level,
					storedScience: saved.storedScience,
					storedMinerals: saved.storedMinerals,
					coresAvailable: saved.coresAvailable || 0,
					componentSold: saved.componentSold || false,
					totalDocks: saved.totalDocks,
					lastVisitTime: saved.lastVisitTime,
					science: saved.science || {},
					availableCargo: saved.availableCargo || [],
					lastCargoGenTime: saved.lastCargoGenTime || -9999,
					isDynamic: true,
					onAsteroid: saved.onAsteroid || null,
					minedMinerals: saved.minedMinerals || 0,
				});
			} else {
				// Find the matching station by position and overlay saved state
				const cx = Math.floor(saved.x / CHUNK_SIZE);
				const cy = Math.floor(saved.y / CHUNK_SIZE);
				const objs = generateChunk(cx, cy);
				for (const obj of objs) {
					if (obj.type === 'station' && Math.abs(obj.x - saved.x) < 1 && Math.abs(obj.y - saved.y) < 1) {
						obj.id = saved.id || `st_${Math.round(saved.x)}_${Math.round(saved.y)}`;
						obj.level = saved.level;
						obj.name = saved.name;
						obj.storedScience = saved.storedScience;
						obj.storedMinerals = saved.storedMinerals;
						obj.coresAvailable = saved.coresAvailable || 0;
						obj.componentSold = saved.componentSold || false;
						obj.totalDocks = saved.totalDocks;
						obj.lastVisitTime = saved.lastVisitTime;
						obj.science = saved.science || {};
						obj.availableCargo = saved.availableCargo || [];
						obj.lastCargoGenTime = saved.lastCargoGenTime || -9999;
						obj.onAsteroid = saved.onAsteroid || null;
						obj.minedMinerals = saved.minedMinerals || 0;
						break;
					}
				}
			}
		}

		// Restore universe state
		if (save.universe) {
			Object.assign(universe, save.universe);
		}
		// Initialize universe for older saves
		if (!universe.homeSystemSeed) {
			universe.homeSystemSeed = save.worldSeed || WORLD_SEED;
			universe.currentSystemSeed = universe.homeSystemSeed;
			universe.interstellarSeed = (universe.homeSystemSeed * 7 + 13) >>> 0;
		}

		// Re-create ramjet in the world if it was placed in the current system
		if (universe.starshipPlaced && universe.mode === 'local') {
			const ramjet = generateStarship(
				universe.starshipX || 0,
				universe.starshipY || 0,
				universe.starshipAngle || 0
			);
			addObjectToWorld(ramjet);
		}

		updateHudLabel();
		setMenuOpen(false);
		hideMenu();
		if (!silent) {
			saveStatus.textContent = 'Game loaded!';
			saveStatus.style.color = 'rgba(100,220,160,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 3000);
		}
		return true;
	} catch (e) {
		if (!silent) {
			saveStatus.textContent = 'Load failed: ' + e.message;
			saveStatus.style.color = 'rgba(255,100,100,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 3000);
		}
		return false;
	}
}

loadBtn.addEventListener('click', () => {
	if (saveList.classList.contains('hidden')) {
		populateSaveList();
		saveList.classList.remove('hidden');
	} else {
		saveList.classList.add('hidden');
	}
});

/** Build the save list from localStorage entries. */
function populateSaveList() {
	saveList.innerHTML = '';
	const prefix = SAVE_KEY_PREFIX;
	const keys = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key.startsWith(prefix) && key !== `${prefix}-last`) {
			keys.push(key);
		}
	}
	if (keys.length === 0) {
		saveList.innerHTML = '<div style="font-size:11px;color:rgba(180,200,220,0.5);padding:6px 0;text-align:center;">No saves found</div>';
		return;
	}
	keys.sort();
	for (const key of keys) {
		const entry = document.createElement('div');
		entry.className = 'save-entry';

		// Parse display name from key
		let displayName = key.replace(`${prefix}-`, '');
		displayName = displayName.replace('seed-', 'Seed ').replace('preset-', 'Map: ');

		const nameSpan = document.createElement('span');
		nameSpan.className = 'save-name';
		nameSpan.textContent = displayName;
		nameSpan.addEventListener('click', async () => {
			const loaded = await loadGame(false, key);
			if (loaded) saveList.classList.add('hidden');
		});

		const deleteSpan = document.createElement('span');
		deleteSpan.className = 'save-delete';
		deleteSpan.textContent = '\u2715';
		deleteSpan.title = 'Delete save';
		deleteSpan.addEventListener('click', (e) => {
			e.stopPropagation();
			localStorage.removeItem(key);
			populateSaveList();
			saveStatus.textContent = 'Save deleted.';
			saveStatus.style.color = 'rgba(255,200,80,0.8)';
			setTimeout(() => { saveStatus.textContent = ''; }, 2000);
		});

		entry.appendChild(nameSpan);
		entry.appendChild(deleteSpan);
		saveList.appendChild(entry);
	}
}

// --- Rename station ---

function showRenameDialog() {
	if (!ship.interactStation) return;
	renameInput.value = ship.interactStation.name;
	renameOverlay.classList.remove('hidden');
	renameInput.focus();
	renameInput.select();
}

function hideRenameDialog() {
	renameOverlay.classList.add('hidden');
	ship.renameStationPending = false;
	canvas.focus();
}

function confirmRename() {
	const newName = renameInput.value.trim();
	if (newName && ship.interactStation) {
		ship.interactStation.name = newName;
		registerStationName(ship.interactStation);
	}
	hideRenameDialog();
}

renameCancelBtn.addEventListener('click', hideRenameDialog);
renameConfirmBtn.addEventListener('click', confirmRename);
renameInput.addEventListener('keydown', (e) => {
	e.stopPropagation();
	if (e.key === 'Enter') confirmRename();
	if (e.key === 'Escape') hideRenameDialog();
});

// Allow Enter in seed input to restart
seedInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		restartGame();
	}
	// Stop game input from firing while typing
	e.stopPropagation();
});

// --- Initial load ---

async function init() {
	let loaded = false;
	const hasUrlSeed = new URLSearchParams(window.location.search).has('seed');

	if (initialMap) {
		// URL specifies a preset map — check for save
		const key = saveKeyFor('preset', initialMap);
		if (localStorage.getItem(key)) {
			loaded = await loadGame(true, key);
		}
		if (!loaded) {
			mapModeSelect.value = initialMap;
			await resetWorldPreset(initialMap);
			resetShipTo(presetSpawn.x, presetSpawn.y, presetSpawn.angle);
			resetGameTime();
		}
	} else if (hasUrlSeed) {
		// URL specifies a seed — check for save with this seed
		const key = saveKeyFor('procedural', WORLD_SEED);
		if (localStorage.getItem(key)) {
			loaded = await loadGame(true, key);
		}
	} else {
		// No URL params — try to load the last-played world
		try {
			const lastRaw = localStorage.getItem(`${SAVE_KEY_PREFIX}-last`);
			if (lastRaw) {
				const last = JSON.parse(lastRaw);
				const key = last.worldMode === 'preset'
					? saveKeyFor('preset', last.presetMap)
					: saveKeyFor('procedural', last.worldSeed);
				if (localStorage.getItem(key)) {
					loaded = await loadGame(true, key);
				}
			}
		} catch (e) { /* ignore corrupt last-played data */ }
	}

	// A new procedural world has no saved position, and the ship's default (0, 0) is inside the primary star
	if (!loaded && worldMode !== 'preset') {
		const spawn = getSystemSpawn();
		resetShipTo(spawn.x, spawn.y, spawn.angle);
	}

	// Initialize universe seed if not already set (new game)
	if (!universe.homeSystemSeed) {
		universe.homeSystemSeed = WORLD_SEED;
		universe.currentSystemSeed = WORLD_SEED;
		universe.interstellarSeed = (WORLD_SEED * 7 + 13) >>> 0;
		// Track if home is a preset map
		if (worldMode === 'preset' && activePreset) {
			universe.homePresetMap = activePreset;
		}
	}

	updateHudLabel();

	// Auto-save at regular intervals
	// Skip while dead, or the save would capture the wreck and Load would restore a dead ship
	setInterval(() => {
		if (ship.dead) return;
		saveGame(true);
		autosaveNotifyTime = 2;
	}, AUTOSAVE_INTERVAL);

	requestAnimationFrame(loop);
}

// --- Autosave notification ---
let autosaveNotifyTime = 0;

// --- Main draw ---

function draw() {
	clearClickRegions();
	const cx = canvas.width / 2;
	const cy = canvas.height / 2;
	const z = zoom || 1;

	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Apply zoom transform for world rendering
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(z, z);
	ctx.translate(-cx, -cy);

	if (universe.mode === 'interstellar') {
		// Interstellar draw — stars only, simplified HUD
		renderStars(ctx, cx, cy, starLayers, ship);
		const visibleObjects = getInterstellarVisibleObjects(canvas, ship);
		renderSpaceObjects(ctx, cx, cy, visibleObjects, ship, gameTime);
		// Render the ramjet as the player's vessel
		renderStarship(ctx, cx, cy, { angle: ship.angle, x: ship.x, y: ship.y, name: '', thrusting: thrusters.mainDrive, showDockedShip: true }, gameTime);

		// Velocity vector
		const vLen = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
		if (vLen > 1) {
			const vScale = Math.min(150, vLen * 0.8);
			const vx = (ship.vx / vLen) * vScale;
			const vy = (ship.vy / vLen) * vScale;
			// Line
			ctx.strokeStyle = 'rgba(255,180,220,0.4)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(cx + vx, cy + vy);
			ctx.stroke();
			// Arrowhead
			const aLen = 8;
			const aAngle = Math.atan2(vy, vx);
			ctx.fillStyle = 'rgba(255,180,220,0.5)';
			ctx.beginPath();
			ctx.moveTo(cx + vx, cy + vy);
			ctx.lineTo(cx + vx - Math.cos(aAngle - 0.4) * aLen, cy + vy - Math.sin(aAngle - 0.4) * aLen);
			ctx.lineTo(cx + vx - Math.cos(aAngle + 0.4) * aLen, cy + vy - Math.sin(aAngle + 0.4) * aLen);
			ctx.closePath();
			ctx.fill();
		}

		ctx.restore(); // end zoom transform

		// Interstellar HUD — velocity and nearest star
		const vel = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
		ctx.font = 'bold 14px "Courier New", monospace';
		ctx.fillStyle = 'rgba(180,200,220,0.8)';
		ctx.textAlign = 'left';
		ctx.fillText(`Interstellar Space`, 16, 20);
		ctx.font = '12px "Courier New", monospace';
		ctx.fillText(`Velocity: ${vel.toFixed(1)}`, 16, 40);
		if (universe.nearStar) {
			const dx = universe.nearStar.x - ship.x;
			const dy = universe.nearStar.y - ship.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			ctx.fillText(`Nearest: ${universe.nearStar.name} (${Math.floor(dist)})`, 16, 58);
			if (dist < (universe.nearStar.radius || 30) + 300 && vel < 50) {
				const pulse = 0.6 + Math.sin(gameTime * 4) * 0.2;
				ctx.fillStyle = `rgba(180,220,255,${pulse})`;
				ctx.font = '13px "Courier New", monospace';
				ctx.textAlign = 'center';
				ctx.fillText(`[F] Visit ${universe.nearStar.name}`, cx, cy - 50);
				ctx.textAlign = 'start';
			}
		}

		// System label
		ctx.font = '11px "Courier New", monospace';
		ctx.fillStyle = 'rgba(180,200,220,0.5)';
		ctx.textAlign = 'center';
		ctx.fillText('RAMSCOOP ACTIVE', cx, canvas.height - 20);
		ctx.textAlign = 'start';

		renderInventory(ctx, canvas, ship, gameTime);
	} else {
		// Normal local draw
		renderNebulae(ctx, cx, cy, clouds, ship);
		renderStars(ctx, cx, cy, starLayers, ship);

		const visibleObjects = getVisibleObjects(canvas, ship);
		renderRefuelLines(ctx, cx, cy, ship, gameTime);
		renderSpaceObjects(ctx, cx, cy, visibleObjects, ship, gameTime);

		// System boundary circle
		const sysLayout = getCurrentSystemLayout();
		if (sysLayout) {
			const bx = cx - ship.x;
			const by = cy - ship.y;
			const bRadius = sysLayout.radius;
			const distFromCenter = Math.sqrt(ship.x * ship.x + ship.y * ship.y);
			// Only render if boundary is on screen (within ~2 radii)
			if (distFromCenter > bRadius - canvas.width) {
				const alpha = Math.min(0.4, (distFromCenter / bRadius) * 0.4);
				ctx.strokeStyle = `rgba(100,140,200,${alpha})`;
				ctx.lineWidth = 2;
				ctx.setLineDash([20, 15]);
				ctx.beginPath();
				ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
				ctx.stroke();
				ctx.setLineDash([]);
			}
			// Warning overlay when near/beyond boundary
			if (distFromCenter > bRadius * 0.9) {
				const warningAlpha = Math.min(0.3, (distFromCenter - bRadius * 0.9) / (bRadius * 0.2));
				ctx.fillStyle = `rgba(200,50,50,${warningAlpha})`;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}
		}

		if (ship.dead) {
			if (ship.deathCause === 'VESSEL DESTROYED') {
				renderExplosion(ctx, cx, cy, explosionParts, ship, gameTime);
			} else {
				renderShip(ctx, cx, cy, ship, thrusters);
			}
			renderGameOver(ctx, cx, cy, ship);
		} else {
			renderExplosion(ctx, cx, cy, explosionParts, ship, gameTime);
			renderTrajectory(ctx, cx, cy, ship, visibleObjects);
			renderOrbitalVector(ctx, cx, cy, ship, visibleObjects);
			if (ship.dockedWithRamjet) {
				renderStarship(ctx, cx, cy, { angle: ship.angle, x: ship.x, y: ship.y, name: '', thrusting: thrusters.mainDrive, showDockedShip: false }, gameTime);
			}
			renderDamageFlash(ctx, cx, cy, ship, z);
			renderShip(ctx, cx, cy, ship, thrusters);
			renderDamageTint(ctx, cx, cy, ship, gameTime);
		}

		ctx.restore(); // end zoom transform

		renderScienceCounter(ctx, cx, cy, ship, gameTime, z);

		renderMinimap(ctx, canvas, visibleObjects, ship, generateChunk);
		renderHealthBar(ctx, canvas, ship);
		renderFuelBar(ctx, canvas, ship);
		renderLifeSupportBar(ctx, canvas, ship);
		renderScienceIndicator(ctx, canvas, ship, visibleObjects, gameTime);
		renderInteractPrompt(ctx, cx, cy, ship, gameTime);
		renderInteractMenu(ctx, canvas, ship, gameTime);
		renderInventory(ctx, canvas, ship, gameTime);
		renderStationCoreHUD(ctx, canvas, ship, gameTime);

		// Show system label if not home
		if (universe.currentSystemLabel && universe.currentSystemLabel !== 'Home') {
			ctx.font = '12px "Courier New", monospace';
			ctx.fillStyle = 'rgba(180,200,220,0.6)';
			ctx.textAlign = 'center';
			ctx.fillText(`System: ${universe.currentSystemLabel}`, cx, 20);
			ctx.textAlign = 'start';
		}
	}

	// Debug: chunk borders
	if (showChunkBorders) {
		const chunkSz = universe.mode === 'interstellar' ? INTERSTELLAR_CHUNK_SIZE : CHUNK_SIZE;
		const halfW = canvas.width / 2;
		const halfH = canvas.height / 2;
		const minCX = Math.floor((ship.x - halfW) / chunkSz);
		const maxCX = Math.floor((ship.x + halfW) / chunkSz);
		const minCY = Math.floor((ship.y - halfH) / chunkSz);
		const maxCY = Math.floor((ship.y + halfH) / chunkSz);
		ctx.strokeStyle = 'rgba(255,255,0,0.15)';
		ctx.lineWidth = 1;
		ctx.font = '9px "Courier New", monospace';
		ctx.fillStyle = 'rgba(255,255,0,0.25)';
		ctx.textAlign = 'left';
		for (let ccx = minCX; ccx <= maxCX + 1; ccx++) {
			const sx = halfW + ccx * chunkSz - ship.x;
			ctx.beginPath();
			ctx.moveTo(sx, 0);
			ctx.lineTo(sx, canvas.height);
			ctx.stroke();
		}
		for (let ccy = minCY; ccy <= maxCY + 1; ccy++) {
			const sy = halfH + ccy * chunkSz - ship.y;
			ctx.beginPath();
			ctx.moveTo(0, sy);
			ctx.lineTo(canvas.width, sy);
			ctx.stroke();
		}
		for (let ccx = minCX; ccx <= maxCX; ccx++) {
			for (let ccy = minCY; ccy <= maxCY; ccy++) {
				const lx = halfW + ccx * chunkSz - ship.x + 4;
				const ly = halfH + ccy * chunkSz - ship.y + 12;
				ctx.fillText(`${ccx},${ccy}`, lx, ly);
			}
		}
	}

	// Autosave notification
	if (autosaveNotifyTime > 0) {
		const alpha = Math.min(1, autosaveNotifyTime);
		ctx.font = '11px "Courier New", monospace';
		ctx.textAlign = 'right';
		ctx.fillStyle = `rgba(180,200,220,${alpha * 0.5})`;
		ctx.fillText('saved', canvas.width - 16, canvas.height - 16);
		ctx.textAlign = 'start';
		autosaveNotifyTime -= 1 / 60; // approximate frame-based decay
	}
}

// --- Game over ---

let gameOverShown = false;
let deathButtonsShown = false;

function syncGameOver() {
	// Matches the old canvas panel's timing: fade in after 0.8s, buttons at 1.5s
	const show = ship.dead && ship.deathTime > 0.8;
	if (show !== gameOverShown) {
		gameOverShown = show;
		gameOverEl.classList.toggle('hidden', !show);
		if (show) {
			deathCauseEl.textContent = ship.deathCause;
			deathStatus.textContent = '';
			deathLoadBtn.disabled = !localStorage.getItem(currentSaveKey());
			deathLoadBtn.title = deathLoadBtn.disabled ? 'No save for this world' : '';
		}
	}
	if (show) gameOverEl.style.opacity = Math.min(1, (ship.deathTime - 0.8) / 0.5);

	const showButtons = show && ship.deathTime > 1.5;
	if (showButtons !== deathButtonsShown) {
		deathButtonsShown = showButtons;
		deathButtons.classList.toggle('hidden', !showButtons);
	}
}

deathRestartBtn.addEventListener('click', () => {
	requestRespawn();
	// Drop focus so Space (main drive) doesn't re-click the button
	deathRestartBtn.blur();
});

deathLoadBtn.addEventListener('click', async () => {
	deathLoadBtn.blur();
	const loaded = await loadGame(true);
	if (!loaded) {
		deathStatus.textContent = 'Load failed.';
		deathStatus.style.color = 'rgba(255,100,100,0.8)';
	}
});

// Sync menu visibility with state each frame
let wasMenuOpen = false;

function loop(now) {
	// Check for rename request
	if (ship.renameStationPending) {
		ship.renameStationPending = false;
		showRenameDialog();
	}

	update(now, canvas, speedEl);
	syncGameOver();

	if (menuOpen !== wasMenuOpen) {
		if (menuOpen) showMenu();
		else hideMenu();
		wasMenuOpen = menuOpen;
	}

	draw();
	requestAnimationFrame(loop);
}

init();

// ── Debug flags ──
let showChunkBorders = false;

// ── Cheat Commands (available in browser dev console as window.cheat.*) ──

window.cheat = {
	refuel() {
		ship.fuel = shipFuelMax(ship);
		return 'Fuel filled.';
	},
	refillO2() {
		ship.lifeSupport = shipO2Max(ship);
		return 'O2 filled.';
	},
	repair() {
		ship.hp = ship.maxHp;
		return `Hull repaired to ${ship.maxHp}.`;
	},
	fillAll() {
		ship.fuel = shipFuelMax(ship);
		ship.lifeSupport = shipO2Max(ship);
		ship.hp = ship.maxHp;
		return 'Fuel, O2, and Hull filled.';
	},
	addMinerals(amount = 50) {
		ship.minerals += amount;
		return `Added ${amount} minerals. Total: ${Math.floor(ship.minerals)}`;
	},
	addScience(planetName = 'Cheat', amount = 50) {
		const key = `cheat_${planetName}`;
		if (!ship.science[key]) {
			ship.science[key] = { amount: 0, planetName, planetX: ship.x, planetY: ship.y, planetColor: 'rgb(180,140,255)' };
		}
		ship.science[key].amount += amount;
		return `Added ${amount} science for "${planetName}". Total: ${Math.floor(ship.science[key].amount)}`;
	},
	addStationCore() {
		ship.hasStationCore = true;
		return 'Station Core added to inventory.';
	},
	addComponent(name) {
		const valid = ['Structure', 'Collector', 'Engine', 'Shielding'];
		if (!name) {
			valid.forEach(c => { ship.starshipComponents[c] = true; });
			return 'All ramjet components added: ' + valid.join(', ');
		}
		if (!valid.includes(name)) return `Invalid component. Valid: ${valid.join(', ')}`;
		ship.starshipComponents[name] = true;
		return `${name} component added.`;
	},
	spawnRamjet() {
		const ramjet = generateStarship(ship.x + 150, ship.y, ship.angle);
		addObjectToWorld(ramjet);
		universe.starshipPlaced = true;
		universe.starshipX = ramjet.x;
		universe.starshipY = ramjet.y;
		universe.starshipAngle = ramjet.angle;
		return `Ramjet spawned at (${Math.round(ramjet.x)}, ${Math.round(ramjet.y)}).`;
	},
	godMode(on) {
		if (on === undefined) on = !godMode;
		setGodMode(on);
		return `God mode: ${on ? 'ON' : 'OFF'}`;
	},
	levelStation(level = 5) {
		if (!ship.nearStation || ship.nearStation.type !== 'station') return 'Not near a station.';
		const st = ship.nearStation;
		st.level = level;
		return `${st.name} set to level ${level}.`;
	},
	tp(x, y) {
		ship.x = x; ship.y = y;
		ship.vx = 0; ship.vy = 0;
		return `Teleported to (${x}, ${y}).`;
	},
	setZoom(z) {
		setZoom(z);
		return `Zoom set to ${zoom.toFixed(2)}`;
	},
	chunks(on) {
		if (on === undefined) showChunkBorders = !showChunkBorders;
		else showChunkBorders = !!on;
		return `Chunk borders: ${showChunkBorders ? 'ON' : 'OFF'}`;
	},
	clearAllSaves() {
		localStorage.clear();
		location.reload();
		return 'All saves cleared. Reloading...';
	},
	help() {
		return [
			'cheat.refuel()          — Fill fuel',
			'cheat.refillO2()        — Fill O2',
			'cheat.repair()          — Repair hull',
			'cheat.fillAll()         — Fill fuel, O2, hull',
			'cheat.addMinerals(n)    — Add n minerals (default 50)',
			'cheat.addScience(name,n)— Add n science (default 50)',
			'cheat.addStationCore()  — Add station core',
			'cheat.addComponent(name)— Add ramjet part (or all if no name)',
			'cheat.spawnRamjet()     — Spawn ramjet near ship',
			'cheat.godMode(bool)     — Toggle god mode',
			'cheat.levelStation(n)   — Set nearest station to level n',
			'cheat.tp(x, y)          — Teleport to coordinates',
			'cheat.setZoom(z)        — Set camera zoom',
			'cheat.chunks()          — Toggle chunk borders',
			'cheat.clearAllSaves()   — Delete all saves and reload',
			'cheat.help()            — Show this list',
		].join('\n');
	},
};

console.log('Console commands:\n' + window.cheat.help());
