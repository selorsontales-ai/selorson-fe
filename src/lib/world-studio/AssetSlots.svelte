<script lang="ts">
	/**
	 * Binds production assets to a library item, one slot at a time.
	 *
	 * Slots exist because one file is rarely right everywhere. A character needs
	 * a bust to stand on the map, where a full figure would be an unreadable
	 * speck, and a full model to walk their journey. Binding by slot lets both be
	 * true at once, and lets either be upgraded later without touching the other.
	 *
	 * Bindings store the asset's *slug*, not its id or URL: renaming an asset or
	 * re-uploading its file must not break the binding.
	 */
	import { fetchAssets } from '$lib/world-assets/api';
	import { formatSize, slotsFor, type WorldAsset } from '$lib/world-assets/types';
	import { onMount } from 'svelte';

	interface Props {
		/** Studio node kind — decides which slots are offered. */
		kind: string;
		/** Current bindings: slot → asset slug. */
		bindings: Record<string, string>;
		onchange: (bindings: Record<string, string>) => void;
	}

	let { kind, bindings, onchange }: Props = $props();

	let assets = $state<WorldAsset[]>([]);
	let loading = $state(true);
	let openSlot = $state<string | null>(null);
	let search = $state('');

	onMount(async () => {
		const cat = await fetchAssets();
		assets = cat.assets;
		loading = false;
	});

	let slots = $derived(slotsFor(kind));
	let bySlug = $derived(new Map(assets.map((a) => [a.slug, a])));

	function candidatesFor(slotKind: string) {
		const needle = search.trim().toLowerCase();
		return assets
			.filter((a) => a.kind === slotKind)
			.filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.slug.includes(needle));
	}

	function bind(slot: string, slug: string | null) {
		const next = { ...bindings };
		if (slug) next[slot] = slug;
		else delete next[slot];
		onchange(next);
		openSlot = null;
		search = '';
	}
</script>

<section class="slots">
	<h3>Asset 3D</h3>

	{#if slots.length === 0}
		<p class="hint">Loại nút này chưa có slot asset nào.</p>
	{:else if loading}
		<p class="hint">Đang tải thư viện asset…</p>
	{:else}
		{#each slots as def (def.slot)}
			{@const slug = bindings[def.slot]}
			{@const asset = slug ? bySlug.get(slug) : null}
			<div class="slot">
				<div class="slot-head">
					<span class="slot-label">{def.label}</span>
					{#if asset}
						<button class="link" onclick={() => bind(def.slot, null)}>gỡ</button>
					{/if}
				</div>

				{#if asset}
					<button class="bound" onclick={() => (openSlot = openSlot === def.slot ? null : def.slot)}>
						{#if asset.thumbnail_url}
							<img src={asset.thumbnail_url} alt="" />
						{:else}
							<span class="thumb-fallback">🧊</span>
						{/if}
						<span class="bound-body">
							<span class="bound-name">{asset.name}</span>
							<span class="bound-meta">{formatSize(asset.file_size)}</span>
						</span>
					</button>
				{:else if slug}
					<!-- Bound to something that no longer resolves. Saying so beats a
					     blank space that looks like nothing was ever set. -->
					<button class="bound missing" onclick={() => (openSlot = def.slot)}>
						<span class="thumb-fallback">⚠</span>
						<span class="bound-body">
							<span class="bound-name">Asset "{slug}" không còn</span>
							<span class="bound-meta">đã bị ẩn hoặc xoá</span>
						</span>
					</button>
				{:else}
					<button
						class="empty-slot"
						onclick={() => (openSlot = openSlot === def.slot ? null : def.slot)}
					>
						+ Chọn asset
					</button>
				{/if}

				<p class="slot-hint">{def.hint}</p>

				{#if openSlot === def.slot}
					{@const list = candidatesFor(def.kind)}
					<div class="picker">
						<input placeholder="Tìm asset…" bind:value={search} />
						{#if list.length === 0}
							<p class="hint">
								Chưa có asset loại này. Thêm ở
								<a href="/admin/world-assets">Thư viện Asset 3D</a>.
							</p>
						{:else}
							<ul>
								{#each list as candidate (candidate.id)}
									<li>
										<button onclick={() => bind(def.slot, candidate.slug)}>
											{#if candidate.thumbnail_url}
												<img src={candidate.thumbnail_url} alt="" />
											{:else}
												<span class="thumb-fallback small">🧊</span>
											{/if}
											<span class="cand-name">{candidate.name}</span>
											<span class="cand-size">{formatSize(candidate.file_size)}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<p class="hint">
			Slot trống thì engine tự rơi xuống mức dưới — ảnh thư viện, rồi chấm sáng. Không có asset
			vẫn chạy, chỉ là kém đẹp hơn.
		</p>
	{/if}
</section>

<style>
	.slots {
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	h3 {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #94a3b8;
		margin: 0;
	}
	.hint {
		font-size: 0.72rem;
		color: #94a3b8;
		line-height: 1.55;
		margin: 0;
	}
	.hint a {
		color: #4ade80;
	}

	.slot {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.slot-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.slot-label {
		font-size: 0.76rem;
		font-weight: 600;
	}
	.slot-hint {
		font-size: 0.68rem;
		color: #94a3b8;
		line-height: 1.45;
		margin: 0;
	}

	button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		border-color: #ffb703;
	}
	.link {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 0.7rem;
		padding: 0;
		text-decoration: underline;
	}
	.link:hover {
		color: #f87171;
	}

	.bound {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem;
		text-align: left;
	}
	.bound.missing {
		border-color: rgba(248, 113, 113, 0.5);
	}
	.bound img,
	.picker img {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 4px;
		object-fit: cover;
		flex: none;
	}
	.thumb-fallback {
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		flex: none;
	}
	.thumb-fallback.small {
		width: 1.7rem;
		height: 1.7rem;
		font-size: 0.75rem;
	}
	.bound-body {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.bound-name {
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bound-meta {
		font-size: 0.66rem;
		color: #94a3b8;
	}

	.empty-slot {
		padding: 0.45rem;
		font-size: 0.76rem;
		color: #94a3b8;
		border-style: dashed;
	}

	.picker {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 15rem;
		overflow-y: auto;
	}
	.picker input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		color: inherit;
		font: inherit;
		font-size: 0.76rem;
	}
	.picker ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.picker li button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.25rem;
		text-align: left;
		border-color: transparent;
	}
	.cand-name {
		flex: 1;
		font-size: 0.76rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cand-size {
		font-size: 0.66rem;
		color: #94a3b8;
	}
</style>
