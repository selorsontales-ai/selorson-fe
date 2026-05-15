<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	let slides = $state<any[]>([]);
	let current = $state(0);
	let intervalId: ReturnType<typeof setInterval>;

	onMount(() => {
		let isMounted = true;
		
		const loadSlides = async () => {
			try {
				const res = await api<any>('/homepage');
				if (isMounted) slides = res.data?.hero_slides || [];
			} catch { if (isMounted) slides = []; }

			if (isMounted && slides.length > 1) {
				intervalId = setInterval(() => {
					current = (current + 1) % slides.length;
				}, 5000);
			}
		};
		
		loadSlides();

		return () => { 
			isMounted = false;
			if (intervalId) clearInterval(intervalId); 
		};
	});

	function goTo(i: number) { current = i; }
</script>

{#if slides.length > 0}
	<div class="hero-slider">
		{#each slides as slide, i}
			<div class="slide" class:active={i === current} style="background-image:url({slide.image_url})">
				<div class="slide-overlay"></div>
				<div class="slide-content">
					{#if slide.round}
						<span class="slide-badge">{slide.round}</span>
					{/if}
					<h2 class="slide-title">{slide.title}</h2>
					{#if slide.description}
						<p class="slide-desc">{slide.description}</p>
					{/if}
					{#if slide.button_text && slide.link_url}
						<a href={slide.link_url} class="slide-btn">{slide.button_text}</a>
					{/if}
				</div>
			</div>
		{/each}

		{#if slides.length > 1}
			<div class="dots">
				{#each slides as _, i}
					<button class="dot" class:active={i === current} onclick={() => goTo(i)} aria-label="Slide {i+1}"></button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.hero-slider { position: relative; width: 100%; aspect-ratio: 21/9; min-height: 320px; max-height: 500px; border-radius: var(--radius-xl); overflow: hidden; }
	.slide { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0; transition: opacity 0.8s ease; }
	.slide.active { opacity: 1; }
	.slide-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(0,0,0,.7) 100%); }
	.slide-content { position: absolute; bottom: 0; left: 0; right: 0; padding: 2rem 2.5rem; z-index: 2; }
	.slide-badge { display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding: 0.2rem 0.6rem; background: rgba(12,113,61,.3); border: 1px solid rgba(12,113,61,.5); color: var(--color-brand-300); border-radius: 4px; margin-bottom: 0.5rem; }
	.slide-title { font-size: clamp(1.25rem, 3vw, 2rem); font-weight: 700; line-height: 1.2; margin-bottom: 0.35rem; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,.3); }
	.slide-desc { font-size: 0.9rem; color: rgba(255,255,255,.8); max-width: 500px; line-height: 1.5; }
	.slide-btn { display: inline-block; margin-top: 0.75rem; padding: 0.5rem 1.25rem; background: linear-gradient(135deg, #0c713d, #06b6d4); color: #fff; border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: 600; transition: transform .15s; }
	.slide-btn:hover { transform: translateY(-1px); }
	.dots { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); display: flex; gap: 0.4rem; z-index: 3; }
	.dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: rgba(255,255,255,.3); cursor: pointer; transition: all .2s; padding: 0; }
	.dot.active { background: #fff; width: 20px; border-radius: 4px; }
</style>
