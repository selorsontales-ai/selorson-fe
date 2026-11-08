<script lang="ts">
	import { apiUpload } from "$lib/api";
	import * as m from "$lib/paraglide/messages";

	let {
		folder = "general",
		onUpload = (_: any) => {},
	}: { folder?: string; onUpload?: (result: any) => void } = $props();

	let uploading = $state(false);
	let error = $state("");
	let preview = $state("");
	let dragOver = $state(false);

	async function handleFile(file: File) {
		if (!file.type.startsWith("image/")) {
			error = m.upload_err_invalid_img();
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			error = m.upload_err_max_10mb();
			return;
		}

		error = "";
		uploading = true;
		preview = URL.createObjectURL(file);

		try {
			const formData = new FormData();
			formData.append("image", file);
			formData.append("folder", folder);

			const res = await apiUpload<{ url: string }>(
				"/upload/image",
				formData,
			);
			if (res.success) {
				onUpload(res.data);
			} else {
				error = res.message || m.upload_err_failed();
			}
		} catch (e: any) {
			error = e.message || m.upload_err_conn();
		}
		uploading = false;
	}

	function onFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) handleFile(input.files[0]);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]);
	}
</script>

<div
	class="upload-zone"
	class:drag-over={dragOver}
	class:uploading
	role="button"
	tabindex="0"
	ondragover={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
>
	{#if uploading}
		<div class="upload-progress">
			<div class="spinner"></div>
			<span>{m.upload_uploading()}</span>
		</div>
	{:else if preview}
		<img src={preview} alt="Preview" class="upload-preview" />
		<label class="upload-label">
			<input
				type="file"
				accept="image/*"
				onchange={onFileSelect}
				hidden
			/>
			{m.upload_change_img()}
		</label>
	{:else}
		<label class="upload-label">
			<input
				type="file"
				accept="image/*"
				onchange={onFileSelect}
				hidden
			/>
			<span class="upload-icon">📷</span>
			<span>{m.upload_drop_label()}</span>
			<span class="upload-hint">{m.upload_format_hint()}</span>
		</label>
	{/if}

	{#if error}<p class="upload-error">{error}</p>{/if}
</div>

<style>
	.upload-zone {
		border: 2px dashed rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--color-surface-100);
		min-height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}
	.upload-zone:hover,
	.drag-over {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.05);
	}
	.upload-zone.uploading {
		pointer-events: none;
		opacity: 0.7;
	}
	.upload-label {
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
	.upload-icon {
		font-size: 1.5rem;
	}
	.upload-hint {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		opacity: 0.6;
	}
	.upload-preview {
		max-width: 200px;
		max-height: 150px;
		border-radius: var(--radius-md);
		object-fit: cover;
		margin-bottom: 0.5rem;
	}
	.upload-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid var(--color-surface-300);
		border-top-color: var(--color-brand-400);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.upload-error {
		color: #f87171;
		font-size: 0.78rem;
		margin-top: 0.5rem;
	}
</style>
