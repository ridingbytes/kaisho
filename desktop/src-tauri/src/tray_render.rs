//! Pill-style tray icon renderer.
//!
//! Rasterises a small RGBA bitmap with a rounded-rect
//! background and the elapsed-time text baked into the
//! icon. Used for ``active`` / ``long`` / ``offline`` /
//! ``idle`` states; pure black ``idle`` state falls back
//! to the static logo PNG so the menu bar stays calm when
//! no timer is running. (Idle pill is opt-in -- see
//! ``render_pill``.)
//!
//! Returns ``Option<Vec<u8>>`` of a PNG-encoded image so
//! the caller can fall back to the existing static-icon
//! path on any failure (font missing, encode failure,
//! etc.) without breaking the menu bar.

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use image::{ImageBuffer, Rgba, RgbaImage};
use std::io::Cursor;

// Bundled font. The ``scripts/fetch-tray-font.sh`` script
// drops this into ``desktop/src-tauri/fonts/`` so the
// repo doesn't have to commit a 270KB binary blob.
static FONT_BYTES: &[u8] = include_bytes!(
    "../fonts/JetBrainsMono-Bold.ttf",
);

// Render at 2x for retina crispness, then inject a pHYs
// chunk into the PNG so macOS reads the image as @2x and
// treats each pair of pixels as one point. Without the
// pHYs chunk, macOS would read pixels as points and draw
// the icon at double-height, clipping it out of the
// 22pt menubar slot.
const SCALE: u32 = 2;
const HEIGHT_LOGICAL: u32 = 22;
const RADIUS_LOGICAL: u32 = 6;
const PADDING_X_LOGICAL: u32 = 8;
const FONT_PX_LOGICAL: f32 = 14.0;

// State -> background RGBA. Idle is a neutral mid-grey so
// the pill stays legible without screaming for attention.
fn bg_for(state: &str) -> [u8; 4] {
    match state {
        "active"  => [16, 185, 129, 255], // emerald-500
        "long"    => [245, 158, 11, 255], // amber-500
        "offline" => [239, 68, 68, 255],  // red-500
        _         => [120, 120, 120, 255], // idle: grey
    }
}

/// Render ``text`` (e.g. ``"00:21"``) onto a coloured
/// rounded pill and return the PNG bytes. Returns
/// ``None`` if the font fails to load or the PNG fails to
/// encode -- callers should fall back to the existing
/// static-icon code path in that case.
pub fn render_pill(
    state: &str,
    text: &str,
) -> Option<Vec<u8>> {
    let font = FontRef::try_from_slice(FONT_BYTES).ok()?;

    let scale = PxScale::from(FONT_PX_LOGICAL * SCALE as f32);
    let scaled = font.as_scaled(scale);

    // Measure the text width so the pill auto-sizes.
    let text_width_px: f32 = text
        .chars()
        .map(|c| scaled.h_advance(scaled.glyph_id(c)))
        .sum();
    let pad_px = PADDING_X_LOGICAL * SCALE;
    let width = (text_width_px.ceil() as u32) + pad_px * 2;
    let height = HEIGHT_LOGICAL * SCALE;
    let radius = RADIUS_LOGICAL * SCALE;

    let mut img: RgbaImage =
        ImageBuffer::from_pixel(
            width, height, Rgba([0, 0, 0, 0]),
        );

    draw_rounded_rect(&mut img, width, height, radius, bg_for(state));
    draw_text_centered(
        &mut img, &font, scale, text, width, height,
    );

    let mut out = Vec::with_capacity(2048);
    image::DynamicImage::ImageRgba8(img)
        .write_to(
            &mut Cursor::new(&mut out),
            image::ImageFormat::Png,
        )
        .ok()?;
    if SCALE >= 2 {
        out = inject_phys_chunk(out, SCALE as u32);
    }
    Some(out)
}

/// Inject a ``pHYs`` chunk after the IHDR so the PNG
/// declares its pixel density. macOS reads pHYs and
/// treats the bitmap as N-times-DPI (where N matches the
/// scale factor here), so a 2x bitmap renders at 1x
/// logical size with retina detail instead of clipping.
///
/// PNG layout: 8-byte signature | IHDR (25 bytes) | ...
/// We slot the pHYs chunk between IHDR and the next
/// chunk. pHYs payload is (X ppu, Y ppu, unit=1 meter).
/// 2835 ppu = 72 DPI baseline; we multiply by ``scale``.
fn inject_phys_chunk(
    png: Vec<u8>,
    scale: u32,
) -> Vec<u8> {
    if png.len() < 8 + 25 {
        return png;
    }
    let insert_at = 8 + 25;

    let ppu: u32 = 2835u32.saturating_mul(scale);
    let mut chunk_data = Vec::with_capacity(9);
    chunk_data.extend_from_slice(&ppu.to_be_bytes());
    chunk_data.extend_from_slice(&ppu.to_be_bytes());
    chunk_data.push(1); // unit specifier: 1 = meters

    let crc = png_crc(b"pHYs", &chunk_data);

    let mut chunk = Vec::with_capacity(21);
    chunk.extend_from_slice(&(chunk_data.len() as u32).to_be_bytes());
    chunk.extend_from_slice(b"pHYs");
    chunk.extend_from_slice(&chunk_data);
    chunk.extend_from_slice(&crc.to_be_bytes());

    let mut out = Vec::with_capacity(png.len() + chunk.len());
    out.extend_from_slice(&png[..insert_at]);
    out.extend_from_slice(&chunk);
    out.extend_from_slice(&png[insert_at..]);
    out
}

