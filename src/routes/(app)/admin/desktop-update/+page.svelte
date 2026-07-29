<script lang="ts">
	import { goto } from "$app/navigation";
	import { supportsDesktopUpdater } from "$lib/app-flavor";
	import { onMount } from "svelte";

	type DownloadEvent = {
		event: "Started" | "Progress" | "Finished";
		data: {
			contentLength?: number;
			chunkLength?: number;
		};
	};

	type UpdateHandle = {
		version: string;
		date?: string;
		body?: string;
		downloadAndInstall: (
			onEvent?: (event: DownloadEvent) => void,
		) => Promise<void>;
	};

	const updaterConfigured =
		import.meta.env.VITE_DESKTOP_UPDATER_ENABLED === "true";

	let currentVersion = $state("Đang đọc...");
	let availableUpdate = $state<UpdateHandle | null>(null);
	let status = $state("");
	let checking = $state(false);
	let installing = $state(false);
	let progress = $state(0);
	let downloadedBytes = 0;
	let totalBytes = 0;

	onMount(async () => {
		if (!supportsDesktopUpdater) {
			goto("/admin");
			return;
		}

		try {
			const { getVersion } = await import("@tauri-apps/api/app");
			currentVersion = await getVersion();
		} catch {
			currentVersion = "Không xác định";
		}
	});

	async function checkForUpdate() {
		if (!updaterConfigured || checking || installing) return;

		checking = true;
		availableUpdate = null;
		status = "Đang kiểm tra phiên bản mới...";
		progress = 0;

		try {
			const { check } = await import("@tauri-apps/plugin-updater");
			availableUpdate = (await check()) as UpdateHandle | null;
			status = availableUpdate
				? `Đã tìm thấy Selorson ${availableUpdate.version}.`
				: "Bạn đang dùng phiên bản mới nhất.";
		} catch (error) {
			status = `Không thể kiểm tra cập nhật: ${formatError(error)}`;
		} finally {
			checking = false;
		}
	}

	async function installUpdate() {
		if (!availableUpdate || installing) return;

		installing = true;
		downloadedBytes = 0;
		totalBytes = 0;
		progress = 0;
		status = "Đang tải bản cập nhật...";

		try {
			await availableUpdate.downloadAndInstall((event) => {
				if (event.event === "Started") {
					totalBytes = event.data.contentLength ?? 0;
				} else if (event.event === "Progress") {
					downloadedBytes += event.data.chunkLength ?? 0;
					if (totalBytes > 0) {
						progress = Math.min(
							100,
							Math.round((downloadedBytes / totalBytes) * 100),
						);
					}
				} else if (event.event === "Finished") {
					progress = 100;
					status = "Đã cài bản cập nhật. Selorson sẽ khởi động lại.";
				}
			});

			const { relaunch } = await import("@tauri-apps/plugin-process");
			await relaunch();
		} catch (error) {
			status = `Cập nhật thất bại: ${formatError(error)}`;
			installing = false;
		}
	}

	function formatError(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<svelte:head>
	<title>Cập Nhật Desktop — Selorson</title>
</svelte:head>

<section class="update-page">
	<header>
		<div>
			<p class="eyebrow">SELORSON DESKTOP ADMIN</p>
			<h1>Cập Nhật Desktop</h1>
			<p class="description">
				Kiểm tra và cài bản Selorson đã được ký từ kênh phát hành riêng cho
				desktop của bạn.
			</p>
		</div>
		<div class="version-badge">
			<span>Phiên bản hiện tại</span>
			<strong>{currentVersion}</strong>
		</div>
	</header>

	<div class="update-card">
		{#if !updaterConfigured}
			<div class="notice">
				<strong>Updater chưa được bật cho bản build local này.</strong>
				<p>
					Bản cài đầu tiên phải được tạo bởi workflow
					<code>desktop-admin-v*</code> sau khi cấu hình khóa ký. Từ bản đó
					trở đi, nút này mới tải và xác minh cập nhật tự động.
				</p>
			</div>
		{:else}
			<div class="actions">
				<button
					class="primary"
					onclick={checkForUpdate}
					disabled={checking || installing}
				>
					{checking ? "Đang kiểm tra..." : "Kiểm tra phiên bản mới"}
				</button>

				{#if availableUpdate}
					<button
						class="install"
						onclick={installUpdate}
						disabled={installing}
					>
						{installing
							? `Đang cập nhật${progress > 0 ? ` ${progress}%` : "..."}`
							: `Tải và cài ${availableUpdate.version}`}
					</button>
				{/if}
			</div>
		{/if}

		{#if status}
			<p class="status" aria-live="polite">{status}</p>
		{/if}

		{#if installing}
			<div
				class="progress-track"
				role="progressbar"
				aria-label="Tiến độ cập nhật"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={progress}
			>
				<div class="progress-value" style:width={`${progress}%`}></div>
			</div>
		{/if}

		{#if availableUpdate}
			<div class="release">
				<h2>Selorson {availableUpdate.version}</h2>
				{#if availableUpdate.date}
					<p class="release-date">{availableUpdate.date}</p>
				{/if}
				<p class="release-notes">
					{availableUpdate.body || "Bản cập nhật desktop mới đã sẵn sàng."}
				</p>
			</div>
		{/if}
	</div>

	<p class="safety-note">
		Mỗi bản cập nhật phải có chữ ký hợp lệ. Nếu chữ ký hoặc tệp phát hành
		không khớp, ứng dụng sẽ từ chối cài đặt.
	</p>
</section>

<style>
	.update-page {
		max-width: 920px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		gap: 2rem;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}

	.eyebrow {
		margin: 0 0 0.4rem;
		color: var(--color-brand-500);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.7rem, 4vw, 2.4rem);
	}

	.description {
		max-width: 620px;
		color: var(--color-text-muted);
	}

	.version-badge {
		min-width: 170px;
		padding: 0.9rem 1rem;
		border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-lg);
		background: var(--color-surface-100);
	}

	.version-badge span {
		display: block;
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.version-badge strong {
		display: block;
		margin-top: 0.25rem;
		font-size: 1.25rem;
	}

	.update-card {
		padding: 1.5rem;
		border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-xl);
		background: var(--color-surface-100);
	}

	.notice {
		padding: 1rem;
		border-left: 4px solid #f59e0b;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, #f59e0b 12%, transparent);
	}

	.notice p {
		margin: 0.5rem 0 0;
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	button {
		padding: 0.75rem 1rem;
		border: 0;
		border-radius: var(--radius-md);
		font-weight: 700;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.primary {
		background: var(--color-brand-500);
		color: white;
	}

	.install {
		background: #2563eb;
		color: white;
	}

	.status {
		margin: 1rem 0 0;
	}

	.progress-track {
		height: 9px;
		margin-top: 0.8rem;
		overflow: hidden;
		border-radius: 999px;
		background: var(--color-surface-300);
	}

	.progress-value {
		height: 100%;
		background: var(--color-brand-500);
		transition: width 180ms ease;
	}

	.release {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-surface-300);
	}

	.release h2 {
		margin: 0;
	}

	.release-date,
	.release-notes,
	.safety-note {
		color: var(--color-text-muted);
	}

	.release-date {
		margin: 0.25rem 0 0.75rem;
		font-size: 0.85rem;
	}

	.safety-note {
		margin: 1rem 0 0;
		font-size: 0.85rem;
	}

	@media (max-width: 700px) {
		.update-page {
			padding: 1rem;
		}

		header {
			flex-direction: column;
		}

		.version-badge {
			width: 100%;
		}
	}
</style>
