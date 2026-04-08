import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'error': return <XCircle className="w-6 h-6 text-red-600" />;
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      default: return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'warning': return 'bg-amber-100 dark:bg-amber-900/30';
      case 'error': return 'bg-red-100 dark:bg-red-900/30';
      case 'success': return 'bg-emerald-100 dark:bg-emerald-900/30';
      default: return 'bg-blue-100 dark:bg-blue-900/30';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`${getBgColor()} p-2 rounded-full`}>
            {getIcon()}
          </div>
          <h2 className={`text-lg font-bold text-gray-900 dark:text-white`}>{title}</h2>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 mb-6 whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-md text-sm font-medium transition-colors ${
              type === 'error' ? 'bg-red-600 hover:bg-red-700' :
              type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
              type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' :
              'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
