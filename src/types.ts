export interface Case {
  id: string; // uuid or timestamp
  receiptNumber: string; // e.g., IOE1234567890
  formType: string; // e.g., I-485, I-140, I-765, I-131, I-130, I-539, N-400
  title: string; // Custom label, e.g. "My Green Card"
  filedDate: string; // YYYY-MM-DD
  center: string; // e.g. LIN, IOE, TSC
  country: string; // Chargeability country
  notes?: string;
  lastUpdated: string; // ISO date string
}

export interface Milestone {
  step: string;
  status: "completed" | "active" | "upcoming";
  date: string;
  description: string;
}

export interface CaseAnalysis {
  receiptValidation: {
    isValidFormat: boolean;
    prefixCode: string;
    prefixOfficeDetails: string;
  };
  currentEstimatedStatus: string;
  processingCenter: string;
  estimatedOverallTimeMonths: number;
  progressPercentage: number;
  daysFiledToNow: number;
  estimatedDecisionDate: string;
  historicalMilestones: Milestone[];
  customInsights: string[];
  actionsToTake: Array<{ title: string; description: string }>;
}

export interface ChecklistItem {
  name: string;
  required: boolean;
  description: string;
  tips: string;
  completed?: boolean;
}

export interface ChecklistSection {
  sectionTitle: string;
  items: ChecklistItem[];
}

export interface FormChecklist {
  form: string;
  title: string;
  category: string;
  sections: ChecklistSection[];
}
