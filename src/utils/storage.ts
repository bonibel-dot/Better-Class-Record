import { Roster, ClassRecordData, DEFAULT_COMPONENTS, DEFAULT_STUDENTS, Student, ComponentConfig } from '../types';

const ROSTERS_KEY = 'class_rosters';
const ROSTER_DATA_PREFIX = 'roster_data_';
const GLOBAL_TEMPLATES_KEY = 'global_email_templates';

import { EmailTemplate, DEFAULT_EMAIL_TEMPLATES } from '../types';

export const getGlobalTemplates = (): EmailTemplate[] => {
  const templatesStr = localStorage.getItem(GLOBAL_TEMPLATES_KEY);
  if (templatesStr) {
    const savedTemplates = JSON.parse(templatesStr) as EmailTemplate[];
    
    // Ensure all saved templates have the correct triggerCondition from defaults if missing
    let hasUpdates = false;
    const updatedSavedTemplates = savedTemplates.map(st => {
      const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find(dt => dt.id === st.id);
      if (defaultTemplate && st.triggerCondition === undefined && defaultTemplate.triggerCondition !== undefined) {
        hasUpdates = true;
        return { ...st, triggerCondition: defaultTemplate.triggerCondition };
      }
      return st;
    });

    // Merge missing default templates
    const missingTemplates = DEFAULT_EMAIL_TEMPLATES.filter(
      dt => !updatedSavedTemplates.some(st => st.id === dt.id)
    );
    
    if (missingTemplates.length > 0 || hasUpdates) {
      const merged = [...updatedSavedTemplates, ...missingTemplates];
      saveGlobalTemplates(merged);
      return merged;
    }
    return updatedSavedTemplates;
  }
  
  // Initialize with defaults if not present
  saveGlobalTemplates(DEFAULT_EMAIL_TEMPLATES);
  return DEFAULT_EMAIL_TEMPLATES;
};

export const saveGlobalTemplates = (templates: EmailTemplate[]) => {
  localStorage.setItem(GLOBAL_TEMPLATES_KEY, JSON.stringify(templates));
};

export const getRosters = (): Roster[] => {
  const rostersStr = localStorage.getItem(ROSTERS_KEY);
  let rosters: Roster[] = rostersStr ? JSON.parse(rostersStr) : [];

  // Migration: Check for legacy data if no rosters exist
  if (rosters.length === 0) {
    const legacyStudents = localStorage.getItem('classRecord_students');
    const legacyComponents = localStorage.getItem('classRecord_components');

    if (legacyStudents) {
      const defaultRoster: Roster = {
        id: crypto.randomUUID(),
        name: 'My First Class',
        description: 'Migrated from previous version',
        createdAt: Date.now(),
      };
      
      const legacyData: ClassRecordData = {
        id: defaultRoster.id,
        name: defaultRoster.name,
        components: legacyComponents ? JSON.parse(legacyComponents) : DEFAULT_COMPONENTS,
        students: JSON.parse(legacyStudents),
      };

      rosters = [defaultRoster];
      saveRosters(rosters);
      saveRosterData(defaultRoster.id, legacyData);
      
      // Optional: Clear legacy keys to avoid confusion, or keep them as backup
      // localStorage.removeItem('classRecord_students');
      // localStorage.removeItem('classRecord_components');
    }
  }

  // Sort alphabetically with numeric support
  return rosters.sort((a, b) => 
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
};

export const saveRosters = (rosters: Roster[]) => {
  localStorage.setItem(ROSTERS_KEY, JSON.stringify(rosters));
};

export const createRoster = (name: string, description?: string, students?: Student[]): Roster => {
  const rosters = getRosters();
  const newRoster: Roster = {
    id: crypto.randomUUID(),
    name,
    description,
    createdAt: Date.now(),
  };
  rosters.push(newRoster);
  saveRosters(rosters);

  let initialComponents = DEFAULT_COMPONENTS;
  const match = name.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    const subjectName = match[2].trim();
    const subjectComponents = getSubjectComponents(subjectName);
    if (subjectComponents) {
      initialComponents = subjectComponents.map(comp => ({
        ...comp,
        subComponents: comp.subComponents.map(sub => ({
          ...sub
          // Keep the same ID so rosters of the same subject share subcomponent IDs
        }))
      }));
    }
  }

  // Initialize data for the new roster
  const initialData: ClassRecordData = {
    id: newRoster.id,
    name: newRoster.name,
    description: newRoster.description,
    components: initialComponents,
    students: students || DEFAULT_STUDENTS,
  };
  saveRosterData(newRoster.id, initialData);

  return newRoster;
};

