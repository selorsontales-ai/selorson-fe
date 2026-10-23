<script lang="ts">
	import {
		normalizeBlocks,
		resolveAspect,
		rotatedFrame
	} from '$lib/story/story-blocks.js';

	let {
		blocks = null,
		contentHtml = '',
		content = '',
		emptyText = ''
	} = $props<{
		/** `content_blocks` từ API — nguồn ưu tiên, giữ được bố cục và góc xoay. */
		blocks?: unknown;
		/** HTML cũ đã qua `ammonia::clean` phía backend, dùng khi chương chưa có block. */
		contentHtml?: string;
		/** Văn bản thuần, chốt chặn cuối. */
		content?: string;
		emptyText?: string;
	}>();

	let rendered = $derived(normalizeBlocks(blocks));

	/**
	 * Tỉ lệ đo được lúc ảnh load xong, chỉ dùng cho asset cũ thiếu width/height
	 * trong DB. Có giá trị này thì khung xoay mới tính đúng được hộp bao.
	 */
	let measured = $state<Record<string, number>>({});

	function measure(url: string, node: HTMLImageElement) {
		if (measured[url] || !node.naturalWidth || !node.naturalHeight) return;
		measured = { ...measured, [url]: node.naturalWidth / node.naturalHeight };
	}

	function frameStyle(layout: string, rotation: number, image: { url: string; width?: number; height?: number }) {
		const frame = rotatedFrame(resolveAspect(layout, image, measured[image.url]), rotation);
		return `--frame-ar:${frame.frameAspect};--img-ar:${frame.aspect};--img-w:${frame.imageWidthPct}%;--rot:${frame.deg}deg;`;
	}

	function isSectionHeading(html: string): boolean {
		const trimmed = (html ?? '').trim();
		if (!trimmed) return false;
		const plain = trimmed.replace(/<[^>]*>/g, '').trim();
		if (/^(?:[IVXLCDM]{1,6})(?:\s*[-?:.]\s*.{1,60})?$/.test(plain)) return true;
		if (/^(?:Ph?n|H?i|C?nh|M?n|Ch??ng)\s+[0-9IVXLCDM]+(?:\s*[-?:.]\s*.{1,60})?$/i.test(plain)) return true;
		if (/^<(?:b|strong)>[^<]{1,50}<\/(?:b|strong)>$/i.test(trimmed)) return true;
		return false;
	}
</script>

{#if rendered.length > 0}
	{#each rendered as block (block.key)}
		{#if block.type === 'paragraph'}
			<p class:section-heading={isSectionHeading(block.html)}>{@html block.html}</p>
		{:else}
			<figure class="story-image {block.layout}" class:tilted={block.rotation !== 0}>
				<div class="image-container">
					<!-- Khoá theo vị trí: một khối hoàn toàn có thể dùng lại cùng một ảnh. -->
					{#each block.images as image, index (`${block.key}#${index}`)}
						<div class="img-frame" style={frameStyle(block.layout, block.rotation, image)}>
							<img
								src={image.url}
								alt={image.alt}
								loading="lazy"
								decoding="async"
								onload={(e) => measure(image.url, e.currentTarget as HTMLImageElement)}
							/>
						</div>
					{/each}
				</div>
				{#if block.caption}
					<figcaption>{block.caption}</figcaption>
				{/if}
			</figure>
		{/if}
	{/each}
{:else if contentHtml}
	<!-- Chương lưu trước bản vá này: HTML đã bị ammonia lột hết class/style. -->
	<div class="legacy-html">{@html contentHtml}</div>
{:else if content}
	{#each content.split('\n') as para}
		{#if para.trim()}<p class:section-heading={isSectionHeading(para)}>{para}</p>{/if}
	{/each}
{:else if emptyText}
	<p class="story-empty">{emptyText}</p>
{/if}

<style>
	.story-image {
		margin: 2rem 0;
		text-align: center;
	}

	.image-container {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 0.75rem;
	}

	/*
	 * Khung chiếm đúng hộp bao của ảnh sau khi xoay (xem `rotatedFrame`), nên
	 * ảnh nghiêng không bao giờ tràn ra đè lên chữ. Ảnh được đặt tuyệt đối vào
	 * giữa khung và thu theo `--img-w` để hộp bao vừa khít.
	 */
	.img-frame {
		position: relative;
		width: 100%;
		aspect-ratio: var(--frame-ar);
		flex: 0 1 auto;
	}

	.img-frame > img {
		position: absolute;
		left: 50%;
		top: 50%;
		display: block;
		width: var(--img-w);
		height: auto;
		max-width: none;
		/* Margin phải bằng 0: ảnh định vị tuyệt đối, margin dọc sẽ phá lệch tâm. */
		margin: 0;
		aspect-ratio: var(--img-ar);
		object-fit: cover;
		border-radius: 0.75rem;
		transform: translate(-50%, -50%) rotate(var(--rot));
	}

	/* Ảnh nghiêng cần thêm khoảng thở để góc nhọn không chạm dòng chữ kế bên. */
	.story-image.tilted {
		margin: 2.5rem 0;
	}

	figcaption {
		font-size: 0.85em;
		color: var(--color-text-muted);
		margin-top: 0.5rem;
		font-style: italic;
	}

	/* `!important` để thắng quy tắc canh chữ của trang chứa (thụt đầu dòng, canh đều). */
	.story-empty {
		color: var(--color-text-muted);
		font-style: italic;
		text-align: center !important;
		text-indent: 0 !important;
	}

	p.section-heading {
		text-align: center !important;
		text-indent: 0 !important;
		font-weight: 700;
		font-size: 1.1em;
		letter-spacing: 0.1em;
		margin: 1.8em 0 1.1em !important;
	}

	/* Nội dung cũ chỉ còn figure/img trần — vẫn phải hiển thị tử tế. */
	.legacy-html :global(figure) {
		margin: 2rem 0;
		text-align: center;
	}
	.legacy-html :global(img) {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 1.5em auto;
		border-radius: 0.75rem;
	}
	.legacy-html :global(figcaption) {
		font-size: 0.85em;
		color: var(--color-text-muted);
		margin-top: 0.5rem;
		font-style: italic;
	}

	/* Bố cục một hình: khung rộng bằng cột chữ, chặn trên theo dạng ảnh. */
	.single-1-1 .img-frame {
		max-width: 400px;
	}
	.single-9-16 .img-frame {
		max-width: 320px;
	}

	/* Bố cục ghép: các khung chia đều bề ngang cột chữ. */
	.combo-2 .img-frame {
		width: 48%;
	}
	.combo-3 .img-frame {
		width: 32%;
	}
	.combo-3 .image-container {
		gap: 0.5rem;
	}

	.combo-2-overlap .image-container {
		gap: 0;
	}
	.combo-2-overlap .img-frame {
		width: 55%;
		z-index: 1;
	}
	.combo-2-overlap .img-frame:nth-child(2) {
		margin-left: -15%;
		margin-top: 8%;
		z-index: 2;
	}

	@media (max-width: 768px) {
		.combo-2 .image-container,
		.combo-3 .image-container,
		.combo-2-overlap .image-container {
			flex-direction: column;
			align-items: center;
		}
		.combo-2 .img-frame,
		.combo-3 .img-frame {
			width: 100%;
			max-width: 400px;
		}
		.combo-2-overlap .img-frame {
			width: 85%;
		}
		.combo-2-overlap .img-frame:nth-child(2) {
			margin-left: 0;
			margin-top: -10%;
		}
	}
</style>
