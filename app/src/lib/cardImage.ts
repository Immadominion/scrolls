// ─────────────────────────────────────────────────────────────────────
// Scrolls — share card → PNG export
//
// Re-renders the on-screen ShareCard at 1080×1350 using Canvas 2D so
// makers can download a clean image to post on social. We avoid
// `html2canvas` / `dom-to-image` to keep the bundle lean — the visual
// is simple enough to draw by hand and stays pixel-perfect.
// ─────────────────────────────────────────────────────────────────────

export interface CardImageOptions {
    title: string;
    url: string;
    eyebrow?: string;
    isPrivate?: boolean;
    blobId?: string;
    shortCode?: string | null;
    /** A QR canvas (e.g. the offscreen <QRCodeCanvas>) sized for the export.
     *  Pass at least 480×480 for crisp scaling. */
    qrCanvas: HTMLCanvasElement;
}

const CARD_W = 1080;
const CARD_H = 1350;
const PADDING = 64;

export async function renderShareCardPng(opts: CardImageOptions): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");

    // 1. Texture background
    const texture = await loadImage("/receipt-texture.png");
    drawCover(ctx, texture, 0, 0, CARD_W, CARD_H);

    // 2. Vertical tint for legibility
    const tint = ctx.createLinearGradient(0, 0, 0, CARD_H);
    tint.addColorStop(0, "rgba(10,10,10,0.25)");
    tint.addColorStop(0.55, "rgba(10,10,10,0.55)");
    tint.addColorStop(1, "rgba(10,10,10,0.88)");
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // 3. Top row — Scrolls eyebrow + status pill
    const topY = PADDING + 24;
    // Star glyph (drawn via path so we don't depend on font icons)
    drawStar(ctx, PADDING + 14, topY, 18, "#a78bfa");
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 22px Syne, Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText((opts.eyebrow ?? "SCROLLS").toUpperCase(), PADDING + 44, topY);

    // Status pill (right aligned)
    const pillText = opts.isPrivate ? "ENCRYPTED" : "PUBLIC";
    const pillColor = opts.isPrivate ? "#06b6d4" : "rgba(255,255,255,0.85)";
    const pillBg = opts.isPrivate ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.10)";
    const pillRing = opts.isPrivate ? "rgba(6,182,212,0.35)" : "rgba(255,255,255,0.18)";
    ctx.font = "600 20px Inter, system-ui, sans-serif";
    const pillPad = 18;
    const pillW = Math.ceil(ctx.measureText(pillText).width) + pillPad * 2;
    const pillH = 36;
    const pillX = CARD_W - PADDING - pillW;
    const pillY = topY - pillH / 2;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = pillBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pillRing;
    ctx.stroke();
    ctx.fillStyle = pillColor;
    ctx.textAlign = "center";
    ctx.fillText(pillText, pillX + pillW / 2, topY);
    ctx.textAlign = "left";

    // 4. Title block (mid)
    const eyebrowY = topY + 160;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "500 22px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("FORM IS LIVE", PADDING, eyebrowY);

    // Wrap the title
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 64px Syne, Inter, system-ui, sans-serif";
    const titleLines = wrapText(ctx, opts.title || "Untitled form", CARD_W - PADDING * 2, 3);
    let titleY = eyebrowY + 60;
    for (const line of titleLines) {
        ctx.fillText(line, PADDING, titleY);
        titleY += 74;
    }

    // 5. QR + URL row (bottom)
    const qrSize = 280;
    const qrX = PADDING;
    const qrY = CARD_H - PADDING - qrSize - 120;
    // White tile behind QR
    const tilePad = 20;
    roundedRect(ctx, qrX - tilePad, qrY - tilePad, qrSize + tilePad * 2, qrSize + tilePad * 2, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.drawImage(opts.qrCanvas, qrX, qrY, qrSize, qrSize);

    // URL text right of QR
    const textX = qrX + qrSize + tilePad * 2 + 8;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "500 18px Inter, system-ui, sans-serif";
    ctx.fillText("SCAN OR VISIT", textX, qrY + 14);

    ctx.fillStyle = "#ffffff";
    ctx.font = "500 26px ui-monospace, SFMono-Regular, Menlo, monospace";
    const displayUrl = opts.url.replace(/^https?:\/\//i, "");
    const urlLines = wrapText(ctx, displayUrl, CARD_W - textX - PADDING, 4);
    let urlY = qrY + 50;
    for (const line of urlLines) {
        ctx.fillText(line, textX, urlY);
        urlY += 34;
    }
    if (opts.shortCode) {
        ctx.fillStyle = "#a78bfa";
        ctx.font = "500 20px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(`/s/${opts.shortCode}`, textX, urlY + 6);
    }

    // 6. Footer line
    const footerY = CARD_H - PADDING - 28;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, footerY - 28);
    ctx.lineTo(CARD_W - PADDING, footerY - 28);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "500 20px Inter, system-ui, sans-serif";
    ctx.fillText("Permanent on Walrus", PADDING, footerY);
    if (opts.blobId) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "400 18px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "right";
        const short = `${opts.blobId.slice(0, 10)}…${opts.blobId.slice(-4)}`;
        ctx.fillText(short, CARD_W - PADDING, footerY);
        ctx.textAlign = "left";
    }

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/png",
        );
    });
}

export async function downloadShareCardPng(
    opts: CardImageOptions,
    filename = "scrolls-share.png",
): Promise<void> {
    const blob = await renderShareCardPng(opts);
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
}

// ── helpers ──────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}

function drawCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
): void {
    const ir = img.width / img.height;
    const br = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (ir > br) {
        // image is wider — crop sides
        sw = img.height * br;
        sx = (img.width - sw) / 2;
    } else {
        sh = img.width / br;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string,
): void {
    // 4-point twisted star matching the on-screen glyph
    const s = size;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s / 24, s / 24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -10.5);
    ctx.lineTo(1.6, -3);
    ctx.lineTo(9, -1.6);
    ctx.lineTo(3, 3.6);
    ctx.lineTo(5.1, 10.5);
    ctx.lineTo(0, 6.3);
    ctx.lineTo(-5.1, 10.5);
    ctx.lineTo(-3, 3.6);
    ctx.lineTo(-9, -1.6);
    ctx.lineTo(-1.6, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number,
): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (ctx.measureText(trial).width <= maxWidth) {
            line = trial;
        } else {
            if (line) lines.push(line);
            line = word;
            if (lines.length === maxLines - 1) break;
        }
    }
    if (line && lines.length < maxLines) lines.push(line);
    // Truncate last line if it overflows
    if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 0) {
            last = last.slice(0, -1);
        }
        if (last !== lines[maxLines - 1]) lines[maxLines - 1] = `${last}…`;
    }
    return lines;
}
