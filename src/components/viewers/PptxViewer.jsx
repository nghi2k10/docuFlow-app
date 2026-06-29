import React, { useEffect, useRef, useState, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const SLIDE_W = 9144000;
const SLIDE_H = 5143500;
const EMU_TO_PCT_W = (v) => `${((v / SLIDE_W) * 100).toFixed(4)}%`;
const EMU_TO_PCT_H = (v) => `${((v / SLIDE_H) * 100).toFixed(4)}%`;
const EMU_TO_PT    = (v) => `${(v / 12700).toFixed(2)}pt`;

// ── Namespaces ────────────────────────────────────────────────────────────────
const NS  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ── Theme ─────────────────────────────────────────────────────────────────────
function parseThemeColors(xml) {
  if (!xml) return {};
  const doc   = new DOMParser().parseFromString(xml, 'text/xml');
  const slots = ['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
  const map   = {};
  slots.forEach(slot => {
    const el = doc.getElementsByTagNameNS(NS, slot)[0];
    if (!el) return;
    const srgb = el.getElementsByTagNameNS(NS, 'srgbClr')[0];
    if (srgb) { map[slot] = '#' + srgb.getAttribute('val'); return; }
    const sys = el.getElementsByTagNameNS(NS, 'sysClr')[0];
    if (sys)  map[slot] = '#' + (sys.getAttribute('lastClr') || '000000');
  });
  return map;
}

// ── Color resolver ────────────────────────────────────────────────────────────
function resolveColor(el, themeColors) {
  if (!el) return null;
  const srgb   = el.getElementsByTagNameNS(NS, 'srgbClr')[0];
  if (srgb) return '#' + srgb.getAttribute('val');
  const scheme = el.getElementsByTagNameNS(NS, 'schemeClr')[0];
  if (scheme) {
    const val   = scheme.getAttribute('val');
    const base  = themeColors[val];
    if (!base) return null;
    // lumMod/lumOff — basic brightness tweak
    const lumMod = scheme.getElementsByTagNameNS(NS, 'lumMod')[0];
    const lumOff = scheme.getElementsByTagNameNS(NS, 'lumOff')[0];
    if (lumMod || lumOff) {
      const mod = lumMod ? parseInt(lumMod.getAttribute('val')) / 100000 : 1;
      const off = lumOff ? parseInt(lumOff.getAttribute('val')) / 100000 : 0;
      return adjustLum(base, mod, off);
    }
    return base;
  }
  return null;
}

function adjustLum(hex, mod, off) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const clamp = v => Math.min(255, Math.max(0, Math.round(v * mod * 255 + off * 255)));
  const toHex = v => v.toString(16).padStart(2,'0');
  return '#' + toHex(clamp(r/255)) + toHex(clamp(g/255)) + toHex(clamp(b/255));
}

// ── Fill resolver → CSS background ───────────────────────────────────────────
function resolveFill(el, themeColors) {
  if (!el) return null;
  const solid = el.getElementsByTagNameNS(NS, 'solidFill')[0];
  if (solid) {
    const c = resolveColor(solid, themeColors);
    return c ? { background: c } : null;
  }
  const grad = el.getElementsByTagNameNS(NS, 'gradFill')[0];
  if (grad) {
    const stops = Array.from(grad.getElementsByTagNameNS(NS, 'gs')).map(gs => {
      const pos = parseInt(gs.getAttribute('pos') || '0') / 100000;
      const sf  = gs.getElementsByTagNameNS(NS, 'solidFill')[0];
      return { pos, color: resolveColor(sf, themeColors) || 'transparent' };
    });
    const lin   = grad.getElementsByTagNameNS(NS, 'lin')[0];
    const angle = lin ? parseInt(lin.getAttribute('ang') || '0') / 60000 : 90;
    if (stops.length >= 2) {
      const css = stops.map(s => `${s.color} ${Math.round(s.pos * 100)}%`).join(', ');
      return { background: `linear-gradient(${angle}deg, ${css})` };
    }
  }
  const noFill = el.getElementsByTagNameNS(NS, 'noFill')[0];
  if (noFill) return { background: 'transparent' };
  return null;
}

// ── Border/line resolver → CSS border ────────────────────────────────────────
function resolveLn(spPr, themeColors) {
  const ln = spPr?.getElementsByTagNameNS(NS, 'ln')[0];
  if (!ln) return null;
  const noFill = ln.getElementsByTagNameNS(NS, 'noFill')[0];
  if (noFill) return null;
  const w     = parseInt(ln.getAttribute('w') || '0');
  const solid = ln.getElementsByTagNameNS(NS, 'solidFill')[0];
  const color = resolveColor(solid, themeColors) || '#000000';
  const wPx   = Math.max(1, Math.round(w / 12700));
  return `${wPx}px solid ${color}`;
}

// ── xfrm → position style ────────────────────────────────────────────────────
function xfrmToStyle(xfrm) {
  if (!xfrm) return null;
  const off = xfrm.getElementsByTagNameNS(NS, 'off')[0];
  const ext = xfrm.getElementsByTagNameNS(NS, 'ext')[0];
  if (!off || !ext) return null;
  const flip = xfrm.getAttribute('flipH') === '1';
  return {
    left:      EMU_TO_PCT_W(parseInt(off.getAttribute('x') || '0')),
    top:       EMU_TO_PCT_H(parseInt(off.getAttribute('y') || '0')),
    width:     EMU_TO_PCT_W(parseInt(ext.getAttribute('cx') || '0')),
    height:    EMU_TO_PCT_H(parseInt(ext.getAttribute('cy') || '0')),
    transform: flip ? 'scaleX(-1)' : undefined,
  };
}

// ── Background ────────────────────────────────────────────────────────────────
function parseBg(xml, themeColors) {
  const doc  = new DOMParser().parseFromString(xml, 'text/xml');
  const bgPr = doc.getElementsByTagNameNS(PNS, 'bgPr')[0];
  if (!bgPr) return null;
  return resolveFill(bgPr, themeColors);
}

async function resolveBackground(zip, slideFile, themeColors) {
  const xml = await zip.files[slideFile].async('string');
  const bg  = parseBg(xml, themeColors);
  if (bg) return bg;

  const relFile = slideFile.replace('ppt/slides/slide','ppt/slides/_rels/slide') + '.rels';
  if (!zip.files[relFile]) return null;
  const relDoc  = new DOMParser().parseFromString(await zip.files[relFile].async('string'), 'text/xml');
  const layoutRel = Array.from(relDoc.getElementsByTagName('Relationship'))
    .find(r => r.getAttribute('Target')?.includes('slideLayout'));
  if (!layoutRel) return null;

  const layoutPath = 'ppt/slideLayouts/' + layoutRel.getAttribute('Target').replace('../slideLayouts/','');
  if (zip.files[layoutPath]) {
    const bgL = parseBg(await zip.files[layoutPath].async('string'), themeColors);
    if (bgL) return bgL;
  }

  const masterFile = 'ppt/slideMasters/slideMaster1.xml';
  if (!zip.files[masterFile]) return null;
  return parseBg(await zip.files[masterFile].async('string'), themeColors);
}

// ── Image cache ───────────────────────────────────────────────────────────────
const imageCache = {};
async function loadImage(zip, target) {
  const key = target;
  if (imageCache[key]) return imageCache[key];
  const path = 'ppt/' + target.replace('../','');
  if (!zip.files[path]) return null;
  const bytes = await zip.files[path].async('uint8array');
  const ext   = path.split('.').pop().toLowerCase();
  const mime  = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', svg:'image/svg+xml', webp:'image/webp' }[ext] || 'image/jpeg';
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const url = `data:${mime};base64,${btoa(bin)}`;
  imageCache[key] = url;
  return url;
}

// ── Slide parser ──────────────────────────────────────────────────────────────
async function parseSlide(zip, slideFile, themeColors) {
  const xml  = await zip.files[slideFile].async('string');
  const doc  = new DOMParser().parseFromString(xml, 'text/xml');
  const rels = await parseRels(zip, slideFile);
  const elements = [];

  // ── Text shapes (sp) ──
  Array.from(doc.getElementsByTagNameNS(PNS, 'sp')).forEach((sp, idx) => {
    const spPr   = sp.getElementsByTagNameNS(PNS, 'spPr')[0];
    const xfrm   = spPr?.getElementsByTagNameNS(NS, 'xfrm')[0];
    const pos    = xfrmToStyle(xfrm);

    // Shape fill
    const fill   = resolveFill(spPr, themeColors);
    const border = resolveLn(spPr, themeColors);

    // bodyPr — padding + vertical align
    const bodyPr  = sp.getElementsByTagNameNS(NS, 'bodyPr')[0];
    const anchor  = bodyPr?.getAttribute('anchor') || 't'; // t | ctr | b
    const lIns    = parseInt(bodyPr?.getAttribute('lIns') || '91440');
    const rIns    = parseInt(bodyPr?.getAttribute('rIns') || '91440');
    const tIns    = parseInt(bodyPr?.getAttribute('tIns') || '45720');
    const bIns    = parseInt(bodyPr?.getAttribute('bIns') || '45720');

    // Paragraphs
    const paragraphs = [];
    Array.from(sp.getElementsByTagNameNS(NS, 'p')).forEach(p => {
      const pPr    = p.getElementsByTagNameNS(NS, 'pPr')[0];
      const algn   = pPr?.getAttribute('algn') || 'l';

      // Paragraph spacing
      const spcBef = pPr?.getElementsByTagNameNS(NS, 'spcBef')[0];
      const spcAft = pPr?.getElementsByTagNameNS(NS, 'spcAft')[0];
      const spcBefPt = parseInt(spcBef?.getElementsByTagNameNS(NS, 'spcPts')[0]?.getAttribute('val') || '0') / 100;
      const spcAftPt = parseInt(spcAft?.getElementsByTagNameNS(NS, 'spcPts')[0]?.getAttribute('val') || '0') / 100;

      // Line spacing
      const lnSpc  = pPr?.getElementsByTagNameNS(NS, 'lnSpc')[0];
      const lnSpcPct = lnSpc?.getElementsByTagNameNS(NS, 'spcPct')[0];
      const lineHeight = lnSpcPct ? parseInt(lnSpcPct.getAttribute('val') || '100000') / 100000 : 1.2;

      // Runs + line breaks
      const runs = [];
      const children = Array.from(p.childNodes);
      children.forEach(child => {
        const localName = child.localName;
        if (localName === 'r') {
          const rPr     = child.getElementsByTagNameNS(NS, 'rPr')[0];
          const t       = child.getElementsByTagNameNS(NS, 't')[0];
          const text    = t?.textContent || '';
          if (!text) return;

          const szRaw   = rPr?.getAttribute('sz');
          const fontSize = szRaw ? parseInt(szRaw) / 100 : null;
          const bold    = rPr?.getAttribute('b') === '1';
          const italic  = rPr?.getAttribute('i') === '1';
          const under   = rPr?.getAttribute('u') === 'sng';
          const strike  = rPr?.getAttribute('strike') === 'sngStrike';
          const sf      = rPr?.getElementsByTagNameNS(NS, 'solidFill')[0];
          const color   = resolveColor(sf, themeColors);

          runs.push({ type: 'run', text, fontSize, bold, italic, under, strike, color });
        } else if (localName === 'br') {
          runs.push({ type: 'br' });
        }
      });

      if (runs.length > 0) {
        paragraphs.push({ runs, algn, spcBefPt, spcAftPt, lineHeight });
      }
    });

    if (paragraphs.length > 0 || fill) {
      elements.push({
        type: 'shape', zIndex: idx,
        pos, fill, border,
        anchor, padding: { l: lIns, r: rIns, t: tIns, b: bIns },
        paragraphs,
      });
    }
  });

  // ── Images (pic) ──
  const pics = Array.from(doc.getElementsByTagNameNS(PNS, 'pic'));
  for (const [idx, pic] of pics.entries()) {
    const blip  = pic.getElementsByTagNameNS(NS, 'blip')[0];
    const rId   = blip?.getAttributeNS(RNS, 'embed');
    if (!rId || !rels[rId]) continue;
    const dataUrl = await loadImage(zip, rels[rId]);
    if (!dataUrl) continue;

    const spPr  = pic.getElementsByTagNameNS(PNS, 'spPr')[0];
    const xfrm  = spPr?.getElementsByTagNameNS(NS, 'xfrm')[0];
    const pos   = xfrmToStyle(xfrm);
    const border = resolveLn(spPr, themeColors);

    // Crop
    const srcRect = pic.getElementsByTagNameNS(NS, 'srcRect')[0];
    const crop = srcRect ? {
      l: parseInt(srcRect.getAttribute('l') || '0') / 1000,
      r: parseInt(srcRect.getAttribute('r') || '0') / 1000,
      t: parseInt(srcRect.getAttribute('t') || '0') / 1000,
      b: parseInt(srcRect.getAttribute('b') || '0') / 1000,
    } : null;

    elements.push({ type: 'image', zIndex: 1000 + idx, pos, dataUrl, crop, border });
  }

  elements.sort((a, b) => a.zIndex - b.zIndex);
  return elements;
}

async function parseRels(zip, slideFile) {
  const relFile = slideFile.replace('ppt/slides/slide','ppt/slides/_rels/slide') + '.rels';
  if (!zip.files[relFile]) return {};
  const doc = new DOMParser().parseFromString(await zip.files[relFile].async('string'), 'text/xml');
  const map = {};
  Array.from(doc.getElementsByTagName('Relationship')).forEach(r => {
    map[r.getAttribute('Id')] = r.getAttribute('Target');
  });
  return map;
}

// ── Run renderer ──────────────────────────────────────────────────────────────
function RunSpan({ run }) {
  if (run.type === 'br') return <br />;
  return (
    <span style={{
      fontWeight:      run.bold   ? 700   : undefined,
      fontStyle:       run.italic ? 'italic' : undefined,
      textDecoration:  run.under  ? 'underline' : run.strike ? 'line-through' : undefined,
      color:           run.color  || undefined,
      fontSize:        run.fontSize ? `${Math.min(Math.max(run.fontSize, 8), 96)}px` : undefined,
    }}>
      {run.text}
    </span>
  );
}

// ── Shape element ─────────────────────────────────────────────────────────────
function ShapeElement({ el, searchText }) {
  if (!el.pos) return null;

  const anchorMap = { t: 'flex-start', ctr: 'center', b: 'flex-end' };
  const alignItems = anchorMap[el.anchor] || 'flex-start';

  const containerStyle = {
    position:  'absolute',
    overflow:  'hidden',
    boxSizing: 'border-box',
    display:   'flex',
    flexDirection: 'column',
    justifyContent: alignItems,
    paddingLeft:   EMU_TO_PT(el.padding.l),
    paddingRight:  EMU_TO_PT(el.padding.r),
    paddingTop:    EMU_TO_PT(el.padding.t),
    paddingBottom: EMU_TO_PT(el.padding.b),
    border:    el.border || undefined,
    ...el.fill,
    ...el.pos,
  };

  return (
    <div style={containerStyle}>
      {el.paragraphs.map((para, pi) => (
        <p
          key={pi}
          style={{
            margin: 0,
            marginTop:    para.spcBefPt ? `${para.spcBefPt}pt` : undefined,
            marginBottom: para.spcAftPt ? `${para.spcAftPt}pt` : undefined,
            lineHeight:   para.lineHeight,
            textAlign:    para.algn === 'ctr' ? 'center' : para.algn === 'r' ? 'right' : para.algn === 'just' ? 'justify' : 'left',
          }}
        >
          {para.runs.map((run, ri) => <RunSpan key={ri} run={run} />)}
        </p>
      ))}
    </div>
  );
}

// ── Image element ─────────────────────────────────────────────────────────────
function ImageElement({ el }) {
  if (!el.pos) return null;
  const containerStyle = {
    position: 'absolute',
    overflow: 'hidden',
    border:   el.border || undefined,
    ...el.pos,
  };

  if (el.crop) {
    const { l, r, t, b } = el.crop;
    const sx = 100 / (100 - l - r);
    const sy = 100 / (100 - t - b);
    return (
      <div style={containerStyle}>
        <img src={el.dataUrl} alt="" draggable={false} style={{
          position: 'absolute',
          width:  `${sx * 100}%`, height: `${sy * 100}%`,
          left:   `${-l * sx}%`, top:   `${-t * sy}%`,
          objectFit: 'cover',
        }} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <img src={el.dataUrl} alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}

// ── Slide canvas ──────────────────────────────────────────────────────────────
function SlideCanvas({ slide }) {
  const { elements, background } = slide;
  return (
    <div className="relative w-full h-full overflow-hidden" style={background || { background: '#fff' }}>
      {elements.map((el, i) => {
        if (el.type === 'shape') return <ShapeElement key={i} el={el} />;
        if (el.type === 'image') return <ImageElement key={i} el={el} />;
        return null;
      })}
    </div>
  );
}

// ── Thumbnail strip ───────────────────────────────────────────────────────────
function ThumbnailStrip({ slides, currentSlide, onSelect }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [currentSlide]);

  return (
    <div className="flex flex-col gap-2 overflow-y-auto overflow-x-hidden bg-slate-200 border-r border-slate-300 py-3 px-2 shrink-0 w-[100px] sm:w-[120px]">
      {slides.map((slide, i) => (
        <button
          key={i}
          ref={i === currentSlide ? activeRef : null}
          onClick={() => onSelect(i)}
          className={`relative rounded overflow-hidden border-2 transition-all shrink-0 ${
            i === currentSlide
              ? 'border-primary shadow-md'
              : 'border-transparent hover:border-slate-400'
          }`}
          style={{ aspectRatio: '16/9', width: '100%' }}
        >
          {/* Mini slide render */}
          <div className="w-full h-full" style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
            <div
              className="relative overflow-hidden"
              style={{
                width: '160px', height: '90px',
                transform: 'scale(0.5)', transformOrigin: 'top left',
                ...(slide.background || { background: '#fff' }),
              }}
            >
              {slide.elements.map((el, ei) => {
                if (el.type === 'shape') return <ShapeElement key={ei} el={el} />;
                if (el.type === 'image') return <ImageElement key={ei} el={el} />;
                return null;
              })}
            </div>
          </div>
          {/* Slide number */}
          <span className="absolute bottom-0.5 right-1 text-[9px] font-medium text-white drop-shadow">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PptxViewer({ file }) {
  const [slides, setSlides]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showStrip, setShowStrip]       = useState(true);

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
        for (const sf of slideFiles) {
          const [elements, background] = await Promise.all([
            parseSlide(zip, sf, themeColors),
            resolveBackground(zip, sf, themeColors),
          ]);
          parsed.push({ elements, background });
          // Cập nhật từng slide khi parse xong — người dùng thấy tiến trình
          if (!cancelled) setSlides([...parsed]);
        }

        if (cancelled) return;
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

  // Keyboard navigation
  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        setCurrentSlide(s => Math.min(slides.length - 1, s + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        setCurrentSlide(s => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [slides.length]);

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-destructive font-medium">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-800">

      {/* Loading bar */}
      {loading && slides.length === 0 && (
        <div className="absolute inset-0 z-20 bg-slate-800 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-600 border-t-white rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Đang tải slides...</p>
        </div>
      )}

      {/* Progress bar khi đang parse dần */}
      {loading && slides.length > 0 && (
        <div className="h-0.5 bg-slate-700 shrink-0">
          <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Thumbnail strip */}
        {showStrip && slides.length > 0 && (
          <ThumbnailStrip
            slides={slides}
            currentSlide={currentSlide}
            onSelect={setCurrentSlide}
          />
        )}

        {/* Main slide area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Slide canvas */}
          <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
            {slides[currentSlide] && (
              <div
                className="shadow-2xl"
                style={{
                  width:     'min(100%, calc((100vh - 100px) * 16 / 9))',
                  aspectRatio: '16/9',
                  position:  'relative',
                }}
              >
                <SlideCanvas slide={slides[currentSlide]} />
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
            {/* Toggle strip */}
            <button
              onClick={() => setShowStrip(s => !s)}
              className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Ẩn/hiện danh sách slide"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>

            {/* Prev / indicator / Next */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                disabled={currentSlide === 0}
                className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <span className="text-sm text-slate-300 tabular-nums min-w-[60px] text-center">
                {currentSlide + 1} / {slides.length}
              </span>

              <button
                onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))}
                disabled={currentSlide === slides.length - 1}
                className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* Spacer */}
            <div className="w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}