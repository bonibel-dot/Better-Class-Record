export type ComponentType = 'written-work' | 'performance-task' | 'end-term';

export interface SubComponent {
  id: string;
  name: string;
  description?: string;
  totalScore: number;
}

export interface ComponentConfig {
  id: ComponentType;
  name: string;
  weight: number; // Percentage (0-100)
  subComponents: SubComponent[];
}

export interface Student {
  id: string;
  name: string;
  studentEmail?: string;
  studentId?: string;
  parentEmail?: string;
  parentEmail2?: string;
  scores: Record<string, number>; // map subComponentId to score
  wwIncentive?: number;
  ptIncentive?: number;
}

export interface Roster {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export type TransmutationFormula = 'default' | 'deped' | 'base-50' | 'base-60' | 'base-0';

export interface ClassRecordData {
  id: string;
  name: string;
  description?: string;
  adviserEmail?: string;
  emailClient?: 'default' | 'gmail';
  makeupCycle?: string;
  makeupDay?: string;
  makeupTime?: string;
  makeupLocation?: string;
  incentiveMode?: 'both' | 'ww_only';
  showExtraPoints?: boolean;
  transmutationFormula?: TransmutationFormula;
  components: ComponentConfig[];
  students: Student[];
  emailTemplates?: EmailTemplate[];
}

export interface Attachment {
  name: string;
  data: string; // Base64 Data URL
  type: string;
  size: number;
}

export type Scenario = 'default' | 'failing' | 'passing' | 'missing' | 'end-term' | string;

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  parentSubject?: string;
  parentBody?: string;
  attachments?: (string | Attachment)[]; // Support both legacy string names and full attachment objects
  scenario?: Scenario;
  isDisciplinary?: boolean;
  triggerCondition?: 'all' | 'failing' | 'missing' | 'passing' | 'written-endterm' | 'all-other' | 'end-term' | 'none';
}

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  data: Blob;
  size: number;
  lastModified: number;
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'progress-update',
    name: 'Progress Update',
    scenario: 'default',
    triggerCondition: 'none',
    subject: '[{subjectName}] - Academic Progress Update',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to provide an update on your progress in {subjectName}.

Here are your recent scores:
{scoreTable}

Current Grade: {currentGrade}

Please let me know if you have any questions.`,
    parentSubject: '[{subjectName}] - Academic Progress Update for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to provide an update on your child's progress in {subjectName}.

Here are your child's recent scores:
{scoreTable}

Current Grade: {currentGrade}

Please let me know if you have any questions.`,
    attachments: []
  },
  {
    id: 'summary-all-scores',
    name: 'Summary of All Scores',
    scenario: 'Summary of All Scores',
    triggerCondition: 'all',
    subject: '[{subjectName}] - Summary of All Scores',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to provide a summary of all your scores in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}

Please review these scores and let me know if you have any questions or concerns.`,
    parentSubject: '[{subjectName}] - Summary of All Scores for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to provide a summary of all your child's scores in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}

Please review these scores and let me know if you have any questions or concerns.`,
    attachments: []
  },
  {
    id: 'summary-written-endterm',
    name: 'Summary of Scores (WW to End-Term)',
    scenario: 'default',
    triggerCondition: 'written-endterm',
    subject: '[{subjectName}] - Summary of Scores (Written Work to End-Term)',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to provide a summary of your scores from Written Work to End-Term Assessment in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}

