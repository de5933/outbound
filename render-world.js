import { CLOUD_FIELD, CLOUD_PARALLAX, STAR_FIELD, TEXT_COLOR } from './constants.js';
import { renderAsteroid } from './objects/asteroid.js';
import { renderPlanet } from './objects/planet.js';
import { renderStation } from './objects/station.js';
import { renderDebris } from './objects/debris.js';
import { renderStarship } from './objects/starship.js';

export function renderNebulae(ctx, cx, cy, clouds, ship) {
	const cloudHalf = CLOUD_FIELD / 2;
	for (const cloud of clouds) {
		const baseX =
			((((cloud.x - ship.x * CLOUD_PARALLAX) % CLOUD_FIELD) + CLOUD_FIELD) %
				CLOUD_FIELD) -
			cloudHalf +
			cx;
		const baseY =
			((((cloud.y - ship.y * CLOUD_PARALLAX) % CLOUD_FIELD) + CLOUD_FIELD) %
				CLOUD_FIELD) -
			cloudHalf +
			cy;
		for (const blob of cloud.blobs) {
			const bx = baseX + blob.ox;
			const by = baseY + blob.oy;
			const grad = ctx.createRadialGradient(bx, by, 0, bx, by, blob.r);
			grad.addColorStop(
				0,
				`rgba(${cloud.color[0]},${cloud.color[1]},${cloud.color[2]},${cloud.alpha})`,
			);
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = grad;
			ctx.fillRect(bx - blob.r, by - blob.r, blob.r * 2, blob.r * 2);
		}
	}
}

export function renderStars(ctx, cx, cy, starLayers, ship) {
	const half = STAR_FIELD / 2;
	for (const layer of starLayers) {
		for (const star of layer.stars) {
			const sx =
				((((star.x - ship.x * layer.parallax) % STAR_FIELD) + STAR_FIELD) %
					STAR_FIELD) -
				half +
				cx;
			const sy =
				((((star.y - ship.y * layer.parallax) % STAR_FIELD) + STAR_FIELD) %
					STAR_FIELD) -
				half +
				cy;
			ctx.fillStyle = `rgba(255,255,255,${star.brightness})`;
			ctx.fillRect(sx, sy, star.size, star.size);
		}
	}
}

export function renderSpaceObjects(ctx, cx, cy, visibleObjects, ship, gameTime) {
	for (const obj of visibleObjects) {
		const sx = cx + (obj.x - ship.x);
		const sy = cy + (obj.y - ship.y);
		if (obj.type === 'asteroid') renderAsteroid(ctx, sx, sy, obj, gameTime);
		else if (obj.type === 'planet') renderPlanet(ctx, sx, sy, obj, ship);
		else if (obj.type === 'station') renderStation(ctx, sx, sy, obj, gameTime);
		else if (obj.type === 'debris') renderDebris(ctx, sx, sy, obj, gameTime);
		else if (obj.type === 'starship') renderStarship(ctx, sx, sy, obj, gameTime);
		else if (obj.type === 'interstellar-star') renderInterstellarStar(ctx, sx, sy, obj, gameTime);
	}
}

export function renderInterstellarStar(ctx, sx, sy, obj, gameTime) {
	const r = obj.radius;
	const pulse = 0.8 + Math.sin(gameTime * 1.5 + obj.x * 0.01) * 0.2;

	// Outer corona glow
	const coronaGrad = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3);
	coronaGrad.addColorStop(0, obj.color1);
	coronaGrad.addColorStop(0.3, obj.color2 || obj.color1);
	coronaGrad.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.globalAlpha = pulse * 0.3 * obj.brightness;
	ctx.fillStyle = coronaGrad;
	ctx.beginPath();
	ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalAlpha = 1;

	// Star body
	const bodyGrad = ctx.createRadialGradient(sx - r * 0.2, sy - r * 0.2, r * 0.1, sx, sy, r);
	bodyGrad.addColorStop(0, 'rgb(255,255,255)');
	bodyGrad.addColorStop(0.4, obj.color1);
	bodyGrad.addColorStop(1, obj.color2 || obj.color1);
	ctx.fillStyle = bodyGrad;
	ctx.beginPath();
	ctx.arc(sx, sy, r, 0, Math.PI * 2);
	ctx.fill();

	// Home star marker
	if (obj.isHome) {
		ctx.strokeStyle = 'rgba(255,230,100,0.5)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(sx, sy, r + 8, 0, Math.PI * 2);
		ctx.stroke();
	}

	// Name label
	ctx.fillStyle = `rgba(${TEXT_COLOR[0]},${TEXT_COLOR[1]},${TEXT_COLOR[2]},0.7)`;
	ctx.font = '12px "Courier New", monospace';
	ctx.textAlign = 'center';
	ctx.fillText(obj.name, sx, sy - r - 12);
	ctx.textAlign = 'start';
}

export function renderExplosion(ctx, cx, cy, explosionParts, ship, gameTime) {
	for (const p of explosionParts) {
		const sx = cx + (p.x - ship.x);
		const sy = cy + (p.y - ship.y);
		const alpha = Math.max(0, p.life / p.maxLife);
		ctx.globalAlpha = alpha;
		ctx.fillStyle = p.color;
		if (p.isChunk) {
			ctx.save();
			ctx.translate(sx, sy);
			ctx.rotate(gameTime * (p.spin || 0));
			ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
			ctx.restore();
		} else {
			ctx.beginPath();
			ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.globalAlpha = 1;
}
