import React, { useEffect, useRef, useState } from 'react';

// Parse một slide XML thành structured data
function parseSlideXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

  const shapes = [];

  // Lấy tất cả shape (sp)
  const spList = doc.getElementsByTagNameNS(PNS, 'sp');
  Array.from(spList).forEach(sp => {
    // Xác định loại placeholder
    const ph = sp.getElementsByTagNameNS(PNS, 'ph')[0];
    const phType = ph?.getAttribute('type') || 'body';
    const phIdx = parseInt(ph?.getAttribute('idx') || '99');

    // Lấy từng paragraph
    const paras = sp.getElementsByTagNameNS(NS, 'p');
    const paragraphs = [];

    Array.from(paras).forEach(p => {
      // Lấy font size từ paragraph hoặc run đầu tiên
      const pPr = p.getElementsByTagNameNS(NS, 'pPr')[0];
      const algn = pPr?.getAttribute('algn') || 'l';

      const runs = p.getElementsByTagNameNS(NS, 'r');
      let text = '';
      let fontSize = null;
      let bold = false;

      Array.from(runs).forEach(r => {
        const rPr = r.getElementsByTagNameNS(NS, 'rPr')[0];
        const t = r.getElementsByTagNameNS(NS, 't')[0];
        if (t) text += t.textContent;
        if (rPr) {
          if (!fontSize && rPr.getAttribute('sz')) {
            fontSize = parseInt(rPr.getAttribute('sz')) / 100; // unit: pt
          }
          if (rPr.getAttribute('b') === '1') bold = true;
        }
      });

      // Cũng check <a:br> (line break)
      if (text.trim()) {
        paragraphs.push({ text: text.trim(), fontSize, bold, align: algn });
      }
    });

    if (paragraphs.length > 0) {
      shapes.push({ phType, phIdx, paragraphs });
    }
  });

  // Sort: title trước, body sau, theo idx
  shapes.sort((a, b) => {
    const order = { 'ctrTitle': 0, 'title': 1, 'subTitle': 2, 'body': 3 };
    const oa = order[a.phType] ?? 4 + a.phIdx;
    const ob = order[b.phType] ?? 4 + b.phIdx;
    return oa - ob;
  });

  return shapes;
}

function SlideRenderer({ shapes, searchText }) {
  // Phân loại title và content
  const titleShape = shapes.find(s =>
    ['ctrTitle', 'title', 'subTitle'].includes(s.phType)
  );
  const bodyShapes = shapes.filter(s =>
    !['ctrTitle', 'title', 'subTitle'].includes(s.phType)
  );

  const highlight = (text) => {
    if (!searchText || searchText.trim().length < 2) return text;
    const regex = new RegExp(
      `(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'
    );
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="search-match bg-yellow-200 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="w-full h-full flex flex-col justify-center gap-4 p-8 sm:p-12 overflow-auto">
      {/* Title */}
      {titleShape && titleShape.paragraphs.map((para, i) => (
        <p
          key={i}
          className={`font-bold leading-tight text-foreground ${
            titleShape.phType === 'subTitle'
              ? 'text-base sm:text-lg text-muted-foreground font-normal'
              : 'text-2xl sm:text-3xl'
          }`}
          style={{
            textAlign: para.align === 'ctr' ? 'center' : para.align === 'r' ? 'right' : 'left',
            fontSize: para.fontSize ? `${Math.min(para.fontSize, 40)}px` : undefined,
          }}
        >
          {highlight(para.text)}
        </p>
      ))}

      {/* Divider nếu có cả title và body */}
      {titleShape && bodyShapes.length > 0 && (
        <div className="border-t border-slate-200 my-1" />
      )}

      {/* Body shapes */}
      {bodyShapes.map((shape, si) => (
        <div key={si} className="flex flex-col gap-1.5">
          {shape.paragraphs.map((para, pi) => (
            <p
              key={pi}
              className="text-foreground leading-relaxed"
              style={{
                textAlign: para.align === 'ctr' ? 'center' : para.align === 'r' ? 'right' : 'left',
                fontWeight: para.bold ? 600 : 400,
                fontSize: para.fontSize
                  ? `${Math.min(Math.max(para.fontSize, 12), 28)}px`
                  : '15px',
              }}
            >
              • {highlight(para.text)}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function PptxViewer({ file, searchText }) {
  const [slides, setSlides] = useState([]); // mảng parsed shapes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
        const JSZipModule = await import('jszip');
        const JSZip = JSZipModule.default;
        const zip = await JSZip.loadAsync(e.target.result);

        const slideFiles = Object.keys(zip.files)
          .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
            const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
            return numA - numB;
          });

        const parsed = [];
        for (const slideFile of slideFiles) {
          const content = await zip.files[slideFile].async('string');
          parsed.push(parseSlideXml(content));
        }

        if (cancelled) return;
        if (parsed.length === 0) {
          setError('Không tìm thấy nội dung slide.');
          setLoading(false);
          return;
        }
        setSlides(parsed);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PPTX render error:', err);
        setError('Không thể đọc file PowerPoint. Nếu là file .ppt cũ, hãy chuyển sang .pptx.');
        setLoading(false);
      }
    };
    reader.onerror = () => {
      if (!cancelled) { setError('Lỗi khi đọc file.'); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);

    return () => { cancelled = true; };
  }, [file]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentSlide(s => Math.min(slides.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentSlide(s => Math.max(0, s - 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [slides.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Đang tải slides...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="bg-white shadow-xl rounded-lg w-full max-w-3xl aspect-video overflow-hidden">
          <SlideRenderer
            shapes={slides[currentSlide] || []}
            searchText={searchText}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-t bg-white shrink-0">
        <button
          onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
          disabled={currentSlide === 0}
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        {/* Dot indicators — hiện tối đa 7 dots */}
        <div className="flex items-center gap-1.5">
          {slides.slice(
            Math.max(0, currentSlide - 3),
            Math.min(slides.length, currentSlide + 4)
          ).map((_, i) => {
            const actual = Math.max(0, currentSlide - 3) + i;
            return (
              <button
                key={actual}
                onClick={() => setCurrentSlide(actual)}
                className={`rounded-full transition-all ${
                  actual === currentSlide
                    ? 'w-2.5 h-2.5 bg-primary'
                    : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
                }`}
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  );
}