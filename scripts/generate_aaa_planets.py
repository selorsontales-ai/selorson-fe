#!/usr/bin/env python3
"""
AAA Procedural Planetary Tectonics, Erosion & Satellite Biome Synthesizer (`Chặng 1A` v2.1)
===========================================================================================
100% procedural synthesis via NumPy + Pillow (`D:\\Git-repo\\Co-Writer\\app\\core\\.venv\\Scripts\\python.exe`).
Zero dependency on discarded 2D illustration `akunalia-color-4k.jpg`.

Outputs to `static/world/data/` + `static/world/regions.geojson`:
  1. Akunalia (`akunalia-*`):
     - Native 4K High-Fantasy × Satellite Realism continents, fjords & 32-island Sky Archipelago
     - Dendritic Mount Tabaoki volcanic-glacial cordillera (sharp obsidian arêtes & valley glaciers, zero dark collar)
     - Meandering Behadona River, Nilanda Plains & braided turquoise delta
     - Crescent Moon Sea (`Hồ Bán Nguyệt`) natural crescent gulf with 4 gossamer harmonic barrier ripples
     - Imperial Capital & Pentagonal Temple of Zyberon (`王` nocturnal crimson-gold web)
     - Eldarin Highlands with crisp hierarchical branching Lifestream (`Mạch Hạt Thần Năng`) ley-arteries
  2. Multi-Era Earth (`earth-*`):
     - High-precision sub-degree Catmull-Rom continental, peninsula & island coastlines at 8K->4K supersampling
     - Authentic NASA Blue Marble biomes (domain-warped basins, emerald Nile & Delta, Monsoon Nam Bộ/India,
       Tibetan ochre plateau, dendritic snow spines with zero dark caterpillar halos)
     - NASA Black Marble pinpoint metropolitan webs, trunk corridors & sinuous geomagnetic polar auroras
  3. Organic domain-warped Coriolis cloud decks (`akunalia-clouds-2k.jpg`, `earth-clouds-2k.jpg`)
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from earth_coastlines import (
    EARTH_LAND_CONTOURS,
    EARTH_METRO_CITIES,
    EARTH_NIGHT_CORRIDORS,
    EARTH_WATER_CUTOUTS,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "static" / "world" / "data"
REGIONS_GEOJSON_PATH = ROOT / "static" / "world" / "regions.geojson"

ALBEDO_W, ALBEDO_H = 4096, 2048
DATA_W, DATA_H = 2048, 1024
SEA_LEVEL_NORM = 0.25


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Fast Vectorized 3D Spherical Noise & Spline Primitives
# ═══════════════════════════════════════════════════════════════════════════════


def smoothstep(edge0: float | np.ndarray, edge1: float | np.ndarray, x: np.ndarray) -> np.ndarray:
    denom = edge1 - edge0
    safe_denom = np.where(np.abs(denom) < 1e-6, np.where(denom >= 0, 1e-6, -1e-6), denom)
    t = np.clip((x - edge0) / safe_denom, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def lerp_rgb(c0: np.ndarray, c1: np.ndarray, t: np.ndarray) -> np.ndarray:
    return c0 + (c1 - c0) * t[..., None]


def rgb(r: float, g: float, b: float) -> np.ndarray:
    return np.array([r, g, b], dtype=np.float32)


def make_sphere_grid(w: int, h: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return (lat_deg, lng_deg, x, y, z) for equirectangular (h, w) grid."""
    u = (np.arange(w, dtype=np.float32) + 0.5) / w
    v = (np.arange(h, dtype=np.float32) + 0.5) / h
    lng_deg = (u * 360.0 - 180.0)[None, :]
    lat_deg = (90.0 - v * 180.0)[:, None]

    lat_r = np.deg2rad(lat_deg)
    lng_r = np.deg2rad(lng_deg)
    cos_lat = np.cos(lat_r)
    x = cos_lat * np.cos(lng_r)
    y = np.broadcast_to(np.sin(lat_r), (h, w)).copy()
    z = cos_lat * np.sin(lng_r)
    lat_full = np.broadcast_to(lat_deg, (h, w)).copy()
    lng_full = np.broadcast_to(lng_deg, (h, w)).copy()
    return lat_full, lng_full, x, y, z


def hash3_int(ix: np.ndarray, iy: np.ndarray, iz: np.ndarray, seed: int) -> np.ndarray:
    n = (
        ix * np.int64(374761393)
        + iy * np.int64(668265263)
        + iz * np.int64(2147483647)
        + np.int64(seed * 1274126177)
    )
    n = (n ^ (n >> 13)) * np.int64(1274126177)
    n = n ^ (n >> 16)
    return ((n & np.int64(0x7FFFFFFF)).astype(np.float32)) / np.float32(0x7FFFFFFF)


def noise3(x: np.ndarray, y: np.ndarray, z: np.ndarray, seed: int = 1) -> np.ndarray:
    ix = np.floor(x).astype(np.int64)
    iy = np.floor(y).astype(np.int64)
    iz = np.floor(z).astype(np.int64)

    fx = (x - ix).astype(np.float32)
    fy = (y - iy).astype(np.float32)
    fz = (z - iz).astype(np.float32)

    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    uz = fz * fz * (3.0 - 2.0 * fz)

    c000 = hash3_int(ix, iy, iz, seed)
    c100 = hash3_int(ix + 1, iy, iz, seed)
    c010 = hash3_int(ix, iy + 1, iz, seed)
    c110 = hash3_int(ix + 1, iy + 1, iz, seed)
    c001 = hash3_int(ix, iy, iz + 1, seed)
    c101 = hash3_int(ix + 1, iy, iz + 1, seed)
    c011 = hash3_int(ix, iy + 1, iz + 1, seed)
    c111 = hash3_int(ix + 1, iy + 1, iz + 1, seed)

    x00 = c000 + (c100 - c000) * ux
    x10 = c010 + (c110 - c010) * ux
    x01 = c001 + (c101 - c001) * ux
    x11 = c011 + (c111 - c011) * ux

    y0 = x00 + (x10 - x00) * uy
    y1 = x01 + (x11 - x01) * uy
    return y0 + (y1 - y0) * uz


def fbm3(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    freq: float = 2.0,
    octaves: int = 5,
    seed: int = 1,
    lacunarity: float = 2.05,
    gain: float = 0.5,
) -> np.ndarray:
    total = np.zeros_like(x, dtype=np.float32)
    amp = 0.5
    norm = 0.0
    fx, fy, fz = x * freq, y * freq, z * freq
    for i in range(octaves):
        total += amp * noise3(fx, fy, fz, seed + i * 31)
        norm += amp
        nx = fx * 0.80 - fz * 0.60
        nz = fx * 0.60 + fz * 0.80
        fx, fy, fz = nx * lacunarity, fy * lacunarity, nz * lacunarity
        amp *= gain
    return total / max(1e-6, norm)


def ridged3(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    freq: float = 3.0,
    octaves: int = 5,
    seed: int = 101,
    lacunarity: float = 2.12,
    gain: float = 0.52,
) -> np.ndarray:
    total = np.zeros_like(x, dtype=np.float32)
    weight = np.ones_like(x, dtype=np.float32)
    amp = 0.5
    norm = 0.0
    fx, fy, fz = x * freq, y * freq, z * freq
    for i in range(octaves):
        n = 1.0 - np.abs(noise3(fx, fy, fz, seed + i * 37) * 2.0 - 1.0)
        n = n * n
        n *= weight
        weight = np.clip(n * 1.85, 0.15, 1.0)
        total += n * amp
        norm += amp
        nx = fx * 0.86 - fy * 0.51
        ny = fx * 0.51 + fy * 0.86
        fx, fy, fz = nx * lacunarity, ny * lacunarity, fz * lacunarity
        amp *= gain
    return np.clip(total / max(1e-6, norm), 0.0, 1.0)


def upsample_2d(arr: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    if arr.shape == (target_h, target_w):
        return arr
    im = Image.fromarray(arr.astype(np.float32), mode="F")
    im_up = im.resize((target_w, target_h), resample=Image.Resampling.BILINEAR)
    return np.asarray(im_up, dtype=np.float32)


def downsample_2x(arr4: np.ndarray) -> np.ndarray:
    """Exact 2x2 box-filter area downsample from 4096x2048 to 2048x1024."""
    h, w = arr4.shape
    return arr4.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)).astype(np.float32)


def blur_2d(arr: np.ndarray, radius: float) -> np.ndarray:
    if radius <= 0.05:
        return arr.astype(np.float32)
    lo = float(np.min(arr))
    hi = float(np.max(arr))
    if hi - lo < 1e-7:
        return arr.astype(np.float32)
    u8 = np.clip((arr - lo) / (hi - lo) * 255.0, 0.0, 255.0).astype(np.uint8)
    im = Image.fromarray(u8, mode="L").filter(ImageFilter.GaussianBlur(radius=radius))
    return (np.asarray(im, dtype=np.float32) / 255.0) * (hi - lo) + lo


def angular_dist_deg(
    lat_deg: np.ndarray,
    lng_deg: np.ndarray,
    c_lat: float,
    c_lng: float,
) -> np.ndarray:
    lat1 = np.deg2rad(lat_deg)
    lat2 = math.radians(c_lat)
    dlng = np.deg2rad(lng_deg - c_lng)
    cos_d = np.sin(lat1) * math.sin(lat2) + np.cos(lat1) * math.cos(lat2) * np.cos(dlng)
    return np.rad2deg(np.arccos(np.clip(cos_d, -1.0, 1.0))).astype(np.float32)


def rotated_elliptical_dist(
    lat_deg: np.ndarray,
    lng_deg: np.ndarray,
    c_lat: float,
    c_lng: float,
    rx_deg: float,
    ry_deg: float,
    angle_deg: float = 0.0,
) -> np.ndarray:
    """Anisotropic rotated basin/belt distance (normalized so 1.0 = ellipse boundary)."""
    cos_c = max(0.25, math.cos(math.radians(c_lat)))
    dx = ((lng_deg - c_lng + 180.0) % 360.0 - 180.0) * cos_c
    dy = lat_deg - c_lat
    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)
    ux = (dx * ca + dy * sa) / max(0.1, rx_deg)
    uy = (-dx * sa + dy * ca) / max(0.1, ry_deg)
    return np.hypot(ux, uy).astype(np.float32)


def polyline_dist_deg(
    lat_deg: np.ndarray,
    lng_deg: np.ndarray,
    pts_lat_lng: list[tuple[float, float]],
) -> np.ndarray:
    best = np.full_like(lat_deg, 999.0, dtype=np.float32)
    for i in range(len(pts_lat_lng) - 1):
        a_lat, a_lng = pts_lat_lng[i]
        b_lat, b_lng = pts_lat_lng[i + 1]
        mid_cos = max(0.25, math.cos(math.radians(0.5 * (a_lat + b_lat))))
        px = ((lng_deg - a_lng + 180.0) % 360.0 - 180.0) * mid_cos
        py = lat_deg - a_lat
        vx = (b_lng - a_lng) * mid_cos
        vy = b_lat - a_lat
        denom = max(1e-6, vx * vx + vy * vy)
        t = np.clip((px * vx + py * vy) / denom, 0.0, 1.0)
        dx = px - t * vx
        dy = py - t * vy
        d = np.hypot(dx, dy)
        best = np.minimum(best, d)
    return best


def chaikin_smooth_polygon(
    pts: list[tuple[float, float]], iterations: int = 2, closed: bool = True
) -> list[tuple[float, float]]:
    cur = list(pts)
    if closed and len(cur) > 2 and cur[0] == cur[-1]:
        cur = cur[:-1]
    for _ in range(iterations):
        nxt: list[tuple[float, float]] = []
        n = len(cur)
        limit = n if closed else n - 1
        for i in range(limit):
            p0 = cur[i]
            p1 = cur[(i + 1) % n]
            nxt.append((0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]))
            nxt.append((0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]))
        if not closed and len(cur) >= 2:
            nxt.insert(0, cur[0])
            nxt.append(cur[-1])
        cur = nxt
    return cur


def catmull_rom_subdivide(
    pts: list[tuple[float, float]],
    samples_per_seg: int = 4,
    tension: float = 0.36,
    closed: bool = True,
) -> list[tuple[float, float]]:
    """
    Interpolating cardinal/Catmull-Rom spline that passes 100% THROUGH every real
    geographic cape, peninsula, and strait vertex without rounding off sharp tips!
    """
    clean = list(pts)
    if closed and len(clean) > 2 and clean[0] == clean[-1]:
        clean = clean[:-1]
    n = len(clean)
    if n < 3 or samples_per_seg <= 1:
        return clean

    out: list[tuple[float, float]] = []
    limit = n if closed else n - 1
    for i in range(limit):
        p0 = clean[(i - 1) % n] if closed else clean[max(0, i - 1)]
        p1 = clean[i]
        p2 = clean[(i + 1) % n] if closed else clean[min(n - 1, i + 1)]
        p3 = clean[(i + 2) % n] if closed else clean[min(n - 1, i + 2)]

        # Clamp tangents when adjacent segments differ hugely in length (prevents overshoot on tight capes)
        seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        m1x = tension * (p2[0] - p0[0])
        m1y = tension * (p2[1] - p0[1])
        m2x = tension * (p3[0] - p1[0])
        m2y = tension * (p3[1] - p1[1])
        m1_norm = math.hypot(m1x, m1y)
        m2_norm = math.hypot(m2x, m2y)
        max_tan = seg_len * 0.85
        if m1_norm > max_tan > 1e-6:
            m1x *= max_tan / m1_norm
            m1y *= max_tan / m1_norm
        if m2_norm > max_tan > 1e-6:
            m2x *= max_tan / m2_norm
            m2y *= max_tan / m2_norm

        for s in range(samples_per_seg):
            t = s / samples_per_seg
            t2 = t * t
            t3 = t2 * t
            h00 = 2.0 * t3 - 3.0 * t2 + 1.0
            h10 = t3 - 2.0 * t2 + t
            h01 = -2.0 * t3 + 3.0 * t2
            h11 = t3 - t2
            x = h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x
            y = h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y
            out.append((x, y))
    if not closed:
        out.append(clean[-1])
    return out


