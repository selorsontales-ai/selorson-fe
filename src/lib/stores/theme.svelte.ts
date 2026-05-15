/**
 * Selorson V3 — Day/Night Theme Store
 * Manages theme switching with localStorage persistence and system preference detection.
 */

let _theme = $state<'dark' | 'light'>('dark');

function applyTheme(t: 'dark' | 'light') {
	_theme = t;
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', t);
		document.documentElement.style.colorScheme = t;
		localStorage.setItem('selorson_theme', t);
	}
}

export function initTheme() {
	if (typeof window === 'undefined') return;
	const saved = localStorage.getItem('selorson_theme') as 'dark' | 'light' | null;
	if (saved) {
		applyTheme(saved);
	} else {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		applyTheme(prefersDark ? 'dark' : 'light');
	}
}

export function toggleTheme() {
	applyTheme(_theme === 'dark' ? 'light' : 'dark');
}

export function getTheme() {
	return _theme;
}

export function isDark() {
	return _theme === 'dark';
}
