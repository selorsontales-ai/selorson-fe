<script lang="ts">
	// Rendered only by desktop-admin, and deliberately outside the header: both
	// of these cover the window, and the header's backdrop-filter would trap a
	// fixed-position child inside the header strip.
	import {
		isSwitchPromptOpen,
		needsProductionAcknowledgement,
	} from "$lib/desktop-mode.svelte";
	import DataModeGate from "./DataModeGate.svelte";
	import DataModeSwitchSheet from "./DataModeSwitchSheet.svelte";
</script>

{#if needsProductionAcknowledgement()}
	<DataModeGate />
{/if}

{#if isSwitchPromptOpen()}
	<DataModeSwitchSheet />
{/if}
