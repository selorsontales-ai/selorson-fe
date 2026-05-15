<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { handleOAuthCallback } from '$lib/stores/security.svelte';
	import { setAuth } from '$lib/stores/auth.svelte';

	let error = $state<string | null>(null);

	onMount(async () => {
		const provider = $page.params.provider as string;
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');

		if (!code) {
			error = 'Không tìm thấy mã xác thực từ Google/Facebook.';
			setTimeout(() => goto('/'), 3000);
			return;
		}

		try {
			const res = await handleOAuthCallback(provider, code, state);
			if (res.success) {
				setAuth(res.data.token, res.data.user);
				error = 'Đăng nhập thành công, đang chuyển hướng...';
				setTimeout(() => goto('/'), 1000);
			} else {
				error = res.message || 'Xác thực thất bại.';
				setTimeout(() => goto('/'), 3000);
			}
		} catch (err: any) {
			error = err.message || 'Lỗi hệ thống khi đăng nhập qua mạng xã hội.';
			setTimeout(() => goto('/'), 3000);
		}
	});
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh]">
	{#if error}
		<div class="text-red-500 font-semibold mb-4 text-center">
			<p>{error}</p>
			<p class="text-sm mt-2 font-normal">Đang chuyển hướng về trang chủ...</p>
		</div>
	{:else}
		<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
		<span class="mt-4 text-muted-foreground font-medium animate-pulse">Đang xử lý đăng nhập...</span>
	{/if}
</div>
