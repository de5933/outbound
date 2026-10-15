import {
	MINIMAP_SIZE, MINIMAP_PADDING, MINIMAP_RANGE, CHUNK_SIZE,
	HB_WIDTH, HB_HEIGHT,
	GRAVITY_RANGE_MULT, TEXT_COLOR, SHIP_LENGTH,
} from './constants.js';
import { addClickRegion } from './input.js';
import { levelReqs, stationPopulation, getStationMenuItems, getScienceEntries, getStationScienceEntries, shipCargoUsed, shipCargoCapacity, shipFuelMax, shipO2Max, lookupStationName, stationMaxDockSpeed } from './objects/station.js';

/** Build an rgba() string from the global TEXT_COLOR with a given alpha. */
function textColor(alpha) {
	return `rgba(${TEXT_COLOR[0]},${TEXT_COLOR[1]},${TEXT_COLOR[2]},${alpha})`;
}

function renderMinimapBlip(ctx, px, py, obj, alpha, mmScale) {
	if (obj.type === 'asteroid') {
		ctx.fillStyle = `rgba(160,140,120,${alpha})`;
		ctx.beginPath();
		ctx.arc(px, py, Math.max(1, obj.radius * mmScale), 0, Math.PI * 2);
		ctx.fill();
	} else if (obj.type === 'planet') {
		ctx.fillStyle = obj.color1;
		ctx.globalAlpha = alpha;
		ctx.beginPath();
		ctx.arc(px, py, Math.max(2, obj.radius * mmScale), 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
	} else if (obj.type === 'station') {
		const lvl = obj.level || 1;
		const blipSize = 2 + Math.min(lvl - 1, 4);  // grows from 2 to 6
		const bright = Math.min(1, 0.7 + (lvl - 1) * 0.06);
		ctx.fillStyle = `rgba(180,180,220,${alpha * bright})`;
		ctx.fillRect(px - blipSize / 2, py - blipSize / 2, blipSize, blipSize);
		// Level 3+ : tiny glow ring
		if (lvl >= 3) {
			ctx.strokeStyle = `rgba(100,180,255,${alpha * 0.3})`;
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.arc(px, py, blipSize + 2, 0, Math.PI * 2);
			ctx.stroke();
		}
	} else if (obj.type === 'debris') {
		ctx.fillStyle = `rgba(120,110,100,${alpha * 0.6})`;
		ctx.fillRect(px - 1, py - 1, 2, 2);
	}
}

export function renderMinimap(ctx, canvas, visibleObjects, ship, generateChunk) {
	const mmX = canvas.width - MINIMAP_SIZE - MINIMAP_PADDING;
	const mmY = MINIMAP_PADDING;
	const mmScale = MINIMAP_SIZE / (MINIMAP_RANGE * 2);
	const mmCx = mmX + MINIMAP_SIZE / 2;
	const mmCy = mmY + MINIMAP_SIZE / 2;
	const mmR = MINIMAP_SIZE / 2;

	// Background
	ctx.fillStyle = 'rgba(0,0,0,0.6)';
	ctx.strokeStyle = 'rgba(80,180,255,0.3)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(mmCx, mmCy, mmR, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	// Clip to circle
	ctx.save();
	ctx.beginPath();
	ctx.arc(mmCx, mmCy, mmR - 1, 0, Math.PI * 2);
	ctx.clip();

	// Visible objects
	for (const obj of visibleObjects) {
		const dx = (obj.x - ship.x) * mmScale;
		const dy = (obj.y - ship.y) * mmScale;
		if (dx * dx + dy * dy > mmR * mmR) continue;
		renderMinimapBlip(ctx, mmCx + dx, mmCy + dy, obj, 0.7, mmScale);
	}

	// Extended range objects
	const mmHalf = MINIMAP_RANGE;
	const mmMinCX = Math.floor((ship.x - mmHalf) / CHUNK_SIZE);
	const mmMaxCX = Math.floor((ship.x + mmHalf) / CHUNK_SIZE);
	const mmMinCY = Math.floor((ship.y - mmHalf) / CHUNK_SIZE);
	const mmMaxCY = Math.floor((ship.y + mmHalf) / CHUNK_SIZE);
	for (let chx = mmMinCX; chx <= mmMaxCX; chx++) {
		for (let chy = mmMinCY; chy <= mmMaxCY; chy++) {
			const objs = generateChunk(chx, chy);
			for (const obj of objs) {
				const dx = (obj.x - ship.x) * mmScale;
				const dy = (obj.y - ship.y) * mmScale;
				if (dx * dx + dy * dy > mmR * mmR) continue;
				const screenDx = Math.abs(obj.x - ship.x);
				const screenDy = Math.abs(obj.y - ship.y);
				const r = obj.radius || obj.size || 60;
				if (
					screenDx < canvas.width / 2 + 200 + r &&
					screenDy < canvas.height / 2 + 200 + r
				)
					continue;
				renderMinimapBlip(ctx, mmCx + dx, mmCy + dy, obj, 0.4, mmScale);
			}
		}
	}

	ctx.restore();

	// Ship indicator
	ctx.save();
	ctx.translate(mmCx, mmCy);
	ctx.rotate(ship.angle);
	ctx.fillStyle = '#0f0';
	ctx.beginPath();
	ctx.moveTo(5, 0);
	ctx.lineTo(-3, -3);
	ctx.lineTo(-3, 3);
	ctx.closePath();
	ctx.fill();
	ctx.restore();

	// Velocity vector
	const vLen = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
	if (vLen > 5) {
		const vScale = Math.min(MINIMAP_SIZE / 3, vLen * mmScale * 8);
		ctx.strokeStyle = 'rgba(0,255,0,0.4)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(mmCx, mmCy);
		ctx.lineTo(
			mmCx + (ship.vx / vLen) * vScale,
			mmCy + (ship.vy / vLen) * vScale,
		);
		ctx.stroke();
	}
}

export function renderHealthBar(ctx, canvas, ship) {
	const hbX = (canvas.width - HB_WIDTH) / 2;
	const hbY = canvas.height - 40;
	const hpRatio = ship.hp / ship.maxHp;

	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	ctx.fillRect(hbX - 1, hbY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	ctx.fillStyle = 'rgb(187, 62, 62)';
	ctx.fillRect(hbX, hbY, HB_WIDTH * hpRatio, HB_HEIGHT);

	ctx.strokeStyle = 'rgba(255,255,255,0.3)';
	ctx.lineWidth = 1;
	ctx.strokeRect(hbX - 1, hbY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	ctx.fillStyle = textColor(0.5);
	ctx.font = '9px "Courier New", monospace';
	ctx.textAlign = 'right';
	ctx.fillText('HULL', hbX - 5, hbY + HB_HEIGHT - 1);
	ctx.textAlign = 'start';
}

export function renderFuelBar(ctx, canvas, ship) {
	const fbX = (canvas.width - HB_WIDTH) / 2;
	const fbY = canvas.height - 56;
	const fuelRatio = ship.fuel / shipFuelMax(ship);

	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	ctx.fillRect(fbX - 1, fbY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	ctx.fillStyle = ship.refueling ? '#c8f' : '#a4f';
	ctx.fillRect(fbX, fbY, HB_WIDTH * fuelRatio, HB_HEIGHT);

	ctx.strokeStyle = 'rgba(255,255,255,0.3)';
	ctx.lineWidth = 1;
	ctx.strokeRect(fbX - 1, fbY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	// Label
	ctx.fillStyle = textColor(0.5);
	ctx.font = '9px "Courier New", monospace';
	ctx.textAlign = 'right';
	ctx.fillText('FUEL', fbX - 5, fbY + HB_HEIGHT - 1);
	ctx.textAlign = 'start';
}

export function renderLifeSupportBar(ctx, canvas, ship) {
	const lsX = (canvas.width - HB_WIDTH) / 2;
	const lsY = canvas.height - 72;
	const lsRatio = ship.lifeSupport / shipO2Max(ship);

	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	ctx.fillRect(lsX - 1, lsY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	let lsColor;
	if (ship.refueling && ship.lifeSupport < shipO2Max(ship)) lsColor = '#4fa';
	else if (lsRatio > 0.4) lsColor = '#0c8';
	else if (lsRatio > 0.15) lsColor = '#f80';
	else lsColor = '#f44';
	ctx.fillStyle = lsColor;
	ctx.fillRect(lsX, lsY, HB_WIDTH * lsRatio, HB_HEIGHT);

	ctx.strokeStyle = 'rgba(255,255,255,0.3)';
	ctx.lineWidth = 1;
	ctx.strokeRect(lsX - 1, lsY - 1, HB_WIDTH + 2, HB_HEIGHT + 2);

	ctx.fillStyle = textColor(0.5);
	ctx.font = '9px "Courier New", monospace';
	ctx.textAlign = 'right';
	ctx.fillText('O\u2082', lsX - 5, lsY + HB_HEIGHT - 1);
	ctx.textAlign = 'start';
}

/**
 * Draw a triangular flask (Erlenmeyer) icon filled 3/4 with liquid.
 * @param {number} fx - center x of the flask
 * @param {number} fy - center y (vertically centered on the flask)
 * @param {number} size - height of the flask
 * @param {string} liquidColor - CSS color for the liquid fill
 * @param {number} alpha - overall opacity
 */
function drawFlask(ctx, fx, fy, size, liquidColor, alpha) {
	const h = size;
	const halfTop = h * 0.18;   // half-width of the narrow neck
	const halfBot = h * 0.42;   // half-width of the wide bottom
	const neckH = h * 0.28;     // height of the neck portion
	const top = fy - h / 2;
	const bot = fy + h / 2;
	const neckBot = top + neckH; // where the neck meets the body

	ctx.save();
	ctx.globalAlpha = alpha;

	// Liquid fill — clipped to the flask shape, always 3/4 full
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(fx - halfTop, top);
	ctx.lineTo(fx + halfTop, top);
	ctx.lineTo(fx + halfTop, neckBot);
	ctx.lineTo(fx + halfBot, bot);
	ctx.lineTo(fx - halfBot, bot);
	ctx.lineTo(fx - halfTop, neckBot);
	ctx.closePath();
	ctx.clip();

	const liquidTop = bot - (bot - top) * 0.75;
	ctx.fillStyle = liquidColor;
	ctx.fillRect(fx - halfBot, liquidTop, halfBot * 2, bot - liquidTop);
	ctx.restore();

	// Flask outline
	ctx.strokeStyle = textColor(alpha);
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.moveTo(fx - halfTop, top);
	ctx.lineTo(fx + halfTop, top);
	ctx.lineTo(fx + halfTop, neckBot);
	ctx.lineTo(fx + halfBot, bot);
	ctx.lineTo(fx - halfBot, bot);
	ctx.lineTo(fx - halfTop, neckBot);
	ctx.closePath();
	ctx.stroke();

	// Small rim at the top
	ctx.beginPath();
	ctx.moveTo(fx - halfTop - 1.5, top);
	ctx.lineTo(fx + halfTop + 1.5, top);
	ctx.stroke();

	ctx.restore();
}

/**
 * Draw a hexagonal gem icon with a facet highlight.
 * @param {number} gx - center x
 * @param {number} gy - center y
 * @param {number} size - overall height
 * @param {string} color - CSS fill color
 * @param {number} alpha - overall opacity
 */
function drawGem(ctx, gx, gy, size, color, alpha) {
	const h = size;
	const w = h * 0.7;

	// Diamond shape: narrow flat top, wide middle, pointed bottom
	const topY = gy - h * 0.5;
	const shoulderY = gy - h * 0.15;
	const botY = gy + h * 0.5;

	ctx.save();
	ctx.globalAlpha = alpha;

	// Main body fill
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(gx - w * 0.35, topY);         // top-left
	ctx.lineTo(gx + w * 0.35, topY);         // top-right
	ctx.lineTo(gx + w * 0.5, shoulderY);     // right shoulder
	ctx.lineTo(gx, botY);                     // bottom point
	ctx.lineTo(gx - w * 0.5, shoulderY);     // left shoulder
	ctx.closePath();
	ctx.fill();

	// Highlight facet (left face, lighter)
	ctx.fillStyle = 'rgba(255,255,255,0.15)';
	ctx.beginPath();
	ctx.moveTo(gx - w * 0.35, topY);
	ctx.lineTo(gx, topY);
	ctx.lineTo(gx, botY);
	ctx.lineTo(gx - w * 0.5, shoulderY);
	ctx.closePath();
	ctx.fill();

	// Outline
	ctx.strokeStyle = textColor(alpha);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(gx - w * 0.35, topY);
	ctx.lineTo(gx + w * 0.35, topY);
	ctx.lineTo(gx + w * 0.5, shoulderY);
	ctx.lineTo(gx, botY);
	ctx.lineTo(gx - w * 0.5, shoulderY);
	ctx.closePath();
	ctx.stroke();

	// Crown line (horizontal across shoulders)
	ctx.beginPath();
	ctx.moveTo(gx - w * 0.5, shoulderY);
	ctx.lineTo(gx + w * 0.5, shoulderY);
	ctx.stroke();

	// Center facet line
	ctx.beginPath();
	ctx.moveTo(gx, topY);
	ctx.lineTo(gx, botY);
	ctx.stroke();

	ctx.restore();
}

/**
 * Draw a small box (cargo crate) icon with a center band.
 */
function drawCargoBox(ctx, bx, by, size, alpha) {
	const w = size;
	const h = size * 0.85;
	const x0 = bx - w / 2;
	const y0 = by - h / 2;

	ctx.save();
	ctx.globalAlpha = alpha;

	ctx.fillStyle = 'rgba(180,140,90,0.5)';
	ctx.fillRect(x0, y0, w, h);

	ctx.strokeStyle = textColor(alpha);
	ctx.lineWidth = 1.2;
	ctx.strokeRect(x0, y0, w, h);

	// Center horizontal band (strap)
	ctx.beginPath();
	ctx.moveTo(x0, by);
	ctx.lineTo(x0 + w, by);
	ctx.stroke();
	// Center vertical band (strap)
	ctx.beginPath();
	ctx.moveTo(bx, y0);
	ctx.lineTo(bx, y0 + h);
	ctx.stroke();

	ctx.restore();
}

export function renderScienceIndicator(ctx, canvas, ship, visibleObjects, gameTime) {
	if (ship.dead) return;
	const entries = Object.values(ship.science).filter(e => e.amount > 0);
	const hasMinerals = ship.minerals >= 1;
	const hasCargo = ship.cargo.length > 0;
	const hasAnything = entries.length || hasMinerals || hasCargo;
	if (!hasAnything) return;

	const x = 16;
	const lineH = 22;
	const flaskSize = 16;

	// Count lines: hold header + science header + science entries + minerals + cargo entries
	let totalLines = 1; // cargo hold line
	if (entries.length) totalLines += 1 + entries.length;
	if (hasMinerals) totalLines += 1;
	if (hasCargo) totalLines += ship.cargo.length;
	let y = canvas.height - 24 - totalLines * lineH;

	ctx.font = 'bold 13px "Courier New", monospace';
	ctx.textAlign = 'left';

	// Cargo hold capacity
	const used = shipCargoUsed(ship);
	const pct = used / shipCargoCapacity(ship);
	ctx.fillStyle = pct > 0.9 ? 'rgba(255,100,100,0.9)' : textColor(0.9);
	ctx.fillText(`Hold ${Math.floor(used)}/${shipCargoCapacity(ship)}`, x, y);
	y += lineH;

	// Science section
	if (entries.length) {
		ctx.fillStyle = textColor(0.8);
		ctx.fillText('Science', x, y);
		y += lineH;

		for (const entry of entries) {
			const active = ship.gatheringScience && ship.gatheringScience.includes(`${entry.planetX},${entry.planetY}`);
			const alpha = active ? 0.85 + Math.sin(gameTime * 3) * 0.15 : 0.8;
			const color = entry.planetColor || 'rgb(180,140,255)';
			drawFlask(ctx, x + 8, y - flaskSize / 2 + 2, flaskSize, color, alpha);
			ctx.fillStyle = textColor(alpha);
			ctx.fillText(`${entry.planetName}  ${Math.floor(entry.amount)}`, x + 22, y);
			y += lineH;
		}
	}

	// Minerals section
	if (hasMinerals) {
		const minAlpha = ship.gatheringMinerals ? 0.85 + Math.sin(gameTime * 3) * 0.15 : 0.8;
		drawGem(ctx, x + 8, y - 4, 16, 'rgb(220,160,60)', minAlpha);
		ctx.fillStyle = `rgba(220,160,60,${minAlpha})`;
		ctx.fillText(`Minerals  ${Math.floor(ship.minerals)}`, x + 22, y);
		y += lineH;
	}

	// Cargo section
	if (hasCargo) {
		for (const c of ship.cargo) {
			drawCargoBox(ctx, x + 8, y - 4, 14, 0.8);
			ctx.fillStyle = textColor(0.8);
			ctx.fillText(`${lookupStationName(c.destId, c.destName)}  ${Math.floor(c.amount)}`, x + 22, y);
			y += lineH;
		}
	}
}

/** Drawn in screen space so the text keeps its size at any zoom. */
export function renderScienceCounter(ctx, cx, cy, ship, gameTime, zoom) {
	const hasScience = ship.gatheringScience && ship.gatheringScience.length > 0;
	const hasMinerals = ship.gatheringMinerals;
	if ((!hasScience && !hasMinerals) || ship.dead) return;
	const pulse = 0.7 + Math.sin(gameTime * 3) * 0.3;
	ctx.save();
	const lineHeight = 24;
	const iconSize = 16;
	ctx.font = 'bold 18px "Courier New", monospace';
	ctx.textAlign = 'center';
	// Text stays centered on the ship; each icon hangs off its line's left edge, so a long
	// planet name pushes the icon out instead of running into it
	const iconXFor = (text) => cx - ctx.measureText(text).width / 2 - 8 - iconSize / 2;
	const totalItems = (hasScience ? ship.gatheringScience.length : 0) + (hasMinerals ? 1 : 0);
	// Only the ship's on-screen size follows zoom. The nose cone tip sits 10 past half its
	// length (renderNoseCone), which clears the ship at any rotation. The cargo bar and its
	// label hang below the last text line, so lift past them too.
	const shipTop = cy - (SHIP_LENGTH / 2 + 10) * zoom;
	const belowLastLine = hasMinerals ? 30 : 0;
	let y = shipTop - 16 - belowLastLine - (totalItems - 1) * lineHeight;

	if (hasScience) {
		for (const pKey of ship.gatheringScience) {
			const entry = ship.science[pKey];
			if (!entry) continue;
			const color = entry.planetColor || 'rgb(180,140,255)';
			const text = `${entry.planetName} Science ${Math.floor(entry.amount)}`;
			drawFlask(ctx, iconXFor(text), y - 6, iconSize, color, pulse);
			ctx.fillStyle = textColor(pulse);
			ctx.fillText(text, cx, y);
			y += lineHeight;
		}
	}

	if (hasMinerals) {
		const text = `Minerals ${Math.floor(ship.minerals)}`;
		drawGem(ctx, iconXFor(text), y - 6, iconSize, 'rgb(220,160,60)', pulse);
		ctx.fillStyle = `rgba(220,160,60,${pulse})`;
		ctx.fillText(text, cx, y);
		y += 12;

		// Cargo capacity bar
		const used = shipCargoUsed(ship);
		const pct = used / shipCargoCapacity(ship);
		const barW = 160;
		const barH = 6;
		const barX = cx - barW / 2;
		const barPulse = 0.6 + Math.sin(gameTime * 4) * 0.15;

		ctx.fillStyle = 'rgba(30,40,60,0.8)';
		ctx.fillRect(barX, y, barW, barH);

		const fillColor = pct > 0.9 ? `rgba(255,80,80,${barPulse})` : `rgba(220,160,60,${barPulse})`;
		ctx.fillStyle = fillColor;
		ctx.fillRect(barX, y, barW * pct, barH);

		ctx.strokeStyle = `rgba(220,160,60,${barPulse * 0.5})`;
		ctx.lineWidth = 0.5;
		ctx.strokeRect(barX, y, barW, barH);

		// Label
		ctx.font = '10px "Courier New", monospace';
		ctx.fillStyle = textColor(barPulse);
		ctx.fillText(`${Math.floor(used)}/${shipCargoCapacity(ship)}`, cx, y + barH + 12);

		y += 34;
	}

	ctx.restore();
}

export function renderGameOver(ctx, cx, cy, ship) {
	// Explosion flash (hull death only)
	if (ship.deathCause === 'VESSEL DESTROYED' && ship.deathTime < 0.3) {
		const flashAlpha = (1 - ship.deathTime / 0.3) * 0.5;
		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150);
		grad.addColorStop(0, `rgba(255,200,50,${flashAlpha})`);
		grad.addColorStop(0.5, `rgba(255,100,20,${flashAlpha * 0.5})`);
		grad.addColorStop(1, 'rgba(255,50,0,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(cx - 150, cy - 150, 300, 300);
	}
}

export function renderInteractPrompt(ctx, cx, cy, ship, gameTime) {
	if (ship.dead || ship.interacting) return;
	if (!ship.nearStation) return;
	// Show "Press F to interact" near ship
	const pulse = 0.6 + Math.sin(gameTime * 4) * 0.2;
	ctx.fillStyle = textColor(pulse);
	ctx.font = '13px "Courier New", monospace';
	ctx.textAlign = 'center';
	if (ship.nearStation.type === 'starship') {
		ctx.fillText(ship.dockedWithRamjet ? '[F] Detach Ramjet' : '[F] Attach Ramjet', cx, cy - 50);
	} else {
		const maxDock = stationMaxDockSpeed(ship.nearStation);
		const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
		const ok = speed <= maxDock;
		if (!ok) ctx.fillStyle = `rgba(255,140,140,${pulse})`;
		ctx.fillText(`[F] Dock — max ${Math.round(maxDock)} u/s`, cx, cy - 50);
	}
	ctx.textAlign = 'start';
}

export function renderInventory(ctx, canvas, ship, gameTime) {
	if (!ship.inventoryOpen) return;

	const menuW = 340;
	const sciEntries = Object.values(ship.science).filter(e => e.amount > 0);
	const holdItems = [];
	if (ship.minerals > 0) holdItems.push({ type: 'minerals', label: 'Minerals', amount: Math.floor(ship.minerals) });
	for (const c of ship.cargo) holdItems.push({ type: 'cargo', label: `Cargo \u2192 ${lookupStationName(c.destId, c.destName)}`, amount: c.amount });
	if (ship.hasStationCore) holdItems.push({ type: 'core', label: 'Station Core', amount: 1 });
	// Starship components
	const comps = ship.starshipComponents || {};
	const compNames = ['Structure', 'Collector', 'Engine', 'Shielding'];
	for (const c of compNames) {
		if (comps[c]) holdItems.push({ type: 'component', label: `Ramjet: ${c}`, amount: 1, compName: c });
	}
	const hasAllComps = compNames.every(c => comps[c]);
	if (hasAllComps) holdItems.push({ type: 'assemble', label: 'Assemble Starship', amount: 0 });
	if (ship.dockedWithRamjet) {
		holdItems.push({ type: 'launch-interstellar', label: 'Enter Interstellar Space', amount: 0 });
		holdItems.push({ type: 'salvage-ramjet', label: 'Salvage Ramjet', amount: 0 });
	}

	const sciLines = sciEntries.length ? sciEntries.length + 1 : 1;
	const holdLines = holdItems.length ? holdItems.length + 1 : 2;
	const totalLines = sciLines + holdLines + 1;
	const menuH = 80 + totalLines * 20;
	const menuX = (canvas.width - menuW) / 2;
	const menuY = (canvas.height - menuH) / 2;

	// Dim background
	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Panel
	ctx.fillStyle = 'rgba(10,15,30,0.95)';
	ctx.fillRect(menuX, menuY, menuW, menuH);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)';
	ctx.lineWidth = 1;
	ctx.strokeRect(menuX, menuY, menuW, menuH);

	// Corner accents
	const accentLen = 12;
	ctx.strokeStyle = 'rgba(80,180,255,0.9)';
	ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(menuX, menuY + accentLen); ctx.lineTo(menuX, menuY); ctx.lineTo(menuX + accentLen, menuY); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX + menuW - accentLen, menuY); ctx.lineTo(menuX + menuW, menuY); ctx.lineTo(menuX + menuW, menuY + accentLen); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX, menuY + menuH - accentLen); ctx.lineTo(menuX, menuY + menuH); ctx.lineTo(menuX + accentLen, menuY + menuH); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX + menuW - accentLen, menuY + menuH); ctx.lineTo(menuX + menuW, menuY + menuH); ctx.lineTo(menuX + menuW, menuY + menuH - accentLen); ctx.stroke();

	// Title
	ctx.fillStyle = textColor(1);
	ctx.font = 'bold 18px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText('Inventory', menuX + menuW / 2, menuY + 30);
	ctx.textAlign = 'left';

	const leftCol = menuX + 24;
	let y = menuY + 56;

	// --- Science section ---
	ctx.font = 'bold 13px "Courier New", monospace';
	ctx.fillStyle = textColor(0.6);
	ctx.fillText('Science', leftCol, y);
	y += 20;

	ctx.font = '12px "Courier New", monospace';
	if (sciEntries.length) {
		for (const entry of sciEntries) {
			const color = entry.planetColor || 'rgb(180,140,255)';
			drawFlask(ctx, leftCol + 6, y - 5, 12, color, 0.7);
			ctx.fillStyle = textColor(0.8);
			ctx.fillText(`${entry.planetName}`, leftCol + 18, y);
			ctx.textAlign = 'right';
			ctx.fillText(`${Math.floor(entry.amount)}`, menuX + menuW - 24, y);
			ctx.textAlign = 'left';
			y += 20;
		}
	} else {
		ctx.fillStyle = textColor(0.4);
		ctx.fillText('  None', leftCol, y);
		y += 20;
	}

	// Divider
	ctx.strokeStyle = 'rgba(80,180,255,0.15)';
	ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(menuX + 20, y - 6); ctx.lineTo(menuX + menuW - 20, y - 6); ctx.stroke();

	// --- Hold section ---
	const used = shipCargoUsed(ship);
	ctx.font = 'bold 13px "Courier New", monospace';
	ctx.fillStyle = textColor(0.6);
	ctx.fillText(`Hold (${Math.floor(used)}/${shipCargoCapacity(ship)})`, leftCol, y);
	y += 20;

	ctx.font = '12px "Courier New", monospace';
	if (holdItems.length) {
		for (let i = 0; i < holdItems.length; i++) {
			const item = holdItems[i];
			const isSel = i === ship.inventoryIndex;
			if (!ship.deployConfirm) addClickRegion(leftCol - 4, y - 14, menuW - 40, 20, () => { ship.inventoryIndex = i; });

			if (isSel) {
				const rowH = 16;
				const pulse = 0.15 + Math.sin(gameTime * 4) * 0.05;
				ctx.fillStyle = `rgba(80,180,255,${pulse})`;
				ctx.fillRect(leftCol - 4, y - rowH + 4, menuW - 40, rowH);
				ctx.fillStyle = textColor(0.95);
			} else {
				ctx.fillStyle = textColor(0.7);
			}

			// Icon
			if (item.type === 'minerals') {
				drawGem(ctx, leftCol + (isSel ? 8 : 6), y - 5, 10, 'rgb(220,160,60)', isSel ? 0.9 : 0.6);
			} else if (item.type === 'cargo') {
				drawCargoBox(ctx, leftCol + (isSel ? 8 : 6), y - 5, 10, isSel ? 0.9 : 0.6);
			} else if (item.type === 'core') {
				// no special icon
			}

			const prefix = isSel ? '\u25B6 ' : '  ';
			const iconOffset = (item.type === 'minerals' || item.type === 'cargo') ? 14 : 0;
			ctx.fillText(`${prefix}${item.label}`, leftCol + iconOffset, y);
			ctx.textAlign = 'right';
			ctx.fillStyle = textColor(isSel ? 0.9 : 0.5);
			ctx.fillText(`${Math.floor(item.amount)}`, menuX + menuW - 24, y);
			ctx.textAlign = 'left';
			y += 20;
		}
	} else {
		ctx.fillStyle = textColor(0.4);
		ctx.fillText('  Empty', leftCol, y);
		y += 20;
	}

	// Deploy confirmation overlay
	if (ship.deployConfirm) {
		const dlgW = 280;
		const dlgH = 60;
		const dlgX = menuX + (menuW - dlgW) / 2;
		const dlgY = menuY + menuH - 90;

		ctx.fillStyle = 'rgba(10,15,30,0.95)';
		ctx.fillRect(dlgX, dlgY, dlgW, dlgH);
		ctx.strokeStyle = 'rgba(255,200,80,0.7)';
		ctx.lineWidth = 1;
		ctx.strokeRect(dlgX, dlgY, dlgW, dlgH);

		ctx.fillStyle = textColor(0.95);
		ctx.font = 'bold 12px "Courier New", monospace';
		ctx.textAlign = 'center';
		ctx.fillText('Deploy Station Core here?', dlgX + dlgW / 2, dlgY + 22);
		ctx.font = '11px "Courier New", monospace';
		const pulse = 0.7 + Math.sin(gameTime * 4) * 0.2;
		ctx.fillStyle = textColor(pulse);
		ctx.fillText('[Y] Confirm   [N] Cancel', dlgX + dlgW / 2, dlgY + 44);
		addClickRegion(dlgX, dlgY + 30, dlgW / 2, 22, null, 'KeyY');
		addClickRegion(dlgX + dlgW / 2, dlgY + 30, dlgW / 2, 22, null, 'KeyN');
		ctx.textAlign = 'start';
	}

	// Footer
	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse);
	ctx.font = '13px "Courier New", monospace';
	ctx.textAlign = 'center';
	if (holdItems.length) {
		const sel = holdItems[ship.inventoryIndex];
		if (sel && sel.type === 'core') {
			ctx.fillText('[SPACE] Deploy  [DEL] Jettison  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		} else if (sel && sel.type === 'assemble') {
			ctx.fillText('[SPACE] Assemble Starship  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		} else if (sel && sel.type === 'launch-interstellar') {
			ctx.fillText('[SPACE] Launch  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		} else if (sel && sel.type === 'salvage-ramjet') {
			ctx.fillText('[SPACE] Salvage  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		} else if (sel && sel.type === 'component') {
			ctx.fillText('[DEL] Jettison  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		} else {
			ctx.fillText('[SPACE] Jettison  [T] Close', menuX + menuW / 2, menuY + menuH - 18);
		}
	} else {
		ctx.fillText('[T] Close', menuX + menuW / 2, menuY + menuH - 18);
	}
	ctx.textAlign = 'start';
}

export function renderStationCoreHUD(ctx, canvas, ship, gameTime) {
	if (ship.dead) return;

	// Deploy message (success/failure feedback)
	if (ship.deployMessage && ship.deployMessageTime > 0) {
		const alpha = Math.min(1, ship.deployMessageTime);
		ctx.font = 'bold 16px "Courier New", monospace';
		ctx.textAlign = 'center';
		ctx.fillStyle = textColor(alpha);
		ctx.fillText(ship.deployMessage, canvas.width / 2, canvas.height / 2 - 100);
		ctx.textAlign = 'start';
	}
}

/** Helper: draw the standard menu panel frame (background, border, corner accents). */
function drawMenuPanel(ctx, menuX, menuY, menuW, menuH) {
	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.fillStyle = 'rgba(10,15,30,0.95)';
	ctx.fillRect(menuX, menuY, menuW, menuH);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)';
	ctx.lineWidth = 1;
	ctx.strokeRect(menuX, menuY, menuW, menuH);
	const accentLen = 12;
	ctx.strokeStyle = 'rgba(80,180,255,0.9)';
	ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(menuX, menuY + accentLen); ctx.lineTo(menuX, menuY); ctx.lineTo(menuX + accentLen, menuY); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX + menuW - accentLen, menuY); ctx.lineTo(menuX + menuW, menuY); ctx.lineTo(menuX + menuW, menuY + accentLen); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX, menuY + menuH - accentLen); ctx.lineTo(menuX, menuY + menuH); ctx.lineTo(menuX + accentLen, menuY + menuH); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(menuX + menuW - accentLen, menuY + menuH); ctx.lineTo(menuX + menuW, menuY + menuH); ctx.lineTo(menuX + menuW, menuY + menuH - accentLen); ctx.stroke();
}

/**
 * Helper: render a list of menu items with selection highlight and number keys.
 * If `onSelect(i)` is given, selectable rows become clickable.
 */
function drawMenuItems(ctx, items, selectedIndex, leftCol, menuX, menuW, startY, gameTime, onSelect) {
	let y = startY;
	let selectableNum = 0; // counter for selectable items (1-based display)
	ctx.font = '12px "Courier New", monospace';
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const isSel = i === selectedIndex;
		const numLabel = item.selectable ? ++selectableNum : 0;
		if (item.selectable && onSelect) addClickRegion(leftCol - 4, y - 13, menuW - 40, 18, () => onSelect(i));

		if (item.selectable && isSel) {
			const pulse = 0.15 + Math.sin(gameTime * 4) * 0.05;
			ctx.fillStyle = `rgba(80,180,255,${pulse})`;
			ctx.fillRect(leftCol - 4, y - 12, menuW - 40, 16);
			ctx.fillStyle = textColor(0.95);
			ctx.fillText(`${numLabel}. ${item.name}`, leftCol, y);
			if (item.status && !item.isCategory) { ctx.fillStyle = textColor(0.9); ctx.textAlign = 'right'; ctx.fillText(item.status, menuX + menuW - 24, y); ctx.textAlign = 'left'; }
		} else if (item.selectable) {
			ctx.fillStyle = textColor(0.5);
			ctx.fillText(`${numLabel}.`, leftCol, y);
			ctx.fillStyle = textColor(0.7);
			ctx.fillText(`   ${item.name}`, leftCol, y);
			if (item.status && !item.isCategory) { ctx.fillStyle = textColor(0.5); ctx.textAlign = 'right'; ctx.fillText(item.status, menuX + menuW - 24, y); ctx.textAlign = 'left'; }
		} else if (item.active) {
			ctx.fillStyle = textColor(0.8);
			ctx.fillText(`   ${item.name}`, leftCol, y);
			if (item.status) { ctx.fillStyle = textColor(0.5); ctx.textAlign = 'right'; ctx.fillText(item.status, menuX + menuW - 24, y); ctx.textAlign = 'left'; }
		} else {
			ctx.fillStyle = textColor(0.3);
			ctx.fillText(`   ${item.name}`, leftCol, y);
			if (item.status) { ctx.textAlign = 'right'; ctx.fillStyle = textColor(0.25); ctx.fillText(`\u{1F512} ${item.status}`, menuX + menuW - 24, y); ctx.textAlign = 'left'; }
		}

		// Category indicator (arrow)
		if (item.isCategory && item.selectable) {
			ctx.textAlign = 'right';
			ctx.fillStyle = textColor(isSel ? 0.8 : 0.4);
			ctx.fillText('\u25B8', menuX + menuW - 24, y);
			ctx.textAlign = 'left';
		}

		// Mineral icon next to upgrade costs
		if (item.id && item.id.startsWith('upgrade-') && item.status && item.status.includes('\u00B7')) {
			const alpha = item.selectable ? 0.7 : 0.3;
			drawGem(ctx, menuX + menuW - 14, y - 5, 9, 'rgb(220,160,60)', alpha);
		}

		// Science + Mineral icons for ramjet component costs
		if (item.showCostIcons) {
			const alpha = item.selectable ? 0.7 : 0.35;
			// The status text is laid out as "{sciCost}  +  {minCost}"
			// Place flask icon after the sci number and gem icon after the min number
			ctx.textAlign = 'right';
			const statusWidth = ctx.measureText(item.status).width;
			const statusRight = menuX + menuW - 24;
			const statusLeft = statusRight - statusWidth;
			// Flask after the first number (science)
			const plusIdx = item.status.indexOf('+');
			const sciPart = item.status.substring(0, plusIdx);
			const sciWidth = ctx.measureText(sciPart).width;
			drawFlask(ctx, statusLeft + sciWidth - 8, y - 5, 9, 'rgb(100,180,255)', alpha);
			// Gem at the end (minerals)
			drawGem(ctx, statusRight + 8, y - 5, 9, 'rgb(220,160,60)', alpha);
			ctx.textAlign = 'left';
		}

		y += 18;
	}
	return y;
}

export function renderInteractMenu(ctx, canvas, ship, gameTime) {
	if (!ship.interacting || !ship.interactStation) return;
	const station = ship.interactStation;


	const level = station.level || 1;

	const menuW = 340;
	const menuH = 320;
	const menuX = (canvas.width - menuW) / 2;
	const menuY = (canvas.height - menuH) / 2;
	const leftCol = menuX + 24;

	drawMenuPanel(ctx, menuX, menuY, menuW, menuH);

	// Station name header
	ctx.fillStyle = textColor(1);
	ctx.font = 'bold 18px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText(station.name, menuX + menuW / 2, menuY + 30);

	// Level badge
	ctx.font = '12px "Courier New", monospace';
	ctx.fillStyle = textColor(0.9);
	ctx.fillText(`Level ${level}`, menuX + menuW / 2, menuY + 48);

	// Science + Minerals progress bars
	const reqs = levelReqs(level);
	const barX = menuX + 24;
	const barW = menuW - 48;
	const barH = 6;

	if (reqs) {
		const [sciNeeded, minNeeded] = reqs;
		const sciProgress = Math.min(1, station.storedScience / sciNeeded);
		const minProgress = Math.min(1, station.storedMinerals / minNeeded);
		const sciBarY = menuY + 58;
		ctx.fillStyle = 'rgba(30,40,60,0.8)'; ctx.fillRect(barX, sciBarY, barW, barH);
		ctx.fillStyle = 'rgba(100,180,255,0.8)'; ctx.fillRect(barX, sciBarY, barW * sciProgress, barH);
		ctx.strokeStyle = 'rgba(100,180,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(barX, sciBarY, barW, barH);
		const minBarY = sciBarY + barH + 3;
		ctx.fillStyle = 'rgba(30,40,60,0.8)'; ctx.fillRect(barX, minBarY, barW, barH);
		ctx.fillStyle = 'rgba(220,160,60,0.8)'; ctx.fillRect(barX, minBarY, barW * minProgress, barH);
		ctx.strokeStyle = 'rgba(220,160,60,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(barX, minBarY, barW, barH);
		drawFlask(ctx, barX - 10, sciBarY + barH / 2, 10, 'rgb(100,180,255)', 0.7);
		drawGem(ctx, barX - 10, minBarY + barH / 2, 10, 'rgb(220,160,60)', 0.7);
		ctx.fillStyle = textColor(0.6); ctx.font = '9px "Courier New", monospace'; ctx.textAlign = 'right';
		ctx.fillText(`${Math.floor(station.storedScience)}/${sciNeeded}`, barX + barW, sciBarY - 2);
		ctx.fillText(`${Math.floor(station.storedMinerals)}/${minNeeded}`, barX + barW, minBarY - 2);
		ctx.textAlign = 'left';
	} else {
		ctx.fillStyle = textColor(0.5); ctx.font = '9px "Courier New", monospace';
		ctx.textAlign = 'center'; ctx.fillText('Max Level', menuX + menuW / 2, menuY + 64); ctx.textAlign = 'left';
	}

	// Divider
	ctx.strokeStyle = 'rgba(80,180,255,0.3)'; ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(menuX + 20, menuY + 82); ctx.lineTo(menuX + menuW - 20, menuY + 82); ctx.stroke();

	// Population
	let y = menuY + 100;
	ctx.font = '13px "Courier New", monospace';
	ctx.fillStyle = textColor(0.7);
	ctx.fillText(`POP:    ${stationPopulation(station).toLocaleString()}`, leftCol, y);
	y += 16;

	// Divider
	ctx.strokeStyle = 'rgba(80,180,255,0.15)';
	ctx.beginPath(); ctx.moveTo(menuX + 20, y - 2); ctx.lineTo(menuX + menuW - 20, y - 2); ctx.stroke();
	y += 6;

	// Top-level menu items
	const menuItems = getStationMenuItems(station, ship);
	const subMenuOpen = ship.collectScienceMenuOpen || ship.cargoMenuOpen || ship.scienceMenuOpen || ship.stationSubMenu;
	drawMenuItems(ctx, menuItems, ship.menuIndex || 0, leftCol, menuX, menuW, y, gameTime,
		subMenuOpen ? null : (i) => { ship.menuIndex = i; });

	// Footer
	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse);
	ctx.font = '13px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText('[W/S] Select  [SPACE] Open  [F] Undock', menuX + menuW / 2, menuY + menuH - 18);
	ctx.textAlign = 'start';

	// ── Sub-menu overlays ──────────────────────────────────
	if (ship.collectScienceMenuOpen) {
		renderCollectScienceSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime);
	} else if (ship.cargoMenuOpen) {
		renderCargoPickupSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime);
	} else if (ship.scienceMenuOpen) {
		renderScienceGiveSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime);
	} else if (ship.stationSubMenu) {
		const cat = menuItems.find(m => m.id === ship.stationSubMenu);
		if (cat && cat.items) {
			renderCategorySubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, cat, station, ship, gameTime);
		}
	}
}

function renderCategorySubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, cat, station, ship, gameTime) {
	// Overlay
	ctx.fillStyle = 'rgba(10,15,30,0.97)';
	ctx.fillRect(menuX + 1, menuY + 1, menuW - 2, menuH - 2);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(menuX, menuY, menuW, menuH);

	// Header
	ctx.fillStyle = textColor(1);
	ctx.font = 'bold 16px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText(cat.name, menuX + menuW / 2, menuY + 30);
	ctx.font = '11px "Courier New", monospace';
	ctx.fillStyle = textColor(0.6);
	ctx.fillText(ship.interactStation.name, menuX + menuW / 2, menuY + 46);
	ctx.textAlign = 'left';

	// Divider
	ctx.strokeStyle = 'rgba(80,180,255,0.3)';
	ctx.beginPath(); ctx.moveTo(menuX + 20, menuY + 54); ctx.lineTo(menuX + menuW - 20, menuY + 54); ctx.stroke();

	// Sub-items
	drawMenuItems(ctx, cat.items, ship.subMenuIndex, leftCol, menuX, menuW, menuY + 72, gameTime, (i) => { ship.subMenuIndex = i; });

	// Footer
	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse);
	ctx.font = '13px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText('[W/S] Select  [SPACE] Use  [TAB] Back', menuX + menuW / 2, menuY + menuH - 18);
	ctx.textAlign = 'start';
}

function renderCargoPickupSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime) {
	const cargos = station.availableCargo || [];
	let totalAmount = 0;
	for (const c of cargos) totalAmount += c.amount;

	ctx.fillStyle = 'rgba(10,15,30,0.97)';
	ctx.fillRect(menuX + 1, menuY + 1, menuW - 2, menuH - 2);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(menuX, menuY, menuW, menuH);

	ctx.fillStyle = textColor(1); ctx.font = 'bold 16px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('Pick Up Cargo', menuX + menuW / 2, menuY + 30);
	ctx.font = '11px "Courier New", monospace'; ctx.fillStyle = textColor(0.6);
	ctx.fillText(`from ${station.name}`, menuX + menuW / 2, menuY + 46); ctx.textAlign = 'left';

	ctx.strokeStyle = 'rgba(80,180,255,0.3)';
	ctx.beginPath(); ctx.moveTo(menuX + 20, menuY + 54); ctx.lineTo(menuX + menuW - 20, menuY + 54); ctx.stroke();

	let sy = menuY + 74;
	const selIdx = ship.cargoMenuIndex;
	const rowH = 20;

	// "Pick Up All"
	addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.cargoMenuIndex = 0; });
	const allSel = selIdx === 0;
	if (allSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
	else { ctx.fillStyle = textColor(0.7); }
	ctx.font = 'bold 12px "Courier New", monospace';
	ctx.fillText(allSel ? '\u25B6 Pick Up All' : '\u25B8 Pick Up All', leftCol, sy);
	ctx.font = '11px "Courier New", monospace'; ctx.textAlign = 'right';
	ctx.fillStyle = textColor(allSel ? 0.9 : 0.6);
	ctx.fillText(`${Math.floor(totalAmount)} units`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
	sy += rowH + 4;
	ctx.strokeStyle = 'rgba(80,180,255,0.15)'; ctx.beginPath(); ctx.moveTo(menuX + 20, sy - 6); ctx.lineTo(menuX + menuW - 20, sy - 6); ctx.stroke();

	ctx.font = '12px "Courier New", monospace';
	for (let i = 0; i < cargos.length; i++) {
		const c = cargos[i];
		const isSel = selIdx === i + 1;
		addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.cargoMenuIndex = i + 1; });
		if (isSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
		else { ctx.fillStyle = textColor(0.7); }
		const dist = Math.sqrt((c.destX - station.x) ** 2 + (c.destY - station.y) ** 2);
		const distLabel = dist >= 1000 ? `${(dist / 1000).toFixed(1)}k` : `${Math.floor(dist)}`;
		const dName = lookupStationName(c.destId, c.destName);
		drawCargoBox(ctx, leftCol + (isSel ? 16 : 8), sy - 5, 10, isSel ? 0.9 : 0.6);
		ctx.fillText(isSel ? `\u25B6 ${dName}` : `  ${dName}`, leftCol, sy);
		ctx.textAlign = 'right'; ctx.fillStyle = textColor(isSel ? 0.9 : 0.5);
		ctx.fillText(`${Math.floor(c.amount)} \u00B7 ${distLabel}m`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
		sy += rowH;
	}

	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse); ctx.font = '13px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('[W/S] Select  [SPACE] Take  [TAB] Back', menuX + menuW / 2, menuY + menuH - 18); ctx.textAlign = 'start';
}

function renderCollectScienceSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime) {
	const entries = getStationScienceEntries(station);
	let totalAmount = 0;
	for (const e of entries) totalAmount += Math.floor(e.entry.amount);

	ctx.fillStyle = 'rgba(10,15,30,0.97)';
	ctx.fillRect(menuX + 1, menuY + 1, menuW - 2, menuH - 2);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(menuX, menuY, menuW, menuH);

	ctx.fillStyle = textColor(1); ctx.font = 'bold 16px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('Collect Science', menuX + menuW / 2, menuY + 30);
	ctx.font = '11px "Courier New", monospace'; ctx.fillStyle = textColor(0.6);
	ctx.fillText(`from ${station.name}`, menuX + menuW / 2, menuY + 46); ctx.textAlign = 'left';

	ctx.strokeStyle = 'rgba(80,180,255,0.3)';
	ctx.beginPath(); ctx.moveTo(menuX + 20, menuY + 54); ctx.lineTo(menuX + menuW - 20, menuY + 54); ctx.stroke();

	let sy = menuY + 74;
	const selIdx = ship.collectScienceMenuIndex;
	const rowH = 20;

	// "Collect All"
	addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.collectScienceMenuIndex = 0; });
	const allSel = selIdx === 0;
	if (allSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
	else { ctx.fillStyle = textColor(0.7); }
	ctx.font = 'bold 12px "Courier New", monospace';
	ctx.fillText(allSel ? '\u25B6 Collect All' : '\u25B8 Collect All', leftCol, sy);
	ctx.font = '11px "Courier New", monospace'; ctx.textAlign = 'right';
	ctx.fillStyle = textColor(allSel ? 0.9 : 0.6);
	ctx.fillText(`${totalAmount} sci`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
	sy += rowH + 4;
	ctx.strokeStyle = 'rgba(80,180,255,0.15)'; ctx.beginPath(); ctx.moveTo(menuX + 20, sy - 6); ctx.lineTo(menuX + menuW - 20, sy - 6); ctx.stroke();

	ctx.font = '12px "Courier New", monospace';
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		const isSel = selIdx === i + 1;
		addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.collectScienceMenuIndex = i + 1; });
		if (isSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
		else { ctx.fillStyle = textColor(0.7); }
		const eColor = e.entry.planetColor || 'rgb(180,140,255)';
		drawFlask(ctx, leftCol + (isSel ? 8 : 6), sy - 6, 12, eColor, isSel ? 0.9 : 0.6);
		ctx.fillText(isSel ? `\u25B6  ${e.entry.planetName}` : `   ${e.entry.planetName}`, leftCol, sy);
		ctx.textAlign = 'right'; ctx.fillStyle = textColor(isSel ? 0.9 : 0.5);
		ctx.fillText(`${Math.floor(e.entry.amount)} sci`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
		sy += rowH;
	}

	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse); ctx.font = '13px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('[W/S] Select  [SPACE] Collect  [TAB] Back', menuX + menuW / 2, menuY + menuH - 18); ctx.textAlign = 'start';
}

