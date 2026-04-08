import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowRight, BookOpen, Upload, AlertTriangle, X, CheckCircle2, Moon, Sun, Database, FolderPlus, Download, Edit2, RefreshCw } from 'lucide-react';
import { Roster, Student, ComponentConfig } from '../types';
import { getRosters, createRoster, deleteRoster, getSubjects, saveSubjects, exportAllData, importAllData, deleteAllData, getSubjectComponents, getRosterData, syncComponentsToSubject, saveRosterData } from '../utils/storage';
import { parseRosterFile } from '../utils/rosterParser';
import Footer from './Footer';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Dashboard() {
  const navigate = useNavigate();
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<'info' | 'roster-ask' | 'roster-upload'>('info');
  const [newRosterName, setNewRosterName] = useState('');
  const [newRosterDesc, setNewRosterDesc] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [importedStudents, setImportedStudents] = useState<Student[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [isEditDescriptionsModalOpen, setIsEditDescriptionsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string>('');
  const [editingComponents, setEditingComponents] = useState<ComponentConfig[]>([]);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const loadedRosters = getRosters();
    setRosters(loadedRosters);

    const extractedSubjects = new Set<string>();
    loadedRosters.forEach(r => {
      const match = r.name.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        extractedSubjects.add(match[2].trim());
      }
    });
    
    const savedSubjects = getSubjects();
    savedSubjects.forEach(s => extractedSubjects.add(s));
    
    const finalSubjects = Array.from(extractedSubjects).sort();
    setSubjects(finalSubjects);
    if (savedSubjects.length !== finalSubjects.length) {
      saveSubjects(finalSubjects);
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const resetModal = () => {
    setIsModalOpen(false);
    setModalStep('info');
    setNewRosterName('');
    setNewRosterDesc('');
    setImportedStudents(null);
    setImportError(null);
    setIsProcessing(false);
    setSelectedSubject(null);
  };

  const exportSubjectComponentsPDF = (subject: string) => {
    let components = getSubjectComponents(subject);
    if (!components) {
      // Fallback: try to get components from the first class of this subject
      const subjectRosters = rosters.filter(r => {
        const match = r.name.match(/^(.*?)\s*\((.*?)\)$/);
        return match && match[2].trim() === subject;
      });
      if (subjectRosters.length > 0) {
        const data = getRosterData(subjectRosters[0].id);
        if (data) components = data.components;
      }
    }

    if (!components) {
      alert(`No grading components found for subject "${subject}". Please sync components from a class first.`);
      return;
    }

    // PDF format: 8.5 x 13 inches (legal), lengthwise (portrait)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [8.5, 13]
    });

    const pdfYear1 = localStorage.getItem('pdfYear1') || 'YYYY';
    const pdfYear2 = localStorage.getItem('pdfYear2') || 'YYYY';
    const pdfTerm = localStorage.getItem('pdfTerm') || 'Term';

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('De La Salle Santiago Zobel School - Vermosa', 4.25, 1.1, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`AY ${pdfYear1}-${pdfYear2} (${pdfTerm})`, 4.25, 1.4, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(subject, 4.25, 1.8, { align: 'center' });

    let yPos = 2.2;

    const componentOrder = ['written-work', 'performance-task', 'end-term'];
    const componentTitles: Record<string, string> = {
      'written-work': 'Written Work',
      'performance-task': 'Performance Task',
      'end-term': 'End-Term Assessment'
    };
    const sisPrefixes: Record<string, string> = {
      'written-work': 'ww',
      'performance-task': 'pr',
      'end-term': 'ea'
    };
    const defaultTaskNames: Record<string, string> = {
      'written-work': 'Written Work',
      'performance-task': 'Performance Task',
      'end-term': 'End-Term Assessment'
    };

    componentOrder.forEach(type => {
      const comp = components!.find(c => c.id === type);
      if (!comp) return;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${componentTitles[type]} (${comp.weight}%)`, 1, yPos);
      yPos += 0.3;

      const tableData: any[][] = [];
      let totalPoints = 0;

      comp.subComponents.forEach((sub, index) => {
        const num = index + 1;
        const sisCode = `${sisPrefixes[type]}${num.toString().padStart(2, '0')}`;
        
        let taskName = '';
        const defaultName = type === 'end-term' ? defaultTaskNames[type] : `${defaultTaskNames[type]} ${num}`;
        
        if (sub.description && sub.description.trim() !== '') {
          taskName = `${sub.description} (${sub.name})`;
        } else {
          taskName = `${defaultName} (${sub.name})`;
        }

        tableData.push([sisCode, taskName, sub.totalScore.toString()]);
        totalPoints += sub.totalScore;
      });

      // Total row
      tableData.push(['', 'Total', totalPoints.toString()]);

      autoTable(doc, {
        startY: yPos,
        head: [['SIS Code', 'Name of Task', 'Points']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 12, cellPadding: 0.08, lineWidth: 0.01, halign: 'center' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, halign: 'center', fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 1.5 },
          1: { },
          2: { cellWidth: 1.5 }
        },
        didParseCell: (data) => {
           if (data.row.index === tableData.length - 1) {
             data.cell.styles.fontStyle = 'bold';
             data.cell.styles.fillColor = [255, 255, 0]; // Yellow
             data.cell.styles.textColor = [0, 0, 0]; // Black text
           }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 0.4;
      
      // Add new page if needed
      if (yPos > 12.2) {
        doc.addPage();
        yPos = 1;
      }
    });

    doc.save(`${subject}_Grade_Components.pdf`);
  };

  const openEditDescriptions = (subject: string) => {
    setEditingSubject(subject);
    let components = getSubjectComponents(subject);
    
    if (!components) {
      // Fallback: try to get components from the first class of this subject
      const subjectRosters = rosters.filter(r => {
        const match = r.name.match(/^(.*?)\s*\((.*?)\)$/);
        return match && match[2].trim() === subject;
      });
      if (subjectRosters.length > 0) {
        const data = getRosterData(subjectRosters[0].id);
        if (data) components = data.components;
      }
    }

    if (!components) {
      alert(`No grading components found for subject "${subject}". Please sync components from a class first.`);
      return;
    }

    setEditingComponents(components);
    setIsEditDescriptionsModalOpen(true);
  };

  const saveSubjectDescriptions = () => {
    syncComponentsToSubject(editingSubject, editingComponents);
    
    // Also update any existing rosters in memory if they belong to this subject
    rosters.forEach(r => {
      const match = r.name.match(/^(.*?)\s*\((.*?)\)$/);
      if (match && match[2].trim() === editingSubject) {
        const data = getRosterData(r.id);
        if (data) {
          data.components = editingComponents;
          saveRosterData(r.id, data);
        }
      }
    });
    
    setSyncMessage({ type: 'success', text: `Descriptions synced to all classes for subject "${editingSubject}".` });
    setIsEditDescriptionsModalOpen(false);
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRosterName.trim()) return;
    setModalStep('roster-ask');
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const updatedSubjects = [...new Set([...subjects, newSubjectName.trim()])].sort();
    setSubjects(updatedSubjects);
    saveSubjects(updatedSubjects);
    setNewSubjectName('');
    setIsSubjectModalOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportError(null);
    
    const result = await parseRosterFile(file);
    
    setIsProcessing(false);
    if (result.error) {
      setImportError(result.error);
    } else {
      setImportedStudents(result.students);
    }
  };

  const finalizeCreation = () => {
    const finalName = selectedSubject && selectedSubject !== 'Uncategorized' 
      ? `${newRosterName.trim()} (${selectedSubject})` 
      : newRosterName.trim();
    createRoster(finalName, newRosterDesc, importedStudents || undefined);
    setRosters(getRosters());
    resetModal();
  };

  const initiateDeleteRoster = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmationId(id);
  };

  const confirmDeleteRoster = () => {
    if (deleteConfirmationId) {
      deleteRoster(deleteConfirmationId);
      setRosters(rosters.filter((r) => r.id !== deleteConfirmationId));
      setDeleteConfirmationId(null);
    }
  };

  const deleteSubject = (subject: string) => {
    setSubjectToDelete(subject);
  };

  const confirmDeleteSubject = () => {
    if (subjectToDelete) {
      const updatedSubjects = subjects.filter(s => s !== subjectToDelete);
      setSubjects(updatedSubjects);
      saveSubjects(updatedSubjects);
      setSubjectToDelete(null);
    }
  };

  const downloadRosterTemplate = () => {
    const headers = ['Student Name', 'Student ID', 'Student Email', 'Parent Email 1', 'Parent Email 2'];
    const sampleData = [
      ['John Doe', '1001', 'john.doe@school.edu', 'parent1@email.com', ''],
      ['Jane Smith', '1002', 'jane.smith@school.edu', 'jane.parent1@email.com', 'jane.parent2@email.com']
    ];
    
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Class_Roster_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const groupedRosters = rosters.reduce((acc, roster) => {
    const match = roster.name.match(/^(.*?)\s*\((.*?)\)$/);
    const subject = match ? match[2].trim() : 'Uncategorized';
    if (!acc[subject]) acc[subject] = [];
    acc[subject].push(roster);
    return acc;
  }, {} as Record<string, Roster[]>);

  subjects.forEach(sub => {
    if (!groupedRosters[sub]) groupedRosters[sub] = [];
  });

  const sortedSubjects = Object.keys(groupedRosters).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-200">
      <div className="flex-1 p-3 sm:p-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Class Rosters</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your classes and grading sheets</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadRosterTemplate}
                className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="Download Roster Template"
              >
                <Download size={20} />
              </button>
              <button
                onClick={() => setShowDataModal(true)}
                className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="Data Management"
              >
                <Database size={20} />
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={() => setIsSubjectModalOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <FolderPlus size={20} />
                <span className="hidden sm:inline">New Subject</span>
              </button>
            </div>
          </div>

        {sortedSubjects.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="text-indigo-600 dark:text-indigo-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No subjects yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2 mb-6">Create your first subject to get started</p>
            <button
              onClick={() => setIsSubjectModalOpen(true)}
              className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              Create a Subject <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedSubjects.map((subject) => (
              <div key={subject} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{subject}</h2>
                    {subject !== 'Uncategorized' && groupedRosters[subject].length === 0 && (
                      <button
                        onClick={() => deleteSubject(subject)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Delete empty subject"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => exportSubjectComponentsPDF(subject)}
                    className="text-sm flex items-center gap-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 font-medium"
                  >
                    <Download size={16} /> Export
                  </button>
                  <button
                    onClick={() => openEditDescriptions(subject)}
                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors font-medium border border-indigo-100 dark:border-indigo-800"
                  >
                    <Edit2 size={16} /> Edit Descriptions
                  </button>
                  <button
                    onClick={() => {
                      setSelectedSubject(subject);
                      setIsModalOpen(true);
                    }}
                    className="text-sm flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                  >
                    <Plus size={16} /> Add Class
                  </button>
                </div>
              </div>
                
                {groupedRosters[subject].length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No classes in this subject yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedRosters[subject].map((roster) => {
                      const match = roster.name.match(/^(.*?)\s*\((.*?)\)$/);
                      const displayName = match ? match[1].trim() : roster.name;
                      
                      return (
                        <div
                          key={roster.id}
                          onClick={() => navigate(`/roster/${roster.id}`)}
                          className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all cursor-pointer group relative"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/50 transition-colors">
                              <BookOpen className="text-indigo-600 dark:text-indigo-400" size={20} />
                            </div>
                            <button
                              onClick={(e) => initiateDeleteRoster(roster.id, e)}
                              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{displayName}</h3>
                          {roster.description && (
                            <p className="text-gray-500 dark:text-gray-400 text-xs mb-3 line-clamp-2">{roster.description}</p>
                          )}
                          <div className="flex items-center text-xs text-gray-400 dark:text-gray-500 mt-auto">
                            <span>Created {new Date(roster.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create Subject Modal */}
        {isSubjectModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New Subject</h2>
              <form onSubmit={handleSubjectSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subject Name
                  </label>
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="e.g., Science, Mathematics"
                    required
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSubjectModalOpen(false);
                      setNewSubjectName('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Create Subject
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Data Management Modal */}
        {showDataModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Data Management</h2>
                <button onClick={() => setShowDataModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-1">Backup Data</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Download all your classes, students, and settings as a JSON file.</p>
                  <button
                    onClick={exportAllData}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                  >
                    Export All Data (JSON)
                  </button>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-1">Restore Data</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Import a previously exported JSON backup file.</p>
                  <input
                    type="file"
                    accept=".json"
                    id="import-json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (importAllData(ev.target?.result as string)) {
                            window.location.reload();
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="import-json"
                    className="w-full py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium flex justify-center cursor-pointer"
                  >
                    Import Data (JSON)
                  </label>
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900/30">
                  <h3 className="font-medium text-red-800 dark:text-red-400 mb-1">Danger Zone</h3>
                  <p className="text-xs text-red-600 dark:text-red-500 mb-3">Permanently delete all data from this browser.</p>
                  <button
                    onClick={() => {
                      setShowDataModal(false);
                      setShowDeleteAllConfirm(true);
                    }}
                    className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Delete All Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete All Data Confirm Modal */}
        {showDeleteAllConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
                <AlertTriangle size={24} />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delete All Data?</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you absolutely sure you want to permanently delete all classes, students, scores, and settings? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteAllConfirm(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deleteAllData();
                    window.location.reload();
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Yes, Delete Everything
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Subject Confirm Modal */}
        {subjectToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Subject?</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete the subject "{subjectToDelete}"?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setSubjectToDelete(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteSubject}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Delete Subject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Descriptions Modal */}
        {isEditDescriptionsModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-start mb-6 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Edit Subject Descriptions
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Editing descriptions for subject: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{editingSubject}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setIsEditDescriptionsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {editingComponents.map((comp) => (
                  <div key={comp.id} className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">{comp.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-medium">{comp.weight}%</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {comp.subComponents.map((sub) => (
                        <div key={sub.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{sub.name}</span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">/{sub.totalScore}</span>
                          </div>
                          <textarea
                            value={sub.description || ''}
                            onChange={(e) => {
                              const newDescription = e.target.value;
                              setEditingComponents(prev => prev.map(c => {
                                if (c.id === comp.id) {
                                  return {
                                    ...c,
                                    subComponents: c.subComponents.map(s => {
                                      if (s.id === sub.id) return { ...s, description: newDescription };
                                      return s;
                                    })
                                  };
                                }
                                return c;
                              }));
                            }}
                            className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 h-16 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                            placeholder="Add description..."
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5" />
                  Changes will be synced to all classes of this subject.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditDescriptionsModalOpen(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSubjectDescriptions}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                  >
                    Save & Sync
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sync Success Toast */}
        {syncMessage && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
            <div className={`px-4 py-2 rounded-full shadow-lg flex items-center gap-2 ${
              syncMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {syncMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span className="text-sm font-medium">{syncMessage.text}</span>
            </div>
          </div>
        )}

        {/* Create Roster Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
              
              {modalStep === 'info' && (
                <>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New Class</h2>
                  <form onSubmit={handleInfoSubmit}>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Class Name {selectedSubject && selectedSubject !== 'Uncategorized' && <span className="text-gray-400 font-normal ml-1">will be saved as "{newRosterName || 'Name'} ({selectedSubject})"</span>}
                      </label>
                      <input
                        type="text"
                        value={newRosterName}
                        onChange={(e) => setNewRosterName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder="e.g., Grade 10 - Science"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (Optional)
                      </label>
                      <textarea
                        value={newRosterDesc}
                        onChange={(e) => setNewRosterDesc(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder="Add details about this class..."
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={resetModal}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </form>
                </>
              )}

              {modalStep === 'roster-ask' && (
                <div className="text-center py-4">
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="text-indigo-600 dark:text-indigo-400" size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Add Student Roster?</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-8">
                    Would you like to import your student list now? You can upload a spreadsheet file (.csv, .xlsx).
                  </p>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setModalStep('roster-upload')}
                      className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <Upload size={18} />
                      Yes, Import Roster
                    </button>
                    <button
                      onClick={finalizeCreation}
                      className="w-full py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
                    >
                      No, Create Empty Class
                    </button>
                    <button
                      onClick={() => setModalStep('info')}
                      className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-2"
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              )}

              {modalStep === 'roster-upload' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Import Roster</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Upload a spreadsheet containing student names. We'll automatically detect the columns.
                  </p>

                  <div className="mb-6">
                    {!importedStudents ? (
                      <div className="relative border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-8 text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          accept=".csv, .xlsx, .xls, .numbers"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isProcessing}
                        />
                        <div className="flex flex-col items-center">
                          {isProcessing ? (
                            <div className="w-10 h-10 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin mb-3"></div>
                          ) : (
                            <Upload className="text-gray-400 dark:text-gray-500 mb-3" size={32} />
                          )}
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {isProcessing ? 'Processing file...' : 'Click or drag file to upload'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">CSV or Excel files</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={24} />
                        <div>
                          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                            {importedStudents.length} Students Found
                          </p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">Roster successfully parsed</p>
                        </div>
                        <button 
                          onClick={() => setImportedStudents(null)}
                          className="ml-auto text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}

                    {importError && (
                      <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={20} />
                        <p className="text-xs text-red-700 dark:text-red-200">{importError}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setModalStep('roster-ask')}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      disabled={isProcessing}
                    >
                      Back
                    </button>
                    <button
                      onClick={finalizeCreation}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!importedStudents || isProcessing}
                    >
                      Finish & Create
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Delete Confirmation Modal */}
        {deleteConfirmationId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
                <AlertTriangle size={24} />
                <h2 className="text-xl font-bold">Delete Class?</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Are you sure you want to delete this class roster? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirmationId(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRoster}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
