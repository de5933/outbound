import {
	SHIP_MAX_HP, SHIP_DRY_MASS, SHIP_MASS_RATIO, RCS_FORCE, RCS_TORQUE, MAIN_DRIVE_FORCE,
	GRAVITY_STRENGTH, GRAVITY_RANGE_MULT, CHUNK_SIZE,
	FUEL_MAX, RCS_FUEL_RATE, ROTATION_FUEL_RATE, MAIN_DRIVE_FUEL_RATE,
	REFUEL_RATE, REFUEL_RANGE, INTERACT_RANGE,
	LIFE_SUPPORT_MAX, LIFE_SUPPORT_DRAIN, LIFE_SUPPORT_NO_FUEL_MULT,
	PLANET_DPS_BASE, PLANET_DPS_DEPTH, PLANET_DRAG_BASE, PLANET_DRAG_DEPTH,
	DEBRIS_DPS,
	STATION_HULL_REPAIR_LV, STATION_HULL_REPAIR_RATE,
	STATION_REMOTE_REFUEL_LV, STATION_REMOTE_O2_LV,
	SCIENCE_COLLECT_RATE, MINERAL_COLLECT_RATE, MINERAL_COLLECT_RANGE,
	MINERAL_DEBRIS_RATE, MINERAL_DEBRIS_RANGE, CARGO_CAPACITY,
	STATION_MINERAL_CAP_BASE, STATION_MINERAL_CAP_PER_LV,
	CARGO_SEARCH_RANGE, CARGO_GEN_INTERVAL,
	STATION_CORE_MIN_DIST, STATION_CORE_PLANET_CLEARANCE, RAMJET_MASS_MULT,
	SYSTEM_BOUNDARY_GRAVITY, SYSTEM_BOUNDARY_FADE,
	INTERSTELLAR_THRUST, INTERSTELLAR_ROTATION_SPEED,
	INTERSTELLAR_CHUNK_SIZE, INTERSTELLAR_STAR_VISIT_RANGE, INTERSTELLAR_STAR_VISIT_MAX_VEL,
} from './constants.js';
import { keys, justPressed, consumeWheelDelta, processMouse } from './input.js';
import { ship, thrusters, explosionParts, menuOpen, setMenuOpen, godMode, idealRocketMode, advanceGameTime, gameTime, spawnExplosion, universe, zoom, setZoom } from './state.js';
import { generateChunk, worldMode, presetSpawn, addObjectToWorld, mulberry32, generateInterstellarChunkAt, getHomeStar, switchToSystem, switchToInterstellar, getCurrentSystemLayout, getSystemSpawn } from './world.js';
import { generateStarship } from './objects/starship.js';
import { getStationMenuItems, executeMenuItem, getScienceEntries, giveScience, generateStation, generateStationCargo, shipCargoUsed, pickUpCargoItem, shipCargoFree, levelReqs, tryLevelUp, getUpgradeBonus, getStationScienceEntries, collectStationScienceEntry, stationMaxDockSpeed } from './objects/station.js';

let lastTime = performance.now();

/** Check if a number key (1-9) was just pressed. Returns the number (1-based) or -1. */
function checkNumberKey() {
	for (let n = 1; n <= 9; n++) {
		if (justPressed[`Digit${n}`]) return n;
	}
	return -1;
}

// Set by the game-over Restart button; consumed on the next death-state update
let respawnRequested = false;

export function requestRespawn() {
	respawnRequested = true;
}

