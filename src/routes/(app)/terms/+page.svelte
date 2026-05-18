<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.terms_title()} — Selorson</title></svelte:head>

<div class="legal-page">
	<h1 class="section-title">{m.terms_title()}</h1>
	<p class="updated">{m.terms_updated()}</p>

	<section class="glass-card legal-section">
		<h2>{m.terms_s1_t()}</h2>
		<p>{m.terms_s1_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s2_t()}</h2>
		<p>{m.terms_s2_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s3_t()}</h2>
		<p>{m.terms_s3_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s4_t()}</h2>
		<p>{m.terms_s4_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s5_t()}</h2>
		<p>{m.terms_s5_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s6_t()}</h2>
		<p>{m.terms_s6_d()}</p>
	</section>

	<section class="glass-card legal-section">
		<h2>{m.terms_s7_t()}</h2>
		<p>{m.terms_s7_d()}</p>
	</section>
</div>

<style>
	.legal-page{max-width:700px;margin:0 auto;padding:2rem 1rem 4rem}
	.updated{text-align:center;font-size:1rem;color:var(--color-text-muted);margin-top:-1rem;margin-bottom:2rem}
	.legal-section{padding:1.25rem;margin-bottom:.75rem}
	.legal-section h2{font-size:1rem;font-weight:600;margin-bottom:.5rem;color:var(--color-brand-400)}
	.legal-section p{font-size:.88rem;line-height:1.7;color:var(--color-text-secondary)}
</style>