/// CRC-32 over PNG chunk-type + chunk-data per the PNG
/// spec. Polynomial 0xEDB88320 (reflected), initial
/// 0xFFFFFFFF, final XOR with 0xFFFFFFFF.
fn png_crc(chunk_type: &[u8], data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for byte in chunk_type.iter().chain(data.iter()) {
        let mut c = (crc ^ (*byte as u32)) & 0xFF;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
        crc = c ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

/// Fill a rounded-rect with anti-aliased corners.
fn draw_rounded_rect(
    img: &mut RgbaImage,
    w: u32,
    h: u32,
    radius: u32,
    color: [u8; 4],
) {
    let r = radius as i32;
    let w_i = w as i32;
    let h_i = h as i32;
    for y in 0..h_i {
        for x in 0..w_i {
            // Distance from the nearest corner centre.
            let cx = if x < r {
                r
            } else if x > w_i - r - 1 {
                w_i - r - 1
            } else {
                x
            };
            let cy = if y < r {
                r
            } else if y > h_i - r - 1 {
                h_i - r - 1
            } else {
                y
            };
            let dx = (x - cx) as f32;
            let dy = (y - cy) as f32;
            let dist = (dx * dx + dy * dy).sqrt();
            let r_f = r as f32;
            // 1px feather for anti-aliasing.
            let alpha = if dist <= r_f - 1.0 {
                1.0
            } else if dist >= r_f {
                0.0
            } else {
                r_f - dist
            };
            if alpha <= 0.0 {
                continue;
            }
            let a = (color[3] as f32 * alpha) as u8;
            img.put_pixel(
                x as u32,
                y as u32,
                Rgba([color[0], color[1], color[2], a]),
            );
        }
    }
}

/// Rasterise white text centred inside the pill.
fn draw_text_centered(
    img: &mut RgbaImage,
    font: &FontRef,
    scale: PxScale,
    text: &str,
    box_w: u32,
    box_h: u32,
) {
    let scaled = font.as_scaled(scale);
    let ascent = scaled.ascent();
    let descent = scaled.descent();
    let text_h = ascent - descent;
    let text_w: f32 = text
        .chars()
        .map(|c| scaled.h_advance(scaled.glyph_id(c)))
        .sum();
    let mut pen_x =
        (box_w as f32 - text_w) / 2.0;
    // Baseline = top + (box_h - text_h)/2 + ascent.
    let baseline_y =
        (box_h as f32 - text_h) / 2.0 + ascent;

    for c in text.chars() {
        let glyph_id = scaled.glyph_id(c);
        let glyph =
            glyph_id.with_scale_and_position(
                scale,
                ab_glyph::point(pen_x, baseline_y),
            );
        if let Some(g) = font.outline_glyph(glyph) {
            let bb = g.px_bounds();
            g.draw(|gx, gy, coverage| {
                let px = bb.min.x as i32 + gx as i32;
                let py = bb.min.y as i32 + gy as i32;
                if px < 0
                    || py < 0
                    || (px as u32) >= box_w
                    || (py as u32) >= box_h
                {
                    return;
                }
                let pixel = img.get_pixel_mut(
                    px as u32, py as u32,
                );
                let a = (255.0 * coverage) as u8;
                // Alpha-blend white text over the pill.
                pixel.0 = blend_over(pixel.0, [255, 255, 255, a]);
            });
        }
        pen_x += scaled.h_advance(glyph_id);
    }
}

/// Standard "src over dst" alpha compositing.
fn blend_over(dst: [u8; 4], src: [u8; 4]) -> [u8; 4] {
    let sa = src[3] as f32 / 255.0;
    let da = dst[3] as f32 / 255.0;
    let oa = sa + da * (1.0 - sa);
    if oa <= 0.0 {
        return [0, 0, 0, 0];
    }
    let mix = |s: u8, d: u8| -> u8 {
        let s = s as f32;
        let d = d as f32;
        (((s * sa) + (d * da * (1.0 - sa))) / oa) as u8
    };
    [
        mix(src[0], dst[0]),
        mix(src[1], dst[1]),
        mix(src[2], dst[2]),
        (oa * 255.0) as u8,
    ]
}
