import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Settings, Download, Calculator, Upload, X, User, Users, Mail, ArrowLeft, ArrowRight, ArrowRightLeft, Edit2, AlertTriangle, GripVertical, ClipboardPaste, Copy, ChevronLeft, ChevronRight, Plus, Bold, Italic, Underline, Paperclip, FileText, Table, RefreshCw, Check, Eye, EyeOff, Edit3 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, TouchSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { read, utils, writeFile } from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ComponentConfig, SubComponent, Student, ComponentType, DEFAULT_COMPONENTS, DEFAULT_STUDENTS, EmailTemplate, DEFAULT_EMAIL_TEMPLATES, Scenario, StoredFile, TransmutationFormula } from '../types';
import { getFiles } from '../utils/fileStorage';
import { calculateComponentStats, calculateInitialGrade, calculateFinalGrade, transmuteGrade, formatAssessmentName, calculateAdjustedScores, round4 } from '../utils/grades';
import { getRosters, getRosterData, saveRosterData, getGlobalTemplates, syncComponentsToSubject } from '../utils/storage';
import { parseRosterFile } from '../utils/rosterParser';
import StudentDetailsEditor from './StudentDetailsEditor';
import Footer from './Footer';
import { Modal } from './Modal';

// Helper for failing check
const isFailingScore = (score: number, total: number) => {
  return score < (total * 0.6);
};

const STATS_ROWS = [
  { label: 'Mean', key: 'mean' },
  { label: 'Median', key: 'median' },
  { label: 'Mode', key: 'mode' },
  { label: 'Standard Deviation', key: 'stdDev' },
  { label: 'Frequency of Passing', key: 'freqPass' },
  { label: 'Frequency of Failure', key: 'freqFail' },
  { label: 'Percent Passing', key: 'pctPass' },
  { label: 'Percent Failing', key: 'pctFail' },
  { label: 'No. of Students who Took the Assessment', key: 'numTook' },
  { label: 'No. of Students for Make-Up Assessment', key: 'numMakeup' },
] as const;

const calculateSubComponentStats = (subId: string, totalScore: number, students: Student[]) => {
  const scores = students.map(s => s.scores[subId]).filter(s => s !== undefined && s !== null && !isNaN(s)) as number[];
  const numTook = scores.length;
  const numMakeup = students.length - numTook;
  const totalEnrolled = students.length;
  
  if (totalEnrolled === 0) {
    return {
      mean: '-', median: '-', mode: '-', stdDev: '-',
      freqPass: '-', freqFail: '-', pctPass: '-', pctFail: '-',
      numTook: 0, numMakeup: 0
    };
  }

  let mean = 0, median = 0, modeStr = 'None', stdDev = 0;
  if (numTook > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    mean = sum / numTook;
    
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    
    const counts: Record<number, number> = {};
    let maxCount = 0;
    let mode: number[] = [];
    scores.forEach(s => {
      counts[s] = (counts[s] || 0) + 1;
      if (counts[s] > maxCount) {
        maxCount = counts[s];
        mode = [s];
      } else if (counts[s] === maxCount) {
        if (!mode.includes(s)) mode.push(s);
      }
    });
    modeStr = mode.length === scores.length ? 'None' : (mode.length > 1 ? 'Multi' : mode[0].toString());

    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numTook;
    stdDev = Math.sqrt(variance);
  }

  const passingScore = totalScore * 0.6;
  const freqPass = scores.filter(s => s >= passingScore).length;
  const freqFail = totalEnrolled - freqPass;
  const pctPass = (freqPass / totalEnrolled) * 100;
  const pctFail = (freqFail / totalEnrolled) * 100;

  return {
    mean: numTook > 0 ? mean.toFixed(2) : '-',
    median: numTook > 0 ? median.toFixed(2) : '-',
    mode: modeStr,
    stdDev: numTook > 0 ? stdDev.toFixed(2) : '-',
    freqPass,
    freqFail,
    pctPass: (Math.round(pctPass * 10) / 10) + '%',
    pctFail: (Math.round(pctFail * 10) / 10) + '%',
    numTook,
    numMakeup
  };
};

const calculateGradeStats = (grades: number[], totalEnrolled: number) => {
  const validGrades = grades.filter(g => !isNaN(g));
  const numTook = validGrades.length;
  const numMakeup = totalEnrolled - numTook;
  
  if (totalEnrolled === 0) {
    return {
      mean: '-', median: '-', mode: '-', stdDev: '-',
      freqPass: '-', freqFail: '-', pctPass: '-', pctFail: '-',
      numTook: 0, numMakeup: 0
    };
  }

  let mean = 0, median = 0, modeStr = 'None', stdDev = 0;
  if (numTook > 0) {
    const sum = validGrades.reduce((a, b) => a + b, 0);
    mean = sum / numTook;
    
    const sorted = [...validGrades].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    
    const counts: Record<number, number> = {};
    let maxCount = 0;
    let mode: number[] = [];
    validGrades.forEach(s => {
      counts[s] = (counts[s] || 0) + 1;
      if (counts[s] > maxCount) {
        maxCount = counts[s];
        mode = [s];
      } else if (counts[s] === maxCount) {
        if (!mode.includes(s)) mode.push(s);
      }
    });
    modeStr = mode.length === validGrades.length ? 'None' : (mode.length > 1 ? 'Multi' : mode[0].toString());

    const variance = validGrades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numTook;
    stdDev = Math.sqrt(variance);
  }

  const freqPass = validGrades.filter(s => s >= 75).length;
  const freqFail = numTook - freqPass;
  const pctPass = numTook > 0 ? ((freqPass / numTook) * 100).toFixed(1) + '%' : '0%';
  const pctFail = numTook > 0 ? ((freqFail / numTook) * 100).toFixed(1) + '%' : '0%';

  return {
    mean: numTook > 0 ? mean.toFixed(2) : '-',
    median: numTook > 0 ? median.toFixed(2) : '-',
    mode: modeStr,
    stdDev: numTook > 0 ? stdDev.toFixed(2) : '-',
    freqPass,
    freqFail,
    pctPass,
    pctFail,
    numTook,
    numMakeup
  };
};

const getGradeColor = (grade: number) => {
  const roundedGrade = Math.round(grade);
  if (roundedGrade >= 100) return 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 ring-2 ring-inset ring-purple-500/50';
  if (roundedGrade >= 90) return 'text-amber-950 dark:text-amber-50 bg-amber-300 dark:bg-amber-500/50 ring-2 ring-inset ring-amber-500/30'; // Gold
  if (roundedGrade >= 88) return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 ring-1 ring-inset ring-slate-400/30'; // Silver
  if (roundedGrade >= 85) return 'text-orange-800 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 ring-1 ring-inset ring-orange-400/30'; // Bronze
  if (roundedGrade >= 80) return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30'; // Green
  if (roundedGrade >= 75) return 'text-yellow-800 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/10'; // Yellow
  return 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30'; // Red
};

interface ExcessScoreData {
  studentId: string;
  subComponentId: string;
  excess: number;
  step: 'warning' | 'distribute';
  originalValue: number;
}

interface SortableStudentRowProps {
  student: Student;
  originalStudent?: Student;
  index: number;
  components: ComponentConfig[];
  visibleComponents: ComponentConfig[];
  handleScoreChange: (studentId: string, subComponentId: string, value: string) => void;
  handleScoreClick?: (studentId: string, subComponentId: string, value: number) => void;
  handleScoreBlur?: (studentId: string, subComponentId: string) => void;
  handleIncentiveChange?: (studentId: string, type: 'ww' | 'pt', value: string) => void;
  initiateEmail: (student: Student) => void;
  setSelectedStudent: (student: Student) => void;
  initiateRemoveStudent: (id: string) => void;
  initiateTransferStudent: (id: string) => void;
  showIncentives: boolean;
  isViewMode: boolean;
  incentiveMode: 'both' | 'ww_only';
  showSpinButtons: boolean;
  extraPoints?: number;
  scoreSources?: Record<string, 'ww' | 'pt' | 'mixed'>;
  isIsolated?: boolean;
  toggleIsolate?: () => void;
  showAlert: (message: string, title?: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
  showExtraPoints?: boolean;
  transmutationFormula?: TransmutationFormula;
}

const SortableStudentRow: React.FC<SortableStudentRowProps> = ({
  student,
  originalStudent,
  index,
  components,
  visibleComponents,
  handleScoreChange,
  handleScoreClick,
  handleScoreBlur,
  handleIncentiveChange,
  initiateEmail,
  setSelectedStudent,
  initiateRemoveStudent,
  initiateTransferStudent,
  showIncentives,
  isViewMode,
  incentiveMode,
  showSpinButtons,
  extraPoints = 0,
  scoreSources = {},
  isIsolated,
  toggleIsolate,
  showAlert,
  showExtraPoints = true,
  transmutationFormula = 'default' as TransmutationFormula,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: student.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const initialGrade = calculateInitialGrade(components, student, transmutationFormula);
  const finalGrade = calculateFinalGrade(components, student, transmutationFormula);

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
      // Prevent default behavior for navigation keys to avoid scrolling/cursor weirdness
      // and prevent ArrowUp/ArrowDown from changing the number input value.
      e.preventDefault();
      
      let targetRow = rowIndex;
      let targetCol = colIndex;

      if (e.key === 'ArrowUp') targetRow--;
      if (e.key === 'ArrowDown' || e.key === 'Enter') targetRow++;
      if (e.key === 'ArrowLeft') targetCol--;
      if (e.key === 'ArrowRight') targetCol++;

      const targetInput = document.querySelector(`input[data-row-index="${targetRow}"][data-col-index="${targetCol}"]`) as HTMLInputElement;
      if (targetInput) {
        targetInput.focus();
        targetInput.select();
      }
    }
  };

  let colCounter = 0;

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-indigo-50 dark:hover:bg-indigo-900/20 group bg-white dark:bg-gray-800 even:bg-gray-50 dark:even:bg-gray-900 transition-colors">
      <td className="sticky left-0 z-20 bg-white dark:bg-gray-800 group-hover:bg-indigo-50 dark:group-hover:bg-[#232a46] [.group:nth-child(even)_&]:bg-gray-50 dark:[.group:nth-child(even)_&]:bg-gray-900 p-1.5 text-center border-r border-gray-200 dark:border-gray-700 w-8">
        <button 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      <td 
        className={`sticky left-8 z-10 bg-white dark:bg-gray-800 group-hover:bg-indigo-50 dark:group-hover:bg-[#232a46] [.group:nth-child(even)_&]:bg-gray-50 dark:[.group:nth-child(even)_&]:bg-gray-900 p-1.5 text-center font-mono text-[10px] text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 w-8 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/40 ${isIsolated ? 'bg-indigo-100 dark:bg-indigo-900/40 font-bold text-indigo-700 dark:text-indigo-300' : ''}`}
        onClick={() => toggleIsolate && toggleIsolate()}
        title={isIsolated ? "Show all students" : "Isolate this student"}
      >
        {index + 1}
      </td>
      {!showIncentives && (
        <td className="sticky left-16 z-10 bg-white dark:bg-gray-800 group-hover:bg-indigo-50 dark:group-hover:bg-[#232a46] [.group:nth-child(even)_&]:bg-gray-50 dark:[.group:nth-child(even)_&]:bg-gray-900 p-1.5 text-center border-r border-gray-200 dark:border-gray-700 w-10">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (!student.studentEmail) {
                showAlert('This student does not have an email address.', 'Missing Email', 'warning');
                return;
              }
              initiateEmail(student);
            }}
            className={`p-0.5 rounded transition-colors ${student.studentEmail ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-800 dark:hover:text-indigo-300' : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'}`}
            title={student.studentEmail ? `Send email to ${student.name}` : 'No email address'}
            disabled={!student.studentEmail}
          >
            <Mail className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
      <td 
        className={`sticky ${showIncentives ? 'left-16' : 'left-[6.5rem]'} z-10 bg-white dark:bg-gray-800 group-hover:bg-indigo-50 dark:group-hover:bg-[#232a46] [.group:nth-child(even)_&]:bg-gray-50 dark:[.group:nth-child(even)_&]:bg-gray-900 p-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap pr-6 text-sm`}
        onClick={() => setSelectedStudent(originalStudent || student)}
      >
        {student.name}
      </td>