export function update(now, canvas, speedEl) {
	const dt = Math.min((now - lastTime) / 1000, 0.05);
	lastTime = now;

	// Effective stats with upgrade bonuses
	const effFuelMax = FUEL_MAX + getUpgradeBonus(ship, 'fuel');
	const effO2Max = LIFE_SUPPORT_MAX + getUpgradeBonus(ship, 'o2');
	const ramjetMult = ship.dockedWithRamjet ? RAMJET_MASS_MULT : 1;
	const effectiveRatio = idealRocketMode ? SHIP_MASS_RATIO : 1;
	const propellantMassFull = SHIP_DRY_MASS * (effectiveRatio - 1);
	const fuelFraction = ship.fuel / effFuelMax;
	const currentMass = (SHIP_DRY_MASS + propellantMassFull * fuelFraction) * ramjetMult;
	const effRCS = (RCS_FORCE + getUpgradeBonus(ship, 'rcs')) / currentMass;
	const effDrive = (MAIN_DRIVE_FORCE + getUpgradeBonus(ship, 'engine')) / currentMass;
	const effTorque = RCS_TORQUE / currentMass;
	const effCargoCapacity = CARGO_CAPACITY + getUpgradeBonus(ship, 'cargo');
	ship.maxHp = SHIP_MAX_HP + getUpgradeBonus(ship, 'hull');

	// Mouse hover/click on HUD menus (feeds justPressed like the keyboard)
	processMouse();

	// Zoom — +/- keys and mouse wheel
	const wheel = consumeWheelDelta();
	if (wheel < 0 || justPressed['Equal'] || justPressed['NumpadAdd']) {
		setZoom(zoom * 1.15);
	}
	if (wheel > 0 || justPressed['Minus'] || justPressed['NumpadSubtract']) {
		setZoom(zoom / 1.15);
	}

	// Interstellar mode — completely different update
	if (universe.mode === 'interstellar') {
		updateInterstellar(dt, canvas, speedEl);
		return;
	}

	// Inventory toggle — T opens/closes inventory
	if (justPressed['KeyT']) {
		if (ship.inventoryOpen) {
			ship.inventoryOpen = false;
			ship.inventoryIndex = 0;
			ship.deployConfirm = false;
		} else if (!menuOpen && !ship.dead && !ship.interacting) {
			ship.inventoryOpen = true;
			ship.inventoryIndex = 0;
		}
		for (const k in justPressed) delete justPressed[k];
		return;
	}

	// Inventory navigation while open
	if (ship.inventoryOpen) {
		// Build hold items list
		const holdItems = [];
		if (ship.minerals > 0) holdItems.push({ type: 'minerals' });
		for (let i = 0; i < ship.cargo.length; i++) holdItems.push({ type: 'cargo', index: i });
		if (ship.hasStationCore) holdItems.push({ type: 'core' });
		const comps = ship.starshipComponents || {};
		const compNames = ['Structure', 'Collector', 'Engine', 'Shielding'];
		for (const c of compNames) { if (comps[c]) holdItems.push({ type: 'component', compName: c }); }
		if (compNames.every(c => comps[c])) holdItems.push({ type: 'assemble' });
		if (ship.dockedWithRamjet) {
			holdItems.push({ type: 'launch-interstellar' });
			holdItems.push({ type: 'salvage-ramjet' });
		}

		if (holdItems.length > 0) {
			if (justPressed['KeyW'] || justPressed['ArrowUp']) {
				ship.inventoryIndex = (ship.inventoryIndex - 1 + holdItems.length) % holdItems.length;
			}
			if (justPressed['KeyS'] || justPressed['ArrowDown']) {
				ship.inventoryIndex = (ship.inventoryIndex + 1) % holdItems.length;
			}

			const sel = holdItems[ship.inventoryIndex];

			// Deploy station core with Space
			if (justPressed['Space'] && sel && sel.type === 'core') {
				if (ship.deployConfirm) {
					// Already confirming — Y/N handled below
				} else {
					ship.deployConfirm = true;
				}
			}

			// Deploy confirmation (Y/N)
			if (ship.deployConfirm) {
				if (justPressed['KeyY']) {
					const result = checkDeployBlocked(ship, canvas);
					if (result.blocked) {
						ship.deployMessage = result.reason;
						ship.deployMessageTime = 3;
						ship.deployConfirm = false;
					} else {
						deployStationCore(ship, canvas, result.asteroid);
						ship.hasStationCore = false;
						ship.deployMessage = result.asteroid
							? 'Asteroid station deployed!'
							: 'Station Core deployed!';
						ship.deployMessageTime = 3;
						ship.deployConfirm = false;
						// Clamp index
						const newCount = holdItems.length - 1;
						if (ship.inventoryIndex >= newCount) ship.inventoryIndex = Math.max(0, newCount - 1);
					}
				} else if (justPressed['KeyN'] || justPressed['Escape']) {
					ship.deployConfirm = false;
				}
			} else {
				// Jettison with Delete/Backspace (not station core — use deploy instead)
				if (justPressed['Delete'] || justPressed['Backspace']) {
					if (sel) {
						if (sel.type === 'minerals') {
							ship.minerals = 0;
						} else if (sel.type === 'cargo') {
							ship.cargo.splice(sel.index, 1);
						} else if (sel.type === 'core') {
							ship.hasStationCore = false;
						}
						const newCount = holdItems.length - 1;
						if (ship.inventoryIndex >= newCount) ship.inventoryIndex = Math.max(0, newCount - 1);
					}
				}

				// Assemble starship with Space
				if (justPressed['Space'] && sel && sel.type === 'assemble') {
					// Place ramjet at ship position
					const ramjet = generateStarship(ship.x + 100, ship.y, ship.angle);
					addObjectToWorld(ramjet);
					universe.starshipPlaced = true;
					universe.starshipX = ramjet.x;
					universe.starshipY = ramjet.y;
					universe.starshipAngle = ramjet.angle;
					// Consume all components
					ship.starshipComponents = { Structure: false, Collector: false, Engine: false, Shielding: false };
					ship.deployMessage = 'Bussard Ramjet assembled!';
					ship.deployMessageTime = 3;
					ship.inventoryOpen = false;
					ship.inventoryIndex = 0;
				}

				// Launch to interstellar space
				if (justPressed['Space'] && sel && sel.type === 'launch-interstellar') {
					ship.dockedWithRamjet = false;
					ship.inventoryOpen = false;
					ship.inventoryIndex = 0;
					switchToInterstellar();
					ship.x = universe.interstellarX || 0;
					ship.y = universe.interstellarY || 0;
					ship.vx = universe.interstellarVx || 0;
					ship.vy = universe.interstellarVy || 0;
					ship.angle = universe.interstellarAngle || 0;
					ship.angularVel = 0;
				}

				// Salvage ramjet for station core
				if (justPressed['Space'] && sel && sel.type === 'salvage-ramjet') {
					ship.dockedWithRamjet = false;
					ship.hasStationCore = true;
					universe.starshipPlaced = false;
					ship.deployMessage = 'Starship salvaged for Station Core';
					ship.deployMessageTime = 3;
					const newCount = holdItems.length - 2; // remove both ramjet items
					if (ship.inventoryIndex >= newCount) ship.inventoryIndex = Math.max(0, newCount - 1);
				}

				// Jettison non-core, non-component, non-special items with Space too
				if (justPressed['Space'] && sel && sel.type !== 'core' && sel.type !== 'component' && sel.type !== 'assemble' && sel.type !== 'launch-interstellar' && sel.type !== 'salvage-ramjet') {
					if (sel.type === 'minerals') {
						ship.minerals = 0;
					} else if (sel.type === 'cargo') {
						ship.cargo.splice(sel.index, 1);
					}
					const newCount = holdItems.length - 1;
					if (ship.inventoryIndex >= newCount) ship.inventoryIndex = Math.max(0, newCount - 1);
				}
			}
		}

		if ((justPressed['Escape'] || justPressed['Tab']) && !ship.deployConfirm) {
			ship.inventoryOpen = false;
			ship.inventoryIndex = 0;
		}

		for (const k in justPressed) delete justPressed[k];
		return;
	}

	// Menu toggle — Escape/Tab goes back one level or closes
	const backKey = justPressed['Escape'] || justPressed['Tab'];
	if (backKey) {
		if (menuOpen) {
			setMenuOpen(false);
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (ship.interacting && ship.collectScienceMenuOpen) {
			ship.collectScienceMenuOpen = false;
			ship.collectScienceMenuIndex = 0;
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (ship.interacting && ship.scienceMenuOpen) {
			ship.scienceMenuOpen = false;
			ship.scienceMenuIndex = 0;
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (ship.interacting && ship.cargoMenuOpen) {
			ship.cargoMenuOpen = false;
			ship.cargoMenuIndex = 0;
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (ship.interacting && ship.stationSubMenu) {
			ship.stationSubMenu = null;
			ship.subMenuIndex = 0;
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (ship.interacting) {
			ship.interacting = false;
			ship.interactStation = null;
			for (const k in justPressed) delete justPressed[k];
			return;
		} else if (justPressed['Escape']) {
			setMenuOpen(true);
			for (const k in justPressed) delete justPressed[k];
			return;
		}
	}

	// Pause everything when menu is open
	if (menuOpen) {
		for (const k in justPressed) delete justPressed[k];
		return;
	}

	// Death state — listen for restart
	if (ship.dead) {
		for (const k in justPressed) delete justPressed[k];
		ship.deathTime += dt;
		advanceGameTime(dt);
		// Explosion particles (hull death only)
		if (ship.deathCause === 'VESSEL DESTROYED') {
			for (let i = explosionParts.length - 1; i >= 0; i--) {
				const p = explosionParts[i];
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.vx *= 0.98;
				p.vy *= 0.98;
				p.life -= dt;
				if (p.life <= 0) explosionParts.splice(i, 1);
			}
		}
		// Life support death — ship keeps drifting
		if (ship.deathCause === 'LIFE SUPPORT FAILURE') {
			ship.x += ship.vx * dt;
			ship.y += ship.vy * dt;
			ship.angle += ship.angularVel * dt;
		}
		if (respawnRequested || (ship.deathTime > 1.5 && keys['KeyR'])) {
			respawnRequested = false;
			const spawn = worldMode === 'preset' ? presetSpawn : getSystemSpawn();
			ship.x = spawn.x;
			ship.y = spawn.y;
			ship.vx = 0;
			ship.vy = 0;
			ship.angle = spawn.angle;
			ship.angularVel = 0;
			ship.hp = ship.maxHp;
			ship.fuel = effFuelMax;
			ship.lifeSupport = effO2Max;
			ship.dead = false;
			ship.deathTime = 0;
			ship.deathCause = '';
			ship.refueling = false;
			ship.interacting = false;
			ship.interactStation = null;
			ship.nearStation = null;
			ship.science = {};
			ship.minerals = 0;
			ship.cargo = [];
			ship.gatheringMinerals = false;
			ship.stationSubMenu = null;
			ship.subMenuIndex = 0;
			ship.scienceMenuOpen = false;
			ship.scienceMenuIndex = 0;
			ship.cargoMenuOpen = false;
			ship.cargoMenuIndex = 0;
			ship.hasStationCore = false;
			ship.deployConfirm = false;
			ship.deployMessage = '';
			ship.deployMessageTime = 0;
			explosionParts.length = 0;
		}
		return;
	}

	// Handle interact toggle (F key or Escape to close)
	if (justPressed['KeyF']) {
		if (ship.interacting) {
			ship.interacting = false;
			ship.interactStation = null;
			ship.stationSubMenu = null;
			ship.subMenuIndex = 0;
			ship.collectScienceMenuOpen = false;
			ship.collectScienceMenuIndex = 0;
			ship.scienceMenuOpen = false;
			ship.scienceMenuIndex = 0;
			ship.cargoMenuOpen = false;
			ship.cargoMenuIndex = 0;
		} else if (ship.nearStation && ship.nearStation.type === 'starship') {
			// Toggle ramjet attachment
			if (ship.dockedWithRamjet) {
				// Detach — leave the ramjet here
				ship.dockedWithRamjet = false;
				universe.starshipX = ship.x;
				universe.starshipY = ship.y;
				universe.starshipAngle = ship.angle;
				ship.deployMessage = 'Ramjet detached';
				ship.deployMessageTime = 2;
			} else {
				// Attach
				ship.dockedWithRamjet = true;
				ship.deployMessage = 'Ramjet attached';
				ship.deployMessageTime = 2;
			}
		} else if (ship.nearStation) {
			const maxDock = stationMaxDockSpeed(ship.nearStation);
			const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
			if (speed > maxDock) {
				ship.deployMessage = `Slow down: max ${Math.round(maxDock)} u/s`;
				ship.deployMessageTime = 2;
			} else {
				ship.interacting = true;
				ship.interactStation = ship.nearStation;
				ship.menuIndex = 0;
				ship.deployConfirm = false;
				// Halt all movement — momentum is dumped on docking
				ship.vx = 0;
				ship.vy = 0;
				ship.angularVel = 0;
				const st = ship.nearStation;
				if (st.totalDocks != null) st.totalDocks++;
				if (st.lastVisitTime != null) st.lastVisitTime = gameTime;
			}
		}
	}
	// Starship dock — attach/detach ramjet instead of opening a menu
	// Handled in the F-key dock section above — when nearStation is a starship,
	// we toggle dockedWithRamjet instead of opening the interact menu.
	// Station menu navigation while docked
	if (ship.interacting && ship.interactStation) {
		if (ship.collectScienceMenuOpen) {
			// Collect science sub-menu navigation
			const entries = getStationScienceEntries(ship.interactStation);
			const itemCount = entries.length + 1; // +1 for "Collect All"
			if (justPressed['KeyW'] || justPressed['ArrowUp']) {
				ship.collectScienceMenuIndex = (ship.collectScienceMenuIndex - 1 + itemCount) % itemCount;
			}
			if (justPressed['KeyS'] || justPressed['ArrowDown']) {
				ship.collectScienceMenuIndex = (ship.collectScienceMenuIndex + 1) % itemCount;
			}
			if (justPressed['Space']) {
				if (ship.collectScienceMenuIndex === 0) {
					collectStationScienceEntry(ship.interactStation, ship, 'all');
				} else {
					const entry = entries[ship.collectScienceMenuIndex - 1];
					if (entry) collectStationScienceEntry(ship.interactStation, ship, entry.key);
				}
				ship.interactStation.lastVisitTime = gameTime;
				if (!getStationScienceEntries(ship.interactStation).length) {
					ship.collectScienceMenuOpen = false;
					ship.collectScienceMenuIndex = 0;
				}
			}
		} else if (ship.cargoMenuOpen) {
			// Cargo sub-menu navigation
			const cargos = ship.interactStation.availableCargo || [];
			const itemCount = cargos.length + 1; // +1 for "Pick Up All"
			if (justPressed['KeyW'] || justPressed['ArrowUp']) {
				ship.cargoMenuIndex = (ship.cargoMenuIndex - 1 + itemCount) % itemCount;
			}
			if (justPressed['KeyS'] || justPressed['ArrowDown']) {
				ship.cargoMenuIndex = (ship.cargoMenuIndex + 1) % itemCount;
			}
			if (justPressed['Space']) {
				if (shipCargoFree(ship) > 0) {
					if (ship.cargoMenuIndex === 0) {
						pickUpCargoItem(ship, ship.interactStation, 'all');
					} else {
						pickUpCargoItem(ship, ship.interactStation, ship.cargoMenuIndex - 1);
					}
					ship.interactStation.lastVisitTime = gameTime;
				}
				// Close sub-menu if no cargo left or hold full
				if (!ship.interactStation.availableCargo.length || shipCargoFree(ship) <= 0) {
					ship.cargoMenuOpen = false;
					ship.cargoMenuIndex = 0;
				}
				// Clamp index if items were removed
				const newCount = (ship.interactStation.availableCargo.length || 0) + 1;
				if (ship.cargoMenuIndex >= newCount) ship.cargoMenuIndex = newCount - 1;
			}
		} else if (ship.scienceMenuOpen) {
			// Science sub-menu navigation
			const entries = getScienceEntries(ship, ship.interactStation);
			const itemCount = entries.length + 1; // +1 for "Give All"
			if (justPressed['KeyW'] || justPressed['ArrowUp']) {
				ship.scienceMenuIndex = (ship.scienceMenuIndex - 1 + itemCount) % itemCount;
			}
			if (justPressed['KeyS'] || justPressed['ArrowDown']) {
				ship.scienceMenuIndex = (ship.scienceMenuIndex + 1) % itemCount;
			}
			if (justPressed['Space']) {
				if (ship.scienceMenuIndex === 0) {
					giveScience(ship, ship.interactStation, 'all');
				} else {
					const entry = entries[ship.scienceMenuIndex - 1];
					if (entry) giveScience(ship, ship.interactStation, entry.key);
				}
				ship.interactStation.lastVisitTime = gameTime;
				// Close sub-menu if no science left
				if (!getScienceEntries(ship, ship.interactStation).length) {
					ship.scienceMenuOpen = false;
					ship.scienceMenuIndex = 0;
				}
			}
		} else if (ship.stationSubMenu) {
			// Sub-menu navigation within a category
			const menuItems = getStationMenuItems(ship.interactStation, ship);
			const cat = menuItems.find(m => m.id === ship.stationSubMenu);
			if (cat && cat.items) {
				const subItems = cat.items;
				const selectableIndices = subItems.reduce((acc, item, i) => {
					if (item.selectable) acc.push(i);
					return acc;
				}, []);
				if (selectableIndices.length > 0) {
					let selPos = selectableIndices.indexOf(ship.subMenuIndex);
					if (selPos === -1) { selPos = 0; ship.subMenuIndex = selectableIndices[0]; }

					if (justPressed['KeyW'] || justPressed['ArrowUp']) {
						selPos = (selPos - 1 + selectableIndices.length) % selectableIndices.length;
						ship.subMenuIndex = selectableIndices[selPos];
					}
					if (justPressed['KeyS'] || justPressed['ArrowDown']) {
						selPos = (selPos + 1) % selectableIndices.length;
						ship.subMenuIndex = selectableIndices[selPos];
					}

					let activateIdx = -1;
					if (justPressed['Space']) activateIdx = ship.subMenuIndex;
					const numKey = checkNumberKey();
					if (numKey > 0 && numKey <= selectableIndices.length) {
						activateIdx = selectableIndices[numKey - 1];
					}

					if (activateIdx >= 0) {
						const item = subItems[activateIdx];
						if (item && item.selectable) {
							executeMenuItem(item.id, ship.interactStation, ship);
							ship.interactStation.lastVisitTime = gameTime;
						}
					}
				}
			}
		} else {
			// Top-level menu navigation
			const menuItems = getStationMenuItems(ship.interactStation, ship);
			const selectableIndices = menuItems.reduce((acc, item, i) => {
				if (item.selectable) acc.push(i);
				return acc;
			}, []);
			if (selectableIndices.length > 0) {
				let selPos = selectableIndices.indexOf(ship.menuIndex);
				if (selPos === -1) { selPos = 0; ship.menuIndex = selectableIndices[0]; }

				if (justPressed['KeyW'] || justPressed['ArrowUp']) {
					selPos = (selPos - 1 + selectableIndices.length) % selectableIndices.length;
					ship.menuIndex = selectableIndices[selPos];
				}
				if (justPressed['KeyS'] || justPressed['ArrowDown']) {
					selPos = (selPos + 1) % selectableIndices.length;
					ship.menuIndex = selectableIndices[selPos];
				}

				// Activate by Space or number key
				let activateIdx = -1;
				if (justPressed['Space']) activateIdx = ship.menuIndex;
				const numKey = checkNumberKey();
				if (numKey > 0 && numKey <= selectableIndices.length) {
					activateIdx = selectableIndices[numKey - 1];
				}

				if (activateIdx >= 0) {
					const item = menuItems[activateIdx];
					if (item && item.selectable) {
						if (item.isCategory) {
							ship.stationSubMenu = item.id;
							ship.subMenuIndex = 0;
						} else {
							executeMenuItem(item.id, ship.interactStation, ship);
							ship.interactStation.lastVisitTime = gameTime;
						}
					}
				}
			}
		}
	}

	// Tick deploy message timer
	if (ship.deployMessageTime > 0) {
		ship.deployMessageTime -= dt;
		if (ship.deployMessageTime <= 0) {
			ship.deployMessage = '';
			ship.deployMessageTime = 0;
		}
	}

	// Clear justPressed flags
	for (const k in justPressed) delete justPressed[k];

	// If interacting, skip all movement/input but still update visuals
	if (ship.interacting) {
		// Verify still in range
		if (ship.interactStation) {
			const dx = ship.interactStation.x - ship.x;
			const dy = ship.interactStation.y - ship.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist > ship.interactStation.size + INTERACT_RANGE + 20) {
				ship.interacting = false;
				ship.interactStation = null;
			}
		}
		// Still refuel/resupply while docked
		ship.refueling = true;
		const dockStation = ship.interactStation;
		ship.refuelStations = dockStation && ship.fuel < effFuelMax ? [dockStation] : [];
		ship.fuel = Math.min(effFuelMax, ship.fuel + REFUEL_RATE * dt);
		ship.lifeSupport = effO2Max;
		if (dockStation) {
			dockStation.lastVisitTime = gameTime;
		}
		advanceGameTime(dt);
		// HUD
		const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
		speedEl.textContent = speed.toFixed(1);
		return;
	}

	const cos = Math.cos(ship.angle);
	const sin = Math.sin(ship.angle);

	// Reset thruster flags
	thrusters.rearFwd = false;
	thrusters.frontBrk = false;
	thrusters.rightL = false;
	thrusters.leftR = false;
	thrusters.rotateCCW = false;
	thrusters.rotateCW = false;
	thrusters.mainDrive = false;

	const hasFuel = godMode || ship.fuel > 0;

	// W = forward
	if (keys['KeyW'] && hasFuel) {
		ship.vx += cos * effRCS * dt;
		ship.vy += sin * effRCS * dt;
		ship.fuel -= RCS_FUEL_RATE * dt;
		thrusters.rearFwd = true;
	}
	// S = backward
	if (keys['KeyS'] && hasFuel) {
		ship.vx -= cos * effRCS * dt;
		ship.vy -= sin * effRCS * dt;
		ship.fuel -= RCS_FUEL_RATE * dt;
		thrusters.frontBrk = true;
	}
	// A = strafe left
	if (keys['KeyA'] && hasFuel) {
		ship.vx += sin * effRCS * dt;
		ship.vy -= cos * effRCS * dt;
		ship.fuel -= RCS_FUEL_RATE * dt;
		thrusters.rightL = true;
	}
	// D = strafe right
	if (keys['KeyD'] && hasFuel) {
		ship.vx -= sin * effRCS * dt;
		ship.vy += cos * effRCS * dt;
		ship.fuel -= RCS_FUEL_RATE * dt;
		thrusters.leftR = true;
	}
	// Q = rotate CCW
	if (keys['KeyQ'] && hasFuel) {
		ship.angularVel -= effTorque * dt;
		ship.fuel -= ROTATION_FUEL_RATE * dt;
		thrusters.rotateCCW = true;
	}
	// E = rotate CW
	if (keys['KeyE'] && hasFuel) {
		ship.angularVel += effTorque * dt;
		ship.fuel -= ROTATION_FUEL_RATE * dt;
		thrusters.rotateCW = true;
	}

	// X = kill rotation only (preserve velocity)
	if (keys['KeyX'] && hasFuel) {
		if (Math.abs(ship.angularVel) > 0.001) {
			const angularReduction = Math.min(
				effTorque * dt,
				Math.abs(ship.angularVel),
			);
			ship.angularVel -= Math.sign(ship.angularVel) * angularReduction;
			ship.fuel -= ROTATION_FUEL_RATE * dt;
			if (ship.angularVel > 0.001) thrusters.rotateCCW = true;
			else if (ship.angularVel < -0.001) thrusters.rotateCW = true;
		}
	}

	// Z = kill rotation and velocity
	if (keys['KeyZ'] && hasFuel) {
		const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
		const killRate = effRCS * dt;

		if (speed > 0) {
			const reduction = Math.min(killRate, speed);
			ship.vx -= (ship.vx / speed) * reduction;
			ship.vy -= (ship.vy / speed) * reduction;
			ship.fuel -= RCS_FUEL_RATE * dt;

			const localVx = ship.vx * cos + ship.vy * sin;
			const localVy = -ship.vx * sin + ship.vy * cos;

			if (localVx > 1) thrusters.frontBrk = true;
			if (localVx < -1) thrusters.rearFwd = true;
			if (localVy > 1) thrusters.rightL = true;
			if (localVy < -1) thrusters.leftR = true;
		}

		if (Math.abs(ship.angularVel) > 0.001) {
			const angularReduction = Math.min(
				effTorque * dt,
				Math.abs(ship.angularVel),
			);
			ship.angularVel -= Math.sign(ship.angularVel) * angularReduction;
			ship.fuel -= ROTATION_FUEL_RATE * dt;
			if (ship.angularVel > 0.001) thrusters.rotateCCW = true;
			else if (ship.angularVel < -0.001) thrusters.rotateCW = true;
		}
	}

	// SPACE = main drive
	if (keys['Space'] && hasFuel) {
		ship.vx += cos * effDrive * dt;
		ship.vy += sin * effDrive * dt;
		ship.fuel -= MAIN_DRIVE_FUEL_RATE * dt;
		thrusters.mainDrive = true;
	}

	// R = toggle auto-flip (rotate to point opposite of velocity)
	// Note: justPressed is cleared earlier in update(), so detect edge manually.
	const hasAutoFlip = ((ship.upgrades && ship.upgrades.autoflip) || 0) > 0;
	const rDown = !!keys['KeyR'];
	if (rDown && !ship._rWasDown && hasAutoFlip) {
		ship.autoFlipping = !ship.autoFlipping;
		if (ship.autoFlipping) ship.autoFlipDir = 0;
	}
	ship._rWasDown = rDown;
	// Manual rotation cancels auto-flip
	if (ship.autoFlipping && (keys['KeyQ'] || keys['KeyE'] || keys['KeyX'] || keys['KeyZ'])) {
		ship.autoFlipping = false;
	}
	if (ship.autoFlipping && hasFuel) {
		const speedSq = ship.vx * ship.vx + ship.vy * ship.vy;
		if (speedSq < 0.01) {
			ship.autoFlipping = false;
		} else {
			const targetAngle = Math.atan2(-ship.vy, -ship.vx);
			const TAU = Math.PI * 2;
			// Shortest signed delta to target in (-PI, PI]
			const signedDelta = ((targetAngle - ship.angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
			if (!ship.autoFlipDir) {
				if (ship.angularVel > 0.001) ship.autoFlipDir = 1;
				else if (ship.angularVel < -0.001) ship.autoFlipDir = -1;
				else ship.autoFlipDir = signedDelta >= 0 ? 1 : -1;
			}
			const dir = ship.autoFlipDir;
			const angTol = 0.04; // ~2.3° — close enough to commit to braking
			const wTol = 0.05;   // angular velocity considered "stopped"

			if (Math.abs(signedDelta) < angTol && Math.abs(ship.angularVel) < wTol) {
				ship.angle = targetAngle;
				ship.angularVel = 0;
				ship.autoFlipping = false;
			} else if (Math.abs(signedDelta) < angTol) {
				// At target but still spinning — brake hard regardless of direction
				const reduction = Math.min(effTorque * dt, Math.abs(ship.angularVel));
				ship.angularVel -= Math.sign(ship.angularVel) * reduction;
				ship.fuel -= ROTATION_FUEL_RATE * dt;
				if (ship.angularVel > 0) thrusters.rotateCCW = true;
				else if (ship.angularVel < 0) thrusters.rotateCW = true;
			} else {
				const distance = dir > 0
					? ((targetAngle - ship.angle) % TAU + TAU) % TAU
					: ((ship.angle - targetAngle) % TAU + TAU) % TAU;
				const brakeDist = (ship.angularVel * ship.angularVel) / (2 * effTorque);
				if (Math.abs(ship.angularVel) > 0.001 && Math.sign(ship.angularVel) !== dir) {
					// Drifting wrong way — push toward chosen direction
					ship.angularVel += dir * effTorque * dt;
					ship.fuel -= ROTATION_FUEL_RATE * dt;
					if (dir > 0) thrusters.rotateCW = true; else thrusters.rotateCCW = true;
				} else if (brakeDist >= distance) {
					const reduction = Math.min(effTorque * dt, Math.abs(ship.angularVel));
					ship.angularVel -= Math.sign(ship.angularVel) * reduction;
					ship.fuel -= ROTATION_FUEL_RATE * dt;
					if (dir > 0) thrusters.rotateCCW = true; else thrusters.rotateCW = true;
				} else {
					ship.angularVel += dir * effTorque * dt;
					ship.fuel -= ROTATION_FUEL_RATE * dt;
					if (dir > 0) thrusters.rotateCW = true; else thrusters.rotateCCW = true;
				}
			}
		}
	}

	ship.fuel = Math.max(0, ship.fuel);

	// God mode — restore fuel, hp, and life support
	if (godMode) {
		ship.fuel = effFuelMax;
		ship.hp = ship.maxHp;
		ship.lifeSupport = effO2Max;
	}

	// Gravity from nearby planets — range proportional to planet size
	const maxGravRange = 180 * GRAVITY_RANGE_MULT;
	const gravMinCX = Math.floor((ship.x - maxGravRange) / CHUNK_SIZE);
	const gravMaxCX = Math.floor((ship.x + maxGravRange) / CHUNK_SIZE);
	const gravMinCY = Math.floor((ship.y - maxGravRange) / CHUNK_SIZE);
	const gravMaxCY = Math.floor((ship.y + maxGravRange) / CHUNK_SIZE);
	for (let gcx = gravMinCX; gcx <= gravMaxCX; gcx++) {
		for (let gcy = gravMinCY; gcy <= gravMaxCY; gcy++) {
			const objs = generateChunk(gcx, gcy);
			for (const obj of objs) {
				if (obj.type !== 'planet') continue;
				const dx = obj.x - ship.x;
				const dy = obj.y - ship.y;
				const distSq = dx * dx + dy * dy;
				const dist = Math.sqrt(distSq);
				const gravRange = obj.radius * GRAVITY_RANGE_MULT;
				if (dist < 5 || dist > gravRange) continue;
				// Gravitational strength scales with planet radius (mass ~ r²)
				const G = obj.radius * obj.radius * GRAVITY_STRENGTH;
				const force = G / distSq;
				ship.vx += (dx / dist) * force * dt;
				ship.vy += (dy / dist) * force * dt;
			}
		}
	}

	// System boundary gravity — pulls ship back toward center beyond the edge
	if (worldMode !== 'preset') {
		const sysLayout = getCurrentSystemLayout();
		if (sysLayout) {
			const distFromCenter = Math.sqrt(ship.x * ship.x + ship.y * ship.y);
			if (distFromCenter > sysLayout.radius) {
				const overshoot = distFromCenter - sysLayout.radius;
				const strength = SYSTEM_BOUNDARY_GRAVITY * Math.min(1, overshoot / SYSTEM_BOUNDARY_FADE);
				const pullX = -ship.x / distFromCenter;
				const pullY = -ship.y / distFromCenter;
				ship.vx += pullX * strength * dt;
				ship.vy += pullY * strength * dt;
			}
		}
	}

	// Integrate position
	ship.x += ship.vx * dt;
	ship.y += ship.vy * dt;
	ship.angle += ship.angularVel * dt;

	advanceGameTime(dt);

	// Update ramjet position if docked with ship
	if (ship.dockedWithRamjet) {
		universe.starshipX = ship.x;
		universe.starshipY = ship.y;
		universe.starshipAngle = ship.angle;
		// Update the actual world object
		const rHalf = Math.max(canvas.width / 2 + 200, canvas.height / 2 + 200);
		const rMinCX = Math.floor((ship.x - rHalf) / CHUNK_SIZE);
		const rMaxCX = Math.floor((ship.x + rHalf) / CHUNK_SIZE);
		const rMinCY = Math.floor((ship.y - rHalf) / CHUNK_SIZE);
		const rMaxCY = Math.floor((ship.y + rHalf) / CHUNK_SIZE);
		for (let rcx = rMinCX; rcx <= rMaxCX; rcx++) {
			for (let rcy = rMinCY; rcy <= rMaxCY; rcy++) {
				const objs = generateChunk(rcx, rcy);
				for (const obj of objs) {
					if (obj.type === 'starship') {
						obj.x = ship.x;
						obj.y = ship.y;
						obj.angle = ship.angle;
					}
				}
			}
		}
	}

	// Check station proximity, refuel and resupply
	// Use the larger of screen range and gravity range so stations are found before their
	// effects become visible (prevents pop-in of gravity and science claiming)
	ship.refueling = false;
	ship.refuelStations = [];
	ship.nearStation = null;
	const nearbyStations = [];
	{
		const z = Math.max(0.15, zoom || 1);
		const refHalf = Math.max(canvas.width / 2 / z + 200, canvas.height / 2 / z + 200, maxGravRange + CHUNK_SIZE);
		const refMinCX = Math.floor((ship.x - refHalf) / CHUNK_SIZE);
		const refMaxCX = Math.floor((ship.x + refHalf) / CHUNK_SIZE);
		const refMinCY = Math.floor((ship.y - refHalf) / CHUNK_SIZE);
		const refMaxCY = Math.floor((ship.y + refHalf) / CHUNK_SIZE);
		let nearestDist = Infinity;
		for (let rcx = refMinCX; rcx <= refMaxCX; rcx++) {
			for (let rcy = refMinCY; rcy <= refMaxCY; rcy++) {
				const objs = generateChunk(rcx, rcy);
				for (const obj of objs) {
					// Track starships for docking
					if (obj.type === 'starship') {
						const dx = obj.x - ship.x;
						const dy = obj.y - ship.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < (obj.size || 60) + INTERACT_RANGE && dist < nearestDist) {
							nearestDist = dist;
							ship.nearStation = obj; // reuse nearStation for dock prompt
						}
						continue;
					}
					if (obj.type !== 'station') continue;
					nearbyStations.push(obj);
					const dx = obj.x - ship.x;
					const dy = obj.y - ship.y;
					const dist = Math.sqrt(dx * dx + dy * dy);

					// Remote refuel — only at high-level stations
					if (dist < obj.size + REFUEL_RANGE && obj.level >= STATION_REMOTE_REFUEL_LV) {
						ship.refueling = true;
						if (ship.fuel < effFuelMax) ship.refuelStations.push(obj);
						ship.fuel = Math.min(effFuelMax, ship.fuel + REFUEL_RATE * dt);
						obj.lastVisitTime = gameTime;
					}
					// Remote O2 — only at high-level stations
					if (dist < obj.size + REFUEL_RANGE && obj.level >= STATION_REMOTE_O2_LV) {
						ship.refueling = true;
						ship.lifeSupport = effO2Max;
						obj.lastVisitTime = gameTime;
					}
					if (dist < obj.size + INTERACT_RANGE && dist < nearestDist) {
						nearestDist = dist;
						ship.nearStation = obj;
					}
				}
			}
		}
	}

	// Cargo generation — stations periodically generate cargo for other nearby stations
	for (const st of nearbyStations) {
		if (gameTime - (st.lastCargoGenTime || -9999) > CARGO_GEN_INTERVAL) {
			// Find stations in a wider range for cargo destinations
			const cargoStations = [];
			const cMinCX = Math.floor((st.x - CARGO_SEARCH_RANGE) / CHUNK_SIZE);
			const cMaxCX = Math.floor((st.x + CARGO_SEARCH_RANGE) / CHUNK_SIZE);
			const cMinCY = Math.floor((st.y - CARGO_SEARCH_RANGE) / CHUNK_SIZE);
			const cMaxCY = Math.floor((st.y + CARGO_SEARCH_RANGE) / CHUNK_SIZE);
			for (let ccx = cMinCX; ccx <= cMaxCX; ccx++) {
				for (let ccy = cMinCY; ccy <= cMaxCY; ccy++) {
					const objs = generateChunk(ccx, ccy);
					for (const obj of objs) {
						if (obj.type === 'station') cargoStations.push(obj);
					}
				}
			}
			generateStationCargo(st, cargoStations, gameTime);
		}
	}

	// Science accumulation — stations in a planet's gravity field collect science;
	// otherwise the ship collects directly
	ship.gatheringScience = [];
	{
		const sciMaxRange = 180 * GRAVITY_RANGE_MULT;
		const sciMinCX = Math.floor((ship.x - sciMaxRange) / CHUNK_SIZE);
		const sciMaxCX = Math.floor((ship.x + sciMaxRange) / CHUNK_SIZE);
		const sciMinCY = Math.floor((ship.y - sciMaxRange) / CHUNK_SIZE);
		const sciMaxCY = Math.floor((ship.y + sciMaxRange) / CHUNK_SIZE);
		for (let scx = sciMinCX; scx <= sciMaxCX; scx++) {
			for (let scy = sciMinCY; scy <= sciMaxCY; scy++) {
				const objs = generateChunk(scx, scy);
				for (const obj of objs) {
					if (obj.type !== 'planet') continue;
					const gravRange = obj.radius * GRAVITY_RANGE_MULT;
					const pKey = `${obj.x},${obj.y}`;
					const pName = obj.name || `UNK-${Math.abs((obj.x * 73 + obj.y * 37) | 0).toString(36).toUpperCase().slice(0, 4)}`;

					// Check if any station is within this planet's gravity field
					let claimingStation = null;
					for (const st of nearbyStations) {
						const sdx = st.x - obj.x;
						const sdy = st.y - obj.y;
						const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
						if (sDist < gravRange) {
							claimingStation = st;
							break;
						}
					}

					if (claimingStation) {
						// Station accumulates science from this planet
						if (!claimingStation.science) claimingStation.science = {};
						if (!claimingStation.science[pKey]) {
							claimingStation.science[pKey] = { amount: 0, planetName: pName, planetX: obj.x, planetY: obj.y, planetColor: obj.color1 };
						}
						const sdx = claimingStation.x - obj.x;
						const sdy = claimingStation.y - obj.y;
						const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
						const proximity = 1 - sDist / gravRange;
						claimingStation.science[pKey].amount += SCIENCE_COLLECT_RATE * proximity * dt;
					} else {
						// Ship collects directly if in range
						const dx = obj.x - ship.x;
						const dy = obj.y - ship.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < gravRange && dist > 5) {
							const proximity = 1 - dist / gravRange;
							if (!ship.science[pKey]) {
								ship.science[pKey] = { amount: 0, planetName: pName, planetX: obj.x, planetY: obj.y, planetColor: obj.color1 };
							}
							ship.science[pKey].amount += SCIENCE_COLLECT_RATE * proximity * dt;
						ship.gatheringScience.push(pKey);
						}
					}
				}
			}
		}
	}

	// Mineral collection — ship collects from asteroids/debris, or stations claim asteroids
	ship.gatheringMinerals = false;
	{
		const minHalfW = canvas.width / 2 + 200;
		const minHalfH = canvas.height / 2 + 200;
		const minMinCX = Math.floor((ship.x - minHalfW) / CHUNK_SIZE);
		const minMaxCX = Math.floor((ship.x + minHalfW) / CHUNK_SIZE);
		const minMinCY = Math.floor((ship.y - minHalfH) / CHUNK_SIZE);
		const minMaxCY = Math.floor((ship.y + minHalfH) / CHUNK_SIZE);
		for (let mcx = minMinCX; mcx <= minMaxCX; mcx++) {
			for (let mcy = minMinCY; mcy <= minMaxCY; mcy++) {
				const objs = generateChunk(mcx, mcy);
				for (const obj of objs) {
					if (obj.type === 'asteroid') {
						// Check if any nearby station claims this asteroid
						let claimingStation = null;
						for (const st of nearbyStations) {
							if (st.onAsteroid &&
								Math.abs(st.onAsteroid.x - obj.x) < 1 &&
								Math.abs(st.onAsteroid.y - obj.y) < 1) {
								claimingStation = st;
								break;
							}
						}

						if (claimingStation) {
							// Station mines the asteroid — minerals go toward level reqs first
							const rate = MINERAL_COLLECT_RATE * dt;
							const reqs = levelReqs(claimingStation.level);
							if (reqs && claimingStation.storedMinerals < reqs[1]) {
								claimingStation.storedMinerals += rate;
								tryLevelUp(claimingStation);
							} else {
								// Overflow into minedMinerals for player pickup
								const cap = STATION_MINERAL_CAP_BASE + (claimingStation.level || 1) * STATION_MINERAL_CAP_PER_LV;
								if ((claimingStation.minedMinerals || 0) < cap) {
									claimingStation.minedMinerals = Math.min(cap, (claimingStation.minedMinerals || 0) + rate);
								}
							}
						} else {
							// Ship collects directly
							const dx = obj.x - ship.x;
							const dy = obj.y - ship.y;
							const dist = Math.sqrt(dx * dx + dy * dy);
							const collectRange = obj.radius + MINERAL_COLLECT_RANGE;
							if (dist < collectRange && dist > 5) {
								const proximity = 1 - dist / collectRange;
								ship.mineralAccum = (ship.mineralAccum || 0) + MINERAL_COLLECT_RATE * proximity * dt;
								ship.gatheringMinerals = true;
							}
						}
					} else if (obj.type === 'debris') {
						const dx = obj.x - ship.x;
						const dy = obj.y - ship.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < MINERAL_DEBRIS_RANGE && dist > 5) {
							const proximity = 1 - dist / MINERAL_DEBRIS_RANGE;
							ship.mineralAccum = (ship.mineralAccum || 0) + MINERAL_DEBRIS_RATE * proximity * dt;
							ship.gatheringMinerals = true;
						}
					}
				}
			}
		}
	}
	// Commit whole accumulated mineral units to inventory, capped by hold space
	if (ship.mineralAccum && ship.mineralAccum >= 1) {
		const otherCargo = shipCargoUsed(ship) - ship.minerals;
		const maxAdd = Math.max(0, effCargoCapacity - otherCargo - ship.minerals);
		const whole = Math.min(Math.floor(ship.mineralAccum), maxAdd);
		ship.minerals += whole;
		ship.mineralAccum -= whole;
	}

	// Life support — drains over time, fully restored at stations
	if (ship.refueling) {
		ship.lifeSupport = effO2Max;
	} else {
		const drainMult = ship.fuel <= 0 ? LIFE_SUPPORT_NO_FUEL_MULT : 1;
		ship.lifeSupport -= LIFE_SUPPORT_DRAIN * drainMult * dt;
		ship.lifeSupport = Math.max(0, ship.lifeSupport);
	}
	if (ship.lifeSupport <= 0) {
		ship.dead = true;
		ship.deathTime = 0;
		ship.deathCause = 'LIFE SUPPORT FAILURE';
		return;
	}

	// Damage — constant pass-through for planets and debris
	ship.insidePlanet = false;
	ship.insideDebris = false;
	{
		const shipRadius = ship.length / 2;
		const colHalfW = canvas.width / 2 + 200;
		const colHalfH = canvas.height / 2 + 200;
		const colMinCX = Math.floor((ship.x - colHalfW) / CHUNK_SIZE);
		const colMaxCX = Math.floor((ship.x + colHalfW) / CHUNK_SIZE);
		const colMinCY = Math.floor((ship.y - colHalfH) / CHUNK_SIZE);
		const colMaxCY = Math.floor((ship.y + colHalfH) / CHUNK_SIZE);

		for (let ccx = colMinCX; ccx <= colMaxCX; ccx++) {
			for (let ccy = colMinCY; ccy <= colMaxCY; ccy++) {
				const objs = generateChunk(ccx, ccy);
				for (const obj of objs) {
					if (obj.type === 'planet') {
						const dx = obj.x - ship.x;
						const dy = obj.y - ship.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < obj.radius) {
							ship.insidePlanet = true;
							const depth = 1 - dist / obj.radius;
							const dps = PLANET_DPS_BASE + depth * PLANET_DPS_DEPTH;
							ship.hp -= dps * dt;
							// Drag — stronger near center
							const drag =
								1 -
								Math.min(
									1,
									(PLANET_DRAG_BASE + depth * PLANET_DRAG_DEPTH) * dt,
								);
							ship.vx *= drag;
							ship.vy *= drag;
							ship.angularVel *= drag;
						}
					} else if (obj.type === 'debris') {
						for (const p of obj.pieces) {
							const pdx = obj.x + p.ox - ship.x;
							const pdy = obj.y + p.oy - ship.y;
							const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
							if (pdist < p.r + shipRadius) {
								ship.insideDebris = true;
								ship.hp -= DEBRIS_DPS * dt;
							}
						}
					}
				}
			}
		}
		ship.hp = Math.max(0, ship.hp);
		if (ship.hp <= 0) {
			ship.dead = true;
			ship.deathTime = 0;
			ship.deathCause = 'VESSEL DESTROYED';
			spawnExplosion();
			return;
		}
	}

	// HUD
	const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
	speedEl.textContent = speed.toFixed(1);
}

/** Check if deploying a station at the ship's position is blocked. Returns reason string or null.
 *  Also returns the asteroid the station would be placed on, if any. */
function checkDeployBlocked(ship, canvas) {
	const checkRange = Math.max(STATION_CORE_MIN_DIST, 200 * GRAVITY_RANGE_MULT);
	const minCX = Math.floor((ship.x - checkRange) / CHUNK_SIZE);
	const maxCX = Math.floor((ship.x + checkRange) / CHUNK_SIZE);
	const minCY = Math.floor((ship.y - checkRange) / CHUNK_SIZE);
	const maxCY = Math.floor((ship.y + checkRange) / CHUNK_SIZE);

	let nearestAsteroid = null;
	let nearestAsteroidDist = Infinity;

	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			const objs = generateChunk(cx, cy);
			for (const obj of objs) {
				const dx = obj.x - ship.x;
				const dy = obj.y - ship.y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (obj.type === 'planet') {
					if (dist < obj.radius + STATION_CORE_PLANET_CLEARANCE) {
						return { blocked: true, reason: 'Too close to a planet!' };
					}
				} else if (obj.type === 'asteroid') {
					const r = obj.radius || 30;
					if (dist < r && dist < nearestAsteroidDist) {
						nearestAsteroid = obj;
						nearestAsteroidDist = dist;
					}
				} else if (obj.type === 'station') {
					if (dist < STATION_CORE_MIN_DIST) {
						return { blocked: true, reason: `Too close to ${obj.name}! (min ${STATION_CORE_MIN_DIST}px)` };
					}
				}
			}
		}
	}
	return { blocked: false, asteroid: nearestAsteroid };
}