export const deleteRoster = (id: string) => {
  const rosters = getRosters();
  const updatedRosters = rosters.filter((r) => r.id !== id);
  saveRosters(updatedRosters);
  localStorage.removeItem(`${ROSTER_DATA_PREFIX}${id}`);
};

export const getRosterData = (id: string): ClassRecordData | null => {
  const data = localStorage.getItem(`${ROSTER_DATA_PREFIX}${id}`);
  return data ? JSON.parse(data) : null;
};

export const saveRosterData = (id: string, data: ClassRecordData) => {
  localStorage.setItem(`${ROSTER_DATA_PREFIX}${id}`, JSON.stringify(data));

  // Also update the roster metadata if the name or description has changed
  const rosters = getRosters();
  const rosterIndex = rosters.findIndex(r => r.id === id);
  if (rosterIndex !== -1) {
    let hasChanges = false;
    
    if (rosters[rosterIndex].name !== data.name) {
      rosters[rosterIndex].name = data.name;
      hasChanges = true;
    }
    
    if (data.description !== undefined && rosters[rosterIndex].description !== data.description) {
      rosters[rosterIndex].description = data.description;
      hasChanges = true;
    }
    
    if (hasChanges) {
      saveRosters(rosters);
    }
  }
};

export const getSubjects = (): string[] => {
  const subjectsStr = localStorage.getItem('subjects_list');
  return subjectsStr ? JSON.parse(subjectsStr) : [];
};

export const saveSubjects = (subjects: string[]) => {
  localStorage.setItem('subjects_list', JSON.stringify(subjects));
};

export const getSubjectComponents = (subjectName: string): ComponentConfig[] | null => {
  const data = localStorage.getItem(`subject_components_${subjectName}`);
  return data ? JSON.parse(data) : null;
};

export const syncComponentsToSubject = (subjectName: string, components: ComponentConfig[], renameMap?: Record<string, string>) => {
  // Save for future classes
  localStorage.setItem(`subject_components_${subjectName}`, JSON.stringify(components));

  // Update all current classes with the same subject
  const rosters = getRosters();
  rosters.forEach(roster => {
    const match = roster.name.match(/^(.*?)\s*\((.*?)\)$/);
    if (match && match[2].trim() === subjectName) {
      const data = getRosterData(roster.id);
      if (data) {
        // Merge components to preserve student scores
        const newComponents: ComponentConfig[] = components.map(sourceComp => {
          const destComp = data.components.find(c => c.id === sourceComp.id);
          
          if (destComp) {
            // Match subcomponents by ID, then name, then oldName
            const mergedSubComponents = sourceComp.subComponents.map((sourceSub) => {
              // 1. Match by ID (for rosters created after the fix)
              let existingSub = destComp.subComponents.find(s => s.id === sourceSub.id);
              
              // 2. Match by current name (for existing rosters)
              if (!existingSub) {
                existingSub = destComp.subComponents.find(s => s.name === sourceSub.name);
              }
              
              // 3. Match by old name (if renamed)
              if (!existingSub && renameMap && renameMap[sourceSub.id]) {
                existingSub = destComp.subComponents.find(s => s.name === renameMap[sourceSub.id]);
              }
              
              if (existingSub) {
                // Keep the destination's ID to preserve scores, but update other fields
                return {
                  ...sourceSub,
                  id: existingSub.id
                };
              } else {
                // New subcomponent, keep the source ID so it's shared across rosters
                return {
                  ...sourceSub
                };
              }
            });

            return {
              ...sourceComp,
              subComponents: mergedSubComponents
            };
          } else {
            // If the component type itself doesn't exist (unlikely), just copy it
            return {
              ...sourceComp
            };
          }
        });

        data.components = newComponents;
        saveRosterData(roster.id, data);
      }
    }
  });
};

export const exportAllData = () => {
  const data: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      data[key] = localStorage.getItem(key);
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `class_record_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const importAllData = (jsonData: string): boolean => {
  try {
    const data = JSON.parse(jsonData);
    for (const key in data) {
      localStorage.setItem(key, data[key]);
    }
    return true;
  } catch (e) {
    console.error("Failed to import data", e);
    return false;
  }
};

export const deleteAllData = () => {
  localStorage.clear();
};
