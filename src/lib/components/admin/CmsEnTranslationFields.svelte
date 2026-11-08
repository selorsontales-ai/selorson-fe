<script lang="ts">
	export interface CmsFieldSpec {
		key: string;
		label: string;
		placeholder?: string;
		multiline?: boolean;
		rows?: number;
	}

	let {
		fields = $bindable<Record<string, string>>({}),
		specs = [],
		title = '🇬🇧 Bản dịch Tiếng Anh (EN — Tùy chọn)'
	}: {
		fields: Record<string, string>;
		specs: CmsFieldSpec[];
		title?: string;
	} = $props();

	let hasFilledField = $derived(
		specs.some((s) => typeof fields[s.key] === 'string' && fields[s.key].trim().length > 0)
	);
</script>

<details class="cms-en-box" open={hasFilledField}>
	<summary class="cms-en-summary">
		<span>{title}</span>
		{#if hasFilledField}
			<span class="cms-en-pill active">Đã có EN</span>
		{:else}
			<span class="cms-en-pill">Mặc định dùng VI nếu để trống</span>
		{/if}
	</summary>

	<div class="cms-en-grid">
		{#each specs as spec (spec.key)}
			<div class="cms-en-field">
				<label>
					<span>{spec.label}</span>
					{#if spec.multiline}
						<textarea
							rows={spec.rows ?? 3}
							value={fields[spec.key] ?? ''}
							placeholder={spec.placeholder ?? ''}
							oninput={(e) => {
								fields = {
									...fields,
									[spec.key]: (e.currentTarget as HTMLTextAreaElement).value
								};
							}}
						></textarea>
					{:else}
						<input
							type="text"
							value={fields[spec.key] ?? ''}
							placeholder={spec.placeholder ?? ''}
							oninput={(e) => {
								fields = {
									...fields,
									[spec.key]: (e.currentTarget as HTMLInputElement).value
								};
							}}
						/>
					{/if}
				</label>
			</div>
		{/each}
	</div>
</details>

<style>
	.cms-en-box {
		margin-top: 0.75rem;
		margin-bottom: 0.5rem;
		border: 1px solid rgba(59, 130, 246, 0.28);
		background: rgba(30, 58, 138, 0.08);
		border-radius: 0.65rem;
		padding: 0.65rem 0.85rem;
	}
	.cms-en-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-text-primary);
		user-select: none;
	}
	.cms-en-pill {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.15);
		color: var(--color-text-muted);
	}
	.cms-en-pill.active {
		background: rgba(34, 197, 94, 0.16);
		color: #4ade80;
		border: 1px solid rgba(34, 197, 94, 0.32);
	}
	.cms-en-grid {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}
	.cms-en-field label {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.cms-en-field input,
	.cms-en-field textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.55rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.84rem;
		font-family: inherit;
	}
	:global(html[data-theme='light']) .cms-en-field input,
	:global(html[data-theme='light']) .cms-en-field textarea {
		border-color: rgba(0, 0, 0, 0.12);
		background: #fff;
	}
</style>
