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
