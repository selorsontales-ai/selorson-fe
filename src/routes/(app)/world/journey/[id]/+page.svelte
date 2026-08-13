<script lang="ts">
	/**
	 * L4 — follow a character.
	 *
	 * Only unlocked stops are handed to the scene; the rest become a locked tail
	 * on the timeline, so the reader can see there is more without being told
	 * what it is.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { fetchJourney } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { Journey } from '$lib/world/types';
	import JourneyHud from '$lib/world/ui/JourneyHud.svelte';
	import { onDestroy, onMount } from 'svelte';

	let characterId = $derived(Number(page.params.id));

	let journey = $state<Journey | null>(null);
	let quality = $state<QualitySettings | null>(null);
	let CanvasComponent = $state<
		typeof import('$lib/world/engine/JourneyCanvas.svelte').default | null
	>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let index = $state(0);
	let playing = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	let unlocked = $derived(journey?.stops.filter((s) => !s.locked) ?? []);
	let lockedCount = $derived(journey?.stops.filter((s) => s.locked).length ?? 0);

	onMount(async () => {
		const resolvedQuality = resolveQuality(new URLSearchParams(location.search));
		quality = resolvedQuality;
		const canvasPromise =
			resolvedQuality.tier !== 'none'
				? import('$lib/world/engine/JourneyCanvas.svelte')
						.then((module) => module.default)
						.catch(() => null)
				: Promise.resolve(null);

		try {
			const [loadedJourney, canvas] = await Promise.all([
				fetchJourney(characterId),
				canvasPromise
			]);
			journey = loadedJourney;
			if (loadedJourney.stops.some((stop) => !stop.locked)) CanvasComponent = canvas;
		} catch {
			notFound = true;
		} finally {
			loading = false;
		}
	});

	/** Auto-advance stops one at a time; stops itself at the end of the road. */
	$effect(() => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		if (!playing) return;
		timer = setInterval(() => {
			if (index >= unlocked.length - 1) {
				playing = false;
				return;
			}
			index += 1;
		}, 2600);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

<svelte:head>
	<title>{journey?.character.name ?? m.world_journeys()} — Selorson</title>
</svelte:head>

<section class="journey-page">
	{#if loading}
		<div class="journey-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if notFound || !journey}
		<div class="journey-msg">
			<p>{m.world_character_not_found()}</p>
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else if unlocked.length === 0}
		<div class="journey-msg">
			<p>{m.world_no_journey()}</p>
			{#if lockedCount > 0}
				<p class="muted">{m.world_locked_hint()}</p>
			{/if}
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else if CanvasComponent && quality}
		<div class="stage">
			<CanvasComponent
				character={journey.character}
				stops={unlocked}
				{quality}
				position={index}
				onstop={(i) => {
					playing = false;
					index = i;
				}}
			/>
			<JourneyHud
				character={journey.character}
				stops={unlocked}
				{lockedCount}
				{index}
				{playing}
				onindex={(i) => {
					playing = false;
					index = i;
				}}
				onplay={(v) => (playing = v)}
			/>
		</div>
	{:else}
		<div class="journey-msg">
			<p>{m.world_no_webgl()}</p>
			<a class="fallback-link" href="/library">{m.world_open_library()}</a>
		</div>
	{/if}
</section>

<style>
	.journey-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 32rem;
		background: #02050e;
		overflow: hidden;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	.journey-msg {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary, #cbd5e1);
	}
	.journey-msg .muted {
		color: var(--color-text-muted, #94a3b8);
		font-size: 0.86rem;
	}
	.fallback-link {
		padding: 0.55rem 1.1rem;
		border: 1px solid var(--color-brand-500, #0c713d);
		border-radius: 999px;
		color: var(--color-brand-300, #4ade80);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.spinner {
		width: 1.6rem;
		height: 1.6rem;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: var(--color-brand-500, #0c713d);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
