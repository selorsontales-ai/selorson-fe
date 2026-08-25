import { supportsDataModes } from "$lib/app-flavor";

export type DataMode = "local" | "production";

export interface DataModeStatus {
	/** The mode this process is actually running in. */
	mode: DataMode;
	/** The mode the stored choice asked for. */
	requested: DataMode;
	/** True when production was asked for and its configuration is missing. */
	fell_back: boolean;
	production_configured: boolean;
	config_path: string;
}

let status = $state<DataModeStatus | null>(null);
let loadError = $state<string | null>(null);
let acknowledged = $state(false);

/**
 * Read the mode once, before anything reads a stored session.
 *
 * Switching modes restarts the process, so this value cannot change while the
 * app is open. That is what lets the rest of the app treat it as settled rather
 * than awaiting it everywhere.
 */
export async function initDataMode(): Promise<void> {
	if (!supportsDataModes) return;

	try {
		const { invoke } = await import("@tauri-apps/api/core");
		status = await invoke<DataModeStatus>("desktop_data_mode");
		loadError = null;
	} catch (error) {
		status = null;
		loadError = error instanceof Error ? error.message : String(error);
	}
}

export function getDataMode(): DataModeStatus | null {
	return status;
}

export function getDataModeError(): string | null {
	return loadError;
}

export function isProductionData(): boolean {
	return status?.mode === "production";
}

/**
 * Whether the launch gate still has to be answered.
 *
 * The acknowledgement is per app session and deliberately not persisted: a
 * banner that is present most of the time stops being read, so the reminder is
 * a discrete act at the start of a session instead.
 */
export function needsProductionAcknowledgement(): boolean {
	return supportsDataModes && status?.mode === "production" && !acknowledged;
}

export function acknowledgeProductionData(): void {
	acknowledged = true;
}

/**
 * The switch prompt is opened from the badge in the header and rendered
 * outside it. The header carries a backdrop-filter, which makes it a
 * containing block for fixed positioning — an overlay rendered inside it would
 * be trapped in the header strip instead of covering the window.
 */
let switchPrompt = $state(false);

export function isSwitchPromptOpen(): boolean {
	return switchPrompt;
}

export function openSwitchPrompt(): void {
	switchPrompt = true;
}

export function closeSwitchPrompt(): void {
	switchPrompt = false;
}

/**
 * Suffix for anything stored per session.
 *
 * Two modes are two databases and therefore two user tables: a token issued by
 * one is meaningless to the other. Namespacing keeps both logins alive side by
 * side instead of one overwriting the other on every switch.
 */
export function dataModeScope(): string {
	if (!supportsDataModes) return "";
	const mode = status?.mode;
	return mode ? `:${mode}` : "";
}

/** Store the choice and restart into it. Resolves only when the switch failed. */
export async function switchDataMode(mode: DataMode): Promise<string | null> {
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("desktop_set_data_mode", { mode });
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}
