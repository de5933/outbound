export const keys = {};
export const justPressed = {};
export let wheelDelta = 0;

export function consumeWheelDelta() {
	const d = wheelDelta;
	wheelDelta = 0;
	return d;
}

window.addEventListener('keydown', (e) => {
	// Don't intercept input when typing in form fields
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
		// Still track Escape so the menu can close
		if (e.code === 'Escape') {
			if (!keys[e.code]) justPressed[e.code] = true;
			keys[e.code] = true;
		}
		return;
	}
	if (!keys[e.code]) justPressed[e.code] = true;
	keys[e.code] = true;
	e.preventDefault();
});

window.addEventListener('keyup', (e) => {
	keys[e.code] = false;
});

window.addEventListener('wheel', (e) => {
	wheelDelta += e.deltaY;
	e.preventDefault();
}, { passive: false });

// --- Mouse ---
// HUD renderers register clickable regions each frame. A region selects its
// item on hover and, on click, also presses `key` (Space by default), so mouse
// input goes through the same code paths as the keyboard.

export const mouse = { x: 0, y: 0, moved: false, clicked: false };
const clickRegions = [];
const canvas = document.getElementById('gameCanvas');

export function clearClickRegions() {
	clickRegions.length = 0;
}

/** Register a clickable rectangle. `select` runs on hover/click; `key` is pressed on click. */
export function addClickRegion(x, y, w, h, select, key = 'Space') {
	clickRegions.push({ x, y, w, h, select, key });
}

function regionAt(px, py) {
	// Last registered wins, so overlays drawn later take priority
	for (let i = clickRegions.length - 1; i >= 0; i--) {
		const r = clickRegions[i];
		if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return r;
	}
	return null;
}

/** Apply pending mouse hover/click to the menus. Call once per frame before reading justPressed. */
export function processMouse() {
	const r = (mouse.moved || mouse.clicked) ? regionAt(mouse.x, mouse.y) : null;
	if (r) {
		if (r.select) r.select();
		if (mouse.clicked && r.key) justPressed[r.key] = true;
	}
	mouse.moved = false;
	mouse.clicked = false;
	canvas.style.cursor = regionAt(mouse.x, mouse.y) ? 'pointer' : '';
}

function updateMousePos(e) {
	const rect = canvas.getBoundingClientRect();
	mouse.x = e.clientX - rect.left;
	mouse.y = e.clientY - rect.top;
}

canvas.addEventListener('mousemove', (e) => {
	updateMousePos(e);
	mouse.moved = true;
});

canvas.addEventListener('mousedown', (e) => {
	if (e.button !== 0) return;
	updateMousePos(e);
	mouse.clicked = true;
});