Please review these scores and let me know if you have any questions or concerns.`,
    parentSubject: '[{subjectName}] - Summary of Scores (Written Work to End-Term) for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to provide a summary of your child's scores from Written Work to End-Term Assessment in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}

Please review these scores and let me know if you have any questions or concerns.`,
    attachments: []
  },
  {
    id: 'summary-all-other',
    name: 'Summary of Scores (All Other)',
    scenario: 'default',
    triggerCondition: 'all-other',
    subject: '[{subjectName}] - Summary of Scores (All Other)',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to provide a summary of your other scores in {subjectName}.

Summary of Scores:
{scoreTable}

Please review these scores and let me know if you have any questions or concerns.`,
    parentSubject: '[{subjectName}] - Summary of Scores (All Other) for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to provide a summary of your child's other scores in {subjectName}.

Summary of Scores:
{scoreTable}

Please review these scores and let me know if you have any questions or concerns.`,
    attachments: []
  },
  {
    id: 'makeup-assessment',
    name: 'Make-up Assessment',
    scenario: 'missing',
    triggerCondition: 'missing',
    subject: '[{subjectName}] - Make-up Assessment Schedule - {missingWorksList}',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to inform you of the make-up assessment schedule for {subjectName} {missingWorksList}.

Make-up Schedule (for Approved Absences):
Cycle {makeupCycle}, Day {makeupDay} from {makeupTime} at {makeupLocation}

Reminders (per Student Handbook – Make-up Assessments):
• A valid excuse letter (signed by parent/guardian) is required to be eligible for a make-up.
• Make-up assessments are administered face-to-face only and will be scheduled on the nearest available day.
• E-make-up slips are issued via email or Canvas Inbox and must be acknowledged by parents/guardians.
• The make-up assessment will NOT be administered to the student if they cannot produce both the excuse letter and make-up-slip on the scheduled day.
• Failure to take the make-up assessment after two (2) schedule changes will result in an automatic zero for the missed assessment.

Please see the attached make-up slip. Kindly have it signed by your parent/guardian and submit it before taking the make-up assessment.

Submit both the excuse letter (signed by parent/guardian) and e-make-up slips by replying to this e-mail with the following documents attached.`,
    parentSubject: '[{subjectName}] - Make-up Assessment Schedule for {studentName} - {missingWorksList}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to inform you of the make-up assessment schedule for your child in {subjectName} {missingWorksList}.

Make-up Schedule (for Approved Absences):
Cycle {makeupCycle}, Day {makeupDay} from {makeupTime} at {makeupLocation}

Reminders (per Student Handbook – Make-up Assessments):
• A valid excuse letter (signed by parent/guardian) is required to be eligible for a make-up.
• Make-up assessments are administered face-to-face only and will be scheduled on the nearest available day.
• E-make-up slips are issued via email or Canvas Inbox and must be acknowledged by parents/guardians.
• The make-up assessment will NOT be administered to the student if they cannot produce both the excuse letter and make-up-slip on the scheduled day.
• Failure to take the make-up assessment after two (2) schedule changes will result in an automatic zero for the missed assessment.

Please see the attached make-up slip. Kindly sign it and have your child submit it before taking the make-up assessment.

Submit both the excuse letter (signed by parent/guardian) and e-make-up slips by replying to this e-mail with the following documents attached.`,
    attachments: ['Make-up Slip.pdf']
  },
  {
    id: 'missing-submission',
    name: 'Missing Submission Notice',
    scenario: 'missing',
    triggerCondition: 'missing',
    subject: '[{subjectName}] - Missing Submission Notice - {missingWorksList}',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to inform you that we have not received your submission for the following assessment(s):
{missingWorksList}

Please submit these as soon as possible.`,
    parentSubject: '[{subjectName}] - Missing Submission Notice for {studentName} - {missingWorksList}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to inform you that we have not received your child's submission for the following assessment(s):
{missingWorksList}

Please ensure these are submitted as soon as possible.`,
    attachments: []
  },
  {
    id: 'end-term-result',
    name: 'End-Term Result',
    scenario: 'end-term',
    triggerCondition: 'end-term',
    subject: '[{subjectName}] - End-Term Assessment Result',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to formally inform you of your recorded score for the End-Term Assessment in {subjectName}.

Assessment Result:
{scoreTable}

If you have any clarifications regarding your score, please do not hesitate to reach out.`,
    parentSubject: '[{subjectName}] - End-Term Assessment Result for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to formally inform you of your child's recorded score for the End-Term Assessment in {subjectName}.

Assessment Result:
{scoreTable}

If you have any clarifications regarding the score, please do not hesitate to reach out.`,
    attachments: []
  },
  {
    id: 'summary-failing-emphasis',
    name: 'Summary of Scores (with Failing/Low Grade Emphasis)',
    scenario: 'failing',
    triggerCondition: 'failing',
    subject: '[{subjectName}] - Academic Progress Update & Action Required',
    body: `Good day {studentFirstName},

I hope this message finds you well.

This email is to provide a summary of your scores in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}
{ifFailing}
Please note that you have failing scores in the following assessments:
{failingWorksList}
{/ifFailing}{ifLowGrade}
Your current grade is below the passing mark of 75. We highly encourage you to review the material and reach out if you need additional support.
{/ifLowGrade}
Please review these scores and let me know if you have any questions or concerns.`,
    parentSubject: '[{subjectName}] - Academic Progress Update & Action Required for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you well.

This email is to provide a summary of your child's scores in {subjectName}.

Summary of Scores:
{scoreTable}

Current Grade: {currentGrade}
{ifFailing}
Please note that your child has failing scores in the following assessments:
{failingWorksList}
{/ifFailing}{ifLowGrade}
Your child's current grade is below the passing mark of 75. We highly encourage them to review the material and reach out if they need additional support.
{/ifLowGrade}
Please review these scores and let me know if you have any questions or concerns.`,
    attachments: []
  },
  {
    id: 'failing-notice',
    name: 'Failing Score Notice',
    scenario: 'failing',
    triggerCondition: 'failing',
    subject: '[{subjectName}] - Academic Progress Update',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to formally inform you of your recorded scores for the selected assessment components listed below. These items were chosen for inclusion and reflect your current academic performance based on submitted and graded work.

Assessment Results:
{failingWorksList}

One or more of the listed assessment results fall below 60% of the total score and therefore do not meet the required academic standard at this time.

You are strongly encouraged to review these assessments, reflect on the feedback provided, and identify areas that require improvement. Any available interventions will follow existing subject and school policies and will be communicated separately, if applicable.

This message is not meant to discourage you, but to clearly communicate where you stand and what can still be done.`,
    parentSubject: '[{subjectName}] - Academic Progress Update for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to formally inform you of your child's recorded scores for the selected assessment components listed below. These items were chosen for inclusion and reflect your child's current academic performance based on submitted and graded work.

Assessment Results:
{failingWorksList}

One or more of the listed assessment results fall below 60% of the total score and therefore do not meet the required academic standard at this time.

You are strongly encouraged to review these assessments with your child, reflect on the feedback provided, and identify areas that require improvement. Any available interventions will follow existing subject and school policies and will be communicated separately, if applicable.

This message is not meant to discourage your child, but to clearly communicate where they stand and what can still be done.`
  },
  {
    id: 'passing-notice',
    name: 'Passing Score Notice',
    scenario: 'passing',
    triggerCondition: 'passing',
    subject: '[{subjectName}] - Academic Progress Update',
    body: `Good day {studentFirstName},

I hope this message finds you in good health.

This email is to formally inform you of your recorded scores for the selected assessment components listed below. These items were chosen for inclusion and reflect your current academic performance based on submitted and graded work.

Assessment Results:
{scoreTable}

The listed scores meet the required academic standard for the subject.

Congratulations on your performance. You are encouraged to maintain this standard in future performance tasks by actively participating and making meaningful contributions.`,
    parentSubject: '[{subjectName}] - Academic Progress Update for {studentName}',
    parentBody: `Good day, Mx. {studentSurname},

I hope this message finds you in good health.

This email is to formally inform you of your child's recorded scores for the selected assessment components listed below. These items were chosen for inclusion and reflect your child's current academic performance based on submitted and graded work.

Assessment Results:
{scoreTable}

The listed scores meet the required academic standard for the subject.

Congratulations on your child's performance. Your child is encouraged to maintain this standard in future performance tasks by actively participating and making meaningful contributions.`
  }
];

