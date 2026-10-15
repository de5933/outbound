import { SHIP_LENGTH, SHIP_WIDTH, SHIP_MAX_HP, FUEL_MAX, LIFE_SUPPORT_MAX } from './constants.js';

// Camera zoom (1.0 = default, lower = zoomed out, higher = zoomed in)
export let zoom = 1.0;
export function setZoom(z) { zoom = Math.max(0.15, Math.min(3.0, z)); }

export const ship = {
	x: 0,
	y: 0,
	vx: 0,
	vy: 0,
	angle: -Math.PI / 2,
	angularVel: 0,
	length: SHIP_LENGTH,
	width: SHIP_WIDTH,
	hp: SHIP_MAX_HP,
	maxHp: SHIP_MAX_HP,
	fuel: FUEL_MAX,
	lifeSupport: LIFE_SUPPORT_MAX,
	dead: false,
	deathTime: 0,
	deathCause: '',
	refueling: false,
	refuelStations: [], // stations currently pumping fuel into the ship
	interacting: false,
	interactStation: null,
	nearStation: null, // closest station in range
	menuIndex: 0,     // selected menu item index while docked
	science: {},      // { "planetKey": { amount, planetName, planetX, planetY } }
	minerals: 0,           // total minerals carried
	cargo: [],             // [{ destId, destName, destX, destY, originId, originName, originX, originY, amount }]
	renameStationPending: false,
	stationSubMenu: null,   // category id when a sub-menu is open (e.g. 'cat-services')
	subMenuIndex: 0,        // selected index within the sub-menu
	scienceMenuOpen: false,
	scienceMenuIndex: 0,
	collectScienceMenuOpen: false,
	collectScienceMenuIndex: 0,
	cargoMenuOpen: false,
	cargoMenuIndex: 0,
	gatheringMinerals: false, // true when near an asteroid/debris collecting minerals
	// Inventory
	inventoryOpen: false,
	inventoryIndex: 0,      // selected item index in the hold section
	// Upgrades — count of each installed
	upgrades: { hull: 0, cargo: 0, fuel: 0, o2: 0, engine: 0, rcs: 0, autoflip: 0 },
	autoFlipping: false, // true while auto-flip is actively rotating the ship
	// Starship components
	starshipComponents: { Structure: false, Collector: false, Engine: false, Shielding: false },
	dockedWithRamjet: false, // true when the ramjet is attached to the ship
	// Station Core
	hasStationCore: false,
	deployConfirm: false,   // true when showing deploy confirmation
	deployMessage: '',      // feedback message (success/failure)
	deployMessageTime: 0,   // time remaining on the message
};

// Universe state — tracks multi-system progression
export const universe = {
	mode: 'local',              // 'local' | 'interstellar'
	homeSystemSeed: null,       // set on game start
	homePresetMap: null,        // preset map name if home is a preset (e.g. 'solar-system')
	currentSystemSeed: null,    // current local system seed
	currentSystemLabel: 'Home',
	interstellarSeed: 0,        // seed for the interstellar star field
	starshipPlaced: false,      // true once ramjet is assembled and placed in world
	starshipX: 0,
	starshipY: 0,
	starshipAngle: 0,
	interstellarX: 0,
	interstellarY: 0,
	interstellarVx: 0,
	interstellarVy: 0,
	interstellarAngle: 0,
	visitedSystems: {},         // { [seed]: { stations: [...], starshipX, starshipY, ... } }
	nearStar: null,             // closest interstellar star in visit range
};

export function resetUniverse() {
	universe.mode = 'local';
	universe.homeSystemSeed = null;
	universe.homePresetMap = null;
	universe.currentSystemSeed = null;
	universe.currentSystemLabel = 'Home';
	universe.interstellarSeed = 0;
	universe.starshipPlaced = false;
	universe.starshipX = 0;
	universe.starshipY = 0;
	universe.starshipAngle = 0;
	universe.interstellarX = 0;
	universe.interstellarY = 0;
	universe.interstellarVx = 0;
	universe.interstellarVy = 0;
	universe.interstellarAngle = 0;
	universe.visitedSystems = {};
	universe.nearStar = null;
}

// Active thruster flags — set in update(), read in draw()
export const thrusters = {
	rearFwd: false, // W — rear thrusters pushing forward
	frontBrk: false, // S — front thrusters pushing backward
	rightL: false, // A — right-side thrusters pushing left
	leftR: false, // D — left-side thrusters pushing right
	rotateCCW: false, // Q
	rotateCW: false, // E
	mainDrive: false, // SPACE
	// X kill — reuses the above flags based on velocity
};

