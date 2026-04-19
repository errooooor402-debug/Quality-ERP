import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Search, Filter, Calendar, MapPin, LayoutGrid, Scissors, Activity, ChevronRight, FileText, Download, Trash2, BarChart2, TrendingUp, CheckCircle2, AlertTriangle, Layers, FileBarChart, ClipboardCheck, Edit3, Save, X, PieChart, User as UserIcon, Settings, Clock } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Select, Badge, Label } from './ui/Base';
import { Section, ReportType, DhuReport, CuttingReport, RftReport, NeedlePointAnalysis, DayFinalReport } from '../types';
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, AreaChart, Area, BarChart, Cell } from 'recharts';
import FullCalendar from './ui/FullCalendar';
import { DEFECT_CATEGORIES, SEWING_DEFECTS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

const ExpandableTableWrapper = ({ 
  title, 
  icon: Icon, 
  children,
  compactViewBg = "bg-white",
  renderFooter,
}: { 
  title: React.ReactNode, 
  icon?: any, 
  children: (isExpanded: boolean) => React.ReactNode,
  compactViewBg?: string,
  renderFooter?: (isExpanded: boolean, closeObj?: { close: () => void }) => React.ReactNode
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <div 
        className={cn("relative rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden", compactViewBg, isExpanded ? "" : "cursor-pointer hover:bg-slate-50/50 transition-colors pointer-events-auto")}
        onClickCapture={(e) => {
          if (!isExpanded) {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(true);
          }
        }}
        onTouchStartCapture={(e) => {
          if (!isExpanded) {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(true);
          }
        }}
      >
        <div className={cn("overflow-x-auto select-none pointer-events-auto", !isExpanded && "pointer-events-none")}>
          {children(false)}
        </div>
        
        {renderFooter && renderFooter(false)}

        {!isExpanded && (
          <div className="absolute top-2 right-4 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-100 flex items-center gap-2 animate-pulse cursor-pointer shadow-sm z-10 pointer-events-none">
            <Search className="h-3 w-3 text-brand-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-brand-600">Click to expand</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 drop-shadow-2xl">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsExpanded(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white rounded-[3rem] w-[95vw] h-[95vh] flex flex-col shadow-2xl overflow-hidden relative z-10"
            >
              <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  {Icon && (
                    <div className="bg-white/10 p-3 rounded-2xl">
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  )}
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{title}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} className="text-white hover:bg-white/10 rounded-full h-12 w-12 p-0">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-auto bg-white p-6">
                <div className="min-w-full">
                  {children(true)}
                </div>
              </div>

              {renderFooter ? renderFooter(true, { close: () => setIsExpanded(false) }) : (
                <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-end shrink-0">
                  <Button onClick={() => setIsExpanded(false)} className="bg-slate-900 text-white rounded-full px-8 py-6 font-black uppercase tracking-widest hover:bg-slate-800">
                    Close View
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

interface DataViewProps {
  user: User;
  userProfile?: any;
}

export default function DataView({ user, userProfile }: DataViewProps) {
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com';
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    section: 'Sewing' as Section,
    reportType: 'DHU' as ReportType,
    floor: '',
    line: '',
  });

  const [dayFinalViewMode, setDayFinalViewMode] = useState<'Line-wise' | 'Floor-wise'>('Line-wise');
  const [cuttingViewMode, setCuttingViewMode] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [summaryViewMode, setSummaryViewMode] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [showLineSummary, setShowLineSummary] = useState(true);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'defects' | 'processes' | 'operators' | 'hourly'>('defects');
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedLine, setSelectedLine] = useState<any | null>(null);
  const [selectedLineDetails, setSelectedLineDetails] = useState<any | null>(null);
  
  const dateRangeText = useMemo(() => {
    const date = parseISO(filters.date);
    const mode = filters.section === 'Cutting' ? cuttingViewMode : (filters.reportType === 'DHU' ? summaryViewMode : 'Daily');
    
    if (mode === 'Daily') return format(date, 'dd MMM yyyy');
    if (mode === 'Weekly') {
      const adjustedDate = subWeeks(date, 1);
      const start = startOfWeek(adjustedDate, { weekStartsOn: 6 });
      const end = endOfWeek(adjustedDate, { weekStartsOn: 6 });
      return `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`;
    }
    return format(date, 'MMMM yyyy');
  }, [filters.date, filters.section, filters.reportType, cuttingViewMode, summaryViewMode]);

  const [selectedDefectDetails, setSelectedDefectDetails] = useState<{
    type: 'line' | 'floor';
    name: string;
    defectName: string;
    totalQty: number;
    processes: [string, number][];
    operators: [string, number][];
    combined?: { operator: string, process: string, qty: number }[];
  } | null>(null);
  const [selectedSummaryStat, setSelectedSummaryStat] = useState<{
    label: string;
    value: string | number;
    icon: any;
    color: string;
    bg: string;
    description: string;
  } | null>(null);
  const [lineModalTab, setLineModalTab] = useState<'allDefects' | 'hourly' | 'top5' | 'topOperators'>('allDefects');
  const [defectModalTab, setDefectModalTab] = useState<'processes' | 'operators' | 'combined'>('combined');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempReport, setTempReport] = useState<any>(null);

  const openDefectDetailsModal = (type: 'line' | 'floor', name: string, defectName: string) => {
    const filteredReports = reports.filter(r => {
      if (type === 'line') return (r.line || 'N/A') === name;
      if (type === 'floor') {
        if (name === 'Combined') return true;
        return (r.floor || 'Unknown') === name;
      }
      return false;
    });
    
    let totalQty = 0;
    const processMap: Record<string, number> = {};
    const operatorMap: Record<string, number> = {};
    const combinedList: { operator: string, process: string, qty: number }[] = [];

    filteredReports.forEach(r => {
      r.defects?.forEach((d: any) => {
        if (defectName === 'All' || d.name === defectName) {
          const qty = Number(d.qty || 0);
          totalQty += qty;
          
          const process = d.operation || 'Unknown Process';
          processMap[process] = (processMap[process] || 0) + qty;
          
          const operator = d.operatorName || 'Unknown Operator';
          operatorMap[operator] = (operatorMap[operator] || 0) + qty;

          combinedList.push({ operator, process, qty });
        }
      });
    });

    // Aggregate combined list
    const aggregatedCombined: Record<string, { operator: string, process: string, qty: number }> = {};
    combinedList.forEach(item => {
      const key = `${item.operator}|${item.process}`;
      if (!aggregatedCombined[key]) {
        aggregatedCombined[key] = { ...item };
      } else {
        aggregatedCombined[key].qty += item.qty;
      }
    });

    const sortedProcesses = Object.entries(processMap).sort((a, b) => b[1] - a[1]);
    const sortedOperators = Object.entries(operatorMap).sort((a, b) => b[1] - a[1]);
    const sortedCombined = Object.values(aggregatedCombined).sort((a, b) => b.qty - a.qty);

    setSelectedDefectDetails({
      type,
      name,
      defectName,
      totalQty,
      processes: sortedProcesses,
      operators: sortedOperators,
      combined: sortedCombined
    } as any);
    setDefectModalTab('combined' as any);
  };

  useEffect(() => {
    setLoading(true);
    let collName = 'dhuReports';
    if (filters.section === 'Cutting') {
      collName = 'cuttingReports';
    } else {
      switch (filters.reportType) {
        case 'RFT': collName = 'rftReports'; break;
        case 'Needle Point Analysis': collName = 'needlePointAnalyses'; break;
        case 'Day Final Report': collName = 'dayFinalReports'; break;
        case 'DHU': collName = 'dhuReports'; break;
      }
    }
    
    let q;
    if ((filters.section === 'Cutting' && cuttingViewMode !== 'Daily') || 
        (filters.section !== 'Cutting' && summaryViewMode !== 'Daily')) {
      const mode = filters.section === 'Cutting' ? cuttingViewMode : summaryViewMode;
      const date = parseISO(filters.date);
      let startDate, endDate;
      
      if (mode === 'Weekly') {
        const adjustedDate = subWeeks(date, 1);
        startDate = format(startOfWeek(adjustedDate, { weekStartsOn: 6 }), 'yyyy-MM-dd');
        endDate = format(endOfWeek(adjustedDate, { weekStartsOn: 6 }), 'yyyy-MM-dd');
      } else {
        startDate = format(startOfMonth(date), 'yyyy-MM-dd');
        endDate = format(endOfMonth(date), 'yyyy-MM-dd');
      }
      
      let baseQ = query(
        collection(db, collName),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );

      if (filters.floor) {
        baseQ = query(baseQ, where('floor', '==', filters.floor));
      }
      q = baseQ;
    } else {
      q = query(
        collection(db, collName),
        where('date', '==', filters.date),
        where('section', '==', filters.section)
      );
    }
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let fetchedReports: any[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort client-side by createdAt desc
      fetchedReports.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      // Client-side filtering for Floor and Line to avoid composite index requirements
      if (filters.floor) {
        fetchedReports = fetchedReports.filter(r => r.floor === filters.floor);
      }
      if (filters.line && filters.reportType !== 'Day Final Report') {
        fetchedReports = fetchedReports.filter(r => r.line === filters.line);
      }

      setReports(fetchedReports);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, collName);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filters.date, filters.section, filters.reportType, filters.floor, filters.line, cuttingViewMode, summaryViewMode]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const newFilters = { ...prev, [name]: value };
      if (name === 'floor' && value !== prev.floor) {
        newFilters.line = '';
      }
      return newFilters;
    });
  };

  const renderSummaryTable = (isExpanded: boolean) => (
    <div className={cn("overflow-x-auto", isExpanded ? "p-4 sm:p-6" : "")}>
      <table className={cn("w-full border-collapse table-auto pointer-events-auto", isExpanded ? "text-xs" : "text-[8px]")}>
        <thead>
          {/* Main Header Categories */}
          <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
            <th colSpan={4} className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-1 py-2")}>General Info</th>
            <th colSpan={2} className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-1 py-2")}>Production</th>
            <th colSpan={activeDefects.length} className={cn("border-r border-slate-700 text-center", isExpanded ? "px-2 py-4" : "px-0.5 py-2")}>Defect Breakdown</th>
            <th colSpan={2} className={cn("text-center", isExpanded ? "px-4 py-4" : "px-1 py-2")}>Summary</th>
          </tr>
          {/* Sub Header - Defect Names */}
          <tr className="bg-slate-100 text-slate-600 font-black uppercase tracking-widest">
            <th className={cn("border border-slate-200 text-left", isExpanded ? "px-4 py-3 min-w-[80px]" : "px-1 py-1.5 min-w-[30px]")}>Line</th>
            <th className={cn("border border-slate-200 text-left truncate", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1.5 max-w-[40px]")}>Buyer</th>
            <th className={cn("border border-slate-200 text-left truncate", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1.5 max-w-[40px]")}>Style</th>
            <th className={cn("border border-slate-200 text-left truncate", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1.5 max-w-[40px]")}>Color</th>
            <th className={cn("border border-slate-200 text-center bg-yellow-100/50", isExpanded ? "px-4 py-3" : "px-1 py-1.5")}>Check</th>
            <th className={cn("border border-slate-200 text-center bg-yellow-100/50 border-r-2 border-r-slate-300", isExpanded ? "px-4 py-3" : "px-1 py-1.5")}>Pass</th>
            
            {activeDefects.map(name => (
              <th key={name} className={cn("border border-slate-200 relative", isExpanded ? "px-1 py-4 min-w-[30px] h-[120px]" : "px-0 py-2 min-w-[16px] h-[80px]")}>
                <div className={cn("vertical-text absolute inset-0 flex items-center justify-center whitespace-nowrap", isExpanded ? "text-[10px]" : "text-[7px]")}>
                  {name}
                </div>
              </th>
            ))}

            <th className={cn("border border-slate-200 text-center bg-green-100/50 border-l-2 border-l-slate-300", isExpanded ? "px-4 py-3" : "px-1 py-1.5")}>Defects</th>
            <th className={cn("border border-slate-200 text-center bg-green-100/50", isExpanded ? "px-4 py-3" : "px-1 py-1.5")}>DHU%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {lineSummaryData.map((line: any, idx: number) => (
            <tr 
              key={idx} 
              className="hover:bg-slate-50 transition-colors cursor-pointer group/row"
              onClick={(e) => {
                if (!isExpanded) return;
                // Prevent opening line details if a specific defect cell was clicked
                const target = e.target as HTMLElement;
                if (target.closest('td[onClick]')) return;
                
                const details = lineCardData.find(ld => ld.lineName === line.lineName);
                if (details) setSelectedLineDetails(details);
              }}
            >
              <td className={cn("border border-slate-200 font-black text-slate-900 bg-slate-50 group-hover/row:bg-brand-50 group-hover/row:text-brand-600 transition-colors", isExpanded ? "px-4 py-3" : "px-1 py-1")}>{line.lineName}</td>
              <td className={cn("border border-slate-200 truncate text-slate-500 font-bold", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1 max-w-[40px]")}>{line.buyer}</td>
              <td className={cn("border border-slate-200 truncate text-slate-500 font-bold", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1 max-w-[40px]")}>{line.style}</td>
              <td className={cn("border border-slate-200 truncate text-slate-500 font-bold", isExpanded ? "px-4 py-3 max-w-[100px]" : "px-1 py-1 max-w-[40px]")}>{line.color}</td>
              <td className={cn("border border-slate-200 text-center font-black bg-yellow-50/30", isExpanded ? "px-4 py-3" : "px-1 py-1")}>{line.totalCheck}</td>
              <td className={cn("border border-slate-200 text-center font-black bg-yellow-50/30 border-r-2 border-r-slate-300", isExpanded ? "px-4 py-3" : "px-1 py-1")}>{line.qcPass}</td>
              
              {activeDefects.map(name => (
                <td 
                  key={name} 
                  onClick={(e) => {
                    if (!isExpanded) return;
                    e.stopPropagation();
                    if (line.defects[name] > 0) openDefectDetailsModal('line', line.lineName, name);
                  }}
                  className={cn(
                    "border border-slate-100 text-center font-bold",
                    isExpanded ? "px-2 py-3" : "px-0.5 py-1",
                    line.defects[name] > 0 ? "bg-red-50 text-red-600 cursor-pointer hover:bg-red-100" : "text-slate-200"
                  )}
                >
                  {line.defects[name] || ''}
                </td>
              ))}

              <td 
                onClick={(e) => {
                  if (!isExpanded) return;
                  e.stopPropagation();
                  if (line.totalDefects > 0) openDefectDetailsModal('line', line.lineName, 'All');
                }}
                className={cn(
                  "border border-slate-200 text-center font-black bg-green-50/30 border-l-2 border-l-slate-300",
                  isExpanded ? "px-4 py-3" : "px-1 py-1",
                  line.totalDefects > 0 && "cursor-pointer hover:bg-green-100/50"
                )}
              >
                {line.totalDefects}
              </td>
              <td className={cn(
                "border border-slate-200 text-center font-black bg-green-50/30",
                isExpanded ? "px-4 py-3" : "px-1 py-1",
                (line.totalCheck > 0 ? (line.totalDefects / line.totalCheck * 100) : 0) > 10 ? "text-red-600" : "text-emerald-600"
              )}>
                {Number(line.totalCheck > 0 ? (line.totalDefects / line.totalCheck * 100) : 0).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-900 text-white font-black">
            <td colSpan={4} className={cn("text-right uppercase tracking-widest", isExpanded ? "px-4 py-4" : "px-1 py-2")}>Total</td>
            <td className={cn("text-center border-l border-slate-700", isExpanded ? "px-4 py-4" : "px-1 py-2")}>{lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 0)}</td>
            <td className={cn("text-center border-l border-slate-700 border-r-2 border-r-slate-600", isExpanded ? "px-4 py-4" : "px-1 py-2")}>{lineSummaryData.reduce((sum: number, l: any) => sum + l.qcPass, 0)}</td>
            
            {activeDefects.map(name => (
              <td 
                key={name} 
                className={cn("text-center border-l border-slate-700 transition-colors", isExpanded ? "px-2 py-4" : "px-0.5 py-2", isExpanded && "cursor-pointer hover:bg-slate-800")}
                onClick={() => {
                  if (!isExpanded) return;
                  openDefectDetailsModal('floor', 'Combined', name);
                }}
              >
                {lineSummaryData.reduce((sum: number, l: any) => sum + (l.defects[name] || 0), 0) || ''}
              </td>
            ))}

            <td 
              className={cn("text-center border-l-2 border-l-slate-600 transition-colors", isExpanded ? "px-4 py-4" : "px-1 py-2", isExpanded && "cursor-pointer hover:bg-slate-800")}
              onClick={() => {
                if (!isExpanded) return;
                openDefectDetailsModal('floor', 'Combined', 'All');
              }}
            >
              {lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0)}
            </td>
            <td className={cn("text-center border-l border-slate-700 text-emerald-400", isExpanded ? "px-4 py-4" : "px-1 py-2")}>
              {Number(lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 0) > 0 
                ? (lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0) / lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 1) * 100) 
                : 0).toFixed(1)}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const dayFinalSummary = useMemo(() => {
    if (filters.reportType !== 'Day Final Report') return null;
    
    // Group by Floor, then by Line, Buyer, Style, Color for detailed Report
    const floorGroups: Record<string, Record<string, any>> = {};
    reports.forEach(r => {
      if (!floorGroups[r.floor]) floorGroups[r.floor] = {};
      
      const groupKey = `${r.line || 'N/A'}-${r.buyer || 'N/A'}-${r.style || 'N/A'}-${r.color || 'N/A'}`;
      if (!floorGroups[r.floor][groupKey]) {
        floorGroups[r.floor][groupKey] = {
          line: r.line || 'N/A',
          buyer: r.buyer || 'N/A',
          style: r.style || 'N/A',
          color: r.color || 'N/A',
          totalQcPassQty: 0,
          checkQty20: 0,
          status: 'Pass',
          findings: [],
          remarks: []
        };
      }
      
      const group = floorGroups[r.floor][groupKey];
      group.totalQcPassQty += Number(r.totalQcPassQty || 0);
      group.checkQty20 += Number(r.checkQty20 || 0);
      if (r.status === 'Fail') {
        group.status = 'Fail';
      }
      if (r.findings) group.findings.push(r.findings);
      if (r.remark) group.remarks.push(r.remark);
    });

    // Convert nested objects to arrays
    const formattedFloorGroups: Record<string, any[]> = {};
    Object.entries(floorGroups).forEach(([floor, groups]) => {
      formattedFloorGroups[floor] = Object.values(groups).map(g => ({
        ...g,
        findings: g.findings.join(' | '),
        remark: g.remarks.join(' | ')
      })).sort((a, b) => a.line.localeCompare(b.line));
    });

    // Aggregate by Floor for Floor-wise Summary
    const floorSummary: Record<string, any> = {};
    reports.forEach(r => {
      if (!floorSummary[r.floor]) {
        floorSummary[r.floor] = {
          floor: r.floor,
          lineCount: new Set(),
          totalInspection: 0,
          pass: 0,
          fail: 0,
          reasons: []
        };
      }
      const fs = floorSummary[r.floor];
      fs.lineCount.add(r.line);
      fs.totalInspection += 1;
      if (r.status === 'Pass') fs.pass += 1;
      else {
        fs.fail += 1;
        if (r.findings) fs.reasons.push(`${r.line}: ${r.findings}`);
      }
    });

    return {
      floorGroups: formattedFloorGroups,
      floorSummary: Object.values(floorSummary).map(fs => ({
        ...fs,
        lineCount: fs.lineCount.size,
        passPercent: fs.totalInspection > 0 ? (fs.pass / fs.totalInspection) * 100 : 0,
        failPercent: fs.totalInspection > 0 ? (fs.fail / fs.totalInspection) * 100 : 0,
      }))
    };
  }, [reports, filters.reportType]);

  const getQcPassQty = (r: any) => {
    const pass = Number(r.qcPassQty || 0);
    if (r.section === 'Sewing' && r.tableType && r.tableType !== 'Output table' && r.tableType !== 'All table') {
      return 0;
    }
    return pass;
  };

  const lineSummaryData = useMemo(() => {
    if (filters.reportType !== 'DHU') return [];
    
    const summary: Record<string, any> = {};
    reports.forEach(r => {
      const compositeKey = `${r.line || 'N/A'}|${r.buyer || 'N/A'}|${r.style || 'N/A'}|${r.color || 'N/A'}`;
      if (!summary[compositeKey]) {
        summary[compositeKey] = {
          lineName: r.line || 'N/A',
          buyer: r.buyer || 'N/A',
          style: r.style || 'N/A',
          color: r.color || 'N/A',
          qcPass: 0,
          totalCheck: 0,
          totalDefects: 0,
          defectiveGarments: 0,
          defects: {}
        };
      }
      const s = summary[compositeKey];
      s.qcPass += getQcPassQty(r);
      s.totalCheck += Number(r.totalCheckQty || r.checkQty || 0);
      s.totalDefects += Number(r.totalDefects || 0);
      s.defectiveGarments += Number(r.defectiveQty || 0); 

      r.defects?.forEach((d: any) => {
        s.defects[d.name] = (s.defects[d.name] || 0) + Number(d.qty || 0);
      });
    });

    return Object.values(summary).map((s: any) => ({
      ...s,
      dhu: s.totalCheck > 0 ? (s.totalDefects / s.totalCheck) * 100 : 0
    })).sort((a: any, b: any) => a.lineName.localeCompare(b.lineName));
  }, [reports, filters.reportType]);

  const lineCardData = useMemo(() => {
    if (filters.reportType !== 'DHU') return [];
    const lines: Record<string, any> = {};

    reports.forEach(r => {
      const line = r.line || 'Unknown Line';
      if (!lines[line]) {
        lines[line] = {
          lineName: line,
          totalCheck: 0,
          totalPass: 0,
          totalDefects: 0,
          defectsByName: {} as Record<string, number>,
          allDefects: {} as Record<string, { name: string, qty: number, operation: string, operator: string }>,
          operations: {} as Record<string, number>,
          operators: {} as Record<string, number>,
          hourly: {} as Record<string, any>
        };
      }
      const l = lines[line];
      l.totalCheck += Number(r.totalCheckQty || r.checkQty || 0);
      l.totalPass += getQcPassQty(r);
      l.totalDefects += Number(r.totalDefects || 0);

      const hour = r.hourSlot || 'Unknown Hour';
      if (!l.hourly[hour]) {
        l.hourly[hour] = {
          hour,
          check: 0, pass: 0, defects: 0,
          defectDetails: {} as Record<string, { qty: number, operation: string, operator: string }>,
          operations: new Set<string>(),
          operators: new Set<string>()
        };
      }
      l.hourly[hour].check += Number(r.totalCheckQty || r.checkQty || 0);
      l.hourly[hour].pass += getQcPassQty(r);
      l.hourly[hour].defects += Number(r.totalDefects || 0);

      r.defects?.forEach((d: any) => {
        if (d.qty > 0) {
          const opName = d.operation || 'Unknown Operation';
          const opId = d.operatorName ? `${d.operatorName} (${d.operatorId || 'N/A'})` : (d.operatorId || 'Unknown Operator');

          // Aggregate by name for Top 3 / Top 5
          l.defectsByName[d.name] = (l.defectsByName[d.name] || 0) + Number(d.qty);

          // Aggregate by unique combination for All Defects tab
          const uniqueKey = `${d.name}|${opName}|${opId}`;
          if (!l.allDefects[uniqueKey]) {
            l.allDefects[uniqueKey] = { name: d.name, qty: 0, operation: opName, operator: opId };
          }
          l.allDefects[uniqueKey].qty += Number(d.qty);

          if (!l.hourly[hour].defectDetails[d.name]) {
            l.hourly[hour].defectDetails[d.name] = { qty: 0, operation: opName, operator: opId };
          }
          l.hourly[hour].defectDetails[d.name].qty += Number(d.qty);

          l.operations[opName] = (l.operations[opName] || 0) + Number(d.qty);
          l.operators[opId] = (l.operators[opId] || 0) + Number(d.qty);

          l.hourly[hour].operations.add(opName);
          l.hourly[hour].operators.add(opId);
        }
      });
    });

    return Object.values(lines).map(l => {
      const sortedDefectsByName = Object.entries(l.defectsByName).sort((a: any, b: any) => b[1] - a[1]);
      const top3Defects = sortedDefectsByName.slice(0, 3);
      const top5Defects = sortedDefectsByName.slice(0, 5);

      const allDefectsList = Object.values(l.allDefects).sort((a: any, b: any) => b.qty - a.qty);

      const sortedOperations = Object.entries(l.operations).sort((a: any, b: any) => b[1] - a[1]);
      const topOperation = sortedOperations[0] || ['None', 0];

      const sortedOperators = Object.entries(l.operators).sort((a: any, b: any) => b[1] - a[1]);
      const topOperator = sortedOperators[0] || ['None', 0];

      return {
        ...l,
        dhu: l.totalCheck > 0 ? (l.totalDefects / l.totalCheck) * 100 : 0,
        top3Defects,
        top5Defects,
        allDefectsList,
        topOperation,
        topOperator,
        sortedOperators,
        hourlyList: Object.values(l.hourly).sort((a: any, b: any) => a.hour.localeCompare(b.hour)).map((h: any) => ({
          ...h,
          dhu: h.check > 0 ? (h.defects / h.check) * 100 : 0,
          operations: Array.from(h.operations).join(', '),
          operators: Array.from(h.operators).join(', ')
        }))
      };
    }).sort((a, b) => a.lineName.localeCompare(b.lineName));
  }, [reports, filters.reportType]);

  const floorCardData = useMemo(() => {
    if (filters.reportType !== 'DHU') return null;

    const floors: Record<string, any> = {
      'Modhumoti': { name: 'Modhumoti', totalCheck: 0, totalPass: 0, totalDefects: 0, defectsByName: {}, operators: {} },
      'Ichamoti': { name: 'Ichamoti', totalCheck: 0, totalPass: 0, totalDefects: 0, defectsByName: {}, operators: {} },
      'Combined': { name: 'Combined', totalCheck: 0, totalPass: 0, totalDefects: 0, defectsByName: {}, operators: {} }
    };

    reports.forEach(r => {
      const floor = r.floor || 'Unknown';
      const targets = [floors['Combined']];
      if (floor.toLowerCase().includes('modhumoti')) targets.push(floors['Modhumoti']);
      else if (floor.toLowerCase().includes('ichamoti')) targets.push(floors['Ichamoti']);

      targets.forEach(t => {
        t.totalCheck += Number(r.totalCheckQty || r.checkQty || 0);
        t.totalPass += getQcPassQty(r);
        t.totalDefects += Number(r.totalDefects || 0);

        r.defects?.forEach((d: any) => {
          if (d.qty > 0) {
            const opId = d.operatorName ? `${d.operatorName} (${d.operatorId || 'N/A'})` : (d.operatorId || 'Unknown Operator');
            
            t.defectsByName[d.name] = (t.defectsByName[d.name] || 0) + Number(d.qty);
            t.operators[opId] = (t.operators[opId] || 0) + Number(d.qty);
          }
        });
      });
    });

    const processFloor = (f: any) => {
      const sortedDefects = Object.entries(f.defectsByName).sort((a: any, b: any) => b[1] - a[1]);
      const top5Defects = sortedDefects.slice(0, 5);
      const sortedOperators = Object.entries(f.operators).sort((a: any, b: any) => b[1] - a[1]);
      const topOperator = sortedOperators[0] || ['None', 0];

      return {
        ...f,
        dhu: f.totalCheck > 0 ? (f.totalDefects / f.totalCheck) * 100 : 0,
        top5Defects,
        topOperator
      };
    };

    return {
      Modhumoti: processFloor(floors['Modhumoti']),
      Ichamoti: processFloor(floors['Ichamoti']),
      Combined: processFloor(floors['Combined'])
    };
  }, [reports, filters.reportType]);

  const floorLineAnalysis = useMemo(() => {
    if (filters.reportType !== 'DHU') return null;

    const floors: Record<string, any> = {};
    const globalStats = {
      totalCheck: 0,
      totalPass: 0,
      totalDefects: 0,
      defectCounts: {} as Record<string, number>,
      operatorCounts: {} as Record<string, { name: string, qty: number, floor: string }>,
    };

    reports.forEach(r => {
      const floorKey = r.floor || 'N/A';
      const lineKey = r.line || 'N/A';
      const hourKey = r.hourSlot || 'N/A';

      if (!floors[floorKey]) {
        floors[floorKey] = {
          name: floorKey,
          totalCheck: 0,
          totalPass: 0,
          totalDefects: 0,
          defectCounts: {} as Record<string, number>,
          operatorCounts: {} as Record<string, { name: string, qty: number }>,
          lines: {} as Record<string, any>
        };
      }

      const f = floors[floorKey];
      if (!f.lines[lineKey]) {
        f.lines[lineKey] = {
          name: lineKey,
          buyer: r.buyer,
          style: r.style,
          totalCheck: 0,
          totalPass: 0,
          totalDefects: 0,
          defectCounts: {} as Record<string, number>,
          hourly: {} as Record<string, any>
        };
      }

      const l = f.lines[lineKey];
      if (!l.hourly[hourKey]) {
        l.hourly[hourKey] = {
          hour: hourKey,
          checkQty: 0,
          passQty: 0,
          totalDefects: 0,
          defects: [] as any[],
          defectSummary: {} as Record<string, number>
        };
      }

      const h = l.hourly[hourKey];
      const check = Number(r.totalCheckQty || r.checkQty || 0);
      const pass = getQcPassQty(r);
      const defects = Number(r.totalDefects || 0);

      h.checkQty += check;
      h.passQty += pass;
      h.totalDefects += defects;
      
      r.defects?.forEach((d: any) => {
        const qty = Number(d.qty || 0);
        h.defects.push({
          name: d.name,
          qty,
          operation: d.operation,
          operatorName: d.operatorName,
          operatorId: d.operatorId
        });
        h.defectSummary[d.name] = (h.defectSummary[d.name] || 0) + qty;
        l.defectCounts[d.name] = (l.defectCounts[d.name] || 0) + qty;
        f.defectCounts[d.name] = (f.defectCounts[d.name] || 0) + qty;
        globalStats.defectCounts[d.name] = (globalStats.defectCounts[d.name] || 0) + qty;

        if (d.operatorId) {
          f.operatorCounts[d.operatorId] = { 
            name: d.operatorName, 
            qty: (f.operatorCounts[d.operatorId]?.qty || 0) + qty 
          };
          globalStats.operatorCounts[d.operatorId] = { 
            name: d.operatorName, 
            qty: (globalStats.operatorCounts[d.operatorId]?.qty || 0) + qty,
            floor: floorKey
          };
        }
      });

      l.totalCheck += check;
      l.totalPass += pass;
      l.totalDefects += defects;
      f.totalCheck += check;
      f.totalPass += pass;
      f.totalDefects += defects;
      globalStats.totalCheck += check;
      globalStats.totalPass += pass;
      globalStats.totalDefects += defects;
    });

    return { floors, globalStats };
  }, [reports, filters.reportType]);

  const topAnalysisData = useMemo(() => {
    const defectCounts: Record<string, number> = {};
    const processCounts: Record<string, number> = {};
    const operatorCounts: Record<string, { name: string, qty: number }> = {};
    const hourlyData: Record<string, Record<string, number>> = {};
    
    reports.forEach(r => {
      const hour = r.hourSlot || 'N/A';
      if (!hourlyData[hour]) hourlyData[hour] = {};
      hourlyData[hour][r.line] = (hourlyData[hour][r.line] || 0) + Number(r.totalDefects || 0);

      r.defects?.forEach((d: any) => {
        const qty = Number(d.qty || 0);
        defectCounts[d.name] = (defectCounts[d.name] || 0) + qty;
        if (d.operation) {
          processCounts[d.operation] = (processCounts[d.operation] || 0) + qty;
        }
        if (d.operatorId) {
          if (!operatorCounts[d.operatorId]) {
            operatorCounts[d.operatorId] = { name: d.operatorName || 'N/A', qty: 0 };
          }
          operatorCounts[d.operatorId].qty += qty;
        }
      });
    });

    const topDefects = Object.entries(defectCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const topProcesses = Object.entries(processCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const topOperators = Object.entries(operatorCounts)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5)
      .map(([id, data]) => ({ id, ...data }));

    return { topDefects, topProcesses, topOperators, hourlyData };
  }, [reports]);

  const handleEdit = (report: any) => {
    setEditingId(report.id);
    setTempReport({ ...report });
  };

  const handleSave = async () => {
    if (!editingId || !tempReport) return;
    setLoading(true);
    try {
      let collName = 'dhuReports';
      if (filters.section === 'Cutting') collName = 'cuttingReports';
      else {
        switch (filters.reportType) {
          case 'RFT': collName = 'rftReports'; break;
          case 'Needle Point Analysis': collName = 'needlePointAnalyses'; break;
          case 'Day Final Report': collName = 'dayFinalReports'; break;
          case 'DHU': collName = 'dhuReports'; break;
        }
      }
      
      const reportRef = doc(db, collName, editingId);
      await updateDoc(reportRef, {
        ...tempReport,
        updatedAt: new Date().toISOString()
      });
      setEditingId(null);
      setTempReport(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'reports');
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;
    
    setLoading(true);
    try {
      let collName = 'dhuReports';
      if (filters.section === 'Cutting') collName = 'cuttingReports';
      else {
        switch (filters.reportType) {
          case 'RFT': collName = 'rftReports'; break;
          case 'Needle Point Analysis': collName = 'needlePointAnalyses'; break;
          case 'Day Final Report': collName = 'dayFinalReports'; break;
          case 'DHU': collName = 'dhuReports'; break;
        }
      }
        
      await deleteDoc(doc(db, collName, reportId));
      setEditingId(null);
      setTempReport(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'reports');
    } finally {
      setLoading(false);
    }
  };

  const groupedReports = useMemo(() => {
    if (filters.reportType !== 'DHU') return null;
    
    const groups: Record<string, {
      line: string;
      buyers: Set<string>;
      styles: Set<string>;
      totalCheckQty: number;
      totalQcPassQty: number;
      totalDefects: number;
      defects: Record<string, { qty: number, operation: string, operatorName: string, operatorId: string }>;
    }> = {};

    reports.forEach(r => {
      const lineKey = r.line || 'Unknown Line';
      if (!groups[lineKey]) {
        groups[lineKey] = {
          line: lineKey,
          buyers: new Set(),
          styles: new Set(),
          totalCheckQty: 0,
          totalQcPassQty: 0,
          totalDefects: 0,
          defects: {}
        };
      }
      const group = groups[lineKey];
      if (r.buyer) group.buyers.add(r.buyer);
      if (r.style) group.styles.add(r.style);
      group.totalCheckQty += r.totalCheckQty || 0;
      group.totalQcPassQty += getQcPassQty(r);
      group.totalDefects += r.totalDefects || 0;

      r.defects?.forEach((d: any) => {
        const dQty = Number(d.qty || 0);
        const key = `${d.name}-${d.operation}-${d.operatorId}`;
        if (!group.defects[key]) {
          group.defects[key] = { qty: 0, operation: d.operation || 'N/A', operatorName: d.operatorName || 'N/A', operatorId: d.operatorId || 'N/A' };
        }
        group.defects[key].qty += dQty;
      });
    });

    return Object.values(groups).map(g => ({
      ...g,
      buyer: Array.from(g.buyers).join(' / ') || 'N/A',
      style: Array.from(g.styles).join(' / ') || 'N/A',
      dhuPercent: g.totalCheckQty > 0 ? (g.totalDefects / g.totalCheckQty) * 100 : 0,
      defects: Object.entries(g.defects).map(([key, data]) => ({ name: key.split('-')[0], ...data }))
    }));
  }, [reports, filters.reportType]);

  const summaryData = useMemo(() => {
    if (filters.reportType !== 'Day Final Report') return null;
    
    const defectMap: Record<string, number> = {};
    const processMap: Record<string, number> = {};
    const operatorMap: Record<string, { name: string, id: string, qty: number, process: string }> = {};
    
    let totalCheck = 0;
    let totalPass = 0;
    let totalDefects = 0;

    reports.forEach(r => {
      totalCheck += Number(r.totalCheckQty || 0);
      totalPass += getQcPassQty(r);
      totalDefects += Number(r.totalDefects || 0);

      r.defects?.forEach((d: any) => {
        const dQty = Number(d.qty || 0);
        // Defect frequency
        defectMap[d.name] = (defectMap[d.name] || 0) + dQty;
        
        // Process frequency
        if (d.operation) {
          processMap[d.operation] = (processMap[d.operation] || 0) + dQty;
        }

        // Operator frequency
        if (d.operatorId) {
          if (!operatorMap[d.operatorId]) {
            operatorMap[d.operatorId] = { 
              name: d.operatorName || 'Unknown', 
              id: d.operatorId, 
              qty: 0, 
              process: d.operation || 'Unknown' 
            };
          }
          operatorMap[d.operatorId].qty += dQty;
        }
      });
    });

    const topDefects = Object.entries(defectMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const topProcesses = Object.entries(processMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const topOperators = Object.values(operatorMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalCheck,
      totalPass,
      totalDefects,
      dhu: totalCheck > 0 ? (totalDefects / totalCheck) * 100 : 0,
      topDefects,
      topProcesses,
      topOperators
    };
  }, [reports, filters.reportType]);

  const rftSummaryData = useMemo(() => {
    if (filters.reportType !== 'RFT' && filters.reportType !== 'Needle Point Analysis') return null;

    const floors: Record<string, any[]> = {};
    reports.forEach(r => {
      const floor = r.floor || 'Unknown';
      if (!floors[floor]) floors[floor] = [];
      
      const checkQty = Number(r.checkQty || r.totalCheckQty || 0);
      const defectiveQty = Number(r.defectiveQty || r.totalDefectQty || 0);
      let qcPassQty = Number(r.qcPassQty || (checkQty - defectiveQty));
      
      if (r.section === 'Sewing' && r.tableType && r.tableType !== 'Output table' && r.tableType !== 'All table') {
        qcPassQty = 0;
      }

      // Group by Line, Buyer, Style, Color
      const existing = floors[floor].find(item => 
        item.line === r.line && 
        item.buyer === (r.buyer || 'N/A') && 
        item.style === (r.style || 'N/A') &&
        item.color === (r.color || 'N/A')
      );
      if (existing) {
        existing.totalCheck += checkQty;
        existing.qcPassQty += qcPassQty;
        existing.defectiveQty += defectiveQty;
      } else {
        floors[floor].push({
          line: r.line,
          buyer: r.buyer || 'N/A',
          style: r.style || 'N/A',
          color: r.color || 'N/A',
          totalCheck: checkQty,
          qcPassQty: qcPassQty,
          defectiveQty: defectiveQty,
        });
      }
    });

    return Object.entries(floors).map(([floor, records]) => ({
      floor,
      lines: records.sort((a, b) => a.line.localeCompare(b.line)),
      subTotal: records.reduce((acc, curr) => ({
        totalCheck: acc.totalCheck + curr.totalCheck,
        qcPassQty: acc.qcPassQty + curr.qcPassQty,
        defectiveQty: acc.defectiveQty + curr.defectiveQty,
      }), { totalCheck: 0, qcPassQty: 0, defectiveQty: 0 })
    })).sort((a, b) => a.floor.localeCompare(b.floor));
  }, [reports, filters.reportType]);

  const needlePointSummaryData = useMemo(() => {
    if (filters.reportType !== 'Needle Point Analysis') return null;

    const records: Record<string, any> = {};
    reports.forEach(r => {
      const compositeKey = `${r.line || 'N/A'}|${r.buyer || 'N/A'}|${r.style || 'N/A'}|${r.color || 'N/A'}`;
      if (!records[compositeKey]) {
        records[compositeKey] = {
          line: r.line || 'N/A',
          buyer: r.buyer || 'N/A',
          style: r.style || 'N/A',
          color: r.color || 'N/A',
          processes: {}
        };
      }
      const group = records[compositeKey];
      
      r.processes?.forEach((p: any) => {
        const processKey = `${p.name}-${p.operatorId}`;
        if (!group.processes[processKey]) {
          group.processes[processKey] = {
            name: p.name,
            operatorName: p.operatorName,
            operatorId: p.operatorId,
            checkQty: 0,
            defectQty: 0
          };
        }
        group.processes[processKey].checkQty += Number(p.checkQty || 0);
        group.processes[processKey].defectQty += Number(p.defectQty || 0);
      });
    });

    return Object.values(records).map(r => ({
      ...r,
      processes: Object.values(r.processes)
    })).sort((a, b) => a.line.localeCompare(b.line));
  }, [reports, filters.reportType]);

  const getTopDefects = (defects: any[]) => {
    return [...defects]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 3);
  };

  const activeDefects = useMemo(() => {
    const active = new Set<string>();
    lineSummaryData.forEach((line: any) => {
      Object.keys(line.defects).forEach(defect => {
        if (line.defects[defect] > 0) active.add(defect);
      });
    });
    return SEWING_DEFECTS.filter(d => active.has(d));
  }, [lineSummaryData]);

  return (
    <div className="space-y-8">
      {/* Visual Filter Menu System */}
      <div className="space-y-6">
        {/* Section & Report Type Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section Selector */}
          <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="pb-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Department Section</Label>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'Sewing', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { id: 'Template', icon: LayoutGrid, color: 'text-purple-600', bg: 'bg-purple-50' },
                  { id: 'Cutting', icon: Scissors, color: 'text-orange-600', bg: 'bg-orange-50' },
                ].map((sec) => (
                  <motion.button
                    key={sec.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFilters(prev => ({ ...prev, section: sec.id as Section }))}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-300 border-2",
                      filters.section === sec.id 
                        ? "bg-slate-900 border-slate-900 text-white shadow-lg scale-105" 
                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                    )}
                  >
                    <sec.icon className={cn("h-6 w-6", filters.section === sec.id ? "text-white" : sec.color)} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{sec.id}</span>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Report Type Selector */}
          <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="pb-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Report Type</Label>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'DHU', label: 'DHU Report', icon: FileBarChart, color: 'text-red-600' },
                  { id: 'RFT', label: 'RFT Report', icon: TrendingUp, color: 'text-emerald-600' },
                  { id: 'Needle Point Analysis', label: 'Needle Point', icon: Activity, color: 'text-indigo-600' },
                  { id: 'Day Final Report', label: 'Day Final', icon: ClipboardCheck, color: 'text-slate-900' },
                ].map((type) => (
                  <motion.button
                    key={type.id}
                    whileHover={!(filters.section === 'Cutting' && type.id !== 'DHU') ? { scale: 1.02 } : {}}
                    whileTap={!(filters.section === 'Cutting' && type.id !== 'DHU') ? { scale: 0.98 } : {}}
                    disabled={filters.section === 'Cutting' && type.id !== 'DHU'}
                    onClick={() => setFilters(prev => ({ ...prev, reportType: type.id as ReportType }))}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 border-2 text-left",
                      filters.reportType === type.id 
                        ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200",
                      filters.section === 'Cutting' && type.id !== 'DHU' ? "opacity-30 cursor-not-allowed" : ""
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      filters.reportType === type.id ? "bg-white/20" : "bg-slate-50"
                    )}>
                      <type.icon className={cn("h-4 w-4", filters.reportType === type.id ? "text-white" : type.color)} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{type.label}</span>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Filters: Date, Floor, Line */}
        <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Date</Label>
                </div>
                <Input 
                  type="date" 
                  name="date" 
                  value={filters.date} 
                  onChange={handleFilterChange} 
                  className="bg-slate-50 border-none h-12 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900" 
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="h-3 w-3 text-slate-400" />
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Floor Selection</Label>
                </div>
                <Select 
                  name="floor" 
                  value={filters.floor} 
                  onChange={handleFilterChange} 
                  className="bg-slate-50 border-none h-12 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">All Floors</option>
                  <option value="Modhumoti Floor">Modhumoti Floor</option>
                  <option value="Ichamoti Floor">Ichamoti Floor</option>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Selection</Label>
                </div>
                <Select 
                  name="line" 
                  value={filters.line} 
                  onChange={handleFilterChange} 
                  className="bg-slate-50 border-none h-12 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                  disabled={!filters.floor || filters.reportType === 'Day Final Report'}
                >
                  <option value="">All Lines</option>
                  {filters.floor === 'Modhumoti Floor' && Array.from({ length: 7 }, (_, i) => (
                    <option key={i} value={`Mdmt-${i + 1}`}>Mdmt-{i + 1}</option>
                  ))}
                  {filters.floor === 'Ichamoti Floor' && Array.from({ length: 7 }, (_, i) => (
                    <option key={i} value={`Icmt-${i + 1}`}>Icmt-{i + 1}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">View Mode</Label>
                </div>
                <Select 
                  value={filters.section === 'Cutting' ? cuttingViewMode : summaryViewMode} 
                  onChange={(e) => {
                    const val = e.target.value as 'Daily' | 'Weekly' | 'Monthly';
                    if (filters.section === 'Cutting') setCuttingViewMode(val);
                    else setSummaryViewMode(val);
                  }}
                  className="bg-slate-50 border-none h-12 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                >
                  <option value="Daily">Daily View</option>
                  <option value="Weekly">Weekly View</option>
                  <option value="Monthly">Monthly View</option>
                </Select>
              </div>

              <div className="lg:col-span-1">
                {filters.section !== 'Cutting' && filters.reportType === 'DHU' ? (
                  <Button
                    variant={showLineSummary ? "primary" : "outline"}
                    onClick={() => setShowLineSummary(!showLineSummary)}
                    className={cn(
                      "h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest gap-2 w-full",
                      showLineSummary ? "bg-slate-900 text-white border-slate-900 shadow-lg" : "border-2 border-slate-200 text-slate-600"
                    )}
                  >
                    <Activity className="h-4 w-4" />
                    {showLineSummary ? "Hide Line Summary" : "Show Line Summary"}
                  </Button>
                ) : (
                  <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl text-white h-12">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/50 leading-none">Records</span>
                      <span className="text-lg font-black leading-none">{reports.length}</span>
                    </div>
                    <div className="bg-white/20 p-1.5 rounded-lg">
                      <Search className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Calendar at Top */}
      <FullCalendar 
        selectedDate={filters.date} 
        onDateSelect={(date) => setFilters(prev => ({ ...prev, date }))} 
      />

      {/* Needle Point Analysis View */}
      {filters.reportType === 'Needle Point Analysis' && reports.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Activity className="h-32 w-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-3 rounded-xl">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                  Needle Point <span className="text-indigo-600">Analysis</span>
                </h2>
              </div>
            </div>
          </div>

          <ExpandableTableWrapper title="Needle Point Analysis" icon={Activity}>
            {(isExpanded) => (
              <table className={cn("w-full border-collapse table-auto", isExpanded ? "text-xs" : "text-[10px]")}>
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Line No.</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Buyer</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Style</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Color</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Process Name</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Operator Info</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Check Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Defect Qty</th>
                    <th className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>RFT %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {needlePointSummaryData?.map((report, rIdx) => (
                    <React.Fragment key={rIdx}>
                      {report.processes?.map((process: any, pIdx: number) => {
                        const rftPercent = process.checkQty > 0 ? ((process.checkQty - process.defectQty) / process.checkQty) * 100 : 0;
                        return (
                          <tr key={`${rIdx}-${pIdx}`} className="hover:bg-slate-50 transition-colors">
                            {pIdx === 0 && (
                              <>
                                <td className={cn("border border-slate-200 font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")} rowSpan={report.processes.length || 1}>{report.line}</td>
                                <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")} rowSpan={report.processes.length || 1}>{report.buyer}</td>
                                <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")} rowSpan={report.processes.length || 1}>{report.style}</td>
                                <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")} rowSpan={report.processes.length || 1}>{report.color}</td>
                              </>
                            )}
                            <td className={cn("border border-slate-200 font-bold text-slate-900", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{process.name}</td>
                            <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-slate-900">{process.operatorName}</span>
                                <div className="flex items-center gap-2 text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                                  <span>ID: {process.operatorId}</span>
                                </div>
                              </div>
                            </td>
                            <td className={cn("border border-slate-200 text-center font-bold bg-yellow-50/30", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{process.checkQty}</td>
                            <td className={cn(
                              "border border-slate-200 text-center font-bold",
                              isExpanded ? "px-4 py-4" : "px-4 py-3",
                              process.defectQty > 0 ? "text-red-600 bg-red-50/30" : "text-emerald-600 bg-emerald-50/30"
                            )}>
                              {process.defectQty}
                            </td>
                            <td className={cn("border border-slate-200 text-center font-black text-brand-600", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                              {rftPercent.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-black">
                  <tr>
                    <td colSpan={6} className={cn("text-right uppercase tracking-widest", isExpanded ? "text-xl px-6 py-6" : "text-lg px-4 py-4")}>Total</td>
                    <td className={cn("text-center border-l border-slate-700", isExpanded ? "text-xl px-6 py-6" : "text-lg px-4 py-4")}>
                      {reports.reduce((acc, curr) => acc + (curr.totalCheckQty || 0), 0)}
                    </td>
                    <td className={cn("text-center border-l border-slate-700 text-red-400", isExpanded ? "text-xl px-6 py-6" : "text-lg px-4 py-4")}>
                      {reports.reduce((acc, curr) => acc + (curr.totalDefectQty || 0), 0)}
                    </td>
                    <td className={cn("text-center border-l border-slate-700 text-emerald-400", isExpanded ? "text-xl px-6 py-6" : "text-lg px-4 py-4")}>
                      {reports.reduce((acc, curr) => acc + (curr.totalCheckQty || 0), 0) > 0 
                        ? (((reports.reduce((acc, curr) => acc + (curr.totalCheckQty || 0), 0) - reports.reduce((acc, curr) => acc + (curr.totalDefectQty || 0), 0)) / reports.reduce((acc, curr) => acc + (curr.totalCheckQty || 0), 1)) * 100).toFixed(1)
                        : '0.0'}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </ExpandableTableWrapper>
        </div>
      )}

      {/* RFT Summary Table - Perfectly Styled */}
      {filters.reportType === 'RFT' && reports.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <TrendingUp className="h-32 w-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="bg-brand-600 p-3 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                  {filters.reportType === 'RFT' ? 'RFT' : 'Needle Point'} <span className="text-brand-600">Performance</span>
                </h2>
              </div>
            </div>
          </div>

          <ExpandableTableWrapper title="RFT Performance" icon={TrendingUp}>
            {(isExpanded) => (
              <table className={cn("w-full border-collapse table-auto", isExpanded ? "text-xs" : "text-[10px]")}>
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Line No.</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Buyer</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Style</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Color</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Total check</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Qc Pass Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Defective Garments Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>No. Of Good Garments</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Defective Rate %</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>RFT %</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Target</th>
                    <th className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Variation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rftSummaryData?.map((floorGroup, fIdx) => (
                    <React.Fragment key={fIdx}>
                      {floorGroup.lines.map((line, lIdx) => {
                        const goodGarments = line.totalCheck - line.defectiveQty;
                        const defectiveRate = line.totalCheck > 0 ? (line.defectiveQty / line.totalCheck) * 100 : 0;
                        const rftPercent = line.totalCheck > 0 ? (goodGarments / line.totalCheck) * 100 : 0;
                        const target = 90;
                        const variation = rftPercent - target;

                        return (
                          <tr key={lIdx} className="hover:bg-slate-50 transition-colors">
                            <td className={cn("border border-slate-200 font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.line}</td>
                            <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.buyer}</td>
                            <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.style}</td>
                            <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.color}</td>
                            <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.totalCheck}</td>
                            <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.qcPassQty}</td>
                            <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{line.defectiveQty}</td>
                            <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{goodGarments}</td>
                            <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{Number(defectiveRate || 0).toFixed(1)}%</td>
                            <td className={cn("border border-slate-200 text-center font-black text-brand-600", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{Number(rftPercent || 0).toFixed(2)}%</td>
                            <td className={cn("border border-slate-200 text-center text-slate-400 font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{Number(target || 0).toFixed(2)}%</td>
                            <td className={cn(
                              "border border-slate-200 text-center font-bold",
                              isExpanded ? "px-4 py-4" : "px-4 py-3",
                              variation >= 0 ? "text-emerald-600" : "text-red-600"
                            )}>
                              {Number(variation || 0).toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                      {/* Sub Total Row */}
                      <tr className="bg-orange-100/50 font-black text-slate-900">
                        <td colSpan={4} className={cn("text-center uppercase tracking-widest", isExpanded ? "px-4 py-4" : "px-4 py-3")}>Sub Total ({floorGroup.floor})</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{floorGroup.subTotal.totalCheck}</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{floorGroup.subTotal.qcPassQty}</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{floorGroup.subTotal.defectiveQty}</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty}</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                          {Number(floorGroup.subTotal.totalCheck > 0 ? (floorGroup.subTotal.defectiveQty / floorGroup.subTotal.totalCheck) * 100 : 0).toFixed(2)}%
                        </td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                          {Number(floorGroup.subTotal.totalCheck > 0 ? ((floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty) / floorGroup.subTotal.totalCheck) * 100 : 0).toFixed(2)}%
                        </td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>90.00%</td>
                        <td className={cn(
                          "text-center border border-slate-200",
                          isExpanded ? "px-4 py-4" : "px-4 py-3",
                          ((floorGroup.subTotal.totalCheck > 0 ? ((floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty) / floorGroup.subTotal.totalCheck) * 100 : 0) - 90) >= 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {Number(((floorGroup.subTotal.totalCheck > 0 ? ((floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty) / floorGroup.subTotal.totalCheck) * 100 : 0) - 90)).toFixed(2)}%
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
                {/* Grand Total Row */}
                <tfoot className="bg-red-200/50 font-black text-slate-900">
                  <tr>
                    <td colSpan={4} className={cn("text-center uppercase tracking-widest", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>G. Total</td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0)}
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.qcPassQty, 0)}
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0)}
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {(rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)}
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {Number(((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0)).toFixed(2)}%
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>
                      {Number(((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? ((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0)).toFixed(2)}%
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4")}>90.00%</td>
                    <td className={cn(
                      "text-center border border-slate-200",
                      isExpanded ? "text-xl px-4 py-6" : "text-lg px-4 py-4",
                      (((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? ((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0) - 90) >= 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {Number((((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? ((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0) - 90)).toFixed(2)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </ExpandableTableWrapper>
        </div>
      )}

      {/* Day Final Report View */}
      {filters.reportType === 'Day Final Report' && reports.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <ClipboardCheck className="h-32 w-32" />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="bg-brand-600 p-3 rounded-xl">
                  <ClipboardCheck className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                  Day Final <span className="text-brand-600">Report</span>
                </h2>
              </div>
              
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                {(['Line-wise', 'Floor-wise'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDayFinalViewMode(mode)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      dayFinalViewMode === mode 
                        ? "bg-white text-slate-900 shadow-sm" 
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ExpandableTableWrapper title={`Day Final Report - ${dayFinalViewMode}`} icon={ClipboardCheck}>
            {(isExpanded) => dayFinalViewMode === 'Line-wise' ? (
              <table className={cn("w-full border-collapse table-auto", isExpanded ? "text-xs" : "text-[10px]")}>
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Line No.</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Buyer</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Style</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Color</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>QC Pass Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>20% Check Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Status</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Findings / Reason of failure</th>
                    <th className={cn("text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dayFinalSummary && Object.entries(dayFinalSummary.floorGroups).map(([floor, floorReports], fIdx) => (
                    <React.Fragment key={fIdx}>
                      {floorReports.map((report, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                          <td className={cn("border border-slate-200 font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.line}</td>
                          <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.buyer}</td>
                          <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.style}</td>
                          <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.color}</td>
                          <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.totalQcPassQty}</td>
                          <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{report.checkQty20}</td>
                          <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                            <Badge className={cn(
                              "font-black uppercase tracking-widest",
                              isExpanded ? "text-[10px] px-3 py-1" : "text-[8px] px-2 py-0.5",
                              report.status === 'Pass' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            )}>
                              {report.status}
                            </Badge>
                          </td>
                          <td className={cn("border border-slate-200 truncate", isExpanded ? "px-4 py-4 max-w-[300px]" : "px-4 py-3 max-w-[200px]")}>{report.findings || '-'}</td>
                          <td className={cn("border border-slate-200 truncate", isExpanded ? "px-4 py-4 max-w-[200px]" : "px-4 py-3 max-w-[150px]")}>{report.remark || '-'}</td>
                        </tr>
                      ))}
                      {/* Sub Total for Floor */}
                      <tr className="bg-orange-100/50 font-black text-slate-900">
                        <td colSpan={4} className={cn("text-center uppercase tracking-widest", isExpanded ? "px-4 py-4" : "px-4 py-3")}>Sub Total ({floor})</td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                          {floorReports.reduce((acc, curr) => acc + (Number(curr.totalQcPassQty) || 0), 0)}
                        </td>
                        <td className={cn("text-center border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                          {floorReports.reduce((acc, curr) => acc + (Number(curr.checkQty20) || 0), 0)}
                        </td>
                        <td colSpan={3} className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}></td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-red-200/50 font-black text-slate-900">
                  <tr>
                    <td colSpan={4} className={cn("text-center uppercase tracking-widest", isExpanded ? "px-6 py-6 text-xl" : "px-4 py-4 text-lg")}>G. Total</td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "px-6 py-6 text-xl" : "px-4 py-4 text-lg")}>
                      {reports.reduce((acc, curr) => acc + (Number(curr.totalQcPassQty) || 0), 0)}
                    </td>
                    <td className={cn("text-center border border-slate-200", isExpanded ? "px-6 py-6 text-xl" : "px-4 py-4 text-lg")}>
                      {reports.reduce((acc, curr) => acc + (Number(curr.checkQty20) || 0), 0)}
                    </td>
                    <td colSpan={3} className={cn("border border-slate-200", isExpanded ? "px-6 py-6" : "px-4 py-4")}></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className={cn("w-full border-collapse table-auto", isExpanded ? "text-xs" : "text-[10px]")}>
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Floor Name</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>No. of Lines</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Total Inspection</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Pass</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Fail</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Pass %</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Fail %</th>
                    <th className={cn("text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Reason of Failure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dayFinalSummary?.floorSummary.map((fs, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className={cn("border border-slate-200 font-black text-slate-900", isExpanded ? "px-4 py-4" : "px-4 py-4")}>{fs.floor}</td>
                      <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-4")}>{fs.lineCount}</td>
                      <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-4")}>{fs.totalInspection}</td>
                      <td className={cn("border border-slate-200 text-center text-emerald-600 font-black", isExpanded ? "px-4 py-4" : "px-4 py-4")}>{fs.pass}</td>
                      <td className={cn("border border-slate-200 text-center text-red-600 font-black", isExpanded ? "px-4 py-4" : "px-4 py-4")}>{fs.fail}</td>
                      <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 min-w-[60px] justify-center">
                          {fs.passPercent.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                        <Badge className="bg-red-100 text-red-700 text-[10px] font-black px-3 py-1 min-w-[60px] justify-center">
                          {fs.failPercent.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                        <div className="flex flex-wrap gap-1">
                          {fs.reasons.map((reason: string, rIdx: number) => (
                            <Badge key={rIdx} variant="outline" className="text-[10px] font-bold bg-red-50 text-red-700 border-red-100 px-3 py-1">
                              {reason}
                            </Badge>
                          ))}
                          {fs.reasons.length === 0 && <span className="text-slate-400 italic">No failures</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-black">
                  <tr>
                    <td className={cn("text-left uppercase tracking-widest", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Total Summary</td>
                    <td className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.lineCount, 0)}
                    </td>
                    <td className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.totalInspection, 0)}
                    </td>
                    <td className={cn("text-center text-emerald-400", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.pass, 0)}
                    </td>
                    <td className={cn("text-center text-red-400", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.fail, 0)}
                    </td>
                    <td className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {((dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.pass, 0) || 0) / (dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.totalInspection, 0) || 1) * 100).toFixed(2)}%
                    </td>
                    <td className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>
                      {((dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.fail, 0) || 0) / (dayFinalSummary?.floorSummary.reduce((acc, curr) => acc + curr.totalInspection, 0) || 1) * 100).toFixed(2)}%
                    </td>
                    <td className={isExpanded ? "px-4 py-4" : "px-4 py-4"}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </ExpandableTableWrapper>
        </div>
      )}

      {/* Cutting Summary View */}
      {filters.section === 'Cutting' && reports.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Scissors className="h-32 w-32" />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-3 rounded-xl">
                  <Scissors className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                  Cutting <span className="text-amber-600">Performance</span>
                </h2>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Range: {dateRangeText}</span>
              </div>
            </div>
          </div>

          <ExpandableTableWrapper title="Cutting Performance" icon={Scissors}>
            {(isExpanded) => (
              <table className={cn("w-full border-collapse table-auto", isExpanded ? "text-xs" : "text-[10px]")}>
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Line No.</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Buyer</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Style</th>
                    <th className={cn("border-r border-slate-700 text-left", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Color</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Check Qty</th>
                    <th className={cn("border-r border-slate-700 text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>Total Defects</th>
                    <th className={cn("text-center", isExpanded ? "px-4 py-4" : "px-4 py-4")}>DHU%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lineSummaryData.map((data: any, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className={cn("border border-slate-200 font-bold text-brand-600", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.lineName}</td>
                      <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.buyer}</td>
                      <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.style}</td>
                      <td className={cn("border border-slate-200", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.color}</td>
                      <td className={cn("border border-slate-200 text-center font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.totalCheck}</td>
                      <td className={cn("border border-slate-200 text-center text-red-600 font-bold", isExpanded ? "px-4 py-4" : "px-4 py-3")}>{data.totalDefects}</td>
                      <td className={cn("border border-slate-200 text-center", isExpanded ? "px-4 py-4" : "px-4 py-3")}>
                        <Badge className={cn(
                          "font-black uppercase tracking-widest justify-center",
                          isExpanded ? "text-xs px-4 py-1.5 min-w-[70px]" : "text-[10px] px-3 py-1 min-w-[50px]",
                          (data.dhu || 0) <= 5 ? "bg-emerald-100 text-emerald-700" : 
                          (data.dhu || 0) <= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {(data.dhu || 0).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ExpandableTableWrapper>
        </div>
      )}

      {/* Line Summary Table - Shown for DHU Reports */}
      {filters.section !== 'Cutting' && filters.reportType === 'DHU' && reports.length > 0 && showLineSummary && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Activity className="h-32 w-32" />
            </div>
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-3 rounded-xl transition-colors">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase transition-colors">
                    Line <span className="text-brand-600">Summary</span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <span>Floor: {filters.floor || 'All Floors'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <span>Period: {dateRangeText}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>Active Defects: {activeDefects.length}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-brand-50 px-3 py-1.5 rounded-full border border-brand-100 flex items-center gap-2 animate-pulse transition-colors">
                  <Search className="h-3 w-3 text-brand-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-brand-600">Click table to expand view</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-black">Avg DHU</p>
                  <p className={cn(
                    "text-3xl font-black tracking-tighter",
                    (lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0) / lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 1) * 100) > 10 ? "text-red-500" : "text-emerald-500"
                  )}>
                    {lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 0) > 0 
                      ? (lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0) / lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 1) * 100).toFixed(1) 
                      : '0.0'}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ExpandableTableWrapper 
            title="Line Summary" 
            icon={FileBarChart}
            renderFooter={(isExpanded, closeObj) => (
              <div className={cn(isExpanded ? "bg-slate-50 p-6 border-t border-slate-100 flex justify-between items-center shrink-0" : "grid grid-cols-2 md:grid-cols-4 gap-3 mt-4")}>
                {isExpanded ? (
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest bg-white px-2 py-1 rounded-md border border-slate-200 inline-block mb-1">Total Check</p>
                      <p className="text-2xl font-black text-slate-900">{reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-100 inline-block mb-1">Total Pass</p>
                      <p className="text-2xl font-black text-emerald-600">{reports.reduce((sum, r) => sum + getQcPassQty(r), 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-100 inline-block mb-1">Total Defects</p>
                      <p className="text-2xl font-black text-red-600">{reports.reduce((sum, r) => sum + (r.totalDefects || 0), 0)}</p>
                    </div>
                  </div>
                ) : (
                  [
                    { 
                      label: 'Total Check', 
                      value: reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0), 
                      icon: CheckCircle2, 
                      color: 'text-brand-600', 
                      bg: 'bg-white',
                      description: 'Total garments checked across all lines and tables.'
                    },
                    { 
                      label: 'Total Pass', 
                      value: reports.reduce((sum, r) => sum + getQcPassQty(r), 0), 
                      icon: Activity, 
                      color: 'text-emerald-600', 
                      bg: 'bg-white',
                      description: 'Total garments that passed quality control.'
                    },
                    { 
                      label: 'Total Defects', 
                      value: reports.reduce((sum, r) => sum + (r.totalDefects || 0), 0), 
                      icon: AlertTriangle, 
                      color: 'text-red-600', 
                      bg: 'bg-white',
                      description: 'Total number of defects found in checked garments.',
                      clickable: true 
                    },
                    { 
                      label: 'Avg DHU %', 
                      value: (reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0) > 0 
                        ? (reports.reduce((sum, r) => sum + (r.totalDefects || 0), 0) / Math.max(1, reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0))) * 100 
                        : 0).toFixed(1) + '%', 
                      icon: TrendingUp, 
                      color: 'text-white', 
                      bg: 'bg-brand-600',
                      description: 'Defects per Hundred Units (DHU) average.'
                    },
                  ].map((stat, i) => (
                    <Card 
                      key={i} 
                      onClick={() => !isExpanded && setSelectedSummaryStat(stat as any)}
                      className={cn(
                        "border-none shadow-sm overflow-hidden group transition-all duration-300 hover:shadow-xl hover:-translate-y-1", 
                        !isExpanded && "cursor-pointer active:scale-95",
                        stat.bg
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className={cn("p-2 rounded-xl shadow-sm", stat.bg === 'bg-brand-600' ? 'bg-white/20' : 'bg-slate-50 group-hover:bg-brand-50 transition-colors')}>
                            <stat.icon className={cn("h-5 w-5", stat.bg === 'bg-brand-600' ? 'text-white' : stat.color)} />
                          </div>
                          <Badge variant="secondary" className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5", stat.bg === 'bg-brand-600' ? 'bg-white/20 text-white border-none' : '')}>
                            {stat.label.split(' ')[1]}
                          </Badge>
                        </div>
                        <p className={cn("text-[10px] uppercase font-black tracking-widest mb-1", stat.bg === 'bg-brand-600' ? 'text-white/60' : 'text-slate-400')}>
                          {stat.label}
                        </p>
                        <p className={cn("text-2xl font-black data-value", stat.bg === 'bg-brand-600' ? 'text-white' : 'text-slate-900')}>
                          {stat.value}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
                {isExpanded && closeObj && (
                  <Button onClick={closeObj.close} className="bg-slate-900 text-white rounded-full px-8 py-6 font-black uppercase tracking-widest hover:bg-slate-800">
                    Close View
                  </Button>
                )}
              </div>
            )}
          >
            {(isExp) => renderSummaryTable(isExp)}
          </ExpandableTableWrapper>

          {/* Line Cards */}
          {filters.reportType === 'DHU' && lineCardData.length > 0 && (
            <div className="space-y-12">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Line <span className="text-brand-600">Summary</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {lineCardData.map((line: any) => (
                    <Card key={line.lineName} className="border-none shadow-lg rounded-2xl overflow-hidden bg-white hover:shadow-xl transition-all duration-300 flex flex-col">
                      <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-2xl font-black text-slate-900 leading-none">{line.lineName}</CardTitle>
                            <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{line.buyer} - {line.style}</p>
                          </div>
                          <Badge className={cn("px-2 py-1 text-sm font-black", line.dhu > 5 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                            {line.dhu.toFixed(1)}% DHU
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 flex flex-col gap-3 flex-1">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-slate-50 p-2 rounded-xl text-center">
                            <p className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Check</p>
                            <p className="text-xl font-black text-slate-900 leading-none">{line.totalCheck}</p>
                          </div>
                          <div className="bg-emerald-50 p-2 rounded-xl text-center">
                            <p className="text-[9px] uppercase font-black tracking-widest text-emerald-600/70 mb-0.5">Pass</p>
                            <p className="text-xl font-black text-emerald-700 leading-none">{line.totalPass}</p>
                          </div>
                          <div 
                            className="bg-red-50 p-2 rounded-xl text-center cursor-pointer hover:bg-red-100 transition-colors"
                            onClick={() => line.totalDefects > 0 && openDefectDetailsModal('line', line.lineName, 'All')}
                          >
                            <p className="text-[9px] uppercase font-black tracking-widest text-red-600/70 mb-0.5">Defect</p>
                            <p className="text-xl font-black text-red-700 leading-none">{line.totalDefects}</p>
                          </div>
                        </div>

                        <div className="flex-1">
                          <p className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1.5">Top 3 Defects</p>
                          <div className="space-y-1">
                            {line.top3Defects.map(([name, qty]: [string, number], idx: number) => (
                              <div 
                                key={idx} 
                                onClick={() => openDefectDetailsModal('line', line.lineName, name)}
                                className="flex justify-between items-center text-sm bg-slate-50 p-1.5 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                              >
                                <span className="font-bold text-slate-700 block truncate mr-2">{name}</span>
                                <span className="font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md shrink-0">{qty}</span>
                              </div>
                            ))}
                            {line.top3Defects.length === 0 && (
                              <p className="text-xs text-slate-400 italic">No defects recorded</p>
                            )}
                          </div>
                        </div>

                        <Button 
                          onClick={() => setSelectedLineDetails(line)}
                          className="w-full bg-slate-900 hover:bg-brand-600 text-white rounded-xl py-3 text-sm font-black uppercase tracking-widest transition-colors mt-auto"
                        >
                          Show Details
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Floor Cards */}
              {floorCardData && (
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Floor <span className="text-brand-600">Summary</span></h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[floorCardData.Modhumoti, floorCardData.Ichamoti, floorCardData.Combined].map((floor: any, idx: number) => (
                      <Card key={idx} className={cn("border-none shadow-lg rounded-2xl overflow-hidden flex flex-col", floor.name === 'Combined' ? 'bg-slate-900 text-white' : 'bg-white')}>
                        <CardHeader className={cn("p-3 border-b", floor.name === 'Combined' ? 'border-white/10' : 'border-slate-100 bg-slate-50/50')}>
                          <div className="flex justify-between items-center">
                            <CardTitle className={cn("text-2xl font-black leading-none", floor.name === 'Combined' ? 'text-white' : 'text-slate-900')}>{floor.name}</CardTitle>
                            <Badge className={cn("px-2 py-1 text-sm font-black", floor.dhu > 5 ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-400")}>
                              {floor.dhu.toFixed(1)}% DHU
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 flex flex-col gap-3 flex-1">
                          <div className="grid grid-cols-3 gap-2">
                            <div className={cn("p-2 rounded-xl text-center", floor.name === 'Combined' ? 'bg-white/5' : 'bg-slate-50')}>
                              <p className={cn("text-[9px] uppercase font-black tracking-widest mb-0.5", floor.name === 'Combined' ? 'text-white/50' : 'text-slate-400')}>Check</p>
                              <p className={cn("text-xl font-black leading-none", floor.name === 'Combined' ? 'text-white' : 'text-slate-900')}>{floor.totalCheck}</p>
                            </div>
                            <div className={cn("p-2 rounded-xl text-center", floor.name === 'Combined' ? 'bg-emerald-500/10' : 'bg-emerald-50')}>
                              <p className={cn("text-[9px] uppercase font-black tracking-widest mb-0.5", floor.name === 'Combined' ? 'text-emerald-400/70' : 'text-emerald-600/70')}>Pass</p>
                              <p className={cn("text-xl font-black leading-none", floor.name === 'Combined' ? 'text-emerald-400' : 'text-emerald-700')}>{floor.totalPass}</p>
                            </div>
                            <div 
                              className={cn("p-2 rounded-xl text-center cursor-pointer transition-colors", floor.name === 'Combined' ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-red-50 hover:bg-red-100')}
                              onClick={() => floor.totalDefects > 0 && openDefectDetailsModal('floor', floor.name, 'All')}
                            >
                              <p className={cn("text-[9px] uppercase font-black tracking-widest mb-0.5", floor.name === 'Combined' ? 'text-red-400/70' : 'text-red-600/70')}>Defect</p>
                              <p className={cn("text-xl font-black leading-none", floor.name === 'Combined' ? 'text-red-400' : 'text-red-700')}>{floor.totalDefects}</p>
                            </div>
                          </div>

                          <div className="flex-1">
                            <p className={cn("text-[9px] uppercase font-black tracking-widest mb-1.5", floor.name === 'Combined' ? 'text-white/50' : 'text-slate-400')}>Top 5 Defects</p>
                            <div className="space-y-1">
                              {floor.top5Defects.map(([name, qty]: [string, number], i: number) => (
                                <div 
                                  key={i} 
                                  onClick={() => openDefectDetailsModal('floor', floor.name, name)}
                                  className={cn("flex justify-between items-center text-sm p-1.5 rounded-lg cursor-pointer transition-colors", floor.name === 'Combined' ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100')}
                                >
                                  <span className={cn("font-bold block truncate mr-2", floor.name === 'Combined' ? 'text-slate-300' : 'text-slate-700')}>{name}</span>
                                  <span className={cn("font-black px-1.5 py-0.5 rounded-md shrink-0", floor.name === 'Combined' ? 'text-red-400 bg-red-500/20' : 'text-red-600 bg-red-50')}>{qty}</span>
                                </div>
                              ))}
                              {floor.top5Defects.length === 0 && (
                                <p className={cn("text-xs italic", floor.name === 'Combined' ? 'text-white/40' : 'text-slate-400')}>No defects recorded</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        {/* DHU Summary Cards */}
        {showDetailedAnalysis && filters.reportType === 'DHU' && floorLineAnalysis && (
          <div className="space-y-8">
            {/* Global/Floor Analysis Card */}
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-slate-900 text-white">
              <CardHeader className="p-8 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter">Floor <span className="text-brand-400">Analysis</span></h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Global performance overview</p>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase font-black">Total Check</p>
                      <p className="text-2xl font-black text-white">{floorLineAnalysis.globalStats.totalCheck}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase font-black">Total Pass</p>
                      <p className="text-2xl font-black text-emerald-400">{floorLineAnalysis.globalStats.totalPass}</p>
                    </div>
                    <div 
                      className="text-center cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => floorLineAnalysis.globalStats.totalDefects > 0 && openDefectDetailsModal('floor', 'Combined', 'All')}
                    >
                      <p className="text-[10px] text-slate-400 uppercase font-black">Total Defect</p>
                      <p className="text-2xl font-black text-red-500">{floorLineAnalysis.globalStats.totalDefects}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase font-black">Total DHU</p>
                      <p className="text-2xl font-black text-brand-400">
                        {floorLineAnalysis.globalStats.totalCheck > 0 
                          ? ((floorLineAnalysis.globalStats.totalDefects / floorLineAnalysis.globalStats.totalCheck) * 100).toFixed(1) 
                          : '0.0'}%
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Top 3 Defects Global */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-brand-400" />
                      Top 3 Defects (Global)
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(floorLineAnalysis.globalStats.defectCounts)
                        .sort((a: any, b: any) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([name, qty]: any, i) => (
                          <div 
                            key={i} 
                            onClick={() => openDefectDetailsModal('floor', 'Combined', name)}
                            className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                          >
                            <span className="text-sm font-bold">{name}</span>
                            <Badge className="bg-brand-400 text-slate-900 font-black">{qty}</Badge>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Top Operator Global */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-brand-400" />
                      Top Defect Maker (Global)
                    </h3>
                    {Object.entries(floorLineAnalysis.globalStats.operatorCounts)
                      .sort((a: any, b: any) => b[1].qty - a[1].qty)
                      .slice(0, 1)
                      .map(([id, data]: any) => (
                        <div key={id} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                          <p className="text-lg font-black text-white">{data.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">ID: {id} • Floor: {data.floor}</p>
                          <div className="mt-3 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400">Total Defects</span>
                            <span className="text-xl font-black text-brand-400">{data.qty}</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Floor-wise Top Operators */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-brand-400" />
                      Floor-wise Top Makers
                    </h3>
                    <div className="space-y-2">
                      {Object.values(floorLineAnalysis.floors).map((f: any) => {
                        const topOp = Object.entries(f.operatorCounts)
                          .sort((a: any, b: any) => (b[1] as any).qty - (a[1] as any).qty)[0];
                        if (!topOp) return null;
                        return (
                          <div key={f.name} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                            <div>
                              <p className="text-xs font-bold">{f.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{(topOp[1] as any).name}</p>
                            </div>
                            <Badge variant="outline" className="border-brand-400 text-brand-400 font-black">{(topOp[1] as any).qty}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Summary Cards */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {Object.values(floorLineAnalysis.floors).flatMap((f: any) => 
                Object.values(f.lines).map((l: any) => (
                  <Card key={`${f.name}-${l.name}`} className="border-none shadow-lg rounded-[2.5rem] overflow-hidden bg-white">
                    <CardHeader className="p-6 bg-slate-50 border-b border-slate-100">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-900 p-3 rounded-2xl shadow-lg">
                            <Activity className="h-6 w-6 text-brand-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-slate-900">Line: {l.name}</h3>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">
                              {l.buyer} / {l.style}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-black">Line DHU</p>
                          <p className={cn(
                            "text-2xl font-black",
                            (l.totalDefects / l.totalCheck * 100) > 10 ? "text-red-500" : "text-emerald-500"
                          )}>
                            {l.totalCheck > 0 ? (l.totalDefects / l.totalCheck * 100).toFixed(1) : '0.0'}%
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {/* Line Stats */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 p-3 rounded-2xl text-center">
                          <p className="text-[10px] text-slate-400 uppercase font-black">Check</p>
                          <p className="text-lg font-black text-slate-900">{l.totalCheck}</p>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-2xl text-center">
                          <p className="text-[10px] text-emerald-600 uppercase font-black">Pass</p>
                          <p className="text-lg font-black text-emerald-700">{l.totalPass}</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-2xl text-center">
                          <p className="text-[10px] text-red-600 uppercase font-black">Defects</p>
                          <p className="text-lg font-black text-red-700">{l.totalDefects}</p>
                        </div>
                      </div>

                      {/* Hourly Breakdown */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Hourly Breakdown
                        </h4>
                        <div className="space-y-4">
                          {Object.values(l.hourly).sort((a: any, b: any) => a.hour.localeCompare(b.hour)).map((h: any) => {
                            const top3Defects = Object.entries(h.defectSummary)
                              .sort((a: any, b: any) => (b[1] as any) - (a[1] as any))
                              .slice(0, 3);
                            const mostFreqDefect = top3Defects[0]?.[0];

                            return (
                              <div key={h.hour} className="bg-slate-50 rounded-3xl p-5 border border-slate-100 space-y-4">
                                <div className="flex justify-between items-center">
                                  <Badge className="bg-slate-900 text-white font-black px-4 py-1 rounded-full">{h.hour}</Badge>
                                  <div className="flex gap-4 text-[10px] font-black uppercase">
                                    <span className="text-slate-400">Check: <span className="text-slate-900">{h.checkQty}</span></span>
                                    <span className="text-emerald-500">Pass: <span className="text-emerald-700">{h.passQty}</span></span>
                                    <span className="text-red-500">DHU: <span className="text-red-700">{(h.totalDefects / h.checkQty * 100).toFixed(1)}%</span></span>
                                  </div>
                                </div>

                                {/* Top 3 Defects for this hour */}
                                <div className="flex flex-wrap gap-2">
                                  {top3Defects.map(([name, qty]: any, idx) => (
                                    <Badge key={idx} variant="outline" className={cn(
                                      "font-bold text-[10px] uppercase px-3 py-1 rounded-lg",
                                      name === mostFreqDefect ? "bg-red-100 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-600"
                                    )}>
                                      {name}: {qty}
                                    </Badge>
                                  ))}
                                </div>

                                {/* Detailed Defect List for this hour */}
                                <div className="space-y-2">
                                  {h.defects.map((d: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className={cn(
                                            "text-sm font-black",
                                            d.name === mostFreqDefect ? "text-red-600" : "text-slate-800"
                                          )}>{d.name}</p>
                                          {d.name === mostFreqDefect && <Badge className="bg-red-500 text-white text-[8px] h-4 px-1.5 font-black uppercase">Most Frequent</Badge>}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                          {d.operation} • {d.operatorName} (#{d.operatorId})
                                        </p>
                                      </div>
                                      <Badge variant="secondary" className="font-black text-sm">{d.qty}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
        </div>
      )}

      {/* Results List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-900" />
            Reports <span className="text-slate-400 font-normal lowercase">for</span> {format(new Date(filters.date), 'MMM dd, yyyy')}
          </h3>
          <div className="flex items-center gap-2">
            {filters.reportType === 'DHU' && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                  className="font-black"
                >
                  {viewMode === 'table' ? 'Switch to Cards' : 'Switch to Table'}
                </Button>
                {selectedLine && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setSelectedLine(null)}
                    className="font-black"
                  >
                    Back to Summary
                  </Button>
                )}
              </>
            )}
            <Badge variant="secondary" className="rounded-lg px-4 py-1.5 font-black">{reports.length} Entries</Badge>
          </div>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-900 border-t-transparent"></div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Syncing with server...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border-2 border-dashed border-slate-200">
            <Search className="h-10 w-10 text-slate-300 mb-4" />
            <p className="text-slate-900 font-extrabold text-lg">No quality logs found</p>
            <p className="text-slate-400 text-sm mt-1">Adjust filters or record a new entry to see results.</p>
          </div>
        ) : filters.reportType === 'DHU' ? (
          selectedLine ? (
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl">
              <h2 className="text-3xl font-black text-slate-900 mb-6">Details for Line: {selectedLine.line}</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Check</p>
                    <p className="font-black text-xl text-slate-900">{selectedLine.totalCheckQty}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-2xl text-center border border-emerald-100">
                    <p className="text-[10px] text-emerald-600 uppercase font-black mb-1">Pass</p>
                    <p className="font-black text-xl text-emerald-700">{selectedLine.totalQcPassQty}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-2xl text-center border border-red-100">
                    <p className="text-[10px] text-red-600 uppercase font-black mb-1">Defects</p>
                    <p className="font-black text-xl text-red-700">{selectedLine.totalDefects}</p>
                  </div>
                </div>

                <div className="mt-8 border-t border-slate-100 pt-8">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Individual Records</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] table-auto border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 uppercase font-black border-b border-slate-200">
                           <th className="px-4 py-3 text-left">Buyer/Style</th>
                           <th className="px-4 py-3 text-center tracking-tighter">Check</th>
                           <th className="px-4 py-3 text-center tracking-tighter">Pass</th>
                           <th className="px-4 py-3 text-center tracking-tighter">Defects</th>
                           {isAdmin && <th className="px-4 py-3 text-center tracking-widest">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {reports.filter(r => r.line === selectedLine.line).map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3">
                               <p className="font-bold text-slate-900 leading-none mb-1">{r.buyer}</p>
                               <p className="text-[8px] text-slate-400 font-bold uppercase truncate max-w-[120px]">{r.style}</p>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-700">{r.totalCheckQty || r.checkQty}</td>
                            <td className="px-4 py-3 text-center font-bold text-emerald-600">{getQcPassQty(r)}</td>
                            <td className="px-4 py-3 text-center font-bold text-red-600">{r.totalDefects || 0}</td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex justify-center gap-1.5">
                                   <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} className="h-7 w-7 p-0 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition-all border border-transparent hover:border-brand-100">
                                      <Edit3 className="h-3 w-3" />
                                   </Button>
                                   <Button variant="ghost" size="sm" onClick={() => handleDeleteReport(r.id)} className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all border border-transparent hover:border-red-100">
                                      <Trash2 className="h-3 w-3" />
                                   </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {groupedReports?.map((group, i) => (
                <Card key={i} className="overflow-hidden border-none shadow-xl rounded-[2.5rem] bg-white group hover:shadow-2xl transition-all duration-500">
                  <CardHeader className="bg-slate-50 p-8 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-5">
                        <div className="bg-slate-900 p-4 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-500">
                          <Activity className="h-6 w-6 text-brand-400" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-2xl tracking-tighter">Line: {group.line}</h4>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1 bg-white px-2 py-0.5 rounded-full border border-slate-100 inline-block">
                            {group.buyer} / {group.style}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSelectedLine(group)} className="font-black">
                        Show Details
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full border-collapse text-[10px] table-auto">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 uppercase font-black tracking-widest">
                    <th className="px-4 py-3 border border-slate-200">Line</th>
                    <th className="px-4 py-3 border border-slate-200">Buyer</th>
                    <th className="px-4 py-3 border border-slate-200">Style</th>
                    <th className="px-4 py-3 border border-slate-200">Check Qty</th>
                    <th className="px-4 py-3 border border-slate-200">Pass Qty</th>
                    <th className="px-4 py-3 border border-slate-200">Defects</th>
                    <th className="px-4 py-3 border border-slate-200">DHU%</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedReports?.map((data, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 border border-slate-200 font-bold">{data.line}</td>
                      <td className="px-4 py-3 border border-slate-200 font-bold">{data.buyer}</td>
                      <td className="px-4 py-3 border border-slate-200 font-bold">{data.style}</td>
                      <td className="px-4 py-3 border border-slate-200 text-center font-bold">{data.totalCheckQty}</td>
                      <td className="px-4 py-3 border border-slate-200 text-center font-bold">{data.totalQcPassQty}</td>
                      <td className="px-4 py-3 border border-slate-200 text-center text-red-600 font-bold">{data.totalDefects}</td>
                      <td className="px-4 py-3 border border-slate-200 text-center">
                        <Badge className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-3 py-1 min-w-[50px] justify-center",
                          (data.dhuPercent || 0) <= 5 ? "bg-emerald-100 text-emerald-700" : 
                          (data.dhuPercent || 0) <= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {(data.dhuPercent || 0).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )) : null}
          </div>

      <AnimatePresence>
        {editingId && tempReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Edit <span className="text-brand-400">Record</span></h3>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">ID: {editingId}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="text-white hover:bg-white/10">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Buyer</Label>
                    <Input 
                      value={tempReport.buyer || ''} 
                      onChange={(e) => setTempReport({ ...tempReport, buyer: e.target.value })}
                      className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Style</Label>
                    <Input 
                      value={tempReport.style || ''} 
                      onChange={(e) => setTempReport({ ...tempReport, style: e.target.value })}
                      className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                  
                  {(tempReport.totalCheckQty !== undefined || tempReport.checkQty !== undefined) && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Check Qty</Label>
                      <Input 
                        type="number"
                        value={tempReport.totalCheckQty !== undefined ? tempReport.totalCheckQty : tempReport.checkQty} 
                        onChange={(e) => {
                           const val = Number(e.target.value);
                           if (tempReport.totalCheckQty !== undefined) setTempReport({ ...tempReport, totalCheckQty: val });
                           else setTempReport({ ...tempReport, checkQty: val });
                        }}
                        className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  )}

                  {(tempReport.qcPassQty !== undefined || tempReport.totalQcPassQty !== undefined) && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Pass Qty</Label>
                      <Input 
                        type="number"
                        value={tempReport.qcPassQty !== undefined ? tempReport.qcPassQty : tempReport.totalQcPassQty} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (tempReport.qcPassQty !== undefined) setTempReport({ ...tempReport, qcPassQty: val });
                          else setTempReport({ ...tempReport, totalQcPassQty: val });
                        }}
                        className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  )}

                  {tempReport.defectiveQty !== undefined && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Defective Qty</Label>
                      <Input 
                        type="number"
                        value={tempReport.defectiveQty} 
                        onChange={(e) => setTempReport({ ...tempReport, defectiveQty: Number(e.target.value) })}
                        className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  )}

                  {tempReport.checkQty20 !== undefined && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Check 20% Qty</Label>
                      <Input 
                        type="number"
                        value={tempReport.checkQty20} 
                        onChange={(e) => setTempReport({ ...tempReport, checkQty20: Number(e.target.value) })}
                        className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  )}

                  {tempReport.status && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Status</Label>
                      <select 
                        value={tempReport.status} 
                        onChange={(e) => setTempReport({ ...tempReport, status: e.target.value })}
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      >
                         <option value="Pass">Pass</option>
                         <option value="Fail">Fail</option>
                      </select>
                    </div>
                  )}
                </div>

                {tempReport.findings !== undefined && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Findings</Label>
                    <textarea 
                      value={tempReport.findings} 
                      onChange={(e) => setTempReport({ ...tempReport, findings: e.target.value })}
                      className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                    />
                  </div>
                )}
                
                {tempReport.remark !== undefined && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Remark</Label>
                    <textarea 
                      value={tempReport.remark} 
                      onChange={(e) => setTempReport({ ...tempReport, remark: e.target.value })}
                      className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                    />
                  </div>
                )}

                {tempReport.defects && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Defect Details</Label>
                    {tempReport.defects.map((d: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="col-span-2 space-y-1">
                          <p className="text-xs font-black text-slate-900">{d.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{d.operation}</p>
                        </div>
                        <Input 
                          type="number"
                          value={d.qty} 
                          onChange={(e) => {
                            const newDefects = [...tempReport.defects];
                            newDefects[idx].qty = Number(e.target.value);
                            const totalDefects = newDefects.reduce((sum, curr) => sum + Number(curr.qty || 0), 0);
                            setTempReport({ ...tempReport, defects: newDefects, totalDefects });
                          }}
                          className="h-10 bg-white border-slate-200 rounded-lg font-bold text-center"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                {isAdmin ? (
                  <Button 
                    variant="ghost" 
                    onClick={() => handleDeleteReport(editingId)} 
                    className="text-red-600 hover:bg-red-50 font-black uppercase tracking-widest text-xs"
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                  </Button>
                ) : <div />}
                
                <div className="flex gap-4">
                  <Button variant="ghost" onClick={() => setEditingId(null)} className="font-black uppercase tracking-widest text-xs">Cancel</Button>
                  <Button onClick={handleSave} disabled={loading} className="bg-slate-900 text-white px-8 h-12 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-slate-200">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedLineDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="bg-slate-900 p-8 text-white flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Line <span className="text-brand-400">Details</span></h3>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">{selectedLineDetails.lineName}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedLineDetails(null)} className="text-white hover:bg-white/10">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              
              <div className="flex border-b border-slate-100 bg-slate-50/50 shrink-0 overflow-x-auto">
                <button 
                  onClick={() => setLineModalTab('allDefects')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap", lineModalTab === 'allDefects' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  All Defects
                </button>
                <button 
                  onClick={() => setLineModalTab('hourly')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap", lineModalTab === 'hourly' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  Hourly Entry
                </button>
                <button 
                  onClick={() => setLineModalTab('top5')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap", lineModalTab === 'top5' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  Top 5 Defects
                </button>
                <button 
                  onClick={() => setLineModalTab('topOperators')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap", lineModalTab === 'topOperators' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  Top Defect Maker
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                {lineModalTab === 'allDefects' && (
                  <div className="space-y-4">
                    {selectedLineDetails.allDefectsList.map((d: any, idx: number) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => openDefectDetailsModal('line', selectedLineDetails.lineName, d.name)}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-bold text-slate-700 block">{d.name}</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{d.operation} • {d.operator}</span>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Search className="h-4 w-4 text-brand-500" />
                          </div>
                        </div>
                        <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg text-lg shrink-0">{d.qty}</span>
                      </div>
                    ))}
                    {selectedLineDetails.allDefectsList.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-bold">No defects recorded.</p>
                      </div>
                    )}
                  </div>
                )}

                {lineModalTab === 'hourly' && (
                  <div className="space-y-6">
                    {selectedLineDetails.hourlyList.map((h: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-lg font-black text-slate-900">{h.hour}</h4>
                          <Badge className={cn("px-3 py-1 text-sm font-black", h.dhu > 5 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                            {h.dhu.toFixed(1)}% DHU
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="bg-white p-3 rounded-xl text-center shadow-sm">
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Check</p>
                            <p className="text-lg font-black text-slate-900">{h.check}</p>
                          </div>
                          <div className="bg-emerald-50 p-3 rounded-xl text-center shadow-sm">
                            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-600/70 mb-1">Pass</p>
                            <p className="text-lg font-black text-emerald-700">{h.pass}</p>
                          </div>
                          <div className="bg-red-50 p-3 rounded-xl text-center shadow-sm">
                            <p className="text-[10px] uppercase font-black tracking-widest text-red-600/70 mb-1">Defect</p>
                            <p className="text-lg font-black text-red-700">{h.defects}</p>
                          </div>
                        </div>
                        {Object.keys(h.defectDetails).length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-3">Defects Recorded</p>
                            <div className="space-y-2">
                              {Object.entries(h.defectDetails).map(([name, data]: [string, any], i: number) => (
                                <div key={i} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl shadow-sm">
                                  <div>
                                    <span className="font-bold text-slate-700 block">{name}</span>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{data.operation} • {data.operator}</span>
                                  </div>
                                  <span className="font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-md">{data.qty}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Operations</p>
                            <p className="text-xs font-bold text-slate-700">{h.operations || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Operators</p>
                            <p className="text-xs font-bold text-slate-700">{h.operators || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selectedLineDetails.hourlyList.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-bold">No hourly data available.</p>
                      </div>
                    )}
                  </div>
                )}

                {lineModalTab === 'top5' && (
                  <div className="space-y-4">
                    {selectedLineDetails.top5Defects.map(([name, qty]: [string, number], idx: number) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => openDefectDetailsModal('line', selectedLineDetails.lineName, name)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                            #{idx + 1}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-700 block">{name}</span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Search className="h-4 w-4 text-brand-500" />
                            </div>
                          </div>
                        </div>
                        <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg text-lg shrink-0">{qty}</span>
                      </div>
                    ))}
                    {selectedLineDetails.top5Defects.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-bold">No defects recorded.</p>
                      </div>
                    )}
                  </div>
                )}

                {lineModalTab === 'topOperators' && (
                  <div className="space-y-4">
                    {selectedLineDetails.sortedOperators.map(([operator, qty]: [string, number], idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                            #{idx + 1}
                          </div>
                          <span className="font-bold text-slate-700 block">{operator}</span>
                        </div>
                        <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg text-lg shrink-0">{qty} defects</span>
                      </div>
                    ))}
                    {selectedLineDetails.sortedOperators.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-bold">No operators recorded.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSummaryStat && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className={cn("p-8 text-white relative overflow-hidden", selectedSummaryStat.bg === 'bg-brand-600' ? 'bg-brand-600' : 'bg-slate-900')}>
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <selectedSummaryStat.icon className="h-32 w-32" />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                      <selectedSummaryStat.icon className="h-8 w-8 text-white" />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSummaryStat(null)} className="text-white hover:bg-white/10 rounded-full h-10 w-10 p-0">
                      <X className="h-6 w-6" />
                    </Button>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/60 mb-1">{selectedSummaryStat.label}</h3>
                  <p className="text-6xl font-black tracking-tighter mb-4">{selectedSummaryStat.value}</p>
                  <p className="text-white/80 text-sm leading-relaxed max-w-[80%]">{selectedSummaryStat.description}</p>
                </div>
              </div>
              <div className="p-8 bg-slate-50">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Report Date</span>
                    <span className="font-black text-slate-900">{filters.date}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Section</span>
                    <span className="font-black text-slate-900">{filters.section}</span>
                  </div>
                  {selectedSummaryStat.label === 'Total Defects' && (
                    <Button 
                      onClick={() => {
                        setSelectedSummaryStat(null);
                        openDefectDetailsModal('floor', 'Combined', 'All');
                      }}
                      className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-2xl py-4 font-black uppercase tracking-widest shadow-lg shadow-brand-200"
                    >
                      View Defect Analysis
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {selectedDefectDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">
                    {selectedDefectDetails.defectName === 'All' ? 'All Defects' : selectedDefectDetails.defectName} <span className="text-brand-400">Details</span>
                  </h3>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">
                    {selectedDefectDetails.type === 'line' ? 'Line' : 'Floor'}: {selectedDefectDetails.name} • Total Qty: {selectedDefectDetails.totalQty}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDefectDetails(null)} className="text-white hover:bg-white/10">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              
              <div className="flex border-b border-slate-100 bg-slate-50/50 shrink-0">
                <button 
                  onClick={() => setDefectModalTab('combined')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors", defectModalTab === 'combined' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  Combined
                </button>
                <button 
                  onClick={() => setDefectModalTab('processes')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors", defectModalTab === 'processes' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  By Process
                </button>
                <button 
                  onClick={() => setDefectModalTab('operators')}
                  className={cn("flex-1 py-4 px-4 text-xs font-black uppercase tracking-widest transition-colors", defectModalTab === 'operators' ? "text-brand-600 border-b-2 border-brand-600 bg-white" : "text-slate-400 hover:text-slate-600")}
                >
                  By Operator
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                {defectModalTab === 'combined' && (
                  <div className="space-y-3">
                    {(selectedDefectDetails as any).combined?.length > 0 ? (
                      (selectedDefectDetails as any).combined.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-sm">{item.operator}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{item.process}</p>
                            </div>
                          </div>
                          <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg">{item.qty}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-400 py-8 italic">No combined data available.</p>
                    )}
                  </div>
                )}

                {defectModalTab === 'processes' && (
                  <div className="space-y-3">
                    {selectedDefectDetails.processes.length > 0 ? (
                      selectedDefectDetails.processes.map(([process, qty], idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                              {idx + 1}
                            </div>
                            <span className="font-bold text-slate-700">{process}</span>
                          </div>
                          <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg">{qty}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-400 py-8 italic">No process data available.</p>
                    )}
                  </div>
                )}

                {defectModalTab === 'operators' && (
                  <div className="space-y-3">
                    {selectedDefectDetails.operators.length > 0 ? (
                      selectedDefectDetails.operators.map(([operator, qty], idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs shrink-0">
                              {idx + 1}
                            </div>
                            <span className="font-bold text-slate-700">{operator}</span>
                          </div>
                          <span className="font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg">{qty}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-400 py-8 italic">No operator data available.</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
