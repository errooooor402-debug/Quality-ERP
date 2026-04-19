export type Section = 'Sewing' | 'Template' | 'Cutting';
export type ReportType = 'DHU' | 'RFT' | 'Needle Point Analysis' | 'Day Final Report';
export type UserRole = 'admin' | 'entry' | 'viewer';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  assignedLine: string | null;
  isActive: boolean;
  createdAt: any;
}

export interface Defect {
  name: string;
  qty: number;
  operation?: string;
  operatorName?: string;
  operatorId?: string;
  tableType?: string;
}

export interface DhuReport {
  id?: string;
  date: string;
  hourSlot: string;
  section: Section;
  floor: string;
  line: string;
  buyer: string;
  style: string;
  color: string;
  operationName?: string;
  tableType?: string;
  totalReceiveQty: number;
  totalCheckQty: number;
  qcPassQty: number;
  defectiveQty: number;
  rectifyQty?: number;
  defects: Defect[];
  totalDefects: number;
  dhuPercent: number;
  createdAt: any;
  createdBy: string;
}

export interface RftReport {
  id?: string;
  date: string;
  section: Section;
  floor: string;
  line: string;
  buyer: string;
  style: string;
  color: string;
  operationName?: string;
  tableType?: string;
  outputQty: number;
  checkQty: number;
  qcPassQty: number;
  defectiveQty: number;
  rectifyQty?: number;
  rftPercent: number;
  createdAt: any;
  createdBy: string;
}

export interface CriticalProcess {
  name: string;
  operatorName: string;
  operatorId: string;
  trainingStatus?: 'Yes' | 'No' | '';
  checkQty: number;
  defectQty: number;
}

export interface NeedlePointAnalysis {
  id?: string;
  date: string;
  section: Section;
  floor: string;
  line: string;
  buyer: string;
  style: string;
  color: string;
  tableType?: string;
  processes: CriticalProcess[];
  analysisName: string;
  totalCheckQty: number;
  totalDefectQty: number;
  rftPercent: number;
  createdAt: any;
  createdBy: string;
}

export interface CuttingReport {
  id?: string;
  date: string;
  floor: string;
  line: string;
  buyer: string;
  style: string;
  color: string;
  operationName?: string;
  tableType?: string;
  checkQty: number;
  defectiveQty: number;
  rectifyQty?: number;
  defects: { name: string; qty: number }[];
  totalDefects: number;
  dhuPercent: number;
  createdAt: any;
  createdBy: string;
}

export interface DayFinalReport {
  id?: string;
  date: string;
  section: Section;
  floor: string;
  line: string;
  buyer: string;
  style: string;
  color: string;
  tableType?: string;
  totalQcPassQty: number;
  checkQty20: number;
  status: 'Pass' | 'Fail';
  findings?: string;
  remark?: string;
  createdAt: any;
  createdBy: string;
}

export interface UserSettings {
  lastBuyer?: string;
  lastStyle?: string;
  lastColor?: string;
  lastFloor?: string;
  lastLine?: string;
  lineDefaults?: Record<string, {
    buyer: string;
    style: string;
    color: string;
    floor: string;
  }>;
  lastCriticalProcesses?: CriticalProcess[];
  operations?: string[];
  operators?: { name: string; id: string; table?: string }[];
  operationOperatorMap?: Record<string, string>;
}
