import { LIFE_SUPPORT_MAX, GRAVITY_STRENGTH, GRAVITY_RANGE_MULT } from './constants.js';

function drawFlame(ctx, x, y, degrees, len, color1, color2) {
	const rad = ((degrees + 90) * Math.PI) / 180;
	const dx = Math.cos(rad);
	const dy = Math.sin(rad);
	const endX = x + dx * len;
	const endY = y + dy * len;
	const grad = ctx.createLinearGradient(x, y, endX, endY);
	grad.addColorStop(0, color1);
	grad.addColorStop(0.4, color2);
	grad.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = grad;
	const perpX = -dy;
	const perpY = dx;
	const baseW = 3;
	ctx.beginPath();
	ctx.moveTo(x + perpX * baseW, y + perpY * baseW);
	ctx.lineTo(x - perpX * baseW, y - perpY * baseW);
	ctx.lineTo(endX, endY);
	ctx.closePath();
	ctx.fill();
}

function flameLen(base) {
	return base * (0.8 + Math.random() * 0.4);
}

function renderRcsThruster(ctx, x, y, degrees, isFiring) {
	const nubW = 3; // width along hull
	const nubH = 3; // height outward from hull
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(((degrees - 90) * Math.PI) / 180);
	// Nub extends outward in local +X direction
	ctx.fillStyle = isFiring ? '#88a' : '#556';
	ctx.fillRect(-nubW / 2, 0, nubW, nubH);
	// Flame fires outward from nub tip
	if (isFiring) {
		drawFlame(
			ctx,
			0,
			nubH,
			0,
			flameLen(12),
			'rgba(255,180,60,0.9)',
			'rgba(255,100,20,0.5)',
		);
	}
	ctx.restore();
}

// Ship convention: x = starboard, y = forward. W = beam (starboard), L = length (forward).
function renderHull(ctx, W, L) {
	const grad = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
	grad.addColorStop(0, '#556');
	grad.addColorStop(0.3, '#99a');
	grad.addColorStop(0.5, '#bbc');
	grad.addColorStop(0.7, '#99a');
	grad.addColorStop(1, '#556');
	ctx.fillStyle = grad;
	ctx.fillRect(-W / 2, -L / 2 + 8, W, L - 16);
}

function renderNoseCone(ctx, W, L) {
	const grad = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
	grad.addColorStop(0, '#556');
	grad.addColorStop(0.3, '#99a');
	grad.addColorStop(0.5, '#bbc');
	grad.addColorStop(0.7, '#99a');
	grad.addColorStop(1, '#556');
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.moveTo(0, L / 2 + 10);
	ctx.lineTo(-W / 2, L / 2 - 8);
	ctx.lineTo(W / 2, L / 2 - 8);
	ctx.closePath();
	ctx.fill();
}

function renderEngineHousing(ctx, W, L) {
	const grad = ctx.createLinearGradient(-W / 4 - 4, 0, W / 4 + 4, 0);
	grad.addColorStop(0, '#445');
	grad.addColorStop(0.3, '#778');
	grad.addColorStop(0.5, '#889');
	grad.addColorStop(0.7, '#778');
	grad.addColorStop(1, '#445');
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.moveTo(-W / 4, -L / 2 + 8);
	ctx.lineTo(W / 4, -L / 2 + 8);
	ctx.lineTo(W / 4 + 4, -L / 2 - 4);
	ctx.lineTo(-W / 4 - 4, -L / 2 - 4);
	ctx.closePath();
	ctx.fill();
}

