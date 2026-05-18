<script lang="ts">
	import { api } from '$lib/api';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import { fetchVoteStats, getVoteStats, getUserVote, castVote } from '$lib/stores/engagement.svelte';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let loading = $state(true);
	let voting = $state(false);
	let message = $state('');

	onMount(async () => {
		await fetchVoteStats();
		loading = false;
	});

	async function handleVote(choice: number) {
		if (!isAuthenticated()) { message = m.vote_login(); return; }
		voting = true; message = '';
		try {
			const r = await castVote(choice);
			message = (r as any).message || m.vote_voted();
		} catch (e: any) { message = e.message || m.vote_error(); }
		voting = false;
	}
</script>

{#if !loading && getVoteStats() && getVoteStats().options && getVoteStats().options.length > 0}
	{@const stats = getVoteStats()}
	<div class="vote-widget">
		<h2 class="section-title">{m.vote_title()}</h2>
		<p class="page-subtitle">{m.vote_total({ count: stats.total_votes })}</p>

		<div class="options">
			{#each stats.options as opt}
				{@const isSelected = getUserVote()?.choice === opt.choice_id}
				<button class="option" class:selected={isSelected} class:disabled={voting}
					onclick={() => handleVote(opt.choice_id)}>
					<div class="option-header">
						<span class="option-icon">{opt.icon}</span>
						<span class="option-label">{opt.label}</span>
						<span class="option-pct">{opt.percentage}%</span>
					</div>
					<div class="bar-track">
						<div class="bar-fill" style="width:{opt.percentage}%"></div>
					</div>
					<span class="option-count">{m.vote_total({ count: opt.count })}</span>
				</button>
			{/each}
		</div>

		{#if message}
			<p class="vote-msg">{message}</p>
		{/if}
	</div>
{/if}

<style>
	.vote-widget { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; padding: 1.5rem; }

	.options { display: flex; flex-direction: column; gap: 0.75rem; }
	.option { display: block; width: 100%; text-align: left; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.06); border-radius: 10px; padding: 0.75rem 1rem; cursor: pointer; transition: all .2s; color: var(--color-text-primary); }
	.option:hover { border-color: rgba(12,113,61,.3); background: rgba(12,113,61,.05); }
	.option.selected { border-color: var(--color-brand-500); background: rgba(12,113,61,.1); }
	.option.disabled { pointer-events: none; opacity: 0.7; }

	.option-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
	.option-icon { font-size: 1.1rem; }
	.option-label { flex: 1; font-size: 0.9rem; font-weight: 500; }
	.option-pct { font-size: 0.85rem; font-weight: 700; color: var(--color-brand-400); }

	.bar-track { width: 100%; height: 4px; background: rgba(255,255,255,.06); border-radius: 2px; overflow: hidden; }
	.bar-fill { height: 100%; background: linear-gradient(90deg, var(--color-brand-500), var(--color-accent-cyan)); border-radius: 2px; transition: width .5s ease; }

	.option-count { font-size: 0.7rem; color: var(--color-text-muted); margin-top: 0.25rem; display: block; }

	.vote-msg { margin-top: 0.75rem; font-size: 0.8rem; color: var(--color-brand-300); text-align: center; }
</style>
