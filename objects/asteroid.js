export function renderAsteroid(ctx, sx, sy, obj, gameTime) {
	ctx.save();
	ctx.translate(sx, sy);
	ctx.rotate(obj.angle + gameTime * obj.spin);
	ctx.fillStyle = obj.color;
	ctx.beginPath();
	ctx.moveTo(obj.verts[0].x, obj.verts[0].y);
	for (let i = 1; i < obj.verts.length; i++) {
		ctx.lineTo(obj.verts[i].x, obj.verts[i].y);
	}
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.restore();
}

export function generateAsteroid(rng, wx, wy, angle) {
	const radius = 15 + rng() * 40;
	const verts = [];
	const n = 7 + Math.floor(rng() * 5);
	for (let j = 0; j < n; j++) {
		const a = (j / n) * Math.PI * 2;
		const r = radius * (0.7 + rng() * 0.5);
		verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
	}
	const shade = Math.floor(40 + rng() * 50);
	return {
		type: 'asteroid',
		x: wx,
		y: wy,
		angle,
		radius,
		verts,
		color: `rgb(${shade + 20},${shade + 10},${shade})`,
		spin: (rng() - 0.5) * 0.3,
	};
}