function renderCockpit(ctx, W, L, ship) {
	const cockpitR = 4;
	const cockpitY = L / 4;
	const lsRatio = ship.lifeSupport / LIFE_SUPPORT_MAX;
	// Outer glow when lit
	if (lsRatio > 0) {
		const glowR = cockpitR + 3 + lsRatio * 4;
		const glow = ctx.createRadialGradient(
			0,
			cockpitY,
			cockpitR * 0.5,
			0,
			cockpitY,
			glowR,
		);
		glow.addColorStop(0, `rgba(80,200,255,${0.15 * lsRatio})`);
		glow.addColorStop(1, 'rgba(80,200,255,0)');
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(0, cockpitY, glowR, 0, Math.PI * 2);
		ctx.fill();
	}
	// Glass dome
	const grad = ctx.createRadialGradient(
		-1,
		cockpitY - 1,
		0,
		0,
		cockpitY,
		cockpitR,
	);
	if (lsRatio > 0) {
		grad.addColorStop(
			0,
			`rgba(${140 + Math.floor(115 * lsRatio)},${220 + Math.floor(35 * lsRatio)},255,0.8)`,
		);
		grad.addColorStop(
			0.6,
			`rgba(40,${100 + Math.floor(120 * lsRatio)},${180 + Math.floor(75 * lsRatio)},0.6)`,
		);
		grad.addColorStop(1, `rgba(20,60,${100 + Math.floor(80 * lsRatio)},0.5)`);
	} else {
		grad.addColorStop(0, 'rgba(40,40,50,0.8)');
		grad.addColorStop(1, 'rgba(20,20,30,0.6)');
	}
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.arc(0, cockpitY, cockpitR, 0, Math.PI * 2);
	ctx.fill();
	// Specular highlight
	ctx.fillStyle = `rgba(255,255,255,${lsRatio > 0 ? 0.3 : 0.05})`;
	ctx.beginPath();
	ctx.arc(-1, cockpitY - 1, cockpitR * 0.35, 0, Math.PI * 2);
	ctx.fill();
}

function renderMainDrive(ctx, W, L, firing) {
	// Nozzle at aft end
	ctx.fillStyle = '#445';
	ctx.fillRect(-W / 4, -L / 2 - 6, W / 2, 4);
	if (!firing) return;
	const mLen = flameLen(35);
	const endY = -L / 2 - 6 - mLen;
	// Outer flame
	const grad = ctx.createLinearGradient(0, -L / 2 - 6, 0, endY);
	grad.addColorStop(0, 'rgba(255,240,180,1)');
	grad.addColorStop(0.2, 'rgba(255,180,50,0.9)');
	grad.addColorStop(0.5, 'rgba(255,80,10,0.6)');
	grad.addColorStop(1, 'rgba(200,40,0,0)');
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.moveTo(-W / 4, -L / 2 - 6);
	ctx.lineTo(W / 4, -L / 2 - 6);
	ctx.lineTo(0, endY);
	ctx.closePath();
	ctx.fill();
	// Inner bright core
	const coreLen = mLen * 0.5;
	const coreEnd = -L / 2 - 6 - coreLen;
	const coreGrad = ctx.createLinearGradient(0, -L / 2 - 6, 0, coreEnd);
	coreGrad.addColorStop(0, 'rgba(255,255,255,0.8)');
	coreGrad.addColorStop(0.5, 'rgba(255,220,100,0.4)');
	coreGrad.addColorStop(1, 'rgba(255,150,50,0)');
	ctx.fillStyle = coreGrad;
	ctx.beginPath();
	ctx.moveTo(-W / 8, -L / 2 - 6);
	ctx.lineTo(W / 8, -L / 2 - 6);
	ctx.lineTo(0, coreEnd);
	ctx.closePath();
	ctx.fill();
}

