export function renderDebris(ctx, sx, sy, obj, gameTime) {
	for (const p of obj.pieces) {
		ctx.save();
		ctx.translate(sx + p.ox, sy + p.oy);
		ctx.rotate(gameTime * p.spin);
		ctx.fillStyle = `rgb(${p.shade + 15},${p.shade + 5},${p.shade})`;
		ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
		ctx.restore();
	}
}

export function generateDebris(rng, wx, wy) {
	const pieces = [];
	const n = 4 + Math.floor(rng() * 8);
	for (let j = 0; j < n; j++) {
		pieces.push({
			ox: (rng() - 0.5) * 80,
			oy: (rng() - 0.5) * 80,
			r: 3 + rng() * 8,
			shade: Math.floor(50 + rng() * 40),
			spin: (rng() - 0.5) * 0.5,
		});
	}
	return { type: 'debris', x: wx, y: wy, pieces };
}
