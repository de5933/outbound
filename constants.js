// Ship
export const SHIP_LENGTH = 55;
export const SHIP_WIDTH = 16;
export const SHIP_MAX_HP = 100;

// Physics
export const SHIP_DRY_MASS = 1;          // ship mass without propellant (unit mass)
export const SHIP_MASS_RATIO = 3;        // wet/dry mass ratio (ideal rocket mode)
export const EXHAUST_VELOCITY = 300;     // effective exhaust velocity (m/s)
export const RCS_FORCE = 120;
export const RCS_TORQUE = 5;
export const MAIN_DRIVE_FORCE = 400;

// Gravity
export const GRAVITY_STRENGTH = 512;
export const GRAVITY_RANGE_MULT = 8;

// Planet damage & drag
export const PLANET_DPS_BASE = 60;
export const PLANET_DPS_DEPTH = 512;
export const PLANET_DRAG_BASE = 2;
export const PLANET_DRAG_DEPTH = 12;

// Debris damage
export const DEBRIS_DPS = 8;

// Fuel
export const FUEL_MAX = 100;
export const RCS_FUEL_RATE = 4; // fuel/s per RCS thruster pair
export const ROTATION_FUEL_RATE = 3; // fuel/s for rotation
export const MAIN_DRIVE_FUEL_RATE = 12; // fuel/s for main drive
export const REFUEL_RATE = 20; // fuel/s when near a station
export const REFUEL_RANGE = 60; // distance to station center for refueling

// Interaction
export const INTERACT_RANGE = 60; // distance to station center for interaction

// Life support
export const LIFE_SUPPORT_MAX = 100;
export const LIFE_SUPPORT_DRAIN = 0.75; // per second
export const LIFE_SUPPORT_NO_FUEL_MULT = 20; // O2 drain multiplier when fuel is empty
export const LIFE_SUPPORT_REFILL = 10; // per second when near a station

// World generation
export const CHUNK_SIZE = 2000;
export const STAR_FIELD = 4000;
export const CLOUD_PARALLAX = 0.02;
export const CLOUD_FIELD = 6000;
export const CLOUD_COUNT = 30;
export const CLOUD_HUES = [
	[40, 20, 80], // purple
	[20, 40, 80], // blue
	[80, 20, 40], // red
	[20, 60, 60], // teal
	[60, 40, 20], // amber
];

// Station leveling — requires both science AND minerals to level up
// Each entry is [scienceNeeded, mineralsNeeded] for level 2, 3, 4, ...
export const STATION_LEVEL_REQS = [
	[50, 30], // Lv 1 → 2
	[120, 80], // Lv 2 → 3
	[250, 180], // Lv 3 → 4
	[500, 350], // Lv 4 → 5
	[800, 600], // Lv 5 → 6
	[1200, 900], // Lv 6 → 7
	[1800, 1400], // Lv 7 → 8
	[2500, 2000], // Lv 8 → 9
	[3500, 3000], // Lv 9 → 10
];
export const STATION_VOLUNTEER_AMOUNT = 2; // science + minerals gained per volunteer action
export const STATION_HULL_REPAIR_LV = 2; // level required for hull repair
export const STATION_HULL_REPAIR_RATE = 8; // HP/s
export const STATION_REMOTE_REFUEL_LV = 3; // level required for proximity refueling
export const STATION_REMOTE_O2_LV = 4; // level required for proximity life support

// Science
export const SCIENCE_COLLECT_RATE = 5; // max units/s at planet surface

// Minerals
export const MINERAL_COLLECT_RATE = 3; // max units/s at asteroid surface
export const MINERAL_COLLECT_RANGE = 80; // distance from asteroid center to collect
export const MINERAL_DEBRIS_RATE = 6; // max units/s from debris fields (2x asteroids)
export const MINERAL_DEBRIS_RANGE = 100; // distance from debris center to collect
export const STATION_MINERAL_CAP_BASE = 30; // base overflow mineral cap for asteroid stations
export const STATION_MINERAL_CAP_PER_LV = 20; // additional overflow cap per level

// Cargo
export const CARGO_CAPACITY = 100; // ship max hold (minerals + cargo combined)
export const CARGO_SEARCH_RANGE = 8000; // range to find destination stations for cargo gen
export const CARGO_GEN_INTERVAL = 60; // seconds between cargo regeneration
export const CARGO_BASE_PER_DEST = 5; // base cargo amount per destination at level 1
export const CARGO_LEVEL_MULT = 3; // additional cargo per station level
export const CARGO_MAX_DESTS_BASE = 1; // max destinations at level 1
export const CARGO_MAX_DESTS_PER_LV = 1; // additional destinations per level
export const CARGO_DELIVERY_DIST_SCALE = 3000; // distance for 1x bonus on delivery reward
export const CARGO_DELIVERY_BASE_SCI = 5; // base science reward per delivery
export const CARGO_DELIVERY_BASE_MIN = 5; // base minerals reward per delivery

