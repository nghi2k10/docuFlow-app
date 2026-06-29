import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROW_H    = 24;
const OVERSCAN = 25;
const DEFAULT_COL_W = 100;
const ROW_NUM_W     = 48;

// ── Helpers ───────────────────────────────────────────────────────────────────
function colLetter(n) {
  let s = '';
  n++;
  while (n > 0) {
    s = String.fromCharCode(((n - 1) % 26) + 65) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function formatCell(cell) {
  if (!cell) return { value: '', formula: null, isFormula: false };
  const isFormula = !!cell.f;
  let value = '';
  if (cell.w !== undefined) {
    value = cell.w;
  } else if (cell.t === 'b') {
    value = cell.v ? 'TRUE' : 'FALSE';
  } else if (cell.v !== null && cell.v !== undefined) {
    value = String(cell.v);
  }
  return { value, formula: cell.f ? '=' + cell.f : null, isFormula };
}

function getCellStyle(s) {
  if (!s) return {};
  const style = {};
  if (s.font?.bold)        style.fontWeight   = 700;
  if (s.font?.italic)      style.fontStyle    = 'italic';
  if (s.font?.underline)   style.textDecoration = 'underline';
  if (s.font?.strike)      style.textDecoration = 'line-through';
  if (s.font?.color?.rgb)  style.color        = '#' + s.font.color.rgb.slice(-6);
  if (s.font?.sz)          style.fontSize     = Math.min(Math.max(s.font.sz * 0.9, 10), 20) + 'px';
  if (s.fill?.fgColor?.rgb) {
    const bg = s.fill.fgColor.rgb.slice(-6);
    if (bg !== 'FFFFFF' && bg !== 'ffffff' && s.fill.patternType !== 'none') {
      style.backgroundColor = '#' + bg;
    }
  }
  const align = s.alignment?.horizontal;
  style.textAlign = align || 'left';
  if (s.alignment?.wrapText) style.whiteSpace = 'normal';
  return style;
}

function getBorderStyle(s) {
  if (!s?.border) return {};
  const border = s.border;
  const toCSS = (b) => b?.style ? `1px solid ${b.color?.rgb ? '#' + b.color.rgb.slice(-6) : '#CBD5E1'}` : '1px solid #E2E8F0';
  return {
    borderTop:    border.top    ? toCSS(border.top)    : '1px solid #E2E8F0',
    borderBottom: border.bottom ? toCSS(border.bottom) : '1px solid #E2E8F0',
    borderLeft:   border.left   ? toCSS(border.left)   : '1px solid #E2E8F0',
    borderRight:  border.right  ? toCSS(border.right)  : '1px solid #E2E8F0',
  };
}

// ── Parse merge cells ─────────────────────────────────────────────────────────
function parseMerges(sheet) {
  const merges = sheet['!merges'] || [];
  // map: "r,c" → { rowspan, colspan, isMaster }
  const mergeMap = {};
  merges.forEach(({ s, e }) => {
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        const key = `${r},${c}`;
        if (r === s.r && c === s.c) {
          mergeMap[key] = { rowspan: e.r - s.r + 1, colspan: e.c - s.c + 1, isMaster: true };
        } else {
          mergeMap[key] = { hidden: true };
        }
      }
    }
  });
  return mergeMap;
}

