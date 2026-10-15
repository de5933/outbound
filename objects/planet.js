import { GRAVITY_RANGE_MULT } from '../constants.js';

const PLANET_PREFIXES = [
	'Aether', 'Borea', 'Calyx', 'Draco', 'Elysia', 'Ferox', 'Glacis',
	'Helio', 'Igne', 'Jovian', 'Kyros', 'Lumen', 'Mira', 'Nexis',
	'Oberon', 'Pyra', 'Quasar', 'Rhea', 'Solara', 'Tycho', 'Umbra',
	'Vesta', 'Wynd', 'Xeno', 'Ymir', 'Zephyr', 'Astra', 'Borealis',
	'Cinder', 'Drift', 'Echo', 'Flux', 'Gale', 'Haze', 'Ion',
];
const PLANET_SUFFIXES = [
	'Prime', 'Minor', 'Major', 'Alpha', 'Beta', 'Gamma',
	'I', 'II', 'III', 'IV', 'V', 'VI', 'VII',
];

export function renderPlanet(ctx, sx, sy, obj, ship) {
	ctx.save();
	ctx.translate(sx, sy);
	// Gravity range indicator
	const distToShip = Math.sqrt((obj.x - ship.x) ** 2 + (obj.y - ship.y) ** 2);
	const inRange = distToShip < obj.radius * GRAVITY_RANGE_MULT;
	ctx.strokeStyle = obj.color1;
	ctx.globalAlpha = inRange ? 0.25 : 0.12;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(0, 0, obj.radius * GRAVITY_RANGE_MULT, 0, Math.PI * 2);
	ctx.stroke();
	ctx.globalAlpha = 1;
	// Back half of rings (behind planet)
	if (obj.rings) {
		ctx.save();
		ctx.rotate(obj.angle);
		ctx.scale(1, obj.ringTilt);
		ctx.strokeStyle = obj.ringColor;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(0, 0, obj.radius * 1.5, Math.PI, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, obj.radius * 1.7, Math.PI, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}
	// Body
	const grad = ctx.createRadialGradient(
		-obj.radius * 0.3,
		-obj.radius * 0.3,
		obj.radius * 0.1,
		0,
		0,
		obj.radius,
	);
	grad.addColorStop(0, obj.color1);
	grad.addColorStop(1, obj.color2);
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
	ctx.fill();
	// Atmosphere glow
	ctx.strokeStyle = 'rgba(150,200,255,0.15)';
	ctx.lineWidth = 3;
	ctx.stroke();
	// Front half of rings (in front of planet)
	if (obj.rings) {
		ctx.save();
		ctx.rotate(obj.angle);
		ctx.scale(1, obj.ringTilt);
		ctx.strokeStyle = obj.ringColor;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(0, 0, obj.radius * 1.5, 0, Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, obj.radius * 1.7, 0, Math.PI);
		ctx.stroke();
		ctx.restore();
	}
	ctx.restore();

	// Name label (drawn after restore so it's not rotated)
	if (obj.name) {
		// Parse planet color for label tint
		const cm = obj.color1.match(/(\d+),\s*(\d+),\s*(\d+)/);
		if (cm) {
			// Brighten the planet color so it's readable against dark space
			const lr = Math.min(255, parseInt(cm[1]) + 60);
			const lg = Math.min(255, parseInt(cm[2]) + 60);
			const lb = Math.min(255, parseInt(cm[3]) + 60);
			ctx.fillStyle = `rgba(${lr},${lg},${lb},0.7)`;
		} else {
			ctx.fillStyle = obj.color1;
		}
		ctx.font = '11px "Courier New", monospace';
		ctx.textAlign = 'center';
		ctx.fillText(obj.name, sx, sy - obj.radius - 10);
		ctx.textAlign = 'start';
	}
}

export function generatePlanet(rng, wx, wy, angle) {
	const radius = 60 + rng() * 120;
	const r = Math.floor(30 + rng() * 180);
	const g = Math.floor(30 + rng() * 180);
	const b = Math.floor(30 + rng() * 180);
	const rings = rng() > 0.5;
	const ringColor = `rgba(${150 + Math.floor(rng() * 80)},${140 + Math.floor(rng() * 80)},${120 + Math.floor(rng() * 80)},0.3)`;
	const ringTilt = 0.2 + rng() * 0.4;
	const prefix = PLANET_PREFIXES[Math.floor(rng() * PLANET_PREFIXES.length)];
	const suffix = PLANET_SUFFIXES[Math.floor(rng() * PLANET_SUFFIXES.length)];
	return {
		type: 'planet',
		x: wx,
		y: wy,
		radius,
		color1: `rgb(${r},${g},${b})`,
		color2: `rgb(${Math.max(0, r - 50)},${Math.max(0, g - 50)},${Math.max(0, b - 50)})`,
		rings,
		ringColor,
		ringTilt,
		angle,
		name: `${prefix} ${suffix}`,
	};
}
