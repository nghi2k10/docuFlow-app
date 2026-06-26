import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2, FileX, BookOpen, Shield, CheckCircle2 } from 'lucide-react';
import { getFileType, formatFileSize, formatDate, fileFingerprint } from '@/lib/fileTypes';
import { toast } from 'react-hot-toast';
import { getRecentFiles, removeRecentFile, addRecentFile, getAnnotations } from '@/lib/storage';
import FilePicker from '@/components/FilePicker';
import FileIcon from '@/components/FileIcon';

export default function Home() {
  const navigate = useNavigate();
  const [recentFiles, setRecentFiles] = useState([]);

  useEffect(() => {
    setRecentFiles(getRecentFiles());
  }, []);

  const handleFileSelect = useCallback((file) => {
    const type = getFileType(file.name);
    if (type.key === 'unknown') {
      toast.error('Định dạng file không được hỗ trợ');
      return;
    }
    const fileInfo = {
      fingerprint: fileFingerprint(file),
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      typeKey: type.key,
      typeLabel: type.label,
      openedAt: Date.now(),
    };
    addRecentFile(fileInfo);
    sessionStorage.setItem('docreader_current_file', JSON.stringify(fileInfo));
    window.__docreader_file = file;
    navigate('/viewer');
  }, [navigate]);

  const handleRemoveRecent = (fingerprint) => {
    removeRecentFile(fingerprint);
    setRecentFiles(getRecentFiles());
  };

  const inProgress = recentFiles.filter(
    f => f.numPages > 0 && f.currentPage < f.numPages
  );
  const rest = recentFiles.filter(
    f => !(f.numPages > 0 && f.currentPage < f.numPages)
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <BookOpen className="text-white" size={20} />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-lg leading-none">DocReader</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Đọc tài liệu offline</p>
          </div>
        </div>
        <FilePicker onFileSelect={handleFileSelect} />
      </header>

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mb-8">
          <FilePicker onFileSelect={handleFileSelect} large />
          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            {[
              { label: 'PDF', color: '#EF4444' },
              { label: 'Word', color: '#2563EB' },
              { label: 'Excel', color: '#16A34A' },
              { label: 'PowerPoint', color: '#EA580C' },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-xs text-muted-foreground font-medium">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {recentFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <FileX className="text-slate-400" size={32} />
            </div>
            <p className="text-muted-foreground font-medium">Chưa có file nào</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Mở tài liệu để bắt đầu đọc</p>
          </div>
        ) : (
          <>
            {inProgress.length > 0 && (
              <>
                <SectionHeader icon={<Clock size={16} />} label="Đang đọc" count={inProgress.length} />
                <div className="space-y-2 mb-6">
                  {inProgress.map(file => (
                    <RecentFileCard
                      key={file.fingerprint}
                      file={file}
                      onOpen={() => {
                        sessionStorage.setItem('docreader_current_file', JSON.stringify(file));
                        navigate('/viewer');
                      }}
                      onRemove={() => handleRemoveRecent(file.fingerprint)}
                    />
                  ))}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <>
                <SectionHeader icon={<Clock size={16} />} label="Mở gần đây" count={rest.length} />
                <div className="space-y-2">
                  {rest.map(file => (
                    <RecentFileCard
                      key={file.fingerprint}
                      file={file}
                      onOpen={() => {
                        sessionStorage.setItem('docreader_current_file', JSON.stringify(file));
                        navigate('/viewer');
                      }}
                      onRemove={() => handleRemoveRecent(file.fingerprint)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/70 justify-center">
          <Shield size={14} />
          <span>Tài liệu xử lý trên thiết bị, không tải lên máy chủ</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, label, count }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <h2 className="font-semibold text-foreground">{label}</h2>
      </div>
      <span className="text-xs text-muted-foreground">{count} file</span>
    </div>
  );
}

function RecentFileCard({ file, onOpen, onRemove }) {
  const annotationCount = getAnnotations(file.fingerprint).length;
  const hasPdfProgress = file.numPages > 0;
  const progress = hasPdfProgress
    ? Math.round((file.currentPage / file.numPages) * 100)
    : null;
  const isDone = hasPdfProgress && file.currentPage >= file.numPages;

  return (
    <div
      className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
      onClick={onOpen}
    >
      <FileIcon filename={file.name} size={44} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-foreground truncate">{file.name}</p>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
            {formatDate(file.openedAt)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium" style={{ color: getFileType(file.name).color }}>
            {file.typeLabel || getFileType(file.name).label}
          </span>
          <span>•</span>
          <span>{formatFileSize(file.size)}</span>
          {annotationCount > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-600 font-medium">{annotationCount} highlight</span>
            </>
          )}
        </div>

        {hasPdfProgress && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isDone ? 'bg-green-500' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {isDone ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 size={12} />
                <span className="text-xs font-medium">Xong</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {file.currentPage}/{file.numPages} tr
              </span>
            )}
          </div>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-9 h-9 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}