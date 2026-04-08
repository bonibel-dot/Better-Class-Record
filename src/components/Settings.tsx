import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Settings as SettingsIcon, RotateCcw, AlertTriangle, ArrowLeft, Mail, FileText, Upload, Download, Moon, Sun, X, Save, Edit2, Bold, Italic, Underline, Paperclip, RefreshCw, Check } from 'lucide-react';
import { ComponentConfig, Student, DEFAULT_COMPONENTS, DEFAULT_STUDENTS, EmailTemplate, DEFAULT_EMAIL_TEMPLATES, Scenario, StoredFile, TransmutationFormula } from '../types';
import { getRosterData, saveRosterData, getGlobalTemplates, saveGlobalTemplates, getRosters } from '../utils/storage';
import { saveFile, getFiles, deleteFile } from '../utils/fileStorage';
import Footer from './Footer';

import { Modal } from './Modal';

export default function Settings() {
  const { rosterId } = useParams<{ rosterId: string }>();
  const navigate = useNavigate();
  
  const [rosterName, setRosterName] = useState('Class Record');
  const [rosterDescription, setRosterDescription] = useState('');
  const [adviserEmail, setAdviserEmail] = useState('');
  const [emailClient, setEmailClient] = useState<'default' | 'gmail'>('default');
  const [makeupCycle, setMakeupCycle] = useState('');
  const [makeupDay, setMakeupDay] = useState('');
  const [makeupTime, setMakeupTime] = useState('');
  const [makeupLocation, setMakeupLocation] = useState('');
  const [incentiveMode, setIncentiveMode] = useState<'both' | 'ww_only'>('both');
  const [showExtraPoints, setShowExtraPoints] = useState<boolean>(true);
  const [transmutationFormula, setTransmutationFormula] = useState<TransmutationFormula>('default');
  const [components, setComponents] = useState<ComponentConfig[]>(DEFAULT_COMPONENTS);
  const [students, setStudents] = useState<Student[]>(DEFAULT_STUDENTS);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(DEFAULT_EMAIL_TEMPLATES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'templates' | 'files'>('general');
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  // Template Editing State
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateEditorMode, setTemplateEditorMode] = useState<'student' | 'parent'>('student');
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);

  // Load data
  useEffect(() => {
    if (!rosterId) {
      navigate('/');
      return;
    }

    const data = getRosterData(rosterId);
    if (data) {
      setComponents(data.components);
      setStudents(data.students);
      setRosterName(data.name);
      setRosterDescription(data.description || '');
      setAdviserEmail(data.adviserEmail || '');
      setEmailClient(data.emailClient || 'default');
      setMakeupCycle(data.makeupCycle || '');
      setMakeupDay(data.makeupDay || '');
      setMakeupTime(data.makeupTime || '');
      setMakeupLocation(data.makeupLocation || '');
      setIncentiveMode(data.incentiveMode || 'both');
      setShowExtraPoints(data.showExtraPoints !== false); // Default to true
      setTransmutationFormula(data.transmutationFormula || 'default');
      
      // Load templates: prefer class-specific, fallback to global
      let templates = data.emailTemplates && data.emailTemplates.length > 0 
        ? data.emailTemplates 
        : getGlobalTemplates();
      
      // Merge missing default templates
      const missingTemplates = DEFAULT_EMAIL_TEMPLATES.filter(
        dt => !templates.some(st => st.id === dt.id)
      );
      if (missingTemplates.length > 0) {
        templates = [...templates, ...missingTemplates];
      }
      
      setEmailTemplates(templates);
      
      setIsLoaded(true);
    } else {
      navigate('/');
    }
    
    loadFiles();
  }, [rosterId, navigate]);

  const loadFiles = async () => {
    const files = await getFiles();
    setStoredFiles(files);
  };

  // Save data on change
  useEffect(() => {
    if (rosterId && isLoaded) {
      saveRosterData(rosterId, {
        id: rosterId,
        name: rosterName,
        description: rosterDescription,
        adviserEmail,
        emailClient,
        makeupCycle,
        makeupDay,
        makeupTime,
        makeupLocation,
        incentiveMode,
        showExtraPoints,
        transmutationFormula,
        components,
        students,
        emailTemplates
      });
    }
  }, [components, students, rosterId, rosterName, rosterDescription, adviserEmail, emailClient, makeupCycle, makeupDay, makeupTime, makeupLocation, incentiveMode, showExtraPoints, transmutationFormula, emailTemplates, isLoaded]);

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const totalWeight = components.reduce((sum, comp) => sum + comp.weight, 0);

  const updateWeight = (id: string, weight: number) => {
    setComponents(components.map(comp => 
      comp.id === id ? { ...comp, weight } : comp
    ));
  };

  const updateSubComponentScore = (compId: string, subId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setComponents(components.map(comp => {
      if (comp.id === compId) {
        return {
          ...comp,
          subComponents: comp.subComponents.map(sub => 
            sub.id === subId ? { ...sub, totalScore: numValue } : sub
          )
        };
      }
      return comp;
    }));
  };

  const addSubComponent = (compId: string) => {
    setComponents(components.map(comp => {
      if (comp.id === compId) {
        const prefix = comp.id === 'written-work' ? 'WW' : comp.id === 'performance-task' ? 'PT' : 'ET';
        const nextNum = comp.subComponents.length + 1;
        const newId = `${prefix.toLowerCase()}${nextNum}`;
        
        // Ensure unique ID
        let uniqueId = newId;
        let counter = 1;
        while (comp.subComponents.some(s => s.id === uniqueId)) {
          uniqueId = `${newId}_${counter++}`;
        }

        return {
          ...comp,
          subComponents: [
            ...comp.subComponents,
            { 
              id: uniqueId, 
              name: `${prefix}${nextNum}`, 
              totalScore: 20 
            }
          ]
        };
      }
      return comp;
    }));
  };

  const removeSubComponent = (compId: string, subId: string) => {
    setComponents(components.map(comp => {
      if (comp.id === compId) {
        return {
          ...comp,
          subComponents: comp.subComponents.filter(s => s.id !== subId)
        };
      }
      return comp;
    }));
  };

  const [resetWeightsCandidate, setResetWeightsCandidate] = useState<boolean>(false);
  const [deleteTemplateCandidate, setDeleteTemplateCandidate] = useState<string | null>(null);

  const resetDefaults = () => {
    setResetWeightsCandidate(true);
  };

  const confirmResetWeights = () => {
    setComponents(DEFAULT_COMPONENTS);
    setResetWeightsCandidate(false);
  };

  // Template Management
  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    
    let updatedTemplates;
    if (emailTemplates.some(t => t.id === editingTemplate.id)) {
      updatedTemplates = emailTemplates.map(t => t.id === editingTemplate.id ? editingTemplate : t);
    } else {
      updatedTemplates = [...emailTemplates, editingTemplate];
    }
    
    setEmailTemplates(updatedTemplates);
    // Also save globally immediately to ensure persistence
    saveGlobalTemplates(updatedTemplates);
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = (id: string) => {
    setDeleteTemplateCandidate(id);
  };

  const confirmDeleteTemplate = () => {
    if (deleteTemplateCandidate) {
      const updatedTemplates = emailTemplates.filter(t => t.id !== deleteTemplateCandidate);
      setEmailTemplates(updatedTemplates);
      saveGlobalTemplates(updatedTemplates);
      setDeleteTemplateCandidate(null);
    }
  };

  const [syncCandidate, setSyncCandidate] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<number | null>(null);
  const [alertMessage, setAlertMessage] = useState<{title: string, message: string, type: 'error' | 'success'} | null>(null);

  const handleSyncTemplates = () => {
    setSyncCandidate(true);
  };

  const confirmSyncTemplates = () => {
    const allRosters = getRosters();
    let syncCount = 0;
    allRosters.forEach(roster => {
      if (roster.id !== rosterId) {
        const data = getRosterData(roster.id);
        if (data) {
          data.emailTemplates = emailTemplates;
          saveRosterData(roster.id, data);
          syncCount++;
        }
      }
    });
    
    // Also save as global default for future classes
    saveGlobalTemplates(emailTemplates);
    
    setSyncCandidate(false);
    setSyncResult(syncCount);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await saveFile(file);
      await loadFiles();
    }
  };

  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  const handleFileDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteCandidate(id);
  };

  const confirmFileDelete = async () => {
    if (!deleteCandidate) return;
    
    try {
      // Optimistic update
      setStoredFiles(prev => prev.filter(f => f.id !== deleteCandidate));
      
      await deleteFile(deleteCandidate);
      
      // Sync with DB after a short delay
      setTimeout(() => loadFiles(), 500);
    } catch (error) {
      console.error('Failed to delete file:', error);
      setAlertMessage({ title: 'Error', message: 'Failed to delete file. Please try again.', type: 'error' });
      loadFiles(); // Revert on error
    } finally {
      setDeleteCandidate(null);
    }
  };



  const toggleTemplateAttachment = (fileName: string) => {
    if (!editingTemplate) return;
    
    const currentAttachments = editingTemplate.attachments || [];
    // Handle legacy string attachments vs object attachments if we were to support them fully, 
    // but for now let's stick to string filenames as per current implementation, 
    // but we will match them against stored files.
    
    // Actually, let's just use the filename for now as the ID reference since that's how the email system works currently
    const exists = currentAttachments.includes(fileName);
    
    let newAttachments;
    if (exists) {
      newAttachments = currentAttachments.filter(a => (typeof a === 'string' ? a : a.name) !== fileName);
    } else {
      newAttachments = [...currentAttachments, fileName];
    }
    
    setEditingTemplate({ ...editingTemplate, attachments: newAttachments });
  };

  if (!isLoaded) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading settings...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-200">
      {/* Sync Templates Confirmation Modal */}
      {syncCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-4">
              <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Sync Templates?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to sync these templates to all other classes? This will overwrite their existing templates.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSyncCandidate(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmSyncTemplates}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Sync Templates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Templates Success Modal */}
      {syncResult !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-4">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full">
                <Check className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Success</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Successfully synced templates to {syncResult} other class(es).
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => setSyncResult(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <Modal
        isOpen={!!alertMessage}
        title={alertMessage?.title || ''}
        message={alertMessage?.message || ''}
        type={alertMessage?.type || 'info'}
        onConfirm={() => setAlertMessage(null)}
      />

      {/* Reset Weights Confirmation Modal */}
      {resetWeightsCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-4">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Reset Weights?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to reset weights and components to default? This will remove custom columns.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetWeightsCandidate(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetWeights}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      {deleteTemplateCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Delete Template?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete this template?
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTemplateCandidate(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTemplate}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete File Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Delete File?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete this file? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmFileDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(`/roster/${rosterId}`)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              title="Back to Scoresheet"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          </div>
          
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'general' 
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              General & Grading
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'templates' 
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Mail className="w-4 h-4" />
              Email Templates
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'files' 
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              File Library
            </button>
          </nav>

          {/* Content Area */}
          <div className="flex-1 space-y-6">
            
            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Weights Warning */}
                {totalWeight !== 100 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-medium">Total weight must sum to 100% (Current: {totalWeight}%)</p>
                  </div>
                )}

                {/* General Settings */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">General Configuration</h2>
                    <button 
                      onClick={resetDefaults}
                      className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Class/Subject Name</label>
                        <input
                          type="text"
                          value={rosterName}
                          onChange={(e) => setRosterName(e.target.value)}
                          className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Class Adviser Email (CC)</label>
                        <input
                          type="email"
                          value={adviserEmail}
                          onChange={(e) => setAdviserEmail(e.target.value)}
                          placeholder="adviser@school.edu"
                          className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Client Preference</label>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <label className={`flex items-center gap-3 cursor-pointer p-3 border rounded-xl transition-all flex-1 ${emailClient === 'default' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                          <input
                            type="radio"
                            name="emailClient"
                            value="default"
                            checked={emailClient === 'default'}
                            onChange={() => setEmailClient('default')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">Default App (Mail, Outlook)</span>
                        </label>
                        <label className={`flex items-center gap-3 cursor-pointer p-3 border rounded-xl transition-all flex-1 ${emailClient === 'gmail' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                          <input
                            type="radio"
                            name="emailClient"
                            value="gmail"
                            checked={emailClient === 'gmail'}
                            onChange={() => setEmailClient('gmail')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">Gmail Web</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Make-up Schedule Configuration */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Make-up Schedule Configuration</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">These details will be automatically inserted into make-up emails.</p>
                  </div>
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Cycle</label>
                      <input
                        type="text"
                        value={makeupCycle}
                        onChange={(e) => setMakeupCycle(e.target.value)}
                        placeholder="e.g. 1"
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Day</label>
                      <input
                        type="text"
                        value={makeupDay}
                        onChange={(e) => setMakeupDay(e.target.value)}
                        placeholder="e.g. Tuesday"
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Time</label>
                      <input
                        type="text"
                        value={makeupTime}
                        onChange={(e) => setMakeupTime(e.target.value)}
                        placeholder="e.g. 2:30 PM – 3:30 PM"
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
                      <input
                        type="text"
                        value={makeupLocation}
                        onChange={(e) => setMakeupLocation(e.target.value)}
                        placeholder="e.g. Room 304"
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                  </div>
                </section>

                {/* Incentives Configuration */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Incentives Configuration</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure how incentives are applied to student grades.</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="max-w-md">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Incentive Mode</label>
                      <select
                        value={incentiveMode}
                        onChange={(e) => setIncentiveMode(e.target.value as 'both' | 'ww_only')}
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="both">Both WW and PT Incentives</option>
                        <option value="ww_only">Only WW Incentives</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Choose whether to allow incentives for both Written Works and Performance Tasks, or only Written Works.
                      </p>
                    </div>

                    <div className="max-w-md">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Transmutation Formula</label>
                      <select
                        value={transmutationFormula}
                        onChange={(e) => setTransmutationFormula(e.target.value as TransmutationFormula)}
                        className="w-full p-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="default">Default (DepEd 60% Passing)</option>
                        <option value="deped">Standard DepEd Table</option>
                        <option value="base-50">Linear Base 50</option>
                        <option value="base-60">Linear Base 60</option>
                        <option value="base-0">Raw Percentage (Base 0)</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Select the formula used to calculate the transmuted grade from the raw percentage.
                      </p>
                    </div>

                    <div className="max-w-md">
                      <label className="flex items-center gap-3">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={showExtraPoints}
                            onChange={(e) => setShowExtraPoints(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">Show Extra Points Column</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            When incentives are toggled on, display the total extra points added to the final grade.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Component Settings */}
                <section className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white px-1">Grading Components</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {components.map(comp => (
                      <div key={comp.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{comp.name}</h3>
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Weight %</label>
                            <input 
                              type="number" 
                              value={isNaN(comp.weight) ? '' : comp.weight}
                              onChange={(e) => updateWeight(comp.id, parseFloat(e.target.value))}
                              className="w-16 p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500 text-center font-mono"
                            />
                          </div>
                        </div>
                        
                        <div className="p-4">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assessments</label>
                            </div>
                            
                            <div className="space-y-2">
                              {comp.subComponents.map(sub => (
                                <div key={sub.id} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 group hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                  <div className="flex items-center gap-3 flex-1">
                                    <span className="font-medium text-gray-700 dark:text-gray-200">{sub.name}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 dark:text-gray-400">Max:</span>
                                      <input 
                                        type="number"
                                        min="1"
                                        value={sub.totalScore}
                                        onChange={(e) => updateSubComponentScore(comp.id, sub.id, e.target.value)}
                                        className="w-16 p-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-center"
                                      />
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => removeSubComponent(comp.id, sub.id)}
                                      className={`text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md ${comp.id === 'end-term' ? 'hidden' : ''}`}
                                      title="Remove column"
                                      disabled={comp.id === 'end-term'}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {comp.id !== 'end-term' && (
                              <button 
                                type="button"
                                onClick={() => addSubComponent(comp.id)}
                                className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2.5 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800 transition-colors font-medium"
                              >
                                <Plus className="w-4 h-4" /> Add Assessment
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'templates' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Email Templates</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSyncTemplates}
                      className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                    >
                      <RotateCcw className="w-4 h-4" /> Sync to Other Classes
                    </button>
                    <button
                      onClick={() => setEditingTemplate({
                        id: crypto.randomUUID(),
                        name: 'New Template',
                        subject: '[{subjectName}] - Update',
                        body: 'Good day {studentFirstName},\n\n...',
                        attachments: [],
                        scenario: 'default',
                        triggerCondition: 'none'
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" /> New Template
                    </button>
                  </div>
                </div>

                {editingTemplate ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">Edit Template</h3>
                      <button onClick={() => setEditingTemplate(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                        <input
                          type="text"
                          value={editingTemplate.name}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scenario Trigger</label>
                        <select
                          value={['default', 'passing', 'failing', 'missing', 'end-term'].includes(editingTemplate.scenario ?? 'default') ? (editingTemplate.scenario ?? 'default') : 'custom'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'custom') {
                              setEditingTemplate({ ...editingTemplate, scenario: 'custom_scenario' });
                            } else {
                              setEditingTemplate({ ...editingTemplate, scenario: val as Scenario });
                            }
                          }}
                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="default">Default / Manual Selection</option>
                          <option value="passing">Passing Scores</option>
                          <option value="failing">Failing Scores</option>
                          <option value="missing">Missing Assessments</option>
                          <option value="end-term">End-Term Result</option>
                          <option value="custom">Custom Trigger...</option>
                        </select>
                        {!['default', 'passing', 'failing', 'missing', 'end-term'].includes(editingTemplate.scenario ?? 'default') && (
                          <div className="mt-2 space-y-2">
                            <input
                              type="text"
                              value={editingTemplate.scenario}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, scenario: e.target.value })}
                              placeholder="Enter custom scenario name..."
                              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <select
                              value={editingTemplate.triggerCondition || 'none'}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, triggerCondition: e.target.value as any })}
                              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="none">No Automatic Selection</option>
                              <option value="all">Automatically Select All Scores</option>
                              <option value="failing">Automatically Select Failing Scores</option>
                              <option value="missing">Automatically Select Missing Scores</option>
                              <option value="passing">Automatically Select Passing Scores</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Define what scores should be automatically selected when this template is chosen.
                            </p>
                          </div>
                        )}
                        <div className="mt-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingTemplate.isDisciplinary || false}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, isDisciplinary: e.target.checked })}
                              className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disciplinary Action</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setTemplateEditorMode('student')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          templateEditorMode === 'student'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        Student Version
                      </button>
                      <button
                        onClick={() => setTemplateEditorMode('parent')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          templateEditorMode === 'parent'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        Parent Version
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {templateEditorMode === 'student' ? 'Subject Line' : 'Parent Subject Line'}
                      </label>
                      <input
                        type="text"
                        value={templateEditorMode === 'student' ? editingTemplate.subject : (editingTemplate.parentSubject || '')}
                        onChange={(e) => {
                          if (templateEditorMode === 'student') {
                            setEditingTemplate({ ...editingTemplate, subject: e.target.value });
                          } else {
                            setEditingTemplate({ ...editingTemplate, parentSubject: e.target.value });
                          }
                        }}
                        className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder={templateEditorMode === 'student' ? "Subject..." : "Parent Subject... (Leave empty to use default logic)"}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {templateEditorMode === 'student' ? 'Body Content' : 'Parent Body Content'}
                      </label>
                      <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs text-indigo-800 dark:text-indigo-200">
                        <span className="font-semibold block mb-1.5">Available Placeholders:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 font-mono text-[10px] leading-tight">
                          <div><span className="font-bold">{'{studentName}'}</span> - Full Name</div>
                          <div><span className="font-bold">{'{studentFirstName}'}</span> - First Name</div>
                          <div><span className="font-bold">{'{studentSurname}'}</span> - Last Name</div>
                          <div><span className="font-bold">{'{studentId}'}</span> - Student ID</div>
                          <div><span className="font-bold">{'{className}'}</span> - Full Class Name</div>
                          <div><span className="font-bold">{'{subjectName}'}</span> - Subject Only</div>
                          <div><span className="font-bold">{'{scoreTable}'}</span> - Assessment Scores</div>
                          <div><span className="font-bold">{'{currentGrade}'}</span> - Current Grade</div>
                          <div><span className="font-bold">{'{missingWorksList}'}</span> - Missing Works</div>
                          <div><span className="font-bold">{'{failingWorksList}'}</span> - Failing Works</div>
                          <div><span className="font-bold">{'{adviserEmail}'}</span> - Adviser Email</div>
                          <div><span className="font-bold">{'{parentEmail}'}</span> - Parent Email 1</div>
                          <div><span className="font-bold">{'{parentEmail2}'}</span> - Parent Email 2</div>
                          <div><span className="font-bold">{'{date}'}</span> - Current Date</div>
                          <div><span className="font-bold">{'{time}'}</span> - Current Time</div>
                          <div><span className="font-bold">{'{makeupCycle}'}</span> - Make-up Cycle</div>
                          <div><span className="font-bold">{'{makeupDay}'}</span> - Make-up Day</div>
                          <div><span className="font-bold">{'{makeupTime}'}</span> - Make-up Time</div>
                          <div><span className="font-bold">{'{makeupLocation}'}</span> - Make-up Location</div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-700/50">
                          <span className="font-semibold block mb-1">Conditional Blocks:</span>
                          <div className="grid grid-cols-1 gap-y-1 font-mono text-[10px] leading-tight">
                            <div><span className="font-bold">{'{ifFailing}...{/ifFailing}'}</span> - Shows content only if there are failing scores</div>
                            <div><span className="font-bold">{'{ifLowGrade}...{/ifLowGrade}'}</span> - Shows content only if current grade is &lt; 75</div>
                          </div>
                        </div>
                      </div>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 p-2 flex gap-1">
                          <button
                            onClick={() => {
                              const textarea = document.getElementById('settings-template-body-editor') as HTMLTextAreaElement;
                              if (!textarea) return;
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = templateEditorMode === 'student' ? editingTemplate.body : (editingTemplate.parentBody || '');
                              const newText = text.substring(0, start) + '*' + text.substring(start, end) + '*' + text.substring(end);
                              
                              if (templateEditorMode === 'student') {
                                setEditingTemplate({ ...editingTemplate, body: newText });
                              } else {
                                setEditingTemplate({ ...editingTemplate, parentBody: newText });
                              }
                              
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + 1, end + 1);
                              }, 0);
                            }}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                            title="Bold"
                          >
                            <Bold className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const textarea = document.getElementById('settings-template-body-editor') as HTMLTextAreaElement;
                              if (!textarea) return;
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = templateEditorMode === 'student' ? editingTemplate.body : (editingTemplate.parentBody || '');
                              const newText = text.substring(0, start) + '_' + text.substring(start, end) + '_' + text.substring(end);
                              
                              if (templateEditorMode === 'student') {
                                setEditingTemplate({ ...editingTemplate, body: newText });
                              } else {
                                setEditingTemplate({ ...editingTemplate, parentBody: newText });
                              }

                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + 1, end + 1);
                              }, 0);
                            }}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                            title="Italic"
                          >
                            <Italic className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const textarea = document.getElementById('settings-template-body-editor') as HTMLTextAreaElement;
                              if (!textarea) return;
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = templateEditorMode === 'student' ? editingTemplate.body : (editingTemplate.parentBody || '');
                              const newText = text.substring(0, start) + '_' + text.substring(start, end) + '_' + text.substring(end);
                              
                              if (templateEditorMode === 'student') {
                                setEditingTemplate({ ...editingTemplate, body: newText });
                              } else {
                                setEditingTemplate({ ...editingTemplate, parentBody: newText });
                              }

                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + 1, end + 1);
                              }, 0);
                            }}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                            title="Underline (Italic)"
                          >
                            <Underline className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          id="settings-template-body-editor"
                          value={templateEditorMode === 'student' ? editingTemplate.body : (editingTemplate.parentBody || '')}
                          onChange={(e) => {
                            if (templateEditorMode === 'student') {
                              setEditingTemplate({ ...editingTemplate, body: e.target.value });
                            } else {
                              setEditingTemplate({ ...editingTemplate, parentBody: e.target.value });
                            }
                          }}
                          rows={10}
                          className="w-full p-2 text-sm border-0 focus:ring-0 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                          placeholder={templateEditorMode === 'student' ? "Email body..." : "Parent Email body... (Leave empty to use default logic)"}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attachments</label>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50 max-h-40 overflow-y-auto">
                        {storedFiles.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">No files in library. Upload files in the "File Library" tab.</p>
                        ) : (
                          <div className="space-y-2">
                            {storedFiles.map(file => (
                              <label key={file.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(editingTemplate.attachments || []).includes(file.name)}
                                  onChange={() => toggleTemplateAttachment(file.name)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                />
                                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setEditingTemplate(null)}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTemplate}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" /> Save Template
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {emailTemplates.map(template => (
                      <div key={template.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex justify-between items-start group hover:shadow-md transition-all">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{template.name}</h3>
                            {template.scenario && template.scenario !== 'default' && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium uppercase tracking-wide">
                                {template.scenario}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{template.subject}</p>
                          {template.attachments && template.attachments.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <FileText className="w-3 h-3" />
                              {template.attachments.length} attachment(s)
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex flex-col items-end gap-1 mr-2">
                            {template.triggerCondition && template.triggerCondition !== 'none' && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                Auto-selects: {template.triggerCondition}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => setEditingTemplate(template)}
                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">File Library</h2>
                  <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium cursor-pointer">
                    <Upload className="w-4 h-4" /> Upload File
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {storedFiles.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No files yet</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Upload files to attach them to email templates.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {storedFiles.map(file => (
                        <div key={file.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg">
                              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {(file.size / 1024).toFixed(1)} KB • {new Date(file.lastModified).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleFileDelete(file.id, e)}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
