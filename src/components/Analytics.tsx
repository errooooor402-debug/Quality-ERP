import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { collection, query, getDocs, where, limit, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { 
  BarChart3, 
  Calendar, 
  ChevronRight, 
  Maximize2, 
  TrendingUp, 
  Users, 
  AlertCircle,
  LayoutGrid,
  Scissors,
  Activity,
  ClipboardList,
  Filter,
  ArrowRight,
  ChevronDown,
  Clock,
  User as UserIcon,
  Search,
  Download,
  PieChart,
  Target,
  FileSpreadsheet,
  ChevronLeft,
  FileText,
  Edit2,
  Trash2,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  ComposedChart, 
  Area, 
  AreaChart,
  Cell
} from 'recharts';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Select, Input, Label } from './ui/Base';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  getWeek, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  addDays, 
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths
} from 'date-fns';
import { cn } from '../lib/utils';
import { 
  DhuReport, 
  CuttingReport, 
  DayFinalReport, 
  Section,
  Defect
} from '../types';
import { DEFECT_CATEGORIES, SEWING_DEFECTS, CUTTING_DEFECTS, FLOORS, LINES } from '../constants';
import * as XLSX from 'xlsx';

type Period = 'daily' | 'weekly' | 'monthly';
type SectionType = 'Sewing' | 'Cutting' | 'Template' | 'Finishing';
type ReportTypeStr = 'DHU' | 'RFT' | 'Needle Point Analysis' | 'Day Final Report';