// ── Parse chart thumbnails từ xlsx zip ───────────────────────────────────────
async function parseCharts(file, sheetIndex) {
  try {
    const JSZip = (await import('jszip')).default;
    const ab  = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);

    // Tìm drawing relationship của sheet
    const drawingRelPath = `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`;
    if (!zip.files[drawingRelPath]) return [];

    const relXml  = await zip.files[drawingRelPath].async('string');
    const relDoc  = new DOMParser().parseFromString(relXml, 'text/xml');
    const drawRel = Array.from(relDoc.getElementsByTagName('Relationship'))
      .find(r => r.getAttribute('Type')?.includes('drawing'));
    if (!drawRel) return [];

    const drawingPath = 'xl/' + drawRel.getAttribute('Target').replace('../', '');
    if (!zip.files[drawingPath]) return [];

    const drawXml = await zip.files[drawingPath].async('string');
    const drawDoc = new DOMParser().parseFromString(drawXml, 'text/xml');

    // Lấy từng chart anchor
    const anchors = [
      ...Array.from(drawDoc.getElementsByTagName('xdr:twoCellAnchor')),
      ...Array.from(drawDoc.getElementsByTagName('xdr:oneCellAnchor')),
    ];

    const charts = [];
    for (const anchor of anchors) {
      // Vị trí: from cell
      const fromEl = anchor.getElementsByTagName('xdr:from')[0];
      const col = parseInt(fromEl?.getElementsByTagName('xdr:col')[0]?.textContent || '0');
      const row = parseInt(fromEl?.getElementsByTagName('xdr:row')[0]?.textContent || '0');

      // Chart rId
      const chartEl = anchor.getElementsByTagName('c:chart')[0];
      const rId = chartEl?.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'
      );
      if (!rId) continue;

      // Resolve chart path
      const drawingDir = drawingPath.substring(0, drawingPath.lastIndexOf('/'));
      const drawingRelDir = drawingDir + '/_rels/' + drawingPath.split('/').pop() + '.rels';
      if (!zip.files[drawingRelDir]) continue;

      const chartRelXml = await zip.files[drawingRelDir].async('string');
      const chartRelDoc = new DOMParser().parseFromString(chartRelXml, 'text/xml');
      const chartRel    = Array.from(chartRelDoc.getElementsByTagName('Relationship'))
        .find(r => r.getAttribute('Id') === rId);
      if (!chartRel) continue;

      const chartPath = 'xl/' + chartRel.getAttribute('Target').replace('../', '');
      if (!zip.files[chartPath]) continue;

      // Parse chart type và title
      const chartXml = await zip.files[chartPath].async('string');
      const chartDoc = new DOMParser().parseFromString(chartXml, 'text/xml');

      const titleEl = chartDoc.getElementsByTagName('c:v')[0];
      const title   = titleEl?.textContent || 'Chart';

      // Chart type
      const chartTypes = ['barChart','lineChart','pieChart','areaChart','scatterChart','doughnutChart','radarChart'];
      let chartType = 'chart';
      for (const t of chartTypes) {
        if (chartDoc.getElementsByTagName(`c:${t}`).length > 0) { chartType = t.replace('Chart',''); break; }
      }

      charts.push({ row, col, title, chartType });
    }
    return charts;
  } catch (err) {
    console.warn('Chart parse error:', err);
    return [];
  }
}

// ── Chart icon ────────────────────────────────────────────────────────────────
function ChartIcon({ type }) {
  const icons = {
    bar:      <><rect x="2" y="10" width="4" height="10" rx="1"/><rect x="8" y="6" width="4" height="14" rx="1"/><rect x="14" y="2" width="4" height="18" rx="1"/></>,
    line:     <><polyline points="2,18 7,10 12,14 17,4 22,8" strokeWidth="2" fill="none"/></>,
    pie:      <><path d="M12 2v10l8.5 5A10 10 0 1 1 12 2z"/></>,
    area:     <><path d="M2 18 L7 10 L12 14 L17 4 L22 8 L22 18 Z" opacity=".6"/></>,
    scatter:  <><circle cx="6" cy="14" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="9" cy="17" r="2"/></>,
    doughnut: <><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 4a6 6 0 1 1 0 12A6 6 0 0 1 12 6z"/></>,
    radar:    <><polygon points="12,2 22,9 18,20 6,20 2,9"/><polygon points="12,7 17,11 15,17 9,17 7,11" opacity=".5"/></>,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0">
      {icons[type] || icons.bar}
    </svg>
  );
}