def compute_coastal_sdf_byte(land_mask: np.ndarray) -> np.ndarray:
    m = land_mask.astype(np.float32)
    b1 = blur_2d(m, 2.5)
    b2 = blur_2d(m, 9.0)
    b3 = blur_2d(m, 24.0)
    raw = (b1 - 0.5) * 0.95 + (b2 - 0.5) * 0.65 + (b3 - 0.5) * 0.45
    signed = np.where(land_mask, np.maximum(0.015, raw), np.minimum(-0.015, raw))
    sdf_01 = np.clip(0.5 + signed * 0.85, 0.0, 1.0)
    return np.clip(np.round(sdf_01 * 255.0), 0, 255).astype(np.uint8)


def compute_cavity_ao(elev_clamped: np.ndarray, land_mask: np.ndarray) -> np.ndarray:
    """
    Compute multi-scale topographic Cavity & Valley Ambient Occlusion in [0.0, 1.0].
    Concave canyons, basins, and forest valleys darken naturally (0.45..0.85),
    while open plains and ridges remain unoccluded (0.94..1.0).
    """
    b_fine = blur_2d(elev_clamped, 1.6)
    b_mid = blur_2d(elev_clamped, 5.5)
    b_broad = blur_2d(elev_clamped, 15.0)

    concavity = (
        np.maximum(0.0, b_fine - elev_clamped) * 14.0
        + np.maximum(0.0, b_mid - elev_clamped) * 9.5
        + np.maximum(0.0, b_broad - elev_clamped) * 5.2
    )
    gy = np.pad(elev_clamped, ((1, 1), (0, 0)), mode="edge")
    slope = np.hypot(
        (np.roll(elev_clamped, -1, axis=1) - np.roll(elev_clamped, 1, axis=1)) * 0.5,
        (gy[:-2, :] - gy[2:, :]) * 0.5,
    )
    ao = 1.0 - np.clip(concavity * 0.85 + slope * 3.2, 0.0, 0.58)
    return np.where(land_mask, np.clip(ao, 0.38, 1.0), 1.0).astype(np.float32)


