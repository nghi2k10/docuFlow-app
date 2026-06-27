import React, { useEffect, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const SLIDE_W = 9144000; // EMU
const SLIDE_H = 5143500;

// ── Theme ─────────────────────────────────────────────────────────────────────
function parseThemeColors(themeXml) {
  if (!themeXml) return {};
  const doc = new DOMParser().parseFromString(themeXml, 'text/xml');
  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const slots = ['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
  const map = {};
  slots.forEach(slot => {
    const el = doc.getElementsByTagNameNS(NS, slot)[0];
    if (!el) return;
    const srgb = el.getElementsByTagNameNS(NS, 'srgbClr')[0];
    if (srgb) { map[slot] = '#' + srgb.getAttribute('val'); return; }
    const sys = el.getElementsByTagNameNS(NS, 'sysClr')[0];
    if (sys) map[slot] = '#' + (sys.getAttribute('lastClr') || '000000');
  });
  return map;
}

// ── Color ─────────────────────────────────────────────────────────────────────
function resolveColor(fillEl, themeColors) {
  if (!fillEl) return null;
  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const srgb = fillEl.getElementsByTagNameNS(NS, 'srgbClr')[0];
  if (srgb) return '#' + srgb.getAttribute('val');
  const scheme = fillEl.getElementsByTagNameNS(NS, 'schemeClr')[0];
  if (scheme) return themeColors[scheme.getAttribute('val')] || null;
  return null;
}

// ── Background ────────────────────────────────────────────────────────────────
function parseBgFromXml(xmlString, themeColors) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const NS  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const bgPr = doc.getElementsByTagNameNS(PNS, 'bgPr')[0];
  if (!bgPr) return null;
  const solidFill = bgPr.getElementsByTagNameNS(NS, 'solidFill')[0];
  if (solidFill) {
    const color = resolveColor(solidFill, themeColors);
    if (color) return { type: 'solid', color };
  }
  const gradFill = bgPr.getElementsByTagNameNS(NS, 'gradFill')[0];
  if (gradFill) {
    const stops = Array.from(gradFill.getElementsByTagNameNS(NS, 'gs')).map(gs => ({
      pos: parseInt(gs.getAttribute('pos') || '0') / 100000,
      color: resolveColor(gs.getElementsByTagNameNS(NS, 'solidFill')[0], themeColors) || '#000',
    }));
    const lin = gradFill.getElementsByTagNameNS(NS, 'lin')[0];
    const angle = lin ? parseInt(lin.getAttribute('ang') || '0') / 60000 : 90;
    if (stops.length >= 2) return { type: 'gradient', stops, angle };
  }
  return null;
}

async function resolveBackground(zip, slideFile, themeColors) {
  const slideXml = await zip.files[slideFile].async('string');
  const bg = parseBgFromXml(slideXml, themeColors);
  if (bg) return bg;

  const relFile = slideFile.replace('ppt/slides/slide', 'ppt/slides/_rels/slide') + '.rels';
  if (!zip.files[relFile]) return null;
  const relDoc = new DOMParser().parseFromString(await zip.files[relFile].async('string'), 'text/xml');
  const layoutRel = Array.from(relDoc.getElementsByTagName('Relationship'))
    .find(r => r.getAttribute('Target')?.includes('slideLayout'));
  if (!layoutRel) return null;

  const layoutPath = 'ppt/slideLayouts/' + layoutRel.getAttribute('Target').replace('../slideLayouts/', '');
  if (!zip.files[layoutPath]) return null;
  const bgLayout = parseBgFromXml(await zip.files[layoutPath].async('string'), themeColors);
  if (bgLayout) return bgLayout;

  const masterFile = 'ppt/slideMasters/slideMaster1.xml';
  if (!zip.files[masterFile]) return null;
  return parseBgFromXml(await zip.files[masterFile].async('string'), themeColors);
}

function bgStyle(bg) {
  if (!bg) return { backgroundColor: '#ffffff' };
  if (bg.type === 'solid') return { backgroundColor: bg.color };
  if (bg.type === 'gradient') {
    const stops = bg.stops.map(s => `${s.color} ${Math.round(s.pos * 100)}%`).join(', ');
    return { background: `linear-gradient(${bg.angle}deg, ${stops})` };
  }
  return { backgroundColor: '#ffffff' };
}

// ── Relationships ─────────────────────────────────────────────────────────────
async function parseSlideRels(zip, slideFile) {
  const relFile = slideFile.replace('ppt/slides/slide', 'ppt/slides/_rels/slide') + '.rels';
  if (!zip.files[relFile]) return {};
  const doc = new DOMParser().parseFromString(
    await zip.files[relFile].async('string'), 'text/xml'
  );
  const map = {};
  Array.from(doc.getElementsByTagName('Relationship')).forEach(r => {
    map[r.getAttribute('Id')] = r.getAttribute('Target');
  });
  return map;
}

// ── Image cache (base64) ──────────────────────────────────────────────────────
const imageCache = {};

async function loadImageAsDataUrl(zip, target) {
  if (imageCache[target]) return imageCache[target];
  const path = 'ppt/' + target.replace('../', '');
  const file = zip.files[path];
  if (!file) return null;
  const bytes = await file.async('uint8array');
  const ext = path.split('.').pop().toLowerCase();
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
  const mime = mimeMap[ext] || 'image/jpeg';
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const dataUrl = `data:${mime};base64,${btoa(binary)}`;
  imageCache[target] = dataUrl;
  return dataUrl;
}

// ── xfrm → percent position ──────────────────────────────────────────────────
function xfrmToStyle(xfrmEl) {
  if (!xfrmEl) return null;
  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const off = xfrmEl.getElementsByTagNameNS(NS, 'off')[0];
  const ext = xfrmEl.getElementsByTagNameNS(NS, 'ext')[0];
  if (!off || !ext) return null;
  const x  = parseInt(off.getAttribute('x') || '0');
  const y  = parseInt(off.getAttribute('y') || '0');
  const cx = parseInt(ext.getAttribute('cx') || '0');
  const cy = parseInt(ext.getAttribute('cy') || '0');
  return {
    left:   `${(x  / SLIDE_W * 100).toFixed(3)}%`,
    top:    `${(y  / SLIDE_H * 100).toFixed(3)}%`,
    width:  `${(cx / SLIDE_W * 100).toFixed(3)}%`,
    height: `${(cy / SLIDE_H * 100).toFixed(3)}%`,
  };
}

// ── Slide parser ──────────────────────────────────────────────────────────────
async function parseSlide(zip, slideFile, themeColors) {
  const xml = await zip.files[slideFile].async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const NS  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const rels = await parseSlideRels(zip, slideFile);

  const elements = []; // { type, zIndex, ... }
  let zIndex = 0;

  // ── Text shapes (sp) ──
  Array.from(doc.getElementsByTagNameNS(PNS, 'sp')).forEach(sp => {
    const ph     = sp.getElementsByTagNameNS(PNS, 'ph')[0];
    const phType = ph?.getAttribute('type') || 'body';

    const spPr = sp.getElementsByTagNameNS(PNS, 'spPr')[0];
    const xfrm = spPr?.getElementsByTagNameNS(NS, 'xfrm')[0];
    const pos  = xfrmToStyle(xfrm);

    const paragraphs = [];
    Array.from(sp.getElementsByTagNameNS(NS, 'p')).forEach(p => {
      const pPr  = p.getElementsByTagNameNS(NS, 'pPr')[0];
      const algn = pPr?.getAttribute('algn') || 'l';
      let text = '', fontSize = null, bold = false, color = null;

      Array.from(p.getElementsByTagNameNS(NS, 'r')).forEach(r => {
        const rPr = r.getElementsByTagNameNS(NS, 'rPr')[0];
        const t   = r.getElementsByTagNameNS(NS, 't')[0];
        if (t) text += t.textContent;
        if (rPr) {
          if (!fontSize && rPr.getAttribute('sz'))
            fontSize = parseInt(rPr.getAttribute('sz')) / 100;
          if (rPr.getAttribute('b') === '1') bold = true;
          if (!color) color = resolveColor(rPr.getElementsByTagNameNS(NS, 'solidFill')[0], themeColors);
        }
      });

      // <a:br> = line break — đếm như paragraph rỗng
      if (text.trim()) paragraphs.push({ text: text.trim(), fontSize, bold, align: algn, color });
    });

    if (paragraphs.length > 0) {
      elements.push({ type: 'text', zIndex: zIndex++, pos, phType, paragraphs });
    }
  });

  // ── Images (pic) ──
  const pics = Array.from(doc.getElementsByTagNameNS(PNS, 'pic'));
  for (const pic of pics) {
    const blip  = pic.getElementsByTagNameNS(NS, 'blip')[0];
    const rId   = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
    if (!rId || !rels[rId]) continue;

    const target = rels[rId];
    const dataUrl = await loadImageAsDataUrl(zip, target);
    if (!dataUrl) continue;

    const spPr = pic.getElementsByTagNameNS(PNS, 'spPr')[0];
    const xfrm = spPr?.getElementsByTagNameNS(NS, 'xfrm')[0];
    const pos  = xfrmToStyle(xfrm);

    // srcRect = crop (0–100000 unit)
    const srcRect = pic.getElementsByTagNameNS(NS, 'srcRect')[0];
    const crop = srcRect ? {
      l: parseInt(srcRect.getAttribute('l') || '0') / 1000,
      r: parseInt(srcRect.getAttribute('r') || '0') / 1000,
      t: parseInt(srcRect.getAttribute('t') || '0') / 1000,
      b: parseInt(srcRect.getAttribute('b') || '0') / 1000,
    } : null;

    elements.push({ type: 'image', zIndex: zIndex++, pos, dataUrl, crop });
  }

  return elements;
}

// ── Image element with crop ───────────────────────────────────────────────────
function ImageElement({ el }) {
  if (!el.pos) return null;

  // Nếu có crop thì dùng clip-path wrapper
  if (el.crop) {
    const { l, r, t, b } = el.crop;
    // Scale ảnh lớn hơn rồi clip
    const scaleX = 100 / (100 - l - r);
    const scaleY = 100 / (100 - t - b);
    return (
      <div style={{ position: 'absolute', overflow: 'hidden', ...el.pos }}>
        <img
          src={el.dataUrl}
          alt=""
          style={{
            position: 'absolute',
            width:  `${scaleX * 100}%`,
            height: `${scaleY * 100}%`,
            left:   `${-l * scaleX}%`,
            top:    `${-t * scaleY}%`,
            objectFit: 'cover',
          }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <img
      src={el.dataUrl}
      alt=""
      style={{ position: 'absolute', objectFit: 'cover', ...el.pos }}
      draggable={false}
    />
  );
}

// ── Text element ──────────────────────────────────────────────────────────────
function TextElement({ el, searchText }) {
  const highlight = (text) => {
    if (!searchText || searchText.trim().length < 2) return text;
    const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark>
        : part
    );
  };

  const isTitle = ['ctrTitle', 'title'].includes(el.phType);

  const containerStyle = el.pos
    ? { position: 'absolute', overflow: 'hidden', ...el.pos }
    : { position: 'relative' };

  return (
    <div style={containerStyle}>
      {el.paragraphs.map((para, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            lineHeight: 1.3,
            textAlign: para.align === 'ctr' ? 'center' : para.align === 'r' ? 'right' : 'left',
            fontWeight: (isTitle || para.bold) ? 700 : 400,
            fontSize: para.fontSize
              ? `${Math.min(Math.max(para.fontSize, 8), 60)}px`
              : isTitle ? '28px' : '14px',
            color: para.color || undefined,
          }}
        >
          {highlight(para.text)}
        </p>
      ))}
    </div>
  );
}