// ── Chart thumbnail component ─────────────────────────────────────────────────
function ChartThumbnail({ chart, colWidths, rowHeights }) {
  const left = colWidths.slice(0, chart.col).reduce((a, b) => a + b, 0) + ROW_NUM_W;
  const top  = rowHeights.slice(0, chart.row + 1).reduce((a, b) => a + b, 0);

  const typeLabels = { bar:'Cột', line:'Đường', pie:'Tròn', area:'Diện tích', scatter:'Phân tán', doughnut:'Vòng', radar:'Radar' };

  return (
    <div
      className="absolute z-10 pointer-events-none"
      style={{ left, top }}
    >
      <div className="bg-white border border-slate-300 rounded-lg shadow-md p-3 flex flex-col items-center gap-2 min-w-[160px]">
        <div className="text-blue-500">
          <ChartIcon type={chart.chartType} />
        </div>
        <p className="text-xs font-medium text-slate-700 text-center leading-tight">{chart.title}</p>
        <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
          Biểu đồ {typeLabels[chart.chartType] || chart.chartType}
        </span>
      </div>
    </div>
  );
}

// ── Virtual scroll hook ───────────────────────────────────────────────────────
function useVirtualRows(totalRows, containerRef) {
  const [range, setRange] = useState({ start: 0, end: Math.min(totalRows, 60) });
  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const height    = el.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const end   = Math.min(totalRows, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN);
    setRange(r => r.start === start && r.end === end ? r : { start, end });
  }, [totalRows, containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => el.removeEventListener('scroll', update);
  }, [update]);
  return range;
}

// ── Sheet parser ──────────────────────────────────────────────────────────────
function parseSheet(workbook, name) {
  const sheet   = workbook.Sheets[name];
  const ref     = sheet['!ref'];
  if (!ref) return { rows: [], maxCols: 0, colWidths: [], mergeMap: {}, rowHeights: [] };

  const range   = XLSX.utils.decode_range(ref);
  const numRows = range.e.r + 1;
  const numCols = range.e.c + 1;
  const mergeMap = parseMerges(sheet);

  const rows = [];
  for (let r = 0; r < numRows; r++) {
    const row = [];
    for (let c = 0; c < numCols; c++) {
      const addr  = XLSX.utils.encode_cell({ r, c });
      const cell  = sheet[addr];
      const s     = cell?.s;
      const { value, formula, isFormula } = formatCell(cell);
      row.push({
        value,
        formula,
        isFormula,
        style:       getCellStyle(s),
        borderStyle: getBorderStyle(s),
        merge:       mergeMap[`${r},${c}`] || null,
      });
    }
    rows.push(row);
  }

  const colWidths = Array.from({ length: numCols }, (_, i) => {
    const col = sheet['!cols']?.[i];
    if (col?.wpx) return Math.min(Math.max(col.wpx, 50), 400);
    if (col?.wch) return Math.min(Math.max(col.wch * 7, 50), 400);
    return DEFAULT_COL_W;
  });

  const rowHeights = Array.from({ length: numRows }, (_, i) => {
    const row = sheet['!rows']?.[i];
    return row?.hpx ? Math.min(Math.max(row.hpx, ROW_H), 120) : ROW_H;
  });

  return { rows, maxCols: numCols, colWidths, mergeMap, rowHeights };
}