def save_elevation_and_normal_maps(
    elev_norm: np.ndarray,
    land_mask: np.ndarray,
    spec_mask: np.ndarray,
    elev_path: Path,
    normal_path: Path,
    normal_strength: float = 7.0,
) -> None:
    """
    Save 16-bit Elevation+SDF PNG and Tangent-Space Normal+(CavityAO/WaterSpec) PNG (`2048x1024`),
    keeping `Alpha = 255` on every pixel to prevent HTML5 Canvas premultiplied-alpha zeroing!
    - Blue channel encoding:
      * Land (`true_water == False`): `[0.02 .. 0.46]` encodes baked topographic `Cavity AO` (ZERO land specular!).
      * True Water (`true_water == True`): `[0.68 .. 0.94]` encodes physical liquid water mask for GGX solar glint.
    """
    h, w = elev_norm.shape
    elev_clamped = np.clip(elev_norm, 0.0, 1.0)
    u16 = np.clip(np.round(elev_clamped * 65535.0), 0, 65535).astype(np.uint16)
    r_hi = ((u16 >> 8) & 0xFF).astype(np.uint8)
    g_lo = (u16 & 0xFF).astype(np.uint8)
    b_sdf = compute_coastal_sdf_byte(land_mask)
    alpha_full = np.full((h, w), 255, dtype=np.uint8)

    elev_rgba = np.stack([r_hi, g_lo, b_sdf, alpha_full], axis=-1)
    Image.fromarray(elev_rgba, mode="RGBA").save(elev_path, compress_level=6)

    v = (np.arange(h, dtype=np.float32) + 0.5) / h
    lat_r = np.deg2rad(90.0 - v * 180.0)[:, None]
    cos_lat = np.maximum(0.20, np.cos(lat_r))

    dh_dx = (np.roll(elev_clamped, -1, axis=1) - np.roll(elev_clamped, 1, axis=1)) * 0.5 / cos_lat
    padded_y = np.pad(elev_clamped, ((1, 1), (0, 0)), mode="edge")
    dh_dnorth = (padded_y[:-2, :] - padded_y[2:, :]) * 0.5

    land_f = blur_2d(land_mask.astype(np.float32), 1.0)
    # Full crisp relief across lowlands, plains, forests, and mountains (zero 0.22 damping!)
    strength = np.where(land_f > 0.05, normal_strength * (0.86 + 0.24 * land_f), 0.28)

    nx = -dh_dx * strength * 42.0
    ny = -dh_dnorth * strength * 42.0
    nz = np.ones_like(nx, dtype=np.float32)
    inv_len = 1.0 / np.maximum(1e-6, np.sqrt(nx * nx + ny * ny + nz * nz))
    nx *= inv_len
    ny *= inv_len
    nz *= inv_len

    true_water = spec_mask > 0.52
    cavity_ao = compute_cavity_ao(elev_clamped, ~true_water)
    land_b = 0.02 + 0.44 * cavity_ao
    water_b = np.clip(np.maximum(0.76, spec_mask), 0.76, 0.94)
    blue_channel = np.where(true_water, water_b, land_b)

    nr = np.clip(np.round((nx * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    ng = np.clip(np.round((ny * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    nb = np.clip(np.round(blue_channel * 255.0), 0, 255).astype(np.uint8)

    norm_rgba = np.stack([nr, ng, nb, alpha_full], axis=-1)
    Image.fromarray(norm_rgba, mode="RGBA").save(normal_path, compress_level=6)



# ═══════════════════════════════════════════════════════════════════════════════
# 2. Organic Swirling Coriolis Cloud Deck Generator
# ═══════════════════════════════════════════════════════════════════════════════


def synthesize_cloud_deck(
    w: int,
    h: int,
    seed: int,
    clear_windows: list[tuple[float, float, float]],
    cyclones: list[tuple[float, float, float, float]],
) -> np.ndarray:
    lat, lng, x, y, z = make_sphere_grid(w, h)
    lat_r = np.deg2rad(lat)

    w1x = fbm3(x, y, z, freq=2.1, octaves=4, seed=seed + 3) - 0.5
    w1y = fbm3(x, y, z, freq=2.1, octaves=4, seed=seed + 19) - 0.5
    w1z = fbm3(x, y, z, freq=2.1, octaves=4, seed=seed + 41) - 0.5

    coriolis = np.sin(lat_r * 2.0) * 0.35
    qx = x + w1x * 0.85 - z * coriolis * 0.35
    qy = y + w1y * 0.55
    qz = z + w1z * 0.85 + x * coriolis * 0.35

    w2x = fbm3(qx, qy, qz, freq=5.2, octaves=4, seed=seed + 71) - 0.5
    w2y = fbm3(qx, qy, qz, freq=5.2, octaves=4, seed=seed + 89) - 0.5
    w2z = fbm3(qx, qy, qz, freq=5.2, octaves=4, seed=seed + 107) - 0.5

    rx = qx + w2x * 0.42
    ry = qy + w2y * 0.30
    rz = qz + w2z * 0.42

    macro_fronts = fbm3(rx * 1.15, ry * 1.55, rz * 1.15, freq=2.8, octaves=5, seed=seed + 131)
    wispy_streaks = ridged3(rx, ry * 1.35, rz, freq=6.8, octaves=4, seed=seed + 167)
    broken_cumulus = fbm3(rx, ry, rz, freq=15.5, octaves=4, seed=seed + 199)

    lon_wave = np.sin(np.deg2rad(lng * 3.0) + w1x * 5.0) * 8.5
    lat_eff = lat + lon_wave
    climatology = (
        0.80
        + 0.22 * np.exp(-((lat_eff / 13.0) ** 2)) * smoothstep(0.42, 0.72, macro_fronts)
        + 0.24 * np.exp(-(((np.abs(lat_eff) - 48.0) / 15.0) ** 2))
        - 0.24 * np.exp(-(((np.abs(lat_eff) - 24.0) / 11.0) ** 2))
    )

    raw_cloud = (macro_fronts * 0.60 + wispy_streaks * 0.24 + broken_cumulus * 0.16) * climatology
    clouds = smoothstep(0.42, 0.66, raw_cloud) ** 1.15
    clouds += smoothstep(0.56, 0.80, broken_cumulus * macro_fronts * 1.45) * 0.28

    for c_lat, c_lng, radius_deg, handedness in cyclones:
        cos_c = max(0.3, math.cos(math.radians(c_lat)))
        dx = ((lng - c_lng + 180.0) % 360.0 - 180.0) * cos_c
        dy = lat - c_lat
        dx_w = dx + (w2x * 7.5) + (w1z * 4.5)
        dy_w = dy + (w2y * 6.5) + (w1x * 4.0)
        r_deg = np.hypot(dx_w, dy_w)
        mask = r_deg < radius_deg * 1.35
        if not np.any(mask):
            continue
        ang = np.arctan2(dy_w[mask], dx_w[mask])
        rr = r_deg[mask] / radius_deg
        spiral_phase = ang * 2.0 - handedness * (3.8 * np.log(np.maximum(0.08, rr)) + rr * 2.4)
        arm1 = 0.5 + 0.5 * np.cos(spiral_phase)
        arm2 = 0.5 + 0.5 * np.cos(spiral_phase * 2.0 + 1.1)
        turbulence = broken_cumulus[mask]
        eyewall = smoothstep(0.05, 0.16, rr) * (1.0 - smoothstep(0.55, 1.05, rr))
        filament_arms = smoothstep(0.28, 0.88, (arm1**1.8) * (0.48 + 0.52 * arm2) * (0.45 + 0.85 * turbulence))
        eye_ring = np.exp(-(((rr - 0.14) / 0.06) ** 2)) * (0.55 + 0.45 * turbulence)
        arm_density = np.maximum(eyewall * filament_arms, eye_ring * 0.76)
        eye_clear = smoothstep(0.04, 0.11, rr)
        clouds[mask] = np.maximum(clouds[mask] * eye_clear, arm_density * 0.88)

    for w_lat, w_lng, w_rad in clear_windows:
        d = angular_dist_deg(lat, lng, w_lat, w_lng)
        atten = 0.22 + 0.78 * smoothstep(w_rad * 0.35, w_rad, d)
        clouds *= atten

    return np.clip(clouds, 0.0, 1.0).astype(np.float32)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. AKUNALIA — 100% Procedural High-Fantasy × SpaceEngine AAA Synthesizer
# ═══════════════════════════════════════════════════════════════════════════════


def generate_akunalia() -> dict[str, float]:
    t0 = time.perf_counter()
    print("[Akunalia] Synthesizing tectonic plates, scattered archipelagos & native 4K coastlines...")
    lat2, lng2, x2, y2, z2 = make_sphere_grid(DATA_W, DATA_H)

    # Multi-scale spherical domain warp for organic continental rias & fjords
    wx = fbm3(x2, y2, z2, freq=2.4, octaves=4, seed=11) - 0.5
    wy = fbm3(x2, y2, z2, freq=2.4, octaves=4, seed=29) - 0.5
    wz = fbm3(x2, y2, z2, freq=2.4, octaves=4, seed=47) - 0.5

    sx = x2 + wx * 0.42
    sy = y2 + wy * 0.36
    sz = z2 + wz * 0.42

    coast_fbm = fbm3(sx, sy, sz, freq=5.8, octaves=5, seed=61) - 0.5
    ria_fbm = ridged3(sx, sy, sz, freq=11.5, octaves=4, seed=73) - 0.5
    fine_coast = fbm3(sx, sy, sz, freq=24.0, octaves=4, seed=83) - 0.5
    warp_deg = coast_fbm * 19.5 + ria_fbm * 7.2 + fine_coast * 4.2

    # (A) Western Primordial Continent: Eldarin Highlands (`lat -18..48N, lng -118..-50`)
    d_eld_core = angular_dist_deg(lat2, lng2, 26.5, -80.5)
    eldarin_plate = (
        np.maximum.reduce(
            [
                1.0 - (d_eld_core + warp_deg * 0.96) / 26.0,
                (1.0 - (angular_dist_deg(lat2, lng2, 42.0, -65.0) + warp_deg * 1.10) / 18.0) * 0.88,
                (1.0 - (angular_dist_deg(lat2, lng2, 6.5, -92.5) + warp_deg * 0.94) / 18.2) * 0.85,
                (1.0 - (angular_dist_deg(lat2, lng2, -13.5, -104.0) + warp_deg * 1.06) / 14.2) * 0.78,
            ]
        )
        - smoothstep(13.5, 3.8, angular_dist_deg(lat2, lng2, 34.0, -93.0) + coast_fbm * 6.5) * 0.38
        - smoothstep(12.0, 3.2, angular_dist_deg(lat2, lng2, 11.0, -72.0) + coast_fbm * 5.8) * 0.36
    )

    # (B) Central Imperial Supercontinent: Tabaoki, Nilanda, Behadona, Zyberon & Southern Wilds
    imperial_plate = (
        np.maximum.reduce(
            [
                1.0 - (angular_dist_deg(lat2, lng2, 46.5, 18.5) + warp_deg * 0.98) / 25.2,
                (1.0 - (angular_dist_deg(lat2, lng2, 30.5, 4.5) + warp_deg * 1.04) / 18.2) * 0.86,
                1.0 - (angular_dist_deg(lat2, lng2, 22.5, 22.5) + warp_deg * 0.88) / 29.0,
                (1.0 - (angular_dist_deg(lat2, lng2, 20.8, 49.0) + warp_deg * 0.92) / 16.8) * 0.90,
                (1.0 - (angular_dist_deg(lat2, lng2, -4.0, 45.8) + warp_deg * 0.92) / 16.5) * 0.88,
                (1.0 - (angular_dist_deg(lat2, lng2, -19.5, 19.5) + warp_deg * 1.02) / 23.2) * 0.88,
                (1.0 - (angular_dist_deg(lat2, lng2, -33.2, 27.8) + warp_deg * 1.08) / 13.8) * 0.78,
            ]
        )
        - smoothstep(14.5, 4.2, angular_dist_deg(lat2, lng2, 6.5, 4.0) + coast_fbm * 6.5) * 0.45
    )

    # Carve Natural Crescent Moon Sea (`Hồ Bán Nguyệt` around `8.2°N, 46.8°E`) with curving eastern horn peninsulas
    horn_north = smoothstep(1.25, 0.32, rotated_elliptical_dist(lat2 + coast_fbm * 2.4, lng2 + ria_fbm * 2.4, 15.6, 52.8, 5.4, 2.3, -34.0)) * 0.92 - 0.52
    horn_south = smoothstep(1.25, 0.32, rotated_elliptical_dist(lat2 + coast_fbm * 2.4, lng2 + ria_fbm * 2.4, 0.8, 52.0, 5.2, 2.2, 32.0)) * 0.88 - 0.52
    imperial_plate = np.maximum(imperial_plate, np.maximum(horn_north, horn_south))

    d_cres_outer = angular_dist_deg(lat2, lng2, 8.2, 46.2) + coast_fbm * 4.2 + ria_fbm * 2.2 + fine_coast * 1.5
    d_cres_inner = angular_dist_deg(lat2, lng2, 11.4, 36.2) + coast_fbm * 3.6 + fine_coast * 1.4
    crescent_basin = smoothstep(13.8, 8.4, d_cres_outer) * smoothstep(6.4, 11.6, d_cres_inner)

    # (C) Organic Sweeping Volcanic Island Arcs & Jagged Coral Archipelagos (ZERO straight rows, ZERO round circles!)
    # Format: (lat, lng, rx_deg, ry_deg, angle_deg, amp)
    sky_islands = [
        # Major irregular high-fantasy islands (peninsular & crescent shapes along curved subduction arcs)
        (11.4, 113.8, 3.8, 1.7, -28.0, 1.02),
        (13.2, 114.6, 1.5, 2.9, 42.0, 0.94),
        (18.6, 106.8, 3.2, 1.4, -48.0, 0.96),
        (23.8, 100.4, 2.5, 1.1, -62.0, 0.88),
        (5.4, 119.8, 3.4, 1.5, -14.0, 0.95),
        (-1.8, 127.6, 3.9, 1.6, -22.0, 0.98),
        (-2.6, 129.0, 1.6, 3.1, 52.0, 0.90),
        (-8.6, 134.8, 3.1, 1.3, -8.0, 0.92),
        (-13.4, 141.6, 2.6, 1.2, -32.0, 0.88),
        (-18.8, 146.2, 2.2, 1.0, -45.0, 0.84),
        # Northern sweeping volcanic arc (curves NE then SE)
        (21.4, 115.6, 2.1, 0.95, 18.0, 0.86),
        (22.8, 121.8, 1.8, 0.85, -12.0, 0.84),
        (19.6, 127.4, 2.3, 1.05, -38.0, 0.88),
        (14.2, 131.6, 1.7, 0.85, -55.0, 0.82),
        (8.4, 133.8, 1.4, 0.75, -68.0, 0.80),
        # Southern scattered inner sea cluster & atolls
        (4.8, 107.6, 1.9, 0.95, 28.0, 0.85),
        (-0.8, 111.8, 2.4, 1.15, -18.0, 0.88),
        (-5.8, 116.4, 1.7, 0.85, 35.0, 0.82),
        (-9.4, 122.6, 2.2, 0.95, 12.0, 0.85),
        (-14.6, 128.2, 1.6, 0.80, -24.0, 0.80),
        # Fine scattered satellite islets & cays
        (26.8, 97.2, 1.1, 0.65, -50.0, 0.78),
        (15.6, 109.8, 1.0, 0.60, 22.0, 0.78),
        (8.6, 116.4, 0.95, 0.58, -35.0, 0.78),
        (16.4, 121.2, 1.15, 0.65, 44.0, 0.80),
        (10.8, 125.4, 1.25, 0.68, -16.0, 0.80),
        (1.6, 123.6, 1.05, 0.62, 55.0, 0.78),
        (-5.4, 131.2, 1.10, 0.60, -40.0, 0.78),
        (-11.2, 138.2, 0.95, 0.55, 18.0, 0.76),
        (-16.2, 144.2, 0.90, 0.52, -28.0, 0.76),
        (-21.8, 149.4, 1.05, 0.58, -38.0, 0.76),
    ]
    # High-frequency island-scale shoreline distortion so every island has jagged bays & peninsulas!
    isl_hi_a = fbm3(x2, y2, z2, freq=28.0, octaves=4, seed=107) - 0.5
    isl_hi_b = ridged3(x2, y2, z2, freq=46.0, octaves=3, seed=119) - 0.5
    isl_ridge = ridged3(sx, sy, sz, freq=26.0, octaves=4, seed=113)
    archipelago_plate = np.full_like(lat2, -0.55, dtype=np.float32)
    reef_shelf_2k = np.zeros_like(lat2, dtype=np.float32)
    for i_lat, i_lng, rx_d, ry_d, ang_d, i_amp in sky_islands:
        ed = rotated_elliptical_dist(
            lat2 + isl_hi_a * 2.2 + fine_coast * 1.6,
            lng2 + isl_hi_b * 2.6 + ria_fbm * 1.4,
            i_lat,
            i_lng,
            rx_d,
            ry_d,
            ang_d,
        )
        cone = (1.0 - ed) * i_amp * (0.64 + 0.58 * isl_ridge) - 0.06
        archipelago_plate = np.maximum(archipelago_plate, cone)
        reef_shelf_2k = np.maximum(reef_shelf_2k, smoothstep(1.95, 0.78, ed))

    # (D) Polar Crown Isles & Austral Continent (use -0.55 baseline so deep ocean reaches full abyssal depth!)
    polar_north = smoothstep(74.0, 81.5, lat2 + coast_fbm * 11.5) * 0.90 - 0.55
    austral_shelf = smoothstep(70.5, 78.5, -lat2 + coast_fbm * 11.5) * 0.96 - 0.55

    continental_2k = np.maximum.reduce(
        [eldarin_plate, imperial_plate, archipelago_plate, polar_north, austral_shelf]
    )
    continental_2k -= crescent_basin * 0.90

    # 2. Domain-Warped Tectonic Cordilleras with Branching Lateral Spurs (ZERO sausage ovals!)
    m_lat = lat2 + coast_fbm * 3.8 + fine_coast * 1.4
    m_lng = lng2 + ria_fbm * 4.5 + fine_coast * 1.6

    # Mount Tabaoki main arc + 5 branching glacial spurs
    tabaoki_arc_d = polyline_dist_deg(
        m_lat, m_lng, [(43.2, 5.8), (46.0, 12.2), (47.6, 18.5), (46.6, 25.2), (43.5, 31.8)]
    )
    tabaoki_spurs_d = np.minimum.reduce(
        [
            polyline_dist_deg(m_lat, m_lng, [(46.0, 12.2), (41.5, 9.8), (37.8, 8.2)]),
            polyline_dist_deg(m_lat, m_lng, [(47.6, 18.5), (42.2, 15.6), (37.5, 14.0)]),
            polyline_dist_deg(m_lat, m_lng, [(47.2, 21.8), (51.5, 20.2), (54.2, 18.5)]),
            polyline_dist_deg(m_lat, m_lng, [(46.6, 25.2), (41.2, 27.4), (36.8, 29.8)]),
            polyline_dist_deg(m_lat, m_lng, [(44.5, 29.5), (48.8, 33.5)]),
        ]
    )
    tabaoki_piedmont = smoothstep(11.5, 1.2, tabaoki_arc_d) * 0.16 + smoothstep(7.5, 1.0, tabaoki_spurs_d) * 0.09
    tabaoki_crest_zone = smoothstep(4.4, 0.35, tabaoki_arc_d) * 0.46 + smoothstep(2.8, 0.35, tabaoki_spurs_d) * 0.25

    # Eldarin Misty Cordillera + Lateral Ridges
    eldarin_spine_d = polyline_dist_deg(
        m_lat, m_lng, [(15.5, -90.2), (23.8, -83.5), (31.2, -77.8), (39.0, -70.2)]
    )
    eldarin_spurs_d = np.minimum(
        polyline_dist_deg(m_lat, m_lng, [(25.5, -82.0), (29.5, -88.5), (32.5, -92.0)]),
        polyline_dist_deg(m_lat, m_lng, [(31.2, -77.8), (26.5, -71.5), (22.5, -67.5)]),
    )
    eldarin_piedmont = smoothstep(10.5, 1.2, eldarin_spine_d) * 0.14
    eldarin_crest_zone = smoothstep(4.2, 0.4, eldarin_spine_d) * 0.35 + smoothstep(2.8, 0.4, eldarin_spurs_d) * 0.18

    # Southern Imperial Rift Cordillera
    southern_range_d = polyline_dist_deg(
        m_lat, m_lng, [(-3.5, 12.0), (-13.5, 19.2), (-23.8, 25.2), (-30.5, 27.2)]
    )
    southern_spurs_d = polyline_dist_deg(m_lat, m_lng, [(-13.5, 19.2), (-17.5, 12.8), (-21.0, 9.5)])
    southern_piedmont = smoothstep(10.0, 1.2, southern_range_d) * 0.12
    southern_crest_zone = smoothstep(4.2, 0.45, southern_range_d) * 0.29 + smoothstep(2.8, 0.45, southern_spurs_d) * 0.15

    zyberon_d = angular_dist_deg(lat2, lng2, 19.5, 24.8)
    zyberon_plateau = smoothstep(6.2, 1.8, zyberon_d + fine_coast * 0.9) * 0.11

    # 3. Meandering Behadona River & Organic Branching Eldarin Lifestream Channels (curved tree-of-life valleys, ZERO straight X!)
    rw_lng = (fbm3(x2 * 1.4, y2 * 1.4, z2 * 1.4, freq=9.5, octaves=4, seed=211) - 0.5) * 4.4
    rw_lat = (fbm3(x2 * 1.4, y2 * 1.4, z2 * 1.4, freq=9.5, octaves=4, seed=229) - 0.5) * 3.5
    rw_fine = (fbm3(x2, y2, z2, freq=22.0, octaves=3, seed=239) - 0.5) * 1.25
    r_lat = lat2 + rw_lat + rw_fine
    r_lng = lng2 + rw_lng - rw_fine

    behadona_main_d = polyline_dist_deg(
        r_lat, r_lng,
        [(46.2, 18.2), (40.5, 18.8), (34.0, 19.0), (28.5, 19.5), (23.5, 21.8), (18.8, 28.2), (14.8, 34.8), (12.2, 38.6)],
    )
    behadona_west_trib = polyline_dist_deg(r_lat, r_lng, [(44.5, 11.2), (37.5, 15.2), (32.5, 19.0)])
    behadona_east_trib = polyline_dist_deg(r_lat, r_lng, [(45.2, 25.4), (36.8, 24.0), (26.0, 21.0)])
    delta_b1 = polyline_dist_deg(r_lat, r_lng, [(14.8, 34.8), (13.6, 39.2)])
    delta_b2 = polyline_dist_deg(r_lat, r_lng, [(14.8, 34.8), (10.6, 38.8)])
    behadona_d = np.minimum.reduce([behadona_main_d, behadona_west_trib * 1.22, behadona_east_trib * 1.22, delta_b1 * 1.12, delta_b2 * 1.12])

    eld_lifestream_routes = [
        [(39.5, -69.5), (35.2, -74.5), (30.2, -78.8), (26.5, -80.5), (21.5, -82.8), (15.0, -86.5), (8.2, -91.8), (1.0, -96.2), (-7.5, -100.5)],
        [(26.5, -80.5), (24.8, -86.2), (21.5, -91.8), (16.8, -96.0)],
        [(30.2, -78.8), (33.5, -83.8), (37.8, -87.5)],
        [(24.2, -81.6), (20.8, -75.5), (16.2, -69.8)],
        [(8.2, -91.8), (4.5, -86.0), (-0.5, -82.5)],
    ]
    eld_lifestream_d = np.minimum.reduce([polyline_dist_deg(r_lat, r_lng, rt) for rt in eld_lifestream_routes])

    # 4. Native 4K Coastline Refinement & Multi-Octave Dendritic Relief
    print("[Akunalia] Synthesizing 4K High-Fantasy × SpaceEngine Albedo & Relief...")
    lat4, lng4, x4, y4, z4 = make_sphere_grid(ALBEDO_W, ALBEDO_H)
    micro_tex = fbm3(x4, y4, z4, freq=44.0, octaves=4, seed=401)
    coast_detail4 = fbm3(x4, y4, z4, freq=64.0, octaves=3, seed=409) - 0.5
    ridge_crest4 = ridged3(x4, y4, z4, freq=22.0, octaves=5, seed=419)
    fine_ridges4 = ridged3(x4, y4, z4, freq=38.0, octaves=4, seed=427)

    cont4 = upsample_2d(continental_2k, ALBEDO_W, ALBEDO_H) + coast_detail4 * 0.038
    land4 = cont4 > 0.0

    # Bathymetry, Mid-Ocean Tectonic Ridges & Coral Shelves at 4K (only apply reef shoals where reef4 > 0!)
    ocean_depth4 = smoothstep(0.0, -0.50, cont4)
    abyssal4 = upsample_2d(ridged3(sx, sy, sz, freq=5.4, octaves=4, seed=251), ALBEDO_W, ALBEDO_H)
    reef4 = upsample_2d(reef_shelf_2k, ALBEDO_W, ALBEDO_H)
    bathy4 = SEA_LEVEL_NORM - (0.014 + 0.214 * (ocean_depth4**0.78)) + (abyssal4**1.4) * 0.032 * ocean_depth4
    coral_shoal4 = SEA_LEVEL_NORM - 0.048 + reef4 * 0.038 * (0.55 + 0.45 * micro_tex)
    bathy4 = bathy4 * (1.0 - reef4 * 0.88) + np.maximum(bathy4, coral_shoal4) * (reef4 * 0.88)

    # Ethereal Crescent-Conforming 4 Harmonic Barrier Ripples inside Crescent Moon Sea (`8.2°N, 46.2°E` — ZERO radar bullseye!)
    crescent_water4 = upsample_2d(smoothstep(14.0, 4.2, d_cres_outer), ALBEDO_W, ALBEDO_H) * (~land4).astype(np.float32)
    cres_warp4 = upsample_2d(coast_fbm * 0.85 + ria_fbm * 0.35, ALBEDO_W, ALBEDO_H) + (micro_tex - 0.5) * 0.18
    d_cres4 = angular_dist_deg(lat4, lng4, 8.2, 46.2) + cres_warp4
    cres_ang4 = np.arctan2(lat4 - 8.2, (lng4 - 46.2) * math.cos(math.radians(8.2)))
    # Smooth continuous crescent-bay envelope that fades gently at the eastern strait mouth (`ang ~ 0`)
    strait_fade4 = 0.22 + 0.78 * smoothstep(-0.45, 0.75, -np.cos(cres_ang4))
    arc_mod4 = strait_fade4 * (0.72 + 0.28 * np.sin(cres_ang4 + cres_warp4 * 1.2))
    ward_rings_4k = (
        np.exp(-(((d_cres4 - 2.35) / 0.075) ** 2)) * 0.92
        + np.exp(-(((d_cres4 - 4.35) / 0.085) ** 2)) * 0.84
        + np.exp(-(((d_cres4 - 6.45) / 0.095) ** 2)) * 0.76
        + np.exp(-(((d_cres4 - 8.60) / 0.105) ** 2)) * 0.68
    ) * crescent_water4 * arc_mod4
    cres_shoal4 = smoothstep(13.2, 9.0, d_cres4) * crescent_water4
    bathy4 = np.where(crescent_water4 > 0.05, np.maximum(bathy4, 0.192 + cres_shoal4 * 0.026 + ward_rings_4k * 0.007), bathy4)

    # Land Elevation (Piedmont + Dendritic Eroded Cordilleras — ZERO smooth domes!)
    piedmont2 = 0.018 + np.clip(continental_2k, 0.0, 0.9) * 0.095 + tabaoki_piedmont + eldarin_piedmont + southern_piedmont + zyberon_plateau
    crest2 = tabaoki_crest_zone + eldarin_crest_zone + southern_crest_zone
    valley_carve2 = smoothstep(3.8, 0.22, behadona_d) * 0.072

    piedmont4 = upsample_2d(piedmont2 - valley_carve2, ALBEDO_W, ALBEDO_H)
    crest4 = upsample_2d(crest2, ALBEDO_W, ALBEDO_H)
    dendritic4 = 0.62 * ridge_crest4 + 0.38 * fine_ridges4

    # Deeply incised dendritic valleys (`0.12` at valley floor -> `1.18` at razor arête!)
    land_h4 = (
        np.maximum(0.010, piedmont4)
        + crest4 * (0.14 + 1.04 * (dendritic4**1.45))
        + (micro_tex - 0.5) * 0.018
    )
    behadona_w4 = upsample_2d(smoothstep(0.28, 0.055, behadona_d), ALBEDO_W, ALBEDO_H)
    eld_stream_w4 = upsample_2d(smoothstep(0.22, 0.045, eld_lifestream_d), ALBEDO_W, ALBEDO_H)
    land_h4 -= behadona_w4 * 0.055 + eld_stream_w4 * 0.036

    elev4 = np.where(land4, np.maximum(SEA_LEVEL_NORM + 0.003, SEA_LEVEL_NORM + land_h4 * 0.72), bathy4)
    delta_zone4 = smoothstep(6.2, 1.4, angular_dist_deg(lat4, lng4, 13.5, 37.5))
    elev4 = np.where((behadona_w4 > 0.52) & (delta_zone4 > 0.25), SEA_LEVEL_NORM - 0.010, elev4)
    elev4 = np.clip(elev4, 0.0, 1.0).astype(np.float32)
    land4 = elev4 >= SEA_LEVEL_NORM

    # Downsample cleanly to 2048x1024 for 16-bit displacement & normal maps
    elev2 = downsample_2x(elev4)
    land_mask2 = elev2 >= SEA_LEVEL_NORM
    macro_elev2 = blur_2d(elev2, 1.8)
    cos_lat2 = np.maximum(0.22, np.cos(np.deg2rad(lat2)))
    mgx = (np.roll(macro_elev2, -1, axis=1) - np.roll(macro_elev2, 1, axis=1)) * 0.5 / cos_lat2
    mgy = np.gradient(macro_elev2, axis=0)
    macro_slope2 = np.clip(np.hypot(mgx, mgy) * 40.0, 0.0, 1.0)
    macro_slope4 = upsample_2d(macro_slope2, ALBEDO_W, ALBEDO_H)

    # Subtle 4K fine relief hillshade for authentic orbital satellite crispness
    elev_dx4 = np.roll(elev4, -1, axis=1) - np.roll(elev4, 1, axis=1)
    elev_dy4 = np.pad(elev4, ((1, 1), (0, 0)), mode="edge")[:-2, :] - np.pad(elev4, ((1, 1), (0, 0)), mode="edge")[2:, :]
    relief_shade4 = np.clip(1.0 + (-elev_dx4 * 14.0 + elev_dy4 * 10.0), 0.84, 1.15)

    # 5. True AAA Satellite × Final Fantasy Albedo Coloring (`4096x2048`)
    alt4 = np.clip((elev4 - SEA_LEVEL_NORM) / (1.0 - SEA_LEVEL_NORM), 0.0, 1.0)
    abs_lat4 = np.abs(lat4)

    # Ocean Bathymetry Palette (Rich SpaceEngine Cobalt-Sapphire -> Mid-Ocean Ridges -> Jade Coral Lagoons)
    sea_depth = np.clip((SEA_LEVEL_NORM - elev4) / SEA_LEVEL_NORM, 0.0, 1.0)
    ocean_col = lerp_rgb(rgb(0.062, 0.235, 0.475), rgb(0.038, 0.155, 0.355), smoothstep(0.14, 0.84, sea_depth))
    ocean_col = lerp_rgb(ocean_col, rgb(0.078, 0.305, 0.535), (abyssal4**1.8) * smoothstep(0.78, 0.18, sea_depth) * 0.46)
    ocean_col = lerp_rgb(ocean_col, rgb(0.072, 0.425, 0.575), smoothstep(0.46, 0.055, sea_depth))
    ocean_col = lerp_rgb(ocean_col, rgb(0.125, 0.665, 0.675), smoothstep(0.075, 0.004, sea_depth) * (0.50 + 0.50 * micro_tex))
    # Luminous jade lagoon shoals & 4 gossamer standing barrier wavelets in Hồ Bán Nguyệt (ZERO dark bullseye!)
    ocean_col = lerp_rgb(ocean_col, rgb(0.068, 0.525, 0.585), cres_shoal4 * 0.46)
    ocean_col += rgb(0.20, 0.78, 0.76)[None, None, :] * (ward_rings_4k[..., None] * 0.28)

    # Land Biomes (Warped climatic moisture — ZERO circular stamps, ZERO dark charcoal collars!)
    canopy_var = upsample_2d(fbm3(x2, y2, z2, freq=14.0, octaves=4, seed=433), ALBEDO_W, ALBEDO_H)
    moisture_base = upsample_2d(fbm3(x2 * 1.1, y2 * 1.4, z2 * 1.1, freq=4.6, octaves=4, seed=461), ALBEDO_W, ALBEDO_H)
    eldarin_w4 = upsample_2d(smoothstep(29.0, 6.0, d_eld_core + coast_fbm * 5.0), ALBEDO_W, ALBEDO_H)
    tabaoki_core_w4 = upsample_2d(smoothstep(6.2, 0.8, np.minimum(tabaoki_arc_d, tabaoki_spurs_d * 1.15)), ALBEDO_W, ALBEDO_H)
    archipelago_w4 = smoothstep(88.0, 98.0, lng4) * smoothstep(32.0, -28.0, np.abs(lat4) - 8.0)
    zyberon_arid4 = smoothstep(1.15, 0.30, rotated_elliptical_dist(lat4 + (canopy_var - 0.5) * 3.5, lng4 + (moisture_base - 0.5) * 4.5, 19.5, 25.5, 10.5, 6.8, -18.0))

    wetness = np.clip(
        moisture_base * 0.68
        + eldarin_w4 * 0.34
        + archipelago_w4 * 0.38
        + upsample_2d(smoothstep(8.0, 0.5, behadona_d), ALBEDO_W, ALBEDO_H) * 0.32
        + np.exp(-((abs_lat4 / 19.0) ** 2)) * 0.28
        - zyberon_arid4 * 0.46,
        0.0,
        1.0,
    )

    c_lush_rainforest = rgb(0.072, 0.268, 0.124)
    c_eldarin_jade = rgb(0.098, 0.395, 0.242)
    c_nilanda_meadow = rgb(0.238, 0.425, 0.164)
    c_golden_savanna = rgb(0.545, 0.485, 0.252)
    c_zyberon_sandstone = rgb(0.675, 0.515, 0.338)
    c_subalpine_pine = rgb(0.092, 0.218, 0.145)
    c_alpine_scree = rgb(0.415, 0.388, 0.342)
    c_tabaoki_obsidian = rgb(0.112, 0.126, 0.168)
    c_glacier_snow = rgb(0.945, 0.968, 0.992)

    land_col = lerp_rgb(c_zyberon_sandstone, c_golden_savanna, smoothstep(0.18, 0.42, wetness))
    land_col = lerp_rgb(land_col, c_nilanda_meadow, smoothstep(0.38, 0.62, wetness))
    land_col = lerp_rgb(land_col, c_lush_rainforest, smoothstep(0.58, 0.84, wetness))
    land_col = lerp_rgb(land_col, c_eldarin_jade, eldarin_w4 * smoothstep(0.32, 0.76, canopy_var) * 0.68)
    land_col *= (0.85 + 0.30 * micro_tex)[..., None]

    # Natural Latitudinal & Elevational Forest-to-Alpine Transition (ZERO black slope collar!)
    eff_boreal = abs_lat4 + alt4 * 34.0 + (canopy_var - 0.5) * 7.5
    pine_w = smoothstep(38.0, 54.0, eff_boreal) * smoothstep(0.16, 0.42, wetness + 0.15)
    tundra_w = smoothstep(54.0, 68.0, eff_boreal)
    land_col = lerp_rgb(land_col, c_subalpine_pine * (0.86 + 0.28 * micro_tex)[..., None], pine_w * 0.76)
    land_col = lerp_rgb(land_col, c_alpine_scree * (0.86 + 0.28 * micro_tex)[..., None], tundra_w * 0.78)

    # Razor-sharp Volcanic Obsidian Arêtes on Tabaoki & Porphyry Ridges on Eldarin/Southern Range
    high_arête = smoothstep(0.46, 0.84, dendritic4) * smoothstep(0.18, 0.44, alt4)
    rock_palette = lerp_rgb(c_alpine_scree, c_tabaoki_obsidian, tabaoki_core_w4 * 0.92)
    land_col = lerp_rgb(land_col, rock_palette * (0.80 + 0.38 * fine_ridges4)[..., None], high_arête * 0.90)

    # Zyberon Pentagonal Bastion (`19.5°N, 24.8°E`)
    cos_zyb = math.cos(math.radians(19.5))
    zx = (lng4 - 24.8) * cos_zyb
    zy = lat4 - 19.5
    zr = np.hypot(zx, zy)
    zang = np.arctan2(zy, zx)
    sector_a = ((zang + math.pi / 2.0) % (2.0 * math.pi / 5.0)) - (math.pi / 5.0)
    pent_r = zr * np.cos(sector_a) / math.cos(math.pi / 5.0)
    pent_wall = np.exp(-(((pent_r - 1.25) / 0.10) ** 2)) + np.exp(-(((pent_r - 0.62) / 0.08) ** 2))
    land_col = lerp_rgb(land_col, rgb(0.74, 0.58, 0.38), smoothstep(3.8, 1.0, zr + (micro_tex - 0.5) * 0.8) * 0.50)
    land_col = lerp_rgb(land_col, rgb(0.86, 0.74, 0.52), np.clip(pent_wall, 0.0, 1.0) * 0.68)

    # Dendritic Mountain Snow Spines & Obsidian Crags (snow clings to sharp dendritic ridges & cirques, NEVER a flat white blob!)
    glacier_snow_metric = alt4 * (0.34 + 0.88 * (ridge_crest4**1.55)) + smoothstep(0.42, 0.72, alt4) * (fine_ridges4**1.4) * 0.16
    snow_threshold = 0.49 - 0.14 * smoothstep(38.0, 68.0, abs_lat4) - (micro_tex - 0.5) * 0.05
    snow_w = smoothstep(snow_threshold, snow_threshold + 0.11, glacier_snow_metric)
    # Steep volcanic obsidian cliffs & razor spines pierce through Tabaoki's snowfields (`núi tuyết & hắc diện thạch`)
    obsidian_pierce = tabaoki_core_w4 * smoothstep(0.62, 0.90, fine_ridges4) * (0.45 + 0.55 * macro_slope4)
    snow_w *= 1.0 - obsidian_pierce * 0.78
    polar_ice = smoothstep(72.5, 79.8, abs_lat4 + (canopy_var - 0.5) * 6.0)
    snow_total = np.maximum(snow_w, polar_ice)
    shaded_snow = lerp_rgb(rgb(0.76, 0.84, 0.93), c_glacier_snow, smoothstep(0.88, 1.08, relief_shade4))
    land_col = lerp_rgb(land_col, shaded_snow * (0.94 + 0.06 * micro_tex)[..., None], snow_total)
    land_col *= relief_shade4[..., None]

    # Behadona River & Luminous Eldarin Lifestream Channels
    river_water = np.clip(behadona_w4 * (1.0 - snow_total * 0.82), 0.0, 1.0)
    lifestream_water = np.clip(eld_stream_w4 * (1.0 - snow_total * 0.75), 0.0, 1.0)
    land_col = lerp_rgb(land_col, rgb(0.052, 0.335, 0.455), river_water * 0.86)
    land_col = lerp_rgb(land_col, rgb(0.110, 0.665, 0.625), lifestream_water * 0.80)

    beach_w = smoothstep(SEA_LEVEL_NORM + 0.011, SEA_LEVEL_NORM, elev4) * (1.0 - smoothstep(0.18, 0.44, macro_slope4)) * smoothstep(56.0, 34.0, abs_lat4) * (1.0 - archipelago_w4 * 0.65)
    land_col = lerp_rgb(land_col, rgb(0.76, 0.69, 0.54), beach_w * 0.34)

    albedo4 = np.where(land4[..., None], np.clip(land_col, 0.0, 1.0), ocean_col)
    sea_ice = (~land4).astype(np.float32) * smoothstep(76.0, 84.5, abs_lat4 + (canopy_var - 0.5) * 7.0)
    albedo4 = lerp_rgb(albedo4, rgb(0.86, 0.92, 0.97), sea_ice * 0.88)

    Image.fromarray(np.clip(np.round(albedo4 * 255.0), 0, 255).astype(np.uint8), mode="RGB").save(
        DATA_DIR / "akunalia-albedo-4k.jpg", quality=94, subsampling=0
    )

    # 6. True-Water Mask & 16-bit Elevation + Normal/CavityAO Maps (`2048x1024` — ZERO snow/land specular!)
    river_spec2 = (
        np.maximum(
            smoothstep(0.24, 0.04, behadona_d),
            smoothstep(0.18, 0.03, eld_lifestream_d),
        )
        * (1.0 - downsample_2x(snow_total))
        * land_mask2.astype(np.float32)
    )
    ocean_liquid2 = (1.0 - downsample_2x(sea_ice)) * 0.90
    spec2 = np.where(land_mask2, river_spec2 * 0.84, np.where(ocean_liquid2 > 0.52, ocean_liquid2, 0.0))
    save_elevation_and_normal_maps(
        elev2,
        land_mask2,
        spec2,
        DATA_DIR / "akunalia-elevation-sdf.png",
        DATA_DIR / "akunalia-normal-spec.png",
        normal_strength=7.8,
    )

    # 7. Akunalia HDR Night Map (`2048x1024`) — True Final Fantasy × SpaceEngine Dendritic Lifestream Filigree!
    print("[Akunalia] Synthesizing Crisp Dendritic Night Lifestream & Zyberon `王` Sanctum...")
    night = np.zeros((DATA_H, DATA_W, 3), dtype=np.float32)

    # Continental primary ley-arteries (domain-warped meandering tectonic conduits; archipelago uses island-local crystal ridges!)
    imperial_ley_routes = [
        [(47.2, 18.5), (38.5, 17.5), (28.5, 19.5), (19.5, 24.8)],
        [(45.5, 11.5), (36.5, 13.8), (27.5, 17.5)],
        [(45.8, 26.2), (35.5, 26.5), (24.5, 26.8), (19.5, 24.8)],
        [(19.5, 24.8), (15.0, 34.5), (11.8, 39.2)],
        [(19.5, 24.8), (9.5, 21.5), (-3.5, 16.2), (-15.5, 19.8), (-27.5, 25.8)],
        [(-13.5, 19.2), (-18.5, 11.8), (-22.5, 8.5)],
        [(-6.5, 17.5), (-2.2, 31.8), (1.8, 42.5)],
    ]
    imp_ley_d = np.minimum.reduce([polyline_dist_deg(r_lat, r_lng, rt) for rt in imperial_ley_routes])
    all_ley_d = np.minimum(eld_lifestream_d, imp_ley_d)

    # Multi-scale sharp ridged filaments (`pow` sharpens ridges into crisp 1–2px glowing roots, ZERO foggy clouds!)
    vein_major = ridged3(sx * 1.25, sy * 1.25, sz * 1.25, freq=13.5, octaves=4, seed=509)
    vein_branch = ridged3(sx * 1.45, sy * 1.45, sz * 1.45, freq=24.0, octaves=4, seed=517)
    capillary_fine = ridged3(x2, y2, z2, freq=42.0, octaves=3, seed=523)
    flow_mod = smoothstep(0.26, 0.78, fbm3(x2, y2, z2, freq=7.5, octaves=3, seed=541))
    node_sparks = smoothstep(0.75, 0.96, fbm3(x2, y2, z2, freq=58.0, octaves=2, seed=531))

    eld_focus = smoothstep(35.0, 4.5, d_eld_core)
    arch_focus = smoothstep(88.0, 100.0, lng2) * smoothstep(32.0, 6.0, np.abs(lat2 - 2.0))
    corridor_near = np.maximum.reduce([smoothstep(14.5, 0.6, all_ley_d), eld_focus * 0.90, arch_focus * 0.85])
    corridor_wide = np.maximum.reduce([smoothstep(23.5, 2.0, all_ley_d), eld_focus, arch_focus])

    # Tier 1: Razor-sharp main arteries (`0.10°` bright core + `0.32°` tight aura, modulated organically)
    artery_core = (
        np.exp(-((eld_lifestream_d / 0.105) ** 2)) * (0.68 + 0.42 * flow_mod)
        + np.exp(-((imp_ley_d / 0.095) ** 2)) * (0.50 + 0.38 * flow_mod)
    )
    artery_aura = (
        np.exp(-((eld_lifestream_d / 0.32) ** 2)) * 0.22
        + np.exp(-((imp_ley_d / 0.26) ** 2)) * 0.15
    ) * flow_mod

    # Tier 2: Intricate dendritic valley branches & Sky-Archipelago island crystal spines (`smoothstep(0.62, 0.93)` -> crisp branching filaments!)
    secondary_veins = (smoothstep(0.62, 0.93, vein_major) ** 1.95) * corridor_near * (0.52 + 0.58 * flow_mod) * 1.12
    tertiary_veins = (smoothstep(0.68, 0.94, vein_branch) ** 2.15) * corridor_wide * (0.38 + 0.62 * vein_major) * 0.88
    island_spine_veins = arch_focus * (smoothstep(0.60, 0.92, isl_ridge) ** 1.85) * (0.45 + 0.55 * flow_mod) * 1.05

    # Tier 3: Hair-fine capillary rootlets & luminous crystal sanctuary nexuses
    fine_capillaries = (smoothstep(0.74, 0.96, capillary_fine) ** 2.4) * corridor_wide * smoothstep(0.45, 0.85, vein_major) * 0.68
    sanctuary_cores = (
        np.exp(-((angular_dist_deg(lat2, lng2, 26.5, -80.5) / 0.34) ** 2)) * 1.15
        + np.exp(-((angular_dist_deg(lat2, lng2, 11.4, 113.8) / 0.24) ** 2)) * 0.88
        + np.exp(-((angular_dist_deg(lat2, lng2, -1.8, 127.6) / 0.22) ** 2)) * 0.80
        + np.exp(-((angular_dist_deg(lat2, lng2, 47.2, 18.5) / 0.26) ** 2)) * 0.82
    )
    nexus_nodes = node_sparks * smoothstep(0.64, 0.92, vein_major) * corridor_near * 0.92

    # Suppress emerald Lifestream right inside Zyberon's siphoned arid core (`19.5°N, 24.8°E`) so golden-crimson siphon web contrasts dramatically!
    zyb_suppress = 1.0 - smoothstep(5.2, 1.4, angular_dist_deg(lat2, lng2, 19.5, 24.8)) * 0.85
    lifestream_core = np.clip(
        (artery_core + secondary_veins + tertiary_veins + island_spine_veins + fine_capillaries + sanctuary_cores + nexus_nodes)
        * zyb_suppress
        * land_mask2.astype(np.float32),
        0.0,
        1.25,
    )
    lifestream_halo = artery_aura * zyb_suppress * land_mask2.astype(np.float32)
    night += lerp_rgb(rgb(0.04, 0.68, 0.62), rgb(0.42, 1.00, 0.90), np.clip(lifestream_core, 0.0, 1.0)) * lifestream_core[..., None]
    night += rgb(0.03, 0.46, 0.48)[None, None, :] * lifestream_halo[..., None]

    # Crescent Moon Sea (`Hồ Bán Nguyệt`) — 4 gossamer bioluminescent crescent barrier ripples (ZERO bullseye!)
    ward_rings_2k = downsample_2x(ward_rings_4k)
    shoal_glow_2k = downsample_2x(cres_shoal4) * smoothstep(0.64, 0.92, capillary_fine) * 0.28
    night += rgb(0.12, 0.86, 0.90)[None, None, :] * (ward_rings_2k * 0.58 + shoal_glow_2k)[..., None]

    # Zyberon Pentagonal Bastion & Sacred `王` (`Vương`) Siphon Web (`19.5°N, 24.8°E`)
    zx2 = (lng2 - 24.8) * cos_zyb
    zy2 = lat2 - 19.5
    zr2 = np.hypot(zx2, zy2)
    zang2 = np.arctan2(zy2, zx2)
    sec2 = ((zang2 + math.pi / 2.0) % (2.0 * math.pi / 5.0)) - (math.pi / 5.0)
    pent2 = zr2 * np.cos(sec2) / math.cos(math.pi / 5.0)
    pent_glow = np.exp(-(((pent2 - 1.32) / 0.085) ** 2)) + np.exp(-(((pent2 - 0.68) / 0.070) ** 2)) * 0.92

    in_box_x = smoothstep(0.78, 0.58, np.abs(zx2))
    in_box_y = smoothstep(0.86, 0.64, np.abs(zy2))
    wang_glyph = np.clip(
        np.exp(-(((zy2 - 0.54) / 0.070) ** 2)) * in_box_x
        + np.exp(-((zy2 / 0.065) ** 2)) * smoothstep(0.62, 0.44, np.abs(zx2))
        + np.exp(-(((zy2 + 0.54) / 0.070) ** 2)) * smoothstep(0.88, 0.64, np.abs(zx2))
        + np.exp(-((zx2 / 0.070) ** 2)) * in_box_y,
        0.0,
        1.25,
    )
    siphon_threads = (smoothstep(0.68, 0.94, vein_branch) ** 2.0) * smoothstep(9.5, 0.8, zr2) * 0.78
    nilanda_towns = smoothstep(3.2, 0.10, behadona_d) * smoothstep(0.68, 0.94, fbm3(x2, y2, z2, freq=64.0, octaves=2, seed=557)) * land_mask2.astype(np.float32) * 0.85

    night += rgb(1.00, 0.36, 0.12)[None, None, :] * (pent_glow * 0.98 + siphon_threads)[..., None]
    night += rgb(1.00, 0.80, 0.30)[None, None, :] * (wang_glyph * 1.12 + nilanda_towns)[..., None]

    # Tabaoki razor-thin volcanic obsidian fissures + delicate coral shore bioluminescence
    tabaoki_embers = smoothstep(3.6, 0.3, tabaoki_arc_d) * (smoothstep(0.78, 0.97, vein_branch) ** 2.4) * land_mask2.astype(np.float32) * 0.72
    night += rgb(1.00, 0.30, 0.08)[None, None, :] * tabaoki_embers[..., None]

    shore_sparkle = (
        (reef_shelf_2k > 0.25).astype(np.float32)
        * smoothstep(0.012, 0.001, np.abs(elev2 - SEA_LEVEL_NORM))
        * (smoothstep(0.66, 0.94, capillary_fine) ** 1.8)
        * 0.58
    )
    night += rgb(0.14, 0.90, 0.84)[None, None, :] * shore_sparkle[..., None]

    Image.fromarray(np.clip(np.round(np.clip(night, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8), mode="RGB").save(
        DATA_DIR / "akunalia-night.jpg", quality=93, subsampling=0
    )

    # 8. Swirling Cloud Deck (`2048x1024`)
    print("[Akunalia] Synthesizing Advected Cloud Deck...")
    ak_clouds = synthesize_cloud_deck(
        DATA_W,
        DATA_H,
        seed=601,
        clear_windows=[
            (47.5, 18.5, 16.5),
            (19.5, 24.8, 15.5),
            (8.2, 46.8, 18.5),
            (26.5, -80.5, 18.5),
            (10.8, 114.2, 15.0),
        ],
        cyclones=[
            (24.0, -34.0, 16.0, 1.0),
            (-22.0, 82.0, 17.5, -1.0),
            (36.0, 152.0, 14.5, 1.0),
        ],
    )
    Image.fromarray(np.clip(np.round(ak_clouds * 255.0), 0, 255).astype(np.uint8), mode="L").save(
        DATA_DIR / "akunalia-clouds-2k.jpg", quality=91
    )

    # 9. Canon Region GeoJSON
    ak_regions_features = [
        {
            "type": "Feature",
            "properties": {
                "region": "tabaoki-nilanda",
                "name": "Tabaoki · Đại Giang Behadona · Nilanda",
                "color": "#38bdf8",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(2, 54), (36, 53), (39, 31), (34, 15), (14, 24), (3, 38)], iterations=2)],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "region": "zyberon-basin",
                "name": "Kinh Đô & Đại Đền Ngũ Giác Zyberon",
                "color": "#f59e0b",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(15, 27), (33, 27), (35, 13), (22, 10), (13, 16)], iterations=2)],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "region": "crescent-sea",
                "name": "Nội Hải Hồ Bán Nguyệt",
                "color": "#14b8a6",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(35, 22), (57, 23), (62, 8), (55, -5), (36, -3), (42, 10)], iterations=2)],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "region": "eldarin-highlands",
                "name": "Cao Nguyên Khởi Nguyên Eldarin",
                "color": "#34d399",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(-106, 42), (-60, 44), (-55, 16), (-78, 6), (-104, 14)], iterations=2)],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "region": "sky-archipelago",
                "name": "Quần Đảo Vân Cảnh & Rạn Ngọc Phương Đông",
                "color": "#a78bfa",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(96, 26), (136, 21), (151, -22), (112, -20), (96, 2)], iterations=2)],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "region": "southern-wilds",
                "name": "Đại Hoang Nguyên Phương Nam",
                "color": "#fb7185",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [chaikin_smooth_polygon([(6, 6), (34, 4), (38, -28), (16, -35), (2, -18)], iterations=2)],
            },
        },
    ]
    ak_geo_fc = {"type": "FeatureCollection", "features": ak_regions_features}
    REGIONS_GEOJSON_PATH.write_text(json.dumps(ak_geo_fc, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "akunalia-regions.geojson").write_text(json.dumps(ak_geo_fc, ensure_ascii=False), encoding="utf-8")

    land_ratio = float(np.mean(land_mask2))
    cloud_mean = float(np.mean(ak_clouds))
    print(f"[Akunalia] Done in {time.perf_counter() - t0:.1f}s | land={land_ratio:.3f} | cloud_mean={cloud_mean:.3f}")
    return {"land_ratio": land_ratio, "cloud_mean": cloud_mean}


# ═══════════════════════════════════════════════════════════════════════════════
# 4. MULTI-ERA EARTH — True 4K NASA Blue Marble & Black Marble Synthesizer
# ═══════════════════════════════════════════════════════════════════════════════


def rasterize_earth_land_4k() -> tuple[np.ndarray, list[list[list[float]]]]:
    """
    Rasterize Catmull-Rom interpolated sub-degree continental & island contours at
    `8192x4096` (2x supersampled 4K) with tight anti-aliased shoreline ramp (`radius=1.6`)
    so every peninsula, island, gulf, and strait stays razor-sharp!
    """
    sw, sh = ALBEDO_W * 2, ALBEDO_H * 2
    canvas = Image.new("L", (sw, sh), 0)
    draw = ImageDraw.Draw(canvas)

    geojson_polys: list[list[list[float]]] = []

    def to_px(lng_lat_pts: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
        return [((lng + 180.0) / 360.0 * sw, (90.0 - lat) / 180.0 * sh) for lng, lat in lng_lat_pts]

    for poly in EARTH_LAND_CONTOURS:
        is_antarctica = any(lat <= -88.0 for _, lat in poly)
        if is_antarctica:
            north_pts = [pt for pt in poly if pt[1] > -88.0]
            hi_pts = catmull_rom_subdivide(north_pts, samples_per_seg=4, closed=False) + [(180.0, -90.0), (-180.0, -90.0)]
            geo_pts = catmull_rom_subdivide(north_pts, samples_per_seg=2, closed=False) + [(180.0, -90.0), (-180.0, -90.0)]
        else:
            hi_pts = catmull_rom_subdivide(poly, samples_per_seg=4, closed=True)
            geo_pts = catmull_rom_subdivide(poly, samples_per_seg=2, closed=True)
        draw.polygon(to_px(hi_pts), fill=255)

        closed_ring = [[round(lng, 3), round(lat, 3)] for lng, lat in geo_pts]
        if closed_ring and closed_ring[0] != closed_ring[-1]:
            closed_ring.append(closed_ring[0])
        geojson_polys.append([closed_ring])

    for hole in EARTH_WATER_CUTOUTS:
        hi_hole = catmull_rom_subdivide(hole, samples_per_seg=4, closed=True)
        draw.polygon(to_px(hi_hole), fill=0)

    # Crisp 8K anti-aliasing + gentle 2.0px coastal ramp so micro-rias sculpt natural shores without rounding capes!
    soft = canvas.filter(ImageFilter.GaussianBlur(radius=2.2)).resize(
        (ALBEDO_W, ALBEDO_H), resample=Image.Resampling.BILINEAR
    )
    base_ramp4 = np.asarray(soft, dtype=np.float32) / 255.0
    return base_ramp4, geojson_polys


def generate_earth() -> dict[str, float]:
    t0 = time.perf_counter()
    print("[Earth] Rasterizing 8K->4K Catmull-Rom coastlines & tectonic mountain/basin fields...")
    lat2, lng2, x2, y2, z2 = make_sphere_grid(DATA_W, DATA_H)
    lat4, lng4, x4, y4, z4 = make_sphere_grid(ALBEDO_W, ALBEDO_H)

    base_ramp4, geojson_polys = rasterize_earth_land_4k()

    # Fine-scale ria/fjord micro-coastal detail ONLY right on the 4K shoreline edge (preserves real geography 100%!)
    coast_fine4 = fbm3(x4, y4, z4, freq=52.0, octaves=3, seed=701) - 0.5
    coast_micro4 = fbm3(x4, y4, z4, freq=110.0, octaves=2, seed=733) - 0.5
    shore_band4 = np.clip(base_ramp4 * (1.0 - base_ramp4) * 4.0, 0.0, 1.0)
    fjord_lat4 = 0.55 + 1.05 * smoothstep(46.0, 68.0, np.abs(lat4))
    coastal_signed4 = (base_ramp4 - 0.49) + shore_band4 * (coast_fine4 * 0.20 + coast_micro4 * 0.12) * fjord_lat4
    land4 = coastal_signed4 > 0.0

    # Domain-warped Tectonic Mountain Belts & Plateaus at 2K (broad piedmonts + narrow crest zones, ZERO sausage tubes!)
    mw_lat = (fbm3(x2, y2, z2, freq=7.5, octaves=4, seed=743) - 0.5) * 2.4
    mw_lng = (fbm3(x2, y2, z2, freq=7.5, octaves=4, seed=757) - 0.5) * 3.0
    mlat = lat2 + mw_lat
    mlng = lng2 + mw_lng

    himalaya_d = polyline_dist_deg(mlat, mlng, [(35.2, 72.5), (32.2, 76.8), (29.2, 82.5), (27.8, 88.5), (28.5, 95.5), (26.0, 98.5)])
    karakoram_pamir_d = polyline_dist_deg(mlat, mlng, [(34.5, 68.5), (36.8, 73.2), (38.5, 75.5), (35.8, 78.2)])
    kunlun_tianshan_d = np.minimum.reduce(
        [
            polyline_dist_deg(mlat, mlng, [(36.2, 76.5), (36.0, 84.5), (36.5, 93.5), (38.0, 99.5)]),
            polyline_dist_deg(mlat, mlng, [(40.2, 71.5), (42.2, 78.5), (43.2, 86.5), (43.0, 92.5)]),
            polyline_dist_deg(mlat, mlng, [(49.0, 86.5), (47.2, 92.5), (45.2, 98.5)]),  # Altai
        ]
    )
    tibet_ell = rotated_elliptical_dist(mlat, mlng, 33.0, 87.5, 11.5, 4.6, -6.0)
    zagros_caucasus_d = np.minimum.reduce(
        [
            polyline_dist_deg(mlat, mlng, [(38.5, 43.5), (34.5, 47.5), (30.2, 52.5), (27.2, 56.8)]),
            polyline_dist_deg(mlat, mlng, [(43.6, 40.2), (42.2, 44.8), (40.8, 48.5)]),
            polyline_dist_deg(mlat, mlng, [(39.8, 30.5), (39.5, 36.5), (39.2, 42.5)]),  # Anatolian
        ]
    )
    alps_euro_d = np.minimum.reduce(
        [
            polyline_dist_deg(mlat, mlng, [(44.2, 6.2), (46.2, 9.8), (47.2, 13.8), (47.5, 15.8)]),
            polyline_dist_deg(mlat, mlng, [(42.8, -1.8), (42.5, 2.4)]),
            polyline_dist_deg(mlat, mlng, [(44.0, 10.5), (42.2, 13.5), (40.0, 16.0)]),  # Apennines
            polyline_dist_deg(mlat, mlng, [(48.8, 19.5), (47.2, 24.5), (45.4, 25.5), (44.6, 22.5)]),  # Carpathians
            polyline_dist_deg(mlat, mlng, [(60.2, 6.8), (64.5, 13.2), (68.5, 18.5)]),  # Scandes
        ]
    )
    andes_d = polyline_dist_deg(
        mlat, mlng, [(9.5, -74.5), (2.0, -77.5), (-8.5, -77.5), (-16.5, -69.5), (-24.5, -68.2), (-33.5, -70.2), (-43.5, -72.2), (-51.5, -73.0)]
    )
    rockies_west_d = np.minimum.reduce(
        [
            polyline_dist_deg(mlat, mlng, [(63.2, -150.5), (60.5, -138.5), (53.5, -120.5), (44.5, -110.5), (38.5, -106.2), (28.5, -105.5), (19.5, -99.2)]),
            polyline_dist_deg(mlat, mlng, [(48.5, -121.5), (41.5, -122.2), (36.5, -118.5), (34.0, -117.0)]),
            polyline_dist_deg(mlat, mlng, [(36.5, -82.5), (40.5, -78.0), (44.2, -71.5)]),  # Appalachians
        ]
    )
    africa_arabia_mtn_d = np.minimum.reduce(
        [
            angular_dist_deg(mlat, mlng, 9.8, 39.0) * 0.75,  # Ethiopian Highlands
            polyline_dist_deg(mlat, mlng, [(1.5, 30.0), (-3.1, 37.3), (-9.5, 34.0)]),
            polyline_dist_deg(mlat, mlng, [(-29.5, 29.2), (-32.5, 26.5)]),  # Drakensberg
            polyline_dist_deg(mlat, mlng, [(30.8, -8.5), (33.5, -3.5), (35.8, 4.5)]),  # Atlas
            polyline_dist_deg(mlat, mlng, [(21.5, 40.5), (17.5, 43.2), (14.2, 44.2)]),  # Asir/Yemen
        ]
    )
    east_asia_mtn_d = np.minimum.reduce(
        [
            polyline_dist_deg(mlat, mlng, [(22.5, 102.5), (17.5, 106.2), (12.2, 108.4)]),  # Trường Sơn
            polyline_dist_deg(mlat, mlng, [(35.4, 136.8), (36.6, 138.2), (39.5, 140.8)]),  # Japanese Alps
            polyline_dist_deg(mlat, mlng, [(54.0, 136.0), (61.5, 145.0), (66.0, 158.0)]),  # East Siberia
            polyline_dist_deg(mlat, mlng, [(-4.0, 136.5), (-5.8, 143.5), (-8.5, 147.5)]),  # New Guinea
            polyline_dist_deg(mlat, mlng, [(-26.5, 152.2), (-33.5, 150.2), (-37.0, 148.2)]),  # Great Dividing
        ]
    )
    urals_d = polyline_dist_deg(mlat, mlng, [(66.5, 60.5), (58.5, 59.2), (52.0, 58.2)])

    # Broad regional uplift + narrow crest potential (eliminates cylindrical tube rings!)
    earth_piedmont2 = (
        smoothstep(9.5, 1.2, himalaya_d) * 0.22
        + smoothstep(1.35, 0.35, tibet_ell) * 0.32
        + smoothstep(8.0, 1.0, karakoram_pamir_d) * 0.20
        + smoothstep(7.5, 1.0, kunlun_tianshan_d) * 0.15
        + smoothstep(7.5, 1.0, zagros_caucasus_d) * 0.14
        + smoothstep(6.5, 0.8, alps_euro_d) * 0.12
        + smoothstep(7.5, 0.9, andes_d) * 0.18
        + smoothstep(11.0, 1.5, rockies_west_d) * 0.18
        + smoothstep(8.0, 1.2, africa_arabia_mtn_d) * 0.14
        + smoothstep(6.0, 0.8, east_asia_mtn_d) * 0.10
        + smoothstep(6.0, 1.0, urals_d) * 0.08
    )
    earth_crest2 = (
        smoothstep(3.2, 0.30, himalaya_d) * 0.48
        + smoothstep(3.0, 0.30, karakoram_pamir_d) * 0.42
        + smoothstep(2.8, 0.30, kunlun_tianshan_d) * 0.32
        + smoothstep(2.8, 0.35, zagros_caucasus_d) * 0.25
        + smoothstep(2.4, 0.30, alps_euro_d) * 0.32
        + smoothstep(2.8, 0.30, andes_d) * 0.44
        + smoothstep(3.6, 0.40, rockies_west_d) * 0.30
        + smoothstep(3.2, 0.45, africa_arabia_mtn_d) * 0.18
        + smoothstep(2.4, 0.35, east_asia_mtn_d) * 0.20
    )

    # Major World Rivers (domain-warped meandering channels)
    r_wx = (fbm3(x2, y2, z2, freq=13.0, octaves=4, seed=761) - 0.5) * 1.4
    r_wy = (fbm3(x2, y2, z2, freq=13.0, octaves=4, seed=787) - 0.5) * 1.1
    rlat = lat2 + r_wy
    rlng = lng2 + r_wx

    nile_d = polyline_dist_deg(rlat, rlng, [(0.5, 32.8), (9.5, 31.6), (15.6, 32.5), (19.5, 30.8), (24.1, 32.9), (27.2, 31.2), (30.1, 31.2), (31.3, 30.4), (31.4, 31.8)])
    amazon_d = polyline_dist_deg(rlat, rlng, [(-4.5, -73.5), (-3.5, -65.0), (-3.1, -59.5), (-1.8, -54.0), (-0.5, -49.5)])
    ganges_indus_d = np.minimum(
        polyline_dist_deg(rlat, rlng, [(29.5, 78.0), (26.5, 81.5), (25.2, 87.0), (22.5, 90.2)]),
        polyline_dist_deg(rlat, rlng, [(32.5, 74.0), (28.5, 70.2), (24.5, 68.0)]),
    )
    mekong_yangtze_d = np.minimum.reduce(
        [
            polyline_dist_deg(rlat, rlng, [(24.0, 100.5), (18.0, 103.5), (13.5, 105.8), (10.2, 105.8)]),
            polyline_dist_deg(rlat, rlng, [(29.5, 106.5), (30.5, 114.2), (31.5, 121.0)]),
            polyline_dist_deg(rlat, rlng, [(36.0, 104.0), (35.0, 114.0), (37.6, 118.6)]),
        ]
    )
    mississippi_danube_d = np.minimum.reduce(
        [
            polyline_dist_deg(rlat, rlng, [(44.5, -93.0), (38.6, -90.2), (33.0, -91.0), (29.5, -89.8)]),
            polyline_dist_deg(rlat, rlng, [(48.2, 16.4), (45.2, 20.0), (44.0, 26.0), (45.2, 29.6)]),
            polyline_dist_deg(rlat, rlng, [(36.5, 40.5), (33.3, 44.4), (30.5, 47.8)]),
        ]
    )
    world_rivers_d = np.minimum.reduce([nile_d, amazon_d, ganges_indus_d, mekong_yangtze_d, mississippi_danube_d])

    # Assemble Full 4K Earth Bathymetry & Dendritic Land Relief
    print("[Earth] Synthesizing 4K NASA Blue Marble Albedo & Bathymetry...")
    micro4 = fbm3(x4, y4, z4, freq=46.0, octaves=4, seed=907)
    ridge_crest4 = ridged3(x4, y4, z4, freq=24.0, octaves=5, seed=919)
    fine_ridges4 = ridged3(x4, y4, z4, freq=42.0, octaves=4, seed=923)
    dendritic4 = 0.60 * ridge_crest4 + 0.40 * fine_ridges4

    # Coastal shelf, shallow banks (Sunda, Bahamas, North Sea, Persian Gulf) & Mid-Ocean Tectonic Ridges
    land_blur2 = blur_2d(downsample_2x(land4.astype(np.float32)), 8.5)
    shelf4 = upsample_2d(land_blur2, ALBEDO_W, ALBEDO_H)
    mid_ocean4 = upsample_2d(ridged3(x2, y2, z2, freq=5.2, octaves=4, seed=811), ALBEDO_W, ALBEDO_H)
    shallow_banks4 = np.maximum.reduce(
        [
            smoothstep(1.25, 0.35, rotated_elliptical_dist(lat4, lng4, 24.5, -77.2, 4.2, 2.2, -32.0)),  # Bahamas Bank
            smoothstep(1.25, 0.35, rotated_elliptical_dist(lat4, lng4, -1.5, 108.5, 8.5, 6.2, -20.0)),  # Sunda Shelf
            smoothstep(1.25, 0.35, rotated_elliptical_dist(lat4, lng4, -10.5, 136.5, 7.5, 3.8, -12.0)), # Arafura / Barrier Reef
            smoothstep(1.25, 0.35, rotated_elliptical_dist(lat4, lng4, 55.2, 3.2, 5.2, 3.4, 15.0)),     # North Sea Dogger Bank
        ]
    ) * (~land4).astype(np.float32)
    deep_factor4 = np.clip(1.0 - np.maximum(shelf4 * 1.48, shallow_banks4 * 0.92), 0.0, 1.0)
    earth_bathy4 = SEA_LEVEL_NORM - (0.012 + 0.216 * (deep_factor4**0.80)) + (mid_ocean4**1.5) * 0.032 * deep_factor4

    ice_dome2 = smoothstep(68.0, 82.0, -lat2) * 0.26 + smoothstep(13.5, 3.0, angular_dist_deg(lat2, lng2, 73.5, -41.0)) * 0.24
    piedmont4 = upsample_2d(earth_piedmont2 + ice_dome2, ALBEDO_W, ALBEDO_H)
    crest4 = upsample_2d(earth_crest2, ALBEDO_W, ALBEDO_H)
    rivers_w4 = upsample_2d(smoothstep(0.24, 0.045, world_rivers_d), ALBEDO_W, ALBEDO_H)

    inland4 = np.clip(shelf4 * 1.35 - 0.35, 0.0, 1.0)
    detail_land4 = np.maximum(
        0.004,
        0.014
        + inland4 * 0.050
        + piedmont4 * 0.88
        + crest4 * (0.14 + 1.02 * (dendritic4**1.45))
        + (micro4 - 0.5) * 0.016
        - rivers_w4 * 0.028,
    )
    elev4 = np.where(land4, SEA_LEVEL_NORM + detail_land4 * 0.72, earth_bathy4)
    elev4 = np.clip(elev4, 0.0, 1.0).astype(np.float32)
    land4 = elev4 >= SEA_LEVEL_NORM

    elev2 = downsample_2x(elev4)
    land_mask2 = elev2 >= SEA_LEVEL_NORM
    macro_elev2 = blur_2d(elev2, 1.6)
    cos_lat2 = np.maximum(0.22, np.cos(np.deg2rad(lat2)))
    mgx = (np.roll(macro_elev2, -1, axis=1) - np.roll(macro_elev2, 1, axis=1)) * 0.5 / cos_lat2
    mgy = np.gradient(macro_elev2, axis=0)
    macro_slope2 = np.clip(np.hypot(mgx, mgy) * 40.0, 0.0, 1.0)

    # Subtle 4K fine relief hillshade for authentic NASA Blue Marble orbital crispness
    e_dx4 = np.roll(elev4, -1, axis=1) - np.roll(elev4, 1, axis=1)
    e_dy4 = np.pad(elev4, ((1, 1), (0, 0)), mode="edge")[:-2, :] - np.pad(elev4, ((1, 1), (0, 0)), mode="edge")[2:, :]
    earth_shade4 = np.clip(1.0 + (-e_dx4 * 13.5 + e_dy4 * 9.5), 0.85, 1.14)

    alt4 = np.clip((elev4 - SEA_LEVEL_NORM) / (1.0 - SEA_LEVEL_NORM), 0.0, 1.0)
    abs_lat4 = np.abs(lat4)

    # NASA Blue Marble Ocean Palette (Rich Indigo-Sapphire Abyss -> Mid-Ocean Ridges -> Turquoise Bahamas/Sunda/Mediterranean Shelves)
    sea_depth = np.clip((SEA_LEVEL_NORM - elev4) / SEA_LEVEL_NORM, 0.0, 1.0)
    ocean_col = lerp_rgb(rgb(0.056, 0.215, 0.455), rgb(0.034, 0.142, 0.340), smoothstep(0.15, 0.84, sea_depth))
    ocean_col = lerp_rgb(ocean_col, rgb(0.072, 0.285, 0.515), (mid_ocean4**1.8) * smoothstep(0.78, 0.18, sea_depth) * 0.44)
    ocean_col = lerp_rgb(ocean_col, rgb(0.066, 0.378, 0.552), smoothstep(0.42, 0.050, sea_depth))
    ocean_col = lerp_rgb(ocean_col, rgb(0.110, 0.592, 0.650), smoothstep(0.072, 0.003, sea_depth) * (0.48 + 0.52 * micro4))

    # Domain-Warped Climatic Aridity & Monsoon Moisture Model (fractal jagged basin margins — ZERO circular/oval stamps in Central Asia!)
    clim_warp_lat = upsample_2d(
        (fbm3(x2, y2, z2, freq=5.2, octaves=4, seed=941) - 0.5) * 9.5
        + (ridged3(x2, y2, z2, freq=12.5, octaves=3, seed=947) - 0.5) * 4.8,
        ALBEDO_W,
        ALBEDO_H,
    )
    clim_warp_lng = upsample_2d(
        (fbm3(x2, y2, z2, freq=5.2, octaves=4, seed=953) - 0.5) * 14.5
        + (ridged3(x2, y2, z2, freq=12.5, octaves=3, seed=959) - 0.5) * 6.5,
        ALBEDO_W,
        ALBEDO_H,
    )
    bio_noise = upsample_2d(fbm3(x2, y2, z2, freq=9.5, octaves=4, seed=967), ALBEDO_W, ALBEDO_H)
    ecotone_jag4 = fbm3(x4, y4, z4, freq=22.0, octaves=3, seed=971) - 0.5
    dune4 = ridged3(x4 * 1.4, y4 * 0.8, z4 * 1.4, freq=30.0, octaves=3, seed=929)

    clat = lat4 + clim_warp_lat + ecotone_jag4 * 2.6
    clng = lng4 + clim_warp_lng - ecotone_jag4 * 3.4

    arid_belts = np.maximum.reduce(
        [
            # Sahara-Sahel-Arabia-Iran-Central Asia continuous subtropical & rain-shadow arid belt
            smoothstep(1.25, 0.40, rotated_elliptical_dist(clat, clng, 23.5, 12.0, 31.0, 8.8, -3.0)),
            smoothstep(1.25, 0.40, rotated_elliptical_dist(clat, clng, 23.5, 45.5, 14.5, 8.5, -18.0)),
            smoothstep(1.25, 0.36, rotated_elliptical_dist(clat, clng, 31.5, 57.5, 13.5, 5.8, -20.0)),
            smoothstep(1.25, 0.38, rotated_elliptical_dist(clat, clng, 27.2, 71.0, 5.8, 4.2, 18.0)),
            # Continuous Central Asian steppe-desert corridor (Caspian -> Kyzylkum -> Tarim -> Gobi, broken up by Tian Shan/Altai!)
            smoothstep(1.30, 0.35, rotated_elliptical_dist(clat, clng, 42.8, 63.5, 14.5, 5.4, -10.0)) * 0.86,
            smoothstep(1.25, 0.32, rotated_elliptical_dist(clat * 0.55 + lat4 * 0.45, clng * 0.55 + lng4 * 0.45, 39.2, 83.5, 9.5, 2.8, 5.0)) * 0.92,
            smoothstep(1.30, 0.36, rotated_elliptical_dist(clat, clng, 43.2, 102.5, 15.5, 4.8, -8.0)) * 0.88,
            # Horn of Africa, Namib/Kalahari, Australian Outback, Western US rain-shadow, Atacama/Patagonia
            smoothstep(1.25, 0.40, rotated_elliptical_dist(clat, clng, 8.5, 47.0, 7.5, 5.5, 32.0)),
            smoothstep(1.25, 0.38, rotated_elliptical_dist(clat, clng, -24.0, 19.5, 7.8, 7.5, -12.0)),
            smoothstep(1.28, 0.38, rotated_elliptical_dist(clat, clng, -25.2, 132.5, 15.8, 7.4, -6.0)),
            smoothstep(1.28, 0.36, rotated_elliptical_dist(clat, clng, 35.5, -112.5, 7.2, 10.5, -24.0)) * 0.88,
            smoothstep(1.20, 0.35, rotated_elliptical_dist(lat4 + clim_warp_lat * 0.3, lng4, -22.5, -69.5, 3.2, 9.5, 8.0)),
            smoothstep(1.20, 0.40, rotated_elliptical_dist(clat, clng, -45.5, -68.0, 4.2, 7.5, 10.0)),
        ]
    )
    humid_belts = np.maximum.reduce(
        [
            smoothstep(1.25, 0.35, rotated_elliptical_dist(clat, clng, -3.5, -61.5, 17.5, 10.5, -8.0)),   # Amazonia
            smoothstep(1.25, 0.35, rotated_elliptical_dist(clat, clng, 0.5, 21.5, 12.5, 8.5, 0.0)),       # Congo
            smoothstep(1.25, 0.35, rotated_elliptical_dist(clat, clng, 8.5, 108.5, 22.0, 14.5, -12.0)),   # Nam Bộ / Indochina / Maritime SE Asia
            smoothstep(1.25, 0.38, rotated_elliptical_dist(clat, clng, 21.5, 85.5, 11.5, 8.5, -15.0)),    # Bengal / Monsoon India
            smoothstep(1.25, 0.38, rotated_elliptical_dist(clat, clng, 29.5, 115.5, 13.5, 9.5, 22.0)),    # South China & Japan
            smoothstep(1.25, 0.40, rotated_elliptical_dist(clat, clng, 35.5, -84.5, 13.5, 9.5, 18.0)),    # Eastern North America
            smoothstep(1.25, 0.40, rotated_elliptical_dist(clat, clng, 50.5, 12.5, 18.5, 8.5, 8.0)),      # Temperate Europe
        ]
    )

    nile_w4 = upsample_2d(smoothstep(0.48, 0.09, nile_d), ALBEDO_W, ALBEDO_H) * smoothstep(31.6, 30.2, lat4) + smoothstep(1.85, 0.45, angular_dist_deg(lat4, lng4, 30.95, 31.15)) * smoothstep(29.9, 30.3, lat4)
    nile_oasis = np.clip(nile_w4, 0.0, 1.0)

    # Tibetan rain-shadow plateau (warm tawny-ochre steppe north of Himalayan crest, lush green south of crest!)
    tibet_arid4 = upsample_2d(smoothstep(1.25, 0.38, tibet_ell), ALBEDO_W, ALBEDO_H) * smoothstep(28.4, 31.2, lat4 + (bio_noise - 0.5) * 1.8)

    moisture4 = np.clip(
        0.46
        + (bio_noise - 0.5) * 0.34
        + ecotone_jag4 * 0.14
        + np.exp(-((abs_lat4 / 12.5) ** 2)) * 0.34
        + humid_belts * 0.42
        - arid_belts * 0.78
        - tibet_arid4 * 0.56
        + nile_oasis * 0.96,
        0.0,
        1.0,
    )

    c_desert_gold = rgb(0.815, 0.675, 0.465)
    c_desert_terracotta = rgb(0.702, 0.515, 0.352)
    c_dry_steppe = rgb(0.542, 0.495, 0.312)
    c_temperate_green = rgb(0.202, 0.378, 0.155)
    c_tropical_jungle = rgb(0.078, 0.262, 0.108)
    c_taiga = rgb(0.105, 0.224, 0.128)
    c_tundra = rgb(0.385, 0.382, 0.298)
    c_snow_ice = rgb(0.948, 0.966, 0.990)

    desert_col = lerp_rgb(c_desert_terracotta, c_desert_gold, 0.30 + 0.70 * dune4)
    outback_w = smoothstep(1.25, 0.35, rotated_elliptical_dist(clat, clng, -25.2, 132.5, 14.5, 6.8, -6.0))
    desert_col = lerp_rgb(desert_col, rgb(0.695, 0.382, 0.242), outback_w * 0.65)

    veg_col = lerp_rgb(desert_col, c_dry_steppe, smoothstep(0.16, 0.36, moisture4))
    veg_col = lerp_rgb(veg_col, c_temperate_green, smoothstep(0.34, 0.58, moisture4))
    veg_col = lerp_rgb(veg_col, c_tropical_jungle, smoothstep(0.58, 0.84, moisture4))
    veg_col *= (0.86 + 0.28 * micro4)[..., None]

    # Boreal Taiga & Arctic/Alpine Tundra (natural elevation-latitude ecotone — ZERO grey caterpillar collars!)
    eff_lat = abs_lat4 + alt4 * 26.0 + (bio_noise - 0.5) * 7.5
    taiga_w = smoothstep(48.0, 60.0, eff_lat) * smoothstep(0.24, 0.48, moisture4)
    tundra_w = smoothstep(63.0, 73.0, eff_lat)
    veg_col = lerp_rgb(veg_col, c_taiga * (0.85 + 0.30 * micro4)[..., None], taiga_w * 0.80)
    veg_col = lerp_rgb(veg_col, c_tundra * (0.86 + 0.28 * micro4)[..., None], tundra_w * 0.82)

    # Warm Satellite Arid Cordillera & Tibetan Plateau Steppe-Rock (true NASA Blue Marble tawny Tibet!)
    tibet_col = lerp_rgb(rgb(0.54, 0.43, 0.32), rgb(0.68, 0.56, 0.42), ridge_crest4) * (0.86 + 0.28 * micro4)[..., None]
    veg_col = lerp_rgb(veg_col, tibet_col, tibet_arid4 * 0.84)

    alpine_arête = smoothstep(0.50, 0.86, dendritic4) * smoothstep(0.18, 0.46, alt4)
    alpine_rock_col = lerp_rgb(rgb(0.42, 0.39, 0.34), rgb(0.57, 0.48, 0.38), 1.0 - moisture4)
    veg_col = lerp_rgb(veg_col, alpine_rock_col * (0.82 + 0.34 * fine_ridges4)[..., None], alpine_arête * 0.82)

    # Dendritic Mountain Snow Spines & Polar Ice Sheets (snow strictly follows high mountain crests — Tibet interior stays tawny rock!)
    crest_only4 = smoothstep(0.08, 0.32, crest4)
    crest_alt4 = alt4 * (0.28 + 0.94 * (ridge_crest4**1.65)) * (0.45 + 0.55 * crest_only4) - tibet_arid4 * (1.0 - crest_only4) * 0.24
    snow_line = 0.50 - 0.14 * smoothstep(42.0, 68.0, abs_lat4) - (micro4 - 0.5) * 0.04
    mtn_snow = smoothstep(snow_line, snow_line + 0.10, crest_alt4) * (1.0 - smoothstep(0.75, 0.96, fine_ridges4) * 0.35)
    ice_sheets = np.maximum(
        smoothstep(63.5, 71.0, -lat4 + (bio_noise - 0.5) * 3.5),
        smoothstep(11.8, 4.5, angular_dist_deg(lat4, lng4, 73.5, -41.5) + (bio_noise - 0.5) * 2.5) * smoothstep(61.5, 65.5, lat4),
    )
    snow_all = np.maximum(mtn_snow, ice_sheets)
    shaded_earth_snow = lerp_rgb(rgb(0.78, 0.85, 0.93), c_snow_ice, smoothstep(0.88, 1.08, earth_shade4))
    veg_col = lerp_rgb(veg_col, shaded_earth_snow * (0.94 + 0.06 * micro4)[..., None], snow_all)
    veg_col *= earth_shade4[..., None]

    # Major World River Channels
    veg_col = lerp_rgb(veg_col, rgb(0.052, 0.275, 0.405), rivers_w4 * (1.0 - snow_all) * 0.68)

    earth_albedo = np.where(land4[..., None], np.clip(veg_col, 0.0, 1.0), ocean_col)
    arctic_pack_ice = (~land4).astype(np.float32) * smoothstep(78.0, 85.5, abs_lat4 + (bio_noise - 0.5) * 5.5)
    earth_albedo = lerp_rgb(earth_albedo, rgb(0.88, 0.93, 0.97), arctic_pack_ice * 0.84)

    Image.fromarray(np.clip(np.round(earth_albedo * 255.0), 0, 255).astype(np.uint8), mode="RGB").save(
        DATA_DIR / "earth-albedo-4k.jpg", quality=94, subsampling=0
    )

    earth_river_spec2 = (
        smoothstep(0.22, 0.04, world_rivers_d)
        * (1.0 - downsample_2x(snow_all))
        * 0.80
    )
    earth_ocean_liquid2 = (1.0 - downsample_2x(arctic_pack_ice)) * 0.90
    spec2 = np.where(
        land_mask2,
        earth_river_spec2,
        np.where(earth_ocean_liquid2 > 0.52, earth_ocean_liquid2, 0.0),
    )
    save_elevation_and_normal_maps(
        elev2,
        land_mask2,
        spec2,
        DATA_DIR / "earth-elevation-sdf.png",
        DATA_DIR / "earth-normal-spec.png",
        normal_strength=7.4,
    )

    # NASA Black Marble Night Lights + Sinuous Geomagnetic Polar Auroras (`2048x1024`)
    print("[Earth] Synthesizing NASA Black Marble Pinpoint City Webs & Sinuous Auroras...")
    earth_night = np.zeros((DATA_H, DATA_W, 3), dtype=np.float32)
    city_web = ridged3(x2, y2, z2, freq=38.0, octaves=3, seed=977)
    road_filaments = ridged3(x2, y2, z2, freq=68.0, octaves=2, seed=983)
    city_sparks = fbm3(x2, y2, z2, freq=82.0, octaves=2, seed=991)
    town_dots = fbm3(x2, y2, z2, freq=128.0, octaves=2, seed=997)
    fine_beads = smoothstep(0.52, 0.88, city_sparks)

    # 1. Pinpoint Metropolitan Cores + Filamentary Road-Web Sprawl (ZERO giant blurry Gaussian discs!)
    metro_core = np.zeros((DATA_H, DATA_W), dtype=np.float32)
    metro_sprawl = np.zeros((DATA_H, DATA_W), dtype=np.float32)
    for c_lat, c_lng, r_core, r_sprawl, amp in EARTH_METRO_CITIES:
        d = angular_dist_deg(lat2, lng2, c_lat, c_lng)
        metro_core = np.maximum(metro_core, np.exp(-((d / (r_core * 1.18)) ** 2)) * amp)
        metro_sprawl = np.maximum(metro_sprawl, np.exp(-((d / (r_sprawl * 1.45)) ** 2)) * amp)

    # 2. Domain-Warped Beaded Inter-City Corridors (terrain-meandering strings of towns — ZERO straight constellation lines!)
    cw_lat = rlat + (fbm3(x2, y2, z2, freq=26.0, octaves=2, seed=971) - 0.5) * 0.55
    cw_lng = rlng + (fbm3(x2, y2, z2, freq=26.0, octaves=2, seed=973) - 0.5) * 0.70
    corridor_d = np.minimum.reduce([polyline_dist_deg(cw_lat, cw_lng, corr) for corr in EARTH_NIGHT_CORRIDORS])
    corridor_beads = (fine_beads**1.75) * (0.40 + 0.60 * smoothstep(0.45, 0.86, road_filaments))
    corridor_threads = np.exp(-((corridor_d / 0.24) ** 2)) * corridor_beads * 1.05

    # Iconic continuous Nile Valley golden ribbon + lotus delta fan!
    nile_ribbon = (
        np.exp(-((nile_d / 0.17) ** 2)) * smoothstep(22.0, 24.8, lat2) * smoothstep(31.5, 30.1, lat2) * (0.76 + 0.44 * fine_beads)
        + smoothstep(1.65, 0.32, angular_dist_deg(lat2, lng2, 30.88, 31.15)) * smoothstep(29.85, 30.35, lat2) * (0.42 + 0.72 * fine_beads)
    )

    # 3. Authentic Populated-Region Town Constellations (dense pinpoint towns & radial webs, strictly suppressed in deserts/mountains!)
    pop_basins = np.maximum.reduce(
        [
            smoothstep(1.20, 0.28, rotated_elliptical_dist(rlat, rlng, 26.5, 81.8, 9.2, 2.8, -16.0)),   # Indo-Gangetic Plain
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 16.5, 77.2, 4.2, 6.8, -8.0)),    # Deccan & South India
            smoothstep(1.20, 0.28, rotated_elliptical_dist(rlat, rlng, 34.2, 116.5, 5.2, 6.2, 12.0)),   # North China & Yangtze Plain
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 23.2, 113.5, 3.6, 2.2, 18.0)),   # Pearl River / South China
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, 30.2, 105.5, 2.8, 2.4, 10.0)),   # Sichuan Basin
            smoothstep(1.20, 0.28, rotated_elliptical_dist(rlat, rlng, 35.6, 136.5, 4.8, 2.2, 28.0)),   # Honshu Tokaido Belt
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 36.2, 127.6, 1.8, 2.4, -15.0)),  # South Korea
            smoothstep(1.20, 0.28, rotated_elliptical_dist(rlat, rlng, 50.2, 7.8, 10.5, 5.2, 10.0)),    # Western/Central Europe
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 44.8, 10.8, 3.8, 1.8, -18.0)),   # Po Valley & Italy
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, 52.6, -1.5, 2.2, 3.2, -12.0)),   # England
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 39.2, -80.5, 10.2, 6.2, 24.0)),  # US East & Great Lakes
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, 31.2, -96.5, 3.8, 3.2, 15.0)),   # Texas Triangle
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, 35.8, -119.5, 2.2, 4.2, -32.0)), # California
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, 19.8, -100.5, 3.6, 1.8, -18.0)), # Central Mexico
            smoothstep(1.20, 0.32, rotated_elliptical_dist(rlat, rlng, -22.8, -45.5, 4.2, 2.4, 28.0)),  # São Paulo - Rio
            smoothstep(1.20, 0.28, rotated_elliptical_dist(rlat, rlng, -7.0, 110.0, 4.5, 1.3, -8.0)),   # Java
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 20.8, 106.0, 1.6, 1.2, -20.0)),  # Red River Delta (Hà Nội)
            smoothstep(1.20, 0.30, rotated_elliptical_dist(rlat, rlng, 10.4, 106.1, 2.0, 1.5, 22.0)),   # Sài Gòn & Mekong Delta
        ]
    )
    high_alt_suppress2 = 1.0 - smoothstep(0.32, 0.55, downsample_2x(alt4))
    town_stipple = (
        pop_basins
        * high_alt_suppress2
        * (
            (smoothstep(0.58, 0.89, town_dots) ** 1.85) * 0.78
            + (smoothstep(0.64, 0.92, city_web) ** 2.0) * (0.38 + 0.62 * fine_beads) * 0.68
        )
    )

    sprawl_filaments = metro_sprawl * (
        (smoothstep(0.55, 0.89, city_web) ** 1.7) * 0.72
        + (smoothstep(0.57, 0.89, road_filaments) ** 1.75) * 0.56
        + (smoothstep(0.55, 0.87, town_dots) ** 1.75) * 0.52
    )
    city_total = np.clip(
        (metro_core * 1.12 + sprawl_filaments * 0.88 + corridor_threads * 0.82 + nile_ribbon + town_stipple)
        * land_mask2.astype(np.float32),
        0.0,
        1.25,
    )
    city_col = lerp_rgb(rgb(0.98, 0.58, 0.18), rgb(1.00, 0.91, 0.68), np.clip(metro_core * 0.82 + town_stipple * 0.25, 0.0, 1.0))
    earth_night += city_col * np.clip(city_total, 0.0, 1.0)[..., None]

    # Sinuous Geomagnetic Polar Auroral Curtains (flowing fBm ribbons, ZERO periodic `sin(28*az)` stripes!)
    aw1 = (fbm3(x2, y2, z2, freq=3.6, octaves=4, seed=1013) - 0.5) * 6.8
    aw2 = (fbm3(x2, y2, z2, freq=8.5, octaves=3, seed=1021) - 0.5) * 2.8
    d_mag_n = angular_dist_deg(lat2, lng2, 80.5, -72.0) + aw1 + aw2
    d_mag_s = angular_dist_deg(lat2, lng2, -80.5, 108.0) - aw1 + aw2

    flow_mod = smoothstep(0.28, 0.82, fbm3(x2 * 1.4, y2 * 0.8, z2 * 1.4, freq=5.5, octaves=4, seed=1039))
    wisp_mod = 0.55 + 0.45 * ridged3(x2, y2, z2, freq=14.0, octaves=3, seed=1051)

    oval_n = (np.exp(-(((d_mag_n - 21.0) / 2.2) ** 2)) + np.exp(-(((d_mag_n - 18.2) / 1.4) ** 2)) * 0.55) * flow_mod * wisp_mod
    oval_s = (np.exp(-(((d_mag_s - 21.0) / 2.3) ** 2)) + np.exp(-(((d_mag_s - 18.2) / 1.5) ** 2)) * 0.55) * flow_mod * wisp_mod
    aurora_green = (oval_n + oval_s) * 0.78
    aurora_violet = (
        np.exp(-(((d_mag_n - 23.2) / 2.4) ** 2)) + np.exp(-(((d_mag_s - 23.2) / 2.4) ** 2))
    ) * flow_mod * 0.30
    earth_night += rgb(0.12, 0.95, 0.54)[None, None, :] * aurora_green[..., None]
    earth_night += rgb(0.58, 0.22, 0.88)[None, None, :] * aurora_violet[..., None]

    Image.fromarray(np.clip(np.round(np.clip(earth_night, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8), mode="RGB").save(
        DATA_DIR / "earth-night.jpg", quality=93, subsampling=0
    )

    # Swirling Earth Cloud Deck (`2048x1024`)
    print("[Earth] Synthesizing Advected Cloud Deck...")
    earth_clouds = synthesize_cloud_deck(
        DATA_W,
        DATA_H,
        seed=1103,
        clear_windows=[
            (29.8, 31.2, 16.5),
            (39.0, 22.5, 14.5),
            (53.0, -3.0, 11.5),
            (27.5, 81.5, 15.0),
            (11.4, 107.4, 14.5),
            (35.5, 136.5, 13.5),
        ],
        cyclones=[
            (23.0, 148.0, 15.0, 1.0),
            (26.0, -64.0, 14.0, 1.0),
            (-24.0, 74.0, 15.5, -1.0),
        ],
    )
    Image.fromarray(np.clip(np.round(earth_clouds * 255.0), 0, 255).astype(np.uint8), mode="L").save(
        DATA_DIR / "earth-clouds-2k.jpg", quality=91
    )

    earth_cont_fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"region": "earth-landmass", "name": "Multi-Era Earth Continents"},
                "geometry": {"type": "MultiPolygon", "coordinates": geojson_polys},
            }
        ],
    }
    (DATA_DIR / "earth-continents.geojson").write_text(json.dumps(earth_cont_fc, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "earth-regions.geojson").write_text(json.dumps(earth_cont_fc, ensure_ascii=False), encoding="utf-8")

    land_ratio = float(np.mean(land_mask2))
    cloud_mean = float(np.mean(earth_clouds))
    print(f"[Earth] Done in {time.perf_counter() - t0:.1f}s | land={land_ratio:.3f} | cloud_mean={cloud_mean:.3f}")
    return {"land_ratio": land_ratio, "cloud_mean": cloud_mean}


def write_manifest() -> None:
    manifest = {
        "version": 2,
        "generator": "scripts/generate_aaa_planets.py",
        "seaLevelNormalized": SEA_LEVEL_NORM,
        "albedoResolution": [ALBEDO_W, ALBEDO_H],
        "dataResolution": [DATA_W, DATA_H],
        "planets": {
            "akunalia": {
                "albedo": "akunalia-albedo-4k.jpg",
                "elevationSdf": "akunalia-elevation-sdf.png",
                "normalSpec": "akunalia-normal-spec.png",
                "night": "akunalia-night.jpg",
                "clouds": "akunalia-clouds-2k.jpg",
                "regionsGeojson": "akunalia-regions.geojson",
            },
            "earth": {
                "albedo": "earth-albedo-4k.jpg",
                "elevationSdf": "earth-elevation-sdf.png",
                "normalSpec": "earth-normal-spec.png",
                "night": "earth-night.jpg",
                "clouds": "earth-clouds-2k.jpg",
                "continentsGeojson": "earth-continents.geojson",
                "regionsGeojson": "earth-regions.geojson",
            },
        },
    }
    (DATA_DIR / "world-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ak_stats = generate_akunalia()
    ea_stats = generate_earth()
    write_manifest()
    print("✓ All AAA planetary textures & GeoJSON synthesized:", {"akunalia": ak_stats, "earth": ea_stats})


if __name__ == "__main__":
    main()
