import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions, Image, Platform } from 'react-native';

interface GrainOverlayProps {
    opacity?: number;
}

// Generate a base64 PNG noise texture at runtime (64x64 tiled)
function generateNoiseBase64(size: number = 64): string {
    // Build raw RGBA pixel data
    const pixels: number[] = [];
    for (let i = 0; i < size * size; i++) {
        const v = Math.floor(Math.random() * 255);
        pixels.push(v, v, v, 40); // grayscale with low alpha
    }

    // Build uncompressed PNG manually
    // PNG signature
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];

    // IHDR chunk
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, size); // width
    ihdrView.setUint32(4, size); // height
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter method
    ihdr[12] = 0; // interlace

    // Raw image data with filter bytes
    const rawData: number[] = [];
    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter: none
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            rawData.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
        }
    }

    // Deflate using simple stored blocks (no compression)
    const deflated = deflateStored(new Uint8Array(rawData));

    // CRC32
    function crc32(data: Uint8Array): number {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function makeChunk(type: string, data: Uint8Array): number[] {
        const typeBytes = type.split('').map(c => c.charCodeAt(0));
        const combined = new Uint8Array(typeBytes.length + data.length);
        combined.set(typeBytes);
        combined.set(data, typeBytes.length);
        const crc = crc32(combined);

        const result: number[] = [];
        // Length (4 bytes big-endian)
        result.push((data.length >> 24) & 0xFF, (data.length >> 16) & 0xFF, (data.length >> 8) & 0xFF, data.length & 0xFF);
        // Type + Data
        for (let i = 0; i < combined.length; i++) result.push(combined[i]);
        // CRC (4 bytes big-endian)
        result.push((crc >> 24) & 0xFF, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF);
        return result;
    }

    const ihdrChunk = makeChunk('IHDR', ihdr);
    const idatChunk = makeChunk('IDAT', deflated);
    const iendChunk = makeChunk('IEND', new Uint8Array(0));

    const png = new Uint8Array([...signature, ...ihdrChunk, ...idatChunk, ...iendChunk]);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < png.length; i++) {
        binary += String.fromCharCode(png[i]);
    }

    // Simple base64 encoder
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < binary.length; i += 3) {
        const a = binary.charCodeAt(i);
        const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
        const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
        b64 += chars[a >> 2];
        b64 += chars[((a & 3) << 4) | (b >> 4)];
        b64 += i + 1 < binary.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
        b64 += i + 2 < binary.length ? chars[c & 63] : '=';
    }

    return `data:image/png;base64,${b64}`;
}

// Simple deflate stored-blocks implementation (no actual compression)
function deflateStored(data: Uint8Array): Uint8Array {
    const MAX_BLOCK = 65535;
    const blocks: number[] = [];

    // Zlib header
    blocks.push(0x78, 0x01); // CMF, FLG (deflate, no dict, fastest)

    for (let offset = 0; offset < data.length; offset += MAX_BLOCK) {
        const remaining = data.length - offset;
        const blockLen = Math.min(remaining, MAX_BLOCK);
        const isLast = offset + blockLen >= data.length;

        blocks.push(isLast ? 0x01 : 0x00); // BFINAL + BTYPE=00 (stored)
        blocks.push(blockLen & 0xFF, (blockLen >> 8) & 0xFF);
        blocks.push((~blockLen) & 0xFF, ((~blockLen) >> 8) & 0xFF);

        for (let i = 0; i < blockLen; i++) {
            blocks.push(data[offset + i]);
        }
    }

    // Adler-32 checksum
    let s1 = 1, s2 = 0;
    for (let i = 0; i < data.length; i++) {
        s1 = (s1 + data[i]) % 65521;
        s2 = (s2 + s1) % 65521;
    }
    const adler = ((s2 << 16) | s1) >>> 0;
    blocks.push((adler >> 24) & 0xFF, (adler >> 16) & 0xFF, (adler >> 8) & 0xFF, adler & 0xFF);

    return new Uint8Array(blocks);
}

/**
 * Renders a subtle film-grain noise overlay using a runtime-generated
 * tiled PNG texture. No external assets or unsupported SVG filters needed.
 */
export default function GrainOverlay({ opacity = 0.4 }: GrainOverlayProps) {
    const [noiseUri, setNoiseUri] = useState<string | null>(null);

    useEffect(() => {
        // Generate once on mount
        setNoiseUri(generateNoiseBase64(64));
    }, []);

    if (!noiseUri) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
            <Image
                source={{ uri: noiseUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="repeat"
            />
        </View>
    );
}