function renderScienceGiveSubMenu(ctx, menuX, menuY, menuW, menuH, leftCol, station, ship, gameTime) {
	const entries = getScienceEntries(ship, station);
	let totalAmount = 0;
	for (const e of entries) totalAmount += Math.floor(e.entry.amount);

	ctx.fillStyle = 'rgba(10,15,30,0.97)';
	ctx.fillRect(menuX + 1, menuY + 1, menuW - 2, menuH - 2);
	ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(menuX, menuY, menuW, menuH);

	ctx.fillStyle = textColor(1); ctx.font = 'bold 16px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('Give Science', menuX + menuW / 2, menuY + 30);
	ctx.font = '11px "Courier New", monospace'; ctx.fillStyle = textColor(0.6);
	ctx.fillText(`to ${station.name}`, menuX + menuW / 2, menuY + 46); ctx.textAlign = 'left';

	ctx.strokeStyle = 'rgba(80,180,255,0.3)';
	ctx.beginPath(); ctx.moveTo(menuX + 20, menuY + 54); ctx.lineTo(menuX + menuW - 20, menuY + 54); ctx.stroke();

	let sy = menuY + 74;
	const selIdx = ship.scienceMenuIndex;
	const rowH = 20;

	// "Give All"
	addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.scienceMenuIndex = 0; });
	const allSel = selIdx === 0;
	if (allSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
	else { ctx.fillStyle = textColor(0.7); }
	ctx.font = 'bold 12px "Courier New", monospace';
	ctx.fillText(allSel ? '\u25B6 Give All' : '\u25B8 Give All', leftCol, sy);
	ctx.font = '11px "Courier New", monospace'; ctx.textAlign = 'right';
	ctx.fillStyle = textColor(allSel ? 0.9 : 0.6);
	ctx.fillText(`${Math.floor(totalAmount)} sci`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
	sy += rowH + 4;
	ctx.strokeStyle = 'rgba(80,180,255,0.15)'; ctx.beginPath(); ctx.moveTo(menuX + 20, sy - 6); ctx.lineTo(menuX + menuW - 20, sy - 6); ctx.stroke();

	ctx.font = '12px "Courier New", monospace';
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		const isSel = selIdx === i + 1;
		addClickRegion(leftCol - 4, sy - rowH + 6, menuW - 40, rowH, () => { ship.scienceMenuIndex = i + 1; });
		if (isSel) { const p = 0.15 + Math.sin(gameTime * 4) * 0.05; ctx.fillStyle = `rgba(80,180,255,${p})`; ctx.fillRect(leftCol - 4, sy - rowH + 6, menuW - 40, rowH); ctx.fillStyle = textColor(0.95); }
		else { ctx.fillStyle = textColor(0.7); }
		const eColor = e.entry.planetColor || 'rgb(180,140,255)';
		drawFlask(ctx, leftCol + (isSel ? 8 : 6), sy - 6, 12, eColor, isSel ? 0.9 : 0.6);
		ctx.fillText(isSel ? `\u25B6  ${e.entry.planetName}` : `   ${e.entry.planetName}`, leftCol, sy);
		ctx.textAlign = 'right'; ctx.fillStyle = textColor(isSel ? 0.9 : 0.5);
		ctx.fillText(`${Math.floor(e.entry.amount)} sci`, menuX + menuW - 24, sy); ctx.textAlign = 'left';
		sy += rowH;
	}

	const closePulse = 0.5 + Math.sin(gameTime * 3) * 0.2;
	ctx.fillStyle = textColor(closePulse); ctx.font = '13px "Courier New", monospace'; ctx.textAlign = 'center';
	ctx.fillText('[W/S] Select  [SPACE] Give  [TAB] Back', menuX + menuW / 2, menuY + menuH - 18); ctx.textAlign = 'start';
}