// ── Formula bar ───────────────────────────────────────────────────────────────
function FormulaBar({ cellAddr, value, formula }) {
  return (
    <div className="flex items-center gap-0 border-b bg-white shrink-0 h-8">
      <div className="w-16 text-center text-xs font-medium text-slate-500 border-r h-full flex items-center justify-center bg-slate-50 shrink-0">
        {cellAddr}
      </div>
      <div className="flex items-center gap-1 px-2 flex-1 min-w-0">
        {formula && <span className="text-blue-500 font-mono text-xs shrink-0">ƒx</span>}
        <span className="text-xs text-slate-700 font-mono truncate">
          {formula || value}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExcelViewer({ file, searchText, annotations = [] }) {
  const [sheets, setSheets]           = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedCell, setSelectedCell] = useState({ r: 0, c: 0 });
  const [charts, setCharts]           = useState([]);
  const tableContainerRef             = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), {
          type: 'array', cellStyles: true, cellDates: true, cellNF: true, cellFormula: true,
        });
        if (!cancelled) {
          setSheets(workbook.SheetNames.map(name => ({
            name,
            ...parseSheet(workbook, name),
          })));
          setActiveSheet(0);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) { setError('Không thể đọc file Excel.'); setLoading(false); }
      }
    };
    reader.onerror = () => { if (!cancelled) { setError('Lỗi đọc file.'); setLoading(false); } };
    reader.readAsArrayBuffer(file);
    return () => { cancelled = true; };
  }, [file]);

  // Load charts khi đổi sheet
  useEffect(() => {
    if (!file) return;
    setCharts([]);
    parseCharts(file, activeSheet).then(setCharts);
  }, [file, activeSheet]);

  const current    = sheets[activeSheet];
  const totalRows  = current?.rows.length || 0;
  const { start, end } = useVirtualRows(totalRows, tableContainerRef);

  const searchLower = searchText?.trim().toLowerCase();

  const getCellMatch = useCallback((val) => {
    const str = String(val).toLowerCase();
    if (searchLower?.length >= 2 && str.includes(searchLower)) return 'search';
    if (annotations?.length) {
      const ann = annotations.find(a => a.text && str.includes(a.text.toLowerCase()));
      if (ann) return ann.color;
    }
    return false;
  }, [searchLower, annotations]);

  const matchClass = (match) => {
    if (!match) return '';
    if (match === 'search')  return 'bg-yellow-100 ring-1 ring-yellow-400 ring-inset';
    if (match === 'yellow')  return 'bg-yellow-200';
    if (match === 'green')   return 'bg-green-200';
    if (match === 'pink')    return 'bg-pink-200';
    return '';
  };

  // Cell hiện tại để hiện formula bar
  const selectedCellData = useMemo(() => {
    if (!current) return { value: '', formula: null };
    const row = current.rows[selectedCell.r];
    return row?.[selectedCell.c] || { value: '', formula: null };
  }, [current, selectedCell]);

  const selectedCellAddr = useMemo(() => {
    return colLetter(selectedCell.c) + (selectedCell.r + 1);
  }, [selectedCell]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Đang tải bảng tính...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-destructive font-medium">{error}</p>
    </div>
  );

  if (!current) return null;
  const { rows, maxCols, colWidths, rowHeights } = current;
  const headerRow  = rows[0] || [];
  const totalWidth = ROW_NUM_W + colWidths.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-0 overflow-x-auto bg-white border-b shrink-0">
          {sheets.map((sheet, i) => (
            <button
              key={i}
              onClick={() => { setActiveSheet(i); setSelectedCell({ r: 0, c: 0 }); }}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-r transition-colors ${
                i === activeSheet
                  ? 'bg-white text-green-700 border-b-2 border-b-green-600'
                  : 'bg-slate-50 text-slate-500 hover:bg-white'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Formula bar */}
      <FormulaBar
        cellAddr={selectedCellAddr}
        value={selectedCellData.value}
        formula={selectedCellData.formula}
      />

      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto relative bg-white">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Sheet trống</div>
        ) : (
          <div className="relative" style={{ width: totalWidth }}>

            {/* Chart thumbnails */}
            {charts.map((chart, i) => (
              <ChartThumbnail
                key={i}
                chart={chart}
                colWidths={colWidths}
                rowHeights={rowHeights}
              />
            ))}

            <table className="border-collapse table-fixed" style={{ width: totalWidth }}>
              <colgroup>
                <col style={{ width: ROW_NUM_W }} />
                {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>

              <thead className="sticky top-0 z-20">
                {/* Column letter row */}
                <tr>
                  <th className="bg-slate-100 border border-slate-300 text-xs text-slate-400 text-center select-none" style={{ height: ROW_H }} />
                  {Array.from({ length: maxCols }, (_, i) => (
                    <th
                      key={i}
                      className={`bg-slate-100 border border-slate-300 text-xs text-slate-500 text-center font-medium select-none ${
                        selectedCell.c === i ? 'bg-green-100 text-green-700' : ''
                      }`}
                      style={{ height: ROW_H }}
                    >
                      {colLetter(i)}
                    </th>
                  ))}
                </tr>

                {/* Freeze: header row (row 0) */}
                <tr style={{ height: rowHeights[0] || ROW_H }}>
                  <td
                    className="bg-slate-100 border border-slate-300 text-xs text-slate-400 text-center select-none"
                    onClick={() => setSelectedCell({ r: 0, c: selectedCell.c })}
                  >1</td>
                  {headerRow.map((cell, cIdx) => {
                    if (cell.merge?.hidden) return null;
                    const match = getCellMatch(cell.value);
                    return (
                      <td
                        key={cIdx}
                        colSpan={cell.merge?.colspan || 1}
                        rowSpan={cell.merge?.rowspan || 1}
                        onClick={() => setSelectedCell({ r: 0, c: cIdx })}
                        className={`border px-1.5 truncate cursor-pointer font-semibold text-xs ${matchClass(match)} ${
                          selectedCell.r === 0 && selectedCell.c === cIdx
                            ? 'ring-2 ring-blue-500 ring-inset bg-blue-50'
                            : 'hover:bg-slate-50'
                        }`}
                        style={{
                          height: rowHeights[0] || ROW_H,
                          maxWidth: colWidths[cIdx],
                          ...cell.style,
                          ...cell.borderStyle,
                        }}
                        title={cell.formula || cell.value}
                      >
                        {cell.isFormula && (
                          <span className="text-blue-400 mr-0.5 text-[10px]">ƒ</span>
                        )}
                        {cell.value}
                      </td>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* Spacer top */}
                {start > 1 && (
                  <tr style={{ height: (start - 1) * ROW_H }}>
                    <td colSpan={maxCols + 1} />
                  </tr>
                )}

                {rows.slice(Math.max(1, start), end).map((row, idx) => {
                  const rowIdx = Math.max(1, start) + idx;
                  const rh = rowHeights[rowIdx] || ROW_H;
                  return (
                    <tr
                      key={rowIdx}
                      style={{ height: rh }}
                      className={selectedCell.r === rowIdx ? 'bg-blue-50/30' : 'hover:bg-slate-50/60'}
                    >
                      {/* Row number */}
                      <td
                        className={`border border-slate-200 text-xs text-slate-400 text-center select-none sticky left-0 cursor-pointer ${
                          selectedCell.r === rowIdx ? 'bg-green-100 text-green-700 font-medium' : 'bg-slate-50'
                        }`}
                        onClick={() => setSelectedCell({ r: rowIdx, c: selectedCell.c })}
                      >
                        {rowIdx + 1}
                      </td>

                      {Array.from({ length: maxCols }, (_, cIdx) => {
                        const cell = row[cIdx] || { value: '', style: {}, borderStyle: {}, merge: null, isFormula: false };
                        if (cell.merge?.hidden) return null;
                        const match   = getCellMatch(cell.value);
                        const isSelected = selectedCell.r === rowIdx && selectedCell.c === cIdx;
                        return (
                          <td
                            key={cIdx}
                            colSpan={cell.merge?.colspan || 1}
                            rowSpan={cell.merge?.rowspan || 1}
                            onClick={() => setSelectedCell({ r: rowIdx, c: cIdx })}
                            className={`border px-1.5 text-xs truncate cursor-pointer transition-colors ${matchClass(match)} ${
                              isSelected
                                ? 'ring-2 ring-blue-500 ring-inset bg-blue-50'
                                : ''
                            }`}
                            style={{
                              height: rh,
                              maxWidth: colWidths[cIdx],
                              ...cell.style,
                              ...cell.borderStyle,
                            }}
                            title={cell.formula || cell.value}
                          >
                            {cell.isFormula && (
                              <span className="text-blue-400 mr-0.5 text-[10px]">ƒ</span>
                            )}
                            {cell.value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Spacer bottom */}
                {end < totalRows && (
                  <tr style={{ height: (totalRows - end) * ROW_H }}>
                    <td colSpan={maxCols + 1} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="border-t bg-slate-50 px-4 py-1 flex items-center gap-4 text-xs text-slate-400 shrink-0">
        <span>{totalRows} hàng · {maxCols} cột</span>
        {charts.length > 0 && <span>{charts.length} biểu đồ</span>}
        {searchLower?.length >= 2 && (
          <span className="text-yellow-700 font-medium">Tìm: "{searchText}"</span>
        )}
        {selectedCellData.formula && (
          <span className="text-blue-600 font-mono">{selectedCellData.formula}</span>
        )}
      </div>
    </div>
  );
}