// Ship-local coordinate convention: +X = starboard, +Y = forward
// The ctx.transform swaps canvas axes so drawing code uses this convention.
export function renderShip(ctx, cx, cy, ship, thrusters) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(ship.angle);
	ctx.transform(0, 1, 1, 0, 0, 0); // swap axes: +X=starboard, +Y=forward

	const W = ship.width; // beam (starboard extent)
	const L = ship.length; // length (forward extent)

	// Main drive at aft
	renderMainDrive(ctx, W, L - 3, thrusters.mainDrive);

	renderHull(ctx, W, L);
	renderNoseCone(ctx, W, L);
	renderEngineHousing(ctx, W, L);
	renderCockpit(ctx, W, L, ship);

	// RCS thrusters — (x=starboard, y=forward, degrees, isFiring)
	const thrusterX = W / 2 - 3;
	const thrusterY = L / 2 - 10;

	// 0°=starboard, 90°=forward, 180°=port, 270°=aft
	// Fore pair (fire forward to brake)
	renderRcsThruster(ctx, -thrusterX, thrusterY, 90, thrusters.frontBrk);
	renderRcsThruster(ctx, thrusterX, thrusterY, 90, thrusters.frontBrk);
	// Aft pair (fire backward to accelerate)
	renderRcsThruster(ctx, -thrusterX, -thrusterY, 270, thrusters.rearFwd);
	renderRcsThruster(ctx, thrusterX, -thrusterY, 270, thrusters.rearFwd);
	// Port lateral pair (fire to port, push ship starboard)
	renderRcsThruster(
		ctx,
		-thrusterX - 1,
		thrusterY,
		180,
		thrusters.leftR || thrusters.rotateCW,
	);
	renderRcsThruster(
		ctx,
		-thrusterX - 1,
		-thrusterY,
		180,
		thrusters.leftR || thrusters.rotateCCW,
	);
	// Starboard lateral pair (fire to starboard, push ship port)
	renderRcsThruster(
		ctx,
		thrusterX + 1,
		thrusterY,
		0,
		thrusters.rightL || thrusters.rotateCCW,
	);
	renderRcsThruster(
		ctx,
		thrusterX + 1,
		-thrusterY,
		0,
		thrusters.rightL || thrusters.rotateCW,
	);

	ctx.restore();
}


export function renderTrajectory(ctx, cx, cy, ship, visibleObjects) {
	const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
	if (speed < 2) return;

	// Collect nearby planets for gravity simulation
	const planets = [];
	for (const obj of visibleObjects) {
		if (obj.type === 'planet') planets.push(obj);
	}

	// Simulate forward with fixed timestep
	const simDt = 0.02;
	const steps = 400;
	let px = ship.x;
	let py = ship.y;
	let pvx = ship.vx;
	let pvy = ship.vy;

	ctx.beginPath();
	ctx.moveTo(cx, cy);

	for (let i = 1; i <= steps; i++) {
		// Apply gravity from all planets
		for (const planet of planets) {
			const dx = planet.x - px;
			const dy = planet.y - py;
			const distSq = dx * dx + dy * dy;
			const dist = Math.sqrt(distSq);
			const gravRange = planet.radius * GRAVITY_RANGE_MULT;
			if (dist < 5 || dist > gravRange) continue;
			const G = planet.radius * planet.radius * GRAVITY_STRENGTH;
			const force = G / distSq;
			pvx += (dx / dist) * force * simDt;
			pvy += (dy / dist) * force * simDt;
		}

		// Integrate position
		px += pvx * simDt;
		py += pvy * simDt;

		// Draw segments in batches with fading opacity and width
		if (i % 2 === 0) {
			const t = i / steps;
			const alpha = 0.6 * (1 - t);
			const width = 3 * (1 - t * 0.7);
			const screenX = cx + (px - ship.x);
			const screenY = cy + (py - ship.y);
			ctx.lineWidth = width;
			ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(screenX, screenY);
		} else {
			ctx.lineTo(cx + (px - ship.x), cy + (py - ship.y));
		}
	}
	ctx.stroke();
}

export function renderOrbitalVector(ctx, cx, cy, ship, visibleObjects) {
	// Find the closest planet whose gravity range the ship is inside
	let closest = null;
	let closestDist = Infinity;
	for (const obj of visibleObjects) {
		if (obj.type !== 'planet') continue;
		const dx = obj.x - ship.x;
		const dy = obj.y - ship.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const gravRange = obj.radius * GRAVITY_RANGE_MULT;
		if (dist < gravRange && dist > obj.radius && dist < closestDist) {
			closest = obj;
			closestDist = dist;
		}
	}
	if (!closest) return;

	// Circular orbit speed: v = sqrt(μ / r) where μ = radius² * GRAVITY_STRENGTH
	const mu = closest.radius * closest.radius * GRAVITY_STRENGTH;
	const orbitalSpeed = Math.sqrt(mu / closestDist);

	// Direction from planet to ship
	const dx = ship.x - closest.x;
	const dy = ship.y - closest.y;
	const nx = dx / closestDist;
	const ny = dy / closestDist;

	// Two perpendicular tangent directions (prograde / retrograde)
	const tx1 = -ny;
	const ty1 = nx;

	// Pick the tangent direction closest to current velocity
	const dot = ship.vx * tx1 + ship.vy * ty1;
	const tx = dot >= 0 ? tx1 : -tx1;
	const ty = dot >= 0 ? ty1 : -ty1;

	// Draw the orbital velocity vector
	const lineLen = Math.min(300, orbitalSpeed * 1.5);
	ctx.strokeStyle = 'rgba(255,220,50,0.5)';
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx + tx * lineLen, cy + ty * lineLen);
	ctx.stroke();
	ctx.setLineDash([]);
}

