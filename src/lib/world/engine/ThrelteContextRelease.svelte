<script lang="ts">
	/**
	 * Đặt BÊN TRONG <Canvas> của Threlte: giữ Map context (getAllContexts) để WorldCanvas xóa tham chiếu
	 * sau khi renderer đã dispose — xem threlte-context-release.ts.
	 */
	import { getAllContexts, untrack } from 'svelte';
	import { scrubContextValues } from './threlte-context-release';

	let { register }: { register: (release: () => void) => void } = $props();

	const contexts = getAllContexts();
	// Đăng ký một lần lúc khởi tạo (không cần theo dõi prop)
	untrack(() => register(() => scrubContextValues(contexts)));
</script>