// Station Core
export const STATION_CORE_MIN_LEVEL = 5; // station level required to obtain a core
export const STATION_CORE_MIN_DIST = 500; // minimum distance from other stations to deploy
export const STATION_CORE_PLANET_CLEARANCE = 50; // extra clearance beyond planet/asteroid radius

// Ship Upgrades — each can be installed multiple times with diminishing returns
// baseCost: mineral cost for 1st install; costMult: cost multiplier per additional install
// baseEffect: effect of 1st install; effectDecay: multiplier on effect per additional install
// minLevel: station level required; maxPerLv: max installs = maxPerLv * stationLevel (capped at 9)
export const SHIP_UPGRADES = [
	{
		id: 'hull',
		name: 'Hull Plating',
		baseCost: 15,
		costMult: 1.5,
		baseEffect: 25,
		effectDecay: 0.7,
		minLevel: 2,
		maxPerLv: 1,
	},
	{
		id: 'cargo',
		name: 'Cargo Bay',
		baseCost: 20,
		costMult: 1.5,
		baseEffect: 20,
		effectDecay: 0.7,
		minLevel: 2,
		maxPerLv: 1,
	},
	{
		id: 'fuel',
		name: 'Fuel Tank',
		baseCost: 12,
		costMult: 1.4,
		baseEffect: 25,
		effectDecay: 0.7,
		minLevel: 2,
		maxPerLv: 1,
	},
	{
		id: 'o2',
		name: 'Life Support',
		baseCost: 12,
		costMult: 1.4,
		baseEffect: 25,
		effectDecay: 0.7,
		minLevel: 3,
		maxPerLv: 1,
	},
	{
		id: 'engine',
		name: 'Engine Boost',
		baseCost: 25,
		costMult: 1.8,
		baseEffect: 80,
		effectDecay: 0.65,
		minLevel: 3,
		maxPerLv: 1,
	},
	{
		id: 'rcs',
		name: 'RCS Thrusters',
		baseCost: 20,
		costMult: 1.6,
		baseEffect: 24,
		effectDecay: 0.65,
		minLevel: 3,
		maxPerLv: 1,
	},
	{
		id: 'autoflip',
		name: 'Auto Flip',
		baseCost: 60,
		costMult: 1,
		baseEffect: 1,
		effectDecay: 1,
		minLevel: 3,
		maxPerLv: 1,
	},
];

// Starship Components
export const STARSHIP_COMPONENT_MIN_LEVEL = 7;
export const STARSHIP_COMPONENT_TYPES = [
	'Structure',
	'Collector',
	'Engine',
	'Shielding',
];
export const STARSHIP_COMPONENT_COST_SCI = 500;
export const STARSHIP_COMPONENT_COST_MIN = 400;

// Interstellar Physics
export const INTERSTELLAR_THRUST = 20;
export const INTERSTELLAR_ROTATION_SPEED = 1.5;
export const INTERSTELLAR_CHUNK_SIZE = 500;
export const INTERSTELLAR_STAR_DENSITY = 0.5; // probability of a star per chunk (0-1)
export const INTERSTELLAR_STAR_VISIT_RANGE = 300;
export const INTERSTELLAR_STAR_VISIT_MAX_VEL = 50;

// Bussard Ramjet
export const RAMJET_LENGTH = 120;
export const RAMJET_WIDTH = 35;
export const RAMJET_SCOOP_RADIUS = 60;
export const RAMJET_MASS_MULT = 3; // ship acceleration divided by this when hauling ramjet

// Star System Structure
export const SYSTEM_RADIUS = 12000;             // radius of the system boundary circle
export const SYSTEM_BOUNDARY_GRAVITY = 800;     // gravity force beyond the boundary
export const SYSTEM_BOUNDARY_FADE = 2000;       // distance over which boundary gravity ramps up
export const SYSTEM_MAX_COMPANION_STARS = 2;    // max additional stars orbiting the primary
export const SYSTEM_COMPANION_MIN_DIST = 3000;  // min orbit radius for companion stars
export const SYSTEM_COMPANION_MAX_DIST = 6000;  // max orbit radius for companion stars

// Text color — base RGB used for all rendered text
export const TEXT_COLOR = [180, 200, 220];

// HUD
export const MINIMAP_SIZE = 160;
export const MINIMAP_PADDING = 16;
export const MINIMAP_RANGE = 3000;
export const HB_WIDTH = 200;
export const HB_HEIGHT = 10;
export const VELOCITY_LINE_MAX = 300;
