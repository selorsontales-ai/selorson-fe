import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
	isUnlockedState,
	isExploredState,
	resolveWorldNodeTargetUrl,
	findNodeByFocusParam,
	filterWorldNodes,
	latLngToSvgPoint,
	geoJsonGeometryToSvgPath
} from '../src/lib/world/world-utils.ts';

test('isUnlockedState and isExploredState handle all 4 RevealState variants without locking explored nodes', () => {
	assert.equal(isUnlockedState('revealed'), true);
	assert.equal(isUnlockedState('explored'), true);
	assert.equal(isUnlockedState('rumored'), false);
	assert.equal(isUnlockedState('hidden'), false);

	assert.equal(isExploredState('explored'), true);
	assert.equal(isExploredState('revealed'), false);
	assert.equal(isExploredState('rumored'), false);
});

test('resolveWorldNodeTargetUrl routes regions, locations, and characters to their exact 3D scenes', () => {
	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 1,
			slug: 'annamland',
			kind: 'region',
			category: 'location',
			region: null
		}),
		'/world/annamland'
	);

	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 2,
			slug: 'tinh-that-eryndor',
			kind: 'landmark',
			category: 'location',
			region: 'eryndor'
		}),
		'/world/eryndor/tinh-that-eryndor'
	);

	// Standalone location without parent region falls back to /world/_/{slug}
	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 3,
			slug: 'rung-dau-rai',
			kind: 'poi',
			category: 'location',
			region: null
		}),
		'/world/_/rung-dau-rai'
	);

	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 4,
			slug: 'hokabe-pha',
			kind: 'character',
			category: 'main_character',
			region: null
		}),
		'/world/journey/4'
	);
});

test('findNodeByFocusParam matches by numeric id, slug, and accent-insensitive Vietnamese name', () => {
	const nodes = [
		{ id: 10, slug: 'annamland', name: 'An Nam Lĩnh' },
		{ id: 25, slug: 'dinh-meru', name: 'Đỉnh Meru' }
	];

	assert.equal(findNodeByFocusParam(nodes, '25')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'dinh-meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'Đỉnh Meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'dinh meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'unknown'), null);
});

test('filterWorldNodes supports kind filtering and chapter syntax search', () => {
	const sample = [
		{
			id: 1,
			slug: 'eryndor',
			name: 'Thánh Đô Eryndor',
			kind: 'region',
			category: 'location',
			terrain: 'citadel',
			region: null,
			chapters: [1, 2, 6]
		},
		{
			id: 2,
			slug: 'rung-dau-rai',
			name: 'Rừng Dầu Rái',
			kind: 'poi',
			category: 'location',
			terrain: 'forest',
			region: 'nam-bo',
			chapters: [3, 7]
		},
		{
			id: 3,
			slug: 'darkin-tenka',
			name: 'Darkin Tenka',
			kind: 'character',
			category: 'main_character',
			terrain: null,
			region: null,
			chapters: [2, 6]
		}
	];

	assert.equal(filterWorldNodes(sample, '', 'region').length, 1);
	assert.equal(filterWorldNodes(sample, '', 'location').length, 1);
	assert.equal(filterWorldNodes(sample, '', 'character').length, 1);
	assert.equal(filterWorldNodes(sample, 'dau rai', 'all')[0]?.id, 2);
	assert.equal(filterWorldNodes(sample, 'Ch.3', 'all')[0]?.id, 2);
	assert.equal(filterWorldNodes(sample, 'chương 6', 'all').length, 2);
});

test('latLngToSvgPoint and geoJsonGeometryToSvgPath project equirectangular coordinates accurately', () => {
	assert.deepEqual(latLngToSvgPoint(0, 0, 1000, 500), { x: 500, y: 250 });
	assert.deepEqual(latLngToSvgPoint(90, -180, 1000, 500), { x: 0, y: 0 });
	assert.deepEqual(latLngToSvgPoint(-90, 180, 1000, 500), { x: 1000, y: 500 });

	const pathStr = geoJsonGeometryToSvgPath(
		{
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[36, 0],
					[36, 18],
					[0, 0]
				]
			]
		},
		1000,
		500
	);
	assert.ok(pathStr.startsWith('M500,250 L600,250 L600,200'));
	assert.ok(pathStr.endsWith('Z'));
});

test('World HUD, Atlas 2D, and 3D Markers preserve explored state and bi-directional deep-links', () => {
	const worldHudSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldHud.svelte'),
		'utf8'
	);
	const markerSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/Marker.svelte'),
		'utf8'
	);
	const atlasSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldAtlas2D.svelte'),
		'utf8'
	);
	const worldPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/+page.svelte'),
		'utf8'
	);

	assert.ok(worldHudSrc.includes('isUnlockedState(selected.state)'));
	assert.ok(worldHudSrc.includes('/library?id={selected.id}'));
	assert.ok(markerSrc.includes('isUnlockedState(node.state)'));
	assert.ok(atlasSrc.includes('geoJsonGeometryToSvgPath'));
	assert.ok(worldPageSrc.includes('WorldAtlas2D'));
	assert.ok(worldPageSrc.includes('findNodeByFocusParam'));
	assert.ok(worldPageSrc.includes('/world/journey/'));
});

test('3D scenes fly camera back to HOME on deselect and world routes reload reactively on same-route navigation', () => {
	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	const regionSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/RegionScene.svelte'),
		'utf8'
	);
	const regionPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/+page.svelte'),
		'utf8'
	);
	const placePageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/[slug]/+page.svelte'),
		'utf8'
	);
	const journeyPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/journey/[id]/+page.svelte'),
		'utf8'
	);

	assert.ok(globeSceneSrc.includes('hadSelection'));
	assert.ok(regionSceneSrc.includes('hadSelection'));
	assert.ok(regionPageSrc.includes('{#key detail.region.id}'));
	assert.ok(placePageSrc.includes('{#key detail.place.id}'));
	assert.ok(journeyPageSrc.includes('{#key journey.character.id}'));
});
