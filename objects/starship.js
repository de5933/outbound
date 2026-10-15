import {
	RAMJET_LENGTH,
	RAMJET_WIDTH,
	RAMJET_SCOOP_RADIUS,
	SHIP_LENGTH,
	SHIP_WIDTH,
	TEXT_COLOR,
} from '../constants.js';

export function generateStarship(x, y, angle) {
	return {
		type: 'starship',
		id: `ramjet_${Math.round(x)}_${Math.round(y)}`,
		x,
		y,
		angle,
		size: RAMJET_LENGTH / 2,
		radius: RAMJET_LENGTH / 2,
		spin: 0,
		name: 'Bussard Ramjet',
	};
}

export function renderStarship(ctx, sx, sy, obj, gameTime) {
	try {
		_renderStarship(ctx, sx, sy, obj, gameTime);
	} catch (e) {
		// Fallback — simple rectangle
		ctx.fillStyle = 'rgb(120,130,150)';
		ctx.fillRect(sx - 40, sy - 8, 80, 16);
	}
}

function _renderStarship(ctx, sx, sy, obj, gameTime) {
	const len = RAMJET_LENGTH;
	const w = RAMJET_WIDTH;
	const scoopR = RAMJET_SCOOP_RADIUS;

	// Layout (left=rear, right=front, 0,0 = center of spine = dock point):
	// ENGINE [-len/2] ... SHIELD [-len/2+18] ... SPINE ... DOCK [0] ... SPINE ... FUNNEL [+len/2]

	const spineLeft = -len / 2;
	const spineRight = len / 2;
	const funnelTip = spineRight + scoopR * 0.4;
	const funnelMouth = scoopR;
	const engineX = spineLeft;
	const shieldX = spineLeft + 18;
	const shieldHalfW = w * 0.9;

	ctx.save();
	ctx.translate(sx, sy);
	ctx.rotate(obj.angle);

	// ── Engine (small, rear) ─────────────────────────
	const firing = obj.thrusting;
	// Nozzle
	ctx.fillStyle = firing ? 'rgb(110,100,115)' : 'rgb(90,95,105)';
	ctx.fillRect(engineX - 2, -6, 10, 12);

	if (firing) {
		// Main drive flame — large, bright pink
		const flamePulse = 0.7 + Math.sin(gameTime * 8) * 0.3;
		const flameLen = 45 + Math.sin(gameTime * 12) * 10;
		const flameW = 8 + Math.sin(gameTime * 10) * 2;
		const flameGrad = ctx.createLinearGradient(
			engineX - flameLen,
			0,
			engineX,
			0,
		);
		flameGrad.addColorStop(0, 'rgba(255,80,160,0)');
		flameGrad.addColorStop(0.3, `rgba(255,120,190,${flamePulse * 0.4})`);
		flameGrad.addColorStop(0.7, `rgba(255,170,210,${flamePulse * 0.8})`);
		flameGrad.addColorStop(1, `rgba(255,220,240,${flamePulse})`);
		ctx.fillStyle = flameGrad;
		ctx.beginPath();
		ctx.moveTo(engineX, -flameW);
		ctx.lineTo(engineX - flameLen, 0);
		ctx.lineTo(engineX, flameW);
		ctx.closePath();
		ctx.fill();
		// Inner flame core (white-pink)
		const coreLen = flameLen * 0.6;
		const coreGrad = ctx.createLinearGradient(engineX - coreLen, 0, engineX, 0);
		coreGrad.addColorStop(0, 'rgba(255,200,230,0)');
		coreGrad.addColorStop(1, `rgba(255,245,250,${flamePulse * 0.7})`);
		ctx.fillStyle = coreGrad;
		ctx.beginPath();
		ctx.moveTo(engineX, -3);
		ctx.lineTo(engineX - coreLen, 0);
		ctx.lineTo(engineX, 3);
		ctx.closePath();
		ctx.fill();
	} else {
		// Idle — small pilot light
		const idlePulse = 0.3 + Math.sin(gameTime * 4) * 0.1;
		const idleGrad = ctx.createLinearGradient(engineX - 8, 0, engineX, 0);
		idleGrad.addColorStop(0, 'rgba(255,140,200,0)');
		idleGrad.addColorStop(1, `rgba(255,180,220,${idlePulse})`);
		ctx.fillStyle = idleGrad;
		ctx.beginPath();
		ctx.moveTo(engineX, -2);
		ctx.lineTo(engineX - 8, 0);
		ctx.lineTo(engineX, 2);
		ctx.closePath();
		ctx.fill();
	}

	// ── Whipple Shield (wide, flat, just behind engine) ──
	ctx.strokeStyle = 'rgba(160,170,180,0.9)';
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(shieldX, -shieldHalfW);
	ctx.lineTo(shieldX, shieldHalfW);
	ctx.stroke();
	// Shield layers (3 thin lines for whipple effect)
	for (let layer = 1; layer <= 3; layer++) {
		const lx = shieldX + layer * 3;
		const shrink = layer * 2;
		ctx.strokeStyle = `rgba(140,150,160,${0.6 - layer * 0.15})`;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(lx, -shieldHalfW + shrink);
		ctx.lineTo(lx, shieldHalfW - shrink);
		ctx.stroke();
	}

	// ── Spine (steel lattice from engine to funnel tip) ──
	const latticeStart = engineX + 8;
	const latticeEnd = funnelMouth + 2;
	const spineHalf = 3; // half-width of the spine truss

	// Main horizontal rails
	ctx.strokeStyle = 'rgba(150,155,165,0.8)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(latticeStart, -spineHalf);
	ctx.lineTo(latticeEnd, -spineHalf);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(latticeStart, spineHalf);
	ctx.lineTo(latticeEnd, spineHalf);
	ctx.stroke();

	// Cross braces (lattice pattern)
	ctx.strokeStyle = 'rgba(130,135,145,0.5)';
	ctx.lineWidth = 0.8;
	const braceSpacing = 12;
	for (let bx = latticeStart; bx < latticeEnd; bx += braceSpacing) {
		// X-pattern
		ctx.beginPath();
		ctx.moveTo(bx, -spineHalf);
		ctx.lineTo(bx + braceSpacing * 0.5, spineHalf);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(bx, spineHalf);
		ctx.lineTo(bx + braceSpacing * 0.5, -spineHalf);
		ctx.stroke();
	}

	// ── Dock point — show player ship if controlling the ramjet ──
	if (obj.showDockedShip) {
		// Mini ship hull at dock center, oriented along the spine
		const sl = SHIP_LENGTH * 0.5;
		const sw = SHIP_WIDTH * 0.5;
		// Hull
		ctx.fillStyle = 'rgb(180,190,200)';
		ctx.beginPath();
		ctx.moveTo(sl / 2, 0); // nose
		ctx.lineTo(-sl / 2, -sw / 2); // rear top
		ctx.lineTo(-sl / 3, 0); // rear notch
		ctx.lineTo(-sl / 2, sw / 2); // rear bottom
		ctx.closePath();
		ctx.fill();
		// Cockpit
		ctx.fillStyle = 'rgba(100,200,180,0.6)';
		ctx.beginPath();
		ctx.arc(sl * 0.15, 0, sw * 0.25, 0, Math.PI * 2);
		ctx.fill();
	} else {
		// Static ramjet — show green dock marker
		ctx.fillStyle = 'rgba(100,200,100,0.4)';
		ctx.beginPath();
		ctx.arc(0, 0, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(100,200,100,0.6)';
		ctx.lineWidth = 0.8;
		ctx.stroke();
	}

	// ── Collector Funnel (wireframe aluminum cone at front) ──
	const funnelBaseX = spineRight;
	const funnelRings = 5;

	// Funnel wireframe ribs (lines from tip to mouth)
	const ribCount = 8;
	ctx.strokeStyle = 'rgba(190,195,200,0.5)';
	ctx.lineWidth = 0.8;
	for (let r = 0; r < ribCount; r++) {
		const a = (r / ribCount) * Math.PI * 2;
		const ribY = Math.sin(a) * funnelMouth;
		// Only draw ribs visible from side (top/bottom half)
		if (Math.abs(Math.sin(a)) > 0.15) {
			ctx.beginPath();
			ctx.moveTo(funnelBaseX, 0);
			ctx.lineTo(funnelTip, ribY * 0.6);
			ctx.stroke();
		}
	}

	// Funnel rings (concentric, getting wider toward mouth)
	for (let ring = 0; ring < funnelRings; ring++) {
		const t = (ring + 1) / funnelRings;
		const ringX = funnelBaseX + (funnelTip - funnelBaseX) * t;
		const ringR = funnelMouth * t * 0.6;
		const alpha = 0.2 + Math.sin(gameTime * 2.5 + ring * 1.2) * 0.1;
		ctx.strokeStyle = `rgba(180,190,200,${alpha})`;
		ctx.lineWidth = 1;
		// Draw as ellipse (flattened circle for side view)
		// Draw ring as a narrow oval (side view)
		const rx = 3;
		const kappa = 0.5522848;
		const ox = rx * kappa;
		const oy = ringR * kappa;
		ctx.beginPath();
		ctx.moveTo(ringX, -ringR);
		ctx.bezierCurveTo(ringX + ox, -ringR, ringX + rx, -oy, ringX + rx, 0);
		ctx.bezierCurveTo(ringX + rx, oy, ringX + ox, ringR, ringX, ringR);
		ctx.bezierCurveTo(ringX - ox, ringR, ringX - rx, oy, ringX - rx, 0);
		ctx.bezierCurveTo(ringX - rx, -oy, ringX - ox, -ringR, ringX, -ringR);
		ctx.stroke();
	}

	// Funnel glow (faint blue at mouth — collecting hydrogen)
	const collectPulse = 0.15 + Math.sin(gameTime * 3) * 0.08;
	const collectGrad = ctx.createRadialGradient(
		funnelTip,
		0,
		0,
		funnelTip,
		0,
		funnelMouth * 0.5,
	);
	collectGrad.addColorStop(0, `rgba(120,180,255,${collectPulse})`);
	collectGrad.addColorStop(1, 'rgba(80,140,220,0)');
	ctx.fillStyle = collectGrad;
	ctx.beginPath();
	ctx.arc(funnelTip, 0, funnelMouth * 0.5, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();

	// Name label
	ctx.fillStyle = `rgba(${TEXT_COLOR[0]},${TEXT_COLOR[1]},${TEXT_COLOR[2]},0.7)`;
	ctx.font = '11px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText(obj.name, sx, sy - scoopR - 10);
	ctx.textAlign = 'start';
}
