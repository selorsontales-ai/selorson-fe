<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Cropper from "cropperjs";
	import "cropperjs/dist/cropper.css";
	import * as m from "$lib/paraglide/messages";

	let {
		imageSrc,
		aspectRatio = 1,
		onCrop,
		onCancel,
	} = $props<{
		imageSrc: string;
		aspectRatio?: number;
		onCrop: (blob: Blob) => void;
		onCancel: () => void;
	}>();

	let imageElement: HTMLImageElement;
	let cropper: Cropper | null = null;
	let loading = $state(false);

	onMount(() => {
		cropper = new Cropper(imageElement, {
			aspectRatio: aspectRatio,
			viewMode: 1,
			dragMode: "move",
			autoCropArea: 1,
			restore: false,
			guides: true,
			center: true,
			highlight: false,
			cropBoxMovable: true,
			cropBoxResizable: true,
			toggleDragModeOnDblclick: false,
		});
	});

	onDestroy(() => {
		if (cropper) {
			cropper.destroy();
		}
	});

	function handleCrop() {
		if (!cropper) return;
		loading = true;
		const canvas = cropper.getCroppedCanvas(
			aspectRatio === 1 ? { width: 400, height: 400 } : undefined,
		);
		canvas.toBlob(
			(blob) => {
				loading = false;
				if (blob) onCrop(blob);
			},
			"image/webp",
			0.8,
		);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="crop-modal-overlay" onmousedown={onCancel}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="crop-modal-content" onmousedown={(e) => e.stopPropagation()}>
		<h3>{m.crop_heading()}</h3>
		<div class="crop-container">
			<img bind:this={imageElement} src={imageSrc} alt="Crop" />
		</div>
		<div class="crop-actions">
			<button class="btn-cancel" onclick={onCancel} disabled={loading}
				>{m.crop_cancel()}</button
			>
			<button class="btn-confirm" onclick={handleCrop} disabled={loading}>
				{loading ? m.crop_processing() : m.crop_done()}
			</button>
		</div>
	</div>
</div>

<style>
	.crop-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.crop-modal-content {
		background: var(--color-surface-100, #1e293b);
		border-radius: 1rem;
		padding: clamp(1rem, 3.5vw, 1.5rem);
		width: 100%;
		max-width: 500px;
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-text-primary, #f8fafc);
	}
	:global(html[data-theme="light"]) .crop-modal-content {
		background: #fff;
		border-color: #e2e8f0;
		color: #0f172a;
	}
	.crop-modal-content h3 {
		margin: 0 0 1rem;
		font-size: 1.125rem;
	}
	.crop-container {
		width: 100%;
		height: min(350px, 52dvh);
		background: #000;
		border-radius: 0.5rem;
		overflow: hidden;
		margin-bottom: 1rem;
	}
	.crop-container img {
		display: block;
		max-width: 100%;
	}
	.crop-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: flex-end;
	}
	.btn-cancel {
		padding: 0.5rem 1rem;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		color: var(--color-text-secondary, #94a3b8);
		cursor: pointer;
		font-family: inherit;
		font-weight: 500;
	}
	:global(html[data-theme="light"]) .btn-cancel {
		border-color: #e2e8f0;
		color: #64748b;
	}
	.btn-confirm {
		padding: 0.5rem 1.25rem;
		background: var(--color-brand-500, #10b981);
		border: none;
		border-radius: 0.5rem;
		color: #fff;
		cursor: pointer;
		font-family: inherit;
		font-weight: 600;
	}
	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