// ── Slide renderer ────────────────────────────────────────────────────────────
function SlideRenderer({ slide, searchText }) {
  const { elements, background } = slide;
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={bgStyle(background)}
    >
      {sorted.map((el, i) => {
        if (el.type === 'image') return <ImageElement key={i} el={el} />;
        if (el.type === 'text')  return <TextElement  key={i} el={el} searchText={searchText} />;
        return null;
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PptxViewer({ file, searchText }) {
  const [slides, setSlides]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSlides([]);
    setCurrentSlide(0);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const JSZip = (await import('jszip')).default;
        const zip   = await JSZip.loadAsync(e.target.result);

        // Theme
        let themeColors = {};
        const themeFile = zip.files['ppt/theme/theme1.xml'];
        if (themeFile) themeColors = parseThemeColors(await themeFile.async('string'));

        const slideFiles = Object.keys(zip.files)
          .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => {
            const n = s => parseInt(s.match(/slide(\d+)/)?.[1] || '0');
            return n(a) - n(b);
          });

        const parsed = [];
        for (const slideFile of slideFiles) {
          const [elements, background] = await Promise.all([
            parseSlide(zip, slideFile, themeColors),
            resolveBackground(zip, slideFile, themeColors),
          ]);
          parsed.push({ elements, background });
        }

        if (cancelled) return;
        if (parsed.length === 0) { setError('Không tìm thấy nội dung slide.'); setLoading(false); return; }
        setSlides(parsed);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PPTX error:', err);
        setError('Không thể đọc file PowerPoint.');
        setLoading(false);
      }
    };
    reader.onerror = () => { if (!cancelled) { setError('Lỗi đọc file.'); setLoading(false); } };
    reader.readAsArrayBuffer(file);
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        setCurrentSlide(s => Math.min(slides.length - 1, s + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        setCurrentSlide(s => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [slides.length]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Đang tải slides...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-destructive font-medium">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Slide area — giữ đúng tỉ lệ 16:9 */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          className="shadow-xl rounded-lg overflow-hidden w-full"
          style={{ maxWidth: 'min(100%, calc((100vh - 120px) * 16/9))', aspectRatio: '16/9' }}
        >
          <SlideRenderer slide={slides[currentSlide] || { elements: [], background: null }} searchText={searchText} />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-t bg-white shrink-0">
        <button
          onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
          disabled={currentSlide === 0}
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div className="flex items-center gap-1.5">
          {slides.slice(Math.max(0, currentSlide - 3), Math.min(slides.length, currentSlide + 4)).map((_, i) => {
            const actual = Math.max(0, currentSlide - 3) + i;
            return (
              <button
                key={actual}
                onClick={() => setCurrentSlide(actual)}
                className={`rounded-full transition-all ${actual === currentSlide ? 'w-2.5 h-2.5 bg-primary' : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'}`}
              />
            );
          })}
        </div>

        <span className="text-sm font-medium text-muted-foreground tabular-nums min-w-[60px] text-center">
          {currentSlide + 1} / {slides.length}
        </span>

        <button
          onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))}
          disabled={currentSlide === slides.length - 1}
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  );
}