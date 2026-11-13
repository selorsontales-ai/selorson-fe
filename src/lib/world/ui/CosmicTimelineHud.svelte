<script lang="ts">
	/**
	 * Dual-Sector Cosmic Navigator (`Tinh Vực Akunalia` ↔ `Hệ Mặt Trời`),
	 * Celestial Astronomical Dossier Card, Nixie-Tube Worldline Divergence Meter
	 * & Temporal Era Scrubber — Bilingual `VI / EN` & Spoiler-Safe.
	 */
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import {
		CELESTIAL_BODIES,
		COSMIC_SECTORS,
		COSMIC_SECTOR_ORDER,
		SECTOR_BODIES,
		WORLD_ERAS,
		computeTemporalRevealState,
		formatDivergenceValue,
		pickText,
		type CelestialBodyId,
		type CosmicSectorId,
		type WorldEraDef,
		type WorldTier,
		type WorldTimeline
	} from '../cosmos';

	interface Props {
		tier: WorldTier;
		activePlanet: CelestialBodyId;
		eraId: string;
		timeline: WorldTimeline;
		effectiveReadUpTo: number | null;
		webglAvailable?: boolean;
		part?: 'top' | 'dock' | 'both';
		onsettier: (tier: WorldTier) => void;
		onselectplanet: (planet: CelestialBodyId) => void;
		onselectsector?: (sector: CosmicSectorId) => void;
		onselectera: (eraId: string, focus?: { lat: number; lng: number }) => void;
		onsettimeline: (timeline: WorldTimeline) => void;
	}

	let {
		tier,
		activePlanet,
		eraId,
		timeline,
		effectiveReadUpTo,
		webglAvailable = true,
		part = 'both',
		onsettier,
		onselectplanet,
		onselectsector,
		onselectera,
		onsettimeline
	}: Props = $props();

	let locale = $derived(currentLocale());
	let activeSpec = $derived(CELESTIAL_BODIES[activePlanet]);
	let activeSector = $derived<CosmicSectorId>(activeSpec.sector);
	let sectorBodyIds = $derived(SECTOR_BODIES[activeSector]);
	let narrativeHomeId = $derived<CelestialBodyId>(
		COSMIC_SECTORS[activeSector].defaultBodyId
	);
	let narrativeHomeSpec = $derived(CELESTIAL_BODIES[narrativeHomeId]);

	let eras = $derived(WORLD_ERAS[activePlanet] ?? []);
	let selectedEraObj = $derived<WorldEraDef | null>(
		eras.find((e) => e.id === eraId) ?? null
	);

	let divergence = $derived(
		formatDivergenceValue(timeline, eraId, activePlanet, effectiveReadUpTo)
	);
	let nixieChars = $derived(divergence.value.split(''));

	function switchSector(sectorId: CosmicSectorId) {
		if (onselectsector) {
			onselectsector(sectorId);
		} else {
			onselectplanet(COSMIC_SECTORS[sectorId].defaultBodyId);
		}
	}
</script>

