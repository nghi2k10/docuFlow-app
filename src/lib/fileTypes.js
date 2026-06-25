// File type detection and icon/color mapping

export const FILE_TYPES = {
  pdf: { label: 'PDF', color: '#EF4444', bg: '#FEE2E2', icon: 'FileText', extensions: ['pdf'] },
  word: { label: 'Word', color: '#2563EB', bg: '#DBEAFE', icon: 'FileText', extensions: ['docx', 'doc'] },
  excel: { label: 'Excel', color: '#16A34A', bg: '#DCFCE7', icon: 'Sheet', extensions: ['xlsx', 'xls'] },
  powerpoint: { label: 'PowerPoint', color: '#EA580C', bg: '#FFEDD5', icon: 'Presentation', extensions: ['pptx', 'ppt'] },
  unknown: { label: 'File', color: '#64748B', bg: '#F1F5F9', icon: 'File', extensions: [] },
};

export function getFileExtension(filename) {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts.pop().toLowerCase();
}

export function getFileType(filename) {
  const ext = getFileExtension(filename);
  for (const [key, type] of Object.entries(FILE_TYPES)) {
    if (type.extensions.includes(ext)) return { key, ...type, extension: ext };
  }
  return { key: 'unknown', ...FILE_TYPES.unknown, extension: ext };
}

export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt';

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function fileFingerprint(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHr < 24) return `${diffHr} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}