// Explosion particles
export const explosionParts = [];

export let godMode = false;

export function setGodMode(on) {
	godMode = on;
}

export let idealRocketMode = false;

export function setIdealRocketMode(on) {
	idealRocketMode = on;
}

export let menuOpen = false;

export function setMenuOpen(open) {
	menuOpen = open;
}

export let gameTime = 0;

export function advanceGameTime(dt) {
	gameTime += dt;
}

export function setGameTime(t) {
	gameTime = t;
}

export function resetGameTime() {
	gameTime = 0;
}

export function resetShip() {
	ship.x = 0;
	ship.y = 0;
	ship.vx = 0;
	ship.vy = 0;
	ship.angle = -Math.PI / 2;
	ship.angularVel = 0;
	ship.hp = ship.maxHp;
	ship.fuel = FUEL_MAX;
	ship.lifeSupport = LIFE_SUPPORT_MAX;
	ship.dead = false;
	ship.deathTime = 0;
	ship.deathCause = '';
	ship.refueling = false;
	ship.refuelStations = [];
	ship.interacting = false;
	ship.interactStation = null;
	ship.nearStation = null;
	ship.menuIndex = 0;
	ship.science = {};
	ship.minerals = 0;
	ship.cargo = [];
	ship.gatheringMinerals = false;
	ship.inventoryOpen = false;
	ship.inventoryIndex = 0;
	ship.stationSubMenu = null;
	ship.subMenuIndex = 0;
	ship.scienceMenuOpen = false;
	ship.scienceMenuIndex = 0;
	ship.collectScienceMenuOpen = false;
	ship.collectScienceMenuIndex = 0;
	ship.cargoMenuOpen = false;
	ship.cargoMenuIndex = 0;
	ship.upgrades = { hull: 0, cargo: 0, fuel: 0, o2: 0, engine: 0, rcs: 0, autoflip: 0 };
	ship.autoFlipping = false;
	ship.starshipComponents = { Structure: false, Collector: false, Engine: false, Shielding: false };
	ship.dockedWithRamjet = false;
	ship.hasStationCore = false;
	ship.deployConfirm = false;
	ship.deployMessage = '';
	ship.deployMessageTime = 0;
	explosionParts.length = 0;
}

export function resetShipTo(x, y, angle) {
	resetShip();
	ship.x = x;
	ship.y = y;
	ship.angle = angle;
}

export function spawnExplosion() {
	for (let i = 0; i < 60; i++) {
		const a = Math.random() * Math.PI * 2;
		const speed = 30 + Math.random() * 150;
		const hue =
			Math.random() < 0.5
				? `rgb(255,${Math.floor(100 + Math.random() * 155)},${Math.floor(Math.random() * 60)})`
				: `rgb(255,${Math.floor(200 + Math.random() * 55)},${Math.floor(100 + Math.random() * 100)})`;
		explosionParts.push({
			x: ship.x + (Math.random() - 0.5) * ship.length,
			y: ship.y + (Math.random() - 0.5) * ship.width,
			vx: Math.cos(a) * speed + ship.vx * 0.3,
			vy: Math.sin(a) * speed + ship.vy * 0.3,
			size: 2 + Math.random() * 4,
			life: 1.5 + Math.random() * 1.5,
			maxLife: 3,
			color: hue,
		});
	}
	// Add some larger debris chunks
	for (let i = 0; i < 12; i++) {
		const a = Math.random() * Math.PI * 2;
		const speed = 20 + Math.random() * 80;
		explosionParts.push({
			x: ship.x + (Math.random() - 0.5) * ship.length,
			y: ship.y + (Math.random() - 0.5) * ship.width,
			vx: Math.cos(a) * speed + ship.vx * 0.3,
			vy: Math.sin(a) * speed + ship.vy * 0.3,
			size: 3 + Math.random() * 5,
			life: 2 + Math.random() * 2,
			maxLife: 4,
			color: `rgb(${80 + Math.floor(Math.random() * 60)},${80 + Math.floor(Math.random() * 60)},${90 + Math.floor(Math.random() * 60)})`,
			spin: (Math.random() - 0.5) * 8,
			isChunk: true,
		});
	}
}
