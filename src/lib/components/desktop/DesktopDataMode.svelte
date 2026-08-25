<script lang="ts">
	// Rendered only by desktop-admin: every other flavor talks to the deployment
	// and has no second database to choose between.
	import { needsProductionAcknowledgement } from "$lib/desktop-mode.svelte";
	import DataModeBar from "./DataModeBar.svelte";
	import DataModeGate from "./DataModeGate.svelte";
</script>

{#if needsProductionAcknowledgement()}
	<DataModeGate />
{/if}

<DataModeBar />