/** Deploy a new Level 1 station at the ship's current position. */
function deployStationCore(ship, canvas, asteroid) {
	const seed = Math.floor(ship.x * 73856 + ship.y * 19349 + Date.now());
	const rng = mulberry32(seed);
	const newStation = generateStation(rng, ship.x, ship.y, Math.random() * Math.PI * 2);
	newStation.isDynamic = true;

	// If placed on an asteroid, link them
	if (asteroid) {
		newStation.onAsteroid = {
			x: asteroid.x,
			y: asteroid.y,
			radius: asteroid.radius,
		};
		newStation.minedMinerals = 0;
	}

	addObjectToWorld(newStation);
}

// ── Interstellar Mode ──────────────────────────────────────

function updateInterstellar(dt, canvas, speedEl) {
	// Menu/inventory still work in interstellar
	if (justPressed['KeyT']) {
		if (ship.inventoryOpen) { ship.inventoryOpen = false; ship.inventoryIndex = 0; }
		else if (!menuOpen && !ship.dead) { ship.inventoryOpen = true; ship.inventoryIndex = 0; }
		for (const k in justPressed) delete justPressed[k];
		return;
	}
	if (ship.inventoryOpen) {
		// Minimal inventory — just let escape/tab close
		if (justPressed['Escape'] || justPressed['Tab']) { ship.inventoryOpen = false; ship.inventoryIndex = 0; }
		for (const k in justPressed) delete justPressed[k];
		return;
	}

	const backKey = justPressed['Escape'] || justPressed['Tab'];
	if (backKey) {
		if (menuOpen) { setMenuOpen(false); }
		else if (justPressed['Escape']) { setMenuOpen(true); }
		for (const k in justPressed) delete justPressed[k];
		return;
	}
	if (menuOpen) { for (const k in justPressed) delete justPressed[k]; return; }

	// Find nearest star for visit prompt
	universe.nearStar = null;
	let nearestStarDist = Infinity;
	const searchRange = Math.max(canvas.width, canvas.height, INTERSTELLAR_CHUNK_SIZE * 1.5) + INTERSTELLAR_STAR_VISIT_RANGE;
	const sMinCX = Math.floor((ship.x - searchRange) / INTERSTELLAR_CHUNK_SIZE);
	const sMaxCX = Math.floor((ship.x + searchRange) / INTERSTELLAR_CHUNK_SIZE);
	const sMinCY = Math.floor((ship.y - searchRange) / INTERSTELLAR_CHUNK_SIZE);
	const sMaxCY = Math.floor((ship.y + searchRange) / INTERSTELLAR_CHUNK_SIZE);
	// Check home star
	const homeStar = getHomeStar();
	const hdx = homeStar.x - ship.x;
	const hdy = homeStar.y - ship.y;
	const hDist = Math.sqrt(hdx * hdx + hdy * hdy);
	if (hDist < INTERSTELLAR_STAR_VISIT_RANGE + homeStar.radius && hDist < nearestStarDist) {
		nearestStarDist = hDist;
		universe.nearStar = homeStar;
	}
	for (let scx = sMinCX; scx <= sMaxCX; scx++) {
		for (let scy = sMinCY; scy <= sMaxCY; scy++) {
			const objs = generateInterstellarChunkAt(scx, scy);
			for (const obj of objs) {
				if (obj.type !== 'interstellar-star') continue;
				const dx = obj.x - ship.x;
				const dy = obj.y - ship.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < INTERSTELLAR_STAR_VISIT_RANGE + obj.radius && dist < nearestStarDist) {
					nearestStarDist = dist;
					universe.nearStar = obj;
				}
			}
		}
	}

	// Visit star with [F]
	const vel = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
	if (justPressed['KeyF'] && universe.nearStar && vel < INTERSTELLAR_STAR_VISIT_MAX_VEL) {
		const star = universe.nearStar;
		// Save interstellar position
		universe.interstellarX = ship.x;
		universe.interstellarY = ship.y;
		universe.interstellarVx = ship.vx;
		universe.interstellarVy = ship.vy;
		universe.interstellarAngle = ship.angle;
		// Switch to the star's system
		const seed = star.systemSeed || universe.homeSystemSeed;
		const label = star.isHome ? 'Home' : star.name;
		switchToSystem(seed, label).then(() => {
			// Place starship at a safe spawn location
			const spawn = getSystemSpawn();
			const ramjet = generateStarship(spawn.x, spawn.y, ship.angle);
			addObjectToWorld(ramjet);
			universe.starshipPlaced = true;
			universe.starshipX = spawn.x;
			universe.starshipY = spawn.y;
			universe.starshipAngle = ship.angle;
			// Position player near the starship
			ship.x = spawn.x + 150;
			ship.y = spawn.y;
			ship.vx = 0;
			ship.vy = 0;
			ship.angle = Math.PI;
			ship.angularVel = 0;
			ship.fuel = FUEL_MAX + getUpgradeBonus(ship, 'fuel');
			ship.lifeSupport = LIFE_SUPPORT_MAX + getUpgradeBonus(ship, 'o2');
		});
		for (const k in justPressed) delete justPressed[k];
		return;
	}

	for (const k in justPressed) delete justPressed[k];

	// Physics — rotation + forward thrust only
	thrusters.rearFwd = false;
	thrusters.frontBrk = false;
	thrusters.rightL = false;
	thrusters.leftR = false;
	thrusters.rotateCCW = false;
	thrusters.rotateCW = false;
	thrusters.mainDrive = false;

	if (keys['KeyQ']) {
		ship.angularVel -= INTERSTELLAR_ROTATION_SPEED * dt;
		thrusters.rotateCCW = true;
	}
	if (keys['KeyE']) {
		ship.angularVel += INTERSTELLAR_ROTATION_SPEED * dt;
		thrusters.rotateCW = true;
	}
	if (keys['Space']) {
		const cos = Math.cos(ship.angle);
		const sin = Math.sin(ship.angle);
		ship.vx += cos * INTERSTELLAR_THRUST * dt;
		ship.vy += sin * INTERSTELLAR_THRUST * dt;
		thrusters.mainDrive = true;
	}
	// No Z kill — ramjet has no brakes in interstellar space.
	// Player must rotate and thrust in the opposite direction to slow down.

	// Integrate
	ship.x += ship.vx * dt;
	ship.y += ship.vy * dt;
	ship.angle += ship.angularVel * dt;
	advanceGameTime(dt);

	// HUD
	speedEl.textContent = vel.toFixed(1);
}
