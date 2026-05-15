<svelte:head><title>Câu hỏi thường gặp — Selorson</title></svelte:head>

<div class="faq-page">
	<h1>❓ Câu hỏi thường gặp</h1>
	<p class="subtitle">Những câu hỏi phổ biến về Selorson</p>

	<div class="faq-list">
		{#each faqs as faq, i}
			<details class="faq-item glass-card">
				<summary>{faq.q}</summary>
				<p>{faq.a}</p>
			</details>
		{/each}
	</div>
</div>

<script lang="ts">
	const faqs = [
		{ q: 'Selorson là gì?', a: 'Selorson là nền tảng nội dung đa phương tiện bao gồm truyện, video, nhạc, thư viện tài liệu và cộng đồng.' },
		{ q: 'Làm sao để đăng ký tài khoản?', a: 'Bạn có thể đăng ký bằng email hoặc đăng nhập qua Google. Nhấn nút "Đăng nhập" trên góc phải màn hình.' },
		{ q: 'Truyện có miễn phí không?', a: 'Tất cả chapter đều miễn phí. Chúng tôi không thu phí đọc truyện.' },
		{ q: 'Làm sao để đổi avatar?', a: 'Vào trang Profile của bạn, nhấn vào biểu tượng camera trên avatar để tải ảnh mới.' },
		{ q: 'Tôi quên mật khẩu, phải làm sao?', a: 'Vào trang Quên mật khẩu (/forgot-password), nhập email và làm theo hướng dẫn.' },
		{ q: 'Có ứng dụng mobile không?', a: 'Selorson hỗ trợ PWA và đang phát triển ứng dụng native cho iOS/Android.' },
		{ q: 'Làm sao để liên hệ?', a: 'Sử dụng trang Liên hệ (/contact) hoặc gửi email đến contact@selorson.com.' },
	];
</script>

<style>
	.faq-page { max-width: 700px; margin: 0 auto; padding: 2rem 1rem 4rem; }
	h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
	.subtitle { color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 2rem; }
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