{#if part === 'top' || part === 'both'}
	<div class="cosmic-top-wrap" role="navigation" aria-label="Cosmic Navigation">
		<!-- 1. Independent Sector Switcher (`Tinh Vực Akunalia` | `Hệ Mặt Trời`) -->
		<div class="sector-switch" role="tablist" aria-label={m.world_sector_label()}>
			{#each COSMIC_SECTOR_ORDER as sectorId (sectorId)}
				{@const sec = COSMIC_SECTORS[sectorId]}
				<button
					type="button"
					role="tab"
					aria-selected={activeSector === sectorId}
					class="sector-btn"
					class:active={activeSector === sectorId}
					style="--sec-accent: {sec.accent};"
					onclick={() => switchSector(sectorId)}
				>
					<span>{sec.icon}</span>
					<span>{pickText(sec.name, locale)}</span>
				</button>
			{/each}
		</div>

		<!-- 2. Sector Overview Toggle + Celestial Bodies in Active Sector -->
		<div class="cosmic-top-bar">
			{#if webglAvailable}
				<button
					type="button"
					class="cosmic-tier-btn"
					class:active={tier === 0}
					onclick={() => onsettier(tier === 0 ? 1 : 0)}
				>
					{m.world_tier_cosmic()}
				</button>
				<span class="bar-sep" aria-hidden="true"></span>
			{/if}

			{#each sectorBodyIds as bodyId (bodyId)}
				{@const spec = CELESTIAL_BODIES[bodyId]}
				{@const isCurrent = tier === 1 && activePlanet === bodyId}
				<button
					type="button"
					class="body-pill"
					class:active={isCurrent}
					style="--body-accent: {spec.accent};"
					title={pickText(spec.name, locale)}
					onclick={() => onselectplanet(bodyId)}
				>
					<span class="body-icon">{spec.icon}</span>
					<span class="body-label">{pickText(spec.shortName, locale)}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if part === 'dock' || part === 'both'}
	{#if tier === 0 && webglAvailable}
		<!-- Sector Overview (`Tier 0`) -->
		<div class="cosmic-overview-dock">
			<p class="cosmic-hint">{m.world_cosmic_overview_hint()}</p>
			<div class="cosmic-cards">
				{#each sectorBodyIds as bodyId (bodyId)}
					{@const spec = CELESTIAL_BODIES[bodyId]}
					<button
						type="button"
						class="cosmic-card"
						style="--card-accent: {spec.accent};"
						onclick={() => onselectplanet(bodyId)}
					>
						<div class="cc-head">
							<span class="cc-icon">{spec.icon}</span>
							<div>
								<strong class="cc-title">{pickText(spec.name, locale)}</strong>
								<span class="cc-badge">{pickText(spec.badge, locale)}</span>
							</div>
						</div>
						<p class="cc-desc">{pickText(spec.summary, locale)}</p>
						<span class="cc-go">
							{m.world_enter_body_orbit({ name: pickText(spec.name, locale) })} →
						</span>
					</button>
				{/each}
			</div>
		</div>
	{:else if !activeSpec.hasNarrativeMap}
		<!-- Astronomical Celestial Dossier Card (`Sun`, `Saturn`, `Jupiter`, `Mars`, Moons, etc.) -->
		<div class="celestial-dossier" style="--body-accent: {activeSpec.accent};">
			<div class="cd-top">
				<div class="cd-identity">
					<span class="cd-icon">{activeSpec.icon}</span>
					<div>
						<div class="cd-title-row">
							<strong class="cd-name">{pickText(activeSpec.name, locale)}</strong>
							<span class="cd-ref-pill">🎯 {m.world_ref_frame_badge()}</span>
						</div>
						<span class="cd-sub">{pickText(activeSpec.badge, locale)}</span>
					</div>
				</div>

				<button
					type="button"
					class="cd-home-btn"
					onclick={() => onselectplanet(narrativeHomeId)}
				>
					{m.world_return_narrative_planet({
						name: pickText(narrativeHomeSpec.name, locale)
					})}
				</button>
			</div>

			<div class="cd-telemetry">
				<div class="cd-stat">
					<span class="cd-stat-k">{m.world_telemetry_class()}</span>
					<strong class="cd-stat-v">
						{pickText(activeSpec.telemetry.classification, locale)}
					</strong>
				</div>
				<div class="cd-stat">
					<span class="cd-stat-k">{m.world_telemetry_radius()}</span>
					<strong class="cd-stat-v">
						{pickText(activeSpec.telemetry.radiusLabel, locale)}
					</strong>
				</div>
				<div class="cd-stat">
					<span class="cd-stat-k">{m.world_telemetry_period()}</span>
					<strong class="cd-stat-v">
						{pickText(activeSpec.telemetry.orbitPeriodLabel, locale)}
					</strong>
				</div>
				<div class="cd-stat">
					<span class="cd-stat-k">{m.world_telemetry_temp()}</span>
					<strong class="cd-stat-v">
						{pickText(activeSpec.telemetry.temperatureLabel, locale)}
					</strong>
				</div>
				<div class="cd-stat">
					<span class="cd-stat-k">{m.world_telemetry_atmo()}</span>
					<strong class="cd-stat-v">
						{pickText(activeSpec.telemetry.atmosphereLabel, locale)}
					</strong>
				</div>
			</div>

			<p class="cd-summary">{pickText(activeSpec.summary, locale)}</p>
		</div>
	{:else}
		<!-- Narrative Living Planet (`Akunalia` / `Earth`): Nixie Divergence + Era Scrubber -->
		<div class="temporal-dock">
			<div class="temporal-header">
				<div class="divergence-box" class:line-two={timeline === 2}>
					<div class="div-meta">
						<span class="div-title">{m.world_divergence_label()}</span>
						<div class="line-toggle" role="group" aria-label={m.world_divergence_label()}>
							<button
								type="button"
								class="line-btn"
								class:active={timeline === 1}
								onclick={() => onsettimeline(1)}
							>
								{m.world_timeline_1_short()}
							</button>
							<button
								type="button"
								class="line-btn line2"
								class:active={timeline === 2}
								onclick={() => onsettimeline(2)}
							>
								{m.world_timeline_2_short()}
							</button>
						</div>
					</div>

					<div class="nixie-rack" aria-live="polite">
						{#each nixieChars as ch, idx (idx)}
							<span class="nixie-tube" class:dot={ch === '.' || ch === '%'}>
								<span class="nixie-ghost" aria-hidden="true">8</span>
								<span class="nixie-digit">{ch}</span>
							</span>
						{/each}
					</div>
				</div>

				<div class="era-readout">
					<div class="planet-crumb">
						<span class="p-badge" style="color: {activeSpec.accent};">
							{activeSpec.icon} {pickText(activeSpec.badge, locale)}
						</span>
						{#if selectedEraObj?.wavelengthNm}
							<span class="wl-pill" style="--wl-color: {selectedEraObj.color};">
								λ {m.world_wavelength_badge({ nm: String(selectedEraObj.wavelengthNm) })}
							</span>
						{/if}
					</div>

					{#if divergence.shielded}
						<p class="shield-note">{m.world_timeline_shielded()}</p>
					{:else if selectedEraObj}
						<p class="era-sub">
							<strong>{pickText(selectedEraObj.title, locale)}:</strong>
							{pickText(selectedEraObj.subtitle, locale)}
						</p>
					{:else}
						<p class="era-sub">{pickText(activeSpec.summary, locale)}</p>
					{/if}
				</div>
			</div>

			{#if eras.length > 1}
				<div class="era-scrubber" role="tablist" aria-label={m.world_era_scrubber_label()}>
					<button
						type="button"
						role="tab"
						aria-selected={eraId === 'all'}
						class="era-chip"
						class:active={eraId === 'all'}
						onclick={() => onselectera('all')}
					>
						<span class="era-dot all-dot"></span>
						<span class="era-year">{m.world_era_all()}</span>
					</button>

					{#each eras as era (era.id)}
						{@const reveal = computeTemporalRevealState(era.unlockChapter, effectiveReadUpTo)}
						{@const isUnlocked = reveal === 'revealed'}
						<button
							type="button"
							role="tab"
							aria-selected={eraId === era.id}
							class="era-chip"
							class:active={eraId === era.id}
							class:locked={!isUnlocked}
							style="--era-color: {era.color};"
							title={isUnlocked
								? pickText(era.title, locale)
								: m.world_era_locked({ chapter: String(era.unlockChapter) })}
							onclick={() => onselectera(era.id, era.focusLatLng)}
						>
							<span class="era-dot" style="background: {era.color};"></span>
							<span class="era-year">{pickText(era.yearLabel, locale)}</span>
							{#if !isUnlocked}
								<span class="era-lock">🔒 Ch.{era.unlockChapter}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.cosmic-top-wrap {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		max-width: 100%;
		pointer-events: none;
	}

	.sector-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.22rem;
		border-radius: 999px;
		background: rgba(5, 10, 22, 0.90);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(148, 163, 184, 0.24);
		box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
		pointer-events: auto;
		flex: none;
	}

	.sector-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.32rem 0.72rem;
		border-radius: 999px;
		border: 1px solid transparent;
		background: transparent;
		color: #94a3b8;
		font-size: 0.74rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.18s, border-color 0.18s, color 0.18s;
	}

	.sector-btn:hover {
		color: #f1f5f9;
		background: rgba(255, 255, 255, 0.06);
	}

	.sector-btn.active {
		background: rgba(15, 23, 42, 0.95);
		border-color: var(--sec-accent, #38bdf8);
		color: #f8fafc;
		box-shadow: 0 0 12px color-mix(in srgb, var(--sec-accent, #38bdf8) 32%, transparent);
	}

	.cosmic-top-bar {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.22rem 0.3rem;
		border-radius: 999px;
		background: rgba(6, 12, 24, 0.86);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(56, 189, 248, 0.22);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
		pointer-events: auto;
		max-width: min(100%, 72rem);
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.bar-sep {
		width: 1px;
		height: 1.1rem;
		background: rgba(148, 163, 184, 0.24);
		margin: 0 0.06rem;
		flex: none;
	}

	.cosmic-tier-btn,
	.body-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.24rem;
		padding: 0.28rem 0.52rem;
		border-radius: 999px;
		border: 1px solid transparent;
		background: transparent;
		color: #cbd5e1;
		font-size: 0.73rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s, color 0.18s;
	}

	.cosmic-tier-btn:hover,
	.body-pill:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #f8fafc;
	}

	.cosmic-tier-btn.active {
		background: linear-gradient(135deg, rgba(14, 165, 233, 0.36), rgba(59, 130, 246, 0.38));
		border-color: rgba(125, 211, 252, 0.65);
		color: #fff;
	}

	.body-pill.active {
		background: rgba(15, 23, 42, 0.94);
		border-color: var(--body-accent, #38bdf8);
		color: #fff;
		box-shadow: 0 0 14px color-mix(in srgb, var(--body-accent, #38bdf8) 35%, transparent);
	}

	/* ── Tier 0 Sector Overview Dock ── */
	.cosmic-overview-dock {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: rgba(6, 12, 24, 0.84);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 14px;
		padding: 0.68rem 0.85rem;
		max-width: 72rem;
		margin: 0 auto;
	}

	.cosmic-hint {
		margin: 0;
		font-size: 0.74rem;
		color: #93c5fd;
		text-align: center;
	}

	.cosmic-cards {
		display: flex;
		gap: 0.55rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
		scrollbar-width: thin;
	}

	.cosmic-card {
		flex: 0 0 14.5rem;
		text-align: left;
		background: rgba(15, 23, 42, 0.76);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-top: 2px solid var(--card-accent, #38bdf8);
		border-radius: 10px;
		padding: 0.6rem 0.7rem;
		color: #e2e8f0;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.34rem;
		transition: transform 0.18s, border-color 0.18s, background 0.18s;
	}
	.cosmic-card:hover {
		transform: translateY(-2px);
		background: rgba(30, 41, 59, 0.88);
		border-color: var(--card-accent, #38bdf8);
	}

	.cc-head {
		display: flex;
		align-items: center;
		gap: 0.42rem;
	}
	.cc-icon {
		font-size: 1.2rem;
	}
	.cc-title {
		display: block;
		font-size: 0.82rem;
		color: #f8fafc;
	}
	.cc-badge {
		display: block;
		font-size: 0.64rem;
		color: #94a3b8;
	}
	.cc-desc {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.42;
		color: #cbd5e1;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cc-go {
		margin-top: auto;
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--card-accent, #38bdf8);
	}

	/* ── Celestial Astronomical Dossier Card ── */
	.celestial-dossier {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.52rem;
		background: rgba(6, 11, 22, 0.86);
		backdrop-filter: blur(18px);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-top: 2px solid var(--body-accent, #38bdf8);
		border-radius: 13px;
		padding: 0.68rem 0.9rem;
		max-width: 58rem;
		margin: 0 auto;
		width: 100%;
	}

	.cd-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.cd-identity {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.cd-icon {
		font-size: 1.55rem;
	}

	.cd-title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	.cd-name {
		font-size: 0.94rem;
		color: #f8fafc;
	}

	.cd-ref-pill {
		font-size: 0.64rem;
		font-weight: 700;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		color: var(--body-accent, #38bdf8);
		border: 1px solid color-mix(in srgb, var(--body-accent, #38bdf8) 55%, transparent);
		background: rgba(15, 23, 42, 0.85);
	}

	.cd-sub {
		display: block;
		font-size: 0.7rem;
		color: #94a3b8;
	}

	.cd-home-btn {
		padding: 0.34rem 0.76rem;
		border-radius: 999px;
		border: 1px solid rgba(56, 189, 248, 0.38);
		background: rgba(14, 165, 233, 0.14);
		color: #e0f2fe;
		font-size: 0.73rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s;
	}

	.cd-home-btn:hover {
		background: rgba(14, 165, 233, 0.28);
		border-color: #38bdf8;
	}

	.cd-telemetry {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.42rem;
	}

	.cd-stat {
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 8px;
		padding: 0.35rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.cd-stat-k {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #94a3b8;
	}

	.cd-stat-v {
		font-size: 0.73rem;
		color: #f1f5f9;
		font-weight: 600;
	}

	.cd-summary {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.45;
		color: #cbd5e1;
	}

	/* ── Tầng 1 Temporal Divergence & Era Scrubber Dock ── */
	.temporal-dock {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: rgba(6, 11, 22, 0.84);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.11);
		border-radius: 12px;
		padding: 0.6rem 0.8rem;
	}

	.temporal-header {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	.divergence-box {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.32rem 0.6rem;
		border-radius: 9px;
		background: rgba(10, 6, 4, 0.9);
		border: 1px solid rgba(249, 115, 22, 0.38);
		box-shadow: inset 0 0 16px rgba(249, 115, 22, 0.12);
	}

	.divergence-box.line-two {
		border-color: rgba(52, 211, 153, 0.45);
		box-shadow: inset 0 0 16px rgba(52, 211, 153, 0.15);
	}

	.div-meta {
		display: flex;
		flex-direction: column;
		gap: 0.24rem;
	}

	.div-title {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #94a3b8;
	}

	.line-toggle {
		display: inline-flex;
		gap: 0.2rem;
	}

	.line-btn {
		padding: 0.14rem 0.42rem;
		font-size: 0.64rem;
		font-weight: 600;
		border-radius: 5px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: #94a3b8;
		cursor: pointer;
	}

	.line-btn.active {
		background: rgba(249, 115, 22, 0.22);
		border-color: #fb923c;
		color: #fed7aa;
	}

	.line-btn.line2.active {
		background: rgba(16, 185, 129, 0.24);
		border-color: #34d399;
		color: #a7f3d0;
	}

	.nixie-rack {
		display: inline-flex;
		align-items: center;
		gap: 0.12rem;
		font-family: ui-monospace, 'Cascadia Mono', 'Fira Code', monospace;
	}

	.nixie-tube {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.75rem;
		border-radius: 4px;
		background: linear-gradient(180deg, rgba(30, 15, 8, 0.92), rgba(10, 5, 3, 0.96));
		border: 1px solid rgba(251, 146, 60, 0.25);
	}

	.nixie-tube.dot {
		width: 0.85rem;
	}

	.nixie-ghost {
		position: absolute;
		font-size: 1rem;
		color: rgba(251, 146, 60, 0.09);
		user-select: none;
	}

	.nixie-digit {
		position: relative;
		font-size: 1rem;
		font-weight: 700;
		color: #fb923c;
		text-shadow: 0 0 8px rgba(251, 146, 60, 0.85), 0 0 16px rgba(234, 88, 12, 0.45);
	}

	.divergence-box.line-two .nixie-tube {
		border-color: rgba(52, 211, 153, 0.3);
	}

	.divergence-box.line-two .nixie-digit {
		color: #34d399;
		text-shadow: 0 0 8px rgba(52, 211, 153, 0.85), 0 0 16px rgba(16, 185, 129, 0.45);
	}

	.era-readout {
		flex: 1;
		min-width: 14rem;
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
	}

	.planet-crumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.p-badge {
		font-size: 0.73rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.wl-pill {
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		color: var(--wl-color, #38bdf8);
		border: 1px solid color-mix(in srgb, var(--wl-color, #38bdf8) 55%, transparent);
		background: rgba(15, 23, 42, 0.8);
	}

	.era-sub {
		margin: 0;
		font-size: 0.75rem;
		color: #cbd5e1;
		line-height: 1.38;
	}
	.era-sub strong {
		color: #f8fafc;
	}

	.shield-note {
		margin: 0;
		font-size: 0.73rem;
		color: #fcd34d;
	}

	.era-scrubber {
		display: flex;
		align-items: center;
		gap: 0.36rem;
		overflow-x: auto;
		padding-bottom: 0.12rem;
		scrollbar-width: thin;
	}

	.era-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.34rem;
		padding: 0.28rem 0.62rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.11);
		background: rgba(15, 23, 42, 0.72);
		color: #cbd5e1;
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition: border-color 0.16s, background 0.16s, color 0.16s;
	}

	.era-chip:hover {
		background: rgba(30, 41, 59, 0.9);
		color: #fff;
	}

	.era-chip.active {
		background: rgba(15, 23, 42, 0.95);
		border-color: var(--era-color, #38bdf8);
		color: #fff;
		box-shadow: 0 0 12px color-mix(in srgb, var(--era-color, #38bdf8) 38%, transparent);
	}

	.era-chip.locked {
		opacity: 0.65;
	}

	.era-dot {
		width: 0.46rem;
		height: 0.46rem;
		border-radius: 50%;
		flex: none;
	}

	.all-dot {
		background: conic-gradient(#ef4444, #eab308, #22c55e, #38bdf8, #a855f7, #ef4444);
	}

	.era-lock {
		font-size: 0.62rem;
		color: #94a3b8;
	}

	@media (max-width: 900px) {
		.cd-telemetry {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
