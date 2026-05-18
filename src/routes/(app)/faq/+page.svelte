<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	// Dùng effect hoặc state tĩnh
	let faqs = $derived([
		{ q: m.faq_q1(), a: m.faq_a1() },
		{ q: m.faq_q2(), a: m.faq_a2() },
		{ q: m.faq_q3(), a: m.faq_a3() },
		{ q: m.faq_q4(), a: m.faq_a4() },
		{ q: m.faq_q5(), a: m.faq_a5() },
		{ q: m.faq_q6(), a: m.faq_a6() },
		{ q: m.faq_q7(), a: m.faq_a7() },
	]);
</script>

<svelte:head><title>{m.faq_title()} — Selorson</title></svelte:head>

<div class="faq-page">
	<h1 class="section-title">{m.faq_title()}</h1>
	<p class="subtitle">{m.faq_subtitle()}</p>

	<div class="faq-list">
		{#each faqs as faq, i}
			<details class="faq-item glass-card">
				<summary>{faq.q}</summary>
				<p>{faq.a}</p>
			</details>
		{/each}
	</div>
</div>



<style>
	.faq-page { max-width: 700px; margin: 0 auto; padding: 2rem 1rem 4rem; }
	.subtitle { text-align: center; color: var(--color-text-muted); font-size: 1rem; margin-top: -1rem; margin-bottom: 2rem; }
	.faq-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.faq-item { padding: 0; overflow: hidden; cursor: pointer; }
	.faq-item summary {
		padding: 1rem 1.25rem; font-weight: 600; font-size: 0.92rem;
		list-style: none; display: flex; align-items: center; gap: 0.5rem;
	}
	.faq-item summary::before { content: '▸'; transition: transform 0.2s; }
	.faq-item[open] summary::before { transform: rotate(90deg); }
	.faq-item p {
		padding: 0 1.25rem 1rem; font-size: 0.88rem;
		color: var(--color-text-secondary); line-height: 1.6;
	}
</style>
