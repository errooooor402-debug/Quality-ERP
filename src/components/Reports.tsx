import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, limit, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';
import { Download, FileSpreadsheet, FileText, Calendar, Filter, TrendingUp, AlertTriangle, CheckCircle2, BarChart3, PieChart, MapPin, Search, BarChart2, Activity, Table, Save } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, Select, Badge, Label, Input } from './ui/Base';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { DEFECT_CATEGORIES, SEWING_DEFECTS } from '../constants';
import { ReportType } from '../types';

import FullCalendar from './ui/FullCalendar';

interface ReportsProps {
  user: User;
}

export default function Reports({ user }: ReportsProps) {
  const [loading, setLoading] = useState(true);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportType, setReportType] = useState<ReportType>('DHU');
  const [reports, setReports] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    setLoading(true);
    let startDate, endDate;
    const date = new Date(selectedDate);

    if (reportPeriod === 'daily') {
      startDate = selectedDate;
      endDate = selectedDate;
    } else if (reportPeriod === 'weekly') {
      const start = startOfWeek(date, { weekStartsOn: 6 }); // Saturday
      const end = endOfWeek(date, { weekStartsOn: 6 }); 
      startDate = format(start, 'yyyy-MM-dd');
      endDate = format(end, 'yyyy-MM-dd');
    } else {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      startDate = format(start, 'yyyy-MM-dd');
      endDate = format(end, 'yyyy-MM-dd');
    }

    const collName = 
      reportType === 'RFT' ? 'rftReports' : 
      reportType === 'Needle Point Analysis' ? 'needlePointAnalyses' : 
      reportType === 'Day Final Report' ? 'dayFinalReports' : 
      'dhuReports';

    const q = query(
      collection(db, collName),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedReports = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(fetchedReports);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, collName);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [reportPeriod, selectedDate]);

  // Data Processing for Charts
  const paretoData = useMemo(() => {
    const defectCounts: Record<string, number> = {};
    reports.forEach(r => {
      r.defects?.forEach((d: any) => {
        defectCounts[d.name] = (defectCounts[d.name] || 0) + d.qty;
      });
    });

    const sorted = Object.entries(defectCounts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    const total = sorted.reduce((sum, d) => sum + d.qty, 0);
    let cumulative = 0;

    return sorted.map(d => {
      cumulative += d.qty;
      return {
        ...d,
        percentage: (cumulative / total) * 100
      };
    });
  }, [reports]);

  const trendData = useMemo(() => {
    const dailyStats: Record<string, { check: number, defects: number }> = {};
    reports.forEach(r => {
      const dateStr = r.date;
      if (!dailyStats[dateStr]) dailyStats[dateStr] = { check: 0, defects: 0 };
      dailyStats[dateStr].check += r.totalCheckQty || 0;
      dailyStats[dateStr].defects += r.totalDefects || 0;
    });

    return Object.entries(dailyStats).map(([date, stats]) => ({
      date: format(new Date(date), 'MMM dd'),
      dhu: stats.check > 0 ? (stats.defects / stats.check) * 100 : 0
    }));
  }, [reports]);

  const linePerformanceData = useMemo(() => {
    const lineStats: Record<string, { check: number, defects: number }> = {};
    reports.forEach(r => {
      const line = r.line;
      if (!lineStats[line]) lineStats[line] = { check: 0, defects: 0 };
      lineStats[line].check += r.totalCheckQty || 0;
      lineStats[line].defects += r.totalDefects || 0;
    });

    return Object.entries(lineStats).map(([line, stats]) => ({
      line,
      dhu: stats.check > 0 ? (stats.defects / stats.check) * 100 : 0
    })).sort((a, b) => a.dhu - b.dhu);
  }, [reports]);

  const lineSummaryData = useMemo(() => {
    const summary: Record<string, any> = {};
    reports.forEach(r => {
      // Group by Line, Buyer, Style, and Color
      const compositeKey = `${r.line}-${r.buyer || 'N/A'}-${r.style || 'N/A'}-${r.color || 'N/A'}`;
      if (!summary[compositeKey]) {
        summary[compositeKey] = {
          lineName: r.line,
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
      s.qcPass += r.qcPassQty || 0;
      s.totalCheck += r.totalCheckQty || 0;
      s.totalDefects += r.totalDefects || 0;
      s.defectiveGarments += r.defectiveQty || 0; 

      r.defects?.forEach((d: any) => {
        s.defects[d.name] = (s.defects[d.name] || 0) + d.qty;
      });
    });

    return Object.values(summary).sort((a: any, b: any) => a.lineName.localeCompare(b.lineName));
  }, [reports]);

  const activeDefects = useMemo(() => {
    const defectSet = new Set<string>();
    reports.forEach(r => {
      r.defects?.forEach((d: any) => {
        if (d.qty > 0) defectSet.add(d.name);
      });
    });
    return SEWING_DEFECTS.filter(d => defectSet.has(d));
  }, [reports]);

  const rftSummaryData = useMemo(() => {
    if (reportType !== 'RFT' && reportType !== 'Needle Point Analysis') return null;

    const floors: Record<string, any[]> = {};
    reports.forEach(r => {
      const floor = r.floor || 'Unknown';
      if (!floors[floor]) floors[floor] = [];
      
      const checkQty = r.checkQty || r.totalCheckQty || 0;
      const defectiveQty = r.defectiveQty || r.totalDefectQty || 0;
      const qcPassQty = r.qcPassQty || (checkQty - defectiveQty);

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
  }, [reports, reportType]);

  const exportToExcel = () => {
    let dataToExport;
    if (reportType === 'RFT') {
      dataToExport = reports.map(r => {
        const goodGarments = (r.checkQty || 0) - (r.defectiveQty || 0);
        const rftPercent = (r.checkQty || 0) > 0 ? (goodGarments / r.checkQty) * 100 : 0;
        return {
          Date: r.date,
          Floor: r.floor || 'N/A',
          Line: r.line,
          Buyer: r.buyer || 'N/A',
          Style: r.style || 'N/A',
          Color: r.color || 'N/A',
          'Total Check': r.checkQty || 0,
          'QC Pass': r.qcPassQty || 0,
          'Defective Qty': r.defectiveQty || 0,
          'Good Garments': goodGarments,
          'RFT %': Number(rftPercent || 0).toFixed(2)
        };
      });
    } else if (reportType === 'Needle Point Analysis') {
      dataToExport = reports.map(r => ({
        Date: r.date,
        Line: r.line,
        Buyer: r.buyer || 'N/A',
        Style: r.style || 'N/A',
        Color: r.color || 'N/A',
        'Analysis Name': r.analysisName,
        'Total Check': r.totalCheckQty || 0,
        'Total Defects': r.totalDefectQty || 0,
        'RFT %': Number(r.rftPercent || 0).toFixed(2)
      }));
    } else {
      dataToExport = reports.map(r => ({
        Date: r.date,
        Line: r.line,
        Buyer: r.buyer || 'N/A',
        Style: r.style || 'N/A',
        Color: r.color || 'N/A',
        'Check Qty': r.totalCheckQty || 0,
        'QC Pass': r.qcPassQty || 0,
        'Total Defects': r.totalDefects || 0,
        'DHU %': Number(r.dhuPercent || 0).toFixed(2)
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${reportType} Report`);
    XLSX.writeFile(wb, `${reportType}_Report_${reportPeriod}_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-8">
      {/* Full Calendar at Top */}
      <FullCalendar selectedDate={selectedDate} onDateSelect={setSelectedDate} />

      {/* Report Controls */}
      <Card className="shadow-sm border-none bg-white/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-end gap-6">
              <div className="w-full sm:w-64 space-y-1">
                <Label className="flex items-center gap-2">
                  <Activity className="h-3 w-3 text-brand-500" /> Report Type
                </Label>
                <Tabs value={reportType} onValueChange={(v: any) => setReportType(v)} className="w-full">
                  <TabsList className="bg-white border border-slate-200 w-full overflow-x-auto flex-nowrap h-auto p-1">
                    <TabsTrigger value="DHU" className="flex-1 text-[10px] py-2">DHU</TabsTrigger>
                    <TabsTrigger value="RFT" className="flex-1 text-[10px] py-2">RFT</TabsTrigger>
                    <TabsTrigger value="Needle Point Analysis" className="flex-1 text-[10px] py-2">Needle</TabsTrigger>
                    <TabsTrigger value="Day Final Report" className="flex-1 text-[10px] py-2">Day Final</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="w-full sm:w-64 space-y-1">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-brand-500" /> Audit Period
                </Label>
                <Tabs value={reportPeriod} onValueChange={(v: any) => setReportPeriod(v)} className="w-full">
                  <TabsList className="bg-white border border-slate-200 w-full">
                    <TabsTrigger value="daily" className="flex-1">Daily</TabsTrigger>
                    <TabsTrigger value="weekly" className="flex-1">Weekly</TabsTrigger>
                    <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <div className="flex gap-3 ml-auto">
              <Button variant="secondary" onClick={exportToExcel} className="gap-2 shadow-sm">
                <FileSpreadsheet className="h-4 w-4" /> Export (.xlsx)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Line Summary Table - Shown First */}
      {(reportType === 'DHU' || reportType === 'Day Final Report') ? (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Activity className="h-32 w-32" />
            </div>
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-3 rounded-xl">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                    {reportType === 'DHU' ? 'Line' : 'Day Final'} <span className="text-brand-600">Summary</span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <span>Floor: {reports[0]?.floor || 'All Floors'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <span>Date: {reportPeriod === 'daily' ? format(new Date(selectedDate), 'dd MMM yyyy') : `${reportPeriod} report around ${format(new Date(selectedDate), 'dd MMM yyyy')}`}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[8px] table-auto">
                <thead>
                  {/* Main Header Categories */}
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th colSpan={4} className="px-1 py-2 border-r border-slate-700 text-left">General Info</th>
                    <th colSpan={2} className="px-1 py-2 border-r border-slate-700 text-center">Production</th>
                    <th colSpan={activeDefects.length} className="px-0.5 py-2 border-r border-slate-700 text-center">Defect Breakdown</th>
                    <th colSpan={2} className="px-1 py-2 text-center">Summary</th>
                  </tr>
                  {/* Sub Header - Defect Names */}
                  <tr className="bg-slate-100 text-slate-600 font-black uppercase tracking-widest">
                    <th className="px-1 py-1.5 border border-slate-200 text-left min-w-[30px]">Line</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-left max-w-[40px] truncate">Buyer</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-left max-w-[40px] truncate">Style</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-left max-w-[40px] truncate">Color</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-center bg-yellow-100/50">Check</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-center bg-yellow-100/50 border-r-2 border-r-slate-300">Pass</th>
                    
                    {activeDefects.map(name => (
                      <th key={name} className="px-0 py-2 border border-slate-200 min-w-[16px] h-[80px] relative">
                        <div className="vertical-text absolute inset-0 flex items-center justify-center whitespace-nowrap text-[7px]">
                          {name}
                        </div>
                      </th>
                    ))}

                    <th className="px-1 py-1.5 border border-slate-200 text-center bg-green-100/50 border-l-2 border-l-slate-300">Defects</th>
                    <th className="px-1 py-1.5 border border-slate-200 text-center bg-green-100/50">DHU%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lineSummaryData.map((line: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-1 py-1 border border-slate-200 font-black text-slate-900 bg-slate-50">{line.lineName}</td>
                      <td className="px-1 py-1 border border-slate-200 max-w-[40px] truncate text-slate-500 font-bold">{line.buyer}</td>
                      <td className="px-1 py-1 border border-slate-200 max-w-[40px] truncate text-slate-500 font-bold">{line.style}</td>
                      <td className="px-1 py-1 border border-slate-200 max-w-[40px] truncate text-slate-500 font-bold">{line.color}</td>
                      <td className="px-1 py-1 border border-slate-200 text-center font-black bg-yellow-50/30">{line.totalCheck}</td>
                      <td className="px-1 py-1 border border-slate-200 text-center font-black bg-yellow-50/30 border-r-2 border-r-slate-300">{line.qcPass}</td>
                      
                      {activeDefects.map(name => (
                        <td 
                          key={name} 
                          className={cn(
                            "px-0.5 py-1 border border-slate-100 text-center font-bold",
                            line.defects[name] > 0 ? "bg-red-50 text-red-600" : "text-slate-200"
                          )}
                        >
                          {line.defects[name] || ''}
                        </td>
                      ))}

                      <td className="px-1 py-1 border border-slate-200 text-center font-black bg-green-50/30 border-l-2 border-l-slate-300">{line.totalDefects}</td>
                      <td className={cn(
                        "px-1 py-1 border border-slate-200 text-center font-black bg-green-50/30",
                        (line.totalCheck > 0 ? (line.totalDefects / line.totalCheck * 100) : 0) > 10 ? "text-red-600" : "text-emerald-600"
                      )}>
                        {Number(line.totalCheck > 0 ? (line.totalDefects / line.totalCheck * 100) : 0).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black">
                    <td colSpan={4} className="px-1 py-2 text-right uppercase tracking-widest">Total</td>
                    <td className="px-1 py-2 text-center border-l border-slate-700">{lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 0)}</td>
                    <td className="px-1 py-2 text-center border-l border-slate-700 border-r-2 border-r-slate-600">{lineSummaryData.reduce((sum: number, l: any) => sum + l.qcPass, 0)}</td>
                    
                    {activeDefects.map(name => (
                      <td key={name} className="px-0.5 py-2 text-center border-l border-slate-700">
                        {lineSummaryData.reduce((sum: number, l: any) => sum + (l.defects[name] || 0), 0) || ''}
                      </td>
                    ))}

                    <td className="px-1 py-2 text-center border-l-2 border-l-slate-600">{lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0)}</td>
                    <td className="px-1 py-2 text-center border-l border-slate-700 text-emerald-400">
                      {Number(lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 0) > 0 
                        ? (lineSummaryData.reduce((sum: number, l: any) => sum + l.totalDefects, 0) / lineSummaryData.reduce((sum: number, l: any) => sum + l.totalCheck, 1) * 100) 
                        : 0).toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : (
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
                  {reportType === 'RFT' ? 'RFT' : 'Needle Point'} <span className="text-brand-600">Performance</span>
                </h2>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px] table-auto">
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <th className="px-4 py-3 border-r border-slate-700 text-left">Line No.</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-left">Buyer</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-left">Style</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-left">Color</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">Total check</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">Qc Pass Qty</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">Defective Garments Qty</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">No. Of Good Garments</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">Defective Rate %</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">RFT %</th>
                    <th className="px-4 py-3 border-r border-slate-700 text-center">Target</th>
                    <th className="px-4 py-3 text-center">Variation</th>
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
                            <td className="px-4 py-2 border border-slate-200 font-bold">{line.line}</td>
                            <td className="px-4 py-2 border border-slate-200">{line.buyer}</td>
                            <td className="px-4 py-2 border border-slate-200">{line.style}</td>
                            <td className="px-4 py-2 border border-slate-200">{line.color}</td>
                            <td className="px-4 py-2 border border-slate-200 text-center font-bold">{line.totalCheck}</td>
                            <td className="px-4 py-2 border border-slate-200 text-center">{line.qcPassQty}</td>
                            <td className="px-4 py-2 border border-slate-200 text-center">{line.defectiveQty}</td>
                            <td className="px-4 py-2 border border-slate-200 text-center font-bold">{goodGarments}</td>
                            <td className="px-4 py-2 border border-slate-200 text-center">{Number(defectiveRate || 0).toFixed(1)}%</td>
                            <td className="px-4 py-2 border border-slate-200 text-center font-black text-brand-600">{Number(rftPercent || 0).toFixed(2)}%</td>
                            <td className="px-4 py-2 border border-slate-200 text-center text-slate-400 font-bold">{Number(target || 0).toFixed(2)}%</td>
                            <td className={cn(
                              "px-4 py-2 border border-slate-200 text-center font-bold",
                              variation >= 0 ? "text-emerald-600" : "text-red-600"
                            )}>
                              {Number(variation || 0).toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                      {/* Sub Total Row */}
                      <tr className="bg-orange-100/50 font-black text-slate-900">
                        <td colSpan={4} className="px-4 py-3 text-center uppercase tracking-widest">Sub Total ({floorGroup.floor})</td>
                        <td className="px-4 py-3 text-center border border-slate-200">{floorGroup.subTotal.totalCheck}</td>
                        <td className="px-4 py-3 text-center border border-slate-200">{floorGroup.subTotal.qcPassQty}</td>
                        <td className="px-4 py-3 text-center border border-slate-200">{floorGroup.subTotal.defectiveQty}</td>
                        <td className="px-4 py-3 text-center border border-slate-200">{floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty}</td>
                        <td className="px-4 py-3 text-center border border-slate-200">
                          {Number(floorGroup.subTotal.totalCheck > 0 ? (floorGroup.subTotal.defectiveQty / floorGroup.subTotal.totalCheck) * 100 : 0).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-center border border-slate-200">
                          {Number(floorGroup.subTotal.totalCheck > 0 ? ((floorGroup.subTotal.totalCheck - floorGroup.subTotal.defectiveQty) / floorGroup.subTotal.totalCheck) * 100 : 0).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-center border border-slate-200">90.00%</td>
                        <td className={cn(
                          "px-4 py-3 text-center border border-slate-200",
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
                    <td colSpan={4} className="px-4 py-4 text-center uppercase tracking-widest text-lg">G. Total</td>
                    <td className="px-4 py-4 text-center border border-slate-200 text-lg">
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0)}
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200 text-lg">
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.qcPassQty, 0)}
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200 text-lg">
                      {rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0)}
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200 text-lg">
                      {(rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)}
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200">
                      {Number(((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0)).toFixed(2)}%
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200">
                      {Number(((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) > 0 
                        ? ((rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 0) - (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.defectiveQty, 0) || 0)) / (rftSummaryData?.reduce((acc, curr) => acc + curr.subTotal.totalCheck, 0) || 1) * 100 
                        : 0)).toFixed(2)}%
                    </td>
                    <td className="px-4 py-4 text-center border border-slate-200">90.00%</td>
                    <td className={cn(
                      "px-4 py-4 text-center border border-slate-200",
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
            </div>
          </div>
        </div>
      )}

      {/* Dashboard View - Shown Below Line Summary */}
      <div className="space-y-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Check', value: reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0), icon: CheckCircle2, color: 'text-brand-600', bg: 'bg-white' },
            { label: 'Total Pass', value: reports.reduce((sum, r) => sum + (r.qcPassQty || 0), 0), icon: Activity, color: 'text-emerald-600', bg: 'bg-white' },
            { label: 'Total Defects', value: reports.reduce((sum, r) => sum + (r.totalDefects || 0), 0), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-white' },
            { 
              label: 'Avg DHU %', 
              value: (reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0) > 0 
                ? (reports.reduce((sum, r) => sum + (r.totalDefects || 0), 0) / reports.reduce((sum, r) => sum + (r.totalCheckQty || 0), 0)) * 100 
                : 0).toFixed(1) + '%', 
              icon: TrendingUp, color: 'text-white', bg: 'bg-brand-600' 
            },
          ].map((stat, i) => (
            <Card key={i} className={cn("border-none shadow-sm overflow-hidden group", stat.bg)}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-2 rounded-xl shadow-sm", stat.bg === 'bg-brand-600' ? 'bg-white/20' : 'bg-slate-50 group-hover:bg-brand-50 transition-colors')}>
                    <stat.icon className={cn("h-5 w-5", stat.bg === 'bg-brand-600' ? 'text-white' : stat.color)} />
                  </div>
                  <Badge variant="secondary" className={cn("text-[11px] font-black uppercase tracking-widest px-3 py-1", stat.bg === 'bg-brand-600' ? 'bg-white/20 text-white border-none' : '')}>
                    {stat.label.split(' ')[1]}
                  </Badge>
                </div>
                <p className={cn("text-[10px] uppercase font-black tracking-widest mb-1", stat.bg === 'bg-brand-600' ? 'text-white/60' : 'text-slate-400')}>
                  {stat.label}
                </p>
                <p className={cn("text-3xl font-black data-value", stat.bg === 'bg-brand-600' ? 'text-white' : 'text-slate-900')}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pareto Chart */}
          <Card className="border-none shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Pareto Analysis</CardTitle>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Defect Distribution</p>
                </div>
                <BarChart2 className="h-6 w-6 text-brand-600" />
              </div>
            </CardHeader>
            <CardContent className="p-8 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} unit="%" />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px'}}
                    itemStyle={{fontSize: '12px', fontWeight: 700}}
                  />
                  <Bar yAxisId="left" dataKey="qty" fill="#0f172a" radius={[8, 8, 0, 0]} barSize={40} />
                  <Line yAxisId="right" type="monotone" dataKey="percentage" stroke="#f59e0b" strokeWidth={3} dot={{fill: '#f59e0b', strokeWidth: 2, r: 4}} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* DHU Trend Chart */}
          <Card className="border-none shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">DHU Trend</CardTitle>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Performance Over Time</p>
                </div>
                <TrendingUp className="h-6 w-6 text-brand-600" />
              </div>
            </CardHeader>
            <CardContent className="p-8 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorDhu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} unit="%" />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px'}}
                    itemStyle={{fontSize: '12px', fontWeight: 700}}
                  />
                  <Area type="monotone" dataKey="dhu" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorDhu)" dot={{fill: '#0f172a', r: 4}} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Line Performance Chart */}
          <Card className="border-none shadow-sm bg-white rounded-[2rem] overflow-hidden lg:col-span-2">
            <CardHeader className="p-8 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900">Line Efficiency</CardTitle>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">DHU % Comparison by Line</p>
                </div>
                <BarChart3 className="h-6 w-6 text-brand-600" />
              </div>
            </CardHeader>
            <CardContent className="p-8 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={linePerformanceData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} unit="%" />
                  <YAxis dataKey="line" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px'}}
                    itemStyle={{fontSize: '12px', fontWeight: 700}}
                  />
                  <Bar dataKey="dhu" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Audit Log */}
      <Card className="border-none shadow-sm bg-white rounded-[2rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-black text-slate-900">Audit Log</CardTitle>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Detailed Transaction History</p>
            </div>
            <FileText className="h-6 w-6 text-brand-600" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date / Time</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Info</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Color</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Production</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Defect Details</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">DHU %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reports.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-slate-900">{r.date}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{r.hourSlot || 'Full Day'}</p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="bg-slate-900 text-white border-none text-[11px] px-3 py-1 h-auto font-black">Line {r.line}</Badge>
                        <span className="text-sm font-bold text-slate-900">{r.buyer}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{r.style}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-900">{r.color || 'N/A'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Check</p>
                          <p className="text-sm font-bold text-slate-900 data-value">{r.totalCheckQty}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Pass</p>
                          <p className="text-sm font-bold text-emerald-600 data-value">{r.qcPassQty}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Defects</p>
                          <p className="text-sm font-bold text-red-500 data-value">{r.totalDefects}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {r.defects?.map((d: any, di: number) => (
                          <div key={di} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col gap-0.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[10px] font-black text-slate-900">{d.name}</span>
                              <Badge variant="outline" className="text-[11px] font-black bg-red-50 text-red-600 border-red-100 h-auto px-2 py-0.5">{d.qty}</Badge>
                            </div>
                            {(d.operation || d.operatorName) && (
                              <p className="text-[9px] text-slate-400 font-bold italic">
                                {d.operation} {d.operatorName ? `(${d.operatorName}${d.operatorId ? ` - ${d.operatorId}` : ''})` : ''}
                              </p>
                            )}
                          </div>
                        ))}
                        {(!r.defects || r.defects.length === 0) && (
                          <span className="text-[10px] text-slate-300 font-bold italic">No defects recorded</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="inline-flex flex-col items-end">
                        <Badge className={cn(
                          "font-black data-value rounded-lg px-4 py-2 text-sm",
                          (r.dhuPercent || 0) > 10 ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                        )} variant="outline">
                          {Number(r.dhuPercent || 0).toFixed(1)}%
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-8 w-8 text-slate-200" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No audit data found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