export const DEFAULT_COMPONENTS: ComponentConfig[] = [
  {
    id: 'performance-task',
    name: 'Performance Task',
    weight: 45,
    subComponents: [
      { id: 'pt1', name: 'PT1', totalScore: 50 },
    ]
  },
  {
    id: 'end-term',
    name: 'End-Term Assessment',
    weight: 30,
    subComponents: [
      { id: 'et1', name: 'ETA', totalScore: 60 },
    ]
  },
  {
    id: 'written-work',
    name: 'Written Work',
    weight: 25,
    subComponents: [
      { id: 'ww1', name: 'WW1', totalScore: 20 },
      { id: 'ww2', name: 'WW2', totalScore: 25 },
    ]
  }
];

export const DEFAULT_STUDENTS: Student[] = [
  {
    id: '1',
    name: 'Juan Dela Cruz',
    studentEmail: 'juan@school.edu',
    parentEmail: 'parent.juan@gmail.com',
    scores: {
      'ww1': 18, 'ww2': 22,
      'pt1': 45,
      'et1': 55
    }
  },
  {
    id: '2',
    name: 'Maria Clara',
    studentEmail: 'maria@school.edu',
    parentEmail: 'parent.maria@gmail.com',
    scores: {
      'ww1': 20, 'ww2': 25,
      'pt1': 48,
      'et1': 58
    }
  }
];