function isTakingDamage(ship) {
	return !ship.dead && (ship.insidePlanet || ship.insideDebris);
}

/** Enter ship-local space and trace the silhouette of hull + nose cone + engine housing. */
function traceShipSilhouette(ctx, cx, cy, ship) {
	const W = ship.width;
	const L = ship.length;
	ctx.translate(cx, cy);
	ctx.rotate(ship.angle);
	ctx.transform(0, 1, 1, 0, 0, 0); // swap axes: +X=starboard, +Y=forward

	// Matches renderHull, renderNoseCone and renderEngineHousing
	ctx.beginPath();
	ctx.moveTo(0, L / 2 + 10);
	ctx.lineTo(W / 2, L / 2 - 8);
	ctx.lineTo(W / 2, -L / 2 + 8);
	ctx.lineTo(W / 4, -L / 2 + 8);
	ctx.lineTo(W / 4 + 4, -L / 2 - 4);
	ctx.lineTo(-W / 4 - 4, -L / 2 - 4);
	ctx.lineTo(-W / 4, -L / 2 + 8);
	ctx.lineTo(-W / 2, -L / 2 + 8);
	ctx.lineTo(-W / 2, L / 2 - 8);
	ctx.closePath();
}

/**
 * Red outline around the ship while it takes damage. Drawn in world space just before the
 * ship, so the ship covers the inner half of the stroke and only a border shows outside it.
 */
export function renderDamageFlash(ctx, cx, cy, ship, zoom) {
	if (!isTakingDamage(ship)) return;
	ctx.save();
	traceShipSilhouette(ctx, cx, cy, ship);
	ctx.strokeStyle = ship.insidePlanet ? 'rgba(255,80,0,0.9)' : 'rgba(255,0,0,0.8)';
	ctx.lineJoin = 'round';
	// Divide by zoom so the border keeps the same on-screen thickness (3px outside the hull)
	ctx.lineWidth = 6 / zoom;
	ctx.stroke();
	ctx.restore();
}

/** Blinking red tint over the ship, inside the damage border. Drawn just after the ship. */
export function renderDamageTint(ctx, cx, cy, ship, gameTime) {
	if (!isTakingDamage(ship)) return;
	// On for the first half of each 0.25s cycle (4 flashes per second); gameTime stops while paused
	if ((gameTime * 4) % 1 >= 0.5) return;
	ctx.save();
	traceShipSilhouette(ctx, cx, cy, ship);
	ctx.fillStyle = ship.insidePlanet ? 'rgba(255,80,0,0.45)' : 'rgba(255,0,0,0.4)';
	ctx.fill();
	ctx.restore();
}

/**
 * Thick purple fuel line from each station that is pumping fuel to the ship, with stripes
 * flowing toward the ship. Drawn before space objects so the station and ship cover its ends.
 */
export function renderRefuelLines(ctx, cx, cy, ship, gameTime) {
	if (ship.dead || !ship.refuelStations || ship.refuelStations.length === 0) return;
	ctx.save();
	ctx.lineCap = 'butt';
	ctx.lineWidth = 8;
	for (const st of ship.refuelStations) {
		ctx.beginPath();
		ctx.moveTo(cx + (st.x - ship.x), cy + (st.y - ship.y));
		ctx.lineTo(cx, cy);

		ctx.setLineDash([]);
		ctx.strokeStyle = 'rgba(150,60,255,0.85)';
		ctx.stroke();

		// The path runs station -> ship; a falling dash offset moves the stripes along it
		ctx.setLineDash([8, 12]);
		ctx.lineDashOffset = -gameTime * 60;
		ctx.strokeStyle = 'rgba(225,190,255,0.9)';
		ctx.stroke();
	}
	ctx.restore();
}