export default function Analytics({ user, userProfile }: { user: any, userProfile: any }) {
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com';
  const [activeSection, setActiveSection] = useState<SectionType>('Sewing');
  const [reportType, setReportType] = useState<ReportTypeStr>('DHU');
  const [period, setPeriod] = useState<Period>('daily');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<string | null>(null);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [summaryReportType, setSummaryReportType] = useState<'combined' | 'modhumoti' | 'ichamoti' | 'line'>('combined');
  const [operationFilter, setOperationFilter] = useState<string>('All Operations');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempReport, setTempReport] = useState<any>(null);

  const [selectedDefectFilter, setSelectedDefectFilter] = useState<{
    name: string;
    date?: string;
    floor?: string;
    line?: string;
  } | null>(null);

  const handleEdit = (report: any) => {
    setEditingId(report.id);
    setTempReport({ ...report });
  };

  const handleSave = async () => {
    if (!editingId || !tempReport) return;
    setLoading(true);
    try {
      let collName = 'dhuReports';
      if (activeSection === 'Cutting') collName = 'cuttingReports';
      if (activeSection === 'Sewing') {
        if (reportType === 'RFT') collName = 'rftReports';
        if (reportType === 'Needle Point Analysis') collName = 'needlePointAnalyses';
        if (reportType === 'Day Final Report') collName = 'dayFinalReports';
      }

      await updateDoc(doc(db, collName, editingId), {
        ...tempReport,
        updatedAt: new Date().toISOString()
      });
      
      setEditingId(null);
      setTempReport(null);
    } catch (error) {
      console.error("Error saving report:", error);
      alert("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;
    
    setLoading(true);
    try {
      let collName = 'dhuReports';
      if (activeSection === 'Cutting') collName = 'cuttingReports';
      if (activeSection === 'Sewing') {
        if (reportType === 'RFT') collName = 'rftReports';
        if (reportType === 'Needle Point Analysis') collName = 'needlePointAnalyses';
        if (reportType === 'Day Final Report') collName = 'dayFinalReports';
      }
      
      await deleteDoc(doc(db, collName, reportId));
    } catch (error) {
      console.error("Error deleting report:", error);
      alert("Failed to delete report.");
    } finally {
      setLoading(false);
    }
  };

  // Reset report type when switching sections if the type isn't supported
  useEffect(() => {
    if (activeSection !== 'Sewing' && reportType !== 'DHU') {
      setReportType('DHU');
    }
  }, [activeSection]);

  // Date Range Calculation
  const dateRange = useMemo(() => {
    if (period === 'daily') {
      return { start: format(referenceDate, 'yyyy-MM-dd'), end: format(referenceDate, 'yyyy-MM-dd') };
    } else if (period === 'weekly') {
      const adjustedDate = subWeeks(referenceDate, 1);
      const start = startOfWeek(adjustedDate, { weekStartsOn: 6 });
      const end = endOfWeek(adjustedDate, { weekStartsOn: 6 });
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    } else {
      const start = startOfMonth(referenceDate);
      const end = endOfMonth(referenceDate);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
  }, [period, referenceDate]);

  useEffect(() => {
    setLoading(true);
    let collectionName = 'dhuReports';
    if (activeSection === 'Cutting') collectionName = 'cuttingReports';
    if (activeSection === 'Sewing') {
      if (reportType === 'RFT') collectionName = 'rftReports';
      if (reportType === 'Needle Point Analysis') collectionName = 'needlePointAnalyses';
      if (reportType === 'Day Final Report') collectionName = 'dayFinalReports';
    }
    
    let q = query(
      collection(db, collectionName),
      where('date', '>=', dateRange.start),
      where('date', '<=', dateRange.end),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (activeSection !== 'Cutting') {
        data = data.filter((r: any) => r.section === activeSection);
      }
      
      setReports(data);
      setLoading(false);
    }, (err) => {
      console.error("Fetch Analytics Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeSection, reportType, dateRange]);

  // Derived Statistics
  const stats = useMemo(() => {
    const totalChecked = reports.reduce((acc, r) => acc + (r.totalCheckQty || r.checkQty || 0), 0);
    const totalPass = reports.reduce((acc, r) => acc + (r.totalQcPassQty || r.qcPassQty || (r.checkQty - r.defectiveQty) || 0), 0);
    const totalDefects = reports.reduce((acc, r) => acc + (r.totalDefectQty || r.totalDefects || 0), 0);
    const dhu = totalChecked > 0 ? (totalDefects / totalChecked) * 100 : 0;
    
    // Top defects calculation
    const defectMap: Record<string, number> = {};
    reports.forEach(r => {
      if (r.defects) {
        r.defects.forEach((d: any) => {
          defectMap[d.name] = (defectMap[d.name] || 0) + d.qty;
        });
      } else if (r.processes) {
        r.processes.forEach((p: any) => {
           if (p.defectQty > 0) {
              defectMap[p.name] = (defectMap[p.name] || 0) + p.defectQty;
           }
        });
      }
    });
    const sortedDefects = Object.entries(defectMap).sort((a,b) => b[1] - a[1]);
    
    // Top Defect Makers
    const makerMap: Record<string, { qty: number, name: string, id: string }> = {};
    reports.forEach(r => {
      if (r.defects) {
        r.defects.forEach((d: any) => {
          if (d.operatorId) {
            if (!makerMap[d.operatorId]) {
              makerMap[d.operatorId] = { qty: d.qty, id: d.operatorId, name: d.operatorName || 'Unknown' };
            } else {
              makerMap[d.operatorId].qty += d.qty;
            }
          }
        });
      } else if (r.processes) {
        r.processes.forEach((p: any) => {
           if (p.operatorId && p.defectQty > 0) {
              if (!makerMap[p.operatorId]) {
                 makerMap[p.operatorId] = { qty: p.defectQty, id: p.operatorId, name: p.operatorName };
              } else {
                 makerMap[p.operatorId].qty += p.defectQty;
              }
           }
        });
      }
    });
    const sortedMakers = Object.values(makerMap).sort((a,b) => b.qty - a.qty);

    // Dynamic Active Defects for columns
    const activeDefects = sortedDefects.filter(([_, qty]) => qty > 0).map(([name]) => name);

    return { totalChecked, totalPass, totalDefects, dhu, sortedDefects, sortedMakers, activeDefects };
  }, [reports, reportType]);

  // Weekly Date-wise and Line-wise Summaries
  const weeklySummaries = useMemo(() => {
    if (period !== 'weekly' || reportType !== 'DHU' || activeSection !== 'Sewing') return null;

    const days = eachDayOfInterval({
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end)
    });

    const activeDefects = stats.activeDefects;

    const calculateForFloor = (floorName: string | 'Combined') => {
      return days.map(day => {
        const dStr = format(day, 'yyyy-MM-dd');
        const dayReports = reports.filter(r => {
          const dateMatch = r.date === dStr;
          const floorMatch = floorName === 'Combined' ? true : r.floor === floorName;
          const opMatch = operationFilter === 'All Operations' ? true : r.operationName === operationFilter;
          return dateMatch && floorMatch && opMatch;
        });
        
        const checked = dayReports.reduce((acc, r) => acc + (r.totalCheckQty || r.checkQty || 0), 0);
        const pass = dayReports.reduce((acc, r) => acc + (r.qcPassQty || (r.checkQty - r.defectiveQty) || 0), 0);
        const defects = dayReports.reduce((acc, r) => acc + (r.totalDefects || 0), 0);
        
        const defectCounts: Record<string, number> = {};
        activeDefects.forEach(dName => {
          defectCounts[dName] = dayReports.reduce((acc, r) => {
            const d = r.defects?.find((def: any) => def.name === dName);
            return acc + (d ? Number(d.qty || 0) : 0);
          }, 0);
        });

        return { 
          date: dStr, 
          dayName: format(day, 'EEEE'),
          checked, 
          pass, 
          defects, 
          defectCounts,
          dhu: checked > 0 ? (defects / checked) * 100 : 0 
        };
      });
    };

    const modhumoti = calculateForFloor('Modhumoti Floor');
    const ichamoti = calculateForFloor('Ichamoti Floor');
    const combinedDateWise = calculateForFloor('Combined');

    const lineWise = Array.from(new Set(reports.map(r => r.line))).filter(Boolean).sort().map(line => {
      const lineReports = reports.filter(r => {
        const lineMatch = r.line === line;
        const opMatch = operationFilter === 'All Operations' ? true : r.operationName === operationFilter;
        return lineMatch && opMatch;
      });
      const checked = lineReports.reduce((acc, r) => acc + (r.totalCheckQty || r.checkQty || 0), 0);
      const pass = lineReports.reduce((acc, r) => acc + (r.qcPassQty || (r.checkQty - r.defectiveQty) || 0), 0);
      const defects = lineReports.reduce((acc, r) => acc + (r.totalDefects || 0), 0);
      
      const defectCounts: Record<string, number> = {};
      activeDefects.forEach(dName => {
        defectCounts[dName] = lineReports.reduce((acc, r) => {
          const d = r.defects?.find((def: any) => def.name === dName);
          return acc + (d ? Number(d.qty || 0) : 0);
        }, 0);
      });

      return { 
        line, 
        checked, 
        pass, 
        defects, 
        defectCounts,
        dhu: checked > 0 ? (defects / checked) * 100 : 0 
      };
    });

    return { modhumoti, ichamoti, combinedDateWise, lineWise, activeDefects };
  }, [reports, period, reportType, activeSection, dateRange, stats.activeDefects]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    // Trend Data
    const dailyMap: Record<string, { date: string, dhu: number, checked: number, defects: number }> = {};
    reports.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, dhu: 0, checked: 0, defects: 0 };
      dailyMap[r.date].checked += (r.totalCheckQty || r.checkQty || 0);
      dailyMap[r.date].defects += (r.totalDefects || 0);
    });
    const trend = Object.values(dailyMap)
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(d => ({ 
        name: format(parseISO(d.date), period === 'daily' ? 'HH:mm' : 'MMM dd'),
        dhu: d.checked > 0 ? (d.defects / d.checked) * 100 : 0
      }));

    // Pareto Data
    const pareto = stats.sortedDefects.slice(0, 10).map(([name, qty]) => ({ name, qty }));

    // Available Operations list for filter
    const availableOperations = Array.from(new Set(reports.map(r => r.operationName).filter(Boolean))).sort() as string[];

    return { trend, pareto, availableOperations };
  }, [reports, stats, period]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(reports.map(r => ({
      Date: r.date,
      Line: r.line,
      Buyer: r.buyer || 'N/A',
      Style: r.style || 'N/A',
      'Check Qty': r.totalCheckQty || r.checkQty,
      'Pass Qty': r.qcPassQty || (r.checkQty - r.defectiveQty),
      'Total Defects': r.totalDefects || 0,
      'DHU %': ((r.totalDefects / (r.totalCheckQty || r.checkQty)) * 100 || 0).toFixed(2)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics");
    XLSX.writeFile(wb, `Analytics_${activeSection}_${dateRange.start}.xlsx`);
  };

  const getResponsibleForDefect = (defectFilter: { name: string, date?: string, floor?: string, line?: string } | string | null) => {
    if (!defectFilter) return [];
    
    const filterObj = typeof defectFilter === 'string' ? { name: defectFilter } : defectFilter;
    const res: Record<string, any> = {};
    
    reports.forEach(r => {
      // Apply filters if provided
      if (filterObj.date && r.date !== filterObj.date) return;
      if (filterObj.floor && r.floor !== filterObj.floor) return;
      if (filterObj.line && r.line !== filterObj.line) return;

      r.defects?.forEach((d: any) => {
        if (d.name === filterObj.name && d.operatorId) {
          if (!res[d.operatorId]) res[d.operatorId] = { name: d.operatorName, qty: d.qty, line: r.line, operation: d.operation, operatorId: d.operatorId };
          else res[d.operatorId].qty += d.qty;
        }
      });
    });
    return Object.values(res).sort((a,b) => b.qty - a.qty);
  };

  const changeDate = (direction: 'prev' | 'next') => {
    if (period === 'daily') {
      setReferenceDate(direction === 'prev' ? subDays(referenceDate, 1) : addDays(referenceDate, 1));
    } else if (period === 'weekly') {
      setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1));
    } else {
      setReferenceDate(direction === 'prev' ? subMonths(referenceDate, 1) : addMonths(referenceDate, 1));
    }
  };

  return (
    <div className="space-y-8 pb-32">
      {/* 1. SECTION NAVIGATION & PERIOD SELECTOR */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
           <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex gap-2 overflow-x-auto p-1 scrollbar-none">
                {(['Sewing', 'Cutting', 'Template', 'Finishing'] as SectionType[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setActiveSection(s)}
                    className={cn(
                      "px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      activeSection === s ? "bg-slate-900 text-white shadow-xl shadow-slate-200" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
                {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
           </div>
           
           {activeSection === 'Sewing' && (
             <div className="flex gap-2 overflow-x-auto p-1 scrollbar-none">
               {(['DHU', 'RFT', 'Needle Point Analysis', 'Day Final Report'] as ReportTypeStr[]).map(t => (
                 <button
                   key={t}
                   onClick={() => setReportType(t)}
                   className={cn(
                     "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                     reportType === t 
                      ? "bg-brand-600 text-white" 
                      : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                   )}
                 >
                   {t}
                 </button>
               ))}
             </div>
           )}
        </div>

        {/* DATE CONTROL */}
        <div className="flex items-center justify-between px-2">
           <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => changeDate('prev')} className="h-10 w-10 rounded-xl bg-white shadow-sm border-slate-200">
                 <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[180px]">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Observation Period</p>
                 <div className="relative group">
                    <h2 className="text-lg font-black text-slate-900 tracking-tight cursor-pointer flex items-center justify-center gap-2">
                       {period === 'daily' ? format(referenceDate, 'EEEE, MMM dd yyyy') :
                        period === 'weekly' ? `Week ${getWeek(subWeeks(referenceDate, 1))}, ${format(subWeeks(referenceDate, 1), 'yyyy')}` :
                        format(referenceDate, 'MMMM yyyy')}
                       <Calendar className="h-4 w-4 text-brand-500 group-hover:scale-110 transition-transform" />
                    </h2>
                    <input 
                      type="date" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => e.target.value && setReferenceDate(new Date(e.target.value))}
                    />
                 </div>
              </div>
              <Button variant="outline" size="icon" onClick={() => changeDate('next')} className="h-10 w-10 rounded-xl bg-white shadow-sm border-slate-200">
                 <ChevronRight className="h-4 w-4" />
              </Button>
           </div>
           <div className="flex gap-3">
              {chartData.availableOperations.length > 0 && (
                <Select 
                  value={operationFilter} 
                  onChange={(e) => setOperationFilter(e.target.value)}
                  className="min-w-[150px] shadow-sm rounded-xl h-10 text-[10px] font-black uppercase"
                >
                  <option value="All Operations">All Processes</option>
                  {chartData.availableOperations.map(op => <option key={op} value={op}>{op}</option>)}
                </Select>
              )}
              <Button variant="secondary" onClick={handleExport} className="gap-2.5 shadow-sm rounded-xl">
                 <FileSpreadsheet className="h-4 w-4" /> Export Report
              </Button>
              <Button 
                variant={showRawLogs ? "primary" : "outline"} 
                onClick={() => setShowRawLogs(!showRawLogs)} 
                className={cn("gap-2.5 shadow-sm rounded-xl", showRawLogs && "bg-slate-900 text-white border-slate-900")}
              >
                 <ClipboardList className="h-4 w-4" /> {showRawLogs ? 'Hide Details' : 'View Audit Logs'}
              </Button>
           </div>
        </div>
      </div>

      {/* 2. DYNAMIC QUALITY MONITOR (TABLE FIRST) */}
      <Card className="border-none shadow-2xl overflow-hidden bg-white rounded-[2rem]">
         <CardHeader className="bg-slate-900 text-white p-8 relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
               <Maximize2 className="h-32 w-32" />
            </div>
            <div className="flex justify-between items-center relative z-10">
               <div className="space-y-1">
                  <Badge className="bg-brand-500 text-white border-none font-black text-[10px] px-3 mb-2 uppercase tracking-widest">{reportType} Visualization</Badge>
                  <CardTitle className="text-2xl font-black uppercase tracking-tighter italic">Dynamic <span className="text-brand-400">Quality Monitor</span></CardTitle>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {reportType === 'DHU' ? 'Showing only active defects to maintain data clarity' : `Detailed ${reportType} tracking`}
                  </p>
               </div>
               <div className="flex items-center gap-3">
                  <Badge className="bg-white/10 text-white border-white/20 font-black text-[10px] px-4 py-2">RECORDS: {reports.length}</Badge>
               </div>
            </div>
         </CardHeader>
         <CardContent className="p-0 overflow-x-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-8 py-3 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                {operationFilter === 'All Operations' ? 'Composite Process Analysis' : `${operationFilter} Process Specific`}
              </span>
              <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest">
                Data Precision: High
              </span>
            </div>
            <table className="w-full text-left border-collapse table-auto">
               <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                     <th className="px-3 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Group</th>
                     {reportType === 'DHU' && (
                       <>
                         <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Check</th>
                         <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Pass</th>
                         {stats.activeDefects.map(d => (
                            <th 
                              key={d} 
                              onClick={() => setSelectedDefect(d)}
                              className="px-1 py-10 text-[7px] font-black text-slate-400 uppercase tracking-tight text-center border-r hover:bg-slate-100 cursor-pointer transition-colors [writing-mode:vertical-rl] rotate-180 bg-slate-50/50"
                            >
                              {d}
                            </th>
                         ))}
                         <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Defects</th>
                         <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">DHU %</th>
                       </>
                     )}
                     {(reportType === 'RFT' || reportType === 'Needle Point Analysis') && (
                        <>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Check Qty</th>
                           <th className="px-6 py-10 text-[10px] font-black text-slate-500 uppercase tracking-widest border-r text-center">QC Pass</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Defect</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Rectify</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">RFT %</th>
                        </>
                     )}
                     {reportType === 'Day Final Report' && (
                        <>
                           <th className="px-6 py-10 text-[10px] font-black text-slate-500 uppercase tracking-widest border-r text-center">QC Pass</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">20%</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Stat</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Findings</th>
                           <th className="px-2 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Rem</th>
                        </>
                     )}
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const grouped: Record<string, any> = {};
                    reports
                      .filter(r => operationFilter === 'All Operations' ? true : r.operationName === operationFilter)
                      .forEach(r => {
                      const key = period === 'daily' ? (r.line || 'Global') : (r.date);
                      if (!grouped[key]) {
                        grouped[key] = { 
                          key, check: 0, pass: 0, defects: 0, details: {}, rectify: 0, 
                          check20: 0, status: 'Pass', findings: [], remarks: []
                        };
                      }
                      
                      if (reportType === 'DHU') {
                        grouped[key].check += (r.totalCheckQty || r.checkQty || 0);
                        grouped[key].pass += (r.qcPassQty || (r.checkQty - r.defectiveQty) || 0);
                        grouped[key].defects += (r.totalDefects || 0);
                        r.defects?.forEach((d: any) => {
                          grouped[key].details[d.name] = (grouped[key].details[d.name] || 0) + d.qty;
                        });
                      } else if (reportType === 'RFT' || reportType === 'Needle Point Analysis') {
                        grouped[key].check += (r.checkQty || r.totalCheckQty || 0);
                        grouped[key].pass += (r.qcPassQty || 0);
                        grouped[key].defects += (r.defectiveQty || r.totalDefectQty || 0);
                        grouped[key].rectify += (r.rectifyQty || 0);
                      } else if (reportType === 'Day Final Report') {
                        grouped[key].pass += (r.totalQcPassQty || 0);
                        grouped[key].check20 += (r.checkQty20 || 0);
                        if (r.status === 'Fail') grouped[key].status = 'Fail';
                        if (r.findings) grouped[key].findings.push(r.findings);
                        if (r.remark) grouped[key].remarks.push(r.remark);
                      }
                    });
                    
                    return Object.values(grouped).sort((a,b) => a.key.localeCompare(b.key)).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-4 text-[10px] font-black text-slate-900 border-r">{row.key}</td>
                        {reportType === 'DHU' && (
                          <>
                            <td className="px-2 py-4 text-[10px] font-bold text-slate-900 border-r text-center bg-slate-50/20">{row.check}</td>
                            <td className="px-2 py-4 text-[10px] font-bold text-emerald-600 border-r text-center">{row.pass}</td>
                            {stats.activeDefects.map(d => (
                              <td key={d} className="px-1 py-4 text-[8px] text-center border-r font-medium text-slate-500">
                                 {row.details[d] || ''}
                              </td>
                            ))}
                            <td className="px-2 py-4 text-[10px] font-black text-red-600 border-r text-center bg-red-50/20">{row.defects}</td>
                            <td className="px-2 py-4 text-[10px] text-center font-black">
                               <span className={cn(
                                 "px-2 py-1 rounded-lg",
                                 (row.defects / row.check * 100) < 5 ? "bg-emerald-100 text-emerald-700" :
                                 (row.defects / row.check * 100) < 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                               )}>
                                 {((row.defects / row.check * 100) || 0).toFixed(2)}%
                               </span>
                            </td>
                          </>
                        )}
                        {(reportType === 'RFT' || reportType === 'Needle Point Analysis') && (
                          <>
                            <td className="px-2 py-4 text-[10px] font-bold text-slate-900 border-r text-center">{row.check}</td>
                            <td className="px-2 py-4 text-[10px] font-bold text-emerald-600 border-r text-center">{row.pass}</td>
                            <td className="px-2 py-4 text-[10px] font-bold text-red-600 border-r text-center">{row.defects}</td>
                            <td className="px-2 py-4 text-[10px] font-bold text-amber-600 border-r text-center">{row.rectify}</td>
                            <td className="px-2 py-4 text-[10px] text-center font-black">
                               <span className={cn(
                                 "px-2 py-1 rounded-lg",
                                 (row.pass / row.check * 100) > 95 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                               )}>
                                 {((row.pass / row.check * 100) || 0).toFixed(2)}%
                               </span>
                            </td>
                          </>
                        )}
                        {reportType === 'Day Final Report' && (
                          <>
                             <td className="px-2 py-4 text-[10px] font-bold text-emerald-600 border-r text-center">{row.pass}</td>
                             <td className="px-2 py-4 text-[10px] font-bold text-blue-600 border-r text-center">{row.check20}</td>
                             <td className="px-2 py-4 text-center border-r">
                               <Badge className={cn("font-black text-[8px]", row.status === 'Pass' ? "bg-emerald-500" : "bg-red-500")}>
                                 {row.status}
                               </Badge>
                             </td>
                             <td className="px-2 py-4 text-[9px] text-slate-500 border-r max-w-[80px] truncate">{row.findings.join(', ') || '-'}</td>
                             <td className="px-2 py-4 text-[9px] text-slate-500 max-w-[80px] truncate">{row.remarks.join(', ') || '-'}</td>
                          </>
                        )}
                      </tr>
                    ));
                  })()}
               </tbody>
               {reportType !== 'Day Final Report' && (
                 <tfoot>
                    <tr className="bg-slate-900 text-white font-black">
                       <td className="px-6 py-5 text-sm uppercase tracking-widest border-r">Grand Total</td>
                       <td className="px-6 py-5 text-sm text-center border-r">{stats.totalChecked}</td>
                       <td className="px-6 py-5 text-sm text-center border-r">{stats.totalPass}</td>
                       {reportType === 'DHU' && (
                         <>
                            {stats.activeDefects.map(d => (
                               <td key={d} className="px-2 py-5 text-[10px] text-center border-r">
                                  {stats.sortedDefects.find(([name]) => name === d)?.[1]}
                               </td>
                            ))}
                            <td className="px-6 py-5 text-sm text-center border-r bg-white/10">{stats.totalDefects}</td>
                            <td className="px-6 py-5 text-sm text-center">{stats.dhu.toFixed(2)}%</td>
                         </>
                       )}
                       {(reportType === 'RFT' || reportType === 'Needle Point Analysis') && (
                          <>
                             <td className="px-6 py-5 text-sm text-center border-r text-red-400">{stats.totalDefects}</td>
                             <td className="px-6 py-5 text-sm text-center border-r text-amber-400">{reports.reduce((acc, r) => acc + (r.rectifyQty || 0), 0)}</td>
                             <td className="px-6 py-5 text-sm text-center">{(stats.totalPass / stats.totalChecked * 100 || 0).toFixed(2)}%</td>
                          </>
                       )}
                    </tr>
                 </tfoot>
               )}
            </table>
         </CardContent>
      </Card>

      {/* 2.5 WEEKLY ADVANCED SUMMARIES */}
      {period === 'weekly' && reportType === 'DHU' && activeSection === 'Sewing' && weeklySummaries && (
        <Card className="border-none shadow-xl overflow-hidden bg-white rounded-[2rem]">
          <CardHeader className="bg-brand-600 text-white p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <Badge className="bg-white/20 text-white border-none font-black text-[10px] px-3 mb-2 uppercase tracking-widest">Advanced Summary</Badge>
                <CardTitle className="text-2xl font-black uppercase tracking-tighter">Weekly <span className="text-brand-200">DHU Analysis</span></CardTitle>
                <p className="text-[10px] text-brand-100 font-bold uppercase tracking-widest">Strategic floor and line-wise performance matrix</p>
              </div>
              <div className="flex bg-brand-700/50 p-1.5 rounded-2xl border border-brand-500/30">
                {[
                  { id: 'combined', label: 'All Floors' },
                  { id: 'modhumoti', label: 'Modhumoti' },
                  { id: 'ichamoti', label: 'Ichamoti' },
                  { id: 'line', label: 'Line-wise' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSummaryReportType(opt.id as any)}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      summaryReportType === opt.id 
                        ? "bg-white text-brand-600 shadow-lg" 
                        : "text-brand-100 hover:text-white"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-hidden">
              {summaryReportType === 'line' ? (
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r">Line</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Check</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Pass</th>
                      {weeklySummaries.activeDefects.map(dName => (
                        <th key={dName} className="px-1 py-12 text-[7px] font-black text-slate-400 uppercase tracking-tight text-center border-r [writing-mode:vertical-rl] rotate-180 bg-slate-50/50">
                          {dName}
                        </th>
                      ))}
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Defects</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">DHU %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeklySummaries.lineWise.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-4 border-r">
                          <Badge className="bg-slate-900 text-white font-black text-[9px] px-2">{row.line}</Badge>
                        </td>
                        <td className="px-2 py-4 text-[10px] font-bold text-slate-900 border-r text-center">{row.checked}</td>
                        <td className="px-2 py-4 text-[10px] font-bold text-emerald-600 border-r text-center">{row.pass}</td>
                        {weeklySummaries.activeDefects.map(dName => (
                          <td 
                            key={dName} 
                            onClick={() => row.defectCounts[dName] > 0 && setSelectedDefectFilter({ name: dName, line: row.line })}
                            className={cn(
                              "px-1 py-4 text-[9px] text-center border-r font-medium",
                              row.defectCounts[dName] > 0 ? "text-slate-900 cursor-pointer hover:bg-slate-100 font-bold" : "text-slate-300"
                            )}
                          >
                            {row.defectCounts[dName] || ''}
                          </td>
                        ))}
                        <td className="px-2 py-4 text-[10px] font-bold text-red-600 border-r text-center">{row.defects}</td>
                        <td className="px-2 py-4 text-[10px] font-black text-center">
                          <span className={cn(
                            "px-2 py-1 rounded-lg",
                            row.dhu < 5 ? "bg-emerald-100 text-emerald-700" :
                            row.dhu < 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.dhu.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-black">
                    <tr>
                      <td className="px-3 py-4 text-[10px] uppercase tracking-widest">Total</td>
                      <td className="px-2 py-4 text-center text-[10px]">{weeklySummaries.lineWise.reduce((acc, r) => acc + r.checked, 0)}</td>
                      <td className="px-2 py-4 text-center text-[10px]">{weeklySummaries.lineWise.reduce((acc, r) => acc + r.pass, 0)}</td>
                      {weeklySummaries.activeDefects.map(dName => (
                        <td key={dName} className="px-1 py-4 text-[9px] text-center">
                          {weeklySummaries.lineWise.reduce((acc, r) => acc + (r.defectCounts[dName] || 0), 0) || ''}
                        </td>
                      ))}
                      <td className="px-2 py-4 text-center text-red-400 text-[10px]">{weeklySummaries.lineWise.reduce((acc, r) => acc + r.defects, 0)}</td>
                      <td className="px-2 py-4 text-center text-brand-400 text-[10px]">
                        {((weeklySummaries.lineWise.reduce((acc, r) => acc + r.defects, 0) / 
                           (weeklySummaries.lineWise.reduce((acc, r) => acc + r.checked, 0) || 1)) * 100).toFixed(2)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r">Date</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Check</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Pass</th>
                      {weeklySummaries.activeDefects.map(dName => (
                        <th key={dName} className="px-1 py-12 text-[7px] font-black text-slate-400 uppercase tracking-tight text-center border-r [writing-mode:vertical-rl] rotate-180 bg-slate-50/50">
                          {dName}
                        </th>
                      ))}
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest border-r text-center">Defects</th>
                      <th className="px-2 py-10 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">DHU %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const data = summaryReportType === 'combined' ? weeklySummaries.combinedDateWise :
                                 summaryReportType === 'modhumoti' ? weeklySummaries.modhumoti : weeklySummaries.ichamoti;
                      const floorFilter = summaryReportType === 'combined' ? undefined : 
                                       (summaryReportType === 'modhumoti' ? 'Modhumoti Floor' : 'Ichamoti Floor');
                      
                      return data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-4 border-r">
                            <p className="text-[10px] font-black text-slate-900">{row.date}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{row.dayName}</p>
                          </td>
                          <td className="px-2 py-4 text-[10px] font-bold text-slate-900 border-r text-center bg-slate-50/20">{row.checked}</td>
                          <td className="px-2 py-4 text-[10px] font-bold text-emerald-600 border-r text-center">{row.pass}</td>
                          {weeklySummaries.activeDefects.map(dName => (
                            <td 
                              key={dName} 
                              onClick={() => row.defectCounts[dName] > 0 && setSelectedDefectFilter({ name: dName, date: row.date, floor: floorFilter })}
                              className={cn(
                                "px-1 py-4 text-[9px] text-center border-r font-medium",
                                row.defectCounts[dName] > 0 ? "text-slate-900 cursor-pointer hover:bg-slate-100 font-bold" : "text-slate-300"
                              )}
                            >
                              {row.defectCounts[dName] || ''}
                            </td>
                          ))}
                          <td className="px-2 py-4 text-[10px] font-bold text-red-600 border-r text-center bg-red-50/20">{row.defects}</td>
                          <td className="px-2 py-4 text-[10px] text-center font-black">
                            <span className={cn(
                              "px-2 py-1 rounded-lg",
                              row.checked > 0 && row.dhu < 5 ? "bg-emerald-100 text-emerald-700" :
                              row.checked > 0 && row.dhu < 10 ? "bg-amber-100 text-amber-700" : 
                              row.checked > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-400"
                            )}>
                              {row.checked > 0 ? `${row.dhu.toFixed(2)}%` : 'No Data'}
                            </span>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-black">
                    {(() => {
                      const currentSummary = summaryReportType === 'combined' ? weeklySummaries.combinedDateWise :
                                           (summaryReportType === 'modhumoti' ? weeklySummaries.modhumoti : weeklySummaries.ichamoti);
                      const totalChecked = currentSummary.reduce((acc, r) => acc + r.checked, 0);
                      const totalPass = currentSummary.reduce((acc, r) => acc + r.pass, 0);
                      const totalDefects = currentSummary.reduce((acc, r) => acc + r.defects, 0);
                      return (
                        <tr>
                          <td className="px-3 py-4 uppercase tracking-widest border-r text-[10px]">Grand Total</td>
                          <td className="px-2 py-4 text-center border-r text-[10px]">{totalChecked}</td>
                          <td className="px-2 py-4 text-center border-r text-[10px]">{totalPass}</td>
                          {weeklySummaries.activeDefects.map(dName => (
                            <td key={dName} className="px-1 py-4 text-[9px] text-center border-r">
                              {currentSummary.reduce((acc, r) => acc + (r.defectCounts[dName] || 0), 0) || ''}
                            </td>
                          ))}
                          <td className="px-2 py-4 text-center border-r bg-white/10 text-[10px]">{totalDefects}</td>
                          <td className="px-2 py-4 text-center text-[10px]">
                            {((totalDefects / (totalChecked || 1)) * 100).toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. EXECUTIVE DASHBOARD (CHARTS SECOND) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* BIG STATS CARDS */}
        <div className="lg:col-span-1 space-y-6">
           {[
             { label: 'Quality Rating', value: `${(100 - stats.dhu).toFixed(1)}%`, icon: Target, color: 'text-emerald-600', trend: '+0.4%', description: 'Pass Percentage' },
             { label: 'Defect Volume', value: stats.totalDefects, icon: AlertCircle, color: 'text-red-600', trend: '-2.1%', description: 'Total Incidents' },
             { label: 'Check Capacity', value: stats.totalChecked, icon: Activity, color: 'text-brand-600', trend: '+12%', description: 'Total Verified' }
           ].map((stat, i) => (
             <Card key={i} className="border-none shadow-sm bg-white overflow-hidden group hover:scale-[1.02] transition-transform">
               <CardContent className="p-6">
                 <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-slate-100 transition-colors">
                       <stat.icon className={cn("h-6 w-6", stat.color)} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                       <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                    </div>
                 </div>
                 <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <span className="text-[10px] text-slate-400 font-bold italic">{stat.description}</span>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px]">{stat.trend}</Badge>
                 </div>
               </CardContent>
             </Card>
           ))}
        </div>

        {/* DYNAMIC CHARTS */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
           <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
             <CardHeader className="p-6 border-b border-slate-50 flex flex-row items-center justify-between">
                <div>
                   <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Performance Trend</CardTitle>
                   <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">DHU Analysis Line Chart</p>
                </div>
                <TrendingUp className="h-5 w-5 text-brand-500" />
             </CardHeader>
             <CardContent className="p-6 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={chartData.trend}>
                      <defs>
                         <linearGradient id="colorDhu" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                         </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} unit="%" />
                      <RechartsTooltip 
                         contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px'}}
                         itemStyle={{fontSize: '11px', fontWeight: 800}}
                      />
                      <Area type="monotone" dataKey="dhu" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorDhu)" dot={{fill: '#4f46e5', r: 4}} />
                   </AreaChart>
                </ResponsiveContainer>
             </CardContent>
           </Card>

           <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
             <CardHeader className="p-6 border-b border-slate-50 flex flex-row items-center justify-between">
                <div>
                   <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Defect Pareto</CardTitle>
                   <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Principle 80/20 Rule</p>
                </div>
                <PieChart className="h-5 w-5 text-brand-500" />
             </CardHeader>
             <CardContent className="p-6 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData.pareto} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 9, fontWeight: 700}} width={100} />
                      <RechartsTooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 5px 15px rgba(0,0,0,0.05)'}}
                      />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={15}>
                         {chartData.pareto.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index < 3 ? '#0f172a' : '#94a3b8'} />
                         ))}
                      </Bar>
                   </BarChart>
                </ResponsiveContainer>
             </CardContent>
           </Card>
        </div>
      </div>

      {/* 4. TOP LISTS (MAKERS & DEFECTS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {stats.sortedMakers.length > 0 && (
          <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="p-6 bg-slate-50">
              <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-400" />
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Critical Performers</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {stats.sortedMakers.slice(0, 5).map((maker, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                          {maker.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{maker.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ID: {maker.id}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <Badge className="bg-red-50 text-red-600 border-none font-black h-6">{maker.qty}</Badge>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">Impact</p>
                    </div>
                  </div>
              ))}
            </CardContent>
          </Card>
        )}

        {stats.sortedDefects.length > 0 && (
          <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="p-6 bg-slate-50">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-slate-400" />
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Top Defect Profile</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                {stats.sortedDefects.slice(0, 5).map(([name, qty], idx) => (
                  <div key={idx} className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-slate-700">{name}</span>
                        <span className="font-black text-slate-900">{qty}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(qty / stats.totalDefects) * 100}%` }}
                          className="h-full bg-slate-900 rounded-full"
                        />
                      </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="h-px bg-slate-100 my-8" />


      {/* 5. RAW AUDIT LOGS (Toggled) */}
      <AnimatePresence>
         {showRawLogs && (
           <motion.div
             initial={{ opacity: 0, height: 0 }}
             animate={{ opacity: 1, height: 'auto' }}
             exit={{ opacity: 0, height: 0 }}
             className="overflow-hidden"
           >
              <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden mt-8">
                 <CardHeader className="bg-slate-50 p-6 border-b border-slate-100 flex flex-row items-center justify-between">
                    <div>
                       <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Historical Audit Records</CardTitle>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Individual transaction details for traceability</p>
                    </div>
                    <FileText className="h-5 w-5 text-slate-400" />
                 </CardHeader>
                 <CardContent className="p-0">
                    <div className="overflow-x-hidden">
                       <table className="w-full text-left border-collapse">
                          <thead>
                             <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Ref</th>
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Line/Style</th>
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Metrics</th>
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Defect Profile</th>
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">DHU</th>
                                {isAdmin && <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>}
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                             {reports.map((r, i) => (
                                <tr key={r.id || i} className="hover:bg-slate-50/30 transition-colors">
                                   <td className="px-6 py-4">
                                      <p className="text-xs font-black text-slate-900">{r.date}</p>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{r.hourSlot || 'Shift Record'}</p>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div className="flex items-center gap-2 mb-1 border-brand-100">
                                         <Badge className="bg-slate-900 text-white border-none text-[9px] px-2 h-auto font-black italic">LN: {r.line}</Badge>
                                         <span className="text-xs font-black text-slate-700">{r.buyer}</span>
                                      </div>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{r.style}</p>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div className="flex gap-4">
                                         <div>
                                            <p className="text-[8px] text-slate-300 font-black uppercase">Chk</p>
                                            <p className="text-xs font-black text-slate-900">{r.totalCheckQty || r.checkQty}</p>
                                         </div>
                                         <div>
                                            <p className="text-[8px] text-slate-300 font-black uppercase">Def</p>
                                            <p className="text-xs font-black text-red-600">{r.totalDefects || r.defectiveQty || 0}</p>
                                         </div>
                                      </div>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div className="flex flex-wrap gap-1 max-w-[300px]">
                                         {r.defects?.map((d: any, di: number) => (
                                            <Badge key={di} variant="outline" className="text-[8px] h-auto py-0.5 border-slate-200 text-slate-500 font-bold">
                                               {d.name} ({d.qty})
                                            </Badge>
                                         ))}
                                         {(!r.defects || r.defects.length === 0) && <span className="text-[9px] text-emerald-500 font-bold italic">Flawless Check</span>}
                                      </div>
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                      <p className={cn(
                                        "text-xs font-black",
                                        (r.dhuPercent || (r.totalDefects / (r.totalCheckQty || r.checkQty) * 100) || 0) > 10 ? "text-red-600" : "text-emerald-600"
                                      )}>
                                        {Number(r.dhuPercent || (r.totalDefects / (r.totalCheckQty || r.checkQty) * 100) || 0).toFixed(1)}%
                                      </p>
                                   </td>
                                   {isAdmin && (
                                     <td className="px-6 py-4 text-center">
                                       <div className="flex items-center justify-center gap-2">
                                         <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} className="h-8 w-8 p-0 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                                           <Edit2 className="h-3.5 w-3.5" />
                                         </Button>
                                         <Button variant="ghost" size="sm" onClick={() => handleDeleteReport(r.id)} className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                           <Trash2 className="h-3.5 w-3.5" />
                                         </Button>
                                       </div>
                                     </td>
                                   )}
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </CardContent>
              </Card>
           </motion.div>
         )}
      </AnimatePresence>

      {/* EDIT MODAL */}
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
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                      className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
                
                {tempReport.remark !== undefined && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Remark</Label>
                    <textarea 
                      value={tempReport.remark} 
                      onChange={(e) => setTempReport({ ...tempReport, remark: e.target.value })}
                      className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
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

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4">
                <Button variant="ghost" onClick={() => setEditingId(null)} className="font-black uppercase tracking-widest text-xs">Cancel</Button>
                <Button onClick={handleSave} disabled={loading} className="bg-slate-900 text-white px-8 h-12 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-slate-200">
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DEFECT ATTRIBUTION MODAL */}
      <AnimatePresence>
        {(selectedDefect || selectedDefectFilter) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setSelectedDefect(null); setSelectedDefectFilter(null); }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
             <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
             >
                <div className="bg-slate-900 p-10 text-white relative">
                   <div className="absolute top-0 right-0 p-10 opacity-20">
                      <Users className="h-24 w-24" />
                   </div>
                   <div className="relative z-10">
                      <Badge className="bg-brand-500 text-white border-none text-[9px] font-black px-3 mb-4 uppercase tracking-widest">Root Cause attribution</Badge>
                      <h3 className="text-3xl font-black tracking-tighter italic">{selectedDefect || selectedDefectFilter?.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                         {selectedDefectFilter?.date && <Badge className="bg-white/10 text-brand-200 border-brand-500/30 text-[8px]">{selectedDefectFilter.date}</Badge>}
                         {selectedDefectFilter?.floor && <Badge className="bg-white/10 text-brand-200 border-brand-500/30 text-[8px] font-black">{selectedDefectFilter.floor}</Badge>}
                         {selectedDefectFilter?.line && <Badge className="bg-white/10 text-brand-200 border-brand-500/30 text-[8px]">LINE {selectedDefectFilter.line}</Badge>}
                      </div>
                   </div>
                   <button onClick={() => { setSelectedDefect(null); setSelectedDefectFilter(null); }} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full transition-colors">
                      <X className="h-6 w-6" />
                   </button>
                </div>
                <div className="p-10 space-y-4 max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                   {getResponsibleForDefect(selectedDefect || selectedDefectFilter).map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100 group hover:border-brand-200 transition-colors">
                         <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                               <UserIcon className="h-6 w-6 text-brand-600" />
                            </div>
                            <div>
                               <div className="flex items-center gap-2">
                                  <p className="text-base font-black text-slate-900">{p.name || 'Anonymous'}</p>
                                  <span className="text-[9px] font-bold text-slate-400">#{p.operatorId}</span>
                               </div>
                               <div className="flex gap-2 items-center mt-1">
                                  <Badge className="bg-slate-200 text-slate-600 border-none text-[8px] font-black h-4">LINE {p.line}</Badge>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{p.operation}</span>
                               </div>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-2xl font-black text-red-600">{p.qty}</p>
                            <p className="text-[9px] font-black text-slate-300 uppercase">Incidents</p>
                         </div>
                      </div>
                   ))}
                   {getResponsibleForDefect(selectedDefect || selectedDefectFilter).length === 0 && (
                      <div className="text-center py-12">
                         <Search className="h-10 w-10 text-slate-200 mx-auto mb-4" />
                         <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No specific attribution found for this selection</p>
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
