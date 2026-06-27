import React, { useEffect, useRef, useState, useCallback } from 'react';
import { updateReadingProgress } from '@/lib/storage';

const VIEWPORT_BUFFER = 2;      // render trước/sau viewport N trang
const PAGE_ESTIMATED_HEIGHT = 800; // px placeholder trước khi biết kích thước thật

let pdfjsLib = null;
async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
  ).toString();
  pdfjsLib = pdfjs;
  return pdfjs;
}

// ── Page component — tự render/huỷ dựa vào visible ──────────────────────────
const PdfPage = React.memo(function PdfPage({ pageNum, pdfDoc, scale, containerWidth, onVisible }) {
  const wrapperRef = useRef(null);
  const canvasRef  = useRef(null);
  const renderTask = useRef(null);
  const [rendered, setRendered]   = useState(false);
  const [pageSize, setPageSize]   = useState({ w: containerWidth - 32, h: PAGE_ESTIMATED_HEIGHT });
  const isVisible = useRef(false);

  // Lấy kích thước thật của trang để placeholder đúng chiều cao
  useEffect(() => {
    if (!pdfDoc) return;
    pdfDoc.getPage(pageNum).then(page => {
      const vp = page.getViewport({ scale: 1 });
      const fitScale = ((containerWidth - 32) / vp.width) * scale;
      const sv = page.getViewport({ scale: fitScale });
      setPageSize({ w: sv.width, h: sv.height });
    });
  }, [pdfDoc, pageNum, scale, containerWidth]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const fitScale = ((containerWidth - 32) / vp.width) * scale;
      const sv = page.getViewport({ scale: fitScale });

      const canvas = canvasRef.current;
      canvas.width  = sv.width;
      canvas.height = sv.height;
      canvas.style.width  = sv.width  + 'px';
      canvas.style.height = sv.height + 'px';
      setPageSize({ w: sv.width, h: sv.height });

      // Huỷ render cũ nếu đang chạy
      if (renderTask.current) {
        renderTask.current.cancel();
        renderTask.current = null;
      }

      renderTask.current = page.render({ canvasContext: canvas.getContext('2d'), viewport: sv });
      await renderTask.current.promise;
      setRendered(true);
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error(`Page ${pageNum} render error:`, err);
      }
    }
  }, [pdfDoc, pageNum, scale, containerWidth]);

  const clearPage = useCallback(() => {
    if (renderTask.current) {
      renderTask.current.cancel();
      renderTask.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setRendered(false);
  }, []);

  // IntersectionObserver — trigger render/clear
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !pdfDoc) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          isVisible.current = true;
          onVisible(pageNum);
          renderPage();
        } else {
          isVisible.current = false;
        }
      },
      {
        // rootMargin: render trước N trang so với viewport
        rootMargin: `${PAGE_ESTIMATED_HEIGHT * VIEWPORT_BUFFER}px 0px`,
        threshold: 0,
      }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearPage();
    };
  }, [pdfDoc, renderPage, clearPage, pageNum, onVisible]);

  // Re-render khi scale thay đổi nếu đang visible
  useEffect(() => {
    if (isVisible.current) renderPage();
  }, [scale, renderPage]);

  return (
    <div
      ref={wrapperRef}
      data-page={pageNum}
      className="bg-white shadow-md rounded overflow-hidden flex-shrink-0"
      style={{ width: pageSize.w, minHeight: pageSize.h }}
    >
      {/* Canvas luôn mount, chỉ clear/repaint nội dung */}
      <canvas ref={canvasRef} />

      {/* Skeleton khi chưa render */}
      {!rendered && (
        <div
          className="absolute inset-0 bg-white flex items-center justify-center"
          style={{ width: pageSize.w, height: pageSize.h }}
        >
          <div className="flex flex-col items-center gap-2 opacity-30">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">{pageNum}</span>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
export default function PdfViewer({ file, fingerprint, initialPage = 1 }) {
  const [pdfDoc, setPdfDoc]         = useState(null);
  const [numPages, setNumPages]     = useState(0);
  const [loading, setLoading]       = useState(true);
  const [isRestoring, setIsRestoring] = useState(initialPage > 1);
  const [error, setError]           = useState(null);
  const [scale, setScale]           = useState(1.0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [containerWidth, setContainerWidth] = useState(390);

  const containerRef   = useRef(null);
  const saveTimerRef   = useRef(null);
  const hasRestoredRef = useRef(false);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    hasRestoredRef.current = false;
    setIsRestoring(initialPage > 1);

    const load = async () => {
      try {
        const pdfjs = await getPdfjs();
        const doc   = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError('Không thể mở file PDF. ' + err.message);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [file]);

  // Đo containerWidth để tính scale đúng
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Scroll đến trang đã lưu sau khi DOM sẵn sàng
  useEffect(() => {
    if (!pdfDoc || numPages === 0 || hasRestoredRef.current) return;
    if (initialPage <= 1) { setIsRestoring(false); return; }

    hasRestoredRef.current = true;
    // Đợi một chút để các placeholder render xong
    const timer = setTimeout(() => {
      const target = containerRef.current?.querySelector(`[data-page="${initialPage}"]`);
      if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
      setIsRestoring(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [pdfDoc, numPages, initialPage]);

  // Theo dõi trang hiện tại khi scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const pageEls   = containerRef.current.querySelectorAll('[data-page]');
    let found = 1;
    pageEls.forEach(el => {
      if (el.offsetTop <= scrollTop + 80) found = parseInt(el.dataset.page);
    });
    setCurrentPage(found);
  }, []);

  // Callback từ PdfPage khi vào viewport
  const handlePageVisible = useCallback((pageNum) => {
    setCurrentPage(pageNum);
  }, []);

  // Lưu progress debounced
  useEffect(() => {
    if (!fingerprint || numPages === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateReadingProgress(fingerprint, currentPage, numPages);
    }, 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [currentPage, numPages, fingerprint]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Đang tải PDF...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
      <p className="text-destructive font-medium text-sm">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Overlay restore trang */}
      {isRestoring && (
        <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Đang mở trang {initialPage}...</p>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-slate-200/50 doc-scroll"
      >
        <div className="flex flex-col items-center gap-4 py-4 px-4">
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
            <PdfPage
              key={pageNum}
              pageNum={pageNum}
              pdfDoc={pdfDoc}
              scale={scale}
              containerWidth={containerWidth}
              onVisible={handlePageVisible}
            />
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-center gap-3 py-2 border-t bg-white px-4 min-h-[44px]">
        <button
          onClick={() => setScale(s => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))))}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground"
        >−</button>
        <span className="text-sm font-medium text-muted-foreground tabular-nums min-w-[80px] text-center">
          {currentPage} / {numPages} · {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(3, parseFloat((s + 0.2).toFixed(1))))}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground"
        >+</button>
      </div>
    </div>
  );
}