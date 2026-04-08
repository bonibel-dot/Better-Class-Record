import { read, utils } from 'xlsx';
import { Student } from '../types';

export interface ParseResult {
  students: Student[];
  error?: string;
}

export const parseRosterFile = (file: File): Promise<ParseResult> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) {
        resolve({ students: [], error: 'Failed to read file data.' });
        return;
      }

      try {
        const workbook = read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          resolve({ students: [], error: 'File appears to be empty or contains no data rows.' });
          return;
        }

        // Find header row
        let headerRowIndex = -1;
        let header: string[] = [];
        const nameVariations = ['name', "learner's name", 'student name', 'learner name', 'student'];

        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
          const row = jsonData[i] as any[];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map(cell => String(cell || '').toLowerCase().trim());
          const hasNameColumn = rowStr.some(cell => nameVariations.some(v => cell === v || cell.includes(v)));
          if (hasNameColumn) {
            headerRowIndex = i;
            header = rowStr;
            break;
          }
        }

        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          header = (jsonData[0] as any[]).map(cell => String(cell || '').toLowerCase().trim());
        }

        let nameIdx = header.findIndex(h => nameVariations.some(v => h === v || h.includes(v)));
        const userIdIdx = header.findIndex(h => h.includes('user_id') || h.includes('student email') || h.includes('email'));
        const studentIdIdx = header.findIndex(h => h.includes('student id') || h.includes('id number'));
        const parentEmailIdx = header.findIndex(h => h === 'parent email' || h === 'parent' || h.includes('parent email 1'));
        const parentEmail2Idx = header.findIndex(h => h.includes('parent email 2') || h.includes('parent 2'));

        if (nameIdx === -1) nameIdx = 0;

        const newStudents: Student[] = [];
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || !Array.isArray(row)) continue;

          const name = row[nameIdx];
          if (!name || String(name).trim() === '') continue;

          const studentEmail = userIdIdx !== -1 ? row[userIdIdx] : '';
          const studentId = studentIdIdx !== -1 ? row[studentIdIdx] : '';
          const parentEmail = parentEmailIdx !== -1 ? row[parentEmailIdx] : '';
          const parentEmail2 = parentEmail2Idx !== -1 ? row[parentEmail2Idx] : '';

          newStudents.push({
            id: crypto.randomUUID(),
            name: String(name).trim(),
            studentId: studentId ? String(studentId).trim() : undefined,
            studentEmail: studentEmail ? String(studentEmail).trim() : undefined,
            parentEmail: parentEmail ? String(parentEmail).trim() : undefined,
            parentEmail2: parentEmail2 ? String(parentEmail2).trim() : undefined,
            scores: {}
          });
        }

        if (newStudents.length > 0) {
          resolve({ students: newStudents });
        } else {
          resolve({ students: [], error: 'No valid student data found. Please check your file format.' });
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        resolve({ students: [], error: 'Failed to parse file. Please ensure it is a valid spreadsheet file.' });
      }
    };
    reader.onerror = () => resolve({ students: [], error: 'Error reading file.' });
    reader.readAsArrayBuffer(file);
  });
};