      {visibleComponents.map(comp => {
        const stats = calculateComponentStats(comp, student, transmutationFormula);
        const isWW = comp.name.toLowerCase().includes('written work');
        const isPT = comp.name.toLowerCase().includes('performance task');
        
        return (
          <React.Fragment key={comp.id}>
            {showIncentives && isWW && (
              <td className="p-0.5 text-center border-r-2 border-r-black dark:border-r-black bg-blue-100 dark:bg-blue-900/30 w-16">
                <input
                  type="number"
                  min="0"
                  value={originalStudent?.wwIncentive || ''}
                  onChange={(e) => !isViewMode && handleIncentiveChange?.(student.id, 'ww', e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                  disabled={isViewMode}
                  className={`w-12 text-center p-0 rounded border border-blue-300 dark:border-blue-700 focus:ring-1 focus:ring-blue-600 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${isViewMode ? 'cursor-not-allowed opacity-75' : ''} ${!showSpinButtons ? '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]' : ''}`}
                />
              </td>
            )}
            {showIncentives && isPT && incentiveMode === 'both' && (
              <td className="p-0.5 text-center border-r-2 border-r-black dark:border-r-black bg-amber-100 dark:bg-amber-900/30 w-16">
                <input
                  type="number"
                  min="0"
                  value={originalStudent?.ptIncentive || ''}
                  onChange={(e) => !isViewMode && handleIncentiveChange?.(student.id, 'pt', e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                  disabled={isViewMode}
                  className={`w-12 text-center p-0 rounded border border-amber-300 dark:border-amber-700 focus:ring-1 focus:ring-amber-600 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${isViewMode ? 'cursor-not-allowed opacity-75' : ''} ${!showSpinButtons ? '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]' : ''}`}
                />
              </td>
            )}
            {comp.subComponents.map(sub => {
              const score = student.scores[sub.id];
              // Check if score changed from original (for highlighting)
              const originalScore = originalStudent?.scores[sub.id];
              const isChanged = showIncentives && score !== originalScore;
              const source = scoreSources[sub.id];
              
              const isInvalid = score !== undefined && score > sub.totalScore;
              const isMissing = score === undefined;
              const currentCol = colCounter++;
              
              const isFailing = score !== undefined && isFailingScore(score, sub.totalScore);
              
              let cellBg = '';
              let textColor = '';
              
              if (isChanged) {
                if (source === 'ww') {
                  cellBg = 'bg-blue-100 dark:bg-blue-900/40';
                  textColor = 'text-blue-800 dark:text-blue-300 font-bold';
                } else if (source === 'pt') {
                  cellBg = 'bg-amber-100 dark:bg-amber-900/40';
                  textColor = 'text-amber-800 dark:text-amber-300 font-bold';
                } else if (source === 'mixed') {
                  cellBg = 'bg-green-100 dark:bg-green-900/40';
                  textColor = 'text-green-800 dark:text-green-300 font-bold';
                } else {
                  cellBg = 'bg-green-100 dark:bg-green-900/40';
                  textColor = 'text-green-800 dark:text-green-300 font-bold';
                }
              }

              return (
                <td key={sub.id} className={`p-1 text-center border-r border-gray-100 dark:border-gray-700 relative group/cell ${cellBg}`}>
                  <input
                    type="number"
                    min="0"
                    max={sub.totalScore}
                    value={score === undefined ? '' : score}
                    onChange={(e) => !showIncentives && !isViewMode && handleScoreChange(student.id, sub.id, e.target.value)}
                    onClick={() => {
                      if (!showIncentives && !isViewMode && score !== undefined && handleScoreClick) {
                        handleScoreClick(student.id, sub.id, score);
                      }
                    }}
                    onKeyDown={(e) => !showIncentives && !isViewMode && handleKeyDown(e, index, currentCol)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onBlur={() => {
                      if (!showIncentives && !isViewMode && handleScoreBlur) {
                        handleScoreBlur(student.id, sub.id);
                      }
                    }}
                    disabled={showIncentives || isViewMode}
                    data-row-index={index}
                    data-col-index={currentCol}
                    data-student={student.id}
                    data-sub={sub.id}
                    className={`w-12 text-center p-0.5 rounded border text-xs dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 font-bold ${!showSpinButtons ? '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]' : ''} ${
                      showIncentives || isViewMode
                        ? `bg-transparent border-transparent cursor-default ${textColor || 'text-gray-900 dark:text-gray-100'}`
                        : `focus:ring-1 focus:ring-indigo-500 ${
                            isInvalid 
                              ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 focus:border-red-500 focus:ring-red-500' 
                              : isMissing
                                ? 'border-pink-400 dark:border-pink-600 bg-pink-100 dark:bg-pink-900/40 focus:border-indigo-500 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.5)]'
                                : `bg-transparent border-gray-200 dark:border-gray-700 focus:border-indigo-500 ${
                                    isFailing 
                                      ? 'text-red-600 dark:text-red-400' 
                                      : 'text-gray-900 dark:text-gray-100'
                                  }`
                          }`
                    }`}
                  />
                  {isInvalid && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-red-600 text-white text-[10px] rounded shadow-lg opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                      Max: {sub.totalScore}
                    </div>
                  )}
                </td>
              );
            })}
            <td className="p-1 text-center font-mono text-xs font-medium text-gray-700 dark:text-gray-300 bg-black/5 dark:bg-white/5 border-r border-gray-200 dark:border-gray-700">
              {stats.totalScore}
            </td>
            <td className="p-1 text-center font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 border-r border-gray-200 dark:border-gray-700" title={`Raw WS: ${stats.rawWeightedScore.toFixed(4)}`}>
              {stats.weightedScore.toFixed(4)}
            </td>
          </React.Fragment>
        );
      })}
      <td className="p-2 text-center font-mono font-bold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 text-xs" title="Sum of raw weighted scores">
        {initialGrade.toFixed(4)}
      </td>
      <td className="p-2 text-center font-mono font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-l border-gray-200 dark:border-gray-700 text-xs" title="Sum of transmuted weighted scores">
        {finalGrade.toFixed(4)}
      </td>
      <td className={`p-2 text-center font-mono font-bold text-base ${getGradeColor(finalGrade)}`} title="Final Grade">
        {Math.round(finalGrade)}
      </td>
      {showIncentives && showExtraPoints && (
        <td className="p-2 text-center font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-l border-gray-200 dark:border-gray-700 text-xs">
          {extraPoints > 0 ? `+${extraPoints}` : '-'}
        </td>
      )}
      <td className="p-1 text-center flex items-center justify-center gap-1 h-full min-h-[32px]">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            initiateTransferStudent(student.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-opacity p-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
          title="Transfer Student"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            initiateRemoveStudent(student.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-opacity p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
          title="Remove Student"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

const toUnicodeVariant = (str: string, variant: 'bold' | 'italic' | 'bolditalic' | 'underline') => {
  if (variant === 'underline') {
    return Array.from(str).map(char => char + '\u0332').join('');
  }

  const getOffset = (char: string, variant: 'bold' | 'italic' | 'bolditalic') => {
    const code = char.codePointAt(0);
    if (!code) return 0;

    // A-Z
    if (code >= 0x41 && code <= 0x5A) {
      if (variant === 'bold') return 0x1D400 - 0x41;
      if (variant === 'italic') return 0x1D434 - 0x41;
      if (variant === 'bolditalic') return 0x1D468 - 0x41;
    }
    // a-z
    if (code >= 0x61 && code <= 0x7A) {
      if (variant === 'bold') return 0x1D41A - 0x61;
      if (variant === 'italic') return 0x1D44E - 0x61;
      if (variant === 'bolditalic') return 0x1D482 - 0x61;
    }
    // 0-9 (bold only)
    if (variant === 'bold' && code >= 0x30 && code <= 0x39) {
      return 0x1D7CE - 0x30;
    }
    return 0;
  };

  return Array.from(str).map(char => {
    // Handle special case for 'h' in italic (it's Planck constant U+210E)
    if (variant === 'italic' && char === 'h') return '\u210E';

    const offset = getOffset(char, variant as 'bold' | 'italic' | 'bolditalic');
    if (offset === 0) return char;
    
    return String.fromCodePoint(char.codePointAt(0)! + offset);
  }).join('');
};

const applyPseudoFormatting = (text: string) => {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, (_, p1) => toUnicodeVariant(p1, 'bolditalic'))
    .replace(/\*\*(.*?)\*\*/g, (_, p1) => toUnicodeVariant(p1, 'bold'))
    .replace(/\*(.*?)\*/g, (_, p1) => toUnicodeVariant(p1, 'italic'))
    .replace(/__(.*?)__/g, (_, p1) => toUnicodeVariant(p1, 'underline'));
};

export default function ClassRecord() {
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
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  const [components, setComponents] = useState<ComponentConfig[]>(DEFAULT_COMPONENTS);
  const [students, setStudents] = useState<Student[]>(DEFAULT_STUDENTS);
  const [isolatedStudentId, setIsolatedStudentId] = useState<string | null>(null);
  const [isolatedView, setIsolatedView] = useState<{ type: 'component' | 'subcomponent', id: string } | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [importCandidates, setImportCandidates] = useState<Student[] | null>(null);
  const [emailingStudent, setEmailingStudent] = useState<Student | null>(null);
  const [excessScoreData, setExcessScoreData] = useState<ExcessScoreData | null>(null);
  const [suppressedCell, setSuppressedCell] = useState<{studentId: string, subComponentId: string} | null>(null);
  const [alertConfig, setAlertConfig] = useState<{title: string, message: string, type?: 'info' | 'warning' | 'error' | 'success'} | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{title: string, message: string, onConfirm: () => void, onCancel?: () => void} | null>(null);

  const showAlert = (message: string, title = 'Notice', type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setAlertConfig({ title, message, type });
  };
  const [selectedWorks, setSelectedWorks] = useState<string[]>([]);
  const [pastingTo, setPastingTo] = useState<{ id: string, name: string, type: 'score' | 'pt-incentive' | 'ww-incentive' } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [clearingColumn, setClearingColumn] = useState<{ id: string, name: string, type: 'score' | 'pt-incentive' | 'ww-incentive' } | null>(null);
  const [editingSubComponent, setEditingSubComponent] = useState<{ componentId: string, subId: string, name: string, description: string, totalScore: number } | null>(null);
  const [curveConfig, setCurveConfig] = useState<{ active: boolean, type: 'interpolation' | 'classical' | 'traditional' | 'canvas', newMin: string, newMax: string, oldMin: number, oldMax: number, oldAvg: number, flatBonus: string, targetAverage: string, applyToAllSections: boolean } | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(DEFAULT_EMAIL_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isDisciplinaryMode, setIsDisciplinaryMode] = useState(false);
  const [activeScenario, setActiveScenario] = useState<Scenario | 'all'>('all');
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [scoreIncrease, setScoreIncrease] = useState<{ amount: number, studentIds: string[] }>({ amount: 0, studentIds: [] });
  const [bulkEmailSelection, setBulkEmailSelection] = useState<string[]>([]);
  const [bulkEmailStep, setBulkEmailStep] = useState<'menu' | 'select'>('menu');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [hasManuallySelectedTemplate, setHasManuallySelectedTemplate] = useState(true);
  const [saveTemplatePreference, setSaveTemplatePreference] = useState(() => localStorage.getItem('saveTemplatePreference') === 'true');
  const [editableSubject, setEditableSubject] = useState('');
  const [editableBody, setEditableBody] = useState('');
  const [bulkEmailMode, setBulkEmailMode] = useState<'students' | 'parents' | 'select' | 'select-parents' | 'both'>('students');
  const [importError, setImportError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isEditDescriptionsModalOpen, setIsEditDescriptionsModalOpen] = useState(false);
  const [syncSubjectName, setSyncSubjectName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [transferStudentId, setTransferStudentId] = useState<string | null>(null);
  const [availableRosters, setAvailableRosters] = useState<any[]>([]);
  const [selectedTransferRosterId, setSelectedTransferRosterId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIncentives, setShowIncentives] = useState(false);

  const visibleComponents = components.filter(comp => {
    if (!isolatedView) return true;
    if (isolatedView.type === 'component') return comp.id === isolatedView.id;
    if (isolatedView.type === 'subcomponent') return comp.subComponents.some(s => s.id === isolatedView.id);
    return true;
  }).map(comp => {
    if (isolatedView?.type === 'subcomponent') {
      return {
        ...comp,
        subComponents: comp.subComponents.filter(s => s.id === isolatedView.id)
      };
    }
    return comp;
  });

  // Calculate total columns for colSpan
  const leftColsCount = showIncentives ? 3 : 4;
  const compColsCount = visibleComponents.reduce((acc, comp) => {
    const isWW = comp.name.toLowerCase().includes('written work');
    const isPT = comp.name.toLowerCase().includes('performance task');
    let count = comp.subComponents.length + 2; // subcomponents + total + weighted score
    if (showIncentives && isWW) count++;
    if (showIncentives && isPT && incentiveMode === 'both') count++;
    return acc + count;
  }, 0);
  const rightColsCount = 3 + (showIncentives && showExtraPoints ? 1 : 0) + 1; // initialGrade, finalGrade, Math.round(finalGrade), Extra Points, Trash
  const totalColumnsCount = leftColsCount + compColsCount + rightColsCount;

  const finalGradeStats = useMemo(() => {
    if (!showStats) return null;
    const grades = students.map(student => {
      let effectiveStudent = student;
      if (showIncentives) {
        const adjustment = calculateAdjustedScores(student, components, incentiveMode);
        effectiveStudent = { ...student, scores: adjustment.scores };
      }
      return Math.round(calculateFinalGrade(components, effectiveStudent, transmutationFormula));
    });
    return calculateGradeStats(grades, students.length);
  }, [showStats, students, components, showIncentives, incentiveMode, transmutationFormula]);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showSpinButtons, setShowSpinButtons] = useState(false);
  const [emailToParent, setEmailToParent] = useState(false);

  // PDF Export State
  const [showExportFormatModal, setShowExportFormatModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUnit, setPdfUnit] = useState(() => localStorage.getItem('pdfUnit') || 'High School');
  const [pdfYear1, setPdfYear1] = useState(() => localStorage.getItem('pdfYear1') || new Date().getFullYear().toString());
  const [pdfYear2, setPdfYear2] = useState(() => localStorage.getItem('pdfYear2') || (new Date().getFullYear() + 1).toString());
  const [pdfTerm, setPdfTerm] = useState(() => localStorage.getItem('pdfTerm') || 'Term 1');
  const [savePdfDefaults, setSavePdfDefaults] = useState(true);
  
  const [showStudentDetailsEditor, setShowStudentDetailsEditor] = useState(false);

  const displayedStudents = isolatedStudentId 
    ? students.filter(s => s.id === isolatedStudentId) 
    : students;

  // Generate email content when dependencies change
  useEffect(() => {
    if (!emailingStudent) return;

    const student = emailingStudent;
    const subjectName = getSubjectFromRosterName(rosterName);
    const template = emailTemplates.find(t => t.id === selectedTemplateId) || emailTemplates[0];
    
    // Collect selected items with their details
    const selectedItems: { name: string; score: number; total: number; isFailing: boolean; componentId: string; isMissing: boolean }[] = [];
    
    components.forEach(comp => {
      comp.subComponents.forEach(sub => {
        if (selectedWorks.includes(sub.id)) {
          const scoreVal = student.scores[sub.id];
          const isMissing = scoreVal === undefined;
          const score = scoreVal || 0;
          
          selectedItems.push({
            name: formatAssessmentName(sub.name),
            score: score,
            total: sub.totalScore,
            isFailing: isFailing(score, sub.totalScore),
            componentId: comp.id,
            isMissing: isMissing
          });
        }
      });
    });

    // Format name: "Surname, Firstname" -> "Firstname Surname"
    let formattedName = student.name;
    let firstName = student.name.split(' ')[0];
    let surname = '';

    if (student.name.includes(',')) {
      const parts = student.name.split(',');
      if (parts.length >= 2) {
        formattedName = `${parts[1].trim()} ${parts[0].trim()}`;
        firstName = parts[1].trim().split(' ')[0];
        surname = parts[0].trim();
      } else {
        surname = student.name.trim();
      }
    } else {
      const parts = student.name.split(' ');
      surname = parts[parts.length - 1];
    }

    // Additional Placeholders
    const currentDate = new Date().toLocaleDateString();
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const studentIdStr = student.studentId || 'N/A';
    const parentEmailStr = student.parentEmail || 'N/A';
    const parentEmail2Str = student.parentEmail2 || 'N/A';
    const advEmailStr = adviserEmail || 'N/A';

    // Generate Placeholders
    const missingWorksList = selectedItems
      .filter(item => item.isMissing)
      .map(item => item.name)
      .join(', ');
      
    const failingWorksList = selectedItems
      .filter(item => item.isFailing)
      .map(item => {
        const passingScore = (item.total * 0.6).toFixed(2).replace(/\.00$/, '');
        return `• ${item.name} — ${item.score} / ${item.total} (Passing Score: ${passingScore})`;
      })
      .join('\n');

    const scoreTable = selectedItems
      .map(item => {
        if (item.isFailing) {
           const passingScore = (item.total * 0.6).toFixed(2).replace(/\.00$/, '');
           return `• ${item.name} — ${item.score} / ${item.total} (Passing Score: ${passingScore})`;
        }
        return `• ${item.name} — ${item.score} / ${item.total}`;
      })
      .join('\n');

    const currentGrade = calculateFinalGrade(components, student, transmutationFormula).toFixed(2);

    // Prepare Subject and Body Templates
    let subjectTemplate = template.subject;
    let bodyTemplate = template.body;

    if (emailToParent) {
      // Use explicit parent template if available
      if (template.parentSubject || template.parentBody) {
        subjectTemplate = template.parentSubject || subjectTemplate;
        bodyTemplate = template.parentBody || bodyTemplate;
      } else {
        // Fallback: Auto-adjust Subject Template if it doesn't have student name
        if (!subjectTemplate.includes('{studentName}') && !subjectTemplate.includes('{studentFirstName}')) {
             subjectTemplate = `[{studentName}] ${subjectTemplate}`;
        }
        
        // Fallback: Auto-adjust Body Template for "your child"
        const replacements = [
            { from: /your progress/g, to: "your child's progress" },
            { from: /your recent scores/g, to: "your child's recent scores" },
            { from: /your recorded score/g, to: "your child's recorded score" },
            { from: /your current academic performance/g, to: "your child's current academic performance" },
            { from: /discourage you/g, to: "discourage your child" },
            { from: /where you stand/g, to: "where your child stands" },
            { from: /your performance/g, to: "your child's performance" },
            { from: /You are encouraged/g, to: "Your child is encouraged" },
            { from: /your score/g, to: "your child's score" },
            { from: /Good day {studentFirstName}/g, to: `Good day, Mx. {studentSurname}` }
        ];
        
        replacements.forEach(({from, to}) => {
            bodyTemplate = bodyTemplate.replace(from, to);
        });
      }
    }

    // Replace Placeholders
    const replaceAllPlaceholders = (text: string) => {
      let processedText = text;
      
      const hasFailing = failingWorksList.length > 0;
      const isLowGrade = parseFloat(currentGrade) < 75;

      if (hasFailing) {
        processedText = processedText.replace(/{ifFailing}([\s\S]*?){\/ifFailing}/g, '$1');
      } else {
        processedText = processedText.replace(/{ifFailing}([\s\S]*?){\/ifFailing}/g, '');
      }

      if (isLowGrade) {
        processedText = processedText.replace(/{ifLowGrade}([\s\S]*?){\/ifLowGrade}/g, '$1');
      } else {
        processedText = processedText.replace(/{ifLowGrade}([\s\S]*?){\/ifLowGrade}/g, '');
      }

      return processedText
        .replace(/{studentName}/g, formattedName)
        .replace(/{studentFirstName}/g, firstName)
        .replace(/{studentSurname}/g, surname)
        .replace(/{studentId}/g, studentIdStr)
        .replace(/{parentEmail}/g, parentEmailStr)
        .replace(/{parentEmail2}/g, parentEmail2Str)
        .replace(/{subjectName}/g, subjectName)
        .replace(/{className}/g, rosterName)
        .replace(/{adviserEmail}/g, advEmailStr)
        .replace(/{date}/g, currentDate)
        .replace(/{time}/g, currentTime)
        .replace(/{missingWorksList}/g, missingWorksList)
        .replace(/{failingWorksList}/g, failingWorksList)
        .replace(/{scoreTable}/g, scoreTable)
        .replace(/{currentGrade}/g, currentGrade)
        .replace(/{makeupCycle}/g, makeupCycle || 'X')
        .replace(/{makeupDay}/g, makeupDay || 'X')
        .replace(/{makeupTime}/g, makeupTime || 'X:XX XM – X:XX XM')
        .replace(/{makeupLocation}/g, makeupLocation || 'XXX');
    };

    let subject = replaceAllPlaceholders(subjectTemplate);
    let body = replaceAllPlaceholders(bodyTemplate);

    if (!isEditingEmail) {
      setEditableSubject(subject);
      setEditableBody(body);
    }
  }, [emailingStudent, selectedTemplateId, emailToParent, selectedWorks, components, rosterName, emailTemplates, makeupCycle, makeupDay, makeupTime, makeupLocation, isEditingEmail, adviserEmail]);

  const handleBulkEmail = (type: 'students' | 'parents' | 'select' | 'select-parents' | 'both') => {
    if (type === 'select' || type === 'select-parents') {
      setBulkEmailStep('select');
      setBulkEmailMode(type);
      setBulkEmailSelection([]);
      return;
    }

    let emails: string[] = [];
    
    // Adviser will be CC'd, not BCC'd
    // if (adviserEmail) emails.push(adviserEmail);

    if (type === 'students') {
      emails.push(...displayedStudents.map(s => s.studentEmail).filter(Boolean) as string[]);
    } else if (type === 'parents') {
      emails.push(...displayedStudents.flatMap(s => [s.parentEmail, s.parentEmail2]).filter(Boolean) as string[]);
    } else if (type === 'both') {
      emails.push(...displayedStudents.flatMap(s => [s.studentEmail, s.parentEmail, s.parentEmail2]).filter(Boolean) as string[]);
    }

    if (emails.length === 0) {
      showAlert('No emails found for the selected group.', 'No Emails', 'warning');
      return;
    }

    // Unique emails only
    const uniqueEmails = [...new Set(emails)];
    const ccParam = adviserEmail ? `&cc=${encodeURIComponent(adviserEmail)}` : '';
    
    if (emailClient === 'gmail') {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${uniqueEmails.join(',')}${ccParam}`;
      window.open(gmailUrl, '_blank');
    } else {
      window.location.href = `mailto:?bcc=${uniqueEmails.join(',')}${ccParam}`;
    }
    setIsBulkEmailModalOpen(false);
  };

  const handleBulkEmailSelection = () => {
    if (bulkEmailSelection.length === 0) {
      showAlert('Please select at least one student.', 'No Selection', 'warning');
      return;
    }

    const selectedStudents = displayedStudents.filter(s => bulkEmailSelection.includes(s.id));
    let emails: string[] = [];
    
    // Adviser will be CC'd, not BCC'd
    // if (adviserEmail) emails.push(adviserEmail);

    if (bulkEmailMode === 'select-parents') {
      // Parents + Students (as CC/in list)
      emails.push(...selectedStudents.flatMap(s => [s.parentEmail, s.parentEmail2]).filter(Boolean) as string[]);
      emails.push(...selectedStudents.map(s => s.studentEmail).filter(Boolean) as string[]);
    } else {
      // Default behavior (Select Students) - includes everyone associated
      emails.push(...selectedStudents.flatMap(s => [s.studentEmail, s.parentEmail, s.parentEmail2]).filter(Boolean) as string[]);
    }

    if (emails.length === 0) {
      showAlert('No emails found for the selected students.', 'No Emails', 'warning');
      return;
    }

    const uniqueEmails = [...new Set(emails)];
    const ccParam = adviserEmail ? `&cc=${encodeURIComponent(adviserEmail)}` : '';
    
    if (emailClient === 'gmail') {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${uniqueEmails.join(',')}${ccParam}`;
      window.open(gmailUrl, '_blank');
    } else {
      window.location.href = `mailto:?bcc=${uniqueEmails.join(',')}${ccParam}`;
    }
    setIsBulkEmailModalOpen(false);
    setBulkEmailStep('menu');
    setBulkEmailSelection([]);
  };

  const toggleBulkSelection = (id: string) => {
    setBulkEmailSelection(prev => 
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const handleCopyColumn = async (type: 'initial' | 'total' | 'grade') => {
    try {
      const values = displayedStudents.map(student => {
        let effectiveStudent = student;
        if (showIncentives) {
          const adjustment = calculateAdjustedScores(student, components, incentiveMode);
          effectiveStudent = { ...student, scores: adjustment.scores };
        }

        if (type === 'initial') {
          return calculateInitialGrade(components, effectiveStudent, transmutationFormula).toFixed(4);
        } else if (type === 'total') {
          return calculateFinalGrade(components, effectiveStudent, transmutationFormula).toFixed(4);
        } else {
          return Math.round(calculateFinalGrade(components, effectiveStudent, transmutationFormula)).toString();
        }
      });
      
      await navigator.clipboard.writeText(values.join('\n'));
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handlePasteNotSupported = () => {
    showAlert('Pasting into calculated columns is not supported.', 'Not Supported', 'warning');
  };

  const handleClearNotSupported = () => {
    showAlert('Clearing calculated columns is not supported.', 'Not Supported', 'warning');
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setHasManuallySelectedTemplate(true);
    
    if (saveTemplatePreference && templateId) {
      localStorage.setItem('preferredEmailTemplateId', templateId);
    }
    
    const template = emailTemplates.find(t => t.id === templateId);
    
    if (template) {
      const condition = template.triggerCondition || template.scenario;
      
      if (condition === 'all' || condition === 'default' || templateId === 'progress-update') {
        const ids = components.flatMap(c => c.subComponents.map(s => s.id));
        setSelectedWorks(ids);
      } else if (condition === 'failing' && emailingStudent) {
        const ids = components.flatMap(c => 
          c.subComponents.filter(s => {
            const score = emailingStudent.scores[s.id];
            return score !== undefined && score !== null && score < (s.totalScore * 0.6);
          }).map(s => s.id)
        );
        setSelectedWorks(ids);
      } else if (condition === 'missing' && emailingStudent) {
        const ids = components.flatMap(c => 
          c.subComponents.filter(s => {
            const score = emailingStudent.scores[s.id];
            return score === undefined || score === null;
          }).map(s => s.id)
        );
        setSelectedWorks(ids);
      } else if (condition === 'passing' && emailingStudent) {
        const ids = components.flatMap(c => 
          c.subComponents.filter(s => {
            const score = emailingStudent.scores[s.id];
            return score !== undefined && score !== null && score >= (s.totalScore * 0.6);
          }).map(s => s.id)
        );
        setSelectedWorks(ids);
      } else if (condition === 'end-term' && emailingStudent) {
        const ids = components
          .filter(c => c.id === 'end-term')
          .flatMap(c => c.subComponents.map(s => s.id));
        setSelectedWorks(ids);
      } else if (templateId === 'summary-written-endterm') {
        const ids = components
          .filter(c => c.id === 'written-work' || c.id === 'end-term')
          .flatMap(c => c.subComponents.map(s => s.id));
        setSelectedWorks(ids);
      } else if (templateId === 'summary-all-other') {
        const ids = components
          .filter(c => c.id !== 'written-work' && c.id !== 'end-term')
          .flatMap(c => c.subComponents.map(s => s.id));
        setSelectedWorks(ids);
      }
    } else if (!templateId) {
      setSelectedWorks([]);
    }
  };

  // ... existing code ...

  const getFirstName = (fullName: string) => {
    if (fullName.includes(',')) {
      return fullName.split(',')[1].trim().split(' ')[0];
    }
    return fullName.split(' ')[0];
  };

  const getSubjectFromRosterName = (name: string) => {
    const match = name.match(/\(([^)]+)\)/);
    return match ? match[1] : name;
  };

  const getExportFilename = (extension: string) => {
    let section = '';
    let subject = '';
    const match = (rosterName || '').match(/^(.*?)\s*\((.*?)\)/);
    if (match) {
      section = match[1].trim();
      subject = match[2].trim();
    } else {
      section = rosterName || 'Class Record';
    }

    const termNum = pdfTerm.match(/\d+/)?.[0] || '';
    const sectionParts = section.split('-');
    const sectionNum = sectionParts[0].match(/\d+/)?.[0] || sectionParts[0];
    const sectionLetter = sectionParts[1] ? sectionParts[1].trim() : '';
    const subjectName = subject.replace(/[^a-z0-9]/gi, '_');
    return `T${termNum}${sectionNum}${sectionLetter}_${subjectName}.${extension}`;
  };

  const isFailing = (score: number, total: number) => {
    return score < (total * 0.6);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor)
  );

  const saveSubComponentDetails = () => {
    if (!editingSubComponent) return;
    
    if (curveConfig?.active) {
      const subjectName = getSubjectFromRosterName(rosterName);
      
      const applyCurveToStudents = (studentList: Student[], subId: string, totalScore: number, config: typeof curveConfig) => {
        if (!config) return studentList;
        return studentList.map(student => {
          const oldScore = student.scores[subId];
          if (oldScore === undefined) return student;
          
          let newScore = oldScore;
          
          if (config.type === 'interpolation' && config.oldMax > config.oldMin) {
            const nMin = parseFloat(config.newMin) || 0;
            const nMax = parseFloat(config.newMax) || 0;
            newScore = ((oldScore - config.oldMin) / (config.oldMax - config.oldMin)) * (nMax - nMin) + nMin;
          } else if (config.type === 'classical') {
            const bonus = parseFloat(config.flatBonus) || 0;
            newScore = oldScore + bonus;
          } else if (config.type === 'traditional') {
            // Traditional (Scale to Max): (Score / Highest) * Max
            if (config.oldMax > 0) {
              newScore = (oldScore / config.oldMax) * totalScore;
            }
          } else if (config.type === 'canvas') {
            // Canvas Style: Scale based on target average
            const targetAvg = parseFloat(config.targetAverage) || 0;
            if (config.oldAvg > 0) {
              newScore = (oldScore / config.oldAvg) * targetAvg;
            }
          }
          
          if (config.type !== 'classical') {
            newScore = Math.round(newScore);
          }
          if (newScore < 0) newScore = 0;
          
          return {
            ...student,
            scores: {
              ...student.scores,
              [subId]: newScore
            }
          };
        });
      };

      // Apply to current section
      setStudents(prev => applyCurveToStudents(prev, editingSubComponent.subId, editingSubComponent.totalScore, curveConfig));

      // Apply to all sections if requested
      if (curveConfig.applyToAllSections && subjectName) {
        const rosters = getRosters();
        rosters.forEach(roster => {
          if (roster.id === rosterId) return; // Skip current
          
          const rSubject = getSubjectFromRosterName(roster.name);
          if (rSubject === subjectName) {
            const data = getRosterData(roster.id);
            if (data) {
              // Find the matching subcomponent by name
              const targetComp = data.components.find(c => c.name === editingSubComponent.componentId || c.id === editingSubComponent.componentId);
              if (targetComp) {
                const targetSub = targetComp.subComponents.find(s => s.name === editingSubComponent.name);
                if (targetSub) {
                  data.students = applyCurveToStudents(data.students, targetSub.id, targetSub.totalScore, curveConfig);
                  saveRosterData(roster.id, data);
                }
              }
            }
          }
        });
      }
    }

    const oldName = components.find(c => c.id === editingSubComponent.componentId)?.subComponents.find(s => s.id === editingSubComponent.subId)?.name;
    const renameMap = oldName && oldName !== editingSubComponent.name ? { [editingSubComponent.subId]: oldName } : undefined;

    const updatedComponents = components.map(comp => {
      if (comp.id === editingSubComponent.componentId) {
        return {
          ...comp,
          subComponents: comp.subComponents.map(sub => {
            if (sub.id === editingSubComponent.subId) {
              return { 
                ...sub, 
                name: editingSubComponent.name, 
                description: editingSubComponent.description,
                totalScore: editingSubComponent.totalScore
              };
            }
            return sub;
          })
        };
      }
      return comp;
    });

    setComponents(updatedComponents);

    // Sync to subject if description changed
    const match = rosterName.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const subjectName = match[2].trim();
      syncComponentsToSubject(subjectName, updatedComponents, renameMap);
      setSyncMessage({ type: 'success', text: `Changes synced to all classes for subject "${subjectName}".` });
      setTimeout(() => setSyncMessage(null), 5000);
    }

    setEditingSubComponent(null);
    setCurveConfig(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setStudents((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const applyScoreIncrease = () => {
    if (!editingSubComponent) return;
    if (scoreIncrease.amount === 0 || scoreIncrease.studentIds.length === 0) return;

    setStudents(prev => prev.map(student => {
      if (scoreIncrease.studentIds.includes(student.id)) {
        return {
          ...student,
          scores: {
            ...student.scores,
            [editingSubComponent.subId]: (student.scores[editingSubComponent.subId] || 0) + scoreIncrease.amount
          }
        };
      }
      return student;
    }));
    
    // Reset score increase
    setScoreIncrease({ amount: 0, studentIds: [] });
  };

  const initiateEmail = (student: Student) => {
    setEmailingStudent(student);
    
    const preferredId = localStorage.getItem('preferredEmailTemplateId');
    const preferredTarget = localStorage.getItem('preferredEmailTarget'); // 'student' or 'parent'
    
    setEmailToParent(preferredTarget === 'parent');
    setHasManuallySelectedTemplate(true); // Don't auto-select
    
    if (preferredId && emailTemplates.some(t => t.id === preferredId)) {
      setSelectedTemplateId(preferredId);
      // We need to apply the template's score selection logic
      const template = emailTemplates.find(t => t.id === preferredId);
      if (template) {
        const condition = template.triggerCondition || template.scenario;
        if (condition === 'all' || condition === 'default' || preferredId === 'progress-update') {
          setSelectedWorks(components.flatMap(c => c.subComponents.map(s => s.id)));
        } else if (condition === 'failing') {
          setSelectedWorks(components.flatMap(c => c.subComponents.filter(s => isFailing(student.scores[s.id] || 0, s.totalScore)).map(s => s.id)));
        } else if (condition === 'missing') {
          setSelectedWorks(components.flatMap(c => c.subComponents.filter(s => student.scores[s.id] === undefined || student.scores[s.id] === null).map(s => s.id)));
        } else if (condition === 'passing') {
          setSelectedWorks(components.flatMap(c => c.subComponents.filter(s => student.scores[s.id] !== undefined && student.scores[s.id] !== null && !isFailing(student.scores[s.id], s.totalScore)).map(s => s.id)));
        } else {
          // Default to all if scenario not handled specifically here
          setSelectedWorks(components.flatMap(c => c.subComponents.map(s => s.id)));
        }
      }
    } else {
      setSelectedTemplateId('');
      setSelectedWorks([]);
    }
  };

  const toggleWorkSelection = (subId: string) => {
    setSelectedWorks(prev => {
      if (prev.includes(subId)) {
        return prev.filter(id => id !== subId);
      }
      return [...prev, subId];
    });
  };

  const sendEmail = async () => {
    if (!emailingStudent) return;
    
    if (selectedWorks.length === 0) {
      showAlert("Please select at least one assessment to send.", 'No Selection', 'warning');
      return;
    }

    const student = emailingStudent;
    const template = emailTemplates.find(t => t.id === selectedTemplateId) || emailTemplates[0];
    
    // Use editable states if editing, otherwise regenerate (though useEffect handles regeneration)
    // Actually, useEffect updates editableSubject/Body. 
    // If isEditingEmail is true, we rely on the user's edits which are stored in editableSubject/Body.
    // If isEditingEmail is false, useEffect keeps editableSubject/Body in sync with the template.
    const subject = editableSubject;
    const body = editableBody;

    // Determine Recipients
    let toEmail = student.studentEmail;
    let ccEmails = [student.parentEmail, student.parentEmail2, adviserEmail].filter(Boolean);

    if (emailToParent) {
      const parents = [student.parentEmail, student.parentEmail2].filter(Boolean);
      toEmail = parents.join(',');
      ccEmails = [student.studentEmail, adviserEmail].filter(Boolean);
      
      if (!toEmail) {
        showAlert("This student does not have a parent email address.", 'Missing Email', 'warning');
        return;
      }
    }

    // Encode for URL
    const cc = ccEmails.join(',');

    const finishSendingEmail = () => {
      // Apply pseudo-formatting (unicode bold/italic) for plain text email bodies
      const formattedBody = applyPseudoFormatting(body);

      if (emailClient === 'gmail') {
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(formattedBody)}&cc=${encodeURIComponent(cc)}`;
        window.open(gmailUrl, '_blank');
      } else {
        window.location.href = `mailto:${toEmail}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(formattedBody)}`;
      }

      setEmailingStudent(null);
    };

    if (template.attachments && template.attachments.length > 0) {
      // Check if attachments are stored files
      const storedFiles = await getFiles();
      const attachmentsToDownload: StoredFile[] = [];
      const manualAttachments: string[] = [];

      for (const attachment of template.attachments) {
        const attachmentName = typeof attachment === 'string' ? attachment : attachment.name;
        const storedFile = storedFiles.find(f => f.name === attachmentName);
        
        if (storedFile) {
          attachmentsToDownload.push(storedFile);
        } else {
          manualAttachments.push(attachmentName);
        }
      }

      const postDownloadAlerts = () => {
        if (manualAttachments.length > 0) {
          setAlertConfig({
            title: 'Manual Attachments Required',
            message: `Please remember to attach the following files manually:\n\n${manualAttachments.join('\n')}`,
            type: 'warning'
          });
        } else if (attachmentsToDownload.length > 0) {
          setAlertConfig({
            title: 'Attachments Downloaded',
            message: `Please attach the downloaded files to your email.`,
            type: 'info'
          });
        }
        finishSendingEmail();
      };

      if (attachmentsToDownload.length > 0) {
        setConfirmConfig({
          title: 'Download Attachments',
          message: `This email template has ${attachmentsToDownload.length} associated file(s). Do you want to download them now to attach to your email?`,
          onConfirm: () => {
            for (const file of attachmentsToDownload) {
              const url = URL.createObjectURL(file.data);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
            setConfirmConfig(null);
            postDownloadAlerts();
          },
          onCancel: () => {
            setConfirmConfig(null);
            postDownloadAlerts();
          }
        });
        return; // Wait for user confirmation
      } else {
        postDownloadAlerts();
        return;
      }
    }

    finishSendingEmail();
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);

  // Load from local storage on mount or rosterId change
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
      setShowExtraPoints(data.showExtraPoints !== false);
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
      // If no data found for this ID, redirect to dashboard
      navigate('/');
    }
  }, [rosterId, navigate]);

  // Save to local storage on change
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

  const handleIncentiveChange = (studentId: string, type: 'ww' | 'pt', value: string) => {
    if (isViewMode) return;
    const numValue = value === '' ? 0 : parseFloat(value);
    if (isNaN(numValue)) return;

    setStudents(prev => prev.map(student => {
      if (student.id === studentId) {
        return {
          ...student,
          [type === 'ww' ? 'wwIncentive' : 'ptIncentive']: numValue
        };
      }
      return student;
    }));
  };

  const handleCopyScores = async (subComponentId: string, type: 'score' | 'pt-incentive' | 'ww-incentive' = 'score') => {
    try {
      const scores = displayedStudents.map(s => {
        let val: number | undefined;
        if (type === 'score') {
          val = s.scores[subComponentId];
        } else if (type === 'pt-incentive') {
          val = s.ptIncentive;
        } else if (type === 'ww-incentive') {
          val = s.wwIncentive;
        }
        return val === undefined ? '' : val;
      });
      const text = scores.join('\n');
      await navigator.clipboard.writeText(text);
      // Optional: Show a toast or feedback
    } catch (err) {
      console.error('Failed to copy scores:', err);
    }
  };

  const moveComponent = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === components.length - 1) return;

    const newComponents = [...components];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    
    [newComponents[index], newComponents[targetIndex]] = [newComponents[targetIndex], newComponents[index]];
    
    setComponents(newComponents);
  };

  const handleScoreClick = (studentId: string, subComponentId: string, value: number) => {
    if (isViewMode) return;

    let targetSubComponent: SubComponent | undefined;
    for (const comp of components) {
      const found = comp.subComponents.find(sub => sub.id === subComponentId);
      if (found) {
        targetSubComponent = found;
        break;
      }
    }

    if (targetSubComponent && value > targetSubComponent.totalScore) {
      if (suppressedCell?.studentId === studentId && suppressedCell?.subComponentId === subComponentId) {
        // Suppressed, do not show modal
      } else {
        setExcessScoreData({
          studentId,
          subComponentId,
          excess: value - targetSubComponent.totalScore,
          step: 'warning',
          originalValue: value
        });
      }
    }
  };

  const handleScoreChange = (studentId: string, subComponentId: string, value: string) => {
    if (isViewMode) return;
    // Handle empty input (deletion) -> treat as missing
    if (value === '') {
      setStudents(prev => prev.map(student => {
        if (student.id === studentId) {
          const newScores = { ...student.scores };
          delete newScores[subComponentId];
          return { ...student, scores: newScores };
        }
        return student;
      }));
      return;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    let targetSubComponent: SubComponent | undefined;
    for (const comp of components) {
      const found = comp.subComponents.find(sub => sub.id === subComponentId);
      if (found) {
        targetSubComponent = found;
        break;
      }
    }

    if (targetSubComponent && numValue > targetSubComponent.totalScore) {
      if (suppressedCell?.studentId === studentId && suppressedCell?.subComponentId === subComponentId) {
        // Suppressed, do not show modal
      } else {
        setExcessScoreData({
          studentId,
          subComponentId,
          excess: numValue - targetSubComponent.totalScore,
          step: 'warning',
          originalValue: numValue
        });
      }
    } else if (targetSubComponent && numValue <= targetSubComponent.totalScore) {
      if (suppressedCell?.studentId === studentId && suppressedCell?.subComponentId === subComponentId) {
        setSuppressedCell(null);
      }
    }

    setStudents(prev => prev.map(student => {
      if (student.id === studentId) {
        return {
          ...student,
          scores: {
            ...student.scores,
            [subComponentId]: numValue
          }
        };
      }
      return student;
    }));
  };

  const handlePasteScores = (subComponentId: string, subComponentName: string, type: 'score' | 'pt-incentive' | 'ww-incentive' = 'score') => {
    if (isViewMode) {
      showAlert("You cannot paste scores in View Mode.", "Action Blocked", "warning");
      return;
    }
    setPastingTo({ id: subComponentId, name: subComponentName, type });
    setPasteText('');
  };

  const confirmPasteScores = () => {
    if (isViewMode) return;
    if (!pastingTo || !pasteText.trim()) return;

    // Split by newline to preserve blank lines, but trim trailing whitespace/newlines
    const pastedLines = pasteText.trimEnd().split(/\r?\n/);
    
    if (pastedLines.length === 0) {
      return;
    }

    const count = Math.min(pastedLines.length, students.length);
    
    setStudents(prevStudents => {
      const newStudents = [...prevStudents];
      for (let i = 0; i < count; i++) {
        const line = pastedLines[i].trim();
        
        if (line === '') {
          // Treat blank line as blank score (remove existing score)
          if (pastingTo.type === 'score') {
            const newScores = { ...newStudents[i].scores };
            delete newScores[pastingTo.id];
            newStudents[i] = {
              ...newStudents[i],
              scores: newScores
            };
          } else if (pastingTo.type === 'pt-incentive') {
             const { ptIncentive, ...rest } = newStudents[i];
             newStudents[i] = rest;
          } else if (pastingTo.type === 'ww-incentive') {
             const { wwIncentive, ...rest } = newStudents[i];
             newStudents[i] = rest;
          }
        } else {
          const score = parseFloat(line);
          if (!isNaN(score)) {
            if (pastingTo.type === 'score') {
              newStudents[i] = {
                ...newStudents[i],
                scores: {
                  ...newStudents[i].scores,
                  [pastingTo.id]: score
                }
              };
            } else if (pastingTo.type === 'pt-incentive') {
              newStudents[i] = { ...newStudents[i], ptIncentive: score };
            } else if (pastingTo.type === 'ww-incentive') {
              newStudents[i] = { ...newStudents[i], wwIncentive: score };
            }
          }
        }
      }
      return newStudents;
    });

    setPastingTo(null);
    setPasteText('');
  };

  const initiateClearColumn = (subComponentId: string, subComponentName: string, type: 'score' | 'pt-incentive' | 'ww-incentive' = 'score') => {
    if (isViewMode) {
      showAlert("You cannot clear columns in View Mode.", "Action Blocked", "warning");
      return;
    }
    setClearingColumn({ id: subComponentId, name: subComponentName, type });
  };

  const confirmClearColumn = () => {
    if (isViewMode) {
      showAlert("You cannot clear columns in View Mode.", "Action Blocked", "warning");
      return;
    }
    if (!clearingColumn) return;

    // Clear scores from students for this specific column
    setStudents(prev => prev.map(student => {
      if (clearingColumn.type === 'score') {
        const newScores = { ...student.scores };
        delete newScores[clearingColumn.id];
        return {
          ...student,
          scores: newScores
        };
      } else if (clearingColumn.type === 'pt-incentive') {
        return {
          ...student,
          ptIncentive: 0
        };
      } else if (clearingColumn.type === 'ww-incentive') {
        return {
          ...student,
          wwIncentive: 0
        };
      }
      return student;
    }));

    setClearingColumn(null);
  };

  const addStudent = () => {
    if (isViewMode) {
      showAlert("You cannot add students in View Mode.", "Action Blocked", "warning");
      return;
    }
    if (!newStudentName.trim()) return;
    const newStudent: Student = {
      id: crypto.randomUUID(),
      name: newStudentName,
      scores: {}
    };
    
    const updatedStudents = [...students, newStudent];
    updatedStudents.sort((a, b) => a.name.localeCompare(b.name));
    
    setStudents(updatedStudents);
    setNewStudentName('');
  };

  const initiateTransferStudent = (id: string) => {
    if (isViewMode) {
      showAlert("You cannot transfer students in View Mode.", "Action Blocked", "warning");
      return;
    }
    const allRosters = getRosters();
    const otherRosters = allRosters.filter(r => r.id !== rosterId);
    if (otherRosters.length === 0) {
      showAlert("No other classes available for transfer.", "Action Blocked", "warning");
      return;
    }
    setAvailableRosters(otherRosters);
    setSelectedTransferRosterId(otherRosters[0].id);
    setTransferStudentId(id);
  };

  const confirmTransferStudent = () => {
    if (transferStudentId && selectedTransferRosterId) {
      const studentToTransfer = students.find(s => s.id === transferStudentId);
      if (!studentToTransfer) return;

      // Get target roster data
      const targetRosterData = getRosterData(selectedTransferRosterId);
      if (targetRosterData) {
        // Create a blank student for the target roster
        const newStudent: Student = {
          ...studentToTransfer,
          scores: {},
          ptIncentive: undefined,
          wwIncentive: undefined
        };

        // Add to target roster and sort
        const updatedTargetStudents = [...targetRosterData.students, newStudent];
        updatedTargetStudents.sort((a, b) => a.name.localeCompare(b.name));
        targetRosterData.students = updatedTargetStudents;

        // Save target roster
        saveRosterData(selectedTransferRosterId, targetRosterData);

        // Remove from current roster
        setStudents(prev => prev.filter(s => s.id !== transferStudentId));
        if (selectedStudent?.id === transferStudentId) {
          setSelectedStudent(null);
        }
        showAlert(`Student transferred successfully.`, "Transfer Complete", "success");
      } else {
        showAlert("Failed to load target class data.", "Transfer Failed", "error");
      }
      setTransferStudentId(null);
    }
  };

  const initiateRemoveStudent = (id: string) => {
    if (isViewMode) {
      showAlert("You cannot remove students in View Mode.", "Action Blocked", "warning");
      return;
    }
    setDeleteCandidate(id);
  };

  const confirmRemoveStudent = () => {
    if (deleteCandidate) {
      setStudents(prev => prev.filter(s => s.id !== deleteCandidate));
      if (selectedStudent?.id === deleteCandidate) {
        setSelectedStudent(null);
      }
      setDeleteCandidate(null);
    }
  };

  const updateStudentDetails = (id: string, updates: Partial<Student>) => {
    setStudents(prev => prev.map(s => 
      s.id === id ? { ...s, ...updates } : s
    ));
    if (selectedStudent?.id === id) {
      setSelectedStudent(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const triggerFileUpload = () => {
    if (isViewMode) {
      showAlert("You cannot import students in View Mode.", "Action Blocked", "warning");
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset to ensure onChange fires even for same file
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportError(null);
    setImportCandidates(null);

    const result = await parseRosterFile(file);
    
    setIsProcessing(false);
    if (result.error) {
      setImportError(result.error);
    } else {
      setImportCandidates(result.students);
    }
  };

  const confirmImport = () => {
    if (importCandidates) {
      setStudents(importCandidates);
      setImportCandidates(null);
    }
  };

  const cancelImport = () => {
    setImportCandidates(null);
    setImportError(null);
  };

  const handleSyncComponents = () => {
    const match = rosterName.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const subjectName = match[2].trim();
      setSyncSubjectName(subjectName);
      setIsSyncModalOpen(true);
    } else {
      setSyncMessage({ type: 'error', text: "Could not determine the subject from the class name. Please ensure the class name follows the format 'Class Name (Subject)'." });
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const confirmSyncComponents = () => {
    syncComponentsToSubject(syncSubjectName, components);
    setIsSyncModalOpen(false);
    setSyncMessage({ type: 'success', text: `Grading components synced to subject "${syncSubjectName}".` });
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const exportPDF = () => {
    if (savePdfDefaults) {
      localStorage.setItem('pdfUnit', pdfUnit);
      localStorage.setItem('pdfYear1', pdfYear1);
      localStorage.setItem('pdfYear2', pdfYear2);
      localStorage.setItem('pdfTerm', pdfTerm);
    }
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: [8.5, 13]
    });
    
    let section = '';
    let subject = '';
    const match = (rosterName || '').match(/^(.*?)\s*\((.*?)\)/);
    if (match) {
      section = match[1].trim();
      subject = match[2].trim();
    } else {
      section = rosterName || 'Class Record';
    }

    const getAbbreviation = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes('written work')) return 'WW';
      if (lower.includes('performance task')) return 'PT';
      if (lower.includes('end-term') || lower.includes('end term')) return 'ETA';
      return name;
    };

    const generateTable = (withIncentives: boolean, startY: number) => {
      const numStudents = displayedStudents.length;
      let dynamicFontSize = 7;
      let dynamicCellPadding = 0.03;

      if (numStudents >= 38) {
        dynamicFontSize = 5.5;
        dynamicCellPadding = 0.015;
      } else if (numStudents >= 34) {
        dynamicFontSize = 6;
        dynamicCellPadding = 0.02;
      } else if (numStudents >= 28) {
        dynamicFontSize = 6.5;
        dynamicCellPadding = 0.025;
      } else if (numStudents >= 20) {
        dynamicFontSize = 7;
        dynamicCellPadding = 0.03;
      } else {
        dynamicFontSize = 8;
        dynamicCellPadding = 0.04;
      }

      const titleLines = [
        'De La Salle Santiago Zobel School',
        `${pdfUnit} Unit`,
        `AY ${pdfYear1} - ${pdfYear2}`,
        '',
        `${section} ${subject} ${pdfTerm} ${withIncentives ? '(With Incentives)' : '(Without Incentives)'}`.trim()
      ];
      
      doc.setFontSize(11);
      const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
      let y = startY;
      titleLines.forEach(line => {
        const textWidth = doc.getTextWidth(line);
        doc.text(line, (pageWidth - textWidth) / 2, y);
        y += 0.22;
      });

      const totalColumnIndices: number[] = [];
      const incentiveColumnIndices: number[] = [];
      let wwIncentiveColIndex = -1;
      let ptIncentiveColIndex = -1;
      let finalGradeColumnIndex = -1;
      
      // Build Header Row (Row 1)
      const headerRow: string[] = ['Class no.', 'Name of Students'];
      components.forEach(comp => {
        const isWW = comp.name.toLowerCase().includes('written work');
        const isPT = comp.name.toLowerCase().includes('performance task');
        
        if (withIncentives && isWW) {
          headerRow.push('WW\nIncentives');
          wwIncentiveColIndex = headerRow.length - 1;
          incentiveColumnIndices.push(wwIncentiveColIndex);
        }
        if (withIncentives && isPT && incentiveMode === 'both') {
          headerRow.push('PT\nIncentives');
          ptIncentiveColIndex = headerRow.length - 1;
          incentiveColumnIndices.push(ptIncentiveColIndex);
        }

        comp.subComponents.forEach(sub => {
          headerRow.push(`${sub.name}\n(${sub.totalScore})`);
        });
        headerRow.push(`${getAbbreviation(comp.name)}\nTotal`);
        totalColumnIndices.push(headerRow.length - 1);
      });
      headerRow.push('Total', 'Final\nGrade');
      totalColumnIndices.push(headerRow.length - 2);
      finalGradeColumnIndex = headerRow.length - 1;
      if (withIncentives && showExtraPoints) {
        headerRow.push('Extra\nPoints');
        incentiveColumnIndices.push(headerRow.length - 1);
      }

      // Build Data Rows
      const dataRows = displayedStudents.map((student, index) => {
        let effectiveStudent = student;
        let extraPoints = 0;
        let scoreSources: Record<string, 'ww' | 'pt' | 'mixed'> = {};
        
        if (withIncentives) {
          const adjustment = calculateAdjustedScores(student, components, incentiveMode);
          effectiveStudent = { ...student, scores: adjustment.scores };
          extraPoints = adjustment.extraPoints;
          scoreSources = adjustment.sources;
        }

        const row: any[] = [index + 1, effectiveStudent.name];

        components.forEach(comp => {
          const stats = calculateComponentStats(comp, effectiveStudent, transmutationFormula);
          const isWW = comp.name.toLowerCase().includes('written work');
          const isPT = comp.name.toLowerCase().includes('performance task');

          if (withIncentives && isWW) {
            row.push(student.wwIncentive !== undefined ? student.wwIncentive : '');
          }
          if (withIncentives && isPT && incentiveMode === 'both') {
            row.push(student.ptIncentive !== undefined ? student.ptIncentive : '');
          }

          comp.subComponents.forEach(sub => {
            const score = effectiveStudent.scores[sub.id];
            const originalScore = student.scores[sub.id];
            
            // Check if incentive changed the score
            const isChanged = withIncentives && score !== originalScore && score !== undefined;
            
            let cellContent = score !== undefined ? score : '';
            let cellStyles: any = {};
            
            if (isChanged) {
              cellContent = `${score}`;
              const source = scoreSources[sub.id];
              if (source === 'ww') {
                cellStyles.fillColor = [219, 234, 254]; // blue-100
                cellStyles.textColor = [30, 64, 175]; // blue-800
                cellStyles.fontStyle = 'bold';
              } else if (source === 'pt') {
                cellStyles.fillColor = [254, 243, 199]; // amber-100
                cellStyles.textColor = [146, 64, 14]; // amber-800
                cellStyles.fontStyle = 'bold';
              } else {
                cellStyles.fillColor = [220, 252, 231]; // green-100
                cellStyles.textColor = [22, 101, 52]; // green-800
                cellStyles.fontStyle = 'bold';
              }
            }
            
            if (score !== undefined && isFailingScore(score, sub.totalScore)) {
              cellStyles.textColor = [220, 38, 38]; // Red-600
            }
            
            if (Object.keys(cellStyles).length > 0) {
              row.push({ content: cellContent, styles: cellStyles });
            } else {
              row.push(cellContent);
            }
          });
          row.push(stats.totalScore);
        });

        // Calculate final grades based on ALL components
        const allStats = components.map(c => calculateComponentStats(c, effectiveStudent, transmutationFormula));
        const totalWeightedScore = round4(allStats.reduce((acc, stat) => acc + stat.weightedScore, 0));
        const finalGrade = Math.min(100, totalWeightedScore);
        const roundedFinalGrade = Math.round(finalGrade);

        row.push(finalGrade.toFixed(4));
        
        if (roundedFinalGrade < 75) {
          row.push({ content: roundedFinalGrade, styles: { textColor: [220, 38, 38] } });
        } else {
          row.push(roundedFinalGrade);
        }
        
        if (withIncentives && showExtraPoints) {
          row.push(extraPoints > 0 ? extraPoints : '');
        }

        return row;
      });

      doc.setFontSize(dynamicFontSize);
      let maxNameWidth = doc.getTextWidth('Name of Students');
      displayedStudents.forEach(s => {
        const width = doc.getTextWidth(s.name);
        if (width > maxNameWidth) maxNameWidth = width;
      });
      maxNameWidth += 0.15; // Add padding

      autoTable(doc, {
        head: [headerRow],
        body: dataRows,
        startY: y + 0.1,
        margin: { bottom: 0.3, left: 0.4, right: 0.4 },
        styles: { fontSize: dynamicFontSize, cellPadding: dynamicCellPadding, lineWidth: 0.01, lineColor: [200, 200, 200] },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, halign: 'center', valign: 'middle' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 0.4 },
          1: { halign: 'left', cellWidth: maxNameWidth },
          ...(wwIncentiveColIndex !== -1 ? { [wwIncentiveColIndex]: { halign: 'center', cellWidth: 0.8 } } : {}),
          ...(ptIncentiveColIndex !== -1 ? { [ptIncentiveColIndex]: { halign: 'center', cellWidth: 0.8 } } : {})
        },
        theme: 'grid',
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.015,
        alternateRowStyles: { fillColor: [249, 250, 251] }, // Very light gray for alternating rows
        didParseCell: function(data) {
          if (data.section === 'body') {
            if (data.column.index === 1) {
              (data.cell as any).customName = data.cell.raw;
              data.cell.text = []; // Clear text so we can draw it manually
            } else if (data.column.index > 1) {
              data.cell.styles.halign = 'center';
              
              if (data.column.index === wwIncentiveColIndex) {
                data.cell.styles.fillColor = [219, 234, 254]; // blue-100
                data.cell.styles.textColor = [30, 64, 175]; // blue-800
                data.cell.styles.fontStyle = 'bold';
              } else if (data.column.index === ptIncentiveColIndex) {
                data.cell.styles.fillColor = [254, 243, 199]; // amber-100
                data.cell.styles.textColor = [146, 64, 14]; // amber-800
                data.cell.styles.fontStyle = 'bold';
              } else if (incentiveColumnIndices.includes(data.column.index) || data.column.index === finalGradeColumnIndex) {
                data.cell.styles.fontStyle = 'bold';
              }
              
              if (totalColumnIndices.includes(data.column.index)) {
                if (data.row.index % 2 === 0) {
                  data.cell.styles.fillColor = [243, 244, 246]; // gray-100
                } else {
                  data.cell.styles.fillColor = [229, 231, 235]; // gray-200
                }
              }
            }
          }
        },
        didDrawCell: function(data) {
          if (data.section === 'body' && data.column.index === 1 && (data.cell as any).customName) {
            const name = String((data.cell as any).customName);
            const parts = name.split(',');
            const doc = data.doc;
            
            // Calculate vertical center
            const y = data.cell.y + (data.cell.height / 2);
            const x = data.cell.x + dynamicCellPadding; // dynamic padding left

            doc.setFontSize(dynamicFontSize);

            if (parts.length > 1) {
              const surname = parts[0] + ',';
              const firstname = parts.slice(1).join(',');

              doc.setFont('helvetica', 'bold');
              doc.text(surname, x, y, { baseline: 'middle' });
              const surnameWidth = doc.getTextWidth(surname);

              doc.setFont('helvetica', 'normal');
              doc.text(firstname, x + surnameWidth, y, { baseline: 'middle' });
            } else {
              // Fallback if no comma
              const spaceParts = name.split(' ');
              if (spaceParts.length > 1) {
                const surname = spaceParts[spaceParts.length - 1];
                const firstname = spaceParts.slice(0, -1).join(' ') + ' ';
                
                doc.setFont('helvetica', 'normal');
                doc.text(firstname, x, y, { baseline: 'middle' });
                const firstnameWidth = doc.getTextWidth(firstname);
                
                doc.setFont('helvetica', 'bold');
                doc.text(surname, x + firstnameWidth, y, { baseline: 'middle' });
              } else {
                doc.setFont('helvetica', 'normal');
                doc.text(name, x, y, { baseline: 'middle' });
              }
            }
          }

          // Draw black line for incentive columns (Both sides in PDF as requested)
          // To make the right border prominent, we draw it as the left border of the NEXT column
          // This ensures it's drawn on top of the next column's background fill.
          const isIncentiveCol = data.column.index === wwIncentiveColIndex || data.column.index === ptIncentiveColIndex;
          const isAfterIncentiveCol = (wwIncentiveColIndex !== -1 && data.column.index === wwIncentiveColIndex + 1) || 
                                     (ptIncentiveColIndex !== -1 && data.column.index === ptIncentiveColIndex + 1);

          if (isIncentiveCol || isAfterIncentiveCol) {
            const doc = data.doc;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.025); // Increased width for better prominence
            
            // Draw the vertical line at the start of the current cell
            // For incentive columns, this is the LEFT border
            // For columns after incentive columns, this is the RIGHT border of the incentive column
            doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
            
            // If it's an incentive column, we also draw its right border immediately 
            // (though the next cell's left border draw will reinforce it)
            if (isIncentiveCol) {
              doc.line(data.cell.x + data.cell.width, data.cell.y, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
          }
        }
      });
      return (doc as any).lastAutoTable.finalY;
    };

    generateTable(false, 0.4);
    if (incentiveMode !== 'none') {
      doc.addPage();
      generateTable(true, 0.4);
    }

    doc.save(getExportFilename('pdf'));
  };

  const exportDescriptionsPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [8.5, 11]
    });

    let section = '';
    let subject = '';
    const match = (rosterName || '').match(/^(.*?)\s*\((.*?)\)/);
    if (match) {
      section = match[1].trim();
      subject = match[2].trim();
    } else {
      section = rosterName || 'Class Record';
    }

    doc.setFontSize(16);
    doc.text('Subject Descriptions', 0.5, 0.8);
    doc.setFontSize(12);
    doc.text(`Subject: ${subject}`, 0.5, 1.1);
    doc.text(`Section: ${section}`, 0.5, 1.3);
    doc.text(`Term: ${pdfTerm}`, 0.5, 1.5);

    let y = 2.0;
    components.forEach(comp => {
      if (y > 10) {
        doc.addPage();
        y = 0.8;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(comp.name.toUpperCase(), 0.5, y);
      y += 0.3;

      comp.subComponents.forEach(sub => {
        if (y > 10) {
          doc.addPage();
          y = 0.8;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${sub.name} (${sub.totalScore} pts)`, 0.7, y);
        y += 0.2;

        doc.setFont('helvetica', 'normal');
        const description = sub.description || 'No description provided.';
        const splitDescription = doc.splitTextToSize(description, 7.0);
        doc.text(splitDescription, 0.7, y);
        y += (splitDescription.length * 0.2) + 0.2;
      });
      y += 0.2;
    });

    doc.save(`${subject.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_descriptions.pdf`);
  };

  const exportXLSX = async () => {
    const workbook = new ExcelJS.Workbook();
    
    const generateSheet = (sheetName: string, withIncentives: boolean) => {
      const sheet = workbook.addWorksheet(sheetName);
      
      const getAbbreviation = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('written work')) return 'WW';
        if (lower.includes('performance task')) return 'PT';
        if (lower.includes('end-term') || lower.includes('end term')) return 'ETA';
        return name;
      };

      const headerRow: string[] = ['Name of Students'];
      components.forEach(comp => {
        const isWW = comp.name.toLowerCase().includes('written work');
        const isPT = comp.name.toLowerCase().includes('performance task');
        
        if (withIncentives && isWW) {
          headerRow.push('WW\nIncentives');
        }
        if (withIncentives && isPT && incentiveMode === 'both') {
          headerRow.push('PT\nIncentives');
        }

        comp.subComponents.forEach(sub => {
          headerRow.push(`${sub.name} (${sub.totalScore})`);
        });
        headerRow.push(`${getAbbreviation(comp.name)} Total`);
      });
      headerRow.push('Total', 'Final Grade');
      if (withIncentives && showExtraPoints) headerRow.push('Extra Points');

      const header = sheet.addRow(headerRow);
      header.font = { bold: true };
      header.alignment = { horizontal: 'center' };

      displayedStudents.forEach(student => {
        let effectiveStudent = student;
        let extraPoints = 0;
        
        if (withIncentives) {
          const adjustment = calculateAdjustedScores(student, components, incentiveMode);
          effectiveStudent = { ...student, scores: adjustment.scores };
          extraPoints = adjustment.extraPoints;
        }

        const rowValues: (string | number)[] = [effectiveStudent.name];
        const boldIndices: number[] = []; // 1-based indices for ExcelJS

        let currentIndex = 2; // Start after 'Name of Students'

        components.forEach(comp => {
          const stats = calculateComponentStats(comp, effectiveStudent, transmutationFormula);
          const isWW = comp.name.toLowerCase().includes('written work');
          const isPT = comp.name.toLowerCase().includes('performance task');

          if (withIncentives && isWW) {
            const val = student.wwIncentive !== undefined ? student.wwIncentive : '';
            rowValues.push(val);
            if (val !== '' && Number(val) > 0) boldIndices.push(currentIndex);
            currentIndex++;
          }
          if (withIncentives && isPT && incentiveMode === 'both') {
            const val = student.ptIncentive !== undefined ? student.ptIncentive : '';
            rowValues.push(val);
            if (val !== '' && Number(val) > 0) boldIndices.push(currentIndex);
            currentIndex++;
          }

          comp.subComponents.forEach(sub => {
            const score = effectiveStudent.scores[sub.id];
            const originalScore = student.scores[sub.id];
            const isChanged = withIncentives && score !== originalScore && score !== undefined;
            
            rowValues.push(score !== undefined ? score : '');
            if (isChanged) boldIndices.push(currentIndex);
            currentIndex++;
          });
          rowValues.push(stats.totalScore);
          currentIndex++;
        });

        const allStats = components.map(c => calculateComponentStats(c, effectiveStudent, transmutationFormula));
        const totalWeightedScore = round4(allStats.reduce((acc, stat) => acc + stat.weightedScore, 0));
        const finalGrade = Math.min(100, totalWeightedScore);

        rowValues.push(Number(finalGrade.toFixed(4)), Math.round(finalGrade));
        currentIndex += 2;
        
        if (withIncentives && showExtraPoints) {
          const val = extraPoints > 0 ? extraPoints : '';
          rowValues.push(val);
          if (val !== '' && Number(val) > 0) boldIndices.push(currentIndex);
          currentIndex++;
        }

        const row = sheet.addRow(rowValues);
        boldIndices.forEach(idx => {
          row.getCell(idx).font = { bold: true };
        });
      });

      sheet.columns.forEach(column => {
        column.width = 15;
      });
      sheet.getColumn(1).width = 30;
    };

    generateSheet('Without Incentives', false);
    generateSheet('With Incentives', true);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const filename = getExportFilename('xlsx');
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const totalWeight = components.reduce((acc, c) => acc + c.weight, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <Modal
        isOpen={!!alertConfig}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        type={alertConfig?.type || 'info'}
        onConfirm={() => setAlertConfig(null)}
      />
      <Modal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        type="info"
        onConfirm={() => confirmConfig?.onConfirm()}
        onCancel={() => confirmConfig?.onCancel?.()}
        confirmText="Yes"
        cancelText="No"
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 z-10">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={rosterName}
                  onChange={(e) => setRosterName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                  }}
                  className="text-lg font-bold text-gray-900 border-b-2 border-indigo-500 outline-none bg-transparent w-48"
                />
              ) : (
                <div 
                  className="group flex items-center gap-2 cursor-pointer"
                  onClick={() => setIsEditingName(true)}
                  title="Click to edit class name"
                >
                  <h1 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {rosterName}
                  </h1>
                  <Edit2 className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <input
                type="text"
                value={rosterDescription}
                onChange={(e) => setRosterDescription(e.target.value)}
                placeholder="Add a description..."
                className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none focus:ring-0 p-0 w-64 placeholder-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-xs hidden md:flex items-center gap-1.5 mr-2 ${totalWeight !== 100 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
               {totalWeight !== 100 && <AlertTriangle className="w-3.5 h-3.5" />}
               Total Weight: {totalWeight}%
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowStats(!showStats)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                  showStats 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${showStats ? 'bg-indigo-600' : 'bg-gray-400'}`} />
                Stats
              </button>
            </div>
            
            <button
              onClick={() => setShowIncentives(!showIncentives)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                showIncentives 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${showIncentives ? 'bg-indigo-600' : 'bg-gray-400'}`} />
              Incentives
            </button>

            <button
              onClick={() => {
                const nextState = !isViewMode;
                setIsViewMode(nextState);
                if (nextState) {
                  showAlert("View mode is now ON. You cannot edit scores.", "View Mode ON", "warning");
                } else {
                  showAlert("View mode is now OFF. You can now edit scores.", "View Mode OFF", "info");
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                isViewMode 
                  ? 'bg-amber-50 border-amber-200 text-amber-700' 
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title={isViewMode ? "Switch to Edit Mode" : "Switch to View Mode"}
            >
              {isViewMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              {isViewMode ? 'View Mode' : 'Edit Mode'}
            </button>
            <button
              onClick={() => setShowSpinButtons(!showSpinButtons)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                showSpinButtons 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Toggle up/down arrows in score boxes"
            >
              <div className={`w-2 h-2 rounded-full ${showSpinButtons ? 'bg-indigo-600' : 'bg-gray-400'}`} />
              Spinners
            </button>

            <input 
              type="file"  
               ref={fileInputRef}
               onChange={handleFileUpload}
               accept=".csv, .xlsx, .xls, .numbers"
               className="hidden"
             />
             <button
                onClick={triggerFileUpload}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 ${isViewMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isProcessing || isViewMode}
             >
                {isProcessing ? (
                  <div className="w-3.5 h-3.5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{isProcessing ? 'Reading...' : 'Import'}</span>
             </button>
             <button
                onClick={() => setShowExportFormatModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
             >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
             </button>
             <button
                onClick={() => setIsEditDescriptionsModalOpen(true)}
                disabled={isViewMode}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors ${isViewMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Edit all component descriptions for this subject"
             >
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit Descriptions</span>
             </button>
             <button 
               onClick={handleSyncComponents}
               disabled={isViewMode}
               className="p-1.5 rounded-md border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
               title="Sync Grading Components to Subject"
             >
               <RefreshCw className="w-4 h-4" />
               <span className="hidden sm:inline text-xs font-medium">Sync Components</span>
             </button>
             <button 
               onClick={() => navigate(`/roster/${rosterId}/settings`)}
               disabled={isViewMode}
               className={`p-1.5 rounded-md border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors ${isViewMode ? 'opacity-50 cursor-not-allowed' : ''}`}
               title="Settings"
             >
               <Settings className="w-4 h-4" />
             </button>
          </div>
        </div>
        
        {/* Import Error Toast */}
        {importError && (
          <div className="bg-red-50 border-b border-red-200 p-4 animate-in slide-in-from-top-2">
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-red-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>{importError}</span>
              </div>
              <button onClick={() => setImportError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Sync Message Toast */}
        {syncMessage && (
          <div className={`border-b p-4 animate-in slide-in-from-top-2 ${syncMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncMessage.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span>{syncMessage.text}</span>
              </div>
              <button onClick={() => setSyncMessage(null)} className={syncMessage.type === 'success' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Settings Panel Removed */}
      </header>

      {/* Main Content */}
      <main className="p-2 sm:p-4 w-full">
        <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleDragEnd}
          >
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-600 shadow-sm">
                  <th className="sticky top-0 left-0 z-40 bg-gray-100 dark:bg-gray-800 p-1.5 border-r border-gray-200 dark:border-gray-700 w-8 text-center">
                  </th>
                  <th className="sticky top-0 left-8 z-40 bg-gray-100 dark:bg-gray-800 p-1.5 font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 w-8 text-center text-xs">
                    #
                  </th>
                  {!showIncentives && (
                    <th 
                      className="sticky top-0 left-16 z-40 bg-gray-100 dark:bg-gray-800 p-1.5 font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 w-10 text-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group/mail relative"
                      onClick={() => setIsBulkEmailModalOpen(true)}
                      title="Bulk Email Options"
                    >
                      <Mail className="w-3.5 h-3.5 mx-auto" />
                    </th>
                  )}
                  <th className={`sticky top-0 ${showIncentives ? 'left-16' : 'left-[6.5rem]'} z-40 bg-gray-100 dark:bg-gray-800 p-3 font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] text-sm`}>
                    <div className="flex items-center justify-between gap-2">
                      <span>Student Name</span>
                      <button 
                        onClick={() => setShowStudentDetailsEditor(true)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit Student Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                  {visibleComponents.map((comp, index) => {
                    const isWW = comp.name.toLowerCase().includes('written work');
                    const isPT = comp.name.toLowerCase().includes('performance task');
                    
                    return (
                    <React.Fragment key={comp.id}>
                      {showIncentives && isWW && (
                        <th className="sticky top-0 z-30 bg-blue-50 dark:bg-blue-900/30 px-0.5 pt-2 pb-1 font-semibold text-blue-900 dark:text-blue-100 border-r-2 border-r-black dark:border-r-black w-16 text-center text-[10px] align-top group/header relative">
                          <div className="flex flex-col items-center leading-none tracking-tighter">WW<br/>Incentives</div>

                          <button 
                            onClick={() => handlePasteScores('ww-incentive', 'WW Incentives', 'ww-incentive')}
                            className="absolute bottom-0.5 left-0 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-all"
                            title="Paste scores"
                          >
                            <ClipboardPaste className="w-2 h-2" />
                          </button>

                          <button 
                            onClick={() => handleCopyScores('ww-incentive', 'ww-incentive')}
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-all"
                            title="Copy scores"
                          >
                            <Copy className="w-2 h-2" />
                          </button>
                          
                          <button 
                            onClick={() => initiateClearColumn('ww-incentive', 'WW Incentives', 'ww-incentive')}
                            className="absolute bottom-0.5 right-0 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 hover:text-red-600 dark:hover:text-red-400 transition-all"
                            title="Clear scores"
                          >
                            <Trash2 className="w-2 h-2" />
                          </button>
                        </th>
                      )}
                      {showIncentives && isPT && incentiveMode === 'both' && (
                        <th className="sticky top-0 z-30 bg-amber-50 dark:bg-amber-900/30 px-0.5 pt-2 pb-1 font-semibold text-amber-900 dark:text-amber-100 border-r-2 border-r-black dark:border-r-black w-16 text-center text-[10px] align-top group/header relative">
                          <div className="flex flex-col items-center leading-none tracking-tighter">PT<br/>Incentives</div>
                          
                          <button 
                            onClick={() => handlePasteScores('pt-incentive', 'PT Incentives', 'pt-incentive')}
                            className="absolute bottom-0.5 left-0 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-amber-100 dark:hover:bg-amber-800 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-all"
                            title="Paste scores"
                          >
                            <ClipboardPaste className="w-2 h-2" />
                          </button>

                          <button 
                            onClick={() => handleCopyScores('pt-incentive', 'pt-incentive')}
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-amber-100 dark:hover:bg-amber-800 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-all"
                            title="Copy scores"
                          >
                            <Copy className="w-2 h-2" />
                          </button>
                          
                          <button 
                            onClick={() => initiateClearColumn('pt-incentive', 'PT Incentives', 'pt-incentive')}
                            className="absolute bottom-0.5 right-0 opacity-0 group-hover/header:opacity-100 p-0 rounded hover:bg-amber-100 dark:hover:bg-amber-800 text-amber-700 dark:text-amber-300 hover:text-red-600 dark:hover:text-red-400 transition-all"
                            title="Clear scores"
                          >
                            <Trash2 className="w-2 h-2" />
                          </button>
                        </th>
                      )}
                      {comp.subComponents.map(sub => (
                        <th key={sub.id} className="sticky top-0 z-30 bg-gray-100 dark:bg-gray-800 p-1.5 pb-3 font-medium text-gray-700 dark:text-gray-300 text-center border-r border-gray-200 dark:border-gray-700 w-16 min-w-[64px] group/header relative">
                          <div 
                            className="text-[10px] uppercase tracking-wider mb-0.5 truncate px-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline" 
                            title={sub.description || sub.name}
                            onClick={() => {
                              const scores = students.map(s => s.scores[sub.id]).filter(s => s !== undefined) as number[];
                              const oldMin = scores.length > 0 ? Math.min(...scores) : 0;
                              const oldMax = scores.length > 0 ? Math.max(...scores) : 0;
                              const oldAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                              const defaultBonus = sub.totalScore - oldMax;
                              setEditingSubComponent({ componentId: comp.id, subId: sub.id, name: sub.name, description: sub.description || '', totalScore: sub.totalScore });
                              setCurveConfig({ 
                                active: false, 
                                type: 'interpolation',
                                newMin: oldMin.toString(), 
                                newMax: oldMax.toString(), 
                                oldMin, 
                                oldMax,
                                oldAvg,
                                flatBonus: defaultBonus > 0 ? defaultBonus.toString() : '0',
                                targetAverage: Math.round(oldAvg).toString(),
                                applyToAllSections: false
                              });
                            }}
                          >
                            {sub.name}
                          </div>
                          <div className="flex items-center justify-center gap-1 text-[9px] text-gray-500 dark:text-gray-400 font-mono">
                            <span>{sub.totalScore}</span>
                            <button 
                              onClick={() => {
                                if (isolatedView?.type === 'subcomponent' && isolatedView.id === sub.id) {
                                  setIsolatedView(null);
                                } else {
                                  setIsolatedView({ type: 'subcomponent', id: sub.id });
                                }
                              }}
                              disabled={isolatedView?.type === 'component'}
                              className={`p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${isolatedView?.type === 'component' ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                              {isolatedView?.type === 'subcomponent' && isolatedView.id === sub.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                          
                          <button 
                            onClick={() => handlePasteScores(sub.id, sub.name)}
                            className="absolute bottom-0.5 left-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                            title="Paste scores"
                          >
                            <ClipboardPaste className="w-2.5 h-2.5" />
                          </button>

                          <button 
                            onClick={() => handleCopyScores(sub.id)}
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                            title="Copy scores"
                          >
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                          
                          <button 
                            onClick={() => initiateClearColumn(sub.id, sub.name)}
                            className="absolute bottom-0.5 right-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
                            title="Clear scores"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </th>
                      ))}
                      <th className="sticky top-0 z-30 p-1.5 font-semibold text-gray-900 dark:text-gray-100 text-center bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 w-20 min-w-[70px] group/total">
                        <div className="flex items-center justify-between px-1 mb-1">
                          <button 
                            onClick={() => moveComponent(index, 'left')} 
                            disabled={index === 0}
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-0 transition-colors"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                          <div className="text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-bold">{comp.name}</div>
                          <button 
                            onClick={() => moveComponent(index, 'right')}
                            disabled={index === components.length - 1}
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-0 transition-colors"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-1 text-[9px] text-gray-500 dark:text-gray-400 font-mono">
                          <span>Total</span>
                          <button 
                            onClick={() => {
                              if (isolatedView?.type === 'component' && isolatedView.id === comp.id) {
                                setIsolatedView(null);
                              } else {
                                setIsolatedView({ type: 'component', id: comp.id });
                              }
                            }}
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            {isolatedView?.type === 'component' && isolatedView.id === comp.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </th>
                      <th className="sticky top-0 z-30 p-1.5 font-semibold text-gray-900 dark:text-gray-100 text-center bg-indigo-100/50 dark:bg-indigo-900/20 border-r border-gray-200 dark:border-gray-700 w-20 min-w-[70px]">
                        <div className="text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-bold">WS</div>
                        <div className="text-[9px] text-gray-500 dark:text-gray-400 font-mono">{comp.weight}%</div>
                      </th>
                    </React.Fragment>
                  )})}
                  <th className="sticky top-0 z-30 p-3 font-bold text-gray-900 dark:text-gray-100 text-center bg-gray-200 dark:bg-gray-700 border-l border-gray-300 dark:border-gray-600 w-20 min-w-[80px] text-sm group/header relative">
                    Initial
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteNotSupported(); }}
                      className="absolute bottom-0.5 left-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-all"
                      title="Paste not supported"
                    >
                      <ClipboardPaste className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCopyColumn('initial'); }}
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-all"
                      title="Copy values"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleClearNotSupported(); }}
                      className="absolute bottom-0.5 right-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-all"
                      title="Clear not supported"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </th>
                  <th className="sticky top-0 z-30 p-3 font-bold text-gray-900 dark:text-gray-100 text-center bg-gray-300 dark:bg-gray-600 border-l border-gray-300 dark:border-gray-600 w-20 min-w-[80px] text-sm group/header relative">
                    Total
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteNotSupported(); }}
                      className="absolute bottom-0.5 left-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 transition-all"
                      title="Paste not supported"
                    >
                      <ClipboardPaste className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCopyColumn('total'); }}
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 transition-all"
                      title="Copy values"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleClearNotSupported(); }}
                      className="absolute bottom-0.5 right-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 hover:text-red-600 dark:hover:text-red-400 transition-all"
                      title="Clear not supported"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </th>
                  <th className="sticky top-0 z-30 p-3 font-bold text-white text-center bg-gray-800 dark:bg-gray-900 w-20 min-w-[80px] text-sm group/header relative">
                    Grade
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteNotSupported(); }}
                      className="absolute bottom-0.5 left-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-700 dark:hover:bg-gray-800 text-gray-300 transition-all"
                      title="Paste not supported"
                    >
                      <ClipboardPaste className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCopyColumn('grade'); }}
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-700 dark:hover:bg-gray-800 text-gray-300 transition-all"
                      title="Copy values"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleClearNotSupported(); }}
                      className="absolute bottom-0.5 right-0.5 opacity-0 group-hover/header:opacity-100 p-0.5 rounded hover:bg-gray-700 dark:hover:bg-gray-800 text-gray-300 hover:text-red-400 transition-all"
                      title="Clear not supported"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </th>
                  {showIncentives && showExtraPoints && (
                    <th className="sticky top-0 z-30 p-3 font-bold text-amber-900 dark:text-amber-100 text-center bg-amber-100 dark:bg-amber-900/50 w-20 min-w-[80px] text-sm">
                      Extra
                    </th>
                  )}
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <SortableContext 
                items={displayedStudents.map(s => s.id)} 
                strategy={verticalListSortingStrategy}
              >
                <tbody className="divide-y divide-gray-100">
                  {displayedStudents.map((student) => {
                    const index = students.findIndex(s => s.id === student.id);
                    // Calculate adjusted scores if incentives are shown
                    let effectiveStudent = student;
                    let extraPoints = 0;
                    let scoreSources: Record<string, 'ww' | 'pt' | 'mixed'> = {};

                    if (showIncentives) {
                      const adjustment = calculateAdjustedScores(student, components, incentiveMode);
                      effectiveStudent = { ...student, scores: adjustment.scores };
                      extraPoints = adjustment.extraPoints;
                      scoreSources = adjustment.sources;
                    }

                    return (
                      <SortableStudentRow
                        key={student.id}
                        student={effectiveStudent}
                        originalStudent={showIncentives ? student : undefined}
                        index={index}
                        components={components}
                        visibleComponents={visibleComponents}
                        transmutationFormula={transmutationFormula}
                        handleScoreChange={handleScoreChange}
                        handleScoreClick={handleScoreClick}
                        handleScoreBlur={(studentId, subId) => {
                          if (suppressedCell?.studentId === studentId && suppressedCell?.subComponentId === subId) {
                            setSuppressedCell(null);
                          }
                        }}
                        handleIncentiveChange={handleIncentiveChange}
                        initiateEmail={initiateEmail}
                        setSelectedStudent={setSelectedStudent}
                        initiateRemoveStudent={initiateRemoveStudent}
                        initiateTransferStudent={initiateTransferStudent}
                        showIncentives={showIncentives}
                        isViewMode={isViewMode}
                        incentiveMode={incentiveMode}
                        showSpinButtons={showSpinButtons}
                        extraPoints={extraPoints}
                        scoreSources={scoreSources}
                        isIsolated={isolatedStudentId === student.id}
                        toggleIsolate={() => setIsolatedStudentId(isolatedStudentId === student.id ? null : student.id)}
                        showAlert={showAlert}
                        showExtraPoints={showExtraPoints}
                      />
                    );
                  })}
                </tbody>
              </SortableContext>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 p-2 border-t border-gray-200 dark:border-gray-700 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)]" colSpan={leftColsCount}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={isViewMode ? "View mode is active" : "Add student name..."}
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addStudent()}
                        disabled={isViewMode}
                        className={`flex-1 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${isViewMode ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
                      />
                      <button 
                        onClick={addStudent}
                        disabled={isViewMode}
                        className={`bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors ${isViewMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        Add
                      </button>
                    </div>
                  </td>
                  <td colSpan={totalColumnsCount - leftColsCount} className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700"></td>
                </tr>
                
                {showStats && (
                  <>
                    <tr>
                      <td colSpan={totalColumnsCount} className="h-4 bg-gray-50 dark:bg-gray-900 border-t border-b border-gray-200 dark:border-gray-700"></td>
                    </tr>
                    
                    {STATS_ROWS.map((statRow) => (
                      <tr key={statRow.key} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        {/* Drag handle column */}
                        <td className="sticky left-0 z-40 bg-white dark:bg-gray-800 p-1.5 border-r border-gray-200 dark:border-gray-700 w-8"></td>
                        
                        {/* Index column */}
                        <td className="sticky left-8 z-40 bg-white dark:bg-gray-800 p-1.5 border-r border-gray-200 dark:border-gray-700 w-8"></td>
                        
                        {/* Mail button column (if !showIncentives) */}
                        {!showIncentives && (
                          <td className="sticky left-16 z-40 bg-white dark:bg-gray-800 p-1.5 border-r border-gray-200 dark:border-gray-700 w-10"></td>
                        )}
                        
                        {/* Student Name column - contains the label */}
                        <td className={`sticky ${showIncentives ? 'left-16' : 'left-[6.5rem]'} z-40 bg-white dark:bg-gray-800 p-2 border-r border-gray-200 dark:border-gray-700 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] text-right text-xs font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap pr-6`}>
                          {statRow.label}
                        </td>
                        
                        {visibleComponents.map(comp => {
                          const isWW = comp.name.toLowerCase().includes('written work');
                          const isPT = comp.name.toLowerCase().includes('performance task');
                          
                          return (
                            <React.Fragment key={comp.id}>
                              {showIncentives && isWW && <td className="border-r border-gray-200 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10"></td>}
                              {showIncentives && isPT && incentiveMode === 'both' && <td className="border-r border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10"></td>}
                              
                              {comp.subComponents.map(sub => {
                                const stats = calculateSubComponentStats(sub.id, sub.totalScore, students);
                                return (
                                  <td key={sub.id} className="p-1.5 text-center border-r border-gray-200 dark:border-gray-700 text-xs text-indigo-700 dark:text-indigo-300 font-mono bg-indigo-50/50 dark:bg-indigo-900/20 font-bold">
                                    {stats[statRow.key as keyof typeof stats]}
                                  </td>
                                );
                              })}
                              
                              {/* Total and Weighted Score columns for the component */}
                              <td className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"></td>
                              <td className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"></td>
                            </React.Fragment>
                          );
                        })}
                        
                        {/* initialGrade, finalGrade, Math.round(finalGrade) */}
                        <td className="border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"></td>
                        <td className="border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"></td>
                        <td className="p-1.5 text-center border-l border-gray-200 dark:border-gray-700 text-xs text-indigo-700 dark:text-indigo-300 font-mono bg-indigo-50/50 dark:bg-indigo-900/20 font-bold">
                          {finalGradeStats?.[statRow.key as keyof typeof finalGradeStats]}
                        </td>
                        
                        {/* Extra Points */}
                        {showIncentives && showExtraPoints && <td className="border-l border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10"></td>}
                        
                        {/* Trash column */}
                        <td className="bg-gray-50 dark:bg-gray-800/50"></td>
                      </tr>
                    ))}

                    <tr>
                      <td colSpan={totalColumnsCount} className="h-4 bg-gray-50 dark:bg-gray-900 border-t border-b border-gray-200 dark:border-gray-700"></td>
                    </tr>

                    <tr className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <td 
                        className="sticky left-0 z-10 bg-white dark:bg-gray-800 p-2 border-r border-gray-200 dark:border-gray-700 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] text-right text-xs font-bold text-indigo-600 dark:text-indigo-400" 
                        colSpan={leftColsCount}
                      >
                        Total Enrolled Students
                      </td>
                      <td className="p-2 text-left font-bold text-indigo-600 dark:text-indigo-400 text-sm" colSpan={totalColumnsCount - leftColsCount}>
                        {students.length}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </DndContext>
        </div>

        {/* Grade Legend */}
        <div className="mt-4 flex flex-wrap gap-4 px-4 pb-8 border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-100 dark:bg-purple-900/40 ring-1 ring-purple-500/50"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">100 (Perfect)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-300 dark:bg-amber-500/50 ring-1 ring-amber-500/50"></div>
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">90-99 (Gold)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-400/30"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">88-89 (Silver)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-100 dark:bg-orange-900/40 ring-1 ring-orange-400/30"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">85-87 (Bronze)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">80-84 (Green)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-50 dark:bg-yellow-900/10"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">75-79 (Yellow)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/30"></div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">&lt; 75 (Failing)</span>
          </div>
        </div>
      </main>

      {/* Excess Score Modal */}
      {excessScoreData && (() => {
        const student = students.find(s => s.id === excessScoreData.studentId);
        let sourceSubComp: SubComponent | undefined;
        for (const comp of components) {
          const found = comp.subComponents.find(sub => sub.id === excessScoreData.subComponentId);
          if (found) {
            sourceSubComp = found;
            break;
          }
        }

        if (!student || !sourceSubComp) return null;

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    {excessScoreData.step === 'warning' ? 'Excess Score Detected' : 'Distribute Excess Points'}
                  </h2>
                </div>
                <button 
                  onClick={() => {
                    setSuppressedCell({ studentId: excessScoreData.studentId, subComponentId: excessScoreData.subComponentId });
                    setExcessScoreData(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {excessScoreData.step === 'warning' ? (
                <>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    You entered <span className="font-bold text-gray-900 dark:text-white">{excessScoreData.originalValue}</span> for <span className="font-bold text-gray-900 dark:text-white">{sourceSubComp.name}</span>, which exceeds the maximum score of <span className="font-bold text-gray-900 dark:text-white">{sourceSubComp.totalScore}</span> by <span className="font-bold text-amber-600 dark:text-amber-400">{excessScoreData.excess}</span> points.
                    <br /><br />
                    Was this a mistake?
                  </p>
                  <div className="flex justify-end gap-3 mt-auto">
                    <button
                      onClick={() => {
                        const studentId = excessScoreData.studentId;
                        const subId = excessScoreData.subComponentId;
                        setSuppressedCell({ studentId, subComponentId: subId });
                        setExcessScoreData(null);
                        setTimeout(() => {
                          const input = document.querySelector(`input[data-student="${studentId}"][data-sub="${subId}"]`) as HTMLInputElement;
                          if (input) {
                            input.focus();
                            input.select();
                          }
                        }, 0);
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-sm font-medium transition-colors"
                    >
                      Yes, let me fix it
                    </button>
                    <button
                      onClick={() => {
                        // Cap the source component
                        setStudents(prev => prev.map(s => {
                          if (s.id === excessScoreData.studentId) {
                            return {
                              ...s,
                              scores: {
                                ...s.scores,
                                [excessScoreData.subComponentId]: sourceSubComp!.totalScore
                              }
                            };
                          }
                          return s;
                        }));
                        setExcessScoreData(prev => prev ? { ...prev, step: 'distribute' } : null);
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      No, distribute excess points
                    </button>
                  </div>
                </>
              ) : (() => {
                const eligibleComponents: { comp: ComponentConfig, sub: SubComponent, currentScore: number, availableSpace: number }[] = [];
                components.forEach(comp => {
                  comp.subComponents.forEach(sub => {
                    if (sub.id !== excessScoreData.subComponentId) {
                      const currentScore = student.scores[sub.id] || 0;
                      if (currentScore < sub.totalScore) {
                        eligibleComponents.push({
                          comp,
                          sub,
                          currentScore,
                          availableSpace: sub.totalScore - currentScore
                        });
                      }
                    }
                  });
                });

                return (
                  <>
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      You have <span className="font-bold text-amber-600 dark:text-amber-400">{excessScoreData.excess}</span> excess points to distribute for <span className="font-bold text-gray-900 dark:text-white">{student.name}</span>.
                      Select a component to add points to:
                    </p>

                    <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-900/50 mb-6">
                      {eligibleComponents.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                          No eligible components available to receive excess points.
                        </div>
                      ) : (
                        eligibleComponents.map(({ comp, sub, currentScore, availableSpace }) => (
                          <div key={sub.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div>
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{comp.name}</div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white">{sub.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Score: {currentScore} / {sub.totalScore} <span className="text-indigo-600 dark:text-indigo-400 ml-1">(Can add up to {availableSpace})</span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const pointsToAdd = Math.min(excessScoreData.excess, availableSpace);
                                const newExcess = excessScoreData.excess - pointsToAdd;
                                
                                setStudents(prev => prev.map(s => {
                                  if (s.id === excessScoreData.studentId) {
                                    return {
                                      ...s,
                                      scores: {
                                        ...s.scores,
                                        [sub.id]: currentScore + pointsToAdd
                                      }
                                    };
                                  }
                                  return s;
                                }));

                                if (newExcess > 0) {
                                  setExcessScoreData(prev => prev ? { ...prev, excess: newExcess } : null);
                                } else {
                                  setExcessScoreData(null);
                                }
                              }}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 rounded-md text-xs font-medium transition-colors"
                            >
                              Add Points
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex justify-end mt-auto">
                      <button
                        onClick={() => setExcessScoreData(null)}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-sm font-medium transition-colors"
                      >
                        Close & Discard Remaining
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Email Configuration Modal */}
      {emailingStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Send Progress Update
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Select the components to include in the email for <span className="font-medium text-gray-900 dark:text-white">{emailingStudent.name}</span>.
                </p>
              </div>
              <button 
                onClick={() => setEmailingStudent(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Send to:
              </span>
              <div className="flex bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 p-0.5">
                <button
                  onClick={() => {
                    setEmailToParent(false);
                    if (saveTemplatePreference) localStorage.setItem('preferredEmailTarget', 'student');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
                    !emailToParent ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Student
                </button>
                <button
                  onClick={() => {
                    setEmailToParent(true);
                    if (saveTemplatePreference) localStorage.setItem('preferredEmailTarget', 'parent');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
                    emailToParent ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Parent
                </button>
              </div>
            </div>
            
            <div className="mb-4 flex items-center gap-2">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Template</label>
                </div>
                
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={isEditingEmail}
                  className={`w-full p-2 border rounded-md text-sm focus:ring-2 outline-none transition-colors border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${isEditingEmail ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="">Select a template...</option>
                  {emailTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveTemplatePreference}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setSaveTemplatePreference(isChecked);
                        localStorage.setItem('saveTemplatePreference', String(isChecked));
                        if (isChecked) {
                          if (selectedTemplateId) localStorage.setItem('preferredEmailTemplateId', selectedTemplateId);
                          localStorage.setItem('preferredEmailTarget', emailToParent ? 'parent' : 'student');
                        } else {
                          localStorage.removeItem('preferredEmailTemplateId');
                          localStorage.removeItem('preferredEmailTarget');
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Save as default template</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isEditingEmail}
                      onChange={(e) => setIsEditingEmail(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Edit Message (for this email only)</span>
                  </label>
                </div>

                {isEditingEmail && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                      <input
                        type="text"
                        value={editableSubject}
                        onChange={(e) => setEditableSubject(e.target.value)}
                        className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body</label>
                      <textarea
                        value={editableBody}
                        onChange={(e) => setEditableBody(e.target.value)}
                        rows={6}
                        className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isEditingEmail && (
              <div className="flex-1 overflow-y-auto min-h-0 mb-6 border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Included Scores
                  </h3>
                  <button
                    onClick={() => {
                      const allIds = components.flatMap(c => c.subComponents.map(s => s.id));
                      if (selectedWorks.length === allIds.length) {
                        setSelectedWorks([]);
                      } else {
                        setSelectedWorks(allIds);
                      }
                    }}
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    {selectedWorks.length === components.flatMap(c => c.subComponents).length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-6">
                  {components.map(comp => (
                    <div key={comp.id}>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        {comp.name}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {comp.subComponents.map(sub => {
                          const score = emailingStudent.scores[sub.id] || 0;
                          const failing = isFailing(score, sub.totalScore);
                          return (
                            <label 
                              key={sub.id} 
                              className={`flex items-center p-2 rounded border cursor-pointer transition-colors ${
                                selectedWorks.includes(sub.id) 
                                  ? 'bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-800 shadow-sm' 
                                  : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedWorks.includes(sub.id)}
                                onChange={() => toggleWorkSelection(sub.id)}
                                className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 mr-3 bg-white dark:bg-gray-700"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mr-2" title={sub.name}>{sub.name}</span>
                                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                    failing 
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold' 
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                  }`}>
                                    {score}/{sub.totalScore}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setEmailingStudent(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={sendEmail}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Open Draft in Gmail
              </button>
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
              This will open a draft in Gmail. You can then review, schedule, or send it.
            </p>
          </div>
        </div>
      )}

      {/* Bulk Email Modal */}
      {isBulkEmailModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Bulk Email
              </h2>
              <button 
                onClick={() => {
                  setIsBulkEmailModalOpen(false);
                  setBulkEmailStep('menu');
                  setBulkEmailSelection([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkEmailStep === 'menu' ? (
              <div className="space-y-3">
                <button
                  onClick={() => handleBulkEmail('students')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Email All Students</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send to all {students.length} students</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </button>

                <button
                  onClick={() => handleBulkEmail('parents')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Email All Parents</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send to all parent addresses</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </button>

                <button
                  onClick={() => handleBulkEmail('select')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Email Select Students</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose specific students (includes parents)</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </button>

                <button
                  onClick={() => handleBulkEmail('select-parents')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Email Select Parents</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose parents (CCs students)</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </button>

                <button
                  onClick={() => handleBulkEmail('both')}
                  className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Email Students & Parents</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send to everyone</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col h-[400px]">
                <div className="flex items-center justify-between mb-2">
                  <button 
                    onClick={() => setBulkEmailStep('menu')}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    {bulkEmailSelection.length} selected
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1 bg-gray-50 dark:bg-gray-900/50">
                  {displayedStudents.map(student => (
                    <label 
                      key={student.id}
                      className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                        bulkEmailSelection.includes(student.id)
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
                          : 'hover:bg-white dark:hover:bg-gray-800 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={bulkEmailSelection.includes(student.id)}
                        onChange={() => toggleBulkSelection(student.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 mr-3"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">{student.name}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                  <button
                    onClick={() => {
                      const allIds = displayedStudents.map(s => s.id);
                      if (bulkEmailSelection.length === allIds.length) {
                        setBulkEmailSelection([]);
                      } else {
                        setBulkEmailSelection(allIds);
                      }
                    }}
                    className="mr-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {bulkEmailSelection.length === displayedStudents.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={handleBulkEmailSelection}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                  >
                    Compose Email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Student Modal */}
      {transferStudentId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-4">
              <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Transfer Student</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
              Select the destination class for <span className="font-bold">{students.find(s => s.id === transferStudentId)?.name}</span>. The student will be removed from this class and added to the selected class with blank scores.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Destination Class
              </label>
              <select
                value={selectedTransferRosterId}
                onChange={(e) => setSelectedTransferRosterId(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {availableRosters.map(roster => (
                  <option key={roster.id} value={roster.id}>
                    {roster.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTransferStudentId(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmTransferStudent}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                Transfer Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Delete Student?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to remove this student? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveStudent}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {importCandidates && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Confirm Import
              </h2>
              <button 
                onClick={cancelImport}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                Found <span className="font-bold text-gray-900 dark:text-white">{importCandidates.length}</span> students in the file.
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto text-sm text-gray-600 dark:text-gray-300">
                <ul className="list-disc list-inside">
                  {importCandidates.slice(0, 5).map((s, i) => (
                    <li key={i}>{s.name}</li>
                  ))}
                  {importCandidates.length > 5 && (
                    <li className="list-none text-gray-400 italic pl-4">...and {importCandidates.length - 5} more</li>
                  )}
                </ul>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                This will replace your current student list.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={cancelImport}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                Import Students
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Scores Modal */}
      {pastingTo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ClipboardPaste className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Paste Scores
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Pasting to: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{pastingTo.name}</span>
                </p>
              </div>
              <button 
                onClick={() => setPastingTo(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                Paste your scores from Excel or Sheets below. Scores should be one per line.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="w-full h-64 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-sm resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="10&#10;15&#10;12&#10;..."
                autoFocus
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
                Scores will be applied to students in the order they appear in the table.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPastingTo(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmPasteScores}
                disabled={!pasteText.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Scores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Column Confirmation Modal */}
      {clearingColumn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-4">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Clear Scores?</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to clear all scores in <span className="font-bold text-gray-900 dark:text-white">{clearingColumn.name}</span>? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClearingColumn(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearColumn}
                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700"
              >
                Clear Scores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit SubComponent Modal */}
      {editingSubComponent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-5xl w-full p-6 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Edit Component Details
              </h2>
              <button 
                onClick={() => {
                  setEditingSubComponent(null);
                  setCurveConfig(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-6">
              <div className="lg:col-span-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Component Name</label>
                  <input
                    type="text"
                    value={editingSubComponent.name}
                    onChange={(e) => setEditingSubComponent({ ...editingSubComponent, name: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Total Score</label>
                  <input
                    type="number"
                    min="1"
                    value={editingSubComponent.totalScore}
                    onChange={(e) => setEditingSubComponent({ ...editingSubComponent, totalScore: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea
                    value={editingSubComponent.description}
                    onChange={(e) => setEditingSubComponent({ ...editingSubComponent, description: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-24 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                    placeholder="Optional description for reference..."
                  />
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" />
                    Changes will be synced to all classes of this subject.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-4">
                {curveConfig && (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={curveConfig.active}
                          onChange={(e) => setCurveConfig({ ...curveConfig, active: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-4 h-4"
                        />
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Score Curving</span>
                      </label>
                      {curveConfig.active && (
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    
                    {curveConfig.active ? (
                      <div className="flex-1 animate-in fade-in slide-in-from-right-4 duration-300 bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Curving Method</label>
                            <div className="space-y-2">
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${curveConfig.type === 'interpolation' ? 'bg-white dark:bg-gray-800 border-indigo-500 ring-1 ring-indigo-500' : 'bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                                <input 
                                  type="radio" 
                                  name="curveType" 
                                  value="interpolation" 
                                  checked={curveConfig.type === 'interpolation'} 
                                  onChange={() => setCurveConfig({ ...curveConfig, type: 'interpolation' })}
                                  className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">Interpolation</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Scale range to new min/max</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${curveConfig.type === 'classical' ? 'bg-white dark:bg-gray-800 border-indigo-500 ring-1 ring-indigo-500' : 'bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                                <input 
                                  type="radio" 
                                  name="curveType" 
                                  value="classical" 
                                  checked={curveConfig.type === 'classical'} 
                                  onChange={() => setCurveConfig({ ...curveConfig, type: 'classical' })}
                                  className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">Flat Bonus</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Add fixed points to all scores</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${curveConfig.type === 'traditional' ? 'bg-white dark:bg-gray-800 border-indigo-500 ring-1 ring-indigo-500' : 'bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                                <input 
                                  type="radio" 
                                  name="curveType" 
                                  value="traditional" 
                                  checked={curveConfig.type === 'traditional'} 
                                  onChange={() => setCurveConfig({ ...curveConfig, type: 'traditional' })}
                                  className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">Traditional</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Scale highest score to perfect</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${curveConfig.type === 'canvas' ? 'bg-white dark:bg-gray-800 border-indigo-500 ring-1 ring-indigo-500' : 'bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                                <input 
                                  type="radio" 
                                  name="curveType" 
                                  value="canvas" 
                                  checked={curveConfig.type === 'canvas'} 
                                  onChange={() => setCurveConfig({ ...curveConfig, type: 'canvas' })}
                                  className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">Canvas Avg</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Scale scores to target average</span>
                                </div>
                              </label>
                            </div>
                          </div>

                          <div className="space-y-4 border-l border-gray-200 dark:border-gray-700 pl-6 flex flex-col justify-between">
                            <div className="space-y-4">
                              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Configuration</label>
                              
                              {curveConfig.type === 'interpolation' ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Current Range:</span>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{curveConfig.oldMin} — {curveConfig.oldMax}</span>
                                  </div>
                                  {curveConfig.oldMax === curveConfig.oldMin ? (
                                    <div className="text-[10px] p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800">
                                      Cannot interpolate: all scores are identical.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">New Min</label>
                                        <input
                                          type="number"
                                          value={curveConfig.newMin}
                                          onChange={(e) => setCurveConfig({ ...curveConfig, newMin: e.target.value })}
                                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">New Max</label>
                                        <input
                                          type="number"
                                          value={curveConfig.newMax}
                                          onChange={(e) => setCurveConfig({ ...curveConfig, newMax: e.target.value })}
                                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : curveConfig.type === 'classical' ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Highest Score:</span>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{curveConfig.oldMax} / {editingSubComponent.totalScore}</span>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Bonus Points</label>
                                    <input
                                      type="number"
                                      value={curveConfig.flatBonus}
                                      onChange={(e) => setCurveConfig({ ...curveConfig, flatBonus: e.target.value })}
                                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                  </div>
                                </div>
                              ) : curveConfig.type === 'traditional' ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Highest Score:</span>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{curveConfig.oldMax} / {editingSubComponent.totalScore}</span>
                                  </div>
                                  <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                    Scales highest score to <span className="font-bold">{editingSubComponent.totalScore}</span>.
                                    <br />
                                    <span className="font-mono text-indigo-600 dark:text-indigo-400 mt-1 block">(Score / {curveConfig.oldMax}) * {editingSubComponent.totalScore}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                    <span>Current Average:</span>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{curveConfig.oldAvg.toFixed(2)}</span>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Target Average</label>
                                    <input
                                      type="number"
                                      value={curveConfig.targetAverage}
                                      onChange={(e) => setCurveConfig({ ...curveConfig, targetAverage: e.target.value })}
                                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={curveConfig.applyToAllSections}
                                  onChange={(e) => setCurveConfig({ ...curveConfig, applyToAllSections: e.target.checked })}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-4 h-4"
                                />
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Apply to all sections</span>
                              </label>
                              <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 ml-6">
                                Syncs curve to all classes for "{getSubjectFromRosterName(rosterName)}".
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center bg-gray-50/50 dark:bg-gray-900/20">
                        <Calculator className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Enable score curving to adjust grades
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Choose from various mathematical methods to normalize scores.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Increase Student Scores</h3>
                  <div className="flex gap-4 mb-4">
                    <input 
                      type="number"
                      value={scoreIncrease.amount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setScoreIncrease(prev => ({ ...prev, amount: val }));
                      }}
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Points to add"
                    />
                    <button 
                      onClick={() => {
                        applyScoreIncrease();
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                    {students.map(student => (
                      <label key={student.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <input 
                          type="checkbox"
                          checked={scoreIncrease.studentIds.includes(student.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScoreIncrease(prev => ({ ...prev, studentIds: [...prev.studentIds, student.id] }));
                            } else {
                              setScoreIncrease(prev => ({ ...prev, studentIds: prev.studentIds.filter(id => id !== student.id) }));
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-4 h-4"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{student.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                {curveConfig?.active && (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[10px] font-medium">Warning: Curve cannot be undone after saving.</span>
                  </>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingSubComponent(null);
                    setCurveConfig(null);
                  }}
                  className="px-5 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSubComponentDetails}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Student Details Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Student Details
              </h2>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={selectedStudent.name}
                  onChange={(e) => updateStudentDetails(selectedStudent.id, { name: e.target.value })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <User className="w-4 h-4" /> Student ID
                </label>
                <input
                  type="text"
                  value={selectedStudent.studentId || ''}
                  onChange={(e) => updateStudentDetails(selectedStudent.id, { studentId: e.target.value })}
                  placeholder="1234567"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Student Email
                </label>
                <input
                  type="email"
                  value={selectedStudent.studentEmail || ''}
                  onChange={(e) => {
                    const email = e.target.value;
                    const updates: Partial<Student> = { studentEmail: email };
                    const match = email.match(/s(\d{7})@/);
                    if (match) {
                      updates.studentId = match[1];
                    }
                    updateStudentDetails(selectedStudent.id, updates);
                  }}
                  placeholder="student@school.edu"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Parent Email
                </label>
                <input
                  type="email"
                  value={selectedStudent.parentEmail || ''}
                  onChange={(e) => updateStudentDetails(selectedStudent.id, { parentEmail: e.target.value })}
                  placeholder="parent@gmail.com"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Parent Email 2
                </label>
                <input
                  type="email"
                  value={selectedStudent.parentEmail2 || ''}
                  onChange={(e) => updateStudentDetails(selectedStudent.id, { parentEmail2: e.target.value })}
                  placeholder="parent2@gmail.com"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  onClick={() => initiateRemoveStudent(selectedStudent.id)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md text-sm font-medium border border-transparent hover:border-red-200 dark:hover:border-red-800"
                >
                  Remove Student
                </button>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  Done
                </button>
              </div>
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
                  Editing descriptions for subject: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{rosterName.match(/\((.*?)\)$/)?.[1] || 'Unknown'}</span>
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
              {components.map((comp) => (
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
                            setComponents(prev => prev.map(c => {
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
                  onClick={exportDescriptionsPDF}
                  className="px-4 py-2 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-md text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Export PDF
                </button>
                <button
                  onClick={() => setIsEditDescriptionsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const match = rosterName.match(/^(.*?)\s*\((.*?)\)$/);
                    if (match) {
                      const subjectName = match[2].trim();
                      syncComponentsToSubject(subjectName, components);
                      setSyncMessage({ type: 'success', text: `Descriptions synced to all classes for subject "${subjectName}".` });
                      setTimeout(() => setSyncMessage(null), 5000);
                    }
                    setIsEditDescriptionsModalOpen(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  Save & Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Confirmation Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sync Components</h3>
              <button onClick={() => setIsSyncModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                This will sync the current grading components (including descriptions, percentages, and max scores) to all current and future classes for the subject <strong>"{syncSubjectName}"</strong>.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                Existing student scores will be preserved where possible. Are you sure you want to continue?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSyncComponents}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                >
                  Sync Components
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Format Modal */}
      {showExportFormatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Export Scoresheet</h3>
              <button onClick={() => setShowExportFormatModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => {
                  setShowExportFormatModal(false);
                  setShowPdfModal(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors text-left"
              >
                <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-md text-red-600 dark:text-red-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">PDF Document</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Formatted for printing</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowExportFormatModal(false);
                  exportXLSX();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors text-left"
              >
                <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-md text-green-600 dark:text-green-400">
                  <Table className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Excel Spreadsheet</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Raw data for analysis</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowExportFormatModal(false);
                  exportDescriptionsPDF();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors text-left"
              >
                <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-md text-indigo-600 dark:text-indigo-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Subject Descriptions</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Export component descriptions</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Export PDF Settings</h3>
              <button onClick={() => setShowPdfModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name of Unit
                </label>
                <input
                  type="text"
                  value={pdfUnit}
                  onChange={(e) => setPdfUnit(e.target.value)}
                  placeholder="e.g. High School"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    AY Year 1
                  </label>
                  <input
                    type="text"
                    value={pdfYear1}
                    onChange={(e) => setPdfYear1(e.target.value)}
                    placeholder="2026"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    AY Year 2
                  </label>
                  <input
                    type="text"
                    value={pdfYear2}
                    onChange={(e) => setPdfYear2(e.target.value)}
                    placeholder="2027"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Term
                </label>
                <input
                  type="text"
                  value={pdfTerm}
                  onChange={(e) => setPdfTerm(e.target.value)}
                  placeholder="e.g. Term 1"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              <div className="flex items-center mt-4">
                <input
                  type="checkbox"
                  id="savePdfDefaults"
                  checked={savePdfDefaults}
                  onChange={(e) => setSavePdfDefaults(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="savePdfDefaults" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                  Save these details for all future and current grade sheets
                </label>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => setShowPdfModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPdfModal(false);
                  exportPDF();
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showStudentDetailsEditor && (
        <StudentDetailsEditor
          students={students}
          onUpdateStudents={setStudents}
          onClose={() => setShowStudentDetailsEditor(false)}
          rosterName={rosterName}
        />
      )}

      <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <Footer />
      </div>
    </div>
  );
}
