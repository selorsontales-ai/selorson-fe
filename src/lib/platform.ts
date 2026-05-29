/**
 * Platform detection utilities for Selorson V3.
 *
 * Allows a single codebase to branch behaviour correctly across:
 *   • Desktop  — Tauri app (runs local backend, has native window APIs)
 *   • Mobile   — Capacitor wrapper or mobile browser
 *   • Web      — Standard browser hitting deployed backend
 *
 * Usage:
 *   import { isDesktop, isMobile, isWeb } from '$lib/platform';
 */

/** True when running inside the Tauri desktop shell. */
export const isDesktop: boolean =
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** True when running inside a Capacitor native wrapper. */
export const isMobile: boolean =
	typeof window !== 'undefined' && 'Capacitor' in window;

/** True when running in a regular browser (not Tauri, not Capacitor). */
export const isWeb: boolean = !isDesktop && !isMobile;
