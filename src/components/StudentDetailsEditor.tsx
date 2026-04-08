import React, { useState } from 'react';
import { Student } from '../types';
import { X, Copy, ClipboardPaste, Trash2, Download, Check } from 'lucide-react';
import { writeFile, utils } from 'xlsx';

interface Props {
  students: Student[];
  onUpdateStudents: (students: Student[]) => void;
  onClose: () => void;
  rosterName: string;
}

export default function StudentDetailsEditor({ students, onUpdateStudents, onClose, rosterName }: Props) {
  const [localStudents, setLocalStudents] = useState<Student[]>(students);
  const [pasteTarget, setPasteTarget] = useState<keyof Student | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [confirmClear, setConfirmClear] = useState<keyof Student | null>(null);
  const [copySuccess, setCopySuccess] = useState<keyof Student | null>(null);

  const handleUpdate = (id: string, field: keyof Student, value: string) => {
    setLocalStudents(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const saveChanges = () => {
    onUpdateStudents(localStudents);
    onClose();
  };

  const copyColumn = async (field: keyof Student) => {
    const text = localStudents.map(s => s[field] || '').join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(field);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      // Fallback for iframes
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(field);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (e) {
        console.error('Copy failed', e);
      }
      document.body.removeChild(textArea);
    }
  };

  const applyPaste = () => {
    if (!pasteTarget) return;
    const lines = pasteText.split(/\r?\n/);
    setLocalStudents(prev => prev.map((s, i) => {
      if (i < lines.length) {
        return { ...s, [pasteTarget]: lines[i].trim() };
      }
      return s;
    }));
    setPasteTarget(null);
    setPasteText('');
  };

  const applyClear = () => {
    if (!confirmClear) return;
    setLocalStudents(prev => prev.map(s => ({ ...s, [confirmClear]: '' })));
    setConfirmClear(null);
  };

  const exportRoster = () => {
    const data = localStudents.map(s => ({
      'Name': s.name,
      'Student ID': s.studentId || '',
      'Student Email': s.studentEmail || '',
      'Parent Email': s.parentEmail || '',
      'Parent Email 2': s.parentEmail2 || ''
    }));
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Roster');
    writeFile(wb, `${(rosterName || 'Class_Record').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_Roster.xlsx`);
  };

  const ColumnHeader = ({ title, field }: { title: string, field: keyof Student }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span>{title}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => copyColumn(field)} title="Copy Column" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {copySuccess === field ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
          <button type="button" onClick={() => { setPasteTarget(field); setPasteText(''); }} title="Paste Column" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><ClipboardPaste className="w-3 h-3" /></button>
          <button type="button" onClick={() => setConfirmClear(field)} title="Clear Column" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
    </th>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Student Details</h2>
          <div className="flex items-center gap-2">
            <button onClick={exportRoster} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              <Download className="w-4 h-4" /> Export Roster
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-0">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">Name</th>
                <ColumnHeader title="Student ID" field="studentId" />
                <ColumnHeader title="Student Email" field="studentEmail" />
                <ColumnHeader title="Parent Email" field="parentEmail" />
                <ColumnHeader title="Parent Email 2" field="parentEmail2" />
              </tr>
            </thead>
            <tbody>
              {localStudents.map((student, idx) => (
                <tr key={student.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                  <td className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-900 dark:text-white">
                    <input
                      type="text"
                      value={student.name}
                      onChange={(e) => handleUpdate(student.id, 'name', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="text"
                      value={student.studentId || ''}
                      onChange={(e) => handleUpdate(student.id, 'studentId', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 text-xs text-gray-900 dark:text-white"
                      placeholder="ID..."
                    />
                  </td>
                  <td className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="email"
                      value={student.studentEmail || ''}
                      onChange={(e) => handleUpdate(student.id, 'studentEmail', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 text-xs text-gray-900 dark:text-white"
                      placeholder="Student Email..."
                    />
                  </td>
                  <td className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="email"
                      value={student.parentEmail || ''}
                      onChange={(e) => handleUpdate(student.id, 'parentEmail', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 text-xs text-gray-900 dark:text-white"
                      placeholder="Parent Email..."
                    />
                  </td>
                  <td className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="email"
                      value={student.parentEmail2 || ''}
                      onChange={(e) => handleUpdate(student.id, 'parentEmail2', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 text-xs text-gray-900 dark:text-white"
                      placeholder="Parent Email 2..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors">
            Cancel
          </button>
          <button onClick={saveChanges} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors">
            Save Changes
          </button>
        </div>
      </div>

      {/* Paste Modal */}
      {pasteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Paste Data</h3>
              <button onClick={() => setPasteTarget(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Paste your list of values here (one per line). They will be applied in order.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="w-full h-48 p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="Paste values here..."
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => setPasteTarget(null)} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={applyPaste} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors">
                Apply Paste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Clear Modal */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Clear Column</h3>
              <button onClick={() => setConfirmClear(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to clear all values in this column? This action cannot be undone.
              </p>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => setConfirmClear(null)} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={applyClear} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors">
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
