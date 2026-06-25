import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Clock, Trash2, FileX, BookOpen, Shield } from 'lucide-react';
import { getFileType, formatFileSize, formatDate, fileFingerprint } from '@/lib/fileTypes';
import { toast } from 'react-hot-toast';
import { getRecentFiles, removeRecentFile, addRecentFile } from '@/lib/storage';
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
    // Pass the file via sessionStorage (File objects can't go in URL)
    sessionStorage.setItem('docreader_current_file', JSON.stringify(fileInfo));
    // Store the actual File object in a module-level variable won't survive navigation,
    // so we store via a custom event bridge
    window.__docreader_file = file;
    navigate('/viewer');
  }, [navigate]);

  const handleRemoveRecent = (fingerprint) => {
    removeRecentFile(fingerprint);
    setRecentFiles(getRecentFiles());
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Hero / Upload area */}
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

        {/* Recent files */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Mở gần đây</h2>
          </div>
          {recentFiles.length > 0 && (
            <span className="text-xs text-muted-foreground">{recentFiles.length} file</span>
          )}
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
          <div className="space-y-2">
            {recentFiles.map((file) => (
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
        )}

        {/* Privacy note */}
        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/70 justify-center">
          <Shield size={14} />
          <span>Tài liệu xử lý trên thiết bị, không tải lên máy chủ</span>
        </div>
      </div>
    </div>
  );
}

function RecentFileCard({ file, onOpen, onRemove }) {
  return (
    <div
      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
      onClick={onOpen}
    >
      <FileIcon filename={file.name} size={44} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{file.name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium" style={{ color: getFileType(file.name).color }}>
            {file.typeLabel || getFileType(file.name).label}
          </span>
          <span>•</span>
          <span>{formatFileSize(file.size)}</span>
          <span>•</span>
          <span>{formatDate(file.openedAt)}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-9 h-9 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}