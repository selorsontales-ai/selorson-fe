<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>404 — Selorson</title>
	<meta name="description" content={m.err404_meta()} />
</svelte:head>

<section class="error-page">
	<div class="error-content fade-in">
		<span class="error-code">404</span>
		<h1>{m.err404_title()}</h1>
		<p>{m.err404_desc()}</p>
		<div class="error-actions">
			<a href="/" class="btn-brand">{m.err404_home()}</a>
			<a href="/stories" class="btn-ghost">{m.err404_stories()}</a>
		</div>
	</div>
</section>

<style>
	.error-page {
		min-height: 70vh;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem;
	}
	.error-content {
		max-width: 500px;
	}
	.error-code {
		font-size: 8rem;
		font-weight: 900;
		line-height: 1;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		opacity: 0.6;
	}
	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0.75rem 0 0.5rem;
	}
	p {
		color: var(--color-text-muted);
		font-size: 0.95rem;
		margin-bottom: 2rem;
		line-height: 1.6;
	}
	.error-actions {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.error-actions a {
		text-decoration: none;
	}
</style>
